import fs from 'node:fs'
import crypto from 'node:crypto'
import db, {createQuestion,getQuestion,updateQuestion,saveImageFile,addImage,listImages,getImageAbsPath,dayStartAfter} from './db.js'
import {parseImageInput,callOcr} from './providers/ocr.js'
import {runImageTask} from './image-work.js'
import {isTutorAvailable,suggestQuestionMeta} from './providers/tutor.js'
import {handlers,jobStore,consumeCall,modelError} from './jobs.js'
import {ALL_POINTS} from './content/math.js'

// 只新增字段与表，旧题的复习和录入行为保持不变。
for(const [name,ddl] of [['ocr_status',"TEXT DEFAULT ''"],['image_hash',"TEXT DEFAULT ''"]]) {
  if(!db.prepare('PRAGMA table_info(questions)').all().some(c=>c.name===name))db.exec('ALTER TABLE questions ADD COLUMN '+name+' '+ddl)
}
db.exec(`
  CREATE TABLE IF NOT EXISTS batch_items (
    user_id INTEGER NOT NULL, request_id TEXT NOT NULL, batch TEXT NOT NULL, question_id INTEGER NOT NULL,
    expected_count INTEGER NOT NULL, PRIMARY KEY(user_id,request_id),
    FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS batch_images (
    user_id INTEGER NOT NULL, question_id INTEGER NOT NULL, position INTEGER NOT NULL, image_id INTEGER NOT NULL, hash TEXT NOT NULL,
    PRIMARY KEY(user_id,question_id,position), FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE
  );
`)
const locks=new Map()
async function serial(key,fn) {
  const prior=locks.get(key)||Promise.resolve()
  const current=prior.catch(()=>{}).then(fn);locks.set(key,current)
  try{return await current}finally{if(locks.get(key)===current)locks.delete(key)}
}
const item=(user,id)=>db.prepare('SELECT * FROM batch_items WHERE user_id=? AND question_id=?').get(user,id)
const ocr=async j=>{
  if(!getQuestion(j.user_id,j.ref_id))throw new Error('题目已删除')
  const images=listImages(j.user_id,j.ref_id)
  const parts=j.result.parts||[]
  for(let i=parts.length;i<images.length;i++){
    const im=images[i]
    const r=await runImageTask(async()=>{
      consumeCall(j.user_id,'ocr')
      const bytes=fs.readFileSync(getImageAbsPath(im.file_path))
      const dataUri='data:'+im.mime+';base64,'+bytes.toString('base64')
      return callOcr(dataUri)
    })
    if(r.error)throw modelError(r)
    if(!r.markdown?.trim())throw new Error('识别结果为空，请手动转写或重试')
    parts.push(r.markdown); jobStore.checkpoint(j,{parts})
  }
  const raw=parts.join('\n\n')
  // 不覆盖用户已经校对的 stem。
  updateQuestion(j.user_id,j.ref_id,{stem_raw:raw})
  db.prepare("UPDATE questions SET ocr_status='done' WHERE user_id=? AND id=?").run(j.user_id,j.ref_id)
  let suggestion=null, suggestion_error=''
  if(isTutorAvailable()){
    try{consumeCall(j.user_id,'grade');const r=await suggestQuestionMeta({stem:raw});if(r.error)suggestion_error=r.error;else suggestion=r}catch(e){suggestion_error=e.message}
  }
  return {parts,suggestion,suggestion_error}
}
ocr.onError=(j,e,final)=>db.prepare('UPDATE questions SET ocr_status=? WHERE user_id=? AND id=?').run(final?'failed':'queued',j.user_id,j.ref_id)
handlers.set('ocr_question',ocr)
export function installBatch(app,auth,limit,withAccessUrl) {
  app.post('/api/batch/questions',auth,(req,res)=>{
    const b=req.body||{}
    if(!/^[\w-]{8,100}$/.test(b.request_id||'') || !/^[\w-]{8,100}$/.test(b.batch||'') || !Number.isInteger(b.count)||b.count<1||b.count>20)
      return res.status(400).json({error:'批次标识或图片数量不合法（每题最多20张）'})
    const create=db.transaction(()=>{
      const prior=db.prepare('SELECT * FROM batch_items WHERE user_id=? AND request_id=?').get(req.userId,b.request_id)
      if(prior) return prior
      const subject=['math','logic','writing'].includes(b.subject)?b.subject:'math'
      const q=createQuestion(req.userId,{subject,question_type:subject==='logic'?'logic_reasoning':subject==='writing'?'essay':'problem_solving',
        source:String(b.source||'').slice(0,200),tags:Array.isArray(b.tags)?b.tags.map(String).slice(0,20):[],
        title:'待校对',review_due_at:0})
      db.prepare('INSERT INTO batch_items VALUES(?,?,?,?,?)').run(req.userId,b.request_id,b.batch,q.id,b.count)
      return item(req.userId,q.id)
    })
    res.json(create())
  })
  app.post('/api/batch/questions/:id/images',auth,async(req,res)=>{
    const id=Number(req.params.id), b=req.body||{}
    const it=item(req.userId,id)
    if(!it)return res.status(404).json({error:'批量题目不存在'})
    if(!Number.isInteger(b.position)||b.position<0||b.position>=it.expected_count)return res.status(400).json({error:'图片序号不合法'})
    const p=parseImageInput(b);if(p.error)return res.status(p.status||400).json({error:p.error})
    const hash=crypto.createHash('sha256').update(Buffer.from(p.b64,'base64')).digest('hex')
    await serial(req.userId+':'+id,async()=>{
      const prior=db.prepare('SELECT * FROM batch_images WHERE user_id=? AND question_id=? AND position=?').get(req.userId,id,b.position)
      if(prior){if(prior.hash!==hash)return res.status(409).json({error:'该位置已有不同图片，请新建题目'});return res.json(prior)}
      const started=db.prepare("SELECT id FROM jobs WHERE user_id=? AND kind='ocr_question' AND ref_id=?").get(req.userId,id)
      if(started)return res.status(409).json({error:'已开始识别，不可追加图片'})
      const meta=await saveImageFile(req.userId,id,Buffer.from(p.b64,'base64'))
      const save=db.transaction(()=>{
        const imageId=addImage(req.userId,id,meta,b.position)
        db.prepare('INSERT INTO batch_images VALUES(?,?,?,?,?)').run(req.userId,id,b.position,imageId,hash)
        if(b.position===0)db.prepare('UPDATE questions SET image_hash=? WHERE user_id=? AND id=?').run(hash,req.userId,id)
        return imageId
      })
      res.json({image_id:save(),hash})
    })
  })
  app.post('/api/questions/:id/ocr',auth,limit,(req,res)=>{
    const id=Number(req.params.id), it=item(req.userId,id)
    if(!it)return res.status(404).json({error:'批量题目不存在'})
    const n=db.prepare('SELECT COUNT(*) n FROM batch_images WHERE user_id=? AND question_id=?').get(req.userId,id).n
    if(n!==it.expected_count)return res.status(409).json({error:'图片尚未全部上传'})
    const j=jobStore.enqueue(req.userId,'ocr_question',id,String(id),{batch:it.batch})
    if(j.status==='queued'||j.status==='running')db.prepare("UPDATE questions SET ocr_status='queued' WHERE user_id=? AND id=?").run(req.userId,id)
    res.json({id:j.id,status:j.status})
  })
  app.post('/api/batch/duplicates',auth,(req,res)=>{
    const hashes=Array.isArray(req.body?.hashes)?req.body.hashes.filter(h=>/^[a-f0-9]{64}$/.test(h)).slice(0,100):[]
    res.json({hashes:hashes.filter(hash=>db.prepare('SELECT 1 FROM batch_images WHERE user_id=? AND hash=? LIMIT 1').get(req.userId,hash))})
  })
  app.get('/api/batch/review',auth,(req,res)=>{
    const rows=db.prepare("SELECT q.* FROM questions q JOIN batch_items b ON b.question_id=q.id AND b.user_id=q.user_id WHERE q.user_id=? AND q.stem='' ORDER BY q.id LIMIT 200").all(req.userId)
    res.json({items:rows.map(q=>({...getQuestion(req.userId,q.id),ocr_status:q.ocr_status,images:listImages(req.userId,q.id).map(withAccessUrl),
      job:db.prepare("SELECT id,status,error,result FROM jobs WHERE user_id=? AND ref_id=? AND kind='ocr_question' ORDER BY id DESC LIMIT 1").get(req.userId,q.id)}))})
  })
  app.post('/api/batch/questions/:id/confirm',auth,(req,res)=>{
    const id=Number(req.params.id),stem=String(req.body?.stem||'').trim()
    if(!item(req.userId,id))return res.status(404).json({error:'题目不存在'})
    if(!stem||stem.length>50000)return res.status(400).json({error:'请填写题干（最多50000字）'})
    const kps=Array.isArray(req.body.knowledge_points)?req.body.knowledge_points.filter(k=>ALL_POINTS.includes(k)):[]
    const q=updateQuestion(req.userId,id,{stem,title:stem.slice(0,80),knowledge_points:kps,review_due_at:dayStartAfter(1)})
    res.json(q)
  })
}
