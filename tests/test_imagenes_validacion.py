"""Imágenes sin nubes para la validación: malla del recorte y lectura de la muestra."""
import importlib.util
import math
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]


class ImagenesValidacionTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location("iv", RAIZ / "scripts" / "imagenes_validacion.py")
        self.m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.m)

    def test_malla_centrada_y_10_m_en_el_terreno(self):
        g = self.m.malla_punto(-79.7, 9.2)
        t = g["affineTransform"]
        self.assertEqual(g["dimensions"], {"width": 64, "height": 64})
        self.assertAlmostEqual(t["scaleX"] * math.cos(math.radians(9.2)), 10.0, places=6)
        cx = t["translateX"] + 32 * t["scaleX"]
        self.assertAlmostEqual(cx, math.radians(-79.7) * 6378137.0, places=3)
        self.assertLess(t["scaleY"], 0)

    def test_anios_cubren_el_periodo_de_la_senal(self):
        self.assertIn(2020, self.m.ANIOS_RECORTES)
        self.assertIn(2025, self.m.ANIOS_RECORTES)
        self.assertEqual(self.m.ANIOS_SERIES[0], 2017)

    def test_pagina_muestra_las_imagenes(self):
        js = (RAIZ / "webapp/static/js/validacion.js").read_text(encoding="utf-8")
        self.assertIn("imagenes/indice.json", js)
        self.assertIn("panelImagenes(p)", js)
        html = (RAIZ / "webapp/templates/validacion.html").read_text(encoding="utf-8")
        self.assertIn("js/graficas.js", html)


if __name__ == "__main__":
    unittest.main()
