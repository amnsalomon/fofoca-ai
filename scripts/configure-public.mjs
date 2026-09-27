import {writeFile} from 'node:fs/promises';
const input=(process.env.PUBLIC_API_BASE_URL||'').trim();
if(input){const url=new URL(input);if(url.protocol!=='https:'||!url.hostname.endsWith('.workers.dev')||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('PUBLIC_API_BASE_URL deve ser apenas a origem HTTPS do Worker, sem chave, caminho ou parâmetros.');}
await writeFile('docs/config.js','// Configuração pública. Nunca inserir chaves aqui.\nwindow.FOFOCA_AI_CONFIG = Object.freeze('+JSON.stringify({apiBaseUrl:input?new URL(input).origin:''},null,2)+');\n');
