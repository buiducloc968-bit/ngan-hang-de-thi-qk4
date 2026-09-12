import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {Readable} from 'node:stream';
import {bankQuestionSchema} from './domain.js';
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase().replace(/[^a-z0-9]/g,'');

const unxml=(s:string)=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
// Doc .docx: mo zip, lay word/document.xml, gom tung doan <w:p> thanh mot dong van ban.
export async function parseDocx(buffer:Buffer,defaults:Record<string,string>){
 let zip;try{zip=await JSZip.loadAsync(buffer);}catch{throw new Error('Không đọc được file Word. Kiểm tra đúng định dạng .docx và không đặt mật khẩu.');}
 let expanded=0;
 for(const entry of Object.values(zip.files)){expanded+=(entry as any)._data?.uncompressedSize||0;if(expanded>30*1024*1024)throw new Error('File giải nén quá lớn.');}
 const doc=zip.file('word/document.xml');
 if(!doc)throw new Error('File .docx không hợp lệ. Nếu là file .doc cũ, hãy mở Word và lưu lại thành .docx.');
 const xml=await doc.async('string');
 const lines:string[]=[];
 for(const para of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g)||[]){
  const text=(para.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g)||[]).map(t=>unxml(t.replace(/<[^>]+>/g,''))).join('').replace(/\s+/g,' ').trim();
  if(text)lines.push(text);
 }
 if(!lines.length)throw new Error('File Word không có nội dung văn bản để đọc.');
 if(lines.length>4000)throw new Error('File Word quá dài. Hãy tách nhỏ dưới 4000 dòng.');
 type Blk={content:string,options:string[],answer:string,explanation:string,source:string,line:number};
 const blocks:Blk[]=[];let cur:Blk|null=null;
 lines.forEach((line,idx)=>{
  const qm=line.match(/^C[âa]u\s*\d+\s*[.:)]?\s*(.*)$/i);
  if(qm){cur={content:qm[1].trim(),options:[],answer:'',explanation:'',source:'',line:idx+1};blocks.push(cur);return;}
  if(cur){
   const am=line.match(/^(?:Đáp án đúng|Đáp án|Dap an|ĐA)\s*[:.]?\s*(.+)$/i);if(am){cur.answer=am[1].trim();return;}
   const em=line.match(/^(?:Giải thích|Hướng dẫn chấm)\s*[:.]?\s*(.+)$/i);if(em){cur.explanation=em[1].trim();return;}
   const sm=line.match(/^(?:Nguồn tài liệu|Nguồn|Trích dẫn)\s*[:.]?\s*(.+)$/i);if(sm){cur.source=sm[1].trim();return;}
   const om=line.match(/^([A-Fa-f])\s*[.)]\s*(.+)$/);if(om){cur.options.push(om[2].trim());return;}
   if(!cur.options.length)cur.content=(cur.content+' '+line).trim();
   return;
  }
  if(line.length>=10){cur={content:line,options:[],answer:'',explanation:'',source:'',line:idx+1};blocks.push(cur);}
 });
 if(!blocks.length)throw new Error('Không nhận ra câu hỏi nào. Mỗi câu nên bắt đầu bằng "Câu 1." và các phương án ghi "A.", "B."…');
 if(blocks.length>500)throw new Error('Mỗi lần nhập tối đa 500 câu hỏi.');
 const seen=new Set<string>();
 const rows=blocks.map(b=>{
  const errors:string[]=[];const warnings:string[]=[];
  const tokens=b.answer?b.answer.toUpperCase().split(/[,;\s]+/).filter(Boolean):[];
  if(tokens.some(v=>!/^[A-F]$/.test(v)))errors.push('Đáp án phải là A–F, ngăn cách bằng dấu phẩy (ví dụ A, C).');
  const correct=tokens.filter(v=>/^[A-F]$/.test(v)).map(v=>v.charCodeAt(0)-65);
  if(b.options.length&&new Set(b.options).size!==b.options.length)errors.push('Các phương án bị trùng nội dung.');
  if(b.options.length&&!tokens.length)errors.push('Chưa ghi đáp án. Thêm dòng "Đáp án: A" ngay dưới các phương án.');
  if(!b.options.length&&!tokens.length)warnings.push('Không có phương án — đang hiểu là câu tự luận.');
  if(correct.length>1)warnings.push('Nhiều đáp án: cần đối chiếu trước khi nhập.');
  if(seen.has(norm(b.content)))warnings.push('Nội dung trùng một câu phía trên trong cùng file.');
  seen.add(norm(b.content));
  const type=!b.options.length?'SHORT':correct.length>1?'MULTIPLE':b.options.length===2?'TRUE_FALSE':'SINGLE';
  const q={content:b.content,options:type==='SHORT'?[]:b.options,correct:type==='SHORT'?[]:correct,type,
   explanation:b.explanation,source:b.source,topic:defaults.topic,level:defaults.level,audience:defaults.audience};
  const result=bankQuestionSchema.safeParse(q);
  if(!result.success)errors.push(...result.error.issues.map(e=>`${e.path.join('.')}: ${e.message}`));
  return {line:b.line,question:result.success?result.data:q,errors,warnings};
 });
 return {rows,sheet:'Word',total:rows.length};
}
export async function previewImport(filename:string,data:string,defaults:Record<string,string>){
 const buffer=Buffer.from(data,'base64');if(!buffer.length||buffer.length>5*1024*1024)throw new Error('File phải có dung lượng từ 1 byte đến 5 MB.');
 if(/\.docx$/i.test(filename))return parseDocx(buffer,defaults);
 if(!/\.(xlsx|csv)$/i.test(filename))throw new Error('Chỉ hỗ trợ Word .docx, Excel .xlsx hoặc CSV UTF-8. File .doc hoặc .xls cần lưu lại thành .docx hoặc .xlsx.');
 const book=new ExcelJS.Workbook();
 try{if(/\.csv$/i.test(filename)){
  const text=new TextDecoder('utf-8',{fatal:true}).decode(buffer).replace(/^\uFEFF/,'');
  const header=text.split(/\r?\n/)[0];const delimiter=header.includes(';')?';':header.includes('\t')?'\t':',';
  await book.csv.read(Readable.from([text]),{parserOptions:{delimiter,maxRows:502},map:(v:string)=>v});
 }else {
  // ExcelJS expects unprefixed SpreadsheetML tags; some valid producers use x:.
  const zip=await JSZip.loadAsync(buffer);let expanded=0;
  for(const entry of Object.values(zip.files)){
   expanded+=(entry as any)._data?.uncompressedSize||0;
   if(expanded>30*1024*1024)throw new Error('File giải nén quá lớn.');
  }
  for(const entry of Object.values(zip.files))if(entry.name.endsWith('.xml')){
   let xml=await entry.async('string');
   const prefixes=[...xml.matchAll(/xmlns:([\w]+)="http:\/\/schemas.openxmlformats.org\/spreadsheetml\/2006\/main"/g)].map(m=>m[1]);
   for(const prefix of new Set(prefixes))xml=xml.replace(new RegExp(`(<\\/?)${prefix}:`,'g'),'$1').replace(new RegExp(`xmlns:${prefix}=`,'g'),'xmlns=');
   zip.file(entry.name,xml);
  }
  await book.xlsx.load(await zip.generateAsync({type:'nodebuffer'}) as any,{ignoreNodes:['tableParts','drawing','extLst']});
 }}catch{throw new Error('Không đọc được file. Kiểm tra định dạng .xlsx hoặc CSV UTF-8, dấu ngoặc kép và file không đặt mật khẩu (tối đa 30 MB sau giải nén).');}
 const sheet=book.worksheets.find(s=>['cauhoi','nganhangcauhoi'].includes(norm(s.name)))||book.worksheets[0];
 if(!sheet||sheet.rowCount<2)throw new Error('File chưa có câu hỏi. Hàng đầu phải là tiêu đề cột.');
 if(sheet.rowCount>501||sheet.columnCount>40)throw new Error('Mỗi lần nhập tối đa 500 dòng câu hỏi và 40 cột.');
 const headers:Record<string,number>={};sheet.getRow(1).eachCell((c,i)=>{const key=norm(c.text);if(headers[key])throw new Error('Tiêu đề cột bị trùng: '+c.text);headers[key]=i;});
 const col=(...names:string[])=>names.map(norm).map(n=>headers[n]).find(Boolean);
 const contentCol=col('Nội dung câu hỏi','Câu hỏi','content'),answerCol=col('Đáp án theo tài liệu','Đáp án đúng','Đáp án','correct');
 if(!contentCol||!answerCol)throw new Error('Thiếu cột Nội dung câu hỏi hoặc Đáp án. Hãy dùng file mẫu.');
 const rows:any[]=[];const seen=new Set<string>();
 sheet.eachRow((row,line)=>{if(line===1||!row.hasValues)return;
  const get=(...names:string[])=>{const c=col(...names);return c?row.getCell(c).text.trim():'';};
  const content=row.getCell(contentCol).text.trim();const errors:string[]=[];const warnings:string[]=[];
  row.eachCell(c=>{if(c.type===ExcelJS.ValueType.Formula)errors.push('Có công thức Excel; chuyển thành giá trị văn bản trước khi nhập.');});
  let options='ABCDEF'.split('').map(a=>get('Phương án '+a,a));
  while(options.length&&!options.at(-1))options.pop();
  if(!options.length&&get('Phương án','options'))options=get('Phương án','options').split(/\r?\n/).map(v=>v.replace(/^[A-F][.)]\s*/i,''));
  const raw=row.getCell(answerCol).text.trim().toUpperCase();
  const tokens=raw?raw.split(/[,;\s]+/).filter(Boolean):[];
  if(tokens.some(v=>! /^[A-F]$/.test(v)))errors.push('Đáp án phải là A–F, ngăn cách bằng dấu phẩy (ví dụ A, C).');
  if(new Set(options).size!==options.length)errors.push('Các phương án bị trùng nội dung; sửa trong file rồi nhập lại.');
  const correct=tokens.map(v=>v.charCodeAt(0)-65);
  const typeRaw=get('Loại','Loại câu hỏi','type');
  const typeMap:Record<string,string>={single:'SINGLE',multiple:'MULTIPLE',truefalse:'TRUE_FALSE',short:'SHORT',tracnghiemmotdapan:'SINGLE',tracnghiemnhieudapan:'MULTIPLE',dungsai:'TRUE_FALSE',tuluanngan:'SHORT'};
  const type=typeRaw?(typeMap[norm(typeRaw)]||typeRaw):correct.length>1?'MULTIPLE':'SINGLE';
  if(correct.length>1)warnings.push('Nhiều đáp án: cần đối chiếu trước khi chọn nhập.');
  if(seen.has(norm(content)))warnings.push('Nội dung trùng một dòng trước trong file.');seen.add(norm(content));
  const q={content,options,correct,type,explanation:get('Giải thích đáp án','Giải thích','explanation'),source:get('Nguồn tài liệu / Trích đoạn đối chiếu','Nguồn tài liệu','Nguồn','source'),topic:get('Chủ đề','topic')||defaults.topic,level:get('Mức độ nhận thức','Mức độ','level')||defaults.level,audience:get('Đối tượng sử dụng','Đối tượng','audience')||defaults.audience};
  const result=bankQuestionSchema.safeParse(q);if(!result.success)errors.push(...result.error.issues.map(e=>`${e.path.join('.')}: ${e.message}`));
  rows.push({line,question:result.success?result.data:q,errors,warnings});
 });
 if(!rows.length)throw new Error('Không có dòng câu hỏi để nhập.');
 return {rows,sheet:sheet.name,total:rows.length};
}
