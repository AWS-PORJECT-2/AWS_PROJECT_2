"""
기존 모바일 전용 헤더 (mobile-only, feed-header, detail-header, header mobile-only)와
하단 네비게이션 (bottom-nav mobile-only) 일괄 제거.

새 doothing 헤더(main.js)가 모든 페이지에서 통일 헤더를 그리므로 중복 제거.
"""
import re, glob, os

here = os.path.dirname(os.path.abspath(__file__))
files = glob.glob(os.path.join(here, '*.html'))

# 제거 대상 패턴들
patterns = [
    # 모바일 전용 헤더 (header.mobile-only, .feed-header, .detail-header 등)
    r'\s*<!--[^>]*모바일 헤더[^>]*-->\s*<header[^>]*class="[^"]*mobile-only[^"]*"[^>]*>.*?</header>',
    r'\s*<header[^>]*class="[^"]*mobile-only[^"]*"[^>]*>.*?</header>',
    r'\s*<header[^>]*class="[^"]*feed-header[^"]*"[^>]*>.*?</header>',
    r'\s*<header[^>]*class="[^"]*detail-header[^"]*"[^>]*>.*?</header>',
    # 하단 네비게이션
    r'\s*<!--[^>]*하단[^>]*-->\s*<nav[^>]*class="[^"]*bottom-nav[^"]*"[^>]*>.*?</nav>',
    r'\s*<nav[^>]*class="[^"]*bottom-nav[^"]*"[^>]*>.*?</nav>',
    # 데스크톱 상단바 (desktop-topbar) — 새 헤더로 대체됨
    r'\s*<!--[^>]*데스크톱 상단바[^>]*-->\s*<header[^>]*class="[^"]*desktop-topbar[^"]*"[^>]*>.*?</header>',
    r'\s*<header[^>]*class="[^"]*desktop-topbar[^"]*"[^>]*>.*?</header>',
]

for f in files:
    with open(f, 'r', encoding='utf-8') as fh:
        content = fh.read()

    original = content
    for pat in patterns:
        content = re.sub(pat, '', content, flags=re.DOTALL)

    if content != original:
        with open(f, 'w', encoding='utf-8') as fh:
            fh.write(content)
        print(f'[OK] {os.path.basename(f)}')
