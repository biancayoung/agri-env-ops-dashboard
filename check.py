#!/usr/bin/env python3
"""Validate HTML + JavaScript. --app checks current pages; legacy prototype gate remains."""
import argparse
from html.parser import HTMLParser
from pathlib import Path
import re
import subprocess
import tempfile


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.duplicates = set()
        self.scripts = []
        self.missing_alt = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            if attrs['id'] in self.ids: self.duplicates.add(attrs['id'])
            self.ids.add(attrs['id'])
        if tag == 'script' and 'src' in attrs: self.scripts.append(attrs['src'])
        if tag == 'img' and 'alt' not in attrs: self.missing_alt = True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('file', type=Path)
    ap.add_argument('--hub', action='store_true')
    ap.add_argument('--app', action='store_true')
    args = ap.parse_args()
    def require(condition, message):
        if not condition: raise SystemExit('FAIL: ' + message)
    require(args.file.is_file(), 'HTML file missing')
    text = args.file.read_text(encoding='utf-8')
    page = Page(); page.feed(text)
    require(not page.duplicates, 'duplicate IDs: ' + ', '.join(page.duplicates))
    require(not page.missing_alt, 'image missing alt text')
    require('name="viewport"' in text, 'viewport meta missing')
    scripts = re.findall(r'<script[^>]*>(.*?)</script>', text, re.S)
    if args.app:
        for src in page.scripts:
            require(not re.match(r'\w+:|//', src), 'scripts must be local')
            file = (args.file.parent / src.split('?', 1)[0].lstrip('/')).resolve()
            require(file.is_relative_to(args.file.parent.resolve()) and file.is_file(), 'local script missing: ' + src)
            scripts.append(file.read_text())
    else:
        require(not page.scripts, 'external script tag (inline JS only)')
        for url in re.findall(r'https?://[^"\' )>]+', text):
            require(bool(re.match(r'https://fonts\.(googleapis|gstatic)\.com', url)), 'external URL not allowed: ' + url)
        require('<img' not in text, 'img tag (inline SVG only)')
        require('—' not in text, 'em dash present')
        require(not re.search('[\U0001F300-\U0001FAFF☀-➿]', text), 'emoji present')
        require(len(text.encode()) <= 90000, 'file over 90 KB')
        if not args.hub:
            for key in ['weather.co2','weather.wind','weather.temp','weather.rain_24h','soil.temp','soil.hum','mesh.msgs','mesh.nodes']:
                require('data-src="'+key+'"' in text, 'missing data-src '+key)
            require('aria-label="Map of' in text, 'map label missing')
            require('Europe/Lisbon' in text, 'clock must use Europe/Lisbon')
            require('Barlow' in text, 'Barlow font missing')
            require(not re.search(r'text-transform:\s*uppercase', text), 'no uppercase labels')
    with tempfile.TemporaryDirectory(prefix='farm-check-') as folder:
        for i, script in enumerate(scripts):
            file = Path(folder) / f'script-{i}.js'; file.write_text(script,encoding='utf-8')
            result = subprocess.run(['node','--check',str(file)], capture_output=True,text=True)
            require(result.returncode == 0, f'script {i} syntax: {result.stderr[:500]}')
    print('OK', args.file)


if __name__ == '__main__': main()
