

mkdir -p ~/.config/autostart
nano ~/.config/autostart/deye-monitor.desktop

With

[Desktop Entry]
Type=Application
Name=Deye Monitor
Exec=/home/pi/deshe-monitor/inicia.sh
Terminal=false
X-GNOME-Autostart-enabled=true

chmod +x ~/deshe-monitor/inicia.sh