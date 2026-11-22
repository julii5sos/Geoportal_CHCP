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
        self.assertEqual(L.categoria("2000_historico", 8)["categoria"].lower(), "uso agropecuario")
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
        # Código 14: «Café» verificado en 2021; en 2012 el servicio lo contradice.
        self.assertEqual(L.categoria("2021_detallado", 14)["categoria"], "Café")
        self.assertEqual(L.categoria("2012_detallado", 14)["estado"], "discrepante_con_servicio")

    def test_auditoria_2026_11_21_verifica_los_18_codigos_2021_presentes_en_la_chcp(self):
        verificados = [f["codigo"] for f in L.leyenda("2021_detallado") if f["estado"] == "verificada_espacialmente"]
        self.assertEqual(verificados, [1, 2, 3, 7, 8, 9, 10, 11, 12, 14, 23, 24, 25, 26, 27, 28, 29, 30])
        self.assertEqual(L.categoria("2021_detallado", 26)["categoria"], "Pasto")
        self.assertEqual(L.categoria("2021_detallado", 27)["color"], "#80F1E6")
        self.assertIn("MiAMBIENTE", L.categoria("2021_detallado", 27)["fuente_color"])

    def test_discrepancias_2012_no_se_muestran_como_oficiales(self):
        fila = L.categoria("2012_detallado", 21)
        self.assertEqual(fila["estado"], "discrepante_con_servicio")
        self.assertFalse(L.es_oficial(fila))
        self.assertNotIn("Horticultura", fila["categoria"])

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
        # 2012 detallado: los códigos 3–7 resultaron discrepantes con el servicio oficial
        # (auditoría 2026-11-21) y salen de la máscara hasta resolverse.
        self.assertEqual(codigos_forestales("2012_detallado"), [1, 2])
        self.assertEqual(codigos_forestales("2012_detallado", incluir_opcionales=True), [1, 2, 8])
        self.assertEqual(codigos_forestales("2021_detallado"), [1, 2, 3, 4, 5, 6])
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
        aud = self._auditoria({"4": {"categoria_mayoritaria": "Bosque de orey", "acuerdo_pct": 60.0,
                                     "distribucion": {"Bosque de orey": 6, "Pasto": 4}}})
        cambios = self.mod.aplicar(aud, self.leyendas, 80, 5)
        fila = next(f for f in self.leyendas["leyendas"]["2021_detallado"] if f["codigo"] == 4)
        self.assertNotEqual(fila["estado"], "verificada_espacialmente")
        self.assertTrue(any("sin evidencia suficiente" in c for c in cambios))

    def test_avisa_si_difiere_del_orden_de_leyenda(self):
        aud = self._auditoria({"10": {"categoria_mayoritaria": "Pasto", "acuerdo_pct": 90.0, "distribucion": {"Pasto": 9, "Café": 1}}})
        cambios = self.mod.aplicar(aud, self.leyendas, 80, 5)
        self.assertTrue(any("ATENCIÓN" in c for c in cambios))


class IdentifyArcGISTests(unittest.TestCase):
    def test_atributos_con_prefijo_y_colores_0_1(self):
        spec = importlib.util.spec_from_file_location("auditar", RAIZ / "scripts" / "auditar_assets_sinia.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        r = mod.interpretar_identify({"UniqueValue.Pixel Value": "1", "Raster.Red": "0", "Raster.Green": "0.345098",
                                      "Raster.Blue": "0", "Raster.Categoría": "Bosque latifoliado mixto maduro"})
        self.assertEqual((r["categoria"], r["valor_servicio"], r["rgb"]), ("Bosque latifoliado mixto maduro", "1", [0, 88, 0]))
        r2 = mod.interpretar_identify({"Classvalue": "27", "Class_name": "Superficie de agua", "Red": "0", "Green": "112", "Blue": "255"})
        self.assertEqual((r2["categoria"], r2["valor_servicio"], r2["rgb"]), ("Superficie de agua", "27", [0, 112, 255]))
        r3 = mod.interpretar_identify({"UniqueValue.Pixel Value": "1", "Raster.Categoría": "1",
                                       "Raster.Class_name": "Bosque latifoliado mixto maduro", "Raster.Red": "0", "Raster.Green": "88", "Raster.Blue": "0"})
        self.assertEqual((r3["categoria"], r3["rgb"]), ("Bosque latifoliado mixto maduro", [0, 88, 0]))


class DiscrepanciaTests(unittest.TestCase):
    def test_codigo_que_el_servicio_asigna_a_otro_valor_no_se_verifica(self):
        spec = importlib.util.spec_from_file_location("aplicar2", RAIZ / "scripts" / "aplicar_auditoria_sinia.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        leyendas = copy.deepcopy(json.loads(L.ARCHIVO_LEYENDAS.read_text(encoding="utf-8")))
        aud = {"fecha": "x", "assets": {"2012_detallado": {"correspondencia_rest": {"capa_rest": {"id": 2, "tipo": "raster"}, "colores_servicio": {},
               "por_codigo": {"21": {"categoria_mayoritaria": "Superficie de agua", "acuerdo_pct": 90.0, "distribucion": {"Superficie de agua": 9, "Pasto": 1}, "valor_servicio": {"27": 9, "2": 1}},
                              "26": {"categoria_mayoritaria": "Pasto", "acuerdo_pct": 100.0, "distribucion": {"Pasto": 10}, "valor_servicio": {"26": 10}}}}}}}
        mod.aplicar(aud, leyendas, 80, 5)
        filas = {f["codigo"]: f for f in leyendas["leyendas"]["2012_detallado"]}
        self.assertEqual(filas[21]["estado"], "discrepante_con_servicio")
        self.assertNotIn("Horticultura", filas[21]["categoria"])
        self.assertEqual(filas[21]["grupo_derivado"], "no_identificado")
        self.assertEqual((filas[26]["estado"], filas[26]["categoria"]), ("verificada_espacialmente", "Pasto"))


class DocumentosGeneradosTests(unittest.TestCase):
    def test_diccionario_y_validacion_estan_actualizados(self):
        import tempfile
        from unittest.mock import patch
        spec = importlib.util.spec_from_file_location("gen", RAIZ / "scripts" / "generar_diccionario_sinia.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        with tempfile.TemporaryDirectory() as tmp:
            d, v = Path(tmp) / "d.md", Path(tmp) / "v.md"
            with patch.object(mod, "SALIDA", d), patch.object(mod, "SALIDA_VALIDACION", v):
                mod.main()
            self.assertEqual(d.read_text(encoding="utf-8"), (RAIZ / "docs" / "DICCIONARIO_CAPAS_SINIA.md").read_text(encoding="utf-8"),
                             "Ejecute: python scripts/generar_diccionario_sinia.py")
            self.assertEqual(v.read_text(encoding="utf-8"), (RAIZ / "docs" / "VALIDACION_ASSETS_GEE.md").read_text(encoding="utf-8"))
