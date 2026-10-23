import math, numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

OUT = __import__("sys").argv[1]
BLUE, GREEN, RED, GRAY, DARK = "#2f6fdb", "#2e9e6b", "#d64545", "#8a93a3", "#1c2433"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10, "axes.spines.top": False, "axes.spines.right": False,
                     "axes.edgecolor": "#b8bfcc", "axes.labelcolor": DARK, "xtick.color": DARK, "ytick.color": DARK})
phi = lambda x: 0.5 * (1 + math.erf(x / math.sqrt(2)))
def ninv(p):
    lo, hi = -10, 10
    for _ in range(80):
        m = (lo + hi) / 2
        lo, hi = (m, hi) if phi(m) < p else (lo, m)
    return (lo + hi) / 2

# 1. Flow diagram
fig, ax = plt.subplots(figsize=(9, 3.4)); ax.axis("off"); ax.set_xlim(0, 100); ax.set_ylim(0, 42)
def box(x, y, w, h, title, sub, color):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.4,rounding_size=1.5", fc=color, ec="none", alpha=0.14))
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.4,rounding_size=1.5", fc="none", ec=color, lw=1.4))
    ax.text(x + w / 2, y + h - 3.2, title, ha="center", va="center", fontweight="bold", color=DARK, fontsize=9.5)
    ax.text(x + w / 2, y + (h - 6) / 2, sub, ha="center", va="center", color=DARK, fontsize=8.3, linespacing=1.5)
def arrow(x1, y1, x2, y2):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle="-|>", mutation_scale=14, color=GRAY, lw=1.4))
box(1, 10, 22, 24, "1. Ваша «правда»", "метрика\nчисло пользователей\nнастоящий эффект\nшум, SRM, сид", BLUE)
box(30, 10, 20, 24, "2. Симуляция", "пользователи делятся\nна группы (по хешу)\nповедение до теста\nи во время теста", BLUE)
box(57, 22, 24, 12, "Frequentist", "p-value, доверит. интервал", GREEN)
box(57, 6.5, 24, 12, "Bayesian", "chance to win, риск", GREEN)
box(86, 10, 13, 24, "3. Вывод", "верим ли\nмы тесту?", RED)
arrow(23.8, 22, 29.2, 22); arrow(50.8, 26, 56.2, 28); arrow(50.8, 18, 56.2, 13); arrow(81.8, 28, 85.2, 25); arrow(81.8, 13, 85.2, 19)
ax.text(69, 39, "CUPED и Bootstrap уточняют оба анализа", ha="center", fontsize=8.3, color=GRAY, style="italic")
fig.savefig(f"{OUT}/flow.png", dpi=200, bbox_inches="tight"); plt.close(fig)

# 2. Peeking path on a real A/A simulation
def aa_path(seed, n=20000, p=0.1, step=500):
    rng = np.random.default_rng(seed); g = rng.random(n) < 0.5; y = rng.random(n) < p
    xs, ps = [], []
    for k in range(step, n + 1, step):
        a, b = y[:k][~g[:k]], y[:k][g[:k]]
        p1, p2 = a.mean(), b.mean(); pool = y[:k].mean()
        se = math.sqrt(pool * (1 - pool) * (1 / len(a) + 1 / len(b)))
        z = (p2 - p1) / se if se else 0
        xs.append(k); ps.append(2 * (1 - phi(abs(z))))
    return xs, ps
seed = next(s for s in range(1, 500) if (lambda r: min(r[1][:-1]) < 0.03 and r[1][-1] > 0.3)(aa_path(s)))
xs, ps = aa_path(seed)
fig, ax = plt.subplots(figsize=(8, 3.3))
ax.plot(xs, ps, color=BLUE, lw=2); ax.axhline(0.05, color=RED, ls="--", lw=1.3); ax.text(xs[-1], 0.07, "alpha = 0.05", color=RED, ha="right", fontsize=9)
i = int(np.argmin(ps)); ax.scatter([xs[i]], [ps[i]], color=RED, zorder=5, s=40)
ax.annotate("здесь можно «объявить победу»\n(но эффекта нет вообще)", (xs[i], ps[i]), (xs[i] + 2000, 0.3), color=RED, fontsize=9, arrowprops=dict(arrowstyle="->", color=RED))
ax.annotate("в конце теста: p = %.2f" % ps[-1], (xs[-1], ps[-1]), (xs[-1] - 7500, ps[-1] - 0.3), color=DARK, fontsize=9, arrowprops=dict(arrowstyle="->", color=GRAY))
ax.set_ylim(0, 1.08); ax.set_xlabel("пользователей в тесте"); ax.set_ylabel("p-value"); ax.set_title("A/A тест (настоящий эффект = 0): p-value по ходу теста", fontsize=10.5, loc="left", color=DARK, pad=10)
fig.savefig(f"{OUT}/peeking.png", dpi=200, bbox_inches="tight"); plt.close(fig)

# 3. A/A bars (values from the app's A/A panel, 300 runs)
fig, ax = plt.subplots(figsize=(8, 3.2))
labels = ["Frequentist", "Bayesian*"]; once = [4.0, 9.3]; peek = [31.7, 52.0]; x = np.arange(2); w = 0.34
b1 = ax.bar(x - w / 2, once, w, color=GREEN, label="смотрим один раз в конце"); b2 = ax.bar(x + w / 2, peek, w, color=RED, label="останавливаемся при первой «победе»")
for b in list(b1) + list(b2): ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 1, f"{b.get_height():.0f}%", ha="center", fontsize=9)
ax.axhline(5, color=GRAY, ls="--", lw=1); ax.text(1.62, 6.2, "alpha = 5%", color=GRAY, fontsize=8.5, ha="right")
ax.set_xticks(x); ax.set_xticklabels(labels); ax.set_ylabel("ложные победы, % из 300 A/A"); ax.set_ylim(0, 62); ax.legend(frameon=False, fontsize=9, loc="upper left")
ax.set_title("Подсматривание раздувает ложные победы в 5–8 раз", fontsize=10.5, loc="left", color=DARK)
fig.savefig(f"{OUT}/aa_bars.png", dpi=200, bbox_inches="tight"); plt.close(fig)

# 4. Posterior (default seed 1) + frequentist CI
mean, sd = 0.068, 0.0618
fig, (a1, a2) = plt.subplots(1, 2, figsize=(9, 3.2), gridspec_kw={"width_ratios": [1.5, 1]})
xx = np.linspace(-0.2, 0.35, 400); yy = np.exp(-0.5 * ((xx - mean) / sd) ** 2) / (sd * math.sqrt(2 * math.pi))
a1.plot(xx, yy, color=DARK, lw=1.5); a1.fill_between(xx, yy, where=xx > 0, color=GREEN, alpha=0.35); a1.fill_between(xx, yy, where=xx <= 0, color=RED, alpha=0.35)
a1.axvline(0, color=DARK, lw=1); a1.text(0.07, 2.3, "B лучше A\n86%", color=GREEN, fontweight="bold", ha="center"); a1.text(-0.07, 1.0, "хуже\n14%", color=RED, fontweight="bold", ha="center", fontsize=9)
a1.set_yticks([]); a1.set_xlabel("относительный uplift"); a1.xaxis.set_major_formatter(lambda v, _: f"{v*100:.0f}%"); a1.set_title("Bayesian: что мы думаем об uplift", fontsize=10, loc="left"); a1.spines["left"].set_visible(False)
a2.errorbar([0.0069], [0], xerr=[[0.0069 + 0.0051], [0.0190 - 0.0069]], fmt="o", color=BLUE, capsize=5, lw=2)
a2.axvline(0, color=RED, ls="--"); a2.set_ylim(-1, 1); a2.set_yticks([]); a2.spines["left"].set_visible(False)
a2.xaxis.set_major_formatter(lambda v, _: f"{v*100:.1f}%"); a2.set_xlabel("разница control → treatment"); a2.set_title("Frequentist: CI включает 0", fontsize=10, loc="left")
a2.text(0.0069, 0.45, "p = 0.26", ha="center", color=DARK, fontsize=9)
fig.tight_layout(); fig.savefig(f"{OUT}/posterior.png", dpi=200, bbox_inches="tight"); plt.close(fig)

# 5. CUPED intervals (conversion, 20k users, corr 0.9, seed 1)
fig, ax = plt.subplots(figsize=(8, 2.6))
rows = [("Без CUPED", 0.0078, -0.0008, 0.0163, "p = 0.077", GRAY), ("С CUPED", 0.0088, 0.0015, 0.0161, "p = 0.019", GREEN)]
for k, (name, d, lo, hi, p, c) in enumerate(rows):
    ax.errorbar([d], [1 - k], xerr=[[d - lo], [hi - d]], fmt="o", color=c, capsize=6, lw=2.5, ms=7); ax.text(0.0205, 1 - k, p, va="center", color=c, fontweight="bold")
ax.axvline(0, color=RED, ls="--"); ax.set_yticks([1, 0]); ax.set_yticklabels([r[0] for r in rows]); ax.set_ylim(-0.6, 1.6); ax.set_xlim(-0.004, 0.024)
ax.xaxis.set_major_formatter(lambda v, _: f"{v*100:.1f}%"); ax.set_xlabel("абсолютная разница conversion (95% CI)")
ax.set_title("Те же 20 000 пользователей: CUPED сузил интервал, и он перестал включать 0", fontsize=10.5, loc="left", color=DARK)
fig.savefig(f"{OUT}/cuped.png", dpi=200, bbox_inches="tight"); plt.close(fig)

# 6. Lognormal order values
fig, ax = plt.subplots(figsize=(8, 3))
xv = np.linspace(0.5, 250, 800)
for s, c in [(0.5, GREEN), (1.0, BLUE), (2.0, RED)]:
    mu = math.log(50) - s * s / 2; pdf = np.exp(-(np.log(xv) - mu) ** 2 / (2 * s * s)) / (xv * s * math.sqrt(2 * math.pi))
    ax.plot(xv, pdf, color=c, lw=2, label=f"sigma = {s}")
ax.set_ylim(0, 0.045); ax.set_xlabel("размер чека (средний чек = 50 во всех случаях)"); ax.set_yticks([]); ax.spines["left"].set_visible(False); ax.legend(frameon=False)
ax.set_title("Чем больше sigma, тем длиннее хвост: редкие огромные заказы раскачивают среднее", fontsize=10.5, loc="left", color=DARK)
fig.savefig(f"{OUT}/tail.png", dpi=200, bbox_inches="tight"); plt.close(fig)

# 7. Power curves
def power(n, b, m, a=0.05):
    p1, p2 = b, b * (1 + m); d = abs(p2 - p1); za = ninv(1 - a / 2); pb = (p1 + p2) / 2
    se0 = math.sqrt(2 * pb * (1 - pb) / n); se1 = math.sqrt((p1 * (1 - p1) + p2 * (1 - p2)) / n)
    return phi((d - za * se0) / se1) + phi((-d - za * se0) / se1)
fig, ax = plt.subplots(figsize=(8, 3.4)); ns = np.linspace(100, 60000, 300)
for m, c in [(0.05, RED), (0.10, BLUE), (0.20, GREEN)]:
    ax.plot(ns, [power(n, 0.10, m) for n in ns], color=c, lw=2, label=f"MDE {int(m*100)}%")
ax.axhline(0.8, color=GRAY, ls="--"); ax.axvline(14751, color=BLUE, ls=":", lw=1.2); ax.text(15500, 0.1, "14 751 на вариант\n(MDE 10%)", color=BLUE, fontsize=9)
ax.yaxis.set_major_formatter(lambda v, _: f"{v*100:.0f}%"); ax.xaxis.set_major_formatter(lambda v, _: f"{int(v):,}".replace(",", " "))
ax.set_xlabel("пользователей на вариант (baseline 10%, alpha 0.05)"); ax.set_ylabel("мощность"); ax.legend(frameon=False, loc="lower right"); ax.set_ylim(0, 1.02)
ax.set_title("Мощность растёт с выборкой; маленькие эффекты требуют огромных выборок", fontsize=10.5, loc="left", color=DARK)
fig.savefig(f"{OUT}/power.png", dpi=200, bbox_inches="tight"); plt.close(fig)
print("seed", seed, "ok")

# 8. Glossary figure: p-value tails + alpha / power / beta
fig, (a1, a2) = plt.subplots(1, 2, figsize=(9.2, 3.3))
z = np.linspace(-4, 4, 500); pdf = np.exp(-z ** 2 / 2) / math.sqrt(2 * math.pi); zo = 2.02
a1.plot(z, pdf, color=DARK, lw=1.5)
a1.fill_between(z, pdf, where=z >= zo, color=RED, alpha=0.45); a1.fill_between(z, pdf, where=z <= -zo, color=RED, alpha=0.45)
a1.axvline(zo, color=RED, ls="--", lw=1); a1.axvline(-zo, color=RED, ls="--", lw=1)
a1.text(-3.9, 0.3, "если эффекта нет,\nданные в основном\nв середине", ha="left", fontsize=8, color=DARK)
a1.annotate("хвосты вместе:\np-value = 0.043", (2.6, 0.02), (1.6, 0.22), fontsize=8.5, color=RED, arrowprops=dict(arrowstyle="->", color=RED))
a1.set_yticks([]); a1.spines["left"].set_visible(False); a1.set_xlabel("z-score (разница в стандартных ошибках)")
a1.set_title("p-value: площадь «хвостов» при z = ±2.02", fontsize=10, loc="left")
z2 = np.linspace(-4, 7.5, 700); h0 = np.exp(-z2 ** 2 / 2) / math.sqrt(2 * math.pi); mu1 = 2.8; h1 = np.exp(-(z2 - mu1) ** 2 / 2) / math.sqrt(2 * math.pi); zc = 1.96
a2.plot(z2, h0, color=DARK, lw=1.4); a2.plot(z2, h1, color=BLUE, lw=1.4)
a2.fill_between(z2, h0, where=z2 >= zc, color=RED, alpha=0.6); a2.fill_between(z2, h1, where=z2 >= zc, color=GREEN, alpha=0.3); a2.fill_between(z2, h1, where=z2 < zc, color=GRAY, alpha=0.4)
a2.axvline(zc, color=DARK, ls=":", lw=1)
a2.text(-3.9, 0.37, "эффекта нет", color=DARK, fontsize=8.5); a2.text(4.3, 0.37, "эффект есть", color=BLUE, fontsize=8.5)
a2.text(3.3, 0.15, "power\n(поймали)", color=GREEN, fontsize=8.5, fontweight="bold", ha="left")
a2.annotate("beta: пропустили\nреальный эффект", (1.1, 0.02), (-3.9, 0.17), color="#5b6577", fontsize=8.5, arrowprops=dict(arrowstyle="->", color=GRAY))
a2.annotate("alpha:\nложная победа", (2.4, 0.006), (4.9, 0.085), color=RED, fontsize=8.5, arrowprops=dict(arrowstyle="->", color=RED))
a2.set_xlim(-4, 7.5); a2.set_yticks([]); a2.spines["left"].set_visible(False); a2.set_xlabel("z-score; пунктир: порог значимости")
a2.set_title("Ошибки I и II рода и мощность", fontsize=10, loc="left")
fig.tight_layout(); fig.savefig(f"{OUT}/glossary.png", dpi=200, bbox_inches="tight"); plt.close(fig)

# 9. BigQuery architecture
fig, ax = plt.subplots(figsize=(9.2, 3.1)); ax.axis("off"); ax.set_xlim(0, 100); ax.set_ylim(0, 36)
def node(x, y, w, h, title, sub, color):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.35,rounding_size=1.4", fc=color, ec="none", alpha=0.14))
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.35,rounding_size=1.4", fc="none", ec=color, lw=1.4))
    ax.text(x + w / 2, y + h - 3.0, title, ha="center", va="center", fontweight="bold", color=DARK, fontsize=9)
    ax.text(x + w / 2, y + (h - 5) / 2, sub, ha="center", va="center", color=DARK, fontsize=7.6, linespacing=1.5)
def arr(x1, y1, x2, y2, text="", dy=2.6):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle="-|>", mutation_scale=12, color=GRAY, lw=1.3))
    if text: ax.text((x1 + x2) / 2, y1 + dy, text, ha="center", fontsize=6.8, color=GRAY)
node(0.5, 8, 18, 22, "Браузер", "интерфейс (React),\nздесь считаются\nz-test, Welch,\nBayesian, CUPED", BLUE)
node(27, 8, 16, 22, "yarn dev", "порт 3002\nотдаёт страницу,\nпередаёт /api", BLUE)
node(51, 8, 18, 22, "yarn server", "порт 3003\nлокальный API,\nчитает ваш\nключ Google", GREEN)
node(77, 8, 22.5, 22, "Google BigQuery", "проект ... / ab_sandbox\nтаблица users\n(100 000 строк)", RED)
arr(19.2, 22, 26.2, 22, "запрос"); arr(26.2, 14, 19.2, 14, "")
arr(43.8, 22, 50.2, 22, "/api"); arr(50.2, 14, 43.8, 14, "")
arr(69.8, 22, 76.2, 22, "SQL"); arr(76.2, 14, 69.8, 14, "2 строки", dy=-3.6)
ax.text(50, 2.2, "В браузер приходят только итоги по группам (control и treatment), а ключи Google остаются на вашем компьютере", ha="center", fontsize=8.2, color=DARK, style="italic")
fig.savefig(f"{OUT}/bq_flow.png", dpi=200, bbox_inches="tight"); plt.close(fig)

# 10. GrowthBook-style result row (numbers from the BigQuery example)
mean, sd = 0.1296, 0.0207
fig = plt.figure(figsize=(9.2, 3.0))
heads = [(0.01, "Goal metric"), (0.28, "Control"), (0.46, "Treatment"), (0.66, "Chance to win"), (0.90, "% change")]
for x, t in heads: fig.text(x, 0.95, t, fontsize=8.5, color="#667085")
fig.text(0.01, 0.74, "Conversion rate", fontsize=10, fontweight="bold", color=DARK, va="center")
for x, v, s_ in [(0.28, "10.07%", "5,026 / 49,935"), (0.46, "11.37%", "5,692 / 50,065")]:
    fig.text(x, 0.77, v, fontsize=12, fontweight="bold", color=DARK, va="center"); fig.text(x, 0.67, s_, fontsize=7.5, color="#667085", style="italic", va="center")
fig.text(0.66, 0.74, "100.0%", fontsize=12, fontweight="bold", color=GREEN, va="center")
fig.text(0.90, 0.74, "\u2191 12.96%", fontsize=12, fontweight="bold", color=GREEN, va="center")
fig.text(0.01, 0.60, "Change vs control", fontsize=8.5, color="#667085")
ax = fig.add_axes([0.01, 0.03, 0.98, 0.42]); lo, hi = min(mean - 3.5 * sd, -0.6 * sd), max(mean + 3.5 * sd, 0.6 * sd)
xv = np.linspace(lo, hi, 500); h = np.exp(-0.5 * ((xv - mean) / sd) ** 2)
ax.fill_between(xv, -h, h, where=xv <= 0, color=RED, alpha=0.55, lw=0); ax.fill_between(xv, -h, h, where=xv >= 0, color=GREEN, alpha=0.55, lw=0)
ax.axvline(0, color=DARK, lw=1.4); ax.plot([mean, mean], [-0.7, 0.7], color=DARK, lw=2)
ax.set_ylim(-2.6, 2.6); ax.set_xlim(lo, hi); ax.set_yticks([]); ax.set_xticks([0, 0.05, 0.10, 0.15, 0.20]); ax.xaxis.set_major_formatter(lambda v, _: f"{v*100:.0f}%"); ax.xaxis.tick_top()
for sp in ("left", "bottom", "right", "top"): ax.spines[sp].set_visible(False)
ax.tick_params(axis="x", length=0, labelsize=8, colors="#667085"); ax.grid(axis="x", color="#e1e5ee", lw=0.8)
fig.savefig(f"{OUT}/result_row.png", dpi=200, bbox_inches="tight"); plt.close(fig)
