# Hoja de ruta de módulos científicos

Estado a 2026-11-22. Cada módulo indica qué datos o decisiones necesita antes de publicarse. Ninguno modifica la fórmula MT-2026.7 sin una nueva versión documentada.

| Módulo | Estado | Qué falta |
|---|---|---|
| Área núcleo (50/100/200 m), ENN, cohesión, IIC/dIIC | **Implementado** (`chcp/nucleo/metricas_paisaje.py`) | Ejecutar «Actualizar datos con Earth Engine» para generar `VERSION_DATOS = 2`. |
| ERI por subcuenca | **Implementado** en el precálculo | Igual que el anterior. |
| Ficha técnica por subcuenca | **Implementada** (`/ficha`, imprimible a PDF) | Se enriquece sola cuando llegan los datos v2 (mapa de parches, núcleo, dIIC, ERI). |
| Validación e incertidumbre | Diseño | Puntos de referencia independientes (fotointerpretación o campo) con muestreo estratificado por clase de mapa; matriz de confusión, exactitud de usuario/productor, área ajustada por error e IC 95 % (Olofsson et al., 2014; FAO). Sin esos puntos no se publican intervalos. |
| Conectividad por circuitos y PC/dPC | En espera | Superficie de resistencia justificada (bibliografía o expertos) y distancias de dispersión por grupo de especies. IIC binario ya cubre la versión sin parámetros biológicos. |
| Persistencia del bosque | Siguiente | Frecuencia de bosque JRC 1990–2025 por píxel; se puede añadir al precálculo sin parámetros nuevos. |
| Conectividad riparia | Siguiente | Red hídrica HydroSHEDS/MERIT; franjas de 30/50/100 m y porcentaje con bosque por tramo. |
| Priorización y simulador de restauración | Diseño | Se hará en el navegador sobre las geometrías de `data/subcuencas/<id>.json`: el usuario «rellena» una brecha y se recalcula IIC con la misma fórmula. |
| Comparador de escenarios | Diseño | Depende del simulador (escenario actual, conservación, restauración). |
| Formularios de verificación de campo | Diseño | Un sitio estático no guarda envíos: usar KoboToolbox (gratuito) o GitHub Issues con plantilla; estados pendiente/visitado/confirmado/descartado. |
| Dibujo de polígonos propios | Futuro | Requiere un servidor con acceso a GEE. |
