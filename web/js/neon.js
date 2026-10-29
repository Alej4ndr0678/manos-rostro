// Cuerpo de neon: el esqueleto de todo el cuerpo (33 puntos de MediaPipe Pose) dibujado con
// luz que deja estela, y chispas que salen de manos y pies cuanto mas rapido los mueves.
// Aqui va la parte sin navegador; main.js dibuja.

export const EXTREMOS = { manoIzq: 15, manoDer: 16, pieIzq: 27, pieDer: 28 };
export const VISIBILIDAD = 0.5; // por debajo, el punto no se dibuja (seguramente esta fuera de la imagen)
export const VELOCIDAD_CHISPAS = 0.4; // altos de pantalla por segundo para empezar a soltar chispas

// Indices de los puntos que se ven bien
export function visibles(puntos, umbral = VISIBILIDAD) {
  const vistos = new Set();
  puntos.forEach((p, i) => {
    if ((p.visibility ?? 1) >= umbral) vistos.add(i);
  });
  return vistos;
}

export class Chispas {
  constructor(azar = Math.random) {
    this.azar = azar;
    this.anteriores = new Map(); // clave -> {x, y}
    this.lista = [];
  }

  // extremos = [{clave, x, y}] en fracciones de la pantalla; aspecto = ancho / alto
  actualizar(extremos, dt, aspecto = 16 / 9) {
    dt = Math.min(dt, 0.1);
    const actuales = new Map();
    for (const { clave, x, y } of extremos) {
      actuales.set(clave, { x, y });
      const antes = this.anteriores.get(clave);
      if (!antes || dt <= 0) continue;
      const vx = (x - antes.x) / dt;
      const vy = (y - antes.y) / dt;
      const velocidad = Math.hypot(vx * aspecto, vy);
      if (velocidad < VELOCIDAD_CHISPAS) continue;
      // Mas rapido = mas chispas, que salen en la direccion del movimiento
      const cuantas = Math.min(12, Math.floor(velocidad * 3));
      for (let i = 0; i < cuantas; i++) {
        const ang = this.azar() * Math.PI * 2;
        const fuerza = 0.1 + this.azar() * 0.3;
        this.lista.push({
          x,
          y,
          vx: vx * 0.3 + (Math.cos(ang) * fuerza) / aspecto,
          vy: vy * 0.3 + Math.sin(ang) * fuerza,
          vida: 1,
          tono: this.azar() * 60,
        });
      }
    }
    this.anteriores = actuales;
    for (const c of this.lista) {
      c.vy += 0.8 * dt; // caen un poco
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vida -= dt * 1.5;
    }
    this.lista = this.lista.filter((c) => c.vida > 0).slice(-800);
    return this.lista;
  }
}
