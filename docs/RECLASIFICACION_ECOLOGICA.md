# Reclasificación ecológica de las coberturas SINIA–MiAMBIENTE

**Implementación:** `chcp/catalogos/reclasificacion_sinia.py` · **datos:** campo
`grupo_derivado` de cada código en `data/leyendas_sinia.json` · **pruebas:**
`tests/test_leyendas_sinia.py`.

## Principios

1. **Los datos originales no se modifican.** La reclasificación es una tabla
   `código original → grupo derivado`, propia de cada producto y año.
2. **Trazabilidad.** Cada grupo derivado se puede reconstruir a partir de los
   códigos originales (pestaña *Coberturas SINIA*, vista «Grupos ecológicos
   derivados», y la tabla de cada producto en `docs/DICCIONARIO_CAPAS_SINIA.md`).
3. **No se fuerza detalle que el producto no tiene.** Los productos de tres
   categorías (2019, 2021 vector, 2023) y el binario 2012 no permiten separar bosque
   natural, secundario o plantado; usan grupos *amplios*.
4. **Toda la vegetación no es bosque.** Rastrojos, vegetación herbácea, cultivos y
   pastos nunca entran en una máscara forestal.
5. **Los códigos sin verificar no se agrupan como si fueran conocidos.** Pasan a
   `no_identificado`, salvo cuando la documentación previa del proyecto establece su
   grupo (2021 detallado, códigos 1–9).

## Grupos derivados

| Grupo | Nombre | Uso |
|---|---|---|
| `bosque_natural` | Bosque natural | Bosques maduros, manglar, orey, cativo, rafia. |
| `bosque_secundario` | Bosque secundario o intervenido | Bosque secundario maduro e intervenido (bosque natural alterado). |
| `bosque_plantado` | Bosque plantado | Plantaciones de coníferas o latifoliadas. |
| `bosque_amplio` | Bosques y otras tierras boscosas | Categoría amplia de 2012 binario, 2019, 2021 vector y 2023. |
| `rastrojo_arbustivo` | Rastrojo y vegetación arbustiva | Sucesión temprana; fuera de máscaras forestales. |
| `otra_vegetacion` | Otras coberturas vegetales | Herbácea, vegetación baja inundable. |
| `areas_abiertas_naturales` | Áreas abiertas naturales | Afloramientos, playas, albinas. |
| `cultivos` | Cultivos | Cultivos permanentes y anuales identificados. |
| `pastos` | Pastos | Pasto. |
| `agropecuario_mixto` | Agropecuario sin desagregar | «Uso agropecuario» y mosaicos donde el producto no separa cultivo de pasto. |
| `areas_intervenidas` | Áreas intervenidas | Poblados, infraestructura, minería, acuicultura, salineras, «otros usos». |
| `otras_tierras_amplia` | Otras tierras (amplia) | Categoría «Otras tierras» o «No bosque». |
| `agua` | Agua | Cuerpos de agua. |
| `no_identificado` | Código no identificado | Código presente sin significado verificado. |
| `sin_datos` | Sin datos | NoData y áreas enmascaradas. |

Se añadieron `bosque_amplio`, `otras_tierras_amplia`, `agropecuario_mixto`,
`areas_abiertas_naturales` y `no_identificado` a la lista orientativa del protocolo
porque varios productos no permiten una asignación más fina sin inventar detalle.

### Decisión documentada: «Bosque intervenido»

En 1992 y 2000 «Bosque intervenido» se agrupa como `bosque_secundario` (bosque
natural con alteración visible). Se mantiene dentro de la máscara forestal porque
sigue siendo bosque, y la auditoría muestra que 90–100 % de sus puntos caen en la
clase forestal 2021. Si un análisis requiere solo bosque poco alterado, debe usar
exclusivamente `bosque_natural`.

## Máscaras forestales para fragmentación y conectividad

| Producto | Códigos en la máscara | Opcionales | Justificación |
|---|---|---|---|
| 1992 histórico | 2, 3, 4, 5 | — | Bosque intervenido, maduro, secundario maduro y manglar; sin rastrojos ni código 8. |
| 2000 histórico | 2, 3, 4, 5 | — | Mismas clases con la tabla de códigos de 2000. |
| 2012 binario | 1 | — | «Bosque» incluye plantaciones. |
| 2012 detallado | 1–6 | 7, 8 (plantados) | Bosques naturales; las plantaciones solo si el análisis lo declara. |
| 2019 general | 1 | — | Categoría amplia. |
| 2021 vector | 1 («Bosques y Otras Tierras Boscosas») | — | Definición del motor de fragmentación validado (Qda. Bonita). |
| 2021 detallado | 1–6 | 7, 8 | Según el grupo documentado; pendiente de verificación individual. |
| 2023 general | 1 | — | Categoría amplia, escenario diagnóstico. |

El motor de fragmentación y conectividad en producción usa **solo** el vector 2021
(y el diagnóstico 2023 como escenario paralelo). Las demás máscaras están definidas
y probadas, pero no se activan en el motor sin una validación con el mismo protocolo
de Qda. Bonita.
