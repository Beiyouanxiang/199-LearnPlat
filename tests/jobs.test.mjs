import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { createJobStore } from '../server/job-store.js'

test('重启恢复、分用户幂等、失败重试与每日额度',()=>{
  const db=new DatabaseSync(':memory:')
  db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY);INSERT INTO users VALUES(1),(2)')
  const s=createJobStore(db),a=s.enqueue(1,'ocr_question',10,'10'),b=s.enqueue(2,'ocr_question',10,'10')
  assert.notEqual(a.id,b.id);assert.equal(s.enqueue(1,'ocr_question',10,'10').id,a.id)
  assert.equal(s.get(2,a.id),null)
  let j=s.claim('ocr_question');assert.equal(j.status,'running')
  s.checkpoint(j,{parts:['已识别首图']});s.recover()
  j=s.claim('ocr_question');assert.deepEqual(j.result.parts,['已识别首图'])
  assert.equal(j.attempts,2);s.fail(j,'429',true)
  assert.equal(s.get(1,j.id).status,'queued')
  db.prepare('UPDATE jobs SET next_run_at=0 WHERE id=?').run(j.id)
  j=s.claim('ocr_question');assert.equal(j.attempts,3)
  s.fail(j,'429',true);assert.equal(s.get(1,j.id).status,'failed')
  assert.equal(s.retry(2,j.id),null);assert.equal(s.retry(1,j.id).attempts,0)
  s.consume(1,'ocr',1);assert.throws(()=>s.consume(1,'ocr',1),/额度/)
  s.consume(2,'ocr',1)
  j=s.claim('ocr_question');s.done(j,{ok:true})
  assert.equal(s.get(1,j.id).status,'done')
  db.close()
})
test('不可重试错误立即失败，零额度不发起调用',()=>{
  const db=new DatabaseSync(':memory:')
  db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY);INSERT INTO users VALUES(1)')
  const s=createJobStore(db);s.enqueue(1,'ocr_question',1,'1')
  const j=s.claim('ocr_question')
  assert.equal(s.fail(j,'缺少密钥',false),false)
  assert.equal(s.get(1,j.id).status,'failed')
  assert.throws(()=>s.consume(1,'ocr',0),/额度/)
  db.close()
})
