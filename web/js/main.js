// Version web: lo mismo que sistema.py pero en el navegador, con MediaPipe para JavaScript.
// Todo se procesa en TU ordenador: el video de la camara no se envia a ningun servidor.
import {
  FaceDetector,
  FilesetResolver,
  GestureRecognizer,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/vision_bundle.mjs";
import { dedosLevantados, Suavizador } from "./dedos.js";
import { Particulas } from "./particulas.js";
import { ALTO_BARRA, PALETA, Pizarra, ZONA_SELECCION } from "./pintar.js";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
const MODELO_GESTOS =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task";
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

function bucle() {
  const ahora = performance.now();
  // Solo detectamos cuando la camara da un frame nuevo
  if (video.currentTime !== ultimoTiempoVideo) {
    ultimoTiempoVideo = video.currentTime;
    resultadoManos = reconocedor.recognizeForVideo(video, ahora);
    resultadoRostro = $("ver-rostro").checked ? detectorRostro.detectForVideo(video, ahora) : null;
  }
  fps = 0.9 * fps + 0.1 * (1000 / Math.max(ahora - anterior, 1));
  anterior = ahora;

  // Fondo: la camara en modo espejo (mas oscura en particulas y pintar, para que brille lo demas)
  ctx.save();
  ctx.translate(lienzo.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height);
  ctx.restore();
  if (modo !== "deteccion") {
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  }

  const manos = manosEnPixeles();
  const rostros = dibujarRostros();
  let total = 0;

  if (modo === "particulas") {
    particulas.procesar(manos);
    particulas.actualizarYDibujar(ctx);
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
    if ($("ver-manos").checked) dibujarEsqueleto(mano);
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
  if (modo !== "particulas") particulas.vaciar();
  $("ayuda-pintar").hidden = modo !== "pintar";
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
document.addEventListener("keydown", (e) => {
  const modos = { 1: "deteccion", 2: "particulas", 3: "pintar" };
  if (modos[e.key] && !$("controles").hidden) cambiarModo(modos[e.key]);
});
if (!navigator.mediaDevices?.getUserMedia) {
  estado("Este navegador no permite usar la cámara (hace falta HTTPS o localhost).");
  $("empezar").disabled = true;
}
