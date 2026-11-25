# Guía para colaborar en el Geoportal CHCP

Esta guía resume cómo trabajar en el repositorio sin romper el sitio publicado, los datos
ni el método científico. Léala antes del primer cambio.

## 1. Cómo se trabaja

1. Cree una rama desde `main` con un nombre corto que diga qué hace (por ejemplo,
   `analisis-erosion` o `ficha-colores`).
2. Haga los cambios en esa rama.
3. Antes de subirla, compruebe que todo sigue bien (sección 6).
4. Abra un *pull request* hacia `main` y explique qué cambia, por qué y cómo lo comprobó.
5. La dueña del repositorio lo revisa y lo fusiona. Nadie sube cambios directo a `main`.

Cada fusión en `main` vuelve a publicar el sitio en GitHub Pages en unos minutos.

La rama `main` está protegida contra borrado y contra *force push*. No exige *pull request*
de forma técnica porque los flujos de Earth Engine guardan sus datos directo en `main`, y
GitHub no deja eximirlos de esa regla. El trabajo por *pull request* es un acuerdo del equipo.

## 2. Lo que no se cambia sin acuerdo previo

Estas condiciones son innegociables:

1. No modificar en silencio MT-2026.7 (sección 3).
2. No inventar categorías ni correspondencias entre códigos y categorías SINIA.
3. No sustituir la validación independiente por la concordancia entre mapas.
4. No ocultar que un resultado es precalculado o aproximado.
5. No modificar los assets originales sin autorización.
6. No afirmar exactitud sin una evaluación estadística válida.
7. No presentar resultados simulados como datos medidos.
8. No incorporar indicadores nuevos que no resuelvan un problema científico concreto.
9. No sacrificar los análisis validados para simplificar la interfaz.
10. No declarar el geoportal científicamente aprobado mientras existan problemas críticos
    sin resolver.

Y además:

- **Credenciales.** Nunca escriba claves, tokens ni el JSON de la cuenta de servicio en el
  código, en un commit o en un *issue*. La clave de Earth Engine vive solo en el secreto
  `GEE_SERVICE_ACCOUNT_JSON` de GitHub.
- **Earth Engine.** Se usa solo el proyecto `geoportal-513817`.
- **Assets SINIA.** Los ocho assets de MiAMBIENTE ya están cargados. No se vuelven a subir ni
  se modifican.
- **Colores.** Cada capa usa los colores de su fuente original (MiAMBIENTE, JRC, Hansen, ESRI,
  Copernicus). No se inventan colores ni se atribuyen a MiAMBIENTE colores que no son suyos.
- **Exactitud oficial.** No se publica la exactitud de 70,3 % del mapa oficial.
- **Textos del sitio.** Lenguaje claro, sin emojis ni separadores de punto medio ( · ). No se
  escribe que el sitio es una primera versión ni que hubo doble verificación.
- **Repositorios anteriores.** Los repositorios de referencia son solo de lectura.

## 3. Qué es MT-2026.7

Es el nombre de la versión vigente del **método de preevaluación** del geoportal: MT de
metodología, 2026 el año y 7 la séptima versión. Su nombre completo es
`MT-2026.7-DIAGNOSTICO-INTEGRADO`.

El método define:

- qué fuentes se usan y en qué períodos: JRC TMF 2025, Hansen desde 2021, ESRI 2017–2024,
  NDVI 2020–2025 y GEDI;
- los umbrales que convierten cada fuente en una señal de deterioro;
- los pesos: JRC 2,0, Hansen 2,0, ESRI 1,5, GEDI 0,5 y NDVI 0,5, para un máximo de 6,5 puntos;
- cómo se pasa del puntaje a la prioridad (Alta, Media, Baja, Preventiva) y a la prioridad de visita.

Está en `chcp/nucleo/metodologia_indice.py` y se explica en [METODOLOGIA.md](../METODOLOGIA.md).
Cada resultado guarda la versión con la que se calculó, así que cambiar una regla sin cambiar
la versión mezclaría resultados de dos métodos.

Si hace falta cambiar una regla, se crea una versión nueva (por ejemplo `MT-2026.8`). Hay que
justificar el cambio en [docs/DECISIONES_METODOLOGICAS.md](DECISIONES_METODOLOGICAS.md) y
recalcular todos los territorios. Los análisis que se añaden sin tocar estas reglas, como
los indicadores relativos (`MT-2026.7-SUBC-EXP-1`), llevan su propia versión y no cambian
la prioridad.

## 4. Cómo agregar un análisis nuevo

1. **Pregunta científica.** Escriba en el *pull request* qué problema resuelve y por qué
   no lo resuelven los análisis existentes (condición 8).
2. **Código.** La lógica va en `chcp/` y los scripts que la ejecutan en `scripts/`. Lo que
   use Earth Engine va en `chcp/gee/`; lo que no, en `chcp/nucleo/`.
3. **Datos.** Los resultados precalculados se guardan en `data/` en JSON o PNG. El sitio
   estático no llama a Earth Engine: solo lee esos archivos.
4. **Interfaz.** Muestre el resultado donde se use: ficha (`webapp/static/js/ficha.js`),
   Plataforma (`plataforma_estatica.js`) o simulador (`restauracion.js`). Indique la fuente,
   la fecha y si es aproximado.
5. **Documentación.** Explique el método en Metodología
   (`webapp/templates/methodology.html`) y añada la referencia APA de cada fuente nueva en
   «Cómo citar y usar los datos».
6. **Pruebas.** Añada pruebas en `tests/` para la lógica nueva.

Si el análisis necesita Earth Engine, lea antes la sección 5.

## 5. Earth Engine: una sola cuota para todo el equipo

Todos los cálculos con Earth Engine usan el mismo proyecto, `geoportal-513817`, y la misma
cuota mensual gratuita. Si se agota, el proyecto pasa a **modo restringido** hasta el día 1 del
mes siguiente. Eso pasó en noviembre de 2026.

- **Avisen antes de lanzar una corrida.** Una corrida grande de una persona puede dejar a la
  otra sin cuota.
- **Prueben con pocos territorios.** Casi todos los flujos tienen la opción de limitar los
  territorios (`territorios` o `limite`); prueben con una o dos subcuencas antes de lanzar
  las 54.
- **Corrida automática.** «Actualizar datos con Earth Engine» corre solo el día 1 de cada mes
  y continúa el día 2. No lancen corridas pesadas esos días.

| Flujo de GitHub Actions | ¿Usa Earth Engine? |
|---|---|
| Actualizar datos con Earth Engine | Sí, el más pesado |
| Series anuales (mapas y superficies por año) | Sí, pesado |
| Coberturas SINIA (mapas y superficies) | Sí |
| Generar muestra de validación | Sí |
| Exactitud por fuente | Sí |
| Auditoría de paridad de procesamiento | Sí |
| Auditoría SINIA 2012 controlada | Sí |
| Publicar sitio estático | No |
| Auditoría de datos | No |

Para correr Earth Engine desde su computadora, la persona necesita acceso al proyecto en
Google Cloud, que se da en la consola de Google Cloud y no en GitHub. Lo que corra ahí gasta
la misma cuota.

Los resultados de estos flujos se guardan solos en `main`. Si una corrida falla a la mitad,
lo avanzado queda guardado y la siguiente corrida continúa desde ahí.

## 6. Antes de abrir un pull request

```bash
pip install -r requirements-web.txt pytest
python -m pytest -q                      # todas las pruebas deben pasar
python scripts/auditar_datos.py          # 0 errores
python scripts/construir_sitio_estatico.py --destino /tmp/sitio
python -m http.server 8000 -d /tmp/sitio # abrir http://localhost:8000 y revisar las páginas tocadas
```

Revise en el navegador que las páginas que cambió cargan sin errores en la consola, tanto en
pantalla ancha como en celular.

En GitHub, el flujo «Auditoría de datos» corre la misma auditoría en cada *pull request* y no gasta
cuota de Earth Engine. Para revisar los resultados a fondo, siga
[docs/auditoria/COMO_AUDITAR.md](auditoria/COMO_AUDITAR.md).

## 7. Dónde está cada cosa

| Carpeta | Contenido |
|---|---|
| `chcp/` | Método, cálculos y conexión con Earth Engine |
| `scripts/` | Precálculo, auditorías y construcción del sitio |
| `data/` | Resultados precalculados que lee el sitio |
| `webapp/templates/` | Páginas (HTML) |
| `webapp/static/js/`, `webapp/static/css/` | Interacción y estilos |
| `tests/` | Pruebas |
| `docs/` | Método, decisiones, auditoría y publicación |
| `.github/workflows/` | Flujos de GitHub Actions |
