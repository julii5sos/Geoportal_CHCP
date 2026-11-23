@echo off
setlocal
rem Version completa (Flask) si existe el entorno de desarrollo .venv; si no, la version publicada.
if not exist "%~dp0.venv\Scripts\python.exe" (
  echo Abriendo la version en linea del Geoportal CHCP...
  start "" "https://julii5sos.github.io/Geoportal_CHCP/"
  exit /b 0
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\abrir_geoportal_local.ps1"
if errorlevel 1 (
  echo.
  echo No se pudo iniciar el Geoportal. Revise el mensaje anterior.
  pause
)
endlocal
