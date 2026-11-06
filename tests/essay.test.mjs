import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {promisify} from 'node:util'
import {execFile} from 'node:child_process'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
const run=promisify(execFile)
const root=await fs.mkdtemp(path.join(os.tmpdir(),'learnplat-essay-'))
Object.assign(process.env,{NODE_ENV:'test',LEARNPLAT_DATA_DIR:path.join(root,'data'),LEARNPLAT_UPLOAD_DIR:path.join(root,'uploads'),
  JWT_SECRET:'test-only',ESSAY_MOCK:'1',OCR_MOCK:'1',RATE_MAX_TUTOR:'100'})
const {default:app}=await import('../server/index.js')
const {default:db,createUser}=await import('../server/db.js')
const {signToken}=await import('../server/auth.js')
const {startJobs}=await import('../server/jobs.js')
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r))
const stop=startJobs(),base='http://127.0.0.1:'+server.address().port
const user=createUser('writer','test'),other=createUser('another','test')
const jwt=signToken({userId:user.id}),otherJwt=signToken({userId:other.id})
async function api(path,body,token=jwt,method=body===undefined?'GET':'POST') {
  const r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)})
  return {status:r.status,data:await r.json()}
}
function answer(bundle) {
  return {...bundle.response_template,result:{rubric_version:bundle.rubric_version,total:19,max:35,band:'三类卷',
    dimensions:Object.entries(bundle.rubric.essay.dimensions).map(([name,max],i)=>({name,max,score:[5,6,4,4][i],comment:'训练样例'})),
    thesis:'观点明确',structure:'可补反例',issues:[
      {quote:'协作',kind:'结构',problem:'概念未定义',fix:'说明参与者'},
      {quote:'不存在的引文',kind:'逻辑',problem:'样例',fix:'样例'}],
    rewrite_sample:'协作需要明确共同目标。',next_focus:['给出一个反例']}}
}
test('无模型Key的手动导入、原文定位、归属及版本保护',async()=>{
  const e=(await api('/api/essays',{kind:'essay'})).data,url='/api/essays/'+e.id
  assert.equal((await api(url+'/package',{})).status,409)
  assert.equal((await api(url+'/confirm',{revision:0,transcript:'协作。协作。'})).status,200)
  const bundle=(await api(url+'/package',{})).data
  const body=answer(bundle)
  const preview=await api(url+'/preview',body)
  assert.equal(preview.status,200);assert.deepEqual(preview.data.issues[0].positions,[[0,2],[3,5]])
  assert.deepEqual(preview.data.issues[1].positions,[])
  assert.equal((await api(url+'/gradings',body,otherJwt)).status,404)
  assert.equal((await api(url+'/preview',{...body,result:{...body.result,total:35}})).status,422)
  assert.equal((await api(url+'/gradings',{...body,grader:'chatgpt'})).data.duplicate,false)
  assert.equal((await api(url+'/gradings',body)).data.duplicate,true)
  assert.equal((await api(url+'/confirm',{revision:1,transcript:'新版'})).status,200)
  assert.equal((await api(url+'/gradings',body)).status,409)
  assert.equal((await api(url)).data.gradings[0].transcript,'协作。协作。')
})
test('CLI 与真实 stdio MCP 客户端回写、scope及吊销',async()=>{
  const e=(await api('/api/essays',{kind:'essay'})).data,url='/api/essays/'+e.id
  await api(url+'/confirm',{revision:0,transcript:'协作需要分工。'})
  const t=(await api('/api/tokens',{scopes:['essays:read','essays:write']})).data
  assert.match(t.token,/^lp_[a-f0-9]{64}$/)
  const stored=db.prepare('SELECT token_hash FROM api_tokens WHERE id=?').get(t.id)
  assert.equal(stored.token_hash.length,64);assert.notEqual(stored.token_hash,t.token)
  assert.equal((await api('/api/agent/questions',undefined,t.token)).status,403)
  const env={PATH:process.env.PATH,LEARNPLAT_URL:base,LEARNPLAT_TOKEN:t.token,LEARNPLAT_GRADER:'codex'}
  const cli=fileURLToPath(new URL('../scripts/agent-cli.mjs',import.meta.url))
  assert.equal(JSON.parse((await run(process.execPath,[cli,'list'],{env})).stdout).items[0].id,e.id)
  const cliBundle=JSON.parse((await run(process.execPath,[cli,'get',String(e.id)],{env})).stdout)
  const json=path.join(root,'result.json');await fs.writeFile(json,JSON.stringify(answer(cliBundle)))
  assert.ok(JSON.parse((await run(process.execPath,[cli,'submit',String(e.id),json],{env})).stdout).id)
  const sdk=createRequire(new URL('../scripts/mcp/package.json',import.meta.url))
  const {Client}=sdk('@modelcontextprotocol/sdk/client/index.js')
  const {StdioClientTransport}=sdk('@modelcontextprotocol/sdk/client/stdio.js')
  const client=new Client({name:'learnplat-test',version:'1'})
  const entry=fileURLToPath(new URL('../scripts/mcp-server.mjs',import.meta.url))
  await client.connect(new StdioClientTransport({command:process.execPath,args:[entry],env:{...env,LEARNPLAT_GRADER:'claude'}}))
  try{
    assert.equal((await client.listTools()).tools.length,5)
    const call=async(name,args={})=>{const response=await client.callTool({name,arguments:args});assert.ok(!response.isError,response.content[0].text);return JSON.parse(response.content[0].text)}
    await call('list_ungraded_essays');const bundle=await call('get_essay',{id:e.id})
    const saved=await call('submit_grading',{id:e.id,body:answer(bundle)});assert.ok(saved.id)
    const detail=(await api(url)).data;assert.deepEqual(detail.gradings.map(x=>x.grader),['claude','codex'])
    const otherToken=(await api('/api/tokens',{scopes:['essays:read','essays:write']},otherJwt)).data.token
    assert.equal((await api('/api/agent/essays/'+e.id,undefined,otherToken)).status,404)
    assert.equal((await api('/api/agent/essays/'+e.id+'/gradings',answer(bundle),otherToken)).status,404)
    await api('/api/tokens/'+t.id,undefined,jwt,'DELETE')
    assert.equal((await api('/api/agent/essays',undefined,t.token)).status,401)
  }finally{await client.close()}
})
test('双图OCR、校对更正、可选模型模拟批改',async()=>{
  const e=(await api('/api/essays',{kind:'argument'})).data,url='/api/essays/'+e.id
  const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII='
  for(let position=0;position<2;position++)assert.equal((await api(url+'/images',{role:'answer',position,image})).status,200)
  async function completed(job){for(let i=0;i<50;i++){
    const r=(await api('/api/jobs?ids='+job.id)).data.items[0]
    if(r.status==='done')return
    assert.notEqual(r.status,'failed',r.error);await new Promise(r=>setTimeout(r,100))
  }assert.fail('任务未完成')}
  await completed((await api(url+'/ocr',{})).data)
  const draft=(await api(url)).data
  assert.ok(draft.ocr_text.includes('模拟识别'))
  assert.equal((await api(url+'/confirm',{transcript:'修改后的正文',revision:0})).status,400)
  assert.ok((await api(url+'/confirm',{transcript:'修改后的正文',prompt_text:'题目材料',revision:0})).data.ocr_edits.length)
  const job=(await api(url+'/grade',{key:'unique-grading'})).data
  await completed(job)
  assert.equal((await api(url+'/grade',{key:'unique-grading'})).data.id,job.id)
  assert.equal((await api(url)).data.gradings[0].grader,'mock')
})
test.after(async()=>{stop();await new Promise(r=>server.close(r));db.close();await fs.rm(root,{recursive:true,force:true})})
