# Paso 3: detectar rostros en tiempo real con MediaPipe y dibujarlos con OpenCV.
# Pulsa la tecla "q" para salir.
import os
import time
import urllib.request

import cv2
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions, vision

import plataforma

# Modelo BlazeFace de corto alcance: pensado para caras a menos de ~2 m de la camara (webcam).
MODELO = "blaze_face_short_range.tflite"
URL_MODELO = ("https://storage.googleapis.com/mediapipe-models/face_detector/"
              "blaze_face_short_range/float16/latest/blaze_face_short_range.tflite")


def descargar_modelo():
    if not os.path.exists(MODELO):
        print("Descargando modelo de rostro...")
        urllib.request.urlretrieve(URL_MODELO, MODELO)
        print("Modelo descargado.")


def crear_detector():
    opciones = vision.FaceDetectorOptions(
        base_options=BaseOptions(model_asset_path=MODELO),
        running_mode=vision.RunningMode.VIDEO,
        min_detection_confidence=0.5,
    )
    return vision.FaceDetector.create_from_options(opciones)


def detectar(detector, frame_bgr, timestamp_ms):
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    imagen = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    return detector.detect_for_video(imagen, timestamp_ms)


def dibujar_rostros(frame, resultado):
    alto, ancho = frame.shape[:2]
    for deteccion in resultado.detections:
        # La caja ya viene en pixeles: esquina superior izquierda + ancho y alto.
        caja = deteccion.bounding_box
        x, y = caja.origin_x, caja.origin_y
        cv2.rectangle(frame, (x, y), (x + caja.width, y + caja.height), (255, 0, 255), 2)

        confianza = deteccion.categories[0].score
        cv2.putText(frame, f"Rostro {confianza:.0%}", (x, y - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 0, 255), 2)

        # Los 6 puntos clave (ojos, nariz, boca, orejas) vienen en cambio normalizados (0 a 1), como en las manos.
        for punto in deteccion.keypoints:
            cv2.circle(frame, (int(punto.x * ancho), int(punto.y * alto)), 4, (0, 255, 255), -1)


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

        ahora = time.monotonic()
        resultado = detectar(detector, frame, int((ahora - inicio) * 1000))
        dibujar_rostros(frame, resultado)

        fps = 1 / max(ahora - anterior, 1e-6)
        anterior = ahora
        cv2.putText(frame, f"Rostros: {len(resultado.detections)}  FPS: {fps:.0f}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

        cv2.imshow("Paso 3 - Rostro", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    detector.close()


if __name__ == "__main__":
    main()
