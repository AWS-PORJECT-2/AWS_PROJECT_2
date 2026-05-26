"""
모든 HTML 페이지에 doothing 공통 헤더를 삽입.

조건:
- main.css 가 없으면 <head>에 추가
- <body> 바로 뒤에 <div id="app"></div> 삽입 (이미 있으면 스킵)
- </body> 바로 앞에 category-icons.js + main.js 삽입 (이미 있으면 스킵)
- body 에 class="main-page" data-page="sub" 추가 (이미 main-page 있으면 스킵)

대상: main.html, index.html, feed.html, detail.html 은 이미 적용돼있으므로 제외.
"""
import re, os, glob

SKIP = {'main.html', 'index.html', 'feed.html', 'detail.html', 'landing.html',
         'login.html', 'login-dev.html'}

here = os.path.dirname(os.path.abspath(__file__))
files = glob.glob(os.path.join(here, '*.html'))

for f in files:
    basename = os.path.basename(f)
    if basename in SKIP:
        continue

    with open(f, 'r', encoding='utf-8') as fh:
        html = fh.read()

    changed = False

    # 1) main.css link
    if 'main.css' not in html:
        html = html.replace('</head>', '  <link rel="stylesheet" href="main.css">\n</head>', 1)
        changed = True

    # 2) body class + data-page
    if 'main-page' not in html:
        # Add class and data-page to <body>
        html = re.sub(
            r'<body([^>]*)>',
            lambda m: '<body' + m.group(1) + ' class="main-page" data-page="sub">',
            html, count=1
        )
        changed = True

    # 3) <div id="app"></div> right after <body...>
    if 'id="app"' not in html:
        html = re.sub(
            r'(<body[^>]*>)',
            r'\1\n  <div id="app"></div>',
            html, count=1
        )
        changed = True

    # 4) Scripts before </body>
    if 'category-icons.js' not in html:
        scripts = '''  <script src="category-icons.js"></script>
  <script src="main.js"></script>
'''
        html = html.replace('</body>', scripts + '</body>', 1)
        changed = True

    if changed:
        with open(f, 'w', encoding='utf-8') as fh:
            fh.write(html)
        print(f'[OK] {basename}')
    else:
        print(f'[skip] {basename} (already has header)')
