"""Métricas de la comparación del bosque oficial 2021 y 2023 (scripts/comparar_bosque_2021_2023.py)."""

import importlib.util
import unittest
from pathlib import Path

import numpy as np

RUTA = Path(__file__).resolve().parents[1] / "scripts" / "comparar_bosque_2021_2023.py"
spec = importlib.util.spec_from_file_location("comparar_bosque", RUTA)
cmp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cmp)


class MetricasTest(unittest.TestCase):
    def _bosque(self, separacion_px: int) -> np.ndarray:
        b = np.zeros((20, 60), dtype=bool)
        b[5:15, 5:15] = True                                     # parche de 10 × 10 píxeles
        b[5:15, 15 + separacion_px:25 + separacion_px] = True    # segundo parche igual
        return b

    def test_parches_cercanos_forman_una_red(self):
        nada = np.zeros((20, 60), dtype=bool)
        m = cmp.metricas(self._bosque(8), 50.0, nada, nada)     # 8 × 50 m = 400 m de brecha
        self.assertEqual(m["numero_parches"], 2)
        self.assertEqual(m["redes_separadas"], 1)
        self.assertAlmostEqual(m["parche_mayor_ha"], 25.0)    # 100 píxeles de 0,25 ha

    def test_parches_lejanos_quedan_separados(self):
        nada = np.zeros((20, 60), dtype=bool)
        m = cmp.metricas(self._bosque(13), 50.0, nada, nada)    # 650 m de brecha
        self.assertEqual(m["redes_separadas"], 2)

    def test_bosque_en_corredor(self):
        b = self._bosque(8)
        corr = np.zeros_like(b)
        corr[:, :10] = True
        m = cmp.metricas(b, 50.0, corr, np.zeros_like(b))
        self.assertAlmostEqual(m["bosque_corredores_ha"], 50 * 0.25)  # 10 filas × 5 columnas


if __name__ == "__main__":
    unittest.main()
