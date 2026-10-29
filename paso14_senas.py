# Paso 14: traductor de lengua de senas que entrenas TU (machine learning de verdad).
#
# Los gestos del paso 7 vienen de un modelo que entreno Google. Aqui el modelo lo entrenas
# tu con tus propios ejemplos, asi que reconoce las senas que tu le ensenes (letras del
# alfabeto dactilologico, numeros, o lo que quieras).
#
# 1) Grabar ejemplos de cada sena (unos segundos por sena, moviendo un poco la mano):
#       python paso14_senas.py grabar A
#       python paso14_senas.py grabar B
#       ...
#    Cada muestra se guarda como una fila en senas.csv (los 21 puntos de la mano).
# 2) Ver que tal aprende (precision con validacion cruzada y en que se confunde):
#       python paso14_senas.py entrenar
# 3) Traducir en tiempo real:
#       python paso14_senas.py
#    Mantener una sena 1 segundo la escribe. Teclas: espacio = espacio, b = borrar,
#    c = borrar todo, q = salir.
#
# Como funciona:
# - De cada mano sacamos 63 numeros (x, y, z de los 21 puntos). Antes los "normalizamos":
#   restamos la muneca (da igual donde este la mano) y dividimos por el tamano de la mano
#   (da igual lo cerca que estes). La mano izquierda se refleja para que valga cualquier mano.
# - Un "Random Forest" (muchos arboles de decision que votan) aprende que numeros
#   corresponden a cada sena.
# - El modelo se entrena al arrancar a partir de senas.csv (tarda menos de un segundo).
#   No lo guardamos con pickle a proposito: cargar un pickle puede ejecutar codigo, y es
#   un fallo de seguridad clasico si alguien te pasa un modelo "trampa".
import csv
import os
import sys
import time
from collections import Counter, deque

import cv2
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import cross_val_predict

import paso2_manos as manos
import plataforma

ARCHIVO_DATOS = "senas.csv"
MUESTRAS_POR_GRABACION = 150
SEGUNDOS_PREPARACION = 3     # cuenta atras antes de empezar a grabar
CONFIANZA_MINIMA = 0.6       # por debajo, la sena se muestra como "?"
SEGUNDOS_ESCRIBIR = 1.0      # cuanto mantener una sena para que se escriba
FRAMES_SUAVIZADO = 7


def caracteristicas(puntos, lado="Derecha"):
    # 21 puntos -> 63 numeros que no dependen de donde este la mano ni de su tamano
    p = np.array([[q.x, q.y, q.z] for q in puntos], dtype=np.float32)
    p -= p[0]                                    # la muneca pasa a ser el origen
    tamano = np.linalg.norm(p[9, :2]) or 1.0     # muneca -> base del dedo corazon
    p /= tamano
    if lado == "Izquierda":
        p[:, 0] = -p[:, 0]                       # espejo: la izquierda se ve como una derecha
    return p.flatten()


def guardar_muestras(etiqueta, muestras, ruta=None):
    ruta = ruta or ARCHIVO_DATOS
    with open(ruta, "a", newline="") as f:
        escritor = csv.writer(f)
        for fila in muestras:
            escritor.writerow([etiqueta] + [f"{v:.5f}" for v in fila])


def cargar_datos(ruta=None):
    ruta = ruta or ARCHIVO_DATOS
    etiquetas, filas = [], []
    if os.path.exists(ruta):
        with open(ruta, newline="") as f:
            for fila in csv.reader(f):
                if fila:
                    etiquetas.append(fila[0])
                    filas.append([float(v) for v in fila[1:]])
    return np.array(filas, dtype=np.float32).reshape(-1, 63), np.array(etiquetas)


def crear_modelo():
    return RandomForestClassifier(n_estimators=150, random_state=0)


def entrenar(X, y):
    modelo = crear_modelo()
    modelo.fit(X, y)
    return modelo


def evaluar(X, y, pliegues=5):
    # Validacion cruzada: se entrena con 4/5 de los datos y se prueba con el 1/5 restante,
    # 5 veces. Asi medimos con ejemplos que el modelo NO ha visto (si no, haria "trampa").
    pliegues = min(pliegues, min(Counter(y).values()))
    predicciones = cross_val_predict(crear_modelo(), X, y, cv=pliegues)
    precision = float(np.mean(predicciones == y))
    return precision, predicciones


def predecir(modelo, x):
    probabilidades = modelo.predict_proba(x.reshape(1, -1))[0]
    i = int(np.argmax(probabilidades))
    return modelo.classes_[i], float(probabilidades[i])


class Escritor:
    # Convierte las predicciones de cada frame en texto: suaviza y escribe cuando se mantiene.
    def __init__(self):
        self.ultimas = deque(maxlen=FRAMES_SUAVIZADO)
        self.texto = ""
        self.actual = None
        self.desde = None
        self.escrita = False

    def actualizar(self, sena, ahora):
        # sena = letra predicha en este frame, o None si no hay mano o no esta clara
        self.ultimas.append(sena)
        votos = Counter(self.ultimas).most_common(1)[0]
        estable = votos[0] if votos[1] > len(self.ultimas) // 2 else None
        if estable != self.actual:
            self.actual, self.desde, self.escrita = estable, ahora, False
        elif estable is not None and not self.escrita and ahora - self.desde >= SEGUNDOS_ESCRIBIR:
            self.texto += estable
            self.escrita = True     # para repetir letra hay que quitar la mano o cambiar de sena
        return estable

    def progreso(self, ahora):
        if self.actual is None or self.escrita:
            return 0.0
        return min((ahora - self.desde) / SEGUNDOS_ESCRIBIR, 1.0)


# ---------- Camara ----------

def abrir():
    manos.descargar_modelo()
    detector = manos.crear_detector()
    cap = plataforma.abrir_camara(0)
    if not cap.isOpened():
        print("ERROR: no se pudo abrir la camara. Prueba a cambiar el 0 por 1.")
        raise SystemExit(1)
    return detector, cap


def primera_mano(resultado):
    if not resultado.hand_landmarks:
        return None, None
    return resultado.hand_landmarks[0], manos.LADO_REAL[resultado.handedness[0][0].category_name]


def grabar(etiqueta):
    detector, cap = abrir()
    muestras = []
    inicio = time.monotonic()
    print(f"Grabando la sena '{etiqueta}'. Ponla delante de la camara y muevela un poco "
          "(gira, acerca, aleja) para que el modelo aprenda variaciones.")

    while len(muestras) < MUESTRAS_POR_GRABACION:
        ok, frame = cap.read()
        if not ok:
            break
        frame = cv2.flip(frame, 1)
        ahora = time.monotonic()
        resultado = manos.detectar(detector, frame, int((ahora - inicio) * 1000))
        puntos, lado = primera_mano(resultado)
        falta = SEGUNDOS_PREPARACION - (ahora - inicio)
        if falta > 0:
            mensaje = f"Preparate... {falta:.0f}"
        elif puntos is None:
            mensaje = "No veo la mano"
        else:
            muestras.append(caracteristicas(puntos, lado))
            mensaje = f"'{etiqueta}': {len(muestras)}/{MUESTRAS_POR_GRABACION}"
        manos.dibujar_manos(frame, resultado)
        cv2.putText(frame, mensaje, (10, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)
        cv2.imshow("Paso 14 - Grabar sena", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    detector.close()
    if len(muestras) == MUESTRAS_POR_GRABACION:
        guardar_muestras(etiqueta, muestras)
        print(f"Guardadas {len(muestras)} muestras de '{etiqueta}' en {ARCHIVO_DATOS}.")
    else:
        print("Grabacion cancelada, no se guardo nada.")


def informe():
    X, y = cargar_datos()
    clases = sorted(set(y))
    if len(clases) < 2:
        print("Necesitas al menos 2 senas grabadas. Usa: python paso14_senas.py grabar A")
        return
    print(f"{len(y)} muestras de {len(clases)} senas: " +
          ", ".join(f"{c} ({n})" for c, n in sorted(Counter(y).items())))
    precision, predicciones = evaluar(X, y)
    print(f"\nPrecision con validacion cruzada: {precision:.1%}\n")
    print(classification_report(y, predicciones, zero_division=0))
    print("Matriz de confusion (filas = sena real, columnas = lo que predijo):")
    matriz = confusion_matrix(y, predicciones, labels=clases)
    print("      " + " ".join(f"{c:>5}" for c in clases))
    for c, fila in zip(clases, matriz):
        print(f"{c:>5} " + " ".join(f"{v:5d}" for v in fila))


def traducir():
    X, y = cargar_datos()
    if len(set(y)) < 2:
        print("Necesitas al menos 2 senas grabadas. Usa: python paso14_senas.py grabar A")
        return
    modelo = entrenar(X, y)
    print(f"Modelo entrenado con {len(y)} muestras de: {', '.join(modelo.classes_)}")
    detector, cap = abrir()
    escritor = Escritor()
    inicio = time.monotonic()
    print("Teclas: espacio = espacio | b = borrar letra | c = borrar todo | q = salir")

    while True:
        ok, frame = cap.read()
        if not ok:
            print("ERROR: la camara no devolvio imagen.")
            break
        frame = cv2.flip(frame, 1)
        alto, ancho = frame.shape[:2]
        ahora = time.monotonic()
        resultado = manos.detectar(detector, frame, int((ahora - inicio) * 1000))
        puntos, lado = primera_mano(resultado)

        sena, confianza = None, 0.0
        if puntos is not None:
            sena, confianza = predecir(modelo, caracteristicas(puntos, lado))
        estable = escritor.actualizar(sena if confianza >= CONFIANZA_MINIMA else None, ahora)

        manos.dibujar_manos(frame, resultado)
        if puntos is not None:
            etiqueta = estable or "?"
            cv2.putText(frame, f"{etiqueta}  ({confianza:.0%})", (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 1.6, (0, 255, 255), 3)
            progreso = escritor.progreso(ahora)
            if progreso > 0:
                cv2.rectangle(frame, (10, 75), (10 + int(200 * progreso), 90), (0, 255, 255), -1)
        cv2.rectangle(frame, (0, alto - 60), (ancho, alto), (0, 0, 0), -1)
        cv2.putText(frame, escritor.texto[-35:] + "_", (10, alto - 20), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (255, 255, 255), 2)

        cv2.imshow("Paso 14 - Traductor de senas", frame)
        tecla = cv2.waitKey(1) & 0xFF
        if tecla == ord("q"):
            break
        if tecla == ord(" "):
            escritor.texto += " "
        if tecla == ord("b"):
            escritor.texto = escritor.texto[:-1]
        if tecla == ord("c"):
            escritor.texto = ""

    cap.release()
    cv2.destroyAllWindows()
    detector.close()


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "grabar":
        grabar(sys.argv[2])
    elif len(sys.argv) == 2 and sys.argv[1] == "entrenar":
        informe()
    elif len(sys.argv) == 1:
        traducir()
    else:
        print("Uso:\n  python paso14_senas.py grabar A\n  python paso14_senas.py entrenar\n  python paso14_senas.py")
