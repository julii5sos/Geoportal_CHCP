# B · Discrepancias del ráster SINIA 2012 frente a la cartografía oficial

**Asset auditado:** `projects/geoportal-513817/assets/SINIA_2012_USO_SUELO_RASTER5M` (EPSG:32617, píxel de 5 m, 25 262 × 24 745, banda `b1`).
**Estado:** discrepancias reproducidas y causa más probable identificada. Los códigos no verificados quedan **excluidos** de las máscaras forestales (opción 4). La comparación controlada está programada, pero **todavía no se ha ejecutado**.

## 1. Fuentes institucionales consultadas

| Fuente | Resultado |
|---|---|
| Gaceta Oficial n.º 28229-A (3 de marzo de 2017), resolución del Ministerio de Ambiente que «aprueba el uso del mapa de cobertura y uso 2012» | Confirma la procedencia y el reconocimiento oficial del mapa 2012. El número de la resolución no es legible en la copia digitalizada consultada, por lo que no se cita. |
| Presentación ONU-REDD/ANAM «Mapa de usos de la tierra… RapidEye» | Escala 1:50 000, unidad mínima de mapeo de 1 ha, sistema jerárquico de 4 niveles con un máximo de 32 clases, confiabilidad global declarada del 85 %, imágenes RapidEye de 5 m. |
| Informes ONU-REDD (sistema de clasificación, superficie boscosa) | Definiciones y sistema de clasificación. **No publican una tabla de códigos numéricos del ráster**, así que de ellos no se deduce ninguna correspondencia numérica. |
| `Nodo_Suelos/MapServer/2` (REST) | La auditoría anterior (2026-11-21) lo consultó con `identify`. Los metadatos de la capa (tamaño de píxel, versión) no pudieron descargarse en esta sesión: el acceso web requería una aprobación que no se obtuvo. El script controlado los registra al ejecutarse. |

## 2. Reproducción

`python scripts/auditoria/b_sinia_2012.py` genera `datos/B_correspondencia_2012.csv` y `B_resumen.json`. Usa la evidencia ya registrada: 10 puntos aleatorios por código, comparados con el valor de píxel del servicio.

| Diagnóstico | Códigos | Superficie en la CHCP |
|---|---|---|
| Coincide (≥ 80 % mismo código) | 12 (1, 2, 8, 9, 10, 12, 23, 26–30) | **333 104 ha (97,7 %)** |
| Recodificación candidata (≥ 80 % hacia *otro* código único) | 2: 17 → 26 (Pasto, 90 %); 21 → 27 (Agua, 90 %) | 385 ha |
| Dispersa (sin código dominante ≥ 80 %) | 16: 3–7, 11, 13–16, 18–20, 22, 24, 25 | 7 556 ha |

- La mediana de superficie es de 7 576 ha en los códigos que coinciden y de 281 ha en los que no.
- El acuerdo aumenta con la superficie del código (Spearman ρ = 0,68).

## 3. Hipótesis evaluadas

| Hipótesis | Evidencia | Valoración |
|---|---|---|
| Codificación diferente (recodificación global) | En los 12 códigos grandes, valor y nombre del servicio coinciden con el asset. Los discrepantes no tienen un destino único: se reparten entre las clases vecinas dominantes. | **Descartada como causa general**; se mantiene abierta para 17 y 21. |
| Tabla de atributos o leyenda mal asociada | Los nombres del servicio para los valores 1, 2, 8, 9… coinciden con la leyenda del proyecto. | Poco probable para los códigos verificados. |
| Escala o bordes: clases pequeñas cerca de la unidad mínima de 1 ha, puntos sobre bordes | Las clases discrepantes son pequeñas y fragmentadas. El muestreo anterior no excluía bordes y muestreaba a 10 m sobre un ráster de 5 m. Los valores del servicio son los de las clases vecinas. | **Causa más probable**; se comprobará con la comparación controlada. |
| Alineación o proyección | No se detectó desplazamiento sistemático en las clases grandes (90–100 % de acuerdo). | Se mide con desplazamientos de ±10 m en el script controlado. |
| Versiones distintas del producto | No se pudo comprobar la fecha y versión del servicio en esta sesión. | Pendiente: el script controlado registra los metadatos. |
| NoData o banda incorrecta | Banda única `b1` y nada enmascarado en la CHCP. | Descartada. |

## 4. Comparación controlada (programada)

`scripts/auditoria/b_sinia_2012_controlado.py`, ejecutable desde Actions → «Auditoría SINIA 2012 controlada»:
- toma solo píxeles **interiores**: mismo código en una ventana de 55 × 55 m;
- usa 30 puntos por código con semilla fija;
- consulta además ±10 m en x e y para medir la estabilidad;
- descarga los metadatos y la leyenda de la capa 2.

Regla de decisión:

| Resultado | Decisión |
|---|---|
| ≥ 20 puntos interiores y ≥ 80 % del mismo código | Verificado |
| ≥ 90 % hacia otro código único | Recodificación candidata, que **requiere confirmación de MiAMBIENTE** antes de cambiar el diccionario |
| Otro caso | Sigue excluido |

## 5. Corrección aplicada

- **Máscara forestal 2012:** solo usa los códigos 1 y 2, ambos verificados al 100 %. Es la opción 4: ningún código no verificado alimenta análisis ecológicos. Se comprobó con `codigos_forestales('2012_detallado') == [1, 2]`.
- **Sesgo de esta exclusión:** los códigos forestales no verificados 3–7 suman unas 1 400 ha (0,4 % de la CHCP). La superficie forestal de 2012 queda *subestimada* como mucho en ese valor.
- **Sin cambios en el diccionario:** no se modificó ni se sobrescribió el asset ni el diccionario. Los códigos 17 y 21 **no** se recodifican sin confirmación oficial.

## 6. Comparabilidad 2012–2021

**No es defendible calcular transiciones**, y el módulo `comparabilidad_sinia` ya las bloquea:
- 2012 es un ráster de 5 m derivado de un mapa 1:50 000 con 32 clases y unidad mínima de 1 ha;
- 2021 es un vector o ráster de 10 m con otra leyenda;
- 18 de los 30 códigos de 2012 no están verificados;
- no hay datos de referencia independientes para las transiciones.

**Propuesta de armonización** (solo bosque / no bosque, después de la verificación):
- Bosque 2012 = códigos 1 y 2, más 3–7 si se verifican.
- Bosque 2021 = «Bosques y otras tierras boscosas».

Su validez debe comprobarse con una muestra independiente de transiciones (C) antes de publicar pérdida o ganancia.

## 7. Mapa 2021: leyenda oficial y diferencias del asset con el informe final

**Fuente.** Informe Final del Mapa de Cobertura Boscosa y Uso de Suelo 2021, de Panamá (MiAMBIENTE, Dirección de Información Ambiental, abril de 2022). Lo aplica `scripts/aplicar_informe_mcbyus2021.py`.

**Leyenda (Cuadro N° 2).** El informe publica las 33 categorías numeradas.
- **Códigos presentes en la CHCP (18):** el número coincide con el valor de píxel ya verificado espacialmente contra el servicio REST.
- **Códigos ausentes (15):** pasan del estado «sin documentación» o «solo grupo» a `documentada_informe_oficial`. Tienen nombre documentado, pero su valor de píxel no se ha comprobado y no se presentan como oficiales.

  Son: 4 orey, 5 cativo, 6 rafia, 13 playa y arena natural, 15 cítrico, 16 palma aceitera, 17 plátano/banano, 18 otro cultivo permanente, 19 arroz, 20 caña de azúcar, 21 horticultura mixta, 22 maíz, 31 estanque para acuicultura, 32 salinera y 33 albinas.
- **Definiciones (sección 7.3):** se resumen en `descripcion`.

**Hallazgo B5: el asset no coincide con el Cuadro N° 26 del informe en la cuenca.** El total es casi igual (−0,9 %; la cuenca «endorreica» del informe mide 344 225 ha). Sin embargo, varias categorías difieren mucho más de lo que explica el límite (`datos/B_2021_asset_vs_informe.csv`):

| Código | Categoría | Asset (ha) | Informe (ha) | Diferencia (ha) |
|---|---|---:|---:|---:|
| 1 | Bosque latifoliado mixto maduro | 123 494 | 128 585 | -5 091 |
| 2 | Bosque latifoliado mixto secundario | 74 474 | 63 651 | +10 823 |
| 3 | Bosque de mangle | 3 | 0 | +3 |
| 7 | Bosque plantado de coníferas | 111 | 149 | -38 |
| 8 | Bosque plantado de latifoliadas | 7 734 | 6 494 | +1 240 |
| 9 | Rastrojo y vegetación arbustiva | 2 793 | 3 367 | -574 |
| 10 | Vegetación herbácea | 6 666 | 6 454 | +213 |
| 11 | Vegetación baja inundable | 1 490 | 667 | +823 |
| 12 | Afloramiento rocoso | 497 | 774 | -277 |
| 14 | Café | 1 423 | 0 | +1 423 |
| 22 | Maíz | 0 | 1 | -1 |
| 23 | Piña | 1 580 | 2 627 | -1 047 |
| 24 | Otro cultivo anual | 10 | 0 | +10 |
| 25 | Área heterogénea de producción agrícola | 0 | 0 | +0 |
| 26 | Pasto | 66 407 | 75 207 | -8 800 |
| 27 | Superficie de agua | 43 713 | 45 384 | -1 671 |
| 28 | Área poblada | 8 813 | 9 681 | -867 |
| 29 | Infraestructura | 1 464 | 1 163 | +302 |
| 30 | Explotación minera | 370 | 22 | +349 |
| — | Total | 341 045 | 344 225 | -3 180 |

- **Bosque latifoliado secundario:** +10 823 ha en el asset.
- **Pasto:** −8 800 ha.
- **Café:** 1 423 ha en el asset y ausente en el informe.
- **Explotación minera:** 370 ha frente a 22 ha.

**Hipótesis.**
- **Más probable: versión distinta del mapa.** El diccionario cita una lámina oficial fechada el 2024-10-29 (`Cobertura_Boscosa_Uso_Suelo_2021_17x22_20241029.pdf`), posterior al informe.
- **Contribución menor: límite de la cuenca distinto** (unas 3 200 ha).

**Consecuencias.**
- Las cifras del geoportal no deben compararse directamente con las del informe de 2022.
- La exactitud oficial (C.6) se refiere a la versión del informe.

**Estado:** pendiente de confirmar con MiAMBIENTE qué versión es el asset. Los 18 códigos siguen verificados contra el servicio actual, que es la referencia para la leyenda.
