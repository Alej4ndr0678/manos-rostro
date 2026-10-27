# Paso 10: raton virtual. Controla el cursor de Windows con la mano.
# - Mover: mueve la mano con el indice levantado. El cursor sigue el nudillo del indice
#   (punto 5), que casi no se mueve al pellizcar, asi el cursor no salta al hacer clic.
# - Clic izquierdo: pellizco rapido pulgar + indice.
# - Arrastrar: manten el pellizco pulgar + indice mas de medio segundo; suelta para soltar.
# - Clic derecho: pellizco pulgar + corazon.
# Teclas (con la ventana de la camara seleccionada): "p" pausar/reanudar el control, "q" salir.
# Seguridad: si lleva el raton a una esquina de la pantalla, pyautogui se detiene (FAILSAFE).
import math
import time

import cv2
import pyautogui

import paso2_manos as manos

pyautogui.FAILSAFE = True   # raton en una esquina = parar el programa
pyautogui.PAUSE = 0         # sin pausas entre acciones (si no, va a tirones)

MARGEN = 0.2                # zona activa: el 60 % central de la imagen equivale a toda la pantalla
SUAVIZADO = 0.7             # 0 = sin suavizar; cerca de 1 = muy suave pero con retraso
UMBRAL_PELLIZCO = 0.30      # distancia entre puntas / tamano de la mano para contar como pellizco
UMBRAL_SOLTAR = 0.40        # mas alto que el de pellizco: evita que parpadee cerca del limite
TIEMPO_ARRASTRE = 0.5       # segundos de pellizco para empezar a arrastrar


def distancia(a, b):
    return math.hypot(a.x - b.x, a.y - b.y)


class Raton:
    # Las acciones reales las hace pyautogui, pero se pueden cambiar por otras (util para pruebas).
    mover = staticmethod(lambda x, y: pyautogui.moveTo(x, y))
    clic = staticmethod(lambda boton: pyautogui.click(button=boton))
    pulsar = staticmethod(lambda: pyautogui.mouseDown())
    soltar = staticmethod(lambda: pyautogui.mouseUp())


class ControlRaton:
    def __init__(self, ancho_pantalla, alto_pantalla, raton=Raton):
        self.ancho, self.alto = ancho_pantalla, alto_pantalla
        self.raton = raton
        self.cursor = None              # posicion suavizada del cursor
        self.pellizco_desde = None      # cuando empezo el pellizco pulgar + indice
        self.arrastrando = False
        self.pellizco_derecho = False
        self.estado = "sin mano"

    def a_pantalla(self, punto):
        # Pasa de coordenadas de la camara (0 a 1) a pixeles de la pantalla, usando solo la zona
        # central de la imagen para no tener que estirar el brazo hasta los bordes.
        nx = min(max((punto.x - MARGEN) / (1 - 2 * MARGEN), 0.0), 1.0)
        ny = min(max((punto.y - MARGEN) / (1 - 2 * MARGEN), 0.0), 1.0)
        # Dejamos 2 pixeles de borde: si el cursor tocara la esquina exacta, saltaria el FAILSAFE.
        return 2 + nx * (self.ancho - 5), 2 + ny * (self.alto - 5)

    def actualizar(self, puntos, ahora):
        # puntos = los 21 puntos de una mano, o None si no se ve ninguna
        if puntos is None:
            self.soltar_todo()
            self.estado = "sin mano"
            return

        tamano = distancia(puntos[0], puntos[9]) or 1e-6
        pinza_izq = distancia(puntos[4], puntos[8]) / tamano
        pinza_der = distancia(puntos[4], puntos[12]) / tamano

        # 1) Mover el cursor (suavizado para que no tiemble)
        x, y = self.a_pantalla(puntos[5])
        if self.cursor is None:
            self.cursor = (x, y)
        else:
            cx, cy = self.cursor
            self.cursor = (cx * SUAVIZADO + x * (1 - SUAVIZADO), cy * SUAVIZADO + y * (1 - SUAVIZADO))
        self.raton.mover(int(self.cursor[0]), int(self.cursor[1]))
        self.estado = "moviendo"

        # 2) Pellizco pulgar + indice: clic si es corto, arrastre si es largo.
        #    Usamos dos umbrales (histeresis): hay que juntar mucho para empezar y separar
        #    bastante para terminar, asi no hace clics dobles por estar justo en el limite.
        if self.pellizco_desde is None and pinza_izq < UMBRAL_PELLIZCO:
            self.pellizco_desde = ahora
        elif self.pellizco_desde is not None and pinza_izq > UMBRAL_SOLTAR:
            if self.arrastrando:
                self.raton.soltar()
                self.arrastrando = False
            else:
                self.raton.clic("left")
                self.estado = "clic"
            self.pellizco_desde = None

        if self.pellizco_desde is not None:
            if not self.arrastrando and ahora - self.pellizco_desde >= TIEMPO_ARRASTRE:
                self.raton.pulsar()
                self.arrastrando = True
            self.estado = "arrastrando" if self.arrastrando else "pellizco"

        # 3) Pellizco pulgar + corazon: clic derecho (una sola vez por pellizco)
        if not self.pellizco_derecho and pinza_der < UMBRAL_PELLIZCO and self.pellizco_desde is None:
            self.raton.clic("right")
            self.pellizco_derecho = True
            self.estado = "clic derecho"
        elif pinza_der > UMBRAL_SOLTAR:
            self.pellizco_derecho = False

    def soltar_todo(self):
        # Si perdemos la mano o pausamos a mitad de un arrastre, soltamos el boton
        if self.arrastrando:
            self.raton.soltar()
        self.arrastrando = False
        self.pellizco_desde = None
        self.pellizco_derecho = False


def main():
    manos.descargar_modelo()
    detector = manos.crear_detector()

    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    if not cap.isOpened():
        print("ERROR: no se pudo abrir la camara. Prueba a cambiar el 0 por 1.")
        raise SystemExit(1)

    ancho_pantalla, alto_pantalla = pyautogui.size()
    control = ControlRaton(ancho_pantalla, alto_pantalla)
    activo = True
    inicio = time.monotonic()
    print(f"Pantalla de {ancho_pantalla}x{alto_pantalla}. Teclas: p pausar | q salir")
    print("Para parar de emergencia, lleva el raton a una esquina de la pantalla.")

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                print("ERROR: la camara no devolvio imagen.")
                break
            frame = cv2.flip(frame, 1)
            alto, ancho = frame.shape[:2]

            ahora = time.monotonic()
            resultado = manos.detectar(detector, frame, int((ahora - inicio) * 1000))
            puntos = resultado.hand_landmarks[0] if resultado.hand_landmarks else None

            if activo:
                control.actualizar(puntos, ahora)

            # Vista previa: zona activa, mano y estado
            m = MARGEN
            cv2.rectangle(frame, (int(ancho * m), int(alto * m)), (int(ancho * (1 - m)), int(alto * (1 - m))),
                          (255, 255, 0) if activo else (128, 128, 128), 2)
            manos.dibujar_manos(frame, resultado)
            texto = control.estado if activo else "PAUSADO (p para reanudar)"
            cv2.putText(frame, texto, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0) if activo else (0, 0, 255), 2)

            cv2.imshow("Paso 10 - Raton virtual", frame)
            tecla = cv2.waitKey(1) & 0xFF
            if tecla == ord("q"):
                break
            if tecla == ord("p"):
                activo = not activo
                control.soltar_todo()
    except pyautogui.FailSafeException:
        print("Parada de emergencia: raton en una esquina.")
    finally:
        control.soltar_todo()
        cap.release()
        cv2.destroyAllWindows()
        detector.close()


if __name__ == "__main__":
    main()
