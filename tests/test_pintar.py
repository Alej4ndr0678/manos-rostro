import paso8_pintar as pintar
from conftest import crear_mano, crear_resultado

ANCHO, ALTO = 640, 480
SOLO_INDICE = (False, True, False, False, False)
V = (False, True, True, False, False)
ABIERTA = (True, True, True, True, True)


def pintar_trazo(pizarra, desde_x, hasta_x, y=0.0, pasos=10, t0=0.0):
    for paso in range(pasos + 1):
        dx = desde_x + (hasta_x - desde_x) * paso / pasos
        mano = crear_mano(SOLO_INDICE, dx=dx, dy=y)
        pizarra.actualizar(crear_resultado([mano]), t0 + paso * 0.03)


def test_el_indice_pinta_una_linea():
    pizarra = pintar.Pizarra(ANCHO, ALTO)
    pintar_trazo(pizarra, -0.2, 0.2)
    assert pizarra.lienzo.any(), "deberia haber algo pintado"


def test_la_v_mueve_sin_pintar():
    pizarra = pintar.Pizarra(ANCHO, ALTO)
    for paso in range(10):
        mano = crear_mano(V, dx=-0.2 + paso * 0.04)
        pizarra.actualizar(crear_resultado([mano]), paso * 0.03)
    assert not pizarra.lienzo.any()


def test_elegir_color_en_la_barra_con_un_dedo():
    pizarra = pintar.Pizarra(ANCHO, ALTO)
    # La punta del indice esta en y=0.35; con dy=-0.25 queda en y=0.10 -> 48 px, dentro de la barra.
    # La X de la punta es 0.42; con dx=+0.10 queda en 0.52 -> casilla 3 de 7 (Naranja).
    for t in range(5):
        pizarra.actualizar(crear_resultado([crear_mano(SOLO_INDICE, dx=0.10, dy=-0.25)]), t * 0.03)
    assert pintar.PALETA[pizarra.color][0] == "Naranja"
    assert not pizarra.lienzo.any(), "en la barra nunca se pinta"


def test_no_pinta_una_linea_al_bajar_de_la_barra():
    pizarra = pintar.Pizarra(ANCHO, ALTO)
    pizarra.actualizar(crear_resultado([crear_mano(SOLO_INDICE, dx=0.0, dy=-0.25)]), 0.0)
    pizarra.actualizar(crear_resultado([crear_mano(SOLO_INDICE, dx=0.0, dy=0.2)]), 0.03)
    assert not pizarra.lienzo.any()


def test_mano_abierta_borra_todo():
    pizarra = pintar.Pizarra(ANCHO, ALTO)
    pintar_trazo(pizarra, -0.2, 0.2)
    t = 1.0
    while t < 1.0 + pintar.SEGUNDOS_PARA_BORRAR + 0.1:
        pizarra.actualizar(crear_resultado([crear_mano(ABIERTA)]), t)
        t += 0.05
    assert not pizarra.lienzo.any()


def test_perder_la_mano_un_instante_no_reinicia_el_borrado():
    pizarra = pintar.Pizarra(ANCHO, ALTO)
    pintar_trazo(pizarra, -0.2, 0.2)
    abierta = crear_resultado([crear_mano(ABIERTA)])
    vacio = crear_resultado([])
    pizarra.actualizar(abierta, 1.0)
    pizarra.actualizar(vacio, 1.2)          # MediaPipe pierde la mano 0,2 s
    pizarra.actualizar(abierta, 1.3)
    pizarra.actualizar(abierta, 1.0 + pintar.SEGUNDOS_PARA_BORRAR + 0.05)
    assert not pizarra.lienzo.any()
