#!/usr/bin/env python3
"""실루엣 마스크 — 균일 배경 세그먼트 + 형태학 평활(그림자 제거·매끈한 경계). RGBA 알파."""
import os, glob, numpy as np
from PIL import Image
from scipy.ndimage import label, binary_fill_holes, binary_closing, binary_opening, binary_erosion, gaussian_filter
MOCK='/tmp/doothing-main/frontend/assets/mockups'
def disk(r):
    y,x=np.ogrid[-r:r+1,-r:r+1]; return (x*x+y*y)<=r*r
def cleanmask(path, op=10, cl=12, er=2):
    a=np.asarray(Image.open(path).convert('RGB')).astype(float)
    L=0.299*a[...,0]+0.587*a[...,1]+0.114*a[...,2]
    sat=a.max(2)-a.min(2)
    bd=np.concatenate([L[:8,:].ravel(),L[-8:,:].ravel(),L[:,:8].ravel(),L[:,-8:].ravel()])
    bg=np.median(bd)
    cand=(np.abs(L-bg)<3)&(sat<12)
    lbl,_=label(cand)
    b=set(lbl[0,:])|set(lbl[-1,:])|set(lbl[:,0])|set(lbl[:,-1]); b.discard(0)
    P=binary_fill_holes(~np.isin(lbl,list(b)))
    P=binary_opening(P,structure=disk(op))
    P=binary_closing(P,structure=disk(cl))
    P=binary_fill_holes(P)
    lb,n=label(P)
    if n>1: s=np.bincount(lb.ravel());s[0]=0;P=lb==s.argmax()
    if er: P=binary_erosion(P,structure=disk(er))
    return P
def save_alpha(P,out):
    al=np.clip(gaussian_filter(P.astype(float),1.2),0,1)
    h,w=al.shape; o=np.zeros((h,w,4),np.uint8); o[...,0:3]=255; o[...,3]=(al*255).astype(np.uint8)
    Image.fromarray(o,'RGBA').save(out)
DARK={'varsity_jacket','hoodie','sweatshirt','tshirt','ecobag','phonecase','tumbler'}
# 키링은 투명아크릴(저대비)→작은 op로
PARAMS={'keyring':(5,10,1)}
done=0
for mk in glob.glob(os.path.join(MOCK,'*_mask.png')):
    name=os.path.basename(mk)[:-9]
    item=next((it for it in DARK if name.startswith(it+'_')),None)
    src=os.path.join(MOCK,f'{name}__black.jpg') if item and os.path.exists(os.path.join(MOCK,f'{name}__black.jpg')) else os.path.join(MOCK,f'{name}.jpg')
    if not os.path.exists(src): continue
    p=PARAMS.get('keyring' if name.startswith('keyring_') else item,(10,12,2))
    save_alpha(cleanmask(src,*p),mk); done+=1
print("regenerated",done)
