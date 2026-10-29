// Avatar que imita tu cara: parpadeos, cejas, boca, mirada y giro de la cabeza.
// La malla facial de MediaPipe da 52 "blendshapes" (cuanto se mueve cada parte de la cara,
// de 0 a 1) y 478 puntos. Con ellos calculamos unos pocos parametros del avatar y lo dibujamos.
// Todo es logica pura: recibe datos y un "ctx" de canvas, asi se puede probar sin navegador.

export const ESTILOS = ["emoji", "gato", "robot"];

const limitar = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));

// formas = {nombre del blendshape: valor}. Devuelve los parametros del avatar.
// Ojo: la imagen se muestra en ESPEJO, asi que tu ojo izquierdo se ve a la izquierda de la
// pantalla. Por eso "izq"/"der" aqui son lados de la PANTALLA.
export function parametros(formas) {
  const f = (n) => formas[n] ?? 0;
  const apertura = (parpadeo, abierto) => limitar(1 - parpadeo * 1.3 + abierto * 0.3);
  // Mirar a la derecha de la pantalla = tu ojo derecho mira hacia fuera y el izquierdo hacia dentro
  const miradaX = (f("eyeLookOutRight") + f("eyeLookInLeft") - f("eyeLookOutLeft") - f("eyeLookInRight")) / 2;
  const miradaY = (f("eyeLookDownLeft") + f("eyeLookDownRight") - f("eyeLookUpLeft") - f("eyeLookUpRight")) / 2;
  // Al sonreir mucho las cejas bajan solas (los ojos se achinan): no es fruncir el ceno
  const sonrisa = (f("mouthSmileLeft") + f("mouthSmileRight")) / 2;
  const fruncir = (n) => f(n) * (1 - sonrisa * 0.9);
  return {
    ojoIzq: apertura(f("eyeBlinkLeft"), f("eyeWideLeft")),
    ojoDer: apertura(f("eyeBlinkRight"), f("eyeWideRight")),
    cejaIzq: limitar((f("browInnerUp") + f("browOuterUpLeft")) / 2 - fruncir("browDownLeft"), -1, 1),
    cejaDer: limitar((f("browInnerUp") + f("browOuterUpRight")) / 2 - fruncir("browDownRight"), -1, 1),
    boca: limitar(f("jawOpen") * 1.4),
    sonrisa: limitar(sonrisa - (f("mouthFrownLeft") + f("mouthFrownRight")) / 2, -1, 1),
    beso: limitar(f("mouthPucker") * 1.2),
    miradaX: limitar(miradaX, -1, 1),
    miradaY: limitar(miradaY, -1, 1),
    mejillas: limitar(f("cheekPuff") * 1.5),
  };
}

// Giro de la cabeza a partir de los puntos de la cara (ya en pixeles de la imagen en espejo).
// 1 = punta de la nariz, 234/454 = lados de la cara, 33/263 = rabillos de los ojos, 10/152 = frente/barbilla.
export function pose(puntos) {
  const nariz = puntos[1];
  const izq = puntos[234];
  const der = puntos[454];
  const ojoA = puntos[33];
  const ojoB = puntos[263];
  const ancho = Math.hypot(der.x - izq.x, der.y - izq.y) || 1;
  const centro = { x: (izq.x + der.x) / 2, y: (izq.y + der.y) / 2 };
  // Inclinacion (roll): angulo de la linea entre los ojos (los ordenamos de izquierda a derecha)
  const [a, b] = ojoA.x <= ojoB.x ? [ojoA, ojoB] : [ojoB, ojoA];
  const roll = Math.atan2(b.y - a.y, b.x - a.x);
  // Giro (yaw): cuanto se aparta la nariz del centro, en el eje de la cara
  const cos = Math.cos(-roll);
  const sin = Math.sin(-roll);
  const dx = nariz.x - centro.x;
  const dy = nariz.y - centro.y;
  const yaw = limitar(((dx * cos - dy * sin) / ancho) * 2.2, -1, 1);
  // Cabeceo (pitch): la nariz respecto a la linea de los ojos, comparado con lo normal (~0.2)
  const ojos = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const bajada = ((nariz.x - ojos.x) * sin + (nariz.y - ojos.y) * cos) / ancho;
  const pitch = limitar((bajada - 0.2) * 4, -1, 1);
  const alto = Math.hypot(puntos[152].x - puntos[10].x, puntos[152].y - puntos[10].y);
  return { x: centro.x, y: (puntos[10].y + puntos[152].y) / 2, ancho, alto, roll, yaw, pitch };
}

// Media movil para que el avatar no tiemble
export class Suavizado {
  constructor(factor = 0.5) {
    this.factor = factor;
    this.valor = null;
  }

  actualizar(nuevo) {
    if (!this.valor) {
      this.valor = { ...nuevo };
      return this.valor;
    }
    for (const [k, v] of Object.entries(nuevo)) {
      // Los parpadeos van sin suavizar casi: si no, el avatar parpadea con retraso
      const f = k.startsWith("ojo") ? this.factor * 0.3 : this.factor;
      this.valor[k] = f * (this.valor[k] ?? v) + (1 - f) * v;
    }
    return this.valor;
  }
}

const COLORES = {
  emoji: { piel: "#facc15", borde: "#a16207", detalle: "#3f2a0a", mejilla: "rgba(248,113,113,0.55)" },
  gato: { piel: "#fb923c", borde: "#9a3412", detalle: "#1c1917", mejilla: "rgba(244,114,182,0.6)" },
  robot: { piel: "#94a3b8", borde: "#334155", detalle: "#0f172a", mejilla: "rgba(34,211,238,0.5)" },
};

// Dibuja el avatar centrado en (0, 0) con radio 1: quien llama pone la posicion y el tamano
// con ctx.translate/scale/rotate. p = parametros(), giro = {yaw, pitch} de -1 a 1.
export function dibujarAvatar(ctx, p, giro, estilo = "emoji") {
  const c = COLORES[estilo] ?? COLORES.emoji;
  const gx = giro.yaw * 0.28; // los rasgos se desplazan al girar: da sensacion de 3D
  const gy = giro.pitch * 0.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Orejas (gato) o antena (robot): detras de la cabeza
  if (estilo === "gato") {
    for (const lado of [-1, 1]) {
      ctx.fillStyle = c.piel;
      ctx.strokeStyle = c.borde;
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.moveTo(lado * 0.85 + gx * 0.3, -0.35);
      ctx.lineTo(lado * 0.7 + gx * 0.3, -1.15);
      ctx.lineTo(lado * 0.2 + gx * 0.3, -0.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fda4af";
      ctx.beginPath();
      ctx.moveTo(lado * 0.72 + gx * 0.3, -0.5);
      ctx.lineTo(lado * 0.66 + gx * 0.3, -0.98);
      ctx.lineTo(lado * 0.36 + gx * 0.3, -0.76);
      ctx.closePath();
      ctx.fill();
    }
  } else if (estilo === "robot") {
    ctx.strokeStyle = c.borde;
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.moveTo(gx * 0.4, -0.95);
    ctx.lineTo(gx * 0.5, -1.3);
    ctx.stroke();
    ctx.fillStyle = p.boca > 0.3 ? "#f87171" : "#22d3ee"; // la luz cambia al hablar
    ctx.beginPath();
    ctx.arc(gx * 0.5, -1.35, 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cabeza (se estrecha un poco al girar)
  ctx.fillStyle = c.piel;
  ctx.strokeStyle = c.borde;
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  if (estilo === "robot") {
    const w = 0.95 * (1 - Math.abs(giro.yaw) * 0.08);
    redondeado(ctx, -w, -0.95, 2 * w, 1.9, 0.3);
  } else {
    ctx.ellipse(0, 0, 1 * (1 - Math.abs(giro.yaw) * 0.08), 0.98, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();

  // Mejillas: se sonrojan al sonreir o al inflar los mofletes
  const rubor = Math.max(p.sonrisa, p.mejillas);
  if (rubor > 0.2) {
    ctx.fillStyle = c.mejilla;
    ctx.globalAlpha = limitar(rubor);
    for (const lado of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(lado * (0.55 + p.mejillas * 0.1) + gx, 0.25 + gy, 0.18 + p.mejillas * 0.08, 0.11, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Ojos y cejas
  for (const [lado, abierto, ceja] of [[-1, p.ojoIzq, p.cejaIzq], [1, p.ojoDer, p.cejaDer]]) {
    const ox = lado * 0.36 + gx;
    const oy = -0.18 + gy;
    const rx = 0.17;
    const ry = 0.2 * Math.max(abierto, 0.06);
    if (estilo === "robot") {
      ctx.fillStyle = "#0f172a";
      redondeado(ctx, ox - 0.2, oy - 0.2, 0.4, 0.4, 0.06);
      ctx.fill();
      ctx.fillStyle = "#22d3ee";
      ctx.beginPath();
      ctx.rect(ox - 0.15 + p.miradaX * 0.05, oy - ry * 0.8 + p.miradaY * 0.05, 0.3, Math.max(ry * 1.6, 0.025));
      ctx.fill();
    } else if (abierto < 0.25) {
      // Ojo cerrado: una curva
      ctx.strokeStyle = c.detalle;
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.arc(ox, oy - 0.04, rx, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    } else {
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = c.borde;
      ctx.lineWidth = 0.03;
      ctx.beginPath();
      ctx.ellipse(ox, oy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Pupila: sigue tu mirada (gato: pupila alargada)
      ctx.fillStyle = c.detalle;
      ctx.beginPath();
      const px = ox + p.miradaX * rx * 0.5;
      const py = oy + p.miradaY * ry * 0.4;
      if (estilo === "gato") ctx.ellipse(px, py, 0.035, Math.min(ry * 0.85, 0.15), 0, 0, Math.PI * 2);
      else ctx.ellipse(px, py, 0.08, Math.min(0.09, ry * 0.8), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(px + 0.03, py - 0.03, 0.022, 0, Math.PI * 2);
      ctx.fill();
    }
    // Ceja: sube, baja y se inclina (fruncir = la parte de dentro baja)
    const cy = -0.48 - ceja * 0.15 + gy;
    const inclinacion = ceja < 0 ? ceja * 0.12 : 0;
    ctx.strokeStyle = c.detalle;
    ctx.lineWidth = estilo === "robot" ? 0.07 : 0.06;
    ctx.beginPath();
    ctx.moveTo(ox - lado * 0.17, cy - inclinacion);
    ctx.quadraticCurveTo(ox, cy - 0.06, ox + lado * 0.17, cy + inclinacion * 0.2);
    ctx.stroke();
  }

  // Nariz y bigotes (gato)
  if (estilo === "gato") {
    ctx.fillStyle = "#be185d";
    ctx.beginPath();
    ctx.moveTo(gx * 1.2 - 0.07, 0.12 + gy);
    ctx.lineTo(gx * 1.2 + 0.07, 0.12 + gy);
    ctx.lineTo(gx * 1.2, 0.2 + gy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = c.detalle;
    ctx.lineWidth = 0.02;
    for (const lado of [-1, 1]) {
      for (const dy of [-0.05, 0.04]) {
        ctx.beginPath();
        ctx.moveTo(lado * 0.25 + gx, 0.25 + gy);
        ctx.lineTo(lado * 0.85 + gx, 0.2 + gy + dy * 2);
        ctx.stroke();
      }
    }
  } else if (estilo === "emoji") {
    ctx.strokeStyle = c.borde;
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    ctx.moveTo(gx * 1.2, 0.0 + gy);
    ctx.quadraticCurveTo(gx * 1.2 + 0.06, 0.12 + gy, gx * 1.2 - 0.02, 0.15 + gy);
    ctx.stroke();
  }

  // Boca
  const bx = gx * 1.1;
  const by = 0.45 + gy;
  ctx.strokeStyle = c.detalle;
  ctx.fillStyle = estilo === "robot" ? "#0f172a" : "#7f1d1d";
  ctx.lineWidth = 0.05;
  if (p.beso > 0.5 && p.boca < 0.3) {
    // Morritos: una "o" pequena
    ctx.beginPath();
    ctx.ellipse(bx, by, 0.08, 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (estilo === "robot") {
    // Rejilla LED: mas barras encendidas cuanto mas abres la boca
    redondeado(ctx, bx - 0.4, by - 0.1, 0.8, 0.2 + p.boca * 0.25, 0.05);
    ctx.fill();
    ctx.fillStyle = "#22d3ee";
    const barras = 7;
    for (let i = 0; i < barras; i++) {
      const h = 0.04 + p.boca * 0.25 * (1 - Math.abs(i - 3) / 4) + Math.max(p.sonrisa, 0) * 0.02;
      // Al sonreir, las barras de los lados suben: la rejilla dibuja una sonrisa
      const curva = p.sonrisa * (0.03 - 0.08 * ((i - 3) / 3) ** 2);
      ctx.fillRect(bx - 0.35 + i * 0.1, by + p.boca * 0.12 - h / 2 + curva, 0.06, h);
    }
  } else {
    const ancho = 0.32 + Math.max(p.sonrisa, 0) * 0.12 - p.beso * 0.1;
    const curva = p.sonrisa * 0.18; // >0 sonrisa, <0 tristeza
    const abre = p.boca * 0.32;
    ctx.beginPath();
    ctx.moveTo(bx - ancho, by - curva * 0.5);
    ctx.quadraticCurveTo(bx, by + curva * 0.8, bx + ancho, by - curva * 0.5);
    if (abre > 0.03) {
      ctx.quadraticCurveTo(bx, by + curva * 0.8 + abre * 2, bx - ancho, by - curva * 0.5);
      ctx.fill();
      // Lengua
      ctx.fillStyle = "#f87171";
      ctx.beginPath();
      ctx.ellipse(bx, by + curva * 0.4 + abre * 0.75, ancho * 0.45, abre * 0.35, 0, 0, Math.PI);
      ctx.fill();
    }
    ctx.stroke();
  }
}

function redondeado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
