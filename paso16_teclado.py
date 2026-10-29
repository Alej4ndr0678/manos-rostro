# Paso 16: teclado virtual en el aire.
#
# En pantalla aparece un teclado encima de la imagen de la camara:
# - Apuntar: la punta del dedo indice (punto 8) es el cursor.
# - Pulsar: junta la punta del pulgar con la del dedo corazon (asi el indice no se mueve
#   al pulsar y no te equivocas de tecla).
# - Modo "mirar" (tecla m): en vez de pellizcar, deja el dedo quieto 0.8 s sobre una tecla.
# - Arriba salen 3 sugerencias de palabras: pulsalas para completar la palabra.
#
# Teclas del teclado de verdad (con la ventana de la camara seleccionada):
#   m = cambiar entre pellizco y mirar, e = escribir tambien en la ventana activa (pyautogui),
#   q = salir.
# Con "e" activado, lo que escribas en el aire le llega a la ventana que tenga el foco
# (un bloc de notas, el navegador...). Haz clic en ella despues de activarlo.
import math
import time

import cv2

import paso2_manos as manos
import plataforma

FILAS = ["1234567890", "QWERTYUIOP", "ASDFGHJKLÑ", "ZXCVBNM,.?"]
ESPECIALES = [("MAYUS", 2), ("ESPACIO", 5), ("BORRAR", 2), ("ENTER", 1)]   # (tecla, anchura en teclas)

# Zona del teclado dentro de la imagen (fracciones de 0 a 1)
IZQUIERDA, DERECHA = 0.05, 0.95
ARRIBA, ABAJO = 0.30, 0.95
SEPARACION = 0.006

UMBRAL_PELLIZCO = 0.30     # distancia pulgar-corazon / tamano de la mano para pulsar
UMBRAL_SOLTAR = 0.42       # histeresis: hay que separar mas para poder volver a pulsar
SEGUNDOS_MIRAR = 0.8       # modo mirar: tiempo quieto sobre la tecla
SUAVIZADO = 0.5            # suaviza el cursor (0 = nada)

# Palabras frecuentes para las sugerencias (se anaden tambien las que vayas escribiendo)
PALABRAS = """
de la que el en y a los se del las un por con no una su para es al lo como mas pero sus le ya
o este si porque esta entre cuando muy sin sobre tambien me hasta hay donde quien desde todo
nos durante todos uno les ni contra otros ese eso ante ellos e esto mi antes algunos que unos
yo otro otras otra el tanto esa estos mucho quienes nada muchos cual poco ella estar estas
algunas algo nosotros hola adios gracias bien buenos dias noches tardes amigo amiga casa
tiempo vida trabajo mundo bro clase escuela proyecto codigo python camara mano manos rostro
gesto teclado aire prueba bueno malo grande pequeno hoy manana ayer ahora siempre nunca
quiero puedo tengo hacer hago vamos ver voy estoy soy eres somos fue hola que tal como estas
""".split()


def distancia(a, b):
    return math.hypot(a.x - b.x, a.y - b.y)


def crear_teclas():
    # Devuelve una lista de (etiqueta, x1, y1, x2, y2) en fracciones de la imagen.
    # La primera fila esta reservada para las 3 sugerencias (etiquetas "SUG0", "SUG1", "SUG2").
    filas = len(FILAS) + 2
    alto_fila = (ABAJO - ARRIBA) / filas
    ancho_total = DERECHA - IZQUIERDA
    teclas = []

    def anadir(etiqueta, x1, fila, ancho):
        y1 = ARRIBA + fila * alto_fila
        teclas.append((etiqueta, x1 + SEPARACION, y1 + SEPARACION,
                       x1 + ancho - SEPARACION, y1 + alto_fila - SEPARACION))

    for i in range(3):
        anadir(f"SUG{i}", IZQUIERDA + i * ancho_total / 3, 0, ancho_total / 3)
    for f, fila in enumerate(FILAS, start=1):
        ancho = ancho_total / len(fila)
        for c, letra in enumerate(fila):
            anadir(letra, IZQUIERDA + c * ancho, f, ancho)
    unidades = sum(n for _, n in ESPECIALES)
    x = IZQUIERDA
    for etiqueta, n in ESPECIALES:
        anadir(etiqueta, x, len(FILAS) + 1, ancho_total * n / unidades)
        x += ancho_total * n / unidades
    return teclas


def tecla_en(teclas, x, y):
    for etiqueta, x1, y1, x2, y2 in teclas:
        if x1 <= x <= x2 and y1 <= y <= y2:
            return etiqueta
    return None


class Pulsador:
    # Decide cuando se "pulsa" una tecla: por pellizco (con histeresis) o mirando un rato.
    def __init__(self, modo="pellizco"):
        self.modo = modo
        self.pellizcando = False
        self.mirando = None       # tecla sobre la que esta el dedo (modo mirar)
        self.desde = None
        self.usada = False        # en modo mirar, ya se pulso esta tecla: hay que salir y volver

    def cambiar_modo(self):
        self.modo = "mirar" if self.modo == "pellizco" else "pellizco"
        self.mirando, self.desde, self.usada = None, None, False

    def actualizar(self, tecla, pinza, ahora):
        # tecla = la que esta bajo el dedo (o None), pinza = distancia pulgar-corazon normalizada
        # (o None si no hay mano). Devuelve la tecla pulsada en este frame, o None.
        if self.modo == "pellizco":
            if pinza is None:
                self.pellizcando = False
                return None
            if not self.pellizcando and pinza < UMBRAL_PELLIZCO:
                self.pellizcando = True
                return tecla
            if self.pellizcando and pinza > UMBRAL_SOLTAR:
                self.pellizcando = False
            return None

        # modo mirar
        if tecla != self.mirando:
            self.mirando, self.desde, self.usada = tecla, ahora, False
            return None
        if tecla is not None and not self.usada and ahora - self.desde >= SEGUNDOS_MIRAR:
            self.usada = True
            return tecla
        return None

    def progreso(self, ahora):
        if self.modo != "mirar" or self.mirando is None or self.usada:
            return 0.0
        return min((ahora - self.desde) / SEGUNDOS_MIRAR, 1.0)


class Texto:
    # El texto escrito, las mayusculas y las sugerencias de palabras
    def __init__(self, palabras=PALABRAS):
        self.texto = ""
        self.mayus = False
        self.vocabulario = {p: 0 for p in palabras}   # palabra -> veces que la has escrito

    def palabra_actual(self):
        partes = self.texto.split(" ")
        return partes[-1] if partes else ""

    def sugerencias(self, n=3):
        prefijo = self.palabra_actual().lower()
        if not prefijo:
            return []
        candidatas = [p for p in self.vocabulario if p.startswith(prefijo) and p != prefijo]
        # Primero las que mas has usado, luego las mas cortas, luego por orden alfabetico
        candidatas.sort(key=lambda p: (-self.vocabulario[p], len(p), p))
        return candidatas[:n]

    def aprender(self, palabra):
        palabra = palabra.lower().strip(",.?")
        if len(palabra) > 1:
            self.vocabulario[palabra] = self.vocabulario.get(palabra, 0) + 1

    def pulsar(self, tecla, sugerencias=()):
        # Aplica una tecla y devuelve lo que habria que teclear de verdad en el PC:
        # una lista de textos o de teclas especiales ("backspace", "enter").
        if tecla is None:
            return []
        if tecla.startswith("SUG"):
            i = int(tecla[3:])
            if i >= len(sugerencias):
                return []
            actual = self.palabra_actual()
            resto = sugerencias[i][len(actual):] + " "
            self.texto += resto
            self.aprender(sugerencias[i])
            return [resto]
        if tecla == "MAYUS":
            self.mayus = not self.mayus
            return []
        if tecla == "BORRAR":
            if not self.texto:
                return []
            self.texto = self.texto[:-1]
            return ["backspace"]
        if tecla == "ESPACIO":
            self.aprender(self.palabra_actual())
            self.texto += " "
            return [" "]
        if tecla == "ENTER":
            self.aprender(self.palabra_actual())
            self.texto += "\n"
            return ["enter"]
        letra = tecla if self.mayus else tecla.lower()
        self.mayus = False          # como en el movil: la mayuscula vale para una letra
        self.texto += letra
        return [letra]


def escribir_de_verdad(acciones):
    import pyautogui  # solo hace falta (y solo necesita pantalla) si se activa
    for accion in acciones:
        if accion in ("backspace", "enter"):
            pyautogui.press(accion)
        else:
            pyautogui.write(accion)


def dibujar_teclado(frame, teclas, sugerencias, encima, pulsada, mayus):
    alto, ancho = frame.shape[:2]
    capa = frame.copy()
    for etiqueta, x1, y1, x2, y2 in teclas:
        p1, p2 = (int(x1 * ancho), int(y1 * alto)), (int(x2 * ancho), int(y2 * alto))
        color = (60, 60, 60)
        if etiqueta == pulsada:
            color = (0, 200, 0)
        elif etiqueta == encima:
            color = (200, 120, 0)
        elif etiqueta == "MAYUS" and mayus:
            color = (0, 140, 200)
        cv2.rectangle(capa, p1, p2, color, -1)
    cv2.addWeighted(capa, 0.6, frame, 0.4, 0, frame)   # teclas semitransparentes
    for etiqueta, x1, y1, x2, y2 in teclas:
        texto = etiqueta
        if etiqueta.startswith("SUG"):
            i = int(etiqueta[3:])
            texto = sugerencias[i] if i < len(sugerencias) else ""
        elif len(etiqueta) == 1 and not mayus:
            texto = etiqueta.lower()
        if not texto:
            continue
        escala = 0.8 if len(texto) == 1 else 0.55
        (w, h), _ = cv2.getTextSize(texto, cv2.FONT_HERSHEY_SIMPLEX, escala, 2)
        cx = int((x1 + x2) / 2 * ancho) - w // 2
        cy = int((y1 + y2) / 2 * alto) + h // 2
        cv2.putText(frame, texto.replace("Ñ", "N~").replace("ñ", "n~") if len(texto) == 1 else texto,
                    (cx, cy), cv2.FONT_HERSHEY_SIMPLEX, escala, (255, 255, 255), 2)


def main():
    manos.descargar_modelo()
    detector = manos.crear_detector()
    cap = plataforma.abrir_camara(0)
    if not cap.isOpened():
        print("ERROR: no se pudo abrir la camara. Prueba a cambiar el 0 por 1.")
        raise SystemExit(1)
    # Mas resolucion = teclas mas grandes en pantalla
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    teclas = crear_teclas()
    pulsador = Pulsador()
    texto = Texto()
    de_verdad = False
    cursor = None
    pulsada, pulsada_hasta = None, 0.0
    inicio = time.monotonic()
    print("Apunta con el indice y junta pulgar + corazon para pulsar.")
    print("Teclas: m pellizco/mirar | e escribir en la ventana activa | q salir")

    while True:
        ok, frame = cap.read()
        if not ok:
            print("ERROR: la camara no devolvio imagen.")
            break
        frame = cv2.flip(frame, 1)
        alto, ancho = frame.shape[:2]
        ahora = time.monotonic()
        resultado = manos.detectar(detector, frame, int((ahora - inicio) * 1000))

        encima, pinza = None, None
        if resultado.hand_landmarks:
            puntos = resultado.hand_landmarks[0]
            punta = puntos[8]
            if cursor is None:
                cursor = (punta.x, punta.y)
            cursor = (cursor[0] * SUAVIZADO + punta.x * (1 - SUAVIZADO),
                      cursor[1] * SUAVIZADO + punta.y * (1 - SUAVIZADO))
            encima = tecla_en(teclas, *cursor)
            pinza = distancia(puntos[4], puntos[12]) / (distancia(puntos[0], puntos[9]) or 1e-6)
        else:
            cursor = None

        sugerencias = texto.sugerencias()
        tecla = pulsador.actualizar(encima, pinza, ahora)
        if tecla:
            acciones = texto.pulsar(tecla, sugerencias)
            if acciones:
                pulsada, pulsada_hasta = tecla, ahora + 0.25
                if de_verdad:
                    escribir_de_verdad(acciones)
            sugerencias = texto.sugerencias()

        # Caja con el texto escrito (la ultima linea), luego el teclado y el cursor encima de todo
        cv2.rectangle(frame, (0, 0), (ancho, int(0.2 * alto)), (0, 0, 0), -1)
        linea = texto.texto.split("\n")[-1][-45:]
        cv2.putText(frame, linea + "_", (15, int(0.2 * alto) - 25), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 255), 2)
        estado = f"Modo: {pulsador.modo}" + ("  |  escribiendo en el PC" if de_verdad else "")
        cv2.putText(frame, estado, (15, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        dibujar_teclado(frame, teclas, sugerencias, encima, pulsada if ahora < pulsada_hasta else None, texto.mayus)
        if cursor is not None:
            c = (int(cursor[0] * ancho), int(cursor[1] * alto))
            cv2.circle(frame, c, 10, (0, 255, 255), -1)
            progreso = pulsador.progreso(ahora)
            if progreso > 0:
                cv2.ellipse(frame, c, (22, 22), -90, 0, int(360 * progreso), (0, 255, 255), 3)

        cv2.imshow("Paso 16 - Teclado en el aire", frame)
        k = cv2.waitKey(1) & 0xFF
        if k == ord("q"):
            break
        if k == ord("m"):
            pulsador.cambiar_modo()
        if k == ord("e"):
            de_verdad = not de_verdad
            if de_verdad:
                aviso = plataforma.aviso_raton()
                if aviso:
                    print("AVISO:", aviso)

    cap.release()
    cv2.destroyAllWindows()
    detector.close()
    print("Texto escrito:")
    print(texto.texto)


if __name__ == "__main__":
    main()
