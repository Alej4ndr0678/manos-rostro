// Agarrar, mover, girar y escalar objetos con las manos (modo 3D).
// - Pellizco (pulgar + indice) cerca de un objeto = agarrarlo. Al mover la mano se mueve.
// - Girar la muneca mientras lo tienes agarrado = girarlo.
// - Agarrarlo con LAS DOS manos y separarlas o juntarlas = hacerlo mas grande o mas pequeno.
// - Al soltarlo con la mano en movimiento, sale "lanzado" y sigue girando (inercia).
// Todo en fracciones de la pantalla (0 a 1). La escena 3D solo lee el resultado.

export const UMBRAL_PELLIZCO = 0.28; // distancia pulgar-indice / tamano de la mano para agarrar
export const UMBRAL_SOLTAR = 0.42; // hay que separar mas para soltar (evita soltar sin querer)
export const RADIO_AGARRE = 0.13; // a que distancia del objeto (fraccion del alto) se puede agarrar
const ROZAMIENTO = 0.92; // cuanto frena la inercia en cada paso de 1/60 s
const ESCALA_MIN = 0.4;
const ESCALA_MAX = 3;

// Datos de una mano para manipular: punto del pellizco, si pellizca y el angulo de la muneca.
// puntos = 21 puntos en fracciones de la pantalla. pellizcando = estado anterior (histeresis).
export function leerMano(puntos, pellizcando = false, aspecto = 16 / 9) {
  const d = (a, b) => Math.hypot((a.x - b.x) * aspecto, a.y - b.y);
  const tamano = d(puntos[0], puntos[9]) || 1e-6;
  const pinza = d(puntos[4], puntos[8]) / tamano;
  return {
    x: (puntos[4].x + puntos[8].x) / 2,
    y: (puntos[4].y + puntos[8].y) / 2,
    pellizco: pellizcando ? pinza < UMBRAL_SOLTAR : pinza < UMBRAL_PELLIZCO,
    // Angulo de la linea muneca -> nudillo del corazon (girar la muneca lo cambia)
    angulo: Math.atan2((puntos[9].x - puntos[0].x) * aspecto, -(puntos[9].y - puntos[0].y)),
  };
}

// Diferencia entre dos angulos, siempre entre -pi y pi (para que no "salte" al dar la vuelta)
export function difAngulo(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export class Manipulador {
  constructor(objetos, aspecto = 16 / 9) {
    // objetos = [{id, x, y, escala, giro}] (giro en radianes, alrededor del eje que mira a la camara)
    this.objetos = objetos.map((o) => ({ giroY: 0, vx: 0, vy: 0, vGiro: 0, ...o }));
    this.aspecto = aspecto;
    this.agarres = new Map(); // lado de la mano -> {obj, dx, dy, angulo}
    this.pellizcos = new Map(); // lado -> si estaba pellizcando (para la histeresis)
    this.dosManos = null; // {obj, distancia, escala, angulo} con las dos manos sobre el mismo objeto
  }

  distancia(o, x, y) {
    return Math.hypot((o.x - x) * this.aspecto, o.y - y);
  }

  masCercano(x, y) {
    let mejor = null;
    for (const o of this.objetos) {
      const d = this.distancia(o, x, y);
      if (d < RADIO_AGARRE * o.escala && (!mejor || d < mejor.d)) mejor = { o, d };
    }
    return mejor?.o ?? null;
  }

  // manos = [{lado, puntos}] con los puntos en fracciones de la pantalla. dt en segundos.
  actualizar(manos, dt) {
    const leidas = new Map();
    for (const { lado, puntos } of manos) {
      const m = leerMano(puntos, this.pellizcos.get(lado), this.aspecto);
      this.pellizcos.set(lado, m.pellizco);
      leidas.set(lado, m);
    }
    for (const lado of [...this.pellizcos.keys()]) if (!leidas.has(lado)) this.pellizcos.delete(lado);

    // 1) Soltar: la mano se abrio o desaparecio. Lo que llevaba sale con inercia.
    for (const [lado, agarre] of [...this.agarres]) {
      const m = leidas.get(lado);
      if (m?.pellizco) agarre.mano = m;
      else this.agarres.delete(lado);
    }
    // 2) Agarrar: pellizco nuevo cerca de un objeto
    for (const [lado, m] of leidas) {
      if (m.pellizco && !this.agarres.has(lado)) {
        const o = this.masCercano(m.x, m.y);
        if (o) this.agarres.set(lado, { obj: o, dx: o.x - m.x, dy: o.y - m.y, angulo: m.angulo, mano: m });
      }
    }

    // 3) Mover
    const pasos = Math.max(dt * 60, 1e-6);
    const agarrados = new Map(); // objeto -> agarres sobre el
    for (const a of this.agarres.values()) {
      if (!agarrados.has(a.obj)) agarrados.set(a.obj, []);
      agarrados.get(a.obj).push(a);
    }
    if (this.dosManos && (agarrados.get(this.dosManos.obj)?.length ?? 0) < 2) {
      // Al pasar de dos manos a una, la que queda sigue desde donde esta ahora el objeto
      for (const a of this.agarres.values()) {
        if (a.obj === this.dosManos.obj) {
          a.dx = a.obj.x - a.mano.x;
          a.dy = a.obj.y - a.mano.y;
          a.angulo = a.mano.angulo;
        }
      }
      this.dosManos = null;
    }
    for (const [o, lista] of agarrados) {
      if (lista.length >= 2) {
        // Dos manos: escala segun la distancia entre ellas y giro segun la linea que las une
        const [a, b] = lista;
        const dist = Math.hypot((a.mano.x - b.mano.x) * this.aspecto, a.mano.y - b.mano.y) || 1e-6;
        const ang = Math.atan2(b.mano.y - a.mano.y, (b.mano.x - a.mano.x) * this.aspecto);
        if (!this.dosManos || this.dosManos.obj !== o) {
          this.dosManos = { obj: o, distancia: dist, escala: o.escala, angulo: ang, giro: o.giro };
        }
        const antes = { x: o.x, y: o.y, giro: o.giro };
        o.escala = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, (this.dosManos.escala * dist) / this.dosManos.distancia));
        o.giro = this.dosManos.giro - difAngulo(ang, this.dosManos.angulo);
        o.x = (a.mano.x + b.mano.x) / 2;
        o.y = (a.mano.y + b.mano.y) / 2;
        this.velocidad(o, antes, pasos);
      } else {
        const a = lista[0];
        const antes = { x: o.x, y: o.y, giro: o.giro };
        o.x = a.mano.x + a.dx;
        o.y = a.mano.y + a.dy;
        // Girar la muneca gira el objeto (y "da cuerda": el angulo se va acumulando)
        o.giro -= difAngulo(a.mano.angulo, a.angulo);
        a.angulo = a.mano.angulo;
        this.velocidad(o, antes, pasos);
      }
    }

    // 4) Inercia de los que no esta agarrando nadie
    for (const o of this.objetos) {
      if (agarrados.has(o)) continue;
      o.x += o.vx * pasos;
      o.y += o.vy * pasos;
      o.giro += o.vGiro * pasos;
      // Rebota en los bordes de la pantalla
      if (o.x < 0.05 || o.x > 0.95) {
        o.vx = -o.vx;
        o.x = Math.min(0.95, Math.max(0.05, o.x));
      }
      if (o.y < 0.08 || o.y > 0.92) {
        o.vy = -o.vy;
        o.y = Math.min(0.92, Math.max(0.08, o.y));
      }
      const frena = ROZAMIENTO ** pasos;
      o.vx *= frena;
      o.vy *= frena;
      o.vGiro *= ROZAMIENTO ** (pasos * 0.3); // el giro dura mas que el desplazamiento
      o.giroY += 0.01 * pasos; // todos giran un poco solos, para que se vea que son 3D
    }
    return agarrados;
  }

  velocidad(o, antes, pasos) {
    // Velocidad por paso de 1/60 s, para lanzar el objeto al soltarlo
    o.vx = 0.6 * o.vx + 0.4 * ((o.x - antes.x) / pasos);
    o.vy = 0.6 * o.vy + 0.4 * ((o.y - antes.y) / pasos);
    o.vGiro = 0.6 * o.vGiro + 0.4 * ((o.giro - antes.giro) / pasos);
  }

  agarradoPor(o) {
    return [...this.agarres.entries()].filter(([, a]) => a.obj === o).map(([lado]) => lado);
  }
}
