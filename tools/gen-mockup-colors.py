#!/usr/bin/env python3
"""색상 굿즈/의류 재생성 — 아이템별 정밀 마스크(테두리·그림자·구멍·고정부 처리) + 색별 멀티플라이.
   배경/그림자/구멍/뚜껑·바닥은 색이 안 바뀌고, 색칠 영역만 음영 보존하며 색 변경."""
import numpy as np, os
from PIL import Image, ImageFilter
from scipy.ndimage import (gaussian_gradient_magnitude, binary_dilation, binary_erosion,
                           binary_fill_holes, label, distance_transform_edt, gaussian_filter)

MOCK = '/tmp/doothing-main/frontend/assets/mockups'
COLORS = {  # design.js COLORS 와 일치(화이트=원본, 접미사 없음)
 'black':'#2b2b2e','gray':'#b8bcc4','navy':'#23304f','red':'#d23b3b',
 'purple':'#8b5cf6','green':'#3a9a5c','beige':'#e7dcc6',
}
def hex2rgb(h): h=h.lstrip('#'); return np.array([int(h[i:i+2],16) for i in (0,2,4)],float)

def lum(a): return 0.299*a[...,0]+0.587*a[...,1]+0.114*a[...,2]

def solid_product(L):
    """저대비 흰-제품/흰-배경: 윤곽선(edge) 기반 floodfill 로 제품 실루엣 솔리드."""
    g = gaussian_gradient_magnitude(L, 1.0)
    edge = binary_dilation(g > 1.0, iterations=4)
    lbl, _ = label(~edge)
    border = set(lbl[0,:]) | set(lbl[-1,:]) | set(lbl[:,0]) | set(lbl[:,-1]); border.discard(0)
    P = binary_fill_holes(~np.isin(lbl, list(border)))
    P = binary_erosion(P, iterations=4)
    P = binary_fill_holes(P)
    # 오프닝(가는 그림자 돌기 제거) + 가장 큰 연결성분만(잡티 제거)
    P = binary_erosion(P, iterations=3)
    lb, n = label(P)
    if n > 1:
        sizes = np.bincount(lb.ravel()); sizes[0] = 0
        P = lb == sizes.argmax()
    P = binary_dilation(P, iterations=3)
    P = binary_fill_holes(P)
    return P, g

def bbox(M):
    ys, xs = np.where(M)
    return ys.min(), ys.max(), xs.min(), xs.max()

def carve(item, L, g, P):
    """반환: (color_mask, clip_mask). color_mask=색칠영역, clip_mask=디자인배치(인쇄)영역."""
    H, W = P.shape
    if item in ('varsity_jacket','hoodie','sweatshirt','tshirt','blanket','accessory','mascot'):
        clip = binary_erosion(P, iterations=8)
        return P, clip
    if item == 'phonecase':
        clip = binary_erosion(P, iterations=10)
        return P, clip
    if item == 'ecobag':
        roww = P.sum(1)
        body_rows = np.where(roww > 0.55*W)[0]
        body_top = body_rows[0] if len(body_rows) else H//2
        dist = distance_transform_edt(~(g > 1.0))
        hole = np.zeros_like(P); hole[:body_top] = P[:body_top] & (dist[:body_top] > 22)
        color = P & ~hole
        # clip = 본체 사각형만(끈 제외)
        body = np.zeros_like(P); body[body_top:] = P[body_top:]
        clip = binary_erosion(body, iterations=8)
        return color, clip
    if item == 'tumbler':
        t,b,l,r = bbox(P); h = b - t
        body = np.zeros_like(P)
        body[int(t+0.15*h):int(b-0.085*h)] = P[int(t+0.15*h):int(b-0.085*h)]
        # 원통은 열 커버리지가 큼 → 바닥 그림자 돌기(낮은 커버리지 열) 제거
        colcov = body.sum(0)
        keepcol = colcov > 0.45 * colcov.max()
        body = body & keepcol[None, :]
        clip = binary_erosion(body, iterations=8)
        return body, clip
    if item == 'mug':
        t,b,l,r = bbox(P); w = r - l
        dist = distance_transform_edt(~(g > 1.0))
        col = np.arange(W)[None,:].repeat(H,0)
        hole = P & (col > l + 0.62*w) & (dist > 14)   # 우측 손잡이 구멍
        color = P & ~hole
        # clip = 본체(좌측 원통)만
        body = np.zeros_like(P); body[:, :int(l+0.66*w)] = P[:, :int(l+0.66*w)]
        clip = binary_erosion(body, iterations=8)
        return color, clip
    # 기본
    return P, binary_erosion(P, iterations=8)

def smooth_alpha(M):
    a = gaussian_filter(M.astype(float), 1.8)
    return np.clip(a, 0, 1)

def recolor(base, color_mask, rgb):
    a = base.astype(float)
    tinted = a * (rgb/255.0)
    al = smooth_alpha(color_mask)[...,None]
    out = a*(1-al) + tinted*al
    return np.clip(out,0,255).astype('uint8')

ITEMS = {
 'varsity_jacket':['front','back','left','right'],
 'hoodie':['front','back','left','right'],
 'sweatshirt':['front','back','left','right'],
 'tshirt':['front','back','left','right','neck'],
 'ecobag':['front','back'],
 'phonecase':['back'],
 'tumbler':['front'],
 'mug':['front'],
 'blanket':['front'],
}

def main():
    summary=[]
    for item, views in ITEMS.items():
        for v in views:
            bp = os.path.join(MOCK, f'{item}_{v}.jpg')
            if not os.path.exists(bp):
                summary.append((f'{item}_{v}','MISSING BASE')); continue
            base = np.asarray(Image.open(bp).convert('RGB'))
            L = lum(base.astype(float))
            P, g = solid_product(L)
            color_mask, clip_mask = carve(item, L, g, P)
            # 마스크 저장(인쇄/실루엣)
            Image.fromarray((smooth_alpha(clip_mask)*255).astype('uint8')).save(
                os.path.join(MOCK, f'{item}_{v}_mask.png'))
            # 색별 생성
            for key,hx in COLORS.items():
                out = recolor(base, color_mask, hex2rgb(hx))
                Image.fromarray(out).save(os.path.join(MOCK, f'{item}_{v}__{key}.jpg'), quality=88)
            summary.append((f'{item}_{v}', f'P{P.mean()*100:.0f}% color{color_mask.mean()*100:.0f}% clip{clip_mask.mean()*100:.0f}%'))
    for n,s in summary: print(f'{n:24s} {s}')

if __name__=='__main__': main()
