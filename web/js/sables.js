// Sables de luz: cada mano sostiene un sable que sale de los nudillos en la direccion de la mano
// (de la muneca hacia los dedos). Un dron de entrenamiento flota arriba y dispara rayos:
// desvialos con el sable. Si devuelves un rayo al dron, punto extra. Si cruzas los dos sables, chocan.
// Aqui va la parte sin navegador (geometria y reglas); main.js dibuja y hace sonar.

export const LARGO = 0.5; // largo de la hoja, en altos de pantalla
export const ENCENDIDO = 0.25; // segundos que tarda en salir la hoja
export const RADIO_GOLPE = 0.035; // distancia de un rayo a la hoja para desviarlo
export const VEL_RAYO = 0.55; // altos de pantalla por segundo
export const VEL_ZAS = 2.5; // velocidad de la punta para que suene el "zas"
const ESPERA_CHOQUE = 0.2;
const ESPERA_ZAS = 0.25;
const GRACIA = 0.3; // segundos que aguanta el sable si se pierde la mano un momento

// Distancia del punto p al segmento a-b (todo en {x, y})
export function distanciaSegmento(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const largo2 = dx * dx + dy * dy;
  const t = largo2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / largo2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Punto donde se cruzan los segmentos a-b y c-d, o null si no se cruzan
export function cruce(a, b, c, d) {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-9) return null; // paralelos
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + t * r.x, y: a.y + t * r.y };
}

// puntos = los 21 puntos de una mano en fracciones de la pantalla. Devuelve la base y la punta
// de la hoja "sin estirar" (x multiplicada por el aspecto, para que las distancias sean reales).
export function hoja(puntos, aspecto = 16 / 9, largo = LARGO) {
  const muneca = { x: puntos[0].x * aspecto, y: puntos[0].y };
  const nudillo = { x: puntos[9].x * aspecto, y: puntos[9].y };
  const dx = nudillo.x - muneca.x;
  const dy = nudillo.y - muneca.y;
  const d = Math.hypot(dx, dy) || 1;
  return { base: nudillo, punta: { x: nudillo.x + (dx / d) * largo, y: nudillo.y + (dy / d) * largo } };
}

export class Sables {
  constructor(aspecto = 16 / 9, azar = Math.random) {
    this.aspecto = aspecto;
    this.azar = azar;
    this.sables = new Map(); // clave -> {base, punta, encendido, perdido, anterior, zas}
    this.rayos = [];
    this.tiempo = 0;
    this.dron = { x: aspecto / 2, y: 0.22 };
    this.proximoDisparo = 2;
    this.desviados = 0;
    this.racha = 0;
    this.mejorRacha = 0;
    this.impactos = 0;
    this.esperaChoque = 0;
    this.cruzados = false;
  }

  // Hojas que se pueden usar ahora mismo: [{clave, base, punta, encendido}] (base y punta "sin estirar")
  activos() {
    return [...this.sables.entries()]
      .filter(([, s]) => s.encendido > 0)
      .map(([clave, s]) => {
        const k = s.encendido;
        const punta = { x: s.base.x + (s.punta.x - s.base.x) * k, y: s.base.y + (s.punta.y - s.base.y) * k };
        return { clave, base: s.base, punta, encendido: k };
      });
  }

  intervalo() {
    return Math.max(0.6, 1.6 - this.desviados * 0.04); // cada vez dispara mas a menudo
  }

  // manos = [{clave, puntos}] en fracciones de la pantalla. Devuelve una lista de eventos:
  // encender, apagar, zas, choque, desvio, dron (le devolviste el rayo), impacto, disparo
  actualizar(manos, dt) {
    dt = Math.min(dt, 0.1);
    this.tiempo += dt;
    const eventos = [];
    const vistas = new Set();
    for (const { clave, puntos } of manos) {
      vistas.add(clave);
      const { base, punta } = hoja(puntos, this.aspecto);
      let s = this.sables.get(clave);
      if (!s) {
        s = { encendido: 0, zas: 0, anterior: null };
        this.sables.set(clave, s);
        eventos.push({ tipo: "encender", clave });
      }
      s.base = base;
      s.punta = punta;
      s.perdido = 0;
      s.encendido = Math.min(1, s.encendido + dt / ENCENDIDO);
      // "Zas" al mover rapido la punta
      s.zas = Math.max(0, s.zas - dt);
      if (s.anterior && dt > 0) {
        const vel = Math.hypot(punta.x - s.anterior.x, punta.y - s.anterior.y) / dt;
        if (vel > VEL_ZAS && s.zas === 0 && s.encendido === 1) {
          eventos.push({ tipo: "zas", clave, velocidad: vel });
          s.zas = ESPERA_ZAS;
        }
      }
      s.anterior = { ...punta };
    }
    // Las manos que no se ven: aguantan un momento y luego se apagan
    for (const [clave, s] of this.sables) {
      if (vistas.has(clave)) continue;
      s.perdido += dt;
      s.anterior = null;
      if (s.perdido > GRACIA) {
        s.encendido -= dt / ENCENDIDO;
        if (s.encendido <= 0) {
          this.sables.delete(clave);
          eventos.push({ tipo: "apagar", clave });
        }
      }
    }

    const activos = this.activos();
    // Choque entre dos sables
    this.esperaChoque = Math.max(0, this.esperaChoque - dt);
    const p = activos.length >= 2 ? cruce(activos[0].base, activos[0].punta, activos[1].base, activos[1].punta) : null;
    // Solo suena al cruzarlos, no todo el rato mientras siguen cruzados
    if (p && !this.cruzados && this.esperaChoque === 0) {
      eventos.push({ tipo: "choque", x: p.x / this.aspecto, y: p.y });
      this.esperaChoque = ESPERA_CHOQUE;
    }
    this.cruzados = Boolean(p);

    // El dron flota de lado a lado y solo dispara si tienes algun sable encendido
    const A = this.aspecto;
    this.dron = {
      x: A / 2 + A * 0.32 * Math.sin(this.tiempo * 0.7),
      y: 0.22 + 0.05 * Math.sin(this.tiempo * 1.9), // debajo de los marcadores
    };
    this.proximoDisparo -= dt;
    if (this.proximoDisparo <= 0) {
      this.proximoDisparo = this.intervalo();
      if (activos.length) {
        // Apunta cerca de un sable, para que haya que moverlo un poco
        const objetivo = activos[Math.floor(this.azar() * activos.length) % activos.length];
        const destino = { x: objetivo.base.x + (this.azar() - 0.5) * 0.5, y: objetivo.base.y + (this.azar() - 0.5) * 0.3 };
        const dx = destino.x - this.dron.x;
        const dy = destino.y - this.dron.y;
        const d = Math.hypot(dx, dy) || 1;
        this.rayos.push({ x: this.dron.x, y: this.dron.y, vx: (dx / d) * VEL_RAYO, vy: (dy / d) * VEL_RAYO, desviado: false });
        eventos.push({ tipo: "disparo" });
      }
    }

    // Mover los rayos y ver si tocan un sable, el dron o se salen
    const quedan = [];
    for (const r of this.rayos) {
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      if (!r.desviado) {
        const golpe = activos.find((s) => s.encendido > 0.8 && distanciaSegmento(r, s.base, s.punta) < RADIO_GOLPE);
        if (golpe) {
          // Rebota hacia el dron (con un poco de error) y mas rapido
          const dx = this.dron.x + (this.azar() - 0.5) * 0.3 - r.x;
          const dy = this.dron.y - r.y;
          const d = Math.hypot(dx, dy) || 1;
          r.vx = (dx / d) * VEL_RAYO * 1.6;
          r.vy = (dy / d) * VEL_RAYO * 1.6;
          r.desviado = true;
          this.desviados += 1;
          this.racha += 1;
          this.mejorRacha = Math.max(this.mejorRacha, this.racha);
          eventos.push({ tipo: "desvio", clave: golpe.clave, x: r.x / A, y: r.y, racha: this.racha });
        }
      } else if (Math.hypot(r.x - this.dron.x, r.y - this.dron.y) < 0.06) {
        eventos.push({ tipo: "dron", x: r.x / A, y: r.y });
        continue;
      }
      const fuera = r.x < -0.1 || r.x > A + 0.1 || r.y < -0.1 || r.y > 1.1;
      if (fuera) {
        if (!r.desviado) {
          this.impactos += 1;
          this.racha = 0;
          eventos.push({ tipo: "impacto", x: Math.max(0, Math.min(1, r.x / A)), y: Math.min(1, r.y) });
        }
        continue;
      }
      quedan.push(r);
    }
    this.rayos = quedan;
    return eventos;
  }
}
