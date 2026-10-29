# Paso 7: reconocer gestos con nombre (pulgar arriba, victoria, puno...) con MediaPipe.
# El reconocedor de gestos tambien devuelve los 21 puntos de cada mano, asi que puede
# sustituir al detector de paso2_manos.py y seguir usando sus funciones de dibujo.
# Pulsa la tecla "q" para salir.
import os
import time
import urllib.request

import cv2
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions, vision

import paso2_manos as manos
import plataforma

MODELO = "gesture_recognizer.task"
URL_MODELO = ("https://storage.googleapis.com/mediapipe-models/gesture_recognizer/"
              "gesture_recognizer/float16/latest/gesture_recognizer.task")

# Los 7 gestos que trae entrenados el modelo, traducidos. "None" = ningun gesto conocido.
GESTOS = {
    "Closed_Fist": "Puno",
    "Open_Palm": "Mano abierta",
    "Pointing_Up": "Apuntar arriba",
    "Thumb_Up": "Pulgar arriba",
    "Thumb_Down": "Pulgar abajo",
    "Victory": "Victoria",
    "ILoveYou": "Te quiero",
}
CONFIANZA_MINIMA = 0.6  # por debajo de esto no mostramos el gesto (evita falsos positivos)


def descargar_modelo():
    if not os.path.exists(MODELO):
        print("Descargando modelo de gestos...")
        urllib.request.urlretrieve(URL_MODELO, MODELO)
        print("Modelo descargado.")


def crear_detector():
    opciones = vision.GestureRecognizerOptions(
        base_options=BaseOptions(model_asset_path=MODELO),
        running_mode=vision.RunningMode.VIDEO,
        num_hands=2,
        min_hand_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    return vision.GestureRecognizer.create_from_options(opciones)


def detectar(detector, frame_bgr, timestamp_ms):
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    imagen = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    return detector.recognize_for_video(imagen, timestamp_ms)


def nombre_gesto(resultado, i):
    # Devuelve el nombre traducido del gesto de la mano i, o None si no hay uno claro.
    if not resultado.gestures or not resultado.gestures[i]:
        return None
    mejor = resultado.gestures[i][0]
    if mejor.category_name not in GESTOS or mejor.score < CONFIANZA_MINIMA:
        return None
    return GESTOS[mejor.category_name]


def dibujar_gestos(frame, resultado):
    alto, ancho = frame.shape[:2]
    for i, puntos in enumerate(resultado.hand_landmarks):
        gesto = nombre_gesto(resultado, i)
        if gesto is None:
            continue
        # Texto encima de la mano, por encima del punto mas alto
        x = int(min(p.x for p in puntos) * ancho)
        y = int(min(p.y for p in puntos) * alto) - 50
        cv2.putText(frame, gesto, (x, max(y, 60)), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 0), 5)
        cv2.putText(frame, gesto, (x, max(y, 60)), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 0), 2)


def main():
    descargar_modelo()
    detector = crear_detector()

    cap = plataforma.abrir_camara(0)
    if not cap.isOpened():
        print("ERROR: no se pudo abrir la camara. Prueba a cambiar el 0 por 1.")
        raise SystemExit(1)

    inicio = time.monotonic()
    print("Camara abierta. Pulsa 'q' en la ventana para salir.")

    while True:
        ok, frame = cap.read()
        if not ok:
            print("ERROR: la camara no devolvio imagen.")
            break
        frame = cv2.flip(frame, 1)

        resultado = detectar(detector, frame, int((time.monotonic() - inicio) * 1000))
        manos.dibujar_manos(frame, resultado)
        dibujar_gestos(frame, resultado)

        cv2.imshow("Paso 7 - Gestos", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    detector.close()


if __name__ == "__main__":
    main()
