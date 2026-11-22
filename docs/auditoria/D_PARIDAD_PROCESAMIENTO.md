# D · Procesamiento directo, precalculado y local: trazabilidad y paridad

## 1. Inventario de la arquitectura

| Módulo | Dónde calcula | Tipo |
|---|---|---|
| Plataforma completa (Flask, `webapp/service.py`) | Earth Engine en el momento de la solicitud; caché del servidor | **A** |
| Panel, ficha, mapas temáticos, sitios de campo (`scripts/precalcular_panel.py` en GitHub Actions) | Earth Engine en lotes mensuales o manuales | **B** |
| Plataforma publicada: capas y consulta por subcuenca | Archivos de tipo B | **B** |
| Análisis de polígonos en el navegador (`analisis_poligono.js`) | Mapas de valores *.v.png (tipo B) rasterizados en el navegador | **C** |
| Simulador de restauración (`restauracion.js`) | Red de parches de tipo B recalculada en el navegador | **C** |
| Validación (`evaluar_validacion.py`) | Python, sin Earth Engine, al publicar el sitio | Estadística sobre interpretaciones |

## 2. Correcciones aplicadas

| ID | Problema | Corrección |
|---|---|---|
| D1 | Los resultados no indicaban su procedencia. | `chcp/nucleo/procesamiento.py` define los tipos A, B y C. Cada resultado muestra un recuadro de **procedencia** con:<br>• tipo de procesamiento;<br>• fecha del cálculo;<br>• versión de datos;<br>• metodología;<br>• versión del código.<br><br>Dónde aparece:<br>• **Tipo B:** panel, ficha y plataforma publicada.<br>• **Tipo C:** polígonos y simulador.<br>• **Tipo A:** plataforma completa; la API añade `procesamiento` y, si el resultado viene de la caché, conserva la fecha original. |
| D2 | La fecha visible era la de consulta. | Se muestra la fecha de procesamiento (`procesado` por territorio y `fecha_procesamiento` global). |
| D3 | Las actualizaciones parciales mezclaban versiones sin avisar. | `estado_actualizacion` (completa o parcial, número de territorios por versión) se sirve en la API y el recuadro marca «actualización parcial». Además:<br>• cada territorio guarda su `version_datos`;<br>• `data/registro_versiones.json` registra cada ejecución (código, `workflow_run`, metodología, territorios procesados y con error, estado). |
| D4 | La estimación local no tenía tolerancias. | Regla de error de borde: **e = perímetro × píxel / (2 × área)**.<br>• e ≤ 10 %: resultado normal.<br>• 10 % < e ≤ 25 %: resultado «aproximado», con la categoría marcada como **no concluyente**.<br>• e > 25 %: no se calcula y se pide el análisis directo con Earth Engine.<br><br>Esto equivale a unas 36 ha mínimas con píxel de 30 m y 4 ha con píxel de 10 m, para un cuadrado con e ≤ 10 %. |
| D5 | Conectividad de polígonos pequeños. | La interfaz rotula «parches 2021 que toca (área completa)»: se describe el contexto de la red y **no** se extrapolan métricas de la subcuenca. El estado estructural no suma puntos (como en MT-2026.7). |
| D6 | No se habían comparado los métodos. | `chcp/nucleo/estimacion_local.py` replica en Python el cálculo del navegador; su igualdad con el JavaScript está comprobada en `tests/test_analisis_poligono_js.py`. `scripts/auditoria/d_paridad.py` y el workflow «Auditoría de paridad de procesamiento» comparan seis polígonos (pequeño de 5 ha, mediano de 100 ha, extenso de unas 1 400 ha, irregular, que cruza subcuencas y junto al límite): superficie, clases, señales, puntaje y categoría, con diferencias absolutas y relativas. |

## 3. Paridad: estado

**Pendiente de ejecución.**
- Requiere Earth Engine y los mapas de valores de la versión 3 de datos, que aún no están publicados para las 53 subcuencas.
- Hasta ejecutarla, **no se declara equivalencia** entre los tipos A y C.
- Que coincida la categoría final no basta: el criterio es la diferencia de cada métrica frente a la tolerancia de la sección 4.

## 4. Tolerancias propuestas (a confirmar con la paridad)

| Fuente de diferencia | Tolerancia | Justificación |
|---|---|---|
| Rasterización del borde | ≤ e (regla de D4) | Error esperado por píxeles parcialmente dentro |
| Remuestreo a la malla Web Mercator | ≤ 5 % por clase en polígonos ≥ 400 píxeles | Vecino más próximo sobre píxeles de 10–30 m |
| Máscaras (NDVI, GEDI) | ± 5 puntos porcentuales de cobertura válida | Cobertura evaluada a escala de la malla |
| Señales y puntaje | Pueden diferir cerca del umbral | Se informa la diferencia; si cambia una señal, prevalece Earth Engine |

## 5. Seguridad y operación

- **Credenciales:**
  - Solo existen como secreto cifrado de GitHub (`GEE_SERVICE_ACCOUNT_JSON`).
  - Nunca llegan al navegador ni al sitio publicado.
  - La cuenta de servicio tiene permisos mínimos: Earth Engine Resource Viewer y Service Usage Consumer, sin `maps.create`.
- **Concurrencia:** los workflows de Earth Engine comparten `concurrency: actualizar-datos`, así que no corren en paralelo.
- **Uso intensivo:** el servidor Flask limita las solicitudes por minuto (`WEB_ANALYSIS_RATE_LIMIT`).
- **Geometrías de los usuarios:** el análisis local no envía el polígono a ningún servidor.
- **Fallos:**
  - El guardado usa `if: always()` y conserva los territorios publicados.
  - Lo parcial queda señalado en el registro y en la interfaz; no se publica un sitio con territorios faltantes.
  - Pages ejecuta las pruebas antes de desplegar.
- **Mapas grandes:** la descarga por bloques para mapas que superan el límite de reproyección está en el PR #7, pendiente de fusión.
