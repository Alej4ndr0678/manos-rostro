import random

import paso9_juego as juego_mod


def test_tocar_una_bola_suma_sus_puntos(en_carpeta_temporal):
    random.seed(1)
    juego = juego_mod.Juego(640, 480)
    juego.empezar(0.0)
    bola = juego_mod.Bola(640, 0)
    bola.tipo, bola.puntos, bola.x, bola.y = "dorada", 3, 300.0, 200.0
    bola.vx = bola.vy = 0
    juego.bolas = [bola]
    juego.proxima_bola = 999  # que no aparezcan bolas nuevas
    juego.actualizar([(305, 205)], 1.0)
    assert juego.puntos == 3
    assert bola not in juego.bolas


def test_la_bomba_resta_y_hace_temblar(en_carpeta_temporal):
    juego = juego_mod.Juego(640, 480)
    juego.empezar(0.0)
    bomba = juego_mod.Bola(640, 0)
    bomba.tipo, bomba.puntos, bomba.x, bomba.y = "bomba", -5, 100.0, 100.0
    bomba.vx = bomba.vy = 0
    juego.bolas = [bomba]
    juego.proxima_bola = 999
    juego.actualizar([(100, 100)], 1.0)
    assert juego.puntos == -5
    assert juego.temblor > 0


def test_fin_de_partida_guarda_el_record(en_carpeta_temporal):
    juego = juego_mod.Juego(640, 480)
    juego.empezar(0.0)
    juego.puntos = 42
    juego.actualizar([], juego_mod.DURACION + 1)
    assert juego.estado == "fin"
    assert juego.nuevo_record
    assert juego_mod.leer_record() == 42


def test_record_sin_archivo_es_cero(en_carpeta_temporal):
    assert juego_mod.leer_record() == 0


def test_las_bolas_caen_fuera_de_pantalla_y_desaparecen(en_carpeta_temporal):
    juego = juego_mod.Juego(640, 480)
    juego.empezar(0.0)
    juego.proxima_bola = 999
    bola = juego_mod.Bola(640, 0)
    bola.y = 1000
    juego.bolas = [bola]
    juego.actualizar([], 1.0)
    assert juego.bolas == []
