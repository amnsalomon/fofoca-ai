(() => {
  'use strict';
  const {apiBase,element:el,date}=window.FofocaAi;
  const number=new Intl.NumberFormat('pt-BR');
  const period=document.querySelector('#period'),status=document.querySelector('#panel-status'),refresh=document.querySelector('#refresh');
  let controller,requestId=0;
  function render(data){
    for(const [key,value]of Object.entries(data.totals)){const node=document.getElementById(key);if(node)node.textContent=number.format(value);}
    document.querySelector('#budget').textContent=`${number.format(data.limits.today_api_calls)} / ${number.format(data.limits.daily_api_limit)}`;
    document.querySelector('#updated').textContent=`Atualizado às ${new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).format(new Date(data.updated_at))} · Brasília`;
    status.textContent=`${date(data.start)} a ${date(data.end)}${!data.totals.views&&!data.totals.searches?' · Ainda sem atividade neste período.':''}`;
    const chart=document.querySelector('#activity-chart');const table=document.querySelector('#daily-table');table.replaceChildren();
    const graph=el('div','bar-chart');graph.setAttribute('role','img');graph.setAttribute('aria-label','Visitas e buscas por dia. Números completos na tabela a seguir.');const max=Math.max(1,...data.daily.flatMap(d=>[d.views,d.searches]));
    data.daily.forEach((row,index)=>{const day=el('div','chart-day');const label=date(row.day);day.title=`${label}: ${row.views} visitas, ${row.searches} buscas`;for(const metric of ['views','searches']){const bar=el('div','chart-bar '+metric);bar.style.height=(row[metric]/max*100)+'%';day.append(bar);}if(data.daily.length<=10||index%Math.ceil(data.daily.length/7)===0||index===data.daily.length-1)day.append(el('span','chart-label',row.day.slice(8)+'/'+row.day.slice(5,7)));graph.append(day);const tr=el('tr');for(const value of [label,row.visitors,row.views,row.searches,row.successes])tr.append(el('td','',typeof value==='number'?number.format(value):value));table.append(tr);});
    chart.replaceChildren(graph);
    const list=document.querySelector('#artists-list');list.replaceChildren();data.artists.forEach((artist,index)=>{const li=el('li');li.append(el('span','artist-rank',String(index+1).padStart(2,'0')),el('span','artist-name',artist.name),el('span','artist-count',number.format(artist.searches)));list.append(li);});if(!data.artists.length)list.append(el('li','empty-text','Nenhuma busca com notícias neste período.'));
  }
  async function load(){
    if(!apiBase()){status.textContent='Os indicadores estarão disponíveis quando o serviço de pesquisa for conectado. Nenhum número fictício é exibido.';return;}
    controller?.abort();controller=new AbortController();const id=++requestId;refresh.disabled=true;status.textContent='Atualizando a conversa…';
    const params=new URLSearchParams({period:period.value});if(period.value==='custom'){params.set('from',document.querySelector('#from').value);params.set('to',document.querySelector('#to').value);}
    const timeout=setTimeout(()=>controller.abort(),15000);
    try{const res=await fetch(apiBase()+'/api/metrics?'+params,{credentials:'omit',signal:controller.signal});const data=await res.json();if(id!==requestId)return;if(!res.ok)throw new Error(data.message||'Não foi possível atualizar agora.');render(data);}
    catch(error){if(id===requestId){status.textContent=error.name==='AbortError'?'A atualização demorou. Tente novamente.':error.message;document.querySelector('#updated').textContent='Atualização pendente · dados anteriores, se houver';}}
    finally{clearTimeout(timeout);if(id===requestId)refresh.disabled=false;}
  }
  period.addEventListener('change',()=>{document.querySelector('#custom-dates').hidden=period.value!=='custom';if(period.value!=='custom')load();});document.querySelector('#filters').addEventListener('submit',event=>{event.preventDefault();load();});refresh.addEventListener('click',load);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());for(const id of ['from','to']){const input=document.getElementById(id);input.max=today;input.value=today;}
  load();
})();
