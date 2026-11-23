# Geoportal CHCP · Conectividad ecológica de la Cuenca del Canal de Panamá

**[Abrir el geoportal en línea](https://julii5sos.github.io/Geoportal_CHCP/)** · [Descargar la versión sin conexión (.zip)](https://julii5sos.github.io/Geoportal_CHCP/descargas/Geoportal_CHCP_sin_conexion.zip) · [Metodología](METODOLOGIA.md) · [Auditoría científica](docs/auditoria/MATRIZ_HALLAZGOS.md)

Herramienta de **preevaluación ambiental y análisis geoespacial** para identificar y
justificar áreas prioritarias para la conservación, la restauración y la reforestación en
la **Cuenca Hidrográfica del Canal de Panamá (CHCP)**. Considera la cobertura boscosa, la
fragmentación del paisaje y la conectividad ecológica.

> **Evaluación preliminar.** Todos los resultados se calculan con imágenes satelitales y
> cartografía oficial. Indican dónde mirar primero y por qué. No sustituyen la verificación
> de campo, no predicen deforestación y no demuestran movimiento de fauna.

## Objetivo

Integrar información satelital e indicadores ambientales para evaluar el estado de los
ecosistemas forestales y su contribución a la conectividad estructural del paisaje,
especialmente en relación con los corredores biológicos y el **Corredor Biológico
Mesoamericano**.

El propósito es aportar información técnica que:

- respalde la selección de sitios para proyectos ambientales;
- facilite la toma de decisiones;
- oriente los esfuerzos hacia áreas estratégicas para mantener o recuperar la continuidad
  de los bosques.

## Preguntas que responde

| Pregunta | Dónde se responde |
|---|---|
| ¿Esta área ha perdido o degradado su bosque? ¿Cuánto y cuándo? | **Ficha técnica** y **Plataforma SIG** (preevaluación MT-2026.7, cambio de cobertura) |
| ¿Coinciden varias fuentes satelitales en la pérdida? | Mapa de **señales coincidentes** (JRC, Hansen y ESRI) |
| ¿Qué tan fragmentado está el bosque? | **Fragmentación**: parches, borde, bosque interior y cohesión |
| ¿Qué parches sostienen la conectividad del paisaje? | **Conectividad estructural**: red de parches, IIC y parches clave (dIIC) |
| ¿Dónde convendría restaurar para reconectar el bosque? | **Simulador de restauración**: escenarios y ganancia de conectividad |
| ¿Por dónde podría conectarse un parche con el Corredor Mesoamericano? | **Rutas al corredor**, por menor costo y bosques de ribera (hidrografía IGNTG) |
| ¿Cómo evolucionó cada fuente año por año? ¿Qué cambió entre dos años? | **Plataforma SIG → temas**: barra de años, series y comparación (JRC 1990–2025, Hansen 2001–2025, ESRI y NDVI 2017–2025) |
| ¿Qué cobertura oficial había en cada año? | **Coberturas SINIA**: 8 productos de MiAMBIENTE (1992–2023) |
| ¿Y en mi propia finca o parcela? | **Plataforma SIG → Polígono**: dibuje o suba un GeoJSON o KML |

## Cómo abrirlo

| Para… | Haga esto |
|---|---|
| **Consultar** (evaluadores, público) | Abra **https://julii5sos.github.io/Geoportal_CHCP/** en cualquier navegador. No requiere instalar nada ni iniciar sesión. |
| **Compartirlo sin internet** o en una presentación | Descargue el [paquete sin conexión](https://julii5sos.github.io/Geoportal_CHCP/descargas/Geoportal_CHCP_sin_conexion.zip) (también está al pie de la página de inicio). Descomprímalo y haga doble clic en `Abrir Geoportal (Windows).bat`, o en `Abrir Geoportal (Mac o Linux).command`. |

> Abrir un archivo `index.html` con doble clic no funciona: el navegador impide que una
> página abierta como archivo lea sus datos. El paquete sin conexión incluye un pequeño
> servidor local que lo resuelve sin instalar nada. Si alguien abre el archivo
> directamente, la página muestra estas instrucciones.

## Fuentes de datos

| Tema | Fuente | Período |
|---|---|---|
| Estado del bosque húmedo, degradación y deforestación | JRC Tropical Moist Forest | 1990–2025 (estado 2025) |
| Pérdida anual de cobertura arbórea | Hansen Global Forest Change (UMD) | 2021–2025 |
| Cambio de la clase árboles | ESRI Land Use/Land Cover (10 m) | 2017 → 2024 |
| Vigor de la vegetación (NDVI) | Copernicus Sentinel-2 | 2020 → 2025 |
| Altura del dosel | GEDI | Referencia |
| Cobertura y uso del suelo oficial | SINIA–MiAMBIENTE (8 productos) | 1992, 2000, 2012, 2019, 2021, 2023 |
| Corredores y puntos críticos | Fundación Almanaque Azul | Versión 2024.05 |
| Ríos y quebradas | IGNTG, hidrografía 1:25 000 | 2022 |
| Límites de la cuenca y 53 subcuencas | Cartografía de la CHCP | — |

Los datos satelitales se procesan en **Google Earth Engine** (proyecto `geoportal-513817`).
Las atribuciones y licencias están en [THIRD_PARTY_DATA.md](THIRD_PARTY_DATA.md).

## Métodos principales

- **Preevaluación territorial `MT-2026.7`.** Suma señales de cinco fuentes: JRC 2,0;
  Hansen 2,0; ESRI 1,5; GEDI 0,5; NDVI 0,5. El máximo es 6,5 puntos, con niveles Alta, Media,
  Preventiva y Baja. La prioridad de visita añade hasta 1,5 puntos por el valor del corredor.
  Detalle en [METODOLOGIA.md](METODOLOGIA.md).
- **Fragmentación** del bosque oficial SINIA 2021:
  - número y tamaño de parches;
  - densidad de borde;
  - bosque interior a 50, 100 y 200 m;
  - distancia entre parches y cohesión.
- **Conectividad estructural**: red de parches a 500 m, Índice Integral de Conectividad (IIC),
  importancia de cada parche (dIIC) y conectividad equivalente.
- **Simulador de restauración**: ganancia exacta de conectividad por enlace restaurado.
  - El beneficio depende del ancho del corredor.
  - La sensibilidad se prueba a 250, 500 y 1000 m.
  - Se avisa de cruces por agua o zonas urbanas.
  - Cada subcuenca se analiza con un margen exterior de 1 km.
- **Rutas al Corredor Mesoamericano**: menor costo sobre la cobertura SINIA 2021 detallada. Los
  bosques de ribera tienen menor resistencia.
- **Índice de Resiliencia Ecológica (ERI)**: complementario. No modifica la preevaluación.

Las decisiones metodológicas y sus justificaciones están en
[docs/DECISIONES_METODOLOGICAS.md](docs/DECISIONES_METODOLOGICAS.md).

## Calidad y transparencia

- **Auditoría científica y técnica:** [docs/auditoria/](docs/auditoria/). La
  [matriz de hallazgos](docs/auditoria/MATRIZ_HALLAZGOS.md) registra cada problema
  detectado, su corrección y su estado.
- **Pruebas automatizadas:** más de 250 pruebas (`tests/`) comprueban fórmulas, umbrales y la
  equivalencia entre el cálculo en el navegador y el de Python. Se ejecutan en cada
  publicación.
- **Procedencia visible:** cada resultado indica si es precalculado con Earth Engine o una
  estimación local, con su fecha de cálculo.
- **Categorías oficiales sin inventar:** las leyendas SINIA solo muestran correspondencias
  verificadas. Ver el [diccionario de capas](docs/DICCIONARIO_CAPAS_SINIA.md).
- **Validación estadística de los mapas (en curso):** muestra aleatoria estratificada (Olofsson et al.,
  2014) interpretada a ciegas sobre imágenes satelitales de alta resolución, con revisión de un segundo
  intérprete. Ver el [protocolo](docs/PROTOCOLO_VALIDACION.md).

## Cómo se actualiza

```
GitHub Actions (manual o programado)                    GitHub Pages
┌───────────────────────────────────────┐   commit   ┌─────────────────────────┐
│ Google Earth Engine                   │ ─────────► │ Sitio HTML estático     │
│ (cuenta de servicio en un secreto     │  datos y   │ + paquete sin conexión  │
│  cifrado del repositorio)             │  mapas     │ sin claves ni servidor  │
└───────────────────────────────────────┘            └─────────────────────────┘
```

No hay credenciales en el código. Ver [docs/PUBLICAR.md](docs/PUBLICAR.md).

## Estructura del repositorio

```text
chcp/          Motores científicos: índice MT-2026.7, ERI, fragmentación, red, corredores, Earth Engine
webapp/        Interfaz (HTML, CSS, JavaScript con Leaflet) y API Flask
data/          Límites, subcuencas, corredores, leyendas SINIA, indicadores y mapas precalculados
scripts/       Precálculo con Earth Engine, construcción del sitio, auditorías y paquete sin conexión
tests/         Pruebas automatizadas (pytest)
docs/          Metodología, decisiones, auditoría, diccionario SINIA y reproducibilidad
.github/       Flujos de GitHub Actions (actualización de datos y publicación)
```

## Documentos de referencia

| Documento | Contenido |
|---|---|
| [METODOLOGIA.md](METODOLOGIA.md) | Índice MT-2026.7: fuentes, períodos, umbrales y pesos |
| [docs/DECISIONES_METODOLOGICAS.md](docs/DECISIONES_METODOLOGICAS.md) | Por qué se hizo cada elección (simulador, rutas, polígonos, ribera) |
| [docs/auditoria/MATRIZ_HALLAZGOS.md](docs/auditoria/MATRIZ_HALLAZGOS.md) | Hallazgos de la auditoría, correcciones y estado |
| [docs/DICCIONARIO_CAPAS_SINIA.md](docs/DICCIONARIO_CAPAS_SINIA.md) | Códigos, categorías y verificación de cada producto SINIA |
| [docs/COMPARABILIDAD_COBERTURAS.md](docs/COMPARABILIDAD_COBERTURAS.md) | Cuándo se pueden comparar productos de distintos años |
| [docs/REPRODUCIBILIDAD.md](docs/REPRODUCIBILIDAD.md) | Instalación y regeneración completa de los resultados |
| [docs/PUBLICAR.md](docs/PUBLICAR.md) | Publicación en GitHub Pages y actualización con GitHub Actions |
| [THIRD_PARTY_DATA.md](THIRD_PARTY_DATA.md) | Atribución y licencias de los datos de terceros |

## Reproducir o modificar los cálculos

Solo hace falta para quien quiera regenerar los resultados o cambiar el código; para usar el
geoportal basta el enlace. La instalación (Python, Google Earth Engine) y la cadena completa
de cálculo están en [docs/REPRODUCIBILIDAD.md](docs/REPRODUCIBILIDAD.md).

## Créditos y atribución

Desarrollado en el marco del **Clúster Copernicus Centroamérica AFOLU II**, a partir de
trabajos técnicos con Fundación Natura.

Contiene datos Copernicus Sentinel modificados, procesados en Google Earth Engine. También
usa JRC TMF, Hansen/UMD/Google/USGS/NASA, ESRI Land Cover, GEDI, cartografía SINIA–MiAMBIENTE,
hidrografía del IGNTG y corredores de la Fundación Almanaque Azul.
