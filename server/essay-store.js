import {diffChars} from 'diff'
import {randomUUID,createHash} from 'node:crypto'
import {rubric,getRubric} from './content/essay-rubric.js'
import {outputSchema,validate,problem} from './essay-schema.js'
import {readFileSync} from 'node:fs'
const instructions=readFileSync(new URL('./prompts/essay-grade.md',import.meta.url),'utf8')
export function changes(original,confirmed) {
  if(!original || original===confirmed)return []
  const parts=diffChars(original,confirmed,{timeout:100,maxEditLength:4000})
  if(!parts)return [{start:0,original,confirmed,coarse:true}]
  let offset=0,pending=null
  const edits=[]
  for(const part of parts){
    if(!part.added&&!part.removed){pending=null;offset+=part.value.length;continue}
    if(!pending){pending={start:offset,original:'',confirmed:''};edits.push(pending)}
    if(part.removed){pending.original+=part.value;offset+=part.value.length}
    if(part.added)pending.confirmed+=part.value
  }
  return edits
}
export function essayStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS essays(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL,source TEXT NOT NULL,year TEXT NOT NULL,prompt_text TEXT NOT NULL,ocr_text TEXT NOT NULL DEFAULT '',
      transcript TEXT NOT NULL DEFAULT '',ocr_edits TEXT NOT NULL DEFAULT '[]',revision INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'uploaded',created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS essay_images(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,essay_id INTEGER NOT NULL REFERENCES essays(id),
      role TEXT NOT NULL,position INTEGER NOT NULL,hash TEXT NOT NULL,file_path TEXT NOT NULL,mime TEXT NOT NULL,UNIQUE(user_id,essay_id,role,position));
    CREATE TABLE IF NOT EXISTS essay_requests(request_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,essay_id INTEGER NOT NULL REFERENCES essays(id),
      revision INTEGER NOT NULL,rubric_version TEXT NOT NULL,schema_version TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS essay_gradings(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,essay_id INTEGER NOT NULL REFERENCES essays(id),
      request_id TEXT NOT NULL UNIQUE,revision INTEGER NOT NULL,grader TEXT NOT NULL,rubric_version TEXT NOT NULL,
      total INTEGER NOT NULL,max INTEGER NOT NULL,result TEXT NOT NULL,raw TEXT NOT NULL,transcript TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS api_tokens(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,scopes TEXT NOT NULL,created_at INTEGER NOT NULL,last_used_at INTEGER,revoked_at INTEGER);
  `)
  function get(user,id) {
    const row=db.prepare('SELECT * FROM essays WHERE user_id=? AND id=?').get(user,id)
    if(!row)problem('作文不存在',404)
    return {...row,ocr_edits:JSON.parse(row.ocr_edits)}
  }
  function ready(user,id) {
    const row=get(user,id)
    if(!row.revision)problem('请先确认转写文本',409)
    if(row.kind==='argument'&&!row.prompt_text.trim())problem('请补充题目材料',409)
    return row
  }
  function create(user,b) {
    if(!['essay','argument'].includes(b.kind))problem('请选择作文类型',400)
    for(const k of ['source','year','prompt_text'])if(b[k]!=null&&(typeof b[k]!=='string'||b[k].length>20000))problem(k+' 无效',400)
    const now=Date.now()
    const r=db.prepare('INSERT INTO essays(user_id,kind,source,year,prompt_text,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .run(user,b.kind,b.source||'',b.year||'',b.prompt_text||'',now,now)
    return get(user,Number(r.lastInsertRowid))
  }
  function confirm(user,id,b) {
    const row=get(user,id)
    if(row.revision!==b.revision)problem('已有新版本，请刷新',409)
    if(typeof b.transcript!=='string'||!b.transcript.trim()||b.transcript.length>50000)problem('请填写有效转写文本',400)
    const material=b.prompt_text??row.prompt_text
    if(typeof material!=='string'||material.length>50000)problem('材料格式无效',400)
    if(row.kind==='argument'&&!material.trim())problem('分析论证需要题目材料',400)
    db.prepare("UPDATE essays SET status='transcribed',prompt_text=?,transcript=?,ocr_edits=?,revision=revision+1,updated_at=? WHERE user_id=? AND id=? AND revision=?")
      .run(material,b.transcript,JSON.stringify(changes(row.ocr_text,b.transcript)),Date.now(),user,id,row.revision)
    return get(user,id)
  }
  function bundle(user,id) {
    const e=ready(user,id)
    const meta={essay_id:id,request_id:randomUUID(),transcript_revision:e.revision,rubric_version:rubric.version,schema_version:'1'}
    db.prepare('INSERT INTO essay_requests VALUES(?,?,?,?,?,?)').run(meta.request_id,user,id,e.revision,rubric.version,'1')
    return {...meta,kind:e.kind,prompt_text:e.prompt_text,transcript:e.transcript,ocr_edits:e.ocr_edits,
      rubric,instructions,output_schema:outputSchema(e.kind),response_template:{...meta,result:{}}}
  }
  function preview(user,id,body) {
    const e=ready(user,id)
    const r=db.prepare('SELECT * FROM essay_requests WHERE request_id=? AND user_id=? AND essay_id=?').get(String(body?.request_id||''),user,id)
    if(!r||body.essay_id!==id||r.revision!==e.revision||body.transcript_revision!==e.revision||
      !getRubric(r.rubric_version)||body.rubric_version!==r.rubric_version||body.schema_version!==r.schema_version)
      problem('批改材料与当前作文版本不匹配，请重新导出',409)
    return validate(e,body.result,r.rubric_version)
  }
  function submit(user,id,body,grader) {
    const verified=preview(user,id,body)
    const raw=JSON.stringify(verified)
    const prior=db.prepare('SELECT id,raw FROM essay_gradings WHERE user_id=? AND essay_id=? AND request_id=?').get(user,id,body.request_id)
    if(prior){if(prior.raw!==raw)problem('此请求已有不同结果，请重新导出后新增批改',409);return {id:prior.id,duplicate:true}}
    const e=get(user,id)
    const insert=()=>{
      const r=db.prepare('INSERT INTO essay_gradings(user_id,essay_id,request_id,revision,grader,rubric_version,total,max,result,raw,transcript,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(user,id,body.request_id,e.revision,grader,verified.rubric_version,verified.total,verified.max,raw,raw,e.transcript,Date.now())
      db.prepare("UPDATE essays SET status='graded',updated_at=? WHERE user_id=? AND id=?").run(Date.now(),user,id)
      return {id:Number(r.lastInsertRowid),duplicate:false}
    }
    return db.transaction(insert)()
  }
  return {get,ready,create,confirm,bundle,preview,submit}
}
export const digest = value=>createHash('sha256').update(value).digest('hex')
