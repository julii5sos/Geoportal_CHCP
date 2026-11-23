# Decisiones metodológicas de la integración

Fecha: 2026-11-21. Repositorio de destino: `julii5sos/Geoportal_CHCP`.

## Fuentes revisadas

| Origen | Versión del método | Papel en la integración |
|---|---|---|
| `geoportal-chcp-conectividad-ecologica` (commit `67247c1`) | `MT-2026.7-DIAGNOSTICO-INTEGRADO` | **Base**: motores, API Flask, interfaz, datos y 193 pruebas. |
| `visor-preevaluacion-territorial` (commit `cb0e0db`) | `MT-2026.4` (UX-0.2.9) | Antecesor. Revisado regla por regla; no aporta lógica ausente en la base. |
| `conectividad_canal.zip` (diseño de referencia) | Motor propio (Dynamic World, FRAGSTATS, riesgo RF, KBA) | **Solo modelo visual**. Su motor no se incorporó. |

## Comparación MT-2026.4 frente a MT-2026.7

Comparación automática de constantes y funciones de `metodologia_indice.py`:

| Elemento | Visor (MT-2026.4) | Base (MT-2026.7) | Decisión |
|---|---|---|---|
| Peso NDVI | 0.0 (solo visual) | 0.5 con umbrales | MT-2026.7 (exigido por el prompt) |
| Puntaje máximo | 6.0 | 6.5 | MT-2026.7 |
| Umbrales JRC, Hansen, ESRI, GEDI | idénticos | idénticos | Sin cambio |
| Umbrales NDVI | ausentes | Δ ≤ −0.15, NDVI inicial ≥ 0.4, ≥ 0.12 ha y 5 %, ≥ 70 % válido | MT-2026.7 |
| `clasificar_prioridad` | idéntica | idéntica | Sin cambio |
| `evaluar_consistencia` | texto «recuperación» | texto «regeneración forestal» | Base |
| Prioridad integrada de visita | ausente | hasta +1.5 por corredor; máximo 8.0 | Base |
| Contexto estructural 2021 | ausente | clasifica, no suma puntos | Base |

No se modificó ninguna fórmula. `METODOLOGIA_VERSION` es ahora la única
declaración de versión (`chcp/nucleo/metodologia_indice.py`) y se expone en
`/api/v1/config` y en cada resultado de preevaluación. Las referencias históricas
a `MT-2026.15` y `MT-2026.17` pertenecían a la interfaz Streamlit y no se migraron.

## Elementos no migrados

- Interfaz Streamlit (`app.py`, `app_experiencia.py`, `app_temporal.py` y sus
  componentes): queda como respaldo en el repositorio de origen.
- Módulo de fincas: excluido como elemento principal, según el prompt maestro.
- Motor del ZIP de referencia (Dynamic World, riesgo Random Forest, KBA,
  prioridades proteger/restaurar/vigilar): metodología distinta, sin validar contra
  Earth Engine en su propio README. Puede evaluarse por separado.

## Cambios agregados en esta integración

- **Serie anual 2020–2025** (`annual_series`) en la preevaluación: superficie de
  degradación, deforestación y regeneración JRC TMF por año y pérdida Hansen del
  año (2021–2025). Las fuentes no se suman. Alimenta la gráfica «Evolución de
  cambios».
- **Gráfico de dinámica JRC**: usa las seis clases excluyentes de JRC TMF del año
  diagnóstico, de modo que los porcentajes suman 100 % del área. La pérdida Hansen
  se presenta aparte porque no es una clase excluyente de JRC.
- Leaflet se sirve localmente y la política CSP ya no permite scripts de terceros.

## Pendiente de verificación

- Ejecutar `scripts/verificar_geoportal_gee.py` con credenciales locales para
  comprobar la serie anual contra Earth Engine.
- Leyenda de los códigos 10–33 del ráster `SINIA_2021_USO_SUELO_RASTER10M`
  (contrastar con los geoservicios de MiAMBIENTE; no se inventan nombres).
- Secciones 13 en adelante del prompt maestro (ERI y siguientes), que llegaron
  incompletas.

## Hallazgo del precálculo por subcuenca (2026-11-21)

Con el índice `MT-2026.7` sin cambios, **47 de 54 territorios** (CHCP y 53 subcuencas)
resultan en prioridad **Alta**, 6 en Media y 1 en Preventiva. Los umbrales de
activación combinan una superficie absoluta pequeña (p. ej., 0.5 ha de deforestación
JRC o 0.18 ha de pérdida Hansen) con un porcentaje del área; fueron diseñados para
predios y polígonos pequeños. En subcuencas de miles de hectáreas el criterio
absoluto casi siempre se cumple y el índice tiende a saturarse.

No se modificó ninguna fórmula. Para comparar subcuencas entre sí el panel ordena
por puntaje y muestra superficies y porcentajes reales. Una recalibración de
umbrales por escala territorial sería una nueva versión del método y requiere
decisión explícita del equipo.

## Mapas de la ficha, análisis ripario y simulador de restauración (2026-11-22)

- **Mapas temáticos.** Ocho capas por territorio (SINIA 2021, JRC TMF 2025, Hansen 2021–2025, cambio ESRI 2017→2024, cambio NDVI 2020→2025, ERI, señales coincidentes y franja riparia) se piden a Earth Engine con `computePixels` en una malla Web Mercator (≤ 900 px por lado, ≥ 10 m) y se colorean con leyendas fijas en `chcp/gee/mapas_ficha.py`. Son ilustraciones: las superficies siguen calculándose a la resolución nativa de cada fuente.
- **Red hídrica.** Se reutiliza la misma definición del ERI: cauces MERIT Hydro con área de drenaje ≥ 1 km². La distancia al cauce se interpola (bilineal) desde la malla de 90 m, por lo que las franjas de 30, 50 y 100 m son indicativas. Desde 2026-11-23 los ríos dibujados son los del IGNTG (ver «Hidrografía oficial»). Para que el análisis ripario use también el IGNTG, la red debe subirse como asset del proyecto.
- **Bosque ripario.** SINIA 2021 (oficial, la misma base de la conectividad) y árboles ESRI 2024 como segunda fuente. Las orillas sin bosque se describen por clases de pendiente (0–15 %, 15–30 %, ≥ 30 %, Copernicus DEM 30 m); no es un modelo de erosión ni de caudal.
- **Simulador de restauración.** Recalcula en el navegador componentes, parches aislados y el IIC binario (misma fórmula que `metricas_paisaje.py`, verificada en `tests/test_red_conectividad_js.py`). Una franja restaurada se modela como un enlace nuevo; su superficie no se suma al hábitat (resultado conservador). Las brechas candidatas combinan las del motor y el enlace más corto entre cada par de redes (≤ max(4 × umbral, 2 km)), medido entre vértices. La priorización ordena por ganancia de IIC por hectárea con el ancho elegido (30/60/100 m). Es un resultado estructural: no considera resistencia del paisaje, tenencia ni costos.

## Análisis de polígonos propios sin Earth Engine en tiempo real (2026-11-22)

- **Precálculo:** el precálculo de cada subcuenca guarda, además de los mapas coloreados, **mapas de valores** sin pérdida (`data/mapas/<id>/<capa>.v.png`, escala de grises).
  - Capas: JRC 2025, Hansen 2021–2025, cambio ESRI, SINIA 2021, coincidencias, franja riparia, ERI, cambio de NDVI y altura GEDI.
  - Una capa auxiliar de bits marca la línea base arbórea Hansen, el NDVI válido, el descenso fuerte de NDVI y el GEDI válido.
  - La codificación se publica en `codificacion_valores`.
- **Cálculo en el navegador:** al dibujar o subir un polígono, el navegador lo rasteriza sobre la malla de cada subcuenca que toca, suma superficies por clase y aplica **exactamente** las reglas MT-2026.7: señales, puntaje, consistencia y prioridad de visita con corredores del Almanaque Azul. `tests/test_analisis_poligono_js.py` compara 300 casos con `metodologia_indice.py`.
- **Red de parches:** usa los parches oficiales 2021 que toca el polígono y sus enlaces precalculados (umbral de 500 m).
- **Limitaciones:**
  - El píxel es de 10 a 30 m según la subcuenca. En polígonos menores de ~20 píxeles las superficies son aproximadas.
  - Los resultados corresponden a la fecha del último precálculo.
  - La versión con Earth Engine sigue siendo la referencia para áreas fuera de la CHCP o para parámetros distintos.

## Rutas de menor costo al Corredor Biológico Mesoamericano (2026-11-22)

- **Objetivo:** desde un parche de bosque del simulador, mostrar por dónde conectaría con el Corredor Biológico Mesoamericano cruzando la menor cantidad posible de terreno hostil. Responde en parte a la limitación de distancia euclidiana del simulador (auditoría E.2, punto 3).
- **Destinos:** los tramos mesoamericanos de la capa de corredores del Almanaque Azul (`es_mesoamericano`).
  - **Tramo este:** unas 89 000 ha dentro de la cuenca.
  - **Tramo San Lorenzo:** unas 777 ha dentro de la cuenca.
  - **Tramo oeste:** a unos 16 km de la cuenca; no se evalúa.
- **Superficie de resistencia:** mapas de valores precalculados de la cuenca completa (`data/mapas/chcp`), reducidos por moda a ≤ 1 000 celdas por lado. Valores relativos al bosque sin perturbación:

  | Cobertura | Fuente | Resistencia |
  |---|---|---|
  | Bosque | SINIA 1 con JRC 1 | 1 |
  | Bosque degradado | SINIA 1 con JRC 2 o 3 | 2 |
  | Regeneración | SINIA 2 con JRC 4 | 5 |
  | Otras tierras | SINIA 2 | 25 |
  | Área construida | ESRI 2024, clase 7 | 100 |
  | Agua | SINIA 3 o JRC 5 | 1 000 |
  | Sin dato (fuera de la cuenca) | — | sin paso |

  Son un **supuesto del modelo** (escala ordinal de opinión experta, práctica habitual según Zeller et al. 2012). No se calibraron con datos de movimiento de ninguna especie. La capa ESRI 2024 (`esri_2024`, solo valores) se genera a partir de la actualización de datos posterior a este cambio; mientras falte, el área construida cuenta como «otras tierras» y la interfaz lo indica.
- **Algoritmo:**
  - Costo acumulado (Dijkstra, 8 vecinos, costo de paso = media de las resistencias × longitud) desde cada tramo.
  - La ruta parte de la celda del parche con menor costo y sigue las celdas previas.
  - La **franja de alternativas** reúne las celdas donde costo(parche → celda) + costo(celda → tramo) ≤ (1 + t) × costo óptimo, con t = 5, 10 o 20 %. Es un corredor de menor costo al estilo de Linkage Mapper.
- **Resultados por ruta:**
  - longitud total;
  - kilómetros por bosque;
  - kilómetros fuera del bosque («a restaurar») y número de tramos continuos fuera del bosque;
  - kilómetros sobre agua y sobre área construida.
- **Pruebas:** `tests/test_rutas_corredor_js.py`.
- **Limitaciones:**
  - Celdas de unos 40 a 230 m según la versión de los datos.
  - Solo dentro de la cuenca.
  - No considera tenencia de la tierra, carreteras (salvo como área construida) ni pendiente.
  - Una ruta hipotética no garantiza su uso por la fauna y requiere verificación en campo.

## Correcciones del simulador de restauración tras la revisión científica (2026-11-22)

Detalle y estado en `docs/auditoria/E_COHERENCIA_ECOLOGICA.md` (tabla de limitaciones) y en la matriz (E6–E11).

- **Red ampliada (precálculo, `red_simulacion` versión 2):** se añade al resultado de `analizar_fragmentacion_geojson` sin cambiar las métricas oficiales ni MT-2026.7.
  - **Nodos:** parches de la subcuenca con su superficie completa (sin cortar en la divisoria) y parches hasta `MARGEN_SIMULACION_M = 1000` m fuera. El margen no supera el contexto exterior leído del asset (5 km en el precálculo).
  - **Aristas:** todas las de hasta `DISTANCIA_MAX_SIMULACION_M = 1000` m, con su distancia. El navegador las filtra por umbral (250, 500 y 1 000 m).
  - **Área de paisaje:** subcuenca + margen. Se conserva la red anterior (aristas al umbral y superficies recortadas) por compatibilidad.
- **Conectividad equivalente:** EC = √N, con N = Σᵢ Σⱼ aᵢ·aⱼ/(1 + nlᵢⱼ) (el numerador del IIC). No depende del área de paisaje y es comparable entre subcuencas. La ganancia relativa es la misma en IIC, N y EC².
- **Ganancia exacta por enlace (`gananciaEnlace`):**
  - *Entre redes distintas:* ΔN = 2 Σₖ Σₘ Sₐ(k)·S_b(m)/(2 + k + m), donde Sₐ(k) es la superficie a k saltos de a.
  - *Dentro de la misma red:* se recalcula exactamente el acortamiento de caminos con la matriz de saltos de la componente (hasta 3 000 parches).
  - Se verifica frente al recálculo completo en 300 grafos aleatorios.
- **Efectividad según el ancho:** e(ancho) = min(1, ancho / ancho de referencia); referencia por defecto de 100 m. Supuesto explícito para no favorecer franjas angostas que serían casi todo borde; los efectos de borde en bosques tropicales penetran de decenas a cientos de metros (Laurance et al. 2002; Broadbent et al. 2008). No está calibrado con especies.
- **Cruces de agua y zonas construidas:** cada brecha se muestrea cada ⅓ de píxel sobre la malla completa de la cuenca, con la misma clasificación que las rutas al corredor. Se marca cuando cruza al menos un píxel completo de agua o de zona construida (ESRI 2024, clase 7), para no marcar orillas.
- **Robustez:** puesto de cada brecha con cada umbral. «Robusta» = entre las primeras (25 % de las candidatas, entre 3 y 10) con todos los umbrales; «depende del umbral» = solo con alguno.
- **Candidatos:**
  - brechas del motor;
  - el enlace más corto entre cada par de redes;
  - el enlace más corto entre las redes que se forman con 250 m, que con umbrales mayores acortan caminos.
  - Al menos un extremo debe estar en la subcuenca.
- **Plan voraz:** hasta 8 pasos; en cada uno se elige la mayor ganancia × efectividad / ha sobre la red ya modificada. No garantiza el óptimo combinatorio.

## Hidrografía oficial y cobertura detallada en las rutas al corredor (2026-11-23)

### Red hidrográfica del IGNTG

- **Fuente:** Instituto Geográfico Nacional Tommy Guardia, «Hidrografía y drenajes» 2022, de los mapas topográficos 1:25 000 (EPSG:32617). Se usaron dos capas:
  - `Redhidrologica_2022`: 52 ríos principales en todo el país, 7 en la cuenca.
  - `Redhidrologica2_2022`: 18 405 tramos de ríos y quebradas, 861 en la cuenca.

  En total, unos 2 570 km de cauces dentro de la CHCP.
- **Producto derivado:** `scripts/preparar_hidrografia_igntg.py` genera `data/hidrografia/riparia_igntg.v.png` y su `.json`. Es una malla EPSG:3857 de 20 m sobre la cuenca más 2 km, con la distancia al cauce por clases:
  - 1 = cauce (≈ ±10 m);
  - 3 = ≤ 30 m;
  - 4 = ≤ 50 m;
  - 5 = ≤ 100 m.

  También genera `data/hidrografia/rios_igntg_chcp.geojson`: los cauces recortados a la cuenca + 2 km, simplificados a 5 m, con nombre, nombre alternativo, tipo, afluente de y red (principal o secundaria). La red del IGNTG es de **acceso abierto** (confirmado por el equipo del proyecto, 2026-11-23); se cita al IGNTG como productor.
- **Ríos dibujados:** `rios.json` de cada territorio se recorta localmente de esa red (`chcp/territorio/hidrografia.py`, sin Earth Engine) y sustituye a HydroSHEDS. Solo se recurre a HydroSHEDS en las subcuencas donde el IGNTG no cartografía cauces (5 de las 25 con mapas en esta versión). La fuente queda en `mapas.rios_fuente`.
- **Uso:** la franja ribereña de las rutas es de **≤ 50 m** a cada lado del cauce. La Ley 1 de 1994 (Ley Forestal), art. 23, protege a cada lado de ríos y quebradas una franja igual o mayor al ancho del cauce y nunca menor de 10 m. La banda de 50 m es mayor que ese mínimo legal porque la malla de rutas tiene celdas de 40 a 80 m, y coincide con una de las bandas del análisis ripario del geoportal.
- **Remuestreo:** a la malla de la cuenca se pasa con el mínimo de 2 × 2 submuestras, para no perder cauces estrechos. En la reducción de la malla de rutas, una celda es ribereña si al menos el 25 % de sus subceldas lo son.
- **Pendiente:** el análisis ripario de la ficha (ERI) sigue con MERIT Hydro. Pasarlo al IGNTG exige subir la red como asset de Earth Engine.

### Cobertura y uso del suelo 2021 detallada (SINIA–MiAMBIENTE)

- **Nueva capa de valores** `sinia_2021_detalle` en los mapas precalculados, tomada del raster `SINIA_2021_USO_SUELO_RASTER10M`. La correspondencia código → categoría se lee de `data/leyendas_sinia.json`: los 18 códigos presentes en la CHCP están verificados espacialmente. Un código no verificado se muestra como «Código N (sin verificar)».
- **Composición de lo que corta un corredor:**
  - en cada brecha se muestrea la línea sobre la malla completa;
  - en cada ruta se recorren sus celdas.

  En ambos casos se suma la longitud **fuera del bosque** por código detallado («Corta: Pasto 70 % · Área poblada 20 %…»). Donde falta el código, se usa la clase del modelo.
- **Base forestal:** la categoría general «Bosques y otras tierras boscosas» incluye en la cuenca unas 7 845 ha de plantaciones (códigos 7 y 8) y 2 793 ha de rastrojo (código 9), según el inventario de `docs/DICCIONARIO_CAPAS_SINIA.md`. Las métricas oficiales siguen usando la categoría general. Las rutas las distinguen cuando está la capa detallada.

### Resistencias de las rutas (supuesto del modelo, sin calibrar con especies)

| Clase | Regla | Resistencia |
|---|---|---|
| Bosque de ribera | Bosque natural o secundario a ≤ 50 m de un cauce del IGNTG | 0,5 |
| Bosque | SINIA general 1, JRC sin perturbación | 1 |
| Bosque degradado | SINIA general 1 con JRC 2 o 3 | 2 |
| Plantación | Detallado 7 u 8 | 3 |
| Regeneración o rastrojo | Detallado 9, o JRC 4 | 5 |
| Ribera sin bosque | Otras tierras a ≤ 50 m de un cauce | 10 |
| Otras tierras | Pasto, cultivos, vegetación herbácea, etc. | 25 |
| Zona construida | Detallado 28 (poblada), 29 (infraestructura), 30 (minería), o ESRI 2024 clase 7 | 100 |
| Agua | Detallado 27, SINIA general 3 o JRC 5 | 1 000 |

- La ribera sin bosque tiene una resistencia menor que las otras tierras: así la ruta tiende a seguir los ríos donde habría que restaurar, que son franjas protegidas por ley.
- Las rutas informan los km por ribera con bosque, los km de ribera sin bosque y los km por plantación.
