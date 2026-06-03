#!/usr/bin/env python3
"""사용자 제공 색상 이미지(디자인정리/) → /assets/mockups/ 표준 파일명으로 배치 +
   아이템/면별 실루엣 마스크 생성 + 스와치 hex 추출 + design.js 팔레트 데이터 출력."""
import os, re, json
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_gradient_magnitude, binary_dilation, binary_erosion, binary_fill_holes, label

SRC = "/Users/sangjin/aws project/frontend/assets/디자인정리"
OUT = "/tmp/doothing-main/frontend/assets/mockups"
SZ = 1000

FOLDER_MAP = {
 '과잠 앞면':('varsity_jacket','front'),'과잠 뒷면':('varsity_jacket','back'),'과잠 옆면':('varsity_jacket','side'),
 '맨투맨 앞면':('sweatshirt','front'),'맨투맨 뒷면':('sweatshirt','back'),'맨투맨 옆면':('sweatshirt','side'),
 '후디티 앞면':('hoodie','front'),'후디티 뒷면':('hoodie','back'),'후디티 옆면':('hoodie','side'),
 '티셔츠 앞면':('tshirt','front'),'티셔츠 뒷면':('tshirt','back'),'티셔츠 목':('tshirt','neck'),'티셔츠 옆면':('tshirt','side'),
 '에코백':('ecobag','front'),'폰케이스':('phonecase','back'),'텀블러':('tumbler','front'),
}
SYN = {'charcoal_gray':'charcoal','light_gray':'gray','heather_gray':'heathergray','heather':'heathergray',
 'royal_blue':'royalblue','forest_green':'forestgreen','camel_beige':'camel','dusty_pink':'dustypink','pink':'dustypink',
 'sky_blue':'skyblue','baby_blue':'babyblue','dark_gray':'darkgray','sage_green':'sagegreen','blush_pink':'blushpink',
 'oatmeal_beige':'oatmeal','sand_beige':'sand','greige_taupe':'greige','mocha_brown':'mocha',
 'muted_olive_khaki':'olivekhaki','deep_navy':'deepnavy','matte_black':'black','ivory_cream':'ivory',
 'natural_raw_canvas':'natural','raw_canvas':'natural'}
NAME = {'black':'블랙','charcoal':'차콜','navy':'네이비','royalblue':'로얄블루','burgundy':'버건디','red':'레드',
 'forestgreen':'포레스트그린','olive':'올리브','camel':'카멜','gray':'라이트그레이','heathergray':'헤더그레이',
 'cream':'크림','oatmeal':'오트밀','skyblue':'스카이블루','dustypink':'더스티핑크','white':'화이트','beige':'베이지',
 'natural':'내추럴캔버스','ivory':'아이보리','sand':'샌드베이지','greige':'그레이지','mocha':'모카브라운',
 'olivekhaki':'올리브카키','deepnavy':'딥네이비','darkgray':'다크그레이','lavender':'라벤더','sagegreen':'세이지그린',
 'babyblue':'베이비블루','blushpink':'블러시핑크','tan':'탄','sage':'세이지','darkgreen':'다크그린'}
TUMBLER = ['black','ivory','tan','sage','darkgreen','navy','skyblue','lavender','dustypink','burgundy']  # batch1..10
NAME.update({'tan':'탄','sage':'세이지'})
ALIAS = {'varsity_jacket':{'heathergray':'gray'}}   # 자켓: front heathergray == back/side gray

def parse_slug(item, fn):
    s = re.sub(r'^\d+_','',fn); s = re.sub(r'\.(png|jpg)$','',s,flags=re.I)
    s = re.sub(r'_(front|back|side|neck_detail|neck|keychain|detail)$','',s)
    s = s.replace('_white','').strip('_')
    s = SYN.get(s, s)
    return ALIAS.get(item,{}).get(s, s)

def load(path, flip=False):
    im = Image.open(path).convert('RGB')
    if im.size != (SZ,SZ):
        im = im.resize((SZ,SZ))
    if flip: im = im.transpose(Image.FLIP_LEFT_RIGHT)
    return im

def swatch_hex(im):
    a = np.asarray(im).astype(float)
    L = 0.299*a[...,0]+0.587*a[...,1]+0.114*a[...,2]
    h,w = L.shape
    cy0,cy1,cx0,cx1 = int(h*0.35),int(h*0.65),int(w*0.35),int(w*0.65)
    crop = a[cy0:cy1, cx0:cx1].reshape(-1,3)
    Lc = L[cy0:cy1, cx0:cx1].reshape(-1)
    sel = crop[Lc < 238]                       # 흰 배경/소매 제외
    if len(sel) < 50: sel = crop               # 흰 제품이면 전체
    med = np.median(sel, 0).astype(int)
    return '#%02x%02x%02x' % tuple(med)

def solid_mask(im):
    a = np.asarray(im).astype(float)
    L = 0.299*a[...,0]+0.587*a[...,1]+0.114*a[...,2]
    g = gaussian_gradient_magnitude(L, 1.0)
    edge = binary_dilation(g > 1.2, iterations=4)
    lbl,_ = label(~edge)
    border = set(lbl[0,:])|set(lbl[-1,:])|set(lbl[:,0])|set(lbl[:,-1]); border.discard(0)
    P = binary_fill_holes(~np.isin(lbl, list(border)))
    P = binary_erosion(P, iterations=4); P = binary_fill_holes(P)
    P = binary_erosion(P, iterations=2)
    lb,n = label(P)
    if n>1:
        sz=np.bincount(lb.ravel()); sz[0]=0; P = lb==sz.argmax()
    P = binary_dilation(P, iterations=6); P = binary_fill_holes(P); P = binary_erosion(P, iterations=4)
    return P

# 1) 수집
from collections import defaultdict
data = defaultdict(lambda: defaultdict(dict))   # item -> view -> {slug: path}
order = {}                                      # item -> [slug...] (primary 폴더 파일순)
for folder,(item,view) in FOLDER_MAP.items():
    fns = sorted(f for f in os.listdir(os.path.join(SRC,folder)) if f.lower().endswith('.png'))
    for fn in fns:
        slug = TUMBLER[int(re.match(r'(\d+)_',fn).group(1))-1] if item=='tumbler' else parse_slug(item, fn)
        data[item][view][slug] = os.path.join(SRC, folder, fn)
    prim = {'phonecase':'back'}.get(item,'front')
    if view == prim:
        order[item] = [ (TUMBLER[int(re.match(r'(\d+)_',f).group(1))-1] if item=='tumbler' else parse_slug(item,f)) for f in fns ]

VIEW_OUT = {'side':[('left',False),('right',True)]}   # side → left + mirrored right
os.makedirs(OUT, exist_ok=True)
palettes = {}
for item, views in data.items():
    slugs = order.get(item) or sorted({s for v in views.values() for s in v})
    # 중복 제거(순서 유지)
    seen=set(); slugs=[s for s in slugs if not (s in seen or seen.add(s))]
    pal=[]
    # 본면(스와치 hex 추출용) 결정
    prim = 'back' if item=='phonecase' else 'front'
    for slug in slugs:
        primpath = views.get(prim,{}).get(slug)
        hexv = swatch_hex(load(primpath)) if primpath else '#cccccc'
        pal.append({'slug':slug,'name':NAME.get(slug,slug),'hex':hexv})
        # 모든 면 출력
        for view, mp in views.items():
            if slug not in mp: continue
            outs = VIEW_OUT.get(view, [(view,False)])
            for ov,flip in outs:
                im = load(mp[slug], flip)
                im.save(os.path.join(OUT, f'{item}_{ov}__{slug}.jpg'), quality=90)
                if item=='ecobag' and view=='front':   # 에코백 뒷면=앞면 복제
                    im.save(os.path.join(OUT, f'{item}_back__{slug}.jpg'), quality=90)
    palettes[item]=pal

# 2) 마스크: 아이템/면별 — 어두운 변형으로 실루엣 1장
DARK = {'tshirt':'black','tumbler':'black','ecobag':'black','phonecase':'black',
        'varsity_jacket':'black','hoodie':'black','sweatshirt':'black'}
target_views = defaultdict(set)
for item, views in data.items():
    for view in views:
        for ov,_ in VIEW_OUT.get(view,[(view,False)]):
            target_views[item].add(ov)
    if item=='ecobag': target_views[item].add('back')
for item, ovs in target_views.items():
    dslug = DARK.get(item, palettes[item][0]['slug'])
    for ov in ovs:
        f = os.path.join(OUT, f'{item}_{ov}__{dslug}.jpg')
        if not os.path.exists(f):  # 그 색이 그 면에 없으면 첫색
            f = os.path.join(OUT, f'{item}_{ov}__{palettes[item][0]["slug"]}.jpg')
        if not os.path.exists(f): continue
        M = solid_mask(Image.open(f).convert('RGB'))
        from scipy.ndimage import gaussian_filter
        al = np.clip(gaussian_filter(M.astype(float),1.5),0,1)
        _a=(al*255).astype('uint8'); _o=np.zeros((_a.shape[0],_a.shape[1],4),np.uint8); _o[...,0:3]=255; _o[...,3]=_a; Image.fromarray(_o,'RGBA').save(os.path.join(OUT, f'{item}_{ov}_mask.png'))
        # 기본 base = 첫 색
        base0 = os.path.join(OUT, f'{item}_{ov}__{palettes[item][0]["slug"]}.jpg')
        if os.path.exists(base0):
            Image.open(base0).save(os.path.join(OUT, f'{item}_{ov}.jpg'), quality=90)

json.dump(palettes, open('/tmp/libgen/palettes.json','w'), ensure_ascii=False, indent=1)
for it,pal in palettes.items():
    print(f"{it:16s} {len(pal)} colors: {', '.join(p['slug'] for p in pal)}")
print("\nmask views:", {k:sorted(v) for k,v in target_views.items()})
