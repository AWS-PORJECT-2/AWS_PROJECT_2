#!/usr/bin/env python3
"""실루엣 마스크 — rembg(U2Net) 딥러닝 누끼로 정밀 추출. RGBA 알파(제품=불투명)."""
import os, glob, numpy as np
from PIL import Image
from rembg import remove, new_session
from scipy.ndimage import binary_fill_holes, label, gaussian_filter
MOCK='/tmp/doothing-main/frontend/assets/mockups'
sess=new_session('u2net')
DARK={'varsity_jacket','hoodie','sweatshirt','tshirt','ecobag','phonecase','tumbler'}

def alpha_of(path):
    im=Image.open(path).convert('RGB')
    out=remove(im, session=sess)
    return np.asarray(out)[...,3]

def save_mask(a, out):
    A=a.astype(np.uint8)
    P=A>40
    P=binary_fill_holes(P)                 # 내부 작은 구멍 메움
    lb,n=label(P)
    if n>1: s=np.bincount(lb.ravel());s[0]=0;P=lb==s.argmax()   # 가장 큰 덩어리(잡티 제거)
    al=np.where(P, np.maximum(A,160), 0).astype(float)          # 본체는 확실히 불투명
    al=np.clip(gaussian_filter(al,0.8),0,255)
    h,w=al.shape; o=np.zeros((h,w,4),np.uint8); o[...,0:3]=255; o[...,3]=al.astype(np.uint8)
    Image.fromarray(o,'RGBA').save(out)

done=0; rep=[]
for mk in sorted(glob.glob(os.path.join(MOCK,'*_mask.png'))):
    name=os.path.basename(mk)[:-9]
    item=next((it for it in DARK if name.startswith(it+'_')),None)
    src=os.path.join(MOCK,f'{name}__black.jpg') if item and os.path.exists(os.path.join(MOCK,f'{name}__black.jpg')) else os.path.join(MOCK,f'{name}.jpg')
    if not os.path.exists(src): rep.append(name+' NO-SRC'); continue
    a=alpha_of(src); save_mask(a, mk)
    rep.append(f'{name} {round(100*(a>40).mean())}%'); done+=1
print("done",done)
for r in rep: print(" ",r)
