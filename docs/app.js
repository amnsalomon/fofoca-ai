(() => {
  'use strict';
  const {apiBase,clientId,track,element:el,safeUrl,date}=window.FofocaAi;
  const input=document.querySelector('#artist');
  const button=document.querySelector('#search-button');
  const results=document.querySelector('#results');
  const status=document.querySelector('#result-status');
  const grid=document.querySelector('#news-grid');
  let pending=false, inputTracked=false, toastTimer, loadingTimer;
  track('view');
  function toast(message){const box=document.querySelector('#toast');box.textContent=message;box.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.hidden=true,3500);}
  function state(title,message,retry=false){const box=el('div','state-card');box.append(el('h3','',title),el('p','',message));if(retry){const b=el('button','button-secondary','Tentar novamente');b.type='button';b.addEventListener('click',()=>search(input.value));box.append(b);}status.replaceChildren(box);}
  function sharedText(item,artist){const link=new URL(location.href);link.search='';link.hash='';link.searchParams.set('artista',artist);return `Amiga, olha o que saiu sobre ${artist}!\n\n${item.title}\n\n${item.summary}\n\nFonte: ${item.sources[0].url}\n\nQuer saber de outro artista? ${link.href}`;}
  async function copy(text){try{await navigator.clipboard.writeText(text);track('copy');toast('Copiado! Pode mandar para as amigas.');}catch{toast('Não foi possível copiar. Use o botão WhatsApp.');}}
  function newsCard(item,artist){
    const card=el('article','news-card');
    const meta=el('div','news-meta');const time=el('time','',date(item.published_date));time.dateTime=item.published_date;meta.append(el('span','category',item.category),time);
    card.append(meta,el('h3','',item.title),el('p','news-summary',item.summary));
    const sources=el('div','news-sources');
    for(const source of item.sources){const href=safeUrl(source.url);if(!href)continue;const a=el('a','source-link',`Fonte: ${source.title} ↗`);a.href=href;a.target='_blank';a.rel='noopener noreferrer';a.addEventListener('click',()=>track('source_click'));sources.append(a);}
    card.append(sources);
    if(item.event_date&&item.event_date!==item.published_date)card.append(el('p','event-date',`Acontecimento: ${date(item.event_date)}`));
    const actions=el('div','card-actions');const share=el('button','share-button','Mandar no WhatsApp');share.type='button';share.addEventListener('click',()=>{track('share');window.open('https://wa.me/?text='+encodeURIComponent(sharedText(item,artist)),'_blank','noopener,noreferrer');});
    const copyButton=el('button','copy-button','Copiar');copyButton.type='button';copyButton.setAttribute('aria-label',`Copiar notícia: ${item.title}`);copyButton.addEventListener('click',()=>copy(sharedText(item,artist)));actions.append(share,copyButton);card.append(actions);return card;
  }
  async function search(raw){
    if(pending)return;
    const artist=raw.normalize('NFKC').trim().replace(/\s+/g,' ');
    const error=document.querySelector('#input-error');error.hidden=true;input.removeAttribute('aria-invalid');
    if(artist.length<2||artist.length>80||!/[\p{L}]/u.test(artist)||!/^[\p{L}\p{M}\p{N}\s.'’&()\-]+$/u.test(artist)){
      error.textContent='Digite apenas o nome de um artista, como Ivete Sangalo.';error.hidden=false;input.setAttribute('aria-invalid','true');input.focus();return;
    }
    input.value=artist;pending=true;button.disabled=true;button.textContent='Buscando…';results.hidden=false;results.setAttribute('aria-busy','true');document.body.classList.add('has-results');
    document.querySelector('#results-title').textContent=artist;document.querySelector('#checked-at').textContent='';document.querySelector('#results-footnote').hidden=true;grid.replaceChildren();
    document.querySelectorAll('[data-artist]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.artist===artist)));
    const loading=el('div','state-card');const line=el('p','loading-line');const spinner=el('span','spinner');spinner.setAttribute('aria-hidden','true');const loadingText=el('span','','Procurando uma boa novidade…');line.append(spinner,loadingText);loading.append(line,el('p','','Estamos consultando publicações e reunindo as fontes.'),el('div','skeleton-line'),el('div','skeleton-line'));status.replaceChildren(loading);
    results.focus({preventScroll:true});results.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
    loadingTimer=setTimeout(()=>loadingText.textContent='Conferindo as fontes. Só mais um pouquinho…',10000);
    try {
      if(!apiBase()){state('Nosso cafezinho está quase pronto.','A pesquisa de notícias está em preparação. Volte em breve para descobrir as novidades do seu artista favorito.');return;}
      const response=await fetch(apiBase()+'/api/news',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',body:JSON.stringify({artist,clientId:clientId()}),signal:AbortSignal.timeout(65000)});
      let data;try{data=await response.json();}catch{throw new Error('A pesquisa não respondeu como esperado. Tente novamente em instantes.');}
      if(!response.ok){state(data.title||'A conversa fez uma pausa.',data.message||'Não conseguimos pesquisar agora. Tente novamente em instantes.',response.status>=500);return;}
      status.replaceChildren();
      const artistName=typeof data.artist==='string'?data.artist:artist;
      document.querySelector('#results-title').textContent=artistName;
      document.querySelector('#checked-at').textContent=`Pesquisa de ${new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(data.checked_at))} · horário de Brasília${data.cached?' · consulta reaproveitada':''}`;
      if(data.status!=='ok'||!Array.isArray(data.items)||!data.items.length){state(data.status==='ambiguous'?'Qual artista você quis dizer?':'Hoje não temos novidade com fonte.',data.notice||'Não encontramos publicações recentes que pudéssemos confirmar. Que tal consultar outro artista?');return;}
      if(data.notice)status.append(el('p','result-notice',data.notice));
      data.items.slice(0,3).forEach(item=>grid.append(newsCard(item,artistName)));document.querySelector('#results-footnote').hidden=false;
      const url=new URL(location.href);url.searchParams.set('artista',artistName);history.replaceState(null,'',url);
    } catch(e){state('Opa, a conversa foi interrompida.',e.name==='TimeoutError'?'A busca demorou um pouco mais desta vez. Tente novamente.':'Não conseguimos concluir a pesquisa. Confira sua conexão e tente novamente.',true);}
    finally{clearTimeout(loadingTimer);pending=false;button.disabled=false;button.replaceChildren(document.createTextNode('Me conta! '),el('span','','↗'));results.removeAttribute('aria-busy');}
  }
  document.querySelector('#search-form').addEventListener('submit',event=>{event.preventDefault();search(input.value);});
  input.addEventListener('input',()=>{if(!inputTracked&&input.value.trim().length>=2){track('input');inputTracked=true;}});
  document.querySelectorAll('[data-artist]').forEach(b=>b.addEventListener('click',()=>{track('suggestion');search(b.dataset.artist);}));
  const dialog=document.querySelector('#privacy-dialog');document.querySelector('#privacy-open').addEventListener('click',()=>dialog.showModal());['privacy-close','privacy-done'].forEach(id=>document.getElementById(id).addEventListener('click',()=>dialog.close()));dialog.addEventListener('click',e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dialog.close();}});
  const artistParam=new URLSearchParams(location.search).get('artista');if(artistParam&&artistParam.length<=80)input.value=artistParam;
  // Optional browser-native agent access; shares the exact visible search action.
  if(document.modelContext?.registerTool){
    const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
    try{Promise.resolve(document.modelContext.registerTool({name:'search_artist_news',title:'Pesquisar notícias de artista',description:'Pesquisa publicações recentes sobre um artista e exibe as notícias e fontes na página. Consome uma consulta do serviço quando não há cache.',inputSchema:{type:'object',properties:{artist:{type:'string',minLength:2,maxLength:80}},required:['artist'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},async execute(args){if(!args||typeof args.artist!=='string'||args.artist.trim().length<2||args.artist.length>80||!/^[\p{L}\p{M}\p{N}\s.'’&()\-]+$/u.test(args.artist))throw new Error('Informe apenas o nome de um artista.');if(pending)throw new Error('Uma pesquisa já está em andamento.');await search(args.artist);return {artist:input.value,newsCount:grid.childElementCount,message:status.textContent,sources:[...grid.querySelectorAll('.source-link')].map(a=>({title:a.textContent,url:a.href}))};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}
  }
})();
