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

### Limitaciones del simulador identificadas en la revisión del 2026-11-22 y su tratamiento

| # | Limitación | Tratamiento | Estado (matriz) |
|---|---|---|---|
| 1 | El ancho de la franja solo cambiaba el costo, no el beneficio: el ranking por hectárea favorecía la franja más angosta. | Efectividad supuesta `min(1, ancho / ancho de referencia)`. La ganancia y la prioridad por hectárea se multiplican por ella, así que por debajo de la referencia estrechar la franja ya no mejora la prioridad. Anchos de 30 a 200 m; referencia de 60, 100 (por defecto) o 200 m. | E6 · mitigado |
| 2 | Umbral único de 500 m sin sensibilidad. | La red guarda aristas hasta 1 km. Cada brecha se evalúa con 250, 500 y 1 000 m (ganancia exacta, puesto y etiqueta «robusta», «depende del umbral» o «baja»). Los escenarios muestran la ganancia con cada umbral. El umbral de análisis es elegible; 500 m sigue siendo el original. | E7 · corregido en código |
| 3 | Distancia euclidiana: enlaces que cruzan agua o zonas urbanas. | Cada brecha se muestrea sobre la cobertura de la cuenca. Se marca y, por defecto, se excluye de las prioridades y del plan si cruza al menos un píxel de agua o de zona construida. Para conectar con el Corredor Mesoamericano hay rutas de menor costo (E.2.1). | E8 · corregido |
| 4 | Subcuenca aislada: parches partidos en la divisoria, sin conexiones hacia fuera e IIC no comparable. | Red ampliada del simulador: cada parche con su superficie completa y el bosque hasta 1 km fuera de la subcuenca como contexto. El IIC se normaliza por subcuenca + margen y se añade la conectividad equivalente EC = √(Σ aᵢaⱼ/(1+nlᵢⱼ)) en hectáreas, comparable entre subcuencas (Saura et al. 2011). Las métricas oficiales de la ficha y MT-2026.7 no cambian. | E9 · corregido en código |
| 5 | Selección heurística, una a una. | Ganancia exacta de cada enlace sin recalcular todo el grafo. Plan voraz: en cada paso se elige el mejor enlace dada la red ya modificada, con lo que se capturan refuerzos y redundancias. Se presenta como heurística, no como óptimo. | E10 · mitigado |
| 6 | Base forestal sin validar. | El simulador declara la categoría usada («Bosques y Otras Tierras Boscosas», que no distingue tipos ni plantaciones) y el estado de la validación de SINIA 2021. La exactitud solo se resolverá con la interpretación de la muestra (C). | E11 · pendiente |

El simulador sigue presentándose como **exploratorio**: los supuestos 1 y 3 (efectividad por ancho y resistencias) no están calibrados con datos de especies, y la validación de la base (6) está pendiente.

### E.2.1 Rutas de menor costo al Corredor Biológico Mesoamericano

Se añadieron como respuesta parcial a la limitación 3. La metodología está en `docs/DECISIONES_METODOLOGICAS.md`. Es un procesamiento tipo C con resistencias supuestas y explícitas en la interfaz. No se presenta como corredor oficial ni como conectividad funcional demostrada.

## E.3 ERI y corredores

El código coincide con `METODOLOGIA.md` en pesos (35/25/20/20), normalizaciones (altura / 35 m, pendiente / 45°, distancia / 1 km), ventana de 1,5 km y cauces de MERIT con ≥ 1 km². Hallazgos que **no** cambian la fórmula, porque cambiarla exige una versión ERI-2:
1. **Imputación de altura:** donde no hay GEDI, la altura normalizada se reemplaza por la probabilidad de árboles de Dynamic World. Esa imputación no estaba documentada; ahora sí.
2. **Dos definiciones de bosque:** la conectividad del ERI usa bosque de Dynamic World (p ≥ 0,5), distinto del bosque SINIA 2021 de la red de parches. Ambas «conectividades» no deben compararse directamente.
3. **Proximidad riparia:** mide cercanía a cauces, no la condición de la vegetación riparia. Eleva el ERI junto a ríos aunque no haya bosque. Para la condición riparia se usa el análisis de franjas (bosque en 30/50/100 m).
4. **Corredores:** las distancias al corredor más cercano ahora se calculan en UTM; las superficies siguen en Equal Earth.
