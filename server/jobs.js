import db from './db.js'
import { createJobStore } from './job-store.js'
import { availableMemoryBytes, minFreeBytes, runImageTask } from './image-work.js'

const imageKinds = new Set(['essay_ocr', 'ocr_question'])
export function imageMemoryOk() { return availableMemoryBytes() >= minFreeBytes() }
export { runImageTask }

export const jobStore=createJobStore(db)
export const handlers=new Map()
const active=new Map()
const positive=(key,fallback)=> Math.max(1,Math.min(50,Number(process.env[key])||fallback))
export function consumeCall(user,kind) {
  const key=kind==='ocr'?'DAILY_OCR_MAX':'DAILY_GRADE_MAX'
  jobStore.consume(user,kind,Math.max(0,Number(process.env[key] || (kind==='ocr'?200:50))))
}
export function modelError(result) {
  return Object.assign(new Error(result.error),{retryable:result.upstreamStatus===429 || result.upstreamStatus>=500})
}
export function startJobs() {
  // 单进程 worker；多实例部署前须改为租约领取，避免启动时重置其他进程的任务。
  jobStore.recover()
  const tick=()=>{
    for(const [kind,handler] of handlers) {
      const limit=positive(kind==='essay_grade'?'GRADE_CONCURRENCY':'OCR_CONCURRENCY',kind==='essay_grade'?1:2)
      // 所有 OCR kind 共用限额，避免题目与作文各自占满并发。
      const count=()=>kind==='essay_grade'?(active.get(kind)||0):[...active].filter(([k])=>k!=='essay_grade').reduce((a,[,v])=>a+v,0)
      while(count()<limit) {
        if (imageKinds.has(kind) && !imageMemoryOk()) {
          jobStore.postponeReady(kind, Math.max(1, Number(process.env.IMAGE_RETRY_AFTER || 30)) * 1000)
          break
        }
        const j=jobStore.claim(kind); if(!j)break
        active.set(kind,(active.get(kind)||0)+1)
        Promise.resolve().then(()=>handler(j)).then(result=>jobStore.done(j,result))
          .catch(e=>{
            if (e?.code === 'MEMORY_LOW') { jobStore.defer(j, (e.retryAfter || 30) * 1000); return }
            const retry=jobStore.fail(j,e.message,e.retryable===true); handler.onError?.(j,e,!retry)
          })
          .finally(()=>active.set(kind,(active.get(kind)||1)-1))
      }
    }
  }
  const timer=setInterval(tick,250); timer.unref(); tick()
  return ()=>clearInterval(timer)
}
export function installJobRoutes(app,auth,limit) {
  app.get('/api/jobs',auth,(req,res)=>{
    const ids=String(req.query.ids||'').split(',').map(Number).filter(Number.isSafeInteger).slice(0,100)
    let rows
    if(req.query.batch) rows=db.prepare("SELECT id FROM jobs WHERE user_id=? AND json_extract(payload,'$.batch')=? ORDER BY id DESC LIMIT 100").all(req.userId,String(req.query.batch))
    else rows=ids.map(id=>({id}))
    res.json({items:rows.map(r=>jobStore.get(req.userId,r.id)).filter(Boolean).map(({payload,...r})=>r)})
  })
  app.post('/api/jobs/:id/retry',auth,limit,(req,res)=>{
    const j=jobStore.retry(req.userId,Number(req.params.id))
    if(!j)return res.status(404).json({error:'任务不存在'})
    res.json({id:j.id,status:j.status})
  })
}
