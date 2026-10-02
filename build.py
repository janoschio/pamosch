#!/usr/bin/env python3
"""Build planning/index.html from src/.

src/planning.template.html  page markup, styles and app code
src/schedule.js             pure scheduling logic (tested in tests/), inlined at /*SCHED*/

Run: python3 build.py
"""
from pathlib import Path

ROOT = Path(__file__).parent
SUPABASE_URL = 'https://bockhqjqeqwgjtlvgdfz.supabase.co'
SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js'


def current_key():
    """Reuse the Supabase publishable key already in the page. It is meant to be public;
    access is limited by the table's row-level security."""
    html = (ROOT / 'planning/index.html').read_text()
    start = html.index("key: '") + len("key: '")
    return html[start:html.index("'", start)]


def main():
    template = (ROOT / 'src/planning.template.html').read_text()
    sched = (ROOT / 'src/schedule.js').read_text()
    core = sched.split('/*SCHED-START*/')[1].split('/*SCHED-END*/')[0].strip()
    key = current_key()
    head = (f'<script src="{SUPABASE_JS}"></script>\n'
            f"<script>const SUPABASE = {{ url: '{SUPABASE_URL}', key: '{key}' }};</script>\n")
    body = template.replace('/*SCHED*/', core).replace('/*SITE-HEAD*/', head)
    split = body.index('</style>') + len('</style>')
    page = (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        '<meta name="robots" content="noindex, nofollow">\n'
        "<link rel=\"icon\" href=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='13' fill='%23000'/%3E%3C/svg%3E\">\n"
        '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n'
        + body[:split] + '\n</head>\n<body>\n' + body[split:] + '\n</body>\n</html>\n'
    )
    (ROOT / 'planning/index.html').write_text(page)
    print('built planning/index.html', len(page), 'bytes')


if __name__ == '__main__':
    main()
