import paso10_raton as raton_mod
from conftest import crear_mano, punto


class RatonFalso:
    """Apunta lo que haria el raton en vez de moverlo de verdad."""
    def __init__(self):
        self.acciones = []

    def mover(self, x, y):
        self.posicion = (x, y)

    def clic(self, boton):
        self.acciones.append(("clic", boton))

    def pulsar(self):
        self.acciones.append("pulsar")

    def soltar(self):
        self.acciones.append("soltar")


def mano_pellizco(dedo_tip, cerrado):
    """Mano con el pulgar (4) pegado a la punta indicada (8 = indice, 12 = corazon)."""
    # Para el clic derecho bajamos el indice: si no, el pulgar quedaria cerca de los dos
    indice_arriba = dedo_tip == 8
    mano = crear_mano((True, indice_arriba, True, False, False))
    if cerrado:
        mano[4] = punto(mano[dedo_tip].x, mano[dedo_tip].y + 0.01)
    return mano


def test_el_cursor_no_toca_las_esquinas():
    control = raton_mod.ControlRaton(1920, 1080, RatonFalso())
    x, y = control.a_pantalla(punto(0.0, 0.0))
    assert (x, y) == (2, 2)
    x, y = control.a_pantalla(punto(1.0, 1.0))
    assert x < 1920 - 1 and y < 1080 - 1


def test_pellizco_corto_es_un_clic():
    falso = RatonFalso()
    control = raton_mod.ControlRaton(1920, 1080, falso)
    control.actualizar(mano_pellizco(8, False), 0.0)
    control.actualizar(mano_pellizco(8, True), 0.1)
    control.actualizar(mano_pellizco(8, False), 0.2)
    assert falso.acciones == [("clic", "left")]


def test_pellizco_largo_arrastra_y_suelta():
    falso = RatonFalso()
    control = raton_mod.ControlRaton(1920, 1080, falso)
    control.actualizar(mano_pellizco(8, True), 0.0)
    control.actualizar(mano_pellizco(8, True), raton_mod.TIEMPO_ARRASTRE + 0.1)
    assert control.arrastrando
    control.actualizar(mano_pellizco(8, False), 1.0)
    assert falso.acciones == ["pulsar", "soltar"]


def test_pulgar_y_corazon_es_clic_derecho_una_sola_vez():
    falso = RatonFalso()
    control = raton_mod.ControlRaton(1920, 1080, falso)
    for t in range(5):
        control.actualizar(mano_pellizco(12, True), t * 0.1)
    assert falso.acciones == [("clic", "right")]


def test_perder_la_mano_suelta_el_arrastre():
    falso = RatonFalso()
    control = raton_mod.ControlRaton(1920, 1080, falso)
    control.actualizar(mano_pellizco(8, True), 0.0)
    control.actualizar(mano_pellizco(8, True), 1.0)
    control.actualizar(None, 1.1)
    assert falso.acciones == ["pulsar", "soltar"]
    assert not control.arrastrando
