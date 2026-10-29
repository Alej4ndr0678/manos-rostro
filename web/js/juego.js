// Minijuego de bolas de luz (como paso9_juego.py): explotalas con las puntas de los dedos.
//   Bola de color = +1   Bola dorada (mas rapida) = +3   Bola roja (bomba) = -5
// La logica no dibuja nada: main.js la pinta. Asi se puede probar sin navegador.
// Los tiempos van en segundos y las velocidades en fracciones del alto por segundo,
// para que el juego vaya igual de rapido con cualquier camara y cualquier FPS.

export const DURACION = 60;
export const MARGEN_TOQUE = 12; // pixeles de mas alrededor de la bola para que cuente el toque
// tipo: [puntos, color, probabilidad]
export const TIPOS = {
  normal: [1, null, 0.75],
  dorada: [3, "#ffd700", 0.12],
  bomba: [-5, "#ff3030", 0.13],
};
const COLORES_NORMALES = ["#00ffff", "#ff00ff", "#00ff00", "#3290ff"];

export function elegirTipo(r) {
  let acumulado = 0;
  for (const [tipo, [, , prob]] of Object.entries(TIPOS)) {
    acumulado += prob;
    if (r <= acumulado) return tipo;
  }
  return "normal";
}

export class Juego {
  // azar = funcion que devuelve un numero de 0 a 1 (en las pruebas se pasa una fija)
  constructor(ancho, alto, azar = Math.random) {
    this.ancho = ancho;
    this.alto = alto;
    this.azar = azar;
    this.estado = "inicio"; // inicio -> jugando -> fin
    this.record = 0;
    this.reiniciar();
  }

  reiniciar() {
    this.bolas = [];
    this.puntos = 0;
    this.inicio = null;
    this.proximaBola = 0;
    this.ultimo = null;
    this.temblorHasta = 0;
    this.nuevoRecord = false;
  }

  empezar(ahora) {
    this.reiniciar();
    this.estado = "jugando";
    this.inicio = ahora;
    this.ultimo = ahora;
  }

  tiempoRestante(ahora) {
    return this.inicio === null ? DURACION : Math.max(0, DURACION - (ahora - this.inicio));
  }

  crearBola(dificultad) {
    const tipo = elegirTipo(this.azar());
    const [puntos, color] = TIPOS[tipo];
    const escala = this.alto / 480; // en Python las bolas median 22-38 px con una imagen de 480 de alto
    const radio = (tipo === "dorada" ? 20 : 22 + this.azar() * 16) * escala;
    const velocidad = (0.2 + this.azar() * 0.13 + dificultad * 0.33) * this.alto;
    return {
      tipo,
      puntos,
      color: color ?? COLORES_NORMALES[Math.floor(this.azar() * COLORES_NORMALES.length)],
      radio,
      x: radio + this.azar() * (this.ancho - 2 * radio),
      y: -radio,
      vx: (this.azar() * 2 - 1) * 0.03 * this.alto,
      vy: velocidad * (tipo === "dorada" ? 1.5 : 1),
    };
  }

  // puntas = [{x, y}] en pixeles. Devuelve las bolas explotadas en este frame (para los efectos).
  actualizar(puntas, ahora) {
    if (this.estado !== "jugando") return [];
    const dt = Math.min(ahora - this.ultimo, 0.1); // si la pestana se congela, no saltar de golpe
    this.ultimo = ahora;
    const dificultad = 1 - this.tiempoRestante(ahora) / DURACION;

    if (ahora >= this.proximaBola) {
      this.bolas.push(this.crearBola(dificultad));
      this.proximaBola = ahora + Math.max(0.25, 0.9 - dificultad * 0.6);
    }

    const explotadas = [];
    const vivas = [];
    for (const bola of this.bolas) {
      bola.x += bola.vx * dt;
      bola.y += bola.vy * dt;
      if (bola.x < bola.radio || bola.x > this.ancho - bola.radio) bola.vx = -bola.vx;
      const tocada = puntas.some((p) => Math.hypot(p.x - bola.x, p.y - bola.y) < bola.radio + MARGEN_TOQUE);
      if (tocada) {
        this.puntos += bola.puntos;
        explotadas.push(bola);
        if (bola.tipo === "bomba") this.temblorHasta = ahora + 0.35;
      } else if (bola.y - bola.radio < this.alto) {
        vivas.push(bola);
      }
    }
    this.bolas = vivas;

    if (this.tiempoRestante(ahora) <= 0) {
      this.estado = "fin";
      if (this.puntos > this.record) {
        this.record = this.puntos;
        this.nuevoRecord = true;
      }
    }
    return explotadas;
  }

  temblando(ahora) {
    return ahora < this.temblorHasta;
  }
}
