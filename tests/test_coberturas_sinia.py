import unittest
from unittest.mock import patch

from chcp.gee.coberturas_sinia import ANIOS_DISPONIBLES, PRODUCTOS, construir_resumen
from chcp.catalogos.catalogo_assets_sinia import ASSETS_SINIA
from webapp.main import create_app


class ResumenSiniaTests(unittest.TestCase):
    def test_solo_productos_de_tres_categorias(self):
        self.assertEqual(ANIOS_DISPONIBLES, (2019, 2021, 2023))
        for producto in PRODUCTOS.values():
            self.assertEqual(len(ASSETS_SINIA[producto["clave"]]["leyenda"]), 3)

    def test_porcentajes_sobre_area_clasificada_y_bosque(self):
        grupos = [{"codigo": 1, "sum": 60.0}, {"codigo": 2, "sum": 30.0}, {"codigo": 3, "sum": 10.0}]
        resumen = construir_resumen(2021, grupos, 105.0)
        self.assertEqual(resumen["classified_ha"], 100.0)
        self.assertEqual(resumen["unclassified_or_nodata_ha"], 5.0)
        self.assertEqual(resumen["forest_ha"], 60.0)
        self.assertEqual(resumen["forest_pct"], 60.0)
        self.assertEqual([c["label"] for c in resumen["classes"]],
                         ["Bosques y Otras Tierras Boscosas", "Otras Tierras", "Aguas Continentales"])

    def test_codigos_ausentes_no_se_inventan(self):
        resumen = construir_resumen(2019, [{"codigo": 1, "sum": 5.0}, {"codigo": 9, "sum": 99.0}], 5.0)
        self.assertEqual(resumen["classified_ha"], 5.0)
        self.assertEqual(len(resumen["classes"]), 3)


class RutaSiniaTests(unittest.TestCase):
    def setUp(self):
        self.client = create_app(testing=True).test_client()

    @patch("webapp.main.run_sinia_coverages", return_value={"kind": "official_coverages_sinia"})
    def test_ruta_acepta_anios_validos(self, run):
        r = self.client.post("/api/v1/official-coverages/sinia", json={"area": {"mode": "basin"}, "years": [2019, 2023]})
        self.assertEqual(r.status_code, 200, r.get_data(as_text=True))
        self.assertEqual(run.call_args.args[0].years, [2019, 2023])

    def test_ruta_rechaza_anio_sin_tres_categorias(self):
        r = self.client.post("/api/v1/official-coverages/sinia", json={"area": {"mode": "basin"}, "years": [2012]})
        self.assertEqual(r.status_code, 400)


class CoberturasOficialesTests(unittest.TestCase):
    def setUp(self):
        self.client = create_app(testing=True).test_client()

    def test_pagina_y_catalogo_sin_earth_engine(self):
        html = self.client.get("/coberturas").get_data(as_text=True)
        for marker in ('id="cob-product"', 'id="cob-legend"', 'id="cob-swipe"', 'id="cob-csv"', "js/coberturas.js"):
            self.assertIn(marker, html)
        data = self.client.get("/api/v1/sinia/catalog").get_json()
        self.assertEqual(len(data["catalog"]), 8)
        self.assertEqual(len(data["comparability"]), 28)
        self.assertFalse(any(p["permite_transiciones"] for p in data["comparability"]))

    @patch("webapp.main.run_sinia_statistics", return_value={"kind": "sinia_statistics"})
    def test_estadisticas_aceptan_uno_o_dos_productos(self, run):
        ok = self.client.post("/api/v1/sinia/statistics", json={"area": {"mode": "basin"}, "products": ["1992_historico", "2000_historico"]})
        self.assertEqual(ok.status_code, 200)
        tres = self.client.post("/api/v1/sinia/statistics", json={"area": {"mode": "basin"}, "products": ["1992_historico", "2000_historico", "2019_general"]})
        self.assertEqual(tres.status_code, 400)
        raro = self.client.post("/api/v1/sinia/statistics", json={"area": {"mode": "basin"}, "products": ["projects/x"]})
        self.assertEqual(raro.status_code, 400)

    def test_estadisticas_separan_nodata_y_codigos_sin_leyenda(self):
        from chcp.gee.coberturas_sinia import construir_estadisticas
        r = construir_estadisticas("2012_detallado", [{"codigo": 1, "sum": 10}, {"codigo": 65535, "sum": 2}, {"codigo": 40, "sum": 1}], 20)
        self.assertEqual(r["classified_ha"], 10)
        self.assertEqual([(c["code"], c["is_documented_nodata"]) for c in r["codes_without_legend"]], [(40, False), (65535, True)])
        self.assertEqual(r["derived_groups"][0]["group"], "bosque_natural")
