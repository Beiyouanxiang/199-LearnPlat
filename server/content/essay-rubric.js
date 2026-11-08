// 历史量表保持原样，旧材料包和批改记录继续按原版本解释。
const trainingV1 = {
  version: '2027-training-v1',
  notice: '训练估分。维度权重为平台练习用配分，2027 年评分细则待人工核实。',
  reference: 'https://xuanshu.hep.com.cn/front/book/findBookDetails?bookId=6aa19104e119ac97297a58a3',
  historical: 'https://yz.chsi.com.cn/kyzx/zyk/201310/20131015/527040626.html',
  argument: { max: 30, dimensions: { '缺陷识别与分析':16,'论证组织与表达':14 },
    criteria: ['判断论据能否支持结论','解释概念、因果、样本和类比方面的漏洞','围绕材料分析具体影响'], band:'训练估分' },
  essay: { max:35, dimensions:{'立意':10,'论证':12,'结构':7,'语言':6},
    criteria:['回应题意','用证据支持自己的观点','段落各有明确作用','语言清楚准确'],
    bands:[['一类卷',30],['二类卷',24],['三类卷',18],['四类卷',11],['五类卷',0]] },
  deductions: '漏标题、明显字数不足应说明。历史论说文参考为漏标题扣2分。未核实当年统一扣分细则前，仅列问题与依据，不重复扣分。只评价校对稿中的真实错字。'
}

// 分档与扣分依据见 docs/ESSAY-RUBRIC-2027.md；以下描述均为原创概括。
export const rubric = {
  version: '2027-verified-v1',
  verified_at: '2026-11-06',
  notice: '2027 写作评分要求已核实，以下为原创概括。模型给分仍是练习估分；论说文四维权重为平台训练配分。',
  reference: trainingV1.reference,
  historical: 'https://yz.chsi.com.cn/kyzx/zyk/201504/20150408/1442565824.html',
  verification: '依据交接确认的 2027 评分事实，并参照公开大纲发布信息与评分资料；2027 相对 2026 无实质考点调整。',
  argument: {
    max:30, target_words:600,
    dimensions:{'缺陷识别与分析':16,'论证组织与表达':14},
    criteria:['找准材料中影响结论成立的漏洞，并解释其影响','区分材料已有证据与尚未证实的假设','逐点展开分析，让段落衔接和措辞服务于推理'],
    flaw_types:['概念混淆/偷换概念','以偏概全','强加因果/因果倒置','非黑即白','不当类比','论据不足/推不出','自相矛盾','忽略他因','滑坡','预期理由','形式谬误'],
    band_dimension:'论证组织与表达',
    band_notice:'四档只评价 14 分的论证组织与表达部分，不代表 30 分总分的分档。',
    bands:[['一类卷',12,14],['二类卷',8,11],['三类卷',4,7],['四类卷',0,3]],
    band_descriptions:{
      '一类卷':'反驳步骤充分，段落安排有助于读者跟上分析，措辞准确而简洁。',
      '二类卷':'主要分析能够展开，篇章顺序基本合理，个别表达仍需打磨。',
      '三类卷':'已有一些分析，但步骤跳跃或段落断裂削弱了说明力。',
      '四类卷':'难以形成针对材料的连贯分析，组织和表达明显妨碍理解。',
    },
  },
  essay: {
    max:35, target_words:700,
    dimensions:{'立意':10,'论证':12,'结构':7,'语言':6},
    dimension_notice:'四维分数用于反馈与合计；正式评分按内容、结构、语言综合判断，未规定这组细分权重。',
    criteria:['准确回应材料问题，提出可辩护的中心判断','用事例与推理建立观点和证据之间的联系','让段落共同推进论点，并回应必要的限制条件','用清楚、准确的语句传达思想'],
    bands:[['一类卷',30,35],['二类卷',24,29],['三类卷',18,23],['四类卷',11,17],['五类卷',0,10]],
    band_descriptions:{
      '一类卷':'对题意的理解有深度，中心判断贯穿全文，推理与篇章相互支持，表达成熟。',
      '二类卷':'观点与题意相合，理由能够支撑主要结论，段落推进清楚，阅读顺畅。',
      '三类卷':'能看出中心观点，整体可读，但说理或行文仍有局部薄弱之处。',
      '四类卷':'观点含混或支撑不足，篇章存在明显缺口，表达问题影响理解。',
      '五类卷':'未能围绕题目形成可辨认的论述，或内容与组织严重欠缺。',
    },
  },
  deduction_rules:{
    missing_title:{points:2,approximate:true,comment:'两类作文缺标题时参考扣约 2 分。'},
    typos:{per_distinct_errors:3,points:1,max_points:2,repeat_counts:false,comment:'只计校对稿中真实的错别字；同一错字重复出现不重复计数，参考每 3 个扣 1 分、累计约不超过 2 分。'},
    length:{comment:'论证有效性分析约 600 字，论说文约 700 字。篇幅明显不足时说明对分析或论述完整性的影响，不虚构每少若干字的统一扣分阶梯。'},
    application:'标题、错字和篇幅问题须写明依据，体现在相应维度的最终得分与评语中；维度合计即总分，不在合计后再次扣分。没有原图不评价卷面，OCR 校对更正不计为考生错字。',
  },
  deductions:'缺标题参考扣约 2 分；不同错别字参考每 3 个扣 1 分、最多约 2 分，重复不计。分析约 600 字，论说文约 700 字。扣分计入维度并说明理由，不重复扣分，不把 OCR 误识别算作错字。',
}

export const rubricVersions = Object.freeze({[trainingV1.version]:trainingV1,[rubric.version]:rubric})
export function getRubric(version=rubric.version) {
  return Object.hasOwn(rubricVersions,version)?rubricVersions[version]:undefined
}
