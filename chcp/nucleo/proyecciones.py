"""Sistemas de referencia para medir en la CHCP.

* ``EPSG_METRICO`` (WGS 84 / UTM 17N, conforme): distancias, perímetros, bordes,
  buffers y umbrales entre parches. En la CHCP (79,2°–80,2° O) el factor de escala
  UTM está entre 0,9996 y 0,9999: error de distancia < 0,04 % y de área < 0,08 %.
* ``EPSG_AREA`` (Equal Earth, equivalente): superficies. No sirve para distancias:
  a 9° N deforma +15,8 % en dirección norte–sur y −13,4 % en este–oeste
  (``docs/auditoria/E_COHERENCIA_ECOLOGICA.md``).

``EPSG_HISTORICO_CONECTIVIDAD`` conserva la proyección usada hasta la versión
MT-2026.7 del motor de conectividad, solo para reproducir resultados antiguos.
"""

EPSG_METRICO = 32617
EPSG_AREA = 8857
EPSG_HISTORICO_CONECTIVIDAD = 8857
