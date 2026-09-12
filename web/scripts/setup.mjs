import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
if(!existsSync('server/.env')) writeFileSync('server/.env',readFileSync('server/.env.example','utf8').replace('REPLACE_WITH_RANDOM_SECRET_AT_LEAST_32_CHARACTERS',randomBytes(48).toString('hex')));
const npm=process.platform==='win32'?'npm.cmd':'npm';
for(const args of [['exec','-w','server','--','prisma','generate'],['exec','-w','server','--','prisma','db','push'],['run','seed'],['run','build']]) execFileSync(npm,args,{stdio:'inherit',shell:process.platform==='win32',env:{...process.env,CHECKPOINT_DISABLE:'1',PRISMA_HIDE_UPDATE_MESSAGE:'1'}});
console.log('San sang! Chay npm start va mo http://localhost:4000');
