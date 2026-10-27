# Paso 8: pintar en el aire con el dedo indice.
# - Solo el indice levantado          -> pintas.
# - Indice + corazon levantados (V)   -> modo seleccion: no pinta; pasa por la barra de arriba
#                                         para elegir color o la goma.
# - Mano abierta durante 1 segundo    -> borra todo.
# Teclas: "q" salir, "c" borrar, "s" guardar el dibujo como PNG, "f" fondo negro on/off.
import time

import cv2
import numpy as np

import paso5_dedos as dedos
import paso7_gestos as gestos

# Barra de colores (BGR). "Goma" borra lo pintado.
PALETA = [
    ("Cian", (255, 255, 0)),
    ("Rosa", (255, 0, 255)),
    ("Verde", (0, 255, 0)),
    ("Naranja", (0, 165, 255)),
    ("Blanco", (255, 255, 255)),
    ("Goma", (0, 0, 0)),
]
ALTO_BARRA = 70
GROSOR_PINCEL = 8
GROSOR_GOMA = 50
SUAVIZADO = 0.5          # 0 = sin suavizar, cerca de 1 = muy suave pero con retraso
SEGUNDOS_PARA_BORRAR = 1.0


class Pizarra:
    def __init__(self, ancho, alto):
        self.lienzo = np.zeros((alto, ancho, 3), dtype=np.uint8)  # aqui se guarda lo pintado
        self.color = 0                 # indice en PALETA
        self.anterior = {}             # ultimo punto de cada mano, para unir con una linea
        self.palma_desde = None        # cuando empezo a verse la mano abierta
        self.modo = {}                 # que esta haciendo cada mano (para dibujar el cursor)

    def borrar(self):
        self.lienzo[:] = 0

    def actualizar(self, resultado, ahora):
        alto, ancho = self.lienzo.shape[:2]
        vistas = set()
        hay_palma = False

        for i, puntos in enumerate(resultado.hand_landmarks):
            lado = resultado.handedness[i][0].category_name
            vistas.add(lado)
            p, indice, corazon, anular, menique = dedos.dedos_levantados(puntos, resultado.hand_world_landmarks[i])
            if gestos.nombre_gesto(resultado, i) == "Mano abierta" or all((p, indice, corazon, anular, menique)):
                hay_palma = True

            # Punta del indice en pixeles, suavizada con la posicion anterior (quita el temblor)
            x, y = puntos[8].x * ancho, puntos[8].y * alto
            if lado in self.anterior:
                px, py = self.anterior[lado]
                x = px * SUAVIZADO + x * (1 - SUAVIZADO)
                y = py * SUAVIZADO + y * (1 - SUAVIZADO)

            if indice and corazon and not anular and not menique:
                # Modo seleccion: si el dedo esta sobre la barra, cambia de color
                self.modo[lado] = "seleccion"
                if y < ALTO_BARRA:
                    self.color = min(int(x / (ancho / len(PALETA))), len(PALETA) - 1)
                self.anterior[lado] = (x, y)
            elif indice and not corazon and not anular and not menique:
                # Modo pintar: linea desde el punto anterior hasta el actual
                self.modo[lado] = "pintar"
                if lado in self.anterior and y > ALTO_BARRA:
                    nombre, color = PALETA[self.color]
                    grosor = GROSOR_GOMA if nombre == "Goma" else GROSOR_PINCEL
                    px, py = self.anterior[lado]
                    cv2.line(self.lienzo, (int(px), int(py)), (int(x), int(y)), color, grosor, cv2.LINE_AA)
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

        # Mano abierta mantenida = borrar todo
        if hay_palma:
            if self.palma_desde is None:
                self.palma_desde = ahora
            elif ahora - self.palma_desde >= SEGUNDOS_PARA_BORRAR:
                self.borrar()
                self.palma_desde = None
        else:
            self.palma_desde = None

    def progreso_borrado(self, ahora):
        if self.palma_desde is None:
            return 0.0
        return min((ahora - self.palma_desde) / SEGUNDOS_PARA_BORRAR, 1.0)

    def componer(self, fondo):
        # Igual que las particulas: lo pintado + su version desenfocada = efecto neon
        brillo = cv2.GaussianBlur(self.lienzo, (0, 0), 8)
        return cv2.add(cv2.add(fondo, self.lienzo), brillo)

    def dibujar_interfaz(self, frame, ahora):
        alto, ancho = frame.shape[:2]
        ancho_caja = ancho / len(PALETA)
        for i, (nombre, color) in enumerate(PALETA):
            x1, x2 = int(i * ancho_caja), int((i + 1) * ancho_caja)
            relleno = (60, 60, 60) if nombre == "Goma" else color
            cv2.rectangle(frame, (x1 + 4, 4), (x2 - 4, ALTO_BARRA - 4), relleno, -1)
            if i == self.color:
                cv2.rectangle(frame, (x1 + 2, 2), (x2 - 2, ALTO_BARRA - 2), (255, 255, 255), 3)
            cv2.putText(frame, nombre, (x1 + 10, ALTO_BARRA - 20),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0) if nombre != "Goma" else (255, 255, 255), 2)

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

    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
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
