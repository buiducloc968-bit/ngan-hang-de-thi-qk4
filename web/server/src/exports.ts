import {Document,Packer,Paragraph,TextRun,HeadingLevel} from 'docx';
import ExcelJS from 'exceljs';
import type {Q} from './domain.js';
const statusName:Record<string,string>={IN_PROGRESS:'Đang làm',PENDING:'Chờ chấm tự luận',GRADED:'Đã chấm'};
const stamp=(v:any)=>v?new Date(v).toLocaleString('vi-VN'):'';
const round=(v:number)=>Math.round(v*100)/100;
const resultName=(a:any)=>a.status==='IN_PROGRESS'?'—':a.status==='PENDING'?'Chờ chấm tự luận':a.score>=a.passScore?'Đạt':'Chưa đạt';
const header=(s:any)=>{s.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};s.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF8E2028'}};s.eachRow((r:any)=>{r.alignment={wrapText:true,vertical:'top'};});s.views=[{state:'frozen',ySplit:1}];};
// Bảng điểm: một sheet danh sách bài làm, một sheet tổng hợp theo đề. Trung bình và tỷ lệ đạt chỉ tính bài đã chấm xong.
export async function resultsExcel(rows:any[]){
 const b=new ExcelJS.Workbook();const s=b.addWorksheet('Bảng điểm');
 s.columns=[['id','Mã bài',10],['student','Học viên',28],['username','Tên đăng nhập',20],['classroom','Lớp / Đơn vị',24],['examName','Đề kiểm tra',42],['attemptNo','Lượt',8],['startedAt','Bắt đầu',22],['submittedAt','Nộp bài',22],['score','Điểm',10],['passScore','Điểm đạt',10],['result','Kết quả',20],['status','Trạng thái',20],['form','Hình thức',16]].map(([key,head,width])=>({key:String(key),header:String(head),width:Number(width)}));
 for(const a of rows)s.addRow({...a,startedAt:stamp(a.startedAt),submittedAt:stamp(a.submittedAt),score:a.status==='IN_PROGRESS'?null:round(a.score),status:statusName[a.status]||a.status,result:resultName(a),form:a.paper?'Thi trên giấy':'Trực tuyến'});
 const t=b.addWorksheet('Tổng hợp theo đề');
 t.columns=[['examName','Đề kiểm tra',42],['graded','Bài đã chấm',14],['average','Điểm trung bình',18],['passRate','Tỷ lệ đạt (%)',16],['pending','Chờ chấm tự luận',18],['active','Đang làm',12]].map(([key,head,width])=>({key:String(key),header:String(head),width:Number(width)}));
 const byExam=new Map<string,any[]>();
 for(const a of rows)byExam.set(a.examName,[...(byExam.get(a.examName)||[]),a]);
 for(const [examName,list] of byExam){const graded=list.filter(x=>x.status==='GRADED');
  t.addRow({examName,graded:graded.length,average:graded.length?round(graded.reduce((sum,x)=>sum+x.score,0)/graded.length):null,
   passRate:graded.length?Math.round(graded.filter(x=>x.score>=x.passScore).length/graded.length*1000)/10:null,
   pending:list.filter(x=>x.status==='PENDING').length,active:list.filter(x=>x.status==='IN_PROGRESS').length});}
 header(s);header(t);
 return b.xlsx.writeBuffer();
}
// Biên bản kết quả một bài làm: thông tin chung, từng câu kèm bài làm của học viên, đáp án đúng và điểm thành phần.
export async function resultWord(a:any){
 const children=[new Paragraph({text:'KẾT QUẢ KIỂM TRA',heading:HeadingLevel.TITLE}),
  ...[`Học viên: ${a.user?.name||''}`,`Đề kiểm tra: ${a.exam.name}`,`Lượt làm: ${a.attemptNo||1}${a.variant?' · Mã đề '+a.variant:''}`,
   `Nộp bài: ${stamp(a.submittedAt)}`,`Điểm: ${a.pending?'(tạm tính) ':''}${round(a.score)}/10 · Điểm đạt: ${a.exam.passScore}`,
   `Kết luận: ${a.pending?`Chờ chấm ${a.pending} câu tự luận`:a.passed?'Đạt':'Chưa đạt'}`].map(text=>new Paragraph(text))];
 (a.review||[]).forEach((q:any,i:number)=>{
  children.push(new Paragraph({children:[new TextRun({text:`Câu ${i+1}. ${q.content}`,bold:true})],spacing:{before:200}}));
  if(q.type==='SHORT')children.push(new Paragraph(`Bài làm: ${q.answer||'(không trả lời)'}`),new Paragraph(`Hướng dẫn chấm: ${q.explanation}`));
  else{q.options.forEach((o:string,j:number)=>children.push(new Paragraph(`${(q.answer||[]).includes(j)?'[x]':'[  ]'} ${String.fromCharCode(65+j)}. ${o}${q.correct.includes(j)?'   ← đáp án đúng':''}`)));
   children.push(new Paragraph(`Giải thích: ${q.explanation}`));}
  children.push(new Paragraph(`Điểm câu này: ${round(q.earned)}/1${q.feedback?` · Nhận xét: ${q.feedback}`:''}`),new Paragraph(`Chủ đề: ${q.topic} | ${q.level}`));
 });
 children.push(new Paragraph({text:`Chủ đề cần ôn tập: ${(a.reviewTopics||[]).join('; ')||'không có'}`,spacing:{before:200}}));
 return Packer.toBuffer(new Document({styles:{default:{document:{run:{font:'Arial',size:24}}}},sections:[{children}]}));
}
export async function word(title:string,qs:Q[],withAnswers:boolean,description=''){const children=[new Paragraph({text:title,heading:HeadingLevel.TITLE}),new Paragraph(description)];qs.forEach((q,i)=>{children.push(new Paragraph({children:[new TextRun({text:`Câu ${i+1}. ${q.content}`,bold:true})],spacing:{before:200}}));q.options.forEach((o,j)=>children.push(new Paragraph(`${String.fromCharCode(65+j)}. ${o}`)));if(q.type==='SHORT')children.push(new Paragraph('................................................................................................'));if(withAnswers)children.push(new Paragraph(`Đáp án: ${q.correct.map(j=>String.fromCharCode(65+j)).join(', ')||'Tự luận – chấm thủ công'}`),new Paragraph(`Giải thích/hướng dẫn chấm: ${q.explanation}`),new Paragraph(`Chủ đề: ${q.topic} | ${q.level} | ${q.audience}`),new Paragraph(`Nguồn: ${q.source}`));});return Packer.toBuffer(new Document({styles:{default:{document:{run:{font:'Arial',size:24}}}},sections:[{children}]}));}
export async function excel(qs:any[]){const b=new ExcelJS.Workbook();const s=b.addWorksheet('Ngân hàng câu hỏi');s.columns=[['id','Mã',8],['content','Câu hỏi',65],['type','Loại',16],['options','Phương án',60],['correct','Đáp án',15],['explanation','Giải thích',70],['topic','Chủ đề',40],['level','Mức độ',20],['audience','Đối tượng',24],['source','Nguồn',60],['creator','Người tạo',25],['createdAt','Ngày tạo',24]].map(([key,header,width])=>({key:String(key),header:String(header),width:Number(width)}));for(const q of qs)s.addRow({...q,options:q.options.map((v:string,i:number)=>`${String.fromCharCode(65+i)}. ${v}`).join('\n'),correct:q.correct.map((i:number)=>String.fromCharCode(65+i)).join(', '),creator:q.creator?.name||'',createdAt:String(q.createdAt)});s.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};s.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF8E2028'}};s.eachRow(r=>{r.alignment={wrapText:true,vertical:'top'};});s.views=[{state:'frozen',ySplit:1}];s.autoFilter='A1:L1';return b.xlsx.writeBuffer();}
