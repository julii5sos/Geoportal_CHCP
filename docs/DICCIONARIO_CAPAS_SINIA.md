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
| ⛔ Discrepancia (`discrepante_con_servicio`) | El servicio oficial asigna a este código otra categoría o valor de píxel; no se muestra ningún nombre como oficial hasta resolver la discrepancia. |
| 📄 Informe oficial (sin verificar en la CHCP) (`documentada_informe_oficial`) | Nombre y número tomados de la leyenda numerada del informe final oficial del mapa; el número coincide con el valor de píxel en los códigos verificados espacialmente, pero este código no se ha comprobado espacialmente (no aparece en la CHCP). No se presenta como oficial. |

Auditoría aplicada: **2026-11-21T18:40:08** · proyecto `geoportal-513817` · 10 puntos por código · servicio https://geoportal.miambiente.gob.pa/server/rest/services/Nodo_Suelos/MapServer.

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

**Hallazgos de la auditoría:**

- Los 8 códigos presentes en la CHCP (1, 2, 3, 4, 6, 7, 9, 10) coinciden al 100 % con la capa vectorial oficial de 1992 del servicio REST (capa 4).
- Los códigos 5 (Manglar), 8 (sin documentar) y 11 (Vegetación baja inundable) no aparecen en la CHCP; el significado del código 8 sigue sin resolverse, pero no afecta a la cuenca.
- ≈ 41 970 ha de la CHCP están enmascaradas (NoData), una magnitud similar a la de los grandes lagos del Canal, mientras «Aguas interiores» solo cubre 2 941 ha (por confirmar visualmente). No interprete esas áreas como ausencia de bosque.

| Código | Categoría | Grupo derivado | Color | Fuente del color | Estado | Evidencia | En CHCP |
|---:|---|---|---|---|---|---|---|
| 1 | Aguas Interiores | Agua | `#BFE9FF` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Aguas Interiores» 100.0 % de 10 pts; 30.0 % en bosque 2021 | sí (2,941 ha) |
| 2 | Bosque Intervenido | Bosque secundario o intervenido | `#A5FF75` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Bosque Intervenido» 100.0 % de 10 pts; 90.0 % en bosque 2021 | sí (45,672 ha) |
| 3 | Bosque Maduro | Bosque natural | `#267300` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Bosque Maduro» 100.0 % de 10 pts; 100.0 % en bosque 2021 | sí (88,124 ha) |
| 4 | Bosque Secundario Maduro | Bosque secundario o intervenido | `#37A600` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Bosque Secundario Maduro» 100.0 % de 10 pts; 100.0 % en bosque 2021 | sí (50,071 ha) |
| 5 | Manglar | Bosque natural | `#8200A6` | oficial MiAMBIENTE | 📘 Documentada | catalogo_previo | no |
| 6 | Otros Usos | Áreas intervenidas (pobladas, infraestructura, minería) | `#808080` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Otros Usos» 100.0 % de 10 pts; 40.0 % en bosque 2021 | sí (31 ha) |
| 7 | Rastrojos (Bosque Pionero) | Rastrojo y vegetación arbustiva | `#55FF00` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Rastrojos (Bosque Pionero)» 100.0 % de 10 pts; 70.0 % en bosque 2021 | sí (57,475 ha) |
| 8 | Sin categoría documentada | Código no identificado | `#BDBDBD` | propuesta Geoportal | ⛔ No identificado | catalogo_previo | no |
| 9 | Uso Agropecuario | Agropecuario sin desagregar | `#FFFF00` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Uso Agropecuario» 100.0 % de 10 pts; 0.0 % en bosque 2021 | sí (46,406 ha) |
| 10 | Uso Agropecuario de Subsistencia | Agropecuario sin desagregar | `#FFEBB0` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Uso Agropecuario de Subsistencia» 100.0 % de 10 pts; 30.0 % en bosque 2021 | sí (8,354 ha) |
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

**Hallazgos de la auditoría:**

- Los 8 códigos presentes en la CHCP (1, 2, 3, 4, 6, 7, 8, 9) coinciden al 100 % con la capa vectorial oficial de 2000 (capa 3). Se confirma que el código 8 es «Uso Agropecuario» en 2000.
- ≈ 43 431 ha enmascaradas en la CHCP, como en 1992.

| Código | Categoría | Grupo derivado | Color | Fuente del color | Estado | Evidencia | En CHCP |
|---:|---|---|---|---|---|---|---|
| 1 | Agua | Agua | `#BEE8FF` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Agua» 100.0 % de 10 pts; 50.0 % en bosque 2021 | sí (402 ha) |
| 2 | Bosque Intervenido | Bosque secundario o intervenido | `#A3FF73` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Bosque Intervenido» 100.0 % de 10 pts; 100.0 % en bosque 2021 | sí (65,361 ha) |
| 3 | Bosque Maduro | Bosque natural | `#267300` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Bosque Maduro» 100.0 % de 10 pts; 100.0 % en bosque 2021 | sí (88,954 ha) |
| 4 | Bosque Secundario Maduro | Bosque secundario o intervenido | `#38A800` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Bosque Secundario Maduro» 100.0 % de 10 pts; 100.0 % en bosque 2021 | sí (51,621 ha) |
| 5 | Manglar | Bosque natural | `#8400A8` | oficial MiAMBIENTE | 📘 Documentada | catalogo_previo | no |
| 6 | Otros Usos | Áreas intervenidas (pobladas, infraestructura, minería) | `#828282` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Otros Usos» 100.0 % de 10 pts; 10.0 % en bosque 2021 | sí (488 ha) |
| 7 | Rastrojos (Bosque Pionero) | Rastrojo y vegetación arbustiva | `#55FF00` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Rastrojos (Bosque Pionero)» 100.0 % de 10 pts; 80.0 % en bosque 2021 | sí (24,779 ha) |
| 8 | Uso Agropecuario | Agropecuario sin desagregar | `#FFFF00` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Uso Agropecuario» 100.0 % de 10 pts; 10.0 % en bosque 2021 | sí (27,307 ha) |
| 9 | Uso Agropecuario de Subsistencia | Agropecuario sin desagregar | `#FFEBAF` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Uso Agropecuario de Subsistencia» 100.0 % de 10 pts; 40.0 % en bosque 2021 | sí (38,702 ha) |
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

**Hallazgos de la auditoría:**

- Códigos 1 y 2 presentes; sin área enmascarada en la CHCP.
- El 100 % de los puntos «Bosque» cae en la clase forestal oficial 2021 y el 20 % de «No bosque» también (cambio o diferencias de definición).

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
| Proyección y tipo verificados | EPSG:32617 · `b1` INT (máx. 65535) · 5 m |
| Banda o campo temático | `b1` |
| NoData | 65535 |
| Uso analítico | Distinción de bosques naturales, plantados, rastrojos, cultivos, pastos y usos antrópicos. |
| Máscara forestal (fragmentación) | Códigos 1, 2; opcionales 8. Bosques naturales (códigos 1–6). Las plantaciones (7–8) solo se incluyen si el análisis lo declara. |
| Limitaciones | 18 de 30 códigos presentes discrepan del servicio oficial; no use sus nombres hasta resolverlo. No agrupar automáticamente bosques naturales, plantados y rastrojos. |
| Fuentes | julii5sos/geoportal-chcp-conectividad-ecologica · catalogo_assets_sinia.py (2026-11-07)<br>https://sinia.gob.pa/datos-abiertos-y-geoservicios/<br>https://geoportal.miambiente.gob.pa/server/rest/services/Nodo_Suelos/MapServer<br>https://sinia.gob.pa/datos/Suelo/Cobertura_Boscosa_Uso_Suelo_2012_17x22_20191001_op.pdf |
| Inventario en la CHCP | Códigos presentes: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30 · área enmascarada 0 ha · escala 10 m |

**Hallazgos de la auditoría:**

- 30 códigos presentes en la CHCP. Solo 12 coinciden con el servicio REST oficial (capa 2) en categoría y valor de píxel: 1, 2, 8, 9, 10, 12, 23, 26, 27, 28, 29, 30.
- Los códigos 3–7, 13–22, 24 y 25 caen mayoritariamente en otra categoría oficial (p. ej., el 21 en «Superficie de agua» y el 17 en «Pasto»). La leyenda del catálogo previo no es fiable para esos códigos: se marcan como discrepantes y salen de las máscaras.
- Hipótesis a confirmar con el productor: el asset pudo rasterizarse con una tabla de códigos distinta a la del servicio para las clases poco frecuentes.

| Código | Categoría | Grupo derivado | Color | Fuente del color | Estado | Evidencia | En CHCP |
|---:|---|---|---|---|---|---|---|
| 1 | Bosque latifoliado mixto maduro | Bosque natural | `#005800` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Bosque latifoliado mixto maduro» 100.0 % de 10 pts; 100.0 % en bosque 2021 | sí (125,410 ha) |
| 2 | Bosque latifoliado mixto secundario | Bosque secundario o intervenido | `#00A600` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Bosque latifoliado mixto secundario» 100.0 % de 10 pts; 90.0 % en bosque 2021 | sí (60,478 ha) |
| 3 | Código 3 · discrepancia con el servicio oficial | Código no identificado | `#6A1B9A` | propuesta Geoportal | ⛔ Discrepancia | REST: «Bosque latifoliado mixto maduro» 60.0 % de 10 pts; 60.0 % en bosque 2021 | sí (65 ha) |
| 4 | Código 4 · discrepancia con el servicio oficial | Código no identificado | `#00897B` | propuesta Geoportal | ⛔ Discrepancia | REST: «Bosque latifoliado mixto secundario» 70.0 % de 10 pts; 80.0 % en bosque 2021 | sí (224 ha) |
| 5 | Código 5 · discrepancia con el servicio oficial | Código no identificado | `#26A69A` | propuesta Geoportal | ⛔ Discrepancia | REST: «Bosque latifoliado mixto secundario» 40.0 % de 10 pts; 90.0 % en bosque 2021 | sí (188 ha) |
| 6 | Código 6 · discrepancia con el servicio oficial | Código no identificado | `#80CBC4` | propuesta Geoportal | ⛔ Discrepancia | REST: «Bosque latifoliado mixto secundario» 70.0 % de 10 pts; 80.0 % en bosque 2021 | sí (473 ha) |
| 7 | Código 7 · discrepancia con el servicio oficial | Código no identificado | `#33691E` | propuesta Geoportal | ⛔ Discrepancia | REST: «Bosque latifoliado mixto maduro» 30.0 % de 10 pts; 90.0 % en bosque 2021 | sí (450 ha) |
| 8 | Bosque plantado de latifoliadas | Bosque plantado | `#546B2E` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Bosque plantado de latifoliadas» 90.0 % de 10 pts; 90.0 % en bosque 2021 | sí (7,576 ha) |
| 9 | Rastrojo y vegetación arbustiva | Rastrojo y vegetación arbustiva | `#94D900` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Rastrojo y vegetación arbustiva» 100.0 % de 10 pts; 40.0 % en bosque 2021 | sí (3,085 ha) |
| 10 | Vegetación herbácea | Otras coberturas vegetales | `#DAF57C` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Vegetación herbácea» 100.0 % de 10 pts; 20.0 % en bosque 2021 | sí (6,067 ha) |
| 11 | Vegetación baja inundable | Otras coberturas vegetales | `#80DEEA` | propuesta Geoportal | 📘 Documentada | REST: «Vegetación baja inundable» 70.0 % de 10 pts; 20.0 % en bosque 2021 | sí (643 ha) |
| 12 | Afloramiento rocoso y tierra desnuda | Áreas abiertas naturales | `#8D8D8D` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Afloramiento rocoso y tierra desnuda» 90.0 % de 10 pts; 20.0 % en bosque 2021 | sí (753 ha) |
| 13 | Código 13 · discrepancia con el servicio oficial | Código no identificado | `#FFF59D` | propuesta Geoportal | ⛔ Discrepancia | REST: «Rastrojo y vegetación arbustiva» 70.0 % de 10 pts; 50.0 % en bosque 2021 | sí (172 ha) |
| 14 | Código 14 · discrepancia con el servicio oficial | Código no identificado | `#6D4C41` | propuesta Geoportal | ⛔ Discrepancia | REST: «Pasto» 40.0 % de 10 pts; 70.0 % en bosque 2021 | sí (2,885 ha) |
| 15 | Código 15 · discrepancia con el servicio oficial | Código no identificado | `#FFB74D` | propuesta Geoportal | ⛔ Discrepancia | REST: «Área poblada» 40.0 % de 10 pts; 10.0 % en bosque 2021 | sí (429 ha) |
| 16 | Código 16 · discrepancia con el servicio oficial | Código no identificado | `#F57F17` | propuesta Geoportal | ⛔ Discrepancia | REST: «Infraestructura» 40.0 % de 10 pts; 20.0 % en bosque 2021 | sí (32 ha) |
| 17 | Código 17 · discrepancia con el servicio oficial | Código no identificado | `#FDD835` | propuesta Geoportal | ⛔ Discrepancia | REST: «Pasto» 90.0 % de 10 pts; 60.0 % en bosque 2021 | sí (76 ha) |
| 18 | Código 18 · discrepancia con el servicio oficial | Código no identificado | `#FFCC80` | propuesta Geoportal | ⛔ Discrepancia | REST: «Pasto» 50.0 % de 10 pts; 30.0 % en bosque 2021 | sí (346 ha) |
| 19 | Código 19 · discrepancia con el servicio oficial | Código no identificado | `#E6EE9C` | propuesta Geoportal | ⛔ Discrepancia | REST: «Vegetación herbácea» 70.0 % de 10 pts; 20.0 % en bosque 2021 | sí (84 ha) |
| 20 | Código 20 · discrepancia con el servicio oficial | Código no identificado | `#C0CA33` | propuesta Geoportal | ⛔ Discrepancia | REST: «Pasto» 70.0 % de 10 pts; 80.0 % en bosque 2021 | sí (1,165 ha) |
| 21 | Código 21 · discrepancia con el servicio oficial | Código no identificado | `#FFAB91` | propuesta Geoportal | ⛔ Discrepancia | REST: «Superficie de agua» 90.0 % de 10 pts; 30.0 % en bosque 2021 | sí (309 ha) |
| 22 | Código 22 · discrepancia con el servicio oficial | Código no identificado | `#FFE082` | propuesta Geoportal | ⛔ Discrepancia | REST: «Pasto» 40.0 % de 10 pts; 20.0 % en bosque 2021 | sí (281 ha) |
| 23 | Piña | Cultivos | `#FFFFA8` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Piña» 100.0 % de 10 pts; 10.0 % en bosque 2021 | sí (2,519 ha) |
| 24 | Código 24 · discrepancia con el servicio oficial | Código no identificado | `#FFE0B2` | propuesta Geoportal | ⛔ Discrepancia | REST: «Piña» 70.0 % de 10 pts; 40.0 % en bosque 2021 | sí (53 ha) |
| 25 | Código 25 · discrepancia con el servicio oficial | Código no identificado | `#F8BBD0` | propuesta Geoportal | ⛔ Discrepancia | REST: «Pasto» 50.0 % de 10 pts; 0.0 % en bosque 2021 | sí (66 ha) |
| 26 | Pasto | Pastos | `#FFFF00` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Pasto» 100.0 % de 10 pts; 30.0 % en bosque 2021 | sí (71,745 ha) |
| 27 | Superficie de agua | Agua | `#80F1E6` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Superficie de agua» 100.0 % de 10 pts; 0.0 % en bosque 2021 | sí (45,077 ha) |
| 28 | Área poblada | Áreas intervenidas (pobladas, infraestructura, minería) | `#FF0000` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Área poblada» 100.0 % de 10 pts; 0.0 % en bosque 2021 | sí (9,287 ha) |
| 29 | Infraestructura | Áreas intervenidas (pobladas, infraestructura, minería) | `#990000` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Infraestructura» 100.0 % de 10 pts; 20.0 % en bosque 2021 | sí (1,087 ha) |
| 30 | Explotación minera | Áreas intervenidas (pobladas, infraestructura, minería) | `#A600CC` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Explotación minera» 100.0 % de 10 pts; 10.0 % en bosque 2021 | sí (20 ha) |
| 31 | Estanque para acuicultura | Áreas intervenidas (pobladas, infraestructura, minería) | `#4DD0E1` | propuesta Geoportal | 📘 Documentada | catalogo_previo | no |
| 32 | Salinera | Áreas intervenidas (pobladas, infraestructura, minería) | `#E0E0E0` | propuesta Geoportal | 📘 Documentada | catalogo_previo | no |

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
| Proyección y tipo verificados | EPSG:32617 · `b1` INT (máx. 255) · 19.799712 m |
| Banda o campo temático | `b1` |
| NoData | 0 |
| Uso analítico | Superficie por categoría amplia; referencia institucional independiente. |
| Máscara forestal (fragmentación) | Códigos 1. Categoría amplia; incluye otras tierras boscosas. |
| Limitaciones | La clase 1 no equivale automáticamente a bosque natural. Píxel ≈ 19.8 m, no 20 m exactos. |
| Fuentes | julii5sos/geoportal-chcp-conectividad-ecologica · catalogo_assets_sinia.py (2026-11-07)<br>https://sinia.gob.pa/datos-abiertos-y-geoservicios/ |
| Inventario en la CHCP | Códigos presentes: 1, 2, 3 · área enmascarada 0 ha · escala 19.799712 m |

**Hallazgos de la auditoría:**

- Códigos 1–3 presentes, sin área enmascarada.
- El 90 % de los puntos de la clase 1 cae en el bosque oficial 2021; agua y otras tierras, 10 %.

| Código | Categoría | Grupo derivado | Color | Fuente del color | Estado | Evidencia | En CHCP |
|---:|---|---|---|---|---|---|---|
| 1 | Bosques y otras tierras boscosas | Bosques y otras tierras boscosas (categoría amplia) | `#237A4B` | propuesta Geoportal | 📘 Documentada | catalogo_previo; 90.0 % en bosque 2021 | sí (215,770 ha) |
| 2 | Otras tierras | Otras tierras (categoría amplia) | `#D8C49C` | propuesta Geoportal | 📘 Documentada | catalogo_previo; 10.0 % en bosque 2021 | sí (83,059 ha) |
| 3 | Cuerpos de agua | Agua | `#388FC4` | propuesta Geoportal | 📘 Documentada | catalogo_previo; 10.0 % en bosque 2021 | sí (42,215 ha) |

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
| Proyección y tipo verificados | Geometrías en EPSG:4326 |
| Banda o campo temático | `Categoria` |
| NoData | — |
| Uso analítico | Referencia oficial para fragmentación y conectividad estructural (clase «Bosques y Otras Tierras Boscosas»). |
| Máscara forestal (fragmentación) | Códigos 1. «Bosques y Otras Tierras Boscosas», definición del motor de fragmentación validado. |
| Limitaciones | Las entidades no son parches ecológicos: se disuelven antes de medir. La categoría forestal incluye otras tierras boscosas. |
| Fuentes | julii5sos/geoportal-chcp-conectividad-ecologica · catalogo_assets_sinia.py (2026-11-07)<br>https://sinia.gob.pa/datos-abiertos-y-geoservicios/<br>https://sinia.gob.pa/datos/Suelo/Cobertura_Boscosa_Uso_Suelo_2021_17x22_20241029.pdf |
| Inventario del vector | 28,288 entidades · campos Area_ha, Categoria, ID_PARTE, system:index · geometrías {'GeometryCollection': 1, 'LineString': 1, 'MultiPolygon': 3, 'Polygon': 495} |

**Hallazgos de la auditoría:**

- 28 288 entidades (10 994 bosque, 12 797 otras tierras, 4 497 agua); campos Area_ha, Categoria, ID_PARTE. Geometrías en EPSG:4326.
- En una muestra de 500 entidades hay 1 GeometryCollection y 1 LineString además de polígonos; el motor los descarta al construir parches.
- El motor de fragmentación en Qda. Bonita reproduce exactamente la validación del 2026-11-07: 6 parches, 9 aristas, 1 componente, 377.6973 ha.
- La categoría «Bosques y Otras Tierras Boscosas» incluye rastrojos: el 100 % de los puntos del código 9 (Rastrojo) del ráster 2021 cae en ella.

| Código | Categoría | Grupo derivado | Color | Fuente del color | Estado | Evidencia | En CHCP |
|---:|---|---|---|---|---|---|---|
| 1 | Bosques y Otras Tierras Boscosas | Bosques y otras tierras boscosas (categoría amplia) | `#237A4B` | propuesta Geoportal | ✅ Verificada (atributo) | atributo Categoria del asset (2026-11-07 y 2026-11-21) | sí |
| 2 | Otras Tierras | Otras tierras (categoría amplia) | `#D8C49C` | propuesta Geoportal | ✅ Verificada (atributo) | atributo Categoria del asset | sí |
| 3 | Aguas Continentales | Agua | `#388FC4` | propuesta Geoportal | ✅ Verificada (atributo) | atributo Categoria del asset | sí |

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
| Proyección y tipo verificados | EPSG:32617 · `b1` INT (máx. 255) · 10 m |
| Banda o campo temático | `b1` |
| NoData | 255 |
| Uso analítico | Detalle verificado de bosques, plantaciones, vegetación, cultivos, pastos, agua y usos antrópicos en 2021 (18 códigos presentes en la CHCP). |
| Máscara forestal (fragmentación) | Códigos 1, 2, 3, 4, 5, 6; opcionales 7, 8. Bosques naturales y secundarios (códigos 1–6). Códigos 1–3 verificados espacialmente; 4–6 no aparecen en la CHCP y conservan el grupo documentado. Plantaciones (7–8) solo si el análisis lo declara. |
| Limitaciones | Solo los 18 códigos presentes en la CHCP están verificados; los demás conservan su estado. Las plantaciones (7–8) y los rastrojos (9) no son bosque natural. |
| Fuentes | julii5sos/geoportal-chcp-conectividad-ecologica · catalogo_assets_sinia.py (2026-11-07)<br>https://sinia.gob.pa/datos-abiertos-y-geoservicios/<br>https://geoportal.miambiente.gob.pa/server/rest/services/Nodo_Suelos/MapServer<br>https://sinia.gob.pa/datos/Suelo/Cobertura_Boscosa_Uso_Suelo_2021_17x22_20241029.pdf |
| Inventario en la CHCP | Códigos presentes: 1, 2, 3, 7, 8, 9, 10, 11, 12, 14, 23, 24, 25, 26, 27, 28, 29, 30 · área enmascarada 0 ha · escala 10.0 m |

**Hallazgos de la auditoría:**

- Los 18 códigos presentes en la CHCP (1, 2, 3, 7, 8, 9, 10, 11, 12, 14, 23, 24, 25, 26, 27, 28, 29, 30) quedan verificados: el valor de píxel del asset coincide al 100 % con el valor oficial (Classvalue) del servicio REST (capa 1) y la categoría es la de su Class_name, con su color RGB oficial.
- En todos los códigos verificados el valor coincide con la posición en la leyenda oficial de 33 categorías, pero los 15 códigos ausentes de la CHCP (4–6, 13, 15–22, 31–33) se conservan como «no probados».

| Código | Categoría | Grupo derivado | Color | Fuente del color | Estado | Evidencia | En CHCP |
|---:|---|---|---|---|---|---|---|
| 1 | Bosque latifoliado mixto maduro | Bosque natural | `#005800` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Bosque latifoliado mixto maduro» 100.0 % de 10 pts; 100.0 % en bosque 2021 | sí (123,494 ha) |
| 2 | Bosque latifoliado mixto secundario | Bosque secundario o intervenido | `#00A600` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Bosque latifoliado mixto secundario» 100.0 % de 10 pts; 100.0 % en bosque 2021 | sí (74,474 ha) |
| 3 | Bosque de mangle | Bosque natural | `#6800B5` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Bosque de mangle» 100.0 % de 10 pts; 90.0 % en bosque 2021 | sí (3 ha) |
| 4 | Código 4 · Bosque de orey (informe oficial; sin verificar en la cuenca) | Bosque natural | `#00897B` | propuesta Geoportal | 📄 Informe oficial (sin verificar en la CHCP) | MiAMBIENTE, Dirección de Información Ambiental (2022). Informe Final del Mapa de Cobertura Boscosa y Uso de Suelo 2021, de Panamá. Abril de 2022. Cuadro N° 2, pp. 21–22. | no |
| 5 | Código 5 · Bosque de cativo (informe oficial; sin verificar en la cuenca) | Bosque natural | `#26A69A` | propuesta Geoportal | 📄 Informe oficial (sin verificar en la CHCP) | MiAMBIENTE, Dirección de Información Ambiental (2022). Informe Final del Mapa de Cobertura Boscosa y Uso de Suelo 2021, de Panamá. Abril de 2022. Cuadro N° 2, pp. 21–22. | no |
| 6 | Código 6 · Bosque de rafia (informe oficial; sin verificar en la cuenca) | Bosque natural | `#80CBC4` | propuesta Geoportal | 📄 Informe oficial (sin verificar en la CHCP) | MiAMBIENTE, Dirección de Información Ambiental (2022). Informe Final del Mapa de Cobertura Boscosa y Uso de Suelo 2021, de Panamá. Abril de 2022. Cuadro N° 2, pp. 21–22. | no |
| 7 | Bosque plantado de coníferas | Bosque plantado | `#133C2A` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Bosque plantado de coníferas» 100.0 % de 10 pts; 100.0 % en bosque 2021 | sí (111 ha) |
| 8 | Bosque plantado de latifoliadas | Bosque plantado | `#546B2E` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Bosque plantado de latifoliadas» 100.0 % de 10 pts; 100.0 % en bosque 2021 | sí (7,734 ha) |
| 9 | Rastrojo y vegetación arbustiva | Rastrojo y vegetación arbustiva | `#94D900` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Rastrojo y vegetación arbustiva» 100.0 % de 10 pts; 100.0 % en bosque 2021 | sí (2,793 ha) |
| 10 | Vegetación herbácea | Otras coberturas vegetales | `#DAF57C` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Vegetación herbácea» 100.0 % de 10 pts; 10.0 % en bosque 2021 | sí (6,666 ha) |
| 11 | Vegetación baja inundable | Otras coberturas vegetales | `#00FFA6` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Vegetación baja inundable» 100.0 % de 10 pts; 0.0 % en bosque 2021 | sí (1,490 ha) |
| 12 | Afloramiento rocoso y tierra desnuda | Áreas abiertas naturales | `#8D8D8D` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Afloramiento rocoso y tierra desnuda» 100.0 % de 10 pts; 0.0 % en bosque 2021 | sí (497 ha) |
| 13 | Código 13 · Playa y arena natural (informe oficial; sin verificar en la cuenca) | Áreas abiertas naturales | `#FFF59D` | propuesta Geoportal | 📄 Informe oficial (sin verificar en la CHCP) | MiAMBIENTE, Dirección de Información Ambiental (2022). Informe Final del Mapa de Cobertura Boscosa y Uso de Suelo 2021, de Panamá. Abril de 2022. Cuadro N° 2, pp. 21–22. | no |
| 14 | Café | Cultivos | `#422F00` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Café» 100.0 % de 10 pts; 0.0 % en bosque 2021 | sí (1,423 ha) |
| 15 | Código 15 · Cítrico (informe oficial; sin verificar en la cuenca) | Cultivos | `#FFB74D` | propuesta Geoportal | 📄 Informe oficial (sin verificar en la CHCP) | MiAMBIENTE, Dirección de Información Ambiental (2022). Informe Final del Mapa de Cobertura Boscosa y Uso de Suelo 2021, de Panamá. Abril de 2022. Cuadro N° 2, pp. 21–22. | no |
| 16 | Código 16 · Palma aceitera (informe oficial; sin verificar en la cuenca) | Cultivos | `#F57F17` | propuesta Geoportal | 📄 Informe oficial (sin verificar en la CHCP) | MiAMBIENTE, Dirección de Información Ambiental (2022). Informe Final del Mapa de Cobertura Boscosa y Uso de Suelo 2021, de Panamá. Abril de 2022. Cuadro N° 2, pp. 21–22. | no |
| 17 | Código 17 · Plátano/banano (informe oficial; sin verificar en la cuenca) | Cultivos | `#FDD835` | propuesta Geoportal | 📄 Informe oficial (sin verificar en la CHCP) | MiAMBIENTE, Dirección de Información Ambiental (2022). Informe Final del Mapa de Cobertura Boscosa y Uso de Suelo 2021, de Panamá. Abril de 2022. Cuadro N° 2, pp. 21–22. | no |
| 18 | Código 18 · Otro cultivo permanente (informe oficial; sin verificar en la cuenca) | Cultivos | `#FFCC80` | propuesta Geoportal | 📄 Informe oficial (sin verificar en la CHCP) | MiAMBIENTE, Dirección de Información Ambiental (2022). Informe Final del Mapa de Cobertura Boscosa y Uso de Suelo 2021, de Panamá. Abril de 2022. Cuadro N° 2, pp. 21–22. | no |
| 19 | Código 19 · Arroz (informe oficial; sin verificar en la cuenca) | Cultivos | `#E6EE9C` | propuesta Geoportal | 📄 Informe oficial (sin verificar en la CHCP) | MiAMBIENTE, Dirección de Información Ambiental (2022). Informe Final del Mapa de Cobertura Boscosa y Uso de Suelo 2021, de Panamá. Abril de 2022. Cuadro N° 2, pp. 21–22. | no |
| 20 | Código 20 · Caña de azúcar (informe oficial; sin verificar en la cuenca) | Cultivos | `#C0CA33` | propuesta Geoportal | 📄 Informe oficial (sin verificar en la CHCP) | MiAMBIENTE, Dirección de Información Ambiental (2022). Informe Final del Mapa de Cobertura Boscosa y Uso de Suelo 2021, de Panamá. Abril de 2022. Cuadro N° 2, pp. 21–22. | no |
| 21 | Código 21 · Horticultura mixta (informe oficial; sin verificar en la cuenca) | Cultivos | `#FFAB91` | propuesta Geoportal | 📄 Informe oficial (sin verificar en la CHCP) | MiAMBIENTE, Dirección de Información Ambiental (2022). Informe Final del Mapa de Cobertura Boscosa y Uso de Suelo 2021, de Panamá. Abril de 2022. Cuadro N° 2, pp. 21–22. | no |
| 22 | Código 22 · Maíz (informe oficial; sin verificar en la cuenca) | Cultivos | `#FFE082` | propuesta Geoportal | 📄 Informe oficial (sin verificar en la CHCP) | MiAMBIENTE, Dirección de Información Ambiental (2022). Informe Final del Mapa de Cobertura Boscosa y Uso de Suelo 2021, de Panamá. Abril de 2022. Cuadro N° 2, pp. 21–22. | no |
| 23 | Piña | Cultivos | `#FFFFA8` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Piña» 100.0 % de 10 pts; 0.0 % en bosque 2021 | sí (1,580 ha) |
| 24 | Otro cultivo anual | Cultivos | `#FFDB00` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Otro cultivo anual» 100.0 % de 10 pts; 20.0 % en bosque 2021 | sí (11 ha) |
| 25 | Área heterogénea de producción agropecuaria | Agropecuario sin desagregar | `#A87900` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Área heterogénea de producción agropecuaria» 100.0 % de 10 pts; 0.0 % en bosque 2021 | sí (0 ha) |
| 26 | Pasto | Pastos | `#FFFF00` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Pasto» 100.0 % de 10 pts; 0.0 % en bosque 2021 | sí (66,407 ha) |
| 27 | Superficie de agua | Agua | `#80F1E6` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Superficie de agua» 100.0 % de 10 pts; 10.0 % en bosque 2021 | sí (43,713 ha) |
| 28 | Área poblada | Áreas intervenidas (pobladas, infraestructura, minería) | `#FF0000` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Área poblada» 100.0 % de 10 pts; 0.0 % en bosque 2021 | sí (8,813 ha) |
| 29 | Infraestructura | Áreas intervenidas (pobladas, infraestructura, minería) | `#990000` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Infraestructura» 100.0 % de 10 pts; 0.0 % en bosque 2021 | sí (1,464 ha) |
| 30 | Explotación minera | Áreas intervenidas (pobladas, infraestructura, minería) | `#A600CC` | oficial MiAMBIENTE | ✅ Verificada (espacial) | REST: «Explotación minera» 100.0 % de 10 pts; 0.0 % en bosque 2021 | sí (370 ha) |
| 31 | Código 31 · Estanque para acuicultura (informe oficial; sin verificar en la cuenca) | Áreas intervenidas (pobladas, infraestructura, minería) | `#4DD0E1` | propuesta Geoportal | 📄 Informe oficial (sin verificar en la CHCP) | MiAMBIENTE, Dirección de Información Ambiental (2022). Informe Final del Mapa de Cobertura Boscosa y Uso de Suelo 2021, de Panamá. Abril de 2022. Cuadro N° 2, pp. 21–22. | no |
| 32 | Código 32 · Salinera (informe oficial; sin verificar en la cuenca) | Áreas intervenidas (pobladas, infraestructura, minería) | `#E0E0E0` | propuesta Geoportal | 📄 Informe oficial (sin verificar en la CHCP) | MiAMBIENTE, Dirección de Información Ambiental (2022). Informe Final del Mapa de Cobertura Boscosa y Uso de Suelo 2021, de Panamá. Abril de 2022. Cuadro N° 2, pp. 21–22. | no |
| 33 | Código 33 · Albinas (informe oficial; sin verificar en la cuenca) | Áreas abiertas naturales | `#EEEEEE` | propuesta Geoportal | 📄 Informe oficial (sin verificar en la CHCP) | MiAMBIENTE, Dirección de Información Ambiental (2022). Informe Final del Mapa de Cobertura Boscosa y Uso de Suelo 2021, de Panamá. Abril de 2022. Cuadro N° 2, pp. 21–22. | no |

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
| Proyección y tipo verificados | EPSG:32617 · `b1` INT (máx. 255) · 10 m |
| Banda o campo temático | `b1` |
| NoData | 0 |
| Uso analítico | Diagnóstico general independiente; escenario estructural paralelo. |
| Máscara forestal (fragmentación) | Códigos 1. Categoría amplia del diagnóstico 2023. |
| Limitaciones | No calcular pérdida o ganancia 2021–2023 sin dictamen de comparabilidad. El sufijo 25K del asset no implica 25 m. |
| Fuentes | julii5sos/geoportal-chcp-conectividad-ecologica · catalogo_assets_sinia.py (2026-11-07)<br>https://sinia.gob.pa/datos-abiertos-y-geoservicios/<br>https://sinia.gob.pa/datos/BNBOT_2023_11x17.pdf |
| Inventario en la CHCP | Códigos presentes: 1, 2, 3 · área enmascarada 0 ha · escala 10.0 m |

**Hallazgos de la auditoría:**

- Códigos 1–3 presentes, sin área enmascarada.
- El 100 % de los puntos de la clase 1 cae en el bosque oficial 2021; otras tierras, 10 %; agua, 0 %. Coherencia temática alta, no equivalencia metodológica.

| Código | Categoría | Grupo derivado | Color | Fuente del color | Estado | Evidencia | En CHCP |
|---:|---|---|---|---|---|---|---|
| 1 | Bosques y otras tierras boscosas | Bosques y otras tierras boscosas (categoría amplia) | `#237A4B` | propuesta Geoportal | 📘 Documentada | catalogo_previo; 100.0 % en bosque 2021 | sí (212,481 ha) |
| 2 | Otras tierras | Otras tierras (categoría amplia) | `#D8C49C` | propuesta Geoportal | 📘 Documentada | catalogo_previo; 10.0 % en bosque 2021 | sí (85,317 ha) |
| 3 | Superficie de agua | Agua | `#388FC4` | propuesta Geoportal | 📘 Documentada | catalogo_previo; 0.0 % en bosque 2021 | sí (43,246 ha) |
