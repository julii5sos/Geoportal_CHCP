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


class CodificacionTests(unittest.TestCase):
    def test_ida_y_vuelta_continuo_y_categorias(self):
        import numpy as np
        for clave, valores, tolerancia in (("ndvi_cambio", [-0.31, 0.0, 0.42], 0.004), ("eri", [0.0, 0.5, 0.99], 0.002), ("gedi", [0.0, 12.3, 40.1], 0.125)):
            codec = mf.CODIFICACION_VALORES[clave]
            q = mf.codificar(np.array([valores + [mf.SIN_DATO]]), codec)
            self.assertEqual(q.dtype, np.uint8)
            self.assertEqual(q[0, -1], mf.SIN_VALOR)
            v = mf.decodificar(q, codec)
            self.assertTrue(np.allclose(v[0, :-1], valores, atol=tolerancia))
            self.assertTrue(np.isnan(v[0, -1]))
        q = mf.codificar(np.array([[1, 6, mf.SIN_DATO]]), mf.CODIFICACION_VALORES["jrc_2025"])
        self.assertEqual(q.tolist(), [[1, 6, 255]])
        self.assertTrue(mf.png_gris(q).startswith(b"\x89PNG"))

    def test_todas_las_capas_de_indice_tienen_codificacion(self):
        for clave in ("jrc_2025", "hansen", "esri_cambio", "ndvi_cambio", "eri", "sinia_2021", "coincidencia", "riparia", "gedi", "aux"):
            self.assertIn(clave, mf.CODIFICACION_VALORES)


class BloquesTests(unittest.TestCase):
    def test_submallas_cubren_la_malla_sin_solapes(self):
        m = mf.malla_mercator(CUADRADO)["grid"]
        bloques = mf.submallas(m, 3)
        self.assertEqual(sum(b["dimensions"]["width"] * b["dimensions"]["height"] for _, _, b in bloques),
                         m["dimensions"]["width"] * m["dimensions"]["height"])
        fila, col, b = bloques[4]
        self.assertAlmostEqual(b["affineTransform"]["translateX"], m["affineTransform"]["translateX"] + col * m["affineTransform"]["scaleX"])
        self.assertAlmostEqual(b["affineTransform"]["translateY"], m["affineTransform"]["translateY"] + fila * m["affineTransform"]["scaleY"])

    def test_reintento_por_bloques_cuando_es_demasiado_grande(self):
        import numpy as np

        class Img:
            def toFloat(self): return self
            def clip(self, g): return self
            def unmask(self, v): return self
            def rename(self, n): return self

        class Datos:
            llamadas = 0
            def computePixels(self, req):
                Datos.llamadas += 1
                d = req["grid"]["dimensions"]
                if d["width"] > 400:
                    raise Exception("Reprojection output too large (9774x9418 pixels).")
                return {"v": np.ones((d["height"], d["width"]))}

        class EE:
            data = Datos()
        malla = mf.malla_mercator(CUADRADO)
        v = mf.descargar_valores(Img(), None, malla, EE)
        self.assertEqual(v.shape, (malla["grid"]["dimensions"]["height"], malla["grid"]["dimensions"]["width"]))
        self.assertTrue((v == 1).all())

    def test_reintenta_en_mosaicos_si_se_agota_la_memoria(self):
        import numpy as np

        import chcp.gee.mapas_ficha as mf

        class Img:
            def toFloat(self): return self
            def clip(self, g): return self
            def unmask(self, v): return self
            def rename(self, n): return self

        class Datos:
            def computePixels(self, req):
                d = req["grid"]["dimensions"]
                if d["width"] > 400:
                    raise Exception("User memory limit exceeded.")
                return {"v": np.full((d["height"], d["width"]), 2.0)}

        class EE:
            data = Datos()
        malla = mf.malla_mercator(CUADRADO)
        v = mf.descargar_valores(Img(), None, malla, EE)
        self.assertTrue((v == 2).all())
        self.assertFalse(mf._reintentable(Exception("Image.select: band not found")))


class GenerarMapasTests(unittest.TestCase):
    def test_genera_todas_las_capas_en_paralelo_y_aisla_errores(self):
        import tempfile
        from pathlib import Path
        from unittest import mock

        import numpy as np

        class EE:
            @staticmethod
            def Geometry(*a, **k): return None

        def falso(imagen, geometria, malla, ee, partes=1):
            if imagen == "eri":
                raise RuntimeError("falla simulada")
            d = malla["grid"]["dimensions"]
            return np.ones((d["height"], d["width"]))

        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(mf, "_imagen_capa", lambda clave, g, ee: clave), \
                mock.patch.object(mf, "descargar_valores", falso):
            r = mf.generar_mapas(CUADRADO, Path(tmp), ee_module=EE, registro=lambda *_: None)
            self.assertIn("eri", r["errores"])
            self.assertEqual(len(r["capas"]), len(mf.CAPAS) - 1)
            self.assertIn("aux", r["valores"])
            self.assertTrue((Path(tmp) / "jrc_2025.v.png").exists())
