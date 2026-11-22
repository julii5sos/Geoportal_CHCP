import unittest

import networkx as nx
from shapely.geometry import box

from chcp.nucleo.metricas_paisaje import (
    area_nucleo, cohesion, distancia_vecino_mas_cercano, indice_integral_conectividad, resumen_paisaje,
)


class AreaNucleoTests(unittest.TestCase):
    def test_cuadrado_de_1_km_con_borde_de_100_m(self):
        r = area_nucleo([box(0, 0, 1000, 1000)], [100])
        fila = r["por_profundidad"][0]
        self.assertAlmostEqual(fila["area_nucleo_ha"], 64.0, places=3)   # 800 m × 800 m
        self.assertAlmostEqual(fila["porcentaje_bosque_nucleo"], 64.0, places=3)

    def test_parche_estrecho_no_tiene_nucleo(self):
        r = area_nucleo([box(0, 0, 150, 2000)], [100])
        self.assertEqual(r["por_profundidad"][0]["area_nucleo_ha"], 0.0)
        self.assertEqual(r["por_profundidad"][0]["parches_sin_nucleo"], 1)


class EnnCohesionTests(unittest.TestCase):
    def test_enn_borde_a_borde(self):
        r = distancia_vecino_mas_cercano([box(0, 0, 100, 100), box(300, 0, 400, 100), box(2000, 0, 2100, 100)])
        self.assertEqual(sorted(r["distancias_m"]), [200.0, 200.0, 1600.0])

    def test_cohesion_mayor_con_parches_compactos(self):
        compacto = cohesion([box(0, 0, 1000, 1000)], 1000)
        fragmentado = cohesion([box(i * 200, 0, i * 200 + 50, 50) for i in range(20)], 1000)
        self.assertGreater(compacto, fragmentado)
        self.assertLessEqual(compacto, 100)


class IicTests(unittest.TestCase):
    def test_valores_conocidos(self):
        g = nx.Graph()
        g.add_edge(0, 1)
        r = indice_integral_conectividad(g, {0: 1.0, 1: 1.0}, 10.0, nx=nx)
        self.assertAlmostEqual(r["iic"], 0.03)
        self.assertAlmostEqual(r["diic"][0]["diic_pct"], 66.6667, places=3)

    def test_parche_puente_tiene_mayor_diic(self):
        g = nx.Graph()
        g.add_edges_from([(0, 1), (1, 2)])
        r = indice_integral_conectividad(g, {0: 5.0, 1: 1.0, 2: 5.0}, 100.0, nx=nx)
        puente = next(x for x in r["diic"] if x["indice"] == 1)
        self.assertGreater(puente["diic_pct"], 30)

    def test_resumen_completo(self):
        parches = [box(0, 0, 1000, 1000), box(1200, 0, 2200, 1000)]
        g = nx.Graph()
        g.add_nodes_from([0, 1])
        g.add_edge(0, 1)
        r = resumen_paisaje(parches, g, 1000.0, nx=nx, umbral_m=500)
        for clave in ("area_nucleo_ha", "enn_medio_m", "cohesion", "iic", "diic_principales"):
            self.assertIn(clave, r)
        self.assertEqual(r["enn_medio_m"], 200.0)
