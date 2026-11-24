import csv
import importlib.util
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(RAIZ / "scripts"))

from chcp.nucleo.validacion import evaluar, exactitud_binaria_estratificada, matriz_conteos  # noqa: E402

spec = importlib.util.spec_from_file_location("exactitud_por_fuente", RAIZ / "scripts" / "exactitud_por_fuente.py")
epf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(epf)


class StehmanTests(unittest.TestCase):
    def test_reproduce_olofsson_cuando_el_mapa_es_el_de_los_estratos(self):
        areas = {1: 100.0, 2: 5000.0, 3: 9000.0}
        pares = [(1, 1)] * 30 + [(1, 3)] * 20 + [(2, 2)] * 45 + [(2, 1)] * 5 + [(3, 3)] * 44 + [(3, 1)] * 6
        o = evaluar([1, 2, 3], areas, matriz_conteos(pares, [1, 2, 3]))["por_clase"][0]
        s = exactitud_binaria_estratificada([(h, int(h == 1), int(r == 1)) for h, r in pares], areas)
        self.assertAlmostEqual(s["exactitud_usuario"], o["exactitud_usuario"], places=10)
        self.assertAlmostEqual(s["exactitud_productor"], o["exactitud_productor"], places=10)
        self.assertAlmostEqual(s["exactitud_usuario_ic"], o["exactitud_usuario_ic"], places=4)
        self.assertAlmostEqual(s["exactitud_productor_ic"], o["exactitud_productor_ic"], places=4)
        self.assertAlmostEqual(s["area_referencia"], o["area_ajustada"], places=6)

    def test_mapa_distinto_de_los_estratos(self):
        areas = {1: 100.0, 2: 900.0}
        # el mapa evaluado marca pérdida en 2 puntos del estrato 2, uno de ellos correcto
        reg = [(1, 0, 1)] * 10 + [(2, 1, 1), (2, 1, 0)] + [(2, 0, 0)] * 8
        r = exactitud_binaria_estratificada(reg, areas)
        self.assertAlmostEqual(r["area_mapa"], 900 * 2 / 10)
        self.assertAlmostEqual(r["exactitud_usuario"], 0.5)
        self.assertAlmostEqual(r["area_referencia"], 100 + 90)
        self.assertAlmostEqual(r["exactitud_productor"], 90 / 190)

    def test_sin_alertas_no_hay_exactitud_de_usuario(self):
        r = exactitud_binaria_estratificada([(1, 0, 1), (1, 0, 0), (2, 0, 0), (2, 0, 0)], {1: 1.0, 2: 1.0})
        self.assertIsNone(r["exactitud_usuario"])


class CalcularPorFuenteTests(unittest.TestCase):
    def test_la_coincidencia_recalculada_reproduce_el_resultado_publicado(self):
        origen = RAIZ / "data" / "validacion" / "senal_perdida"
        with tempfile.TemporaryDirectory() as tmp:
            carpeta = Path(tmp)
            for n in ("diseno.json", "estratos.csv", "muestra.csv", "resultados.json"):
                shutil.copy(origen / n, carpeta / n)
            with (carpeta / "estratos.csv").open(encoding="utf-8") as f:
                estratos = {x["id"]: int(x["clase_mapa"]) for x in csv.DictReader(f)}
            with (carpeta / "fuentes_puntos.csv").open("w", newline="", encoding="utf-8") as f:
                w = csv.writer(f)
                w.writerow(["id", "jrc", "hansen", "esri", "ndvi", "ndvi_inicial", "ndvi_final"])
                for pid, h in estratos.items():
                    w.writerow([pid, int(h == 1), int(h == 1), 0, 0, 0.8, 0.8])
            r = epf.calcular(carpeta)
            self.assertEqual(r["concordancia_con_estratos"], 1.0)
            publicado = json.loads((carpeta / "resultados.json").read_text(encoding="utf-8"))["resultado"]["por_clase"][0]
            self.assertAlmostEqual(r["fuentes"]["al_menos_2"]["exactitud_usuario"], round(publicado["exactitud_usuario"], 4))
            self.assertAlmostEqual(r["fuentes"]["al_menos_2"]["exactitud_productor"], round(publicado["exactitud_productor"], 4))
            self.assertIsNone(r["fuentes"]["esri"]["exactitud_usuario"])
            self.assertTrue((carpeta / "resultados_fuentes.json").exists())


class PublicacionTests(unittest.TestCase):
    def test_no_se_publican_los_valores_por_punto(self):
        s = (RAIZ / "scripts" / "construir_sitio_estatico.py").read_text(encoding="utf-8")
        self.assertIn('"fuentes_puntos.csv"', s)
        self.assertIn("resultados_fuentes", (RAIZ / "webapp" / "main.py").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
