# Reproducir el Geoportal CHCP

Esta guía permite a otra persona instalar la aplicación, verificar los datos y
regenerar todos los resultados publicados en el repositorio.

## 1. Qué es el proyecto de Earth Engine `geoportal-513817`

Es un proyecto de Google Cloud creado **solo para esta aplicación**. No pertenece a
una cuenta institucional ni contiene datos ajenos al geoportal. Aloja:

- los ocho assets SINIA–MiAMBIENTE bajo `projects/geoportal-513817/assets/`;
- la cuota de procesamiento de Earth Engine que usa la aplicación.

Las fuentes globales (JRC TMF, Hansen, ESRI, Sentinel-2, GEDI, etc.) son catálogos
públicos de Earth Engine y no requieren copia.

## 2. Requisitos

| Elemento | Cómo obtenerlo |
|---|---|
| Python 3.11+ (Anaconda o Miniconda) | `conda env create -f environment.yml` |
| Cuenta de Google con Earth Engine | https://code.earthengine.google.com/register (uso no comercial o investigación) |
| Proyecto de Google Cloud registrado en Earth Engine | El suyo propio, o acceso de lectura a `geoportal-513817` |
| Los ocho assets SINIA | Acceso de lectura a los existentes **o** su propia copia (ver §3) |

## 3. Acceso a los assets SINIA

**Opción A — usar los assets existentes.** Pida al responsable del proyecto que
comparta los ocho assets con su cuenta (permiso *Lector*). Defina:

```powershell
$env:GEE_PROJECT_ID = "su-proyecto-de-cuota"   # o geoportal-513817 si tiene acceso
$env:SINIA_ASSET_ROOT = "projects/geoportal-513817/assets"
```

**Opción B — su propia copia.** Descargue los productos originales del catálogo de
SINIA (https://sinia.gob.pa/datos-abiertos-y-geoservicios/), súbalos a su proyecto
con **exactamente los mismos nombres** que figuran en `data/catalogo_assets_sinia.json`
y defina `SINIA_ASSET_ROOT=projects/<su-proyecto>/assets`. Después ejecute la
auditoría (§5): si los códigos o leyendas difieren, el diccionario lo mostrará.

## 4. Instalación y pruebas

```powershell
conda env create -f environment.yml
conda activate geoportal-chcp
earthengine authenticate              # credenciales locales, fuera del repositorio
python -m pytest                      # no requiere Earth Engine
```

## 5. Cadena de verificación y resultados (en este orden)

| Paso | Comando | Produce | Tiempo |
|---|---|---|---|
| 1. Acceso | `python scripts/verificar_conexion_gee.py` | Mensaje de conexión | < 1 min |
| 2. Auditoría SINIA | `python scripts/auditar_assets_sinia.py` | `docs/validacion/auditoria_assets_sinia.json` | 10–30 min |
| 3. Aplicar evidencia | `python scripts/aplicar_auditoria_sinia.py --escribir` | Estados verificados en `data/leyendas_sinia.json` | segundos |
| 4. Diccionario | `python scripts/generar_diccionario_sinia.py` | `docs/DICCIONARIO_CAPAS_SINIA.md` | segundos |
| 5. Motor científico | `python scripts/verificar_geoportal_gee.py` | `verificacion_geoportal_gee.json` (Qda. Bonita, 7 comprobaciones) | 1 min |
| 6. Panel | `python scripts/precalcular_panel.py` | `data/estadisticas_territoriales.json` (54 territorios) | 30–80 min |
| 7. Aplicación | `python -m webapp.main` | http://127.0.0.1:8080 | — |

Los resultados de los pasos 2, 5 y 6 obtenidos el 2026-11-21 están versionados en
el repositorio para poder comparar una nueva ejecución con la original.

## 6. Qué no debe cambiar al reproducir

- Fórmulas y umbrales del índice `MT-2026.7-DIAGNOSTICO-INTEGRADO` (`chcp/nucleo/metodologia_indice.py`).
- Índice de importancia de parches `0.40/0.30/0.20/0.10` y pesos del ERI `0.35/0.25/0.20/0.20`.
- Significado de los códigos SINIA: solo cambia con evidencia, editando
  `data/leyendas_sinia.json` y regenerando el diccionario.

## 7. Despliegue

`Dockerfile` y `deploy/cloud-run-service.template.yaml` usan una cuenta de servicio
adjunta (Application Default Credentials). No incluya claves JSON en la imagen ni en
Git. La cuenta de servicio necesita permiso de lectura sobre los ocho assets.
