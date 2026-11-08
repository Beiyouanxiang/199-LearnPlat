import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
const root=await fs.mkdtemp(path.join(os.tmpdir(),'learnplat-agent-scope-'))
Object.assign(process.env,{NODE_ENV:'test',LEARNPLAT_DATA_DIR:path.join(root,'data'),LEARNPLAT_UPLOAD_DIR:path.join(root,'uploads'),
  JWT_SECRET:'agent-scope-test-only',OCR_MOCK:'1',RATE_MAX_TUTOR:'100'})
const {default:app}=await import('../server/index.js')
const {default:db,createUser}=await import('../server/db.js')
const {signToken}=await import('../server/auth.js')
const {startJobs}=await import('../server/jobs.js')
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r))
const stop=startJobs(),base='http://127.0.0.1:'+server.address().port
const user=createUser('owner','test'),other=createUser('stranger','test')
const jwt=signToken({userId:user.id}),otherJwt=signToken({userId:other.id})
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8//8/AwMDEwMDAwMDAwAkBgMB/DXemwAAAABJRU5ErkJggg=='
async function api(url,body,token=jwt,method=body===undefined?'GET':'POST') {
  const r=await fetch(base+url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)})
  const text=await r.text()
  return {status:r.status,data:text?JSON.parse(text):null}
}
async function token(scopes,auth=jwt) {
  const created=await api('/api/tokens',{name:'agent',scopes},auth)
  assert.equal(created.status,200,JSON.stringify(created.data))
  return created.data.token
}
test('essays:create 可建作文、上传并识别，缺权限与跨用户被拒绝',async()=>{
  const create=await token(['essays:create'])
  const reader=await token(['essays:read','essays:write'])
  const stranger=await token(['essays:create'],otherJwt)
  assert.equal((await api('/api/agent/essays',{kind:'essay'},reader)).status,403)
  assert.equal((await api('/api/essays',{kind:'essay'},create)).status,401)
  const essay=(await api('/api/agent/essays',{kind:'argument',source:'练习',year:'2026',prompt_text:'材料'},create)).data
  assert.equal(essay.user_id,user.id)
  assert.equal(essay.kind,'argument')
  const image=await api('/api/agent/essays/'+essay.id+'/images',{role:'answer',position:0,image:png},create)
  assert.equal(image.status,200)
  assert.equal(typeof image.data.id,'number')
  assert.equal((await api('/api/agent/essays/'+essay.id+'/images',{role:'answer',position:0,image:png},stranger)).status,404)
  assert.equal((await api('/api/agent/essays/'+essay.id+'/ocr',{},stranger)).status,404)
  const job=await api('/api/agent/essays/'+essay.id+'/ocr',{},create)
  assert.equal(job.status,200)
  assert.equal(typeof job.data.id,'number')
  let text=''
  for(let i=0;i<50;i++){
    text=(await api('/api/essays/'+essay.id)).data.ocr_text||''
    if(text.includes('模拟识别'))break
    await new Promise(r=>setTimeout(r,100))
  }
  assert.match(text,/模拟识别/)
  assert.equal((await api('/api/essays',undefined,otherJwt)).data.items.some(e=>e.id===essay.id),false)
})
test('questions:write 可创建、修改和补图，缺权限与跨用户被拒绝',async()=>{
  const writer=await token(['questions:write'])
  const reader=await token(['questions:read'])
  const otherReader=await token(['questions:read'],otherJwt)
  const stranger=await token(['questions:write'],otherJwt)
  assert.equal((await api('/api/agent/questions',{stem:'越权'},reader)).status,403)
  assert.equal((await api('/api/questions',{stem:'网页令牌'},writer)).status,401)
  const created=await api('/api/agent/questions',{subject:'math',stem:'求 $x+1=2$',user_answer:'x=0',correct_answer:'x=1',images:[png]},writer)
  assert.equal(created.status,200)
  assert.equal(created.data.user_id,user.id)
  assert.equal(created.data.stem,'求 $x+1=2$')
  assert.equal(created.data.images.length,1)
  const patched=await api('/api/agent/questions/'+created.data.id,{stem:'校对后的题干',error_reason:'计算错误'},writer,'PATCH')
  assert.equal(patched.status,200)
  assert.equal(patched.data.stem,'校对后的题干')
  assert.equal(patched.data.error_reason,'计算错误')
  const added=await api('/api/agent/questions/'+created.data.id+'/images',{image:png},writer)
  assert.equal(added.status,200)
  assert.equal(typeof added.data.id,'number')
  assert.equal((await api('/api/questions/'+created.data.id)).data.images.length,2)
  assert.equal((await api('/api/agent/questions/'+created.data.id,{stem:'别人的修改'},stranger,'PATCH')).status,404)
  assert.equal((await api('/api/agent/questions/'+created.data.id+'/images',{image:png},stranger)).status,404)
  assert.equal((await api('/api/agent/questions?untidy=0',undefined,otherReader)).data.items.some(q=>q.id===created.data.id),false)
  const web=await api('/api/questions',{stem:'仍走登录'})
  assert.equal(web.status,200)
  assert.equal(web.data.user_id,user.id)
})
function grading(bundle) {
  return {...bundle.response_template,result:{rubric_version:bundle.rubric_version,total:19,max:35,band:'三类卷',
    dimensions:Object.entries(bundle.rubric.essay.dimensions).map(([name,max],i)=>({name,max,score:[5,6,4,4][i],comment:'训练样例'})),
    thesis:'观点明确',structure:'先写协作再写边界',issues:[
      {quote:'协作',kind:'结构',problem:'概念未展开',fix:'说明谁和谁协作'}],
    rewrite_sample:'协作需要明确共同目标。',next_focus:['补一个限制条件']}}
}
test('未确认作文可读草稿并确认，过期 revision 冲突，随后能提交批改',async()=>{
  const agent=await token(['essays:create','essays:read','essays:write'])
  const onlyRead=await token(['essays:read'])
  const stranger=await token(['essays:create','essays:write'],otherJwt)
  const created=await api('/api/agent/essays',{kind:'essay',source:'练习',year:'2026'},agent)
  assert.equal(created.status,200)
  const id=created.data.id
  assert.equal((await api('/api/agent/essays/'+id+'/images',{role:'answer',position:0,image:png},agent)).status,200)
  assert.equal((await api('/api/agent/essays/'+id+'/ocr',{},agent)).status,200)
  assert.equal((await api('/api/agent/essays/'+id,undefined,onlyRead)).status,409)
  assert.equal((await api('/api/agent/essays/'+id,undefined,onlyRead)).data.error,'请先确认转写文本')
  assert.equal((await api('/api/agent/essays/'+id+'/draft',undefined,onlyRead)).status,403)
  assert.equal((await api('/api/agent/essays/'+id+'/confirm',{revision:0,transcript:'协作需要分工。'},onlyRead)).status,403)
  assert.equal((await api('/api/agent/essays/'+id+'/draft',undefined,stranger)).status,404)
  assert.equal((await api('/api/agent/essays/'+id+'/confirm',{revision:0,transcript:'协作需要分工。'},stranger)).status,404)
  let draft
  for(let i=0;i<50;i++){
    draft=await api('/api/agent/essays/'+id+'/draft',undefined,agent)
    if(draft.data.ocr_text?.includes('模拟识别'))break
    await new Promise(r=>setTimeout(r,100))
  }
  assert.equal(draft.status,200)
  assert.equal(draft.data.revision,0)
  assert.equal(draft.data.status,'uploaded')
  assert.match(draft.data.ocr_text,/模拟识别/)
  assert.deepEqual(draft.data.images.map(im=>({role:im.role,position:im.position})),[{role:'answer',position:0}])
  const confirmed=await api('/api/agent/essays/'+id+'/confirm',{revision:0,transcript:'协作需要分工。',prompt_text:'题目材料'},agent)
  assert.equal(confirmed.status,200)
  assert.equal(confirmed.data.revision,1)
  assert.equal(confirmed.data.status,'transcribed')
  assert.equal(confirmed.data.transcript,'协作需要分工。')
  const conflict=await api('/api/agent/essays/'+id+'/confirm',{revision:0,transcript:'过期稿'},agent)
  assert.equal(conflict.status,409)
  assert.equal(conflict.data.error,'已有新版本，请刷新')
  const web=await api('/api/essays/'+id+'/confirm',{revision:0,transcript:'网页也拒绝过期稿'})
  assert.equal(web.status,409)
  assert.equal(web.data.error,conflict.data.error)
  assert.equal((await api('/api/essays/'+id)).data.transcript,'协作需要分工。')
  const bundle=await api('/api/agent/essays/'+id,undefined,agent)
  assert.equal(bundle.status,200)
  assert.match(bundle.data.request_id,/^[0-9a-f-]{36}$/)
  assert.equal(bundle.data.request_id,bundle.data.response_template.request_id)
  assert.equal(bundle.data.transcript_revision,1)
  const saved=await api('/api/agent/essays/'+id+'/gradings',grading(bundle.data),agent)
  assert.equal(saved.status,200)
  assert.equal(typeof saved.data.id,'number')
  assert.equal((await api('/api/essays/'+id)).data.gradings[0].grader,'agent')
})
test('essays:write 也能读草稿并确认，questions:read 不能',async()=>{
  const essay=(await api('/api/essays',{kind:'essay'})).data
  const writer=await token(['essays:write'])
  const reader=await token(['questions:read'])
  const draft=await api('/api/agent/essays/'+essay.id+'/draft',undefined,writer)
  assert.equal(draft.status,200)
  assert.equal(draft.data.revision,0)
  assert.equal((await api('/api/agent/essays/'+essay.id+'/draft',undefined,reader)).status,403)
  const confirmed=await api('/api/agent/essays/'+essay.id+'/confirm',{revision:0,transcript:'只回写权限也可以确认。'},writer)
  assert.equal(confirmed.status,200)
  assert.equal(confirmed.data.revision,1)
  assert.equal((await api('/api/agent/essays/'+essay.id+'/confirm',{revision:1,transcript:'读者不能确认'},reader)).status,403)
})
test('纯文本代理流程不上传图片也能确认并提交批改',async()=>{
  const agent=await token(['essays:create','essays:read','essays:write'])
  const created=await api('/api/agent/essays',{kind:'essay',source:'练习',year:'2026'},agent)
  assert.equal(created.status,200)
  const id=created.data.id
  assert.equal(created.data.revision,0)
  const confirmed=await api('/api/agent/essays/'+id+'/confirm',{revision:0,transcript:'协作需要分工。',prompt_text:'题目材料'},agent)
  assert.equal(confirmed.status,200)
  assert.equal(confirmed.data.revision,1)
  assert.equal(confirmed.data.transcript,'协作需要分工。')
  const bundle=await api('/api/agent/essays/'+id,undefined,agent)
  assert.equal(bundle.status,200)
  assert.equal(bundle.data.request_id,bundle.data.response_template.request_id)
  const saved=await api('/api/agent/essays/'+id+'/gradings',grading(bundle.data),agent)
  assert.equal(saved.status,200)
  assert.equal(typeof saved.data.id,'number')
})
test('已有图片但未跑 OCR 时也可以直接确认',async()=>{
  const agent=await token(['essays:create','essays:write'])
  const created=await api('/api/agent/essays',{kind:'essay'},agent)
  const id=created.data.id
  assert.equal((await api('/api/agent/essays/'+id+'/images',{role:'answer',position:0,image:png},agent)).status,200)
  const jobs=db.prepare("SELECT COUNT(*) n FROM jobs WHERE user_id=? AND ref_id=? AND kind='essay_ocr'").get(user.id,id)
  assert.equal(jobs.n,0)
  const confirmed=await api('/api/agent/essays/'+id+'/confirm',{revision:0,transcript:'有图未识别，直接确认。'},agent)
  assert.equal(confirmed.status,200)
  assert.equal(confirmed.data.revision,1)
  assert.equal(confirmed.data.status,'transcribed')
})
test('未知 scope 不能签发，两个新权限互不包含',async()=>{
  assert.equal((await api('/api/tokens',{scopes:['essays:admin']})).status,400)
  const essay=await token(['essays:create'])
  const question=await token(['questions:write'])
  assert.equal((await api('/api/agent/questions',{stem:'不该能写'},essay)).status,403)
  assert.equal((await api('/api/agent/essays',{kind:'essay'},question)).status,403)
})
test.after(async()=>{stop();await new Promise(r=>server.close(r));db.close();await fs.rm(root,{recursive:true,force:true})})
