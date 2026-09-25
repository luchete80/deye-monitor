#!/bin/bash
set -e

echo "Deteniendo y eliminando deye-mqtt anterior..."
sudo docker rm -f deye-mqtt 2>/dev/null || true

echo "Creando deye-mqtt..."
sudo docker run -d \
    --name deye-mqtt \
    --restart unless-stopped \
    --network host \
    --env-file "$(dirname "$0")/config.env" \
    ghcr.io/kbialek/deye-inverter-mqtt:latest

echo "deye-mqtt iniciado."
sudo docker ps --filter name=deye-mqtt
