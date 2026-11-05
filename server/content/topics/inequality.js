// 代数 · 不等式。讲解、例题与练习均为原创，答案经 scripts/verify-topics.py 验算。
const r = String.raw

export const CHAPTER_INEQUALITY = {
  id: 'inequality',
  name: '不等式',
  intro: '不等式题的主线：解集端点就是方程的根；恒成立转化成最值；求最值想均值不等式。',
  topics: [
    {
      id: 'alg-quad-ineq',
      name: '一元二次不等式与恒成立',
      kp: '不等式',
      freq: 3,
      signals: ['解一元二次不等式、数整数解', '已知解集，反求系数', '"对一切实数 $x$ 恒成立"', '"解集为空集"'],
      think: '解集端点就是对应方程的根；对所有 $x$ 恒成立，看开口方向和判别式。',
      route: [
        { q: '是直接解不等式吗？', a: r`先解对应的方程得到两根，再根据开口方向写解集：开口向上时，$>0$ 取两根之外，$<0$ 取两根之间。（"大于取两边，小于夹中间"）` },
        { q: '给了解集，反求系数？', a: r`解集的端点就是方程的两根；解集的形状告诉你开口方向：解集是"中间一段"→ 开口向下（对 $>0$ 而言）。然后用韦达定理列出系数关系。` },
        { q: '要求对一切实数 $x$ 恒成立？', a: r`$ax^2+bx+c>0$ 恒成立 ⇔ $a>0$ 且 $\Delta<0$。**二次项系数含参数时先讨论它等于 0 的情况**，这时变成一次或常数，单独判断。` },
        { q: '说"解集为空集"？', a: r`$f(x)<0$ 无解 ⇔ $f(x)\ge0$ 恒成立，转化成恒成立问题。` },
      ],
      tools: [
        r`$a>0$ 时：$ax^2+bx+c>0$ 的解集在两根之外，$<0$ 在两根之间`,
        r`$ax^2+bx+c>0$ 恒成立 $\Leftrightarrow a>0,\ \Delta<0$（或 $a=b=0,\ c>0$）`,
        r`解集端点 $x_1,x_2$：$x_1+x_2=-\frac ba$，$x_1x_2=\frac ca$`,
      ],
      tricks: ['已知解集求系数，用韦达最快', '选择题代一个解集内的点检验'],
      traps: ['二次项系数含参数时漏掉它为 0 的情况', '由解集反推时开口方向弄反'],
      examples: [
        {
          level: 2,
          type: 'ps',
          stem: r`不等式 $ax^2+bx+2>0$ 的解集为 $\left(-\frac12,\frac13\right)$，则 $a+b=$（　）`,
          options: [r`$-14$`, r`$-10$`, r`$10$`, r`$14$`, r`$-12$`],
          answer: 'A',
          think: [
            r`解集是"中间一段"且是 $>0$ → 开口向下，$a<0$`,
            r`端点 $-\frac12$、$\frac13$ 是方程 $ax^2+bx+2=0$ 的两根`,
            '用韦达定理：两根之积 $=\\frac2a$，两根之和 $=-\\frac ba$',
          ],
          solution: r`两根之积 $-\frac16=\frac2a$，$a=-12$；两根之和 $-\frac16=-\frac ba$，$b=\frac a6=-2$。

$a+b=-14$。`,
        },
        {
          level: 3,
          type: 'ps',
          stem: r`不等式 $(a-2)x^2+2(a-2)x-4<0$ 对一切实数 $x$ 恒成立，则 $a$ 的取值范围是（　）`,
          options: [r`$-2<a<2$`, r`$-2<a\le2$`, r`$a\le2$`, r`$a<-2$`, r`$-2\le a\le2$`],
          answer: 'B',
          think: [
            r`二次项系数 $a-2$ 含参数 → 先讨论 $a=2$：不等式变成 $-4<0$，恒成立 ✓`,
            r`$a\neq2$：要对所有 $x$ 都 $<0$，必须开口向下且与 $x$ 轴无交点`,
          ],
          solution: r`$a=2$：$-4<0$ 恒成立 ✓。

$a\neq2$：需 $a-2<0$ 且 $\Delta=4(a-2)^2+16(a-2)<0$，即 $(a-2)(a+2)<0$，得 $-2<a<2$。

合并：$-2<a\le2$。`,
        },
      ],
      practice: [
        {
          level: 1,
          type: 'ps',
          stem: r`不等式 $x^2-x-6<0$ 的整数解有（　）个`,
          options: [r`$4$`, r`$5$`, r`$6$`, r`$3$`, r`$2$`],
          answer: 'A',
          hint: '两根 $-2$ 和 3，小于 0 夹中间。',
          solution: r`$(x-3)(x+2)<0$，$-2<x<3$，整数解 $-1,0,1,2$，共 4 个。`,
        },
        {
          level: 2,
          type: 'ps',
          stem: r`不等式 $x^2+ax+b<0$ 的解集为 $(1,3)$，则 $ab=$（　）`,
          options: [r`$12$`, r`$-1$`, r`$-12$`, r`$7$`, r`$-7$`],
          answer: 'C',
          hint: '1 和 3 是方程 $x^2+ax+b=0$ 的两根。',
          solution: r`$1+3=-a$，$a=-4$；$1\times3=b$，$b=3$。$ab=-12$。`,
        },
        {
          level: 2,
          type: 'ps',
          stem: r`不等式 $x^2-mx+1>0$ 对一切实数 $x$ 恒成立，则 $m$ 的取值范围是（　）`,
          options: [r`$m<2$`, r`$-2<m<2$`, r`$m>-2$`, r`$-2\le m\le2$`, r`$m<-2$ 或 $m>2$`],
          answer: 'B',
          hint: '开口向上，只需 $\\Delta<0$。',
          solution: r`$\Delta=m^2-4<0$，$-2<m<2$。`,
        },
        {
          level: 2,
          type: 'sc',
          stem: r`不等式 $kx^2-kx+1>0$ 对一切实数 $x$ 恒成立。

(1) $0<k<4$

(2) $k=0$`,
          answer: 'D',
          hint: '先求出使其恒成立的 $k$ 的全部范围，注意 $k=0$。',
          solution: r`$k=0$：$1>0$ 恒成立。$k\neq0$：需 $k>0$ 且 $\Delta=k^2-4k<0$，即 $0<k<4$。所以范围是 $0\le k<4$。

(1)(2) 都在范围内，各自充分，选 D。`,
        },
        {
          level: 3,
          type: 'ps',
          stem: r`不等式 $ax^2+bx+c>0$ 的解集为 $(1,2)$，则不等式 $cx^2+bx+a>0$ 的解集为（　）`,
          options: [r`$\left(\frac12,1\right)$`, r`$(1,2)$`, r`$\left(-1,-\frac12\right)$`, r`$x<\frac12$ 或 $x>1$`, r`$(-2,-1)$`],
          answer: 'A',
          hint: '由解集得 $a<0$，并把 $b,c$ 都用 $a$ 表示，代入第二个不等式后两边除以 $a$（注意变号）。',
          solution: r`$a<0$，$1+2=-\frac ba$，$b=-3a$；$1\times2=\frac ca$，$c=2a$。

$cx^2+bx+a=2ax^2-3ax+a>0$，两边除以 $a<0$：$2x^2-3x+1<0$，$(2x-1)(x-1)<0$，解集 $\left(\frac12,1\right)$。`,
        },
        {
          level: 3,
          type: 'sc',
          stem: r`不等式 $x^2+(a-1)x+1\ge0$ 对一切实数 $x$ 成立。

(1) $0\le a\le3$

(2) $|a|\le2$`,
          answer: 'A',
          hint: '恒 $\\ge0$ ⇔ $\\Delta\\le0$，求出 $a$ 的范围。',
          solution: r`$\Delta=(a-1)^2-4\le0$ ⇔ $-1\le a\le3$。

(1) 在范围内，充分。(2) 包含 $a=-2$，此时 $\Delta=5>0$，不充分。选 A。`,
        },
      ],
    },
    {
      id: 'alg-range-ineq',
      name: '区间恒成立：分离参数',
      kp: '不等式',
      freq: 2,
      signals: ['"对 $x\\in[1,2]$ 恒成立"（只在某个区间上）', '"存在 $x$ 使不等式成立"', '参数和 $x$ 混在一起'],
      think: '把参数单独放一边：恒成立 → 参数和函数的最值比；存在 → 和另一个最值比。',
      route: [
        { q: '是对所有实数恒成立，还是只在某个区间上？', a: r`所有实数 → 用判别式（上一个题型）。**只在区间上** → 判别式不管用了，用分离参数。` },
        { q: '参数能单独放到一边吗？', a: r`例如 $x^2-ax+1\ge0$ 在 $[1,2]$ 上：$x>0$，两边除以 $x$ 得 $a\le x+\frac1x$。除以含 $x$ 的式子时注意它的正负。` },
        { q: '是"恒成立"还是"存在"？', a: r`恒成立：$a\le f(x)$ ⇔ $a\le f$ 的**最小值**；$a\ge f(x)$ ⇔ $a\ge f$ 的**最大值**。存在（有解）：$a\le f(x)$ 有解 ⇔ $a\le f$ 的**最大值**。口诀：恒成立看"最不利的"，有解看"最有利的"。` },
        { q: '怎么求 $f(x)$ 在区间上的最值？', a: r`二次函数看对称轴；$x+\frac kx$ 型用均值或单调性（$x+\frac kx$ 在 $x=\sqrt k$ 左侧递减、右侧递增）。` },
      ],
      tools: [
        r`恒成立：$a\ge f(x) \Leftrightarrow a\ge f_{\max}$；$a\le f(x) \Leftrightarrow a\le f_{\min}$`,
        r`有解：$a\ge f(x) \Leftrightarrow a\ge f_{\min}$；$a\le f(x) \Leftrightarrow a\le f_{\max}$`,
        r`$x+\frac kx\ (k>0)$ 在 $(0,\sqrt k]$ 递减，在 $[\sqrt k,+\infty)$ 递增`,
      ],
      tricks: ['端点值代入检验，能很快排除选项', '分离后画出 $f(x)$ 的草图'],
      traps: ['恒成立和有解的最值方向弄反', '除以负数没变号', '区间上的最值没检查端点'],
      examples: [
        {
          level: 2,
          type: 'ps',
          stem: r`不等式 $x^2-ax+1\ge0$ 对 $x\in[1,2]$ 恒成立，则 $a$ 的取值范围是（　）`,
          options: [r`$a\le2$`, r`$a\le\frac52$`, r`$a\ge2$`, r`$-2\le a\le2$`, r`$a<2$`],
          answer: 'A',
          think: [
            '只在区间 $[1,2]$ 上恒成立 → 分离参数',
            r`$x>0$，除以 $x$：$a\le x+\frac1x$，对 $[1,2]$ 上所有 $x$ 成立`,
            r`⇔ $a\le$ $x+\frac1x$ 在 $[1,2]$ 上的最小值`,
          ],
          solution: r`$x+\frac1x$ 在 $[1,2]$ 上递增，最小值为 $x=1$ 时的 $2$。所以 $a\le2$。`,
        },
        {
          level: 3,
          type: 'ps',
          stem: r`若存在 $x\in[1,3]$ 使 $x^2-2x-a>0$ 成立，则 $a$ 的取值范围是（　）`,
          options: [r`$a<-1$`, r`$a<3$`, r`$a>3$`, r`$a\le3$`, r`$a>-1$`],
          answer: 'B',
          think: [
            r`分离：$a<x^2-2x$，**存在**一个 $x$ 使之成立`,
            r`"存在"看最有利的情况 → $a<$ $x^2-2x$ 在 $[1,3]$ 上的**最大值**`,
          ],
          solution: r`$x^2-2x$ 对称轴 $x=1$，在 $[1,3]$ 上递增，最大值 $9-6=3$。所以 $a<3$。

（如果是"对所有 $x\in[1,3]$ 都成立"，则要 $a<$ 最小值 $-1$。）`,
        },
      ],
      practice: [
        {
          level: 1,
          type: 'ps',
          stem: r`不等式 $a\le x^2+1$ 对一切实数 $x$ 恒成立，则 $a$ 的取值范围是（　）`,
          options: [r`$a\le1$`, r`$a\ge1$`, r`$a<1$`, r`$a\le0$`, r`$a\ge0$`],
          answer: 'A',
          hint: '$a$ 不超过 $x^2+1$ 的最小值。',
          solution: r`$x^2+1$ 的最小值为 1，所以 $a\le1$。`,
        },
        {
          level: 2,
          type: 'ps',
          stem: r`不等式 $x^2+ax+4\ge0$ 对一切 $x>0$ 恒成立，则 $a$ 的取值范围是（　）`,
          options: [r`$a\ge4$`, r`$a\le-4$`, r`$a\ge-4$`, r`$-4\le a\le4$`, r`$a>-4$`],
          answer: 'C',
          hint: '除以 $x$ 分离：$a\\ge-\\left(x+\\frac4x\\right)$。',
          solution: r`$a\ge-\left(x+\frac4x\right)$ 对 $x>0$ 恒成立。$x+\frac4x\ge4$，所以 $-\left(x+\frac4x\right)$ 的最大值为 $-4$。

$a\ge-4$。`,
        },
        {
          level: 2,
          type: 'ps',
          stem: r`不等式 $x^2-2x+3\ge a$ 对 $x\in[2,4]$ 恒成立，则 $a$ 的最大值为（　）`,
          options: [r`$2$`, r`$11$`, r`$6$`, r`$3$`, r`$1$`],
          answer: 'D',
          hint: '$a\\le$ 左边在 $[2,4]$ 上的最小值。对称轴不在区间内。',
          solution: r`对称轴 $x=1$，在 $[2,4]$ 上递增，最小值 $f(2)=3$。$a\le3$，最大值 $3$。`,
        },
        {
          level: 2,
          type: 'sc',
          stem: r`不等式 $x^2-ax+4>0$ 对 $x\in[1,3]$ 恒成立。

(1) $a<3$

(2) $a\le4$`,
          answer: 'A',
          hint: '分离得 $a<x+\\frac4x$，求右边在 $[1,3]$ 上的最小值。',
          solution: r`$a<x+\frac4x$ 恒成立，$x+\frac4x$ 在 $x=2$ 处取最小值 4，所以 $a<4$。

(1) 充分。(2) 含 $a=4$，此时 $x=2$ 处左边 $=0$，不满足 $>0$，不充分。选 A。`,
        },
        {
          level: 3,
          type: 'ps',
          stem: r`不等式 $a\ge\dfrac{2x}{x^2+1}$ 对一切实数 $x$ 恒成立，则 $a$ 的最小值为（　）`,
          options: [r`$2$`, r`$\frac12$`, r`$1$`, r`$0$`, r`$-1$`],
          answer: 'C',
          hint: '求 $\\frac{2x}{x^2+1}$ 的最大值：$x>0$ 时分子分母同除以 $x$。',
          solution: r`$x\le0$ 时右边 $\le0$。$x>0$ 时 $\frac{2x}{x^2+1}=\frac2{x+\frac1x}\le\frac22=1$，$x=1$ 时取等。

最大值为 1，$a\ge1$，最小值 $1$。`,
        },
        {
          level: 3,
          type: 'sc',
          stem: r`存在 $x\in[1,2]$，使 $x^2+ax-2>0$ 成立。

(1) $a>0$

(2) $a>-2$`,
          answer: 'A',
          hint: '分离：$a>\\frac2x-x$，存在 $x$ 使之成立 ⇔ $a>$ 右边的最小值。',
          solution: r`$a>\frac2x-x$ 存在解 ⇔ $a>\left(\frac2x-x\right)_{\min}$。$\frac2x-x$ 在 $[1,2]$ 上递减，最小值为 $x=2$ 时的 $-1$。所以 $a>-1$。

(1) 充分。(2) 含 $a=-1.5$，不满足 $a>-1$，不充分。选 A。`,
        },
      ],
    },
    {
      id: 'alg-sign-ineq',
      name: '分式不等式与穿根法',
      kp: '不等式',
      freq: 2,
      signals: ['分母含 $x$ 的不等式', '三个及以上因式相乘的不等式', '高次不等式'],
      think: '分式变乘积（分母不为 0），标出所有根，从右上方开始穿线：奇次穿过，偶次不穿。',
      route: [
        { q: '右边是 0 吗？', a: r`不是 → 先移项通分，化成 $\frac{f(x)}{g(x)}>0$ 的形式。**绝对不能直接两边乘分母**，因为不知道分母的正负。` },
        { q: '怎么去分母？', a: r`$\frac fg>0 \Leftrightarrow f\cdot g>0$；$\frac fg\ge0 \Leftrightarrow f\cdot g\ge0$ 且 $g\neq0$。` },
        { q: '因式都整理好了吗？', a: r`每个因式里 $x$ 的系数化成正数（如 $3-x$ 写成 $-(x-3)$，不等号随之变向），恒正的因式（如 $x^2+1$）直接去掉。` },
        { q: '怎么穿根？', a: r`在数轴上标出所有根，从**最右边的上方**开始画曲线，依次穿过每个根；偶次重根（如 $(x-1)^2$）处**不穿**，弹回来。曲线在上方的区间 $>0$，下方的 $<0$。` },
        { q: '端点取不取？', a: '$\\ge$ 或 $\\le$ 时分子的根取到，分母的根永远取不到。' },
      ],
      tools: [
        r`$\frac fg>0 \Leftrightarrow fg>0$，$\frac fg\ge0 \Leftrightarrow fg\ge0$ 且 $g\neq0$`,
        '穿根法：右上方起，奇穿偶回',
        r`$(x-a)(x-b)>0\ (a<b) \Leftrightarrow x<a$ 或 $x>b$`,
      ],
      tricks: ['用一个大数（如 $x=100$）验证最右边的符号', '选择题代特殊点排除'],
      traps: ['直接乘分母', '偶次重根处也穿过去', '分母的根取成实心'],
      examples: [
        {
          level: 2,
          type: 'ps',
          stem: r`不等式 $\dfrac{x-1}{x+2}\le0$ 的解集为（　）`,
          options: [r`$(-2,1]$`, r`$[-2,1]$`, r`$(-2,1)$`, r`$x<-2$ 或 $x\ge1$`, r`$[-2,1)$`],
          answer: 'A',
          think: [
            '分式 $\\le0$ → 等价于 $(x-1)(x+2)\\le0$ 且分母 $x+2\\neq0$',
            '两根之间，分子的根 1 能取，分母的根 $-2$ 不能取',
          ],
          solution: r`$(x-1)(x+2)\le0$ 且 $x\neq-2$，解集 $(-2,1]$。`,
        },
        {
          level: 3,
          type: 'ps',
          stem: r`不等式 $(x+2)(x-1)^2(x-3)<0$ 的解集为（　）`,
          options: [r`$(-2,3)$`, r`$(-2,1)\cup(1,3)$`, r`$(-\infty,-2)\cup(3,+\infty)$`, r`$(1,3)$`, r`$(-2,1)$`],
          answer: 'B',
          think: [
            r`根：$-2$、$1$（二重）、$3$`,
            '从最右边的上方开始穿：过 3 往下，到 1 处是偶次重根，**不穿**，弹回仍在下方，过 $-2$ 往上',
            r`下方的部分是 $(-2,3)$，但 $x=1$ 时式子等于 0，不满足 $<0$，要挖掉`,
          ],
          solution: r`穿根后 $(-2,3)$ 内曲线在下方，去掉使式子为 0 的 $x=1$，解集为 $(-2,1)\cup(1,3)$。`,
        },
      ],
      practice: [
        {
          level: 1,
          type: 'ps',
          stem: r`不等式 $\dfrac{x-3}{x+1}>0$ 的解集为（　）`,
          options: [r`$x<-1$ 或 $x>3$`, r`$-1<x<3$`, r`$x>3$`, r`$x<-1$`, r`$x\neq-1$`],
          answer: 'A',
          hint: '等价于 $(x-3)(x+1)>0$。',
          solution: r`$(x-3)(x+1)>0$，取两根之外：$x<-1$ 或 $x>3$。`,
        },
        {
          level: 2,
          type: 'ps',
          stem: r`不等式 $\dfrac2{x-1}<1$ 的解集为（　）`,
          options: [r`$(1,3)$`, r`$x<1$ 或 $x>3$`, r`$x>3$`, r`$x<1$`, r`$x<3$`],
          answer: 'B',
          hint: '不能直接乘 $(x-1)$。移项通分。',
          solution: r`$\frac2{x-1}-1<0$ ⇔ $\frac{3-x}{x-1}<0$ ⇔ $\frac{x-3}{x-1}>0$ ⇔ $x<1$ 或 $x>3$。

（直接乘分母会得到 $x>3$，漏掉 $x<1$ 的部分。）`,
        },
        {
          level: 2,
          type: 'ps',
          stem: r`不等式 $(x+1)(x-2)(x-4)<0$ 的解集为（　）`,
          options: [r`$-1<x<2$ 或 $x>4$`, r`$2<x<4$`, r`$x<-1$ 或 $2<x<4$`, r`$x<-1$`, r`$-1<x<4$`],
          answer: 'C',
          hint: '标根 $-1,2,4$，从右上方穿线，取下方部分。',
          solution: r`从右上方开始：$x>4$ 为正，$(2,4)$ 为负，$(-1,2)$ 为正，$x<-1$ 为负。解集 $x<-1$ 或 $2<x<4$。`,
        },
        {
          level: 2,
          type: 'sc',
          stem: r`不等式 $\dfrac{x-a}{x+1}\le0$ 的解集为 $(-1,2]$。

(1) $a=2$

(2) $a=-2$`,
          answer: 'A',
          hint: '分别代入解一下。',
          solution: r`(1) $\frac{x-2}{x+1}\le0$，解集 $(-1,2]$，充分。

(2) $\frac{x+2}{x+1}\le0$，解集 $[-2,-1)$，不充分。选 A。`,
        },
        {
          level: 3,
          type: 'ps',
          stem: r`不等式 $\dfrac{x^2-3x+2}{x^2-2x-3}\ge0$ 在区间 $[-3,5]$ 内的整数解有（　）个`,
          options: [r`$5$`, r`$7$`, r`$6$`, r`$4$`, r`$8$`],
          answer: 'C',
          hint: '分子 $(x-1)(x-2)$，分母 $(x-3)(x+1)$。四个根穿线，分母的根取不到。',
          solution: r`化为 $(x-1)(x-2)(x-3)(x+1)\ge0$ 且 $x\neq3,-1$。穿根得解集：$x<-1$ 或 $1\le x\le2$ 或 $x>3$。

$[-3,5]$ 内的整数：$-3,-2,1,2,4,5$，共 6 个。`,
        },
        {
          level: 3,
          type: 'sc',
          stem: r`不等式 $(x-1)^2(x-a)>0$ 的解集为 $(a,+\infty)$。

(1) $a=1$

(2) $a>0$`,
          answer: 'A',
          hint: '$(x-1)^2\\ge0$，等于 0 时不满足 $>0$。解集为 $x>a$ 且 $x\\neq1$。',
          solution: r`解集为 $\{x\mid x>a$ 且 $x\neq1\}$。它等于 $(a,+\infty)$ ⇔ $1\notin(a,+\infty)$ ⇔ $a\ge1$。

(1) $a=1$，充分。(2) 含 $a=\frac12$，此时解集为 $\left(\frac12,1\right)\cup(1,+\infty)$，不充分。选 A。`,
        },
      ],
    },
    {
      id: 'alg-amgm',
      name: '均值不等式求最值',
      kp: '均值不等式',
      freq: 3,
      signals: ['正数条件下求最大 / 最小值', r`$x+\frac4{x-1}$、$x(4-2x)$ 这类式子`, r`已知 $a+b=1$，求 $\frac1a+\frac4b$ 的最小值`],
      think: '积为定值 → 和有最小值；和为定值 → 积有最大值。检查"一正、二定、三相等"。',
      route: [
        { q: '每一项都是正数吗？（一正）', a: r`均值不等式只对正数成立。$x<0$ 时先提出负号。` },
        { q: '能凑出定值吗？（二定）', a: r`求和的最小值，要让**积**是常数：$x+\frac4{x-1}$ 写成 $(x-1)+\frac4{x-1}+1$，前两项的积是 4。求积的最大值，要让**和**是常数：$x(4-2x)=\frac12\cdot2x\cdot(4-2x)$，$2x+(4-2x)=4$。` },
        { q: '等号能取到吗？（三相等）', a: r`两项相等时取等号。如果等号要求的 $x$ 不在范围内（如 $x+\frac1x$ 在 $x\ge2$ 上），就不能用均值，改用函数单调性。` },
        { q: r`已知 $a+b=1$（或其他定值），求 $\frac1a+\frac4b$？`, a: r`"1 的代换"：$\frac1a+\frac4b=(a+b)\left(\frac1a+\frac4b\right)=5+\frac ba+\frac{4a}b\ge5+2\sqrt4=9$。` },
      ],
      tools: [
        r`$a+b\ge2\sqrt{ab}$，$ab\le\left(\frac{a+b}2\right)^2$（$a,b>0$）`,
        r`$x+\frac1x\ge2$（$x>0$）`,
        r`$a^2+b^2\ge2ab$；$(a+b)^2\le2(a^2+b^2)$`,
        '1 的代换：乘以已知的定值再展开',
      ],
      tricks: ['凑定值时常加减一个常数，最后别忘了补回去', '先猜等号成立的点，再验证'],
      traps: ['忽略"正数"条件', '等号取不到还用均值', '凑项后漏了加回的常数'],
      examples: [
        {
          level: 2,
          type: 'ps',
          stem: r`当 $x>1$ 时，$x+\dfrac4{x-1}$ 的最小值为（　）`,
          options: [r`$5$`, r`$4$`, r`$6$`, r`$3$`, r`$8$`],
          answer: 'A',
          think: [
            r`求和的最小值 → 要让两项的积为定值。$x$ 和 $\frac4{x-1}$ 的积不是常数`,
            r`把 $x$ 拆成 $(x-1)+1$：$(x-1)$ 和 $\frac4{x-1}$ 的积是 4 ✓`,
            r`$x>1$ 保证 $x-1>0$（一正）；等号在 $x-1=2$ 即 $x=3$ 时取到（三相等）`,
          ],
          solution: r`$x+\frac4{x-1}=(x-1)+\frac4{x-1}+1\ge2\sqrt4+1=5$，$x=3$ 时取等号。最小值 $5$。`,
        },
        {
          level: 3,
          type: 'ps',
          stem: r`已知 $a>0,\ b>0$，$a+b=1$，则 $\dfrac1a+\dfrac4b$ 的最小值为（　）`,
          options: [r`$8$`, r`$9$`, r`$5$`, r`$4$`, r`$10$`],
          answer: 'B',
          think: [
            r`有一个和为定值的条件，求倒数和的最小值 → "1 的代换"`,
            r`乘以 $(a+b)=1$ 不改变值，展开后出现 $\frac ba+\frac{4a}b$，它们的积是 4`,
          ],
          solution: r`$\left(\frac1a+\frac4b\right)(a+b)=1+\frac ba+\frac{4a}b+4\ge5+2\sqrt4=9$。

等号在 $b=2a$，即 $a=\frac13,\ b=\frac23$ 时取到。最小值 $9$。`,
          fast: r`常见错误：分别用 $a+b\ge2\sqrt{ab}$ 和 $\frac1a+\frac4b\ge\frac4{\sqrt{ab}}$ 相乘，两个等号不能同时成立，得到的 8 是错的。`,
        },
      ],
      practice: [
        {
          level: 1,
          type: 'ps',
          stem: r`当 $x>0$ 时，$x+\dfrac9x$ 的最小值为（　）`,
          options: [r`$9$`, r`$6$`, r`$3$`, r`$10$`, r`$18$`],
          answer: 'B',
          hint: '积为定值 9。',
          solution: r`$x+\frac9x\ge2\sqrt9=6$，$x=3$ 时取等。`,
        },
        {
          level: 2,
          type: 'ps',
          stem: r`当 $0<x<2$ 时，$x(4-2x)$ 的最大值为（　）`,
          options: [r`$2$`, r`$4$`, r`$1$`, r`$8$`, r`$3$`],
          answer: 'A',
          hint: '凑和为定值：$2x+(4-2x)=4$。',
          solution: r`$x(4-2x)=\frac12\cdot2x(4-2x)\le\frac12\left(\frac{2x+4-2x}2\right)^2=2$，$x=1$ 时取等。`,
        },
        {
          level: 2,
          type: 'ps',
          stem: r`已知 $x>0,\ y>0$，$2x+y=4$，则 $xy$ 的最大值为（　）`,
          options: [r`$4$`, r`$1$`, r`$2$`, r`$8$`, r`$\frac12$`],
          answer: 'C',
          hint: '$2x$ 与 $y$ 的和是定值，先求 $2x\\cdot y$ 的最大值。',
          solution: r`$2xy\le\left(\frac{2x+y}2\right)^2=4$，$xy\le2$，$x=1,y=2$ 时取等。`,
        },
        {
          level: 2,
          type: 'sc',
          stem: r`$x+y$ 的最小值为 $4$。

(1) $x>0$，$y>0$，$xy=4$

(2) $x,y$ 为实数，$xy=4$`,
          answer: 'A',
          hint: '(2) 中 $x,y$ 可以都是负数。',
          solution: r`(1) $x+y\ge2\sqrt{xy}=4$，$x=y=2$ 时取等，最小值为 4，充分。

(2) $x=y=-2$ 时 $x+y=-4$，且负数时 $x+y$ 没有最小值，不充分。选 A。`,
        },
        {
          level: 3,
          type: 'ps',
          stem: r`已知 $x>0,\ y>0$，$\dfrac1x+\dfrac9y=1$，则 $x+y$ 的最小值为（　）`,
          options: [r`$12$`, r`$10$`, r`$18$`, r`$16$`, r`$20$`],
          answer: 'D',
          hint: '1 的代换：$x+y=(x+y)\\left(\\frac1x+\\frac9y\\right)$。',
          solution: r`$(x+y)\left(\frac1x+\frac9y\right)=10+\frac yx+\frac{9x}y\ge10+6=16$，$y=3x$ 即 $x=4,y=12$ 时取等。`,
        },
        {
          level: 3,
          type: 'ps',
          stem: r`函数 $y=x+\dfrac1x$（$x\ge2$）的最小值为（　）`,
          options: [r`$2$`, r`$\frac52$`, r`$3$`, r`$\frac{17}4$`, '不存在'],
          answer: 'B',
          hint: '均值不等式的等号在 $x=1$ 取到，但 $x\\ge2$。',
          solution: r`$x+\frac1x\ge2$ 的等号要 $x=1$，不在范围内，不能用。

$x+\frac1x$ 在 $[1,+\infty)$ 上递增，所以在 $x\ge2$ 上最小值为 $2+\frac12=\frac52$。`,
        },
      ],
    },
    {
      id: 'alg-sum-prod',
      name: '和积关系求范围',
      kp: '均值不等式',
      freq: 2,
      signals: [r`正数 $a,b$ 满足 $ab=a+b+3$ 这类等式，求 $ab$ 或 $a+b$ 的范围`, r`已知 $x^2+y^2$ 或 $x+y+xy$ 为定值`],
      think: r`用 $a+b\ge2\sqrt{ab}$（或 $ab\le\frac{(a+b)^2}4$）把等式变成只含一个量的不等式，再解。`,
      route: [
        { q: '条件里同时有 $a+b$ 和 $ab$ 吗？', a: '这是本题型的标志。目标是把条件变成只含一个量（和或积）的不等式。' },
        { q: '要求积 $ab$ 的范围？', a: r`把和换掉：$a+b\ge2\sqrt{ab}$。设 $t=\sqrt{ab}>0$，得到关于 $t$ 的二次不等式。` },
        { q: '要求和 $a+b$ 的范围？', a: r`把积换掉：$ab\le\frac{(a+b)^2}4$。设 $s=a+b>0$，得到关于 $s$ 的二次不等式。` },
        { q: '解出的范围端点能取到吗？', a: '检查等号条件 $a=b$ 时能否满足原等式。' },
      ],
      tools: [
        r`$a+b\ge2\sqrt{ab}$`,
        r`$ab\le\frac{(a+b)^2}4$`,
        r`$(x+y)^2\le2(x^2+y^2)$`,
      ],
      tricks: ['等号都在 $a=b$ 时取到，可以直接令 $a=b$ 代入求端点值', '换元后记得 $t>0$ 或 $s>0$'],
      traps: ['换元后忘记正数限制，多出负根', '求和时用了换积的不等式方向'],
      examples: [
        {
          level: 2,
          type: 'ps',
          stem: r`正数 $a,b$ 满足 $ab=a+b+3$，则 $ab$ 的最小值为（　）`,
          options: [r`$9$`, r`$3$`, r`$6$`, r`$4$`, r`$1$`],
          answer: 'A',
          think: [
            r`条件同时有和与积，要求积 → 把和换掉`,
            r`$a+b\ge2\sqrt{ab}$，所以 $ab=a+b+3\ge2\sqrt{ab}+3$`,
            r`设 $t=\sqrt{ab}>0$，解 $t^2-2t-3\ge0$`,
          ],
          solution: r`$(t-3)(t+1)\ge0$，又 $t>0$，所以 $t\ge3$，$ab\ge9$。$a=b=3$ 时取等，最小值 $9$。`,
        },
        {
          level: 3,
          type: 'ps',
          stem: r`正数 $a,b$ 满足 $ab=a+b+3$，则 $a+b$ 的最小值为（　）`,
          options: [r`$9$`, r`$6$`, r`$3$`, r`$2\sqrt3$`, r`$12$`],
          answer: 'B',
          think: [
            r`同一个条件，这次要求和 → 把积换掉`,
            r`$ab\le\frac{(a+b)^2}4$，所以 $a+b+3=ab\le\frac{(a+b)^2}4$`,
            r`设 $s=a+b>0$，解 $s^2-4s-12\ge0$`,
          ],
          solution: r`$(s-6)(s+2)\ge0$，又 $s>0$，所以 $s\ge6$。$a=b=3$ 时取等，最小值 $6$。`,
        },
      ],
      practice: [
        {
          level: 1,
          type: 'ps',
          stem: r`已知 $x>0,\ y>0$，$x+y=10$，则 $xy$ 的最大值为（　）`,
          options: [r`$25$`, r`$20$`, r`$50$`, r`$100$`, r`$10$`],
          answer: 'A',
          hint: '和为定值，积有最大值。',
          solution: r`$xy\le\left(\frac{10}2\right)^2=25$，$x=y=5$ 时取等。`,
        },
        {
          level: 2,
          type: 'ps',
          stem: r`正数 $x,y$ 满足 $x+y+xy=8$，则 $x+y$ 的最小值为（　）`,
          options: [r`$2$`, r`$4$`, r`$8$`, r`$6$`, r`$3$`],
          answer: 'B',
          hint: '求和 → 把 $xy$ 换成 $\\le\\frac{s^2}4$。',
          solution: r`$8-s=xy\le\frac{s^2}4$，$s^2+4s-32\ge0$，$(s+8)(s-4)\ge0$，$s\ge4$。$x=y=2$ 时取等。`,
        },
        {
          level: 2,
          type: 'ps',
          stem: r`正数 $x,y$ 满足 $x+y+xy=8$，则 $xy$ 的最大值为（　）`,
          options: [r`$8$`, r`$2$`, r`$4$`, r`$16$`, r`$6$`],
          answer: 'C',
          hint: '求积 → 把 $x+y$ 换成 $\\ge2\\sqrt{xy}$。',
          solution: r`设 $t=\sqrt{xy}$，$8-t^2=x+y\ge2t$，$t^2+2t-8\le0$，$(t+4)(t-2)\le0$，$t\le2$，$xy\le4$。`,
        },
        {
          level: 2,
          type: 'sc',
          stem: r`$a+b\ge4$（$a,b$ 为正数）。

(1) $ab=4$

(2) $ab\ge3$`,
          answer: 'A',
          hint: '$a+b\\ge2\\sqrt{ab}$，看 $2\\sqrt{ab}$ 至少是多少。',
          solution: r`(1) $a+b\ge2\sqrt4=4$，充分。

(2) 取 $a=b=\sqrt3$，$ab=3$，$a+b=2\sqrt3<4$，不充分。选 A。`,
        },
        {
          level: 3,
          type: 'ps',
          stem: r`正数 $x,y$ 满足 $x^2+y^2=2$，则 $x+y$ 的最大值为（　）`,
          options: [r`$2$`, r`$\sqrt2$`, r`$4$`, r`$2\sqrt2$`, r`$1$`],
          answer: 'A',
          hint: '$(x+y)^2=x^2+y^2+2xy\\le2(x^2+y^2)$。',
          solution: r`$(x+y)^2\le2(x^2+y^2)=4$，$x+y\le2$，$x=y=1$ 时取等。`,
        },
        {
          level: 3,
          type: 'sc',
          stem: r`$a+b\ge6$（$a,b$ 为正数）。

(1) $ab=a+b+3$

(2) $ab=9$`,
          answer: 'D',
          hint: '(1) 就是例题 2 的条件。',
          solution: r`(1) 由例题 2，$a+b\ge6$，充分。

(2) $a+b\ge2\sqrt9=6$，充分。选 D。`,
        },
      ],
    },
    {
      id: 'alg-linear-range',
      name: '已知范围求组合范围（整体代换）',
      kp: '不等式',
      freq: 1,
      signals: [r`已知 $a+b$、$a-b$ 的范围，求 $3a-b$ 的范围`, r`已知 $a$、$b$ 的范围，求 $a-b$、$\frac ab$ 的范围`],
      think: r`把目标写成已知式子的组合 $m(a+b)+n(a-b)$，**不要**先分别求 $a$、$b$ 的范围。`,
      route: [
        { q: '已知的是 $a$、$b$ 各自的范围？', a: r`求 $a-b$：$a$ 取最大、$b$ 取最小时最大，反之最小（减法交叉相减）。求 $\frac ab$（都为正）：$a$ 最大 $b$ 最小时最大。` },
        { q: '已知的是两个组合式（如 $a+b$、$a-b$）的范围？', a: r`设目标 $=m(a+b)+n(a-b)$，对比 $a$、$b$ 的系数解出 $m,n$。` },
        { q: '为什么不能先求 $a$、$b$ 的范围？', a: r`$a$ 和 $b$ 不是独立变化的，各自取到最值时另一个不一定能配合，分开算会把范围**算大**。` },
        { q: '求出 $m,n$ 之后？', a: r`分别算 $m(a+b)$ 和 $n(a-b)$ 的范围（$m$ 或 $n$ 为负时上下限对调），再相加。` },
      ],
      tools: [
        '同向不等式可以相加，不能相减',
        '乘以负数，不等号变向',
        r`待定系数：$pa+qb=m(a+b)+n(a-b)$，$m+n=p$，$m-n=q$`,
      ],
      tricks: ['范围的端点在两个已知式同时取端点时取到，可以直接解方程组求出顶点', '选项里比正确答案更宽的往往就是"分开求"的错误答案'],
      traps: ['先求出 $a$、$b$ 的范围再组合，范围变大', '两个不等式直接相减'],
      examples: [
        {
          level: 2,
          type: 'ps',
          stem: r`已知 $1\le a+b\le3$，$-1\le a-b\le1$，则 $3a-b$ 的取值范围是（　）`,
          options: [r`$[-1,5]$`, r`$[-2,6]$`, r`$[0,4]$`, r`$[1,5]$`, r`$[-1,6]$`],
          answer: 'A',
          think: [
            r`设 $3a-b=m(a+b)+n(a-b)$`,
            r`对比系数：$a$ 的系数 $m+n=3$，$b$ 的系数 $m-n=-1$，得 $m=1,\ n=2$`,
            r`$1\cdot(a+b)\in[1,3]$，$2(a-b)\in[-2,2]$，相加`,
          ],
          solution: r`$3a-b=(a+b)+2(a-b)\in[1-2,\ 3+2]=[-1,5]$。

（如果先求 $a\in[0,2]$、$b\in[0,2]$ 再算，会得到 $[-2,6]$，范围变大了。）`,
        },
        {
          level: 3,
          type: 'ps',
          stem: r`已知 $-1\le a+b\le1$，$1\le a-2b\le3$，则 $a+3b$ 的取值范围是（　）`,
          options: [r`$[-3,1]$`, r`$\left[-\frac{11}3,1\right]$`, r`$\left[-\frac{11}3,3\right]$`, r`$[-1,1]$`, r`$\left[-\frac73,1\right]$`],
          answer: 'B',
          think: [
            r`设 $a+3b=m(a+b)+n(a-2b)$`,
            r`$a$ 的系数：$m+n=1$；$b$ 的系数：$m-2n=3$，解得 $n=-\frac23$，$m=\frac53$`,
            r`$n$ 是负数：$-\frac23(a-2b)$ 的范围要上下对调`,
          ],
          solution: r`$\frac53(a+b)\in\left[-\frac53,\frac53\right]$，$-\frac23(a-2b)\in\left[-2,-\frac23\right]$。

相加：$a+3b\in\left[-\frac53-2,\ \frac53-\frac23\right]=\left[-\frac{11}3,1\right]$。`,
        },
      ],
      practice: [
        {
          level: 1,
          type: 'ps',
          stem: r`已知 $2<a<5$，$1<b<3$，则 $a-b$ 的取值范围是（　）`,
          options: [r`$(-1,4)$`, r`$(1,2)$`, r`$(-1,2)$`, r`$(1,4)$`, r`$(3,8)$`],
          answer: 'A',
          hint: '交叉相减：最大 $=5-1$，最小 $=2-3$。',
          solution: r`$-b\in(-3,-1)$，$a-b\in(2-3,\ 5-1)=(-1,4)$。`,
        },
        {
          level: 2,
          type: 'ps',
          stem: r`已知 $1<a<4$，$2<b<8$，则 $\dfrac ab$ 的取值范围是（　）`,
          options: [r`$\left(\frac12,2\right)$`, r`$\left(\frac18,2\right)$`, r`$\left(\frac18,\frac12\right)$`, r`$\left(\frac14,2\right)$`, r`$\left(\frac12,4\right)$`],
          answer: 'B',
          hint: '都为正数，最大 $=\\frac{a_{\\max}}{b_{\\min}}$，最小 $=\\frac{a_{\\min}}{b_{\\max}}$。',
          solution: r`$\frac1b\in\left(\frac18,\frac12\right)$，$\frac ab\in\left(\frac18,\ 2\right)$。`,
        },
        {
          level: 2,
          type: 'ps',
          stem: r`已知 $-1\le x+y\le1$，$1\le x-y\le3$，则 $2x+y$ 的取值范围是（　）`,
          options: [r`$[-2,4]$`, r`$[-1,4]$`, r`$[-1,3]$`, r`$[0,3]$`, r`$\left[-\frac32,3\right]$`],
          answer: 'C',
          hint: '$2x+y=m(x+y)+n(x-y)$，$m+n=2$，$m-n=1$。',
          solution: r`$m=\frac32$，$n=\frac12$。$\frac32(x+y)\in\left[-\frac32,\frac32\right]$，$\frac12(x-y)\in\left[\frac12,\frac32\right]$。

相加得 $[-1,3]$。`,
        },
        {
          level: 2,
          type: 'sc',
          stem: r`$a-b>0$。

(1) $a>2$，$b<1$

(2) $a>b-1$`,
          answer: 'A',
          hint: '(2) 只能得到 $a-b>-1$。',
          solution: r`(1) $a-b>2-1=1>0$，充分。

(2) $a-b>-1$，例如 $a=0,b=0.5$ 时 $a-b<0$，不充分。选 A。`,
        },
        {
          level: 3,
          type: 'ps',
          stem: r`已知 $1\le a-b\le2$，$2\le a+b\le4$，则 $4a-2b$ 的取值范围是（　）`,
          options: [r`$[3,12]$`, r`$[4,10]$`, r`$[5,10]$`, r`$[5,12]$`, r`$[6,10]$`],
          answer: 'C',
          hint: '$4a-2b=m(a+b)+n(a-b)$，不要分别求 $a$、$b$ 的范围。',
          solution: r`$m+n=4$，$m-n=-2$，得 $m=1,\ n=3$。

$(a+b)\in[2,4]$，$3(a-b)\in[3,6]$，相加 $[5,10]$。

（分别求 $a\in\left[\frac32,3\right]$、$b\in\left[0,\frac32\right]$ 再算会得到 $[3,12]$，是错的。）`,
        },
        {
          level: 3,
          type: 'sc',
          stem: r`$x+2y$ 的最大值为 $5$。

(1) $x+y\le3$，$y\le2$

(2) $x\le1$，$y\le2$`,
          answer: 'D',
          hint: '把 $x+2y$ 写成已知式子的组合，并检查最大值能否取到。',
          solution: r`(1) $x+2y=(x+y)+y\le3+2=5$，$x=1,y=2$ 时取到，最大值为 5，充分。

(2) $x+2y\le1+4=5$，$x=1,y=2$ 时取到，充分。选 D。`,
        },
      ],
    },
  ],
}
