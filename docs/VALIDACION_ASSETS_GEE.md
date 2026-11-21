# Validación de los assets SINIA en Google Earth Engine

> Documento generado por `python scripts/generar_diccionario_sinia.py` a partir de `docs/validacion/auditoria_assets_sinia.json` (salida de `scripts/auditar_assets_sinia.py`).

- **Fecha de la auditoría:** 2026-11-21T18:40:08
- **Proyecto Earth Engine:** `geoportal-513817` · earthengine-api 1.7.53
- **Identidad:** credenciales locales del usuario (`earthengine authenticate`). Producción requiere repetir la prueba con la cuenta de servicio.
- **AOI de control:** Qda. Bonita · **inventario:** CHCP completa (no se ejecutan consultas nacionales).
- **Correspondencia espacial:** 10 puntos estratificados por código (semilla 2026) contra https://geoportal.miambiente.gob.pa/server/rest/services/Nodo_Suelos/MapServer.

## Resumen técnico

| Asset | Tipo | Banda · tipo de dato | Proyección · escala | Códigos en CHCP | Área enmascarada en CHCP | Correspondencia REST | Estado |
|---|---|---|---|---|---|---|---|
| `SINIA_1992_COBERTURA_HISTORICA_RASTER30M` | IMAGE | `b1` INT 0–255 | EPSG:32617 · 30 m | 1, 2, 3, 4, 6, 7, 9, 10 | 41,970 ha | 8 verificados · 0 discrepantes · 0 sin evidencia suficiente (de 8) | ✅ Auditado |
| `SINIA_2000_COBERTURA_HISTORICA_RASTER30M` | IMAGE | `b1` INT 0–255 | EPSG:32617 · 30 m | 1, 2, 3, 4, 6, 7, 8, 9 | 43,431 ha | 8 verificados · 0 discrepantes · 0 sin evidencia suficiente (de 8) | ✅ Auditado |
| `SINIA_2012_BOSQUE_BINARIO_RASTER5M` | IMAGE | `b1` INT 0–255 | EPSG:32617 · 5 m | 1, 2 | 0 ha | no aplica | ✅ Auditado |
| `SINIA_2012_USO_SUELO_RASTER5M` | IMAGE | `b1` INT 0–65535 | EPSG:32617 · 5 m | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30 | 0 ha | 12 verificados · 17 discrepantes · 1 sin evidencia suficiente (de 30) | ✅ Auditado |
| `SINIA_2019_COBERTURA_GENERAL_RASTER20M` | IMAGE | `b1` INT 0–255 | EPSG:32617 · 19.799712 m | 1, 2, 3 | 0 ha | no aplica | ✅ Auditado |
| `SINIA_2021_COBERTURA_GENERAL_VECTOR` | TABLE | campo `Categoria` | EPSG:4326 | Aguas Continentales, Bosques y Otras Tierras Boscosas, Otras Tierras | — | no aplica | ✅ Auditado |
| `SINIA_2021_USO_SUELO_RASTER10M` | IMAGE | `b1` INT 0–255 | EPSG:32617 · 10 m | 1, 2, 3, 7, 8, 9, 10, 11, 12, 14, 23, 24, 25, 26, 27, 28, 29, 30 | 0 ha | 18 verificados · 0 discrepantes · 0 sin evidencia suficiente (de 18) | ✅ Auditado |
| `SINIA_2023_COBERTURA_GENERAL_RASTER10M` | IMAGE | `b1` INT 0–255 | EPSG:32617 · 10 m | 1, 2, 3 | 0 ha | no aplica | ✅ Auditado |

## Hallazgos

### 1992 · Cobertura histórica de bosque y uso del suelo 1992

- Los 8 códigos presentes en la CHCP (1, 2, 3, 4, 6, 7, 9, 10) coinciden al 100 % con la capa vectorial oficial de 1992 del servicio REST (capa 4).
- Los códigos 5 (Manglar), 8 (sin documentar) y 11 (Vegetación baja inundable) no aparecen en la CHCP; el significado del código 8 sigue sin resolverse, pero no afecta a la cuenca.
- ≈ 41 970 ha de la CHCP están enmascaradas (NoData), una magnitud similar a la de los grandes lagos del Canal, mientras «Aguas interiores» solo cubre 2 941 ha (por confirmar visualmente). No interprete esas áreas como ausencia de bosque.

### 2000 · Cobertura histórica de bosque y uso del suelo 2000

- Los 8 códigos presentes en la CHCP (1, 2, 3, 4, 6, 7, 8, 9) coinciden al 100 % con la capa vectorial oficial de 2000 (capa 3). Se confirma que el código 8 es «Uso Agropecuario» en 2000.
- ≈ 43 431 ha enmascaradas en la CHCP, como en 1992.

### 2012 · Bosque / no bosque 2012

- Códigos 1 y 2 presentes; sin área enmascarada en la CHCP.
- El 100 % de los puntos «Bosque» cae en la clase forestal oficial 2021 y el 20 % de «No bosque» también (cambio o diferencias de definición).

### 2012 · Cobertura boscosa y uso del suelo 2012 (detallada)

- 30 códigos presentes en la CHCP. Solo 12 coinciden con el servicio REST oficial (capa 2) en categoría y valor de píxel: 1, 2, 8, 9, 10, 12, 23, 26, 27, 28, 29, 30.
- Los códigos 3–7, 13–22, 24 y 25 caen mayoritariamente en otra categoría oficial (p. ej., el 21 en «Superficie de agua» y el 17 en «Pasto»). La leyenda del catálogo previo no es fiable para esos códigos: se marcan como discrepantes y salen de las máscaras.
- Hipótesis a confirmar con el productor: el asset pudo rasterizarse con una tabla de códigos distinta a la del servicio para las clases poco frecuentes.

### 2019 · Cobertura general 2019

- Códigos 1–3 presentes, sin área enmascarada.
- El 90 % de los puntos de la clase 1 cae en el bosque oficial 2021; agua y otras tierras, 10 %.

### 2021 · Cobertura general oficial 2021 (vector)

- 28 288 entidades (10 994 bosque, 12 797 otras tierras, 4 497 agua); campos Area_ha, Categoria, ID_PARTE. Geometrías en EPSG:4326.
- En una muestra de 500 entidades hay 1 GeometryCollection y 1 LineString además de polígonos; el motor los descarta al construir parches.
- El motor de fragmentación en Qda. Bonita reproduce exactamente la validación del 2026-11-07: 6 parches, 9 aristas, 1 componente, 377.6973 ha.
- La categoría «Bosques y Otras Tierras Boscosas» incluye rastrojos: el 100 % de los puntos del código 9 (Rastrojo) del ráster 2021 cae en ella.

### 2021 · Cobertura boscosa y uso del suelo 2021 (detallada)

- Los 18 códigos presentes en la CHCP (1, 2, 3, 7, 8, 9, 10, 11, 12, 14, 23, 24, 25, 26, 27, 28, 29, 30) quedan verificados: el valor de píxel del asset coincide al 100 % con el valor oficial (Classvalue) del servicio REST (capa 1) y la categoría es la de su Class_name, con su color RGB oficial.
- En todos los códigos verificados el valor coincide con la posición en la leyenda oficial de 33 categorías, pero los 15 códigos ausentes de la CHCP (4–6, 13, 15–22, 31–33) se conservan como «no probados».

### 2023 · Cobertura general diagnóstica 2023

- Códigos 1–3 presentes, sin área enmascarada.
- El 100 % de los puntos de la clase 1 cae en el bosque oficial 2021; otras tierras, 10 %; agua, 0 %. Coherencia temática alta, no equivalencia metodológica.


## Detalle por asset


### 1992 · Cobertura histórica de bosque y uso del suelo 1992 — superficie en Qda. Bonita

| Código | Categoría | ha |
|---:|---|---:|
| 2 | Bosque Intervenido | 225.35 |
| 7 | Rastrojos (Bosque Pionero) | 190.12 |
| 9 | Uso Agropecuario | 77.89 |
| 10 | Uso Agropecuario de Subsistencia | 14.49 |

### 2000 · Cobertura histórica de bosque y uso del suelo 2000 — superficie en Qda. Bonita

| Código | Categoría | ha |
|---:|---|---:|
| 2 | Bosque Intervenido | 203.05 |
| 3 | Bosque Maduro | 137.87 |
| 7 | Rastrojos (Bosque Pionero) | 58.39 |
| 9 | Uso Agropecuario de Subsistencia | 108.54 |

### 2012 · Bosque / no bosque 2012 — superficie en Qda. Bonita

| Código | Categoría | ha |
|---:|---|---:|
| 1 | Bosque | 326.19 |
| 2 | No bosque | 181.70 |

### 2012 · Cobertura boscosa y uso del suelo 2012 (detallada) — superficie en Qda. Bonita

| Código | Categoría | ha |
|---:|---|---:|
| 1 | Bosque latifoliado mixto maduro | 6.53 |
| 2 | Bosque latifoliado mixto secundario | 249.94 |
| 8 | Bosque plantado de latifoliadas | 69.72 |
| 26 | Pasto | 160.29 |
| 28 | Área poblada | 21.42 |

### 2019 · Cobertura general 2019 — superficie en Qda. Bonita

| Código | Categoría | ha |
|---:|---|---:|
| 1 | Bosques y otras tierras boscosas | 403.24 |
| 2 | Otras tierras | 104.63 |

### 2021 · vector institucional

- Entidades: **28,288** · campos: Area_ha, Categoria, ID_PARTE, system:index.
- Entidades por categoría: {'Aguas Continentales': 4497, 'Bosques y Otras Tierras Boscosas': 10994, 'Otras Tierras': 12797}.
- Tipos de geometría en una muestra de 500 entidades: {'GeometryCollection': 1, 'LineString': 1, 'MultiPolygon': 3, 'Polygon': 495}. Las geometrías no poligonales se descartan en el motor al construir parches.
- Proyección de las geometrías: EPSG:4326.
- Motor de fragmentación en Qda. Bonita (500 m, 0 ha, contexto 500 m): 6 parches, 9 aristas, 1 componente(s), 377.6973 ha → **idéntico** a la validación del 2026-11-07.

### 2021 · Cobertura boscosa y uso del suelo 2021 (detallada) — superficie en Qda. Bonita

| Código | Categoría | ha |
|---:|---|---:|
| 2 | Bosque latifoliado mixto secundario | 317.97 |
| 8 | Bosque plantado de latifoliadas | 59.72 |
| 10 | Vegetación herbácea | 10.64 |
| 26 | Pasto | 105.31 |
| 27 | Superficie de agua | 1.93 |
| 28 | Área poblada | 6.88 |
| 29 | Infraestructura | 5.42 |

### 2023 · Cobertura general diagnóstica 2023 — superficie en Qda. Bonita

| Código | Categoría | ha |
|---:|---|---:|
| 1 | Bosques y otras tierras boscosas | 389.40 |
| 2 | Otras tierras | 116.19 |
| 3 | Superficie de agua | 2.29 |

## Pendientes

- Repetir la auditoría con la cuenta de servicio de producción antes de publicar (permisos de lectura de los ocho assets).
- Resolver con SINIA–MiAMBIENTE las discrepancias de códigos del ráster 2012 detallado.
- Verificar los códigos 2021 ausentes de la CHCP si el geoportal se amplía a otras cuencas.
- Recuperar la simbología oficial de 2019, 2023, 2012 binario y vector 2021 (hoy paleta propia).
