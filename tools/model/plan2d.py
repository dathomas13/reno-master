import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt, matplotlib.patches as P
import haus_model as m, importlib
def draw(floor, fn):
    fig, ax = plt.subplots(figsize=(9, 8.2))
    for w in m.WALLS:
        if w["floor"] != floor: continue
        col = {"A":"#c44","B":"#d93","C":"#e9b"}[w["tag"]]
        ax.add_patch(P.Rectangle((w["x0"], w["y0"]), w["x1"]-w["x0"], w["y1"]-w["y0"], color=col))
    for o in m.OPENINGS:
        if o["floor"] != floor: continue
        w = next(x for x in m.WALLS if x["floor"]==floor and x["name"]==o["wall"])
        along = (w["x1"]-w["x0"]) >= (w["y1"]-w["y0"])
        c = "#2a6" if o["kind"]=="door" else "#39c" if o["kind"]=="window" else "#fff"
        if along: ax.add_patch(P.Rectangle((w["x0"]+o["a0"], w["y0"]), o["width"], w["y1"]-w["y0"], color=c))
        else: ax.add_patch(P.Rectangle((w["x0"], w["y0"]+o["a0"]), w["x1"]-w["x0"], o["width"], color=c))
    for s in m.STAIRS:
        if (floor=="KG") != (s["z0"]<0) or floor=="OG": continue
        L = s["steps"]*s["run"]
        if s["direction"]=="+x": r=(s["x0"], s["y0"], L, s["width"])
        elif s["direction"]=="-x": r=(s["x0"]-L, s["y0"], L, s["width"])
        elif s["direction"]=="+y": r=(s["x0"], s["y0"], s["width"], L)
        else: r=(s["x0"], s["y0"]-L, s["width"], L)
        ax.add_patch(P.Rectangle(r[:2], r[2], r[3], fill=False, hatch="//", ec="#555"))
    ax.set_xlim(-500, m.HOUSE_W+500); ax.set_ylim(-500, m.HOUSE_D+500); ax.set_aspect("equal")
    ax.set_xticks(range(0, 13241, 1000)); ax.set_yticks(range(0, 11821, 1000)); ax.grid(alpha=.3); ax.tick_params(labelsize=7)
    ax.set_title(f"Modell {floor}  (x→Ost, y→Nord)")
    fig.tight_layout(); fig.savefig(fn, dpi=110); plt.close(fig)
importlib.reload(m)
for f in ("KG","EG","OG"): draw(f, f"model_{f}.png")
