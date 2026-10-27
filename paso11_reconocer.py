# Paso 11: reconocer QUIEN eres (no solo que hay una cara).
#
# 1) Registrate (una vez):   python paso11_reconocer.py registrar Alejandro
#    Mira a la camara y mueve un poco la cabeza: guarda 15 muestras en caras/Alejandro.npy
# 2) Reconocer:              python paso11_reconocer.py
#    Cada cara se compara con las personas registradas y se muestra el nombre o "Desconocido".
#
# Usa dos modelos de OpenCV (no de MediaPipe):
# - YuNet: detecta la cara y 5 puntos (ojos, nariz, comisuras) para enderezarla.
# - SFace: convierte la cara en un "embedding", una lista de 128 numeros que la describe.
#   Dos fotos de la misma persona dan embeddings parecidos; de personas distintas, no.
#
# OJO, seguridad: esto NO sirve como sistema de acceso. Se engana con una foto tuya en el movil,
# porque no comprueba que la cara sea real (eso se llama "deteccion de vida" o anti-spoofing).
# Pulsa la tecla "q" para salir.
import os
import sys
import time
import urllib.request

import cv2
import numpy as np

BASE_URL = "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/"
MODELO_DETECTOR = "face_detection_yunet_2023mar.onnx"
MODELO_RECONOCEDOR = "face_recognition_sface_2021dec.onnx"
URLS = {
    MODELO_DETECTOR: BASE_URL + "face_detection_yunet/" + MODELO_DETECTOR,
    MODELO_RECONOCEDOR: BASE_URL + "face_recognition_sface/" + MODELO_RECONOCEDOR,
}
CARPETA_CARAS = "caras"
UMBRAL = 0.363          # similitud coseno minima para decir "es esta persona" (valor recomendado por OpenCV)
MUESTRAS = 15           # cuantas muestras se guardan al registrarse
PAUSA_MUESTRAS = 0.4    # segundos entre muestras, para captar distintas posiciones de la cabeza


def descargar_modelos():
    for archivo, url in URLS.items():
        if not os.path.exists(archivo):
            print(f"Descargando {archivo}...")
            urllib.request.urlretrieve(url, archivo)
    print("Modelos listos.")


def crear_modelos():
    detector = cv2.FaceDetectorYN.create(MODELO_DETECTOR, "", (320, 320), 0.8)
    reconocedor = cv2.FaceRecognizerSF.create(MODELO_RECONOCEDOR, "")
    return detector, reconocedor


def detectar_caras(detector, frame):
    # Devuelve una fila por cara: x, y, ancho, alto, 5 puntos (x, y) y la confianza
    detector.setInputSize((frame.shape[1], frame.shape[0]))
    _, caras = detector.detect(frame)
    return [] if caras is None else list(caras)


def embedding(reconocedor, frame, cara):
    # Endereza y recorta la cara usando los ojos, y la convierte en 128 numeros
    recorte = reconocedor.alignCrop(frame, cara)
    return reconocedor.feature(recorte)


def cargar_personas():
    personas = {}
    if os.path.isdir(CARPETA_CARAS):
        for archivo in os.listdir(CARPETA_CARAS):
            if archivo.endswith(".npy"):
                personas[archivo[:-4]] = np.load(os.path.join(CARPETA_CARAS, archivo))
    return personas


def identificar(reconocedor, emb, personas):
    # Compara con todas las muestras de cada persona y se queda con la mas parecida
    mejor_nombre, mejor_similitud = "Desconocido", 0.0
    for nombre, muestras in personas.items():
        for muestra in muestras:
            similitud = reconocedor.match(emb, muestra.reshape(1, -1), cv2.FaceRecognizerSF_FR_COSINE)
            if similitud > mejor_similitud:
                mejor_nombre, mejor_similitud = nombre, similitud
    if mejor_similitud < UMBRAL:
        mejor_nombre = "Desconocido"
    return mejor_nombre, mejor_similitud


def abrir_camara():
    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    if not cap.isOpened():
        print("ERROR: no se pudo abrir la camara. Prueba a cambiar el 0 por 1.")
        raise SystemExit(1)
    return cap


def registrar(nombre):
    detector, reconocedor = crear_modelos()
    cap = abrir_camara()
    muestras = []
    ultima = 0.0
    print(f"Registrando a {nombre}. Mira a la camara y mueve un poco la cabeza.")

    while len(muestras) < MUESTRAS:
        ok, frame = cap.read()
        if not ok:
            break
        frame = cv2.flip(frame, 1)
        caras = detectar_caras(detector, frame)
        ahora = time.monotonic()

        if len(caras) == 1:
            x, y, w, h = caras[0][:4].astype(int)
            cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 2)
            if ahora - ultima >= PAUSA_MUESTRAS:
                muestras.append(embedding(reconocedor, frame, caras[0])[0])
                ultima = ahora
            mensaje = f"Muestra {len(muestras)}/{MUESTRAS}"
        else:
            # Con 0 o varias caras no sabemos cual eres tu, asi que no guardamos nada
            mensaje = "Necesito ver UNA sola cara"
        cv2.putText(frame, mensaje, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

        cv2.imshow("Paso 11 - Registro", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    if len(muestras) == MUESTRAS:
        os.makedirs(CARPETA_CARAS, exist_ok=True)
        ruta = os.path.join(CARPETA_CARAS, f"{nombre}.npy")
        np.save(ruta, np.array(muestras))
        print(f"Guardado en {ruta}. Ahora ejecuta: python paso11_reconocer.py")
    else:
        print("Registro cancelado, no se guardo nada.")


def reconocer():
    detector, reconocedor = crear_modelos()
    personas = cargar_personas()
    if not personas:
        print("No hay nadie registrado. Usa: python paso11_reconocer.py registrar TuNombre")
        return
    print(f"Personas registradas: {', '.join(personas)}")
    cap = abrir_camara()

    while True:
        ok, frame = cap.read()
        if not ok:
            print("ERROR: la camara no devolvio imagen.")
            break
        frame = cv2.flip(frame, 1)

        for cara in detectar_caras(detector, frame):
            nombre, similitud = identificar(reconocedor, embedding(reconocedor, frame, cara), personas)
            x, y, w, h = cara[:4].astype(int)
            color = (0, 0, 255) if nombre == "Desconocido" else (0, 255, 0)
            cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)
            cv2.putText(frame, f"{nombre} ({similitud:.2f})", (x, y - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)

        cv2.imshow("Paso 11 - Reconocimiento", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    descargar_modelos()
    if len(sys.argv) == 3 and sys.argv[1] == "registrar":
        registrar(sys.argv[2])
    elif len(sys.argv) == 1:
        reconocer()
    else:
        print("Uso:\n  python paso11_reconocer.py registrar TuNombre\n  python paso11_reconocer.py")
