# Pruebas con los modelos de verdad sobre fotos de ejemplo de MediaPipe.
# Son mas lentas y necesitan internet la primera vez (descargan modelos y fotos a
# tests/.cache/). Para saltarlas: pytest -m "not modelos"
import os
import time
import urllib.request

import cv2
import numpy as np
import pytest

pytestmark = pytest.mark.modelos

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache")
FOTOS = {
    "pulgar_arriba.jpg": "https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/thumbs_up.jpg",
    "victoria.jpg": "https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/victory.jpg",
    "apuntar.jpg": "https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/pointing_up.jpg",
    "dos_manos.jpg": "https://storage.googleapis.com/mediapipe-tasks/hand_landmarker/woman_hands.jpg",
    "retrato.jpg": "https://storage.googleapis.com/mediapipe-assets/portrait.jpg",
}


@pytest.fixture(scope="module")
def cache(tmp_path_factory):
    # Los modulos descargan los modelos en la carpeta actual: trabajamos dentro de la cache
    os.makedirs(CACHE, exist_ok=True)
    anterior = os.getcwd()
    os.chdir(CACHE)
    for nombre, url in FOTOS.items():
        if not os.path.exists(nombre):
            urllib.request.urlretrieve(url, nombre)
    yield CACHE
    os.chdir(anterior)


def foto(nombre):
    imagen = cv2.imread(os.path.join(CACHE, nombre))
    assert imagen is not None, f"no se pudo leer {nombre}"
    return imagen


@pytest.fixture(scope="module")
def gestos(cache):
    import paso7_gestos
    paso7_gestos.descargar_modelo()
    return paso7_gestos


@pytest.mark.parametrize("archivo, esperado", [
    ("pulgar_arriba.jpg", "Pulgar arriba"),
    ("victoria.jpg", "Victoria"),
    ("apuntar.jpg", "Apuntar arriba"),
])
def test_reconoce_el_gesto(gestos, archivo, esperado):
    detector = gestos.crear_detector()   # uno por foto: en modo VIDEO el tiempo debe avanzar
    try:
        resultado = gestos.detectar(detector, foto(archivo), 0)
    finally:
        detector.close()
    assert len(resultado.hand_landmarks) == 1
    assert gestos.nombre_gesto(resultado, 0) == esperado


def test_victoria_son_dos_dedos(gestos):
    import paso5_dedos
    detector = gestos.crear_detector()
    try:
        resultado = gestos.detectar(detector, foto("victoria.jpg"), 0)
    finally:
        detector.close()
    estado = paso5_dedos.dedos_levantados(resultado.hand_landmarks[0], resultado.hand_world_landmarks[0])
    assert estado[1] and estado[2], "indice y corazon arriba"
    assert not estado[3] and not estado[4], "anular y menique abajo"


def test_detecta_dos_manos(cache):
    import paso2_manos
    paso2_manos.descargar_modelo()
    detector = paso2_manos.crear_detector()
    try:
        resultado = paso2_manos.detectar(detector, foto("dos_manos.jpg"), 0)
    finally:
        detector.close()
    assert len(resultado.hand_landmarks) == 2
    assert all(len(mano) == 21 for mano in resultado.hand_landmarks)


def test_detecta_un_rostro(cache):
    import paso3_rostro
    paso3_rostro.descargar_modelo()
    detector = paso3_rostro.crear_detector()
    try:
        resultado = paso3_rostro.detectar(detector, foto("retrato.jpg"), 0)
    finally:
        detector.close()
    assert len(resultado.detections) == 1


def test_identidad_misma_persona_y_desconocido(cache):
    import paso11_reconocer as rec
    rec.descargar_modelos()
    detector, reconocedor = rec.crear_modelos()
    imagen = foto("retrato.jpg")
    caras = rec.detectar_caras(detector, imagen)
    assert len(caras) == 1
    registrado = rec.embedding(reconocedor, imagen, caras[0])

    # La misma persona con la imagen un poco mas oscura y reescalada: tiene que reconocerla
    variante = cv2.resize((imagen * 0.8).astype(np.uint8), None, fx=0.8, fy=0.8)
    cara_variante = rec.detectar_caras(detector, variante)[0]
    nombre, similitud = rec.identificar(reconocedor, rec.embedding(reconocedor, variante, cara_variante),
                                        {"Prueba": registrado})
    assert nombre == "Prueba", f"similitud {similitud:.2f}"

    # Un "embedding" al azar no se parece a nadie
    azar = np.random.default_rng(0).standard_normal(registrado.shape).astype(np.float32)
    nombre, _ = rec.identificar(reconocedor, azar, {"Prueba": registrado})
    assert nombre == "Desconocido"


def test_sistema_completo_arranca_y_sale_con_q(cache, monkeypatch):
    # Ejecuta sistema.py con una "camara" que siempre devuelve la foto de dos manos,
    # sin abrir ventanas, y pulsa "q" cuando ya ha procesado varias detecciones.
    import hilos
    import sistema

    imagen = foto("dos_manos.jpg")

    class CamaraFoto:
        def isOpened(self):
            return True

        def read(self):
            time.sleep(0.01)  # como una webcam real: no da frames infinitamente rapido
            return True, imagen.copy()

        def release(self):
            pass

    mostrados = []
    monkeypatch.setattr(hilos.plataforma, "abrir_camara", lambda indice=0: CamaraFoto())
    monkeypatch.setattr(sistema.cv2, "imshow", lambda nombre, frame: mostrados.append(frame.shape))
    monkeypatch.setattr(sistema.cv2, "destroyAllWindows", lambda: None)

    limite = time.monotonic() + 60   # por si algo falla, no quedarse colgado para siempre

    def tecla(ms):
        detector = sistema._ultimo_detector
        listo = detector is not None and detector.ultimo()[0] >= 5
        return ord("q") if listo or time.monotonic() > limite else 255

    monkeypatch.setattr(sistema.cv2, "waitKey", tecla)
    sistema.main()
    assert sistema._ultimo_detector.ultimo()[0] >= 5, "el detector no llego a procesar frames"
    assert len(mostrados) >= 5


def test_malla_facial_ojos_abiertos_y_de_frente(cache):
    import paso12_desbloqueo as des
    des.descargar_modelos()
    malla = des.crear_malla()
    try:
        parpadeo, giro = des.medir_vida(malla, foto("retrato.jpg"), 0)
    finally:
        malla.close()
    assert parpadeo < des.OJO_ABIERTO
    assert des.direccion_giro(giro) is None


def test_desbloqueo_con_una_foto_es_denegado(cache, monkeypatch, tmp_path):
    # El ataque clasico: ensenar una foto de la persona registrada a la camara.
    # La cara se reconoce, pero la foto no parpadea ni gira: tiene que denegarse.
    import paso11_reconocer as rec
    import paso12_desbloqueo as des

    imagen = foto("retrato.jpg")
    detector, reconocedor = rec.crear_modelos()
    registrado = rec.embedding(reconocedor, imagen, rec.detectar_caras(detector, imagen)[0])

    monkeypatch.setattr(rec, "cargar_personas", lambda: {"Alejandro": registrado})
    monkeypatch.setattr(des, "ARCHIVO_PIN", str(tmp_path / "pin.json"))
    monkeypatch.setattr(des, "ARCHIVO_LOG", str(tmp_path / "accesos.log"))
    monkeypatch.setattr(des, "TIEMPO_VIDA", 1.5)   # no esperar 12 s en la prueba
    des.guardar_pin("3142")

    class CamaraFoto:
        def isOpened(self):
            return True

        def read(self):
            time.sleep(0.01)
            return True, cv2.flip(imagen, 1)   # el programa la voltea otra vez

        def release(self):
            pass

    monkeypatch.setattr(rec, "abrir_camara", lambda: CamaraFoto())
    estados = []
    original = des.Desbloqueo.actualizar

    def espiar(self, obs, ahora):
        original(self, obs, ahora)
        estados.append(self.estado)

    monkeypatch.setattr(des.Desbloqueo, "actualizar", espiar)
    monkeypatch.setattr(des.cv2, "imshow", lambda *a: None)
    monkeypatch.setattr(des.cv2, "destroyAllWindows", lambda: None)
    limite = time.monotonic() + 60
    monkeypatch.setattr(des.cv2, "waitKey",
                        lambda ms: ord("q") if (estados and estados[-1] == "denegado") or time.monotonic() > limite else 255)

    des.desbloquear()
    assert "vida" in estados, "la cara de la foto tendria que reconocerse"
    assert estados[-1] == "denegado"
    log = (tmp_path / "accesos.log").read_text(encoding="utf-8")
    assert "prueba de vida" in log
