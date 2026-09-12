import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
const text=readFileSync('server/.env','utf8');const port=text.match(/^PORT=(\d+)/m)?.[1]||'4000';
const child=spawn(process.execPath,['dist/index.js'],{cwd:'server',stdio:'inherit'});
child.on('exit',code=>process.exit(code||0));
process.on('SIGINT',()=>child.kill('SIGINT'));
const timer=setInterval(async()=>{try{const r=await fetch('http://127.0.0.1:'+port+'/api/health');if(!r.ok)return;clearInterval(timer);console.log('Mo trinh duyet: http://localhost:'+port);if(process.platform==='win32')spawn('cmd.exe',['/c','start','','http://localhost:'+port],{stdio:'ignore'});}catch{}},600);
setTimeout(()=>{clearInterval(timer)},15000).unref();
