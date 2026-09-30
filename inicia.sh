#!/bin/bash

cd "$HOME/deye-monitor" || exit 1

echo "Iniciando Mosquitto..."
sudo systemctl start mosquitto

echo "Iniciando deye-mqtt..."
sudo docker start deye-mqtt

echo "Activando entorno virtual..."
source .venv/bin/activate

echo "Iniciando deye-monitor..."
python -m deye_monitor &

echo "Esperando al dashboard..."
sleep 5

echo "Abriendo Chromium..."
chromium \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    http://127.0.0.1:5000