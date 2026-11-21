# Diccionario de capas SINIA–MiAMBIENTE

> **Referencia técnica del Geoportal CHCP.** Documento generado automáticamente con `python scripts/generar_diccionario_sinia.py` a partir de `data/catalogo_assets_sinia.json`, `data/leyendas_sinia.json` y la auditoría `docs/validacion/auditoria_assets_sinia.json`. No lo edite a mano: cambie los JSON con evidencia y vuelva a generarlo.

## Reglas de uso

1. **Un código solo tiene significado dentro de su producto.** El código 8 es «Sin categoría documentada» en 1992 y «Uso agropecuario» en 2000; el código 14 de 2012 no se hereda en 2021.
2. **Los datos originales no se modifican.** Toda agrupación usa el *grupo derivado* de cada código (ver `docs/RECLASIFICACION_ECOLOGICA.md`).
3. **Lo no verificado no se presenta como oficial.** Los códigos sin correspondencia verificada se muestran como «Código N».
4. **Colores:** «oficial MiAMBIENTE» procede de la simbología del servicio REST; «propuesta Geoportal» es una paleta propia y no se atribuye a MiAMBIENTE.
5. **Comparaciones entre años:** solo visuales y estadísticas independientes (ver `docs/COMPARABILIDAD_COBERTURAS.md`).

### Estados de verificación

| Estado | Significado |
|---|---|
| ✅ Verificada (espacial) (`verificada_espacialmente`) | Código comprobado por correspondencia espacial con el servicio oficial de MiAMBIENTE. |
| ✅ Verificada (atributo) (`verificada_valor_atributo`) | Valor textual leído directamente del atributo del asset vectorial. |
| 📘 Documentada (`documentada_catalogo_previo`) | Leyenda del catálogo previo del proyecto; no contradicha por la auditoría, pendiente de correspondencia espacial. |
| ⚠️ Solo grupo (`grupo_documentado_catalogo_previo`) | Solo se conoce el grupo (p. ej., bosque natural), no la categoría individual. |
| ⚠️ Sin verificar (`leyenda_oficial_sin_correspondencia`) | Existe un nombre en la leyenda oficial, pero no se ha probado qué código de píxel le corresponde. |
| ⛔ No identificado (`no_identificado`) | Código presente sin categoría documentada; no se asigna significado. |

Auditoría aplicada: **2026-11-21T18:29:19** · proyecto `geoportal-513817` · 10 puntos por código · servicio https://geoportal.miambiente.gob.pa/server/rest/services/Nodo_Suelos/MapServer.

## 1992 · Cobertura histórica de bosque y uso del suelo 1992

| Atributo | Valor |
|---|---|
| Asset | `projects/geoportal-513817/assets/SINIA_1992_COBERTURA_HISTORICA_RASTER30M` |
| Clave interna | `1992_historico` |
| Año | 1992 |
| Institución | SINIA – Ministerio de Ambiente de Panamá (MiAMBIENTE) |
| Tipo | Ráster (IMAGE) |
| Resolución | 30 m |
| Escala cartográfica | 1:250.000 |
| Proyección documentada | EPSG:32617 |
| Proyección y tipo verificados | EPSG:32617 · `b1` INT (máx. 255) · 30 m |
| Banda o campo temático | `b1` |
| NoData | 255 |
| Uso analítico | Caracterización histórica de cobertura; máscara forestal derivada para contexto estructural histórico. |
| Máscara forestal (fragmentación) | Códigos 2, 3, 4, 5. Bosque maduro, secundario maduro, intervenido y manglar. Se excluyen rastrojos (sucesión temprana) y el código 8 sin documentar. |
| Limitaciones | Escala 1:250.000: no apta para parches pequeños. El código 8 no tiene categoría documentada en el catálogo previo. Códigos no intercambiables con 2000. |
| Fuentes | julii5sos/geoportal-chcp-conectividad-ecologica · catalogo_assets_sinia.py (2026-11-07)<br>https://sinia.gob.pa/datos-abiertos-y-geoservicios/<br>https://geoportal.miambiente.gob.pa/server/rest/services/Nodo_Suelos/MapServer |
| Inventario en la CHCP | Códigos presentes: 1, 2, 3, 4, 6, 7, 9, 10 · área enmascarada 41,970 ha · escala 30.0 m |

| Código | Categoría | Grupo derivado | Color | Fuente del color | Estado | Evidencia | En CHCP |
|---:|---|---|---|---|---|---|---|
| 1 | Aguas interiores | Agua | `#BFE9FF` | oficial MiAMBIENTE | 📘 Documentada | REST: «Aguas Interiores» 100.0 % de 10 pts; 30.0 % en bosque 2021 | sí (2,941 ha) |
| 2 | Bosque intervenido | Bosque secundario o intervenido | `#A5FF75` | oficial MiAMBIENTE | 📘 Documentada | REST: «Bosque Intervenido» 100.0 % de 10 pts; 90.0 % en bosque 2021 | sí (45,672 ha) |
| 3 | Bosque maduro | Bosque natural | `#267300` | oficial MiAMBIENTE | 📘 Documentada | REST: «Bosque Maduro» 100.0 % de 10 pts; 100.0 % en bosque 2021 | sí (88,124 ha) |
| 4 | Bosque secundario maduro | Bosque secundario o intervenido | `#37A600` | oficial MiAMBIENTE | 📘 Documentada | REST: «Bosque Secundario Maduro» 100.0 % de 10 pts; 100.0 % en bosque 2021 | sí (50,071 ha) |
| 5 | Manglar | Bosque natural | `#8200A6` | oficial MiAMBIENTE | 📘 Documentada | catalogo_previo | no |
| 6 | Otros usos | Áreas intervenidas (pobladas, infraestructura, minería) | `#808080` | oficial MiAMBIENTE | 📘 Documentada | REST: «Otros Usos» 100.0 % de 10 pts; 40.0 % en bosque 2021 | sí (31 ha) |
| 7 | Rastrojos (bosque pionero) | Rastrojo y vegetación arbustiva | `#55FF00` | oficial MiAMBIENTE | 📘 Documentada | REST: «Rastrojos (Bosque Pionero)» 100.0 % de 10 pts; 70.0 % en bosque 2021 | sí (57,475 ha) |
| 8 | Sin categoría documentada | Código no identificado | `#BDBDBD` | propuesta Geoportal | ⛔ No identificado | catalogo_previo | no |
| 9 | Uso agropecuario | Agropecuario sin desagregar | `#FFFF00` | oficial MiAMBIENTE | 📘 Documentada | REST: «Uso Agropecuario» 100.0 % de 10 pts; 0.0 % en bosque 2021 | sí (46,406 ha) |
| 10 | Uso agropecuario de subsistencia | Agropecuario sin desagregar | `#FFEBB0` | oficial MiAMBIENTE | 📘 Documentada | REST: «Uso Agropecuario de Subsistencia» 100.0 % de 10 pts; 30.0 % en bosque 2021 | sí (8,354 ha) |
| 11 | Vegetación baja inundable | Otras coberturas vegetales | `#75FFDF` | oficial MiAMBIENTE | 📘 Documentada | catalogo_previo | no |

## 2000 · Cobertura histórica de bosque y uso del suelo 2000

| Atributo | Valor |
|---|---|
| Asset | `projects/geoportal-513817/assets/SINIA_2000_COBERTURA_HISTORICA_RASTER30M` |
| Clave interna | `2000_historico` |
| Año | 2000 |
| Institución | SINIA – Ministerio de Ambiente de Panamá (MiAMBIENTE) |
| Tipo | Ráster (IMAGE) |
| Resolución | 30 m |
| Escala cartográfica | 1:250.000 |
| Proyección documentada | EPSG:32617 |
| Proyección y tipo verificados | EPSG:32617 · `b1` INT (máx. 255) · 30 m |
| Banda o campo temático | `b1` |
| NoData | 255 |
| Uso analítico | Caracterización histórica de cobertura; máscara forestal derivada para contexto estructural histórico. |
| Máscara forestal (fragmentación) | Códigos 2, 3, 4, 5. Mismas clases que 1992, leídas con la tabla de códigos de 2000. |
| Limitaciones | Escala 1:250.000. El código 8 significa «Uso agropecuario», distinto de 1992. |
| Fuentes | julii5sos/geoportal-chcp-conectividad-ecologica · catalogo_assets_sinia.py (2026-11-07)<br>https://sinia.gob.pa/datos-abiertos-y-geoservicios/<br>https://geoportal.miambiente.gob.pa/server/rest/services/Nodo_Suelos/MapServer |
| Inventario en la CHCP | Códigos presentes: 1, 2, 3, 4, 6, 7, 8, 9 · área enmascarada 43,431 ha · escala 30.0 m |

| Código | Categoría | Grupo derivado | Color | Fuente del color | Estado | Evidencia | En CHCP |
|---:|---|---|---|---|---|---|---|
| 1 | Agua | Agua | `#BEE8FF` | oficial MiAMBIENTE | 📘 Documentada | REST: «Agua» 100.0 % de 10 pts; 50.0 % en bosque 2021 | sí (402 ha) |
| 2 | Bosque intervenido | Bosque secundario o intervenido | `#A3FF73` | oficial MiAMBIENTE | 📘 Documentada | REST: «Bosque Intervenido» 100.0 % de 10 pts; 100.0 % en bosque 2021 | sí (65,361 ha) |
| 3 | Bosque maduro | Bosque natural | `#267300` | oficial MiAMBIENTE | 📘 Documentada | REST: «Bosque Maduro» 100.0 % de 10 pts; 100.0 % en bosque 2021 | sí (88,954 ha) |
| 4 | Bosque secundario maduro | Bosque secundario o intervenido | `#38A800` | oficial MiAMBIENTE | 📘 Documentada | REST: «Bosque Secundario Maduro» 100.0 % de 10 pts; 100.0 % en bosque 2021 | sí (51,621 ha) |
| 5 | Manglar | Bosque natural | `#8400A8` | oficial MiAMBIENTE | 📘 Documentada | catalogo_previo | no |
| 6 | Otros usos | Áreas intervenidas (pobladas, infraestructura, minería) | `#828282` | oficial MiAMBIENTE | 📘 Documentada | REST: «Otros Usos» 100.0 % de 10 pts; 10.0 % en bosque 2021 | sí (488 ha) |
| 7 | Rastrojos (bosque pionero) | Rastrojo y vegetación arbustiva | `#55FF00` | oficial MiAMBIENTE | 📘 Documentada | REST: «Rastrojos (Bosque Pionero)» 100.0 % de 10 pts; 80.0 % en bosque 2021 | sí (24,779 ha) |
| 8 | Uso agropecuario | Agropecuario sin desagregar | `#FFFF00` | oficial MiAMBIENTE | 📘 Documentada | REST: «Uso Agropecuario» 100.0 % de 10 pts; 10.0 % en bosque 2021 | sí (27,307 ha) |
| 9 | Uso agropecuario de subsistencia | Agropecuario sin desagregar | `#FFEBAF` | oficial MiAMBIENTE | 📘 Documentada | REST: «Uso Agropecuario de Subsistencia» 100.0 % de 10 pts; 40.0 % en bosque 2021 | sí (38,702 ha) |
| 10 | Vegetación baja inundable | Otras coberturas vegetales | `#73FFDF` | oficial MiAMBIENTE | 📘 Documentada | catalogo_previo | no |

## 2012 · Bosque / no bosque 2012

| Atributo | Valor |
|---|---|
| Asset | `projects/geoportal-513817/assets/SINIA_2012_BOSQUE_BINARIO_RASTER5M` |
| Clave interna | `2012_binario` |
| Año | 2012 |
| Institución | SINIA – Ministerio de Ambiente de Panamá (MiAMBIENTE) |
| Tipo | Ráster (IMAGE) |
| Resolución | 5 m |
| Escala cartográfica | 1:50.000 |
| Proyección documentada | EPSG:32617 |
| Proyección y tipo verificados | EPSG:32617 · `b1` INT (máx. 255) · 5 m |
| Banda o campo temático | `b1` |
| NoData | 255 |
| Uso analítico | Máscara forestal binaria para fragmentación y conectividad a resolución nativa, previa validación del AOI. |
| Máscara forestal (fragmentación) | Códigos 1. Clase «Bosque» de la capa binaria; incluye plantaciones. |
| Limitaciones | «No bosque» no equivale exclusivamente a agricultura. No distingue bosque natural de plantado. |
| Fuentes | julii5sos/geoportal-chcp-conectividad-ecologica · catalogo_assets_sinia.py (2026-11-07)<br>https://sinia.gob.pa/datos-abiertos-y-geoservicios/<br>https://sinia.gob.pa/datos/Suelo/Cobertura_Boscosa_Uso_Suelo_2012_17x22_20191001_op.pdf |
| Inventario en la CHCP | Códigos presentes: 1, 2 · área enmascarada 0 ha · escala 10 m |

| Código | Categoría | Grupo derivado | Color | Fuente del color | Estado | Evidencia | En CHCP |
|---:|---|---|---|---|---|---|---|
| 1 | Bosque | Bosques y otras tierras boscosas (categoría amplia) | `#2E7D32` | propuesta Geoportal | 📘 Documentada | catalogo_previo; 100.0 % en bosque 2021 | sí (194,249 ha) |
| 2 | No bosque | Otras tierras (categoría amplia) | `#E0D3B8` | propuesta Geoportal | 📘 Documentada | catalogo_previo; 20.0 % en bosque 2021 | sí (146,796 ha) |

## 2012 · Cobertura boscosa y uso del suelo 2012 (detallada)

| Atributo | Valor |
|---|---|
| Asset | `projects/geoportal-513817/assets/SINIA_2012_USO_SUELO_RASTER5M` |
| Clave interna | `2012_detallado` |
| Año | 2012 |
| Institución | SINIA – Ministerio de Ambiente de Panamá (MiAMBIENTE) |
| Tipo | Ráster (IMAGE) |
| Resolución | 5 m |
| Escala cartográfica | 1:50.000 |
| Proyección documentada | EPSG:32617 |
| Proyección y tipo verificados | Pendiente de auditoría |
| Banda o campo temático | `b1` |
| NoData | 65535 |
| Uso analítico | Distinción de bosques naturales, plantados, rastrojos, cultivos, pastos y usos antrópicos. |
| Máscara forestal (fragmentación) | Códigos 1, 2, 3, 4, 5, 6; opcionales 7, 8. Bosques naturales (códigos 1–6). Las plantaciones (7–8) solo se incluyen si el análisis lo declara. |
| Limitaciones | No agrupar automáticamente bosques naturales, plantados y rastrojos. |
| Fuentes | julii5sos/geoportal-chcp-conectividad-ecologica · catalogo_assets_sinia.py (2026-11-07)<br>https://sinia.gob.pa/datos-abiertos-y-geoservicios/<br>https://geoportal.miambiente.gob.pa/server/rest/services/Nodo_Suelos/MapServer<br>https://sinia.gob.pa/datos/Suelo/Cobertura_Boscosa_Uso_Suelo_2012_17x22_20191001_op.pdf |

| Código | Categoría | Grupo derivado | Color | Fuente del color | Estado | Evidencia | En CHCP |
|---:|---|---|---|---|---|---|---|
| 1 | Bosque latifoliado mixto maduro | Bosque natural | `#1B5E20` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 2 | Bosque latifoliado mixto secundario | Bosque secundario o intervenido | `#43A047` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 3 | Bosque de mangle | Bosque natural | `#6A1B9A` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 4 | Bosque de orey | Bosque natural | `#00897B` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 5 | Bosque de cativo | Bosque natural | `#26A69A` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 6 | Bosque de rafia | Bosque natural | `#80CBC4` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 7 | Bosque plantado de coníferas | Bosque plantado | `#33691E` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 8 | Bosque plantado de latifoliadas | Bosque plantado | `#558B2F` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 9 | Rastrojo y vegetación arbustiva | Rastrojo y vegetación arbustiva | `#9CCC65` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 10 | Vegetación herbácea | Otras coberturas vegetales | `#D4E157` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 11 | Vegetación baja inundable | Otras coberturas vegetales | `#80DEEA` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 12 | Afloramiento rocoso y tierra desnuda | Áreas abiertas naturales | `#BCAAA4` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 13 | Playa y arenal natural | Áreas abiertas naturales | `#FFF59D` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 14 | Café | Cultivos | `#6D4C41` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 15 | Cítrico | Cultivos | `#FFB74D` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 16 | Palma aceitera | Cultivos | `#F57F17` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 17 | Plátano/banano | Cultivos | `#FDD835` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 18 | Otro cultivo permanente | Cultivos | `#FFCC80` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 19 | Arroz | Cultivos | `#E6EE9C` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 20 | Caña de azúcar | Cultivos | `#C0CA33` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 21 | Horticultura mixta | Cultivos | `#FFAB91` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 22 | Maíz | Cultivos | `#FFE082` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 23 | Piña | Cultivos | `#FFD54F` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 24 | Otro cultivo anual | Cultivos | `#FFE0B2` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 25 | Área heterogénea de producción agropecuaria | Agropecuario sin desagregar | `#F8BBD0` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 26 | Pasto | Pastos | `#F0E68C` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 27 | Superficie de agua | Agua | `#4FC3F7` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 28 | Área poblada | Áreas intervenidas (pobladas, infraestructura, minería) | `#E53935` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 29 | Infraestructura | Áreas intervenidas (pobladas, infraestructura, minería) | `#757575` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 30 | Explotación minera | Áreas intervenidas (pobladas, infraestructura, minería) | `#8D6E63` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 31 | Estanque para acuicultura | Áreas intervenidas (pobladas, infraestructura, minería) | `#4DD0E1` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 32 | Salinera | Áreas intervenidas (pobladas, infraestructura, minería) | `#E0E0E0` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |

## 2019 · Cobertura general 2019

| Atributo | Valor |
|---|---|
| Asset | `projects/geoportal-513817/assets/SINIA_2019_COBERTURA_GENERAL_RASTER20M` |
| Clave interna | `2019_general` |
| Año | 2019 |
| Institución | SINIA – Ministerio de Ambiente de Panamá (MiAMBIENTE) |
| Tipo | Ráster (IMAGE) |
| Resolución | 19.799712 m |
| Escala cartográfica | — |
| Proyección documentada | EPSG:32617 |
| Proyección y tipo verificados | Pendiente de auditoría |
| Banda o campo temático | `b1` |
| NoData | 0 |
| Uso analítico | Superficie por categoría amplia; referencia institucional independiente. |
| Máscara forestal (fragmentación) | Códigos 1. Categoría amplia; incluye otras tierras boscosas. |
| Limitaciones | La clase 1 no equivale automáticamente a bosque natural. Píxel ≈ 19.8 m, no 20 m exactos. |
| Fuentes | julii5sos/geoportal-chcp-conectividad-ecologica · catalogo_assets_sinia.py (2026-11-07)<br>https://sinia.gob.pa/datos-abiertos-y-geoservicios/ |

| Código | Categoría | Grupo derivado | Color | Fuente del color | Estado | Evidencia | En CHCP |
|---:|---|---|---|---|---|---|---|
| 1 | Bosques y otras tierras boscosas | Bosques y otras tierras boscosas (categoría amplia) | `#237A4B` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 2 | Otras tierras | Otras tierras (categoría amplia) | `#D8C49C` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 3 | Cuerpos de agua | Agua | `#388FC4` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |

## 2021 · Cobertura general oficial 2021 (vector)

| Atributo | Valor |
|---|---|
| Asset | `projects/geoportal-513817/assets/SINIA_2021_COBERTURA_GENERAL_VECTOR` |
| Clave interna | `2021_general` |
| Año | 2021 |
| Institución | SINIA – Ministerio de Ambiente de Panamá (MiAMBIENTE) |
| Tipo | Vector (TABLE · FeatureCollection) |
| Resolución | — |
| Escala cartográfica | 1:25.000 (derivada) |
| Proyección documentada | Según geometrías del asset |
| Proyección y tipo verificados | Pendiente de auditoría |
| Banda o campo temático | `Categoria` |
| NoData | — |
| Uso analítico | Referencia oficial para fragmentación y conectividad estructural (clase «Bosques y Otras Tierras Boscosas»). |
| Máscara forestal (fragmentación) | Códigos 1. «Bosques y Otras Tierras Boscosas», definición del motor de fragmentación validado. |
| Limitaciones | Las entidades no son parches ecológicos: se disuelven antes de medir. La categoría forestal incluye otras tierras boscosas. |
| Fuentes | julii5sos/geoportal-chcp-conectividad-ecologica · catalogo_assets_sinia.py (2026-11-07)<br>https://sinia.gob.pa/datos-abiertos-y-geoservicios/<br>https://sinia.gob.pa/datos/Suelo/Cobertura_Boscosa_Uso_Suelo_2021_17x22_20241029.pdf |

| Código | Categoría | Grupo derivado | Color | Fuente del color | Estado | Evidencia | En CHCP |
|---:|---|---|---|---|---|---|---|
| 1 | Bosques y Otras Tierras Boscosas | Bosques y otras tierras boscosas (categoría amplia) | `#237A4B` | propuesta Geoportal | ✅ Verificada (atributo) | atributo Categoria del asset (2026-11-07 y 2026-11-21) | — |
| 2 | Otras Tierras | Otras tierras (categoría amplia) | `#D8C49C` | propuesta Geoportal | ✅ Verificada (atributo) | atributo Categoria del asset | — |
| 3 | Aguas Continentales | Agua | `#388FC4` | propuesta Geoportal | ✅ Verificada (atributo) | atributo Categoria del asset | — |

## 2021 · Cobertura boscosa y uso del suelo 2021 (detallada)

| Atributo | Valor |
|---|---|
| Asset | `projects/geoportal-513817/assets/SINIA_2021_USO_SUELO_RASTER10M` |
| Clave interna | `2021_detallado` |
| Año | 2021 |
| Institución | SINIA – Ministerio de Ambiente de Panamá (MiAMBIENTE) |
| Tipo | Ráster (IMAGE) |
| Resolución | 10 m |
| Escala cartográfica | 1:25.000 |
| Proyección documentada | EPSG:32617 |
| Proyección y tipo verificados | Pendiente de auditoría |
| Banda o campo temático | `b1` |
| NoData | 255 |
| Uso analítico | Detalle de bosques, vegetación, usos agropecuarios y antrópicos 2021 una vez verificada la correspondencia. |
| Máscara forestal (fragmentación) | Códigos 1, 2, 3, 4, 5, 6; opcionales 7, 8. Grupos 1–6 (bosque natural) según documentación previa; pendiente de correspondencia individual. |
| Limitaciones | La correspondencia código ↔ categoría debe verificarse espacialmente; la leyenda oficial lista 33 categorías pero su orden no prueba el valor del píxel. |
| Fuentes | julii5sos/geoportal-chcp-conectividad-ecologica · catalogo_assets_sinia.py (2026-11-07)<br>https://sinia.gob.pa/datos-abiertos-y-geoservicios/<br>https://geoportal.miambiente.gob.pa/server/rest/services/Nodo_Suelos/MapServer<br>https://sinia.gob.pa/datos/Suelo/Cobertura_Boscosa_Uso_Suelo_2021_17x22_20241029.pdf |

| Código | Categoría | Grupo derivado | Color | Fuente del color | Estado | Evidencia | En CHCP |
|---:|---|---|---|---|---|---|---|
| 1 | Código 1 · Bosque natural (grupo documentado) | Bosque natural | `#1B5E20` | propuesta Geoportal | ⚠️ Solo grupo | catalogo_previo; candidato por orden de leyenda: «Bosque latifoliado mixto maduro» (no probado) | — |
| 2 | Código 2 · Bosque natural (grupo documentado) | Bosque natural | `#43A047` | propuesta Geoportal | ⚠️ Solo grupo | catalogo_previo; candidato por orden de leyenda: «Bosque latifoliado mixto secundario» (no probado) | — |
| 3 | Código 3 · Bosque natural (grupo documentado) | Bosque natural | `#6A1B9A` | propuesta Geoportal | ⚠️ Solo grupo | catalogo_previo; candidato por orden de leyenda: «Bosque de mangle» (no probado) | — |
| 4 | Código 4 · Bosque natural (grupo documentado) | Bosque natural | `#00897B` | propuesta Geoportal | ⚠️ Solo grupo | catalogo_previo; candidato por orden de leyenda: «Bosque de orey» (no probado) | — |
| 5 | Código 5 · Bosque natural (grupo documentado) | Bosque natural | `#26A69A` | propuesta Geoportal | ⚠️ Solo grupo | catalogo_previo; candidato por orden de leyenda: «Bosque de cativo» (no probado) | — |
| 6 | Código 6 · Bosque natural (grupo documentado) | Bosque natural | `#80CBC4` | propuesta Geoportal | ⚠️ Solo grupo | catalogo_previo; candidato por orden de leyenda: «Bosque de rafia» (no probado) | — |
| 7 | Código 7 · Bosque plantado (grupo documentado) | Bosque plantado | `#33691E` | propuesta Geoportal | ⚠️ Solo grupo | catalogo_previo; candidato por orden de leyenda: «Bosque plantado de coníferas» (no probado) | — |
| 8 | Código 8 · Bosque plantado (grupo documentado) | Bosque plantado | `#558B2F` | propuesta Geoportal | ⚠️ Solo grupo | catalogo_previo; candidato por orden de leyenda: «Bosque plantado de latifoliadas» (no probado) | — |
| 9 | Código 9 · Rastrojo y vegetación arbustiva (grupo documentado) | Rastrojo y vegetación arbustiva | `#9CCC65` | propuesta Geoportal | ⚠️ Solo grupo | catalogo_previo; candidato por orden de leyenda: «Rastrojo y vegetación arbustiva» (no probado) | — |
| 10 | Código 10 · sin documentación verificada | Código no identificado | `#D4E157` | propuesta Geoportal | ⚠️ Sin verificar | pendiente; candidato por orden de leyenda: «Vegetación herbácea» (no probado) | — |
| 11 | Código 11 · sin documentación verificada | Código no identificado | `#80DEEA` | propuesta Geoportal | ⚠️ Sin verificar | pendiente; candidato por orden de leyenda: «Vegetación baja inundable» (no probado) | — |
| 12 | Código 12 · sin documentación verificada | Código no identificado | `#BCAAA4` | propuesta Geoportal | ⚠️ Sin verificar | pendiente; candidato por orden de leyenda: «Afloramiento rocoso y tierra desnuda» (no probado) | — |
| 13 | Código 13 · sin documentación verificada | Código no identificado | `#FFF59D` | propuesta Geoportal | ⚠️ Sin verificar | pendiente; candidato por orden de leyenda: «Playa y arenal natural» (no probado) | — |
| 14 | Código 14 · sin documentación verificada | Código no identificado | `#6D4C41` | propuesta Geoportal | ⚠️ Sin verificar | pendiente; candidato por orden de leyenda: «Café» (no probado) | — |
| 15 | Código 15 · sin documentación verificada | Código no identificado | `#FFB74D` | propuesta Geoportal | ⚠️ Sin verificar | pendiente; candidato por orden de leyenda: «Cítrico» (no probado) | — |
| 16 | Código 16 · sin documentación verificada | Código no identificado | `#F57F17` | propuesta Geoportal | ⚠️ Sin verificar | pendiente; candidato por orden de leyenda: «Palma aceitera» (no probado) | — |
| 17 | Código 17 · sin documentación verificada | Código no identificado | `#FDD835` | propuesta Geoportal | ⚠️ Sin verificar | pendiente; candidato por orden de leyenda: «Plátano/banano» (no probado) | — |
| 18 | Código 18 · sin documentación verificada | Código no identificado | `#FFCC80` | propuesta Geoportal | ⚠️ Sin verificar | pendiente; candidato por orden de leyenda: «Otro cultivo permanente» (no probado) | — |
| 19 | Código 19 · sin documentación verificada | Código no identificado | `#E6EE9C` | propuesta Geoportal | ⚠️ Sin verificar | pendiente; candidato por orden de leyenda: «Arroz» (no probado) | — |
| 20 | Código 20 · sin documentación verificada | Código no identificado | `#C0CA33` | propuesta Geoportal | ⚠️ Sin verificar | pendiente; candidato por orden de leyenda: «Caña de azúcar» (no probado) | — |
| 21 | Código 21 · sin documentación verificada | Código no identificado | `#FFAB91` | propuesta Geoportal | ⚠️ Sin verificar | pendiente; candidato por orden de leyenda: «Horticultura mixta» (no probado) | — |
| 22 | Código 22 · sin documentación verificada | Código no identificado | `#FFE082` | propuesta Geoportal | ⚠️ Sin verificar | pendiente; candidato por orden de leyenda: «Maíz» (no probado) | — |
| 23 | Código 23 · sin documentación verificada | Código no identificado | `#FFD54F` | propuesta Geoportal | ⚠️ Sin verificar | pendiente; candidato por orden de leyenda: «Piña» (no probado) | — |
| 24 | Código 24 · sin documentación verificada | Código no identificado | `#FFE0B2` | propuesta Geoportal | ⚠️ Sin verificar | pendiente; candidato por orden de leyenda: «Otro cultivo anual» (no probado) | — |
| 25 | Código 25 · sin documentación verificada | Código no identificado | `#F8BBD0` | propuesta Geoportal | ⚠️ Sin verificar | pendiente; candidato por orden de leyenda: «Área heterogénea de producción agropecuaria» (no probado) | — |
| 26 | Código 26 · sin documentación verificada | Código no identificado | `#F0E68C` | propuesta Geoportal | ⚠️ Sin verificar | pendiente; candidato por orden de leyenda: «Pasto» (no probado) | — |
| 27 | Código 27 · sin documentación verificada | Código no identificado | `#4FC3F7` | propuesta Geoportal | ⚠️ Sin verificar | pendiente; candidato por orden de leyenda: «Superficie de agua» (no probado) | — |
| 28 | Código 28 · sin documentación verificada | Código no identificado | `#E53935` | propuesta Geoportal | ⚠️ Sin verificar | pendiente; candidato por orden de leyenda: «Área poblada» (no probado) | — |
| 29 | Código 29 · sin documentación verificada | Código no identificado | `#757575` | propuesta Geoportal | ⚠️ Sin verificar | pendiente; candidato por orden de leyenda: «Infraestructura» (no probado) | — |
| 30 | Código 30 · sin documentación verificada | Código no identificado | `#8D6E63` | propuesta Geoportal | ⚠️ Sin verificar | pendiente; candidato por orden de leyenda: «Explotación minera» (no probado) | — |
| 31 | Código 31 · sin documentación verificada | Código no identificado | `#4DD0E1` | propuesta Geoportal | ⚠️ Sin verificar | pendiente; candidato por orden de leyenda: «Estanque para acuicultura» (no probado) | — |
| 32 | Código 32 · sin documentación verificada | Código no identificado | `#E0E0E0` | propuesta Geoportal | ⚠️ Sin verificar | pendiente; candidato por orden de leyenda: «Salinera» (no probado) | — |
| 33 | Código 33 · sin documentación verificada | Código no identificado | `#EEEEEE` | propuesta Geoportal | ⚠️ Sin verificar | pendiente; candidato por orden de leyenda: «Albinas» (no probado) | — |

## 2023 · Cobertura general diagnóstica 2023

| Atributo | Valor |
|---|---|
| Asset | `projects/geoportal-513817/assets/SINIA_2023_COBERTURA_GENERAL_RASTER10M` |
| Clave interna | `2023_general` |
| Año | 2023 |
| Institución | SINIA – Ministerio de Ambiente de Panamá (MiAMBIENTE) |
| Tipo | Ráster (IMAGE) |
| Resolución | 10 m |
| Escala cartográfica | — |
| Proyección documentada | EPSG:32617 |
| Proyección y tipo verificados | Pendiente de auditoría |
| Banda o campo temático | `b1` |
| NoData | 0 |
| Uso analítico | Diagnóstico general independiente; escenario estructural paralelo. |
| Máscara forestal (fragmentación) | Códigos 1. Categoría amplia del diagnóstico 2023. |
| Limitaciones | No calcular pérdida o ganancia 2021–2023 sin dictamen de comparabilidad. El sufijo 25K del asset no implica 25 m. |
| Fuentes | julii5sos/geoportal-chcp-conectividad-ecologica · catalogo_assets_sinia.py (2026-11-07)<br>https://sinia.gob.pa/datos-abiertos-y-geoservicios/<br>https://sinia.gob.pa/datos/BNBOT_2023_11x17.pdf |

| Código | Categoría | Grupo derivado | Color | Fuente del color | Estado | Evidencia | En CHCP |
|---:|---|---|---|---|---|---|---|
| 1 | Bosques y otras tierras boscosas | Bosques y otras tierras boscosas (categoría amplia) | `#237A4B` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 2 | Otras tierras | Otras tierras (categoría amplia) | `#D8C49C` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
| 3 | Superficie de agua | Agua | `#388FC4` | propuesta Geoportal | 📘 Documentada | catalogo_previo | — |
