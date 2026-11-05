"""独立验算题型讲解中的题目答案。

用法：python scripts/verify-topics.py（需要 sympy；会调用 node scripts/dump-topics.mjs 读取题目）

每道题用 sympy 重新计算，再与题目标注答案对应的选项比较：
- 问题求解：把答案字母对应的选项（LaTeX）解析成数值/表达式/集合，与重算结果比较，所以字母标错也能查出来
- 条件充分性：按条件 (1)(2)、联合 分别判断，用 suff() 得出字母再比较
最后列出没有被验算覆盖的题目。
"""
import json
import re
import subprocess
import sys
from pathlib import Path

from sympy import (Tuple, Rational as R, sqrt, symbols, solve, expand, simplify, S, FiniteSet, Poly, factor,
                   nsimplify, Symbol, diff, oo, Interval, solveset, log, Abs, binomial)
from sympy.parsing.sympy_parser import parse_expr, standard_transformations, implicit_multiplication_application

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parent.parent
DATA = json.loads(subprocess.run(['node', 'scripts/dump-topics.mjs'], cwd=ROOT, capture_output=True, check=True).stdout)

x, y, z, a, b, c, k, m, n, p, q, t = symbols('x y z a b c k m n p q t', real=True)
LOCALS = {'x': x, 'y': y, 'z': z, 'a': a, 'b': b, 'c': c, 'k': k, 'm': m, 'n': n, 'p': p, 'q': q, 't': t, 'sqrt': sqrt, 'oo': oo}
TRANS = standard_transformations + (implicit_multiplication_application,)
fails, covered = [], set()


def tex(s):
    """把简单的 LaTeX 选项转成 sympy 对象；'A 或 B'、'\\pm a' 转成集合。转不了返回去掉 $ 的原文。"""
    raw = s.replace('$', '').strip()
    if '或' in raw:
        parts = [tex(part) for part in raw.split('或')]
        return raw if any(isinstance(v, str) or getattr(v, 'is_Relational', False) for v in parts) else FiniteSet(*parts)
    if raw.startswith(r'\pm'):
        v = tex(raw[3:])
        return FiniteSet(v, -v) if not isinstance(v, str) else raw
    e = raw.replace(r'\dfrac', r'\frac').replace(r'\left', '').replace(r'\right', '').replace(' ', '')
    e = e.replace(r'\cdot', '*').replace(r'\times', '*')
    for _ in range(6):
        e = re.sub(r'\^\{([^{}]*)\}', r'**(\1)', e)
        e = re.sub(r'\^([0-9a-z])', r'**\1', e)
        e = re.sub(r'\\sqrt\{([^{}]*)\}', r'sqrt(\1)', e)
        e = re.sub(r'\\sqrt([0-9a-z])', r'sqrt(\1)', e)
        e = re.sub(r'\\frac\{([^{}]*)\}\{([^{}]*)\}', r'((\1)/(\2))', e)
        e = re.sub(r'\\frac\{([^{}]*)\}([0-9a-z])', r'((\1)/(\2))', e)
        e = re.sub(r'\\frac([0-9a-z])\{([^{}]*)\}', r'((\1)/(\2))', e)
        e = re.sub(r'\\frac([0-9a-z])([0-9a-z])', r'((\1)/(\2))', e)
    if '\\' in e or re.search(r'[\u4e00-\u9fff]', e):
        return raw
    try:
        v = parse_expr(e, local_dict=LOCALS, transformations=TRANS)
        return Tuple(*v) if isinstance(v, (list, tuple)) else v
    except Exception:
        return raw


def same(u, v):
    if isinstance(u, str) or isinstance(v, str):
        return str(u).replace(' ', '') == str(v).replace(' ', '')
    if isinstance(u, (set, frozenset, list, tuple)):
        u = FiniteSet(*u)
    if isinstance(v, (set, frozenset, list, tuple)):
        v = FiniteSet(*v)
    if isinstance(u, FiniteSet) or isinstance(v, FiniteSet):
        u, v = FiniteSet(*[nsimplify(simplify(e)) for e in (u if isinstance(u, FiniteSet) else [u])]), \
               FiniteSet(*[nsimplify(simplify(e)) for e in (v if isinstance(v, FiniteSet) else [v])])
        return u == v
    if hasattr(u, 'is_Interval') and u.is_Interval or hasattr(u, 'is_Union') and u.is_Union:
        return u == v
    if isinstance(u, Tuple) or isinstance(v, Tuple):
        return u == v
    if getattr(u, 'is_Relational', False) or getattr(v, 'is_Relational', False):
        return u == v
    return simplify(S(u) - S(v)) == 0


def chk(tid, which, i, computed):
    """which: 'ex' 例题 / 'p' 练习，i 从 0 开始。问题求解比较选项，条件充分性比较字母。"""
    item = DATA[tid][which][i]
    covered.add((tid, which, i))
    if item['type'] == 'sc':
        # 题目加载时可能交换了条件 (1)(2) 的顺序，这里按原始顺序算出的字母要相应对调
        if item.get('swapped') and computed in 'AB':
            computed = 'B' if computed == 'A' else 'A'
        ok = computed == item['answer']
        claimed = item['answer']
    else:
        claimed = tex(item['options'][ord(item['answer']) - 65])
        try:
            ok = same(computed, claimed)
        except Exception as err:  # noqa: BLE001
            ok, claimed = False, f'{claimed}（比较出错 {err}）'
    if not ok:
        fails.append(f'{tid} {which}{i + 1}: 算得 {computed}，标注 {item["answer"]} = {claimed}')


def suff(c1, c2, joint=False):
    """条件充分性：c1/c2 单独是否充分，joint 联合是否充分。"""
    if c1 and c2:
        return 'D'
    if c1:
        return 'A'
    if c2:
        return 'B'
    return 'C' if joint else 'E'


def vals(expr, sols):
    """在一组解（字典列表）上求表达式的所有取值。"""
    return {nsimplify(simplify(expr.subs(s))) for s in sols}


def roots(poly_expr, var=x):
    return solve(poly_expr, var)


def is_zero(e):
    return expand(e) == 0


# ======================= 整式与分式 =======================
T = 'alg-square'
assert is_zero(x**2 + 2*y**2 - 2*x*y + 4*y + 4 - ((x - y)**2 + (y + 2)**2))
chk(T, 'ex', 0, R(-2)**(-2))
assert is_zero(2*(a**2 + b**2 + c**2 - a*b - b*c - c*a) - ((a - b)**2 + (b - c)**2 + (c - a)**2))
chk(T, 'ex', 1, '等边三角形')
chk(T, 'p', 0, set(solve(m**2 - 4*9*16, m)))
assert is_zero(a**2 + b**2 + 5 - 4*a + 2*b - ((a - 2)**2 + (b + 1)**2))
chk(T, 'p', 1, (2 - 1)**2024)
f = x**2 + 4*y**2 - 2*x + 8*y + 10
s_ = solve([diff(f, x), diff(f, y)], [x, y]); chk(T, 'p', 2, f.subs(s_))
assert is_zero(a**2 + 2*b**2 + c**2 - 2*a*b - 2*b*c - ((a - b)**2 + (b - c)**2))
assert (1 - 1) * (1 + 1) == 0  # (2) a=b=1, c=1.5 满足且能构成三角形但非等边
chk(T, 'p', 3, suff(True, False))
chk(T, 'p', 4, (a**2 + b**2 + c**2 - a*b - b*c - c*a).subs({a: 5, b: 3, c: 0}))
f = x**2 + 2*x*y + 3*y**2 - 2*x - 6*y + 10
s_ = solve([diff(f, x), diff(f, y)], [x, y]); chk(T, 'p', 5, f.subs(s_))

T = 'alg-sym2'
chk(T, 'ex', 0, vals(a**4 + b**4, solve([a + b - 4, a*b - 1], [a, b], dict=True)))
chk(T, 'ex', 1, suff(False, False, len(vals(Abs(a - b), solve([a + b - 5, a**2 + b**2 - 13], [a, b], dict=True))) == 1))
chk(T, 'p', 0, vals(a**2 + b**2, solve([a - b - 3, a*b - 2], [a, b], dict=True)))
chk(T, 'p', 1, vals(a**3 + b**3, solve([a + b - 3, a**2 + b**2 - 5], [a, b], dict=True)))
chk(T, 'p', 2, vals(a**2 - a*b + b**2, solve([a + b - 4, a*b - 2], [a, b], dict=True)))
v_ = vals(a/b + b/a, solve([a + b - 3, a*b + 1], [a, b], dict=True)); assert v_ == {-11}
chk(T, 'p', 3, suff(False, False, len(v_) == 1))
chk(T, 'p', 4, vals(a**5 + b**5, solve([a + b - 1, a**2 + b**2 - 2], [a, b], dict=True)))
chk(T, 'p', 5, suff(False, False, len(vals(a**3 + b**3, solve([a**2 + b**2 - 5, a*b - 2], [a, b], dict=True))) == 1))

T = 'alg-recip'
chk(T, 'ex', 0, {simplify(r_**2 / (r_**4 + r_**2 + 1)) for r_ in roots(x**2 - 3*x + 1)})
chk(T, 'ex', 1, {simplify(r_**3 + r_**-3) for r_ in roots(x**4 - 7*x**2 + 1) if r_ > 0})
chk(T, 'p', 0, {simplify(r_**2 + r_**-2) for r_ in roots(x**2 - 4*x + 1)})
chk(T, 'p', 1, {simplify(r_**4 + r_**-4) for r_ in roots(x**2 - 4*x + 1)})
chk(T, 'p', 2, {simplify(r_**3 + r_**-3) for r_ in roots(x**2 - 5*x + 1)})
rs = roots(x**2 - 3*x + 1)
c1 = len({simplify(r_ - 1/r_) for r_ in rs}) == 1
cj = len({simplify(r_ - 1/r_) for r_ in rs if r_ < 1}) == 1
chk(T, 'p', 3, suff(c1, False, cj))
chk(T, 'p', 4, {simplify(sqrt(r_) + 1/sqrt(r_)) for r_ in roots(x**2 - 3*x + 1)})
rs2 = roots(x**2 - sqrt(5)*x - 1)  # x - 1/x = √5
assert all(simplify(r_**2 + r_**-2 - 7) == 0 for r_ in rs2)
chk(T, 'p', 5, suff(False, False, len({simplify(r_**3 + r_**-3) for r_ in rs2}) == 1))

T = 'alg-diffsq'
prod = 1
for e in [1, 2, 4, 8]:
    prod *= 1 + R(1, 3**e)
chk(T, 'ex', 0, prod)
chk(T, 'ex', 1, sum((-1)**(i + 1) * i**2 for i in range(1, 101)))
chk(T, 'p', 0, 1001**2 - 999**2)
chk(T, 'p', 1, len([(mm, nn) for mm in range(1, 30) for nn in range(1, 30) if mm*mm - nn*nn == 24]))
chk(T, 'p', 2, vals(x*y, solve([x + y - 5, x**2 - y**2 - 15], [x, y], dict=True)))
chk(T, 'p', 3, suff(False, False, len(vals(x - y, solve([x**2 - y**2 - 12, x + y + 4], [x, y], dict=True))) == 1))
chk(T, 'p', 4, (2 + 1) * (2**2 + 1) * (2**4 + 1) * (2**8 + 1) * (2**16 + 1) + 1)
chk(T, 'p', 5, len({N for N in range(1, 21) for mm in range(1, 30) for nn in range(1, mm) if mm*mm - nn*nn == N}))

T = 'alg-factor-thm'
f = x**3 + a*x**2 + b*x + 6
s_ = solve([f.subs(x, 2), f.subs(x, -1)], [a, b]); chk(T, 'ex', 0, s_[a] + s_[b])
s_ = solve([p + q - 3, -2*p + q + 3], [p, q]); chk(T, 'ex', 1, s_[p]*x + s_[q])
chk(T, 'p', 0, solve((x**3 - 2*x**2 + k*x + 4).subs(x, -1), k)[0])
chk(T, 'p', 1, solve((x**4 - 3*x**3 + a*x + 2).subs(x, 2) - 4, a)[0])
s_ = solve([(x**2 + m*x + n).subs(x, 1) - 2, (x**2 + m*x + n).subs(x, -1) - 6], [m, n]); chk(T, 'p', 2, s_[m]*s_[n])
f = x**3 + a*x**2 + b*x - 2
assert expand(f.subs(x, 1) - (a + b - 1)) == 0
chk(T, 'p', 3, suff(f.subs({x: 1, a: 2, b: -1}) == 0, True))
chk(T, 'p', 4, (3*x - 1).subs(x, -1))
f = x**3 + a*x**2 + b*x + 6
s_ = solve([f.subs(x, 2), f.subs(x, 3)], [a, b])
chk(T, 'p', 5, suff(s_ == {a: -4, b: 1}, f.subs({a: 0, b: -3, x: 2}) == 0))

T = 'alg-cross'
assert is_zero(2*x**2 - x*y - 6*y**2 - (2*x + 3*y)*(x - 2*y))
chk(T, 'ex', 0, {((x + y)/(x - y)).subs(x, r_*y).simplify() for r_ in solve(2*t**2 - t - 6, t)})
s_ = solve([m + n - 2, -m + 2*n - 7], [m, n])
assert is_zero(x**2 + x*y - 2*y**2 + 2*x + 7*y + s_[m]*s_[n] - (x + 2*y + s_[m])*(x - y + s_[n]))
chk(T, 'ex', 1, s_[m]*s_[n])
chk(T, 'p', 0, max(roots(3*x**2 - 7*x + 2)))
chk(T, 'p', 1, set(solve(t**2 - 5*t + 6, t)))
chk(T, 'p', 2, len({pp + (-12)//pp for pp in range(-12, 13) if pp != 0 and 12 % abs(pp) == 0}))
chk(T, 'p', 3, suff(len(solve(t**2 - 3*t + 2, t)) == 1, len(solve(t**2 - 4*t + 4, t)) == 1))
chk(T, 'p', 4, sum(set(solve((x**2 - x)**2 - 8*(x**2 - x) + 12, x))))
assert is_zero(x**2 - x*y - 2*y**2 - x + 5*y - 2 - (x - 2*y + 1)*(x + y - 2))
chk(T, 'p', 5, (x - 2*y + 1) + (x + y - 2))

T = 'alg-coef'
P = Poly(expand((2*x - 1)**5), x)
chk(T, 'ex', 0, sum(P.coeff_monomial(x**i) for i in (0, 2, 4)))
E = expand((x**2 + a*x + 1)*(x**2 - 3*x + b))
s_ = solve([Poly(E, x).coeff_monomial(x**3), Poly(E, x).coeff_monomial(x)], [a, b], dict=True)
chk(T, 'ex', 1, {sol[a] + sol[b] for sol in s_})
chk(T, 'p', 0, Poly(expand((x + 3)*(x**2 - 2*x + 5)), x).coeff_monomial(x**2))
chk(T, 'p', 1, Poly(expand((x + 1)*(x + 2)*(x + 3)), x).coeff_monomial(x))
P = Poly(expand((3*x - 1)**4), x); chk(T, 'p', 2, sum(P.all_coeffs()[:-1]))
chk(T, 'p', 3, suff(len(solve(a - 2 - 1, a)) == 1, len(solve(a**2 - 9, a)) == 1))
P = Poly(expand((2*x + 1)**3 * (x - 1)**2), x); chk(T, 'p', 4, sum(P.all_coeffs()) - P.coeff_monomial(1))
P = Poly(expand((x**2 - 3*x + 2)**5), x); chk(T, 'p', 5, sum(P.coeff_monomial(x**i) for i in (1, 3, 5, 7, 9)))

T = 'alg-simplify'
bb = a / (1 - 3*a)  # 由 1/a - 1/b = 3 解出 b
chk(T, 'ex', 0, simplify(((2*a + 3*a*b - 2*b)/(a - 2*a*b - b)).subs(b, bb)))
chk(T, 'ex', 1, {simplify(expand(r_**4 + 2*r_**3 - r_**2 - 2*r_ + 5)) for r_ in roots(x**2 + x - 1)})
chk(T, 'p', 0, ((a + b)/(a - b)).subs({a: 2, b: 3}))
chk(T, 'p', 1, ((x*y + y*z + z*x)/(x**2 + y**2 + z**2)).subs({x: 1, y: 2, z: 3}))
chk(T, 'p', 2, ((1 - 1/(x + 1)) / (x/(x**2 - 1))).subs(x, 3))
v2 = {(a**2 + b**2)/(a*b) for a_b in solve(t**2 - 3*t + 2, t) for _ in [0] if (a_b) for a, b in [(a_b, 1)]}
chk(T, 'p', 3, suff(True, len(v2) == 1))
chk(T, 'p', 4, simplify((x*(1/y + 1/z) + y*(1/z + 1/x) + z*(1/x + 1/y)).subs(z, -x - y)))
v1 = {((x + 2*y)/(x - y)).subs(x, r_*y).simplify() for r_ in solve(t**2 - 3*t + 2, t) if r_ != 1}
chk(T, 'p', 5, suff(len(v1) == 1, True))

T = 'alg-telescope'
chk(T, 'ex', 0, sum(R(1, i*(i + 3)) for i in range(1, 29, 3)))
chk(T, 'ex', 1, sum(R(1, i*(i + 2)) for i in range(1, 9)))
chk(T, 'p', 0, sum(R(1, i*(i + 1)) for i in range(1, 10)))
chk(T, 'p', 1, nsimplify(sum(1/(sqrt(i) + sqrt(i + 1)) for i in range(1, 25)).evalf(40), tolerance=1e-30))
chk(T, 'p', 2, sum(R(1, i*(i + 2)) for i in range(2, 19, 2)))
S_ = lambda N: sum(R(1, i*(i + 1)) for i in range(1, N + 1))  # noqa: E731
chk(T, 'p', 3, suff(S_(20) > R(19, 20), all(S_(N) > R(19, 20) for N in range(19, 60))))
chk(T, 'p', 4, sum(R(1, sum(range(1, i + 1))) for i in range(1, 11)))
chk(T, 'p', 5, min(N for N in range(1, 100) if sum(R(1, (i + 1)*(i + 2)) for i in range(1, N + 1)) > R(9, 20)))

# ======================= 比例与绝对值 =======================
import itertools  # noqa: E402

R_ = S.Reals


def sol_set(expr_rel):
    return solveset(expr_rel, x, R_)


def pw_min(f, pts):
    """分段线性函数的最小值：在所有转折点处取值。"""
    return min(f.subs(x, v) for v in pts)


def pw_max(f, pts):
    vals_ = [f.subs(x, v) for v in pts]
    assert f.subs(x, 10**6) <= max(vals_) and f.subs(x, -10**6) <= max(vals_)
    return max(vals_)


T = 'alg-ratio-k'
s_ = solve(35*k - 70, k)[0]; chk(T, 'ex', 0, 15*s_)
s_ = solve([x + y - 3*k, y + z - 4*k, z + x - 5*k], [x, y, z]); chk(T, 'ex', 1, simplify(((2*x + y - z)/(x + y + z)).subs(s_)))
chk(T, 'p', 0, R(3 + 4 + 5, 4))
chk(T, 'p', 1, 130 * R(1, 3) / (R(1, 2) + R(1, 3) + R(1, 4)))
s_ = solve(2*2*k + 3*k - 4*k - 15, k)[0]; chk(T, 'p', 2, 9*s_)
chk(T, 'p', 3, suff(R(1 + 2, 3) == 1, simplify((a + 2*a)/(3*a)) == 1))
s_ = solve(8*(3*k - 10) - 7*(2*k + 10), k)[0]; chk(T, 'p', 4, 5*s_)
s_ = solve([x - 2*y + z, 2*x + y - 3*z], [x, y]); assert s_ == {x: z, y: z}
chk(T, 'p', 5, suff(False, False, True))

T = 'alg-ratio-eq'
from sympy import Matrix  # noqa: E402
ks = set(solve(Matrix([[-k, 1, 1], [1, -k, 1], [1, 1, -k]]).det(), k)); assert ks == {2, -1}
chk(T, 'ex', 0, ks)
chk(T, 'ex', 1, {kk**3 for kk in ks})
chk(T, 'p', 0, R(2, 3))
ks2 = set(solve(Matrix([[1, -k, -k], [-k, 1, -k], [-k, -k, 1]]).det(), k)); chk(T, 'p', 1, ks2)
assert R(1 + 1, 1) == 2  # 正数时 a+b+c≠0，k=2；y=2x+2 斜率、截距均为正
chk(T, 'p', 2, '第一、二、三')
chk(T, 'p', 3, suff(True, True))  # 正数 → k=2；a+b+c=0 → k=-1
chk(T, 'p', 4, {kk**2 - kk for kk in ks2})
chk(T, 'p', 5, suff(len({kk**3 for kk in ks}) == 1, False, True))

T = 'alg-nonneg'
chk(T, 'ex', 0, 1 - 2 + 3)
chk(T, 'ex', 1, 3**2)
chk(T, 'p', 0, R(2)**-1)
s_ = solve([a + b - 5, a - b + 1], [a, b]); chk(T, 'p', 1, s_[a]**s_[b])
s_ = solve([x + y - 3, x - y + 1], [x, y]); chk(T, 'p', 2, s_[x]**2 + s_[y]**2)
chk(T, 'p', 3, suff(1 + (-1) == 0, False))  # (2) 只得 x=y
assert is_zero(a**2 + b**2 + c**2 + 50 - 6*a - 8*b - 10*c - ((a - 3)**2 + (b - 4)**2 + (c - 5)**2))
assert 3**2 + 4**2 == 5**2
chk(T, 'p', 4, R(1, 2) * 3 * 4)
assert is_zero(x**2 + y**2 + z**2 - 2*x - 4*y - 6*z + 13 - ((x - 1)**2 + (y - 2)**2 + (z - 3)**2 - 1))
chk(T, 'p', 5, suff(True, (2 + 2 + 3) == (0 + 2 + 3)))

T = 'alg-selfratio'
signs = list(itertools.product([1, -1], repeat=3))
mixed = [s for s in signs if len(set(s)) > 1]  # 和为 0 → 不能同号
chk(T, 'ex', 0, {sum(s) for s in mixed if s[0]*s[1]*s[2] > 0})
chk(T, 'ex', 1, {sum(s) + s[0]*s[1]*s[2] for s in signs})
chk(T, 'p', 0, -1 + 2)
chk(T, 'p', 1, {s1 + s2 for s1, s2 in [(1, -1), (-1, 1)]})
chk(T, 'p', 2, {s[0]*s[1]*s[2] for s in signs if sum(s) == 1})
v1 = {sum(s) for s in signs if s[0]*s[1]*s[2] < 0}
v2 = {sum(s) for s in mixed}
vj = {sum(s) for s in mixed if s[0]*s[1]*s[2] < 0}
chk(T, 'p', 3, suff(v1 == {1}, v2 == {1}, vj == {1}))
chk(T, 'p', 4, sum({sx + sy + sx*sy for sx in (1, -1) for sy in (1, -1)}))
vj = {sum(s) for s in mixed if s[0]*s[1] > 0}
chk(T, 'p', 5, suff(len({sum(s) for s in mixed}) == 1, False, len(vj) == 1))

T = 'alg-abs-model'
chk(T, 'ex', 0, pw_min(Abs(x - 1) + Abs(x + 3), [1, -3]))
chk(T, 'ex', 1, pw_min(sum(Abs(x - i) for i in range(1, 6)), range(1, 6)))
chk(T, 'p', 0, pw_min(Abs(x + 2) + Abs(x - 4), [-2, 4]))
chk(T, 'p', 1, pw_max(Abs(x - 1) - Abs(x + 2), [1, -2]))
chk(T, 'p', 2, pw_min(Abs(2*x - 4) + Abs(x + 1), [2, -1]))
mn = pw_min(Abs(x - 2) + Abs(x + 1), [2, -1]); assert mn == 3
chk(T, 'p', 3, suff(True, True))  # 无解 ⇔ a ≤ 3；a≤3、a<2 都在其中
assert solveset(Abs(a - 1) >= 3, a, R_) == Interval(-oo, -2).union(Interval(4, oo))
chk(T, 'p', 4, r'a\le-2 或 a\ge4')
assert solveset(Eq_ := Abs(x - 1) + Abs(x - 3) - 2, x, R_) == Interval(1, 3)
assert len(solveset(Abs(x - 1) + Abs(x - 3) - 3, x, R_)) == 2
chk(T, 'p', 5, suff(True, False))

T = 'alg-abs-eq'
rs = solveset(Abs(x - 1) + Abs(x + 2) - 5, x, R_); chk(T, 'ex', 0, rs.args[0] * rs.args[1])
nroots = lambda av: len(solveset(Abs(x**2 - 2*x - 3) - av, x, R_))  # noqa: E731
assert [nroots(v) for v in (R(1, 2), 2, R(39, 10))] == [4, 4, 4] and [nroots(v) for v in (0, 4, 5)] == [2, 3, 2]
chk(T, 'ex', 1, '0<a<4')
chk(T, 'p', 0, sum(solveset(Abs(2*x - 3) - 5, x, R_)))
assert solveset(Abs(x - 2) - (2*x - 1), x, R_) == FiniteSet(1)
chk(T, 'p', 1, 'x=1')
assert solveset(Abs(x + 1) + Abs(x - 3) - 4, x, R_) == Interval(-1, 3)
chk(T, 'p', 2, '无数个')
chk(T, 'p', 3, suff(True, False))
rs = solveset(x**2 - Abs(x) - 6, x, R_); chk(T, 'p', 4, rs.args[0] * rs.args[1])
nk = lambda kv: len(solveset(Abs(x - 1) - kv*x, x, R_))  # noqa: E731
assert all(nk(v) == 2 for v in (R(1, 10), R(1, 4), R(49, 100), R(51, 100), R(3, 4), R(99, 100)))
assert all(nk(v) < 2 for v in (1, 0, -R(1, 2), 2, -3))
chk(T, 'p', 5, suff(True, True))

T = 'alg-abs-ineq'
chk(T, 'ex', 0, len([i for i in range(-20, 20) if abs(2*i - 1) < 3]))
assert solveset(Abs(x - 1) + Abs(x + 2) < 5, x, R_) == Interval.open(-3, 2)
chk(T, 'ex', 1, '(-3,2)')
chk(T, 'p', 0, len([i for i in range(-20, 20) if abs(i - 3) <= 2]))
assert solveset(Abs(x + 1) > 2*x - 4, x, R_) == Interval.open(-oo, 5)
chk(T, 'p', 1, 'x<5')
assert solveset(Abs(x - 1) < Abs(x + 3), x, R_) == Interval.open(-1, oo)
chk(T, 'p', 2, 'x>-1')
assert all(Interval.open(v - 1, v + 1).is_subset(Interval.open(0, 3)) == (1 <= v <= 2) for v in (R(1, 2), 1, R(3, 2), 2, R(5, 2), 3))
chk(T, 'p', 3, suff(1 <= R(3, 2) <= 2, False))  # (2) 含 a=3 不满足 1≤a≤2
chk(T, 'p', 4, pw_max(Abs(x + 1) - Abs(x - 2), [-1, 2]))
c1 = solveset(Abs(2*x - 2) < 4, x, R_) == Interval.open(-1, 3)
c2 = solveset(Abs(-2*x - 2) < 4, x, R_) == Interval.open(-1, 3)
chk(T, 'p', 5, suff(c1, c2))

T = 'alg-tri-ineq'
assert expand((a + b)**2 - (a - b)**2) == 4*a*b
chk(T, 'ex', 0, a*b < 0)
chk(T, 'ex', 1, {aa + bb for aa in (2, -2) for bb in (5, -5) if abs(aa - bb) == abs(aa) + abs(bb)})
chk(T, 'p', 0, {abs(aa + bb) for aa in (3, -3) for bb in (4, -4) if aa*bb < 0})
chk(T, 'p', 1, {aa - bb for aa in (1, -1) for bb in (3, -3) if abs(aa + bb) == abs(aa) + abs(bb)})
chk(T, 'p', 2, suff(True, abs(1 + (-1)) == abs(1) + abs(-1)))
chk(T, 'p', 3, r'|a-b|\le|a|+|b|')
chk(T, 'p', 4, suff(True, True))
assert solveset((x - 1)*(x + 2) >= 0, x, R_) == Interval(-oo, -2).union(Interval(1, oo))
assert all(abs(v - 1) + abs(v + 2) == abs(2*v + 1) for v in (-5, -2, 1, 3)) and abs(0 - 1) + abs(0 + 2) != abs(1)
chk(T, 'p', 5, r'x\le-2 或 x\ge1')

# ======================= 函数 =======================
def nreal(expr, var=x):
    """实根（去重）列表。"""
    return sorted(set(r_ for r_ in solve(expr, var) if r_.is_real), key=lambda v: float(v))


def interval_min(f, lo, hi):
    pts = [lo, hi] + [r_ for r_ in solve(diff(f, x), x) if r_.is_real and lo <= r_ <= hi]
    return min(f.subs(x, v) for v in pts)


T = 'alg-quad-graph'
chk(T, 'ex', 0, a*b*c > 0)
assert 1 * (-2) * (-1) > 0  # a>0, b<0, c<0
cnt = set()
for av in (-1, -2, R(-1, 3)):
    bv, cv = -2*av, -3*av
    assert (av - bv + cv) == 0 and -bv/(2*av) == 1
    cnt.add(sum(bool(v) for v in [av*bv*cv < 0, 2*av + bv == 0, av + bv + cv < 0, 3*av + cv == 0]))
chk(T, 'ex', 1, cnt)
chk(T, 'p', 0, r'a<0,\ c>0')
s_ = solve([c + 3, 1 + b + c], [b, c]); fq = x**2 + s_[b]*x + s_[c]
assert (-s_[b]/2, fq.subs(x, -s_[b]/2)) == (-1, -4)
chk(T, 'p', 1, '(-1,-4)')
E = expand(1*(x + 1)*(x - 3)); P_ = Poly(E, x)
bv, cv = P_.coeff_monomial(x), P_.coeff_monomial(1)
assert bv < 0 and not cv > 0 and not E.subs(x, 1) > 0 and not bv**2 < 4*cv
chk(T, 'p', 2, b < 0)
chk(T, 'p', 3, suff(False, False, (-1)*(-1)*(-1) > 0))
av = solve((a*(x - 2)**2 - 1).subs(x, 0), a)[0]; chk(T, 'p', 4, (av*(x - 2)**2 - 1).subs(x, 1))
chk(T, 'p', 5, suff(all((av*x*(x - 2)).subs(x, 1) < 0 for av in (1, 2, R(1, 2))), True))

T = 'alg-quad-max'
fq = x**2 - 4*x + 3; chk(T, 'ex', 0, max(fq.subs(x, v) for v in (0, 2, 3)) + interval_min(fq, 0, 3))
good = [av for av in (-2, 2, 1, 0, 3) if interval_min(x**2 - 2*av*x + 1, 0, 2) == -3]
chk(T, 'ex', 1, set(good))
fq = -x**2 + 6*x - 5; chk(T, 'p', 0, fq.subs(x, 3))
chk(T, 'p', 1, interval_min(x**2 - 2*x - 3, 2, 4))
chk(T, 'p', 2, solve(diff((x - 20)*(100 - x), x), x)[0])
chk(T, 'p', 3, suff(interval_min(x**2 + 2*x, -10, 10) == -1, True))  # (2) 最小值 = -(b²-4c)/4 = -1
fq = (4 - 2*y)**2 + y**2; chk(T, 'p', 4, fq.subs(y, solve(diff(fq, y), y)[0]))
fq = x**2 - 2*x + 2
c1 = all(interval_min(fq, tv, tv + 1) == 1 for tv in (0, R(1, 3), 1))
c2 = all(interval_min(fq, tv, tv + 1) == 1 for tv in (-1, R(-1, 2), 0))
chk(T, 'p', 5, suff(c1, c2))

T = 'alg-quad-sym'
fq = x**2 - 2*x
assert fq.subs(x, 2) < fq.subs(x, -1) < fq.subs(x, 4)
chk(T, 'ex', 0, 'f(2)<f(-1)<f(4)')
chk(T, 'ex', 1, simplify((a*x**2 + b*x + c).subs(x, -b/a)))
chk(T, 'p', 0, 2*3 - 1)
assert 2*(-1) - 1 == -3
chk(T, 'p', 1, '(-3,0)')
fq = -x**2 + 4*x
assert fq.subs(x, 5) < fq.subs(x, 1) < fq.subs(x, 2)
chk(T, 'p', 2, 'f(5)<f(1)<f(2)')
chk(T, 'p', 3, suff(True, False))
bv = -2; chk(T, 'p', 4, solve((x**2 + bv*x + c).subs(x, 1) + 4, c)[0])
chk(T, 'p', 5, suff(True, ((-1)*(3 - 1)**2) > ((-1)*(2 - 1)**2)))

T = 'alg-explog'
chk(T, 'ex', 0, sum(nreal(4**x - 3*2**(x + 1) + 8)))
chk(T, 'ex', 1, nsimplify((1/(log(10)/log(2)) + 1/(log(10)/log(5))).evalf(30)))
chk(T, 'p', 0, nsimplify((log(8, 2) + log(100, 10)).evalf(30)))
chk(T, 'p', 1, nsimplify((log(2, 10)**2 + log(2, 10)*log(50, 10) + log(25, 10)).evalf(30)))
chk(T, 'p', 2, nsimplify((log(3, 2)*log(4, 3)*log(8, 4)).evalf(30)))
chk(T, 'p', 3, suff(len(solve(x**2 - 4, x)) == 1, True))
sol_ = [v for v in solve((x + 1)*(x - 2) - 4, x) if v + 1 > 0 and v - 2 > 0]; assert sol_ == [3]
chk(T, 'p', 4, 'x=3')
K = 36
aa, bb, cc = log(K)/log(3), log(K)/log(4), log(K)/log(6)
assert abs((2/cc - 2/aa - 1/bb).evalf()) < 1e-20 and abs((1/cc - 1/aa - 1/bb).evalf()) > 0.01 and abs((2/cc - 1/aa - 1/bb).evalf()) > 0.01
chk(T, 'p', 5, r'\frac2c=\frac2a+\frac1b')

T = 'alg-set'
vals_a = {0} | {av for av in (R(1), R(2)) if True}  # 2/a = 1 → a=2；2/a = 2 → a=1
assert all(R(2, av) in (1, 2) for av in (1, 2))
chk(T, 'ex', 0, sum(vals_a))
def subset_ok(mv):
    lo, hi = mv + 1, 2*mv - 1
    return lo > hi or (lo >= -2 and hi <= 5)
assert all(subset_ok(mv) == (mv <= 3) for mv in [R(i, 4) for i in range(-40, 40)])
chk(T, 'ex', 1, r'm\le3')
chk(T, 'p', 0, 2**3 - 1)
assert solveset(x**2 - x - 6 < 0, x, R_).intersect(Interval.open(1, oo)) == Interval.open(1, 3)
chk(T, 'p', 1, '(1,3)')
chk(T, 'p', 2, 30 + 25 - (50 - 5))
chk(T, 'p', 3, suff(Interval.open(-oo, 2).intersect(Interval.open(2, oo)) == S.EmptySet, Interval.open(-oo, R(5, 2)).intersect(Interval.open(2, oo)) == S.EmptySet))
good = [av for av in nreal(a**2 - a - 2, a) + [1] if len({1, 3, av**2}) == 3 and {1, av + 2} <= {1, 3, av**2}]
chk(T, 'p', 4, set(good))
chk(T, 'p', 5, suff(True, len(nreal(x**2 - 2*x + 1)) == 0))

T = 'alg-maxmin-fn'
grid = [R(i, 8) for i in range(-80, 81)]
fmin = lambda e1, e2, v: min(e1.subs(x, v), e2.subs(x, v))  # noqa: E731
fmax = lambda e1, e2, v: max(e1.subs(x, v), e2.subs(x, v))  # noqa: E731
chk(T, 'ex', 0, max(fmin(2 - x, x, v) for v in grid))
chk(T, 'ex', 1, min(fmax(x**2, 2*x + 3, v) for v in grid))
chk(T, 'p', 0, max(fmin(x + 1, 5 - x, v) for v in grid))
chk(T, 'p', 1, min(fmax(x + 2, -x + 4, v) for v in grid))
chk(T, 'p', 2, max(fmin(4 - x**2, x + 2, v) for v in grid))
chk(T, 'p', 3, suff(False, False, (4 + 2) / 2 == 3))
chk(T, 'p', 4, max(fmin(2**x, 3 - x, v) for v in grid))
chk(T, 'p', 5, suff(all(fmax(x - 1, 3 - x, v) >= 2 for v in grid if v >= 3), all(fmax(x - 1, 3 - x, v) >= 2 for v in grid if v <= 2)))

# ======================= 方程 =======================
pgrid = [R(i, 10) for i in range(-60, 61)]


def n_distinct_real(expr):
    return len(nreal(expr))


T = 'alg-delta'
has_root = lambda kv: n_distinct_real((kv - 1)*x**2 + 2*x + 1) > 0  # noqa: E731
assert all(has_root(kv) == (kv <= 2) for kv in pgrid)
chk(T, 'ex', 0, r'k\le2')
D_ = (b**2 + c**2 - a**2)**2 - 4*b**2*c**2
assert expand(D_ - (b - c - a)*(b - c + a)*(b + c - a)*(b + c + a)) == 0
assert all(D_.subs({a: p_, b: q_, c: r_}) < 0 for p_, q_, r_ in [(3, 4, 5), (2, 3, 4), (5, 5, 5), (4, 7, 9)])
chk(T, 'ex', 1, '没有实根')
chk(T, 'p', 0, solve(16 - 4*m, m)[0])
two = lambda kv: kv != 0 and n_distinct_real(kv*x**2 - 2*x - 1) == 2  # noqa: E731
assert all(two(kv) == (kv > -1 and kv != 0) for kv in pgrid)
chk(T, 'p', 1, r'k>-1 且 k\neq0')
assert all((n_distinct_real(x**2 - x - mv) == 2) == (mv > R(-1, 4)) for mv in pgrid)
chk(T, 'p', 2, m > -R(1, 4))
chk(T, 'p', 3, suff(n_distinct_real(x**2 + 2*x + 1) > 0, all(n_distinct_real(x**2 + 2*av*x + bv) > 0 for av in (-2, 0, 3) for bv in (-1, -5))))
def has_root2(av):
    e = (av**2 - 1)*x**2 - 2*(av + 1)*x + 1
    return e != 0 and n_distinct_real(e) > 0 if e.free_symbols else False
assert all(has_root2(av) == (av > -1) for av in pgrid)
chk(T, 'p', 4, a > -1)
chk(T, 'p', 5, suff(all(n_distinct_real(av*x**2 + bv*x + cv) == 2 for av, bv, cv in [(1, 0, -1), (-2, 3, 5), (3, -1, -2)]), n_distinct_real(x**2 - 2*x + 1) == 2))

T = 'alg-vieta'
rs = nreal(x**2 - 3*x - 1); chk(T, 'ex', 0, simplify(rs[0]**-2 + rs[1]**-2))
ok_m = [mv for mv in solve(4*(m + 1)**2 - 2*m**2 - 4, m) if 4*(mv + 1)**2 - 4*mv**2 >= 0]
chk(T, 'ex', 1, set(ok_m))
rs = nreal(2*x**2 - 6*x + 1); chk(T, 'p', 0, simplify(rs[0] + rs[1] + rs[0]*rs[1]))
rs = nreal(x**2 + 5*x + 3); chk(T, 'p', 1, simplify(abs(rs[0] - rs[1])))
tv = solve(t + 3*t - 4, t)[0]; chk(T, 'p', 2, tv * 3*tv)
chk(T, 'p', 3, suff(False, False, True))
ok_k = [kv for kv in solve((1 - 2*k)**2 - 2*k**2 - 9, k) if (2*kv - 1)**2 - 4*kv**2 >= 0]
chk(T, 'p', 4, set(ok_k))
chk(T, 'p', 5, suff(n_distinct_real(x**2 - x + 1) > 0, False, True))

T = 'alg-reduce'
chk(T, 'ex', 0, {simplify(expand(r_**3 - 2*r_**2 + 2025)) for r_ in nreal(x**2 - x - 1)})
rs = nreal(x**2 + x - 3); chk(T, 'ex', 1, {simplify(expand(al**3 - 4*be**2 + 19)) for al, be in [(rs[0], rs[1]), (rs[1], rs[0])]})
chk(T, 'p', 0, {simplify(expand(r_**2 - 3*r_ + 2025)) for r_ in nreal(x**2 - 3*x + 1)})
chk(T, 'p', 1, {simplify(expand(2*r_**2 + 4*r_ - 3)) for r_ in nreal(x**2 + 2*x - 1)})
rs = nreal(x**2 - 2*x - 5); chk(T, 'p', 2, {simplify(expand(u**2 + 2*v)) for u, v in [(rs[0], rs[1]), (rs[1], rs[0])]})
chk(T, 'p', 3, suff(all(simplify(expand(r_**3 + 2*r_**2)) == 1 for r_ in nreal(x**2 + x - 1)), 1 + 2 == 1))
rs = nreal(x**2 - 3*x + 1); chk(T, 'p', 4, {simplify(expand(al**3 + 8*be + 6)) for al, be in [(rs[0], rs[1]), (rs[1], rs[0])]})
chk(T, 'p', 5, {simplify(expand(r_**5 - 5*r_)) for r_ in nreal(x**2 - x - 1)})

T = 'alg-root-dist'
straddle = lambda e, kk: (lambda rr: len(rr) == 2 and rr[0] < kk < rr[1])(nreal(e))  # noqa: E731
assert all(straddle(x**2 - 2*mv*x + mv + 2, 1) == (mv > 3) for mv in pgrid)
chk(T, 'ex', 0, m > 3)
both_gt = lambda e, kk: (lambda rr: len(rr) >= 1 and all(v > kk for v in rr))(nreal(e))  # noqa: E731
assert all(both_gt(x**2 - 2*av*x + 4, 1) == (2 <= av < R(5, 2)) for av in pgrid)
chk(T, 'ex', 1, r'2\le a<\frac52')
assert all((lambda rr: len(rr) == 2 and rr[0] < 0 < rr[1])(nreal(x**2 + mv*x + mv - 2)) == (mv < 2) for mv in pgrid)
chk(T, 'p', 0, m < 2)
assert all(both_gt(x**2 - 2*x + av, 0) == (0 < av <= 1) for av in pgrid)
chk(T, 'p', 1, r'0<a\le1')
both_lt = lambda e, kk: (lambda rr: len(rr) >= 1 and all(v < kk for v in rr))(nreal(e))  # noqa: E731
assert all(both_lt(x**2 + (av - 3)*x + av, 0) == (av >= 9) for av in [R(i, 2) for i in range(-10, 40)])
chk(T, 'p', 2, r'a\ge9')
chk(T, 'p', 3, suff(True, straddle(x**2 - x - 1, 2)))
def in_two(mv):
    rr = nreal(7*x**2 - (mv + 13)*x + mv**2 - mv - 2)
    return len(rr) == 2 and 0 < rr[0] < 1 < rr[1] < 2
assert all(in_two(mv) == (-2 < mv < -1 or 3 < mv < 4) for mv in [R(i, 20) for i in range(-60, 100)])
chk(T, 'p', 4, r'-2<m<-1 或 3<m<4')
def two_in(mv):
    rr = nreal(x**2 + (mv - 1)*x + 1)
    return len(rr) == 2 and all(0 < v < 2 for v in rr)
assert all(two_in(mv) == (R(-3, 2) < mv < -1) for mv in [R(i, 40) for i in range(-100, 60)])
chk(T, 'p', 5, suff(two_in(R(-6, 5)), all(two_in(mv) for mv in [R(-5, 4) + R(i, 100) for i in range(1, 25)])))

T = 'alg-int-root'
assert nreal(x**2 - 13*x + 22) == [2, 11]
chk(T, 'ex', 0, 22)
def all_int_roots(e):
    rr = nreal(e) if e.has(x) else []
    return e.has(x) and len(rr) > 0 and all(v.is_integer for v in rr)
chk(T, 'ex', 1, len([kv for kv in range(-20, 21) if all_int_roots(expand(kv*x**2 - (kv + 2)*x + 2))]))
chk(T, 'p', 0, len([mv for mv in range(1, 50) if all_int_roots(x**2 + mv*x + 6)]))
chk(T, 'p', 1, sum(mv for mv in range(1, 50) if any(v.is_integer for v in nreal(x**2 + 4*x + mv))))
chk(T, 'p', 2, min(pv for pv in range(1, 100) if all_int_roots(x**2 - pv*x + 21) and all(v > 0 for v in nreal(x**2 - pv*x + 21))))
chk(T, 'p', 3, suff(all_int_roots(x**2 - 5*x + 6), all_int_roots(expand(x**2 - (R(1, 2) + 3)*x + R(3, 2)))))
chk(T, 'p', 4, sum({av for av in range(-50, 51) if all_int_roots(x**2 - av*x + 2*av)}))
chk(T, 'p', 5, suff(all_int_roots(expand(2*x**2 - 3*x + 1)), all(all_int_roots(expand(mv*x**2 - (mv + 1)*x + 1)) for mv in (0, 1))))

T = 'alg-frac-eq'
chk(T, 'ex', 0, solve(-x + 6 - m, m)[0].subs(x, 3))
def no_solution(mv):
    e = 2/(x - 2) + mv*x/(x**2 - 4) - 3/(x + 2)
    return solveset(e, x, R_) == S.EmptySet
chk(T, 'ex', 1, {mv for mv in range(-20, 21) if no_solution(mv)})
chk(T, 'p', 0, solveset(3/(x - 1) - 2/x, x, R_).args[0])
assert solveset(1/(x - 2) + 3 - (1 - x)/(2 - x), x, R_) == S.EmptySet
chk(T, 'p', 1, '无解')
pos_sol = lambda mv: (lambda ss: len(ss) == 1 and list(ss)[0] > 0)(solveset((x + mv)/(x - 2) - 3, x, R_))  # noqa: E731
assert all(pos_sol(mv) == (mv > -6 and mv != -2) for mv in pgrid)
chk(T, 'p', 2, r'm>-6 且 m\neq-2')
has_ext = lambda av: solveset(av*x - 2*(x - 1), x, R_).contains(1) == True  # noqa: E731,E712
chk(T, 'p', 3, suff(has_ext(0), has_ext(2)))
chk(T, 'p', 4, sum(solveset((x**2 + 1)/x + 2*x/(x**2 + 1) - 3, x, R_)))
nonneg = lambda mv: (lambda ss: len(ss) == 1 and list(ss)[0] >= 0)(solveset(mv/(x - 1) + 3/(1 - x) - 1, x, R_))  # noqa: E731
chk(T, 'p', 5, suff(all(nonneg(mv) for mv in [R(21, 10), 3, 5]), all(nonneg(mv) for mv in [4, R(9, 2), 10])))

T = 'alg-root-eq'
assert solveset(sqrt(x + 3) - (x + 1), x, R_) == FiniteSet(1)
chk(T, 'ex', 0, 'x=1')
chk(T, 'ex', 1, sum(solveset(x**2 + 3*x - sqrt(x**2 + 3*x) - 6, x, R_)))
chk(T, 'p', 0, solveset(sqrt(2*x - 1) - 3, x, R_).args[0])
assert solveset(sqrt(x + 2) - x, x, R_) == FiniteSet(2)
chk(T, 'p', 1, 'x=2')
chk(T, 'p', 2, solveset(sqrt(x - 1) + sqrt(x + 4) - 5, x, R_).args[0])
chk(T, 'p', 3, suff(solveset(sqrt(x + 7) - (x + 1), x, R_) == FiniteSet(2), solveset(sqrt(3*x - 2) - x, x, R_) == FiniteSet(2)))
chk(T, 'p', 4, sum(solveset(x - 5*sqrt(x) + 6, x, R_)))
two_r = lambda kv: len(solveset(sqrt(x - kv) - x, x, R_)) == 2  # noqa: E731
assert all(two_r(kv) == (0 <= kv < R(1, 4)) for kv in [R(i, 40) for i in range(-20, 30)])
chk(T, 'p', 5, suff(all(two_r(kv) for kv in (R(1, 100), R(1, 8), R(6, 25))), two_r(0)))

T = 'alg-high-eq'
chk(T, 'ex', 0, sum(nreal(x**3 - 2*x**2 - x + 2)))
chk(T, 'ex', 1, simplify(sum(nreal(x**4 + x**3 - 4*x**2 + x + 1))))
chk(T, 'p', 0, n_distinct_real(x**4 - 5*x**2 + 4))
chk(T, 'p', 1, n_distinct_real(x**4 + 3*x**2 - 4))
chk(T, 'p', 2, sum(nreal(x**3 - 3*x + 2)))
four = lambda av: n_distinct_real(x**4 + av*x**2 + 4) == 4  # noqa: E731
assert all(four(av) == (av < -4) for av in pgrid)
chk(T, 'p', 3, suff(four(-5), four(R(-7, 2))))
chk(T, 'p', 4, n_distinct_real((x**2 + 2*x)**2 - 2*(x**2 + 2*x) - 3))
chk(T, 'p', 5, sum(nreal((x + 1)*(x + 2)*(x + 3)*(x + 4) - 24)))

# ======================= 不等式 =======================
def lp_range(target, cons):
    """线性目标在由两组区间约束 lo ≤ L_i ≤ hi 围成的平行四边形上的范围（顶点处取到）。"""
    (L1, l1, h1), (L2, l2, h2) = cons
    vals_ = []
    for v1 in (l1, h1):
        for v2 in (l2, h2):
            sol = solve([L1 - v1, L2 - v2], [a, b])
            vals_.append(target.subs(sol))
    return min(vals_), max(vals_)


def fmin_open(f, lo, hi):
    """开区间上的最小值：驻点处取到（题目保证存在）。"""
    pts = [r_ for r_ in solve(diff(f, x), x) if r_.is_real and lo < r_ < hi]
    return min(simplify(f.subs(x, v)) for v in pts)


T = 'alg-quad-ineq'
s_ = solve([-(R(-1, 2) + R(1, 3)) * a - b, R(-1, 2) * R(1, 3) * a - 2], [a, b])
assert solveset(s_[a]*x**2 + s_[b]*x + 2 > 0, x, R_) == Interval.open(R(-1, 2), R(1, 3))
chk(T, 'ex', 0, s_[a] + s_[b])
def always_neg(av):
    if av == 2:
        return True
    return av - 2 < 0 and 4*(av - 2)**2 + 16*(av - 2) < 0
assert all(always_neg(av) == (-2 < av <= 2) for av in pgrid)
chk(T, 'ex', 1, r'-2<a\le2')
chk(T, 'p', 0, len([i for i in range(-10, 10) if i*i - i - 6 < 0]))
chk(T, 'p', 1, (-(1 + 3)) * (1 * 3))
assert all((mv**2 - 4 < 0) == (-2 < mv < 2) for mv in pgrid)
chk(T, 'p', 2, '-2<m<2')
pos_all = lambda kv: (kv == 0) or (kv > 0 and kv**2 - 4*kv < 0)  # noqa: E731
chk(T, 'p', 3, suff(all(pos_all(kv) for kv in (R(1, 10), 2, R(39, 10))), pos_all(0)))
av = -1; bv, cv = -3*av, 2*av
assert solveset(av*x**2 + bv*x + cv > 0, x, R_) == Interval.open(1, 2)
assert solveset(cv*x**2 + bv*x + av > 0, x, R_) == Interval.open(R(1, 2), 1)
chk(T, 'p', 4, Tuple(R(1, 2), 1))
ge0 = lambda av: (av - 1)**2 - 4 <= 0  # noqa: E731
chk(T, 'p', 5, suff(all(ge0(v) for v in (0, 1, 3, R(5, 2))), ge0(-2)))

T = 'alg-range-ineq'
assert all((interval_min(x**2 - av*x + 1, 1, 2) >= 0) == (av <= 2) for av in pgrid)
chk(T, 'ex', 0, r'a\le2')
assert all(((interval_min(-(x**2 - 2*x), 1, 3)) < -av) == (av < 3) for av in pgrid)  # 存在 x: x²-2x > a ⇔ a < max
chk(T, 'ex', 1, a < 3)
chk(T, 'p', 0, r'a\le1')
chk(T, 'p', 1, r'a\ge-4' if fmin_open(x + 4/x, 0, 100) == 4 else 'x')
chk(T, 'p', 2, interval_min(x**2 - 2*x + 3, 2, 4))
mn = interval_min(x + 4/x, 1, 3); assert mn == 4
chk(T, 'p', 3, suff(True, False))  # a<4；a<3 在内，a≤4 含 4 不行
chk(T, 'p', 4, max(simplify((2*x/(x**2 + 1)).subs(x, v)) for v in solve(diff(2*x/(x**2 + 1), x), x)))
mn = interval_min(2/x - x, 1, 2); assert mn == -1
chk(T, 'p', 5, suff(True, -R(3, 2) > mn))

T = 'alg-sign-ineq'
assert solveset((x - 1)/(x + 2) <= 0, x, R_) == Interval.Lopen(-2, 1)
chk(T, 'ex', 0, '(-2,1]')
assert solveset((x + 2)*(x - 1)**2*(x - 3) < 0, x, R_) == Interval.open(-2, 1).union(Interval.open(1, 3))
chk(T, 'ex', 1, r'(-2,1)\cup(1,3)')
assert solveset((x - 3)/(x + 1) > 0, x, R_) == Interval.open(-oo, -1).union(Interval.open(3, oo))
chk(T, 'p', 0, 'x<-1 或 x>3')
assert solveset(2/(x - 1) < 1, x, R_) == Interval.open(-oo, 1).union(Interval.open(3, oo))
chk(T, 'p', 1, 'x<1 或 x>3')
assert solveset((x + 1)*(x - 2)*(x - 4) < 0, x, R_) == Interval.open(-oo, -1).union(Interval.open(2, 4))
chk(T, 'p', 2, 'x<-1 或 2<x<4')
chk(T, 'p', 3, suff(solveset((x - 2)/(x + 1) <= 0, x, R_) == Interval.Lopen(-1, 2), solveset((x + 2)/(x + 1) <= 0, x, R_) == Interval.Lopen(-1, 2)))
sol_ = solveset((x**2 - 3*x + 2)/(x**2 - 2*x - 3) >= 0, x, R_)
chk(T, 'p', 4, len([i for i in range(-3, 6) if sol_.contains(i) == True]))  # noqa: E712
chk(T, 'p', 5, suff(solveset((x - 1)**2*(x - 1) > 0, x, R_) == Interval.open(1, oo), solveset((x - 1)**2*(x - R(1, 2)) > 0, x, R_) == Interval.open(R(1, 2), oo)))

T = 'alg-amgm'
chk(T, 'ex', 0, fmin_open(x + 4/(x - 1), 1, 100))
chk(T, 'ex', 1, fmin_open(1/x + 4/(1 - x), 0, 1))
chk(T, 'p', 0, fmin_open(x + 9/x, 0, 100))
chk(T, 'p', 1, -fmin_open(-x*(4 - 2*x), 0, 2))
chk(T, 'p', 2, -fmin_open(-x*(4 - 2*x), 0, 2))  # y = 4-2x，xy = x(4-2x)
chk(T, 'p', 3, suff(fmin_open(x + 4/x, 0, 100) == 4, False))
chk(T, 'p', 4, fmin_open(x + 9*x/(x - 1), 1, 100))  # 由 1/x + 9/y = 1 得 y = 9x/(x-1)
assert diff(x + 1/x, x).subs(x, 2) > 0 and solve(diff(x + 1/x, x), x) == [-1, 1]
chk(T, 'p', 5, (x + 1/x).subs(x, 2))

T = 'alg-sum-prod'
chk(T, 'ex', 0, fmin_open(x*(x + 3)/(x - 1), 1, 100))  # b = (a+3)/(a-1)
chk(T, 'ex', 1, fmin_open(x + (x + 3)/(x - 1), 1, 100))
chk(T, 'p', 0, -fmin_open(-x*(10 - x), 0, 10))
chk(T, 'p', 1, fmin_open(x + (8 - x)/(1 + x), 0, 8))
chk(T, 'p', 2, -fmin_open(-x*(8 - x)/(1 + x), 0, 8))
chk(T, 'p', 3, suff(True, 2*sqrt(3) >= 4))
chk(T, 'p', 4, -fmin_open(-(x + sqrt(2 - x**2)), 0, sqrt(2)))
chk(T, 'p', 5, suff(fmin_open(x + (x + 3)/(x - 1), 1, 100) >= 6, fmin_open(x + 9/x, 0, 100) >= 6))

T = 'alg-linear-range'
chk(T, 'ex', 0, Tuple(*lp_range(3*a - b, [(a + b, 1, 3), (a - b, -1, 1)])))
chk(T, 'ex', 1, Tuple(*lp_range(a + 3*b, [(a + b, -1, 1), (a - 2*b, 1, 3)])))
chk(T, 'p', 0, Tuple(2 - 3, 5 - 1))
chk(T, 'p', 1, Tuple(R(1, 8), R(4, 2)))
chk(T, 'p', 2, Tuple(*lp_range(2*a + b, [(a + b, -1, 1), (a - b, 1, 3)])))
chk(T, 'p', 3, suff(2 - 1 > 0, R(0) - R(1, 2) > 0))
chk(T, 'p', 4, Tuple(*lp_range(4*a - 2*b, [(a - b, 1, 2), (a + b, 2, 4)])))
chk(T, 'p', 5, suff(1 + 2*2 == 5, 1 + 2*2 == 5))

# ======================= 数列 =======================
def seq_from_S(Sf, N):
    return [Sf(1)] + [Sf(n_) - Sf(n_ - 1) for n_ in range(2, N + 1)]


def arith(a1, d, N):
    return [a1 + i*d for i in range(N)]


def is_arith(seq):
    return len({seq[i + 1] - seq[i] for i in range(len(seq) - 1)}) == 1


def is_geo(seq):
    return all(v != 0 for v in seq) and len({R(seq[i + 1], 1) / seq[i] for i in range(len(seq) - 1)}) == 1


T = 'alg-sn-an'
sq = seq_from_S(lambda n_: n_**2 + 2*n_ + 1, 5); chk(T, 'ex', 0, sq[0] + sq[4])
sq, Sp = [], 0
for _ in range(6):
    an = Sp + 1  # S_n = 2a_n - 1 且 S_n = S_{n-1} + a_n ⇒ a_n = S_{n-1} + 1
    sq.append(an); Sp += an
chk(T, 'ex', 1, sq[5])
chk(T, 'p', 0, seq_from_S(lambda n_: 2*n_**2 - n_, 4)[3])
chk(T, 'p', 1, seq_from_S(lambda n_: 3**n_ - 1, 3)[2])
sq = seq_from_S(lambda n_: n_**2 - 9*n_, 30); chk(T, 'p', 2, [i + 1 for i, v in enumerate(sq) if 5 < v < 8][0])
chk(T, 'p', 3, suff(is_arith(seq_from_S(lambda n_: n_**2 + n_, 10)), is_arith(seq_from_S(lambda n_: n_**2 + n_ + 1, 10))))
chk(T, 'p', 4, [kv for kv in range(-5, 6) if is_geo(seq_from_S(lambda n_: 2**n_ + kv, 8))][0])
sq, Sp = [], 0
for _ in range(8):
    an = Sp + 2  # S_n = 2a_n - 2 ⇒ a_n = S_{n-1} + 2
    sq.append(an); Sp += an
chk(T, 'p', 5, suff(is_geo(sq), is_geo(seq_from_S(lambda n_: 3**n_, 8))))

T = 'alg-arith-prop'
a1_, d_ = symbols('a1 d')
A_ = lambda n_: a1_ + (n_ - 1)*d_  # noqa: E731
Sx = lambda n_: n_*(2*a1_ + (n_ - 1)*d_)/2  # noqa: E731
s_ = solve(A_(2) + A_(4) + A_(9) + A_(11) - 32, a1_)[0]; chk(T, 'ex', 0, simplify(Sx(12).subs(a1_, s_)))
Sn_ = lambda n_: n_*(2*n_ + 1); Tn_ = lambda n_: n_*(3*n_ + 2)  # noqa: E731,E702
chk(T, 'ex', 1, R(Sn_(5) - Sn_(4), Tn_(5) - Tn_(4)))
s_ = solve(A_(4) + A_(6) - 12, a1_)[0]; chk(T, 'p', 0, simplify(Sx(9).subs(a1_, s_)))
s_ = solve(A_(2) + A_(5) + A_(8) - 15, a1_)[0]; chk(T, 'p', 1, simplify((A_(3) + A_(7)).subs(a1_, s_)))
s_ = solve([Sx(5) - 10, Sx(10) - 30], [a1_, d_]); chk(T, 'p', 2, Sx(15).subs(s_))
s1 = solve(A_(5) - 3, a1_)[0]; c1 = simplify(Sx(9).subs(a1_, s1)).free_symbols == set()
s2 = solve(A_(2) + A_(7) - 6, a1_)[0]; c2 = simplify(Sx(9).subs(a1_, s2)).free_symbols == set()
chk(T, 'p', 3, suff(c1, c2))
s_ = solve([Sx(4) - 1, Sx(8) - 4], [a1_, d_]); chk(T, 'p', 4, sum(A_(i) for i in range(17, 21)).subs(s_))
s1 = solve(Sx(6) - Sx(5), a1_)[0]; c1 = simplify(A_(6).subs(a1_, s1)) == 0
s2 = solve(A_(3) + A_(8), a1_)[0]; c2 = simplify(A_(6).subs(a1_, s2)) == 0
chk(T, 'p', 5, suff(c1, c2))

T = 'alg-sn-max'
dv = solve((Sx(9) - Sx(17)).subs(a1_, 25), d_)[0]
chk(T, 'ex', 0, max(Sx(n_).subs({a1_: 25, d_: dv}) for n_ in range(1, 60)))
lastpos = set()
for a2023, a2024 in [(R(3, 5), R(-2, 5)), (R(9, 10), R(-1, 10)), (R(1, 2), R(-1, 3))]:
    dd = a2024 - a2023; aa1 = a2023 - 2022*dd
    lastpos.add(max(n_ for n_ in range(4000, 4100) if (n_*(2*aa1 + (n_ - 1)*dd)/2) > 0))
chk(T, 'ex', 1, lastpos)
chk(T, 'p', 0, min(Sx(n_).subs({a1_: -11, d_: 2}) for n_ in range(1, 40)))
chk(T, 'p', 1, max(range(1, 30), key=lambda n_: sum(26 - 3*i for i in range(1, n_ + 1))))
chk(T, 'p', 2, max(-2*n_**2 + 21*n_ for n_ in range(1, 30)))
chk(T, 'p', 3, suff(True, True))  # (1) 最后一个正项；(2) a6+a7=0 且递减
best = max(Sx(n_).subs({a1_: 8, d_: -1}) for n_ in range(1, 30))
assert Sx(5).subs({a1_: 8, d_: -1}) == Sx(12).subs({a1_: 8, d_: -1})
chk(T, 'p', 4, {n_ for n_ in range(1, 30) if Sx(n_).subs({a1_: 8, d_: -1}) == best})
chk(T, 'p', 5, suff(False, True))  # a1>0、d>0 时无最大值；d<0 时开口向下

T = 'alg-geo'
q2 = sqrt(R(64, 4)); chk(T, 'ex', 0, 4*q2)
assert sum(2**i for i in range(3)) == 7 and sum(2**i for i in range(6)) == 63
chk(T, 'ex', 1, sum(2**i for i in range(9)))
chk(T, 'p', 0, nsimplify(log(16, 2)))
chk(T, 'p', 1, 3 / (1 - R(1, 3)))
chk(T, 'p', 2, 1 * 2**6)
chk(T, 'p', 3, suff(True, False))  # (2) a4=a6=-4 时 a5=-4 也可能
chk(T, 'p', 4, [qv for qv in solve(1 + q**2 - 5, q) if qv > 0][0])
assert 1 * R(1, 2) < 1 and -1 * 2 < -1  # (1) a1=1,q=1/2 递减；(2) a1=-1,q=2 递减
chk(T, 'p', 5, suff(False, False, True))

T = 'alg-recur'
def run(a1v, step, N):
    sq = [a1v]
    for n_ in range(1, N):
        sq.append(step(sq[-1], n_))
    return sq
chk(T, 'ex', 0, run(R(1), lambda v, n_: 3*v + 2, 4)[3])
chk(T, 'ex', 1, run(R(1), lambda v, n_: v/(1 + 2*v), 10)[9])
chk(T, 'p', 0, run(R(1), lambda v, n_: v + n_, 5)[4])
chk(T, 'p', 1, run(R(2), lambda v, n_: 1 - 1/v, 2024)[2023])
chk(T, 'p', 2, run(R(1), lambda v, n_: R(n_ + 1, n_)*v, 2025)[2024])
chk(T, 'p', 3, suff(run(R(1), lambda v, n_: 2*v + 1, 5)[4] == 31, run(R(1), lambda v, n_: v + 2*n_, 5)[4] == 31))
sq = [1, 3]
while len(sq) < 2024:
    sq.append(sq[-1] - sq[-2])
chk(T, 'p', 4, sum(sq))
chk(T, 'p', 5, sum(run(R(3), lambda v, n_: 2*v - 1, 10)))

# ======================= 汇总 =======================
missing = [f'{tid} {w}{i + 1}' for tid, d in DATA.items() for w in ('ex', 'p') for i in range(len(d[w])) if (tid, w, i) not in covered]
if missing:
    print('未验算：', '、'.join(missing))
if fails:
    print('\n'.join(fails))
    print(f'共 {len(fails)} 处不一致')
    sys.exit(1)
print(f'全部通过（验算 {len(covered)} 题）' + ('' if not missing else f'，另有 {len(missing)} 题未覆盖'))
