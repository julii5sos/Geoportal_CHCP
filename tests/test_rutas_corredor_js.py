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


@unittest.skipUnless(NODE, "node no disponible")
class RiberaYDetalleJsTests(unittest.TestCase):
    ejecutar = RutasCorredorJsTests.ejecutar

    def test_clasificacion_con_detalle_y_ribera(self):
        # (sinia, jrc, esri, detalle, ribera)
        casos = [
            (1, 1, 255, 1, 4, "bosque_ribera"), (1, 1, 255, 1, 5, "bosque"), (1, 1, 255, 8, 1, "plantacion"),
            (1, 1, 255, 9, 255, "regeneracion"), (2, 6, 255, 26, 3, "ribera_sin_bosque"),
            (2, 6, 255, 26, 255, "otras_tierras"), (2, 6, 255, 28, 1, "construido"), (2, 6, 255, 27, 1, "agua"),
            (1, 2, 255, 2, 1, "bosque_degradado"),
        ]
        codigo = ",".join(f"R.CLASES[R.clasificar({a},{b},{c},{d},{e})]" for a, b, c, d, e, _ in casos)
        r = self.ejecutar(f"console.log(JSON.stringify([{codigo}]));")
        self.assertEqual(r, [x[-1] for x in casos])

    def test_la_ruta_prefiere_el_bosque_de_ribera(self):
        # 3 filas de bosque; la fila inferior es ribera. Con la misma longitud, la ruta va por ella.
        r = self.ejecutar(
            "const w = 8, h = 3, n = w * h, sinia = new Uint8Array(n).fill(1), ribera = new Uint8Array(n).fill(255);"
            "for (let x = 0; x < w; x++) ribera[2 * w + x] = 3;"
            "const { clase, res } = R.superficie({ sinia, ribera }, n);"
            "const f = new Uint8Array(n); f[1 * w + 7] = 1;"
            "const { costo, previo } = R.costoAcumulado(res, w, h, f, 30);"
            "const p = new Uint8Array(n); p[1 * w] = 1;"
            "const ruta = R.trazar(previo, R.mejorCelda(costo, p));"
            "console.log(JSON.stringify({ filas: ruta.map((i) => Math.floor(i / w)), km: R.resumir(ruta, clase, w, 30).km.bosque_ribera }));"
        )
        self.assertGreaterEqual(r["filas"].count(2), 4)
        self.assertGreater(r["km"], 0)

    def test_reducir_clases_conserva_riberas_y_composicion(self):
        r = self.ejecutar(
            # Bloque 4×4 de otras tierras con una franja de ribera sin bosque de 1 columna (25 %).
            "const C = R.C, v = new Uint8Array(16).fill(C.otras_tierras); for (let y = 0; y < 4; y++) v[y * 4 + 1] = C.ribera_sin_bosque;"
            "const red = R.reducirClases(v, 4, 4, 4);"
            "const clase = Uint8Array.from([C.bosque, C.otras_tierras, C.otras_tierras, C.construido]), cod = Uint8Array.from([1, 26, 255, 28]);"
            "const comp = R.composicion([0, 1, 2, 3], clase, cod, 4, 100);"
            "console.log(JSON.stringify({ red: R.CLASES[red.v[0]], comp }));"
        )
        self.assertEqual(r["red"], "ribera_sin_bosque")
        self.assertEqual(r["comp"], {"26": 0.1, "otras_tierras": 0.1, "28": 0.1})

    def test_remuestrear_toma_el_minimo(self):
        # Origen 4×4 con un cauce (1) en una sola celda; destino 2×2 sobre la misma extensión.
        r = self.ejecutar(
            "const lim = [[9, -80], [9.01, -79.99]], o = new Uint8Array(16).fill(255); o[1 * 4 + 1] = 1;"
            "console.log(JSON.stringify(Array.from(R.remuestrear(o, lim, 4, 4, lim, 2, 2))));"
        )
        self.assertEqual(r, [1, 255, 255, 255])
