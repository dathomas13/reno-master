import sys, numpy as np
from PIL import Image
import haus_model as m
floor, page = sys.argv[1], int(sys.argv[2])
CAL={2:(2158,4245,3475,1617), 1:(2161,4227,3481,3481-int(11820*0.15604)), 3:(2163,4232,3437,3437-int(11820*0.15627))}
im=np.array(Image.open(f'plan-{page}.png').convert('RGB')).astype(int)
r,g,b=im[...,0],im[...,1],im[...,2]
mask=(r>150)&(r-g>45)&(r-b>30)&(g<190)
if page==1: mask=mask|((g>r+10)&(g>b+20)&(g>120))   # KG: Stampfbeton grün
if page not in CAL:
    sub=mask[1300:3700,2000:4500]; col=sub.sum(0); row=sub.sum(1)
    cx=[i+2000 for i in range(len(col)) if col[i]>150]; ry=[i+1300 for i in range(len(row)) if row[i]>150]
    CAL[page]=(cx[0],cx[-1],ry[-1],ry[0])
px0,px1,pys,pyn=CAL[page]; sx=(px1-px0)/m.HOUSE_W; sy=(pys-pyn)/m.HOUSE_D
def region(x0,y0,x1,y1):
    X0,X1=int(px0+x0*sx),int(px0+x1*sx); Y0,Y1=int(pys-y1*sy),int(pys-y0*sy)
    return mask[Y0:Y1, X0:X1]
print(f"=== {floor}: Rosa-Anteil unter Modellwänden (Öffnungen ausgenommen) ===")
for w in m.WALLS:
    if w["floor"]!=floor or w["name"].startswith("Außenwand") or w["name"].startswith("Kamin"): continue
    along=(w["x1"]-w["x0"])>=(w["y1"]-w["y0"])
    L0,L1=(w["x0"],w["x1"]) if along else (w["y0"],w["y1"])
    ops=[(L0+o["a0"],L0+o["a0"]+o["width"]) for o in m.OPENINGS if o["floor"]==floor and o["wall"]==w["name"]]
    # in 200-mm-Schritte teilen, je Schritt Rosa-Anteil
    segs=[]; u=L0
    while u<L1:
        v=min(u+200,L1)
        if not any(a<=u and v<=b for a,b in ops):
            reg=region(u,w["y0"],v,w["y1"]) if along else region(w["x0"],u,w["x1"],v)
            segs.append((u,v,reg.mean() if reg.size else 0))
        u=v
    cov=np.mean([s[2] for s in segs]) if segs else 0
    low=[(int(s[0]),int(s[1])) for s in segs if s[2]<0.15]
    # zusammenhängende Lücken
    gaps=[]
    for a,b_ in low:
        if gaps and gaps[-1][1]==a: gaps[-1]=(gaps[-1][0],b_)
        else: gaps.append((a,b_))
    flag="" if cov>0.5 and not gaps else "  <-- PRÜFEN"
    print(f'{w["name"]:38s} rosa {cov*100:4.0f}%  ohne Rosa: {gaps if gaps else "-"}{flag}')
