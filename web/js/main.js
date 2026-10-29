// Version web: lo mismo que sistema.py pero en el navegador, con MediaPipe para JavaScript.
// Todo se procesa en TU ordenador: el video de la camara no se envia a ningun servidor.
import {
  FaceDetector,
  FaceLandmarker,
  FilesetResolver,
  GestureRecognizer,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/vision_bundle.mjs";
import { dibujarAvatar, ESTILOS, parametros, pose, Suavizado } from "./avatar.js";
import { dedosLevantados, Suavizador } from "./dedos.js";
import { Juego } from "./juego.js";
import { Particulas, PUNTAS } from "./particulas.js";
import { ALTO_BARRA, PALETA, Pizarra, ZONA_SELECCION } from "./pintar.js";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
const MODELO_GESTOS =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task";
const MODELO_MALLA =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";
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
const suavizadosAvatar = [];
const particulas = new Particulas();
const suavizador = new Suavizador();
let ultimoTiempoVideo = -1;
let resultadoManos = null;
let resultadoRostro = null;
let fps = 0;
let anterior = performance.now();

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

async function empezar() {
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
    $("controles").hidden = false;
    estado(`Funcionando (${delegate === "GPU" ? "GPU" : "CPU"})`);
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
  ctx.strokeStyle = "rgba(0,0,0,0.8)";
  ctx.strokeText(t, x, y);
  ctx.fillStyle = color;
  ctx.fillText(t, x, y);
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
  if (!resultadoRostro || !$("ver-rostro").checked) return 0;
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
function leerRecord() {
  try {
    return Number(localStorage.getItem("record-juego")) || 0;
  } catch {
    return 0;
  }
}

function guardarRecord(puntos) {
  try {
    localStorage.setItem("record-juego", String(puntos));
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

  const centro = (t, y, tamano, color) => {
    // Si no cabe (camara estrecha o movil), se reduce la letra
    ctx.font = `700 ${tamano}px system-ui, sans-serif`;
    const ancho = ctx.measureText(t).width;
    if (ancho > lienzo.width * 0.92) tamano = Math.floor((tamano * lienzo.width * 0.92) / ancho);
    ctx.font = `700 ${tamano}px system-ui, sans-serif`;
    texto(t, (lienzo.width - ctx.measureText(t).width) / 2, y, tamano, color);
  };
  const medio = lienzo.height / 2;
  if (juego.estado === "inicio") {
    centro("EXPLOTA LAS BOLAS DE LUZ", medio - 60, 48, "#67e8f9");
    centro("Color +1 · Dorada +3 · Roja −5", medio, 30);
    centro("Pulsa «Empezar partida» o Espacio", medio + 56, 26, "#4ade80");
    centro(`Récord: ${juego.record}`, medio + 104, 24);
  } else if (juego.estado === "jugando") {
    texto(`Puntos: ${juego.puntos}`, 16, 44, 32);
    centro(`${Math.ceil(juego.tiempoRestante(ahora))}`, 48, 40, "#fbbf24");
  } else {
    centro("FIN DEL JUEGO", medio - 60, 56, "#f87171");
    centro(`Puntos: ${juego.puntos}`, medio, 36);
    centro(juego.nuevoRecord ? "¡NUEVO RÉCORD!" : `Récord: ${juego.record}`, medio + 50, 30, "#fbbf24");
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
  estiloAvatar = (i + ESTILOS.length) % ESTILOS.length;
  for (const boton of document.querySelectorAll("[data-estilo]")) {
    boton.setAttribute("aria-pressed", String(boton.dataset.estilo === ESTILOS[estiloAvatar]));
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
  resultadoMalla.faceLandmarks.forEach((puntos, i) => {
    const px = puntos.map(aPixeles);
    const g = pose(px);
    const formas = Object.fromEntries(resultadoMalla.faceBlendshapes[i].categories.map((c) => [c.categoryName, c.score]));
    suavizadosAvatar[i] ??= new Suavizado(0.5);
    const p = suavizadosAvatar[i].actualizar({ ...parametros(formas), yaw: g.yaw, pitch: g.pitch, roll: g.roll });
    // Cada cara con un estilo distinto: la primera el elegido, las demas los siguientes
    const estilo = ESTILOS[(estiloAvatar + i) % ESTILOS.length];
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

function bucle() {
  const ahora = performance.now();
  // Solo detectamos cuando la camara da un frame nuevo
  if (video.currentTime !== ultimoTiempoVideo) {
    ultimoTiempoVideo = video.currentTime;
    resultadoManos = reconocedor.recognizeForVideo(video, ahora);
    resultadoRostro = $("ver-rostro").checked && modo !== "avatar" ? detectorRostro.detectForVideo(video, ahora) : null;
    resultadoMalla = modo === "avatar" && malla ? malla.detectForVideo(video, ahora) : null;
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
  const rostros = modo === "avatar" ? dibujarAvatares() : dibujarRostros();
  let total = 0;

  if (modo === "particulas") {
    particulas.procesar(manos);
    particulas.actualizarYDibujar(ctx);
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
    if ($("ver-manos").checked && modo !== "juego" && modo !== "avatar") dibujarEsqueleto(mano);
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
  $("info-rostros").textContent = $("ver-rostro").checked ? rostros : "–";
  requestAnimationFrame(bucle);
}

function cambiarModo(nuevo) {
  modo = nuevo;
  for (const boton of document.querySelectorAll("[data-modo]")) {
    boton.setAttribute("aria-pressed", String(boton.dataset.modo === modo));
  }
  if (modo !== "particulas" && modo !== "juego") particulas.vaciar();
  $("ayuda-pintar").hidden = modo !== "pintar";
  $("ayuda-juego").hidden = modo !== "juego";
  $("ayuda-avatar").hidden = modo !== "avatar";
  if (modo === "avatar") cargarMalla();
}

$("empezar").addEventListener("click", empezar);
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
  const modos = { 1: "deteccion", 2: "particulas", 3: "pintar", 4: "juego", 5: "avatar" };
  if (modos[e.key]) cambiarModo(modos[e.key]);
  if (e.key === " " && modo === "juego") {
    e.preventDefault(); // que la barra espaciadora no haga scroll
    empezarPartida();
  }
  if (e.key.toLowerCase() === "a" && modo === "avatar") cambiarEstilo(estiloAvatar + 1);
});
for (const boton of document.querySelectorAll("[data-estilo]")) {
  boton.addEventListener("click", () => cambiarEstilo(ESTILOS.indexOf(boton.dataset.estilo)));
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
