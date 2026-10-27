# Paso 9: minijuego. Caen bolas de luz y tienes que explotarlas con las puntas de los dedos.
# - Bola de color = +1 punto      - Bola dorada (mas rapida) = +3 puntos
# - Bola roja (bomba) = -5 puntos, no la toques
# Tienes 60 segundos. Teclas: "espacio" empezar/reiniciar, "q" salir.
import math
import random
import time

import cv2
import numpy as np

import paso2_manos as manos
import paso6_particulas as particulas_fx
import plataforma

DURACION = 60            # segundos por partida
ARCHIVO_RECORD = "record.txt"
PUNTAS = [4, 8, 12, 16, 20]

# tipo: (puntos, color BGR, probabilidad)
TIPOS = {
    "normal": (1, None, 0.75),           # color aleatorio
    "dorada": (3, (0, 215, 255), 0.12),
    "bomba": (-5, (0, 0, 255), 0.13),
}
COLORES_NORMALES = [(255, 255, 0), (255, 0, 255), (0, 255, 0), (255, 120, 50)]


class Bola:
    def __init__(self, ancho, dificultad):
        r = random.random()
        acumulado = 0
        for tipo, (_, _, prob) in TIPOS.items():
            acumulado += prob
            if r <= acumulado:
                break
        self.tipo = tipo
        self.puntos, color, _ = TIPOS[tipo]
        self.color = color or random.choice(COLORES_NORMALES)
        self.radio = random.randint(22, 38) if tipo != "dorada" else 20
        self.x = random.uniform(self.radio, ancho - self.radio)
        self.y = -self.radio
        # Caen mas rapido conforme avanza la partida (dificultad de 0 a 1)
        velocidad = random.uniform(3, 5) + dificultad * 5
        self.vy = velocidad * (1.5 if tipo == "dorada" else 1)
        self.vx = random.uniform(-1, 1)

    def mover(self, ancho):
        self.x += self.vx
        self.y += self.vy
        if self.x < self.radio or self.x > ancho - self.radio:  # rebota en los lados
            self.vx = -self.vx

    def dibujar(self, lienzo):
        centro = (int(self.x), int(self.y))
        cv2.circle(lienzo, centro, self.radio, self.color, -1)
        cv2.circle(lienzo, centro, self.radio // 2, (255, 255, 255), -1)  # nucleo brillante
        if self.tipo == "bomba":
            cv2.putText(lienzo, "X", (centro[0] - 9, centro[1] + 9), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 3)


def leer_record():
    try:
        with open(ARCHIVO_RECORD) as f:
            return int(f.read().strip() or 0)
    except (OSError, ValueError):
        return 0


def guardar_record(puntos):
    with open(ARCHIVO_RECORD, "w") as f:
        f.write(str(puntos))


class Juego:
    def __init__(self, ancho, alto):
        self.ancho, self.alto = ancho, alto
        self.estado = "inicio"     # inicio -> jugando -> fin
        self.record = leer_record()
        self.particulas = []
        self.reiniciar_partida()

    def reiniciar_partida(self):
        self.bolas = []
        self.puntos = 0
        self.inicio = None
        self.proxima_bola = 0
        self.temblor = 0            # frames de temblor de pantalla tras tocar una bomba
        self.nuevo_record = False

    def empezar(self, ahora):
        self.reiniciar_partida()
        self.estado = "jugando"
        self.inicio = ahora

    def tiempo_restante(self, ahora):
        if self.inicio is None:
            return DURACION
        return max(0.0, DURACION - (ahora - self.inicio))

    def actualizar(self, puntas, ahora):
        # puntas = lista de (x, y) en pixeles de todas las puntas de dedos visibles
        if self.estado == "jugando":
            dificultad = 1 - self.tiempo_restante(ahora) / DURACION

            # Crear bolas nuevas cada vez mas seguido
            if ahora >= self.proxima_bola:
                self.bolas.append(Bola(self.ancho, dificultad))
                self.proxima_bola = ahora + max(0.25, 0.9 - dificultad * 0.6)

            for bola in self.bolas:
                bola.mover(self.ancho)

            # Colisiones: la distancia de una punta al centro es menor que el radio (+ margen)
            vivas = []
            for bola in self.bolas:
                tocada = any(math.hypot(x - bola.x, y - bola.y) < bola.radio + 12 for x, y in puntas)
                if tocada:
                    self.puntos += bola.puntos
                    color = (0, 0, 255) if bola.tipo == "bomba" else bola.color
                    particulas_fx.emitir(self.particulas, bola.x, bola.y, 0, 0, color, 40, 10.0)
                    if bola.tipo == "bomba":
                        self.temblor = 10
                elif bola.y - bola.radio < self.alto:   # sigue en pantalla
                    vivas.append(bola)
            self.bolas = vivas

            if self.tiempo_restante(ahora) <= 0:
                self.estado = "fin"
                if self.puntos > self.record:
                    self.record = self.puntos
                    self.nuevo_record = True
                    guardar_record(self.puntos)

        if self.temblor > 0:
            self.temblor -= 1

    def dibujar(self, frame, ahora):
        lienzo = np.zeros_like(frame)
        for bola in self.bolas:
            bola.dibujar(lienzo)
        particulas_fx.actualizar_y_dibujar(self.particulas, lienzo)
        salida = cv2.add(cv2.add(frame // 2, lienzo), cv2.GaussianBlur(lienzo, (0, 0), 8))

        if self.temblor > 0:  # temblor de pantalla: desplazamos la imagen unos pixeles al azar
            dx, dy = random.randint(-12, 12), random.randint(-12, 12)
            salida = cv2.warpAffine(salida, np.float32([[1, 0, dx], [0, 1, dy]]), (self.ancho, self.alto))

        def texto(t, y, escala=1.0, color=(255, 255, 255), centrado=True):
            (w, _), _ = cv2.getTextSize(t, cv2.FONT_HERSHEY_SIMPLEX, escala, 2)
            x = (self.ancho - w) // 2 if centrado else 10
            cv2.putText(salida, t, (x, y), cv2.FONT_HERSHEY_SIMPLEX, escala, (0, 0, 0), 6)
            cv2.putText(salida, t, (x, y), cv2.FONT_HERSHEY_SIMPLEX, escala, color, 2)

        if self.estado == "inicio":
            texto("EXPLOTA LAS BOLAS DE LUZ", self.alto // 2 - 60, 1.1, (255, 255, 0))
            texto("Color +1   Dorada +3   Roja -5", self.alto // 2, 0.8)
            texto("Pulsa ESPACIO para empezar", self.alto // 2 + 60, 0.8, (0, 255, 0))
            texto(f"Record: {self.record}", self.alto // 2 + 110, 0.7)
        elif self.estado == "jugando":
            texto(f"Puntos: {self.puntos}", 35, 0.9, centrado=False)
            texto(f"Tiempo: {self.tiempo_restante(ahora):.0f}", 35, 0.9, (0, 255, 255))
        else:
            texto("FIN DEL JUEGO", self.alto // 2 - 60, 1.4, (0, 0, 255))
            texto(f"Puntos: {self.puntos}", self.alto // 2, 1.0)
            texto("NUEVO RECORD!" if self.nuevo_record else f"Record: {self.record}",
                  self.alto // 2 + 50, 0.9, (0, 215, 255))
            texto("ESPACIO = otra partida   Q = salir", self.alto // 2 + 100, 0.7, (0, 255, 0))
        return salida


def puntas_en_pixeles(resultado, ancho, alto):
    return [(puntos[i].x * ancho, puntos[i].y * alto)
            for puntos in resultado.hand_landmarks for i in PUNTAS]


def main():
    manos.descargar_modelo()
    detector = manos.crear_detector()

    cap = plataforma.abrir_camara(0)
    if not cap.isOpened():
        print("ERROR: no se pudo abrir la camara. Prueba a cambiar el 0 por 1.")
        raise SystemExit(1)

    juego = None
    inicio = time.monotonic()
    print("Pulsa ESPACIO para empezar y Q para salir.")

    while True:
        ok, frame = cap.read()
        if not ok:
            print("ERROR: la camara no devolvio imagen.")
            break
        frame = cv2.flip(frame, 1)
        alto, ancho = frame.shape[:2]
        if juego is None:
            juego = Juego(ancho, alto)

        ahora = time.monotonic()
        resultado = manos.detectar(detector, frame, int((ahora - inicio) * 1000))
        puntas = puntas_en_pixeles(resultado, ancho, alto)
        juego.actualizar(puntas, ahora)

        salida = juego.dibujar(frame, ahora)
        for x, y in puntas:  # marcamos las puntas para que sepas con que golpeas
            cv2.circle(salida, (int(x), int(y)), 8, (255, 255, 255), 2)

        cv2.imshow("Paso 9 - Minijuego", salida)
        tecla = cv2.waitKey(1) & 0xFF
        if tecla == ord("q"):
            break
        if tecla == ord(" ") and juego.estado != "jugando":
            juego.empezar(ahora)

    cap.release()
    cv2.destroyAllWindows()
    detector.close()


if __name__ == "__main__":
    main()
