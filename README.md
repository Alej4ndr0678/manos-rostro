# Detección de manos y rostro en tiempo real

[![Pruebas](https://github.com/Alej4ndr0678/manos-rostro/actions/workflows/pruebas.yml/badge.svg)](https://github.com/Alej4ndr0678/manos-rostro/actions/workflows/pruebas.yml)

**🌐 Pruébalo en el navegador, sin instalar nada:** https://alej4ndr0678.github.io/manos-rostro/

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
- Versión web: detección, partículas y pintar en el aire directamente en el navegador (también en el móvil).
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

## Contador de ejercicio

```powershell
python paso15_ejercicio.py              # sentadillas
python paso15_ejercicio.py flexion
python paso15_ejercicio.py curl
```

Usa el modelo de **pose** de MediaPipe (33 puntos del cuerpo) y mide el ángulo de una articulación:

| Ejercicio | Ángulo que mide | Cuenta una repetición cuando... |
|-----------|-----------------|---------------------------------|
| Sentadilla | Rodilla (cadera, rodilla, tobillo) | bajas de 100° y vuelves por encima de 160° |
| Flexión | Codo (hombro, codo, muñeca) | bajas de 90° y vuelves por encima de 150° |
| Curl de bíceps | Codo | cierras el brazo por debajo de 50° y lo estiras por encima de 150° |

- Si empiezas a bajar pero vuelves sin llegar abajo, **no cuenta** y te avisa ("Baja más").
- **Postura:** en la sentadilla avisa si inclinas demasiado la espalda; en la flexión, si la cadera se hunde o se levanta.
- La barra de la derecha muestra cuánto has bajado (se pone verde al llegar abajo), y el panel muestra las repeticiones y los segundos que tardas en cada una.
- Teclas: `1` sentadilla, `2` flexión, `3` curl, `r` reiniciar y `q` salir.
- **Consejo:** ponte **de lado** a la cámara y que se te vea el cuerpo entero. El programa usa el lado del cuerpo que mejor se ve.

## Teclado en el aire

```powershell
python paso16_teclado.py
```

Aparece un teclado encima de la imagen de la cámara:

- **Apuntar:** la punta del dedo índice es el cursor.
- **Pulsar:** junta la punta del **pulgar** con la del **corazón**. Así el índice no se mueve al pulsar y no te equivocas de tecla.
- **Modo mirar** (tecla `m`): en vez de pellizcar, deja el dedo quieto 0,8 s sobre una tecla. Un círculo alrededor del cursor muestra cuánto falta.
- **Sugerencias:** la fila de arriba propone 3 palabras que empiezan como la que estás escribiendo. Aprende las palabras que vas escribiendo y pone primero las que más usas.
- `MAYUS` pone en mayúscula solo la siguiente letra, como en el móvil.
- **Escribir en otras aplicaciones** (tecla `e`): lo que escribas en el aire le llega también a la ventana activa (un bloc de notas, el navegador...). Haz clic en ella después de activarlo. En Linux necesita una sesión X11, igual que el ratón virtual. La `ñ` no se puede enviar así, porque `pyautogui` solo sabe teclear caracteres ASCII.
- `q` sale y muestra en la terminal todo lo que has escrito.

## Emociones y filtros

```powershell
python paso17_emociones.py
```

El modelo de malla facial devuelve 52 **blendshapes**: números de 0 a 1 que dicen cuánto se mueve cada parte de la cara (sonrisa, cejas, boca abierta, cada ojo...). Combinándolos se detectan 6 expresiones, cada una con su filtro:

| Expresión | Qué mira | Filtro |
|-----------|----------|--------|
| 😄 Alegría | Sonrisa | Estrellas |
| 😮 Sorpresa | Cejas arriba + boca abierta | Un «!» enorme |
| 😠 Enfado | Cejas abajo + nariz arrugada | Tinte rojo y «#@!%» |
| 😢 Tristeza | Comisuras hacia abajo + cejas | Tinte azul y lágrimas |
| 😘 Beso | Labios en forma de beso | Corazones |
| 😉 Guiño | Un ojo cerrado y el otro abierto | Estrellas en los ojos |

- Al reír de verdad, las cejas bajan y los ojos se achinan, así que el enfado, la sorpresa y la tristeza se multiplican por *(1 − sonrisa)* para no confundir una carcajada con un enfado.
- **Calibrar** (tecla `n`): cada cara es distinta, y hay quien tiene las cejas bajas sin estar enfadado. Mira a la cámara sin expresión durante 1 segundo. A partir de ahí se mide lo que cambias respecto a tu cara normal.
- **Foto al sonreír** (tecla `a`): hace una foto sola cuando sonríes durante medio segundo. `s` hace una foto en cualquier momento. Se guardan como `foto_*.png` (ignoradas por git).
- Otras teclas: `f` activa o quita los filtros y `q` sale.
- Las barras de la izquierda muestran cada puntuación, y la línea roja marca el umbral a partir del cual cuenta.

## Versión web

La carpeta `web/` tiene una versión que funciona en el navegador con [MediaPipe para JavaScript](https://ai.google.dev/edge/mediapipe/solutions/vision/gesture_recognizer/web_js): detección de manos, dedos, gestos y rostro, partículas, pintar en el aire, el **minijuego** de las bolas de luz (modo 4; el récord se guarda en el navegador) un **avatar** que imita tu cara (modo 5) un **instrumento musical** (modo 6) **objetos 3D** que agarras con las manos (modo 7), **Pong** (modo 8) y **Ninja**, un corta frutas (modo 9). Se publica sola en **GitHub Pages**: https://alej4ndr0678.github.io/manos-rostro/

- **Privacidad:** todo se procesa en tu dispositivo. El vídeo no sale del navegador.
- **Probarla en local:** la cámara solo funciona con HTTPS o en `localhost`:
  ```powershell
  cd web
  python -m http.server 8000
  ```
  y abre http://localhost:8000
- **Avatar (modo 5):** un personaje (emoji, gato o robot) tapa tu cara y copia tus expresiones: parpadeos y guiños, cejas, sonrisa, boca abierta, morritos, mirada y giro e inclinación de la cabeza. Usa los 52 *blendshapes* de la malla facial y, si hay varias personas, cada una lleva el suyo. La tecla `a` cambia de personaje, «Ocultar la cámara» deja solo el avatar sobre un fondo y «Foto» guarda la imagen.
- **Música (modo 6):** la mitad izquierda es una **batería** de 4 pads (bombo, caja, charles y palmas) que suenan al meter la punta del índice o del corazón. La mitad derecha es un **theremin**: la altura del índice elige la nota de una escala pentatónica (de C4 a C6, así casi todo suena bien), la posición horizontal cambia el timbre y el puño lo calla. Hay tres instrumentos (sintetizador, órgano y flauta). Todo el sonido se genera con la Web Audio API, sin archivos de audio.
- **3D (modo 7):** cuatro objetos 3D hechos con [Three.js](https://threejs.org/): un cubo, un nudo, un planeta con anillos y una gema. **Pellizca** (pulgar + índice) cerca de uno para agarrarlo y moverlo, **gira la muñeca** para girarlo y agárralo con **las dos manos** para hacerlo más grande o más pequeño separándolas o juntándolas. Si lo sueltas en movimiento sale lanzado, rebota en los bordes y va frenando. Three.js solo se descarga al entrar en este modo.
- **Pong (modo 8):** la mano de la mitad izquierda mueve la pala izquierda y la de la derecha, la derecha. Se juega con un amigo o, con una sola mano, contra el ordenador (que tiene velocidad limitada, así que se le puede ganar). La pelota acelera en cada golpe y sale más inclinada cuanto más lejos del centro de la pala la golpeas. Gana quien llegue a 7.
- **Ninja (modo 9):** corta frutas con la punta del índice, como en *Fruit Ninja*. Al mover el dedo rápido deja una estela que corta; cada fruta se parte en dos mitades (por la línea del tajo) y salpica zumo. Cortar 3 o más de un solo tajo es un **combo** con puntos extra. Si se te caen 3 frutas, o cortas una 💣, se acaba. Para empezar y para volver a jugar se corta la sandía del centro, así que no hace falta tocar el teclado. Cada vez salen más frutas y más bombas, y el récord se guarda en el navegador.
- **Portada y enlaces directos:** antes de activar la cámara la página muestra una tarjeta por modo; al pulsar una, arranca directamente en ese modo. La dirección cambia con el modo (`.../manos-rostro/#musica`, `#pong`, `#objetos`...), así que puedes compartir un enlace que abre justo ese modo. La tecla `f` o el botón «Pantalla completa» ponen la cámara a pantalla completa.
- **Grabar vídeo:** el botón «Grabar vídeo» (o la tecla `g`) graba lo que ves, con los efectos y, en los modos con sonido, también el audio. Al pulsar «Parar» se descarga el vídeo (MP4 o WebM, según el navegador). Como mucho dura 60 segundos y no se sube a ningún sitio.
- **Código:** `js/dedos.js` (contador de dedos, la misma lógica que `paso5_dedos.py`), `js/particulas.js`, `js/pintar.js`, `js/juego.js` (el minijuego, la misma lógica que `paso9_juego.py`), `js/avatar.js`, `js/musica.js`, `js/manipular.js` (agarrar y lanzar), `js/escena3d.js` (Three.js), `js/pong.js`, `js/ninja.js` y `js/main.js` (cámara, modelos y dibujo). Las pruebas de la lógica están en `web/tests/` y se ejecutan con `npm test` dentro de `web/` (hace falta [Node.js](https://nodejs.org/)).
- **Publicación:** `.github/workflows/web.yml` la sube a GitHub Pages en cada push a `main` que cambie `web/`. Hay que activarlo una vez en *Settings → Pages → Source: GitHub Actions*.

## Pruebas

Las pruebas comprueban que todo sigue funcionando después de cada cambio, sin tener que abrir la webcam:

```powershell
pip install -r requirements-dev.txt
python -m pytest                    # todas (la primera vez descarga modelos y fotos de ejemplo)
python -m pytest -m "not modelos"   # solo las rápidas, sin modelos ni internet
```

- **Rápidas:** usan manos "inventadas" (21 puntos con coordenadas puestas a mano) para probar el contador de dedos, pintar, el minijuego, el ratón virtual y los hilos.
- **Con modelos:** usan fotos de ejemplo de MediaPipe para comprobar que los gestos, las manos, el rostro y la identidad se detectan de verdad, y arrancan `sistema.py` completo con una cámara simulada.

### Estilo y revisiones antes de cada commit

[ruff](https://docs.astral.sh/ruff/) revisa el código y busca errores típicos: imports sin usar, variables que no existen, imports desordenados o sintaxis antigua. La configuración está en `ruff.toml`.

```powershell
ruff check .          # revisar
ruff check . --fix    # arreglar lo que sabe arreglar solo
```

Con **pre-commit** se ejecuta solo antes de cada commit, y si algo falla el commit no se hace:

```powershell
pre-commit install            # una vez
pre-commit run --all-files    # a mano, sobre todo el repo
```

Además de ruff, `.pre-commit-config.yaml` **bloquea** los commits que incluyan datos personales (`caras/`, `accesos.log`, `senas.csv` y las fotos `foto_*.png`) o modelos descargados (`.task`, `.tflite`, `.onnx`). Es una segunda barrera por si algún día se toca el `.gitignore`.

GitHub Actions las ejecuta solo en cada push y en cada pull request, en Windows y en Linux, junto con las de la versión web y la revisión de ruff (`.github/workflows/pruebas.yml`). La insignia de arriba se pone verde si todo pasa.

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
| `paso15_ejercicio.py` | Contador de ejercicio con la pose del cuerpo |
| `paso16_teclado.py` | Teclado virtual en el aire con sugerencias de palabras |
| `paso17_emociones.py` | Expresiones de la cara con filtros y foto al sonreír |
| `hilos.py` | Cámara y detección en hilos separados (más FPS) |
| `plataforma.py` | Diferencias entre Windows y Linux (cámara, ratón) |
| `instalar_linux.sh` | Instalación en Linux |
| `sistema.py` | Todo junto |
| `tests/` | Pruebas automáticas (`pytest`) |
| `web/` | Versión para el navegador (GitHub Pages) |

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
