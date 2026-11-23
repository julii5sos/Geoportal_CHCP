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

    def test_replica_python_igual_al_navegador(self):
        import numpy as np
        from chcp.gee.mapas_ficha import CODIFICACION_VALORES as codec
        from chcp.nucleo import estimacion_local as EL

        rnd = np.random.default_rng(3)
        n = 400
        capas = {"aux": rnd.choice([0, 1, 3, 7, 15, 255], n).astype("uint8"),
                 "jrc_2025": rnd.choice([1, 2, 3, 4, 255], n).astype("uint8"),
                 "hansen": rnd.choice([21, 23, 255], n).astype("uint8"),
                 "esri_cambio": rnd.choice([1, 2, 3, 255], n).astype("uint8"),
                 "eri": rnd.integers(0, 256, n).astype("uint8"),
                 "gedi": rnd.integers(0, 256, n).astype("uint8")}
        masc = rnd.choice([0, 1], n).astype("uint8")
        py = EL.metricas(EL.acumular(EL.nuevo_acumulador(), capas, masc, None, 0.09, codec))
        js = self.node(f"const codec = {json.dumps(codec)};"
                       f"const capas = {json.dumps({k: v.tolist() for k, v in capas.items()})};"
                       "for (const k in capas) capas[k] = Uint8Array.from(capas[k]);"
                       f"const acc = P.acumular(P.nuevoAcumulador(), capas, Uint8Array.from({json.dumps(masc.tolist())}), null, 0.09, codec);"
                       "console.log(JSON.stringify(P.metricas(acc)));")
        for k, v in py.items():
            self.assertAlmostEqual(js[k], v, places=6, msg=k)


@unittest.skipUnless(NODE, "node no disponible")
class FragmentacionYMascaraTests(unittest.TestCase):
    def node(self, codigo):
        salida = subprocess.run([NODE, "-"], input=f"const P = require({MODULO});\n{codigo}", capture_output=True, text=True, check=True)
        return json.loads(salida.stdout)

    def test_fragmentacion_poligono(self):
        # Bosque de 200 × 200 m (celdas de 10 m); el polígono corta su mitad izquierda.
        r = self.node("""const w = 40, h = 40, b = new Uint8Array(w * h), d = new Uint8Array(w * h);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; b[i] = x >= 10 && x < 30 && y >= 10 && y < 30 ? 1 : 0; d[i] = x < 20 ? 1 : 0; }
            console.log(JSON.stringify({r: P.fragmentacion(b, d, w, h, 10), prof: P.PROFUNDIDADES_BORDE_M}));""")
        from chcp.nucleo.metricas_paisaje import PROFUNDIDADES_BORDE_M
        self.assertEqual(r["prof"], list(PROFUNDIDADES_BORDE_M))
        f = r["r"]
        self.assertAlmostEqual(f["area_ha"], 8.0)
        self.assertAlmostEqual(f["area_bosque_ha"], 2.0)
        self.assertEqual(f["numero_fragmentos"], 1)
        self.assertEqual(f["fragmentos_continuan_fuera"], 1)
        # El corte del polígono no es borde: 20 + 10 + 10 celdas de lado real.
        self.assertAlmostEqual(f["borde_m"], 400.0)
        nucleo = {x["profundidad_m"]: x["area_nucleo_ha"] for x in f["area_nucleo"]}
        # Igual que shapely: el núcleo a 50 m del cuadrado completo es 100 × 100 m; la mitad cae dentro.
        self.assertAlmostEqual(nucleo[50], 0.5)
        self.assertAlmostEqual(nucleo[100], 0.0)

    def test_sin_dato_no_es_borde_ni_area(self):
        r = self.node("""const w = 20, h = 10, b = new Uint8Array(w * h).fill(1), d = new Uint8Array(w * h).fill(1);
            for (let y = 0; y < h; y++) for (let x = 10; x < w; x++) b[y * w + x] = 2;
            console.log(JSON.stringify(P.fragmentacion(b, d, w, h, 10)));""")
        self.assertAlmostEqual(r["area_ha"], 1.0)
        self.assertAlmostEqual(r["borde_m"], 0.0)
        self.assertEqual(r["numero_fragmentos"], 1)

    def test_mascara_subcuenca_y_hansen(self):
        import numpy as np
        from chcp.gee.mapas_ficha import CODIFICACION_VALORES as codec
        from chcp.nucleo import estimacion_local as EL

        # Malla 10 × 10 sobre dos subcuencas: la mitad derecha no es de esta subcuenca y trae 0.
        limites = [[9.0, -79.8], [9.01, -79.79]]
        capas = {"aux": np.zeros(100, "uint8"), "hansen": np.full(100, 255, "uint8")}
        capas["hansen"][[0, 1]] = 23
        derecha = (np.arange(100) % 10) >= 5
        capas["hansen"][derecha] = 0
        poligono = {"type": "Polygon", "coordinates": [[[-79.8, 9.0], [-79.79, 9.0], [-79.79, 9.01], [-79.8, 9.01], [-79.8, 9.0]]]}
        sub = {"type": "Polygon", "coordinates": [[[-79.8, 9.0], [-79.795, 9.0], [-79.795, 9.01], [-79.8, 9.01], [-79.8, 9.0]]]}
        masc = EL.mascara(poligono, limites, 10, 10) & EL.mascara(sub, limites, 10, 10)
        acc = EL.acumular(EL.nuevo_acumulador(), capas, masc, None, 1.0, codec)
        sin = EL.acumular(EL.nuevo_acumulador(), capas, EL.mascara(poligono, limites, 10, 10), None, 1.0, codec)
        self.assertAlmostEqual(sin["area_ha"], 100.0)
        self.assertLessEqual(acc["area_ha"], 60.0)  # la subcuenca (5–6 columnas según el borde rasterizado)
        # Aunque se colara un píxel con 0, solo los años 2021–2025 cuentan como pérdida.
        self.assertAlmostEqual(EL.metricas(acc)["hansen_post_2020_ha"], 2.0)
        self.assertAlmostEqual(EL.metricas(sin)["hansen_post_2020_ha"], 2.0)
        js = self.node(f"const acc = P.nuevoAcumulador(); acc.hansen = {{0: 40, 23: 2}}; acc.area_ha = 50; console.log(JSON.stringify(P.metricas(acc)));")
        self.assertAlmostEqual(js["hansen_post_2020_ha"], 2.0)
