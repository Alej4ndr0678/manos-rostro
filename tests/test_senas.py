import numpy as np

import paso14_senas as senas
from conftest import crear_mano, punto

# Tres "senas" inventadas: cada una es una postura de dedos distinta
SENAS = {
    "A": (False, False, False, False, False),   # puno
    "L": (True, True, False, False, False),     # pulgar + indice
    "V": (False, True, True, False, False),     # indice + corazon
}


def muestras_con_ruido(postura, n, rng):
    filas = []
    for _ in range(n):
        mano = crear_mano(postura, dx=rng.uniform(-0.2, 0.2), dy=rng.uniform(-0.1, 0.1))
        mano = [punto(p.x + rng.normal(0, 0.008), p.y + rng.normal(0, 0.008), p.z) for p in mano]
        filas.append(senas.caracteristicas(mano))
    return filas


def datos(rng, n=40):
    X, y = [], []
    for letra, postura in SENAS.items():
        X += muestras_con_ruido(postura, n, rng)
        y += [letra] * n
    return np.array(X), np.array(y)


def test_caracteristicas_no_dependen_de_la_posicion_ni_del_tamano():
    mano = crear_mano(SENAS["L"])
    movida = crear_mano(SENAS["L"], dx=0.2, dy=-0.1)
    # La misma mano al doble de tamano (mas cerca de la camara), alrededor de la muneca
    grande = [punto(0.5 + (p.x - 0.5) * 2, 0.9 + (p.y - 0.9) * 2, p.z * 2) for p in mano]
    base = senas.caracteristicas(mano)
    assert senas.caracteristicas(movida).shape == (63,)
    assert np.allclose(base, senas.caracteristicas(movida), atol=1e-5)
    assert np.allclose(base, senas.caracteristicas(grande), atol=1e-5)


def test_la_mano_izquierda_se_refleja():
    mano = crear_mano(SENAS["L"])
    espejo = [punto(1 - p.x, p.y, p.z) for p in mano]
    assert np.allclose(senas.caracteristicas(mano, "Derecha"), senas.caracteristicas(espejo, "Izquierda"), atol=1e-5)


def test_guardar_y_cargar_csv(tmp_path):
    ruta = tmp_path / "senas.csv"
    rng = np.random.default_rng(0)
    senas.guardar_muestras("A", muestras_con_ruido(SENAS["A"], 3, rng), ruta)
    senas.guardar_muestras("B", muestras_con_ruido(SENAS["V"], 2, rng), ruta)
    X, y = senas.cargar_datos(ruta)
    assert X.shape == (5, 63)
    assert list(y) == ["A", "A", "A", "B", "B"]


def test_cargar_sin_archivo_da_vacio(tmp_path):
    X, y = senas.cargar_datos(tmp_path / "no_existe.csv")
    assert X.shape == (0, 63) and len(y) == 0


def test_aprende_y_reconoce_senas_nuevas():
    rng = np.random.default_rng(1)
    X, y = datos(rng)
    modelo = senas.entrenar(X, y)
    # Ejemplos NUEVOS (no usados para entrenar)
    for letra, postura in SENAS.items():
        for x in muestras_con_ruido(postura, 10, rng):
            prediccion, confianza = senas.predecir(modelo, x)
            assert prediccion == letra
            assert confianza >= senas.CONFIANZA_MINIMA


def test_validacion_cruzada_da_buena_precision():
    X, y = datos(np.random.default_rng(2))
    precision, predicciones = senas.evaluar(X, y)
    assert precision > 0.95
    assert len(predicciones) == len(y)


def test_escritor_escribe_al_mantener_y_no_repite():
    escritor = senas.Escritor()
    t = 0.0
    for _ in range(60):                  # 1,8 s con la misma sena
        escritor.actualizar("A", t)
        t += 0.03
    assert escritor.texto == "A"
    for _ in range(10):                  # quitar la mano
        escritor.actualizar(None, t)
        t += 0.03
    for _ in range(60):
        escritor.actualizar("A", t)
        t += 0.03
    assert escritor.texto == "AA"


def test_escritor_ignora_un_frame_suelto():
    escritor = senas.Escritor()
    t = 0.0
    for i in range(60):
        escritor.actualizar("B" if i == 20 else "A", t)
        t += 0.03
    assert escritor.texto == "A"


def test_escritor_no_escribe_si_no_esta_clara():
    escritor = senas.Escritor()
    for i in range(100):
        escritor.actualizar(None, i * 0.03)
    assert escritor.texto == ""
