"""Precálculo de mapas y superficies de los productos SINIA (sin Earth Engine real)."""
import importlib.util
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

RAIZ = Path(__file__).resolve().parents[1]

try:
    import numpy as np
    from PIL import Image
except ImportError:  # pragma: no cover
    np = None


@unittest.skipUnless(np is not None, "numpy/Pillow no disponibles")
class PrecalcularCoberturasTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location("pc", RAIZ / "scripts" / "precalcular_coberturas.py")
        self.m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.m)
        self.tmp = tempfile.TemporaryDirectory()
        self.m.DESTINO = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def _ejecutar(self, args, llamadas):
        import chcp.gee.coberturas_sinia as cs
        import chcp.gee.mapas_ficha as mf

        def descargar(imagen, geometria, malla, ee, partes=1):
            llamadas.append("mapa")
            d = malla["grid"]["dimensions"]
            v = np.full((d["height"], d["width"]), 26.0)
            v[0, 0] = mf.SIN_DATO
            v[0, 1] = 1.0
            return v

        def estad(clave, geojson, ee_module):
            llamadas.append("sup")
            return {"product": clave, "classes": [{"code": 26, "area_ha": 10.0}], "classified_ha": 10.0}

        ee = types.SimpleNamespace(Geometry=lambda *a, **k: None)
        servicio = types.ModuleType("webapp.service")
        servicio._initialize_ee = lambda: "proyecto-prueba"
        with mock.patch.dict(sys.modules, {"ee": ee, "webapp.service": servicio}), \
                mock.patch.object(mf, "descargar_valores", descargar), \
                mock.patch.object(cs, "imagen_producto", lambda clave, ee: None), \
                mock.patch.object(cs, "estadisticas_producto", estad):
            return self.m.main(args)

    def test_mapas_superficies_indice_y_reanudacion(self):
        llamadas = []
        self.assertEqual(self._ejecutar(["--territorios", "s5", "--productos", "2021_detallado,2019_general"], llamadas), 0)
        self.assertEqual(sorted(llamadas), ["mapa", "mapa", "sup", "sup"])
        indice = json.loads((self.m.DESTINO / "indice.json").read_text())
        t = indice["territorios"]["s5"]
        self.assertEqual(sorted(t["mapas"]), ["2019_general", "2021_detallado"])
        self.assertEqual(t["superficies"], ["2019_general", "2021_detallado"])
        png = np.array(Image.open(self.m.DESTINO / "mapas" / "s5" / "2021_detallado.v.png"))
        self.assertEqual((png[0, 0], png[0, 1], png[1, 1]), (255, 1, 26))
        self.assertEqual(list(png.shape[::-1]), t["mapas"]["2021_detallado"]["dimensiones"])
        est = json.loads((self.m.DESTINO / "estadisticas" / "s5.json").read_text())
        self.assertEqual(est["2021_detallado"]["classes"][0]["code"], 26)
        # Reanudable: una segunda ejecución no repite nada.
        llamadas.clear()
        self._ejecutar(["--territorios", "s5", "--productos", "2021_detallado,2019_general"], llamadas)
        self.assertEqual(llamadas, [])


if __name__ == "__main__":
    unittest.main()
