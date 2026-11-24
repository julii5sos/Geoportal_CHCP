"""Mapa ERI de las subcuencas que no lo tienen, recortado del mapa ERI de toda la cuenca.

La imagen ERI por subcuenca es la capa más lenta de Earth Engine (y con la cuota no comercial
agotada no termina). El ERI de la CHCP completa ya está calculado con el mismo modelo
(eri_gee.construir_imagenes_eri) en una malla de 42,6 m: aquí se remuestrea por vecino más
cercano a la malla de cada subcuenca y se recorta a su límite. No usa Earth Engine.

El resultado se marca con ``mapas.eri_origen = "cuenca"`` y la ficha lo indica. El modo
«solo-mapa-eri» de precalcular_panel.py vuelve a generar estos mapas a la resolución propia
de la subcuenca cuando haya cuota.

Uso: python scripts/eri_desde_cuenca.py
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))

from chcp.gee.mapas_ficha import (  # noqa: E402
    CAPAS_POR_CLAVE, CODIFICACION_VALORES, SIN_VALOR, colorear, decodificar, png, png_gris,
)

DATOS = RAIZ / "data" / "estadisticas_territoriales.json"
DIR_MAPAS = RAIZ / "data" / "mapas"
R = 6_378_137.0


def _mx(lon: float) -> float:
    return R * math.radians(lon)


def _my(lat: float) -> float:
    return R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def remuestrear(origen: np.ndarray, lim_o, destino_forma: tuple[int, int], lim_d) -> np.ndarray:
    """Vecino más cercano entre dos mallas EPSG:3857 dadas por sus límites [[s, o], [n, e]]."""
    (s_o, o_o), (n_o, e_o) = lim_o
    (s_d, o_d), (n_d, e_d) = lim_d
    h_o, w_o = origen.shape
    h_d, w_d = destino_forma
    xs = _mx(o_d) + (np.arange(w_d) + 0.5) * (_mx(e_d) - _mx(o_d)) / w_d
    ys = _my(n_d) - (np.arange(h_d) + 0.5) * (_my(n_d) - _my(s_d)) / h_d
    col = np.floor((xs - _mx(o_o)) / ((_mx(e_o) - _mx(o_o)) / w_o)).astype(int)
    fila = np.floor((_my(n_o) - ys) / ((_my(n_o) - _my(s_o)) / h_o)).astype(int)
    dentro_c, dentro_f = (col >= 0) & (col < w_o), (fila >= 0) & (fila < h_o)
    salida = np.full((h_d, w_d), SIN_VALOR, dtype="uint8")
    sub = origen[np.clip(fila, 0, h_o - 1)][:, np.clip(col, 0, w_o - 1)]
    mascara = dentro_f[:, None] & dentro_c[None, :]
    salida[mascara] = sub[mascara]
    return salida


def main() -> int:
    datos = json.loads(DATOS.read_text(encoding="utf-8"))
    T = datos["territorios"]
    cuenca = T["chcp"]["mapas"]
    eri = np.array(Image.open(DIR_MAPAS / "chcp" / "eri.v.png").convert("L"))
    hechos = []
    for ident, t in T.items():
        m = t.get("mapas") or {}
        if ident == "chcp" or "eri" in (m.get("capas") or []) and m.get("eri_origen") != "cuenca":
            continue
        base = DIR_MAPAS / ident / "sinia_2021.v.png"  # define la malla y el límite de la subcuenca
        if not base.exists() or not m.get("limites"):
            continue
        huella = np.array(Image.open(base).convert("L")) != SIN_VALOR
        q = remuestrear(eri, cuenca["limites"], huella.shape, m["limites"])
        q[~huella] = SIN_VALOR
        (DIR_MAPAS / ident / "eri.v.png").write_bytes(png_gris(q))
        (DIR_MAPAS / ident / "eri.png").write_bytes(png(colorear(decodificar(q, CODIFICACION_VALORES["eri"]), CAPAS_POR_CLAVE["eri"])))
        m["capas"] = [c for c in CAPAS_POR_CLAVE if c in set(m.get("capas") or []) | {"eri"}]
        m["valores"] = list(dict.fromkeys([*(m.get("valores") or []), "eri"]))
        m["eri_origen"] = "cuenca"
        m["eri_tamano_pixel_m"] = cuenca.get("tamano_pixel_m")
        (m.get("errores") or {}).pop("eri", None)
        m.pop("eri_pendiente", None)
        hechos.append(t["nombre"])
    DATOS.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Mapa ERI recortado de la cuenca en {len(hechos)} subcuencas: {', '.join(hechos)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
