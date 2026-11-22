# Publica el Geoportal CHCP en Google Cloud Run con acceso público por enlace.
#
# Requisitos: Google Cloud CLI instalado (https://cloud.google.com/sdk/docs/install),
# sesión iniciada con `gcloud auth login` y facturación activa en el proyecto.
#
# Uso (PowerShell, desde la carpeta del repositorio):
#   powershell -ExecutionPolicy Bypass -File deploy\publicar_cloud_run.ps1
#
# Es idempotente: puede ejecutarse de nuevo para publicar una versión nueva.

param(
    [string]$Proyecto = "geoportal-513817",
    [string]$Region = "us-east1",
    [string]$Servicio = "geoportal-chcp",
    [int]$AnalisisPorIp = 12
)

$ErrorActionPreference = "Stop"
function Paso($texto) { Write-Host "`n==> $texto" -ForegroundColor Cyan }

Paso "Comprobando Google Cloud CLI"
gcloud --version | Select-Object -First 1
$cuenta = gcloud config get-value account 2>$null
if (-not $cuenta) { throw "No hay sesión de gcloud. Ejecute: gcloud auth login" }
Write-Host "Cuenta: $cuenta"

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repo
if (-not (Test-Path "data\estadisticas_territoriales.json")) { throw "Falta data\estadisticas_territoriales.json (ejecute scripts\precalcular_panel.py)." }

Paso "Seleccionando el proyecto $Proyecto"
gcloud config set project $Proyecto | Out-Null
$numero = gcloud projects describe $Proyecto --format "value(projectNumber)"

Paso "Activando servicios (Cloud Run, Cloud Build, Artifact Registry, Earth Engine)"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com `
    earthengine.googleapis.com serviceusage.googleapis.com

Paso "Preparando la cuenta de servicio de la aplicación (sin claves JSON)"
$sa = "geoportal-run@$Proyecto.iam.gserviceaccount.com"
$existe = gcloud iam service-accounts list --filter "email:$sa" --format "value(email)"
if (-not $existe) {
    gcloud iam service-accounts create geoportal-run --display-name "Geoportal CHCP (Cloud Run)"
}
# Lectura de assets y cálculo en Earth Engine; consumo de la cuota del proyecto.
foreach ($rol in @("roles/earthengine.viewer", "roles/serviceusage.serviceUsageConsumer")) {
    gcloud projects add-iam-policy-binding $Proyecto --member "serviceAccount:$sa" --role $rol --condition None | Out-Null
}
# Cloud Build construye la imagen con la cuenta de cómputo predeterminada.
gcloud projects add-iam-policy-binding $Proyecto `
    --member "serviceAccount:$numero-compute@developer.gserviceaccount.com" `
    --role "roles/run.builder" --condition None | Out-Null

Paso "Construyendo y publicando (5–10 minutos la primera vez)"
gcloud run deploy $Servicio `
    --source . `
    --region $Region `
    --service-account $sa `
    --allow-unauthenticated `
    --memory 2Gi --cpu 2 --timeout 600 `
    --concurrency 4 --min-instances 0 --max-instances 2 `
    --set-env-vars "GEE_PROJECT_ID=$Proyecto,WEB_ANALYSIS_RATE_LIMIT=$AnalisisPorIp,WEB_DOWNLOAD_RATE_LIMIT=30,WEB_RATE_LIMIT_WINDOW_SECONDS=600,WEB_MAX_CONCURRENT_ANALYSES=1,WEB_TRUST_PROXY_HEADERS=1"

$url = gcloud run services describe $Servicio --region $Region --format "value(status.url)"

Paso "Verificando el servicio publicado"
$salud = Invoke-RestMethod "$url/api/v1/health"
Write-Host "Salud: $($salud.status) · proyecto $($salud.project_id)"

Paso "Verificando Earth Engine con la cuenta de servicio (Qda. Bonita, coberturas SINIA)"
$cuerpo = '{"area":{"mode":"subbasin","subbasin":"Qda. Bonita"},"years":[2019,2021,2023]}'
try {
    $r = Invoke-RestMethod -Method Post -Uri "$url/api/v1/official-coverages/sinia" -ContentType "application/json" -Body $cuerpo -TimeoutSec 300
    foreach ($p in $r.result.products) { Write-Host ("  SINIA {0}: {1:N1} ha clasificadas, bosque {2:N1} %" -f $p.year, $p.classified_ha, $p.forest_pct) }
    Write-Host "Earth Engine responde con la identidad de producción." -ForegroundColor Green
} catch {
    Write-Host "Earth Engine NO respondió con la cuenta de servicio: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "Revise docs\PUBLICAR.md, sección «Si falla Earth Engine»."
}

Write-Host "`nGeoportal publicado:" -ForegroundColor Green
Write-Host "  $url/platform"
Write-Host "  $url/panel"
Write-Host "  $url/coberturas"
