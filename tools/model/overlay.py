import sys, numpy as np
from PIL import Image, ImageDraw
import haus_model as m
floor, page, x0mm, y0mm, x1mm, y1mm = sys.argv[1], int(sys.argv[2]), *map(int, sys.argv[3:7])
CAL={2:(2158,4245,3475,1617), 1:None, 3:None}
im=np.array(Image.open(f'plan-{page}.png').convert('RGB')).astype(int)
r,g,b=im[...,0],im[...,1],im[...,2]
mask=(r>150)&(r-g>45)&(r-b>30)&(g<190)
if CAL[page] is None:
    sub=mask[1300:3700,2000:4500]; col=sub.sum(0); row=sub.sum(1)
    cx=[i+2000 for i in range(len(col)) if col[i]>150]; ry=[i+1300 for i in range(len(row)) if row[i]>150]
    CAL[page]=(cx[0],cx[-1],ry[-1],ry[0])
px0,px1,pys,pyn=CAL[page]
sx=(px1-px0)/m.HOUSE_W; sy=(pys-pyn)/m.HOUSE_D
def toPx(x,y): return (px0+x*sx, pys-y*sy)
X0,Y0=toPx(x0mm,y1mm); X1,Y1=toPx(x1mm,y0mm)
crop=Image.open(f'plan-{page}.png').convert('RGB').crop((int(X0),int(Y0),int(X1),int(Y1)))
sub=mask[int(Y0):int(Y1), int(X0):int(X1)]
ov=Image.fromarray(np.where(sub[...,None], np.array([255,0,0]), np.array(crop)).astype(np.uint8))
d=ImageDraw.Draw(ov)
for w in m.WALLS:
    if w["floor"]!=floor: continue
    a=toPx(w["x0"],w["y1"]); b_=toPx(w["x1"],w["y0"])
    d.rectangle([a[0]-X0,a[1]-Y0,b_[0]-X0,b_[1]-Y0], outline=(0,0,255), width=3)
for o in m.OPENINGS:
    if o["floor"]!=floor: continue
    w=next(x for x in m.WALLS if x["floor"]==floor and x["name"]==o["wall"])
    along=(w["x1"]-w["x0"])>=(w["y1"]-w["y0"])
    if along: rect=(w["x0"]+o["a0"], w["y0"], w["x0"]+o["a0"]+o["width"], w["y1"])
    else: rect=(w["x0"], w["y0"]+o["a0"], w["x1"], w["y0"]+o["a0"]+o["width"])
    a=toPx(rect[0],rect[3]); b_=toPx(rect[2],rect[1])
    d.rectangle([a[0]-X0,a[1]-Y0,b_[0]-X0,b_[1]-Y0], outline=(0,160,0), width=3)
# mm-Gitter alle 1000
for gx in range(x0mm//1000*1000, x1mm+1, 1000):
    p=toPx(gx,0); d.line([(p[0]-X0,0),(p[0]-X0,ov.height)], fill=(0,0,0), width=1); d.text((p[0]-X0+2,2), str(gx), fill=(0,0,0))
for gy in range(y0mm//1000*1000, y1mm+1, 1000):
    p=toPx(0,gy); d.line([(0,p[1]-Y0),(ov.width,p[1]-Y0)], fill=(0,0,0), width=1); d.text((2,p[1]-Y0+2), str(gy), fill=(0,0,0))
scale=max(1, 1600//ov.width)
ov=ov.resize((ov.width*scale, ov.height*scale))
ov.save(f'overlay_{floor}.png'); print(ov.size)
