# Utilidades compartidas por las pruebas.
#
# La mayoria de pruebas NO usan la camara ni los modelos: construimos "manos falsas"
# (21 puntos con coordenadas inventadas) y comprobamos que la logica responde bien.
# Asi las pruebas son rapidas y funcionan en cualquier ordenador, incluido GitHub Actions.
import os
import sys
import types
from types import SimpleNamespace

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

# pyautogui necesita una pantalla al importarse (en Linux sin escritorio falla).
# Las pruebas del raton no mueven el cursor de verdad, asi que basta con uno falso.
try:
    import pyautogui  # noqa: F401
except BaseException:  # en Linux sin tkinter, mouseinfo hace sys.exit()
    sys.modules["pyautogui"] = types.SimpleNamespace(FAILSAFE=True, PAUSE=0)


def punto(x, y, z=0.0):
    return SimpleNamespace(x=x, y=y, z=z)


# Base de cada dedo (indice, corazon, anular, menique) en el eje X
BASES_X = [0.42, 0.50, 0.58, 0.66]


def crear_mano(levantados=(True, True, True, True, True), dx=0.0, dy=0.0):
    """Devuelve 21 puntos de una mano con los dedos indicados levantados.

    levantados = (pulgar, indice, corazon, anular, menique). dx/dy desplazan toda la mano.
    """
    pts = [None] * 21
    pts[0] = punto(0.50, 0.90)   # muneca
    pts[1] = punto(0.42, 0.80)
    pts[2] = punto(0.38, 0.72)
    pts[3] = punto(0.35, 0.66)
    # Pulgar abierto: la punta se aleja de la palma. Doblado: cruza hacia el centro.
    pts[4] = punto(0.28, 0.60) if levantados[0] else punto(0.45, 0.62)
    for n, bx in enumerate(BASES_X):
        base = 5 + n * 4
        pts[base] = punto(bx, 0.60)
        pts[base + 1] = punto(bx, 0.50)
        if levantados[n + 1]:
            # Recto hacia arriba
            pts[base + 2] = punto(bx, 0.42)
            pts[base + 3] = punto(bx, 0.35)
        else:
            # Doblado hacia la palma: la punta vuelve hacia abajo
            pts[base + 2] = punto(bx, 0.52, 0.05)
            pts[base + 3] = punto(bx, 0.60, 0.05)
    return [punto(p.x + dx, p.y + dy, p.z) for p in pts]


def crear_resultado(manos, lados=None, gestos=None):
    """Imita lo que devuelve MediaPipe para una lista de manos (listas de 21 puntos)."""
    lados = lados or ["Derecha", "Izquierda"][: len(manos)]
    gestos = gestos or [None] * len(manos)
    return SimpleNamespace(
        hand_landmarks=manos,
        hand_world_landmarks=manos,  # para los angulos solo importa la forma, no la escala
        handedness=[[SimpleNamespace(category_name=lado)] for lado in lados],
        gestures=[[SimpleNamespace(category_name=g, score=0.9)] if g else [] for g in gestos],
    )


@pytest.fixture
def en_carpeta_temporal(tmp_path, monkeypatch):
    """Ejecuta la prueba dentro de una carpeta vacia (para archivos como record.txt)."""
    monkeypatch.chdir(tmp_path)
    return tmp_path
