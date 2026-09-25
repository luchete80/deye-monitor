#!/bin/bash

cd "$(dirname "$0")"

echo "Iniciando Mosquitto..."
sudo systemctl start mosquitto

echo "Iniciando deye-mqtt..."
sudo docker start deye-mqtt

echo "Iniciando deye-monitor..."
python3 -m deye_monitor &

echo "Esperando al dashboard..."
sleep 5

echo "Abriendo Chromium en modo kiosco..."
chromium \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    http://localhost:5000
