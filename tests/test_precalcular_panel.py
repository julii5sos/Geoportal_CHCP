import importlib.util
import unittest
from pathlib import Path

RUTA = Path(__file__).resolve().parents[1] / "scripts" / "precalcular_panel.py"
spec = importlib.util.spec_from_file_location("precalcular_panel", RUTA)
modulo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(modulo)


class PrecalculoPanelTests(unittest.TestCase):
    def test_lista_cuenca_y_53_subcuencas(self):
        territorios = modulo._territorios()
        self.assertEqual(len(territorios), 54)
        self.assertEqual(territorios[0]["id"], "chcp")
        self.assertEqual(len({t["id"] for t in territorios}), 54)

    def test_geometrycollection_de_earth_engine_no_rompe_el_guardado(self):
        g = {"type": "GeometryCollection", "geometries": [
            {"type": "Polygon", "coordinates": [[[0.123456789, 1], [1, 1], [1, 0], [0.123456789, 1]]]},
            {"type": "LineString", "coordinates": [[0, 0], [1, 1]]},
            {"type": "MultiPolygon", "coordinates": [[[[2, 2], [3, 2], [3, 3], [2, 2]]]]}]}
        r = modulo._geometria_redondeada(g)
        self.assertEqual(r["type"], "MultiPolygon")
        self.assertEqual(len(r["coordinates"]), 2)
        self.assertEqual(r["coordinates"][0][0][0][0], 0.12346)
        self.assertIsNone(modulo._geometria_redondeada(None))
        self.assertIsNone(modulo._geometria_redondeada({"type": "GeometryCollection", "geometries": []}))
        self.assertEqual(modulo._geometria_redondeada({"type": "Point", "coordinates": [1.0000001, 2]})["coordinates"], [1.0, 2])

    def test_tiempo_agotado_no_lo_absorben_los_except_exception(self):
        self.assertFalse(issubclass(modulo.TiempoAgotado, Exception))

    def test_compactar_conserva_indicadores_sin_geometrias(self):
        evaluacion = {
            "score": 4.0, "maximum_score": 6.5, "priority": "Alta",
            "signals": {"tmf": True}, "contributions": {"tmf": 2.0},
            "consistency": {"nivel": "Parcial", "fuentes_deterioro": ["JRC TMF"]},
            "visit_priority": {"prioridad_visita": "Alta", "puntaje_integrado": 5.0},
            "metrics": {"area_ha": 510.0, "tmf_estable": 300.0, "hansen_post": 2.1},
            "annual_series": [{"anio": 2020}],
        }
        estructura = {"metricas_clase": {"numero_parches": 6, "lista": [1]}, "metricas_red": {"numero_aristas": 9},
                      "parches_geojson": {"features": [1, 2]}, "conexion_corredor": {"conecta": True}}
        sinia = {"products": [{"year": 2021, "name": "x", "classified_ha": 1, "forest_ha": 1, "forest_pct": 100,
                               "unclassified_or_nodata_ha": 0, "classes": [], "asset": "no-se-guarda"}]}
        registro = modulo._compactar(modulo._territorios()[1], evaluacion, estructura, {"corredores": []}, sinia)
        self.assertEqual(registro["preevaluacion"]["puntaje"], 4.0)
        self.assertEqual(registro["estructura_2021"]["metricas_clase"], {"numero_parches": 6})
        self.assertNotIn("parches_geojson", registro["estructura_2021"])
        self.assertNotIn("asset", registro["sinia"][0])
