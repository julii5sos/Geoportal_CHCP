# Informe final · auditoría correctiva del Geoportal CHCP

- **Rama:** `fix/auditoria-cientifica-geoportal-chcp`
- **Fecha:** 2026-11-22
- **Alcance:** problemas A–E del mandato de auditoría. Las metodologías originales se conservan: MT-2026.7, ERI y la proyección histórica 8857, esta última como opción.

## 1. Hallazgos confirmados

1. **La saturación del índice no se debe principalmente al tamaño de las subcuencas, sino a dos causas.**
   - La señal JRC usa el *estado acumulado* desde 1990, de modo que mide legado y se activa en 52 de 53 subcuencas, casi siempre por el criterio relativo.
   - Hansen se activa con un umbral absoluto de 0,18 ha (46 de 53).

   Con un puntaje binario aditivo, dos fuentes correlacionadas bastan para «Alta». Ajustar umbrales no lo corrige: con ×10 siguen 46 en Alta.
2. **SINIA 2012:**
   - 12 códigos verificados cubren el 97,7 % de la superficie cartografiada en la CHCP.
   - 18 códigos pequeños no se verifican; la causa más probable es la escala y los bordes del muestreo.
   - Solo los códigos verificados 1 y 2 alimentan la máscara forestal.
   - Dos códigos (17 y 21) son candidatos a recodificación y no se cambian sin confirmación oficial.
3. **Validación:** **no existe una validación temática independiente** de ningún mapa en la CHCP. Además había una fuga de información (la clase del mapa estaba disponible para quien interpreta) y una definición de estrato inconsistente con el período de referencia.
4. **Procedencia:** los resultados no declaraban su tipo de procesamiento, fecha ni versión, y la estimación local no tenía tolerancias.
5. **Distancias (crítico):** el motor de conectividad medía distancias en una proyección equivalente. Equal Earth, a 9° N, deforma +15,8 % y −13,4 % según la dirección, lo que afectaba al umbral entre parches, la distancia al vecino más cercano, el área núcleo, las brechas y la densidad de borde.

## 2. Correcciones ejecutadas (con pruebas)

| Corrección | Archivos | Prueba |
|---|---|---|
| Distancias en UTM 17N; 8857 solo como opción histórica | `proyecciones.py`, `bosque_conectividad.py`, `corredores.py`, `analisis_temporal.py` | `test_proyeccion_metrica.py` |
| UTM en el navegador y simulador coherente | `red_conectividad.js`, `restauracion.js` | Frente a `pyproj` (< 1 cm); monotonicidad en 200 redes |
| Indicadores relativos experimentales y auditoría reproducible del índice | `indicadores_relativos.py`, `scripts/auditoria/a_saturacion.py`, ficha y panel | Salidas en `datos/A_*` |
| Análisis de correspondencia de SINIA 2012 y comparación controlada | `scripts/auditoria/b_sinia_2012*.py`, workflow | Salidas en `datos/B_*` |
| Validación ciega:<br>• `estratos.csv` fuera del sitio;<br>• estrato v2 para 2021–2025;<br>• mapas separados de JRC y Hansen;<br>• control de calidad con segundo intérprete, «sin evidencia» y fecha de imagen;<br>• estados de la interfaz | `muestreo_validacion.py`, `evaluar_validacion.py`, `validacion.js`, constructor, API | `test_validacion.py` |
| Procedencia de tipos A, B y C, estado de la actualización y registro de versiones | `procesamiento.py`, `service.py`, `main.py`, `precalcular_panel.py`, JS | Suite completa |
| Tolerancia de borde para polígonos (10 % / 25 %) | `plataforma_estatica.js` | Revisión del código |
| Réplica en Python de la estimación local y auditoría de paridad | `estimacion_local.py`, `d_paridad.py`, workflow | `test_replica_python_igual_al_navegador` |

**Resultado de la suite:** todas las pruebas pasan (ver el PR).

## 3. Resultados antes y después

- **Índice:** MT-2026.7 no cambia (46 Alta, 6 Media, 1 Preventiva en subcuencas). La variante experimental da 47–53 valores distintos y la correlación con la superficie baja de 0,25 a ≤ 0,22.
  - Caso Chagres frente a Los Hules: ambos «Alta», pero con 0,02 frente a 1,47 % del bosque por año.
- **Conectividad:** los resultados cambiarán al recalcular con `VERSION_DATOS = 3` (UTM). El antes/después por subcuenca (componentes, aislados, IIC, área núcleo) se documentará cuando termine esa ejecución.

## 4. Limitaciones pendientes

| Pendiente | Requiere |
|---|---|
| Recálculo v3 de las 54 unidades | Fusionar este PR y ejecutar «Actualizar datos con Earth Engine» |
| Paridad A frente a C | Datos v3 y el workflow «Auditoría de paridad» |
| SINIA 2012 controlado y metadatos del servicio | Workflow «Auditoría SINIA 2012 controlada»; confirmación de MiAMBIENTE para los códigos 17 y 21 |
| Validación temática independiente | Interpretación de muestras por personas, con control de calidad |
| Umbrales de una variante categórica para subcuencas | Decisión científica, idealmente con la validación |
| ERI-2 (condición riparia, imputación GEDI) | Propuesta versionada y aprobación |

## 5. Recomendación para la aprobación científica

**El geoportal no debe presentarse como científicamente validado** mientras C5 (sin validación independiente) siga abierto y no se haya recalculado E1 (UTM).

Sí puede presentarse como una **plataforma de diagnóstico indicativo y trazable** si se cumplen tres condiciones:
- los resultados declaran su procedencia;
- los indicadores experimentales están rotulados como tales;
- la metodología y sus limitaciones están documentadas y son reproducibles.

**Orden sugerido:**
1. Fusionar los PR #7 y de auditoría, y recalcular la versión 3.
2. Ejecutar la paridad y SINIA 2012 controlado.
3. Generar e interpretar la muestra `senal_perdida` v2.
4. Revisar con el equipo científico los indicadores relativos y sus posibles umbrales.
