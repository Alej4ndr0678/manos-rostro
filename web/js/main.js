// Version web: lo mismo que sistema.py pero en el navegador, con MediaPipe para JavaScript.
// Todo se procesa en TU ordenador: el video de la camara no se envia a ningun servidor.
import {
  FaceDetector,
  FaceLandmarker,
  FilesetResolver,
  GestureRecognizer,
  PoseLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/vision_bundle.mjs";
import { dibujarAvatar, ESTILOS, parametros, pose, Suavizado } from "./avatar.js";
import { dedosLevantados, Suavizador } from "./dedos.js";
import { crearEscena, crearEscultura, crearHolograma, OBJETOS } from "./escena3d.js";
import { Escultura, MAX_PUNTOS } from "./escultura.js";
import { centrarMalla, Explosion, Rotador } from "./holograma.js";
import { anclas, Arcoiris, BOCA_ABIERTA, dibujarArcoiris, dibujarFiltro, FILTROS } from "./filtros.js";
import { Juego } from "./juego.js";
import { Chispas, EXTREMOS, visibles } from "./neon.js";
import { leerMano, Manipulador } from "./manipular.js";
import { Ninja, VIDAS } from "./ninja.js";
import { ESPERA_EMPEZAR, MANTENER, Reto, VIDAS as VIDAS_RETO } from "./reto.js";
import { ALTO_PALA, Pong, PUNTOS_PARA_GANAR, X_PALAS } from "./pong.js";
import { Bateria, nota, NUM_NOTAS, PADS, Sintetizador, Theremin } from "./musica.js";
import { Particulas, PUNTAS } from "./particulas.js";
import { ALTO_BARRA, PALETA, Pizarra, ZONA_SELECCION } from "./pintar.js";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
const MODELO_GESTOS =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task";
const MODELO_MALLA =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";
const MODELO_POSE =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";
const MODELO_ROSTRO =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite";

const GESTOS = {
  Closed_Fist: "Puño",
  Open_Palm: "Mano abierta",
  Pointing_Up: "Apuntar arriba",
  Thumb_Up: "Pulgar arriba",
  Thumb_Down: "Pulgar abajo",
  Victory: "Victoria",
  ILoveYou: "Te quiero",
};
// Aqui NO volteamos la imagen antes de detectar (solo al dibujarla), asi que la etiqueta
// de MediaPipe ya coincide con tu mano real. En Python volteamos antes, por eso alli se invierte.
const LADO = { Left: "Izquierda", Right: "Derecha" };
const COLOR_LADO = { Izquierda: "#38bdf8", Derecha: "#fb923c" };

const MODOS = ["deteccion", "particulas", "pintar", "juego", "avatar", "musica", "objetos", "pong", "ninja", "holograma", "escultura", "reto", "neon"];
// Modos en los que se pueden ver el esqueleto de las manos y las cajas de los rostros
const MODOS_CON_OPCIONES = ["deteccion", "particulas", "pintar"];
const $ = (id) => document.getElementById(id);
const video = $("video");
const lienzo = $("lienzo");
const ctx = lienzo.getContext("2d");
const capaPintura = document.createElement("canvas");
const ctxPintura = capaPintura.getContext("2d");

let reconocedor = null;
let detectorRostro = null;
let modo = "deteccion";
let pizarra = null;
let juego = null;
let archivosVision = null;
let delegado = "GPU";
let malla = null; // malla facial (solo se carga al entrar en el modo avatar)
let cargandoMalla = null;
let resultadoMalla = null;
let estiloAvatar = 0;
const ESTILOS_TODOS = [...ESTILOS, ...FILTROS]; // personajes que tapan la cara + filtros encima de ella
const arcoiris = []; // uno por cara
let anteriorAvatar = null;
const suavizadosAvatar = [];
let sinte = null; // se crea al entrar en el modo musica (el navegador exige un clic antes de sonar)
const bateria = new Bateria();
const theremin = new Theremin();
let instrumento = "sintetizador";
const ondas = []; // circulos que se expanden al golpear un pad
let escena3d = null; // Three.js solo se carga al entrar en el modo 3D
let cargandoEscena = null;
let manipulador = null;
let anteriorObjetos = null;
let pong = null;
let anteriorPong = null;
const estela = []; // ultimas posiciones de la pelota
let ninja = null;
let anteriorNinja = null;
const textosNinja = []; // "+3 COMBO", "✕"... que flotan un momento
let flashNinja = 0; // destello blanco al cortar una bomba
let holograma = null; // Three.js + malla facial, solo al entrar en el modo
let cargandoHolograma = null;
const rotador = new Rotador();
let anteriorHolograma = null;
let pellizcoHolograma = false;
let congelado = false;
const explosion = new Explosion();
let ultimaMalla = null; // la ultima cara vista (para seguir dibujandola si se congela o se va)
let escenaEscultura = null; // Three.js, solo al entrar en el modo
let cargandoEscultura = null;
let escultura = null;
let anteriorEscultura = null;
let pellizcoEscultura = false;
let reto = null;
let detectorPose = null; // solo se carga al entrar en el modo neon
let cargandoPose = null;
let resultadoPose = null;
const capaNeon = document.createElement("canvas"); // aqui se acumula la estela
const ctxNeon = capaNeon.getContext("2d");
const chispas = new Chispas();
let anteriorNeon = null;
let anteriorReto = null;
let destelloReto = { color: null, hasta: 0 }; // verde al acertar, rojo al fallar
const particulas = new Particulas();
const suavizador = new Suavizador();
let ultimoTiempoVideo = -1;
let resultadoManos = null;
let resultadoRostro = null;
let fps = 0;
let anterior = performance.now();

function verRostro() {
  return $("ver-rostro").checked && MODOS_CON_OPCIONES.includes(modo);
}

function estado(texto) {
  $("estado").textContent = texto;
}

async function crearModelos() {
  const archivos = await FilesetResolver.forVisionTasks(WASM);
  archivosVision = archivos;
  // Intentamos usar la GPU; si el navegador no puede, la CPU
  for (const delegate of ["GPU", "CPU"]) {
    try {
      reconocedor = await GestureRecognizer.createFromOptions(archivos, {
        baseOptions: { modelAssetPath: MODELO_GESTOS, delegate },
        runningMode: "VIDEO",
        numHands: 2,
      });
      detectorRostro = await FaceDetector.createFromOptions(archivos, {
        baseOptions: { modelAssetPath: MODELO_ROSTRO, delegate },
        runningMode: "VIDEO",
      });
      delegado = delegate;
      return delegate;
    } catch (error) {
      console.warn(`No se pudo usar ${delegate}:`, error);
    }
  }
  throw new Error("No se pudieron cargar los modelos");
}

// Modo con el que arrancar: el de la tarjeta pulsada o el de la direccion (ej. ...#musica)
let modoInicial = MODOS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "deteccion";

async function empezar() {
  if ($("empezar").disabled) return;
  $("empezar").disabled = true;
  try {
    estado("Pidiendo permiso para la cámara…");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    estado("Cargando modelos (la primera vez tarda unos segundos)…");
    const delegate = await crearModelos();
    lienzo.width = capaPintura.width = video.videoWidth;
    lienzo.height = capaPintura.height = video.videoHeight;
    pizarra = new Pizarra(ctxPintura, lienzo.width, lienzo.height);
    juego = new Juego(lienzo.width, lienzo.height);
    juego.record = leerRecord();
    $("portada").hidden = true;
    $("galeria").hidden = true;
    $("controles").hidden = false;
    estado(`Funcionando (${delegate === "GPU" ? "GPU" : "CPU"})`);
    cambiarModo(modoInicial);
    requestAnimationFrame(bucle);
  } catch (error) {
    console.error(error);
    $("empezar").disabled = false;
    estado(
      error.name === "NotAllowedError"
        ? "Has denegado el permiso de la cámara. Actívalo en el candado de la barra de direcciones."
        : `Error: ${error.message}`,
    );
  }
}

// Pasa un punto de MediaPipe (0 a 1, sin voltear) a pixeles en la imagen en modo espejo
function aPixeles(p) {
  return { x: (1 - p.x) * lienzo.width, y: p.y * lienzo.height };
}

function manosEnPixeles() {
  if (!resultadoManos) return [];
  return resultadoManos.landmarks.map((puntos, i) => {
    const lado = LADO[resultadoManos.handedness[i][0].categoryName] ?? "Derecha";
    const gesto = resultadoManos.gestures[i]?.[0];
    return {
      lado,
      puntos: puntos.map(aPixeles),
      dedos: suavizador.actualizar(lado, dedosLevantados(puntos, resultadoManos.worldLandmarks[i])),
      gesto: gesto && gesto.score >= 0.6 ? GESTOS[gesto.categoryName] : null,
    };
  });
}

function texto(t, x, y, tamano = 28, color = "#fff") {
  ctx.font = `700 ${tamano}px system-ui, sans-serif`;
  ctx.lineWidth = 6;
  ctx.lineJoin = "round"; // sin esto, letras como la M sacan "pinchos" en el borde
  ctx.strokeStyle = "rgba(0,0,0,0.8)";
  ctx.strokeText(t, x, y);
  ctx.fillStyle = color;
  ctx.fillText(t, x, y);
}

// Texto centrado en horizontal; si no cabe (camara estrecha o movil), se reduce la letra
function textoCentrado(t, y, tamano = 28, color = "#fff") {
  ctx.font = `700 ${tamano}px system-ui, sans-serif`;
  const ancho = ctx.measureText(t).width;
  if (ancho > lienzo.width * 0.92) tamano = Math.floor((tamano * lienzo.width * 0.92) / ancho);
  ctx.font = `700 ${tamano}px system-ui, sans-serif`;
  texto(t, (lienzo.width - ctx.measureText(t).width) / 2, y, tamano, color);
}

function dibujarEsqueleto(mano) {
  ctx.strokeStyle = COLOR_LADO[mano.lado];
  ctx.lineWidth = 3;
  for (const { start, end } of GestureRecognizer.HAND_CONNECTIONS) {
    ctx.beginPath();
    ctx.moveTo(mano.puntos[start].x, mano.puntos[start].y);
    ctx.lineTo(mano.puntos[end].x, mano.puntos[end].y);
    ctx.stroke();
  }
  ctx.fillStyle = "#fff";
  for (const p of mano.puntos) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function dibujarRostros() {
  if (!resultadoRostro || !verRostro()) return 0;
  for (const deteccion of resultadoRostro.detections) {
    const caja = deteccion.boundingBox;
    const x = lienzo.width - caja.originX - caja.width; // espejo
    ctx.strokeStyle = "#4ade80";
    ctx.lineWidth = 3;
    ctx.strokeRect(x, caja.originY, caja.width, caja.height);
    texto(`${Math.round(deteccion.categories[0].score * 100)}%`, x, caja.originY - 8, 20, "#4ade80");
  }
  return resultadoRostro.detections.length;
}

function dibujarBarraPintura(ahora) {
  const anchoCaja = lienzo.width / PALETA.length;
  const alto = ALTO_BARRA * lienzo.height;
  PALETA.forEach(({ nombre, color }, i) => {
    const extra = i === pizarra.encima ? 12 : 0;
    ctx.fillStyle = color ?? "#3f3f46";
    ctx.fillRect(i * anchoCaja + 4, 4, anchoCaja - 8, alto - 8 + extra);
    if (i === pizarra.color) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 4;
      ctx.strokeRect(i * anchoCaja + 2, 2, anchoCaja - 4, alto - 4 + extra);
    }
    ctx.font = "600 16px system-ui, sans-serif";
    ctx.fillStyle = color ? "#000" : "#fff";
    ctx.fillText(nombre, i * anchoCaja + 12, alto - 16 + extra);
  });
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, ZONA_SELECCION * lienzo.height);
  ctx.lineTo(lienzo.width, ZONA_SELECCION * lienzo.height);
  ctx.stroke();
  const progreso = pizarra.progresoBorrado(ahora);
  if (progreso > 0) {
    texto("Borrando…", 16, lienzo.height - 44, 24, "#f87171");
    ctx.fillStyle = "#f87171";
    ctx.fillRect(16, lienzo.height - 32, 240 * progreso, 14);
  }
}

// El record se guarda en el navegador. Si no se puede (modo privado...), se juega igual.
function leerRecord(clave = "record-juego") {
  try {
    return Number(localStorage.getItem(clave)) || 0;
  } catch {
    return 0;
  }
}

function guardarRecord(puntos, clave = "record-juego") {
  try {
    localStorage.setItem(clave, String(puntos));
  } catch {
    // sin almacenamiento: el record solo dura esta visita
  }
}

function empezarPartida() {
  if (!juego || juego.estado === "jugando") return;
  juego.empezar(performance.now() / 1000);
  $("jugar").textContent = "Jugando…";
  $("jugar").disabled = true;
}

function dibujarJuego(manos, ahora) {
  const puntas = manos.flatMap((m) => PUNTAS.map((i) => m.puntos[i]));
  const antes = juego.estado;
  for (const bola of juego.actualizar(puntas, ahora)) {
    const rgb = bola.color.match(/\w\w/g).map((h) => parseInt(h, 16));
    particulas.emitir(bola.x, bola.y, 0, 0, rgb, 40, 10);
  }
  if (antes === "jugando" && juego.estado === "fin") {
    if (juego.nuevoRecord) guardarRecord(juego.record);
    $("jugar").textContent = "Otra partida";
    $("jugar").disabled = false;
  }

  ctx.save();
  if (juego.temblando(ahora)) ctx.translate(Math.random() * 24 - 12, Math.random() * 24 - 12);
  ctx.globalCompositeOperation = "lighter";
  for (const bola of juego.bolas) {
    ctx.shadowColor = bola.color;
    ctx.shadowBlur = 30;
    ctx.fillStyle = bola.color;
    ctx.beginPath();
    ctx.arc(bola.x, bola.y, bola.radio, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(bola.x, bola.y, bola.radio / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  for (const bola of juego.bolas) {
    if (bola.tipo === "bomba") texto("✕", bola.x - 10, bola.y + 10, 28, "#ff3030");
  }
  particulas.actualizarYDibujar(ctx);
  for (const p of puntas) {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.stroke();
  }

  const medio = lienzo.height / 2;
  if (juego.estado === "inicio") {
    textoCentrado("EXPLOTA LAS BOLAS DE LUZ", medio - 60, 48, "#67e8f9");
    textoCentrado("Color +1 · Dorada +3 · Roja −5", medio, 30);
    textoCentrado("Pulsa «Empezar partida» o Espacio", medio + 56, 26, "#4ade80");
    textoCentrado(`Récord: ${juego.record}`, medio + 104, 24);
  } else if (juego.estado === "jugando") {
    texto(`Puntos: ${juego.puntos}`, 16, 44, 32);
    textoCentrado(`${Math.ceil(juego.tiempoRestante(ahora))}`, 48, 40, "#fbbf24");
  } else {
    textoCentrado("FIN DEL JUEGO", medio - 60, 56, "#f87171");
    textoCentrado(`Puntos: ${juego.puntos}`, medio, 36);
    textoCentrado(juego.nuevoRecord ? "¡NUEVO RÉCORD!" : `Récord: ${juego.record}`, medio + 50, 30, "#fbbf24");
  }
}

// ---------- Avatar ----------

function cargarMalla() {
  cargandoMalla ??= (async () => {
    estado("Cargando la malla facial…");
    for (const delegate of [delegado, "CPU"]) {
      try {
        malla = await FaceLandmarker.createFromOptions(archivosVision, {
          baseOptions: { modelAssetPath: MODELO_MALLA, delegate },
          runningMode: "VIDEO",
          numFaces: 3,
          outputFaceBlendshapes: true,
        });
        estado(`Funcionando (${delegado})`);
        return;
      } catch (error) {
        console.warn(`Malla facial con ${delegate}:`, error);
      }
    }
    estado("No se pudo cargar la malla facial.");
  })();
  return cargandoMalla;
}

function cambiarEstilo(i) {
  estiloAvatar = (i + ESTILOS_TODOS.length) % ESTILOS_TODOS.length;
  for (const boton of document.querySelectorAll("[data-estilo]")) {
    boton.setAttribute("aria-pressed", String(boton.dataset.estilo === ESTILOS_TODOS[estiloAvatar]));
  }
}

function dibujarAvatares() {
  if (!resultadoMalla) {
    texto("Cargando la malla facial…", 16, 44, 28);
    return 0;
  }
  const soloAvatar = $("solo-avatar").checked;
  if (soloAvatar) {
    const fondo = ctx.createLinearGradient(0, 0, 0, lienzo.height);
    fondo.addColorStop(0, "#1e1b4b");
    fondo.addColorStop(1, "#0f766e");
    ctx.fillStyle = fondo;
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  }
  const ahora = performance.now() / 1000;
  const dt = anteriorAvatar === null ? 1 / 60 : ahora - anteriorAvatar;
  anteriorAvatar = ahora;
  resultadoMalla.faceLandmarks.forEach((puntos, i) => {
    const px = puntos.map(aPixeles);
    // Cada cara con un estilo distinto: la primera el elegido, las demas los siguientes
    const estilo = ESTILOS_TODOS[(estiloAvatar + i) % ESTILOS_TODOS.length];
    if (FILTROS.includes(estilo)) {
      // Filtro: se dibuja encima de la cara de verdad, siguiendo sus puntos
      const a = anclas(px);
      arcoiris[i] ??= new Arcoiris();
      const abierta = estilo !== "perro" && a.abertura > BOCA_ABIERTA;
      dibujarArcoiris(ctx, arcoiris[i].actualizar(abierta, a.boca, a.abajo, a.altoCara, dt));
      dibujarFiltro(ctx, estilo, a, ahora);
      return;
    }
    const g = pose(px);
    const formas = Object.fromEntries(resultadoMalla.faceBlendshapes[i].categories.map((c) => [c.categoryName, c.score]));
    suavizadosAvatar[i] ??= new Suavizado(0.5);
    const p = suavizadosAvatar[i].actualizar({ ...parametros(formas), yaw: g.yaw, pitch: g.pitch, roll: g.roll });
    const radio = Math.max(g.ancho * 0.62, g.alto * 0.55) * (soloAvatar ? 1.2 : 1);
    // Que no se salga por arriba (las orejas y la antena sobresalen)
    const y = soloAvatar ? Math.max(g.y, radio * 1.45) : g.y;
    ctx.save();
    ctx.translate(g.x, y);
    ctx.rotate(p.roll);
    ctx.scale(radio, radio);
    dibujarAvatar(ctx, p, { yaw: p.yaw, pitch: p.pitch }, estilo);
    ctx.restore();
  });
  return resultadoMalla.faceLandmarks.length;
}

// ---------- Musica ----------

function activarAudio() {
  try {
    if (!sinte) sinte = new Sintetizador(new AudioContext());
    sinte.audio.resume();
  } catch (error) {
    console.warn("Sin audio:", error);
    estado("Este navegador no deja reproducir sonido.");
  }
}

function cambiarInstrumento(nombre) {
  instrumento = nombre;
  for (const boton of document.querySelectorAll("[data-instrumento]")) {
    boton.setAttribute("aria-pressed", String(boton.dataset.instrumento === nombre));
  }
}

function dibujarMusica(manos, ahora) {
  const W = lienzo.width;
  const H = lienzo.height;
  // Dedos que golpean la bateria: puntas del indice y del corazon de cada mano
  const palillos = manos.flatMap((m) => [8, 12].map((i) => ({ clave: `${m.lado}-${i}`, x: m.puntos[i].x / W, y: m.puntos[i].y / H })));
  for (const pad of bateria.actualizar(palillos, ahora)) {
    sinte?.golpe(pad);
    const z = bateria.zonas[pad];
    ondas.push({ x: (z.x + z.w / 2) * W, y: (z.y + z.h / 2) * H, desde: ahora, color: PADS[pad].color });
  }
  // La mano que este en la mitad derecha toca el theremin
  const mano = manos.find((m) => m.puntos[8].x / W >= 0.5);
  const { nota: n } = theremin.actualizar(
    mano ? { x: mano.puntos[8].x / W, y: mano.puntos[8].y / H, abierta: mano.dedos.filter(Boolean).length >= 2 } : null,
  );
  sinte?.tocar(n, theremin.timbre, instrumento);

  // Theremin: una franja por nota (arriba agudo, abajo grave)
  const altoNota = H / NUM_NOTAS;
  for (let i = 0; i < NUM_NOTAS; i++) {
    const y = H - (i + 1) * altoNota;
    const activa = i === n;
    ctx.fillStyle = activa ? "rgba(167, 139, 250, 0.55)" : i % 2 ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.12)";
    ctx.fillRect(W / 2, y, W / 2, altoNota);
    ctx.font = "600 16px system-ui, sans-serif";
    ctx.fillStyle = activa ? "#fff" : "rgba(255,255,255,0.6)";
    ctx.fillText(nota(i).nombre, W - 48, y + altoNota / 2 + 6);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();
  texto("BATERÍA", 16, 40, 26, "#fbbf24");
  texto("THEREMIN", W / 2 + 16, 40, 26, "#c4b5fd");

  // Pads
  bateria.zonas.forEach((z, i) => {
    const brillo = bateria.brillo(i, ahora);
    ctx.save();
    ctx.globalAlpha = 0.35 + brillo * 0.65;
    ctx.fillStyle = PADS[i].color;
    ctx.shadowColor = PADS[i].color;
    ctx.shadowBlur = 40 * brillo;
    ctx.fillRect(z.x * W, z.y * H, z.w * W, z.h * H);
    ctx.restore();
    texto(PADS[i].nombre, z.x * W + 12, z.y * H + 32, 22);
  });
  for (let i = ondas.length - 1; i >= 0; i--) {
    const o = ondas[i];
    const t = (ahora - o.desde) / 0.5;
    if (t >= 1) {
      ondas.splice(i, 1);
      continue;
    }
    ctx.strokeStyle = o.color;
    ctx.globalAlpha = 1 - t;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(o.x, o.y, 20 + t * 160, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Palillos y cursor del theremin
  for (const p of palillos) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(p.x * W, p.y * H, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  if (mano) {
    const { x, y } = mano.puntos[8];
    ctx.save();
    ctx.shadowColor = "#a78bfa";
    ctx.shadowBlur = n === null ? 0 : 30;
    ctx.fillStyle = n === null ? "rgba(255,255,255,0.5)" : "#a78bfa";
    ctx.beginPath();
    ctx.arc(x, y, n === null ? 12 : 18 + 4 * Math.sin(ahora * 30), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const etiqueta = n === null ? "✊ silencio" : nota(n).nombre;
    ctx.font = "700 30px system-ui, sans-serif";
    const ancho = ctx.measureText(etiqueta).width;
    // A la derecha del dedo, o a la izquierda si no cabe
    const tx = x + 24 + ancho > W - 8 ? x - 24 - ancho : x + 24;
    texto(etiqueta, tx, Math.max(y - 16, 70), 30, n === null ? "#fff" : "#ddd6fe");
  }
  if (!sinte) texto("Pulsa el botón «6 · Música» para activar el sonido", 16, H - 20, 22, "#f87171");
}

// ---------- 3D ----------

function cargarEscena() {
  cargandoEscena ??= crearEscena(lienzo.width, lienzo.height)
    .then((e) => {
      escena3d = e;
    })
    .catch((error) => {
      console.error(error);
      estado("No se pudo cargar la escena 3D (hace falta WebGL).");
    });
  return cargandoEscena;
}

function reiniciarObjetos() {
  manipulador = new Manipulador(OBJETOS, lienzo.width / lienzo.height);
}

function dibujarObjetos(manos, ahora) {
  if (!escena3d) {
    texto("Cargando la escena 3D…", 16, 44, 28);
    return;
  }
  if (!manipulador) reiniciarObjetos();
  const dt = anteriorObjetos === null ? 1 / 60 : Math.min(ahora - anteriorObjetos, 0.1);
  anteriorObjetos = ahora;
  const W = lienzo.width;
  const H = lienzo.height;
  const agarrados = manipulador.actualizar(
    manos.map((m) => ({ lado: m.lado, puntos: m.puntos.map((p) => ({ x: p.x / W, y: p.y / H })) })),
    dt,
  );
  ctx.drawImage(escena3d.dibujar(manipulador.objetos, agarrados), 0, 0, W, H);

  // Pinza de cada mano: circulo vacio = abierta, lleno = pellizcando
  for (const m of manos) {
    const x = (m.puntos[4].x + m.puntos[8].x) / 2;
    const y = (m.puntos[4].y + m.puntos[8].y) / 2;
    const pellizca = manipulador.pellizcos.get(m.lado);
    ctx.strokeStyle = ctx.fillStyle = pellizca ? "#22d3ee" : "rgba(255,255,255,0.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, pellizca ? 10 : 18, 0, Math.PI * 2);
    if (pellizca) ctx.fill();
    else ctx.stroke();
    for (const i of [4, 8]) {
      ctx.beginPath();
      ctx.arc(m.puntos[i].x, m.puntos[i].y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const dos = manipulador.dosManos;
  if (dos) texto(`×${dos.obj.escala.toFixed(1)}`, dos.obj.x * W + 20, dos.obj.y * H - 60, 32, "#fbbf24");
}

// ---------- Pong ----------

function dibujarPong(manos, ahora) {
  const W = lienzo.width;
  const H = lienzo.height;
  pong ??= new Pong(W / H);
  const dt = anteriorPong === null ? 1 / 60 : ahora - anteriorPong;
  anteriorPong = ahora;
  // La mano de cada mitad mueve su pala (con el centro de la palma, que tiembla menos)
  const y = [null, null];
  for (const m of manos) {
    const lado = m.puntos[9].x < W / 2 ? 0 : 1;
    y[lado] = m.puntos[9].y / H;
  }
  const evento = pong.actualizar(y, dt, ahora);
  if (evento === "golpe") sinte?.bip(660 + pong.golpes * 20);
  else if (evento?.startsWith("punto")) sinte?.bip(220, 0.3);
  else if (evento === "fin") [523, 659, 784].forEach((f, i) => setTimeout(() => sinte?.bip(f, 0.2), i * 180));

  // Campo
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.setLineDash([14, 14]);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();
  ctx.setLineDash([]);
  textoCentrado(`${pong.marcador[0]}   ${pong.marcador[1]}`, 86, 72);

  // Palas: brillan en el color de cada lado; "CPU" si la mueve el ordenador
  ["#38bdf8", "#fb923c"].forEach((color, i) => {
    const x = X_PALAS[i] * W;
    const alto = ALTO_PALA * H;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 25;
    ctx.fillStyle = color;
    ctx.fillRect(x - 9, pong.palas[i] * H - alto / 2, 18, alto);
    ctx.restore();
    if (y[i] === null) texto("CPU", i === 0 ? x + 18 : x - 70, pong.palas[i] * H + 8, 22, color);
  });

  // Pelota con estela
  const b = pong.pelota;
  estela.push({ x: b.x * W, y: b.y * H });
  if (estela.length > 12) estela.shift();
  estela.forEach((p, i) => {
    ctx.fillStyle = `rgba(250, 204, 21, ${(i / estela.length) * 0.5})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, b.radio * H * (0.4 + (0.6 * i) / estela.length), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.save();
  ctx.shadowColor = "#facc15";
  ctx.shadowBlur = 30;
  ctx.fillStyle = "#fef08a";
  ctx.beginPath();
  ctx.arc(b.x * W, b.y * H, b.radio * H, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (pong.estado === "fin") {
    textoCentrado(pong.ganador === 0 ? "¡GANA LA IZQUIERDA!" : "¡GANA LA DERECHA!", H / 2, 56, "#fbbf24");
    textoCentrado("Pulsa «Nueva partida» o Espacio", H / 2 + 56, 28, "#4ade80");
  } else if (pong.marcador[0] + pong.marcador[1] === 0 && pong.golpes === 0) {
    textoCentrado(`Una mano en cada mitad · gana quien llegue a ${PUNTOS_PARA_GANAR}`, H - 30, 26, "#e4e4e7");
  }
}

function nuevaPartidaPong() {
  pong?.reiniciar();
  estela.length = 0;
}

// ---------- Ninja ----------

const aRGB = (color) => color.match(/\w\w/g).map((h) => parseInt(h, 16));

function dibujarEmoji(emoji, tamano) {
  ctx.font = `${tamano}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#000"; // opaco: los emojis de color usan la transparencia del fillStyle
  ctx.fillText(emoji, 0, 0);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function dibujarNinja(manos, ahora) {
  const W = lienzo.width;
  const H = lienzo.height;
  if (!ninja) {
    ninja = new Ninja(W / H);
    ninja.record = leerRecord("record-ninja");
  }
  const dt = anteriorNinja === null ? 1 / 60 : ahora - anteriorNinja;
  anteriorNinja = ahora;
  // Corta la punta del indice de cada mano
  const dedos = manos.map((m) => ({ clave: m.lado, x: m.puntos[8].x / W, y: m.puntos[8].y / H }));
  for (const e of ninja.actualizar(dedos, dt, ahora)) {
    if (e.tipo === "corte") {
      sinte?.corte();
      if (!e.objeto.bomba) particulas.emitir(e.objeto.x * W, e.objeto.y * H, 0, 0, aRGB(e.objeto.color), 30, 9);
    } else if (e.tipo === "bomba") {
      sinte?.explosion();
      flashNinja = ahora;
      particulas.emitir(e.x * W, e.y * H, 0, 0, [255, 200, 80], 120, 18);
    } else if (e.tipo === "combo") {
      textosNinja.push({ t: `¡COMBO ×${e.n}! +${e.n}`, x: e.x * W, y: e.y * H, color: "#fbbf24", inicio: ahora });
      [784, 988, 1175].forEach((f, i) => setTimeout(() => sinte?.bip(f, 0.1), i * 70));
    } else if (e.tipo === "fallo") {
      textosNinja.push({ t: "✕", x: e.x * W, y: H - 40, color: "#f87171", inicio: ahora });
      sinte?.bip(180, 0.25);
    } else if (e.tipo === "fin" && ninja.nuevoRecord) {
      guardarRecord(ninja.record, "record-ninja");
    }
  }

  ctx.save();
  if (ahora - flashNinja < 0.4) ctx.translate(Math.random() * 30 - 15, Math.random() * 30 - 15); // temblor

  // Zumo en la pantalla (se va borrando)
  for (const m of ninja.manchas) {
    const [r, g, b] = aRGB(m.color);
    const alfa = 0.45 * (1 - (ahora - m.t) / 1.5);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alfa})`;
    for (let i = 0; i < 7; i++) {
      // Una mancha grande y gotas alrededor (siempre en el mismo sitio para cada mancha)
      const ang = i * 2.4 + m.x * 10;
      const d = i === 0 ? 0 : m.radio * H * (0.9 + (i % 3) * 0.3);
      const radio = i === 0 ? m.radio * H : m.radio * H * (0.15 + (i % 2) * 0.12);
      ctx.beginPath();
      ctx.arc(m.x * W + Math.cos(ang) * d, m.y * H + Math.sin(ang) * d, radio, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Frutas y bombas enteras
  for (const o of ninja.objetos) {
    const r = o.radio * H;
    ctx.save();
    ctx.translate(o.x * W, o.y * H);
    if (o.diana) {
      // Aro que late alrededor de la sandia de empezar
      ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, r * (1.25 + 0.08 * Math.sin(ahora * 5)), 0, Math.PI * 2);
      ctx.stroke();
    }
    if (o.bomba) {
      ctx.shadowColor = "#ef4444";
      ctx.shadowBlur = 30 + 15 * Math.sin(ahora * 20);
    }
    ctx.rotate(o.giro);
    dibujarEmoji(o.emoji, r * 2);
    ctx.restore();
  }

  // Mitades: cada una es la fruta recortada por un lado de la linea del corte
  for (const t of ninja.trozos) {
    const r = t.radio * H;
    ctx.save();
    ctx.translate(t.x * W, t.y * H);
    ctx.rotate(t.giro + t.corte);
    ctx.beginPath();
    ctx.rect(-r * 1.5, 0, r * 3, t.lado * r * 1.5);
    ctx.clip();
    ctx.rotate(-t.corte);
    dibujarEmoji(t.emoji, r * 2);
    ctx.rotate(t.corte);
    // La cara del corte, del color de la fruta
    ctx.strokeStyle = t.color;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-r * 0.8, 0);
    ctx.lineTo(r * 0.8, 0);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  particulas.actualizarYDibujar(ctx);

  // Estela de la espada: mas gruesa y brillante cerca del dedo
  ctx.save();
  ctx.lineCap = "round";
  ctx.shadowColor = "#67e8f9";
  ctx.shadowBlur = 20;
  for (const rastro of ninja.rastros.values()) {
    for (let i = 1; i < rastro.length; i++) {
      const f = i / rastro.length;
      ctx.strokeStyle = `rgba(224, 255, 255, ${f})`;
      ctx.lineWidth = 2 + f * 12;
      ctx.beginPath();
      ctx.moveTo(rastro[i - 1].x * W, rastro[i - 1].y * H);
      ctx.lineTo(rastro[i].x * W, rastro[i].y * H);
      ctx.stroke();
    }
  }
  ctx.restore();
  for (const d of dedos) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(d.x * W, d.y * H, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Textos que suben y se desvanecen
  for (let i = textosNinja.length - 1; i >= 0; i--) {
    const tx = textosNinja[i];
    const edad = ahora - tx.inicio;
    if (edad > 1.2) {
      textosNinja.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = 1 - edad / 1.2;
    ctx.font = "700 36px system-ui, sans-serif";
    const x = Math.min(Math.max(tx.x - ctx.measureText(tx.t).width / 2, 8), W - ctx.measureText(tx.t).width - 8);
    texto(tx.t, x, tx.y - edad * 60, 36, tx.color);
    ctx.globalAlpha = 1;
  }

  // Destello de la bomba
  if (ahora - flashNinja < 0.5) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * (1 - (ahora - flashNinja) / 0.5)})`;
    ctx.fillRect(0, 0, W, H);
  }

  // Marcador
  if (ninja.estado === "jugando") {
    texto(`🍉 ${ninja.puntos}`, 16, 48, 40, "#fbbf24");
    const vidas = "❤️".repeat(ninja.vidas) + "🖤".repeat(VIDAS - ninja.vidas);
    ctx.font = "32px sans-serif";
    ctx.fillText(vidas, W - ctx.measureText(vidas).width - 16, 48);
  } else {
    const diana = ninja.objetos.find((o) => o.diana);
    const arriba = H * 0.45 - ninja.diana().radio * H * 1.5;
    if (ninja.estado === "fin") {
      textoCentrado(`FIN · ${ninja.puntos} puntos`, Math.max(arriba - 70, 50), 52, "#f87171");
      if (ninja.nuevoRecord) textoCentrado("¡NUEVO RÉCORD!", Math.max(arriba - 20, 100), 32, "#fbbf24");
    } else {
      textoCentrado("CORTA LA SANDÍA PARA EMPEZAR", Math.max(arriba - 30, 50), 40, "#67e8f9");
    }
    if (diana) {
      textoCentrado("Mueve el índice rápido a través de la fruta ✋💨", H * 0.45 + diana.radio * H * 1.7 + 20, 26);
      textoCentrado(`Récord: ${ninja.record} · ¡Cuidado con las 💣!`, H * 0.45 + diana.radio * H * 1.7 + 60, 24, "#e4e4e7");
    }
  }
}

// ---------- Holograma ----------

function cargarHolograma() {
  cargandoHolograma ??= crearHolograma(lienzo.width, lienzo.height, FaceLandmarker.FACE_LANDMARKS_TESSELATION)
    .then((h) => {
      holograma = h;
    })
    .catch((error) => {
      console.error(error);
      estado("No se pudo cargar el holograma (hace falta WebGL).");
    });
  return cargandoHolograma;
}

function congelar() {
  congelado = !congelado;
  $("congelar").textContent = congelado ? "▶ Seguir mi cara" : "❄️ Congelar";
  $("congelar").setAttribute("aria-pressed", String(congelado));
}

function dibujarHolograma(manos, ahora) {
  const W = lienzo.width;
  const H = lienzo.height;
  // Fondo mas oscuro, para que brille
  ctx.fillStyle = "rgba(2, 6, 23, 0.6)";
  ctx.fillRect(0, 0, W, H);
  if (!holograma || !malla) {
    textoCentrado("Cargando el holograma…", H / 2, 32, "#67e8f9");
    return;
  }
  const dt = anteriorHolograma === null ? 1 / 60 : ahora - anteriorHolograma;
  anteriorHolograma = ahora;

  // La primera mano que se vea gira el holograma pellizcando y arrastrando
  let pinza = null;
  if (manos.length) {
    pinza = leerMano(manos[0].puntos.map((p) => ({ x: p.x / W, y: p.y / H })), pellizcoHolograma, W / H);
    pellizcoHolograma = pinza.pellizco;
  }
  const { rotX, rotY } = rotador.actualizar(pinza, dt);
  const cara = resultadoMalla?.faceLandmarks[0];
  if (cara) ultimaMalla = centrarMalla(cara, W / H);
  // Abrir mucho la boca hace explotar el holograma
  const jawOpen = resultadoMalla?.faceBlendshapes?.[0]?.categories.find((c) => c.categoryName === "jawOpen")?.score ?? 0;
  explosion.actualizar(jawOpen, dt);
  ctx.drawImage(holograma.dibujar(ultimaMalla && explosion.aplicar(ultimaMalla), rotX, rotY, ahora), 0, 0, W, H);

  // Lineas de escaneo, como en las peliculas
  ctx.fillStyle = "rgba(34, 211, 238, 0.05)";
  for (let y = (ahora * 40) % 6; y < H; y += 6) ctx.fillRect(0, y, W, 2);

  if (pinza) {
    const x = pinza.x * W;
    const y = pinza.y * H;
    ctx.strokeStyle = ctx.fillStyle = pinza.pellizco ? "#22d3ee" : "rgba(255,255,255,0.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, pinza.pellizco ? 10 : 18, 0, Math.PI * 2);
    if (pinza.pellizco) ctx.fill();
    else ctx.stroke();
  }
  const grados = Math.round((((rotY * 180) / Math.PI) % 360 + 360) % 360);
  texto(`${congelado ? "❄️ CONGELADO" : "● EN VIVO"} · ${grados}°`, 16, 40, 24, congelado ? "#93c5fd" : "#f87171");
  if (!cara && !congelado) textoCentrado("Ponte delante de la cámara", H - 30, 26, "#e4e4e7");
  else if (rotador.quieto > 4) textoCentrado("🤏 Pellizca y arrastra para girar tu holograma", H - 30, 26, "#e4e4e7");
}

// ---------- Escultura de luz ----------

function cargarEscultura() {
  cargandoEscultura ??= crearEscultura(lienzo.width, lienzo.height, MAX_PUNTOS)
    .then((e) => {
      escenaEscultura = e;
      escultura = new Escultura(e.anchoMundo, e.altoMundo);
    })
    .catch((error) => {
      console.error(error);
      estado("No se pudo cargar la escultura 3D (hace falta WebGL).");
    });
  return cargandoEscultura;
}

function dibujarEscultura(manos, ahora) {
  const W = lienzo.width;
  const H = lienzo.height;
  ctx.fillStyle = "rgba(2, 6, 23, 0.55)";
  ctx.fillRect(0, 0, W, H);
  if (!escenaEscultura) {
    textoCentrado("Cargando la escena 3D…", H / 2, 32, "#67e8f9");
    return;
  }
  const dt = anteriorEscultura === null ? 1 / 60 : ahora - anteriorEscultura;
  anteriorEscultura = ahora;
  // Dibuja la primera mano que se vea, pellizcando (pulgar + indice)
  let pinza = null;
  if (manos.length) {
    pinza = leerMano(manos[0].puntos.map((p) => ({ x: p.x / W, y: p.y / H })), pellizcoEscultura, W / H);
    pellizcoEscultura = pinza.pellizco;
  }
  escultura.actualizar(pinza, dt);
  ctx.drawImage(escenaEscultura.dibujar(escultura), 0, 0, W, H);

  if (pinza) {
    const color = `hsl(${escultura.dibujando ? escultura.trazos.at(-1).color : escultura.color}, 90%, 60%)`;
    ctx.strokeStyle = ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pinza.x * W, pinza.y * H, pinza.pellizco ? 9 : 18, 0, Math.PI * 2);
    if (pinza.pellizco) ctx.fill();
    else ctx.stroke();
  }
  texto(`${escultura.trazos.length} trazos · ${escultura.total} puntos`, 16, 40, 22, "#a5f3fc");
  if (escultura.trazos.length === 0) {
    textoCentrado("🤏 Pellizca y mueve la mano para dibujar con luz", H - 60, 28);
    textoCentrado("La escena gira: cada trazo queda en otro ángulo y sale una figura 3D", H - 24, 22, "#e4e4e7");
  }
}

// ---------- Reto de gestos ----------

function dibujarReto(manos, ahora) {
  const W = lienzo.width;
  const H = lienzo.height;
  if (!reto) {
    reto = new Reto();
    reto.record = leerRecord("record-reto");
  }
  const dt = anteriorReto === null ? 1 / 60 : ahora - anteriorReto;
  anteriorReto = ahora;
  const entrada = {
    gestos: manos.map((m) => m.gesto).filter(Boolean),
    dedos: manos.reduce((n, m) => n + m.dedos.filter(Boolean).length, 0),
  };
  for (const e of reto.actualizar(entrada, dt, ahora)) {
    if (e.tipo === "acierto") {
      destelloReto = { color: "74, 222, 128", hasta: ahora + 0.3 };
      sinte?.bip(880 + reto.aciertos * 30, 0.1);
    } else if (e.tipo === "fallo") {
      destelloReto = { color: "248, 113, 113", hasta: ahora + 0.4 };
      sinte?.bip(200, 0.3);
    } else if (e.tipo === "empezar") {
      [523, 659].forEach((f, i) => setTimeout(() => sinte?.bip(f, 0.12), i * 120));
    } else if (e.tipo === "fin" && reto.nuevoRecord) {
      guardarRecord(reto.record, "record-reto");
    }
  }
  if (ahora < destelloReto.hasta) {
    ctx.fillStyle = `rgba(${destelloReto.color}, ${0.35 * ((destelloReto.hasta - ahora) / 0.3)})`;
    ctx.fillRect(0, 0, W, H);
  }
  // Lo que se ve ahora mismo (para saber por que no cuenta)
  const veo = [...new Set(entrada.gestos)].join(" · ") || "ningún gesto";
  textoCentrado(`Veo: ${veo} · ${entrada.dedos} ${entrada.dedos === 1 ? "dedo" : "dedos"}`, H - 24, 24, "#e4e4e7");

  if (reto.estado !== "jugando") {
    const medio = H / 2;
    if (reto.estado === "fin") {
      textoCentrado(`FIN · ${reto.puntos} puntos`, medio - 90, 56, "#f87171");
      textoCentrado(reto.nuevoRecord ? "¡NUEVO RÉCORD!" : `Récord: ${reto.record}`, medio - 40, 30, "#fbbf24");
    } else {
      textoCentrado("RETO DE GESTOS", medio - 90, 56, "#67e8f9");
      textoCentrado(`Haz lo que te pida antes de que se acabe el tiempo · Récord: ${reto.record}`, medio - 40, 24);
    }
    textoCentrado("🖐 Enseña la mano abierta para empezar", medio + 20, 34, "#4ade80");
    const progreso = Math.min(1, reto.mantenido / ESPERA_EMPEZAR);
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(W / 2 - 150, medio + 45, 300, 12);
    ctx.fillStyle = "#4ade80";
    ctx.fillRect(W / 2 - 150, medio + 45, 300 * progreso, 12);
    return;
  }

  // La orden, grande, con una barra de tiempo que se va vaciando
  const resta = reto.tiempoRestante(ahora) / reto.limite;
  ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
  ctx.beginPath();
  ctx.roundRect(W * 0.03, 20, W * 0.94, 130, 18);
  ctx.fill();
  textoCentrado(reto.tarea.tipo === "dedos" ? `✋ ${reto.tarea.texto}` : reto.tarea.texto, 95, 56, "#fff");
  ctx.fillStyle = resta > 0.35 ? "#4ade80" : "#f87171";
  ctx.fillRect(W * 0.03 + 16, 122, (W * 0.94 - 32) * resta, 12);
  // Anillo que se llena mientras mantienes la postura correcta
  if (reto.mantenido > 0) {
    ctx.strokeStyle = "#4ade80";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 60, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, reto.mantenido / MANTENER));
    ctx.stroke();
  }
  texto(`⭐ ${reto.puntos}`, 16, H - 60, 36, "#fbbf24");
  const vidas = "❤️".repeat(reto.vidas) + "🖤".repeat(VIDAS_RETO - reto.vidas);
  ctx.font = "30px sans-serif";
  ctx.fillText(vidas, W - ctx.measureText(vidas).width - 16, H - 60);
}

// ---------- Cuerpo de neon ----------

function cargarPose() {
  cargandoPose ??= (async () => {
    estado("Cargando el modelo del cuerpo…");
    for (const delegate of [delegado, "CPU"]) {
      try {
        detectorPose = await PoseLandmarker.createFromOptions(archivosVision, {
          baseOptions: { modelAssetPath: MODELO_POSE, delegate },
          runningMode: "VIDEO",
          numPoses: 2,
        });
        estado(`Funcionando (${delegado})`);
        return;
      } catch (error) {
        console.warn(`Modelo del cuerpo con ${delegate}:`, error);
      }
    }
    estado("No se pudo cargar el modelo del cuerpo.");
  })();
  return cargandoPose;
}

function dibujarNeon(ahora) {
  const W = lienzo.width;
  const H = lienzo.height;
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)"; // la camara casi a oscuras, para que brille la luz
  ctx.fillRect(0, 0, W, H);
  if (!detectorPose) {
    textoCentrado("Cargando el modelo del cuerpo…", H / 2, 32, "#67e8f9");
    return;
  }
  const dt = anteriorNeon === null ? 1 / 60 : ahora - anteriorNeon;
  anteriorNeon = ahora;
  if (capaNeon.width !== W || capaNeon.height !== H) {
    capaNeon.width = W;
    capaNeon.height = H;
  }
  // La estela: lo dibujado antes se va borrando poco a poco
  ctxNeon.globalCompositeOperation = "destination-out";
  ctxNeon.fillStyle = "rgba(0, 0, 0, 0.18)";
  ctxNeon.fillRect(0, 0, W, H);
  ctxNeon.globalCompositeOperation = "source-over";

  const tono = (ahora * 40) % 360; // el color va cambiando solo
  const extremos = [];
  const cuerpos = resultadoPose?.landmarks ?? [];
  cuerpos.forEach((puntos, n) => {
    const px = puntos.map(aPixeles);
    const vistos = visibles(puntos);
    ctxNeon.lineCap = "round";
    ctxNeon.shadowBlur = 25;
    PoseLandmarker.POSE_CONNECTIONS.forEach(({ start, end }, i) => {
      if (start < 11 || !vistos.has(start) || !vistos.has(end)) return; // la cara (0-10) va aparte
      const color = `hsl(${(tono + n * 180 + i * 8) % 360}, 100%, 60%)`;
      ctxNeon.strokeStyle = ctxNeon.shadowColor = color;
      ctxNeon.lineWidth = 10;
      ctxNeon.beginPath();
      ctxNeon.moveTo(px[start].x, px[start].y);
      ctxNeon.lineTo(px[end].x, px[end].y);
      ctxNeon.stroke();
    });
    // Cabeza: un circulo alrededor de la nariz, del tamano de la distancia entre las orejas
    if (vistos.has(0) && vistos.has(7) && vistos.has(8)) {
      const radio = Math.hypot(px[7].x - px[8].x, px[7].y - px[8].y) * 0.9;
      ctxNeon.strokeStyle = ctxNeon.shadowColor = `hsl(${(tono + n * 180) % 360}, 100%, 70%)`;
      ctxNeon.lineWidth = 8;
      ctxNeon.beginPath();
      ctxNeon.arc(px[0].x, px[0].y, radio, 0, Math.PI * 2);
      ctxNeon.stroke();
    }
    for (const [nombre, i] of Object.entries(EXTREMOS)) {
      if (vistos.has(i)) extremos.push({ clave: `${n}-${nombre}`, x: px[i].x / W, y: px[i].y / H });
    }
  });
  ctxNeon.shadowBlur = 0;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(capaNeon, 0, 0);
  // Chispas de manos y pies
  for (const c of chispas.actualizar(extremos, dt, W / H)) {
    ctx.fillStyle = `hsla(${(tono + c.tono) % 360}, 100%, 70%, ${c.vida})`;
    ctx.beginPath();
    ctx.arc(c.x * W, c.y * H, 3 + c.vida * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  if (!cuerpos.length) textoCentrado("Aléjate de la cámara para que se vea tu cuerpo 🕺", H - 30, 28);
}

function bucle() {
  const ahora = performance.now();
  // Solo detectamos cuando la camara da un frame nuevo
  if (video.currentTime !== ultimoTiempoVideo) {
    ultimoTiempoVideo = video.currentTime;
    resultadoManos = reconocedor.recognizeForVideo(video, ahora);
    // (en los juegos no se busca el rostro: no se dibuja y asi va mas fluido)
    resultadoRostro = verRostro() ? detectorRostro.detectForVideo(video, ahora) : null;
    resultadoPose = modo === "neon" && detectorPose ? detectorPose.detectForVideo(video, ahora) : null;
    resultadoMalla = (modo === "avatar" || (modo === "holograma" && !congelado)) && malla ? malla.detectForVideo(video, ahora) : null;
  }
  fps = 0.9 * fps + 0.1 * (1000 / Math.max(ahora - anterior, 1));
  anterior = ahora;

  // Fondo: la camara en modo espejo (mas oscura en particulas y pintar, para que brille lo demas)
  ctx.save();
  ctx.translate(lienzo.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height);
  ctx.restore();
  if (modo !== "deteccion" && modo !== "avatar") {
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  }

  const manos = manosEnPixeles();
  const rostros = modo === "avatar" ? dibujarAvatares() : modo === "holograma" ? (resultadoMalla?.faceLandmarks.length ?? 0) : dibujarRostros();
  let total = 0;

  if (modo === "particulas") {
    particulas.procesar(manos);
    particulas.actualizarYDibujar(ctx);
  } else if (modo === "neon") {
    dibujarNeon(ahora / 1000);
  } else if (modo === "reto") {
    dibujarReto(manos, ahora / 1000);
  } else if (modo === "escultura") {
    dibujarEscultura(manos, ahora / 1000);
  } else if (modo === "holograma") {
    dibujarHolograma(manos, ahora / 1000);
  } else if (modo === "ninja") {
    dibujarNinja(manos, ahora / 1000);
  } else if (modo === "pong") {
    dibujarPong(manos, ahora / 1000);
  } else if (modo === "objetos") {
    dibujarObjetos(manos, ahora / 1000);
  } else if (modo === "musica") {
    dibujarMusica(manos, ahora / 1000);
  } else if (modo === "juego") {
    dibujarJuego(manos, ahora / 1000);
  } else if (modo === "pintar") {
    pizarra.actualizar(
      manos.map((m) => ({ lado: m.lado, dedos: m.dedos, x: m.puntos[8].x, y: m.puntos[8].y })),
      ahora / 1000,
    );
    ctx.drawImage(capaPintura, 0, 0);
    dibujarBarraPintura(ahora / 1000);
    for (const [lado, p] of pizarra.anterior) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, pizarra.modo.get(lado) === "pintar" ? 8 : 12, 0, Math.PI * 2);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  for (const mano of manos) {
    if ($("ver-manos").checked && MODOS_CON_OPCIONES.includes(modo)) dibujarEsqueleto(mano);
    const n = mano.dedos.filter(Boolean).length;
    total += n;
    if (modo === "deteccion") {
      const arriba = mano.puntos.reduce((a, p) => Math.min(a, p.y), Infinity);
      const izquierda = mano.puntos.reduce((a, p) => Math.min(a, p.x), Infinity);
      const x = Math.min(Math.max(mano.puntos[12].x - 12, 8), lienzo.width - 40);
      texto(String(n), x, Math.max(arriba - 16, 40), 48, "#fbbf24");
      if (mano.gesto) {
        const ancho = ctx.measureText(mano.gesto).width;
        texto(mano.gesto, Math.min(Math.max(izquierda, 8), lienzo.width - ancho - 8), Math.max(arriba - 70, 90), 26, "#67e8f9");
      }
    }
  }

  $("info-fps").textContent = Math.round(fps);
  $("info-manos").textContent = manos.length;
  $("info-dedos").textContent = total;
  $("info-rostros").textContent = verRostro() || modo === "avatar" || modo === "holograma" ? rostros : "–";
  requestAnimationFrame(bucle);
}

function cambiarModo(nuevo) {
  modo = nuevo;
  history.replaceState(null, "", `#${modo}`); // asi se puede compartir el enlace a un modo
  // Las opciones de esqueleto y rostro solo pintan algo en los tres primeros modos
  $("ver-manos").parentElement.hidden = $("ver-rostro").parentElement.hidden = !MODOS_CON_OPCIONES.includes(modo);
  for (const boton of document.querySelectorAll("[data-modo]")) {
    boton.setAttribute("aria-pressed", String(boton.dataset.modo === modo));
  }
  if (!["particulas", "juego", "ninja"].includes(modo)) particulas.vaciar();
  $("ayuda-pintar").hidden = modo !== "pintar";
  $("ayuda-juego").hidden = modo !== "juego";
  $("ayuda-avatar").hidden = modo !== "avatar";
  $("ayuda-musica").hidden = modo !== "musica";
  $("ayuda-objetos").hidden = modo !== "objetos";
  if (modo === "objetos") cargarEscena();
  $("ayuda-pong").hidden = modo !== "pong";
  $("ayuda-ninja").hidden = modo !== "ninja";
  if (["musica", "pong", "ninja", "reto"].includes(modo)) activarAudio();
  else sinte?.tocar(null);
  if (modo === "avatar") cargarMalla();
  $("ayuda-holograma").hidden = modo !== "holograma";
  $("ayuda-escultura").hidden = modo !== "escultura";
  $("ayuda-reto").hidden = modo !== "reto";
  $("ayuda-neon").hidden = modo !== "neon";
  if (modo === "neon") cargarPose();
  if (modo === "escultura") cargarEscultura();
  if (modo === "holograma") {
    cargarMalla();
    cargarHolograma();
  }
}

$("empezar").addEventListener("click", empezar);
for (const tarjeta of document.querySelectorAll("[data-ir]")) {
  tarjeta.setAttribute("aria-current", String(tarjeta.dataset.ir === modoInicial && location.hash !== ""));
  tarjeta.addEventListener("click", () => {
    modoInicial = tarjeta.dataset.ir;
    for (const t of document.querySelectorAll("[data-ir]")) t.setAttribute("aria-current", String(t === tarjeta));
    $("portada").scrollIntoView({ behavior: "smooth", block: "center" });
    empezar();
  });
}

function pantallaCompleta() {
  const escenario = document.querySelector(".escenario");
  if (document.fullscreenElement) document.exitFullscreen();
  else escenario.requestFullscreen?.().catch(() => estado("Este navegador no deja usar la pantalla completa."));
}
$("pantalla-completa").addEventListener("click", pantallaCompleta);

// ---------- Grabar video ----------
// Graba el lienzo (camara + efectos) y, si hay sonido (musica, juegos), tambien el audio.
// Todo se queda en tu ordenador: al parar se descarga el archivo.
const MAX_GRABACION = 60; // segundos
let grabadora = null;

function formatoVideo() {
  const formatos = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm", "video/mp4"];
  return formatos.find((f) => window.MediaRecorder?.isTypeSupported(f)) ?? "";
}

function alternarGrabacion() {
  if (grabadora) {
    grabadora.recorder.stop();
    return;
  }
  if (!window.MediaRecorder || !lienzo.captureStream) {
    estado("Este navegador no puede grabar vídeo.");
    return;
  }
  const flujo = lienzo.captureStream(30);
  let destinoAudio = null;
  if (sinte) {
    destinoAudio = sinte.audio.createMediaStreamDestination();
    sinte.salida.connect(destinoAudio);
    for (const pista of destinoAudio.stream.getAudioTracks()) flujo.addTrack(pista);
  }
  const tipo = formatoVideo();
  const recorder = new MediaRecorder(flujo, tipo ? { mimeType: tipo } : {});
  const trozos = [];
  recorder.ondataavailable = (e) => e.data.size && trozos.push(e.data);
  recorder.onstop = () => {
    clearInterval(grabadora.reloj);
    if (destinoAudio) sinte.salida.disconnect(destinoAudio);
    for (const pista of flujo.getTracks()) pista.stop();
    grabadora = null;
    $("grabar").textContent = "⏺ Grabar vídeo";
    $("grabar").classList.remove("grabando");
    const blob = new Blob(trozos, { type: recorder.mimeType || "video/webm" });
    const enlace = document.createElement("a");
    enlace.download = `manos-rostro-${modo}.${blob.type.includes("mp4") ? "mp4" : "webm"}`;
    enlace.href = URL.createObjectURL(blob);
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 10000);
  };
  recorder.start(1000);
  const inicio = performance.now();
  grabadora = {
    recorder,
    reloj: setInterval(() => {
      const s = Math.floor((performance.now() - inicio) / 1000);
      $("grabar").textContent = `⏹ Parar (${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")})`;
      if (s >= MAX_GRABACION) recorder.stop();
    }, 250),
  };
  $("grabar").textContent = "⏹ Parar (0:00)";
  $("grabar").classList.add("grabando");
}
$("grabar").addEventListener("click", alternarGrabacion);
for (const boton of document.querySelectorAll("[data-modo]")) {
  boton.addEventListener("click", () => cambiarModo(boton.dataset.modo));
}
$("borrar").addEventListener("click", () => pizarra?.borrar());
$("guardar").addEventListener("click", () => {
  const enlace = document.createElement("a");
  enlace.download = "dibujo.png";
  enlace.href = capaPintura.toDataURL("image/png");
  enlace.click();
});
$("jugar").addEventListener("click", empezarPartida);
document.addEventListener("keydown", (e) => {
  if ($("controles").hidden) return;
  if (/^[0-9]$/.test(e.key)) cambiarModo(MODOS[(Number(e.key) + 9) % 10]); // el 0 es el decimo
  if (e.key.toLowerCase() === "f") pantallaCompleta();
  if (e.key.toLowerCase() === "g") alternarGrabacion();
  if (e.key === " " && modo === "juego") {
    e.preventDefault(); // que la barra espaciadora no haga scroll
    empezarPartida();
  }
  if (e.key === " " && modo === "pong") {
    e.preventDefault();
    if (pong?.estado === "fin") nuevaPartidaPong();
  }
  if (e.key.toLowerCase() === "c" && modo === "holograma") congelar();
  if (e.key.toLowerCase() === "z" && modo === "escultura") escultura?.deshacer();
  if (e.key.toLowerCase() === "a" && modo === "avatar") cambiarEstilo(estiloAvatar + 1);
});
$("reiniciar-objetos").addEventListener("click", reiniciarObjetos);
$("congelar").addEventListener("click", congelar);
$("deshacer-escultura").addEventListener("click", () => escultura?.deshacer());
$("borrar-escultura").addEventListener("click", () => escultura?.borrar());
$("girar-escultura").addEventListener("click", () => {
  if (!escultura) return;
  escultura.girando = !escultura.girando;
  $("girar-escultura").textContent = escultura.girando ? "⏸ Parar el giro" : "▶ Girar";
});
$("nueva-pong").addEventListener("click", nuevaPartidaPong);
for (const boton of document.querySelectorAll("[data-instrumento]")) {
  boton.addEventListener("click", () => cambiarInstrumento(boton.dataset.instrumento));
}
for (const boton of document.querySelectorAll("[data-estilo]")) {
  boton.addEventListener("click", () => cambiarEstilo(ESTILOS_TODOS.indexOf(boton.dataset.estilo)));
}
$("foto-avatar").addEventListener("click", () => {
  const enlace = document.createElement("a");
  enlace.download = "avatar.png";
  enlace.href = lienzo.toDataURL("image/png");
  enlace.click();
});
if (!navigator.mediaDevices?.getUserMedia) {
  estado("Este navegador no permite usar la cámara (hace falta HTTPS o localhost).");
  $("empezar").disabled = true;
}
