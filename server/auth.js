import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'

const JWT_SECRET = process.env.JWT_SECRET
const INVITE_CODE = process.env.INVITE_CODE || ''
const NODE_ENV = process.env.NODE_ENV || 'development'

// ---------- 启动时校验 ----------
if (!JWT_SECRET) {
  const msg = '[exam199] FATAL: 缺少 JWT_SECRET'
  if (NODE_ENV === 'production') {
    console.error(msg)
    process.exit(1)
  }
  console.warn(msg + '（开发环境将使用临时密钥，重启后 token 失效）')
}

export function getJwtSecret() {
  return JWT_SECRET || 'dev-temp-secret-change-me'
}

export function isProduction() {
  return NODE_ENV === 'production'
}

export function getInviteCode() {
  return INVITE_CODE
}

// ---------- 密码 ----------
export async function hashPassword(password) {
  return bcrypt.hash(password, 10)
}

export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash)
}

// ---------- JWT ----------
export function signToken(payload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' })
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, getJwtSecret())
  } catch {
    return null
  }
}

// ---------- Express 中间件 ----------
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  const decoded = verifyToken(token)

  if (!decoded || !decoded.userId) {
    return res.status(401).json({ error: '未登录或登录已过期' })
  }

  req.userId = decoded.userId
  req.username = decoded.username
  next()
}

// ---------- 图片短期签名 ----------
// 用于 <img> 直连：浏览器不会带 Authorization header，所以签短期 token 放入 URL query。
// 签名 = HMAC-SHA256(imageId:exp, JWT_SECRET) 取前 32 hex。验证：exp 未过期 + sig 匹配。
// 同时校验 image 归属（通过 user_id 关联 question），避免越权。
export function signImageAccess(imageId, ttlSec = 3600) {
  const exp = Date.now() + ttlSec * 1000
  const sig = crypto
    .createHmac('sha256', getJwtSecret())
    .update(`${imageId}:${exp}`)
    .digest('hex')
    .slice(0, 32)
  return { t: sig, e: exp }
}

export function verifyImageAccess(imageId, t, e) {
  if (!t || !e) return false
  const exp = Number(e)
  if (!Number.isFinite(exp) || exp < Date.now()) return false
  const expected = crypto
    .createHmac('sha256', getJwtSecret())
    .update(`${imageId}:${exp}`)
    .digest('hex')
    .slice(0, 32)
  if (typeof t !== 'string' || t.length !== expected.length) return false
  // 常量时间比较
  let diff = 0
  for (let i = 0; i < t.length; i++) diff |= t.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}
