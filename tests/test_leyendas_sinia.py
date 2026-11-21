"""Integridad del diccionario SINIA: un código nunca cambia de significado entre años."""
import copy
import importlib.util
import json
import unittest
from pathlib import Path

from chcp.catalogos import leyendas_sinia as L
from chcp.catalogos.reclasificacion_sinia import GRUPOS_DERIVADOS, MASCARAS_FORESTALES, codigos_forestales, reclasificacion

RAIZ = Path(__file__).resolve().parents[1]


class CatalogoTests(unittest.TestCase):
    def test_ocho_assets_con_campos_obligatorios(self):
        cat = L.cargar_catalogo()
        self.assertEqual(len(cat), 8)
        for clave, ficha in cat.items():
            for campo in ("asset", "anio", "institucion", "tipo", "crs", "uso_analitico", "limitaciones", "fuentes"):
                self.assertIn(campo, ficha, f"{clave} sin {campo}")
            self.assertIn(clave, json.loads(L.ARCHIVO_LEYENDAS.read_text(encoding="utf-8"))["leyendas"])

    def test_raiz_de_assets_configurable(self):
        import os
        from unittest.mock import patch
        with patch.dict(os.environ, {"SINIA_ASSET_ROOT": "projects/otra/assets/"}):
            self.assertEqual(L.id_asset("2019_general"), "projects/otra/assets/SINIA_2019_COBERTURA_GENERAL_RASTER20M")


class CodigosTests(unittest.TestCase):
    def test_codigo_8_distinto_entre_1992_y_2000(self):
        self.assertEqual(L.categoria("1992_historico", 8)["estado"], "no_identificado")
        self.assertEqual(L.categoria("2000_historico", 8)["categoria"], "Uso agropecuario")
        self.assertNotEqual(L.categoria("1992_historico", 1)["categoria"], L.categoria("2000_historico", 1)["categoria"])

    def test_codigos_unicos_y_consecutivos(self):
        esperados = {"1992_historico": 11, "2000_historico": 10, "2012_binario": 2, "2012_detallado": 32,
                     "2019_general": 3, "2021_general": 3, "2021_detallado": 33, "2023_general": 3}
        for clave, n in esperados.items():
            codigos = [f["codigo"] for f in L.leyenda(clave)]
            self.assertEqual(codigos, list(range(1, n + 1)), clave)

    def test_2021_detallado_no_hereda_2012_ni_presenta_no_verificados_como_oficiales(self):
        for fila in L.leyenda("2021_detallado"):
            if fila["estado"] != "verificada_espacialmente":
                self.assertFalse(L.es_oficial(fila))
                self.assertTrue(fila["categoria"].startswith(f"Código {fila['codigo']}"))
        self.assertNotEqual(L.categoria("2021_detallado", 14)["categoria"], L.categoria("2012_detallado", 14)["categoria"])

    def test_vector_2021_usa_valor_textual_exacto(self):
        self.assertEqual(L.categoria("2021_general", 1)["categoria"], "Bosques y Otras Tierras Boscosas")

    def test_colores_propios_no_se_atribuyen_a_miambiente(self):
        for clave in L.cargar_catalogo():
            for fila in L.leyenda(clave):
                if fila["fuente_color"] != "propuesta_geoportal":
                    self.assertIn("MiAMBIENTE", fila["fuente_color"])
                self.assertRegex(fila["color"], r"^#[0-9A-Fa-f]{6}$")


class ReclasificacionTests(unittest.TestCase):
    def test_todos_los_grupos_existen(self):
        for clave in L.cargar_catalogo():
            for grupo in reclasificacion(clave).values():
                self.assertIn(grupo, GRUPOS_DERIVADOS)

    def test_mascaras_no_incluyen_rastrojos_ni_codigos_sin_identificar(self):
        for clave in MASCARAS_FORESTALES:
            grupos = reclasificacion(clave)
            for codigo in codigos_forestales(clave, incluir_opcionales=True):
                self.assertNotIn(grupos[codigo], {"rastrojo_arbustivo", "otra_vegetacion", "no_identificado", "cultivos", "pastos"})

    def test_mascaras_esperadas(self):
        self.assertEqual(codigos_forestales("1992_historico"), [2, 3, 4, 5])
        self.assertEqual(codigos_forestales("2000_historico"), [2, 3, 4, 5])
        self.assertEqual(codigos_forestales("2012_detallado"), [1, 2, 3, 4, 5, 6])
        self.assertEqual(codigos_forestales("2012_detallado", incluir_opcionales=True), list(range(1, 9)))
        self.assertEqual(codigos_forestales("2021_general"), [1])


class AplicarAuditoriaTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location("aplicar", RAIZ / "scripts" / "aplicar_auditoria_sinia.py")
        self.mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.mod)
        self.leyendas = copy.deepcopy(json.loads(L.ARCHIVO_LEYENDAS.read_text(encoding="utf-8")))

    def _auditoria(self, por_codigo, colores=None):
        return {"fecha": "2026-11-21", "assets": {"2021_detallado": {"correspondencia_rest": {
            "capa_rest": {"id": 1, "tipo": "raster"}, "por_codigo": por_codigo, "colores_servicio": colores or {}}}}}

    def test_verifica_con_acuerdo_suficiente_y_adopta_color_oficial(self):
        aud = self._auditoria({"27": {"categoria_mayoritaria": "Superficie de agua", "acuerdo_pct": 100.0,
                                      "distribucion": {"Superficie de agua": 10}}}, {"Superficie de agua": "0,112,255"})
        self.mod.aplicar(aud, self.leyendas, 80, 5)
        fila = next(f for f in self.leyendas["leyendas"]["2021_detallado"] if f["codigo"] == 27)
        self.assertEqual((fila["categoria"], fila["estado"], fila["color"]), ("Superficie de agua", "verificada_espacialmente", "#0070FF"))

    def test_no_verifica_con_poca_evidencia(self):
        aud = self._auditoria({"14": {"categoria_mayoritaria": "Café", "acuerdo_pct": 60.0,
                                      "distribucion": {"Café": 6, "Pasto": 4}}})
        cambios = self.mod.aplicar(aud, self.leyendas, 80, 5)
        fila = next(f for f in self.leyendas["leyendas"]["2021_detallado"] if f["codigo"] == 14)
        self.assertNotEqual(fila["estado"], "verificada_espacialmente")
        self.assertTrue(any("sin evidencia suficiente" in c for c in cambios))

    def test_avisa_si_difiere_del_orden_de_leyenda(self):
        aud = self._auditoria({"10": {"categoria_mayoritaria": "Pasto", "acuerdo_pct": 90.0, "distribucion": {"Pasto": 9, "Café": 1}}})
        cambios = self.mod.aplicar(aud, self.leyendas, 80, 5)
        self.assertTrue(any("ATENCIÓN" in c for c in cambios))
