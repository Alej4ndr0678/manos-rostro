# Pruebas del contador de ejercicio (paso 15) con cuerpos "inventados".
import math
from types import SimpleNamespace

import pytest

import paso15_ejercicio as ej


def cuerpo(rodilla=180, codo=180, tronco=0, visible=1.0, lado_visible="der"):
    """33 puntos de una persona de perfil con la rodilla y el codo doblados los grados indicados.

    tronco = inclinacion de la espalda respecto a la vertical (grados).
    El lado que no es lado_visible se marca con visibilidad baja.
    """
    pts = [SimpleNamespace(x=0.5, y=0.5, z=0.0, visibility=visible) for _ in range(33)]

    def poner(indices, x, y):
        for lado, i in indices.items():
            pts[i] = SimpleNamespace(x=x, y=y, z=0.0,
                                     visibility=visible if lado == lado_visible else 0.1)

    def desde(origen, grados, largo):
        # punto a "largo" de origen, en la direccion "grados" (0 = hacia abajo, positivo = hacia delante)
        r = math.radians(grados)
        return origen[0] + largo * math.sin(r), origen[1] + largo * math.cos(r)

    tobillo = (0.5, 0.9)
    rodilla_p = (0.5, 0.7)
    # el muslo sale de la rodilla formando "rodilla" grados con la espinilla
    cadera = desde(rodilla_p, 180 - (180 - rodilla), 0.2)
    cadera = (rodilla_p[0] - (cadera[0] - rodilla_p[0]), cadera[1]) if rodilla < 180 else (0.5, 0.5)
    hombro = desde(cadera, 180 + tronco, 0.25)
    codo_p = desde(hombro, 0, 0.12)
    muneca = desde(codo_p, 180 - codo, 0.12)
    poner(ej.TOBILLO, *tobillo)
    poner(ej.RODILLA, *rodilla_p)
    poner(ej.CADERA, *cadera)
    poner(ej.HOMBRO, *hombro)
    poner(ej.CODO, *codo_p)
    poner(ej.MUNECA, *muneca)
    return pts


@pytest.mark.parametrize("a, b, c, esperado", [
    ((0, 1), (0, 0), (1, 0), 90),
    ((-1, 0), (0, 0), (1, 0), 180),
    ((1, 1), (0, 0), (1, 0), 45),
    ((1, 0), (0, 0), (1, 0), 0),
])
def test_angulo(a, b, c, esperado):
    assert ej.angulo(a, b, c) == pytest.approx(esperado)


@pytest.mark.parametrize("grados", [180, 150, 120, 90, 70])
def test_medir_rodilla(grados):
    ang, lado = ej.medir(cuerpo(rodilla=grados), "sentadilla")
    assert lado == "der"
    assert ang == pytest.approx(grados, abs=0.5)


@pytest.mark.parametrize("grados", [170, 120, 80, 40])
def test_medir_codo(grados):
    ang, _ = ej.medir(cuerpo(codo=grados), "curl")
    assert ang == pytest.approx(grados, abs=0.5)


def test_elige_el_lado_que_se_ve():
    _, lado = ej.medir(cuerpo(lado_visible="izq"), "sentadilla")
    assert lado == "izq"


def test_sin_visibilidad_no_mide():
    assert ej.medir(cuerpo(visible=0.2), "sentadilla") == (None, None)


def test_la_escala_de_la_imagen_cuenta():
    # En una imagen 16:9 los puntos normalizados se estiran: hay que medir en pixeles
    pts = cuerpo(rodilla=120)
    ang_cuadrado, _ = ej.medir(pts, "sentadilla", 100, 100)
    ang_ancho, _ = ej.medir(pts, "sentadilla", 1600, 900)
    assert ang_cuadrado == pytest.approx(120, abs=0.5)
    assert ang_ancho != pytest.approx(120, abs=5)


def secuencia(contador, angulos):
    reps = [contador.actualizar(a, t * 0.1) for t, a in enumerate(angulos)]
    return sum(reps)


def test_cuenta_sentadillas_completas():
    c = ej.ContadorReps("sentadilla")
    una = [175, 150, 120, 95, 85, 95, 130, 165, 175]
    assert secuencia(c, una * 3) == 3
    assert c.reps == 3
    # cada rep dura desde que empieza a bajar (120) hasta que vuelve arriba (165): 5 frames
    assert c.ritmo_medio() == pytest.approx(0.5)


def test_media_sentadilla_no_cuenta_y_avisa():
    c = ej.ContadorReps("sentadilla")
    assert secuencia(c, [175, 140, 120, 140, 170]) == 0
    assert c.consejo == "Baja mas"
    # La siguiente completa si cuenta y quita el aviso
    assert secuencia(c, [175, 120, 90, 120, 170]) == 1
    assert c.consejo is None


def test_temblor_cerca_del_umbral_no_cuenta_de_mas():
    c = ej.ContadorReps("sentadilla")
    # Abajo, temblando alrededor de 100 grados, y luego arriba: solo 1 rep
    assert secuencia(c, [175, 99, 101, 99, 102, 98, 150, 158, 161]) == 1


def test_frames_sin_cuerpo_se_ignoran():
    c = ej.ContadorReps("flexion")
    assert secuencia(c, [170, None, 80, None, None, 160]) == 1


def test_curl_cuenta_al_cerrar_y_abrir_el_brazo():
    c = ej.ContadorReps("curl")
    assert secuencia(c, [170, 120, 60, 40, 60, 120, 160]) == 1
    assert secuencia(c, [170, 100, 70, 120, 160]) == 0
    assert c.consejo == "Sube mas la mano"


def test_reiniciar():
    c = ej.ContadorReps("flexion")
    secuencia(c, [170, 80, 160])
    c.reiniciar()
    assert c.reps == 0 and c.fase == "arriba" and c.tiempos == []


def test_progreso():
    c = ej.ContadorReps("sentadilla")
    assert c.progreso(160) == 0.0
    assert c.progreso(130) == pytest.approx(0.5)
    assert c.progreso(60) == 1.0
    assert c.progreso(None) == 0.0


def test_postura_sentadilla():
    assert ej.revisar_postura(cuerpo(rodilla=90, tronco=20), "sentadilla", "der") is None
    assert ej.revisar_postura(cuerpo(rodilla=90, tronco=70), "sentadilla", "der") == "Espalda mas recta"


def test_postura_flexion():
    # Cuerpo tumbado en linea recta: hombro, cadera y tobillo alineados
    recto = [SimpleNamespace(x=0, y=0, visibility=1.0) for _ in range(33)]
    recto[12], recto[24], recto[28] = (SimpleNamespace(x=x, y=0.6, visibility=1.0) for x in (0.2, 0.5, 0.8))
    assert ej.revisar_postura(recto, "flexion", "der") is None
    # Cadera hundida
    recto[24] = SimpleNamespace(x=0.5, y=0.75, visibility=1.0)
    assert ej.revisar_postura(recto, "flexion", "der") == "Cadera alineada con el cuerpo"
