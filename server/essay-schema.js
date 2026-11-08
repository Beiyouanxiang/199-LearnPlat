import { rubric, getRubric } from './content/essay-rubric.js'
const string = {type:'string',minLength:1,maxLength:20000}
const integer = {type:'integer',minimum:0}
const array = items => ({type:'array',items,maxItems:100})
const object = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false})
const issue = object({quote:string,kind:{enum:['逻辑','结构','病句','错别字']},problem:string,fix:string})
export function outputSchema(kind,version=rubric.version) {
  const selected=getRubric(version)
  if(!selected||!['argument','essay'].includes(kind))problem('未知量表版本或作文类型')
  const common = {
    rubric_version:{const:selected.version}, total:integer, max:{const:selected[kind].max}, band:string,
    dimensions:array(object({name:string,max:integer,score:integer,comment:string})),
    issues:array(issue),rewrite_sample:string,next_focus:{...array(string),minItems:1,maxItems:3}
  }
  const specific = kind==='argument' ? {
    flaws_found: array(object({type:string,quote:string,ok:{type:'boolean'},comment:string})),
    flaws_missed: array(object({type:string,where:string,how_to_write:string}))
  } : {thesis:string,structure:string}
  return object({...common,...specific})
}
export function problem(message,status=422) { throw Object.assign(new Error(message),{status}) }
// 只使用本项目 schema 实际声明的关键词，同一份 schema 同时用于提示与校验。
function check(schema,value,path='result') {
  const fail = () => problem('字段不符合格式：'+path)
  if ('const' in schema && value!==schema.const) fail()
  if (schema.enum && !schema.enum.includes(value)) fail()
  if (schema.type==='integer' && (!Number.isInteger(value)||value<schema.minimum)) fail()
  if (schema.type==='boolean' && typeof value!=='boolean') fail()
  if (schema.type==='string' && (typeof value!=='string'||!value.trim()||value.length>schema.maxLength)) fail()
  if (schema.type==='array') {
    if(!Array.isArray(value)||value.length>(schema.maxItems??100)||value.length<(schema.minItems??0))fail()
    value.forEach((x,i)=>check(schema.items,x,path+'['+i+']'))
  }
  if (schema.type==='object') {
    if(!value||typeof value!=='object'||Array.isArray(value))fail()
    if(Object.keys(value).some(k=>!Object.hasOwn(schema.properties,k)))fail()
    for(const k of schema.required)check(schema.properties[k],value[k],path+'.'+k)
  }
}
export function validate(essay,value,version=rubric.version) {
  check(outputSchema(essay.kind,version),value)
  const spec=getRubric(version)[essay.kind], result=structuredClone(value)
  const names=new Set()
  for(const d of result.dimensions) {
    if(!Object.hasOwn(spec.dimensions,d.name)||names.has(d.name)||d.max!==spec.dimensions[d.name]||d.score>d.max)
      problem('请核对维度名称与分值')
    names.add(d.name)
  }
  if(names.size!==Object.keys(spec.dimensions).length || result.dimensions.reduce((s,d)=>s+d.score,0)!==result.total)problem('维度得分之和须等于总分')
  const bandScore=spec.band_dimension?result.dimensions.find(d=>d.name===spec.band_dimension).score:result.total
  const band=spec.bands?.find(([,min])=>bandScore>=min)?.[0]||spec.band
  if(result.band!==band)problem((spec.band_dimension||'总分')+'对应档次应为 '+band)
  for(const item of [...result.issues,...(result.flaws_found||[])]) {
    item.positions=[]
    let offset=0
    while(offset<essay.transcript.length) {
      const start=essay.transcript.indexOf(item.quote,offset)
      if(start<0)break
      offset=start+item.quote.length
      item.positions.push([start,offset])
    }
  }
  return result
}
