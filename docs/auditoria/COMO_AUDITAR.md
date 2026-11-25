# Cómo auditar los resultados del geoportal

Hay tres niveles de revisión, de lo más rápido a lo más independiente. Conviene hacer los tres
antes de presentar resultados.

## 1. Auditoría automática (5 minutos, sin gastar cuota de Earth Engine)

En GitHub, abra **Actions**, elija **Auditoría de datos** y pulse **Run workflow**. También corre
sola después de cada actualización de datos y en cada *pull request*.

Al terminar, abra la ejecución: el resumen muestra una tabla con seis temas.

| Tema | Qué comprueba |
|---|---|
| Completitud | Que estén los 54 territorios con la versión de datos vigente, todos los campos, las geometrías y los mapas. |
| Metodología | Vuelve a calcular con MT-2026.7, a partir de las métricas guardadas, las señales de cada fuente, el puntaje, la prioridad y la prioridad de visita, y los compara con lo publicado. |
| Rangos | Que superficies, porcentajes, NDVI, GEDI, ERI e índices de conectividad tengan valores posibles. |
| Coherencia | Que las subcuencas sumen la cuenca, que las clases sumen el área y que un mismo valor no difiera entre dos lugares. |
| Mapas | Que cada territorio tenga sus capas y sitios de verificación, sin errores de generación. |
| Complementos | La comparación del bosque oficial 2021 y 2023, los mapas ERI provisionales y la evaluación de exactitud. |

- **Error:** un dato no cumple la metodología o es imposible. Hay que corregirlo antes de publicar.
- **Aviso:** algo provisional o que conviene revisar (por ejemplo, los mapas ERI recortados de la cuenca).

El informe completo se descarga en **Artifacts** (`auditoria-datos`). Desde una computadora:

```bash
python scripts/auditar_datos.py --markdown informe.md
```

Esta auditoría confirma que lo publicado es completo, coherente y fiel a MT-2026.7. No dice si
los satélites aciertan: eso lo responden los niveles 2 y 3.

## 2. Revisión manual de fichas

Elija tres fichas: una subcuenca con prioridad Alta, una con prioridad Media o Baja y la cuenca
completa. En cada una:

1. **Preevaluación.** En «En pocas palabras», la línea «Preevaluación» dice qué fuentes dieron
   señal. Busque en la ficha el valor de cada fuente (hectáreas deforestadas y degradadas de JRC,
   pérdida Hansen desde 2021, salida de árboles de ESRI, altura GEDI, descenso del NDVI) y
   compárelo con su umbral en Metodología («Qué años usa cada fuente y por qué»). Sume los pesos
   de las fuentes con señal (JRC 2,0, Hansen 2,0, ESRI 1,5, GEDI 0,5 y NDVI 0,5): el total debe
   ser el puntaje publicado.
2. **Cifras y mapas.** Abra la misma subcuenca en la Plataforma y en Coberturas: las superficies
   (bosque oficial 2021, clases JRC 2025, pérdida Hansen por año) deben ser las mismas que en la
   ficha, y lo que muestran los mapas debe corresponder con lo que dice el texto.
3. **Fuente original.** Descargue el límite de la subcuenca desde la ficha («Descargar»,
   «Límite en GeoJSON») y
   súbalo a [Global Forest Watch](https://www.globalforestwatch.org/map/) como área propia. La
   pérdida de cobertura arbórea de 2021 a 2025 con 30 % de copa (el mismo umbral del geoportal)
   debe ser parecida a la de la ficha; pequeñas diferencias se deben a bordes y a la proyección.
   La cobertura oficial 2021 se compara del mismo modo con el visor de MiAMBIENTE.
4. **Sentido ecológico.** Mire la imagen satelital: ¿la pérdida, los parches y las brechas
   están donde se ven claros, cultivos o caminos? Anote lo que no cuadre.

Si encuentra una diferencia, anote la ficha, la cifra, el valor esperado y dónde lo obtuvo, y
ábrala como *issue* en GitHub.

## 3. Verificación independiente

- **Exactitud temática.** La página Validación muestra la evaluación de 494 puntos interpretados
  sobre imágenes (exactitud global 81 % ± 4 %). Es preliminar hasta que un segundo intérprete
  revise los puntos y se compare una parte en campo.
- **Paridad de procesamiento.** El flujo «Auditoría de paridad de procesamiento» compara el
  cálculo con Earth Engine con la estimación del navegador para polígonos. Necesita Earth
  Engine: se ejecuta cuando se renueve la cuota.
- **Códigos SINIA 2021 detallado.** Los puntos de verificación de los códigos dudosos se
  muestrean en QGIS contra el TIF oficial (hallazgo B6).

El estado de cada hallazgo está en [MATRIZ_HALLAZGOS.md](MATRIZ_HALLAZGOS.md).
