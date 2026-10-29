// Pong con las manos: la mano que este en la mitad izquierda mueve la pala izquierda y la de
// la derecha, la pala derecha. Si solo hay una mano, la otra pala la mueve el ordenador.
// Todo en fracciones de la pantalla (x e y de 0 a 1). "aspecto" = ancho / alto, para que la
// pelota vaya igual de rapido en horizontal que en vertical.

export const ALTO_PALA = 0.22;
export const X_PALAS = [0.04, 0.96];
export const PUNTOS_PARA_GANAR = 7;
const VELOCIDAD_INICIAL = 0.45; // fraccion del ALTO por segundo
const ACELERACION = 1.06; // cada golpe la pelota va un 6 % mas rapido
const VELOCIDAD_MAXIMA = 1.6;
const RADIO = 0.018;
const VELOCIDAD_CPU = 0.55; // lo rapido que se mueve la pala del ordenador (alto por segundo)

export class Pong {
  constructor(aspecto = 16 / 9, azar = Math.random) {
    this.aspecto = aspecto;
    this.azar = azar;
    this.palas = [0.5, 0.5]; // centro (y) de cada pala
    this.marcador = [0, 0];
    this.estado = "jugando"; // jugando | fin
    this.ganador = null;
    this.golpes = 0;
    this.sacar(this.azar() < 0.5 ? -1 : 1);
  }

  sacar(direccion) {
    this.pelota = { x: 0.5, y: 0.5, vx: 0, vy: 0, radio: RADIO };
    const angulo = (this.azar() - 0.5) * 0.8; // hasta ~23 grados arriba o abajo
    this.velocidad = VELOCIDAD_INICIAL;
    this.direccion = direccion;
    this.esperaHasta = null; // la pelota espera un momento antes de salir
    this.angulo = angulo;
    this.golpes = 0;
  }

  reiniciar() {
    this.marcador = [0, 0];
    this.estado = "jugando";
    this.ganador = null;
    this.sacar(this.azar() < 0.5 ? -1 : 1);
  }

  // manos = [y o null, y o null] (posicion vertical de cada mano). dt en segundos.
  // Devuelve un evento: "golpe", "punto0", "punto1", "fin" o null.
  actualizar(manos, dt, ahora) {
    if (this.estado !== "jugando") return null;
    dt = Math.min(dt, 0.05); // si el navegador se congela, que la pelota no atraviese las palas
    const p = this.pelota;
    for (const i of [0, 1]) {
      if (manos[i] !== null && manos[i] !== undefined) {
        this.palas[i] = manos[i];
      } else {
        // Ordenador: sigue la pelota con una velocidad maxima (asi se le puede ganar)
        const objetivo = p.vx * (i === 0 ? -1 : 1) > 0 ? p.y : 0.5;
        const paso = VELOCIDAD_CPU * dt;
        this.palas[i] += Math.max(-paso, Math.min(paso, objetivo - this.palas[i]));
      }
      this.palas[i] = Math.min(1 - ALTO_PALA / 2, Math.max(ALTO_PALA / 2, this.palas[i]));
    }

    if (this.esperaHasta === null) this.esperaHasta = ahora + 0.8;
    if (ahora < this.esperaHasta) return null;
    if (p.vx === 0 && p.vy === 0) {
      p.vx = Math.cos(this.angulo) * this.velocidad * this.direccion;
      p.vy = Math.sin(this.angulo) * this.velocidad;
    }

    // vx esta en "altos por segundo": en fracciones del ancho hay que dividir por el aspecto
    p.x += (p.vx * dt) / this.aspecto;
    p.y += p.vy * dt;
    if (p.y < p.radio || p.y > 1 - p.radio) {
      p.vy = -p.vy;
      p.y = Math.min(1 - p.radio, Math.max(p.radio, p.y));
    }

    for (const i of [0, 1]) {
      const haciaPala = i === 0 ? p.vx < 0 : p.vx > 0;
      const cruzo = i === 0 ? p.x - p.radio / this.aspecto <= X_PALAS[0] : p.x + p.radio / this.aspecto >= X_PALAS[1];
      if (haciaPala && cruzo && Math.abs(p.y - this.palas[i]) <= ALTO_PALA / 2 + p.radio) {
        // Rebote: cuanto mas lejos del centro de la pala, mas inclinado sale
        const donde = (p.y - this.palas[i]) / (ALTO_PALA / 2);
        const angulo = donde * 0.9;
        this.velocidad = Math.min(VELOCIDAD_MAXIMA, this.velocidad * ACELERACION);
        p.vx = Math.cos(angulo) * this.velocidad * (i === 0 ? 1 : -1);
        p.vy = Math.sin(angulo) * this.velocidad;
        p.x = i === 0 ? X_PALAS[0] + p.radio / this.aspecto : X_PALAS[1] - p.radio / this.aspecto;
        this.golpes++;
        return "golpe";
      }
    }

    // Punto: la pelota sale por un lado
    if (p.x < 0 || p.x > 1) {
      const ganaPunto = p.x < 0 ? 1 : 0;
      this.marcador[ganaPunto]++;
      if (this.marcador[ganaPunto] >= PUNTOS_PARA_GANAR) {
        this.estado = "fin";
        this.ganador = ganaPunto;
        return "fin";
      }
      this.sacar(ganaPunto === 0 ? 1 : -1); // saca hacia quien ha perdido el punto
      return `punto${ganaPunto}`;
    }
    return null;
  }
}
