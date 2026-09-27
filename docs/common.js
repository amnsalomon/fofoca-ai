(() => {
  'use strict';
  let memoryId;
  function day() { return new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date()); }
  function clientId() {
    const today = day();
    try {
      const old = JSON.parse(localStorage.getItem('fofoca-ai-dia') || 'null');
      if (old?.day === today && /^[a-f0-9-]{36}$/.test(old.id)) return old.id;
      const id = crypto.randomUUID();
      localStorage.setItem('fofoca-ai-dia', JSON.stringify({day:today,id}));
      return id;
    } catch { memoryId ||= crypto.randomUUID(); return memoryId; }
  }
  function apiBase() {
    const value = window.FOFOCA_AI_CONFIG?.apiBaseUrl?.trim();
    if (!value) return '';
    try { const url = new URL(value); return url.protocol === 'https:' ? url.origin : ''; } catch { return ''; }
  }
  function track(event) {
    if (!apiBase()) return;
    fetch(apiBase() + '/api/events', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event,clientId:clientId()}),keepalive:true,credentials:'omit'}).catch(() => {});
  }
  function element(tag, className, text) { const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el; }
  function safeUrl(value) {
    try { const u = new URL(value); return u.protocol==='https:' && !u.username && !u.password ? u.href : null; } catch {return null;}
  }
  function date(value) { return new Intl.DateTimeFormat('pt-BR', {day:'2-digit',month:'short',year:'numeric',timeZone:'America/Sao_Paulo'}).format(new Date(value+'T12:00:00Z')); }
  window.FofocaAi=Object.freeze({apiBase,clientId,track,element,safeUrl,date});
})();
