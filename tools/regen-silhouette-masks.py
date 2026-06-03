#!/usr/bin/env python3
"""실루엣 마스크 재생성 — 균일 배경(neutral gray) 세그먼트로 제품 전체(흰 소매 포함) 포착.
   over-clip 방지 위해 약간 generous(dilation). RGBA 알파 PNG(제품=불투명)."""
import os, glob, numpy as np
from PIL import Image
from scipy.ndimage import label, binary_fill_holes, binary_closing, binary_dilation, gaussian_filter

MOCK='/tmp/doothing-main/frontend/assets/mockups'

def bgmask(path):
    a=np.asarray(Image.open(path).convert('RGB')).astype(float)
    L=0.299*a[...,0]+0.587*a[...,1]+0.114*a[...,2]
    maxc=a.max(2); minc=a.min(2)
    border=np.concatenate([L[:8,:].ravel(),L[-8:,:].ravel(),L[:,:8].ravel(),L[:,-8:].ravel()])
    bg=np.median(border)
    cand=(L>bg-3)&(L<bg+6)&((maxc-minc)<12)
    lbl,_=label(cand)
    bd=set(lbl[0,:])|set(lbl[-1,:])|set(lbl[:,0])|set(lbl[:,-1]); bd.discard(0)
    P=~np.isin(lbl,list(bd))
    P=binary_closing(P,iterations=7); P=binary_fill_holes(P)
    lb,n=label(P)
    if n>1: sz=np.bincount(lb.ravel()); sz[0]=0; P=lb==sz.argmax()
    P=binary_closing(P,iterations=4); P=binary_fill_holes(P)
    P=binary_dilation(P,iterations=3)            # generous(over-clip 방지)
    return P

def save_alpha(P, out):
    al=np.clip(gaussian_filter(P.astype(float),1.2),0,1)
    h,w=al.shape
    o=np.zeros((h,w,4),np.uint8); o[...,0:3]=255; o[...,3]=(al*255).astype(np.uint8)
    Image.fromarray(o,'RGBA').save(out)

# 색상 아이템: black 변형으로 마스크 / 그 외: base jpg
DARK_ITEMS={'varsity_jacket','hoodie','sweatshirt','tshirt','ecobag','phonecase','tumbler'}
done=0; fail=[]
for mk in glob.glob(os.path.join(MOCK,'*_mask.png')):
    name=os.path.basename(mk)[:-9]           # strip _mask.png → <img>_<view>
    # 소스 결정
    item=None
    for it in DARK_ITEMS:
        if name.startswith(it+'_'): item=it; break
    src=None
    if item:
        cand=os.path.join(MOCK,f'{name}__black.jpg')
        src=cand if os.path.exists(cand) else os.path.join(MOCK,f'{name}.jpg')
    else:
        src=os.path.join(MOCK,f'{name}.jpg')
    if not os.path.exists(src): fail.append(name+' (no src)'); continue
    try:
        P=bgmask(src); save_alpha(P,mk); done+=1
    except Exception as e:
        fail.append(f'{name}: {e}')
print(f"regenerated {done} masks, fail {len(fail)}")
for f in fail: print("  ",f)
