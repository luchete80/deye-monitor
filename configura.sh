#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/../deye-inverter-mqtt/config.env"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "ERROR: No se encontró:"
    echo "$CONFIG_FILE"
    exit 1
fi

echo "Usando configuración:"
echo "$CONFIG_FILE"

echo "Deteniendo y eliminando deye-mqtt anterior..."
sudo docker rm -f deye-mqtt 2>/dev/null || true

echo "Creando deye-mqtt..."
sudo docker run -d \
    --name deye-mqtt \
    --restart unless-stopped \
    --network host \
    --env-file "$CONFIG_FILE" \
    ghcr.io/kbialek/deye-inverter-mqtt:latest

echo "deye-mqtt iniciado."
sudo docker ps --filter name=deye-mqtt
