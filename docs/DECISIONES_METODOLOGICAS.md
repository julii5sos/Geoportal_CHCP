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
