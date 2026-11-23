# Servidor local mínimo para abrir el Geoportal CHCP sin instalar nada (Windows).
# Los navegadores no permiten que una página abierta como archivo (file://) lea sus datos;
# este script sirve la carpeta «sitio» en http://localhost y abre el navegador.
$ErrorActionPreference = 'Stop'
$raiz = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'sitio'))
if (-not (Test-Path -LiteralPath (Join-Path $raiz 'index.html'))) {
    Write-Host 'No se encontró la carpeta «sitio». Descomprima todo el archivo .zip antes de abrir el geoportal.' -ForegroundColor Red
    exit 1
}
$tipos = @{
    '.html' = 'text/html; charset=utf-8'; '.js' = 'application/javascript; charset=utf-8'
    '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'
    '.geojson' = 'application/geo+json'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'
    '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'; '.webp' = 'image/webp'
    '.csv' = 'text/csv; charset=utf-8'; '.kml' = 'application/vnd.google-earth.kml+xml'
    '.txt' = 'text/plain; charset=utf-8'; '.woff2' = 'font/woff2'; '.pdf' = 'application/pdf'
}
$servidor = $null
foreach ($puerto in 8765..8795) {
    try {
        $servidor = New-Object System.Net.HttpListener
        $servidor.Prefixes.Add("http://localhost:$puerto/")
        $servidor.Start()
        break
    } catch { $servidor = $null }
}
if (-not $servidor) { Write-Host 'No se encontró un puerto libre entre 8765 y 8795.' -ForegroundColor Red; exit 1 }
$url = "http://localhost:$puerto/index.html"
Write-Host ''
Write-Host '  Geoportal CHCP abierto en' $url -ForegroundColor Green
Write-Host '  Deje esta ventana abierta mientras usa el geoportal. Para terminar, ciérrela.'
Write-Host ''
Start-Process $url
while ($servidor.IsListening) {
    $ctx = $servidor.GetContext()
    try {
        $ruta = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
        if ($ruta -eq '' -or $ruta.EndsWith('/')) { $ruta += 'index.html' }
        $archivo = [IO.Path]::GetFullPath((Join-Path $raiz $ruta))
        if ($archivo.StartsWith($raiz) -and (Test-Path -LiteralPath $archivo -PathType Leaf)) {
            $bytes = [IO.File]::ReadAllBytes($archivo)
            $ext = [IO.Path]::GetExtension($archivo).ToLowerInvariant()
            $ctx.Response.ContentType = if ($tipos.ContainsKey($ext)) { $tipos[$ext] } else { 'application/octet-stream' }
            $ctx.Response.StatusCode = 200
        } else {
            $bytes = [Text.Encoding]::UTF8.GetBytes('No encontrado')
            $ctx.Response.ContentType = 'text/plain; charset=utf-8'
            $ctx.Response.StatusCode = 404
        }
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
        # El navegador puede cancelar una descarga a medias; el servidor sigue atendiendo.
    } finally {
        try { $ctx.Response.Close() } catch { }
    }
}
