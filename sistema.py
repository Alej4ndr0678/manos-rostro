# Sistema completo: rostro + manos + contador de dedos + particulas, todo en una ventana.
# Reutiliza las funciones de los pasos anteriores y hilos.py (deben estar en la misma carpeta):
#   paso2_manos.py, paso3_rostro.py, paso5_dedos.py, paso6_particulas.py, paso7_gestos.py
#
# Teclas:
#   q = salir
#   r = rostro on/off        m = esqueleto de manos on/off
#   c = contador de dedos on/off   d = modo depuracion de dedos (P I C A M)
#   p = particulas on/off    f = fondo negro on/off
#   g = nombre del gesto on/off
import time

import cv2
import numpy as np

import paso2_manos as manos
import paso3_rostro as rostro
import paso5_dedos as dedos
import paso6_particulas as particulas_fx
import paso7_gestos as gestos
import hilos

_ultimo_detector = None  # para poder consultar los FPS de deteccion desde fuera (pruebas)


def main():
    global _ultimo_detector
    # El reconocedor de gestos hace de detector de manos: devuelve los mismos 21 puntos
    # y ademas el gesto, asi que no hace falta ejecutar dos modelos de manos.
    gestos.descargar_modelo()
    rostro.descargar_modelo()
    detector_manos = gestos.crear_detector()
    detector_rostro = rostro.crear_detector()

    # Que se ve en pantalla. Cada tecla cambia una de estas opciones.
    ver = {"rostro": True, "manos": True, "contador": True, "debug": False,
           "particulas": True, "camara": True, "gestos": True}
    teclas = {"r": "rostro", "m": "manos", "c": "contador", "d": "debug",
              "p": "particulas", "f": "camara", "g": "gestos"}

    def detectar(frame, ts):
        # Se ejecuta en el hilo del detector. La cara solo si la vamos a dibujar (ahorra CPU).
        res_manos = gestos.detectar(detector_manos, frame, ts)
        res_rostro = rostro.detectar(detector_rostro, frame, ts) if ver["rostro"] else None
        return res_manos, res_rostro

    # La camara y la deteccion trabajan en sus propios hilos (ver hilos.py)
    camara = hilos.CamaraEnHilo(0)
    if not camara.isOpened():
        print("ERROR: no se pudo abrir la camara. Prueba a cambiar el 0 por 1.")
        raise SystemExit(1)
    detector = hilos.DetectorEnHilo(detectar)
    _ultimo_detector = detector

    historial_dedos = {}   # para suavizar el contador
    lista_particulas = []  # particulas vivas
    puntas_anteriores = {} # donde estaba cada dedo en la deteccion anterior
    numero_frame = 0
    resultado_usado = 0    # ultimo resultado de deteccion que ya procesamos

    anterior = time.monotonic()
    fps = 0.0

    def tecla_pulsada():
        # Muestra la ventana y procesa el teclado. Devuelve False si hay que salir.
        tecla = cv2.waitKey(1) & 0xFF
        if tecla == ord("q"):
            return False
        if tecla != 255 and chr(tecla) in teclas:
            opcion = teclas[chr(tecla)]
            ver[opcion] = not ver[opcion]
        return True
    print("Teclas: q salir | r rostro | m manos | c contador | d depuracion | p particulas | f fondo negro | g gestos")

    try:
        while True:
            numero_frame, frame = camara.leer(numero_frame)
            if frame is None:
                print("ERROR: la camara no devolvio imagen.")
                break
            frame = cv2.flip(frame, 1)
            alto, ancho = frame.shape[:2]

            # 1) Mandamos el frame al detector y usamos el ultimo resultado que tenga listo.
            #    No esperamos: si aun esta pensando, dibujamos con el resultado anterior.
            detector.enviar(frame)
            numero_resultado, resultado = detector.ultimo()
            if resultado is None:  # el detector aun no ha terminado su primer frame
                cv2.imshow("Sistema - Manos y Rostro", frame)
                if not tecla_pulsada():
                    break
                continue
            res_manos, res_rostro = resultado
            if not ver["rostro"]:
                res_rostro = None
            nuevo = numero_resultado != resultado_usado
            resultado_usado = numero_resultado

            # 2) Fondo: la camara (oscurecida si hay particulas, para que brillen) o negro.
            if not ver["camara"]:
                salida = np.zeros_like(frame)
            elif ver["particulas"]:
                salida = frame // 2
            else:
                salida = frame

            # 3) Particulas: se crean solo con cada deteccion nueva (si no, la velocidad del dedo
            #    saldria 0 en los frames repetidos), pero se mueven y dibujan en cada frame.
            if ver["particulas"]:
                if nuevo:
                    puntas_anteriores = particulas_fx.procesar_manos(res_manos, ancho, alto,
                                                                     puntas_anteriores, lista_particulas)
                lienzo = np.zeros_like(frame)
                particulas_fx.actualizar_y_dibujar(lista_particulas, lienzo)
                salida = cv2.add(cv2.add(salida, lienzo), particulas_fx.brillo(lienzo, 6))
            else:
                lista_particulas.clear()
                puntas_anteriores = {}

            # 4) Rostro, manos y contador encima de todo
            if res_rostro is not None:
                rostro.dibujar_rostros(salida, res_rostro)
            if ver["manos"]:
                manos.dibujar_manos(salida, res_manos)
            total = None
            if ver["contador"]:
                total = dedos.dibujar_conteo(salida, res_manos, historial_dedos, ver["debug"])
            if ver["gestos"]:
                gestos.dibujar_gestos(salida, res_manos)

            # 5) Barra de informacion: FPS del video y FPS de la deteccion por separado
            ahora = time.monotonic()
            fps = 0.9 * fps + 0.1 / max(ahora - anterior, 1e-6)
            anterior = ahora
            texto = f"Manos: {len(res_manos.hand_landmarks)}"
            if res_rostro is not None:
                texto = f"Rostros: {len(res_rostro.detections)}  " + texto
            if total is not None:
                texto += f"  Dedos: {total}"
            texto += f"  FPS: {fps:.0f} (deteccion {detector.fps:.0f})"
            cv2.putText(salida, texto, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            activos = " ".join(k for k, v in teclas.items() if ver[v])
            cv2.putText(salida, f"Activo: {activos}  (q salir)", (10, alto - 15),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

            cv2.imshow("Sistema - Manos y Rostro", salida)
            if not tecla_pulsada():
                break
    finally:
        # Paramos los hilos antes de cerrar los modelos que usan
        detector.parar()
        camara.soltar()
        cv2.destroyAllWindows()
        detector_manos.close()
        detector_rostro.close()

if __name__ == "__main__":
    main()
