import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {execFileSync} from 'node:child_process'

const root=await fs.mkdtemp(path.join(os.tmpdir(),'learnplat-test-'))
process.env.NODE_ENV='test'
process.env.LEARNPLAT_DATA_DIR=path.join(root,'data')
process.env.LEARNPLAT_UPLOAD_DIR=path.join(root,'uploads')
process.env.OCR_MOCK='1'
process.env.RATE_MAX='1000'
process.env.JWT_SECRET='integration-test-only'
let oldSource
try{oldSource=execFileSync('git',['show','origin/main:server/db.js'],{encoding:'utf8'})}catch{if(process.env.REQUIRE_MIGRATION==='1')throw new Error('无法读取main旧版数据库，迁移测试不可跳过')}
let fixture
if(oldSource){
  fixture=new URL('./.old-db-fixture.mjs',import.meta.url)
  oldSource=oldSource.replace(/const ROOT =[^\n]+/, 'const ROOT = '+JSON.stringify(root))
  await fs.writeFile(fixture,oldSource)
  const old=await import(fixture.href)
  old.createUser('legacy','fixture-only')
  old.createQuestion(1,{stem:'旧数据必须保留',source:'migration fixture'})
  old.default.close()
}
const {default:app}=await import('../server/index.js')
const {default:db,createUser}=await import('../server/db.js')
const {signToken}=await import('../server/auth.js')
const {startJobs}=await import('../server/jobs.js')
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r))
const stop=startJobs()
const user=createUser('integration','fixture-only'),other=createUser('other','fixture-only')
const token=signToken({userId:user.id}),otherToken=signToken({userId:other.id})
const base='http://127.0.0.1:'+server.address().port
async function api(url,body,auth=token,method=body===undefined?'GET':'POST'){
  const r=await fetch(base+url,{method,headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)})
  return {status:r.status,data:await r.json()}
}
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8//8/AwMDEwMDAwMDAwAkBgMB/DXemwAAAABJRU5ErkJggg=='
test('旧库数据保留与30题批量后台识别',async()=>{
  if(oldSource)assert.equal(db.prepare('SELECT stem FROM questions WHERE user_id=1').get().stem,'旧数据必须保留')
  const ids=[]
  for(let i=0;i<30;i++){
    const body={request_id:'test-item-'+i,batch:'test-batch-123',count:1}
    const q=await api('/api/batch/questions',body);assert.equal(q.status,200)
    assert.equal((await api('/api/batch/questions',body)).data.question_id,q.data.question_id)
    const id=q.data.question_id;ids.push(id)
    assert.equal((await api('/api/batch/questions/'+id+'/images',{position:0,image:png})).status,200)
    assert.equal((await api('/api/batch/questions/'+id+'/images',{position:0,image:png})).status,200)
    assert.equal((await api('/api/questions/'+id+'/ocr',{})).status,200)
  }
  for(let n=0;n<100;n++){
    const jobs=(await api('/api/jobs?batch=test-batch-123')).data.items
    if(jobs.length===30&&jobs.every(j=>j.status==='done'))break
    await new Promise(r=>setTimeout(r,100))
  }
  const jobs=(await api('/api/jobs?batch=test-batch-123')).data.items
  assert.equal(jobs.filter(j=>j.status==='done').length,30)
  assert.equal((await api('/api/jobs?ids='+jobs[0].id,undefined,otherToken)).data.items.length,0)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM question_images WHERE user_id=?').get(user.id).n,30)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM questions WHERE user_id=? AND review_due_at=0').get(user.id).n,30)
  assert.equal((await api('/api/batch/questions/'+ids[0]+'/confirm',{stem:'已校对',knowledge_points:[]})).status,200)
  assert.ok(db.prepare('SELECT review_due_at FROM questions WHERE user_id=? AND id=?').get(user.id,ids[0]).review_due_at>0)
  assert.equal((await api('/api/questions',{stem:'旧录入流程'})).status,200)
})
test('前台OCR与后台队列共用逐图每日额度',async()=>{
  const before=process.env.DAILY_OCR_MAX
  process.env.DAILY_OCR_MAX='1'
  try{
    assert.equal((await api('/api/ocr',{image:[png,png]},otherToken)).status,429)
    assert.equal((await api('/api/ocr',{image:png},otherToken)).status,429)
  }finally{if(before===undefined)delete process.env.DAILY_OCR_MAX;else process.env.DAILY_OCR_MAX=before}
})
test.after(async()=>{
 stop();await new Promise(r=>server.close(r));db.close()
 if(fixture)await fs.unlink(fixture)
 // 临时数据留在系统临时目录，避免测试清理路径误删。
})
