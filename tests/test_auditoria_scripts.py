"""Los scripts de auditoría llaman a las funciones de Earth Engine con la firma correcta."""
import ast
import inspect
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]


class FirmasTests(unittest.TestCase):
    def test_inicializar_earth_engine_recibe_el_modulo(self):
        from chcp.gee.gee_config import inicializar_earth_engine

        obligatorios = [p for p in inspect.signature(inicializar_earth_engine).parameters.values()
                        if p.default is inspect.Parameter.empty and p.kind == p.POSITIONAL_OR_KEYWORD]
        for ruta in sorted((RAIZ / "scripts").rglob("*.py")):
            for nodo in ast.walk(ast.parse(ruta.read_text(encoding="utf-8"))):
                if isinstance(nodo, ast.Call) and getattr(nodo.func, "id", None) == "inicializar_earth_engine":
                    self.assertGreaterEqual(len(nodo.args) + len(nodo.keywords), len(obligatorios), f"{ruta.name}:{nodo.lineno}")


if __name__ == "__main__":
    unittest.main()


class Sinia2012PorPartesTests(unittest.TestCase):
    def setUp(self):
        import importlib.util
        from pathlib import Path
        ruta = Path(__file__).resolve().parents[1] / "scripts" / "auditoria" / "b_sinia_2012_controlado.py"
        spec = importlib.util.spec_from_file_location("b12", ruta)
        self.m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.m)

    def test_elegir_por_codigo_limita_y_es_reproducible(self):
        f = lambda c, x: {"geometry": {"coordinates": [x, 9.0 + c]}, "properties": {"codigo": c}}
        cand = [f(1, i * 0.001) for i in range(50)] + [f(2, i * 0.001) for i in range(5)] + [f(1, 0.0)]  # un duplicado
        a = self.m.elegir_por_codigo(cand, 30, 7)
        b = self.m.elegir_por_codigo(list(reversed(cand)), 30, 7)
        self.assertEqual(sum(1 for x in a if x["properties"]["codigo"] == 1), 30)
        self.assertEqual(sum(1 for x in a if x["properties"]["codigo"] == 2), 5)
        self.assertEqual([x["geometry"]["coordinates"] for x in a], [x["geometry"]["coordinates"] for x in b])

    def test_cuadrantes_cubren_la_caja(self):
        q = self.m.cuadrantes({"type": "MultiPolygon", "coordinates": [[[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]]]})
        self.assertEqual(len(q), 4)
        self.assertEqual(sorted({tuple(p) for c in q for p in c["coordinates"][0]}), sorted({(x, y) for x in (0, 1, 2) for y in (0, 1, 2)}))

    def test_muestreo_por_subcuenca(self):
        from pathlib import Path
        codigo = (Path(__file__).resolve().parents[1] / "scripts" / "auditoria" / "b_sinia_2012_controlado.py").read_text(encoding="utf-8")
        self.assertIn("coleccion_subcuencas()", codigo)
        self.assertNotIn("geometria_cuenca()", codigo)
