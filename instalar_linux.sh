#!/usr/bin/env bash
# Instalacion en Linux (Ubuntu/Debian). Uso:  bash instalar_linux.sh
set -e

echo "1) Paquetes del sistema"
# python3-venv: entornos virtuales | python3-tk: lo necesita pyautogui (raton virtual)
# libegl1 y libgles2: graficos que usa MediaPipe | v4l-utils: para listar las webcams
# xdotool: teclas multimedia (volumen, musica) del control por gestos
sudo apt-get update
sudo apt-get install -y python3-venv python3-tk python3-dev libegl1 libgles2 v4l-utils xdotool

echo "2) Permiso para usar la webcam (grupo 'video')"
if ! id -nG "$USER" | grep -qw video; then
    sudo usermod -aG video "$USER"
    echo "   Te he anadido al grupo 'video'. Cierra sesion y vuelve a entrar para que se aplique."
fi

echo "3) Entorno virtual y librerias de Python"
python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt

echo "4) Camaras detectadas"
v4l2-ctl --list-devices || echo "   No se ha encontrado ninguna webcam."

echo
echo "Listo. Para empezar:"
echo "   source venv/bin/activate"
echo "   python sistema.py"
