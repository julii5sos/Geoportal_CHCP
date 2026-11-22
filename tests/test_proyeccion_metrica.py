"""Las distancias del motor de conectividad deben ser métricas e isótropas en la CHCP."""
import unittest

from pyproj import Geod

from chcp.nucleo.bosque_conectividad import analizar_fragmentacion_geojson
from chcp.nucleo.proyecciones import EPSG_HISTORICO_CONECTIVIDAD

GEOD = Geod(ellps="WGS84")


def cuadrado(lon, lat, lado_m=200):
    e = GEOD.fwd(lon, lat, 90, lado_m)[0]
    n = GEOD.fwd(lon, lat, 0, lado_m)[1]
    return [[lon, lat], [e, lat], [e, n], [lon, n], [lon, lat]]


def caso(azimut, separacion_m, epsg=None):
    lon0, lat0 = -79.8, 9.15
    a = cuadrado(lon0, lat0)
    # el segundo parche empieza a «separacion_m» del borde del primero
    if azimut == 0:
        lon1, lat1 = lon0, GEOD.fwd(lon0, a[2][1], 0, separacion_m)[1]
    else:
        lon1, lat1 = GEOD.fwd(a[1][0], lat0, 90, separacion_m)[0], lat0
    b = cuadrado(lon1, lat1)
    bosque = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {}, "geometry": {"type": "Polygon", "coordinates": [a]}},
        {"type": "Feature", "properties": {}, "geometry": {"type": "Polygon", "coordinates": [b]}}]}
    aoi = {"type": "Polygon", "coordinates": [[[-79.83, 9.12], [-79.76, 9.12], [-79.76, 9.19], [-79.83, 9.19], [-79.83, 9.12]]]}
    kw = {} if epsg is None else {"epsg_metrico": epsg}
    return analizar_fragmentacion_geojson(bosque, aoi, umbral_m=500, **kw)


class ProyeccionMetricaTests(unittest.TestCase):
    def test_umbral_isotropo_en_utm(self):
        for az in (0, 90):
            r = caso(az, 470)
            self.assertEqual(r["metricas_red"]["numero_componentes"], 1, az)
            self.assertAlmostEqual(r["metricas_red"]["distancia_media_conexiones_m"], 470, delta=2)
            self.assertEqual(r["crs_metrico"], "EPSG:32617")

    def test_equal_earth_distorsionaba_la_distancia(self):
        # 470 m reales norte–sur se medían como ~544 m: la conexión desaparecía.
        r = caso(0, 470, EPSG_HISTORICO_CONECTIVIDAD)
        self.assertEqual(r["metricas_red"]["numero_componentes"], 2)
        r = caso(90, 560, EPSG_HISTORICO_CONECTIVIDAD)  # 560 m este–oeste se medían como ~485 m
        self.assertEqual(r["metricas_red"]["numero_componentes"], 1)
