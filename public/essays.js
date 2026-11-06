// 作文页面沿用主应用的鉴权、元素构造与图片压缩。
window.essayPages = function ({h,view,API,toast,onLeave,preprocessImage}) {
  const title = e => e.kind==='argument'?'论证有效性分析':'论说文'
  const states={uploaded:'待校对',transcribed:'待批改',graded:'已批改'}
  const link=(url,label)=>h('a',{href:url,class:'btn'},label)
  const field=(label,input)=>h('label',{class:'field'},[h('span',{},label),input])
  const post=(url,body={})=>API.req(url,{method:'POST',body})
  function button(label,fn) {
    const b=h('button',{class:'btn',type:'button'},label)
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
    view.append(h('h1',{},'写作练习'),link('#/essays/new','新建作文'),link('#/essay-tokens','管理代理令牌'))
    if(data.scores.length){
      const history=h('div',{class:'card'},h('h2',{},'最近估分'))
      for(const s of data.scores.slice(0,10).reverse())history.append(h('div',{class:'score-row'},[
        link('#/essays/'+s.essay_id,'第 '+s.essay_id+' 篇'),h('progress',{max:s.max,value:s.total}),h('span',{},s.total+' / '+s.max)]))
      view.append(history)
    }
    if(!data.items.length)view.append(h('p',{},'还没有作文。可以手动录入，也可以上传答题照片。'))
    for(const e of data.items)view.append(h('a',{class:'card essay-row',href:'#/essays/'+e.id},[h('strong',{},title(e)),
      h('span',{},[e.year,e.source,states[e.status],new Date(e.created_at).toLocaleDateString()].filter(Boolean).join(' · '))]))
  }
  function create(){
    const kind=h('select',{},[h('option',{value:'essay'},'论说文'),h('option',{value:'argument'},'论证有效性分析')])
    const source=h('input'),year=h('input',{inputmode:'numeric'}),material=h('textarea',{rows:5})
    view.append(h('h1',{},'新建作文'),h('div',{class:'card'},[field('类型',kind),field('题目来源',source),field('年份',year),
      field('题目或材料（也可在下一页上传材料照片）',material),button('保存并录入正文',async()=>{
        const e=await post('/api/essays',{kind:kind.value,source:source.value,year:year.value,prompt_text:material.value})
        location.hash='#/essays/'+e.id
      })]))
  }
  function report(g){
    const r=g.result,original=h('pre',{class:'essay-text'},g.transcript)
    const card=h('section',{class:'card essay-report'},[h('h3',{},r.total+' / '+r.max+' · '+r.band),
      h('p',{class:'dim'},g.grader+' · 校对稿 v'+g.revision+' · '+r.rubric_version),
      ...r.dimensions.map(d=>h('p',{},d.name+' '+d.score+'/'+d.max+'　'+d.comment)),original])
    function point(item,label) {
      const ranges=item.positions||[]
      const b=button(label,()=>{
        let cursor=0;original.replaceChildren()
        for(const [start,end] of ranges){original.append(g.transcript.slice(cursor,start),h('mark',{},g.transcript.slice(start,end)));cursor=end}
        original.append(g.transcript.slice(cursor));original.scrollIntoView({block:'nearest'})
      })
      if(!ranges.length){b.disabled=true;b.textContent+='（未定位）'}
      return b
    }
    for(const i of r.issues)card.append(point(i,i.kind+' · '+i.quote),h('p',{},i.problem+'　建议：'+i.fix))
    for(const f of r.flaws_found||[])card.append(point(f,f.type+' · '+f.quote),h('p',{},f.comment))
    for(const f of r.flaws_missed||[])card.append(h('p',{},'遗漏 · '+f.type+'　'+f.where+'　'+f.how_to_write))
    for(const s of [r.thesis,r.structure])if(s)card.append(h('p',{},s))
    card.append(h('h4',{},'改写示范'),h('p',{},r.rewrite_sample),h('h4',{},'下次练习'),h('ul',{},r.next_focus.map(x=>h('li',{},x))))
    return card
  }
  async function detail(id){
    const url='/api/essays/'+id
    let e=await API.req(url),editorRevision=e.revision,alive=true,dirty=false,imported=null,gradeKey=crypto.randomUUID()
    const urls=[],imageArea=h('div'),jobs=h('div'),source=h('textarea',{rows:5}),draft=h('textarea',{rows:12})
    source.value=e.prompt_text;draft.value=e.transcript||e.ocr_text
    source.oninput=draft.oninput=()=>{dirty=true}
    const imports=h('textarea',{rows:6,placeholder:'在这里粘贴模型返回的完整 JSON'})
    const preview=h('div'),reports=h('div',{class:'essay-reports'}),exchange=h('section',{class:'card'})
    const updateReports=()=>reports.replaceChildren(...e.gradings.map(report))
    function canExport(){if(dirty||!e.revision)throw new Error('请先保存并确认当前校对稿')}
    const pack=async()=>{canExport();return JSON.stringify(await post(url+'/package'),null,2)}
    const saveImport=button('确认保存这份批改',async()=>{
      if(!imported)throw new Error('请先预览结果')
      await post(url+'/gradings',{...imported,grader:origin.value});imports.value='';imported=null;preview.replaceChildren()
      saveImport.hidden=true;e=await API.req(url);updateReports();toast('批改已保存')
    })
    saveImport.hidden=true
    const origin=h('select',{},['chatgpt','claude','manual-import'].map(x=>h('option',{value:x},x)))
    const clearPreview=()=>{imported=null;saveImport.hidden=true;preview.replaceChildren()}
    imports.oninput=clearPreview
    const file=h('input',{type:'file',accept:'.json,application/json'})
    file.onchange=async()=>{if(file.files[0]){clearPreview();imports.value=await file.files[0].text()}}
    exchange.append(h('h2',{},'交给 ChatGPT 或 Claude'),h('p',{},'复制或下载已校对的材料，交给聊天客户端。将返回的 JSON 导入这里。'),
      button('复制批改材料',async()=>{await navigator.clipboard.writeText(await pack());toast('材料已复制')}),
      button('下载批改材料',async()=>download('essay-'+id+'-v'+e.revision+'.json',await pack())),
      field('批改来源（自行声明）',origin),field('结果文件',file),imports,
      button('校验并预览',async()=>{canExport();clearPreview();const candidate=JSON.parse(imports.value);const r=await post(url+'/preview',candidate)
        imported=candidate;preview.replaceChildren(report({result:r,transcript:e.transcript,grader:origin.value,revision:e.revision}));saveImport.hidden=false}),
      preview,saveImport,button('使用已配置的服务端模型',async()=>{canExport();await post(url+'/grade',{key:gradeKey});gradeKey=crypto.randomUUID();await refresh()}))
    async function refresh(){
      const fresh=await API.req(url);if(!alive)return
      const old=e;e=fresh
      if(!dirty){editorRevision=e.revision;draft.value=e.transcript||e.ocr_text;source.value=e.prompt_text}
      jobs.replaceChildren(...e.jobs.map(j=>h('p',{},[j.kind+' · '+j.status+' '+(j.error||''),
        j.status==='failed'?button('重试',()=>post('/api/jobs/'+j.id+'/retry')):null])))
      if(old.gradings.length!==e.gradings.length||e.gradings[0]?.id!==old.gradings[0]?.id)updateReports()
      exchange.hidden=!e.revision
    }
    async function showImages(){
      imageArea.replaceChildren()
      for(const im of e.images){
        const response=await fetch(url+'/images/'+im.id,{headers:{Authorization:'Bearer '+API.token}})
        if(!response.ok)throw new Error('读取图片失败')
        const blob=await response.blob();if(!alive)return
        const src=URL.createObjectURL(blob);urls.push(src)
        imageArea.append(h('figure',{},[h('figcaption',{},(im.role==='answer'?'答题':'材料')+'图 '+(im.position+1)),h('img',{src,class:'review-image',alt:'原图'})]))
      }
    }
    const files=h('input',{type:'file',accept:'image/*',multiple:true})
    const role=h('select',{},[h('option',{value:'answer'},'答题照片'),h('option',{value:'material'},'材料照片')])
    const uploads=h('div',{class:'card'},[role,files,button('上传所选图片',async()=>{
      const position=e.images.filter(im=>im.role===role.value).length
      for(const [i,f] of [...files.files].entries()){
        const image=await preprocessImage(f)
        await post(url+'/images',{role:role.value,position:position+i,image:image.dataUri})
      }
      files.value='';e=await API.req(url);await showImages()
    }),button('识别已上传图片',async()=>{await post(url+'/ocr');await refresh()})])
    uploads.hidden=!!e.revision
    view.append(link('#/essays','作文列表'),h('h1',{},title(e)+' · 第 '+id+' 篇'),uploads,jobs,
      h('div',{class:'review-columns'},[imageArea,h('div',{},[field('题目材料',source),field('校对稿（可直接手动填写）',draft),
        button('确认校对稿',async()=>{await post(url+'/confirm',{revision:editorRevision,transcript:draft.value,prompt_text:source.value})
          dirty=false;clearPreview();uploads.hidden=true;e=await API.req(url);editorRevision=e.revision;exchange.hidden=false;updateReports();toast('已确认 v'+e.revision)})])]),
      exchange,h('h2',{},'历次批改'),h('p',{class:'dim'},'估分仅供参考。当前采用训练量表，2027 年评分细则待核实。'),reports)
    exchange.hidden=!e.revision;updateReports()
    const timer=setInterval(()=>refresh().catch(()=>{}),3000)
    onLeave(()=>{alive=false;clearInterval(timer);urls.forEach(url=>URL.revokeObjectURL(url))})
    await showImages();await refresh()
  }
  async function tokens() {
    const name=h('input',{value:'学习助手'}),list=h('div'),secret=h('div')
    const scopes=['essays:read','essays:write','questions:read'].map(s=>h('input',{type:'checkbox',value:s,checked:s.startsWith('essays:')}))
    async function reload(){const data=await API.req('/api/tokens');list.replaceChildren(...data.items.map(t=>h('div',{class:'card'},[
      t.name+' · '+JSON.parse(t.scopes).join('、'),t.revoked_at?' · 已吊销':button('吊销',async()=>{await API.req('/api/tokens/'+t.id,{method:'DELETE'});secret.replaceChildren();await reload()})])))}
    view.append(link('#/essays','作文列表'),h('h1',{},'代理访问令牌'),field('令牌名称',name),
      ...scopes.map(i=>h('label',{},[i,i.value+' '])),
      button('生成令牌',async()=>{const x=await post('/api/tokens',{name:name.value,scopes:scopes.filter(i=>i.checked).map(i=>i.value)})
        secret.replaceChildren(h('p',{},'请现在复制到本机客户端；离开页面后无法再次查看。'),h('textarea',{readonly:true},x.token));await reload()}),secret,list)
    await reload()
  }
  return {essays:async id=>id==='new'?create():id?detail(Number(id)):list(), 'essay-tokens':tokens}
}
