import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import worker,{NewsRoom} from '../worker/index.mjs';
import {artistName,normalizeNews,requestBody,periodRange,brazilDay,offsetDay,publicUrl} from '../worker/core.mjs';

function responseFor(artist='Artista Exemplo',overrides={}){
  const url='https://www.exemplo.com.br/cultura/materia';
  return {status:'completed',output:[{type:'web_search_call',status:'completed',action:{sources:[{url}]}},{type:'message',content:[{type:'output_text',text:JSON.stringify({artist,status:'ok',notice:'',items:[{category:'Música',title:'Exemplo fictício usado somente em teste',summary:'Este conteúdo existe apenas para testar a interface.',published_date:brazilDay(),event_date:null,sources:[{url,title:'Veículo de teste'}],...overrides}]}),annotations:[]}]}]};
}
function roomEnv(overrides={}){
  const db=new DatabaseSync(':memory:');let alarm=null;
  const ctx={storage:{sql:{exec(sql,...args){if(!args.length&&sql.includes('CREATE TABLE')){db.exec(sql);return {toArray:()=>[]};}const stmt=db.prepare(sql);const rows=stmt.columns().length?stmt.all(...args):(stmt.run(...args),[]);return {toArray:()=>rows};}},getAlarm:async()=>alarm,setAlarm:async(value)=>{alarm=value;},transactionSync(fn){db.exec('BEGIN');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}}}};
  const env={OPENAI_API_KEY:'fake-key-used-only-in-tests',ALLOWED_ORIGINS:'https://amnsalomon.github.io',DAILY_API_LIMIT:'2',...overrides};
  const room=new NewsRoom(ctx,env);env.ROOM={idFromName:name=>name,get:()=>({fetch:request=>room.fetch(request)})};return {env,room,db};
}
function req(path,body={},headers={}){return new Request('https://api.example.workers.dev'+path,{method:'POST',headers:{Origin:'https://amnsalomon.github.io','Content-Type':'application/json','CF-Connecting-IP':'203.0.113.1',...headers},body:JSON.stringify(body)});}

test('validates names, dates, official model and mandatory live search',()=>{
  assert.equal(artistName('  Fátima  Bernardes '),'Fátima Bernardes');assert.equal(artistName('<script>alert(1)</script>'),null);assert.equal(artistName('x'.repeat(81)),null);
  const body=requestBody('Xuxa',new Date('2026-09-26T22:00:00Z'));assert.equal(body.model,'gpt-5.6-luna');assert.equal(body.tool_choice,'required');assert.equal(body.store,false);assert.equal(body.max_tool_calls,3);
  assert.equal(publicUrl('javascript:alert(1)'),null);assert.equal(publicUrl('https://user:pass@news.com/x'),null);assert.equal(publicUrl('https://127.0.0.1/x'),null);
  assert.deepEqual(periodRange('last_month','2026-01-12'),{start:'2025-12-01',end:'2025-12-31'});assert.equal(periodRange('custom','2026-09-26','2026-02-31','2026-09-26'),null);
});
test('rejects uncited, stale, future and incomplete news',()=>{
  assert.equal(normalizeNews(responseFor(),'Xuxa').items.length,1);
  assert.equal(normalizeNews(responseFor('Xuxa',{sources:[{url:'https://inventada.com/noticia',title:'Sem fonte'}]}),'Xuxa').status,'no_news');
  assert.equal(normalizeNews(responseFor('Xuxa',{published_date:offsetDay(brazilDay(),-31)}),'Xuxa').items.length,0);
  assert.equal(normalizeNews(responseFor('Xuxa',{published_date:offsetDay(brazilDay(),1)}),'Xuxa').items.length,0);
  assert.throws(()=>normalizeNews({...responseFor(),status:'incomplete'},'Xuxa'),/incomplete/);
  const withoutSearch=responseFor();withoutSearch.output.shift();assert.throws(()=>normalizeNews(withoutSearch,'Xuxa'),/search_not_completed/);
});
test('CORS, preflight, request size and invalid event fail before any API call',async()=>{
  const {env}=roomEnv();
  assert.equal((await worker.fetch(req('/api/news',{artist:'Xuxa'},{Origin:'https://evil.example'}),env)).status,403);
  const preflight=await worker.fetch(new Request('https://api.example.workers.dev/api/news',{method:'OPTIONS',headers:{Origin:'https://amnsalomon.github.io'}}),env);assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'https://amnsalomon.github.io');
  assert.equal((await worker.fetch(req('/api/news',{artist:'x'.repeat(3000)}),env)).status,400);
  assert.equal((await worker.fetch(req('/api/events',{event:'__proto__'}),env)).status,400);
  assert.equal((await worker.fetch(req('/api/news',{artist:'<img src=x>'}),env)).status,400);
});
test('missing key fails closed without exposing configuration or making API calls',async()=>{
  const {env}=roomEnv({OPENAI_API_KEY:''});const res=await worker.fetch(req('/api/news',{artist:'Xuxa'}),env);assert.equal(res.status,503);assert.equal((await res.json()).code,'setup_required');
});
test('cache, coalescing, global budget and metric counts survive a fresh object',async t=>{
  const {env,room}=roomEnv();let calls=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.headers.Authorization,'Bearer fake-key-used-only-in-tests');calls++;await new Promise(resolve=>setTimeout(resolve,15));return Response.json(responseFor(JSON.parse(JSON.parse(options.body).input).artist_name));});
  const make=(artist,ip='203.0.113.1')=>worker.fetch(req('/api/news',{artist,clientId:'11111111-1111-4111-8111-111111111111'},{'CF-Connecting-IP':ip}),env);
  const [one,two]=await Promise.all([make('Xuxa'),make('Xuxa','203.0.113.2')]);assert.equal(one.status,200);assert.equal(two.status,200);assert.equal(calls,1);
  assert.equal((await (await make('Xuxa')).json()).cached,true);assert.equal(calls,1);
  assert.equal((await make('Ivete Sangalo')).status,200);assert.equal(calls,2);
  assert.equal((await make('Roberto Carlos')).status,429);assert.equal(calls,2);
  const newRoom=new NewsRoom(room.ctx,env);assert.equal(newRoom.total('api_calls'),2);const metric=newRoom.metrics({start:brazilDay(),end:brazilDay()});assert.equal(metric.totals.searches,5);assert.equal(metric.totals.successes,4);assert.equal(metric.totals.cache_hits,2);assert.equal(metric.totals.errors,1);assert.equal(metric.totals.visitors,1);assert.equal(metric.artists[0].name,'Xuxa');
});
test('analytics deduplicates visitors while counting multiple page views, and public metrics expose aggregates only',async()=>{
  const {env}=roomEnv();const clientId='22222222-2222-4222-8222-222222222222';
  await worker.fetch(req('/api/events',{event:'view',clientId}),env);await worker.fetch(req('/api/events',{event:'view',clientId}),env);await worker.fetch(req('/api/events',{event:'share',clientId}),env);
  const res=await worker.fetch(new Request('https://api.example.workers.dev/api/metrics?period=today',{headers:{Origin:'https://amnsalomon.github.io','CF-Connecting-IP':'203.0.113.1'}}),env);assert.equal(res.status,200);const data=await res.json();assert.equal(data.totals.views,2);assert.equal(data.totals.visitors,1);assert.equal(data.totals.shares,1);assert.ok(!JSON.stringify(data).includes(clientId));assert.ok(!JSON.stringify(data).includes('fake-key'));assert.equal(data.daily.length,1);
});
test('upstream errors are sanitized and failed reservations still consume budget',async t=>{
  const {env,room}=roomEnv();t.mock.method(globalThis,'fetch',async()=>Response.json({error:{message:'Sensitive upstream secret'}},{status:401}));const res=await worker.fetch(req('/api/news',{artist:'Xuxa'}),env);assert.equal(res.status,503);assert.ok(!(await res.text()).includes('Sensitive'));assert.equal(room.total('api_calls'),1);assert.equal(room.total('errors'),1);
});
test('cleanup removes visitor identifiers and expired cache but preserves aggregate counts',async()=>{
  const {room}=roomEnv();const yesterday=offsetDay(brazilDay(),-1);room.sql.exec('INSERT INTO visitors(day,token) VALUES(?,?)',yesterday,'old-token');room.count('visitors',yesterday);room.sql.exec('INSERT INTO cache(key,data,expires) VALUES(?,?,?)','old','{}',Date.now()-1);await room.alarm();assert.equal(room.sql.exec('SELECT * FROM visitors').toArray().length,0);assert.equal(room.sql.exec('SELECT * FROM cache').toArray().length,0);assert.equal(room.total('visitors',yesterday),1);
});
