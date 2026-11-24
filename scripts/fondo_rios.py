"""Dibuja la red de ríos de la cuenca como fondo decorativo de la portada.

Fuente: ríos del IGNTG recortados a la CHCP (data/hidrografia/rios_igntg_chcp.geojson).
Salida: webapp/static/img/rios.svg (solo trazos, sin relleno ni texto).

Uso: python scripts/fondo_rios.py
"""
from __future__ import annotations

import json
import math
from pathlib import Path

from shapely.geometry import shape

RAIZ = Path(__file__).resolve().parents[1]
ENTRADA = RAIZ / "data" / "hidrografia" / "rios_igntg_chcp.geojson"
SALIDA = RAIZ / "webapp" / "static" / "img" / "rios.svg"
ANCHO = 1600
TOLERANCIA = 0.0004  # grados (~45 m); suficiente para un fondo a esta escala


def main() -> None:
    datos = json.loads(ENTRADA.read_text(encoding="utf-8"))
    lineas = []
    for f in datos["features"]:
        g = shape(f["geometry"]).simplify(TOLERANCIA)
        partes = getattr(g, "geoms", [g])
        lineas.extend(list(p.coords) for p in partes if len(p.coords) > 1)
    xs = [x for l in lineas for x, _ in l]
    ys = [y for l in lineas for _, y in l]
    lat0 = (min(ys) + max(ys)) / 2
    kx = math.cos(math.radians(lat0))
    w = (max(xs) - min(xs)) * kx
    h = max(ys) - min(ys)
    esc = ANCHO / w
    alto = round(h * esc)

    def p(x: float, y: float) -> str:
        return f"{(x - min(xs)) * kx * esc:.1f},{(max(ys) - y) * esc:.1f}"

    d = "".join("M" + " L".join(p(x, y) for x, y in l) for l in lineas)
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {ANCHO} {alto}">'
        f'<path d="{d}" fill="none" stroke="#9ad7a0" stroke-width="1.1" '
        'stroke-linecap="round" stroke-linejoin="round" opacity=".55"/></svg>\n'
    )
    SALIDA.write_text(svg, encoding="utf-8")
    print(f"{SALIDA.relative_to(RAIZ)}: {len(lineas)} trazos, {len(svg) // 1024} KB")


if __name__ == "__main__":
    main()
