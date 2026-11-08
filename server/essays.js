import {randomBytes} from 'node:crypto'
import {readFileSync} from 'node:fs'
import db,{listQuestions,saveImageFile,getImageAbsPath} from './db.js'
import {jobStore,handlers,consumeCall,modelError} from './jobs.js'
import {parseImageInput,callOcr} from './providers/ocr.js'
import {callEssayChat} from './providers/tutor.js'
import {essayStore,digest} from './essay-store.js'
import {rubric,getRubric} from './content/essay-rubric.js'
import {problem} from './essay-schema.js'
import {createQuestionHttp,updateQuestionHttp,addQuestionImageHttp} from './question-write.js'
const store=essayStore(db)
const images=(u,id)=>db.prepare('SELECT * FROM essay_images WHERE user_id=? AND essay_id=? ORDER BY role,position').all(u,id)
const imageLocks=new Set()
const activeImage=(user,id)=>imageLocks.has(user+':'+id)
const safe=fn=>async(req,res,next)=>{try{await fn(req,res)}catch(e){if(e.status)res.status(e.status).json({error:e.message});else next(e)}}
const validScopes=['essays:read','essays:write','essays:create','questions:read','questions:write']
function tokenAuth(scope) {
  return (req,res,next)=>{
    const match=/^Bearer (lp_[a-f0-9]{64})$/.exec(req.headers.authorization||'')
    const token=match&&db.prepare('SELECT * FROM api_tokens WHERE token_hash=? AND revoked_at IS NULL').get(digest(match[1]))
    if(!token)return res.status(401).json({error:'平台令牌无效或已吊销'})
    if(!JSON.parse(token.scopes).includes(scope))return res.status(403).json({error:'缺少权限 '+scope})
    req.userId=token.user_id
    db.prepare('UPDATE api_tokens SET last_used_at=? WHERE user_id=? AND id=?').run(Date.now(),req.userId,token.id)
    next()
  }
}
handlers.set('essay_ocr',async job=>{
  const e=store.get(job.user_id,job.ref_id)
  if(e.revision)throw new Error('已有校对稿')
  const parts=job.result.parts||[]
  for(const im of images(job.user_id,e.id).slice(parts.length)){
    consumeCall(job.user_id,'ocr')
    const r=await callOcr('data:'+im.mime+';base64,'+readFileSync(getImageAbsPath(im.file_path)).toString('base64'))
    if(r.error)throw modelError(r)
    if(!r.markdown?.trim())throw new Error('识别文本为空，请手动录入')
    parts.push({role:im.role,text:r.markdown})
    jobStore.checkpoint(job,{parts})
  }
  const text=role=>parts.filter(p=>p.role===role).map(p=>p.text).join('\n\n')
  db.prepare('UPDATE essays SET ocr_text=?,prompt_text=?,updated_at=? WHERE user_id=? AND id=? AND revision=0')
    .run(text('answer'),e.prompt_text||text('material'),Date.now(),job.user_id,e.id)
  return {parts}
})
function exampleResult(bundle) {
  const spec=bundle.rubric[bundle.kind]
  return {rubric_version:bundle.rubric_version,total:spec.max,max:spec.max,band:spec.band||spec.bands[0][0],
    dimensions:Object.entries(spec.dimensions).map(([name,max])=>({name,max,score:max,comment:'测试样例'})),
    issues:[],rewrite_sample:'模拟结果仅用于验证接口。',next_focus:['请用真实客户端复核。'],
    ...(bundle.kind==='argument'?{flaws_found:[],flaws_missed:[]}:{thesis:'测试',structure:'测试'})}
}
handlers.set('essay_grade',async job=>{
  const b=job.payload.bundle
  if(store.ready(job.user_id,job.ref_id).revision!==b.transcript_revision)throw new Error('校对稿已更新')
  const previous=db.prepare('SELECT id FROM essay_gradings WHERE user_id=? AND essay_id=? AND request_id=?').get(job.user_id,job.ref_id,b.request_id)
  if(previous)return {id:previous.id}
  let error=''
  for(let i=0;i<2;i++){
    let result,raw='',grader='mock'
    if(process.env.ESSAY_MOCK==='1')result=exampleResult(b)
    else{
      consumeCall(job.user_id,'grade')
      const response=await callEssayChat([{role:'system',content:b.instructions},{role:'user',content:JSON.stringify(b)+'\n'+error}])
      if(response.error)throw modelError(response)
      grader='api:'+response.model
      raw=response.markdown
      try{const parsed=JSON.parse(raw);result=parsed.result||parsed}catch{error='必须返回纯 JSON';jobStore.checkpoint(job,{raw,error});continue}
    }
    try{return store.submit(job.user_id,job.ref_id,{...b,result},grader)}
    catch(e){if(e.status!==422)throw e;error=e.message;jobStore.checkpoint(job,{raw,error})}
  }
  throw new Error('结果校验失败：'+error)
})
export function installEssays(app,auth,limit,makeRateLimit) {
  const agentLimit=makeRateLimit(60000,60,q=>String(q.userId))
  const list=user=>db.prepare('SELECT id,kind,source,year,status,revision,created_at FROM essays WHERE user_id=? ORDER BY id DESC LIMIT 200').all(user)
  const readGrade=db.prepare('SELECT id,grader,rubric_version,result,transcript,revision,created_at FROM essay_gradings WHERE user_id=? AND essay_id=? ORDER BY id DESC LIMIT 100')
  app.get('/api/essays',auth,(q,r)=>r.json({items:list(q.userId),scores:db.prepare('SELECT essay_id,total,max,created_at FROM essay_gradings WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(q.userId)}))
  const createEssay=safe((q,r)=>r.json(store.create(q.userId,q.body||{})))
  app.post('/api/essays',auth,createEssay)
  app.get('/api/essays/:id',auth,safe((q,r)=>{
    const id=Number(q.params.id)
    r.json({...store.get(q.userId,id),images:images(q.userId,id).map(({id,role,position})=>({id,role,position})),
      rubric,gradings:readGrade.all(q.userId,id).map(g=>({...g,result:JSON.parse(g.result),rubric:getRubric(g.rubric_version)||null})),
      jobs:db.prepare("SELECT id,status,error,kind FROM jobs WHERE user_id=? AND ref_id=? AND kind IN ('essay_ocr','essay_grade') ORDER BY id DESC LIMIT 12").all(q.userId,id)})
  }))
  const uploadEssayImage=safe(async(q,r)=>{
    const id=Number(q.params.id),user=q.userId,b=q.body||{},key=user+':'+id
    const e=store.get(user,id)
    if(activeImage(user,id))problem('图片正在保存，请稍后重试',409)
    if(!['material','answer'].includes(b.role)||!Number.isInteger(b.position)||b.position<0||b.position>=20)problem('图片类型或序号无效',400)
    const parsed=parseImageInput(b)
    if(parsed.error)problem(parsed.error,400)
    const buffer=Buffer.from(parsed.b64,'base64'),hash=digest(buffer)
    const existing=images(user,id).find(im=>im.role===b.role&&im.position===b.position)
    if(existing){if(existing.hash!==hash)problem('该位置已有其他图片',409);return r.json({id:existing.id})}
    if(e.revision||db.prepare("SELECT id FROM jobs WHERE user_id=? AND ref_id=? AND kind='essay_ocr'").get(user,id))problem('OCR或校对开始后不能追加图片',409)
    imageLocks.add(key)
    try{
      const m=await saveImageFile(user,'essay-'+id,buffer,parsed.mime)
      const row=db.prepare('INSERT INTO essay_images(user_id,essay_id,role,position,hash,file_path,mime) VALUES(?,?,?,?,?,?,?)').run(user,id,b.role,b.position,hash,m.file_path,parsed.mime)
      r.json({id:Number(row.lastInsertRowid)})
    }finally{imageLocks.delete(key)}
  })
  app.get('/api/essays/:id/images/:image',auth,safe((q,r)=>{
    const im=db.prepare('SELECT file_path,mime FROM essay_images WHERE user_id=? AND essay_id=? AND id=?').get(q.userId,Number(q.params.id),Number(q.params.image))
    if(!im)problem('图片不存在',404)
    r.type(im.mime).sendFile(getImageAbsPath(im.file_path))
  }))
  const queueEssayOcr=safe((q,r)=>{
    const id=Number(q.params.id),e=store.get(q.userId,id)
    if(e.revision||activeImage(q.userId,id)||!images(q.userId,id).length)problem('请在校对前完成图片上传',409)
    const j=jobStore.enqueue(q.userId,'essay_ocr',id,String(id))
    r.json({id:j.id,status:j.status})
  })
  app.post('/api/essays/:id/images',auth,uploadEssayImage)
  // 与网页相同的突发限额，避免令牌绕过 OCR 入队限流。
  app.post('/api/essays/:id/ocr',auth,limit,queueEssayOcr)
  app.post('/api/essays/:id/confirm',auth,safe((q,r)=>{
    if(activeImage(q.userId,Number(q.params.id)))problem('请等待图片保存',409)
    r.json(store.confirm(q.userId,Number(q.params.id),q.body||{}))
  }))
  app.post('/api/essays/:id/package',auth,safe((q,r)=>r.json(store.bundle(q.userId,Number(q.params.id)))))
  app.post('/api/essays/:id/preview',auth,safe((q,r)=>r.json(store.preview(q.userId,Number(q.params.id),q.body))))
  app.post('/api/essays/:id/gradings',auth,safe((q,r)=>{
    const grader=['chatgpt','claude'].includes(q.body?.grader)?q.body.grader:'manual-import'
    r.json(store.submit(q.userId,Number(q.params.id),q.body,grader))
  }))
  app.post('/api/essays/:id/grade',auth,limit,safe((q,r)=>{
    const e=store.ready(q.userId,Number(q.params.id))
    if(!/^[a-zA-Z0-9-]{8,80}$/.test(q.body?.key||''))problem('缺少请求标识',400)
    const key=e.id+':'+e.revision+':'+q.body.key
    const existing=db.prepare("SELECT id,status FROM jobs WHERE user_id=? AND kind='essay_grade' AND dedupe_key=?").get(q.userId,key)
    if(existing)return r.json(existing)
    const j=jobStore.enqueue(q.userId,'essay_grade',e.id,key,{bundle:store.bundle(q.userId,e.id)})
    r.json({id:j.id,status:j.status})
  }))
  app.get('/api/tokens',auth,(q,r)=>r.json({items:db.prepare('SELECT id,name,scopes,created_at,last_used_at,revoked_at FROM api_tokens WHERE user_id=? ORDER BY id DESC').all(q.userId)}))
  app.post('/api/tokens',auth,limit,safe((q,r)=>{
    const scopes=q.body?.scopes
    if(!Array.isArray(scopes)||!scopes.length||scopes.some(s=>!validScopes.includes(s)))problem('请选择有效权限',400)
    const raw='lp_'+randomBytes(32).toString('hex')
    const t=db.prepare('INSERT INTO api_tokens(user_id,name,token_hash,scopes,created_at) VALUES(?,?,?,?,?)')
      .run(q.userId,String(q.body.name||'学习助手').slice(0,80),digest(raw),JSON.stringify(scopes),Date.now())
    r.set('Cache-Control','no-store').json({id:Number(t.lastInsertRowid),token:raw})
  }))
  app.delete('/api/tokens/:id',auth,(q,r)=>{
    const t=db.prepare('UPDATE api_tokens SET revoked_at=? WHERE user_id=? AND id=?').run(Date.now(),q.userId,Number(q.params.id))
    r.status(t.changes?200:404).json(t.changes?{ok:true}:{error:'令牌不存在'})
  })
  app.get('/api/agent/rubric',tokenAuth('essays:read'),agentLimit,safe((q,r)=>{
    const selected=getRubric(q.query.version)
    if(!selected)problem('未知量表版本',404)
    r.json(selected)
  }))
  app.get('/api/agent/essays',tokenAuth('essays:read'),agentLimit,(q,r)=>{
    const status=q.query.status==='ungraded'?['transcribed']:['transcribed','graded']
    r.json({items:list(q.userId).filter(e=>status.includes(e.status))})
  })
  app.get('/api/agent/essays/:id',tokenAuth('essays:read'),agentLimit,safe((q,r)=>r.set('Cache-Control','no-store').json(store.bundle(q.userId,Number(q.params.id)))))
  app.post('/api/agent/essays/:id/gradings',tokenAuth('essays:write'),agentLimit,safe((q,r)=>{
    const grader=['codex','claude'].includes(q.body?.grader)?q.body.grader:'agent'
    r.json(store.submit(q.userId,Number(q.params.id),q.body,grader))
  }))
  app.get('/api/agent/questions',tokenAuth('questions:read'),agentLimit,(q,r)=>r.json({items:listQuestions(q.userId,{untidy:q.query.untidy==='1',kp:String(q.query.kp||''),limit:100})}))
  // 令牌只多一层 scope 和代理限流，处理函数与网页相同，归属仍按 user_id。
  app.post('/api/agent/essays',tokenAuth('essays:create'),agentLimit,createEssay)
  app.post('/api/agent/essays/:id/images',tokenAuth('essays:create'),agentLimit,uploadEssayImage)
  app.post('/api/agent/essays/:id/ocr',tokenAuth('essays:create'),agentLimit,limit,queueEssayOcr)
  app.post('/api/agent/questions',tokenAuth('questions:write'),agentLimit,createQuestionHttp)
  app.patch('/api/agent/questions/:id',tokenAuth('questions:write'),agentLimit,updateQuestionHttp)
  app.post('/api/agent/questions/:id/images',tokenAuth('questions:write'),agentLimit,addQuestionImageHttp)
}
