import test from 'node:test'
import assert from 'node:assert/strict'
import {rubric,getRubric} from '../server/content/essay-rubric.js'
import {outputSchema,validate} from '../server/essay-schema.js'

function result(kind,scores,band,version=rubric.version) {
  const spec=getRubric(version)[kind]
  return {rubric_version:version,max:spec.max,total:scores.reduce((s,n)=>s+n,0),band,
    dimensions:Object.entries(spec.dimensions).map(([name,max],i)=>({name,max,score:scores[i],comment:'测试反馈'})),
    issues:[{quote:'协作😀',kind:'逻辑',problem:'缺少条件',fix:'说明适用条件'}],rewrite_sample:'限定条件后再作判断。',next_focus:['检查推理条件'],
    ...(kind==='argument'?{flaws_found:[],flaws_missed:[]}:{thesis:'观点清楚',structure:'顺序合理'})}
}

test('新量表明确两类分档范围、训练配分与扣分口径，旧版保持可查',()=>{
  assert.equal(rubric.version,'2027-verified-v1')
  assert.equal(rubric.argument.max+rubric.essay.max,65)
  assert.deepEqual([rubric.argument.target_words,rubric.essay.target_words],[600,700])
  assert.deepEqual(rubric.argument.bands.map(b=>b.slice(1)),[[12,14],[8,11],[4,7],[0,3]])
  assert.deepEqual(rubric.essay.bands.map(b=>b.slice(1)),[[30,35],[24,29],[18,23],[11,17],[0,10]])
  assert.equal(rubric.argument.flaw_types.length,11)
  assert.equal(rubric.deduction_rules.missing_title.points,2)
  assert.equal(rubric.deduction_rules.typos.per_distinct_errors,3)
  assert.equal(rubric.deduction_rules.typos.max_points,2)
  assert.equal(rubric.deduction_rules.typos.repeat_counts,false)
  assert.match(rubric.essay.dimension_notice,/训练|反馈/)
  const old=getRubric('2027-training-v1')
  assert.equal(old.argument.band,'训练估分')
  assert.equal(old.argument.bands,undefined)
  assert.match(old.notice,/待人工核实/)
  assert.equal(getRubric('__proto__'),undefined)
  assert.throws(()=>outputSchema('essay','unknown'),/未知量表/)
})

test('分析作文四档按14分维度校验，不能拿总分或旧版固定档次替代',()=>{
  const essay={kind:'argument',transcript:'协作😀，协作😀。'}
  for(const [band,min,max] of rubric.argument.bands)for(const score of [min,max]){
    const r=result('argument',[16,score],band)
    assert.deepEqual(validate(essay,r).issues[0].positions,[[0,4],[5,9]])
    assert.throws(()=>validate(essay,{...r,band:'训练估分'}),/对应档次/)
  }
  assert.throws(()=>validate(essay,result('argument',[16,7],'一类卷')),/论证组织与表达对应档次应为 三类卷/)
  const old=result('argument',[16,7],'训练估分','2027-training-v1')
  assert.equal(validate(essay,old,'2027-training-v1').total,23)
  assert.throws(()=>validate(essay,old),/rubric_version/)
})

test('论说文五档边界、分值合计及未知维度均受校验',()=>{
  const essay={kind:'essay',transcript:'协作😀'}
  for(const [band,min,max] of rubric.essay.bands)for(const total of [min,max]){
    let rest=total
    const scores=Object.values(rubric.essay.dimensions).map(max=>{const n=Math.min(max,rest);rest-=n;return n})
    const r=result('essay',scores,band)
    assert.equal(validate(essay,r).total,total)
    assert.throws(()=>validate(essay,{...r,total:total+1}),/维度得分之和/)
    assert.throws(()=>validate(essay,{...r,band:'训练估分'}),/总分对应档次/)
  }
  const valid=result('essay',[8,9,5,5],'二类卷')
  const wrongMax=structuredClone(valid);wrongMax.dimensions[0].score=11
  assert.throws(()=>validate(essay,wrongMax),/维度名称与分值/)
  const unknown=structuredClone(valid);unknown.dimensions[0].name='自设维度'
  assert.throws(()=>validate(essay,unknown),/维度名称与分值/)
})
