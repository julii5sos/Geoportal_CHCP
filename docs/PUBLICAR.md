# Publicar el Geoportal CHCP

Modo elegido: **público con enlace** en Google Cloud Run, dentro del proyecto
`geoportal-513817` (proyecto exclusivo de esta aplicación).

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
para `geoportal-513817` (por ejemplo, 10 USD/mes) con avisos al 50 %, 90 % y 100 %.
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
