# Paso 15: contador de ejercicio con el cuerpo entero (sentadillas, flexiones y curls).
#
# Usa el detector de POSE de MediaPipe: 33 puntos del cuerpo (hombros, codos, caderas,
# rodillas...). Con ellos medimos el angulo de una articulacion y contamos repeticiones:
#   - Sentadilla: angulo de la rodilla (cadera - rodilla - tobillo)
#   - Flexion:    angulo del codo (hombro - codo - muneca)
#   - Curl:       angulo del codo, pero contando cuando cierras el brazo
# Una repeticion cuenta cuando bajas del todo y vuelves arriba. Si te quedas a medias,
# no cuenta y te avisa ("Baja mas"). Tambien vigila la postura (espalda y cadera).
#
#   python paso15_ejercicio.py              (empieza con sentadillas)
#   python paso15_ejercicio.py flexion
#   python paso15_ejercicio.py curl
#
# Teclas: 1 sentadilla, 2 flexion, 3 curl, r reiniciar, q salir.
# Ponte de lado a la camara y que se te vea el cuerpo entero (para las flexiones y las
# sentadillas se ve mucho mejor el angulo de perfil).
import math
import os
import sys
import time
import urllib.request

import cv2
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python import vision

import plataforma

MODELO = "pose_landmarker_lite.task"
URL_MODELO = ("https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
              "pose_landmarker_lite/float16/latest/pose_landmarker_lite.task")

# Numeros de los puntos del cuerpo que usamos (de los 33 del modelo)
HOMBRO = {"izq": 11, "der": 12}
CODO = {"izq": 13, "der": 14}
MUNECA = {"izq": 15, "der": 16}
CADERA = {"izq": 23, "der": 24}
RODILLA = {"izq": 25, "der": 26}
TOBILLO = {"izq": 27, "der": 28}

VISIBILIDAD_MINIMA = 0.5
CONEXIONES = [(c.start, c.end) for c in vision.PoseLandmarksConnections.POSE_LANDMARKS]

# Cada ejercicio: que angulo mirar y los umbrales para "arriba" y "abajo".
# "abajo_es_menor" = en la fase de esfuerzo el angulo se hace pequeno (rodilla o codo doblados).
# Entre los dos umbrales hay un margen (histeresis) para que el temblor no cuente reps de mas.
EJERCICIOS = {
    "sentadilla": {"nombre": "Sentadillas", "articulacion": (CADERA, RODILLA, TOBILLO),
                   "arriba": 160, "abajo": 100, "fases": ("DE PIE", "ABAJO")},
    "flexion": {"nombre": "Flexiones", "articulacion": (HOMBRO, CODO, MUNECA),
                "arriba": 150, "abajo": 90, "fases": ("ARRIBA", "ABAJO")},
    "curl": {"nombre": "Curl de biceps", "articulacion": (HOMBRO, CODO, MUNECA),
             "arriba": 150, "abajo": 50, "fases": ("ESTIRADO", "CERRADO")},
}
MARGEN_INTENTO = 25          # si bajas al menos esto desde "arriba", ya cuenta como intento
INCLINACION_ESPALDA = 50     # sentadilla: grados maximos del tronco respecto a la vertical
LINEA_CUERPO = 150           # flexion: hombro-cadera-tobillo deberia estar casi recto


def angulo(a, b, c):
    # Angulo en el punto b (en grados) formado por a-b-c. Los puntos son (x, y) en pixeles.
    ang = math.degrees(math.atan2(c[1] - b[1], c[0] - b[0]) - math.atan2(a[1] - b[1], a[0] - b[0]))
    ang = abs(ang) % 360
    return 360 - ang if ang > 180 else ang


def inclinacion(arriba, abajo):
    # Cuantos grados se aparta de la vertical la linea abajo -> arriba (0 = recta de pie)
    dx, dy = arriba[0] - abajo[0], abajo[1] - arriba[1]
    return abs(math.degrees(math.atan2(dx, dy)))


def a_pixeles(puntos, ancho, alto):
    return [(p.x * ancho, p.y * alto) for p in puntos]


def visibilidad(p):
    v = getattr(p, "visibility", None)
    return 1.0 if v is None else v


def mejor_lado(puntos, indices):
    # Elige el lado del cuerpo (izq/der) que mejor se ve para esa articulacion.
    # Si ninguno se ve bien, devuelve None.
    puntuacion = {lado: min(visibilidad(puntos[i[lado]]) for i in indices) for lado in ("izq", "der")}
    lado = max(puntuacion, key=puntuacion.get)
    return lado if puntuacion[lado] >= VISIBILIDAD_MINIMA else None


def medir(puntos, ejercicio, ancho=1, alto=1):
    # Devuelve (angulo, lado) del ejercicio, o (None, None) si no se ve la articulacion
    indices = EJERCICIOS[ejercicio]["articulacion"]
    lado = mejor_lado(puntos, indices)
    if lado is None:
        return None, None
    px = a_pixeles(puntos, ancho, alto)
    a, b, c = (px[i[lado]] for i in indices)
    return angulo(a, b, c), lado


def revisar_postura(puntos, ejercicio, lado, ancho=1, alto=1):
    # Devuelve un consejo de postura, o None si todo esta bien
    px = a_pixeles(puntos, ancho, alto)
    hombro, cadera, tobillo = px[HOMBRO[lado]], px[CADERA[lado]], px[TOBILLO[lado]]
    if ejercicio == "sentadilla" and inclinacion(hombro, cadera) > INCLINACION_ESPALDA:
        return "Espalda mas recta"
    if ejercicio == "flexion" and angulo(hombro, cadera, tobillo) < LINEA_CUERPO:
        return "Cadera alineada con el cuerpo"
    return None


class ContadorReps:
    # Maquina de estados: "arriba" -> (bajas del todo) -> "abajo" -> (subes) -> "arriba" = 1 rep
    def __init__(self, ejercicio):
        self.ejercicio = ejercicio
        self.reiniciar()

    def reiniciar(self):
        self.reps = 0
        self.fase = "arriba"
        self.intento = False      # empezo a bajar pero aun no llego abajo
        self.consejo = None
        self.inicio_rep = None
        self.tiempos = []         # segundos que dura cada repeticion

    def actualizar(self, ang, ahora=None):
        # ang = angulo de la articulacion en este frame (o None si no se ve).
        # Devuelve True en el frame en que se completa una repeticion.
        if ang is None:
            return False
        cfg = EJERCICIOS[self.ejercicio]
        arriba, abajo = cfg["arriba"], cfg["abajo"]

        if self.fase == "arriba":
            if ang <= abajo:
                self.fase, self.intento, self.consejo = "abajo", False, None
            elif ang <= arriba - MARGEN_INTENTO:
                if not self.intento:
                    self.inicio_rep = ahora
                self.intento = True
            elif ang >= arriba and self.intento:
                # Volvio arriba sin llegar abajo: no cuenta
                self.intento = False
                self.consejo = "Baja mas" if self.ejercicio != "curl" else "Sube mas la mano"
            return False

        # fase "abajo": la rep se completa al volver arriba
        if ang >= arriba:
            self.fase = "arriba"
            self.reps += 1
            if ahora is not None and self.inicio_rep is not None:
                self.tiempos.append(ahora - self.inicio_rep)
            self.inicio_rep = None
            return True
        return False

    def progreso(self, ang):
        # 0 = arriba del todo, 1 = abajo del todo (para dibujar la barra)
        if ang is None:
            return 0.0
        cfg = EJERCICIOS[self.ejercicio]
        valor = (cfg["arriba"] - ang) / (cfg["arriba"] - cfg["abajo"])
        return max(0.0, min(1.0, valor))

    def ritmo_medio(self):
        return sum(self.tiempos) / len(self.tiempos) if self.tiempos else None


# ---------- Camara ----------

def descargar_modelo():
    if not os.path.exists(MODELO):
        print("Descargando modelo de pose...")
        urllib.request.urlretrieve(URL_MODELO, MODELO)
        print("Modelo descargado.")


def crear_detector():
    opciones = vision.PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=MODELO),
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    return vision.PoseLandmarker.create_from_options(opciones)


def detectar(detector, frame_bgr, timestamp_ms):
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    imagen = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    return detector.detect_for_video(imagen, timestamp_ms)


def dibujar_cuerpo(frame, puntos, resaltar=()):
    alto, ancho = frame.shape[:2]
    px = [(int(p.x * ancho), int(p.y * alto)) for p in puntos]
    for a, b in CONEXIONES:
        if visibilidad(puntos[a]) > VISIBILIDAD_MINIMA and visibilidad(puntos[b]) > VISIBILIDAD_MINIMA:
            cv2.line(frame, px[a], px[b], (255, 255, 255), 2)
    for i, (x, y) in enumerate(px):
        if visibilidad(puntos[i]) > VISIBILIDAD_MINIMA:
            cv2.circle(frame, (x, y), 8 if i in resaltar else 4, (0, 255, 255) if i in resaltar else (0, 0, 255), -1)


def main(ejercicio="sentadilla"):
    descargar_modelo()
    detector = crear_detector()
    cap = plataforma.abrir_camara(0)
    if not cap.isOpened():
        print("ERROR: no se pudo abrir la camara. Prueba a cambiar el 0 por 1.")
        raise SystemExit(1)

    contador = ContadorReps(ejercicio)
    inicio = time.monotonic()
    print("Teclas: 1 sentadilla | 2 flexion | 3 curl | r reiniciar | q salir")
    print("Ponte de lado a la camara y que se te vea el cuerpo entero.")

    while True:
        ok, frame = cap.read()
        if not ok:
            print("ERROR: la camara no devolvio imagen.")
            break
        frame = cv2.flip(frame, 1)
        alto, ancho = frame.shape[:2]
        ahora = time.monotonic()
        resultado = detectar(detector, frame, int((ahora - inicio) * 1000))

        ang, postura = None, None
        if resultado.pose_landmarks:
            puntos = resultado.pose_landmarks[0]
            ang, lado = medir(puntos, contador.ejercicio, ancho, alto)
            resaltar = ()
            if lado is not None:
                resaltar = [i[lado] for i in EJERCICIOS[contador.ejercicio]["articulacion"]]
                postura = revisar_postura(puntos, contador.ejercicio, lado, ancho, alto)
                cx, cy = (int(c) for c in a_pixeles(puntos, ancho, alto)[resaltar[1]])
                cv2.putText(frame, f"{ang:.0f}", (cx + 15, cy), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 255), 2)
            dibujar_cuerpo(frame, puntos, resaltar)
        contador.actualizar(ang, ahora)

        # Panel: ejercicio, repeticiones, fase y consejos
        cv2.rectangle(frame, (0, 0), (300, 130), (0, 0, 0), -1)
        cv2.putText(frame, EJERCICIOS[contador.ejercicio]["nombre"], (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
        cv2.putText(frame, str(contador.reps), (10, 100), cv2.FONT_HERSHEY_SIMPLEX, 2.5, (0, 255, 0), 5)
        fases = EJERCICIOS[contador.ejercicio]["fases"]
        cv2.putText(frame, fases[contador.fase == "abajo"], (150, 75), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
        ritmo = contador.ritmo_medio()
        if ritmo:
            cv2.putText(frame, f"{ritmo:.1f} s/rep", (150, 110), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2)
        # Barra de recorrido a la derecha: llena = has bajado del todo
        progreso = contador.progreso(ang)
        cv2.rectangle(frame, (ancho - 40, 60), (ancho - 15, alto - 60), (255, 255, 255), 2)
        alto_barra = int((alto - 120) * progreso)
        color = (0, 255, 0) if progreso >= 1.0 else (0, 200, 255)
        cv2.rectangle(frame, (ancho - 38, alto - 62 - alto_barra), (ancho - 17, alto - 62), color, -1)

        avisos = [a for a in (postura, contador.consejo) if a]
        if ang is None:
            avisos = ["No veo bien el cuerpo: alejate o ponte de lado"]
        for n, aviso in enumerate(avisos):
            cv2.putText(frame, aviso, (10, alto - 20 - 35 * n), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 2)

        cv2.imshow("Paso 15 - Contador de ejercicio", frame)
        tecla = cv2.waitKey(1) & 0xFF
        if tecla == ord("q"):
            break
        if tecla in (ord("1"), ord("2"), ord("3")):
            contador = ContadorReps(["sentadilla", "flexion", "curl"][tecla - ord("1")])
        if tecla == ord("r"):
            contador.reiniciar()

    cap.release()
    cv2.destroyAllWindows()
    detector.close()
    print(f"{EJERCICIOS[contador.ejercicio]['nombre']}: {contador.reps} repeticiones.")


if __name__ == "__main__":
    nombre = sys.argv[1] if len(sys.argv) > 1 else "sentadilla"
    if nombre not in EJERCICIOS:
        print("Uso: python paso15_ejercicio.py [sentadilla | flexion | curl]")
        raise SystemExit(1)
    main(nombre)
