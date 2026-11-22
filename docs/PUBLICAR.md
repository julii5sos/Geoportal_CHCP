# Publicar el Geoportal CHCP

El geoportal se publica en **dos versiones gratuitas** que se complementan:

| Versión | Dónde | Contenido | Earth Engine |
|---|---|---|---|
| **HTML estática** | GitHub Pages · `https://julii5sos.github.io/Geoportal_CHCP/` | Monitoreo (CHCP y 53 subcuencas), mapas de subcuencas, corredores y puntos críticos, leyendas SINIA y superficies 2019/2021/2023 por subcuenca | No (datos precalculados) |
| **Completa** | Hugging Face Spaces (opción A) o Cloud Run (opción B) | Todo lo anterior + análisis de polígonos y capas satelitales y SINIA en el mapa | Sí |

## Versión HTML estática (GitHub Pages)

Se construye con `python scripts/construir_sitio_estatico.py` y se publica sola con
`.github/workflows/pages.yml` en cada cambio de la rama `main`.

Activación (una vez):

1. Fusione la rama `integracion-geoportal` en `main` (pull request en GitHub).
2. En GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. (Cuando exista la versión completa) **Settings → Secrets and variables → Actions →
   Variables → New variable** `CHCP_FULL_APP_URL` = `https://SU_USUARIO-geoportal-chcp.hf.space`.
   La versión HTML mostrará entonces el enlace «Análisis territorial ↗».

Para actualizar los datos: ejecute `python scripts/precalcular_panel.py` en su
computadora, suba `data/estadisticas_territoriales.json` a `main` y el sitio se
reconstruye automáticamente.

Vista previa local: `python scripts/construir_sitio_estatico.py` y luego
`python -m http.server 8000 --directory sitio` → http://127.0.0.1:8000

## Versión completa

Modo elegido: **público con enlace**. Hay dos opciones:

> **Actualización 2026-11-22:** Hugging Face exige ahora una suscripción PRO para
> Spaces Docker (error 402 «Payment Required»). La opción recomendada pasa a ser
> **Google Cloud Run (B)**, que el proyecto ya tiene habilitada con facturación y cuya
> capa gratuita mensual cubre un uso bajo. La opción A queda documentada por si se
> dispone de una cuenta PRO.

| | A. Hugging Face Spaces (requiere PRO) | B. Google Cloud Run (recomendada) |
|---|---|---|
| Costo | Suscripción PRO | Capa gratuita mensual; requiere facturación activa |
| Recursos | 2 vCPU, 16 GB RAM | 1 vCPU, 2 GB RAM, escala a cero |
| Inactividad | Se duerme tras 48 h sin visitas; despierta en ~1 min | Arranca en segundos |
| Credencial de Earth Engine | Clave JSON guardada como **secreto** del Space | Identidad de Cloud Run sin clave |
| Comando | `python scripts/publicar_huggingface.py` | `deploy\publicar_cloud_run.ps1` |

> Los «300 USD» que muestra Google Cloud al activar la facturación son **crédito
> gratuito de prueba**, no un cobro. Aun así, la opción A no requiere facturación.

## Opción A — Hugging Face Spaces (gratis)

### A.1 Cuenta y token de Hugging Face

1. Cree una cuenta gratuita en https://huggingface.co.
2. En https://huggingface.co/settings/tokens cree un token de tipo **Write** y cópielo.

### A.2 Cuenta de servicio de Earth Engine (consola web, sin instalar nada)

1. Abra https://console.cloud.google.com/iam-admin/serviceaccounts?project=geoportal-513817
2. **Crear cuenta de servicio** → nombre `geoportal-web` → Crear y continuar.
3. Asigne los roles **Earth Engine Resource Viewer** y **Service Usage Consumer** → Listo.
4. Abra la cuenta creada → pestaña **Claves** → Agregar clave → Crear clave nueva → **JSON**.
   Se descarga un archivo `.json`.
5. **Guárdelo fuera de la carpeta del proyecto** (por ejemplo, en `Descargas`). Nunca lo
   suba a GitHub ni lo comparta: da acceso a su cuota de Earth Engine.

Si la consola dice que la creación de claves está deshabilitada, use la opción B.

### A.3 Publicar

```powershell
pip install huggingface_hub
python scripts/publicar_huggingface.py --usuario SU_USUARIO_HF --clave "C:\Users\...\Downloads\geoportal-513817-xxxx.json"
```

El script verifica la clave contra Earth Engine, crea el Space público, guarda la clave
como secreto, configura los límites de uso y sube el código (sin pruebas, historial ni
credenciales). La dirección queda como `https://SU_USUARIO_HF-geoportal-chcp.hf.space`.

Para publicar una versión nueva repita el comando **sin** `--clave` (el secreto se
conserva). Para revocar el acceso a Earth Engine, elimine la clave en la consola.

## Opción B — Google Cloud Run

## Qué se publica

| Elemento | Configuración |
|---|---|
| Servicio | Cloud Run `geoportal-chcp`, región `us-east1` |
| Identidad | Cuenta de servicio `geoportal-run@geoportal-513817.iam.gserviceaccount.com`, **sin claves JSON** (credenciales automáticas de Cloud Run) |
| Permisos | `roles/earthengine.viewer` (leer assets y calcular) y `roles/serviceusage.serviceUsageConsumer` |
| Acceso | Cualquiera con el enlace (`--allow-unauthenticated`) |
| Protección de cuota | 12 análisis por IP cada 10 min, 1 análisis simultáneo por instancia, máximo 2 instancias, área máxima 345 000 ha |
| Escala a cero | Sin visitas no hay instancias encendidas; la primera visita tarda unos segundos |
| Datos incluidos | Límites, corredores, leyendas SINIA e indicadores precalculados del panel (`data/`) |

## Pasos (una vez)

1. Instale Google Cloud CLI: https://cloud.google.com/sdk/docs/install (Windows: instalador).
2. En una terminal nueva:
   ```powershell
   gcloud auth login
   ```
3. En la carpeta del repositorio:
   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\publicar_cloud_run.ps1
   ```
4. Al final se muestra la dirección pública (`https://geoportal-chcp-….run.app`) y una
   verificación real con Earth Engine usando la cuenta de servicio.

Para publicar una versión nueva, repita el paso 3.

## Recomendado: alerta de presupuesto

Consola de Google Cloud → Facturación → Presupuestos y alertas → crear un presupuesto
para `geoportal-513817` (por ejemplo, 1 USD/mes) con avisos al 50 %, 90 % y 100 %.
Una alerta avisa, pero no detiene el servicio: si llega, retire el acceso público o
el servicio con los comandos de «Ajustes».
Cloud Run cobra por uso; con tráfico bajo suele quedar dentro de la capa gratuita.

## Si falla Earth Engine

- **«Project not registered» / «not signed up»:** el proyecto debe estar registrado en
  Earth Engine para uso no comercial (https://code.earthengine.google.com/register).
- **«Permission denied» al leer un asset:** confirme que los assets están en
  `projects/geoportal-513817/assets/` y que la cuenta de servicio tiene
  `roles/earthengine.viewer` en el proyecto.
- **Cloud Build sin permisos:** el script concede `roles/run.builder` a la cuenta de
  cómputo predeterminada; si su organización lo bloquea, conceda ese rol en IAM.

## Ajustes

- Más o menos análisis por persona: `-AnalisisPorIp 20`.
- Retirar el acceso público: `gcloud run services remove-iam-policy-binding geoportal-chcp --region us-east1 --member allUsers --role roles/run.invoker`.
- Retirar el servicio: `gcloud run services delete geoportal-chcp --region us-east1`.
