import pytest

import paso5_dedos as dedos
from conftest import crear_mano


@pytest.mark.parametrize("levantados", [
    (True, True, True, True, True),     # mano abierta = 5
    (False, False, False, False, False),  # puno = 0
    (False, True, False, False, False),   # solo indice = 1
    (False, True, True, False, False),    # V = 2
    (True, False, False, False, True),    # "llamame" = 2
    (False, True, True, True, True),      # 4 sin pulgar
])
def test_cuenta_los_dedos_levantados(levantados):
    mano = crear_mano(levantados)
    assert dedos.dedos_levantados(mano, mano) == list(levantados)


def test_angulo_dedo_recto_y_doblado():
    mano = crear_mano((False, True, False, False, False))
    recto = dedos.angulo(*(mano[i] for i in (5, 6, 7, 8)))
    doblado = dedos.angulo(*(mano[i] for i in (9, 10, 11, 12)))
    assert recto < 10
    assert doblado > dedos.ANGULO_DOBLADO


def test_suavizado_ignora_un_frame_suelto():
    historial = {}
    cinco = [True] * 5
    for _ in range(4):
        dedos.suavizar(historial, "Derecha", cinco)
    # Un frame raro no cambia el resultado: manda lo que mas se repite
    assert dedos.suavizar(historial, "Derecha", [False] * 5) == tuple(cinco)


def test_suavizado_separa_cada_mano():
    historial = {}
    dedos.suavizar(historial, "Derecha", [True] * 5)
    assert dedos.suavizar(historial, "Izquierda", [False] * 5) == (False,) * 5
