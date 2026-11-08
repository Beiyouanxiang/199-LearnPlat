import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'

test('数据库首次启动与再次打开无弃用警告，目录和文件权限保留',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'learnplat-db-warning-'))
  t.after(()=>fs.rm(root,{recursive:true,force:true}))
  const env={...process.env,LEARNPLAT_DATA_DIR:path.join(root,'data'),LEARNPLAT_UPLOAD_DIR:path.join(root,'uploads')}
  const source=`const {default:db}=await import(${JSON.stringify(new URL('../server/db.js',import.meta.url).href)});db.close()`
  for(let i=0;i<2;i++){
    const {stderr}=await promisify(execFile)(process.execPath,['--trace-deprecation','--throw-deprecation','--input-type=module','-e',source],{env})
    assert.doesNotMatch(stderr,/DeprecationWarning/)
    assert.equal((await fs.stat(env.LEARNPLAT_DATA_DIR)).mode&0o777,0o700)
    assert.equal((await fs.stat(env.LEARNPLAT_UPLOAD_DIR)).mode&0o777,0o700)
    assert.equal((await fs.stat(path.join(env.LEARNPLAT_DATA_DIR,'exam199.db'))).mode&0o777,0o600)
  }
})

// 旧库没有 review_stage。升级只加列，已有 review_due_at（含 0）必须原样留下，
// 且这些题仍能列出、重做，不能因为未排期而报错。
test('升级旧库保留原有复习日期，未排期的题仍可列出并重做',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'learnplat-legacy-review-'))
  t.after(()=>fs.rm(root,{recursive:true,force:true}))
  const dataDir=path.join(root,'data')
  const uploadDir=path.join(root,'uploads')
  await fs.mkdir(dataDir,{recursive:true})
  const Database=(await import('better-sqlite3')).default
  const old=new Database(path.join(dataDir,'exam199.db'))
  old.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      subject TEXT NOT NULL DEFAULT 'math',
      question_type TEXT NOT NULL DEFAULT 'problem_solving',
      title TEXT DEFAULT '',
      stem TEXT DEFAULT '',
      stem_raw TEXT DEFAULT '',
      options TEXT DEFAULT '[]',
      correct_answer TEXT DEFAULT '',
      user_answer TEXT DEFAULT '',
      source TEXT DEFAULT '',
      knowledge_points TEXT DEFAULT '[]',
      error_reason TEXT DEFAULT '',
      error_reason_note TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      mastery TEXT DEFAULT 'unlearned',
      review_due_at INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `)
  const now=1700000000000
  old.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (1, ?, ?, ?)').run('legacy','x',now)
  const insert=old.prepare(`INSERT INTO questions
    (id, user_id, subject, question_type, title, stem, mastery, review_due_at, created_at, updated_at)
    VALUES (?, 1, 'math', 'problem_solving', '', ?, ?, ?, ?, ?)`)
  const fixtures=[
    [1,'due-zero-unlearned','unlearned',0],
    [2,'due-zero-learning','learning',0],
    [3,'due-zero-mastered','mastered',0],
    [7,'due-zero-id-mod-0','unlearned',0],
    [8,'due-kept','learning',1700000000000],
    [9,'due-one','unlearned',1],
  ]
  for(const [id,stem,mastery,due] of fixtures) insert.run(id,stem,mastery,due,now,now)
  const before=old.prepare('SELECT id, review_due_at, mastery FROM questions ORDER BY id').all()
  assert.equal(old.prepare('PRAGMA table_info(questions)').all().some(c=>c.name==='review_stage'),false)
  old.close()

  const env={...process.env,LEARNPLAT_DATA_DIR:dataDir,LEARNPLAT_UPLOAD_DIR:uploadDir}
  const script=`
    const {default:db,listQuestions,saveRedo}=await import(${JSON.stringify(new URL('../server/db.js',import.meta.url).href)})
    const rows=db.prepare('SELECT id, review_due_at, review_stage, mastery FROM questions ORDER BY id').all()
    const hasStage=db.prepare('PRAGMA table_info(questions)').all().some(c=>c.name==='review_stage')
    const listed=listQuestions(1,{limit:50})
    const reviewListed=listQuestions(1,{reviewOnly:true,orderBy:'review_due_at',limit:50})
    const redo=saveRedo(1,1,{redo_answer:'A',result:'wrong'})
    const afterRedo=db.prepare('SELECT review_due_at, review_stage, mastery FROM questions WHERE id=1').get()
    console.log(JSON.stringify({
      rows,
      hasStage,
      listed:listed.map(q=>({id:q.id,review_due_at:q.review_due_at})),
      reviewListed:reviewListed.map(q=>q.id),
      redo:{id:Number(redo.id),schedule:redo.schedule},
      afterRedo,
    }))
    db.close()
  `
  const {stdout,stderr}=await promisify(execFile)(process.execPath,['--trace-deprecation','--throw-deprecation','--input-type=module','-e',script],{env})
  assert.doesNotMatch(stderr,/DeprecationWarning/)
  const out=JSON.parse(stdout)
  assert.equal(out.hasStage,true)
  assert.deepEqual(out.rows,before.map(r=>({...r,review_stage:0})))
  assert.equal(out.listed.length,before.length)
  assert.deepEqual(out.listed.filter(q=>q.review_due_at===0).map(q=>q.id).sort((a,b)=>a-b),[1,2,3,7])
  // 未排期（0）不进今日队列；已经到期的旧日期仍能列出来，且查询本身不报错。
  assert.deepEqual(out.reviewListed.slice().sort((a,b)=>a-b),[8,9])
  assert.equal(typeof out.redo.id,'number')
  assert.equal(out.redo.schedule.stage,0)
  assert.equal(out.redo.schedule.mastery,'learning')
  assert.ok(out.redo.schedule.due>0)
  assert.equal(out.afterRedo.mastery,'learning')
  assert.equal(out.afterRedo.review_stage,0)
  assert.equal(out.afterRedo.review_due_at,out.redo.schedule.due)
  const untouched=out.rows.filter(r=>r.id!==1)
  assert.ok(untouched.every(r=>before.find(b=>b.id===r.id).review_due_at===r.review_due_at))
})
