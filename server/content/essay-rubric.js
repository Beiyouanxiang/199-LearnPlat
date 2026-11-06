// 原创训练配分。出版信息可核实，2027版逐项扣分细则仍待核实。
export const rubric = {
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
