// 持久化队列；数据库注入便于用真实 SQLite 测试重启与并发领取。
export function createJobStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT NOT NULL, ref_id INTEGER NOT NULL,
      dedupe_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
      error TEXT NOT NULL DEFAULT '', payload TEXT NOT NULL DEFAULT '{}', result TEXT NOT NULL DEFAULT '{}',
      next_run_at INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      UNIQUE(user_id,kind,dedupe_key), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS jobs_ready ON jobs(status,next_run_at);
    CREATE TABLE IF NOT EXISTS daily_usage (
      user_id INTEGER NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(user_id,day,kind), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `)
  const decode = r => r ? { ...r, payload: JSON.parse(r.payload), result: JSON.parse(r.result) } : null
  const get = (user, id) => decode(db.prepare('SELECT * FROM jobs WHERE user_id=? AND id=?').get(user,id))
  return {
    get,
    enqueue(user,kind,ref,key,payload={}) {
      const now=Date.now()
      db.prepare('INSERT OR IGNORE INTO jobs(user_id,kind,ref_id,dedupe_key,payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
        .run(user,kind,ref,key,JSON.stringify(payload),now,now)
      return decode(db.prepare('SELECT * FROM jobs WHERE user_id=? AND kind=? AND dedupe_key=?').get(user,kind,key))
    },
    recover() { db.prepare("UPDATE jobs SET status='queued',updated_at=? WHERE status='running'").run(Date.now()) },
    claim(kind) {
      const r=db.prepare("SELECT * FROM jobs WHERE kind=? AND status='queued' AND next_run_at<=? ORDER BY id LIMIT 1").get(kind,Date.now())
      if(!r) return null
      const changed=db.prepare("UPDATE jobs SET status='running',attempts=attempts+1,updated_at=? WHERE id=? AND user_id=? AND status='queued'")
        .run(Date.now(),r.id,r.user_id)
      return changed.changes ? get(r.user_id,r.id) : null
    },
    checkpoint(j,result) {
      db.prepare('UPDATE jobs SET result=?,updated_at=? WHERE user_id=? AND id=?').run(JSON.stringify(result),Date.now(),j.user_id,j.id)
    },
    done(j,result) {
      db.prepare("UPDATE jobs SET status='done',result=?,error='',updated_at=? WHERE user_id=? AND id=?")
        .run(JSON.stringify(result),Date.now(),j.user_id,j.id)
    },
    fail(j,error,retryable) {
      const retry=retryable && j.attempts<3
      db.prepare('UPDATE jobs SET status=?,error=?,next_run_at=?,updated_at=? WHERE user_id=? AND id=?')
        .run(retry?'queued':'failed',String(error).slice(0,400),Date.now()+1000*2**j.attempts,Date.now(),j.user_id,j.id)
      return retry
    },
    retry(user,id) {
      db.prepare("UPDATE jobs SET status='queued',attempts=0,error='',next_run_at=0,updated_at=? WHERE user_id=? AND id=? AND status='failed'")
        .run(Date.now(),user,id)
      return get(user,id)
    },
    consume(user,kind,max) {
      const day=new Date(Date.now()+8*3600000).toISOString().slice(0,10)
      db.prepare('INSERT OR IGNORE INTO daily_usage(user_id,day,kind) VALUES(?,?,?)').run(user,day,kind)
      const r=db.prepare('UPDATE daily_usage SET calls=calls+1 WHERE user_id=? AND day=? AND kind=? AND calls<?').run(user,day,kind,max)
      if(!r.changes) throw Object.assign(new Error('今日调用额度已用完，请明天重试'),{retryable:false})
    },
  }
}
