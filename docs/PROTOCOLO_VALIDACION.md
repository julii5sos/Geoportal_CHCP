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

La cuenca tiene nubosidad casi permanente y en Google Earth muchas fechas no dejan ver el cambio.
Por eso la página de validación muestra, junto a cada punto:

1. **Recortes Sentinel-2 sin nubes** de 2020, 2022 y 2025 (10 m, 640 × 640 m): mediana de los
   píxeles despejados de cada año según Cloud Score+. Al combinar todas las pasadas del año,
   las nubes desaparecen. El recuadro amarillo es la celda de 30 m evaluada. Cada recorte se
   amplía con un clic (o la tecla A); en la vista ampliada se alterna entre años con ← →.
   Hay dos combinaciones: **color natural** y **infrarrojo** (SWIR · NIR · rojo), en la que la
   vegetación es verde brillante, el suelo desnudo o el pasto seco rosado o marrón y el **agua
   negra o azul oscuro**.
2. **NDVI por año** (2017–2025) en la celda, en escala fija de −0,2 a 1 con franjas de
   referencia: bosque ≈ 0,6–0,9; pasto o cultivo 0,2–0,6; agua, suelo o construcción < 0,2. Una
   caída fuerte **y sostenida** sugiere desmonte.
3. **Radar Sentinel-1 VH por año** (dB), en escala fija de −32 a −8 dB: el radar atraviesa las
   nubes; un desmonte suele bajar la señal más de 3 dB de forma sostenida. Variaciones menores de
   2 dB son ruido. Las franjas son orientativas: bosque por encima de ≈ −16 dB, pasto o suelo
   entre −22 y −16 dB, agua por debajo de ≈ −22 dB.

**Agua no es desmonte.** Si el punto es agua (NDVI bajo y radar muy bajo todos los años, negro en
infrarrojo), la clase es «No bosque». Solo es «Pérdida» si antes había bosque y después deja de
haberlo, por ejemplo un bosque inundado por un embalse o una crecida permanente.

Complementos opcionales:

- **Google Earth Pro** con imágenes históricas (cargando `muestra.kml`), cuando haya fechas despejadas: tiene más detalle.
- **Planet NICFI** (mosaicos tropicales de 4,7 m, 2015–2025): requiere registrarse en el programa NICFI; uso no comercial.

Anote en cada punto la **fecha** y la **fuente** de la imagen que decidió la clase. Si con las
tres ayudas no se puede decidir, use «Sin evidencia suficiente».

Nota de independencia: las ayudas son imágenes y series de la propia superficie, no los mapas
evaluados; la decisión es una interpretación visual del cambio, como recomienda Olofsson et al. (2014).

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
   El mismo flujo prepara las imágenes sin nubes y las series de cada punto (unos 30–60 min).
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
