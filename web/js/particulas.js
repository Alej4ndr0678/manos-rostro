// Particulas que salen de las puntas de los dedos (como paso6_particulas.py).
export const PUNTAS = [4, 8, 12, 16, 20];
const MAX_PARTICULAS = 1500;
const GRAVEDAD = 0.15;
const ROZAMIENTO = 0.97;
const COLORES = { Izquierda: [50, 180, 255], Derecha: [255, 120, 50] }; // RGB

export class Particulas {
  constructor() {
    this.lista = [];
    this.anteriores = new Map(); // donde estaba cada punta en el frame anterior
  }

  emitir(x, y, vx, vy, color, cantidad, dispersion) {
    for (let i = 0; i < cantidad && this.lista.length < MAX_PARTICULAS; i++) {
      const ang = Math.random() * Math.PI * 2;
      const fuerza = Math.random() * dispersion;
      const vida = 20 + Math.floor(Math.random() * 25);
      const c = color.map((v) => Math.max(0, Math.min(255, v + Math.round(Math.random() * 80 - 40))));
      this.lista.push({
        x, y,
        vx: vx * 0.5 + Math.cos(ang) * fuerza, // heredan la mitad del movimiento del dedo
        vy: vy * 0.5 + Math.sin(ang) * fuerza,
        color: c, vida, vidaMax: vida,
      });
    }
  }

  // manos = [{lado, puntos (en pixeles)}]
  procesar(manos) {
    const actuales = new Map();
    for (const { lado, puntos } of manos) {
      const color = COLORES[lado] ?? [255, 255, 255];
      for (const punta of PUNTAS) {
        const { x, y } = puntos[punta];
        const clave = `${lado}-${punta}`;
        const [px, py] = this.anteriores.get(clave) ?? [x, y];
        actuales.set(clave, [x, y]);
        const vx = x - px;
        const vy = y - py;
        this.emitir(x, y, vx, vy, color, 1 + Math.floor(Math.hypot(vx, vy) / 4), 2);
      }
      // Pellizco pulgar + indice = explosion
      const tamano = Math.hypot(puntos[0].x - puntos[9].x, puntos[0].y - puntos[9].y) || 1;
      const pinza = Math.hypot(puntos[4].x - puntos[8].x, puntos[4].y - puntos[8].y) / tamano;
      if (pinza < 0.25) {
        this.emitir((puntos[4].x + puntos[8].x) / 2, (puntos[4].y + puntos[8].y) / 2, 0, 0, [255, 255, 255], 25, 8);
      }
    }
    this.anteriores = actuales;
  }

  actualizarYDibujar(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter"; // los colores se suman: efecto de luz
    const vivas = [];
    for (const p of this.lista) {
      p.vy += GRAVEDAD;
      p.vx *= ROZAMIENTO;
      p.vy *= ROZAMIENTO;
      p.x += p.vx;
      p.y += p.vy;
      p.vida -= 1;
      if (p.vida <= 0) continue;
      vivas.push(p);
      const t = p.vida / p.vidaMax;
      ctx.fillStyle = `rgba(${p.color[0]}, ${p.color[1]}, ${p.color[2]}, ${t})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, 5 * t), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    this.lista = vivas;
  }

  vaciar() {
    this.lista = [];
    this.anteriores.clear();
  }
}
