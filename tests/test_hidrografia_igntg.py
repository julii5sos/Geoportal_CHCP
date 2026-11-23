"""Capa ribereña derivada de la red hidrográfica del IGNTG."""
import json
import tempfile
import unittest
from pathlib import Path

try:
    import shapefile  # pyshp
    from PIL import Image
    from scipy import ndimage  # noqa: F401
except ImportError:  # pragma: no cover
    shapefile = None

RAIZ = Path(__file__).resolve().parents[1]
WKT_UTM17 = ('PROJCS["WGS_1984_UTM_Zone_17N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",'
             '6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],'
             'PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],'
             'PARAMETER["Central_Meridian",-81.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],'
             'UNIT["Meter",1.0]]')


@unittest.skipUnless(shapefile, "pyshp/scipy no disponibles")
class HidrografiaIgntgTests(unittest.TestCase):
    def test_banda_ribereña_y_metadatos(self):
        import scripts.preparar_hidrografia_igntg as h
        from pyproj import Transformer
        from shapely.geometry import shape
        from chcp.territorio.territorio_local import geometria_cuenca

        c = shape(geometria_cuenca()).representative_point()
        x, y = Transformer.from_crs(4326, 32617, always_xy=True).transform(c.x, c.y)
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp) / "red"
            w = shapefile.Writer(str(base), shapeType=shapefile.POLYLINE, encoding="utf-8")
            for campo in ("TYPE", "NAME"):
                w.field(campo, "C", 50)
            w.line([[(x - 2000, y), (x + 2000, y)]])
            w.record("Río", "Río de prueba")
            w.close()
            base.with_suffix(".prj").write_text(WKT_UTM17)
            h.DESTINO = Path(tmp) / "salida"
            self.assertEqual(h.main([str(base.with_suffix(".shp"))]), 0)
            meta = json.loads((h.DESTINO / "riparia_igntg.json").read_text())
            v = Image.open(h.DESTINO / "riparia_igntg.v.png")
            self.assertEqual(list(v.size), meta["dimensiones"])
            self.assertAlmostEqual(meta["km_en_cuenca_por_tipo"]["Río"], 4.0, delta=0.05)
            hist = v.histogram()
            # Cauce de ~4 km × 20 m y bandas crecientes; casi todo lo demás sin dato.
            self.assertGreater(hist[1], 150)
            self.assertTrue(hist[3] > 0 and hist[4] > 0 and hist[5] > hist[3])
            self.assertIn("Tommy Guardia", meta["fuente"])
            self.assertNotIn("geometry", json.dumps(meta))


class RutaHidrografiaTests(unittest.TestCase):
    def test_solo_se_sirve_el_producto_derivado(self):
        from webapp.main import create_app

        cliente = create_app().test_client()
        self.assertEqual(cliente.get("/api/v1/hidrografia/Redhidrologica2_2022.shp").status_code, 400)
        r = cliente.get("/api/v1/hidrografia/riparia_igntg.json")
        self.assertIn(r.status_code, (200, 404))


if __name__ == "__main__":
    unittest.main()
