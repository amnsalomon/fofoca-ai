import {readdir,readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=process.cwd();
async function walk(dir){const entries=await readdir(dir,{withFileTypes:true});return (await Promise.all(entries.map(e=>e.isDirectory()?walk(resolve(dir,e.name)):resolve(dir,e.name)))).flat();}
const publicFiles=await walk(resolve(root,'docs'));
for(const file of [...publicFiles,...await walk(resolve(root,'worker'))]){
 if(/\.(m?js)$/.test(file))execFileSync(process.execPath,['--check',file]);
 if(/\.(html|css|js)$/.test(file)){
   const text=await readFile(file,'utf8');if(/sk-(?:proj-)?[A-Za-z0-9_-]{20,}/.test(text))throw new Error('Possible secret in public source');
   if(file.endsWith('.html'))for(const match of text.matchAll(/(?:src|href)="(\.[^"]+)"/g)){if(match[1].includes('#'))continue;const path=resolve(dirname(file),match[1]);if(!match[1].endsWith('/'))await readFile(path);}
 }
}
console.log('JavaScript válido; arquivos públicos referenciados existem; nenhuma chave aparente nos arquivos da página.');
