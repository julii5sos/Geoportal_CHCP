@echo off
title Geoportal CHCP
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"
if errorlevel 1 pause
