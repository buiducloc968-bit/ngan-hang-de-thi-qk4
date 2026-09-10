import {randomBytes} from 'node:crypto';
import 'dotenv/config';
import express,{Request,Response,NextFunction} from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import {z} from 'zod';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {db} from './db.js';
import {questionSchema,bankQuestionSchema,parseQ,publicQ,shuffle,mark,levels,audiences,wordSet,jaccard,Q} from './domain.js';
import {generate,reviewQuestion,suggestGrade} from './ai.js';
import {previewImport} from './imports.js';
import {word,excel} from './exports.js';
const app=express();const secret=process.env.JWT_SECRET;if(!secret||secret.length<32||secret.startsWith('REPLACE'))throw new Error('Chạy npm run setup để tạo JWT_SECRET an toàn.');
type AuthReq=Request&{user:any};
const run=(fn:(r:AuthReq,s:Response)=>Promise<any>)=>(r:Request,s:Response,n:NextFunction)=>Promise.resolve(fn(r as AuthReq,s)).catch(n);
function fail(message:string,status=400):never{throw Object.assign(new Error(message),{status});}
const owner=(r:AuthReq,id:number)=>{if(r.user.role!=='ADMIN'&&r.user.id!==id)fail('Không có quyền với dữ liệu này.',403);};
app.use(helmet());app.use(compression());app.use(cors({origin:(origin,cb)=>cb(null,!origin||/^http:\/\/(localhost|127\.0\.0\.1)(:4000|:5173)?$/.test(origin))}));app.use('/api/questions/import',express.json({limit:'8mb'}));app.use(express.json({limit:'1mb'}));
app.get('/api/health',(_,s)=>s.json({ok:true}));
app.post('/api/auth/login',rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Quá nhiều lần đăng nhập. Thử lại sau 15 phút.'}}),run(async(r,s)=>{const p=z.object({username:z.string().max(80),password:z.string().max(200)}).parse(r.body);const u=await db.user.findUnique({where:{username:p.username}});if(!u?.active||!await bcrypt.compare(p.password,u.password))fail('Tên đăng nhập hoặc mật khẩu không đúng.',401);const {password,recoveryHash,tokenVersion,...user}=u;s.json({token:jwt.sign({id:u.id,version:u.tokenVersion},secret!,{expiresIn:'8h'}),user});}));
app.post('/api/auth/forgot-password',rateLimit({windowMs:15*60*1000,limit:10,message:{error:'Đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút.'}}),run(async(r,s)=>{const p=z.object({username:z.string().max(40),recoveryCode:z.string().min(1).max(100),newPassword:z.string().min(6).max(100)}).parse(r.body);const u=await db.user.findUnique({where:{username:p.username}});if(!u?.active||!u.recoveryHash||!await bcrypt.compare(p.recoveryCode.trim(),u.recoveryHash))fail('Tên đăng nhập hoặc mã khôi phục không đúng.');const code=randomBytes(18).toString('hex');const result=await db.user.updateMany({where:{id:u.id,recoveryHash:u.recoveryHash,tokenVersion:u.tokenVersion},data:{password:await bcrypt.hash(p.newPassword,12),recoveryHash:await bcrypt.hash(code,12),tokenVersion:{increment:1}}});if(!result.count)fail('Mã khôi phục đã được sử dụng.');s.json({ok:true,recoveryCode:code});}));
app.use('/api',(req,res,next)=>{(async()=>{const r=req as AuthReq;try{const payload=jwt.verify(r.headers.authorization?.replace(/^Bearer /,'')||'',secret!) as {id:number,version?:number};r.user=await db.user.findUnique({where:{id:payload.id}});if(!r.user?.active||(payload.version??0)!==r.user.tokenVersion)fail('Phiên đăng nhập không còn hiệu lực.',401);}catch{fail('Vui lòng đăng nhập lại.',401);}next();})().catch(next);});
const staff=(r:AuthReq)=>{if(r.user.role==='STUDENT')fail('Chức năng dành cho cán bộ, giáo viên.',403);};
const scope=(r:AuthReq)=>r.user.role==='ADMIN'?{}:{creatorId:r.user.id};
const qScope=(r:AuthReq)=>r.user.role==='ADMIN'?{}:r.user.department?{OR:[{creatorId:r.user.id},{shared:true,status:'APPROVED',creator:{department:r.user.department}}]}:{creatorId:r.user.id};
const newStatus=(r:AuthReq)=>r.user.role==='ADMIN'?'APPROVED':'DRAFT';
async function audit(r:AuthReq,action:string,entity:string,entityId?:number,detail=''){try{await db.auditLog.create({data:{userId:r.user.id,actorName:r.user.name,action,entity,entityId:entityId??null,detail}});}catch{}}

app.get('/api/me',run(async(r,s)=>{const {password,recoveryHash,tokenVersion,...u}=r.user;s.json(u);}));
app.post('/api/auth/change-password',run(async(r,s)=>{const p=z.object({currentPassword:z.string().max(100),newPassword:z.string().min(6).max(100)}).parse(r.body);if(!await bcrypt.compare(p.currentPassword,r.user.password))fail('Mật khẩu hiện tại không đúng.');const code=randomBytes(18).toString('hex');const result=await db.user.updateMany({where:{id:r.user.id,tokenVersion:r.user.tokenVersion},data:{password:await bcrypt.hash(p.newPassword,12),recoveryHash:await bcrypt.hash(code,12),tokenVersion:{increment:1}}});if(!result.count)fail('Thông tin tài khoản vừa thay đổi. Vui lòng đăng nhập lại.');s.json({ok:true,recoveryCode:code});}));
app.get('/api/meta',run(async(r,s)=>s.json({levels,audiences,aiMode:process.env.AI_MODE==='openai'?'openai':'demo'})));
app.get('/api/questions',run(async(r,s)=>{staff(r);const where:any={...qScope(r)};if(r.query.search)where.content={contains:String(r.query.search)};for(const key of ['topic','level','type','audience','status'])if(r.query[key])where[key]=String(r.query[key]);if(r.query.page!==undefined&&!r.query.format){const page=Math.max(1,Number(r.query.page)||1);const pageSize=Math.min(200,Math.max(5,Number(r.query.pageSize)||25));const [total,rows]=await Promise.all([db.question.count({where}),db.question.findMany({where,include:{creator:{select:{name:true}}},orderBy:{id:'desc'},skip:(page-1)*pageSize,take:pageSize})]);return void s.json({items:rows.map(parseQ),total,page,pageSize,pages:Math.max(1,Math.ceil(total/pageSize))});}const qs=(await db.question.findMany({where,include:{creator:{select:{name:true}}},orderBy:{id:'desc'}})).map(parseQ);if(r.query.format){const x=r.query.format==='xlsx';s.type(x?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/vnd.openxmlformats-officedocument.wordprocessingml.document').attachment(`ngan-hang-cau-hoi.${x?'xlsx':'docx'}`).send(x?await excel(qs):await word('NGÂN HÀNG CÂU HỎI NHẬN THỨC CHÍNH TRỊ',qs,true));}else s.json(qs);}));
app.get('/api/questions/duplicates',run(async(r,s)=>{staff(r);
 const min=Math.min(.95,Math.max(.5,Number(r.query.threshold)||.8));
 const rows=await db.question.findMany({where:qScope(r),select:{id:true,content:true,topic:true,level:true,status:true,creator:{select:{name:true}}},take:3000});
 const sets=rows.map(q=>({q,w:wordSet(q.content)}));
 const pairs:any[]=[];
 for(let i=0;i<sets.length;i++)for(let j=i+1;j<sets.length;j++){const score=jaccard(sets[i].w,sets[j].w);
  if(score>=min)pairs.push({score:Math.round(score*1000)/10,a:sets[i].q,b:sets[j].q});}
 pairs.sort((x,y)=>y.score-x.score);
 s.json({threshold:Math.round(min*100),scanned:rows.length,found:pairs.length,pairs:pairs.slice(0,200)});}));
app.post('/api/questions/import/preview',run(async(r,s)=>{staff(r);const p=z.object({filename:z.string().max(255),data:z.string().max(7000000),defaults:z.object({topic:z.string().trim().min(2).max(200),level:z.enum(levels),audience:z.enum(audiences)})}).parse(r.body);const preview:any=await previewImport(p.filename,p.data,p.defaults);const bank=(await db.question.findMany({where:qScope(r),select:{id:true,content:true},take:3000})).map(q=>({q,w:wordSet(q.content)}));for(const row of preview.rows){const w=wordSet(String(row.question.content||''));let best=null,score=0;for(const b of bank){const sc=jaccard(w,b.w);if(sc>score){score=sc;best=b.q;}}if(best&&score>=.8){row.similar={id:best.id,content:best.content,score:Math.round(score*1000)/10};row.warnings.push('Giống '+Math.round(score*100)+'% câu CH'+String(best.id).padStart(3,'0')+' đã có trong ngân hàng.');}}s.json(preview);}));
app.post('/api/questions/import',run(async(r,s)=>{staff(r);const qs=z.array(bankQuestionSchema).min(1).max(500).parse(r.body);const result=await db.$transaction(qs.map(q=>db.question.create({data:{...q,options:JSON.stringify(q.options),correct:JSON.stringify(q.correct),creatorId:r.user.id,status:newStatus(r)}})));s.status(201).json({count:result.length});}));
app.post('/api/questions',run(async(r,s)=>{staff(r);const qs=z.array(bankQuestionSchema).min(1).max(100).parse(Array.isArray(r.body)?r.body:[r.body]);const result=await db.$transaction(qs.map(q=>db.question.create({data:{...q,options:JSON.stringify(q.options),correct:JSON.stringify(q.correct),creatorId:r.user.id,status:newStatus(r)}})));s.status(201).json(result.map(parseQ));}));
app.put('/api/questions/:id',run(async(r,s)=>{staff(r);const q=await db.question.findUniqueOrThrow({where:{id:Number(r.params.id)}});owner(r,q.creatorId);const p=bankQuestionSchema.parse(r.body);const up=await db.question.update({where:{id:q.id},data:{...p,options:JSON.stringify(p.options),correct:JSON.stringify(p.correct),...(r.user.role==='ADMIN'?{}:{status:'DRAFT',reviewerId:null,reviewedAt:null,reviewNote:''})}});await audit(r,'QUESTION_UPDATE','Question',q.id,p.content.slice(0,120));s.json(parseQ(up));}));
app.delete('/api/questions/:id',run(async(r,s)=>{staff(r);const q=await db.question.findUniqueOrThrow({where:{id:Number(r.params.id)}});owner(r,q.creatorId);await db.question.delete({where:{id:q.id}});await audit(r,'QUESTION_DELETE','Question',q.id,q.content.slice(0,120));s.json({ok:true});}));
// --- Thẩm định câu hỏi: Nháp → Chờ duyệt → Đã duyệt / Trả lại ---
const statuses=['DRAFT','PENDING','APPROVED','REJECTED'] as const;
app.patch('/api/questions/:id/status',run(async(r,s)=>{staff(r);
 const q=await db.question.findUniqueOrThrow({where:{id:Number(r.params.id)}});
 const p=z.object({status:z.enum(statuses),note:z.string().trim().max(1000).default('')}).parse(r.body);
 const admin=r.user.role==='ADMIN';
 if(admin){if(p.status==='PENDING')fail('Quản trị viên duyệt hoặc trả lại, không tự gửi duyệt.');}
 else{owner(r,q.creatorId);
  if(p.status==='APPROVED'||p.status==='REJECTED')fail('Chỉ quản trị viên được duyệt hoặc trả lại câu hỏi.',403);
  if(p.status==='PENDING'&&q.status==='APPROVED')fail('Câu hỏi đã được duyệt.');}
 const row=await db.question.update({where:{id:q.id},data:{status:p.status,reviewNote:p.note,
  ...(admin&&(p.status==='APPROVED'||p.status==='REJECTED')?{reviewerId:r.user.id,reviewedAt:new Date()}:{reviewerId:null,reviewedAt:null})}});
 await audit(r,'QUESTION_'+p.status,'Question',q.id,`${q.status} → ${p.status}${p.note?' · '+p.note:''}`);
 s.json(parseQ(row));}));
app.get('/api/review/queue',run(async(r,s)=>{staff(r);
 const where:any=r.user.role==='ADMIN'?{status:'PENDING'}:{creatorId:r.user.id,status:{in:['DRAFT','PENDING','REJECTED']}};
 s.json((await db.question.findMany({where,include:{creator:{select:{name:true}}},orderBy:{id:'desc'},take:200})).map(parseQ));}));
app.get('/api/audit',run(async(r,s)=>{if(r.user.role!=='ADMIN')fail('Chỉ quản trị viên được xem nhật ký.',403);
 s.json(await db.auditLog.findMany({orderBy:{id:'desc'},take:300}));}));
app.patch('/api/questions/:id/share',run(async(r,s)=>{staff(r);
 const q=await db.question.findUniqueOrThrow({where:{id:Number(r.params.id)}});owner(r,q.creatorId);
 const shared=z.boolean().parse(r.body.shared);
 if(shared&&r.user.role!=='ADMIN'&&!r.user.department)fail('Tài khoản chưa được xếp vào khoa / tổ bộ môn nên chưa chia sẻ được. Đề nghị quản trị viên bổ sung.');
 const row=await db.question.update({where:{id:q.id},data:{shared}});
 await audit(r,shared?'QUESTION_SHARE':'QUESTION_UNSHARE','Question',q.id,q.content.slice(0,120));
 s.json(parseQ(row));}));
app.post('/api/ai/generate',rateLimit({windowMs:60000,limit:10,message:{error:'Vui lòng chờ một phút trước khi tạo tiếp.'}}),run(async(r,s)=>{staff(r);s.json(await generate(r.body));}));
const alloc=(percents:number[],total:number)=>{const exact=percents.map(x=>x*total/100),c=exact.map(Math.floor);let left=total-c.reduce((a,b)=>a+b,0);const order=exact.map((x,i)=>({i,f:x-c[i]})).sort((a,b)=>b.f-a.f);for(let i=0;i<left;i++)c[order[i].i]++;return c;};
app.post('/api/ai/review',rateLimit({windowMs:60000,limit:40,message:{error:'Vui lòng chờ một phút trước khi soát tiếp.'}}),run(async(r,s)=>{staff(r);s.json(await reviewQuestion(r.body));}));
const examSchema=z.object({name:z.string().trim().min(5).max(200),topic:z.string().min(2).max(200),audience:z.enum(audiences),duration:z.number().int().min(1).max(180),passScore:z.number().min(0).max(10),count:z.number().int().min(1).max(100),ratios:z.array(z.number().min(0).max(100)).length(4).refine(a=>Math.abs(a.reduce((x,y)=>x+y,0)-100)<0.01,'Tổng tỷ lệ phải bằng 100%.'),questionIds:z.array(z.number().int()).default([]),shuffleQuestions:z.boolean(),shuffleAnswers:z.boolean(),assignedUserIds:z.array(z.number().int()).default([]),topicRatios:z.array(z.object({topic:z.string().trim().min(1).max(200),percent:z.number().min(0).max(100)})).max(20).default([]).refine(a=>!a.length||Math.abs(a.reduce((x,y)=>x+y.percent,0)-100)<0.01,'Tổng tỷ lệ chủ đề phải bằng 100%.'),practice:z.boolean().default(false),maxAttempts:z.number().int().min(1).max(20).default(1)});
async function selectExam(r:AuthReq){staff(r);const p=examSchema.parse(r.body);let qs:Q[]=[];if(p.questionIds.length){if(p.questionIds.length!==p.count||new Set(p.questionIds).size!==p.count)fail('Số câu đã chọn phải bằng số lượng thiết lập.');const rows=await db.question.findMany({where:{...qScope(r),id:{in:p.questionIds}}});if(rows.length!==p.count)fail('Có câu hỏi không thuộc quyền sử dụng.');const unapproved=rows.filter(q=>q.status!=='APPROVED');if(unapproved.length)fail('Có '+unapproved.length+' câu chưa được duyệt nên chưa đưa vào đề được.');qs=p.questionIds.map(id=>parseQ(rows.find(q=>q.id===id)));}else{const matrix=p.topicRatios.length>0;const rows=(await db.question.findMany({where:{...qScope(r),status:'APPROVED',audience:p.audience,...(p.topic==='Tổng hợp'||matrix?{}:{topic:p.topic})}})).map(parseQ);const groups=matrix?alloc(p.topicRatios.map(t=>t.percent),p.count).map((n,i)=>({topic:p.topicRatios[i].topic as string|null,count:n})):[{topic:null as string|null,count:p.count}];for(const g of groups){const sub=g.topic?rows.filter(q=>q.topic===g.topic):rows;const counts=alloc(p.ratios,g.count);for(let i=0;i<4;i++){const pool=shuffle(sub.filter(q=>q.level===levels[i]));if(pool.length<counts[i])fail(`Không đủ câu ${levels[i]}${g.topic?' thuộc chủ đề '+g.topic:''}: cần ${counts[i]}, có ${pool.length}.`);qs.push(...pool.slice(0,counts[i]));}}}if(p.assignedUserIds.length){const n=await db.user.count({where:{id:{in:p.assignedUserIds},role:'STUDENT',active:true}});if(n!==new Set(p.assignedUserIds).size)fail('Danh sách học viên không hợp lệ.');}return {p,qs};}
app.post('/api/exams/preview',run(async(r,s)=>{const {p,qs}=await selectExam(r);s.json({...p,questions:qs});}));
app.post('/api/exams',run(async(r,s)=>{const {p,qs}=await selectExam(r);const {count,questionIds,ratios,topicRatios,assignedUserIds,...data}=p;const ex=await db.exam.create({data:{...data,questions:JSON.stringify(qs),ratios:JSON.stringify(ratios),topicRatios:JSON.stringify(topicRatios),assignedUserIds:JSON.stringify(assignedUserIds),creatorId:r.user.id}});await audit(r,'EXAM_CREATE','Exam',ex.id,ex.name);s.status(201).json(ex);}));
function assigned(e:any,id:number){const ids=JSON.parse(e.assignedUserIds);return !ids.length||ids.includes(id);}
app.get('/api/exams',run(async(r,s)=>{const rows=await db.exam.findMany({where:r.user.role==='STUDENT'?{published:true}:scope(r),include:{creator:{select:{name:true}},attempts:{where:{userId:r.user.id},select:{id:true,status:true}}},orderBy:{id:'desc'}});s.json(rows.filter(e=>r.user.role!=='STUDENT'||assigned(e,r.user.id)).map(e=>{const {questions,...data}=e;return {...data,count:JSON.parse(questions).length};}));}));
app.get('/api/exams/:id',run(async(r,s)=>{staff(r);const e=await db.exam.findUniqueOrThrow({where:{id:Number(r.params.id)}});owner(r,e.creatorId);s.json({...e,questions:JSON.parse(e.questions),variants:JSON.parse(e.variants),topicRatios:JSON.parse(e.topicRatios)});}));
app.patch('/api/exams/:id/publish',run(async(r,s)=>{staff(r);const e=await db.exam.findUniqueOrThrow({where:{id:Number(r.params.id)}});owner(r,e.creatorId);const published=z.boolean().parse(r.body.published);const up=await db.exam.update({where:{id:e.id},data:{published}});await audit(r,published?'EXAM_PUBLISH':'EXAM_UNPUBLISH','Exam',e.id,e.name);s.json(up);}));
type Variant={code:string,qOrder:number[],optOrder:(number[]|null)[]};
function buildVariant(base:Q[],v:Variant):Q[]{return v.qOrder.map((qi,pos)=>{const q=base[qi];const o=v.optOrder[pos];
 if(!o||q.type==='SHORT')return q;
 return {...q,options:o.map(i=>q.options[i]),correct:o.map((old,i)=>q.correct.includes(old)?i:-1).filter(i=>i>=0)};});}
const answerKey=(qs:Q[])=>qs.map(q=>q.type==='SHORT'?'—':q.correct.map(i=>'ABCDEF'[i]).join(''));
app.post('/api/exams/:id/variants',run(async(r,s)=>{staff(r);
 const e=await db.exam.findUniqueOrThrow({where:{id:Number(r.params.id)}});owner(r,e.creatorId);
 const count=z.number().int().min(1).max(8).parse(r.body.count);
 const base:Q[]=JSON.parse(e.questions);
 const codes=shuffle(['132','209','357','486','515','628','743','891']).slice(0,count).sort();
 const variants:Variant[]=codes.map(code=>{const qOrder=shuffle(base.map((_,i)=>i));
  return {code,qOrder,optOrder:qOrder.map(qi=>base[qi].type==='SHORT'?null:shuffle(base[qi].options.map((_,i)=>i)))};});
 await db.exam.update({where:{id:e.id},data:{variants:JSON.stringify(variants)}});
 await audit(r,'EXAM_VARIANTS','Exam',e.id,count+' mã đề');
 s.json({count,keys:variants.map(v=>({code:v.code,answers:answerKey(buildVariant(base,v))}))});}));
app.get('/api/exams/:id/keys',run(async(r,s)=>{staff(r);
 const e=await db.exam.findUniqueOrThrow({where:{id:Number(r.params.id)}});owner(r,e.creatorId);
 const base:Q[]=JSON.parse(e.questions);
 s.json((JSON.parse(e.variants) as Variant[]).map(v=>({code:v.code,answers:answerKey(buildVariant(base,v))})));}));
app.get('/api/exams/:id/export',run(async(r,s)=>{staff(r);const e=await db.exam.findUniqueOrThrow({where:{id:Number(r.params.id)}});owner(r,e.creatorId);const base:Q[]=JSON.parse(e.questions);const v=r.query.variant?(JSON.parse(e.variants) as Variant[]).find(x=>x.code===String(r.query.variant)):null;if(r.query.variant&&!v)fail('Không tìm thấy mã đề này.',404);const qs=v?buildVariant(base,v):base;s.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document').attachment(v?`de-kiem-tra-ma-${v.code}.docx`:'de-kiem-tra.docx').send(await word(e.name+(v?' — Mã đề '+v.code:''),qs,r.query.answers==='true',`Đối tượng: ${e.audience} | Thời gian: ${e.duration} phút | Điểm đạt: ${e.passScore}/10`));}));
const examRef={select:{name:true,passScore:true,creatorId:true}};
async function expire(a:any){if(a.status==='IN_PROGRESS'&&Date.now()>=+a.expiresAt){const m=mark(JSON.parse(a.snapshot),JSON.parse(a.answers));await db.attempt.updateMany({where:{id:a.id,status:'IN_PROGRESS'},data:{submittedAt:a.expiresAt,score:m.score,status:m.pending?'PENDING':'GRADED'}});return db.attempt.findUniqueOrThrow({where:{id:a.id},include:{exam:examRef,user:{select:{name:true}}}});}return a;}
// Chốt hàng loạt bài quá hạn: chỉ tải snapshot/answers của đúng các bài cần chốt, cập nhật trong một giao dịch
// rồi đọc lại một lần duy nhất — số truy vấn không tăng theo số bài như khi gọi expire() trong vòng lặp.
async function expireDue<T extends{id:number,status:string,expiresAt:Date}>(rows:T[]):Promise<T[]>{const now=Date.now();const ids=rows.filter(a=>a.status==='IN_PROGRESS'&&now>=+a.expiresAt).map(a=>a.id);if(!ids.length)return rows;const due=await db.attempt.findMany({where:{id:{in:ids}},select:{id:true,snapshot:true,answers:true,expiresAt:true}});await db.$transaction(due.map(a=>{const m=mark(JSON.parse(a.snapshot),JSON.parse(a.answers));return db.attempt.updateMany({where:{id:a.id,status:'IN_PROGRESS'},data:{submittedAt:a.expiresAt,score:m.score,status:m.pending?'PENDING':'GRADED'}});}));const fresh=new Map((await db.attempt.findMany({where:{id:{in:ids}},select:{id:true,status:true,score:true,submittedAt:true}})).map(a=>[a.id,a]));return rows.map(a=>fresh.has(a.id)?{...a,...fresh.get(a.id)}:a);}
function attemptView(a:any){const qs=JSON.parse(a.snapshot),answers=JSON.parse(a.answers);const {snapshot,grades,exam,...data}=a;if(a.status==='IN_PROGRESS')return {...data,answers,questions:qs.map(publicQ),exam:{name:exam.name,passScore:exam.passScore},serverTime:new Date().toISOString()};const m=mark(qs,answers,JSON.parse(grades));return {...data,answers,...m,exam:{name:exam.name,passScore:exam.passScore},passed:m.pending?null:m.score>=exam.passScore,reviewTopics:[...new Set(m.review.filter(q=>q.type!=='SHORT'&&!q.correctAnswer||q.type==='SHORT'&&q.earned<1).map(q=>q.topic))]};}
app.post('/api/exams/:id/start',run(async(r,s)=>{if(r.user.role!=='STUDENT')fail('Đăng nhập bằng tài khoản học viên để làm bài.',403);const e=await db.exam.findUniqueOrThrow({where:{id:Number(r.params.id)}});if(!e.published||!assigned(e,r.user.id))fail('Đề chưa được giao hoặc đã ngừng công bố.',403);const last=(await db.attempt.findMany({where:{examId:e.id,userId:r.user.id},orderBy:{attemptNo:'desc'},take:1,include:{exam:examRef}}))[0];let a:any=last?await expire(last):null;const canRetry=e.practice&&a&&a.status!=='IN_PROGRESS'&&a.attemptNo<e.maxAttempts;if(!a||canRetry){const attemptNo=a?a.attemptNo+1:1;let qs:Q[]=JSON.parse(e.questions);if(e.shuffleQuestions)qs=shuffle(qs);if(e.shuffleAnswers)qs=qs.map(q=>{if(q.type==='SHORT')return q;const order=shuffle(q.options.map((_,i)=>i));return {...q,options:order.map(i=>q.options[i]),correct:order.map((old,i)=>q.correct.includes(old)?i:-1).filter(i=>i>=0)};});a=await db.attempt.upsert({where:{examId_userId_attemptNo:{examId:e.id,userId:r.user.id,attemptNo}},update:{},create:{examId:e.id,userId:r.user.id,attemptNo,expiresAt:new Date(Date.now()+e.duration*60000),snapshot:JSON.stringify(qs)},include:{exam:examRef}});}s.json(attemptView(await expire(a)));}));
async function getAttempt(r:AuthReq){let a=await db.attempt.findUniqueOrThrow({where:{id:Number(r.params.id)},include:{exam:examRef,user:{select:{name:true}}}});if(r.user.role==='STUDENT'){if(a.userId!==r.user.id)fail('Không có quyền xem bài làm này.',403);}else owner(r,a.exam.creatorId);return expire(a);}
const attemptScope=(r:AuthReq)=>r.user.role==='STUDENT'?{userId:r.user.id}:r.user.role==='ADMIN'?{}:{exam:{creatorId:r.user.id}};
app.get('/api/attempts',run(async(r,s)=>{const rows=await expireDue(await db.attempt.findMany({where:attemptScope(r),select:{id:true,status:true,score:true,submittedAt:true,expiresAt:true,exam:{select:{name:true,passScore:true}},user:{select:{name:true}}},orderBy:{id:'desc'}}));s.json(rows.map(a=>({id:a.id,student:a.user.name,examName:a.exam.name,status:a.status,score:a.score,submittedAt:a.submittedAt,passScore:a.exam.passScore})));}));
app.get('/api/attempts/:id',run(async(r,s)=>s.json(attemptView(await getAttempt(r)))));
app.put('/api/attempts/:id/answers',run(async(r,s)=>{const a=await getAttempt(r);if(a.userId!==r.user.id||r.user.role!=='STUDENT')fail('Không có quyền nộp bài.',403);if(a.status!=='IN_PROGRESS')return s.json(attemptView(a));const answers=z.record(z.union([z.string().max(10000),z.array(z.number().int().min(0).max(5)).max(6)])).parse(r.body.answers);const qs:Q[]=JSON.parse(a.snapshot);for(const [k,v]of Object.entries(answers)){const q=qs[Number(k)];if(!/^\d+$/.test(k)||!q||(q.type==='SHORT'?typeof v!=='string':!Array.isArray(v)||v.some(i=>i>=q.options.length)||(q.type!=='MULTIPLE'&&v.length>1)))fail('Câu trả lời không hợp lệ.');}const submit=z.boolean().optional().parse(r.body.submit)||false;const m=mark(qs,answers);await db.attempt.updateMany({where:{id:a.id,status:'IN_PROGRESS',expiresAt:{gt:new Date()}},data:{answers:JSON.stringify(answers),...(submit?{submittedAt:new Date(),score:m.score,status:m.pending?'PENDING':'GRADED'}:{})}});s.json(attemptView(await expire(await db.attempt.findUniqueOrThrow({where:{id:a.id},include:{exam:examRef}}))));}));
app.post('/api/attempts/:id/grade-suggest',rateLimit({windowMs:60000,limit:40,message:{error:'Vui lòng chờ một phút trước khi gợi ý tiếp.'}}),run(async(r,s)=>{staff(r);const a=await getAttempt(r);if(a.status==='IN_PROGRESS')fail('Bài chưa nộp.');const idx=z.number().int().min(0).max(200).parse(r.body.index);const qs:Q[]=JSON.parse(a.snapshot);const q=qs[idx];if(!q||q.type!=='SHORT')fail('Chỉ gợi ý chấm cho câu tự luận.');const answers=JSON.parse(a.answers);s.json(await suggestGrade(q.explanation||'',String(answers[idx]??'')));}));
app.post('/api/attempts/:id/grade',run(async(r,s)=>{staff(r);const a=await getAttempt(r);if(a.status==='IN_PROGRESS')fail('Bài chưa nộp.');const grades=z.record(z.object({points:z.number().min(0).max(1),feedback:z.string().max(3000)})).parse(r.body.grades);const qs:Q[]=JSON.parse(a.snapshot);for(const key of Object.keys(grades))if(!/^\d+$/.test(key)||qs[Number(key)]?.type!=='SHORT')fail('Chỉ chấm thủ công câu tự luận.');const merged={...JSON.parse(a.grades),...grades};const m=mark(qs,JSON.parse(a.answers),merged);const up=await db.attempt.update({where:{id:a.id},data:{grades:JSON.stringify(merged),score:m.score,status:m.pending?'PENDING':'GRADED'},include:{exam:examRef}});await audit(r,'ATTEMPT_GRADE','Attempt',a.id,(a.user&&a.user.name||'')+' · điểm '+m.score);s.json(attemptView(up));}));
app.get('/api/stats',run(async(r,s)=>{const student=r.user.role==='STUDENT';
// Chỉ lấy 4 cột dùng để đếm nhóm thay vì toàn bộ nội dung/phương án/giải thích của mọi câu hỏi.
const [qs,rows,exams]=await Promise.all([student?[]:db.question.findMany({where:qScope(r),select:{topic:true,level:true,type:true,audience:true}}),db.attempt.findMany({where:attemptScope(r),select:{id:true,status:true,score:true,expiresAt:true,snapshot:true,answers:true,grades:true,exam:{select:{passScore:true}}}}),db.exam.count({where:student?{published:true}:scope(r)})]);
const all=await expireDue(rows);const done=all.filter(a=>a.status==='GRADED');const errors:Record<string,{total:number,wrong:number}>={};for(const a of done){const m=mark(JSON.parse(a.snapshot),JSON.parse(a.answers),JSON.parse(a.grades));for(const q of m.review){errors[q.topic]??={total:0,wrong:0};errors[q.topic].total++;if(q.earned<1)errors[q.topic].wrong++;}}const group=(key:string)=>Object.entries(qs.reduce((o:any,q:any)=>(o[q[key]]=(o[q[key]]||0)+1,o),{})).map(([name,count])=>({name,count}));s.json({questions:qs.length,exams,attempts:done.length,pending:all.filter(a=>a.status==='PENDING').length,average:done.length?done.reduce((a,b)=>a+b.score,0)/done.length:null,passRate:done.length?done.filter(a=>a.score>=a.exam.passScore).length/done.length*100:null,topics:group('topic'),levels:group('level'),types:group('type'),audiences:group('audience'),errors:Object.entries(errors).map(([topic,v])=>({topic,...v,rate:100*v.wrong/v.total})).sort((a,b)=>b.rate-a.rate)});}));
// --- Phân tích chất lượng câu hỏi & hồ sơ học tập ---
// Dữ liệu lấy từ bản chụp trong Attempt.snapshot (vẫn giữ id câu hỏi gốc) nên không cần bảng mới.
const attemptFull=(where:any)=>db.attempt.findMany({where,select:{id:true,userId:true,status:true,score:true,expiresAt:true,submittedAt:true,snapshot:true,answers:true,grades:true,exam:{select:{name:true,passScore:true,practice:true}},user:{select:{name:true}}},orderBy:{id:'asc'}});
const suggestLevel=(p:number)=>p>=.85?levels[0]:p>=.65?levels[1]:p>=.4?levels[2]:levels[3];
const rankBag=(o:Record<string,{total:number,wrong:number}>)=>Object.entries(o).map(([name,v])=>({name,...v,rate:Math.round(1000*v.wrong/v.total)/10})).sort((a,b)=>b.rate-a.rate);
function tally(bags:Record<string,{total:number,wrong:number}>,key:string,earned:number){bags[key]??={total:0,wrong:0};bags[key].total++;if(earned<1)bags[key].wrong++;}
app.get('/api/analysis/questions',run(async(r,s)=>{staff(r);
 const done=(await expireDue(await attemptFull(attemptScope(r)))).filter(a=>a.status==='GRADED'&&!a.exam.practice);
 // Chia nhóm 27% điểm cao và 27% điểm thấp để tính độ phân biệt (chuẩn phân tích câu hỏi cổ điển).
 const ranked=[...done].sort((a,b)=>b.score-a.score);const k=Math.max(1,Math.round(ranked.length*.27));
 const top=new Set(ranked.slice(0,k).map(a=>a.id)),low=new Set(ranked.slice(-k).map(a=>a.id));
 type Acc={times:number,sum:number,tT:number,tS:number,lT:number,lS:number,level:string,topic:string,content:string};
 const acc=new Map<number,Acc>();
 for(const a of done){const m=mark(JSON.parse(a.snapshot),JSON.parse(a.answers),JSON.parse(a.grades));
  for(const q of m.review as any[]){if(typeof q.id!=='number')continue;
   const e=acc.get(q.id)??{times:0,sum:0,tT:0,tS:0,lT:0,lS:0,level:q.level,topic:q.topic,content:q.content};
   e.times++;e.sum+=q.earned;
   if(top.has(a.id)){e.tT++;e.tS+=q.earned;}
   if(low.has(a.id)){e.lT++;e.lS+=q.earned;}
   acc.set(q.id,e);}}
 const bank=new Map((await db.question.findMany({where:{id:{in:[...acc.keys()]}},select:{id:true,content:true,topic:true,level:true}})).map(q=>[q.id,q]));
 const reliable=done.length>=8;
 const items=[...acc].map(([id,e])=>{const cur=bank.get(id);const difficulty=e.sum/e.times;const level=cur?.level??e.level;
  const discrimination=reliable&&e.tT&&e.lT?e.tS/e.tT-e.lS/e.lT:null;
  const suggested=suggestLevel(difficulty);const flags:string[]=[];
  if(difficulty>=.9)flags.push('QUA_DE');
  if(difficulty<=.2)flags.push('QUA_KHO');
  if(discrimination!==null&&discrimination<0)flags.push('NGHICH_DAO');
  else if(discrimination!==null&&discrimination<.1)flags.push('KHONG_PHAN_BIET');
  if(suggested!==level)flags.push('LECH_MUC_DO');
  return {id,content:cur?.content??e.content,topic:cur?.topic??e.topic,level,inBank:Boolean(cur),times:e.times,
   difficulty:Math.round(difficulty*1000)/10,discrimination:discrimination===null?null:Math.round(discrimination*1000)/1000,
   suggestedLevel:suggested,flags};})
  .sort((a,b)=>b.flags.length-a.flags.length||a.difficulty-b.difficulty);
 s.json({attempts:done.length,reliable,items});
}));
app.get('/api/profile/:id',run(async(r,s)=>{const id=Number(r.params.id);
 if(r.user.role==='STUDENT'&&id!==r.user.id)fail('Không có quyền xem hồ sơ của học viên khác.',403);
 const u=await db.user.findUniqueOrThrow({where:{id},select:{id:true,name:true,username:true,role:true}});
 const all=await expireDue(await attemptFull({...attemptScope(r),userId:id}));
 const done=all.filter(a=>a.status==='GRADED');
 const topics:Record<string,{total:number,wrong:number}>={},lv:Record<string,{total:number,wrong:number}>={};
 for(const a of done){const m=mark(JSON.parse(a.snapshot),JSON.parse(a.answers),JSON.parse(a.grades));
  for(const q of m.review as any[]){tally(topics,q.topic,q.earned);tally(lv,q.level,q.earned);}}
 s.json({student:u,
  history:done.map(a=>({id:a.id,examName:a.exam.name,submittedAt:a.submittedAt,score:a.score,passScore:a.exam.passScore,passed:a.score>=a.exam.passScore,practice:a.exam.practice})),
  pending:all.filter(a=>a.status==='PENDING').length,inProgress:all.filter(a=>a.status==='IN_PROGRESS').length,
  average:done.length?Math.round(100*done.reduce((x,a)=>x+a.score,0)/done.length)/100:null,
  passRate:done.length?Math.round(1000*done.filter(a=>a.score>=a.exam.passScore).length/done.length)/10:null,
  topics:rankBag(topics),levels:rankBag(lv)});
}));
app.get('/api/students',run(async(r,s)=>{staff(r);s.json(await db.user.findMany({where:{role:'STUDENT',active:true},select:{id:true,name:true,username:true}}));}));
app.get('/api/users',run(async(r,s)=>{if(r.user.role!=='ADMIN')fail('Chỉ quản trị viên được truy cập.',403);s.json(await db.user.findMany({select:{id:true,name:true,username:true,role:true,active:true,department:true}}));}));
const userSchema=z.object({username:z.string().regex(/^[a-zA-Z0-9_]{3,40}$/),name:z.string().trim().min(2).max(100),role:z.enum(['ADMIN','TEACHER','STUDENT']),password:z.string().min(6).max(100)});
app.post('/api/users',run(async(r,s)=>{if(r.user.role!=='ADMIN')fail('Không có quyền.',403);const p=userSchema.parse(r.body);const code=randomBytes(18).toString('hex');const {password,recoveryHash,tokenVersion,...u}=await db.user.create({data:{...p,password:await bcrypt.hash(p.password,12),recoveryHash:await bcrypt.hash(code,12)}});await audit(r,'USER_CREATE','User',u.id,p.username+' · '+p.role);s.status(201).json({...u,recoveryCode:code});}));
app.patch('/api/users/:id',run(async(r,s)=>{if(r.user.role!=='ADMIN')fail('Không có quyền.',403);const id=Number(r.params.id);const p=z.object({active:z.boolean().optional(),password:z.string().min(6).max(100).optional(),department:z.string().trim().max(100).optional()}).parse(r.body);if(id===r.user.id&&p.active===false)fail('Không thể khóa tài khoản đang đăng nhập.');await db.user.update({where:{id},data:{...p,...(p.password?{password:await bcrypt.hash(p.password,12),recoveryHash:null,tokenVersion:{increment:1}}:{})}});await audit(r,p.password?'USER_RESET_PASSWORD':p.active===false?'USER_LOCK':p.active===true?'USER_UNLOCK':'USER_UPDATE','User',id,p.department!==undefined?'khoa/tổ: '+(p.department||'(trống)'):'');s.json({ok:true});}));
app.use('/api',(_,s)=>s.status(404).json({error:'Không tìm thấy API.'}));
const client=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../client/dist');// Tên file trong /assets có mã băm nội dung nên cache vĩnh viễn được; index.html luôn phải kiểm tra lại.
app.use(express.static(client,{setHeaders:(res,file)=>res.setHeader('Cache-Control',/[\\/]assets[\\/]/.test(file)?'public,max-age=31536000,immutable':'no-cache')}));app.get('*',(_,s)=>s.sendFile(path.join(client,'index.html')));
app.use((err:any,_r:Request,s:Response,_n:NextFunction)=>{const status=err instanceof z.ZodError?400:err.code==='P2025'?404:err.code==='P2002'?409:err.status||400;s.status(status).json({error:err instanceof z.ZodError?err.issues.map((x:any)=>`${x.path.join('.')}: ${x.message}`).join('; '):err.code==='P2002'?'Dữ liệu đã tồn tại.':err.code==='P2025'?'Không tìm thấy dữ liệu.':err.message||'Có lỗi xử lý.'});});
const server=app.listen(Number(process.env.PORT||4000),process.env.HOST||'127.0.0.1',()=>console.log(`Ngân hàng câu hỏi: http://localhost:${process.env.PORT||4000}`));
process.on('SIGTERM',()=>server.close(()=>db.$disconnect()));
