"""El análisis de polígonos del navegador aplica exactamente las reglas MT-2026.7 de Python."""
import json
import random
import shutil
import subprocess
import unittest
from pathlib import Path

from chcp.nucleo import metodologia_indice as mi

RAIZ = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")
MODULO = json.dumps(str(RAIZ / "webapp/static/js/analisis_poligono.js"))


@unittest.skipUnless(NODE, "node no disponible")
class AnalisisPoligonoJsTests(unittest.TestCase):
    def node(self, codigo):
        salida = subprocess.run([NODE, "-"], input=f"const P = require({MODULO});\n{codigo}", capture_output=True, text=True, check=True)
        return json.loads(salida.stdout)

    def test_parametros_identicos(self):
        r = self.node("console.log(JSON.stringify({u: P.UMBRALES, p: P.PESOS, v: P.VISITA}))")
        for k, v in r["u"].items():
            self.assertEqual(v, mi.UMBRALES_INDICE[k], k)
        self.assertEqual(r["p"], mi.PESOS_INDICE)
        for k, v in r["v"].items():
            self.assertEqual(v, mi.REGLAS_PRIORIDAD_VISITA[k], k)

    def test_senales_puntaje_consistencia_y_visita_iguales(self):
        aleatorio = random.Random(11)
        casos = []
        for _ in range(300):
            m = {k: aleatorio.choice([0, aleatorio.uniform(0, 3), aleatorio.uniform(0, 30)]) for k in (
                "tmf_deforestacion_ha", "tmf_deforestacion_pct", "tmf_degradacion_ha", "tmf_degradacion_pct",
                "hansen_post_2020_ha", "esri_salida_arboles_ha", "esri_salida_arboles_pct", "gedi_altura_media_m",
                "linea_base_arborea_pct", "ndvi_disminucion_ha", "ndvi_disminucion_pct",
                "tmf_recuperacion_ha", "tmf_recuperacion_pct", "esri_ganancia_arboles_ha", "esri_ganancia_arboles_pct")}
            m["gedi_cobertura_valida_pct"] = aleatorio.uniform(0, 100)
            m["ndvi_cobertura_valida_pct"] = aleatorio.uniform(0, 100)
            corredor = {"intersecta": aleatorio.random() < 0.6, "porcentaje_aoi_en_corredores": aleatorio.uniform(0, 60),
                        "intersecta_mesoamericano": aleatorio.random() < 0.3}
            casos.append({"m": m, "c": corredor})
        js = self.node(f"const casos = {json.dumps(casos)};"
                       "console.log(JSON.stringify(casos.map(({m, c}) => { const s = P.evaluarSenales(m); const i = P.indice(s.senales);"
                       " return {s: s.senales, p: i.puntaje, pr: i.prioridad, co: P.consistencia(s.senales, m).nivel, v: P.prioridadVisita(i.puntaje, c, null)}; })));")
        for caso, r in zip(casos, js):
            m = caso["m"]
            senales, _ = mi.evaluar_senales(**{k: m[k] for k in (
                "tmf_deforestacion_ha", "tmf_deforestacion_pct", "tmf_degradacion_ha", "tmf_degradacion_pct",
                "hansen_post_2020_ha", "esri_salida_arboles_ha", "esri_salida_arboles_pct", "gedi_altura_media_m",
                "gedi_cobertura_valida_pct", "linea_base_arborea_pct", "ndvi_disminucion_ha", "ndvi_disminucion_pct",
                "ndvi_cobertura_valida_pct")})
            self.assertEqual(r["s"], senales)
            _, puntaje, prioridad = mi.calcular_indice_prioridad(
                senal_tmf=senales["tmf"], senal_hansen=senales["hansen"], senal_esri=senales["esri"],
                senal_gedi=senales["gedi"], senal_ndvi=senales["ndvi"])
            self.assertEqual((r["p"], r["pr"]), (puntaje, prioridad))
            cons = mi.evaluar_consistencia(senal_tmf=senales["tmf"], senal_hansen=senales["hansen"], senal_esri=senales["esri"],
                                           tmf_recuperacion_ha=m["tmf_recuperacion_ha"], tmf_recuperacion_pct=m["tmf_recuperacion_pct"],
                                           esri_ganancia_arboles_ha=m["esri_ganancia_arboles_ha"], esri_ganancia_arboles_pct=m["esri_ganancia_arboles_pct"])
            self.assertEqual(r["co"], cons["nivel"])
            visita = mi.calcular_prioridad_visita(puntaje_cambios=puntaje, contexto_corredores=caso["c"])
            self.assertEqual(r["v"]["prioridad_visita"], visita["prioridad_visita"])
            self.assertAlmostEqual(r["v"]["puntaje_integrado"], visita["puntaje_integrado"])
            self.assertEqual(r["v"]["combinacion_territorial"], visita["combinacion_territorial"])

    def test_acumulacion_y_area(self):
        r = self.node(
            "const codec = {jrc_2025:{tipo:'categorias'}, hansen:{tipo:'categorias'}, esri_cambio:{tipo:'categorias'}, sinia_2021:{tipo:'categorias'},"
            " coincidencia:{tipo:'categorias'}, riparia:{tipo:'categorias'}, eri:{tipo:'continuo',minimo:0,paso:0.004}, ndvi_cambio:{tipo:'continuo',minimo:-1,paso:0.008}, gedi:{tipo:'continuo',minimo:0,paso:0.25}};"
            "const capas = {aux: Uint8Array.from([1|2|4|8, 2, 255, 0]), jrc_2025: Uint8Array.from([3, 1, 255, 2]), hansen: Uint8Array.from([22, 255, 255, 255]),"
            " esri_cambio: Uint8Array.from([1, 3, 255, 255]), gedi: Uint8Array.from([20, 255, 255, 255]), eri: Uint8Array.from([125, 250, 255, 0])};"
            "const acc = P.acumular(P.nuevoAcumulador(), capas, Uint8Array.from([1, 1, 1, 0]), Uint8Array.from([2, 0, 0, 0]), 0.09, codec);"
            "const e = P.evaluar(acc, null);"
            "const cuadrado = {type:'Polygon', coordinates:[[[-79.5,9],[-79.49,9],[-79.49,9.01],[-79.5,9.01],[-79.5,9]]]};"
            "console.log(JSON.stringify({area: acc.area_ha, defor: acc.jrc[3], hansen: e.metricas.hansen_post_2020_ha, gedi: e.metricas.gedi_altura_media_m,"
            " eri: e.eri_medio, corr: e.corredores, ha: P.areaHa(cuadrado)}));")
        self.assertAlmostEqual(r["area"], 0.18)
        self.assertAlmostEqual(r["defor"], 0.09)
        self.assertAlmostEqual(r["hansen"], 0.09)
        self.assertAlmostEqual(r["gedi"], 5.0)
        self.assertAlmostEqual(r["eri"], 0.75)
        self.assertTrue(r["corr"]["intersecta_mesoamericano"])
        self.assertAlmostEqual(r["corr"]["porcentaje_aoi_en_corredores"], 50.0)
        self.assertAlmostEqual(r["ha"], 121.9, delta=1.5)
