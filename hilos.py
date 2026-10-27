# Herramientas para ganar FPS usando hilos (threads).
#
# Sin hilos, cada vuelta del bucle hace todo en fila:
#   esperar a la camara -> detectar manos y cara -> dibujar -> mostrar
# y el video va tan lento como la suma de todo.
#
# Con hilos, cada parte trabaja a su ritmo y en paralelo:
# - CamaraEnHilo lee la webcam sin parar y guarda siempre el ultimo frame.
# - DetectorEnHilo detecta manos y cara sobre el ultimo frame disponible.
# - El bucle principal solo dibuja y muestra, asi que el video va fluido
#   aunque la deteccion vaya mas lenta (las manos se actualizan un poco despues).
import threading
import time

import cv2


class CamaraEnHilo:
    def __init__(self, indice=0):
        self.cap = cv2.VideoCapture(indice, cv2.CAP_DSHOW)
        self.frame = None
        self.numero = 0               # cuenta de frames leidos, para saber si hay uno nuevo
        self.corriendo = self.cap.isOpened()
        self.candado = threading.Lock()
        self.hilo = threading.Thread(target=self._leer, daemon=True)
        if self.corriendo:
            self.hilo.start()

    def isOpened(self):
        return self.corriendo

    def _leer(self):
        while self.corriendo:
            ok, frame = self.cap.read()   # aqui se espera a la camara, pero en este hilo
            if not ok:
                self.corriendo = False
                break
            with self.candado:
                self.frame = frame
                self.numero += 1

    def leer(self, numero_anterior=0, espera_max=1.0):
        # Devuelve (numero, frame) con un frame MAS NUEVO que numero_anterior.
        # Si aun no hay ninguno, espera un poco (sin gastar CPU) en vez de repetir el mismo.
        limite = time.monotonic() + espera_max
        while time.monotonic() < limite and self.corriendo:
            with self.candado:
                if self.frame is not None and self.numero != numero_anterior:
                    return self.numero, self.frame.copy()
            time.sleep(0.002)
        return numero_anterior, None

    def soltar(self):
        self.corriendo = False
        if self.hilo.is_alive():
            self.hilo.join(timeout=1)
        self.cap.release()


class DetectorEnHilo:
    # Ejecuta funcion(frame, timestamp_ms) en otro hilo sobre el frame mas reciente
    # y guarda el ultimo resultado.
    def __init__(self, funcion):
        self.funcion = funcion
        self.entrada = None
        self.resultado = None
        self.numero = 0               # cuantos resultados se han producido
        self.fps = 0.0
        self.corriendo = True
        self.candado = threading.Lock()
        self.hay_trabajo = threading.Event()
        self.inicio = time.monotonic()
        self.hilo = threading.Thread(target=self._trabajar, daemon=True)
        self.hilo.start()

    def enviar(self, frame):
        # Si el detector esta ocupado, el frame anterior pendiente se descarta: solo nos
        # interesa el mas reciente, no hacer cola.
        with self.candado:
            self.entrada = frame
        self.hay_trabajo.set()

    def _trabajar(self):
        anterior = time.monotonic()
        while self.corriendo:
            self.hay_trabajo.wait(timeout=0.1)
            with self.candado:
                frame, self.entrada = self.entrada, None
                self.hay_trabajo.clear()
            if frame is None:
                continue
            ahora = time.monotonic()
            resultado = self.funcion(frame, int((ahora - self.inicio) * 1000))
            with self.candado:
                self.resultado = resultado
                self.numero += 1
            fin = time.monotonic()
            self.fps = 0.9 * self.fps + 0.1 / max(fin - anterior, 1e-6)  # media suavizada
            anterior = fin

    def ultimo(self):
        with self.candado:
            return self.numero, self.resultado

    def parar(self):
        self.corriendo = False
        self.hay_trabajo.set()
        self.hilo.join(timeout=2)
