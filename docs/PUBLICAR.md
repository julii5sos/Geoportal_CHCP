# Publicar el Geoportal CHCP

El geoportal se publica **gratis en GitHub**: una página HTML (GitHub Pages) con los
análisis de la CHCP y sus 53 subcuencas, recalculados con Google Earth Engine por
GitHub Actions. No requiere servidores de pago ni expone credenciales.

```
GitHub Actions (mensual o manual)                     GitHub Pages
┌──────────────────────────────────────┐   commit     ┌──────────────────────────┐
│ Earth Engine (cuenta de servicio,    │ ───────────► │ HTML estático            │
│ secreto cifrado del repositorio)     │  datos JSON  │ Monitoreo + Coberturas   │
│ precalcular_panel.py → 54 territorios│              │ sin claves ni servidores │
└──────────────────────────────────────┘              └──────────────────────────┘
```

Páginas publicadas: **Inicio** (con recorrido guiado), **Panel**, **Plataforma SIG**, **Ficha
técnica**, **Simulador de restauración** (con rutas al Corredor Mesoamericano), **Coberturas
SINIA**, **Sitios de campo**, **Metodología** y **Acerca**.

| Qué ofrece la página | Cómo se calcula |
|---|---|
| CHCP y 53 subcuencas: preevaluación MT-2026.7, JRC, Hansen, ESRI, NDVI, GEDI, ERI, fragmentación, conectividad, corredores y franjas riparias | Precalculado con Earth Engine (tipo B) |
| Mapas de las capas por subcuenca y de los 8 productos SINIA | Precalculado con Earth Engine |
| Polígono dibujado o subido (GeoJSON o KML) | Estimación local en el navegador sobre los mapas precalculados (tipo C) |
| Simulador de restauración y rutas al corredor | Cálculo en el navegador sobre la red y los mapas precalculados |

## Versión sin conexión

Cada publicación genera además `descargas/Geoportal_CHCP_sin_conexion.zip` (enlace al pie de
la página de inicio). Contiene el sitio y dos lanzadores:

- `Abrir Geoportal (Windows).bat`: un servidor local en PowerShell; no instala nada.
- `Abrir Geoportal (Mac o Linux).command`: usa `python3 -m http.server`.

Hace falta porque los navegadores no permiten que una página abierta como archivo (`file://`)
lea sus datos. Si alguien abre `index.html` directamente, la página lo explica.

## Configuración (una sola vez)

1. **Activar Pages:** Settings → Pages → Build and deployment → Source: **GitHub Actions**.
   La página queda en `https://julii5sos.github.io/Geoportal_CHCP/`.
2. **Guardar la clave de Earth Engine como secreto:** Settings → Secrets and variables →
   Actions → **New repository secret**
   - Name: `GEE_SERVICE_ACCOUNT_JSON`
   - Secret: abra el archivo `.json` de la cuenta de servicio `geoportal-web` con el Bloc
     de notas y pegue **todo** su contenido.

   GitHub cifra el secreto: no aparece en el código, en los registros ni en la página.
   La cuenta de servicio necesita los roles *Earth Engine Resource Viewer* y
   *Service Usage Consumer* en `geoportal-513817`.

## Actualizar los análisis

- **Automático:** el día 1 de cada mes recalcula todo; el día 2 continúa con lo que faltara.
- **Manual:** Actions → «Actualizar datos con Earth Engine» → **Run workflow**.
  - `completo` (por defecto): continúa donde quedó la ejecución anterior.
  - `rehacer-todo`: empieza de cero los 54 territorios.
  - «Solo N territorios»: para una prueba rápida.

Un cálculo completo con mapas tarda más que el límite de 6 horas de GitHub. No es un
error: al agotarse el tiempo se guarda lo avanzado y basta con ejecutar otra vez en modo
`completo`. El registro del paso «Recalcular» muestra el avance territorio por territorio.

El flujo verifica primero Earth Engine con la cuenta de servicio (Qda. Bonita, 7
comprobaciones), recalcula los 54 territorios, guarda `data/estadisticas_territoriales.json`
y vuelve a publicar la página. Si algo falla, la página anterior sigue publicada.

## Vista previa local

```powershell
python scripts/construir_sitio_estatico.py
python -m http.server 8000 --directory sitio
```

Abra http://127.0.0.1:8000.

## Seguridad

- No suba nunca el archivo `.json` de la cuenta de servicio al repositorio.
- Para revocar el acceso: consola de Google Cloud → IAM → Cuentas de servicio →
  `geoportal-web` → Claves → eliminar la clave. Después cree una nueva y actualice el secreto.

## Opción futura: versión completa con servidor

Para analizar áreas fuera de la CHCP o con parámetros distintos hace falta un servidor con
Earth Engine. El repositorio incluye `deploy/publicar_cloud_run.ps1` para Google Cloud Run,
cuya capa gratuita mensual cubre un uso bajo (requiere facturación activa). Si se
publica, defina la variable de Actions `CHCP_FULL_APP_URL` con su dirección y la
página HTML mostrará el enlace «Análisis territorial ↗».
