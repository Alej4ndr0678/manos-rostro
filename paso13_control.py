# Paso 13: controlar el PC con gestos (musica, volumen y diapositivas).
#
# Gestos (los reconoce el modelo de gestos del paso 7):
#   Pulgar arriba (mantener)        -> subir volumen (repite mientras lo mantienes)
#   Pulgar abajo (mantener)         -> bajar volumen
#   "Te quiero" (mantener)          -> silenciar / quitar silencio
#   Puno (mantener)                 -> play / pausa                (modo musica)
#   Mano abierta deslizando a la izquierda -> siguiente cancion / diapositiva
#   Mano abierta deslizando a la derecha   -> anterior
#   (como pasar paginas en el movil)
#
# Teclas (con la ventana de la camara seleccionada): "m" cambia de modo musica <-> diapositivas,
# "p" pausa el control, "q" salir.
#
# OJO con las diapositivas: las flechas le llegan a la ventana que este activa. Despues de abrir
# esto, haz clic en la presentacion (PowerPoint, Google Slides, un PDF...) para que la reciba ella
# y no la ventana de la camara. Las teclas multimedia (volumen, musica) funcionan siempre.
import time
from collections import deque

import cv2

import paso2_manos as manos
import paso7_gestos as gestos
import plataforma

SEGUNDOS_MANTENER = 0.5      # cuanto mantener un gesto para que cuente (evita disparos sin querer)
REPETIR_VOLUMEN = 0.15       # con el pulgar mantenido, un paso de volumen cada X segundos
VENTANA_DESLIZ = 0.35        # segundos en los que se mira el movimiento de la mano
DISTANCIA_DESLIZ = 0.22      # cuanto tiene que recorrer la mano (fraccion del ancho de la imagen)
ESPERA_DESLIZ = 0.8          # tras un deslizamiento, ignorar otros durante este tiempo

# Que tecla pulsa cada accion en cada modo
ACCIONES = {
    "musica": {"siguiente": "nexttrack", "anterior": "prevtrack", "pausa": "playpause"},
    "diapositivas": {"siguiente": "right", "anterior": "left", "pausa": None},
}
COMUNES = {"subir": "volumeup", "bajar": "volumedown", "silencio": "volumemute"}
NOMBRES = {"siguiente": "Siguiente >>", "anterior": "<< Anterior", "pausa": "Play / Pausa",
           "subir": "Volumen +", "bajar": "Volumen -", "silencio": "Silencio"}
# Gesto mantenido -> accion. "repite" = se repite mientras se mantiene (volumen)
GESTOS_MANTENIDOS = {
    "Pulgar arriba": ("subir", True),
    "Pulgar abajo": ("bajar", True),
    "Te quiero": ("silencio", False),
    "Puno": ("pausa", False),
}


class ControlGestos:
    def __init__(self, pulsar=plataforma.pulsar_tecla):
        self.pulsar = pulsar           # se puede cambiar por otra funcion (util para pruebas)
        self.modo = "musica"
        self.gesto = None              # gesto que se esta manteniendo
        self.desde = None              # desde cuando
        self.ultima_repeticion = 0.0
        self.disparado = False         # ya se hizo la accion de este gesto (las que no repiten)
        self.recorrido = deque()       # (tiempo, x) de la mano abierta, para los deslizamientos
        self.espera_hasta = 0.0
        self.ultima_accion = None      # (nombre, cuando), para mostrarla en pantalla

    def cambiar_modo(self):
        self.modo = "diapositivas" if self.modo == "musica" else "musica"

    def hacer(self, accion, ahora):
        tecla = COMUNES.get(accion) or ACCIONES[self.modo].get(accion)
        if tecla is None:
            return None
        self.pulsar(tecla)
        self.ultima_accion = (accion, ahora)
        return accion

    def actualizar(self, gesto, x, ahora):
        # gesto = nombre del gesto (o None), x = posicion horizontal de la palma de 0 a 1
        # (o None si no hay mano). Devuelve la accion hecha en este frame, o None.
        if x is None:
            self.gesto = self.desde = None
            self.recorrido.clear()
            return None

        # 1) Deslizar con la mano abierta
        if gesto == "Mano abierta":
            self.recorrido.append((ahora, x))
            while self.recorrido and ahora - self.recorrido[0][0] > VENTANA_DESLIZ:
                self.recorrido.popleft()
            movimiento = x - self.recorrido[0][1]
            if ahora >= self.espera_hasta and abs(movimiento) >= DISTANCIA_DESLIZ:
                self.recorrido.clear()
                self.espera_hasta = ahora + ESPERA_DESLIZ
                # La imagen esta en modo espejo: x baja = la mano va hacia TU izquierda
                return self.hacer("siguiente" if movimiento < 0 else "anterior", ahora)
        else:
            self.recorrido.clear()

        # 2) Gestos que hay que mantener un momento
        if gesto != self.gesto:
            self.gesto, self.desde, self.disparado = gesto, ahora, False
            return None
        if gesto not in GESTOS_MANTENIDOS or ahora - self.desde < SEGUNDOS_MANTENER:
            return None
        accion, repite = GESTOS_MANTENIDOS[gesto]
        if repite:
            if ahora - self.ultima_repeticion >= REPETIR_VOLUMEN:
                self.ultima_repeticion = ahora
                return self.hacer(accion, ahora)
        elif not self.disparado:
            self.disparado = True
            return self.hacer(accion, ahora)
        return None


def main():
    gestos.descargar_modelo()
    detector = gestos.crear_detector()
    cap = plataforma.abrir_camara(0)
    if not cap.isOpened():
        print("ERROR: no se pudo abrir la camara. Prueba a cambiar el 0 por 1.")
        raise SystemExit(1)
    aviso = plataforma.aviso_raton()
    if aviso:
        print("AVISO:", aviso)

    control = ControlGestos()
    activo = True
    inicio = time.monotonic()
    print("Teclas: m modo musica/diapositivas | p pausar | q salir")
    print("Para las diapositivas, haz clic en la presentacion despues de abrir esto.")

    while True:
        ok, frame = cap.read()
        if not ok:
            print("ERROR: la camara no devolvio imagen.")
            break
        frame = cv2.flip(frame, 1)
        alto, ancho = frame.shape[:2]
        ahora = time.monotonic()
        resultado = gestos.detectar(detector, frame, int((ahora - inicio) * 1000))

        gesto, x = None, None
        if resultado.hand_landmarks:
            gesto = gestos.nombre_gesto(resultado, 0)
            x = resultado.hand_landmarks[0][9].x   # centro de la palma
        if activo:
            control.actualizar(gesto, x, ahora)

        manos.dibujar_manos(frame, resultado)
        gestos.dibujar_gestos(frame, resultado)
        estado = f"Modo: {control.modo.upper()}" if activo else "PAUSADO (p para reanudar)"
        cv2.putText(frame, estado, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8,
                    (0, 255, 0) if activo else (0, 0, 255), 2)
        # La ultima accion se ve en grande durante 1 segundo
        if control.ultima_accion and ahora - control.ultima_accion[1] < 1.0:
            texto = NOMBRES[control.ultima_accion[0]]
            (w, _), _ = cv2.getTextSize(texto, cv2.FONT_HERSHEY_SIMPLEX, 1.5, 3)
            cv2.putText(frame, texto, ((ancho - w) // 2, alto // 2), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 0, 0), 8)
            cv2.putText(frame, texto, ((ancho - w) // 2, alto // 2), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 255, 255), 3)
        # Progreso del gesto mantenido
        if control.gesto in GESTOS_MANTENIDOS and control.desde is not None:
            progreso = min((ahora - control.desde) / SEGUNDOS_MANTENER, 1.0)
            cv2.rectangle(frame, (10, alto - 30), (10 + int(200 * progreso), alto - 15), (0, 255, 255), -1)

        cv2.imshow("Paso 13 - Control por gestos", frame)
        tecla = cv2.waitKey(1) & 0xFF
        if tecla == ord("q"):
            break
        if tecla == ord("m"):
            control.cambiar_modo()
        if tecla == ord("p"):
            activo = not activo

    cap.release()
    cv2.destroyAllWindows()
    detector.close()


if __name__ == "__main__":
    main()
