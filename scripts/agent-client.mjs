// 客户端只持有学习平台令牌，所有数据读写通过带权限检查的 REST 接口。
export const toolDefinitions=[
  {name:'list_ungraded_essays',description:'按新到旧列出已校对、待批改的作文',inputSchema:{type:'object',properties:{}}},
  {name:'get_essay',description:'取得作文、校对稿版本、评分标准和提交模板',inputSchema:{type:'object',properties:{id:{type:'integer',minimum:1}},required:['id']}},
  {name:'submit_grading',description:'向学习平台保存批改。沿用 get_essay 返回的请求标识与版本。',inputSchema:{type:'object',properties:{id:{type:'integer',minimum:1},body:{type:'object'}},required:['id','body']}},
  {name:'get_rubric',description:'读取评分量表，默认最新版本；可指定历史 version',inputSchema:{type:'object',properties:{version:{type:'string'}}}},
  {name:'list_wrong_questions',description:'按知识点或待整理状态读取自己的错题',inputSchema:{type:'object',properties:{kp:{type:'string'},untidy:{type:'boolean'}}}}
]
export async function callTool(name,args={}) {
  const base=new URL(process.env.LEARNPLAT_URL||'http://127.0.0.1:3005')
  if(base.username||base.password||base.search||base.hash)throw new Error('学习平台地址格式不正确')
  if(base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(base.hostname)))
    throw new Error('远程平台须使用 HTTPS')
  const token=process.env.LEARNPLAT_TOKEN
  if(!/^lp_[a-f0-9]{64}$/.test(token||''))throw new Error('请设置 LEARNPLAT_TOKEN')
  const id=Number(args.id)
  if(['get_essay','submit_grading'].includes(name)&&(!Number.isSafeInteger(id)||id<1))throw new Error('需要有效作文编号')
  const routes={list_ungraded_essays:'essays?status=ungraded',get_essay:'essays/'+id,submit_grading:'essays/'+id+'/gradings',get_rubric:'rubric'+(args.version?'?'+new URLSearchParams({version:args.version}):''),
    list_wrong_questions:'questions?'+new URLSearchParams({kp:args.kp||'',untidy:args.untidy?'1':'0'})}
  if(!Object.hasOwn(routes,name))throw new Error('未知工具')
  const write=name==='submit_grading'
  const r=await fetch(new URL('/api/agent/'+routes[name],base),{method:write?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(30000),
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:write?JSON.stringify({...args.body,grader:process.env.LEARNPLAT_GRADER||'agent'}):undefined})
  const data=await r.json()
  if(!r.ok)throw new Error('HTTP '+r.status+' '+(data.error||'平台请求失败'))
  return data
}
