import {MODEL,METRICS,EVENTS,DAY,brazilDay,offsetDay,artistName,cacheKey,requestBody,normalizeNews,periodRange} from './core.mjs';

function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});}
function failure(status,code,title,message){return json({code,title,message},status,status===429?{'Retry-After':'60'}:{});}
async function readBody(request){if(!request.headers.get('content-type')?.startsWith('application/json'))throw new Error('content_type');if(Number(request.headers.get('content-length')||0)>2048)throw new Error('body_size');const reader=request.body?.getReader();if(!reader)throw new Error('empty_body');let size=0;const chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2048){await reader.cancel();throw new Error('body_size');}chunks.push(value);}const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(all));}
async function fingerprint(value,secret){const bytes=new TextEncoder();const key=await crypto.subtle.importKey('raw',bytes.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const signed=await crypto.subtle.sign('HMAC',key,bytes.encode(brazilDay()+'|'+value));return [...new Uint8Array(signed)].map(v=>v.toString(16).padStart(2,'0')).join('');}
function positive(value,fallback,max=10000){const n=Number(value);return Number.isInteger(n)&&n>0?Math.min(n,max):fallback;}

export default {
  async fetch(request,env){
    const path=new URL(request.url).pathname;
    if(path==='/health'&&request.method==='GET')return json({status:env.OPENAI_API_KEY?'ready':'setup_required',model:MODEL});
    const origin=request.headers.get('Origin');
    const allowed=(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
    if(!origin||!allowed.includes(origin))return failure(403,'origin_denied','Acesso indisponível.','Abra a pesquisa pela página Fofoca Aí!.');
    const cors={'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400'};
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    let response;
    try {
      if(!['/api/news','/api/events','/api/metrics'].includes(path))response=failure(404,'not_found','Página não encontrada.','Confira o endereço.');
      else if((path==='/api/metrics'&&request.method!=='GET')||(path!=='/api/metrics'&&request.method!=='POST'))response=failure(405,'method','Acesso indisponível.','Método não permitido.');
      else if(!env.OPENAI_API_KEY||!env.ROOM)response=failure(503,'setup_required','Nosso cafezinho está quase pronto.','A pesquisa está em preparação. Volte em breve.');
      else {
        let body={};if(request.method==='POST')body=await readBody(request);
        if(path==='/api/news'&&!artistName(body.artist))response=failure(400,'invalid_artist','Quem você quer consultar?','Digite apenas o nome de um artista, com até 80 caracteres.');
        else if(path==='/api/events'&&!Object.hasOwn(EVENTS,body.event))response=failure(400,'invalid_event','Evento inválido.','Evento não reconhecido.');
        else {
          const ip=request.headers.get('CF-Connecting-IP')||'unknown';
          const token=await fingerprint('ip:'+ip,env.OPENAI_API_KEY);
          const validClient=typeof body.clientId==='string'&&/^[a-f0-9-]{36}$/.test(body.clientId);
          const visitor=await fingerprint(validClient?'browser:'+body.clientId:'ip:'+ip,env.OPENAI_API_KEY);
          const stub=env.ROOM.get(env.ROOM.idFromName('fofoca-ai-global-v1'));
          response=await stub.fetch(new Request('https://internal'+path+new URL(request.url).search,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body,token,visitor})}));
        }
      }
    }catch(error){response=error?.message==='content_type'||error?.message==='body_size'||error?.message==='empty_body'||error instanceof SyntaxError?failure(400,'invalid_request','Não entendemos a busca.','Confira o nome e tente novamente.'):failure(503,'unavailable','A conversa fez uma pausa.','Não conseguimos pesquisar agora. Tente novamente em instantes.');}
    const headers=new Headers(response.headers);for(const [k,v]of Object.entries(cors))headers.set(k,v);return new Response(response.body,{status:response.status,headers});
  }
};

export class NewsRoom {
  constructor(ctx,env){
    this.ctx=ctx;this.env=env;this.sql=ctx.storage.sql;this.inflight=new Map();
    this.sql.exec(`CREATE TABLE IF NOT EXISTS counts(day TEXT NOT NULL,metric TEXT NOT NULL,value INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,metric));
      CREATE TABLE IF NOT EXISTS visitors(day TEXT NOT NULL,token TEXT NOT NULL,PRIMARY KEY(day,token));
      CREATE TABLE IF NOT EXISTS rates(key TEXT PRIMARY KEY,value INTEGER NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY,data TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS artists(day TEXT NOT NULL,name TEXT NOT NULL,value INTEGER NOT NULL,PRIMARY KEY(day,name));`);
  }
  count(metric,day=brazilDay()){this.sql.exec('INSERT INTO counts(day,metric,value) VALUES(?,?,1) ON CONFLICT(day,metric) DO UPDATE SET value=value+1',day,metric);}
  total(metric,day=brazilDay()){return this.sql.exec('SELECT value FROM counts WHERE day=? AND metric=?',day,metric).toArray()[0]?.value||0;}
  rate(key,limit,period,now=Date.now()){
    const bucket=Math.floor(now/period);const id=key+':'+bucket;
    const value=this.sql.exec('SELECT value FROM rates WHERE key=?',id).toArray()[0]?.value||0;
    if(value>=limit)return false;
    this.sql.exec('INSERT INTO rates(key,value,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET value=value+1',id,(bucket+1)*period);return true;
  }
  visit(visitor){const day=brazilDay();const existing=this.sql.exec('SELECT 1 FROM visitors WHERE day=? AND token=?',day,visitor).toArray();if(!existing.length){this.sql.exec('INSERT INTO visitors(day,token) VALUES(?,?)',day,visitor);this.count('visitors',day);}}
  async fetch(request){
    // Only the outer Worker can address this object; client headers are never forwarded.
    const {body,token,visitor}=await request.json();
    const url=new URL(request.url);const path=url.pathname;
    if(!(await this.ctx.storage.getAlarm()))await this.ctx.storage.setAlarm(Date.now()+3600000);
    if(path==='/api/metrics'){
      if(!this.rate('metrics:'+token,60,60000))return failure(429,'limited','Só um instante.','Aguarde para atualizar.');
      const range=periodRange(url.searchParams.get('period')||'7d',brazilDay(),url.searchParams.get('from'),url.searchParams.get('to'));
      if(!range)return failure(400,'invalid_period','Período inválido.','Selecione um intervalo dentro dos últimos 90 dias.');
      return json(this.metrics(range));
    }
    if(path==='/api/events'){
      if(!Object.hasOwn(EVENTS,body.event))return failure(400,'invalid_event','Evento inválido.','Evento não reconhecido.');
      if(!this.rate('event:'+token,500,60000)||!this.rate('visitor-event:'+visitor,80,60000)||!this.rate('all-events',100000,DAY))return json({accepted:false},429);
      this.ctx.storage.transactionSync(()=>{this.count(EVENTS[body.event]);this.visit(visitor);});return json({accepted:true});
    }
    if(path!=='/api/news')return json({error:'not_found'},404);
    const artist=artistName(body.artist);if(!artist)return failure(400,'invalid_artist','Nome inválido.','Digite um nome de artista.');
    if(!this.rate('search:'+token,positive(this.env.IP_SEARCHES_PER_MINUTE,30),60000))return failure(429,'limited','Uma pausa para o café?','Você fez várias buscas seguidas. Aguarde um minuto e tente de novo.');
    this.ctx.storage.transactionSync(()=>{this.count('searches');this.visit(visitor);});
    const key=cacheKey(artist);const cached=this.sql.exec('SELECT data FROM cache WHERE key=? AND expires>?',key,Date.now()).toArray()[0];
    if(cached){const news=JSON.parse(cached.data);this.count('cache_hits');this.recordOutcome(news);return json({...news,cached:true});}
    // Coalesce concurrent requests for the same artist; the daily API reservation is atomic.
    if(this.inflight.has(key)){const result=await this.inflight.get(key);if(result.news){this.count('cache_hits');this.recordOutcome(result.news);return json({...result.news,cached:true});}this.count('errors');return result.response.clone();}
    const limit=positive(this.env.DAILY_API_LIMIT,200);
    if(this.total('api_calls')>=limit){this.count('errors');return failure(429,'daily_limit','O café de hoje foi um sucesso.','Chegamos ao limite de novas pesquisas de hoje. Notícias já consultadas continuam disponíveis por um tempo. Volte amanhã.');}
    this.count('api_calls');
    const promise=this.research(artist,key);this.inflight.set(key,promise);
    try{const result=await promise;if(result.news){this.recordOutcome(result.news);return json({...result.news,cached:false});}this.count('errors');return result.response.clone();}finally{this.inflight.delete(key);}
  }
  recordOutcome(news){this.count(news.status==='ok'?'successes':'empty');if(news.status==='ok'){this.sql.exec('INSERT INTO artists(day,name,value) VALUES(?,?,1) ON CONFLICT(day,name) DO UPDATE SET value=value+1',brazilDay(),news.artist);}}
  async research(artist,key){
    try {
      const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Authorization':'Bearer '+this.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(requestBody(artist)),signal:AbortSignal.timeout(55000)});
      if(!response.ok){return {response:failure(503,'research_unavailable','A conversa fez uma pausa.','Nossa pesquisa está temporariamente indisponível. Tente novamente em instantes.')};}
      const news=normalizeNews(await response.json(),artist);
      const ttl=news.status==='ok'?3600000:300000;
      this.sql.exec('INSERT INTO cache(key,data,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,expires=excluded.expires',key,JSON.stringify(news),Date.now()+ttl);
      return {news};
    }catch{return {response:failure(503,'research_unavailable','A conversa fez uma pausa.','Não conseguimos conferir as fontes agora. Tente novamente em instantes.')};}
  }
  metrics({start,end}){
    const totals=Object.fromEntries(METRICS.map(key=>[key,0]));
    for(const row of this.sql.exec('SELECT metric,SUM(value) AS value FROM counts WHERE day BETWEEN ? AND ? GROUP BY metric',start,end).toArray())if(Object.hasOwn(totals,row.metric))totals[row.metric]=row.value;
    const rows=this.sql.exec('SELECT day,metric,value FROM counts WHERE day BETWEEN ? AND ? ORDER BY day',start,end).toArray();
    const map=new Map();for(let day=start;day<=end;day=offsetDay(day,1))map.set(day,{day,views:0,visitors:0,searches:0,successes:0});
    for(const row of rows){const day=map.get(row.day);if(day&&Object.hasOwn(day,row.metric))day[row.metric]=row.value;}
    const artists=this.sql.exec('SELECT name,SUM(value) AS searches FROM artists WHERE day BETWEEN ? AND ? GROUP BY name ORDER BY searches DESC,name LIMIT 10',start,end).toArray();
    return {start,end,timezone:'America/Sao_Paulo',updated_at:new Date().toISOString(),totals,daily:[...map.values()],artists,limits:{daily_api_limit:positive(this.env.DAILY_API_LIMIT,200),today_api_calls:this.total('api_calls')},visitor_method:'Soma de navegadores únicos por dia. A mesma pessoa pode aparecer novamente em dias ou dispositivos diferentes.'};
  }
  async alarm(){
    const now=Date.now(),today=brazilDay();
    this.ctx.storage.transactionSync(()=>{this.sql.exec('DELETE FROM visitors WHERE day<?',today);this.sql.exec('DELETE FROM rates WHERE expires<?',now);this.sql.exec('DELETE FROM cache WHERE expires<?',now);this.sql.exec('DELETE FROM counts WHERE day<?',offsetDay(today,-89));this.sql.exec('DELETE FROM artists WHERE day<?',offsetDay(today,-89));});
    await this.ctx.storage.setAlarm(now+3600000);
  }
}
