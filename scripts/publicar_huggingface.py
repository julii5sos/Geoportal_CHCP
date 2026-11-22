"""Publica el Geoportal CHCP gratis en Hugging Face Spaces (Docker).

No requiere git ni tarjeta. Sube el código a un Space público, guarda la clave de
la cuenta de servicio de Earth Engine como **secreto** del Space (nunca en el
repositorio) y configura los límites de uso.

Antes de usarlo (una vez):
  1. Cree una cuenta gratuita en https://huggingface.co y un token de escritura en
     https://huggingface.co/settings/tokens (tipo «Write").
  2. Cree la cuenta de servicio y su clave JSON (ver docs/PUBLICAR.md, opción A).

Uso:
    pip install huggingface_hub
    python scripts/publicar_huggingface.py --usuario SU_USUARIO --clave C:\\ruta\\clave.json

El token se pide en pantalla (o se lee de HF_TOKEN). La clave JSON se verifica contra
Earth Engine antes de subirla.
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
if str(RAIZ) not in sys.path:
    sys.path.insert(0, str(RAIZ))

EXCLUIR = {".git", "tests", "__pycache__", ".venv", "output", "tmp", ".pytest_cache"}
EXCLUIR_RUTAS = {Path("docs/historial"), Path("docs/validacion")}
EXCLUIR_SUFIJOS = {".pyc", ".pem", ".p12", ".key", ".log"}

CABECERA_SPACE = """---
title: Geoportal CHCP
emoji: 🌳
colorFrom: blue
colorTo: green
sdk: docker
app_port: 8080
pinned: true
short_description: Monitoreo de bosques de la Cuenca del Canal de Panamá
---

"""


def verificar_clave(info: dict, proyecto: str) -> None:
    import ee
    from google.oauth2 import service_account

    from chcp.catalogos.leyendas_sinia import id_asset

    if info.get("project_id") != proyecto:
        raise SystemExit(f"La clave pertenece al proyecto {info.get('project_id')}, no a {proyecto}.")
    credenciales = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/earthengine", "https://www.googleapis.com/auth/cloud-platform"])
    ee.Initialize(credentials=credenciales, project=proyecto)
    tipo = ee.data.getAsset(id_asset("2021_general"))["type"]
    ha = ee.Image.pixelArea().divide(10_000).reduceRegion(
        reducer=ee.Reducer.sum(), geometry=ee.Geometry.Point([-79.7, 9.15]).buffer(500), scale=30).getInfo()
    print(f"  Earth Engine responde con {info['client_email']}: asset 2021 = {tipo}, prueba de cálculo = {ha['area']:.1f} ha")


def preparar_carpeta(destino: Path) -> None:
    for origen in RAIZ.rglob("*"):
        rel = origen.relative_to(RAIZ)
        if any(parte in EXCLUIR for parte in rel.parts) or any(rel.is_relative_to(p) for p in EXCLUIR_RUTAS):
            continue
        if origen.is_dir() or origen.suffix in EXCLUIR_SUFIJOS or origen.name.startswith(".env"):
            continue
        if "credential" in origen.name.lower() or "service-account" in origen.name.lower() or "verificacion_" in origen.name:
            continue
        (destino / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(origen, destino / rel)
    readme = (RAIZ / "README.md").read_text(encoding="utf-8")
    (destino / "README.md").write_text(CABECERA_SPACE + readme, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--usuario", required=True, help="Usuario u organización de Hugging Face")
    parser.add_argument("--space", default="geoportal-chcp")
    parser.add_argument("--clave", help="Ruta a la clave JSON de la cuenta de servicio (solo la primera vez o para cambiarla)")
    parser.add_argument("--proyecto", default=os.getenv("GEE_PROJECT_ID", "geoportal-513817"))
    parser.add_argument("--analisis-por-ip", type=int, default=12)
    args = parser.parse_args()

    try:
        from huggingface_hub import HfApi
    except ImportError:
        raise SystemExit("Instale primero: pip install huggingface_hub")

    token = (os.getenv("HF_TOKEN") or getpass.getpass("Token de Hugging Face (Write): ")).strip().strip('"')
    if not token.startswith("hf_"):
        raise SystemExit("El token debe empezar con «hf_». En Windows, pegar en la pregunta oculta a veces no funciona: "
                         "defínalo antes con  set HF_TOKEN=hf_...  y vuelva a ejecutar el script.")
    api = HfApi(token=token)
    try:
        cuenta = api.whoami()
    except Exception:
        raise SystemExit("Hugging Face rechazó el token (401). Cree uno nuevo de tipo «Write» en "
                         "https://huggingface.co/settings/tokens, confirme su correo y defínalo con  set HF_TOKEN=hf_...")
    permiso = ((cuenta.get("auth") or {}).get("accessToken") or {}).get("role")
    if permiso not in (None, "write", "fineGrained"):
        raise SystemExit(f"El token es de tipo «{permiso}». Necesita uno de tipo «Write».")
    if cuenta.get("name", "").lower() != args.usuario.lower():
        print(f"  Aviso: el token pertenece a «{cuenta.get('name')}»; se usará ese usuario.")
        args.usuario = cuenta["name"]
    print(f"  Token válido para {cuenta.get('name')} ({permiso or 'sin rol informado'}).")
    repo_id = f"{args.usuario}/{args.space}"

    if args.clave:
        print("1/4 Verificando la clave de la cuenta de servicio en Earth Engine…")
        info = json.loads(Path(args.clave).read_text(encoding="utf-8"))
        verificar_clave(info, args.proyecto)
    else:
        info = None
        print("1/4 Sin --clave: se conserva el secreto ya guardado en el Space.")

    print(f"2/4 Creando o actualizando el Space {repo_id}…")
    api.create_repo(repo_id, repo_type="space", space_sdk="docker", exist_ok=True, private=False)
    if info:
        api.add_space_secret(repo_id, "GEE_SERVICE_ACCOUNT_JSON", json.dumps(info))
    variables = {
        "GEE_PROJECT_ID": args.proyecto,
        "WEB_ANALYSIS_RATE_LIMIT": str(args.analisis_por_ip),
        "WEB_DOWNLOAD_RATE_LIMIT": "30",
        "WEB_RATE_LIMIT_WINDOW_SECONDS": "600",
        "WEB_MAX_CONCURRENT_ANALYSES": "1",
        "WEB_TRUST_PROXY_HEADERS": "1",
    }
    for clave, valor in variables.items():
        api.add_space_variable(repo_id, clave, valor)

    print("3/4 Subiendo el código (sin pruebas, historial ni credenciales)…")
    with tempfile.TemporaryDirectory() as tmp:
        preparar_carpeta(Path(tmp))
        api.upload_folder(repo_id=repo_id, repo_type="space", folder_path=tmp,
                          commit_message="Publicar Geoportal CHCP", delete_patterns=["*"])

    url = f"https://{args.usuario.lower()}-{args.space.lower()}.hf.space"
    print("4/4 Listo. Hugging Face construye la imagen (5–10 minutos la primera vez).")
    print(f"  Estado de la construcción: https://huggingface.co/spaces/{repo_id}")
    print(f"  Dirección pública:          {url}/platform")
    print(f"                              {url}/panel")
    print(f"                              {url}/coberturas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
