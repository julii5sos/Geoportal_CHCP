import math
import unittest

from chcp.gee import mapas_ficha as mf


CUADRADO = {"type": "Polygon", "coordinates": [[[-79.9, 9.1], [-79.8, 9.1], [-79.8, 9.2], [-79.9, 9.2], [-79.9, 9.1]]]}


class MallaTests(unittest.TestCase):
    def test_malla_cubre_el_territorio_y_respeta_limites(self):
        m = mf.malla_mercator(CUADRADO)
        (s, o), (n, e) = m["limites"]
        self.assertLess(o, -79.9); self.assertGreater(e, -79.8)
        self.assertLess(s, 9.1); self.assertGreater(n, 9.2)
        dims = m["grid"]["dimensions"]
        self.assertLessEqual(max(dims["width"], dims["height"]), mf.MAX_PIXELES_LADO + 1)
        self.assertGreaterEqual(m["tamano_pixel_m"], mf.TAMANO_MINIMO_M - 0.1)
        self.assertEqual(m["grid"]["crsCode"], "EPSG:3857")

    def test_area_pequena_no_baja_de_10_m(self):
        chico = {"type": "Polygon", "coordinates": [[[-79.9, 9.1], [-79.899, 9.1], [-79.899, 9.101], [-79.9, 9.1]]]}
        self.assertGreaterEqual(mf.malla_mercator(chico)["tamano_pixel_m"], 9.9)

    def test_mercator_ida_y_vuelta(self):
        x, y = mf._a_mercator(-79.5, 9.0)
        lon, lat = mf._a_lonlat(x, y)
        self.assertAlmostEqual(lon, -79.5, 9); self.assertAlmostEqual(lat, 9.0, 9)


class ColorTests(unittest.TestCase):
    def test_categorias_y_sin_dato_transparente(self):
        import numpy as np
        capa = mf.CAPAS_POR_CLAVE["sinia_2021"]
        rgba = mf.colorear(np.array([[1, 2], [3, mf.SIN_DATO]]), capa)
        self.assertEqual(tuple(rgba[0, 0, :3]), mf._hex(capa["leyenda"][0]["color"]))
        self.assertEqual(rgba[1, 1, 3], 0)
        self.assertTrue(mf.png(rgba).startswith(b"\x89PNG"))

    def test_continuo_extremos_de_paleta(self):
        import numpy as np
        capa = mf.CAPAS_POR_CLAVE["ndvi_cambio"]
        rgba = mf.colorear(np.array([[-1.0, 1.0, mf.SIN_DATO]]), capa)
        self.assertEqual(tuple(rgba[0, 0, :3]), mf._hex(capa["paleta"][0]))
        self.assertEqual(tuple(rgba[0, 1, :3]), mf._hex(capa["paleta"][-1]))
        self.assertEqual(rgba[0, 2, 3], 0)

    def test_todas_las_capas_tienen_leyenda_y_lectura(self):
        claves = [c["clave"] for c in mf.CAPAS]
        self.assertEqual(len(claves), len(set(claves)))
        for capa in mf.CAPAS:
            self.assertTrue(capa["leyenda"] and capa["lectura"] and capa["titulo"])


class RipariaTests(unittest.TestCase):
    def test_resumen_ripario(self):
        valores = {"zona_30": 60, "bosque_30": 30, "arboles_30": 36, "zona_50": 100, "bosque_50": 40, "arboles_50": 50,
                   "zona_100": 200, "bosque_100": 120, "arboles_100": 110,
                   "sinbosque_0_15": 30, "sinbosque_15_30": 20, "sinbosque_30_mas": 10}
        r = mf.resumir_riparia(valores)
        self.assertEqual([f["bosque_sinia_pct"] for f in r["franjas"]], [50.0, 40.0, 60.0])
        self.assertEqual(r["franjas"][1]["arboles_esri_pct"], 50.0)
        # 100 ha de franja de 50 m a cada lado (100 m de ancho) ≈ 10 km de cauce
        self.assertTrue(math.isclose(r["longitud_cauces_km"], 10.0))
        self.assertEqual(r["sin_bosque_por_pendiente"][2]["area_ha"], 10)

    def test_resumen_sin_cauces(self):
        r = mf.resumir_riparia({})
        self.assertIsNone(r["franjas"][0]["bosque_sinia_pct"])
        self.assertEqual(r["longitud_cauces_km"], 0)


class SitiosTests(unittest.TestCase):
    def test_orden_por_fuentes_y_area_e_identificador_estable(self):
        c = [{"area_ha": 3, "centro": [-79.81, 9.15], "fuentes": 1}, {"area_ha": 1, "centro": [-79.82, 9.16], "fuentes": 3},
             {"area_ha": 0.2, "centro": [-79.83, 9.17], "fuentes": 3}, {"area_ha": 2, "centro": [-79.84, 9.18], "fuentes": 2}]
        s = mf.ordenar_sitios(c, "s5", 10, 0.5)
        self.assertEqual([x["fuentes"] for x in s], [3, 2, 1])
        self.assertEqual(s[0]["id"], mf.identificador_sitio("s5", 9.16, -79.82))
        self.assertEqual(s[0]["id"], "s5-16008200")
