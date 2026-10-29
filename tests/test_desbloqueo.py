import json
import random

import pytest

import paso12_desbloqueo as des
from conftest import punto
from paso12_desbloqueo import Observacion

YO = Observacion(caras=1, nombre="Alejandro")


class Registro:
    def __init__(self):
        self.lineas = []

    def __call__(self, resultado, motivo, nombre):
        self.lineas.append((resultado, motivo))


def nuevo(pin="3142"):
    registro = Registro()
    d = des.Desbloqueo(comprobar=lambda p: p == pin, registrar=registro, rng=random.Random(0))
    return d, registro


def pasar_cara(d, t=0.0):
    for i in range(des.FRAMES_CARA):
        d.actualizar(YO, t + i * 0.03)
    assert d.estado == "vida"
    return t + des.FRAMES_CARA * 0.03


def pasar_vida(d, t):
    for _ in range(d.reto["parpadeos"]):
        for valor in (0.2, 0.8, 0.2):         # abierto -> cerrado -> abierto
            d.actualizar(Observacion(caras=1, nombre="Alejandro", parpadeo=valor, giro=0.5), t)
            t += 0.05
    giro = 0.2 if d.reto["giro"] == "izquierda" else 0.8
    d.actualizar(Observacion(caras=1, nombre="Alejandro", parpadeo=0.2, giro=giro), t)
    assert d.estado == "pin"
    return t + 0.05


def marcar_pin(d, pin, t):
    for cifra in pin:
        for _ in range(3):
            d.actualizar(Observacion(caras=1, nombre="Alejandro", dedos=int(cifra)), t)
            t += des.SEGUNDOS_DIGITO / 2 + 0.01
        d.actualizar(Observacion(caras=1, nombre="Alejandro", dedos=0), t)   # puno = separador
        t += 0.05
    return t


# ---------- PIN con hash ----------

def test_el_pin_se_guarda_como_hash(tmp_path):
    ruta = tmp_path / "pin.json"
    des.guardar_pin("3142", ruta)
    contenido = ruta.read_text()
    assert "3142" not in contenido
    assert des.comprobar_pin("3142", ruta)
    assert not des.comprobar_pin("3141", ruta)


def test_mismo_pin_distinto_hash_gracias_a_la_sal(tmp_path):
    des.guardar_pin("1111", tmp_path / "a.json")
    des.guardar_pin("1111", tmp_path / "b.json")
    a = json.loads((tmp_path / "a.json").read_text())
    b = json.loads((tmp_path / "b.json").read_text())
    assert a["hash"] != b["hash"]


@pytest.mark.parametrize("pin", ["123", "12345", "1236", "0123", "abcd"])
def test_pin_no_valido(pin, tmp_path):
    assert not des.pin_valido(pin)
    with pytest.raises(ValueError):
        des.guardar_pin(pin, tmp_path / "pin.json")


# ---------- Piezas de la prueba de vida ----------

def test_cuenta_parpadeos_con_histeresis():
    c = des.ContadorParpadeos()
    for valor in [0.2, 0.6, 0.5, 0.6, 0.3, 0.2, 0.7, 0.1]:
        c.actualizar(valor)
    assert c.total == 2   # el 0.5 entre dos 0.6 no cuenta como un parpadeo extra


def test_giro_de_cabeza():
    def cara(nariz_x):
        puntos = [punto(0.5, 0.5)] * 478
        puntos = list(puntos)
        puntos[des.MEJILLA_IZQ] = punto(0.3, 0.5)
        puntos[des.MEJILLA_DER] = punto(0.7, 0.5)
        puntos[des.NARIZ] = punto(nariz_x, 0.5)
        return puntos
    assert des.direccion_giro(des.giro_cabeza(cara(0.5))) is None
    assert des.direccion_giro(des.giro_cabeza(cara(0.33))) == "izquierda"
    assert des.direccion_giro(des.giro_cabeza(cara(0.67))) == "derecha"


def test_los_retos_varian():
    rng = random.Random(1)
    retos = {tuple(des.generar_reto(rng).items()) for _ in range(30)}
    assert len(retos) > 3


def test_lector_pin_con_cifras_repetidas():
    lector = des.LectorPin()
    t = 0.0
    for cifra in [3, 3, 5]:
        for _ in range(3):
            lector.actualizar(cifra, t)
            t += 0.6
        lector.actualizar(0, t)
    assert lector.cifras == "335"


def test_lector_pin_sin_separador_no_repite():
    lector = des.LectorPin()
    for i in range(10):
        lector.actualizar(2, i * 0.6)
    assert lector.cifras == "2"


# ---------- El flujo completo ----------

def test_desbloqueo_correcto():
    d, registro = nuevo()
    t = pasar_vida(d, pasar_cara(d))
    marcar_pin(d, "3142", t)
    assert d.estado == "abierto"
    assert registro.lineas[-1][0] == "CONCEDIDO"


def test_desconocido_no_pasa_de_la_cara():
    d, _ = nuevo()
    for i in range(50):
        d.actualizar(Observacion(caras=1, nombre="Desconocido"), i * 0.03)
    assert d.estado == "cara"


def test_una_foto_no_supera_la_prueba_de_vida():
    # Una foto: la cara se reconoce, pero nunca parpadea ni gira
    d, registro = nuevo()
    t = pasar_cara(d)
    while t < des.TIEMPO_VIDA + 1:
        d.actualizar(Observacion(caras=1, nombre="Alejandro", parpadeo=0.25, giro=0.5), t)
        t += 0.1
    assert d.estado == "denegado"
    assert "vida" in registro.lineas[-1][1]


def test_solo_parpadear_no_basta_si_el_giro_es_el_contrario():
    d, _ = nuevo()
    t = pasar_cara(d)
    contrario = 0.8 if d.reto["giro"] == "izquierda" else 0.2
    for _ in range(3):
        for valor in (0.2, 0.8, 0.2):
            d.actualizar(Observacion(caras=1, nombre="Alejandro", parpadeo=valor, giro=contrario), t)
            t += 0.05
    assert d.estado == "vida"


def test_cambiar_de_persona_a_mitad_cancela():
    d, registro = nuevo()
    t = pasar_cara(d)
    for _ in range(30):
        d.actualizar(Observacion(caras=1, nombre="Otro"), t)
        t += 0.1
    assert d.estado == "denegado"
    assert "desaparecio o cambio" in registro.lineas[-1][1]


def test_dos_caras_cancela():
    d, _ = nuevo()
    t = pasar_cara(d)
    d.actualizar(Observacion(caras=2, nombre=None), t)
    assert d.estado == "denegado"


def test_perder_la_cara_un_momento_no_cancela():
    d, _ = nuevo()
    t = pasar_cara(d)
    d.actualizar(Observacion(caras=0), t + 0.5)
    assert d.estado == "vida"


def test_pin_incorrecto_y_bloqueo_tras_tres_fallos():
    d, registro = nuevo()
    t = 0.0
    for _ in range(des.MAX_INTENTOS):
        t = pasar_vida(d, pasar_cara(d, t))
        t = marcar_pin(d, "1111", t)
        assert d.estado in ("denegado", "bloqueado")
        if d.estado == "denegado":
            t += des.SEGUNDOS_MENSAJE + 0.1
            d.actualizar(YO, t)          # se acaba el mensaje y vuelve a empezar
            assert d.estado == "cara"
    assert d.estado == "bloqueado"
    assert registro.lineas[-1][0] == "BLOQUEO"
    # Durante el bloqueo no hace caso aunque seas tu
    for i in range(20):
        d.actualizar(YO, t + i * 0.1)
    assert d.estado == "bloqueado"
    d.actualizar(YO, t + des.SEGUNDOS_BLOQUEO + 1)
    assert d.estado == "cara" and d.fallos == 0


def test_el_registro_de_accesos_se_escribe(tmp_path):
    ruta = tmp_path / "accesos.log"
    des.registrar_acceso("DENEGADO", "PIN incorrecto", "Alejandro", ruta)
    des.registrar_acceso("CONCEDIDO", "ok", "Alejandro", ruta)
    lineas = ruta.read_text(encoding="utf-8").splitlines()
    assert len(lineas) == 2 and "DENEGADO" in lineas[0] and "CONCEDIDO" in lineas[1]
