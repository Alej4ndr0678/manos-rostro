// Corta frutas con los dedos (como Fruit Ninja): mueve la punta del indice rapido para dejar
// una estela que corta. Las frutas salen desde abajo, suben y caen.
//   Fruta cortada = +1. Cortar 3 o mas de un solo tajo = combo (puntos extra).
//   Fruta que cae sin cortar = pierdes una vida (hay 3). Cortar una bomba = fin de la partida.
// Para empezar (y para volver a jugar) se corta la sandia del centro: no hace falta teclado.
// Todo va en fracciones de la pantalla (x e y de 0 a 1) y en segundos; la x se multiplica por
// el aspecto (ancho / alto) al medir distancias, para que las frutas sean redondas.

export const VIDAS = 3;
export const GRAVEDAD = 1.6; // fracciones del alto por segundo al cuadrado
export const RADIO = 0.075; // radio de una fruta (fraccion del alto)
export const VEL_CORTE = 1.4; // velocidad minima del dedo (altos por segundo) para que corte
export const VENTANA_COMBO = 0.25; // segundos maximos entre cortes del mismo tajo
export const ESPERA_REINICIO = 1.5; // segundos tras perder antes de poder volver a empezar
const DURACION_RASTRO = 0.15; // segundos que dura la estela del dedo

export const FRUTAS = [
  { emoji: "🍉", color: "#ef4444" },
  { emoji: "🍊", color: "#fb923c" },
  { emoji: "🍎", color: "#dc2626" },
  { emoji: "🍋", color: "#facc15" },
  { emoji: "🍇", color: "#a855f7" },
  { emoji: "🥝", color: "#84cc16" },
  { emoji: "🍑", color: "#fdba74" },
  { emoji: "🍍", color: "#fde047" },
];
export const BOMBA = { emoji: "💣", color: "#e5e7eb", bomba: true };

// Si el segmento p1 -> p2 pasa a menos de "radio" del centro c (con la x escalada por el aspecto)
export function cortaSegmento(p1, p2, c, radio, aspecto = 1) {
  const ax = p1.x * aspecto;
  const bx = p2.x * aspecto;
  const cx = c.x * aspecto;
  const dx = bx - ax;
  const dy = p2.y - p1.y;
  const largo2 = dx * dx + dy * dy;
  // Punto del segmento mas cercano al centro (t entre 0 y 1)
  const t = largo2 === 0 ? 0 : Math.min(1, Math.max(0, ((cx - ax) * dx + (c.y - p1.y) * dy) / largo2));
  return Math.hypot(ax + t * dx - cx, p1.y + t * dy - c.y) <= radio;
}

// Cuanto tiempo entre oleadas y probabilidad de bomba segun los segundos de partida
export function dificultad(segundos) {
  return {
    intervalo: Math.max(0.8, 2 - segundos * 0.02),
    maxPorOleada: Math.min(5, 1 + Math.floor(segundos / 12)),
    probBomba: segundos < 6 ? 0 : Math.min(0.3, 0.1 + segundos * 0.003),
  };
}

export class Ninja {
  // azar = funcion que devuelve un numero de 0 a 1 (en las pruebas se pasa una fija)
  constructor(aspecto = 16 / 9, azar = Math.random) {
    this.aspecto = aspecto;
    this.azar = azar;
    this.record = 0;
    this.reiniciar();
  }

  reiniciar() {
    this.estado = "espera"; // espera -> jugando -> fin -> espera...
    this.objetos = [this.diana()];
    this.trozos = []; // mitades de las frutas cortadas
    this.manchas = []; // zumo en la pantalla
    this.rastros = new Map(); // dedo -> [{x, y, t}] (la estela)
    this.puntos = 0;
    this.vidas = VIDAS;
    this.inicio = null;
    this.proximaOleada = 0;
    this.combo = { n: 0, ultimo: -Infinity, x: 0, y: 0 };
    this.finEn = null;
    this.nuevoRecord = false;
  }

  // La sandia quieta del centro que hay que cortar para empezar
  diana() {
    return { ...FRUTAS[0], x: 0.5, y: 0.45, vx: 0, vy: 0, giro: 0, vGiro: 0.8, radio: RADIO * 1.6, diana: true };
  }

  empezar(ahora) {
    this.estado = "jugando";
    this.objetos = []; // las frutas que quedaban de la partida anterior no cuentan
    this.inicio = ahora;
    this.proximaOleada = ahora + 0.6;
    this.puntos = 0;
    this.vidas = VIDAS;
    this.nuevoRecord = false;
  }

  lanzarOleada(ahora) {
    const { intervalo, maxPorOleada, probBomba } = dificultad(ahora - this.inicio);
    const cuantas = 1 + Math.floor(this.azar() * maxPorOleada);
    for (let i = 0; i < cuantas; i++) {
      const tipo = this.azar() < probBomba ? BOMBA : FRUTAS[Math.floor(this.azar() * FRUTAS.length) % FRUTAS.length];
      const x = 0.15 + this.azar() * 0.7;
      this.objetos.push({
        ...tipo,
        x,
        y: 1 + RADIO,
        // Hacia el centro, para que no se salgan por los lados, y con fuerza para subir hasta arriba
        vx: (0.5 - x) * (0.3 + this.azar() * 0.5),
        vy: -(1.55 + this.azar() * 0.3),
        giro: 0,
        vGiro: (this.azar() - 0.5) * 6,
        radio: RADIO,
      });
    }
    this.proximaOleada = ahora + intervalo;
  }

  // dedos = [{clave, x, y}] (puntas de los dedos que cortan). Devuelve una lista de eventos:
  // {tipo: "corte" | "combo" | "fallo" | "bomba" | "empezar" | "fin", ...}
  actualizar(dedos, dt, ahora) {
    dt = Math.min(dt, 0.05); // si el navegador se para un momento, que no salten las frutas
    const eventos = [];

    // 1) Estelas de los dedos (y si cortan algo)
    const vistos = new Set();
    for (const { clave, x, y } of dedos) {
      vistos.add(clave);
      const rastro = this.rastros.get(clave) ?? [];
      const anterior = rastro.at(-1);
      rastro.push({ x, y, t: ahora });
      while (rastro.length && ahora - rastro[0].t > DURACION_RASTRO) rastro.shift();
      this.rastros.set(clave, rastro);
      if (!anterior || ahora <= anterior.t) continue;
      const velocidad = Math.hypot((x - anterior.x) * this.aspecto, y - anterior.y) / (ahora - anterior.t);
      if (velocidad < VEL_CORTE) continue;
      for (const o of [...this.objetos]) {
        // (comprobamos que sigue ahi: otro dedo puede haberla cortado en este mismo frame)
        if (this.objetos.includes(o) && cortaSegmento(anterior, { x, y }, o, o.radio, this.aspecto)) {
          eventos.push(...this.cortar(o, Math.atan2(y - anterior.y, (x - anterior.x) * this.aspecto), ahora));
        }
      }
    }
    for (const clave of [...this.rastros.keys()]) if (!vistos.has(clave)) this.rastros.delete(clave);

    // 2) Combo: si pasa un momento sin cortar, se cierra el tajo
    if (this.combo.n > 0 && ahora - this.combo.ultimo > VENTANA_COMBO) {
      if (this.combo.n >= 3 && this.estado === "jugando") {
        this.puntos += this.combo.n;
        eventos.push({ tipo: "combo", n: this.combo.n, x: this.combo.x, y: this.combo.y });
      }
      this.combo.n = 0;
    }

    // 3) Nuevas frutas
    if (this.estado === "jugando" && ahora >= this.proximaOleada) this.lanzarOleada(ahora);
    if (this.estado === "fin" && ahora - this.finEn >= ESPERA_REINICIO && !this.objetos.some((o) => o.diana)) {
      this.objetos.push(this.diana());
    }

    // 4) Mover todo
    for (const o of this.objetos) {
      if (o.diana) {
        o.giro += o.vGiro * dt;
        continue;
      }
      o.vy += GRAVEDAD * dt;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.giro += o.vGiro * dt;
    }
    for (const t of this.trozos) {
      t.vy += GRAVEDAD * dt;
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      t.giro += t.vGiro * dt;
    }
    this.trozos = this.trozos.filter((t) => t.y < 1.3);
    this.manchas = this.manchas.filter((m) => ahora - m.t < 1.5);

    // 5) Frutas que caen sin cortar
    const fuera = this.objetos.filter((o) => !o.diana && o.vy > 0 && o.y > 1 + o.radio * 2);
    this.objetos = this.objetos.filter((o) => !fuera.includes(o));
    for (const o of fuera) {
      if (o.bomba || this.estado !== "jugando") continue;
      this.vidas -= 1;
      eventos.push({ tipo: "fallo", x: o.x });
      if (this.vidas <= 0) eventos.push(this.terminar(ahora));
    }
    return eventos;
  }

  cortar(o, angulo, ahora) {
    this.objetos = this.objetos.filter((x) => x !== o);
    const eventos = [{ tipo: "corte", objeto: o, angulo }];
    // Dos mitades que salen hacia los lados de la linea del corte
    const nx = -Math.sin(angulo);
    const ny = Math.cos(angulo);
    for (const lado of [1, -1]) {
      this.trozos.push({
        emoji: o.emoji,
        color: o.color,
        radio: o.radio,
        x: o.x,
        y: o.y,
        vx: o.vx + (lado * nx * 0.35) / this.aspecto,
        vy: Math.min(o.vy, 0) + lado * ny * 0.35 - 0.2,
        giro: o.giro,
        vGiro: o.vGiro + lado * 2,
        angulo,
        corte: angulo - o.giro, // angulo del corte visto desde la fruta (para dibujar cada mitad)
        lado,
      });
    }
    if (o.bomba) {
      eventos.push({ tipo: "bomba", x: o.x, y: o.y });
      if (this.estado === "jugando") eventos.push(this.terminar(ahora));
      return eventos;
    }
    this.manchas.push({ x: o.x, y: o.y, color: o.color, radio: o.radio * (0.9 + this.azar() * 0.6), t: ahora });
    if (o.diana) {
      if (this.estado !== "jugando") {
        this.empezar(ahora);
        eventos.push({ tipo: "empezar" });
      }
      return eventos;
    }
    if (this.estado === "jugando") {
      this.puntos += 1;
      this.combo.n += 1;
      this.combo.ultimo = ahora;
      this.combo.x = o.x;
      this.combo.y = o.y;
    }
    return eventos;
  }

  terminar(ahora) {
    this.estado = "fin";
    this.finEn = ahora;
    this.combo.n = 0;
    if (this.puntos > this.record) {
      this.record = this.puntos;
      this.nuevoRecord = true;
    }
    return { tipo: "fin", puntos: this.puntos };
  }
}
