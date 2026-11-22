# A · Saturación del índice de prioridad territorial (MT-2026.7)

**Estado:** causa demostrada. MT-2026.7 se conserva sin cambios. Se publica una variante **experimental** de indicadores continuos y relativos, `MT-2026.7-SUBC-EXP-1`, que no asigna categorías.

**Reproducción:** `python scripts/auditoria/a_saturacion.py`. Produce:
- `datos/A_tabla_territorios.csv`, una fila por territorio con superficies, porcentajes, motivo de activación, puntaje, categoría e indicadores relativos;
- `datos/A_resumen.json`, con la distribución, la sensibilidad, el escenario sintético y la redundancia.

**Fuente:** `data/estadisticas_territoriales.json`, el resultado de Earth Engine publicado, generado el 2026-11-22. Para 53 subcuencas son datos de la versión 1; la CHCP completa ya está en la versión 2.

## 1. Lo que se reprodujo

| Métrica (53 subcuencas) | Valor |
|---|---|
| Categorías | Alta 46 · Media 6 · Preventiva 1 · Baja 0 |
| Puntajes distintos | 7 (0,5; 2,0; 4,0 ×25; 4,5; 5,0; 5,5 ×9; 6,0 ×10) |
| Entropía normalizada de categorías | 0,405 (1 = reparto uniforme) |
| Frecuencia de señales | JRC 52 · Hansen 46 · ESRI 19 · GEDI 13 · NDVI 1 |
| Spearman superficie ↔ puntaje | 0,25 |

Con la CHCP incluida, los 54 territorios reproducen la cifra documentada: 47 Alta, 6 Media y 1 Preventiva.

## 2. Causas identificadas

1. **La señal JRC mide un legado, no urgencia reciente.** Se calcula sobre el *estado* de JRC TMF a diciembre de 2025: las clases «deforestado» y «degradado» acumulan perturbaciones desde 1990.
   - La mediana de perturbación acumulada por subcuenca es del 16 % del territorio (5,2 % deforestado y 8,9 % degradado).
   - Por eso JRC se activa en 52 de 53 subcuencas. En 46 lo hace por el **criterio relativo** (≥ 1 % deforestado o ≥ 5 % degradado), no solo por el absoluto.
   - Ningún ajuste de umbral resuelve esto: la serie anual muestra que el estado deforestado incluso *disminuye* entre 2020 y 2025 (los píxeles pasan a regeneración).
2. **Hansen usa solo un umbral absoluto: 0,18 ha, unos dos píxeles de 30 m.**
   - En la subcuenca mediana basta el 0,006 % del territorio para activarlo.
   - De todos modos, las 46 subcuencas donde se activa tienen una pérdida mediana del 1,2 % del territorio en 2021–2025, así que la activación no es trivial.
   - El problema es que una señal binaria no distingue 0,03 % de 7 %.
3. **La estructura del puntaje satura.**
   - JRC (2,0) + Hansen (2,0) = 4,0 ≥ 3,0, de modo que dos fuentes bastan para «Alta».
   - Las dos fuentes comparten imágenes Landsat y están correlacionadas: se suman como si fueran evidencias independientes.
4. **Dependencia del tamaño, demostrada con un escenario sintético.** Con las *mismas proporciones* de cambio (0,05 % deforestado, 0,2 % degradado, 0,02 % de pérdida Hansen, 1 % de salida ESRI), el resultado depende solo de la superficie:

   | Superficie | Puntaje | Categoría |
   |---|---|---|
   | 1 a 500 ha | 0 | Baja |
   | 2 000 ha o más | 4,0 | Alta |

**Sensibilidad.** Ni multiplicando por 10 los umbrales absolutos se reduce la saturación: siguen 46 en Alta. Con ×100 quedan 35. Solo eliminando por completo los criterios absolutos bajan a 20 en Alta y 26 en Media, y aun así JRC sigue activo por su componente acumulado. La correlación entre el puntaje base y el de umbrales ×10 es ρ = 0,999. **Por lo tanto, la saturación no se corrige ajustando umbrales.**

## 3. Caso contrastante

| Subcuenca | Superficie | MT-2026.7 | Pérdida reciente relativa (Hansen) |
|---|---|---|---|
| Río Chagres | 32 193 ha | 4,0 · Alta | 0,02 % del bosque por año |
| Río Los Hules | 4 137 ha | 6,0 · Alta | 1,47 % del bosque por año (≈ 75 veces más) |
| Río Las Cascadas | 9 041 ha | 4,0 · Alta | 0,013 %/año |

## 4. Variante experimental (no sustituye a MT-2026.7)

Implementación: `chcp/nucleo/indicadores_relativos.py`. La API del panel la sirve en `indicadores_relativos`, sin tocar el archivo de datos.

| Indicador | Fórmula | Valor de la CHCP |
|---|---|---|
| Pérdida reciente | Hansen 2021–2025 ÷ bosque SINIA 2021 ÷ 5 | 0,41 %/año |
| Salida de árboles | ESRI 2017→2024 ÷ árboles 2017 | 5,4 % |
| Perturbación acumulada (legado) | JRC deforestado + degradado ÷ superficie | 15,6 % |
| Descenso de vigor | NDVI fuerte ÷ superficie | 1,2 % |

**Capacidad discriminatoria:** 47 a 53 valores distintos (frente a 7 puntajes). La correlación con la superficie es ρ = 0,005–0,22, y la sensibilidad al denominador (bosque SINIA frente a árboles ESRI) da ρ = 0,98.

**Redundancia:** pérdida Hansen ~ salida ESRI ρ = 0,59; salida ESRI ~ NDVI ρ = 0,65; perturbación acumulada ~ resto ρ ≤ 0,52. Se publican **por separado**, sin sumarlos.

**Referencia:** se usa el valor de la CHCP completa (razón 1 = igual que la cuenca), no percentiles del conjunto. Así se evita una categoría que dependa de qué subcuencas se analizaron.

**Lo que no se hizo, a propósito:**
- No se fijaron umbrales ni categorías: no hay evidencia ecológica que los calibre.
- No se reutilizaron los pesos de MT-2026.7.
- No se forzó una distribución equilibrada.

**Distinción conceptual:**
- *Urgencia por cambios:* la pérdida reciente relativa y la salida de árboles.
- *Diagnóstico territorial:* el legado JRC.
- *Importancia ecológica:* corredores, ERI y red de parches, sin sumar.
- *Prioridad de intervención:* decisión técnica que combina lo anterior y que la plataforma **no** automatiza.

## 5. Pendiente

- La versión 3 de los datos agrega `metricas_indice` (superficie válida NDVI y GEDI, línea base Hansen). Con ella se podrá completar la tabla con la cobertura válida por fuente.
- Una variante con categorías requiere que el equipo científico apruebe umbrales justificados, idealmente contrastados con la validación independiente (C).
