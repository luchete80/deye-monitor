#!/bin/bash

echo "=== Estado del contenedor deye-mqtt ==="
sudo docker ps --filter name=deye-mqtt

echo
echo "=== Configuracion MQTT del contenedor ==="
sudo docker inspect deye-mqtt | grep -i MQTT

echo
echo "=== Escuchando topics deye/# ==="
echo "Ctrl+C para salir"
echo

mosquitto_sub -h localhost -p 1883 -t 'deye/#' -v
