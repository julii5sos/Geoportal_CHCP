# Geoportal CHCP

Plataforma científica de análisis territorial y monitoreo de bosques de la
**Cuenca Hidrográfica del Canal de Panamá (CHCP)**, desarrollada en el marco del
**Clúster Copernicus Centroamérica AFOLU II** a partir de trabajos técnicos con
Fundación Natura.

Integra información satelital multitemporal (JRC TMF, Hansen GFC, ESRI LULC,
Sentinel-2, GEDI), la cartografía oficial SINIA–MiAMBIENTE, fragmentación del
paisaje, conectividad estructural, corredores publicados y el Índice de
Resiliencia Ecológica (ERI) para identificar **dónde** cambia el paisaje y **qué
sectores** podrían requerir monitoreo, conservación, restauración o verificación
de campo.

> Los resultados son una **preevaluación indicativa**. No predicen deforestación,
> no certifican cumplimiento normativo ni EUDR y no demuestran conectividad
> funcional o movimiento de especies.

## Estructura

```text
chcp/                     Motores científicos (sin dependencia de la interfaz)
  nucleo/                 Índice MT-2026.7, ERI, fragmentación/red, corredores
  territorio/             CHCP, 53 subcuencas y búsqueda territorial
  catalogos/              Assets SINIA, catálogo multifuente, simbología
  gee/                    Consultas a Google Earth Engine (proyecto geoportal-513817)
  informes/               Informe técnico PDF y cartografía
webapp/                   API Flask + interfaz HTML/CSS/JS (Leaflet local)
data/                     Límites, subcuencas, corredores y puntos críticos
tests/                    Pruebas automatizadas (pytest)
scripts/                  Verificaciones reproducibles contra Earth Engine
docs/                     Arquitectura, decisiones y registro histórico
```

## Puesta en marcha (Windows, Anaconda)

```powershell
conda create -n geoportal python=3.12 -y
conda activate geoportal
pip install -r requirements-web.txt
earthengine authenticate          # una vez; las credenciales quedan fuera del repositorio
$env:GEE_PROJECT_ID = "geoportal-513817"
python -m webapp.main             # http://127.0.0.1:8080
```

Pruebas: `pip install pytest` y luego `python -m pytest`.

Verificación contra Earth Engine (requiere credenciales locales):

```powershell
python scripts/verificar_conexion_gee.py
python scripts/verificar_geoportal_gee.py
```

## Metodología

- **Preevaluación territorial `MT-2026.7-DIAGNOSTICO-INTEGRADO`** — JRC 2.0,
  Hansen 2.0, ESRI 1.5, GEDI 0.5, NDVI 0.5; máximo **6.5 puntos**. La prioridad
  integrada de visita añade hasta 1.5 puntos de valor estratégico del corredor
  (máximo 8.0) y mantiene separada la condición estructural. Ver
  [METODOLOGIA.md](METODOLOGIA.md).
- **Importancia de parches** — `0.40 grado + 0.30 intermediación + 0.20 área +
  0.10 fuerza` (normalizados), sobre la red completa; el mapa muestra una
  estructura simplificada.
- **ERI** — `0.35 integridad + 0.25 conectividad + 0.20 estabilidad topográfica +
  0.20 proximidad riparia`; complementario, no modifica la prioridad.

Las decisiones de integración entre los repositorios de origen están en
[docs/DECISIONES_METODOLOGICAS.md](docs/DECISIONES_METODOLOGICAS.md).

## Seguridad

No se guardan credenciales en Git. En local se usan las credenciales OAuth de
`earthengine authenticate`; en Cloud Run, la identidad de servicio adjunta
(Application Default Credentials). Ver `.env.example`.

## Atribución

Datos Copernicus Sentinel modificados, procesados en Google Earth Engine. JRC TMF,
Hansen/UMD/Google/USGS/NASA, ESRI Land Cover, GEDI, cartografía SINIA–MiAMBIENTE y
corredores de Almanaque Azul. Ver [THIRD_PARTY_DATA.md](THIRD_PARTY_DATA.md).
