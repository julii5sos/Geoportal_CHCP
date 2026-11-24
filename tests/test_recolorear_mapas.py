"""Repintar un mapa desde sus valores guardados (sin Earth Engine) con la leyenda vigente."""
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

from chcp.gee.mapas_ficha import CAPAS_POR_CLAVE, SIN_VALOR, recolorear


class RecolorearTest(unittest.TestCase):
    def test_categorias_usan_los_colores_de_la_leyenda(self):
        with tempfile.TemporaryDirectory() as d:
            q = np.array([[1, 2, 3], [4, 5, SIN_VALOR]], dtype="uint8")  # clases JRC TMF
            Image.fromarray(q, "L").save(Path(d) / "jrc_2025.v.png")
            self.assertTrue(recolorear(d, "jrc_2025"))
            rgba = np.array(Image.open(Path(d) / "jrc_2025.png"))
            colores = {x["valor"]: x["color"] for x in CAPAS_POR_CLAVE["jrc_2025"]["leyenda"]}
            self.assertEqual("#%02x%02x%02x" % tuple(rgba[0, 0, :3]), colores[1])
            self.assertEqual("#%02x%02x%02x" % tuple(rgba[0, 2, :3]), colores[3])
            self.assertEqual(rgba[1, 2, 3], 0)  # sin dato: transparente

    def test_sin_valores_no_hace_nada(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertFalse(recolorear(d, "hansen"))
            self.assertFalse((Path(d) / "hansen.png").exists())

    def test_colores_oficiales_jrc(self):
        colores = [x["color"] for x in CAPAS_POR_CLAVE["jrc_2025"]["leyenda"]]
        self.assertEqual(colores, ["#005a00", "#649b23", "#ff870f", "#d2fa3c", "#008cbe", "#ffffff"])


if __name__ == "__main__":
    unittest.main()
