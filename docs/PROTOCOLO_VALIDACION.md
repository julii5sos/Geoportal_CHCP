# Protocolo de validación por interpretación de imágenes satelitales

Evaluación de exactitud de la **señal de pérdida 2021–2025 del geoportal** (`senal_perdida`),
siguiendo las buenas prácticas de Olofsson et al. (2014). No requiere trabajo de campo: la
referencia es la interpretación visual, a ciegas, de imágenes de mayor resolución que el mapa.

## 1. Qué se evalúa

| Clase del mapa | Qué significa en el mapa |
|---|---|
| Pérdida o degradación 2021–2025 | Al menos dos de: JRC (sin perturbación en 2020 → deforestado o degradado en 2025), Hansen (pérdida 2021–2025) y ESRI (árboles 2017 → otra clase 2024) |
| Bosque | JRC sin perturbación en 2025 y ninguna de las tres fuentes con pérdida |
| No bosque | Todo lo demás |

## 2. Reglas de interpretación (fijadas antes de empezar)

Cada punto representa la celda de 30 × 30 m que lo contiene. Se asigna la clase que se observa en
**más de la mitad** de esa celda.

| Clase de referencia | Se asigna cuando… |
|---|---|
| **Pérdida** | Había bosque a fines de 2020 y entre 2021 y 2025 se observa desmonte, quema, apertura del dosel o caminos nuevos. |
| **Bosque** | Dosel arbóreo continuo durante 2020–2025 (incluye bosque secundario cerrado y plantaciones con dosel cerrado). |
| **No bosque** | Pasto, cultivo, rastrojo bajo, suelo, construcción o agua durante 2020–2025. |
| **Sin evidencia** | No hay imágenes claras del período (nubes, sombras, sin fechas útiles). Se excluye del cálculo y se informa cuántos hubo; explique el motivo en «notas». |

- **Cosecha de plantaciones:** si se ve una plantación (hileras regulares) cosechada en 2021–2025, es *Pérdida* (cambio de cobertura arbórea), con la nota «plantación».
- **Degradación:** apertura parcial del dosel visible (claros, extracción selectiva) cuenta como *Pérdida*; un cambio de color sin pérdida de copas no.
- **Confianza:** `alta` (imágenes nítidas antes y después), `media` (una de las dos dudosa), `baja` (interpretación difícil).

## 3. Imágenes

1. **Google Earth Pro** (gratuito) con la herramienta de **imágenes históricas** (icono del reloj): cargue `muestra.kml` y compare una imagen de 2019–2020 con una de 2024–2025.
2. **Copernicus Browser** (Sentinel-2, 10 m, gratuito) para confirmar en qué año ocurrió el cambio cuando Google Earth no tiene fechas suficientes.
3. La imagen Esri de la página de validación es de una sola fecha: sirve para ver la cobertura actual, no para confirmar el cambio.

Anote en cada punto la **fecha** y la **fuente** de la imagen que decidió la clase.

## 4. Regla de independencia

Mientras interpreta, **no abra** las capas del geoportal ni los mapas de JRC, Hansen, ESRI o
SINIA. La muestra (`muestra.csv`) no trae la clase del mapa a propósito; `estratos.csv` solo se
usa para el cálculo, nunca durante la interpretación.

## 5. Control de calidad

- Una segunda persona con experiencia en imágenes interpreta **al menos el 10 %** de los puntos
  (columnas `interprete_2` y `clase_referencia_2`), sin ver la clase asignada por la primera.
- Los desacuerdos se resuelven juntos y se anotan en `clase_final` y `resolucion`.
- Mientras no se cumpla, la página muestra los resultados como **preliminares**.

## 6. Pasos

1. GitHub → Actions → **Generar muestra de validación** → mapa `senal_perdida`, valores por defecto.
2. Sitio → **Plataforma → Validación de mapas** → «Interpretar la muestra». El avance se guarda
   en el navegador: use siempre el mismo equipo y descargue `muestra.csv` como respaldo cada día.
3. Al terminar (o al cerrar una jornada), suba `muestra.csv` a `data/validacion/senal_perdida/`
   en GitHub (Add file → Upload files). El sitio recalcula y publica la exactitud y la
   superficie ajustada por error, con su intervalo del 95 %.
4. Segunda persona: en la misma página, «Continuar desde un CSV» con el archivo publicado, marca
   «Revisión de calidad (segundo intérprete)» —así no ve la clase del primero—, interpreta al
   menos el 10 % de los puntos y vuelve a subir el archivo.

Referencia: Olofsson, P., Foody, G. M., Herold, M., Stehman, S. V., Woodcock, C. E. y Wulder, M. A.
(2014). Good practices for estimating area and assessing accuracy of land change. *Remote Sensing
of Environment*, 148, 42–57.
