sudo apt update
sudo apt install python3-gpiozero

sudo cp screen-sensor.service /etc/systemd/system/


actiivate:

sudo systemctl daemon-reload
sudo systemctl enable --now screen-sensor.service

Status

systemctl status screen-sensor.service

Changes
journalctl -u screen-sensor.service -f


Stop
sudo systemctl stop screen-sensor.service



INFO PINS:
Elemento	
GPIO BCM	Pin físico
PIR OUT	GPIO17	11
Relé IN	GPIO27	13
GND	GND	6