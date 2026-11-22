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

| Qué ofrece la página | Qué queda para una actualización futura |
|---|---|
| Monitoreo de la CHCP y 53 subcuencas: preevaluación MT-2026.7, dinámica JRC, serie 2020–2025, Hansen, ESRI, NDVI, SINIA 2019/2021/2023, fragmentación y conectividad 2021, corredores y rankings | Dibujar o importar un polígono y analizarlo al momento |
| Coberturas SINIA: leyendas verificadas de los 8 productos, superficies por subcuenca, comparación con advertencias | Ver capas satelitales y SINIA como teselas sobre el mapa |

## Configuración (una sola vez)

1. **Fusionar** la rama `integracion-geoportal` en `main` (pull request #1).
2. **Activar Pages:** Settings → Pages → Build and deployment → Source: **GitHub Actions**.
   La página queda en `https://julii5sos.github.io/Geoportal_CHCP/`.
3. **Guardar la clave de Earth Engine como secreto:** Settings → Secrets and variables →
   Actions → **New repository secret**
   - Name: `GEE_SERVICE_ACCOUNT_JSON`
   - Secret: abra el archivo `.json` de la cuenta de servicio `geoportal-web` con el Bloc
     de notas y pegue **todo** su contenido.

   GitHub cifra el secreto: no aparece en el código, en los registros ni en la página.
   La cuenta de servicio necesita los roles *Earth Engine Resource Viewer* y
   *Service Usage Consumer* en `geoportal-513817`.

## Actualizar los análisis

- **Automático:** el día 1 de cada mes.
- **Manual:** Actions → «Actualizar datos con Earth Engine» → **Run workflow**
  (opcional: «Solo N territorios» para una prueba rápida).

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

Para habilitar el análisis de polígonos dibujados hace falta un servidor con Earth
Engine. El repositorio incluye `deploy/publicar_cloud_run.ps1` para Google Cloud Run,
cuya capa gratuita mensual cubre un uso bajo (requiere facturación activa). Si se
publica, defina la variable de Actions `CHCP_FULL_APP_URL` con su dirección y la
página HTML mostrará el enlace «Análisis territorial ↗».
