# Validación científica e incertidumbre

El geoportal muestra superficies de mapa (píxeles clasificados por JRC, Hansen, ESRI o SINIA). Toda clasificación tiene errores de omisión y de comisión, por lo que **la superficie de mapa no es la superficie real**. Este módulo aplica las buenas prácticas de Olofsson et al. (2014), adoptadas por FAO y GFOI, para estimar:

- la **matriz de confusión** en proporciones de área;
- la **exactitud global**, de **usuario** (1 − comisión) y de **productor** (1 − omisión), con intervalo de confianza del 95 %;
- la **superficie ajustada por error** de cada clase, con su intervalo de confianza.

Código: `chcp/nucleo/validacion.py` (Olofsson 2014 y, para evaluar otros mapas con la misma muestra, Stehman 2014). Reproduce el ejemplo publicado del artículo (`tests/test_validacion.py`): deforestación 21 158 ± 6 158 ha, exactitud global 0,947 ± 0,018.

## 1. Diseño de muestreo

- **Mapas evaluables** (`chcp/gee/muestreo_validacion.py`):
  - `senal_perdida`: la señal de pérdida del geoportal. Pérdida = al menos dos fuentes coinciden; bosque = bosque JRC sin perturbación y sin señales; no bosque = el resto.
  - `sinia_2021`: cobertura general oficial 2021 (tres categorías).
- **Estratos** = clases del mapa. Muestreo aleatorio estratificado con semilla fija (reproducible).
- **Tamaño**: ecuación 13 de Olofsson et al. (2014) con exactitudes esperadas conservadoras y un error estándar objetivo de la exactitud global (0,015 por defecto). Cada estrato recibe un **mínimo de 75 puntos** para que la exactitud de usuario de las clases raras (pérdida) tenga un intervalo útil; el resto se reparte en proporción al área.
- **Unidad de evaluación**: píxel de 30 m (`senal_perdida`) o 10 m (`sinia_2021`).

Generación: Actions → **Generar muestra de validación** (o `python scripts/generar_muestra_validacion.py --mapa senal_perdida`). Se escriben en `data/validacion/<mapa>/`:

| Archivo | Contenido |
|---|---|
| `diseno.json` | Superficies por estrato, tamaño, asignación, semilla y fecha |
| `muestra.csv` | Puntos en orden aleatorio, **sin la clase del mapa** |
| `estratos.csv` | Clase del mapa de cada punto (solo para el cálculo) |
| `muestra.kml` | Puntos para Google Earth Pro |

## 2. Interpretación de referencia (ciega)

La clase de referencia debe asignarse **sin mirar la clase del mapa** (no abrir `estratos.csv` ni las capas del geoportal durante la interpretación).

- **Fuentes de referencia**: imágenes de mayor resolución y de varias fechas. Pueden ser las imágenes históricas de Google Earth Pro, los mosaicos Planet-NICFI, las imágenes de Esri o la visita de campo.
- **Período**: para `senal_perdida`, 2020–2025. Si el punto está en el borde de un cambio, se interpreta el píxel de 30 m centrado en él.
- **Campos de `muestra.csv`**:
  - `clase_referencia`: código, clave o etiqueta de la leyenda (`1`, `perdida`, «Pérdida o degradación de bosque»).
  - `confianza`: alta, media o baja.
  - `interprete`, `fecha`, `fuente_imagen` y `notas`.
- **Control de calidad**: se recomienda que un segundo intérprete revise al menos el 10 % de los puntos y todos los de confianza baja.

Herramientas: la página **Validación** del geoportal (ficha por punto con imagen satelital, botones de clase y exportación del CSV), Google Earth Pro (`muestra.kml`) o QGIS.

## 3. Resultados

Al subir `muestra.csv` interpretado a `data/validacion/<mapa>/` en GitHub, el flujo de publicación ejecuta `scripts/evaluar_validacion.py` y la página Validación muestra los resultados.

- **Resultados parciales**: los resultados se calculan desde que haya al menos dos puntos interpretados por estrato, pero son preliminares hasta completar la muestra.
- **Unidad del intervalo**: los intervalos se expresan en hectáreas (superficie) o en puntos porcentuales (exactitud).

## Limitaciones

- La referencia también tiene error. La confianza de cada punto debe registrarse y analizarse por separado si hay muchos puntos dudosos.
- La exactitud se refiere al mapa evaluado en la CHCP y en el período indicado. No se transfiere a otras regiones ni a otros años.
- Los resultados no modifican automáticamente el índice de preevaluación. Sirven para comunicar la incertidumbre y, si procede, recalibrar umbrales en una versión metodológica nueva.

**Referencia:** Olofsson, P., Foody, G. M., Herold, M., Stehman, S. V., Woodcock, C. E., & Wulder, M. A. (2014). Good practices for estimating area and assessing accuracy of land change. *Remote Sensing of Environment*, 148, 42–57.
