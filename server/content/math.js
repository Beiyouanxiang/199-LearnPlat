// 199 数学基础：知识点树 + 内置公式卡片。
// 知识点以名称存进 questions.knowledge_points（与旧数据的自由文本兼容），名称在树内唯一。
// 公式卡片为内置只读内容，用户复习进度存 card_reviews 表（按 card key 关联）。

export const KNOWLEDGE_TREE = [
  {
    module: '算术',
    points: ['整数与整除', '质数与合数', '奇偶性', '分数小数百分数', '比与比例', '绝对值', '实数运算'],
  },
  {
    module: '代数',
    points: [
      '整式与因式分解', '分式', '一元二次函数', '指数与对数', '一元二次方程与韦达定理',
      '不等式', '均值不等式', '等差数列', '等比数列', '数列综合',
    ],
  },
  {
    module: '几何',
    points: [
      '三角形', '四边形', '圆与扇形', '阴影面积', '立体几何',
      '直线与方程', '圆的方程', '直线与圆的位置关系', '对称与最值',
    ],
  },
  {
    module: '数据分析',
    points: ['计数原理', '排列组合', '古典概率', '独立事件与伯努利', '平均数与方差', '图表分析'],
  },
  {
    module: '应用题',
    points: ['利润与增长率', '行程问题', '工程问题', '浓度问题', '集合容斥', '最值与优化', '其他应用题'],
  },
]

export const ALL_POINTS = KNOWLEDGE_TREE.flatMap((m) => m.points)

export function moduleOf(point) {
  return KNOWLEDGE_TREE.find((m) => m.points.includes(point))?.module || '其他'
}

// 条件充分性判断的固定选项定义（讲解 prompt 与前端共用）
export const SUFFICIENCY_OPTIONS = {
  A: '条件(1)充分，但条件(2)不充分',
  B: '条件(2)充分，但条件(1)不充分',
  C: '条件(1)和(2)单独都不充分，但联合起来充分',
  D: '条件(1)充分，条件(2)也充分',
  E: '条件(1)和(2)单独都不充分，联合起来也不充分',
}

// 公式卡片：front 是提问，back 是答案；$...$ 为 KaTeX 公式。
// key 一旦发布不要改（复习进度按 key 关联）。
export const FORMULA_CARDS = [
  // ---------- 算术 ----------
  { key: 'ar-divisible', kp: '整数与整除', front: '常用整除特征（2、3、4、5、8、9、11）',
    back: '- 2/5：看末位\n- 4：末两位能被 4 整除；8：末三位能被 8 整除\n- 3/9：各位数字之和能被 3/9 整除\n- 11：奇数位数字和与偶数位数字和之差能被 11 整除' },
  { key: 'ar-parity', kp: '奇偶性', front: '奇偶运算规律',
    back: '- 奇±奇=偶，奇±偶=奇，偶±偶=偶\n- 奇×奇=奇，有偶数参与的乘积必为偶\n- 两个整数的和与差奇偶性相同' },
  { key: 'ar-prime', kp: '质数与合数', front: '质数要点（含 20 以内质数）',
    back: '- 2 是唯一的偶质数；1 既不是质数也不是合数\n- 20 以内质数：2, 3, 5, 7, 11, 13, 17, 19\n- 两质数之和为奇数 ⇒ 其中一个必为 2' },
  { key: 'ar-gcd', kp: '整数与整除', front: '最大公约数与最小公倍数的关系',
    back: '$a \\cdot b = (a,b)\\cdot[a,b]$\n\n其中 $(a,b)$ 为最大公约数，$[a,b]$ 为最小公倍数（$a,b$ 为正整数）。' },
  { key: 'ar-abs-tri', kp: '绝对值', front: '绝对值三角不等式及取等条件',
    back: '$|a|-|b| \\le |a \\pm b| \\le |a|+|b|$\n\n- $|a+b|=|a|+|b| \\iff ab \\ge 0$\n- $|a-b|=|a|+|b| \\iff ab \\le 0$' },
  { key: 'ar-abs-geo', kp: '绝对值', front: '$|x-a|+|x-b|$ 与 $|x-a|-|x-b|$ 的最值',
    back: '- $|x-a|+|x-b|$ 最小值为 $|a-b|$（$x$ 在 $a,b$ 之间时取到），无最大值\n- $|x-a|-|x-b|$ 的取值范围是 $[-|a-b|,\\ |a-b|]$' },
  { key: 'ar-ratio', kp: '比与比例', front: '等比定理',
    back: '若 $\\dfrac{a}{b}=\\dfrac{c}{d}=k$，则 $\\dfrac{a+c}{b+d}=k$（$b+d\\ne 0$）。\n\n常用于"连比设 $k$"：$a=bk,\\ c=dk$。' },
  { key: 'ar-percent', kp: '分数小数百分数', front: '百分比的两个常见陷阱',
    back: '- 先涨 $p$ 再降 $p$：结果是原来的 $(1+p)(1-p)=1-p^2$ 倍，比原来小\n- 甲比乙多 $p$ ⇒ 甲 $=$ 乙 $\\times(1+p)$；此时乙比甲少 $\\dfrac{p}{1+p}$，不是 $p$' },

  // ---------- 代数 ----------
  { key: 'al-mul', kp: '整式与因式分解', front: '乘法公式（平方、立方）',
    back: '- $(a\\pm b)^2=a^2\\pm 2ab+b^2$，$a^2-b^2=(a+b)(a-b)$\n- $a^3\\pm b^3=(a\\pm b)(a^2\\mp ab+b^2)$\n- $(a+b+c)^2=a^2+b^2+c^2+2ab+2bc+2ca$' },
  { key: 'al-sumsq', kp: '整式与因式分解', front: '$a^2+b^2+c^2-ab-bc-ca$ 配方',
    back: '$a^2+b^2+c^2-ab-bc-ca=\\dfrac12\\left[(a-b)^2+(b-c)^2+(c-a)^2\\right]\\ge 0$\n\n等于 0 当且仅当 $a=b=c$。' },
  { key: 'al-recip', kp: '整式与因式分解', front: '已知 $x+\\dfrac1x=t$，求 $x^2+\\dfrac1{x^2}$ 和 $x^3+\\dfrac1{x^3}$',
    back: '- $x^2+\\dfrac1{x^2}=t^2-2$\n- $x^3+\\dfrac1{x^3}=t^3-3t$' },
  { key: 'al-quad-root', kp: '一元二次方程与韦达定理', front: '一元二次方程 $ax^2+bx+c=0$ 的判别式与求根公式',
    back: '$\\Delta=b^2-4ac$：$\\Delta>0$ 两个不等实根，$\\Delta=0$ 两个相等实根，$\\Delta<0$ 无实根。\n\n$x=\\dfrac{-b\\pm\\sqrt{\\Delta}}{2a}$' },
  { key: 'al-vieta', kp: '一元二次方程与韦达定理', front: '韦达定理及常用变形',
    back: '$x_1+x_2=-\\dfrac ba,\\quad x_1x_2=\\dfrac ca$\n\n- $x_1^2+x_2^2=(x_1+x_2)^2-2x_1x_2$\n- $\\dfrac1{x_1}+\\dfrac1{x_2}=-\\dfrac bc$\n- $|x_1-x_2|=\\dfrac{\\sqrt{\\Delta}}{|a|}$' },
  { key: 'al-root-dist', kp: '一元二次方程与韦达定理', front: '根的符号分布条件',
    back: '- 两个正根：$\\Delta\\ge0,\\ x_1+x_2>0,\\ x_1x_2>0$\n- 两个负根：$\\Delta\\ge0,\\ x_1+x_2<0,\\ x_1x_2>0$\n- 一正一负：$x_1x_2=\\dfrac ca<0$（此时 $\\Delta>0$ 自动成立）' },
  { key: 'al-parabola', kp: '一元二次函数', front: '二次函数 $y=ax^2+bx+c$ 的顶点与最值',
    back: '对称轴 $x=-\\dfrac{b}{2a}$，顶点 $\\left(-\\dfrac{b}{2a},\\ \\dfrac{4ac-b^2}{4a}\\right)$\n\n$a>0$ 开口向上，有最小值；$a<0$ 开口向下，有最大值。区间上求最值要看对称轴是否在区间内。' },
  { key: 'al-quad-ineq', kp: '不等式', front: '一元二次不等式的解（$a>0,\\ \\Delta>0$，两根 $x_1<x_2$）',
    back: '- $ax^2+bx+c>0$：$x<x_1$ 或 $x>x_2$（大于取两边）\n- $ax^2+bx+c<0$：$x_1<x<x_2$（小于取中间）\n- $ax^2+bx+c>0$ 对一切 $x$ 恒成立（$a\\ne0$）⇔ $a>0$ 且 $\\Delta<0$' },
  { key: 'al-amgm', kp: '均值不等式', front: '均值不等式及使用口诀',
    back: '$a,b>0$ 时 $\\dfrac{a+b}{2}\\ge\\sqrt{ab}$，当且仅当 $a=b$ 取等。\n\n- 和为定值 ⇒ 积有最大值；积为定值 ⇒ 和有最小值\n- $x>0$ 时 $x+\\dfrac1x\\ge2$\n- 三元：$\\dfrac{a+b+c}{3}\\ge\\sqrt[3]{abc}$\n- 口诀"一正二定三相等"' },
  { key: 'al-exp', kp: '指数与对数', front: '指数运算法则',
    back: '$a^m\\cdot a^n=a^{m+n}$，$(a^m)^n=a^{mn}$，$(ab)^n=a^nb^n$\n\n$a^{-n}=\\dfrac1{a^n}$，$a^{\\frac mn}=\\sqrt[n]{a^m}$，$a^0=1\\ (a\\ne0)$' },
  { key: 'al-log', kp: '指数与对数', front: '对数运算法则',
    back: '- $\\log_a(MN)=\\log_aM+\\log_aN$，$\\log_a\\dfrac MN=\\log_aM-\\log_aN$\n- $\\log_aM^n=n\\log_aM$\n- 换底：$\\log_ab=\\dfrac{\\lg b}{\\lg a}$\n- $\\log_a1=0$，$\\log_aa=1$，$a^{\\log_aN}=N$' },
  { key: 'al-frac-eq', kp: '分式', front: '解分式方程最容易漏的一步',
    back: '去分母后得到的解**必须验根**：使原分母为 0 的根是增根，要舍去。' },
  { key: 'al-arith', kp: '等差数列', front: '等差数列通项、求和与性质',
    back: '$a_n=a_1+(n-1)d$，$S_n=\\dfrac{n(a_1+a_n)}{2}=na_1+\\dfrac{n(n-1)}{2}d$\n\n- $m+n=p+q \\Rightarrow a_m+a_n=a_p+a_q$\n- $S_n$ 是关于 $n$ 的二次函数且没有常数项\n- $S_n,\\ S_{2n}-S_n,\\ S_{3n}-S_{2n}$ 仍成等差' },
  { key: 'al-geo', kp: '等比数列', front: '等比数列通项、求和与性质',
    back: '$a_n=a_1q^{n-1}$；$q\\ne1$ 时 $S_n=\\dfrac{a_1(1-q^n)}{1-q}$，$q=1$ 时 $S_n=na_1$\n\n- $m+n=p+q \\Rightarrow a_ma_n=a_pa_q$\n- $|q|<1$ 时无穷项和 $S=\\dfrac{a_1}{1-q}$' },
  { key: 'al-sn', kp: '数列综合', front: '由 $S_n$ 求 $a_n$',
    back: '$a_1=S_1$；$n\\ge2$ 时 $a_n=S_n-S_{n-1}$。\n\n最后检查 $n=1$ 是否满足 $n\\ge2$ 的式子，不满足要分段写。' },
  { key: 'al-sums', kp: '数列综合', front: '常用求和公式与裂项',
    back: '- $1+2+\\cdots+n=\\dfrac{n(n+1)}{2}$\n- $1^2+2^2+\\cdots+n^2=\\dfrac{n(n+1)(2n+1)}{6}$\n- 裂项：$\\dfrac1{n(n+1)}=\\dfrac1n-\\dfrac1{n+1}$，$\\dfrac1{n(n+k)}=\\dfrac1k\\left(\\dfrac1n-\\dfrac1{n+k}\\right)$' },

  // ---------- 几何 ----------
  { key: 'ge-tri', kp: '三角形', front: '三角形三边关系与面积公式',
    back: '- 两边之和大于第三边，两边之差小于第三边\n- $S=\\dfrac12ah=\\dfrac12ab\\sin C$\n- 同高的三角形，面积比 = 底边之比' },
  { key: 'ge-right', kp: '三角形', front: '直角三角形常用结论',
    back: '- 勾股定理 $a^2+b^2=c^2$；常见勾股数：3-4-5，5-12-13，6-8-10，8-15-17，7-24-25\n- 30°-60°-90° 三边比 $1:\\sqrt3:2$；45°-45°-90° 三边比 $1:1:\\sqrt2$\n- 斜边上的中线等于斜边的一半' },
  { key: 'ge-equi', kp: '三角形', front: '边长为 $a$ 的等边三角形',
    back: '高 $=\\dfrac{\\sqrt3}{2}a$，面积 $=\\dfrac{\\sqrt3}{4}a^2$' },
  { key: 'ge-similar', kp: '三角形', front: '相似三角形的比例关系',
    back: '对应边之比 = 相似比 $k$；周长比 $=k$；**面积比 $=k^2$**。' },
  { key: 'ge-incircle', kp: '三角形', front: '三角形内切圆、外接圆半径',
    back: '- 一般三角形内切圆：$r=\\dfrac{2S}{a+b+c}$\n- 直角三角形（$c$ 为斜边）：内切圆 $r=\\dfrac{a+b-c}{2}$，外接圆 $R=\\dfrac c2$' },
  { key: 'ge-circle', kp: '圆与扇形', front: '圆与扇形公式（圆心角 $\\theta$ 用角度）',
    back: '- 周长 $2\\pi r$，面积 $\\pi r^2$\n- 弧长 $l=\\dfrac{\\theta}{360^\\circ}\\cdot2\\pi r$，扇形面积 $=\\dfrac{\\theta}{360^\\circ}\\pi r^2=\\dfrac12lr$\n- 圆周角 = 同弧所对圆心角的一半；直径所对的圆周角是 $90^\\circ$' },
  { key: 'ge-quad', kp: '四边形', front: '梯形、菱形、平行四边形面积',
    back: '- 梯形：$\\dfrac{(a+b)h}{2}$\n- 菱形：两条对角线乘积的一半\n- 平行四边形：底 × 高' },
  { key: 'ge-shadow', kp: '阴影面积', front: '阴影面积的三种常用思路',
    back: '1. **割补**：把阴影拆开或补成规则图形\n2. **整体减空白**：阴影 = 大图形 − 非阴影部分\n3. **等积变形**：同底等高的三角形面积相等，平移/旋转后再算' },
  { key: 'ge-cuboid', kp: '立体几何', front: '长方体与正方体',
    back: '- 长方体：$V=abc$，表面积 $2(ab+bc+ca)$，体对角线 $\\sqrt{a^2+b^2+c^2}$\n- 正方体（棱长 $a$）：内切球半径 $\\dfrac a2$，外接球半径 $\\dfrac{\\sqrt3}{2}a$' },
  { key: 'ge-cyl', kp: '立体几何', front: '圆柱与球',
    back: '- 圆柱：$V=\\pi r^2h$，侧面积 $2\\pi rh$，表面积 $2\\pi r^2+2\\pi rh$\n- 球：$V=\\dfrac43\\pi R^3$，表面积 $4\\pi R^2$' },
  { key: 'ge-line', kp: '直线与方程', front: '斜率与两直线位置关系',
    back: '- 斜率 $k=\\dfrac{y_2-y_1}{x_2-x_1}$\n- 平行：$k_1=k_2$ 且截距不等\n- 垂直：$k_1k_2=-1$（或一条竖直、一条水平）' },
  { key: 'ge-dist', kp: '直线与方程', front: '点到直线距离、平行线间距离',
    back: '点 $(x_0,y_0)$ 到直线 $Ax+By+C=0$：$d=\\dfrac{|Ax_0+By_0+C|}{\\sqrt{A^2+B^2}}$\n\n平行线 $Ax+By+C_1=0$ 与 $Ax+By+C_2=0$：$d=\\dfrac{|C_1-C_2|}{\\sqrt{A^2+B^2}}$' },
  { key: 'ge-circle-eq', kp: '圆的方程', front: '圆的标准方程与一般方程',
    back: '标准：$(x-a)^2+(y-b)^2=r^2$，圆心 $(a,b)$\n\n一般：$x^2+y^2+Dx+Ey+F=0$，圆心 $\\left(-\\dfrac D2,-\\dfrac E2\\right)$，$r=\\dfrac12\\sqrt{D^2+E^2-4F}$（要求 $D^2+E^2-4F>0$）' },
  { key: 'ge-line-circle', kp: '直线与圆的位置关系', front: '直线与圆、圆与圆的位置关系',
    back: '圆心到直线距离 $d$：$d<r$ 相交，$d=r$ 相切，$d>r$ 相离；弦长 $=2\\sqrt{r^2-d^2}$\n\n两圆圆心距 $d$：$d>R+r$ 外离，$d=R+r$ 外切，$|R-r|<d<R+r$ 相交，$d=|R-r|$ 内切，$d<|R-r|$ 内含' },
  { key: 'ge-sym', kp: '对称与最值', front: '点 $(x,y)$ 的常见对称点',
    back: '- 关于 $x$ 轴：$(x,-y)$；关于 $y$ 轴：$(-x,y)$；关于原点：$(-x,-y)$\n- 关于 $y=x$：$(y,x)$；关于 $y=-x$：$(-y,-x)$\n- "将军饮马"求折线最短：先作对称点，再连直线' },

  // ---------- 数据分析 ----------
  { key: 'da-principle', kp: '计数原理', front: '加法原理与乘法原理',
    back: '**分类**用加法（各类方法互不重叠，任选一类即可完成）；**分步**用乘法（每一步都要完成）。' },
  { key: 'da-perm', kp: '排列组合', front: '排列数与组合数',
    back: '$A_n^m=\\dfrac{n!}{(n-m)!}$，$C_n^m=\\dfrac{n!}{m!(n-m)!}$\n\n- $C_n^m=C_n^{n-m}$\n- $C_n^0+C_n^1+\\cdots+C_n^n=2^n$\n- 有顺序用 $A$，无顺序用 $C$' },
  { key: 'da-tricks', kp: '排列组合', front: '排列组合常用技巧',
    back: '- **相邻**：捆绑法（捆成一个整体，内部再排）\n- **不相邻**：插空法（先排其他元素，再插空）\n- **定序**：先全排列，再除以定序元素的全排列数\n- **相同元素分组**：隔板法，$n$ 个相同元素分给 $m$ 组、每组至少 1 个：$C_{n-1}^{m-1}$' },
  { key: 'da-derange', kp: '排列组合', front: '错排数（每个元素都不在自己的位置上）',
    back: '1, 2, 3, 4, 5 个元素的错排数分别为 **0, 1, 2, 9, 44**。' },
  { key: 'da-prob', kp: '古典概率', front: '古典概型与对立事件',
    back: '$P(A)=\\dfrac{A\\text{ 包含的基本事件数}}{\\text{基本事件总数}}$\n\n$P(\\bar A)=1-P(A)$，看到"至少一个"优先考虑对立事件。' },
  { key: 'da-indep', kp: '独立事件与伯努利', front: '独立事件与伯努利概型',
    back: '- 独立：$P(AB)=P(A)P(B)$\n- $n$ 次独立重复试验中恰好发生 $k$ 次：$C_n^kp^k(1-p)^{n-k}$\n- 至少发生一次：$1-(1-p)^n$' },
  { key: 'da-var', kp: '平均数与方差', front: '方差公式与数据变换',
    back: '$s^2=\\dfrac1n\\sum(x_i-\\bar x)^2=\\dfrac1n\\sum x_i^2-\\bar x^2$\n\n- 每个数据都加 $c$：平均数 $+c$，方差不变\n- 每个数据都乘 $k$：平均数 $\\times k$，方差 $\\times k^2$' },

  // ---------- 应用题 ----------
  { key: 'ap-profit', kp: '利润与增长率', front: '利润与增长率公式',
    back: '- 利润 = 售价 − 成本，利润率 $=\\dfrac{\\text{利润}}{\\text{成本}}$\n- 连续增长：$a(1+p)^n$\n- 增长率 $=\\dfrac{\\text{现值}-\\text{原值}}{\\text{原值}}$（分母是原值）' },
  { key: 'ap-travel', kp: '行程问题', front: '行程问题核心公式',
    back: '- 相遇：$S=(v_1+v_2)t$；追及：$S=(v_1-v_2)t$\n- 顺水速度 = 船速 + 水速，逆水速度 = 船速 − 水速\n- 环形跑道：同向每追上一次多跑一圈，反向每相遇一次合跑一圈' },
  { key: 'ap-work', kp: '工程问题', front: '工程问题的设法',
    back: '工作总量设为 1，效率 $=\\dfrac1{\\text{单独完成时间}}$，合作效率相加。\n\n时间 = 总量 ÷ 效率。' },
  { key: 'ap-conc', kp: '浓度问题', front: '浓度问题的守恒量',
    back: '溶质 = 溶液 × 浓度。\n\n- 加水/蒸发：溶质不变\n- 混合：混合前后溶质总量守恒，可用十字交叉法求配比' },
  { key: 'ap-incl', kp: '集合容斥', front: '两集合、三集合容斥公式',
    back: '$|A\\cup B|=|A|+|B|-|A\\cap B|$\n\n$|A\\cup B\\cup C|=|A|+|B|+|C|-|A\\cap B|-|B\\cap C|-|A\\cap C|+|A\\cap B\\cap C|$' },

  // ---------- 条件充分性判断 ----------
  { key: 'sc-def', kp: null, front: '条件充分性判断：A、B、C、D、E 分别表示什么？',
    back: Object.entries(SUFFICIENCY_OPTIONS).map(([k, v]) => `- **${k}**：${v}`).join('\n') },
  { key: 'sc-method', kp: null, front: '条件充分性判断的解题流程与技巧',
    back: '1. 先单独看条件(1)，再单独看条件(2)，都不充分才考虑联合\n2. **小范围推大范围**：条件的取值范围包含于结论的取值范围 ⇒ 充分\n3. 怀疑不充分时，**找一个反例**就能否定\n4. 能代特值就别硬算：在条件允许的范围里取简单数验证\n5. 两条件等价时，答案只能是 D 或 E' },
]

export const CARD_KEYS = new Set(FORMULA_CARDS.map((c) => c.key))
