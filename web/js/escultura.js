// Escultura de luz en 3D: dibujas en el aire con un pellizco mientras la escena gira despacio
// (como un torno de alfarero). Lo que dibujas se queda pegado a la escena que gira, asi que
// cada trazo acaba en un angulo distinto y, poco a poco, sale una figura en 3D de verdad.
// Aqui no se dibuja nada: solo se calculan los puntos 3D. escena3d.js los pinta con Three.js.

export const SEPARACION = 0.04; // distancia maxima entre dos puntos seguidos de un trazo (unidades 3D)
export const MAX_PUNTOS = 8000;
export const VELOCIDAD_GIRO = 0.6; // radianes por segundo

// Punto de la pantalla (x, y de 0 a 1) en el plano que mira a la camara, pasado a las
// coordenadas de la escena girada "giro" radianes alrededor del eje vertical
export function aEscena(x, y, giro, anchoMundo, altoMundo) {
  const X = (x - 0.5) * anchoMundo;
  const Y = (0.5 - y) * altoMundo;
  // Deshacemos el giro (el plano de dibujo esta en z = 0)
  return { x: X * Math.cos(giro), y: Y, z: X * Math.sin(giro) };
}

export class Escultura {
  // anchoMundo / altoMundo = tamano de lo que se ve en el plano z = 0, en unidades 3D
  constructor(anchoMundo, altoMundo) {
    this.anchoMundo = anchoMundo;
    this.altoMundo = altoMundo;
    this.trazos = []; // [{color, puntos: [{x, y, z}]}]
    this.giro = 0;
    this.girando = true;
    this.dibujando = false;
    this.version = 0; // cambia al borrar o deshacer (para que la escena 3D lo redibuje todo)
    this.color = 0; // tono del siguiente trazo (0 a 360)
  }

  get total() {
    return this.trazos.reduce((n, t) => n + t.puntos.length, 0);
  }

  // pinza = {x, y, pellizco} en fracciones de la pantalla, o null. dt en segundos.
  actualizar(pinza, dt) {
    if (this.girando) this.giro += VELOCIDAD_GIRO * Math.min(dt, 0.1);
    if (!pinza?.pellizco) {
      this.dibujando = false;
      return;
    }
    const p = aEscena(pinza.x, pinza.y, this.giro, this.anchoMundo, this.altoMundo);
    if (!this.dibujando) {
      this.dibujando = true;
      this.trazos.push({ color: this.color, puntos: [p] });
      this.color = (this.color + 47) % 360; // cada trazo de un color
      return;
    }
    const puntos = this.trazos.at(-1).puntos;
    const ultimo = puntos.at(-1);
    const d = Math.hypot(p.x - ultimo.x, p.y - ultimo.y, p.z - ultimo.z);
    // Rellenamos los huecos para que el trazo sea continuo aunque la mano vaya rapido
    const pasos = Math.ceil(d / SEPARACION);
    for (let i = 1; i <= pasos && this.total < MAX_PUNTOS; i++) {
      const f = i / pasos;
      puntos.push({ x: ultimo.x + (p.x - ultimo.x) * f, y: ultimo.y + (p.y - ultimo.y) * f, z: ultimo.z + (p.z - ultimo.z) * f });
    }
  }

  deshacer() {
    this.trazos.pop();
    this.dibujando = false;
    this.version++;
  }

  borrar() {
    this.trazos = [];
    this.dibujando = false;
    this.version++;
  }
}
