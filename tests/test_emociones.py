# Pruebas de las emociones (paso 17) con blendshapes inventados.
import numpy as np
import pytest

import paso17_emociones as emo


def cara(**valores):
    """Blendshapes de una cara neutra (todo a 0) con los valores indicados."""
    formas = {n: 0.0 for n in [
        "mouthSmileLeft", "mouthSmileRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight",
        "jawOpen", "browDownLeft", "browDownRight", "noseSneerLeft", "noseSneerRight",
        "mouthFrownLeft", "mouthFrownRight", "mouthPucker", "eyeBlinkLeft", "eyeBlinkRight"]}
    formas.update(valores)
    return formas


SONRISA = cara(mouthSmileLeft=0.9, mouthSmileRight=0.9)
SORPRESA = cara(browInnerUp=0.8, browOuterUpLeft=0.7, browOuterUpRight=0.7, jawOpen=0.7)
ENFADO = cara(browDownLeft=0.8, browDownRight=0.8, noseSneerLeft=0.5, noseSneerRight=0.5)
TRISTEZA = cara(mouthFrownLeft=0.7, mouthFrownRight=0.7, browInnerUp=0.5)
BESO = cara(mouthPucker=0.8)
GUINO = cara(eyeBlinkLeft=0.9, eyeBlinkRight=0.05)


def estable(formas, frames=20, emociones=None):
    emociones = emociones or emo.Emociones()
    for _ in range(frames):
        resultado = emociones.actualizar(formas)
    return resultado


@pytest.mark.parametrize("formas, esperada", [
    (cara(), "Neutral"),
    (SONRISA, "Alegria"),
    (SORPRESA, "Sorpresa"),
    (ENFADO, "Enfado"),
    (TRISTEZA, "Tristeza"),
    (BESO, "Beso"),
    (GUINO, "Guino"),
])
def test_cada_expresion(formas, esperada):
    assert estable(formas) == esperada


def test_reir_no_es_enfado():
    # Al reir de verdad las cejas bajan y los ojos se achinan (como en la foto de las pruebas)
    risa = cara(mouthSmileLeft=0.95, mouthSmileRight=0.93, browDownLeft=0.84, browDownRight=0.82)
    assert estable(risa) == "Alegria"
    assert emo.puntuar(risa)["Enfado"] < 0.1


def test_parpadear_no_es_guino():
    assert estable(cara(eyeBlinkLeft=0.95, eyeBlinkRight=0.9)) == "Neutral"


def test_beso_con_la_boca_abierta_no_cuenta():
    assert emo.puntuar(cara(mouthPucker=0.8, jawOpen=0.9))["Beso"] < 0.1


def test_puntuaciones_entre_0_y_1():
    extremo = {n: 1.0 for n in cara()}
    for v in emo.puntuar(extremo).values():
        assert 0.0 <= v <= 1.0


def test_suavizado_un_frame_suelto_no_cambia_la_expresion():
    e = emo.Emociones()
    estable(cara(), emociones=e)
    assert e.actualizar(SORPRESA) == "Neutral", "un solo frame no basta"
    assert estable(SORPRESA, emociones=e) == "Sorpresa"


def test_sin_cara_se_va_apagando():
    e = emo.Emociones()
    estable(SONRISA, emociones=e)
    for _ in range(10):
        e.actualizar(None)
    assert e.dominante() == "Neutral"


def test_calibrar_cara_neutra():
    # Alguien con las cejas bajas de forma natural sale "enfadado" sin calibrar...
    cejas_bajas = cara(browDownLeft=0.7, browDownRight=0.7)
    e = emo.Emociones()
    assert estable(cejas_bajas, emociones=e) == "Enfado"
    # ...pero tras calibrar con esa cara, es su cara neutra
    e.empezar_calibracion()
    assert e.esta_calibrando
    estable(cejas_bajas, frames=emo.FRAMES_CALIBRAR, emociones=e)
    assert not e.esta_calibrando
    assert estable(cejas_bajas, emociones=e) == "Neutral"
    # Y si las baja aun mas (enfado de verdad), si se detecta
    assert estable(cara(browDownLeft=1.0, browDownRight=1.0, noseSneerLeft=0.8, noseSneerRight=0.8),
                   emociones=e) == "Enfado"
    # Las demas expresiones siguen funcionando
    assert estable(SONRISA, emociones=e) == "Alegria"


def test_disparador_foto_al_sonreir():
    d = emo.Disparador(umbral=0.7, segundos=0.6, espera=3.0)
    assert not d.actualizar(0.9, 0.0)
    assert not d.actualizar(0.9, 0.3)
    assert d.actualizar(0.9, 0.7), "sonrisa mantenida 0.6 s"
    assert not d.actualizar(0.9, 1.5), "espera entre fotos"
    assert not d.actualizar(0.2, 3.0)
    assert not d.actualizar(0.9, 4.0)
    assert d.actualizar(0.9, 4.7)


def test_disparador_una_sonrisa_corta_no_dispara():
    d = emo.Disparador(umbral=0.7, segundos=0.6)
    assert not any(d.actualizar(v, t * 0.1) for t, v in enumerate([0.9, 0.9, 0.9, 0.3, 0.9, 0.9, 0.9, 0.2]))


def test_filtros_dibujan_sin_errores():
    frame = np.zeros((480, 640, 3), np.uint8)
    px = [(320.0, 240.0)] * 478
    f = emo.Filtros()
    for expresion in emo.EXPRESIONES + ["Neutral"]:
        for _ in range(20):
            f.emitir(expresion, px, 200)
            f.dibujar(frame, expresion, px, 200)
    assert frame.any(), "algo se ha dibujado"
