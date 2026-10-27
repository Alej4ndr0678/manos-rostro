# Paso 6: efecto de particulas que salen de las puntas de los dedos.
# - Mueve la mano: las particulas salen de las 5 puntas y heredan tu movimiento.
# - Junta pulgar e indice (pellizco): explosion de particulas.
# Teclas: "q" salir, "f" mostrar/ocultar la camara (fondo negro), "e" mostrar/ocultar el esqueleto.
import math
import random
import time

import cv2
import numpy as np

import paso2_manos as manos

PUNTAS = [4, 8, 12, 16, 20]   # pulgar, indice, corazon, anular, menique
MAX_PARTICULAS = 1500         # limite para que no bajen los FPS
GRAVEDAD = 0.15               # pixeles/frame^2 hacia abajo (positivo = cae)
PELLIZCO = 0.25               # distancia pulgar-indice (relativa al tamano de la mano) para "pellizco"

# Un color base por mano (en BGR, el formato de OpenCV)
COLORES = {"Left": (255, 180, 50), "Right": (50, 120, 255)}  # azul cian / naranja


class Particula:
    def __init__(self, x, y, vx, vy, color, vida):
        self.x, self.y = x, y
        self.vx, self.vy = vx, vy
        self.color = color
        self.vida = self.vida_max = vida   # cuantos frames le quedan

    def actualizar(self):
        self.vy += GRAVEDAD
        self.vx *= 0.97          # rozamiento del aire
        self.vy *= 0.97
        self.x += self.vx
        self.y += self.vy
        self.vida -= 1

    def dibujar(self, lienzo):
        t = self.vida / self.vida_max            # 1 = recien nacida, 0 = a punto de morir
        radio = max(1, int(5 * t))
        color = tuple(int(c * t) for c in self.color)  # se va apagando
        cv2.circle(lienzo, (int(self.x), int(self.y)), radio, color, -1)


def variar(color):
    # Pequena variacion aleatoria del color para que no se vean todas iguales
    return tuple(min(255, max(0, c + random.randint(-40, 40))) for c in color)


def emitir(particulas, x, y, vx, vy, color, cantidad, dispersion):
    for _ in range(cantidad):
        if len(particulas) >= MAX_PARTICULAS:
            return
        angulo = random.uniform(0, 2 * math.pi)
        fuerza = random.uniform(0, dispersion)
        particulas.append(Particula(
            x, y,
            vx * 0.5 + math.cos(angulo) * fuerza,   # heredan la mitad del movimiento del dedo
            vy * 0.5 + math.sin(angulo) * fuerza,
            variar(color), random.randint(20, 45)))


def procesar_manos(resultado, ancho, alto, anteriores, particulas):
    # Crea particulas segun la posicion y el movimiento de cada dedo.
    # "anteriores" guarda donde estaba cada punta en el frame anterior para calcular la velocidad.
    actuales = {}
    for i, puntos in enumerate(resultado.hand_landmarks):
        lado = resultado.handedness[i][0].category_name
        color = COLORES.get(lado, (255, 255, 255))

        for punta in PUNTAS:
            x, y = puntos[punta].x * ancho, puntos[punta].y * alto
            px, py = anteriores.get((lado, punta), (x, y))
            vx, vy = x - px, y - py
            actuales[(lado, punta)] = (x, y)
            # Cuanto mas rapido mueves el dedo, mas particulas salen
            velocidad = math.hypot(vx, vy)
            emitir(particulas, x, y, vx, vy, color, 1 + int(velocidad / 4), 2.0)

        # Pellizco: distancia pulgar-indice comparada con el tamano de la mano (muneca -> base del corazon)
        tamano = math.dist((puntos[0].x, puntos[0].y), (puntos[9].x, puntos[9].y))
        pinza = math.dist((puntos[4].x, puntos[4].y), (puntos[8].x, puntos[8].y))
        if tamano > 0 and pinza / tamano < PELLIZCO:
            cx = (puntos[4].x + puntos[8].x) / 2 * ancho
            cy = (puntos[4].y + puntos[8].y) / 2 * alto
            emitir(particulas, cx, cy, 0, 0, (255, 255, 255), 25, 9.0)
    return actuales


def brillo(lienzo, sigma):
    # Desenfoque para el efecto de luz. Lo hacemos a media resolucion y luego lo ampliamos:
    # el resultado es casi igual (un brillo ya es borroso) pero unas 3 veces mas rapido.
    alto, ancho = lienzo.shape[:2]
    pequeno = cv2.resize(lienzo, (ancho // 2, alto // 2), interpolation=cv2.INTER_AREA)
    pequeno = cv2.GaussianBlur(pequeno, (0, 0), sigma / 2)
    return cv2.resize(pequeno, (ancho, alto), interpolation=cv2.INTER_LINEAR)


def actualizar_y_dibujar(particulas, lienzo):
    for p in particulas:
        p.actualizar()
        p.dibujar(lienzo)
    alto, ancho = lienzo.shape[:2]
    # Nos quedamos solo con las vivas y que siguen dentro de la pantalla
    particulas[:] = [p for p in particulas if p.vida > 0 and -50 < p.x < ancho + 50 and p.y < alto + 50]


def main():
    manos.descargar_modelo()
    detector = manos.crear_detector()

    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    if not cap.isOpened():
        print("ERROR: no se pudo abrir la camara. Prueba a cambiar el 0 por 1.")
        raise SystemExit(1)

    particulas = []
    anteriores = {}
    ver_camara, ver_esqueleto = True, False
    inicio = time.monotonic()
    anterior = inicio
    print("Pulsa 'q' para salir, 'f' para fondo negro y 'e' para ver el esqueleto.")

    while True:
        ok, frame = cap.read()
        if not ok:
            print("ERROR: la camara no devolvio imagen.")
            break
        frame = cv2.flip(frame, 1)
        alto, ancho = frame.shape[:2]

        ahora = time.monotonic()
        resultado = manos.detectar(detector, frame, int((ahora - inicio) * 1000))
        anteriores = procesar_manos(resultado, ancho, alto, anteriores, particulas)

        # Dibujamos las particulas en un lienzo negro aparte y lo "sumamos" a la imagen:
        # asi los colores se iluminan unos a otros como si fuera luz (efecto brillo).
        lienzo = np.zeros_like(frame)
        actualizar_y_dibujar(particulas, lienzo)
        brillo_lienzo = brillo(lienzo, 6)
        fondo = (frame // 2) if ver_camara else np.zeros_like(frame)  # camara oscurecida para que resalte
        salida = cv2.add(cv2.add(fondo, lienzo), brillo_lienzo)

        if ver_esqueleto:
            manos.dibujar_manos(salida, resultado)

        fps = 1 / max(ahora - anterior, 1e-6)
        anterior = ahora
        cv2.putText(salida, f"Particulas: {len(particulas)}  FPS: {fps:.0f}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

        cv2.imshow("Paso 6 - Particulas", salida)
        tecla = cv2.waitKey(1) & 0xFF
        if tecla == ord("q"):
            break
        if tecla == ord("f"):
            ver_camara = not ver_camara
        if tecla == ord("e"):
            ver_esqueleto = not ver_esqueleto

    cap.release()
    cv2.destroyAllWindows()
    detector.close()


if __name__ == "__main__":
    main()
