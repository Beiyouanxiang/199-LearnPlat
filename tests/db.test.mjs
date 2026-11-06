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
