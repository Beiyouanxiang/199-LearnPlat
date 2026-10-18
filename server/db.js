import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Jimp } from 'jimp'
import Database from 'better-sqlite3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'data')
const UPLOAD_DIR = path.join(ROOT, 'uploads')
const DB_FILE = path.join(DATA_DIR, 'exam199.db')

// ---------- 文件权限 ----------
function ensureMode(dir, file) {
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    fs.chmodSync(dir, 0o700)
    if (fs.existsSync(file)) fs.chmodSync(file, 0o600)
  } catch (err) {
    console.warn('[db] 无法设置文件权限:', err.message)
  }
}

ensureMode(DATA_DIR, DB_FILE)
ensureMode(UPLOAD_DIR, null)

const db = new Database(DB_FILE)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ---------- 初始化表结构 ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS questions (
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

  CREATE INDEX IF NOT EXISTS idx_questions_user_created
    ON questions(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_questions_user_subject
    ON questions(user_id, subject);
  CREATE INDEX IF NOT EXISTS idx_questions_user_mastery
    ON questions(user_id, mastery);
  CREATE INDEX IF NOT EXISTS idx_questions_user_review
    ON questions(user_id, review_due_at);

  CREATE TABLE IF NOT EXISTS question_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    thumbnail_path TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    rotation INTEGER DEFAULT 0,
    mime TEXT DEFAULT '',
    width INTEGER DEFAULT 0,
    height INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_qimages_question
    ON question_images(question_id, sort_order);

  CREATE TABLE IF NOT EXISTS tutor_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    request_id TEXT NOT NULL,
    provider TEXT DEFAULT '',
    model TEXT DEFAULT '',
    mode TEXT DEFAULT 'hint',
    user_prompt TEXT DEFAULT '',
    response_markdown TEXT DEFAULT '',
    images_used INTEGER DEFAULT 0,
    tokens INTEGER DEFAULT 0,
    elapsed_ms INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_tutor_question
    ON tutor_sessions(question_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS redo_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    redo_answer TEXT DEFAULT '',
    result TEXT DEFAULT 'wrong',
    duration_ms INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_redo_question
    ON redo_records(question_id, created_at DESC);

  -- FTS5 全文索引虚拟表：question_id 不索引（仅作关联），fts_text 为索引列
  -- 应用层 CJK 单字切词后写入 fts_text，查询用前缀匹配 "字"*
  CREATE VIRTUAL TABLE IF NOT EXISTS questions_fts USING fts5(
    question_id UNINDEXED,
    fts_text
  );
`)

// ---------- 迁移：冲刺版新增列与表 ----------
function addColumnIfMissing(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`)
}
// review_stage：连续答对的间隔复习阶段，答错归零
addColumnIfMissing('questions', 'review_stage', 'INTEGER DEFAULT 0')
// detail：条件充分性分步作答等结构化信息（JSON）
addColumnIfMissing('redo_records', 'detail', "TEXT DEFAULT ''")

db.exec(`
  CREATE TABLE IF NOT EXISTS card_reviews (
    user_id INTEGER NOT NULL,
    card_key TEXT NOT NULL,
    stage INTEGER DEFAULT 0,
    due_at INTEGER DEFAULT 0,
    last_grade TEXT DEFAULT '',
    reviewed_at INTEGER DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, card_key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`)

ensureMode(DATA_DIR, DB_FILE)

// ---------- 间隔复习 ----------
// 复习日按北京时间 0 点切日：到期时间取目标日的 0 点，"今天到期"即 due_at <= now。
const DAY_MS = 86400000
const TZ_OFFSET_MS = 8 * 3600000
// 第 n 次连续答对后，下次复习间隔（天）
const INTERVALS = [1, 2, 4, 7, 15, 30]
// 连续答对达到此阶段视为"已掌握"
const MASTERED_STAGE = 3

export function dayStartAfter(days, now = Date.now()) {
  const todayStart = Math.floor((now + TZ_OFFSET_MS) / DAY_MS) * DAY_MS - TZ_OFFSET_MS
  return todayStart + days * DAY_MS
}

// 根据作答结果计算下一阶段；result: correct | wrong | partial
function nextSchedule(stage, result) {
  if (result === 'correct') {
    const next = stage + 1
    return {
      stage: next,
      due: dayStartAfter(INTERVALS[Math.min(stage, INTERVALS.length - 1)]),
      mastery: next >= MASTERED_STAGE ? 'mastered' : 'learning',
    }
  }
  // 答错或无法判定：明天再来
  return { stage: 0, due: dayStartAfter(1), mastery: 'learning' }
}

// ---------- 工具：JSON 安全解析 ----------
export function safeParseJson(str, fallback) {
  try {
    return JSON.parse(str || '[]')
  } catch {
    return fallback
  }
}

// ---------- CJK 全文索引（复用 Bookmark-Page 经验）----------
// unicode61 对中文不分词，应用层拆成：英文按词 + 中文每字 + 空格分隔
function tokenizeForFts(text) {
  if (!text) return ''
  const parts = []
  // 英文/数字 连续块
  const ascii = text.match(/[A-Za-z0-9]+/g) || []
  parts.push(...ascii)
  // 中文字符逐字
  const cjk = text.match(/[\u4e00-\u9fff]/g) || []
  parts.push(...cjk)
  return parts.join(' ')
}

function buildFtsText(question) {
  const segs = [
    question.title || '',
    question.stem || '',
    (question.knowledge_points || []).join(' '),
    (question.tags || []).join(' '),
    question.source || '',
  ]
  return tokenizeForFts(segs.join(' '))
}

// FTS5 虚拟表不支持 ON CONFLICT，用事务先删后插保证幂等
const upsertFts = db.transaction((questionId, question) => {
  const ftsText = buildFtsText(question)
  db.prepare('DELETE FROM questions_fts WHERE question_id = ?').run(questionId)
  db.prepare('INSERT INTO questions_fts (question_id, fts_text) VALUES (?, ?)').run(questionId, ftsText)
})

function deleteFts(questionId) {
  db.prepare('DELETE FROM questions_fts WHERE question_id = ?').run(questionId)
}

// ---------- 迁移：旧 questions_fts 普通表 -> FTS5 虚拟表 ----------
// 早期版本误用 CREATE TABLE 建的 questions_fts 无法用 MATCH（报 "unable to use function
// MATCH in the requested context"），需 DROP 重建为 FTS5 虚拟表并 backfill 现有题目。
;(function migrateFts() {
  const meta = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='questions_fts'")
    .get()
  if (!meta) return // 表不存在（不应发生，建表已跑）
  if (/CREATE VIRTUAL TABLE/i.test(meta.sql)) return // 已是 FTS5 虚拟表，无需迁移
  console.warn('[db] 迁移：重建 questions_fts 为 FTS5 虚拟表...')
  db.exec('DROP TABLE IF EXISTS questions_fts')
  db.exec(
    'CREATE VIRTUAL TABLE IF NOT EXISTS questions_fts USING fts5(question_id UNINDEXED, fts_text)'
  )
  // 用题目原始字段重新 buildFtsText（比旧索引更准确）
  const questions = db
    .prepare('SELECT id, title, stem, knowledge_points, tags, source FROM questions')
    .all()
  const insertFts = db.prepare('INSERT INTO questions_fts (question_id, fts_text) VALUES (?, ?)')
  const tx = db.transaction((qs) => {
    for (const q of qs) insertFts.run(q.id, buildFtsText(q))
  })
  tx(questions)
  console.log(`[db] FTS 迁移完成，重建 ${questions.length} 条索引`)
})()

// ---------- 缩略图 ----------
async function makeThumbnail(srcPath, destPath, maxSide = 240) {
  try {
    const image = await Jimp.read(srcPath)
    if (image.bitmap.width > maxSide || image.bitmap.height > maxSide) {
      image.scaleToFit({ w: maxSide, h: maxSide })
    }
    await image.write(destPath, 'image/jpeg')
    return true
  } catch (err) {
    console.warn('[db] thumbnail failed:', err.message)
    return false
  }
}

// ---------- 图片文件存储 ----------
// 返回相对 uploads 的路径，用于数据库与 URL
function relPath(absPath) {
  return path.relative(UPLOAD_DIR, absPath).replace(/\\/g, '/')
}

export async function saveImageFile(userId, questionId, buffer, mime, ext) {
  const dir = path.join(UPLOAD_DIR, String(userId), String(questionId))
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const base = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const ext2 = ext || (mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg')
  const absImg = path.join(dir, `${base}.${ext2}`)
  const absThumb = path.join(dir, `${base}_thumb.jpg`)
  fs.writeFileSync(absImg, buffer, { mode: 0o600 })
  await makeThumbnail(absImg, absThumb)
  let width = 0
  let height = 0
  try {
    const img = await Jimp.read(absImg)
    width = img.bitmap.width
    height = img.bitmap.height
  } catch {}
  return {
    file_path: relPath(absImg),
    thumbnail_path: relPath(absThumb),
    mime: mime || 'image/jpeg',
    width,
    height,
  }
}

export function getImageAbsPath(rel) {
  if (!rel) return ''
  return path.join(UPLOAD_DIR, rel)
}

export function deleteQuestionImages(userId, questionId) {
  const dir = path.join(UPLOAD_DIR, String(userId), String(questionId))
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch (err) {
    console.warn('[db] delete images dir failed:', err.message)
  }
}

// ---------- 用户 ----------
export function createUser(username, passwordHash) {
  const now = Date.now()
  const info = db
    .prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
    .run(username, passwordHash, now)
  return { id: info.lastInsertRowid, username, created_at: now }
}

export function findUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username)
}

export function findUserById(id) {
  return db.prepare('SELECT id, username, created_at FROM users WHERE id = ?').get(id)
}

// ---------- 题目 ----------
// row -> 面向 API 的对象（解析 JSON 字段）
function rowToQuestion(r) {
  if (!r) return null
  return {
    id: r.id,
    user_id: r.user_id,
    subject: r.subject,
    question_type: r.question_type,
    title: r.title,
    stem: r.stem,
    stem_raw: r.stem_raw,
    options: safeParseJson(r.options, []),
    correct_answer: r.correct_answer,
    user_answer: r.user_answer,
    source: r.source,
    knowledge_points: safeParseJson(r.knowledge_points, []),
    error_reason: r.error_reason,
    error_reason_note: r.error_reason_note,
    tags: safeParseJson(r.tags, []),
    mastery: r.mastery,
    review_due_at: r.review_due_at,
    review_stage: r.review_stage || 0,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }
}

export function createQuestion(userId, data) {
  const now = Date.now()
  const info = db
    .prepare(
      `INSERT INTO questions
        (user_id, subject, question_type, title, stem, stem_raw, options,
         correct_answer, user_answer, source, knowledge_points,
         error_reason, error_reason_note, tags, mastery, review_due_at,
         created_at, updated_at)
       VALUES (@user_id, @subject, @question_type, @title, @stem, @stem_raw, @options,
         @correct_answer, @user_answer, @source, @knowledge_points,
         @error_reason, @error_reason_note, @tags, @mastery, @review_due_at,
         @created_at, @updated_at)`
    )
    .run({
      user_id: userId,
      subject: data.subject || 'math',
      question_type: data.question_type || 'problem_solving',
      title: data.title || '',
      stem: data.stem || '',
      stem_raw: data.stem_raw || '',
      options: JSON.stringify(data.options || []),
      correct_answer: data.correct_answer || '',
      user_answer: data.user_answer || '',
      source: data.source || '',
      knowledge_points: JSON.stringify(data.knowledge_points || []),
      error_reason: data.error_reason || '',
      error_reason_note: data.error_reason_note || '',
      tags: JSON.stringify(data.tags || []),
      mastery: data.mastery || 'unlearned',
      // 新题默认明天进入复习队列；导入时沿用原值
      review_due_at: data.review_due_at ?? dayStartAfter(1),
      created_at: now,
      updated_at: now,
    })

  const id = info.lastInsertRowid
  upsertFts(id, data)
  return getQuestion(userId, id)
}

export function getQuestion(userId, id) {
  const row = db
    .prepare('SELECT * FROM questions WHERE user_id = ? AND id = ?')
    .get(userId, id)
  return rowToQuestion(row)
}

export function updateQuestion(userId, id, patch) {
  const existing = getQuestion(userId, id)
  if (!existing) return null
  const merged = { ...existing, ...patch, updated_at: Date.now() }

  db.prepare(
    `UPDATE questions SET
      subject=@subject, question_type=@question_type, title=@title,
      stem=@stem, stem_raw=@stem_raw, options=@options,
      correct_answer=@correct_answer, user_answer=@user_answer,
      source=@source, knowledge_points=@knowledge_points,
      error_reason=@error_reason, error_reason_note=@error_reason_note,
      tags=@tags, mastery=@mastery, review_due_at=@review_due_at,
      updated_at=@updated_at
     WHERE user_id=@user_id AND id=@id`
  ).run({
    subject: merged.subject,
    question_type: merged.question_type,
    title: merged.title,
    stem: merged.stem,
    stem_raw: merged.stem_raw,
    options: JSON.stringify(merged.options || []),
    correct_answer: merged.correct_answer,
    user_answer: merged.user_answer,
    source: merged.source,
    knowledge_points: JSON.stringify(merged.knowledge_points || []),
    error_reason: merged.error_reason,
    error_reason_note: merged.error_reason_note,
    tags: JSON.stringify(merged.tags || []),
    mastery: merged.mastery,
    review_due_at: merged.review_due_at,
    updated_at: merged.updated_at,
    user_id: userId,
    id: id,
  })

  upsertFts(id, merged)
  return getQuestion(userId, id)
}

export function deleteQuestion(userId, id) {
  const info = db
    .prepare('DELETE FROM questions WHERE user_id = ? AND id = ?')
    .run(userId, id)
  if (info.changes > 0) {
    deleteFts(id)
    deleteQuestionImages(userId, id)
  }
  return info.changes > 0
}

// ---------- 列表 / 筛选 / 搜索 ----------
const SUBJECT_MAP = { math: 1, logic: 2, writing: 3 }
const MASTERY_MAP = { unlearned: 1, learning: 2, mastered: 3 }

export function listQuestions(userId, opts = {}) {
  const {
    subject,
    mastery,
    tag,
    kp,
    untidy = false,
    q,
    limit = 50,
    offset = 0,
    reviewOnly = false,
    orderBy = 'created_at',
  } = opts

  const where = ['q.user_id = ?']
  const params = [userId]

  if (subject) {
    where.push('q.subject = ?')
    params.push(subject)
  }
  if (mastery) {
    where.push('q.mastery = ?')
    params.push(mastery)
  }
  if (tag) {
    where.push('EXISTS (SELECT 1 FROM json_each(q.tags) WHERE value = ?)')
    params.push(tag)
  }
  if (kp) {
    where.push('EXISTS (SELECT 1 FROM json_each(q.knowledge_points) WHERE value = ?)')
    params.push(kp)
  }
  if (untidy) {
    where.push("q.stem = ''")
  }
  if (reviewOnly) {
    where.push('q.review_due_at > 0 AND q.review_due_at <= ?')
    params.push(Date.now())
  }

  let sql
  const orderCol = orderBy === 'review_due_at' ? 'q.review_due_at' : 'q.created_at'
  const orderDir = orderBy === 'review_due_at' ? 'ASC' : 'DESC'

  if (q) {
    // FTS5 查询：CJK 单字 -> "字"*，多 token AND
    // 注意：FTS5 的 MATCH 必须直接作用于 FROM 子句中的 FTS 表名，
    // 不能在 JOIN 的 WHERE 里用别名引用（否则报 "unable to use function MATCH in the requested context"）。
    // 因此改用子查询：先在 FTS 表中筛出命中的 question_id，再用 IN 关联回主表。
    const tokens = tokenizeForFts(q).split(/\s+/).filter(Boolean)
    const ftsExpr = tokens.map((t) => `"${t.replace(/"/g, '""')}"*`).join(' AND ')
    if (ftsExpr) {
      sql = `SELECT q.* FROM questions q
             WHERE ${where.join(' AND ')}
               AND q.id IN (SELECT question_id FROM questions_fts WHERE questions_fts MATCH ?)
             ORDER BY ${orderCol} ${orderDir}
             LIMIT ? OFFSET ?`
      params.push(ftsExpr)
    } else {
      sql = `SELECT q.* FROM questions q
             WHERE ${where.join(' AND ')}
             ORDER BY ${orderCol} ${orderDir}
             LIMIT ? OFFSET ?`
    }
  } else {
    sql = `SELECT q.* FROM questions q
           WHERE ${where.join(' AND ')}
           ORDER BY ${orderCol} ${orderDir}
           LIMIT ? OFFSET ?`
  }

  params.push(limit, offset)
  const rows = db.prepare(sql).all(...params)
  return rows.map(rowToQuestion)
}

export function countQuestions(userId, opts = {}) {
  const { subject, mastery, tag, kp, untidy, reviewOnly, q } = opts
  const where = ['user_id = ?']
  const params = [userId]
  if (subject) {
    where.push('subject = ?')
    params.push(subject)
  }
  if (mastery) {
    where.push('mastery = ?')
    params.push(mastery)
  }
  if (tag) {
    where.push('EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)')
    params.push(tag)
  }
  if (kp) {
    where.push('EXISTS (SELECT 1 FROM json_each(knowledge_points) WHERE value = ?)')
    params.push(kp)
  }
  if (untidy) {
    where.push("stem = ''")
  }
  if (reviewOnly) {
    where.push('review_due_at > 0 AND review_due_at <= ?')
    params.push(Date.now())
  }
  // 搜索时同样用 FTS5 子查询统计，保证 total 与列表一致
  let ftsExpr = ''
  if (q) {
    const tokens = tokenizeForFts(q).split(/\s+/).filter(Boolean)
    ftsExpr = tokens.map((t) => `"${t.replace(/"/g, '""')}"*`).join(' AND ')
  }
  const sql = ftsExpr
    ? `SELECT COUNT(*) AS c FROM questions
       WHERE ${where.join(' AND ')}
         AND id IN (SELECT question_id FROM questions_fts WHERE questions_fts MATCH ?)`
    : `SELECT COUNT(*) AS c FROM questions WHERE ${where.join(' AND ')}`
  if (ftsExpr) params.push(ftsExpr)
  const row = db.prepare(sql).get(...params)
  return row.c
}

export function listAllTags(userId) {
  const rows = db
    .prepare('SELECT tags FROM questions WHERE user_id = ? AND tags != "[]"')
    .all(userId)
  const set = new Set()
  for (const r of rows) {
    for (const t of safeParseJson(r.tags, [])) set.add(t)
  }
  return [...set].sort()
}

// ---------- 题目图片 ----------
export function addImage(userId, questionId, meta, sortOrder = 0) {
  const info = db
    .prepare(
      `INSERT INTO question_images
        (question_id, user_id, file_path, thumbnail_path, sort_order, rotation, mime, width, height, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      questionId,
      userId,
      meta.file_path,
      meta.thumbnail_path,
      sortOrder,
      meta.rotation || 0,
      meta.mime,
      meta.width || 0,
      meta.height || 0,
      Date.now()
    )
  return info.lastInsertRowid
}

export function listImages(userId, questionId) {
  return db
    .prepare(
      `SELECT id, question_id, file_path, thumbnail_path, sort_order, rotation, mime, width, height, created_at
       FROM question_images WHERE user_id = ? AND question_id = ?
       ORDER BY sort_order ASC, id ASC`
    )
    .all(userId, questionId)
}

export function getImageById(userId, imageId) {
  return db
    .prepare(
      `SELECT id, question_id, user_id, file_path, thumbnail_path, sort_order, rotation, mime, width, height, created_at
       FROM question_images WHERE user_id = ? AND id = ?`
    )
    .get(userId, imageId)
}

// 任意用户查询（仅供已签名授权的图片访问使用；签名本身已做归属校验）
export function getImageByIdAnyUser(imageId) {
  return db
    .prepare(
      `SELECT id, question_id, user_id, file_path, thumbnail_path, sort_order, rotation, mime, width, height, created_at
       FROM question_images WHERE id = ?`
    )
    .get(imageId)
}

export function updateImage(userId, imageId, patch) {
  const sets = []
  const params = []
  if (patch.sort_order !== undefined) {
    sets.push('sort_order = ?')
    params.push(patch.sort_order)
  }
  if (patch.rotation !== undefined) {
    sets.push('rotation = ?')
    params.push(patch.rotation)
  }
  if (!sets.length) return false
  params.push(userId, imageId)
  const info = db
    .prepare(`UPDATE question_images SET ${sets.join(', ')} WHERE user_id = ? AND id = ?`)
    .run(...params)
  return info.changes > 0
}

export function deleteImage(userId, imageId) {
  const row = db
    .prepare('SELECT file_path, thumbnail_path, question_id FROM question_images WHERE user_id = ? AND id = ?')
    .get(userId, imageId)
  if (!row) return false
  db.prepare('DELETE FROM question_images WHERE user_id = ? AND id = ?').run(userId, imageId)
  for (const p of [row.file_path, row.thumbnail_path]) {
    if (p) {
      try {
        fs.rmSync(getImageAbsPath(p), { force: true })
      } catch {}
    }
  }
  return true
}

// ---------- AI 老师讲解 ----------
export function saveTutorSession(userId, questionId, record) {
  const info = db
    .prepare(
      `INSERT INTO tutor_sessions
        (question_id, user_id, request_id, provider, model, mode, user_prompt,
         response_markdown, images_used, tokens, elapsed_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      questionId,
      userId,
      record.request_id,
      record.provider || '',
      record.model || '',
      record.mode || 'hint',
      record.user_prompt || '',
      record.response_markdown || '',
      record.images_used ? 1 : 0,
      record.tokens || 0,
      record.elapsed_ms || 0,
      record.created_at || Date.now()
    )
  return info.lastInsertRowid
}

export function listTutorSessions(userId, questionId, limit = 50) {
  return db
    .prepare(
      `SELECT id, request_id, provider, model, mode, user_prompt, response_markdown,
              images_used, tokens, elapsed_ms, created_at
       FROM tutor_sessions WHERE user_id = ? AND question_id = ?
       ORDER BY created_at ASC LIMIT ?`
    )
    .all(userId, questionId, limit)
}

// ---------- 重做记录 ----------
// applySchedule=false 用于导入恢复历史记录，不改动题目的复习进度
export function saveRedo(userId, questionId, record, { applySchedule = true } = {}) {
  const info = db
    .prepare(
      `INSERT INTO redo_records
        (question_id, user_id, redo_answer, result, duration_ms, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      questionId,
      userId,
      record.redo_answer || '',
      record.result || 'wrong',
      record.duration_ms || 0,
      record.detail || '',
      record.created_at || Date.now()
    )
  let schedule = null
  if (applySchedule) {
    const q = db
      .prepare('SELECT review_stage FROM questions WHERE user_id = ? AND id = ?')
      .get(userId, questionId)
    schedule = nextSchedule(q?.review_stage || 0, record.result)
    db.prepare(
      `UPDATE questions SET mastery = ?, review_stage = ?, review_due_at = ?, updated_at = ?
       WHERE user_id = ? AND id = ?`
    ).run(schedule.mastery, schedule.stage, schedule.due, Date.now(), userId, questionId)
  }
  return { id: info.lastInsertRowid, schedule }
}

export function listRedos(userId, questionId) {
  return db
    .prepare(
      `SELECT id, redo_answer, result, duration_ms, detail, created_at
       FROM redo_records WHERE user_id = ? AND question_id = ?
       ORDER BY created_at ASC`
    )
    .all(userId, questionId)
}

// ---------- 公式卡片复习 ----------
export function listCardReviews(userId) {
  return db
    .prepare('SELECT card_key, stage, due_at, last_grade, reviewed_at, review_count FROM card_reviews WHERE user_id = ?')
    .all(userId)
}

// grade: good（记得）| fuzzy（模糊）| again（忘了）
export function gradeCard(userId, cardKey, grade) {
  const row = db
    .prepare('SELECT stage, review_count FROM card_reviews WHERE user_id = ? AND card_key = ?')
    .get(userId, cardKey)
  const stage = row?.stage || 0
  let next
  if (grade === 'good') {
    next = { stage: stage + 1, due: dayStartAfter(INTERVALS[Math.min(stage, INTERVALS.length - 1)]) }
  } else if (grade === 'fuzzy') {
    next = { stage: Math.max(stage - 1, 0), due: dayStartAfter(1) }
  } else {
    // 忘了：阶段归零，今天内再出现
    next = { stage: 0, due: Date.now() }
  }
  const now = Date.now()
  db.prepare(
    `INSERT INTO card_reviews (user_id, card_key, stage, due_at, last_grade, reviewed_at, review_count)
     VALUES (?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(user_id, card_key) DO UPDATE SET
       stage = excluded.stage, due_at = excluded.due_at, last_grade = excluded.last_grade,
       reviewed_at = excluded.reviewed_at, review_count = card_reviews.review_count + 1`
  ).run(userId, cardKey, next.stage, next.due, grade, now)
  return next
}

// ---------- 知识点统计 ----------
// 每个知识点：题目数、已掌握数、最近一次作答是否答错
export function getKnowledgeStats(userId) {
  const rows = db
    .prepare(
      `SELECT kp.value AS kp, q.mastery AS mastery, q.id AS id,
              (SELECT result FROM redo_records r WHERE r.question_id = q.id ORDER BY r.created_at DESC LIMIT 1) AS last_result
       FROM questions q, json_each(q.knowledge_points) kp
       WHERE q.user_id = ? AND q.subject = 'math'`
    )
    .all(userId)
  const map = {}
  for (const r of rows) {
    const s = (map[r.kp] ||= { total: 0, mastered: 0, last_wrong: 0 })
    s.total += 1
    if (r.mastery === 'mastered') s.mastered += 1
    if (r.last_result === 'wrong') s.last_wrong += 1
  }
  return map
}

// 最近 N 天的作答统计（用于今日进度与连续打卡）
export function getActivity(userId, days = 30) {
  const since = dayStartAfter(-(days - 1))
  const redos = db
    .prepare('SELECT created_at, result, duration_ms FROM redo_records WHERE user_id = ? AND created_at >= ?')
    .all(userId, since)
  const cards = db
    .prepare('SELECT reviewed_at FROM card_reviews WHERE user_id = ? AND reviewed_at >= ?')
    .all(userId, since)
  const dayKey = (ts) => Math.floor((ts + TZ_OFFSET_MS) / DAY_MS)
  const byDay = {}
  for (const r of redos) {
    const d = (byDay[dayKey(r.created_at)] ||= { redo: 0, correct: 0, cards: 0 })
    d.redo += 1
    if (r.result === 'correct') d.correct += 1
  }
  for (const c of cards) {
    ;(byDay[dayKey(c.reviewed_at)] ||= { redo: 0, correct: 0, cards: 0 }).cards += 1
  }
  const today = dayKey(Date.now())
  let streak = 0
  // 今天还没学不打断连续天数，从昨天开始往前数
  for (let d = byDay[today] ? today : today - 1; byDay[d]; d--) streak++
  return { today: byDay[today] || { redo: 0, correct: 0, cards: 0 }, streak }
}

// ---------- 统计 ----------
export function getStats(userId) {
  const total = db
    .prepare('SELECT COUNT(*) AS c FROM questions WHERE user_id = ?')
    .get(userId).c
  const bySubject = db
    .prepare(
      `SELECT subject, COUNT(*) AS c FROM questions WHERE user_id = ? GROUP BY subject`
    )
    .all(userId)
  const byMastery = db
    .prepare(
      `SELECT mastery, COUNT(*) AS c FROM questions WHERE user_id = ? GROUP BY mastery`
    )
    .all(userId)
  const reviewDue = db
    .prepare(
      `SELECT COUNT(*) AS c FROM questions WHERE user_id = ? AND review_due_at > 0 AND review_due_at <= ?`
    )
    .get(userId, Date.now()).c
  const untidy = db
    .prepare("SELECT COUNT(*) AS c FROM questions WHERE user_id = ? AND stem = ''")
    .get(userId).c
  return {
    total,
    untidy,
    by_subject: Object.fromEntries(bySubject.map((r) => [r.subject, r.c])),
    by_mastery: Object.fromEntries(byMastery.map((r) => [r.mastery, r.c])),
    review_due: reviewDue,
  }
}

export default db
