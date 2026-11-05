#!/usr/bin/env python3
"""mock-api: fuente externa simulada para la prueba técnica.

Solo usa la biblioteca estándar de Python. No necesitas modificar este archivo;
el contrato de la API está en ../CONTRATO.md.

Variables de entorno:
  PORT              puerto de escucha                      (8000)
  SOURCE_API_KEY    clave exigida en el header X-API-Key   (dev-source-key)
  MOCK_ERROR_RATE   fracción de llamadas con 429/500       (0.15; usa 0 para desactivar)
  MOCK_SEED         semilla de los errores aleatorios      (42)
"""
import json
import math
import os
import random
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

PORT = int(os.environ.get("PORT", "8000"))
API_KEY = os.environ.get("SOURCE_API_KEY", "dev-source-key")
ERROR_RATE = float(os.environ.get("MOCK_ERROR_RATE", "0.15"))
SEED = os.environ.get("MOCK_SEED", "42")
DATA = json.loads((Path(__file__).parent / "data" / "proyectos_raw.json").read_text(encoding="utf-8"))

MAX_PAGE_SIZE = 50
DEFAULT_PAGE_SIZE = 20

_contador = 0
_lock = threading.Lock()


def siguiente_error():
    """Decide de forma reproducible (semilla + número de llamada) si esta llamada falla."""
    global _contador
    with _lock:
        _contador += 1
        n = _contador
    if ERROR_RATE <= 0:
        return None
    r = random.Random(f"{SEED}:{n}")
    if r.random() < ERROR_RATE:
        return 429 if r.random() < 0.5 else 500
    return None


class Handler(BaseHTTPRequestHandler):
    server_version = "mock-api/1.0"

    def _json(self, status, cuerpo, extra=None):
        data = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/health":
            return self._json(200, {"status": "ok"})
        if url.path != "/api/v1/proyectos":
            return self._json(404, {"error": "no encontrado"})
        if self.headers.get("X-API-Key") != API_KEY:
            return self._json(401, {"error": "API key inválida o ausente (header X-API-Key)"})

        falla = siguiente_error()
        if falla == 429:
            return self._json(429, {"error": "demasiadas solicitudes"}, {"Retry-After": "1"})
        if falla == 500:
            return self._json(500, {"error": "error interno simulado"})

        q = parse_qs(url.query)
        try:
            page = int(q.get("page", ["1"])[0])
            size = int(q.get("page_size", [str(DEFAULT_PAGE_SIZE)])[0])
        except ValueError:
            return self._json(400, {"error": "page y page_size deben ser enteros"})
        if page < 1 or not 1 <= size <= MAX_PAGE_SIZE:
            return self._json(400, {"error": f"page >= 1 y 1 <= page_size <= {MAX_PAGE_SIZE}"})

        total = len(DATA)
        ini = (page - 1) * size
        self._json(200, {
            "items": DATA[ini: ini + size],
            "page": page,
            "page_size": size,
            "total_items": total,
            "total_pages": math.ceil(total / size),
        })

    def log_message(self, fmt, *args):
        print("%s %s" % (self.address_string(), fmt % args), flush=True)


if __name__ == "__main__":
    print(f"mock-api escuchando en :{PORT} | filas: {len(DATA)} | error_rate={ERROR_RATE} | seed={SEED}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
