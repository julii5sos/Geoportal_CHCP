# Comparabilidad entre coberturas oficiales SINIA–MiAMBIENTE

**Implementación:** `chcp/catalogos/comparabilidad_sinia.py` · **API:**
`GET /api/v1/sinia/catalog` (campo `comparability`) y
`POST /api/v1/sinia/statistics` con dos productos.

## Criterios para calcular transiciones

Una pérdida, ganancia o transición entre dos productos solo se calcula si se
cumplen **todos** los criterios:

| Criterio | Pregunta |
|---|---|
| Correspondencia temática verificable | ¿Cada categoría de un año tiene una equivalencia documentada en el otro? |
| Reglas de reclasificación explícitas | ¿Existe una tabla `código → grupo` para ambos productos? |
| Escalas compatibles | ¿Tienen escala cartográfica o resolución equivalentes? |
| Proyección y alineación | ¿Comparten malla o existe un remuestreo categórico justificado? |
| Área válida común | ¿Se limita la comparación a píxeles con dato en ambos? |
| Fechas comparables | ¿Se conoce la fecha de las imágenes base de cada producto? |
| Interpretación de incertidumbre | ¿Hay exactitud temática o matrices de confusión publicadas? |

## Situación actual

**Ningún par de productos cumple los siete criterios.** Por eso la aplicación
ofrece únicamente:

- mapas con comparador deslizante y leyendas independientes;
- superficie por categoría de cada producto por separado;
- diferencias *descriptivas* por grupo derivado, en puntos porcentuales, con la
  advertencia de que no representan cambio real.

Solo se cumple hoy el criterio de reglas de reclasificación explícitas.

| Par | Principal impedimento |
|---|---|
| 1992 ↔ 2000 | Misma escala (1:250.000) y leyendas casi equivalentes, pero sin dictamen del productor ni área válida común documentada. **Candidato más cercano a la comparabilidad.** |
| 2012 detallado ↔ 2021 detallado | Escalas 1:50.000 y 1:25.000; el 2021 tiene códigos sin verificar. |
| 2019 ↔ 2021 vector ↔ 2023 | Tres categorías amplias, pero métodos y escalas distintos (≈19.8 m, vector 1:25.000, 10 m). |
| Cualquier histórico ↔ reciente | Diferencias de escala (1:250.000 frente a 1:25.000–1:50.000) y de leyenda. |

## Qué haría falta para habilitar una transición

1. Documento del productor que declare la equivalencia temática entre ambos años.
2. Fecha de las imágenes base de cada producto.
3. Exactitud temática publicada (o validación propia con puntos de referencia).
4. Área válida común calculada sobre la malla del producto más grueso, con remuestreo
   por moda (nunca interpolación bilineal en clases).

Hasta entonces, el seguimiento temporal se hace con JRC TMF, Hansen y ESRI, que sí
están diseñados como series.
