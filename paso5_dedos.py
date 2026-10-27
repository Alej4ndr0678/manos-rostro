# Paso 5: sistema completo + contador de dedos levantados en cada mano.
# Reutiliza paso2_manos.py y paso3_rostro.py (deben estar en la misma carpeta).
# Pulsa la tecla "q" para salir y "d" para activar/desactivar el modo depuracion.
import math
import time
from collections import Counter, deque

import cv2

import paso2_manos as manos
import paso3_rostro as rostro

# Indices de los 21 puntos de la mano que usamos:
BASE_CORAZON = 9
PULGAR_PUNTA, PULGAR_ARTICULACION = 4, 3
# (base, articulacion media, articulacion de arriba, punta) de indice, corazon, anular y menique
DEDOS = [(5, 6, 7, 8), (9, 10, 11, 12), (13, 14, 15, 16), (17, 18, 19, 20)]
NOMBRES = ["P", "I", "C", "A", "M"]  # pulgar, indice, corazon, anular, menique

# Si un dedo se dobla mas de estos grados, lo contamos como bajado.
ANGULO_DOBLADO = 80
# Cuantos frames recordamos para suavizar (evita que el numero parpadee).
FRAMES_SUAVIZADO = 5


def distancia(a, b):
    return math.hypot(a.x - b.x, a.y - b.y)


def angulo(a, b, c, d):
    # Angulo en grados entre el segmento a->b (la base del dedo) y c->d (la punta).
    # 0 = dedo totalmente recto; cuanto mas se dobla, mayor el angulo.
    v1 = (b.x - a.x, b.y - a.y, b.z - a.z)
    v2 = (d.x - c.x, d.y - c.y, d.z - c.z)
    producto = sum(x * y for x, y in zip(v1, v2))
    normas = math.hypot(*v1) * math.hypot(*v2)
    return math.degrees(math.acos(max(-1.0, min(1.0, producto / normas))))


def dedos_levantados(puntos, puntos_3d):
    # Devuelve una lista de 5 True/False: [pulgar, indice, corazon, anular, menique].
    #
    # Pulgar: en 2D. Se mueve de lado, asi que lo comparamos con el centro de la palma
    # (base del corazon): si esta abierto, su punta se aleja; si esta doblado, la cruza.
    pulgar = (distancia(puntos[PULGAR_PUNTA], puntos[BASE_CORAZON])
              > distancia(puntos[PULGAR_ARTICULACION], puntos[BASE_CORAZON]))

    # Resto de dedos: en 3D con los "world landmarks" (coordenadas reales en metros).
    # En 2D, si ensenas el dorso y doblas un dedo hacia la camara, la punta apenas se mueve
    # en la imagen y parece estirado. En 3D se ve que esta doblado, da igual hacia donde.
    otros = [angulo(puntos_3d[base], puntos_3d[media], puntos_3d[arriba], puntos_3d[punta]) < ANGULO_DOBLADO
             for base, media, arriba, punta in DEDOS]

    return [pulgar] + otros


def suavizar(historial, lado, estado):
    # Guarda los ultimos frames de cada mano y devuelve el estado que mas se repite.
    # Asi un frame suelto con error no cambia el numero en pantalla.
    frames = historial.setdefault(lado, deque(maxlen=FRAMES_SUAVIZADO))
    frames.append(tuple(estado))
    return Counter(frames).most_common(1)[0][0]


def dibujar_conteo(frame, resultado, historial, debug=False):
    alto, ancho = frame.shape[:2]
    total = 0
    for i, puntos in enumerate(resultado.hand_landmarks):
        lado = resultado.handedness[i][0].category_name
        estado = suavizar(historial, lado, dedos_levantados(puntos, resultado.hand_world_landmarks[i]))
        n = sum(estado)
        total += n
        # Numero grande encima de la punta del dedo corazon (punto 12)
        x, y = int(puntos[12].x * ancho), int(puntos[12].y * alto)
        cv2.putText(frame, str(n), (x - 15, max(y - 20, 40)),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 165, 255), 3)
        if debug:
            # Modo depuracion: que dedos cree que estan levantados (ej. "P0 I1 C1 A0 M0")
            detalle = " ".join(f"{nombre}{int(arriba)}" for nombre, arriba in zip(NOMBRES, estado))
            muneca = (int(puntos[0].x * ancho) - 60, int(puntos[0].y * alto) + 60)
            cv2.putText(frame, detalle, muneca, cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 165, 255), 2)
    return total


def main():
    manos.descargar_modelo()
    rostro.descargar_modelo()
    detector_manos = manos.crear_detector()
    detector_rostro = rostro.crear_detector()

    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    if not cap.isOpened():
        print("ERROR: no se pudo abrir la camara. Prueba a cambiar el 0 por 1.")
        raise SystemExit(1)

    inicio = time.monotonic()
    anterior = inicio
    historial = {}
    debug = False
    print("Camara abierta. Pulsa 'q' para salir y 'd' para el modo depuracion.")

    while True:
        ok, frame = cap.read()
        if not ok:
            print("ERROR: la camara no devolvio imagen.")
            break
        frame = cv2.flip(frame, 1)

        ahora = time.monotonic()
        ts = int((ahora - inicio) * 1000)
        res_manos = manos.detectar(detector_manos, frame, ts)
        res_rostro = rostro.detectar(detector_rostro, frame, ts)

        rostro.dibujar_rostros(frame, res_rostro)
        manos.dibujar_manos(frame, res_manos)
        total = dibujar_conteo(frame, res_manos, historial, debug)

        fps = 1 / max(ahora - anterior, 1e-6)
        anterior = ahora
        texto = (f"Rostros: {len(res_rostro.detections)}  "
                 f"Manos: {len(res_manos.hand_landmarks)}  Dedos: {total}  FPS: {fps:.0f}")
        cv2.putText(frame, texto, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

        cv2.imshow("Paso 5 - Contador de dedos", frame)
        tecla = cv2.waitKey(1) & 0xFF
        if tecla == ord("q"):
            break
        if tecla == ord("d"):
            debug = not debug

    cap.release()
    cv2.destroyAllWindows()
    detector_manos.close()
    detector_rostro.close()


if __name__ == "__main__":
    main()
