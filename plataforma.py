# Detalles que cambian entre Windows, Linux y macOS, en un solo sitio.
import os
import subprocess
import sys

import cv2

ES_WINDOWS = sys.platform.startswith("win")
ES_LINUX = sys.platform.startswith("linux")


def abrir_camara(indice=0):
    # Cada sistema tiene su "backend" (la forma de hablar con la webcam):
    # - Windows: DirectShow, que abre la camara mas rapido que el de por defecto.
    # - Linux: V4L2 (Video4Linux), la interfaz de camaras del kernel (/dev/video0, /dev/video1...).
    # - macOS: el de por defecto (AVFoundation).
    if ES_WINDOWS:
        return cv2.VideoCapture(indice, cv2.CAP_DSHOW)
    if ES_LINUX:
        return cv2.VideoCapture(indice, cv2.CAP_V4L2)
    return cv2.VideoCapture(indice)


def aviso_raton():
    # En Linux, pyautogui solo puede mover el raton en sesiones X11. En Wayland (por defecto en
    # Ubuntu 22.04+ y Fedora) no tiene permiso. Devuelve un texto de aviso o None si todo bien.
    if ES_LINUX and os.environ.get("XDG_SESSION_TYPE", "").lower() == "wayland":
        return ("Estas en una sesion Wayland: el raton virtual no podra mover el cursor.\n"
                "Cierra sesion y en la pantalla de inicio elige 'Ubuntu en Xorg' (o similar).")
    if ES_LINUX and not os.environ.get("DISPLAY"):
        return "No hay pantalla grafica (DISPLAY vacio): el raton virtual necesita un escritorio X11."
    return None


# En Linux (X11) pyautogui no sabe pulsar las teclas multimedia, asi que usamos xdotool
# con sus nombres de X11. En Windows y macOS pyautogui las pulsa directamente.
TECLAS_X11 = {
    "volumeup": "XF86AudioRaiseVolume",
    "volumedown": "XF86AudioLowerVolume",
    "volumemute": "XF86AudioMute",
    "playpause": "XF86AudioPlay",
    "nexttrack": "XF86AudioNext",
    "prevtrack": "XF86AudioPrev",
}


def pulsar_tecla(nombre):
    if ES_LINUX and nombre in TECLAS_X11:
        try:
            subprocess.run(["xdotool", "key", TECLAS_X11[nombre]], check=False)
        except FileNotFoundError:
            print("Falta xdotool para las teclas multimedia: sudo apt-get install xdotool")
        return
    import pyautogui  # aqui dentro: solo hace falta (y solo necesita pantalla) si se usa
    pyautogui.press(nombre)
