# Validación de los assets SINIA en Google Earth Engine

> Documento generado por `python scripts/generar_diccionario_sinia.py` a partir de `docs/validacion/auditoria_assets_sinia.json` (salida de `scripts/auditar_assets_sinia.py`).

- **Fecha de la auditoría:** 2026-11-21T18:29:19
- **Proyecto Earth Engine:** `geoportal-513817` · earthengine-api 1.7.53
- **Identidad:** credenciales locales del usuario (`earthengine authenticate`). Producción requiere repetir la prueba con la cuenta de servicio.
- **AOI de control:** Qda. Bonita · **inventario:** CHCP completa (no se ejecutan consultas nacionales).
- **Correspondencia espacial:** 10 puntos estratificados por código (semilla 2026) contra https://geoportal.miambiente.gob.pa/server/rest/services/Nodo_Suelos/MapServer.

## Resumen técnico

| Asset | Tipo | Banda · tipo de dato | Proyección · escala | Códigos en CHCP | Área enmascarada en CHCP | Correspondencia REST | Estado |
|---|---|---|---|---|---|---|---|
| `SINIA_1992_COBERTURA_HISTORICA_RASTER30M` | IMAGE | `b1` INT 0–255 | EPSG:32617 · 30 m | 1, 2, 3, 4, 6, 7, 9, 10 | 41,970 ha | 8/8 códigos ≥ 80 % | ✅ Auditado |
| `SINIA_2000_COBERTURA_HISTORICA_RASTER30M` | IMAGE | `b1` INT 0–255 | EPSG:32617 · 30 m | 1, 2, 3, 4, 6, 7, 8, 9 | 43,431 ha | 8/8 códigos ≥ 80 % | ✅ Auditado |
| `SINIA_2012_BOSQUE_BINARIO_RASTER5M` | IMAGE | `b1` INT 0–255 | EPSG:32617 · 5 m | 1, 2 | 0 ha | no aplica | ✅ Auditado |
| `SINIA_2012_USO_SUELO_RASTER5M` | IMAGE | — | — | — | — | — | ⏳ Pendiente |
| `SINIA_2019_COBERTURA_GENERAL_RASTER20M` | IMAGE | — | — | — | — | — | ⏳ Pendiente |
| `SINIA_2021_COBERTURA_GENERAL_VECTOR` | TABLE | — | — | — | — | — | ⏳ Pendiente |
| `SINIA_2021_USO_SUELO_RASTER10M` | IMAGE | — | — | — | — | — | ⏳ Pendiente |
| `SINIA_2023_COBERTURA_GENERAL_RASTER10M` | IMAGE | — | — | — | — | — | ⏳ Pendiente |

## Detalle por asset

### 1992 · Cobertura histórica de bosque y uso del suelo 1992 — superficie en Qda. Bonita

| Código | Categoría | ha |
|---:|---|---:|
| 2 | Bosque intervenido | 225.35 |
| 7 | Rastrojos (bosque pionero) | 190.12 |
| 9 | Uso agropecuario | 77.89 |
| 10 | Uso agropecuario de subsistencia | 14.49 |
### 2000 · Cobertura histórica de bosque y uso del suelo 2000 — superficie en Qda. Bonita

| Código | Categoría | ha |
|---:|---|---:|
| 2 | Bosque intervenido | 203.05 |
| 3 | Bosque maduro | 137.87 |
| 7 | Rastrojos (bosque pionero) | 58.39 |
| 9 | Uso agropecuario de subsistencia | 108.54 |
### 2012 · Bosque / no bosque 2012 — superficie en Qda. Bonita

| Código | Categoría | ha |
|---:|---|---:|
| 1 | Bosque | 326.19 |
| 2 | No bosque | 181.70 |

## Hallazgos

Ver la sección de evidencia de cada producto en `docs/DICCIONARIO_CAPAS_SINIA.md`.
