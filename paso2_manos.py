# Paso 2: detectar manos en tiempo real con MediaPipe y dibujarlas con OpenCV.
# Pulsa la tecla "q" para salir.
import os
import time
import urllib.request

import cv2
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions, vision

import plataforma

# MediaPipe necesita un archivo de modelo (.task). Si no esta, lo descargamos (~8 MB).
MODELO = "hand_landmarker.task"
URL_MODELO = ("https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
              "hand_landmarker/float16/latest/hand_landmarker.task")

# MediaPipe etiqueta la mano como se ve en la imagen. Como volteamos la imagen (modo espejo),
# la etiqueta sale al reves respecto a tu mano real, asi que la invertimos y de paso la traducimos.
LADO_REAL = {"Left": "Derecha", "Right": "Izquierda"}

# Pares de puntos que forman los "huesos" de la mano (0 = muneca, 4 = punta del pulgar, 8 = punta del indice...)
CONEXIONES = [(c.start, c.end) for c in vision.HandLandmarksConnections.HAND_CONNECTIONS]


def descargar_modelo():
    if not os.path.exists(MODELO):
        print("Descargando modelo de manos...")
        urllib.request.urlretrieve(URL_MODELO, MODELO)
        print("Modelo descargado.")


def crear_detector():
    opciones = vision.HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=MODELO),
        running_mode=vision.RunningMode.VIDEO,  # VIDEO = frames seguidos, aprovecha el frame anterior
        num_hands=2,
        min_hand_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    return vision.HandLandmarker.create_from_options(opciones)


def detectar(detector, frame_bgr, timestamp_ms):
    # OpenCV trabaja en BGR y MediaPipe espera RGB: hay que convertir.
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    imagen = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    return detector.detect_for_video(imagen, timestamp_ms)


def dibujar_manos(frame, resultado):
    alto, ancho = frame.shape[:2]
    for i, puntos in enumerate(resultado.hand_landmarks):
        # MediaPipe da coordenadas normalizadas (0 a 1): las pasamos a pixeles.
        px = [(int(p.x * ancho), int(p.y * alto)) for p in puntos]

        for a, b in CONEXIONES:
            cv2.line(frame, px[a], px[b], (255, 255, 255), 2)
        for x, y in px:
            cv2.circle(frame, (x, y), 5, (0, 0, 255), -1)

        # Etiqueta "Izquierda"/"Derecha" junto a la muneca (punto 0)
        lado = LADO_REAL[resultado.handedness[i][0].category_name]
        cv2.putText(frame, lado, (px[0][0] - 20, px[0][1] + 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)


def main():
    descargar_modelo()
    detector = crear_detector()

    cap = plataforma.abrir_camara(0)
    if not cap.isOpened():
        print("ERROR: no se pudo abrir la camara. Prueba a cambiar el 0 por 1.")
        raise SystemExit(1)

    inicio = time.monotonic()
    anterior = inicio
    print("Camara abierta. Pulsa 'q' en la ventana para salir.")

    while True:
        ok, frame = cap.read()
        if not ok:
            print("ERROR: la camara no devolvio imagen.")
            break
        frame = cv2.flip(frame, 1)

        # En modo VIDEO cada frame necesita una marca de tiempo creciente en milisegundos.
        ahora = time.monotonic()
        resultado = detectar(detector, frame, int((ahora - inicio) * 1000))
        dibujar_manos(frame, resultado)

        fps = 1 / max(ahora - anterior, 1e-6)
        anterior = ahora
        cv2.putText(frame, f"Manos: {len(resultado.hand_landmarks)}  FPS: {fps:.0f}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

        cv2.imshow("Paso 2 - Manos", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    detector.close()


if __name__ == "__main__":
    main()
