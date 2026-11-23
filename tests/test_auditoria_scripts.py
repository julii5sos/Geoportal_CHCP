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
