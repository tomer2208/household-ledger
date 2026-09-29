"""Serves dist/ like the static host will: files as-is, every other path -> index.html, and the
same response headers Vercel sends (read from vercel.json, so a CSP change is tested locally first).
Local check of the PWA build (service worker, manifest, offline, CSP). Usage: python3 scripts/serve-dist.py [port]"""
import http.server, json, os, re, sys

HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, '..', 'dist')
with open(os.path.join(HERE, '..', 'vercel.json')) as f:
    # Vercel sources like "/(.*)" and "/_expo/(.*)" read the same as Python regexes.
    RULES = [(re.compile(r['source']), r['headers']) for r in json.load(f).get('headers', [])]

class SPA(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def send_head(self):
        self.request_path = self.path.split('?')[0]
        path = self.translate_path(self.path)
        if not os.path.exists(path):
            self.path = '/index.html'
        return super().send_head()

    def end_headers(self):
        requested = getattr(self, 'request_path', self.path)
        for pattern, headers in RULES:
            if pattern.fullmatch(requested):
                for h in headers:
                    self.send_header(h['key'], h['value'])
        super().end_headers()

http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 4173), SPA).serve_forever()
