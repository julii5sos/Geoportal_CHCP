# C · Validación estadística e incertidumbre

**Conclusión principal:** **ningún producto del geoportal tiene todavía una validación temática independiente para la CHCP.** El repositorio contenía el código para calcularla (estimadores, muestreo e interfaz), pero ninguna muestra había sido interpretada.

## 1. Qué está verificado y qué no

| Elemento | Estado |
|---|---|
| Estimadores (Olofsson et al., 2014): exactitud global, de usuario y de productor, área ajustada e IC 95 % | **Prueba matemática superada.** Reproducen el ejemplo publicado (deforestación 21 158 ± 6 158 ha; exactitud global 0,947 ± 0,018). Las versiones en Python y en el navegador coinciden (`tests/test_validacion.py`). |
| SINIA 2021, señales de pérdida, JRC, Hansen y ESRI en la CHCP | **Sin validar.** No hay puntos de referencia interpretados. |
| Confiabilidad del 85 % del mapa 2012 | Declarada por la fuente oficial para el país; no es una evaluación en la CHCP. |

## 2. Problemas encontrados y corrección

| ID | Problema | Corrección |
|---|---|---|
| C1 | Sin muestra, la página mostraba de entrada el ejemplo de Olofsson (con etiqueta, pero con cifras visibles). | Ahora aparece primero el aviso **«Validación temática pendiente: no se dispone de una muestra independiente completa.»**. El ejemplo queda plegado y rotulado como «didáctico, NO CHCP». La interfaz distingue tres estados: *pruebas matemáticas*, *resultados preliminares* y *validación independiente completa*. |
| C2 | **Fuga de información:** `estratos.csv` (la clase del mapa) se publicaba en el sitio y la herramienta de interpretación lo descargaba. | Ya no se publica (`construir_sitio_estatico.py`), la API no lo sirve y la herramienta no lo carga. El cálculo local exige que quien calcula suba ese archivo después de interpretar. |
| C3 | El estrato «pérdida» de `senal_perdida` (v1) usaba el estado JRC acumulado desde 1990, mientras la referencia preguntaba por el período reciente: así se garantizaban errores de comisión por diseño. | En `senal_perdida` v2 todas las fuentes se refieren a 2021–2025: JRC = sin perturbación en 2020 y perturbado en 2025; Hansen = lossyear 2021–2025; ESRI = 2017→2024, con el período declarado. Se añadieron `hansen_2021_2025` y `jrc_cambio_2021_2025` para evaluar las fuentes por separado. |
| C4 | No había control de calidad: un solo intérprete, sin clase «sin evidencia» y sin fecha de imagen. | Se agregaron estos campos:<br>• `fecha_imagen`<br>• `interprete_2` y `clase_referencia_2` (revisión ciega)<br>• `clase_final` y `resolucion` (resolución documentada de desacuerdos)<br>• clase 0 «sin evidencia» (se excluye y se informa)<br><br>Una muestra solo se declara **completa** si se cumplen tres condiciones:<br>• todos los puntos tienen clase final o están marcados sin evidencia;<br>• no quedan desacuerdos pendientes;<br>• al menos el 10 % fue revisado por un segundo intérprete. |
| C5 | Fuga por estratos del lado de la referencia: no se usa JRC, ESRI ni Hansen como referencia. | Se mantiene: la referencia es fotointerpretación o campo, nunca otro producto satelital. |

## 3. Diseño muestral vigente

- **Muestreo:** aleatorio estratificado por clase del mapa, con semilla fija (2026).
- **Tamaño:** ecuación 13 de Olofsson con un error estándar objetivo de 0,015 para la exactitud global y exactitudes esperadas conservadoras (pérdida 0,7; bosque 0,9; no bosque 0,85).
- **Asignación:** mínimo de 75 puntos por estrato y el resto proporcional al área.
- **Unidad:** píxel de 30 m (señales, JRC, Hansen) o de 10 m (SINIA 2021).
- **Orden:** los puntos se presentan en orden aleatorio, sin la clase del mapa.
- **Fechas de referencia:** imágenes de fines de 2020 y de 2021 a 2025 (Google Earth Pro con imágenes históricas, mosaicos Planet-NICFI o campo). Se registra la fecha de cada imagen.
- **Puntos ambiguos:** clase 0, excluidos del estimador. Se informa su número y, si se concentran en un estrato, se advierte el posible sesgo.

## 4. Plan de validación real (pendiente de ejecución humana)

1. Actions → «Generar muestra de validación» para `senal_perdida`. Después, `sinia_2021`, y si hay recursos, `hansen_2021_2025` y `jrc_cambio_2021_2025`.
2. Interpretación ciega por un primer intérprete.
3. Revisión ciega del 10 % de los puntos y de todos los de confianza baja por un segundo intérprete. Los desacuerdos se resuelven en `clase_final`.
4. Se sube `muestra.csv` a `data/validacion/<mapa>/`. El sitio publica los resultados como «preliminares» hasta cumplir los criterios de muestra completa.

## 5. Limitaciones

- La referencia también tiene error; la fotointerpretación de degradación es especialmente incierta.
- Los resultados son válidos para la CHCP y para el período evaluado.
- La exactitud de un mapa no se traslada automáticamente al índice de preevaluación, que combina varias fuentes con reglas.

## 6. Evaluación oficial del mapa de cobertura 2021 (informe de MiAMBIENTE, abril de 2022)

El informe final del Mapa de Cobertura Boscosa y Uso de Suelo 2021 (sección 10, Cuadros N° 3–5) compara el mapa con 9 800 muestras del **Mapatón 2020**, la interpretación de imágenes de alta resolución del Inventario Nacional de Gases de Efecto Invernadero. La interpretaron tres especialistas que no participaron en el mapa.

- **Matriz:** transcrita en `scripts/aplicar_informe_mcbyus2021.py`. Reproduce exactamente las cifras publicadas: exactitud global **70.3 %** y **kappa 0.615**.
- **Datos para la interfaz:** `data/validacion/exactitud_oficial_mcbyus2021.json`, que se muestra en la página de Validación y en el simulador.

| Clase (Mapatón) | Exactitud de usuario | Exactitud de productor | Muestras de referencia |
|---|---:|---:|---:|
| Bosque maduro | 88 % | 90 % | 3 345 |
| Pasto | 72 % | 74 % | 2 368 |
| Bosque secundario | 52 % | 60 % | 1 870 |
| Rastrojos | 28 % | 25 % | 769 |
| Cultivos anuales | 74 % | 38 % | 480 |
| Humedales | 77 % | 68 % | 261 |
| Asentamientos | 63 % | 56 % | 260 |
| Bosque de mangle | 81 % | 84 % | 232 |
| Bosque plantado de latifoliadas | 72 % | 62 % | 94 |
| Cultivos permanentes | 77 % | 59 % | 87 |
| Otras tierras | 38 % | 35 % | 23 |
| Bosque plantado de coníferas | 71 % | 91 % | 11 |

**Agregado bosque / no bosque (derivado por el geoportal).** «Bosque y otras tierras boscosas» son las clases C, F, L, M, R y S, como en el mapa general que usa la conectividad.

| | Referencia: bosque | Referencia: no bosque |
|---|---:|---:|
| Mapa: bosque | 5,815 | 755 |
| Mapa: no bosque | 506 | 2,724 |

- Acuerdo global: **87.1 %**.
- Bosque: exactitud de usuario 88.5 %, de productor 92.0 %.
- No bosque: exactitud de usuario 84.3 %, de productor 78.3 %.

**Lectura.** El mapa distingue bien el bosque maduro. Los límites entre **bosque secundario, rastrojo y pasto** son la principal fuente de error: el rastrojo tiene 28 % de exactitud de usuario y el bosque secundario, 52 %. Para la conectividad, que agrupa bosque y rastrojo, el acuerdo sube a 87 %. Aun así, una de cada nueve celdas cartografiadas como bosque no lo es según la referencia, y en el simulador esos errores se convierten en parches o en brechas.

**Por qué no sustituye la validación de la sección 4:**
- **Año distinto:** la referencia es de 2020 y el mapa de 2021, así que parte del desacuerdo puede ser cambio real.
- **Sin diseño muestral documentado:** el informe no describe un diseño con probabilidades de inclusión conocidas. Sin eso no se pueden estimar superficies corregidas por error ni intervalos de confianza (Olofsson et al. 2014).
- **Escala nacional:** no hay cifras de la cuenca.
- **Versión del mapa:** evalúa la versión del informe (abril de 2022). El asset del proyecto difiere de esa versión en la cuenca (B.7).

Por eso se muestra como **evaluación oficial de referencia** y no como validación del geoportal (condiciones 3 y 6 de la auditoría).
