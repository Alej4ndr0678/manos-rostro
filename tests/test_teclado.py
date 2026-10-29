# Pruebas del teclado en el aire (paso 16): distribucion, pulsaciones y sugerencias.
import pytest

import paso16_teclado as tec


@pytest.fixture
def teclas():
    return tec.crear_teclas()


def centro(teclas, etiqueta):
    for e, x1, y1, x2, y2 in teclas:
        if e == etiqueta:
            return (x1 + x2) / 2, (y1 + y2) / 2
    raise KeyError(etiqueta)


def test_estan_todas_las_teclas(teclas):
    etiquetas = [t[0] for t in teclas]
    for fila in tec.FILAS:
        for letra in fila:
            assert letra in etiquetas
    for especial, _ in tec.ESPECIALES:
        assert especial in etiquetas
    assert {"SUG0", "SUG1", "SUG2"} <= set(etiquetas)
    assert len(etiquetas) == len(set(etiquetas)), "etiquetas repetidas"


def test_las_teclas_no_se_solapan_y_caben(teclas):
    for e, x1, y1, x2, y2 in teclas:
        assert tec.IZQUIERDA <= x1 < x2 <= tec.DERECHA
        assert tec.ARRIBA <= y1 < y2 <= tec.ABAJO + 1e-9
    for i, a in enumerate(teclas):
        for b in teclas[i + 1:]:
            separadas = a[3] <= b[1] or b[3] <= a[1] or a[4] <= b[2] or b[4] <= a[2]
            assert separadas, f"{a[0]} y {b[0]} se solapan"


@pytest.mark.parametrize("etiqueta", ["Q", "A", "Ñ", "M", "ESPACIO", "BORRAR", "SUG1", "5"])
def test_tecla_en_el_centro(teclas, etiqueta):
    assert tec.tecla_en(teclas, *centro(teclas, etiqueta)) == etiqueta


def test_fuera_del_teclado_no_hay_tecla(teclas):
    assert tec.tecla_en(teclas, 0.5, 0.1) is None
    assert tec.tecla_en(teclas, 0.01, 0.6) is None


def test_pellizco_pulsa_una_sola_vez():
    p = tec.Pulsador()
    pinzas = [0.8, 0.6, 0.25, 0.2, 0.28, 0.35, 0.2, 0.5, 0.8]
    pulsadas = [p.actualizar("A", d, i * 0.03) for i, d in enumerate(pinzas)]
    # Pulsa al cerrar; el rebote a 0.35 (menos que UMBRAL_SOLTAR) no vuelve a pulsar
    assert [t for t in pulsadas if t] == ["A"]
    # Tras separar del todo, un nuevo pellizco vuelve a pulsar
    assert p.actualizar("B", 0.2, 1.0) == "B"


def test_sin_mano_se_suelta_el_pellizco():
    p = tec.Pulsador()
    assert p.actualizar("A", 0.2, 0.0) == "A"
    assert p.actualizar(None, None, 0.1) is None
    assert p.actualizar("A", 0.2, 0.2) == "A"


def test_modo_mirar():
    p = tec.Pulsador("mirar")
    assert p.actualizar("H", None, 0.0) is None
    assert p.actualizar("H", None, 0.5) is None
    assert p.progreso(0.4) == pytest.approx(0.5)
    assert p.actualizar("H", None, 0.85) == "H"
    assert p.actualizar("H", None, 2.0) is None, "no repite sin salir de la tecla"
    assert p.actualizar("O", None, 2.1) is None
    assert p.actualizar("O", None, 2.95) == "O"
    p.cambiar_modo()
    assert p.modo == "pellizco"


def test_escribir_borrar_y_mayusculas():
    t = tec.Texto()
    assert t.pulsar("MAYUS") == []
    assert t.pulsar("H") == ["H"]
    assert t.pulsar("O") == ["o"], "la mayuscula solo vale para una letra"
    t.pulsar("L")
    t.pulsar("A")
    t.pulsar("ESPACIO")
    assert t.texto == "Hola "
    assert t.pulsar("BORRAR") == ["backspace"]
    assert t.texto == "Hola"
    t.pulsar("ENTER")
    assert t.texto == "Hola\n"
    vacio = tec.Texto()
    assert vacio.pulsar("BORRAR") == []


def test_sugerencias_y_completar():
    t = tec.Texto(["gracias", "grande", "gato"])
    for letra in "GR":
        t.pulsar(letra)
    sug = t.sugerencias()
    assert sug == ["grande", "gracias"]       # empate de uso: primero la mas corta
    assert t.pulsar("SUG1", sug) == ["acias "]
    assert t.texto == "gracias "
    # Ahora "gracias" se ha usado: pasa la primera
    for letra in "GR":
        t.pulsar(letra)
    assert t.sugerencias()[0] == "gracias"


def test_aprende_palabras_nuevas():
    t = tec.Texto([])
    for letra in "MEDIAPIPE":
        t.pulsar(letra)
    t.pulsar("ESPACIO")
    t.pulsar("M")
    assert t.sugerencias() == ["mediapipe"]


def test_sugerencia_que_no_existe_no_hace_nada():
    t = tec.Texto([])
    t.pulsar("X")
    assert t.pulsar("SUG2", []) == []
    assert t.texto == "x"


def test_sin_palabra_no_hay_sugerencias():
    t = tec.Texto()
    assert t.sugerencias() == []
    t.pulsar("A")
    t.pulsar("ESPACIO")
    assert t.sugerencias() == []
