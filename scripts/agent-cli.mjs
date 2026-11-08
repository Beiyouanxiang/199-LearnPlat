import {readFile} from 'node:fs/promises'
import {callTool} from './agent-client.mjs'
try {
  const [cmd,id,file]=process.argv.slice(2)
  const tools={list:'list_ungraded_essays',get:'get_essay',submit:'submit_grading',rubric:'get_rubric'}
  if(!Object.hasOwn(tools,cmd))throw new Error('用法：list | get <id> | submit <id> <result.json> | rubric [version]')
  const body=cmd==='submit'?JSON.parse(await readFile(file,'utf8')):undefined
  console.log(JSON.stringify(await callTool(tools[cmd],{id,body,...(cmd==='rubric'&&id?{version:id}:{})}),null,2))
} catch(e){console.error(e.message);process.exitCode=1}
