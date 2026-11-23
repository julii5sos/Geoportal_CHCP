#!/bin/sh
# Abre el Geoportal CHCP con un servidor local (necesita python3).
cd "$(dirname "$0")/sitio" || exit 1
PUERTO=8765
URL="http://localhost:$PUERTO/index.html"
echo "Geoportal CHCP en $URL — deje esta ventana abierta; ciérrela para terminar."
( sleep 1; (command -v open >/dev/null && open "$URL") || xdg-open "$URL" ) &
python3 -m http.server "$PUERTO" --bind 127.0.0.1
