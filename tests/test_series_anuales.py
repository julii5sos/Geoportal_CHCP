"""Series anuales por territorio: catálogo y precálculo (sin Earth Engine real)."""
import importlib.util
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

from chcp.nucleo import series_anuales as sa
from chcp.nucleo.metodologia_indice import PERIODOS_ANALISIS

RAIZ = Path(__file__).resolve().parents[1]

try:
    import numpy as np
    from PIL import Image
except ImportError:  # pragma: no cover
    np = None


class CatalogoTests(unittest.TestCase):
    def test_periodos_coherentes_con_el_indice(self):
        self.assertIn(PERIODOS_ANALISIS["jrc_diagnostico"], sa.PRODUCTOS["jrc"]["anios"])
        self.assertEqual(sa.PRODUCTOS["jrc"]["anios"][0], 1990)
        for a in (PERIODOS_ANALISIS["esri_inicial"], PERIODOS_ANALISIS["esri_final"]):
            self.assertIn(a, sa.PRODUCTOS["esri"]["anios"])
        for a in (PERIODOS_ANALISIS["ndvi_inicial"], PERIODOS_ANALISIS["ndvi_final"]):
            self.assertIn(a, sa.PRODUCTOS["ndvi"]["anios"])
        self.assertEqual([c["valor"] for c in sa.PRODUCTOS["hansen"]["clases"]], list(range(1, 26)))

    def test_clases_ndvi_igual_que_la_metodologia(self):
        self.assertEqual([sa.clase_ndvi(v) for v in (-0.1, 0.0, 0.19, 0.2, 0.39, 0.4, 0.59, 0.6, 0.95)],
                         [1, 2, 2, 3, 3, 4, 4, 5, 5])
        self.assertEqual(sa.clase_ndvi(None), sa.SIN_DATO)
        self.assertEqual(sa.clase_ndvi(float("nan")), sa.SIN_DATO)

    def test_esri_excluye_nubes_y_colores_unicos(self):
        for p in sa.PRODUCTOS.values():
            colores = [c["color"] for c in p["clases"]]
            self.assertEqual(len(colores), len(set(colores)), p["nombre"])
        self.assertNotIn(10, [c["valor"] for c in sa.PRODUCTOS["esri"]["clases"]])

    def test_grupos_a_hectareas(self):
        self.assertEqual(sa.grupos_a_hectareas([{"c": 1, "sum": 10.123456}, {"c": 255, "sum": 3}, {"c": 2.0, "sum": 1}]),
                         {"1": 10.1235, "2": 1.0})
        self.assertEqual(sa.grupos_a_hectareas(None), {})


@unittest.skipUnless(np is not None, "numpy/Pillow no disponibles")
class PrecalcularSeriesTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location("ps", RAIZ / "scripts" / "precalcular_series.py")
        self.m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.m)
        self.tmp = tempfile.TemporaryDirectory()
        self.m.DESTINO = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def _ejecutar(self, args, llamadas):
        def descargar(img, bandas, geometria, grid, ee):
            llamadas.append(("mapa", tuple(bandas)))
            d = grid["dimensions"]
            return {b: np.full((d["height"], d["width"]), 1, dtype="uint8") for b in bandas}

        def superficies(t, producto, ee):
            llamadas.append(("sup", producto))
            if producto == "hansen":
                return {"perdida_por_anio": {"2021": 1.0}, "cobertura_arborea_2000_ha": 9.0}
            return {"por_anio": {str(a): {"1": 5.0} for a in sa.PRODUCTOS[producto]["anios"]}}

        ee = types.SimpleNamespace(Geometry=lambda *a, **k: None)
        servicio = types.ModuleType("webapp.service")
        servicio._initialize_ee = lambda: "proyecto-prueba"
        with mock.patch.dict(sys.modules, {"ee": ee, "webapp.service": servicio}), \
                mock.patch.object(self.m, "imagen_producto", lambda p, g, ee: (None, 30)), \
                mock.patch.object(self.m, "_descargar_bandas", descargar), \
                mock.patch.object(self.m, "calcular_superficies", superficies):
            return self.m.main(args)

    def test_mapas_por_anio_superficies_y_reanudacion(self):
        llamadas = []
        self.assertEqual(self._ejecutar(["--territorios", "s5", "--productos", "esri,hansen"], llamadas), 0)
        mapas = [x for x in llamadas if x[0] == "mapa"]
        self.assertEqual(len(mapas), 2)
        carpeta = self.m.DESTINO / "mapas" / "s5"
        for a in sa.PRODUCTOS["esri"]["anios"]:
            self.assertTrue((carpeta / f"esri_{a}.v.png").exists(), a)
        self.assertTrue((carpeta / "hansen.v.png").exists())
        indice = json.loads((self.m.DESTINO / "indice.json").read_text())
        self.assertIn("productos", indice)
        self.assertEqual(indice["productos"]["esri"]["anios"], sa.PRODUCTOS["esri"]["anios"])
        t = indice["territorios"]["s5"]
        self.assertEqual(sorted(t["mapas"]), ["esri", "hansen"])
        self.assertEqual(t["superficies"], ["esri", "hansen"])
        png = np.array(Image.open(carpeta / "esri_2017.v.png"))
        self.assertEqual(list(png.shape[::-1]), t["mapas"]["esri"]["dimensiones"])
        est = json.loads((self.m.DESTINO / "estadisticas" / "s5.json").read_text())
        self.assertEqual(est["hansen"]["cobertura_arborea_2000_ha"], 9.0)
        llamadas.clear()
        self._ejecutar(["--territorios", "s5", "--productos", "esri,hansen"], llamadas)
        self.assertEqual(llamadas, [])


if __name__ == "__main__":
    unittest.main()
