// 作文页面沿用主应用的鉴权、元素构造与图片压缩。
window.essayPages = function ({h,view,API,toast,onLeave,preprocessImage,makeUUID,copyText}) {
  const uuid = makeUUID || (()=>crypto.randomUUID())
  const writeClip = copyText || (t=>navigator.clipboard.writeText(t))
  const title = e => e.kind==='argument'?'论证有效性分析':'论说文'
  const states={uploaded:'待校对',transcribed:'待批改',graded:'已批改'}
  const stateCls={uploaded:'pill pill-warn',transcribed:'pill pill-primary',graded:'pill pill-ok'}
  const link=(url,label,cls='btn')=>h('a',{href:url,class:cls},label)
  const field=(label,input)=>h('label',{class:'field'},[h('span',{},label),input])
  const post=(url,body={})=>API.req(url,{method:'POST',body})
  function button(label,fn,cls='btn') {
    const b=h('button',{class:cls,type:'button'},label)
    b.onclick=async()=>{b.disabled=true;try{await fn()}catch(e){toast(e.message,4500)}finally{b.disabled=false}}
    return b
  }
  function download(name,text){
    const url=URL.createObjectURL(new Blob([text],{type:'application/json'}))
    h('a',{href:url,download:name}).click()
    setTimeout(()=>URL.revokeObjectURL(url),2000)
  }
  async function list(){
    const data=await API.req('/api/essays')
    view.append(h('div',{class:'page-head'},[
      h('h1',{class:'page-title'},'写作练习'),
      h('div',{class:'head-actions'},[
        link('#/essay-tokens','🔑 管理代理令牌'),
        link('#/essays/new','✍️ 新建作文','btn btn-primary'),
      ]),
    ]))
    view.append(h('p',{class:'page-sub'},'涵盖 199 管理类联考论证有效性分析（30 分）与论说文（35 分），支持拍照识别、无 API Key 材料包导出与代理直接回写。'))
    if(data.scores.length){
      const history=h('div',{class:'card',style:'margin-bottom:16px'},[h('div',{class:'section-title',style:'margin-top:0'},'最近估分趋势')])
      const rows=h('div',{class:'score-list'})
      for(const s of data.scores.slice(0,10).reverse())rows.append(h('div',{class:'score-row'},[
        link('#/essays/'+s.essay_id,'第 '+s.essay_id+' 篇','btn btn-sm'),
        h('progress',{max:s.max,value:s.total}),
        h('strong',{style:'color:var(--primary)'},s.total+' / '+s.max),
      ]))
      history.append(rows)
      view.append(history)
    }
    if(!data.items.length){
      view.append(h('div',{class:'card empty'},[
        h('div',{class:'em-icon'},'✍️'),
        h('div',{class:'em-text'},'还没有作文。可以直接手动录入正文，也可以上传答题纸照片自动识别。'),
        h('div',{style:'margin-top:12px'},[link('#/essays/new','立即写第一篇','btn btn-primary')]),
      ]))
      return
    }
    const listWrap=h('div',{class:'essay-list'})
    for(const e of data.items){
      listWrap.append(h('a',{class:'card essay-row',href:'#/essays/'+e.id},[
        h('div',{class:'essay-row-main'},[
          h('span',{class:'pill pill-primary'},e.kind==='argument'?'30分':'35分'),
          h('strong',{style:'font-size:15px'},title(e)),
          h('span',{class:'dim'},[e.year,e.source,new Date(e.created_at).toLocaleDateString()].filter(Boolean).join(' · ')),
        ]),
        h('span',{class:stateCls[e.status]||'pill pill-muted'},states[e.status]||e.status),
      ]))
    }
    view.append(listWrap)
  }
  function create(){
    const kind=h('select',{},[h('option',{value:'essay'},'论说文（35 分 · 约 700 字）'),h('option',{value:'argument'},'论证有效性分析（30 分 · 约 600 字）')])
    const source=h('input',{placeholder:'例如：2024 年真题 / 模拟卷一'}),year=h('input',{inputmode:'numeric',placeholder:'例如：2024'}),material=h('textarea',{rows:6,placeholder:'在此粘贴题干材料；如果是纸质卷，也可留空直接去下一页上传材料照片'})
    view.append(
      h('div',{class:'page-head'},[
        h('h1',{class:'page-title'},'新建作文'),
        link('#/essays','← 返回列表','btn btn-sm'),
      ]),
      h('div',{class:'card essay-form-card'},[
        h('div',{class:'essay-form-row'},[field('题型',kind),field('题目来源',source),field('年份',year)]),
        field('题目或材料（也可在下一页上传材料照片）',material),
        h('div',{class:'essay-btn-row'},[
          button('保存并录入正文',async()=>{
            const e=await post('/api/essays',{kind:kind.value,source:source.value,year:year.value,prompt_text:material.value})
            location.hash='#/essays/'+e.id
          },'btn btn-primary'),
        ]),
      ])
    )
  }
  function report(g,kind){
    const r=g.result,original=h('pre',{class:'essay-text'},g.transcript)
    const spec=g.rubric?.[kind],bandNote=spec?.band_dimension?'（'+spec.band_dimension+'档）':''
    const card=h('section',{class:'card essay-report'},[
      h('h3',{},r.total+' / '+r.max+' · '+r.band+bandNote),
      h('p',{class:'dim'},g.grader+' · 校对稿 v'+g.revision+' · '+r.rubric_version),
      h('p',{class:'dim'},g.rubric?.notice||'估分仅供参考，按本次批改记录的量表版本解读。'),
      spec?.band_notice?h('p',{class:'dim'},spec.band_notice):null,
      ...r.dimensions.map(d=>h('div',{class:'essay-dim-row'},[
        h('span',{class:'essay-dim-score'},d.name+' '+d.score+'/'+d.max),
        h('span',{},d.comment),
      ])),
      original,
    ])
    function point(item,label) {
      const ranges=item.positions||[]
      const b=button(label,()=>{
        let cursor=0;original.replaceChildren()
        for(const [start,end] of ranges){original.append(g.transcript.slice(cursor,start),h('mark',{},g.transcript.slice(start,end)));cursor=end}
        original.append(g.transcript.slice(cursor));original.scrollIntoView({block:'nearest'})
      },'btn btn-sm essay-quote-btn')
      if(!ranges.length){b.disabled=true;b.textContent+='（未定位）'}
      return b
    }
    for(const i of r.issues)card.append(point(i,i.kind+' · '+i.quote),h('div',{class:'essay-issue-box'},i.problem+'　建议：'+i.fix))
    for(const f of r.flaws_found||[])card.append(point(f,f.type+' · '+f.quote),h('div',{class:'essay-issue-box'},f.comment))
    for(const f of r.flaws_missed||[])card.append(h('div',{class:'essay-issue-box'},'遗漏 · '+f.type+'　'+f.where+'　'+f.how_to_write))
    for(const s of [r.thesis,r.structure])if(s)card.append(h('p',{},s))
    card.append(h('h4',{},'改写示范'),h('p',{},r.rewrite_sample),h('h4',{},'下次练习'),h('ul',{},r.next_focus.map(x=>h('li',{},x))))
    return card
  }
  async function detail(id){
    const url='/api/essays/'+id
    let e=await API.req(url),editorRevision=e.revision,alive=true,dirty=false,imported=null,gradeKey=uuid()
    const urls=[],imageArea=h('div'),jobs=h('div'),source=h('textarea',{rows:5}),draft=h('textarea',{rows:12})
    source.value=e.prompt_text;draft.value=e.transcript||e.ocr_text
    source.oninput=draft.oninput=()=>{dirty=true}
    const imports=h('textarea',{rows:6,placeholder:'在这里粘贴模型返回的完整 JSON'})
    const preview=h('div'),reports=h('div',{class:'essay-reports'}),exchange=h('section',{class:'card essay-exchange'})
    const updateReports=()=>reports.replaceChildren(...e.gradings.map(g=>report(g,e.kind)))
    function canExport(){if(dirty||!e.revision)throw new Error('请先保存并确认当前校对稿')}
    const pack=async()=>{canExport();return JSON.stringify(await post(url+'/package'),null,2)}
    const saveImport=button('确认保存这份批改',async()=>{
      if(!imported)throw new Error('请先预览结果')
      await post(url+'/gradings',{...imported,grader:origin.value});imports.value='';imported=null;preview.replaceChildren()
      saveImport.hidden=true;e=await API.req(url);updateReports();toast('批改已保存')
    },'btn btn-primary')
    saveImport.hidden=true
    const origin=h('select',{},['chatgpt','claude','manual-import'].map(x=>h('option',{value:x},x)))
    const clearPreview=()=>{imported=null;saveImport.hidden=true;preview.replaceChildren()}
    imports.oninput=clearPreview
    const file=h('input',{type:'file',accept:'.json,application/json'})
    file.onchange=async()=>{if(file.files[0]){clearPreview();imports.value=await file.files[0].text()}}
    exchange.append(
      h('h2',{},'交给 ChatGPT / Claude / Codex 批改'),
      h('p',{},'复制或下载已校对的材料包交给任意外部模型，再将返回的 JSON 粘贴或选择文件导入校验。'),
      h('div',{class:'essay-btn-row'},[
        button('复制批改材料',async()=>{await writeClip(await pack());toast('材料已复制')},'btn btn-primary'),
        button('下载批改材料',async()=>download('essay-'+id+'-v'+e.revision+'.json',await pack())),
        button('使用已配置的服务端模型',async()=>{canExport();await post(url+'/grade',{key:gradeKey});gradeKey=uuid();await refresh()}),
      ]),
      h('div',{class:'form-grid'},[field('批改来源（自行声明）',origin),field('导入结果 JSON 文件',file)]),
      field('或直接粘贴返回 JSON',imports),
      h('div',{class:'essay-btn-row'},[
        button('校验并预览',async()=>{canExport();clearPreview();const candidate=JSON.parse(imports.value);const r=await post(url+'/preview',candidate)
          const selected=e.gradings.find(g=>g.rubric_version===r.rubric_version)?.rubric||(e.rubric?.version===r.rubric_version?e.rubric:null)
          imported=candidate;preview.replaceChildren(report({result:r,transcript:e.transcript,grader:origin.value,revision:e.revision,rubric:selected},e.kind));saveImport.hidden=false}),
        saveImport,
      ]),
      preview
    )
    async function refresh(){
      const fresh=await API.req(url);if(!alive)return
      const old=e;e=fresh
      if(!dirty){editorRevision=e.revision;draft.value=e.transcript||e.ocr_text;source.value=e.prompt_text}
      jobs.replaceChildren(...e.jobs.map(j=>h('p',{class:'dim'},[j.kind+' · '+j.status+' '+(j.error||''),
        j.status==='failed'?button('重试',()=>post('/api/jobs/'+j.id+'/retry'),'btn btn-sm'):null])))
      if(old.gradings.length!==e.gradings.length||e.gradings[0]?.id!==old.gradings[0]?.id)updateReports()
      exchange.hidden=!e.revision
    }
    async function showImages(){
      imageArea.replaceChildren()
      if(!e.images.length){
        imageArea.append(h('div',{class:'card empty'},[h('div',{class:'em-icon'},'📄'),h('div',{class:'em-text'},'暂无答题/材料照片，可在上方上传或直接在右侧录入文字')]))
        return
      }
      const wrap=h('div',{class:'card'})
      for(const im of e.images){
        const response=await fetch(url+'/images/'+im.id,{headers:{Authorization:'Bearer '+API.token}})
        if(!response.ok)throw new Error('读取图片失败')
        const blob=await response.blob();if(!alive)return
        const src=URL.createObjectURL(blob);urls.push(src)
        wrap.append(h('figure',{style:'margin:0 0 12px'},[h('figcaption',{class:'dim',style:'margin-bottom:6px'},(im.role==='answer'?'答题':'材料')+'图 '+(im.position+1)),h('img',{src,class:'review-image',alt:'原图'})]))
      }
      imageArea.append(wrap)
    }
    const files=h('input',{type:'file',accept:'image/*',multiple:true})
    const role=h('select',{},[h('option',{value:'answer'},'答题照片'),h('option',{value:'material'},'材料照片')])
    const uploadStatus=h('p',{class:'dim',role:'status'})
    const uploads=h('div',{class:'card essay-upload-bar'},[role,files,button('上传所选图片',async()=>{
      const chosen=[...files.files]
      const position=e.images.filter(im=>im.role===role.value).length
      let fallback=false
      for(const [i,f] of chosen.entries()){
        uploadStatus.textContent='正在压缩并上传第 '+(i+1)+'/'+chosen.length+' 张…'
        const image=await preprocessImage(f)
        fallback=fallback||image.compressed===false
        await post(url+'/images',{role:role.value,position:position+i,image:image.dataUri})
      }
      uploadStatus.textContent=fallback?'有图片未能压缩，已按原图上传':'已压缩后逐张上传'
      files.value='';e=await API.req(url);await showImages()
    }),button('识别已上传图片',async()=>{await post(url+'/ocr');await refresh()},'btn btn-primary'),uploadStatus])
    uploads.hidden=!!e.revision
    view.append(
      h('div',{class:'page-head'},[
        h('h1',{class:'page-title'},title(e)+' · 第 '+id+' 篇'),
        h('div',{class:'head-actions'},[
          e.revision ? button('重新上传照片',()=>{uploads.hidden=!uploads.hidden},'btn btn-sm') : null,
          link('#/essays','← 作文列表','btn btn-sm'),
        ]),
      ]),
      uploads,
      jobs,
      h('div',{class:'review-columns'},[
        imageArea,
        h('div',{class:'card essay-form-card'},[
          field('题目材料',source),
          field('校对稿（可直接手动填写）',draft),
          h('div',{class:'essay-btn-row'},[
            button('确认校对稿',async()=>{await post(url+'/confirm',{revision:editorRevision,transcript:draft.value,prompt_text:source.value})
              dirty=false;clearPreview();uploads.hidden=true;e=await API.req(url);editorRevision=e.revision;exchange.hidden=false;updateReports();toast('已确认 v'+e.revision)},'btn btn-primary'),
          ]),
        ]),
      ]),
      exchange,
      h('div',{class:'section-title'},'历次批改'),
      h('p',{class:'dim',style:'margin:-6px 0 12px;font-size:13px'},'估分仅供参考。各次批改保留当时的量表版本；论证有效性分析的四档仅对应论证组织与表达部分。'),
      reports
    )
    exchange.hidden=!e.revision;updateReports()
    const timer=setInterval(()=>refresh().catch(()=>{}),3000)
    onLeave(()=>{alive=false;clearInterval(timer);urls.forEach(url=>URL.revokeObjectURL(url))})
    await showImages();await refresh()
  }
  async function tokens() {
    const name=h('input',{value:'学习助手'}),list=h('div',{class:'essay-list',style:'margin-top:14px'}),secret=h('div',{style:'margin-top:12px'})
    const scopeChoices=[
      ['essays:read','读取已校对作文',true],
      ['essays:write','回写批改结果',true],
      ['essays:create','创建作文、上传图片并识别',false],
      ['questions:read','读取错题',false],
      ['questions:write','录入和修改错题',false],
    ]
    const scopes=scopeChoices.map(([value,,on])=>h('input',{type:'checkbox',value,checked:on}))
    async function reload(){const data=await API.req('/api/tokens');list.replaceChildren(...data.items.map(t=>h('div',{class:'card essay-row'},[
      h('div',{class:'essay-row-main'},[h('strong',{},t.name),h('span',{class:'dim'},JSON.parse(t.scopes).join(' · '))]),
      t.revoked_at?h('span',{class:'pill pill-muted'},'已吊销'):button('吊销',async()=>{await API.req('/api/tokens/'+t.id,{method:'DELETE'});secret.replaceChildren();await reload()},'btn btn-sm btn-danger'),
    ])))}
    view.append(
      h('div',{class:'page-head'},[
        h('h1',{class:'page-title'},'代理访问令牌'),
        link('#/essays','← 作文列表','btn btn-sm'),
      ]),
      h('div',{class:'card essay-form-card'},[
        field('令牌名称',name),
        h('div',{class:'token-scopes'},scopes.map((input,i)=>h('label',{title:scopeChoices[i][1]},[input,input.value,h('span',{class:'dim'},' '+scopeChoices[i][1])]))),
        h('div',{class:'essay-btn-row'},[
          button('生成令牌',async()=>{const x=await post('/api/tokens',{name:name.value,scopes:scopes.filter(i=>i.checked).map(i=>i.value)})
            secret.replaceChildren(h('p',{class:'error'},'请现在复制到本机客户端；离开页面后无法再次查看。'),h('label',{class:'field'},[h('textarea',{readonly:true,rows:2},x.token)]));await reload()},'btn btn-primary'),
        ]),
        secret,
      ]),
      list
    )
    await reload()
  }
  return {essays:async id=>id==='new'?create():id?detail(Number(id)):list(), 'essay-tokens':tokens}
}
