"""
PT 101 Final Project - Topic 3: Page Replacement | Web GUI (Python server)

Project layout (keep these together):
    page_replacement.py     algorithms (FIFO, LRU, Optimal)
    web_app.py              this file: tiny web server + /api/simulate
    static/index.html       page structure
    static/style.css        design / styling
    static/app.js           browser behaviour (display and interactivity only)

Run:  python web_app.py        (then open http://localhost:8000)
Needs only the Python standard library.
"""
import json
import mimetypes
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from page_replacement import ALGORITHMS, parse_input, simulate

PORT = 8000
MAX_FRAMES = 30
MAX_REFS = 500
MAX_BODY = 64 * 1024          # bytes; the largest legitimate request is a few KB
STATIC = (Path(__file__).resolve().parent / "static")


class InputError(ValueError):
    """A validation error tied to one form field ("refs" or "frames")."""

    def __init__(self, message, field):
        super().__init__(message)
        self.field = field


def validate(body):
    """Reuse the Python validator for the reference string; frames allowed 1..MAX_FRAMES."""
    if not isinstance(body, dict):
        raise InputError("Request body must be a JSON object.", None)
    try:
        refs, _ = parse_input(str(body.get("refs", "")), "1")
    except ValueError as e:
        raise InputError(str(e), "refs")
    if len(refs) > MAX_REFS:
        raise InputError(f"Too many references (maximum {MAX_REFS}).", "refs")
    try:
        n = int(str(body.get("frames", "")).strip())
    except ValueError:
        raise InputError("Number of frames must be a whole number.", "frames")
    if not 1 <= n <= MAX_FRAMES:
        raise InputError(f"Number of frames must be between 1 and {MAX_FRAMES}.", "frames")
    return refs, n


MIME = {".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json"}
CSP = ("default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
       "connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'")


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json"):
        self.send_response(code)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", CSP)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/", "/index.html"):
            path = "/static/index.html"
        if not path.startswith("/static/"):
            return self._send(404, b'{"error":"Not found"}')
        file = (STATIC / path[len("/static/"):]).resolve()
        # block ../ tricks: the file must live inside the static folder
        if STATIC not in file.parents or not file.is_file():
            return self._send(404, b'{"error":"Not found"}')
        ctype = MIME.get(file.suffix.lower()) or mimetypes.guess_type(file.name)[0] or "application/octet-stream"
        self._send(200, file.read_bytes(), ctype)

    def do_POST(self):
        if self.path != "/api/simulate":
            return self._send(404, b'{"error":"Not found"}')
        try:
            try:
                length = int(self.headers.get("Content-Length", 0))
            except ValueError:
                raise InputError("Invalid Content-Length header.", None)
            if length < 0 or length > MAX_BODY:
                return self._send(413, json.dumps({"error": "Request is too large."}).encode())
            try:
                body = json.loads(self.rfile.read(length) or b"{}")
            except (ValueError, UnicodeDecodeError):
                raise InputError("Request body is not valid JSON.", None)
            refs, n = validate(body)
            results = [simulate(a, refs, n) for a in ALGORITHMS]
            self._send(200, json.dumps({"refs": refs, "frames": n, "results": results}).encode())
        except InputError as e:
            self._send(400, json.dumps({"error": str(e), "field": e.field}).encode())
        except Exception:
            self._send(500, json.dumps({"error": "Unexpected server error."}).encode())

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://localhost:{PORT}"
    print(f"Page Replacement Simulator running at {url}  (Ctrl+C to stop)")
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")