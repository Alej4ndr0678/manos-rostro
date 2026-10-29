# Paso 17: detectar emociones y gestos de la cara, con filtros encima.
#
# El modelo de malla facial (el del paso 12) devuelve 52 "blendshapes": numeros de 0 a 1
# que dicen cuanto se mueve cada parte de la cara (sonrisa izquierda, cejas abajo, boca
# abierta, ojo cerrado...). Combinandolos sacamos 6 expresiones:
#   Alegria, Sorpresa, Enfado, Tristeza, Beso y Guino
# y ponemos un filtro para cada una (estrellas, corazones, lagrimas...).
#
# Cada cara es distinta: hay quien tiene las cejas bajas o la boca hacia abajo sin estar
# enfadado. Por eso puedes CALIBRAR tu cara neutra con la tecla "n" (mira a la camara sin
# expresion 1 segundo): a partir de ahi se mide lo que cambias respecto a tu cara normal.
#
# Teclas: n calibrar cara neutra, f filtros si/no, a foto automatica al sonreir si/no,
#         s foto ahora, q salir.
import math
import os
import random
import time
import urllib.request

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision

import plataforma

MODELO = "face_landmarker.task"
URL_MODELO = ("https://storage.googleapis.com/mediapipe-models/face_landmarker/"
              "face_landmarker/float16/latest/face_landmarker.task")

EXPRESIONES = ["Alegria", "Sorpresa", "Enfado", "Tristeza", "Beso", "Guino"]
UMBRAL = 0.45              # por debajo de esto, la cara se considera neutra
SUAVIZADO = 0.6            # media movil: 0 = nada, cerca de 1 = muy suave pero lento
FRAMES_CALIBRAR = 30

# Puntos de la malla facial que usamos para los filtros
OJO_IZQ, OJO_DER = 159, 386       # parpado superior de cada ojo (en la imagen)
BAJO_OJO_IZQ, BAJO_OJO_DER = 145, 374
BOCA = 13                          # labio superior (centro)
FRENTE = 10


def media(formas, *nombres):
    return sum(formas.get(n, 0.0) for n in nombres) / len(nombres)


def puntuar(formas):
    # formas = {nombre del blendshape: valor de 0 a 1}. Devuelve {expresion: puntuacion de 0 a 1}.
    sonrisa = media(formas, "mouthSmileLeft", "mouthSmileRight")
    sin_sonrisa = 1 - sonrisa
    cejas_arriba = (formas.get("browInnerUp", 0.0) + media(formas, "browOuterUpLeft", "browOuterUpRight")) / 2
    boca_abierta = formas.get("jawOpen", 0.0)
    ojo_i, ojo_d = formas.get("eyeBlinkLeft", 0.0), formas.get("eyeBlinkRight", 0.0)
    puntos = {
        "Alegria": sonrisa,
        # Al sonreir mucho los ojos se achinan y las cejas bajan: por eso las demas
        # expresiones se multiplican por (1 - sonrisa), para no confundir una risa con enfado.
        "Sorpresa": (0.5 * cejas_arriba + 0.5 * boca_abierta) * sin_sonrisa * 1.4,
        "Enfado": (0.8 * media(formas, "browDownLeft", "browDownRight")
                   + 0.2 * media(formas, "noseSneerLeft", "noseSneerRight")) * sin_sonrisa,
        "Tristeza": (0.7 * media(formas, "mouthFrownLeft", "mouthFrownRight")
                     + 0.3 * formas.get("browInnerUp", 0.0)) * sin_sonrisa * 1.3,
        "Beso": formas.get("mouthPucker", 0.0) * (1 - boca_abierta),
        # Guino = un ojo cerrado y el otro abierto (si se cierran los dos es un parpadeo)
        "Guino": abs(ojo_i - ojo_d) * max(ojo_i, ojo_d),
    }
    return {k: min(max(v, 0.0), 1.0) for k, v in puntos.items()}


class Emociones:
    def __init__(self):
        self.neutra = {}              # blendshapes de tu cara sin expresion (calibracion)
        self.calibrando = []
        self.puntos = {e: 0.0 for e in EXPRESIONES}

    def empezar_calibracion(self):
        self.calibrando = [None]      # [None] = esperando frames

    @property
    def esta_calibrando(self):
        return bool(self.calibrando)

    def actualizar(self, formas):
        # formas = blendshapes del frame (o None si no hay cara). Devuelve la expresion dominante.
        if formas is None:
            self.puntos = {e: v * SUAVIZADO for e, v in self.puntos.items()}
            return self.dominante()
        if self.calibrando:
            self.calibrando = [f for f in self.calibrando if f is not None] + [formas]
            if len(self.calibrando) >= FRAMES_CALIBRAR:
                nombres = self.calibrando[0].keys()
                self.neutra = {n: sum(f[n] for f in self.calibrando) / len(self.calibrando) for n in nombres}
                self.calibrando = []
        # Restamos la cara neutra: solo cuenta lo que cambias respecto a tu cara normal.
        # Se reescala para que el resto del recorrido vuelva a ir de 0 a 1.
        ajustadas = {}
        for n, v in formas.items():
            base = min(self.neutra.get(n, 0.0), 0.9)
            ajustadas[n] = max(0.0, (v - base) / (1 - base))
        nuevas = puntuar(ajustadas)
        self.puntos = {e: SUAVIZADO * self.puntos[e] + (1 - SUAVIZADO) * nuevas[e] for e in EXPRESIONES}
        return self.dominante()

    def dominante(self):
        expresion = max(self.puntos, key=self.puntos.get)
        return expresion if self.puntos[expresion] >= UMBRAL else "Neutral"


class Disparador:
    # Dispara una vez cuando un valor se mantiene por encima del umbral un rato (foto al sonreir)
    def __init__(self, umbral=0.7, segundos=0.6, espera=3.0):
        self.umbral, self.segundos, self.espera = umbral, segundos, espera
        self.desde = None
        self.ultimo = -math.inf

    def actualizar(self, valor, ahora):
        if valor < self.umbral:
            self.desde = None
            return False
        if self.desde is None:
            self.desde = ahora
        if ahora - self.desde >= self.segundos and ahora - self.ultimo >= self.espera:
            self.ultimo = ahora
            self.desde = None
            return True
        return False


# ---------- Filtros (dibujo) ----------

def corazon(frame, centro, tamano, color):
    # Curva del corazon: x = 16 sin^3 t, y = 13 cos t - 5 cos 2t - 2 cos 3t - cos 4t
    t = np.linspace(0, 2 * np.pi, 40)
    x = 16 * np.sin(t) ** 3
    y = -(13 * np.cos(t) - 5 * np.cos(2 * t) - 2 * np.cos(3 * t) - np.cos(4 * t))
    pts = np.stack([centro[0] + x * tamano / 32, centro[1] + y * tamano / 32], axis=1).astype(np.int32)
    cv2.fillPoly(frame, [pts], color, cv2.LINE_AA)


def estrella(frame, centro, tamano, color):
    pts = []
    for i in range(10):
        r = tamano if i % 2 == 0 else tamano * 0.45
        a = -math.pi / 2 + i * math.pi / 5
        pts.append((centro[0] + r * math.cos(a), centro[1] + r * math.sin(a)))
    cv2.fillPoly(frame, [np.array(pts, dtype=np.int32)], color, cv2.LINE_AA)


def tinte(frame, color_bgr, fuerza):
    capa = np.zeros_like(frame)
    capa[:] = color_bgr
    cv2.addWeighted(capa, fuerza, frame, 1 - fuerza, 0, frame)


class Filtros:
    def __init__(self):
        self.objetos = []      # [tipo, x, y, vx, vy, vida, tamano]

    def emitir(self, expresion, px, ancho_cara):
        if expresion == "Beso" and random.random() < 0.3:
            x, y = px[BOCA]
            self.objetos.append(["corazon", x, y, random.uniform(-1.5, 1.5), -2.5, 50, ancho_cara * 0.12])
        elif expresion == "Tristeza" and random.random() < 0.25:
            x, y = px[random.choice([BAJO_OJO_IZQ, BAJO_OJO_DER])]
            self.objetos.append(["lagrima", x, y, 0, 3, 40, ancho_cara * 0.04])
        elif expresion == "Alegria" and random.random() < 0.3:
            x, y = px[FRENTE]
            x += random.uniform(-0.8, 0.8) * ancho_cara
            self.objetos.append(["estrella", x, y, 0, -1.5, 35, ancho_cara * random.uniform(0.05, 0.1)])

    def dibujar(self, frame, expresion, px, ancho_cara):
        if expresion == "Enfado":
            tinte(frame, (0, 0, 255), 0.25)
            x, y = px[FRENTE]
            cv2.putText(frame, "#@!%", (int(x - ancho_cara * 0.4), int(y - ancho_cara * 0.25)),
                        cv2.FONT_HERSHEY_SIMPLEX, ancho_cara / 150, (0, 0, 255), 4)
        elif expresion == "Tristeza":
            tinte(frame, (255, 120, 0), 0.2)
        elif expresion == "Sorpresa":
            x, y = px[FRENTE]
            tam = ancho_cara / 60
            cv2.putText(frame, "!", (int(x - 10 * tam), int(y - ancho_cara * 0.2)),
                        cv2.FONT_HERSHEY_SIMPLEX, tam, (0, 255, 255), max(2, int(tam * 3)))
        elif expresion == "Guino" and px:
            for i in (OJO_IZQ, OJO_DER):
                estrella(frame, (int(px[i][0]), int(px[i][1] - ancho_cara * 0.15)), ancho_cara * 0.06, (0, 255, 255))

        vivos = []
        for o in self.objetos:
            o[1] += o[3]
            o[2] += o[4]
            o[5] -= 1
            if o[5] <= 0:
                continue
            vivos.append(o)
            centro = (int(o[1]), int(o[2]))
            if o[0] == "corazon":
                corazon(frame, centro, o[6], (147, 20, 255))
            elif o[0] == "estrella":
                estrella(frame, centro, o[6], (0, 215, 255))
            else:
                cv2.ellipse(frame, centro, (int(o[6] * 0.6), int(o[6])), 0, 0, 360, (255, 200, 100), -1)
        self.objetos = vivos


# ---------- Camara ----------

def descargar_modelo():
    if not os.path.exists(MODELO):
        print("Descargando modelo de malla facial...")
        urllib.request.urlretrieve(URL_MODELO, MODELO)
        print("Modelo descargado.")


def crear_detector(modo=vision.RunningMode.VIDEO):
    opciones = vision.FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=MODELO),
        running_mode=modo,
        output_face_blendshapes=True,
        num_faces=1,
    )
    return vision.FaceLandmarker.create_from_options(opciones)


def detectar(detector, frame_bgr, timestamp_ms=None):
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    imagen = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    if timestamp_ms is None:
        resultado = detector.detect(imagen)
    else:
        resultado = detector.detect_for_video(imagen, timestamp_ms)
    if not resultado.face_landmarks:
        return None, None
    formas = {b.category_name: b.score for b in resultado.face_blendshapes[0]}
    return formas, resultado.face_landmarks[0]


def guardar_foto(frame):
    nombre = time.strftime("foto_%Y%m%d_%H%M%S.png")
    cv2.imwrite(nombre, frame)
    print("Foto guardada:", nombre)
    return nombre


def main():
    descargar_modelo()
    detector = crear_detector()
    cap = plataforma.abrir_camara(0)
    if not cap.isOpened():
        print("ERROR: no se pudo abrir la camara. Prueba a cambiar el 0 por 1.")
        raise SystemExit(1)

    emociones = Emociones()
    filtros = Filtros()
    foto_sonrisa = Disparador()
    con_filtros, auto_foto = True, False
    flash_hasta = 0.0
    inicio = time.monotonic()
    print("Teclas: n calibrar cara neutra | f filtros | a foto al sonreir | s foto | q salir")

    while True:
        ok, frame = cap.read()
        if not ok:
            print("ERROR: la camara no devolvio imagen.")
            break
        frame = cv2.flip(frame, 1)
        alto, ancho = frame.shape[:2]
        ahora = time.monotonic()
        formas, puntos = detectar(detector, frame, int((ahora - inicio) * 1000))
        expresion = emociones.actualizar(formas)

        if puntos is not None and con_filtros:
            px = [(p.x * ancho, p.y * alto) for p in puntos]
            xs = [x for x, _ in px]
            ancho_cara = max(xs) - min(xs)
            filtros.emitir(expresion, px, ancho_cara)
            filtros.dibujar(frame, expresion, px, ancho_cara)

        if auto_foto and foto_sonrisa.actualizar(emociones.puntos["Alegria"], ahora):
            guardar_foto(frame)
            flash_hasta = ahora + 0.15

        # Panel con las barras de cada expresion
        cv2.rectangle(frame, (0, 0), (260, 40 + 28 * len(EXPRESIONES)), (0, 0, 0), -1)
        cv2.putText(frame, expresion, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 255), 2)
        for i, e in enumerate(EXPRESIONES):
            y = 55 + 28 * i
            valor = emociones.puntos[e]
            cv2.putText(frame, e, (10, y + 5), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
            cv2.rectangle(frame, (100, y - 8), (100 + int(150 * valor), y + 6),
                          (0, 255, 0) if e == expresion else (150, 150, 150), -1)
            cv2.line(frame, (100 + int(150 * UMBRAL), y - 10), (100 + int(150 * UMBRAL), y + 8), (0, 0, 255), 1)
        avisos = []
        if formas is None:
            avisos.append("No veo ninguna cara")
        if emociones.esta_calibrando:
            avisos.append("Calibrando: pon cara neutra...")
        if auto_foto:
            avisos.append("Foto automatica al sonreir: ON")
        for n, aviso in enumerate(avisos):
            cv2.putText(frame, aviso, (10, alto - 20 - 30 * n), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
        if ahora < flash_hasta:
            frame[:] = 255   # flash de "camara de fotos"

        cv2.imshow("Paso 17 - Emociones", frame)
        tecla = cv2.waitKey(1) & 0xFF
        if tecla == ord("q"):
            break
        if tecla == ord("n"):
            emociones.empezar_calibracion()
        if tecla == ord("f"):
            con_filtros = not con_filtros
        if tecla == ord("a"):
            auto_foto = not auto_foto
        if tecla == ord("s"):
            guardar_foto(frame)

    cap.release()
    cv2.destroyAllWindows()
    detector.close()


if __name__ == "__main__":
    main()
