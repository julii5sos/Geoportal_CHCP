"""Red ampliada del simulador: margen exterior, parches completos y aristas hasta 1 km."""
import unittest

try:
    from pyproj import Transformer
    from shapely.geometry import box, mapping
    from shapely.ops import transform
except ImportError:  # pragma: no cover
    Transformer = None


@unittest.skipUnless(Transformer, "pyproj/shapely no disponibles")
class RedSimulacionMargenTests(unittest.TestCase):
    def setUp(self):
        a_wgs = Transformer.from_crs(32617, 4326, always_xy=True).transform
        x0, y0 = 650_000, 1_000_000
        g = lambda geom: mapping(transform(a_wgs, geom))  # noqa: E731
        self.aoi = {"type": "Feature", "properties": {}, "geometry": g(box(x0, y0, x0 + 2000, y0 + 2000))}
        parches = [
            box(x0 + 100, y0 + 100, x0 + 600, y0 + 600),      # 1: dentro
            box(x0 + 1700, y0 + 800, x0 + 2400, y0 + 1200),   # 2: cruza la divisoria (40 ha en total)
            box(x0 + 2950, y0 + 800, x0 + 3250, y0 + 1200),   # 3: margen, a 550 m del 2 y a 950 m de la subcuenca
            box(x0 + 4500, y0 + 800, x0 + 4800, y0 + 1200),   # 4: fuera del margen (2,5 km)
        ]
        self.bosque = {"type": "FeatureCollection",
                       "features": [{"type": "Feature", "properties": {}, "geometry": g(p)} for p in parches]}

    def test_margen_y_aristas_ampliadas(self):
        from chcp.nucleo.bosque_conectividad import analizar_fragmentacion_geojson

        # Igual que el precálculo: contexto exterior de 5 km leído del asset.
        r = analizar_fragmentacion_geojson(self.bosque, self.aoi, umbral_m=500, incluir_contexto_exterior=True,
                                           radio_busqueda_corredor_m=5000)
        red = r["red_simulacion"]
        self.assertEqual(red["version"], 2)
        self.assertEqual(red["margen_m"], 1000)
        nodos = {n[0]: (n[1], n[2]) for n in red["nodos"]}
        areas = sorted(round(a, 1) for a, _ in nodos.values())
        # Parche dentro (25 ha), el que cruza completo (28 ha, no solo las 12 ha interiores) y el del margen (12 ha).
        self.assertEqual(areas, [12.0, 25.0, 28.0])
        self.assertEqual(sum(objetivo for _, objetivo in nodos.values()), 2)
        # Arista de 550 m: fuera del umbral de 500 m, pero dentro de la red ampliada (≤ 1 km).
        self.assertTrue(any(abs(d - 550) < 1 for _, _, d in red["aristas_ampliadas"]))
        self.assertFalse(any(abs(d - 550) < 1 for _, _, d in red["aristas"]))
        self.assertEqual(len(red["contexto_geojson"]["features"]), 1)
        # (2 km + 2 × 1 km)² menos las esquinas redondeadas: 1600 − (4 − π) × 100 ≈ 1514 ha.
        self.assertAlmostEqual(red["area_paisaje_margen_ha"], 1514.2, delta=3)
        # Las superficies publicadas de la subcuenca siguen recortadas (métrica oficial intacta).
        publicadas = sorted(round(f["properties"]["area_ha"], 1) for f in r["parches_geojson"]["features"])
        self.assertEqual(publicadas, [12.0, 25.0])


if __name__ == "__main__":
    unittest.main()
