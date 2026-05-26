import re, glob, os

files = glob.glob(os.path.join(os.path.dirname(os.path.abspath(__file__)), '*.html'))
for f in files:
    with open(f, 'r', encoding='utf-8') as fh:
        content = fh.read()
    if '<aside class="sidebar">' not in content:
        continue
    # Remove the entire aside.sidebar block including any preceding comment
    new_content = re.sub(
        r'\s*<!--[^>]*[Ss]ide[Bb]ar[^>]*-->\s*<aside class="sidebar">.*?</aside>',
        '', content, flags=re.DOTALL
    )
    if new_content == content:
        # fallback without comment
        new_content = re.sub(
            r'\s*<aside class="sidebar">.*?</aside>',
            '', content, flags=re.DOTALL
        )
    with open(f, 'w', encoding='utf-8') as fh:
        fh.write(new_content)
    print(f'[OK] {os.path.basename(f)}')
