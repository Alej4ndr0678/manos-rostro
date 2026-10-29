import time

import numpy as np

import hilos


class CamaraFalsa:
    def __init__(self, frames=1000):
        self.quedan = frames

    def isOpened(self):
        return True

    def read(self):
        time.sleep(0.005)
        self.quedan -= 1
        if self.quedan < 0:
            return False, None
        return True, np.full((4, 4, 3), self.quedan % 255, dtype=np.uint8)

    def release(self):
        pass


def test_la_camara_en_hilo_da_frames_nuevos(monkeypatch):
    monkeypatch.setattr(hilos.plataforma, "abrir_camara", lambda indice=0: CamaraFalsa())
    camara = hilos.CamaraEnHilo(0)
    try:
        n1, f1 = camara.leer(0)
        n2, f2 = camara.leer(n1)
        assert f1 is not None and f2 is not None
        assert n2 > n1
    finally:
        camara.soltar()


def test_la_camara_avisa_cuando_se_acaba(monkeypatch):
    monkeypatch.setattr(hilos.plataforma, "abrir_camara", lambda indice=0: CamaraFalsa(frames=2))
    camara = hilos.CamaraEnHilo(0)
    limite = time.monotonic() + 2
    while camara.isOpened() and time.monotonic() < limite:
        time.sleep(0.01)
    assert not camara.isOpened()
    camara.soltar()


def test_el_detector_procesa_el_ultimo_frame():
    vistos = []

    def detectar(frame, ts):
        vistos.append(frame)
        time.sleep(0.02)
        return frame * 2

    detector = hilos.DetectorEnHilo(detectar)
    try:
        for i in range(20):
            detector.enviar(i)
        limite = time.monotonic() + 2
        while detector.ultimo()[0] == 0 and time.monotonic() < limite:
            time.sleep(0.01)
        time.sleep(0.1)
        numero, resultado = detector.ultimo()
        assert numero >= 1
        assert resultado == 38            # el ultimo frame enviado (19) * 2
        assert len(vistos) < 20           # no hace cola: descarta los frames viejos
    finally:
        detector.parar()
