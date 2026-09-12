import {z} from 'zod';
export const levels=['Nhận biết','Thông hiểu','Vận dụng','Vận dụng cao'] as const;
export const types=['SINGLE','MULTIPLE','TRUE_FALSE','SHORT'] as const;
export const audiences=['Chiến sĩ mới','Học viên','Hạ sĩ quan – binh sĩ','Cán bộ'] as const;
function makeQuestionSchema(optional=false){return z.object({content:z.string().trim().min(10).max(5000),type:z.enum(types),options:z.array(z.string().trim().min(1).max(2000)).max(6),correct:z.array(z.number().int().min(0).max(5)),explanation:optional?z.string().trim().max(6000).default(''):z.string().trim().min(3).max(6000),topic:z.string().trim().min(2).max(200),level:z.enum(levels),audience:z.enum(audiences),source:optional?z.string().trim().max(10000).default(''):z.string().trim().min(3).max(10000)}).superRefine((q,c)=>{if(q.type==='SHORT'){if(q.options.length||q.correct.length)c.addIssue({code:'custom',message:'Tự luận không có phương án; nhập hướng dẫn chấm ở giải thích.'});return;}if(q.options.length<2||new Set(q.options).size!==q.options.length||!q.correct.length||new Set(q.correct).size!==q.correct.length||q.correct.some(i=>i>=q.options.length)||(q.type!=='MULTIPLE'&&q.correct.length!==1)||(q.type==='TRUE_FALSE'&&q.options.length!==2))c.addIssue({code:'custom',message:'Kiểm tra phương án và chỉ số đáp án đúng.'});});
}
export const questionSchema=makeQuestionSchema();
export const bankQuestionSchema=makeQuestionSchema(true);
export type Q=z.infer<typeof questionSchema>&{id?:number};
export function parseQ(q:any){return {...q,options:JSON.parse(q.options),correct:JSON.parse(q.correct)};}
export function shuffle<T>(a:T[]):T[]{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function publicQ(q:Q){const {correct,explanation,source,...safe}=q;return safe;}
export function mark(qs:Q[],answers:any,grades:any={}){let points=0,right=0,wrong=0,pending=0;const review=qs.map((q,i)=>{const answer=answers[i];let earned=0;let correct=false;if(q.type==='SHORT'){if(grades[i]===undefined)pending++;else earned=grades[i].points;}else{correct=Array.isArray(answer)&&JSON.stringify([...answer].sort())===JSON.stringify([...q.correct].sort());earned=correct?1:0;correct?right++:wrong++;}points+=earned;return {...q,answer:answer??(q.type==='SHORT'?'':[]),earned,correctAnswer:correct,feedback:grades[i]?.feedback||''};});return {score:Math.round(points/qs.length*1000)/100,right,wrong,pending,review};}

// So khớp nội dung để phát hiện câu trùng: bỏ dấu, bỏ ký tự đặc biệt, so bằng hệ số Jaccard trên tập từ.
export const normText=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
export const wordSet=(s:string)=>new Set(normText(s).split(' ').filter(w=>w.length>1));
export function jaccard(a:Set<string>,b:Set<string>){if(!a.size||!b.size)return 0;let i=0;for(const t of a)if(b.has(t))i++;return i/(a.size+b.size-i);}
