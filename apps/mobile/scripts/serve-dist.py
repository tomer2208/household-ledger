"""Serves dist/ like the static host will: files as-is, every other path -> index.html.
Local check of the PWA build (service worker, manifest, offline). Usage: python3 scripts/serve-dist.py [port]"""
import http.server, os, sys

ROOT = os.path.join(os.path.dirname(__file__), '..', 'dist')

class SPA(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def send_head(self):
        path = self.translate_path(self.path)
        if not os.path.exists(path):
            self.path = '/index.html'
        return super().send_head()

    def end_headers(self):
        if self.path.endswith('sw.js'):
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 4173), SPA).serve_forever()
