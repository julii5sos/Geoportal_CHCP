"""Comprueba los estimadores con el ejemplo publicado en Olofsson et al. (2014), sección 5."""
import json
import shutil
import subprocess
import unittest
from pathlib import Path

from chcp.nucleo.validacion import asignar_muestra, evaluar, matriz_conteos, tamano_muestra

RAIZ = Path(__file__).resolve().parents[1]
CLASES = ["deforestacion", "ganancia", "bosque_estable", "no_bosque_estable"]
AREAS = {"deforestacion": 18_000, "ganancia": 13_500, "bosque_estable": 288_000, "no_bosque_estable": 580_500}
CONTEOS = [[66, 0, 5, 4], [0, 55, 8, 12], [1, 0, 153, 11], [2, 1, 9, 313]]


class OlofssonTests(unittest.TestCase):
    def setUp(self):
        self.r = evaluar(CLASES, AREAS, CONTEOS)
        self.c = {f["clase"]: f for f in self.r["por_clase"]}

    def test_exactitud_global(self):
        self.assertAlmostEqual(self.r["exactitud_global"], 0.947, places=3)
        self.assertAlmostEqual(self.r["exactitud_global_ic"], 0.018, places=3)

    def test_area_ajustada_publicada(self):
        # Olofsson et al. (2014): deforestación 21 158 ± 6 158 ha; ganancia 11 686 ± 3 756 ha
        self.assertAlmostEqual(self.c["deforestacion"]["area_ajustada"], 21_158, delta=1)
        self.assertAlmostEqual(self.c["deforestacion"]["area_ajustada_ic"], 6_158, delta=1)
        self.assertAlmostEqual(self.c["ganancia"]["area_ajustada"], 11_686, delta=1)
        self.assertAlmostEqual(self.c["ganancia"]["area_ajustada_ic"], 3_756, delta=1)
        self.assertAlmostEqual(sum(f["area_ajustada"] for f in self.r["por_clase"]), sum(AREAS.values()), delta=1e-6)

    def test_exactitudes_de_usuario_y_productor(self):
        d = self.c["deforestacion"]
        self.assertAlmostEqual(d["exactitud_usuario"], 0.88, places=2)
        self.assertAlmostEqual(d["exactitud_usuario_ic"], 0.07, places=2)
        self.assertAlmostEqual(d["exactitud_productor"], 0.75, places=2)
        self.assertAlmostEqual(d["exactitud_productor_ic"], 0.21, places=2)

    def test_tamano_y_asignacion(self):
        W = {c: a / sum(AREAS.values()) for c, a in AREAS.items()}
        n = tamano_muestra(W, {"deforestacion": .7, "ganancia": .6, "bosque_estable": .9, "no_bosque_estable": .95}, 0.01)
        self.assertEqual(n, 641)
        asignacion = asignar_muestra(n, AREAS, minimo=100)
        self.assertEqual(sum(asignacion.values()), n)
        self.assertEqual(asignacion["deforestacion"], 100)
        self.assertGreater(asignacion["no_bosque_estable"], asignacion["bosque_estable"])

    def test_matriz_desde_muestras(self):
        m = matriz_conteos([("a", "a"), ("a", "b"), ("b", "b"), ("x", "a")], ["a", "b"])
        self.assertEqual(m, [[1, 1], [0, 1]])

    @unittest.skipUnless(shutil.which("node"), "node no disponible")
    def test_version_navegador_igual(self):
        script = (f"const V = require({json.dumps(str(RAIZ / 'webapp/static/js/validacion_estimadores.js'))});"
                  f"console.log(JSON.stringify(V.evaluar({json.dumps(CLASES)}, {json.dumps(AREAS)}, {json.dumps(CONTEOS)})));")
        js = json.loads(subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True).stdout)
        self.assertAlmostEqual(js["exactitud_global"], self.r["exactitud_global"], places=12)
        self.assertAlmostEqual(js["exactitud_global_ic"], self.r["exactitud_global_ic"], places=12)
        for a, b in zip(js["por_clase"], self.r["por_clase"]):
            for k in ("exactitud_usuario", "exactitud_usuario_ic", "exactitud_productor", "exactitud_productor_ic", "area_ajustada", "area_ajustada_ic"):
                self.assertAlmostEqual(a[k], b[k], places=6, msg=k)


class EvaluarCarpetaTests(unittest.TestCase):
    def test_evalua_muestra_interpretada(self):
        import csv
        import importlib.util
        import tempfile

        spec = importlib.util.spec_from_file_location("ev", RAIZ / "scripts" / "evaluar_validacion.py")
        ev = importlib.util.module_from_spec(spec); spec.loader.exec_module(ev)
        with tempfile.TemporaryDirectory() as tmp:
            carpeta = Path(tmp) / "senal_perdida"; carpeta.mkdir()
            leyenda = [{"codigo": 1, "clave": "perdida", "etiqueta": "Pérdida"}, {"codigo": 2, "clave": "bosque", "etiqueta": "Bosque"}]
            (carpeta / "diseno.json").write_text(json.dumps({"mapa": "senal_perdida", "titulo": "t", "leyenda": leyenda, "areas_ha": {"1": 100, "2": 900}}))
            filas = [("P1", 1, "perdida"), ("P2", 1, "2"), ("P3", 1, "Pérdida"), ("P4", 2, "bosque"), ("P5", 2, "bosque"), ("P6", 2, "")]
            with (carpeta / "estratos.csv").open("w", newline="") as f:
                w = csv.writer(f); w.writerow(["id", "clase_mapa"]); [w.writerow([i, c]) for i, c, _ in filas]
            with (carpeta / "muestra.csv").open("w", newline="") as f:
                w = csv.writer(f); w.writerow(["id", "lon", "lat", "clase_referencia"]); [w.writerow([i, 0, 0, r]) for i, _, r in filas]
            ev.evaluar_carpeta(carpeta)
            r = json.loads((carpeta / "resultados.json").read_text())
            self.assertEqual(r["interpretados"], 5)
            self.assertAlmostEqual(r["resultado"]["por_clase"][0]["exactitud_usuario"], 2 / 3)
            self.assertFalse(r["completo"])


class ControlCalidadTests(unittest.TestCase):
    def test_desacuerdos_sin_evidencia_y_estado(self):
        import csv
        import importlib.util
        import tempfile

        spec = importlib.util.spec_from_file_location("ev2", RAIZ / "scripts" / "evaluar_validacion.py")
        ev = importlib.util.module_from_spec(spec); spec.loader.exec_module(ev)
        with tempfile.TemporaryDirectory() as tmp:
            carpeta = Path(tmp) / "m"; carpeta.mkdir()
            leyenda = [{"codigo": 1, "clave": "perdida", "etiqueta": "Pérdida"}, {"codigo": 2, "clave": "bosque", "etiqueta": "Bosque"}]
            (carpeta / "diseno.json").write_text(json.dumps({"mapa": "m", "titulo": "t", "leyenda": leyenda, "areas_ha": {"1": 100, "2": 900}}))
            # id, estrato, ref1, ref2, final
            filas = [("P1", 1, "1", "1", ""), ("P2", 1, "1", "2", ""), ("P3", 1, "1", "", ""), ("P4", 2, "2", "", ""),
                     ("P5", 2, "0", "", ""), ("P6", 2, "2", "1", "2"), ("P7", 1, "2", "", "")]
            with (carpeta / "estratos.csv").open("w", newline="") as f:
                w = csv.writer(f); w.writerow(["id", "clase_mapa"]); [w.writerow([i, e]) for i, e, *_ in filas]
            with (carpeta / "muestra.csv").open("w", newline="") as f:
                w = csv.writer(f); w.writerow(["id", "lon", "lat", "clase_referencia", "clase_referencia_2", "clase_final", "fecha_imagen"])
                [w.writerow([i, 0, 0, a, b, c, "2025-01-10"]) for i, _, a, b, c in filas]
            ev.evaluar_carpeta(carpeta)
            r = json.loads((carpeta / "resultados.json").read_text())
            qc = r["control_calidad"]
            self.assertEqual(qc["desacuerdos_pendientes"], 1)          # P2
            self.assertEqual(qc["sin_evidencia_excluidos"], 1)         # P5
            self.assertEqual(qc["revisados_segundo_interprete"], 3)    # P1, P2, P6
            self.assertEqual(r["interpretados"], 5)                    # P1, P3, P4, P6 (resuelto), P7
            self.assertEqual(r["estado"], "preliminar")                # desacuerdo pendiente
