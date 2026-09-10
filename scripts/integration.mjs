import {excel} from '../server/dist/exports.js';
import {Document,Packer,Paragraph} from 'docx';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {PrismaClient} from '@prisma/client';
const root=process.cwd(),temp=mkdtempSync(path.join(tmpdir(),'political-bank-test-'));
const env={...process.env,CHECKPOINT_DISABLE:'1',PRISMA_HIDE_UPDATE_MESSAGE:'1',DATABASE_URL:'file:'+path.join(temp,'test.db'),JWT_SECRET:'integration-test-secret-not-for-production-123456',PORT:'4107',HOST:'127.0.0.1',AI_MODE:'demo'};
const db=new PrismaClient({datasourceUrl:env.DATABASE_URL});let server,checks=0;
function check(ok,label){assert.ok(ok,label);checks++;console.log('PASS '+label)}
const base='http://127.0.0.1:4107';
async function req(url,token='',method='GET',body){const r=await fetch(base+'/api'+url,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},...(body===undefined?{}:{body:JSON.stringify(body)})});const d=await r.json();return {status:r.status,d};}
async function good(url,token='',method='GET',body){const r=await req(url,token,method,body);assert.ok(r.status<300,JSON.stringify(r));return r.d}
try{
 console.log('Preparing isolated database...');
 execFileSync(process.execPath,[path.join(root,'node_modules/prisma/build/index.js'),'db','push','--schema',path.join(root,'server/prisma/schema.prisma'),'--skip-generate'],{env,stdio:'pipe'});
 console.log('Seeding isolated database...');
 execFileSync(process.execPath,['--import','tsx','prisma/seed.ts'],{cwd:path.join(root,'server'),env,stdio:'pipe'});
 console.log('Starting HTTP test server...');
 server=spawn(process.execPath,['dist/index.js'],{cwd:path.join(root,'server'),env,stdio:'pipe'});
 let output='';server.stderr.on('data',d=>output+=d);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server startup timeout '+output)),10000);server.stdout.on('data',()=>{clearTimeout(timer);resolve()});server.on('exit',()=>{clearTimeout(timer);reject(new Error(output))})});
 const admin=(await good('/auth/login','','POST',{username:'admin',password:'123456'})).token;
 const teacher=(await good('/auth/login','','POST',{username:'giaovien',password:'123456'})).token;
 const student=(await good('/auth/login','','POST',{username:'hocvien',password:'123456'})).token;
 check(Boolean(admin&&teacher&&student),'3 demo logins work');
 const csv='\uFEFFNội dung câu hỏi,Phương án A,Phương án B,Đáp án\r\n"Câu hỏi có dấu phẩy, và xuống dòng\nđể kiểm tra?",Đáp án thứ nhất,Đáp án thứ hai,"A, B"\r\nCâu hỏi thiếu đáp án thì sao?,Một,Hai,\r\n';
 const input={filename:'test.csv',data:Buffer.from(csv).toString('base64'),defaults:{topic:'Kiểm thử nhập file',level:'Nhận biết',audience:'Cán bộ'}};
 check((await req('/questions/import/preview',student,'POST',input)).status===403,'Student cannot preview import');
 const importPreview=await good('/questions/import/preview',teacher,'POST',input);
 check(importPreview.rows.length===2&&importPreview.rows[0].question.type==='MULTIPLE'&&importPreview.rows[0].warnings.length>0&&importPreview.rows[1].errors.length>0,'CSV quoting, newline, multiple answers and invalid answer validation');
 const xlsx=Buffer.from(await excel([importPreview.rows[0].question]));
 const xlsxPreview=await good('/questions/import/preview',teacher,'POST',{...input,filename:'export.xlsx',data:xlsx.toString('base64')});
 check(JSON.stringify(xlsxPreview.rows[0].question)===JSON.stringify(importPreview.rows[0].question),'XLSX export-import preserves full question and answer');
 const before=(await good('/questions',teacher)).length;
 check((await req('/questions/import',teacher,'POST',importPreview.rows.map(r=>r.question))).status===400&&(await good('/questions',teacher)).length===before,'Invalid import writes no questions');
 const imported=await good('/questions/import',teacher,'POST',[importPreview.rows[0].question]);
 check(imported.count===1&&(await good('/questions',teacher)).length===before+1,'Valid import persists under teacher ownership');
 check((await req('/questions/import',student,'POST',[importPreview.rows[0].question])).status===403,'Student cannot commit import');
 check((await req('/questions/import/preview',teacher,'POST',{...input,filename:'old.xls'})).status===400,'Reject legacy xls clearly');
 for(const q of await good('/questions',teacher))if(q.topic==='Kiểm thử nhập file')await good('/questions/'+q.id,teacher,'DELETE');
 const newStudent=await good('/users',admin,'POST',{username:'hocvien_moi',name:'Học viên mới',role:'STUDENT',password:'test123456'});
 const newLogin=await good('/auth/login','','POST',{username:'hocvien_moi',password:'test123456'});
 check(newStudent.role==='STUDENT'&&newLogin.user.role==='STUDENT'&&Boolean(newLogin.token),'Create student account and sign in immediately');
 check(!('recoveryHash' in newStudent)&&!('recoveryHash' in newLogin.user),'Never expose recovery hash');
 const changed=await good('/auth/change-password',newLogin.token,'POST',{currentPassword:'test123456',newPassword:'changed123'});
 check(Boolean(changed.recoveryCode)&&(await req('/me',newLogin.token)).status===401,'Password change issues recovery code and revokes old sessions');
 const changedLogin=await good('/auth/login','','POST',{username:'hocvien_moi',password:'changed123'});
 check((await req('/auth/forgot-password','','POST',{username:'hocvien_moi',recoveryCode:'wrong',newPassword:'recovered123'})).status===400,'Reject wrong recovery code');
 const recovered=await good('/auth/forgot-password','','POST',{username:'hocvien_moi',recoveryCode:changed.recoveryCode,newPassword:'recovered123'});
 check(Boolean(recovered.recoveryCode)&&(await req('/me',changedLogin.token)).status===401,'Recovery rotates code and revokes sessions');
 check((await req('/auth/forgot-password','','POST',{username:'hocvien_moi',recoveryCode:changed.recoveryCode,newPassword:'other123'})).status===400,'Recovery code can only be used once');
 check(Boolean((await good('/auth/login','','POST',{username:'hocvien_moi',password:'recovered123'})).token),'Login works after password recovery');

 check((await req('/users',admin,'POST',{username:'hocvien_moi',name:'Trùng tài khoản',role:'STUDENT',password:'test123456'})).status===409,'Reject duplicate student username');

 check((await req('/auth/login','','POST',{username:'admin',password:'wrong'})).status===401,'Reject wrong password');
 check((await req('/questions')).status===401,'Protect unauthenticated API');
 check((await req('/questions',student)).status===403,'Student cannot read answer bank');
 check((await req('/users',teacher)).status===403,'Teacher cannot administer accounts');
 let qs=await good('/questions',teacher);check(qs.length===35&&new Set(qs.map(q=>q.topic)).size===5,'35 seed questions across 5 topics');
 const q=qs.find(q=>q.type==='SINGLE');
 const created=await good('/questions',teacher,'POST',[{...q,content:'Câu hỏi kiểm thử chức năng thêm và sửa câu hỏi?'}]);
 await good('/questions/'+created[0].id,teacher,'PUT',{...created[0],content:'Câu hỏi đã được chỉnh sửa thành công chưa?'});
 check((await good('/questions?search='+encodeURIComponent('chỉnh sửa thành công'),teacher)).length===1,'Create/update/search bank');
 check((await req('/questions',teacher,'POST',{...q,correct:[99]})).status===400,'Reject invalid answer key');
 await good('/users',admin,'POST',{username:'teacher2',name:'Giáo viên thứ hai',role:'TEACHER',password:'123456'});
 const t2=(await good('/auth/login','','POST',{username:'teacher2',password:'123456'})).token;
 check((await req('/questions/'+q.id,t2,'PUT',q)).status===403,'Enforce question ownership');
 check(created[0].status==='DRAFT','Teacher question starts as draft');
 check((await req('/questions/'+created[0].id+'/status',teacher,'PATCH',{status:'APPROVED'})).status===403,'Teacher cannot approve own question');
 check((await good('/questions/'+created[0].id+'/status',teacher,'PATCH',{status:'PENDING'})).status==='PENDING','Teacher submits question for review');
 check((await good('/review/queue',admin)).some(x=>x.id===created[0].id),'Pending question reaches admin review queue');
 check((await req('/exams/preview',teacher,'POST',{name:'Đề thử câu chưa duyệt',topic:'Tổng hợp',audience:'Học viên',duration:10,passScore:5,count:1,ratios:[25,25,25,25],questionIds:[created[0].id],shuffleQuestions:true,shuffleAnswers:true,assignedUserIds:[]})).status===400,'Unapproved question cannot enter an exam');
 const approved=await good('/questions/'+created[0].id+'/status',admin,'PATCH',{status:'APPROVED',note:'Đạt yêu cầu.'});
 check(approved.status==='APPROVED'&&Boolean(approved.reviewerId)&&approved.reviewNote==='Đạt yêu cầu.','Admin approves question with reviewer and note');
 check((await good('/questions?status=APPROVED',teacher)).every(x=>x.status==='APPROVED'),'Filter bank by approval status');
 const log=await good('/audit',admin);
 check(log.some(x=>x.action==='QUESTION_APPROVED'&&x.entityId===created[0].id)&&log.some(x=>x.action==='QUESTION_UPDATE'),'Audit log records review and edits');
 check(log.every(x=>x.actorName&&x.at),'Audit entries carry actor and timestamp');
 check((await req('/audit',teacher)).status===403,'Only admin can read audit log');
 await good('/questions/'+created[0].id,teacher,'DELETE');
 const ai=await good('/ai/generate',teacher,'POST',{document:'Quân nhân cần thực hiện nghiêm các quy định về nền nếp sinh hoạt. Giáo viên cần đối chiếu nguồn tài liệu trước khi sử dụng câu hỏi. Học viên cần chủ động liên hệ kiến thức với nhiệm vụ được giao.',topic:q.topic,audience:'Học viên',count:2,type:'SINGLE',level:'Nhận biết',extra:''});
 check(ai.mode==='demo'&&ai.questions.length===2&&ai.questions.every(q=>q.source.length>30),'DEMO AI produces source-grounded drafts');
 const p={name:'Đề kiểm thử đầy đủ',topic:'Tổng hợp',audience:'Học viên',duration:10,passScore:5,count:4,ratios:[25,25,25,25],questionIds:[],shuffleQuestions:true,shuffleAnswers:true,assignedUserIds:[]};
 const preview=await good('/exams/preview',teacher,'POST',p);check(preview.questions.length===4&&new Set(preview.questions.map(q=>q.level)).size===4,'Automatic level quotas');
 check((await req('/exams/preview',teacher,'POST',{...p,count:100})).status===400,'Report insufficient question pool');
 check((await req('/exams/preview',teacher,'POST',{...p,ratios:[10,10,10,10]})).status===400,'Reject invalid ratios');
 const selected=['SINGLE','MULTIPLE','TRUE_FALSE','SHORT'].map(t=>qs.find(q=>q.type===t).id);
 const exam=await good('/exams',teacher,'POST',{...p,questionIds:selected});
 check((await req('/exams/'+exam.id+'/start',student,'POST')).status===403,'Unpublished exam cannot start');
 await good('/exams/'+exam.id+'/publish',teacher,'PATCH',{published:true});
 const a=await good('/exams/'+exam.id+'/start',student,'POST');
 check(a.questions.length===4&&a.questions.every(q=>!('correct'in q)&&!('explanation'in q)&&!('source'in q)),'No answer leakage in active attempt');
 const again=await good('/exams/'+exam.id+'/start',student,'POST');check(again.id===a.id&&again.expiresAt===a.expiresAt,'Resume preserves attempt and deadline');
 const answers={};a.questions.forEach((aq,i)=>{const original=qs.find(q=>q.id===aq.id);answers[i]=aq.type==='SHORT'?'Liên hệ trách nhiệm bản thân với nhiệm vụ cụ thể.':aq.options.map((v,j)=>original.correct.map(k=>original.options[k]).includes(v)?j:-1).filter(j=>j>=0)});
 await good('/attempts/'+a.id+'/answers',student,'PUT',{answers});
 check(Object.keys((await good('/attempts/'+a.id,student)).answers).length===4,'Autosave persists answers');
 let result=await good('/attempts/'+a.id+'/answers',student,'PUT',{answers,submit:true});
 check(result.status==='PENDING'&&result.score===7.5&&result.right===3,'Grade all objective types after shuffling; essay pending');
 const essayIndex=a.questions.findIndex(q=>q.type==='SHORT');
 result=await good('/attempts/'+a.id+'/grade',teacher,'POST',{grades:{[essayIndex]:{points:1,feedback:'Đạt đủ yêu cầu.'}}});
 check(result.score===10&&result.status==='GRADED'&&result.passed,'Manual essay grading finalizes score');
 const resubmit=await good('/attempts/'+a.id+'/answers',student,'PUT',{answers:{},submit:true});check(resubmit.score===10,'Submitted answers immutable');
 check((await req('/attempts/'+a.id+'/grade',t2,'POST',{grades:{}})).status===403,'Only owning teacher can grade');
 const stats=await good('/stats',teacher);check(stats.average===10&&stats.passRate===100&&stats.attempts===1,'Statistics reflect finalized grades');

 const me=await good("/me",student);
 const analysis=await good("/analysis/questions",teacher);
 check(analysis.attempts===1&&analysis.items.length===4&&analysis.items.every(i=>i.times===1&&i.inBank)&&analysis.reliable===false,"Item analysis derived from attempt snapshots");
 check(analysis.items.every(i=>typeof i.difficulty==="number"&&i.discrimination===null&&i.suggestedLevel),"Difficulty computed; discrimination withheld on tiny sample");
 check((await req("/analysis/questions",student)).status===403,"Student cannot read item analysis");
 const prof=await good("/profile/"+me.id,teacher);
 check(prof.student.id===me.id&&prof.history.length===1&&prof.history[0].score===10&&prof.topics.length>0,"Student learning profile");
 check((await good("/profile/"+me.id,student)).history.length===1,"Student can read own profile");
 const other=(await good("/auth/login","","POST",{username:"hocvien_moi",password:"recovered123"})).token;
 check((await req("/profile/"+me.id,other)).status===403,"Student cannot read another student profile");



 // --- Phan trang ngan hang cau hoi ---
 const pg=await good('/questions?page=1&pageSize=10',teacher);
 check(Array.isArray(pg.items)&&pg.items.length===10&&pg.page===1&&pg.pageSize===10&&pg.total>=35&&pg.pages===Math.ceil(pg.total/10),'Question bank pagination returns one page plus totals');
 const pg2=await good('/questions?page=2&pageSize=10',teacher);
 check(pg2.items.length===10&&pg2.items[0].id!==pg.items[0].id,'Second page returns different questions');
 check(Array.isArray(await good('/questions',teacher)),'Unpaged request still returns a plain array');
 check((await good('/questions?page=1&pageSize=5&level='+encodeURIComponent('Nhận biết'),teacher)).items.every(x=>x.level==='Nhận biết'),'Pagination respects the active filters');
 // --- AI soat loi cau hoi ---
 const badQ={content:'Kỷ luật?',type:'SINGLE',options:['Nghiêm túc chấp hành mọi quy định của đơn vị và pháp luật của nhà nước','Chấp hành','Luôn luôn sai','Chấp hành'],correct:[0],explanation:'',source:''};
 const rev=await good('/ai/review',teacher,'POST',badQ);
 check(rev.mode==='demo'&&rev.issues.length>0&&rev.note.includes('quy tắc'),'AI review returns rule-based issues in demo mode');
 check(rev.issues.some(x=>x.text.includes('trùng nhau')),'Review spots duplicated options');
 check(rev.issues.some(x=>x.text.includes('dài hơn hẳn')),'Review spots the giveaway long correct option');
 check(rev.issues.some(x=>x.text.includes('giải thích')),'Review spots the missing explanation');
 const goodQ={content:'Quân đội nhân dân Việt Nam được thành lập vào ngày nào?',type:'SINGLE',options:['22/12/1944','19/8/1945','02/9/1945','07/5/1954'],correct:[0],explanation:'Đội Việt Nam Tuyên truyền Giải phóng quân thành lập ngày 22/12/1944.',source:'Lịch sử Quân đội nhân dân Việt Nam.'};
 check((await good('/ai/review',teacher,'POST',goodQ)).issues.filter(x=>x.level==='warn').length===0,'Well-formed question raises no warnings');
 check((await req('/ai/review',student,'POST',goodQ)).status===403,'Student cannot use AI review');

 // --- AI goi y cham tu luan ---
 const sug=await good('/attempts/'+a.id+'/grade-suggest',teacher,'POST',{index:essayIndex});
 check(sug.mode==='demo'&&typeof sug.points==='number'&&sug.points>=0&&sug.points<=1,'Essay grading suggestion returns a score between 0 and 1');
 check(sug.feedback.includes('%')&&sug.note.includes('quyết định điểm cuối cùng'),'Suggestion explains coverage and defers the final mark to the teacher');
 const nonEssay=a.questions.findIndex(x=>x.type!=='SHORT');
 check((await req('/attempts/'+a.id+'/grade-suggest',teacher,'POST',{index:nonEssay})).status===400,'Grading suggestion refuses non-essay questions');
 check((await req('/attempts/'+a.id+'/grade-suggest',t2,'POST',{index:essayIndex})).status===403,'Only the owning teacher can request a grading suggestion');
 // --- Ma tran chu de x muc do ---
 const nbTopics=[...new Set(qs.filter(x=>x.level==='Nhận biết'&&x.audience==='Học viên').map(x=>x.topic))];
 check(nbTopics.length>=2,'Seed covers at least two topics at the basic level');
 const mx=await good('/exams/preview',teacher,'POST',{...p,count:2,ratios:[100,0,0,0],topicRatios:[{topic:nbTopics[0],percent:50},{topic:nbTopics[1],percent:50}]});
 check(mx.questions.length===2&&new Set(mx.questions.map(x=>x.topic)).size===2,'Topic matrix draws the right count from each topic');
 check((await req('/exams/preview',teacher,'POST',{...p,topicRatios:[{topic:nbTopics[0],percent:60},{topic:nbTopics[1],percent:30}]})).status===400,'Reject topic ratios that do not total 100%');

 // --- Ma de nhieu phien ban ---
 const vr=await good('/exams/'+exam.id+'/variants',teacher,'POST',{count:3});
 check(vr.count===3&&new Set(vr.keys.map(k=>k.code)).size===3&&vr.keys.every(k=>k.answers.length===4),'Generate three exam codes with answer keys');
 check(JSON.stringify(await good('/exams/'+exam.id+'/keys',teacher))===JSON.stringify(vr.keys),'Answer keys stay stable after generation');
 const vres=await fetch(base+'/api/exams/'+exam.id+'/export?variant='+vr.keys[0].code,{headers:{Authorization:'Bearer '+teacher}});
 const vbytes=new Uint8Array(await vres.arrayBuffer());
 check(vres.ok&&vbytes[0]===80&&vbytes[1]===75&&vbytes.length>2000,'Word export for one exam code');
 check((await req('/exams/'+exam.id+'/export?variant=999',teacher)).status===404,'Unknown exam code is rejected');

 // --- Che do on luyen nhieu luot ---
 const beforePractice=(await good('/analysis/questions',teacher)).attempts;
 const pex=await good('/exams',teacher,'POST',{...p,name:'Đề ôn luyện tự do',count:1,questionIds:[selected[0]],practice:true,maxAttempts:2});
 await good('/exams/'+pex.id+'/publish',teacher,'PATCH',{published:true});
 const pa1=await good('/exams/'+pex.id+'/start',student,'POST');
 check(pa1.attemptNo===1,'Practice attempt starts at number one');
 await good('/attempts/'+pa1.id+'/answers',student,'PUT',{answers:{0:[0]},submit:true});
 const pa2=await good('/exams/'+pex.id+'/start',student,'POST');
 check(pa2.attemptNo===2&&pa2.id!==pa1.id,'Practice mode opens a fresh second attempt');
 await good('/attempts/'+pa2.id+'/answers',student,'PUT',{answers:{0:[0]},submit:true});
 check((await good('/exams/'+pex.id+'/start',student,'POST')).id===pa2.id,'Practice attempts stop at the configured limit');
 check((await good('/analysis/questions',teacher)).attempts===beforePractice,'Practice attempts excluded from item analysis');
 const exam2=await good('/exams',teacher,'POST',{...p,name:'Kiểm thử hết giờ',count:1,questionIds:[selected[0]]});await good('/exams/'+exam2.id+'/publish',teacher,'PATCH',{published:true});
 const a2=await good('/exams/'+exam2.id+'/start',student,'POST');await db.attempt.update({where:{id:a2.id},data:{expiresAt:new Date(Date.now()-1000)}});
 const expired=await good('/attempts/'+a2.id+'/answers',student,'PUT',{answers:{0:[0]},submit:true});check(expired.status==='GRADED'&&Object.keys(expired.answers).length===0,'Server rejects answers after deadline');
 for(const [url,label]of [['/questions?format=xlsx','Excel bank export'],['/questions?format=docx','Word bank export'],['/exams/'+exam.id+'/export','Word exam export']]){const r=await fetch(base+'/api'+url,{headers:{Authorization:'Bearer '+teacher}});const bytes=new Uint8Array(await r.arrayBuffer());check(r.ok&&bytes[0]===80&&bytes[1]===75&&bytes.length>2000,label)}
 const html=await fetch(base).then(r=>r.text());check(html.includes('/assets/')&&html.includes('lang="vi"'),'Production frontend served by Express');

 // --- Nhap cau hoi tu file Word ---
 const docBuf=await Packer.toBuffer(new Document({sections:[{children:[
  new Paragraph('Câu 1. Quân đội nhân dân Việt Nam được thành lập vào ngày tháng năm nào?'),
  new Paragraph('A. 22/12/1944'),new Paragraph('B. 19/8/1945'),new Paragraph('C. 02/9/1945'),new Paragraph('D. 07/5/1954'),
  new Paragraph('Đáp án: A'),
  new Paragraph('Giải thích: Đội Việt Nam Tuyên truyền Giải phóng quân thành lập ngày 22/12/1944.'),
  new Paragraph('Câu 2. Trình bày trách nhiệm của quân nhân trong chấp hành kỷ luật quân đội?'),
  new Paragraph('Hướng dẫn chấm: Nêu được ý thức tự giác và hành động cụ thể của bản thân.'),
 ]}]}));
 const wordPreview=await good('/questions/import/preview',teacher,'POST',{filename:'cauhoi.docx',data:Buffer.from(docBuf).toString('base64'),defaults:{topic:'Kiểm thử nhập Word',level:'Nhận biết',audience:'Cán bộ'}});
 check(wordPreview.rows.length===2&&wordPreview.sheet==='Word','Word import splits the document into questions');
 const w0=wordPreview.rows[0].question,w1=wordPreview.rows[1].question;
 check(w0.type==='SINGLE'&&w0.options.length===4&&JSON.stringify(w0.correct)==='[0]'&&w0.explanation.includes('22/12/1944'),'Word question keeps options, answer key and explanation');
 check(w1.type==='SHORT'&&w1.options.length===0&&w1.explanation.includes('tự giác'),'Word essay question detected with its marking guide');
 check(wordPreview.rows.every(x=>x.errors.length===0),'Word import rows pass validation');
 check((await req('/questions/import/preview',teacher,'POST',{filename:'cauhoi.doc',data:Buffer.from(docBuf).toString('base64'),defaults:{topic:'Kiểm thử nhập Word',level:'Nhận biết',audience:'Cán bộ'}})).status===400,'Legacy .doc is rejected with guidance');

 // --- Phat hien cau trung ---
 const dupSrc=(await good('/questions',teacher))[0];
 const dupCsv='\uFEFFNội dung câu hỏi,Phương án A,Phương án B,Đáp án\r\n"'+dupSrc.content.replace(/"/g,'""')+'",Một,Hai,A\r\n';
 const dupPreview=await good('/questions/import/preview',teacher,'POST',{filename:'trung.csv',data:Buffer.from(dupCsv).toString('base64'),defaults:{topic:'Kiểm thử trùng',level:'Nhận biết',audience:'Cán bộ'}});
 check(dupPreview.rows[0].similar&&dupPreview.rows[0].similar.id===dupSrc.id&&dupPreview.rows[0].warnings.some(w=>w.includes('Giống')),'Import preview flags a near-duplicate already in the bank');
 const scan=await good('/questions/duplicates?threshold=0.9',teacher);
 check(scan.threshold===90&&scan.scanned>0&&typeof scan.found==='number','Bank-wide duplicate scan reports threshold and coverage');
 check((await req('/questions/duplicates',student)).status===403,'Student cannot run the duplicate scan');
 const t2me=await good('/me',t2);
 const gv=(await good('/users',admin)).find(u=>u.username==='giaovien');
 const shareTarget=(await good('/questions',teacher))[0];
 check((await good('/questions',t2)).length===0,'Second teacher starts with an empty bank');
 check((await req('/questions/'+shareTarget.id+'/share',teacher,'PATCH',{shared:true})).status===400,'Cannot share before being assigned to a department');
 await good('/users/'+gv.id,admin,'PATCH',{department:'Khoa Chính trị'});
 await good('/users/'+t2me.id,admin,'PATCH',{department:'Khoa Chính trị'});
 check((await good('/questions',t2)).length===0,'Same department alone does not expose questions');
 check((await good('/questions/'+shareTarget.id+'/share',teacher,'PATCH',{shared:true})).shared===true,'Owner shares an approved question');
 const seen=await good('/questions',t2);
 check(seen.length===1&&seen[0].id===shareTarget.id,'Shared approved question visible across the department');
 check((await req('/questions/'+shareTarget.id,t2,'PUT',shareTarget)).status===403,'Shared question stays read-only for other teachers');
 check((await good('/exams/preview',t2,'POST',{name:'Đề dùng câu chia sẻ',topic:'Tổng hợp',audience:seen[0].audience,duration:10,passScore:5,count:1,ratios:[100,0,0,0],questionIds:[shareTarget.id],shuffleQuestions:true,shuffleAnswers:true,assignedUserIds:[]})).questions.length===1,'Shared question usable in another teacher exam');
 await good('/users/'+t2me.id,admin,'PATCH',{department:'Khoa Quân sự'});
 check((await good('/questions',t2)).length===0,'Other departments cannot see the shared question');
 check((await good('/audit',admin)).some(x=>x.action==='QUESTION_SHARE'),'Audit log records sharing');
 const teacher2=await db.user.findUnique({where:{username:'teacher2'}});await good('/users/'+teacher2.id,admin,'PATCH',{active:false});check((await req('/me',t2)).status===401,'Account lock invalidates existing access');
 console.log(`\n${checks} integration checks passed. Test database isolated and removed.`);
}finally{if(server){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r))}await db.$disconnect();rmSync(temp,{recursive:true,force:true})}
