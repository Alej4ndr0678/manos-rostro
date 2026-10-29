// Filtros de realidad aumentada (como los de Instagram o Snapchat) para el modo avatar:
// en vez de tapar la cara, se dibujan cosas encima que siguen tu cabeza.
//   Gafas de sol · Corona · Perro (orejas, nariz y lengua al abrir la boca)
// Con las gafas y la corona, al ABRIR LA BOCA sale un arcoiris.
// anclas() y Arcoiris no dibujan nada (se pueden probar sin navegador); dibujarFiltro() pinta.

export const FILTROS = ["gafas", "corona", "perro"];
export const BOCA_ABIERTA = 0.1; // separacion de los labios / alto de la cara para contar como abierta
const COLORES_ARCOIRIS = ["#ef4444", "#f97316", "#facc15", "#22c55e", "#3b82f6", "#8b5cf6"];

const medio = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distancia = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Puntos de referencia de la cara (puntos = los 478 de la malla, ya en pixeles y en espejo)
export function anclas(puntos) {
  let ojoA = medio(puntos[33], puntos[133]);
  let ojoB = medio(puntos[263], puntos[362]);
  if (ojoA.x > ojoB.x) [ojoA, ojoB] = [ojoB, ojoA]; // de izquierda a derecha en la pantalla
  const angulo = Math.atan2(ojoB.y - ojoA.y, ojoB.x - ojoA.x);
  const altoCara = distancia(puntos[10], puntos[152]) || 1;
  return {
    ojoIzq: ojoA,
    ojoDer: ojoB,
    ojos: medio(ojoA, ojoB),
    distOjos: distancia(ojoA, ojoB),
    angulo, // inclinacion de la cabeza
    frente: puntos[10],
    nariz: puntos[4],
    boca: medio(puntos[13], puntos[14]),
    abertura: distancia(puntos[13], puntos[14]) / altoCara,
    anchoCara: distancia(puntos[234], puntos[454]),
    altoCara,
    // Hacia "abajo" de la cara (perpendicular a la linea de los ojos)
    abajo: { x: -Math.sin(angulo), y: Math.cos(angulo) },
  };
}

// Arcoiris que sale de la boca: particulas de colores con un poco de gravedad
export class Arcoiris {
  constructor(azar = Math.random) {
    this.azar = azar;
    this.particulas = [];
    this.acumulado = 0;
  }

  // origen = boca, dir = hacia donde sale (vector unitario), escala = tamano de la cara en pixeles
  actualizar(abierta, origen, dir, escala, dt) {
    dt = Math.min(dt, 0.1);
    if (abierta) {
      this.acumulado += dt * 60; // 60 "rafagas" por segundo
      while (this.acumulado >= 1) {
        this.acumulado -= 1;
        const abanico = (this.azar() - 0.5) * 0.5;
        const velocidad = escala * (2.2 + this.azar() * 0.8);
        const vx = (dir.x * Math.cos(abanico) - dir.y * Math.sin(abanico)) * velocidad;
        const vy = (dir.x * Math.sin(abanico) + dir.y * Math.cos(abanico)) * velocidad;
        // Una particula de cada color, una al lado de otra: asi se ven las franjas
        COLORES_ARCOIRIS.forEach((color, i) => {
          const lado = (i - 2.5) * escala * 0.05;
          this.particulas.push({
            x: origen.x - dir.y * lado,
            y: origen.y + dir.x * lado,
            vx,
            vy,
            color,
            vida: 1,
            radio: escala * 0.06,
          });
        });
      }
    } else {
      this.acumulado = 0;
    }
    for (const p of this.particulas) {
      p.vy += escala * 3 * dt; // gravedad (proporcional al tamano de la cara)
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vida -= dt * 0.9;
      p.radio *= 1 + dt * 0.8; // se van abriendo
    }
    this.particulas = this.particulas.filter((p) => p.vida > 0);
    return this.particulas;
  }
}

// ---------- Dibujo ----------

function gafas(ctx, a) {
  const d = a.distOjos;
  ctx.save();
  ctx.translate(a.ojos.x, a.ojos.y);
  ctx.rotate(a.angulo);
  const w = d * 0.78;
  const h = d * 0.5;
  // Patillas y puente
  ctx.strokeStyle = "#111";
  ctx.lineWidth = d * 0.07;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-d / 2 - w / 2, -h * 0.25);
  ctx.lineTo(-d * 1.05, -h * 0.35);
  ctx.moveTo(d / 2 + w / 2, -h * 0.25);
  ctx.lineTo(d * 1.05, -h * 0.35);
  ctx.moveTo(-d / 2 + w / 2, -h * 0.2);
  ctx.quadraticCurveTo(0, -h * 0.45, d / 2 - w / 2, -h * 0.2);
  ctx.stroke();
  for (const lado of [-1, 1]) {
    const cx = (lado * d) / 2;
    // Cristal oscuro con un reflejo
    const grad = ctx.createLinearGradient(cx - w / 2, -h / 2, cx + w / 2, h / 2);
    grad.addColorStop(0, "#1f2937");
    grad.addColorStop(0.45, "#030712");
    grad.addColorStop(1, "#111827");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, -h / 2, w, h, [h * 0.15, h * 0.15, h * 0.5, h * 0.5]);
    ctx.fill();
    ctx.lineWidth = d * 0.05;
    ctx.strokeStyle = "#000";
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = d * 0.04;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.3, -h * 0.2);
    ctx.lineTo(cx - w * 0.05, -h * 0.35);
    ctx.stroke();
  }
  ctx.restore();
}

function corona(ctx, a, t) {
  const w = a.anchoCara * 0.95;
  const h = w * 0.42;
  ctx.save();
  // Encima de la frente, un poco hacia arriba en el eje de la cara
  ctx.translate(a.frente.x - a.abajo.x * h * 0.55, a.frente.y - a.abajo.y * h * 0.55);
  ctx.rotate(a.angulo);
  const grad = ctx.createLinearGradient(0, -h, 0, h / 2);
  grad.addColorStop(0, "#fef08a");
  grad.addColorStop(0.5, "#facc15");
  grad.addColorStop(1, "#b45309");
  ctx.fillStyle = grad;
  ctx.strokeStyle = "#92400e";
  ctx.lineWidth = w * 0.02;
  ctx.beginPath();
  ctx.moveTo(-w / 2, h / 2);
  const picos = 5;
  for (let i = 0; i <= picos * 2; i++) {
    const x = -w / 2 + (w * i) / (picos * 2);
    const y = i % 2 === 0 ? -h / 2 - (i === picos ? h * 0.25 : 0) : 0;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w / 2, h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Joyas
  const joyas = ["#ef4444", "#3b82f6", "#22c55e", "#3b82f6", "#ef4444"];
  joyas.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(-w / 2 + (w * (i + 0.5)) / joyas.length, h * 0.25, w * 0.035, 0, Math.PI * 2);
    ctx.fill();
  });
  // Destellos que parpadean
  ctx.fillStyle = "#fff";
  for (let i = 0; i < 3; i++) {
    const brillo = Math.max(0, Math.sin(t * 4 + i * 2.1));
    const x = -w / 2 + w * (0.2 + i * 0.3);
    const y = -h * 0.6 - (i === 1 ? h * 0.25 : 0);
    const r = w * 0.05 * brillo;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.25, y - r * 0.25);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x + r * 0.25, y + r * 0.25);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.25, y + r * 0.25);
    ctx.lineTo(x - r, y);
    ctx.lineTo(x - r * 0.25, y - r * 0.25);
    ctx.fill();
  }
  ctx.restore();
}

function perro(ctx, a) {
  const w = a.anchoCara;
  ctx.save();
  // Orejas: salen de lo alto de la cabeza y cuelgan a los lados, con la punta hacia fuera
  ctx.translate(a.frente.x, a.frente.y);
  ctx.rotate(a.angulo);
  for (const lado of [-1, 1]) {
    ctx.save();
    ctx.translate(lado * w * 0.42, w * 0.02);
    ctx.rotate(-lado * 0.35);
    ctx.fillStyle = "#78350f";
    ctx.beginPath();
    ctx.ellipse(0, w * 0.25, w * 0.13, w * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#a16207";
    ctx.beginPath();
    ctx.ellipse(-lado * w * 0.02, w * 0.28, w * 0.07, w * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  // Nariz de perro
  ctx.save();
  ctx.translate(a.nariz.x, a.nariz.y);
  ctx.rotate(a.angulo);
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.11, w * 0.075, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.ellipse(-w * 0.03, -w * 0.03, w * 0.03, w * 0.015, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Lengua: sale al abrir la boca y crece cuanto mas la abres
  if (a.abertura > BOCA_ABIERTA * 0.6) {
    const largo = Math.min(1, (a.abertura - BOCA_ABIERTA * 0.6) / 0.15) * w * 0.4;
    ctx.save();
    ctx.translate(a.boca.x, a.boca.y);
    ctx.rotate(a.angulo);
    ctx.fillStyle = "#f472b6";
    ctx.strokeStyle = "#be185d";
    ctx.lineWidth = w * 0.012;
    ctx.beginPath();
    ctx.moveTo(-w * 0.1, 0);
    ctx.lineTo(-w * 0.1, largo);
    ctx.arc(0, largo, w * 0.1, Math.PI, 0, true);
    ctx.lineTo(w * 0.1, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, largo * 0.15);
    ctx.lineTo(0, largo * 0.85);
    ctx.stroke();
    ctx.restore();
  }
}

export function dibujarFiltro(ctx, filtro, a, t) {
  if (filtro === "gafas") gafas(ctx, a);
  else if (filtro === "corona") corona(ctx, a, t);
  else if (filtro === "perro") perro(ctx, a);
}

export function dibujarArcoiris(ctx, particulas) {
  ctx.save();
  for (const p of particulas) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.vida * 1.5));
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radio, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
