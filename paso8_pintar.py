# Paso 8: pintar en el aire con el dedo indice.
# - Solo el indice levantado          -> pintas. Si lo subes a la barra de arriba (por encima de
#                                         la linea gris) eliges color, goma o "Limpiar".
# - Indice + corazon levantados (V)   -> mover el dedo sin pintar (y tambien elegir en la barra).
# - Mano abierta un momento           -> borra todo.
# Teclas: "q" salir, "c" borrar, "s" guardar el dibujo como PNG, "f" fondo negro on/off.
import time

import cv2
import numpy as np

import paso5_dedos as dedos
import paso7_gestos as gestos
import plataforma

# Barra de colores (BGR). "Goma" borra lo pintado.
PALETA = [
    ("Cian", (255, 255, 0)),
    ("Rosa", (255, 0, 255)),
    ("Verde", (0, 255, 0)),
    ("Naranja", (0, 165, 255)),
    ("Blanco", (255, 255, 255)),
    ("Goma", (0, 0, 0)),
    ("Limpiar", None),   # no es un color: mantener el dedo encima borra todo
]
ALTO_BARRA = 90
# La seleccion funciona por debajo de la barra tambien: con la punta del dedo tan arriba
# MediaPipe suele perder la mano (se sale de la imagen), asi que no hace falta llegar a tocarla.
ZONA_SELECCION = 160
GROSOR_PINCEL = 8
GROSOR_GOMA = 50
# Suavizado adaptativo: mucho cuando el dedo va lento (quita el temblor) y poco cuando va
# rapido (asi no se queda atras al hacer un movimiento grande, como subir a la barra).
SUAVIZADO_LENTO = 0.6
SUAVIZADO_RAPIDO = 0.1
VELOCIDAD_RAPIDA = 25     # pixeles por frame a partir de los que se considera "rapido"
SEGUNDOS_PARA_BORRAR = 0.6
SEGUNDOS_LIMPIAR = 0.4    # tiempo con el dedo sobre "Limpiar"
TOLERANCIA_PERDIDA = 0.3  # si la mano abierta desaparece menos que esto, no se reinicia la cuenta


class Pizarra:
    def __init__(self, ancho, alto):
        self.lienzo = np.zeros((alto, ancho, 3), dtype=np.uint8)  # aqui se guarda lo pintado
        self.color = 0                 # indice en PALETA
        self.anterior = {}             # ultimo punto de cada mano, para unir con una linea
        self.palma_desde = None        # cuando empezo a verse la mano abierta
        self.palma_vista = 0.0         # ultima vez que se vio la mano abierta
        self.limpiar_desde = None      # cuando empezo el dedo a estar sobre "Limpiar"
        self.encima = None             # casilla de la barra sobre la que esta el dedo
        self.levantado = set()         # manos que vienen de la barra (no unir con una linea)
        self.modo = {}                 # que esta haciendo cada mano (para dibujar el cursor)

    def borrar(self):
        self.lienzo[:] = 0

    def actualizar(self, resultado, ahora):
        alto, ancho = self.lienzo.shape[:2]
        vistas = set()
        hay_palma = False
        sobre_limpiar = False
        self.encima = None

        for i, puntos in enumerate(resultado.hand_landmarks):
            lado = resultado.handedness[i][0].category_name
            vistas.add(lado)
            p, indice, corazon, anular, menique = dedos.dedos_levantados(puntos, resultado.hand_world_landmarks[i])
            gesto = gestos.nombre_gesto(resultado, i)
            palma = gesto == "Mano abierta" or all((p, indice, corazon, anular, menique))
            # Para la V basta con indice y corazon arriba y que anular y menique no esten los dos
            # arriba (a veces el anular se queda medio levantado). El gesto "Victoria" tambien vale.
            seleccion = not palma and (gesto == "Victoria" or (indice and corazon and not (anular and menique)))
            pintar = not palma and not seleccion and (gesto == "Apuntar arriba" or (indice and not corazon))
            hay_palma = hay_palma or palma

            # Punta del indice en pixeles, con suavizado adaptativo
            x, y = puntos[8].x * ancho, puntos[8].y * alto
            if lado in self.anterior:
                px, py = self.anterior[lado]
                rapido = ((x - px) ** 2 + (y - py) ** 2) ** 0.5 > VELOCIDAD_RAPIDA
                s = SUAVIZADO_RAPIDO if rapido else SUAVIZADO_LENTO
                x = px * s + x * (1 - s)
                y = py * s + y * (1 - s)

            if (seleccion or pintar) and y < ZONA_SELECCION:
                # Dedo en la zona de la barra (con uno o con dos dedos): elegimos la casilla segun
                # la X del dedo, al momento. Aqui arriba nunca se pinta.
                self.modo[lado] = "seleccion"
                casilla = min(max(int(x / (ancho / len(PALETA))), 0), len(PALETA) - 1)
                self.encima = casilla
                if PALETA[casilla][0] == "Limpiar":
                    sobre_limpiar = True
                else:
                    self.color = casilla
                # Pincel levantado: al bajar de la barra la linea empieza donde estes, sin un
                # trazo desde la barra hasta el dibujo
                self.levantado.add(lado)
                self.anterior[lado] = (x, y)
            elif seleccion:
                # V fuera de la barra: mover el dedo sin pintar
                self.modo[lado] = "seleccion"
                self.levantado.add(lado)
                self.anterior[lado] = (x, y)
            elif pintar:
                # Modo pintar: linea desde el punto anterior hasta el actual
                self.modo[lado] = "pintar"
                if lado in self.anterior and lado not in self.levantado:
                    nombre, color = PALETA[self.color]
                    grosor = GROSOR_GOMA if nombre == "Goma" else GROSOR_PINCEL
                    px, py = self.anterior[lado]
                    cv2.line(self.lienzo, (int(px), int(py)), (int(x), int(y)), color, grosor, cv2.LINE_AA)
                self.levantado.discard(lado)
                self.anterior[lado] = (x, y)
            else:
                # Cualquier otra postura levanta el pincel
                self.modo[lado] = "nada"
                self.anterior.pop(lado, None)

        # Olvidamos las manos que ya no se ven, para no unir con una linea al volver
        for lado in list(self.anterior):
            if lado not in vistas:
                del self.anterior[lado]
                self.modo.pop(lado, None)

        # Dedo sobre "Limpiar" un momento = borrar todo
        if sobre_limpiar:
            if self.limpiar_desde is None:
                self.limpiar_desde = ahora
            elif ahora - self.limpiar_desde >= SEGUNDOS_LIMPIAR:
                self.borrar()
                self.limpiar_desde = None
        else:
            self.limpiar_desde = None

        # Mano abierta mantenida = borrar todo. Si MediaPipe pierde la mano un instante,
        # no reiniciamos la cuenta (antes habia que empezar de cero y parecia que tardaba).
        if hay_palma:
            self.palma_vista = ahora
            if self.palma_desde is None:
                self.palma_desde = ahora
            elif ahora - self.palma_desde >= SEGUNDOS_PARA_BORRAR:
                self.borrar()
                self.palma_desde = None
                self.palma_vista = 0.0
        elif self.palma_desde is not None and ahora - self.palma_vista > TOLERANCIA_PERDIDA:
            self.palma_desde = None

    def progreso_borrado(self, ahora):
        # Progreso (0 a 1) del borrado, ya sea con la mano abierta o con "Limpiar"
        progreso = 0.0
        if self.palma_desde is not None:
            progreso = (ahora - self.palma_desde) / SEGUNDOS_PARA_BORRAR
        if self.limpiar_desde is not None:
            progreso = max(progreso, (ahora - self.limpiar_desde) / SEGUNDOS_LIMPIAR)
        return min(progreso, 1.0)

    def componer(self, fondo):
        # Igual que las particulas: lo pintado + su version desenfocada = efecto neon
        brillo = cv2.GaussianBlur(self.lienzo, (0, 0), 8)
        return cv2.add(cv2.add(fondo, self.lienzo), brillo)

    def dibujar_interfaz(self, frame, ahora):
        alto, ancho = frame.shape[:2]
        ancho_caja = ancho / len(PALETA)
        for i, (nombre, color) in enumerate(PALETA):
            x1, x2 = int(i * ancho_caja), int((i + 1) * ancho_caja)
            relleno = {"Goma": (60, 60, 60), "Limpiar": (0, 0, 140)}.get(nombre, color)
            # La casilla bajo el dedo se dibuja mas grande, para que se vea al momento que la apuntas
            extra = 12 if i == self.encima else 0
            cv2.rectangle(frame, (x1 + 4, 4), (x2 - 4, ALTO_BARRA - 4 + extra), relleno, -1)
            if i == self.color:
                cv2.rectangle(frame, (x1 + 2, 2), (x2 - 2, ALTO_BARRA - 2 + extra), (255, 255, 255), 3)
            texto_oscuro = nombre not in ("Goma", "Limpiar")
            cv2.putText(frame, nombre, (x1 + 8, ALTO_BARRA - 20 + extra),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0) if texto_oscuro else (255, 255, 255), 2)
        # Linea tenue que marca hasta donde llega la zona de seleccion
        cv2.line(frame, (0, ZONA_SELECCION), (ancho, ZONA_SELECCION), (90, 90, 90), 1)

        # Cursor en la punta del indice: relleno al pintar, hueco al seleccionar
        nombre, color = PALETA[self.color]
        for lado, (x, y) in self.anterior.items():
            if self.modo.get(lado) == "pintar":
                radio = GROSOR_GOMA // 2 if nombre == "Goma" else GROSOR_PINCEL
                cv2.circle(frame, (int(x), int(y)), radio, (200, 200, 200) if nombre == "Goma" else color, -1)
            else:
                cv2.circle(frame, (int(x), int(y)), 12, (255, 255, 255), 2)

        # Barra de progreso del borrado con la mano abierta
        progreso = self.progreso_borrado(ahora)
        if progreso > 0:
            cv2.putText(frame, "Borrando...", (10, alto - 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
            cv2.rectangle(frame, (10, alto - 30), (10 + int(200 * progreso), alto - 15), (0, 0, 255), -1)


def main():
    gestos.descargar_modelo()
    detector = gestos.crear_detector()

    cap = plataforma.abrir_camara(0)
    if not cap.isOpened():
        print("ERROR: no se pudo abrir la camara. Prueba a cambiar el 0 por 1.")
        raise SystemExit(1)

    pizarra = None
    ver_camara = True
    inicio = time.monotonic()
    print("Indice = pintar | Indice+corazon = elegir color arriba | Mano abierta 1 s = borrar")
    print("Teclas: q salir | c borrar | s guardar PNG | f fondo negro")

    while True:
        ok, frame = cap.read()
        if not ok:
            print("ERROR: la camara no devolvio imagen.")
            break
        frame = cv2.flip(frame, 1)
        if pizarra is None:
            pizarra = Pizarra(frame.shape[1], frame.shape[0])

        ahora = time.monotonic()
        resultado = gestos.detectar(detector, frame, int((ahora - inicio) * 1000))
        pizarra.actualizar(resultado, ahora)

        fondo = (frame // 2) if ver_camara else np.zeros_like(frame)
        salida = pizarra.componer(fondo)
        pizarra.dibujar_interfaz(salida, ahora)

        cv2.imshow("Paso 8 - Pintar en el aire", salida)
        tecla = cv2.waitKey(1) & 0xFF
        if tecla == ord("q"):
            break
        if tecla == ord("c"):
            pizarra.borrar()
        if tecla == ord("f"):
            ver_camara = not ver_camara
        if tecla == ord("s"):
            nombre = time.strftime("dibujo_%Y%m%d_%H%M%S.png")
            cv2.imwrite(nombre, pizarra.componer(np.zeros_like(frame)))
            print(f"Dibujo guardado en {nombre}")

    cap.release()
    cv2.destroyAllWindows()
    detector.close()


if __name__ == "__main__":
    main()
