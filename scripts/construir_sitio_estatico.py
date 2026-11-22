"""Construye la versión HTML estática del Geoportal CHCP (GitHub Pages).

Incluye Monitoreo (CHCP y 53 subcuencas), mapas de subcuencas, corredores y puntos
críticos, y el explorador de coberturas SINIA con las superficies precalculadas.
No incluye nada que requiera Earth Engine en el momento ni credenciales.

    python scripts/construir_sitio_estatico.py                       # genera sitio/
    python scripts/construir_sitio_estatico.py --app-completa https://usuario-geoportal-chcp.hf.space
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
if str(RAIZ) not in sys.path:
    sys.path.insert(0, str(RAIZ))

API_ESTATICA = {
    "/api/v1/territory": "datos/territorio.json",
    "/api/v1/panel/statistics": "datos/estadisticas_territoriales.json",
    "/api/v1/sinia/catalog": "datos/sinia_catalogo.json",
}
PAGINAS = {"/panel": "index.html", "/coberturas": "coberturas.html"}


def construir(destino: Path, app_completa: str, repo_url: str) -> list[str]:
    from webapp.main import create_app

    if destino.exists():
        shutil.rmtree(destino)
    (destino / "datos").mkdir(parents=True)
    app = create_app(testing=True)
    app.config.update(STATIC_SITE=True, FULL_APP_URL=app_completa.rstrip("/"), REPO_URL=repo_url, STATIC_API_MAP=API_ESTATICA)
    cliente = app.test_client()
    generados = []
    for ruta_api, archivo in API_ESTATICA.items():
        respuesta = cliente.get(ruta_api)
        if respuesta.status_code != 200:
            raise SystemExit(f"{ruta_api} respondió {respuesta.status_code}. ¿Existe data/estadisticas_territoriales.json?")
        (destino / archivo).write_text(json.dumps(respuesta.get_json(), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        generados.append(archivo)
    for ruta, archivo in PAGINAS.items():
        html = cliente.get(ruta).get_data(as_text=True)
        html = html.replace('"/static/', '"static/').replace("'/static/", "'static/")
        (destino / archivo).write_text(html, encoding="utf-8")
        generados.append(archivo)
    shutil.copytree(RAIZ / "webapp" / "static", destino / "static",
                    ignore=shutil.ignore_patterns("__fixture*", "__fx*"))
    (destino / ".nojekyll").write_text("", encoding="utf-8")
    (destino / "404.html").write_text('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=index.html"><title>Geoportal CHCP</title>', encoding="utf-8")
    return generados


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--destino", default=str(RAIZ / "sitio"))
    parser.add_argument("--app-completa", default=os.getenv("CHCP_FULL_APP_URL", ""), help="URL de la versión completa (Hugging Face), si existe")
    parser.add_argument("--repo", default="https://github.com/julii5sos/Geoportal_CHCP")
    args = parser.parse_args()
    archivos = construir(Path(args.destino), args.app_completa, args.repo)
    print(f"Sitio estático en {args.destino}: {', '.join(archivos)}")
    print("Para verlo localmente: python -m http.server 8000 --directory sitio  →  http://127.0.0.1:8000")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
