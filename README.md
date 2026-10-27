# Detección de manos y rostro en tiempo real

Sistema en Python que usa la webcam para detectar **rostros** y **manos**, contar los **dedos levantados** y generar **partículas** que salen de las puntas de los dedos.

Hecho con [OpenCV](https://opencv.org/) (cámara y dibujo) y [MediaPipe](https://ai.google.dev/edge/mediapipe) (modelos de detección, API *Tasks*).

## Funciones

- Detección de hasta 2 manos con 21 puntos cada una y su lado (izquierda/derecha).
- Detección de rostros con caja, % de confianza y 6 puntos clave.
- Contador de dedos (0 a 5 por mano), con ángulos en 3D para que funcione con la mano girada.
- Pintar en el aire con el dedo índice (efecto neón, paleta de colores, goma y borrado con la mano abierta o el botón *Limpiar*).
- Minijuego: explota bolas de luz con los dedos en 60 segundos, con récord guardado.
- Ratón virtual: mueve el cursor de Windows con la mano, clic con un pellizco, arrastrar y clic derecho.
- Reconocimiento de identidad: te registras una vez y luego el programa dice tu nombre al verte.
- Reconocimiento de 7 gestos: puño, mano abierta, apuntar arriba, pulgar arriba/abajo, victoria y "te quiero".
- Partículas con física (gravedad, rozamiento, brillo) que siguen el movimiento de los dedos. Pellizco = explosión.
- Todo se activa y desactiva con el teclado.

## Requisitos

- Python 3.9 a 3.14 (probado con 3.13)
- Una webcam

## Instalación (Windows / PowerShell)

```powershell
git clone https://github.com/Alej4ndr0678/manos-rostro.git
cd manos-rostro
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

> Si PowerShell bloquea `Activate.ps1`, ejecuta una vez `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

Los modelos de MediaPipe (`gesture_recognizer.task`, `hand_landmarker.task` y `blaze_face_short_range.tflite`) se descargan solos la primera vez.

## Uso

```powershell
python sistema.py
```

| Tecla | Acción |
|-------|--------|
| `r` | Rostro on/off |
| `m` | Esqueleto de manos on/off |
| `c` | Contador de dedos on/off |
| `d` | Depuración de dedos (`P I C A M`) |
| `p` | Partículas on/off |
| `f` | Fondo negro on/off |
| `g` | Nombre del gesto on/off |
| `q` | Salir |

## Pintar en el aire

```powershell
python paso8_pintar.py
```

| Postura | Acción |
|---------|--------|
| Solo el índice levantado | Pintar |
| Índice + corazón (V) | Elegir color, goma o *Limpiar* subiendo el dedo hacia la barra (no hace falta tocarla, basta con pasar la línea gris) |
| Mano abierta 0,6 segundos | Borrar todo |

Teclas: `c` borrar, `s` guardar el dibujo como PNG, `f` fondo negro, `q` salir.

## Minijuego

```powershell
python paso9_juego.py
```

Caen bolas de luz: tócalas con cualquier punta de dedo. Color = +1, dorada = +3, roja (bomba) = -5. La partida dura 60 segundos y cada vez caen más rápido. `espacio` empieza o reinicia, `q` sale. El récord se guarda en `record.txt`.

## Ratón virtual

```powershell
python paso10_raton.py
```

| Postura | Acción |
|---------|--------|
| Mover la mano | Mover el cursor (sigue el nudillo del índice) |
| Pellizco rápido pulgar + índice | Clic izquierdo |
| Pellizco pulgar + índice más de 0,5 s | Arrastrar (suelta al separar los dedos) |
| Pellizco pulgar + corazón | Clic derecho |

Solo hace falta mover la mano dentro del recuadro de la vista previa. `p` pausa o reanuda el control y `q` sale. **Parada de emergencia:** lleva el ratón físico a una esquina de la pantalla.

## Reconocimiento de identidad

```powershell
python paso11_reconocer.py registrar TuNombre   # una vez: guarda 15 muestras de tu cara
python paso11_reconocer.py                     # reconoce a las personas registradas
```

Usa los modelos YuNet (detección) y SFace (reconocimiento) de OpenCV. Cada cara se convierte en 128 números (*embedding*) y se compara por similitud coseno: a partir de 0.363 se considera la misma persona.

> ⚠️ **Seguridad y privacidad:** no sirve como sistema de acceso, porque se engaña con una foto (no tiene detección de vida). Las caras registradas (`caras/`) son datos biométricos: están en el `.gitignore` para que nunca se suban al repo.

## Estructura

Cada paso se puede ejecutar por separado, y `sistema.py` los une:

| Archivo | Qué hace |
|---------|----------|
| `paso1_webcam.py` | Prueba que OpenCV abre la cámara |
| `paso2_manos.py` | Detección de manos |
| `paso3_rostro.py` | Detección de rostro |
| `paso5_dedos.py` | Contador de dedos |
| `paso6_particulas.py` | Efecto de partículas |
| `paso7_gestos.py` | Reconocimiento de gestos |
| `paso8_pintar.py` | Pintar en el aire |
| `paso9_juego.py` | Minijuego de bolas de luz |
| `paso10_raton.py` | Ratón virtual |
| `paso11_reconocer.py` | Reconocimiento de identidad |
| `sistema.py` | Todo junto |

## Cómo funciona

1. OpenCV lee un frame de la webcam y lo voltea (modo espejo).
2. Se convierte de BGR a RGB y se pasa a los detectores de MediaPipe.
3. MediaPipe devuelve las coordenadas (normalizadas de 0 a 1) de manos y rostro.
4. Se pasan a píxeles y OpenCV dibuja encima.
