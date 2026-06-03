#!/usr/bin/env python3
"""클립 마스크 정밀화: 에코백 손잡이·키링 고리·폰케이스 카메라 제외."""
import numpy as np, glob
from PIL import Image
from scipy.ndimage import (label, binary_erosion, binary_dilation, binary_fill_holes,
                           gaussian_filter, gaussian_gradient_magnitude)
M='/tmp/doothing-main/frontend/assets/mockups/'
def disk(r):
    y,x=np.ogrid[-r:r+1,-r:r+1]; return (x*x+y*y)<=r*r
def loadA(f): return np.asarray(Image.open(f).convert('RGBA'))[...,3]>128
def largest(P):
    lb,n=label(P)
    if n>1: s=np.bincount(lb.ravel());s[0]=0;P=lb==s.argmax()
    return P
def save(P,f):
    al=np.clip(gaussian_filter(P.astype(float),1.0),0,1)
    h,w=al.shape;o=np.zeros((h,w,4),np.uint8);o[...,0:3]=255;o[...,3]=(al*255).astype(np.uint8)
    Image.fromarray(o,'RGBA').save(f)

# 1) 에코백 — 손잡이 제거(가로 넓은 본체 행만)
for v in ['front','back']:
    P=loadA(f'{M}ecobag_{v}_mask.png'); roww=P.sum(1); mx=roww.max()
    bt=np.where(roww>0.65*mx)[0][0]
    body=np.zeros_like(P); body[bt:]=P[bt:]
    save(largest(binary_fill_holes(body)), f'{M}ecobag_{v}_mask.png')

# 2) 키링 — 고리 제거(오프닝으로 얇은 고리 절단 후 본체)
for f in glob.glob(f'{M}keyring_*_front_mask.png'):
    P=loadA(f); r=max(8,int(min(P.shape)*0.013))
    body=binary_dilation(largest(binary_erosion(P,structure=disk(r))),structure=disk(r)) & P
    save(binary_fill_holes(body), f)

# 3) 폰케이스 — 카메라 모듈 제외
case=loadA(f'{M}phonecase_back_mask.png'); H,Wd=case.shape
src=Image.open(f'{M}phonecase_back__black.jpg').convert('RGB').resize((Wd,H))
L=np.asarray(src).astype(float); Lum=0.299*L[...,0]+0.587*L[...,1]+0.114*L[...,2]
g=gaussian_gradient_magnitude(Lum,1.5)
inner=binary_erosion(case,structure=disk(int(Wd*0.028)))
ys,_=np.where(case); top,bot=ys.min(),ys.max(); h=bot-top
region=np.zeros_like(case); region[top:int(top+0.42*h)]=True
cam=binary_fill_holes(binary_dilation((g>8)&inner&region,structure=disk(int(Wd*0.010))))
cam=largest(cam)
cam=binary_fill_holes(binary_dilation(cam,structure=disk(int(Wd*0.006))))
save(case & ~cam, f'{M}phonecase_back_mask.png')
print('refined ecobag(2) + keyrings(%d) + phonecase camera' % len(glob.glob(f'{M}keyring_*_front_mask.png')))
