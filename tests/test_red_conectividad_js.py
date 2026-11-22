"""El simulador del navegador debe dar el mismo IIC que el motor de Python."""
import json
import random
import shutil
import subprocess
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")


@unittest.skipUnless(NODE, "node no disponible")
class RedConectividadJsTests(unittest.TestCase):
    def ejecutar(self, codigo: str):
        script = f"const R = require({json.dumps(str(RAIZ / 'webapp/static/js/red_conectividad.js'))});\n{codigo}"
        salida = subprocess.run([NODE, "-e", script], capture_output=True, text=True, check=True)
        return json.loads(salida.stdout)

    def test_iic_igual_que_python(self):
        import networkx as nx
        from chcp.nucleo.metricas_paisaje import indice_integral_conectividad

        aleatorio = random.Random(7)
        areas = {i: round(aleatorio.uniform(0.5, 80), 3) for i in range(1, 41)}
        aristas = [(a, b) for a in areas for b in areas if a < b and aleatorio.random() < 0.06]
        grafo = nx.Graph(); grafo.add_nodes_from(areas); grafo.add_edges_from(aristas)
        esperado = indice_integral_conectividad(grafo, areas, 5000.0, nx=nx)["iic"]
        r = self.ejecutar(
            f"const a = new Map(Object.entries({json.dumps(areas)}).map(([k, v]) => [Number(k), v]));"
            f"const x = R.analizar(a, {json.dumps(aristas)}, 5000);"
            "console.log(JSON.stringify({iic: x.iic, redes: x.redes, aislados: x.aislados}));"
        )
        self.assertAlmostEqual(r["iic"], esperado, places=7)  # Python redondea a 8 decimales
        self.assertEqual(r["redes"], nx.number_connected_components(grafo))
        self.assertEqual(r["aislados"], sum(1 for n in grafo if grafo.degree(n) == 0))

    def test_restaurar_brecha_une_redes_y_sube_iic(self):
        r = self.ejecutar(
            "const a = new Map([[1, 10], [2, 10], [3, 5]]);"
            "const base = R.analizar(a, [[1, 2]], 100);"
            "const c = R.priorizar(a, [[1, 2]], 100, [{a: 2, b: 3, d: 200}], 60);"
            "const nuevo = R.analizar(a, [[1, 2], [2, 3]], 100);"
            "console.log(JSON.stringify({base: base.redes, nuevo: nuevo.redes, sube: nuevo.iic > base.iic, ha: c[0].ha, unidas: c[0].redes_unidas}));"
        )
        self.assertEqual((r["base"], r["nuevo"]), (2, 1))
        self.assertTrue(r["sube"])
        self.assertAlmostEqual(r["ha"], 1.2)
        self.assertEqual(r["unidas"], 1)

    def test_punto_en_poligono_y_cercania_a_rio(self):
        r = self.ejecutar(
            "const pol = {type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,1],[0,0]]]};"
            "const rio = [{geometry: {type: 'LineString', coordinates: [[-79.5, 9.0], [-79.5, 9.01]]}}];"
            "console.log(JSON.stringify({dentro: R.puntoEnPoligono([0.5,0.5], pol), fuera: R.puntoEnPoligono([2,2], pol),"
            "cerca: R.cercaDeLineas([-79.4995, 9.005], rio, 100), lejos: R.cercaDeLineas([-79.49, 9.005], rio, 100)}));"
        )
        self.assertEqual(r, {"dentro": True, "fuera": False, "cerca": True, "lejos": False})
