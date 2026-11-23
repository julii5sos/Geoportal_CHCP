"""Rutas de menor costo hacia el Corredor Mesoamericano (rutas_corredor.js)."""
import json
import shutil
import subprocess
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")


@unittest.skipUnless(NODE, "node no disponible")
class RutasCorredorJsTests(unittest.TestCase):
    def ejecutar(self, codigo: str):
        script = f"const R = require({json.dumps(str(RAIZ / 'webapp/static/js/rutas_corredor.js'))});\n{codigo}"
        salida = subprocess.run([NODE, "-"], input=script, capture_output=True, text=True, check=True)
        return json.loads(salida.stdout)

    def test_clasificacion_de_coberturas(self):
        r = self.ejecutar(
            "console.log(JSON.stringify(["
            "R.clasificar(1, 1, 255), R.clasificar(1, 2, 255), R.clasificar(2, 4, 255), R.clasificar(2, 6, 255),"
            "R.clasificar(2, 6, 7), R.clasificar(3, 1, 255), R.clasificar(255, 255, 255), R.clasificar(255, 5, 255)"
            "].map((c) => R.CLASES[c])));"
        )
        self.assertEqual(r, ["bosque", "bosque_degradado", "regeneracion", "otras_tierras",
                             "construido", "agua", "sin_dato", "agua"])

    def test_la_ruta_rodea_el_agua(self):
        # 10 × 5 de bosque con una columna de agua abierta solo en la fila inferior.
        r = self.ejecutar(
            "const w = 10, h = 5, n = w * h, sinia = new Uint8Array(n).fill(1);"
            "for (let y = 0; y < 4; y++) sinia[y * w + 5] = 3;"
            "const { clase, res } = R.superficie({ sinia }, n);"
            "const fuente = new Uint8Array(n); for (let y = 0; y < h; y++) fuente[y * w + 9] = 1;"
            "const { costo, previo } = R.costoAcumulado(res, w, h, fuente, 100);"
            "const parche = new Uint8Array(n); parche[0] = 1;"
            "const ruta = R.trazar(previo, R.mejorCelda(costo, parche));"
            "console.log(JSON.stringify({ ruta, resumen: R.resumir(ruta, clase, w, 100) }));"
        )
        self.assertIn(45, r["ruta"])  # cruza por la fila abierta (x = 5, y = 4)
        self.assertEqual(r["ruta"][0], 0)
        self.assertEqual(r["ruta"][-1] % 10, 9)
        self.assertEqual(r["resumen"]["km"]["agua"], 0)
        self.assertEqual(r["resumen"]["fuera_bosque_km"], 0)

    def test_fuera_de_la_cuenca_no_hay_paso(self):
        r = self.ejecutar(
            "const w = 5, h = 1, sinia = Uint8Array.from([1, 1, 255, 1, 1]);"
            "const { res } = R.superficie({ sinia }, w);"
            "const { costo } = R.costoAcumulado(res, w, h, Uint8Array.from([0, 0, 0, 0, 1]), 100);"
            "console.log(JSON.stringify(Array.from(costo, (c) => Number.isFinite(c))));"
        )
        self.assertEqual(r, [False, False, False, True, True])

    def test_tramos_fuera_del_bosque_y_franja(self):
        r = self.ejecutar(
            "const w = 7, h = 1, sinia = Uint8Array.from([1, 2, 2, 1, 2, 1, 1]);"
            "const { clase, res } = R.superficie({ sinia }, w);"
            "const a = R.costoAcumulado(res, w, h, Uint8Array.from([0, 0, 0, 0, 0, 0, 1]), 100);"
            "const p = R.costoAcumulado(res, w, h, Uint8Array.from([1, 0, 0, 0, 0, 0, 0]), 100);"
            "const ruta = R.trazar(a.previo, 0);"
            "const f = R.franja(p.costo, a.costo, a.costo[0], 0.1);"
            "console.log(JSON.stringify({ r: R.resumir(ruta, clase, w, 100), celdas: f.celdas }));"
        )
        self.assertEqual(r["r"]["tramos_fuera_bosque"], 2)
        self.assertAlmostEqual(r["r"]["longitud_km"], 0.6)
        self.assertAlmostEqual(r["r"]["fuera_bosque_km"], 0.3)
        self.assertEqual(r["celdas"], 7)  # en una sola fila la única ruta ocupa todas las celdas

    def test_reducir_toma_la_moda_y_rasterizar_rellena(self):
        r = self.ejecutar(
            "const v = Uint8Array.from([1, 1, 2, 2,  1, 3, 2, 255,  255, 255, 3, 3,  255, 255, 3, 1]);"
            "const red = R.reducir(v, 4, 4, 2);"
            "const cuadro = { type: 'Polygon', coordinates: [[[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]] };"
            "const m = R.rasterizar(cuadro, (x, y) => [x, y], 4, 4);"
            "console.log(JSON.stringify({ red: Array.from(red.v), m: Array.from(m) }));"
        )
        self.assertEqual(r["red"], [1, 2, 255, 3])
        self.assertEqual(r["m"], [0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0])


if __name__ == "__main__":
    unittest.main()
