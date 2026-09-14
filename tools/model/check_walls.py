import numpy as np, haus_model as m
from scipy import ndimage
G=25  # mm Raster
def floor_walls(f): return [w for w in m.WALLS if w["floor"]==f]
def touches(a,b,tol=30):  # Rechtecke berühren/überlappen sich?
    return a["x0"]<=b["x1"]+tol and a["x1"]>=b["x0"]-tol and a["y0"]<=b["y1"]+tol and a["y1"]>=b["y0"]-tol
for f in ("KG","EG","OG"):
    ws=floor_walls(f); print(f"\n=== {f} ===")
    # 1) freie Wandenden
    for w in ws:
        along=(w["x1"]-w["x0"])>=(w["y1"]-w["y0"])
        ends=[]
        if along: ends=[dict(x0=w["x0"]-20,x1=w["x0"]+20,y0=w["y0"],y1=w["y1"]), dict(x0=w["x1"]-20,x1=w["x1"]+20,y0=w["y0"],y1=w["y1"])]
        else:     ends=[dict(x0=w["x0"],x1=w["x1"],y0=w["y0"]-20,y1=w["y0"]+20), dict(x0=w["x0"],x1=w["x1"],y0=w["y1"]-20,y1=w["y1"]+20)]
        for i,e in enumerate(ends):
            if not any(o is not w and touches(e,o,5) for o in ws):
                print(f"  FREIES ENDE: {w['name']} ({'Anfang' if i==0 else 'Ende'})")
    # 2) Räume raster-basiert
    W,H=m.HOUSE_W//G,m.HOUSE_D//G
    grid=np.ones((H,W),bool)
    for w in ws: grid[w["y0"]//G:w["y1"]//G, w["x0"]//G:w["x1"]//G]=False
    lab,n=ndimage.label(grid)
    for i in range(1,n+1):
        ys,xs=np.where(lab==i); area=len(xs)*G*G/1e6
        if area<0.3: continue
        bw=(xs.max()-xs.min()+1)*G; bh=(ys.max()-ys.min()+1)*G
        rect=area/(bw*bh/1e6)
        flag="" if rect>0.97 else "  <-- NICHT RECHTECKIG"
        print(f"  Raum {i:2d}: x {xs.min()*G}-{(xs.max()+1)*G}  y {ys.min()*G}-{(ys.max()+1)*G}  {bw}x{bh}  {area:5.1f} m²  rect={rect:.2f}{flag}")

# 3) Öffnungen innerhalb ihrer Wand?
wl={(w["floor"],w["name"]):w for w in m.WALLS}
for o in m.OPENINGS:
    w=wl[(o["floor"],o["wall"])]; L=max(w["x1"]-w["x0"], w["y1"]-w["y0"])
    if o["a0"]<0 or o["a0"]+o["width"]>L: print("ÖFFNUNG AUSSERHALB WAND:", o["floor"], o["wall"], o["a0"], o["width"], L)
