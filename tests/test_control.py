import paso13_control as ctl
import plataforma


def nuevo():
    teclas = []
    return ctl.ControlGestos(pulsar=teclas.append), teclas


def mantener(control, gesto, desde, hasta, x=0.5, paso=0.03):
    t = desde
    while t <= hasta:
        control.actualizar(gesto, x, t)
        t += paso
    return t


def deslizar(control, desde_x, hasta_x, t0, duracion=0.25, pasos=8):
    for i in range(pasos + 1):
        x = desde_x + (hasta_x - desde_x) * i / pasos
        control.actualizar("Mano abierta", x, t0 + duracion * i / pasos)
    return t0 + duracion


def test_pulgar_arriba_sube_el_volumen_mientras_se_mantiene():
    control, teclas = nuevo()
    mantener(control, "Pulgar arriba", 0.0, 1.5)
    assert set(teclas) == {"volumeup"}
    assert len(teclas) >= 4   # se repite


def test_un_gesto_rapido_no_hace_nada():
    control, teclas = nuevo()
    mantener(control, "Pulgar abajo", 0.0, ctl.SEGUNDOS_MANTENER - 0.1)
    control.actualizar(None, 0.5, 0.6)
    assert teclas == []


def test_puno_pausa_una_sola_vez():
    control, teclas = nuevo()
    mantener(control, "Puno", 0.0, 3.0)
    assert teclas == ["playpause"]


def test_soltar_y_repetir_puno_pausa_otra_vez():
    control, teclas = nuevo()
    t = mantener(control, "Puno", 0.0, 1.0)
    control.actualizar(None, None, t)
    mantener(control, "Puno", t + 0.1, t + 1.0)
    assert teclas == ["playpause", "playpause"]


def test_te_quiero_silencia():
    control, teclas = nuevo()
    mantener(control, "Te quiero", 0.0, 1.0)
    assert teclas == ["volumemute"]


def test_deslizar_a_la_izquierda_es_siguiente():
    control, teclas = nuevo()
    deslizar(control, 0.7, 0.3, 0.0)
    assert teclas == ["nexttrack"]


def test_deslizar_a_la_derecha_es_anterior():
    control, teclas = nuevo()
    deslizar(control, 0.3, 0.7, 0.0)
    assert teclas == ["prevtrack"]


def test_en_modo_diapositivas_usa_las_flechas_y_el_puno_no_hace_nada():
    control, teclas = nuevo()
    control.cambiar_modo()
    assert control.modo == "diapositivas"
    t = deslizar(control, 0.7, 0.3, 0.0)
    t = deslizar(control, 0.3, 0.7, t + ctl.ESPERA_DESLIZ)
    mantener(control, "Puno", t + 0.1, t + 1.5)
    assert teclas == ["right", "left"]


def test_un_movimiento_lento_no_es_deslizar():
    control, teclas = nuevo()
    deslizar(control, 0.7, 0.3, 0.0, duracion=2.0, pasos=60)
    assert teclas == []


def test_no_dispara_dos_deslizamientos_seguidos():
    control, teclas = nuevo()
    t = deslizar(control, 0.8, 0.5, 0.0)
    deslizar(control, 0.5, 0.2, t + 0.05)    # dentro del tiempo de espera
    assert teclas == ["nexttrack"]


def test_sin_mano_se_reinicia():
    control, teclas = nuevo()
    mantener(control, "Pulgar arriba", 0.0, 0.4)
    control.actualizar(None, None, 0.45)
    mantener(control, "Pulgar arriba", 0.5, 0.8)
    assert teclas == []   # el tiempo vuelve a contar desde cero


def test_linux_usa_xdotool_para_las_teclas_multimedia(monkeypatch):
    llamadas = []
    monkeypatch.setattr(plataforma, "ES_LINUX", True)
    monkeypatch.setattr(plataforma.subprocess, "run", lambda args, check: llamadas.append(args))
    plataforma.pulsar_tecla("volumeup")
    assert llamadas == [["xdotool", "key", "XF86AudioRaiseVolume"]]


def test_linux_sin_xdotool_avisa_sin_romperse(monkeypatch, capsys):
    def no_existe(args, check):
        raise FileNotFoundError
    monkeypatch.setattr(plataforma, "ES_LINUX", True)
    monkeypatch.setattr(plataforma.subprocess, "run", no_existe)
    plataforma.pulsar_tecla("playpause")
    assert "xdotool" in capsys.readouterr().out


def test_los_nombres_de_gesto_existen_en_el_reconocedor():
    import paso7_gestos
    conocidos = set(paso7_gestos.GESTOS.values())
    assert set(ctl.GESTOS_MANTENIDOS) <= conocidos
    assert "Mano abierta" in conocidos
