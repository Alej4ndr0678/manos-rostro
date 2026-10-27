# Detalles que cambian entre Windows, Linux y macOS, en un solo sitio.
import os
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
