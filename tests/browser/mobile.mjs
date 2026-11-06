import {chromium} from 'playwright-core'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
const root=await fs.mkdtemp(path.join(os.tmpdir(),'learnplat-browser-'))
Object.assign(process.env,{NODE_ENV:'test',JWT_SECRET:'browser-test-only',OCR_MOCK:'1',LEARNPLAT_DATA_DIR:path.join(root,'data'),LEARNPLAT_UPLOAD_DIR:path.join(root,'uploads')})
const {default:app}=await import('../../server/index.js')
const {startJobs}=await import('../../server/jobs.js')
const {default:db}=await import('../../server/db.js')
const server=app.listen(0,'127.0.0.1')
await new Promise(r=>server.once('listening',r))
const base='http://127.0.0.1:'+server.address().port
const stop=startJobs()
let browser
try {
browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE||undefined,args:['--no-sandbox']})
const context=await browser.newContext({viewport:{width:375,height:812},permissions:['clipboard-read','clipboard-write']})
let page=await context.newPage();page.setDefaultTimeout(20000)
const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message))

const user='mobile'+Date.now()
const reg=await page.request.post(base+'/api/auth/register',{data:{username:user,password:'test-fixture-123'}})
assert.ok(reg.ok())
await page.goto(base)
await page.locator('input[name=username]').fill(user);await page.locator('input[name=password]').fill('test-fixture-123')
await page.locator('#auth-submit').click()
await page.getByRole('link',{name:'批量上传',exact:true}).click()
const files=await page.evaluate(()=>{
  return Array.from({length:30},(_,i)=>{
    const c=document.createElement('canvas');c.width=640;c.height=480
    const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,640,480)
    ctx.fillStyle='black';ctx.font='32px sans-serif';ctx.fillText('Practice '+(i+1),40,90)
    return c.toDataURL('image/jpeg').split(',')[1]
  })
})
await page.locator('input[type=file]').setInputFiles(files.map((b,i)=>({name:i+'.jpg',mimeType:'image/jpeg',buffer:Buffer.from(b,'base64')})))
await page.getByText('共 30 题，预计 OCR 30 次',{exact:false}).waitFor()
const started=Date.now()
await page.getByRole('button',{name:'上传 / 继续失败项'}).click()
await page.waitForFunction(()=>[...document.querySelectorAll('.batch-grid .card p')].filter(p=>p.textContent.includes('已上传并入队')).length===30,{},{timeout:60000})
console.log('30张浏览器上传耗时(ms)',Date.now()-started)
await page.close();page=await context.newPage();page.setDefaultTimeout(20000)
await page.goto(base+'/#/review-ocr')
await page.waitForFunction(()=>document.querySelectorAll('#view select option').length===30 && [...document.querySelectorAll('#view select option')].every(o=>o.textContent.includes('done')),{},{timeout:30000})
await page.locator('#view textarea').fill('已校对的题干 x+1=2');await page.locator('#view textarea').press('Control+Enter')
await page.waitForFunction(()=>document.querySelectorAll('#view select option').length===29)
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
console.log('关闭、重开页面、30题后台完成、快捷保存、375px校对页通过')
await page.goto(base+'/#/essays/new')
await page.getByLabel('题目来源').fill('浏览器测试')
await page.getByRole('button',{name:'保存并录入正文'}).click()
await page.getByLabel('校对稿（可直接手动填写）').fill('协作需要分工。')
await page.getByRole('button',{name:'确认校对稿',exact:true}).click()
const downloadPromise=page.waitForEvent('download')
await page.getByRole('button',{name:'下载批改材料'}).click()
const dl=await downloadPromise
const bundle=JSON.parse(await fs.readFile(await dl.path(),'utf8'))
const result={...bundle.response_template,result:{rubric_version:bundle.rubric_version,total:19,max:35,band:'三类卷',
 dimensions:Object.entries(bundle.rubric.essay.dimensions).map(([name,max],i)=>({name,max,score:[5,6,4,4][i],comment:'测试'})),
 issues:[{quote:'协作',kind:'结构',problem:'未定义',fix:'说明分工'}],thesis:'用例',structure:'用例',rewrite_sample:'练习。',next_focus:['举例']}}
await page.getByPlaceholder('在这里粘贴模型返回的完整 JSON').fill(JSON.stringify(result))
await page.getByRole('button',{name:'校验并预览'}).click()
await page.getByRole('button',{name:'确认保存这份批改'}).click()
await page.locator('.essay-reports .essay-report').waitFor()
await page.locator('.essay-reports').getByRole('button',{name:'结构 · 协作'}).click()
assert.equal(await page.locator('.essay-reports mark').textContent(),'协作')
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
assert.deepEqual(errors,[])
console.log('375px作文手动录入、下载材料、JSON预览与保存、引用高亮通过')
} finally {
  await browser?.close();stop();await new Promise(r=>server.close(r));db.close()
  await fs.rm(root,{recursive:true,force:true})
}
