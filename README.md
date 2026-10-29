# Detección de manos y rostro en tiempo real

[![Pruebas](https://github.com/Alej4ndr0678/manos-rostro/actions/workflows/pruebas.yml/badge.svg)](https://github.com/Alej4ndr0678/manos-rostro/actions/workflows/pruebas.yml)

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
- Desbloqueo biométrico: cara + prueba de vida al azar (parpadeos y giro de cabeza) + PIN marcado con los dedos.
- Control del PC con gestos: volumen, música (play/pausa, siguiente, anterior) y pasar diapositivas.
- Traductor de lengua de señas que entrenas tú: grabas ejemplos de cada seña y un modelo de machine learning (Random Forest) aprende a reconocerlas.
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

Los modelos de MediaPipe (`gesture_recognizer.task`, `hand_landmarker.task`, `face_landmarker.task` y `blaze_face_short_range.tflite`) se descargan solos la primera vez.

## Instalación (Linux)

Para Ubuntu/Debian. En una terminal:

```bash
git clone https://github.com/Alej4ndr0678/manos-rostro.git
cd manos-rostro
bash instalar_linux.sh
source venv/bin/activate
python sistema.py
```

El script instala los paquetes del sistema que hacen falta (`python3-venv`, `python3-tk` para el ratón virtual, `libegl1`/`libgles2` para MediaPipe, `v4l-utils` y `xdotool` para las teclas multimedia), te añade al grupo `video` para poder usar la webcam, crea el entorno virtual e instala `requirements.txt`.

- **Webcam:** en Linux se abre con V4L2 (`/dev/video0`). Si no funciona, mira qué cámaras tienes con `v4l2-ctl --list-devices`. Si acabas de entrar en el grupo `video`, cierra sesión y vuelve a entrar.
- **Ratón virtual:** solo funciona en sesiones **X11**. En **Wayland** (por defecto en Ubuntu 22.04+ y Fedora) el programa avisa y el cursor no se mueve. Elige "Ubuntu en Xorg" en la pantalla de inicio de sesión.
- **Fedora:** cambia el `apt-get` del script por `sudo dnf install python3-tkinter python3-devel mesa-libEGL v4l-utils`.

En el código, todo lo que cambia entre sistemas está en `plataforma.py`.

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
| Índice (o V) por encima de la línea gris | Elegir color, goma o *Limpiar* en la barra (no hace falta tocarla) |
| Índice + corazón (V) | Mover el dedo sin pintar |
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

## Desbloqueo biométrico

El reconocimiento del paso 11 se engaña con una foto tuya en el móvil. El paso 12 es un "sistema de acceso" que intenta evitarlo:

```powershell
python paso11_reconocer.py registrar TuNombre   # una vez: registra tu cara
python paso12_desbloqueo.py pin                 # una vez: elige un PIN de 4 cifras del 1 al 5
python paso12_desbloqueo.py                     # desbloquear
```

1. **Cara:** te tiene que reconocer varios frames seguidos.
2. **Prueba de vida:** te pide un reto **al azar**, por ejemplo *"Parpadea 2 veces y gira la cabeza a la DERECHA"*. Una foto no parpadea, y un vídeo grabado antes no sabe qué reto va a tocar. Durante todo el proceso tiene que seguir siendo tu cara y solo la tuya.
3. **PIN con los dedos:** cada cifra es el número de dedos levantados (mantenlos 1 segundo) y entre cifra y cifra cierras el puño.

Detalles de seguridad que se aplican igual que en sistemas reales:

- El PIN no se guarda tal cual: se guarda su **hash con sal** (PBKDF2-SHA256) en `caras/pin.json`, y se compara con `hmac.compare_digest`.
- Tras **3 fallos** seguidos se **bloquea 30 segundos** (frena la fuerza bruta).
- Cada intento queda en **`accesos.log`** con fecha, resultado y motivo (auditoría).

**Límites:** frena fotos y vídeos grabados, pero no una máscara 3D realista ni un deepfake en tiempo real (los móviles usan cámaras de profundidad o infrarrojos para eso). Además, un PIN de 4 cifras del 1 al 5 solo tiene 625 combinaciones. Es un proyecto para aprender cómo funcionan estas defensas, no para proteger nada importante.

## Control del PC con gestos

```powershell
python paso13_control.py
```

| Gesto | Modo música | Modo diapositivas |
|-------|-------------|-------------------|
| 👍 Pulgar arriba (mantener) | Subir volumen | Subir volumen |
| 👎 Pulgar abajo (mantener) | Bajar volumen | Bajar volumen |
| 🤟 "Te quiero" (mantener) | Silenciar | Silenciar |
| ✊ Puño (mantener) | Play / pausa | — |
| 🖐️ Mano abierta deslizando a la izquierda | Siguiente canción | Siguiente diapositiva |
| 🖐️ Mano abierta deslizando a la derecha | Canción anterior | Diapositiva anterior |

Teclas en la ventana de la cámara: `m` cambia entre modo música y diapositivas, `p` pausa el control y `q` sale.

- Hay que **mantener** los gestos medio segundo, para que no se disparen sin querer.
- **Diapositivas:** las flechas le llegan a la ventana activa. Después de abrir el programa, haz clic en la presentación (PowerPoint, Google Slides, un PDF...). El volumen y la música funcionan siempre.
- **Linux:** usa `xdotool` para las teclas multimedia (lo instala `instalar_linux.sh`) y, como el ratón virtual, necesita una sesión X11.

## Traductor de lengua de señas

Aquí el modelo lo entrenas tú, así que reconoce las señas que le enseñes (letras del alfabeto dactilológico, números o lo que quieras):

```powershell
python paso14_senas.py grabar A     # graba 150 ejemplos de la seña "A" (mueve un poco la mano)
python paso14_senas.py grabar B     # ...una vez por cada seña
python paso14_senas.py entrenar     # precisión, informe por seña y matriz de confusión
python paso14_senas.py              # traducir en tiempo real
```

Al traducir, mantener una seña 1 segundo la escribe. Teclas: `espacio` añade un espacio, `b` borra una letra, `c` borra todo y `q` sale.

Cómo funciona:

1. De cada mano se sacan **63 números** (x, y, z de los 21 puntos) **normalizados**: se resta la muñeca y se divide por el tamaño de la mano, así da igual dónde esté la mano y lo cerca que estés. La mano izquierda se refleja, así que vale cualquier mano.
2. Los ejemplos se guardan en `senas.csv` (ignorado por git).
3. Un **Random Forest** (muchos árboles de decisión que votan) aprende qué números corresponden a cada seña. `entrenar` lo evalúa con **validación cruzada**: lo prueba con ejemplos que no ha visto al entrenar.
4. El modelo se entrena al arrancar (tarda menos de un segundo) y **no se guarda con `pickle`** a propósito: cargar un pickle puede ejecutar código, y es un fallo de seguridad clásico.

Consejos: graba cada seña con buena luz, girando y acercando un poco la mano. Si `entrenar` muestra que dos señas se confunden, graba más ejemplos de ellas. Las señas con movimiento (como la J o la Z) no se pueden reconocer así, porque el modelo solo ve una foto de la mano.

## Pruebas

Las pruebas comprueban que todo sigue funcionando después de cada cambio, sin tener que abrir la webcam:

```powershell
pip install -r requirements-dev.txt
python -m pytest                    # todas (la primera vez descarga modelos y fotos de ejemplo)
python -m pytest -m "not modelos"   # solo las rápidas, sin modelos ni internet
```

- **Rápidas:** usan manos "inventadas" (21 puntos con coordenadas puestas a mano) para probar el contador de dedos, pintar, el minijuego, el ratón virtual y los hilos.
- **Con modelos:** usan fotos de ejemplo de MediaPipe para comprobar que los gestos, las manos, el rostro y la identidad se detectan de verdad, y arrancan `sistema.py` completo con una cámara simulada.

GitHub Actions las ejecuta solo en cada push y en cada pull request, en Windows y en Linux (`.github/workflows/pruebas.yml`). La insignia de arriba se pone verde si todo pasa.

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
| `paso12_desbloqueo.py` | Desbloqueo con cara, prueba de vida y PIN de dedos |
| `paso13_control.py` | Control de música, volumen y diapositivas con gestos |
| `paso14_senas.py` | Traductor de lengua de señas entrenable |
| `hilos.py` | Cámara y detección en hilos separados (más FPS) |
| `plataforma.py` | Diferencias entre Windows y Linux (cámara, ratón) |
| `instalar_linux.sh` | Instalación en Linux |
| `sistema.py` | Todo junto |
| `tests/` | Pruebas automáticas (`pytest`) |

## Rendimiento

`sistema.py` usa tres hilos para que nada espere a nada:

1. **Cámara** (`CamaraEnHilo`): lee la webcam sin parar y guarda el último frame.
2. **Detección** (`DetectorEnHilo`): manos y cara sobre el frame más reciente; si llega uno nuevo mientras trabaja, se descarta el viejo.
3. **Principal**: solo dibuja y muestra, así que el vídeo va a la velocidad de la cámara aunque la detección sea más lenta.

Arriba se ven los dos valores: `FPS` (vídeo) y `deteccion`.

## Cómo funciona

1. OpenCV lee un frame de la webcam y lo voltea (modo espejo).
2. Se convierte de BGR a RGB y se pasa a los detectores de MediaPipe.
3. MediaPipe devuelve las coordenadas (normalizadas de 0 a 1) de manos y rostro.
4. Se pasan a píxeles y OpenCV dibuja encima.
