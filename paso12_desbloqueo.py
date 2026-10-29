# Paso 12: desbloqueo biometrico con prueba de vida y PIN de dedos.
#
# El paso 11 reconoce QUIEN eres, pero se engana ensenandole una foto tuya en el movil.
# Aqui para "entrar" hay que superar tres pruebas seguidas:
#   1) CARA:  la camara te reconoce (como en el paso 11).
#   2) VIDA:  haces un reto AL AZAR, por ejemplo "parpadea 2 veces y gira la cabeza a la derecha".
#             Una foto no parpadea ni gira la cabeza, y un video grabado antes no sabe que reto
#             va a tocar. Esto se llama "deteccion de vida" (liveness) o anti-spoofing.
#   3) PIN:   ensenas con los dedos un PIN secreto de 4 cifras (del 1 al 5). Algo que eres (cara)
#             + algo que sabes (PIN) = dos factores.
# Ademas, como un sistema de acceso real:
#   - El PIN no se guarda tal cual, sino su "hash" con sal (PBKDF2), como las contrasenas.
#   - Tras 3 fallos seguidos se bloquea 30 segundos (frena los ataques de fuerza bruta).
#   - Cada intento queda apuntado en accesos.log (auditoria).
#
# Uso:
#   1) Registra tu cara (una vez):  python paso11_reconocer.py registrar TuNombre
#   2) Elige tu PIN (una vez):      python paso12_desbloqueo.py pin
#   3) Desbloquear:                 python paso12_desbloqueo.py
# Pulsa la tecla "q" para salir.
#
# Limites (para ser honestos): esto frena fotos y videos grabados, pero no una mascara 3D
# realista ni un "deepfake" en tiempo real. Los moviles usan camaras de profundidad o
# infrarrojos para eso. Es un proyecto para aprender, no para proteger nada importante.
import getpass
import hashlib
import hmac
import json
import os
import random
import sys
import time
import urllib.request
from dataclasses import dataclass
from typing import Optional

import cv2
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python import vision

import paso5_dedos as dedos
import paso7_gestos as gestos
import paso11_reconocer as reconocer

MODELO_MALLA = "face_landmarker.task"
URL_MALLA = ("https://storage.googleapis.com/mediapipe-models/face_landmarker/"
             "face_landmarker/float16/latest/face_landmarker.task")
ARCHIVO_PIN = os.path.join(reconocer.CARPETA_CARAS, "pin.json")
ARCHIVO_LOG = "accesos.log"

FRAMES_CARA = 8            # frames seguidos reconociendote antes de pasar a la prueba de vida
TOLERANCIA_CARA = 1.0      # segundos que puede desaparecer tu cara sin cancelar el intento
TIEMPO_VIDA = 12           # segundos para hacer el reto
TIEMPO_PIN = 25            # segundos para ensenar el PIN
LONGITUD_PIN = 4
SEGUNDOS_DIGITO = 1.0      # cuanto hay que mantener los dedos quietos para que cuente la cifra
MAX_INTENTOS = 3
SEGUNDOS_BLOQUEO = 30
SEGUNDOS_MENSAJE = 3       # cuanto se muestra "DENEGADO" antes de volver a empezar
ITERACIONES_HASH = 200_000

# Parpadeo: el modelo da un valor de 0 (ojo abierto) a 1 (cerrado). Dos umbrales (histeresis)
# para que un valor que oscila cerca del limite no cuente como varios parpadeos.
OJO_CERRADO = 0.55
OJO_ABIERTO = 0.35
# Giro de cabeza: posicion de la nariz entre las dos mejillas (0.5 = mirando de frente)
GIRO_IZQUIERDA = 0.35
GIRO_DERECHA = 0.65
NARIZ, MEJILLA_IZQ, MEJILLA_DER = 1, 234, 454


# ---------- PIN: guardar solo el hash, nunca el PIN ----------

def hash_pin(pin, sal):
    # PBKDF2 repite el hash muchas veces: probar las 625 combinaciones posibles sigue siendo
    # facil para un atacante con el archivo, pero la idea es la misma que con contrasenas reales.
    return hashlib.pbkdf2_hmac("sha256", pin.encode(), sal, ITERACIONES_HASH).hex()


def pin_valido(pin):
    return len(pin) == LONGITUD_PIN and all(c in "12345" for c in pin)


def guardar_pin(pin, ruta=None):
    ruta = ruta or ARCHIVO_PIN
    if not pin_valido(pin):
        raise ValueError(f"El PIN debe tener {LONGITUD_PIN} cifras del 1 al 5")
    sal = os.urandom(16)
    os.makedirs(os.path.dirname(ruta) or ".", exist_ok=True)
    with open(ruta, "w") as f:
        json.dump({"sal": sal.hex(), "hash": hash_pin(pin, sal)}, f)


def comprobar_pin(pin, ruta=None):
    with open(ruta or ARCHIVO_PIN) as f:
        datos = json.load(f)
    # compare_digest tarda lo mismo acierte o falle: no da pistas por el tiempo de respuesta
    return hmac.compare_digest(hash_pin(pin, bytes.fromhex(datos["sal"])), datos["hash"])


def registrar_acceso(resultado, motivo, nombre, ruta=None):
    with open(ruta or ARCHIVO_LOG, "a", encoding="utf-8") as f:
        f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')}  {resultado:9}  {nombre or '-':15}  {motivo}\n")


# ---------- Prueba de vida ----------

def generar_reto(rng=random):
    return {"parpadeos": rng.randint(1, 3), "giro": rng.choice(["izquierda", "derecha"])}


def texto_reto(reto):
    veces = "vez" if reto["parpadeos"] == 1 else "veces"
    return f"Parpadea {reto['parpadeos']} {veces} y gira la cabeza a la {reto['giro'].upper()}"


class ContadorParpadeos:
    def __init__(self):
        self.cerrado = False
        self.total = 0

    def actualizar(self, valor):
        # Un parpadeo = el ojo se cierra y luego se vuelve a abrir
        if not self.cerrado and valor > OJO_CERRADO:
            self.cerrado = True
        elif self.cerrado and valor < OJO_ABIERTO:
            self.cerrado = False
            self.total += 1


def giro_cabeza(puntos):
    # 0 = nariz pegada a la mejilla izquierda de la imagen, 1 = a la derecha, 0.5 = de frente
    izq, der = puntos[MEJILLA_IZQ].x, puntos[MEJILLA_DER].x
    return (puntos[NARIZ].x - izq) / max(der - izq, 1e-6)


def direccion_giro(valor):
    if valor < GIRO_IZQUIERDA:
        return "izquierda"
    if valor > GIRO_DERECHA:
        return "derecha"
    return None


# ---------- PIN con los dedos ----------

class LectorPin:
    # Cada cifra = numero de dedos levantados (1 a 5) mantenido SEGUNDOS_DIGITO.
    # Entre cifra y cifra hay que cerrar el puno o bajar la mano (asi se puede repetir, ej. 3-3).
    def __init__(self):
        self.cifras = ""
        self.candidata = None
        self.desde = None
        self.esperando_separador = False

    def actualizar(self, n_dedos, ahora):
        if n_dedos is None or n_dedos == 0:
            self.esperando_separador = False
            self.candidata = self.desde = None
            return
        if self.esperando_separador:
            return
        if n_dedos != self.candidata:
            self.candidata, self.desde = n_dedos, ahora
        elif ahora - self.desde >= SEGUNDOS_DIGITO:
            self.cifras += str(n_dedos)
            self.esperando_separador = True
            self.candidata = self.desde = None

    def progreso(self, ahora):
        if self.candidata is None or self.esperando_separador:
            return 0.0
        return min((ahora - self.desde) / SEGUNDOS_DIGITO, 1.0)


# ---------- La logica del desbloqueo, separada de la camara (asi se puede probar) ----------

@dataclass
class Observacion:
    caras: int = 0                       # cuantas caras se ven
    nombre: Optional[str] = None         # quien es (o "Desconocido")
    parpadeo: Optional[float] = None     # 0 a 1, solo en la fase de vida
    giro: Optional[float] = None         # 0 a 1, solo en la fase de vida
    dedos: Optional[int] = None          # dedos levantados, solo en la fase de PIN


class Desbloqueo:
    def __init__(self, comprobar=comprobar_pin, registrar=registrar_acceso, rng=random):
        self.comprobar = comprobar
        self.registrar = registrar
        self.rng = rng
        self.fallos = 0
        self.reiniciar()

    def reiniciar(self):
        self.estado = "cara"          # cara -> vida -> pin -> abierto  (o denegado / bloqueado)
        self.persona = None
        self.frames_cara = 0
        self.cara_vista = None        # ultima vez que se vio la cara correcta
        self.reto = None
        self.parpadeos = ContadorParpadeos()
        self.giro_hecho = False
        self.pin = LectorPin()
        self.limite = None
        self.hasta = None             # fin del mensaje de denegado o del bloqueo
        self.motivo = ""

    def fallar(self, motivo, ahora):
        self.fallos += 1
        self.registrar("DENEGADO", motivo, self.persona)
        self.motivo = motivo
        if self.fallos >= MAX_INTENTOS:
            self.estado = "bloqueado"
            self.hasta = ahora + SEGUNDOS_BLOQUEO
            self.registrar("BLOQUEO", f"{self.fallos} fallos seguidos", self.persona)
        else:
            self.estado = "denegado"
            self.hasta = ahora + SEGUNDOS_MENSAJE

    def actualizar(self, obs, ahora):
        if self.estado in ("denegado", "bloqueado"):
            if ahora >= self.hasta:
                if self.estado == "bloqueado":
                    self.fallos = 0
                self.reiniciar()
            return
        if self.estado == "abierto":
            return

        if self.estado == "cara":
            if obs.caras == 1 and obs.nombre not in (None, "Desconocido") and obs.nombre == self.persona:
                self.frames_cara += 1
            elif obs.caras == 1 and obs.nombre not in (None, "Desconocido"):
                self.persona, self.frames_cara = obs.nombre, 1
            else:
                self.persona, self.frames_cara = None, 0
            if self.frames_cara >= FRAMES_CARA:
                self.estado = "vida"
                self.reto = generar_reto(self.rng)
                self.limite = ahora + TIEMPO_VIDA
                self.cara_vista = ahora
            return

        # En vida y pin tiene que seguir siendo la MISMA persona (y sola) todo el rato.
        # Si no, alguien podria pasar la cara con una foto y luego poner a otro para el reto.
        if obs.caras == 1 and obs.nombre == self.persona:
            self.cara_vista = ahora
        elif obs.caras > 1:
            return self.fallar("habia mas de una cara", ahora)
        elif ahora - self.cara_vista > TOLERANCIA_CARA:
            return self.fallar("la cara reconocida desaparecio o cambio", ahora)

        if ahora > self.limite:
            fase = "prueba de vida" if self.estado == "vida" else "PIN"
            return self.fallar(f"se acabo el tiempo ({fase})", ahora)

        if self.estado == "vida":
            if obs.parpadeo is not None:
                self.parpadeos.actualizar(obs.parpadeo)
            if obs.giro is not None and direccion_giro(obs.giro) == self.reto["giro"]:
                self.giro_hecho = True
            if self.parpadeos.total >= self.reto["parpadeos"] and self.giro_hecho:
                self.estado = "pin"
                self.limite = ahora + TIEMPO_PIN
        elif self.estado == "pin":
            self.pin.actualizar(obs.dedos, ahora)
            if len(self.pin.cifras) >= LONGITUD_PIN:
                if self.comprobar(self.pin.cifras):
                    self.estado = "abierto"
                    self.fallos = 0
                    self.registrar("CONCEDIDO", "cara + vida + PIN correctos", self.persona)
                else:
                    self.fallar("PIN incorrecto", ahora)


# ---------- Camara, modelos y dibujo ----------

def descargar_modelos():
    reconocer.descargar_modelos()
    gestos.descargar_modelo()
    if not os.path.exists(MODELO_MALLA):
        print("Descargando modelo de malla facial...")
        urllib.request.urlretrieve(URL_MALLA, MODELO_MALLA)


def crear_malla():
    opciones = vision.FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=MODELO_MALLA),
        running_mode=vision.RunningMode.VIDEO,
        output_face_blendshapes=True,   # incluye "eyeBlinkLeft/Right": lo cerrado que esta cada ojo
        num_faces=1,
    )
    return vision.FaceLandmarker.create_from_options(opciones)


def medir_vida(malla, frame, ts):
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    resultado = malla.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), ts)
    if not resultado.face_landmarks:
        return None, None
    formas = {b.category_name: b.score for b in resultado.face_blendshapes[0]}
    parpadeo = (formas["eyeBlinkLeft"] + formas["eyeBlinkRight"]) / 2
    return parpadeo, giro_cabeza(resultado.face_landmarks[0])


def contar_dedos(detector_manos, frame, ts):
    resultado = gestos.detectar(detector_manos, frame, ts)
    if not resultado.hand_landmarks:
        return None
    return sum(dedos.dedos_levantados(resultado.hand_landmarks[0], resultado.hand_world_landmarks[0]))


def texto_con_borde(frame, texto, y, escala=0.8, color=(255, 255, 255)):
    (w, _), _ = cv2.getTextSize(texto, cv2.FONT_HERSHEY_SIMPLEX, escala, 2)
    x = max((frame.shape[1] - w) // 2, 5)
    cv2.putText(frame, texto, (x, y), cv2.FONT_HERSHEY_SIMPLEX, escala, (0, 0, 0), 6)
    cv2.putText(frame, texto, (x, y), cv2.FONT_HERSHEY_SIMPLEX, escala, color, 2)


def dibujar(frame, d, ahora, caras):
    alto, ancho = frame.shape[:2]
    color = {"abierto": (0, 255, 0), "denegado": (0, 0, 255), "bloqueado": (0, 0, 255)}.get(d.estado, (0, 255, 255))
    for cara in caras:
        x, y, w, h = cara[:4].astype(int)
        cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)

    pasos = [("cara", "1 CARA"), ("vida", "2 VIDA"), ("pin", "3 PIN")]
    orden = [p for p, _ in pasos]
    for i, (fase, nombre) in enumerate(pasos):
        hecho = d.estado == "abierto" or (d.estado in orden and orden.index(d.estado) > i)
        actual = d.estado == fase
        c = (0, 255, 0) if hecho else (0, 255, 255) if actual else (120, 120, 120)
        cv2.putText(frame, nombre, (10 + i * 120, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, c, 2)

    if d.limite and d.estado in ("vida", "pin"):
        cv2.putText(frame, f"{max(0, d.limite - ahora):.0f} s", (ancho - 80, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

    if d.estado == "cara":
        texto_con_borde(frame, "Mira a la camara", alto - 30)
    elif d.estado == "vida":
        texto_con_borde(frame, texto_reto(d.reto), alto - 60, 0.7, (0, 255, 255))
        giro = "OK" if d.giro_hecho else "pendiente"
        texto_con_borde(frame, f"Parpadeos: {d.parpadeos.total}/{d.reto['parpadeos']}   Giro: {giro}", alto - 25, 0.7)
    elif d.estado == "pin":
        cifras = "* " * len(d.pin.cifras) + "_ " * (LONGITUD_PIN - len(d.pin.cifras))
        texto_con_borde(frame, f"PIN: {cifras}", alto // 2, 1.4)
        texto_con_borde(frame, "Ensena cada cifra con los dedos y cierra el puno entre cifras", alto - 25, 0.55)
        progreso = d.pin.progreso(ahora)
        if progreso > 0:
            cv2.rectangle(frame, (ancho // 2 - 100, alto // 2 + 20),
                          (ancho // 2 - 100 + int(200 * progreso), alto // 2 + 35), (0, 255, 255), -1)
    elif d.estado == "abierto":
        texto_con_borde(frame, f"ACCESO CONCEDIDO, {d.persona}", alto // 2, 1.1, (0, 255, 0))
    elif d.estado == "denegado":
        texto_con_borde(frame, "ACCESO DENEGADO", alto // 2, 1.3, (0, 0, 255))
        texto_con_borde(frame, d.motivo, alto // 2 + 45, 0.7)
    elif d.estado == "bloqueado":
        texto_con_borde(frame, f"BLOQUEADO {d.hasta - ahora:.0f} s", alto // 2, 1.3, (0, 0, 255))
        texto_con_borde(frame, "Demasiados intentos fallidos", alto // 2 + 45, 0.7)


def desbloquear():
    personas = reconocer.cargar_personas()
    if not personas:
        print("Primero registra tu cara: python paso11_reconocer.py registrar TuNombre")
        return
    if not os.path.exists(ARCHIVO_PIN):
        print("Primero elige tu PIN: python paso12_desbloqueo.py pin")
        return

    detector_caras, reconocedor = reconocer.crear_modelos()
    malla = crear_malla()
    detector_manos = gestos.crear_detector()
    cap = reconocer.abrir_camara()
    d = Desbloqueo()
    inicio = time.monotonic()
    print("Mira a la camara. Pulsa 'q' para salir.")

    while True:
        ok, frame = cap.read()
        if not ok:
            print("ERROR: la camara no devolvio imagen.")
            break
        frame = cv2.flip(frame, 1)
        ahora = time.monotonic()
        ts = int((ahora - inicio) * 1000)

        obs = Observacion()
        caras = reconocer.detectar_caras(detector_caras, frame)
        obs.caras = len(caras)
        if len(caras) == 1:
            emb = reconocer.embedding(reconocedor, frame, caras[0])
            obs.nombre, _ = reconocer.identificar(reconocedor, emb, personas)
        # Solo ejecutamos los modelos que hacen falta en cada fase (ahorra CPU)
        if d.estado == "vida":
            obs.parpadeo, obs.giro = medir_vida(malla, frame, ts)
        elif d.estado == "pin":
            obs.dedos = contar_dedos(detector_manos, frame, ts)

        d.actualizar(obs, ahora)
        dibujar(frame, d, ahora, caras)
        cv2.imshow("Paso 12 - Desbloqueo", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    malla.close()
    detector_manos.close()


def elegir_pin():
    print(f"Elige un PIN de {LONGITUD_PIN} cifras usando solo del 1 al 5 (lo marcaras con los dedos).")
    pin = getpass.getpass("PIN (no se ve al escribir): ").strip()
    if not pin_valido(pin):
        print(f"PIN no valido: tienen que ser {LONGITUD_PIN} cifras del 1 al 5, por ejemplo 3142.")
        return
    if getpass.getpass("Repitelo: ").strip() != pin:
        print("No coinciden, no se guardo nada.")
        return
    guardar_pin(pin)
    print(f"PIN guardado (solo su hash) en {ARCHIVO_PIN}.")


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "pin":
        elegir_pin()
    elif len(sys.argv) == 1:
        descargar_modelos()
        desbloquear()
    else:
        print("Uso:\n  python paso12_desbloqueo.py pin\n  python paso12_desbloqueo.py")
