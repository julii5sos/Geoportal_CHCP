# E · Coherencia de indicadores ecológicos y del simulador de restauración

## E.1 Fragmentación y conectividad

### Hallazgo crítico: distancias medidas en una proyección equivalente

El motor `bosque_conectividad.py` (y también `corredores.py` y el perímetro de `analisis_temporal.py`) proyectaba todo a **EPSG:8857 (Equal Earth)**. Esa proyección conserva las áreas, pero **deforma las distancias**. Con 1 000 m geodésicos medidos en la CHCP (`pyproj`):

| Proyección | Norte | 45° | Este |
|---|---|---|---|
| EPSG:8857 Equal Earth | **1 157,9 m (+15,8 %)** | 1 060,3 m | **866,3 m (−13,4 %)** |
| EPSG:32617 UTM 17N | 999,8 m | 999,8 m | 999,8 m |
| EPSG:3857 Web Mercator | 1 019,3 m | 1 016,0 m | 1 012,7 m |

**Consecuencias:** el umbral de 500 m entre parches actuaba como 432 m en dirección norte–sur y 577 m en este–oeste. Lo mismo afecta a:
- la distancia al vecino más cercano (ENN);
- los buffers de borde del área núcleo (50, 100 y 200 m);
- las brechas, las rutas a corredores y la distancia al corredor más cercano;
- el perímetro y la densidad de borde.

Las superficies eran correctas.

**Corrección:**
- `chcp/nucleo/proyecciones.py` define `EPSG_METRICO = 32617` para distancias, perímetros y buffers. En la CHCP el factor de escala está entre 0,9996 y 0,9999, con un error de área menor del 0,08 %.
- El motor acepta `epsg_metrico` (por defecto 32617) e informa `crs_metrico` en el resultado.
- EPSG:8857 se conserva como `EPSG_HISTORICO_CONECTIVIDAD`, solo para reproducir resultados antiguos.
- **Prueba** (`tests/test_proyeccion_metrica.py`): dos parches a 470 m reales en dirección norte–sur quedan conectados en UTM y desconectados con la proyección histórica; a 560 m este–oeste, la histórica los conectaba por error.
- Los datos se recalculan con `VERSION_DATOS = 3`. La comparación antes/después por subcuenca se hará cuando termine esa ejecución.

### Otras verificaciones

| Aspecto | Resultado |
|---|---|
| Definición de bosque | SINIA 2021 «Bosques y otras tierras boscosas» (oficial). |
| Área mínima | 0 ha, configurable. |
| Vecindad | Distancia de borde a borde ≤ umbral, con índice espacial STRtree. |
| Contexto exterior | Parches fuera del área se usan para la red; sus superficies no se suman. |
| Relaciones visibles | Árbol de expansión mínima por componente. Las métricas usan la red completa. |
| Componentes y parches aislados | Correctos. |
| IIC y dIIC | Pascual-Hortal y Saura (2006); la implementación del navegador da el mismo IIC (prueba). |
| Área núcleo y ENN | Calculadas sobre geometrías proyectadas; ahora en UTM. |

## E.2 Simulador de restauración

**Correcciones:**
- **Distancias en el navegador:** antes se aproximaban de forma equirrectangular. Ahora se calculan en UTM 17N con la serie de Krüger, con una diferencia frente a `pyproj` menor de 1 cm (prueba).
- **Coherencia de la red:** en 200 redes aleatorias, agregar un enlace nunca aumenta el número de redes ni los parches aislados, nunca reduce el IIC y no cambia el hábitat (prueba).
- **Lenguaje:** «franja restaurada» pasa a «enlace propuesto (franja hipotética)», y «superficie a restaurar» a «superficie hipotética».
- **Recuadro «qué mide y qué no mide»:**
  - *Sí mide:* la conexión matemática y el cambio estructural de la red.
  - *Aproximado:* la superficie hipotética.
  - *No mide:* la conectividad ecológica potencial para especies, la conectividad funcional demostrada ni la restauración efectiva.
- **Sin beneficios atribuidos:** no se atribuye ningún beneficio a especies.

### Limitaciones del simulador identificadas en la revisión del 2026-11-22

Siguen abiertas. Mientras lo estén, el simulador se presenta como **exploratorio**.

1. **Beneficio independiente del ancho:** el ancho de la franja solo cambia la superficie, no la ganancia de IIC. Por eso la priorización «por hectárea» favorece siempre la franja más angosta, que es la de menor función ecológica por efecto de borde.
2. **Umbral único de 500 m:** no está ligado a una especie o grupo funcional y no hay análisis de sensibilidad (por ejemplo con 250, 500 y 1 000 m).
3. **Distancia euclidiana:** no considera la resistencia de la matriz, así que una brecha puede cruzar agua o zonas urbanas. Las rutas al Corredor Mesoamericano (E.2.1) introducen la resistencia, pero solo para esas rutas.
4. **Efecto de borde del área de análisis:** los parches se recortan en el límite de la subcuenca, sin margen exterior. Además, el IIC se normaliza por el área de cada subcuenca y no es comparable entre subcuencas.
5. **Selección de candidatas heurística:** hasta 80 brechas, evaluadas una a una. No es una optimización de combinaciones.
6. **Base forestal sin validar:** la exactitud de SINIA 2021 depende de la validación pendiente (C).

### E.2.1 Rutas de menor costo al Corredor Biológico Mesoamericano

Se añadieron como respuesta parcial a la limitación 3. La metodología está en `docs/DECISIONES_METODOLOGICAS.md`. Es un procesamiento tipo C con resistencias supuestas y explícitas en la interfaz. No se presenta como corredor oficial ni como conectividad funcional demostrada.

## E.3 ERI y corredores

El código coincide con `METODOLOGIA.md` en pesos (35/25/20/20), normalizaciones (altura / 35 m, pendiente / 45°, distancia / 1 km), ventana de 1,5 km y cauces de MERIT con ≥ 1 km². Hallazgos que **no** cambian la fórmula, porque cambiarla exige una versión ERI-2:
1. **Imputación de altura:** donde no hay GEDI, la altura normalizada se reemplaza por la probabilidad de árboles de Dynamic World. Esa imputación no estaba documentada; ahora sí.
2. **Dos definiciones de bosque:** la conectividad del ERI usa bosque de Dynamic World (p ≥ 0,5), distinto del bosque SINIA 2021 de la red de parches. Ambas «conectividades» no deben compararse directamente.
3. **Proximidad riparia:** mide cercanía a cauces, no la condición de la vegetación riparia. Eleva el ERI junto a ríos aunque no haya bosque. Para la condición riparia se usa el análisis de franjas (bosque en 30/50/100 m).
4. **Corredores:** las distancias al corredor más cercano ahora se calculan en UTM; las superficies siguen en Equal Earth.
