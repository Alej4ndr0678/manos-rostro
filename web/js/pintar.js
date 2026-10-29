// Pintar en el aire con el indice (version simplificada de paso8_pintar.py).
// La logica no depende del navegador: recibe un "ctx" donde dibujar (un canvas 2D),
// asi en las pruebas se puede usar uno falso que solo apunta lo que se pinta.

export const PALETA = [
  { nombre: "Cian", color: "#00ffff" },
  { nombre: "Rosa", color: "#ff00ff" },
  { nombre: "Verde", color: "#00ff00" },
  { nombre: "Naranja", color: "#ffa500" },
  { nombre: "Blanco", color: "#ffffff" },
  { nombre: "Goma", color: null },
];
export const ALTO_BARRA = 0.12;       // fraccion del alto ocupada por la barra de colores
export const ZONA_SELECCION = 0.25;   // por encima de esto se elige color (no hace falta tocar la barra)
export const SEGUNDOS_BORRAR = 0.8;   // mano abierta este tiempo = borrar todo
const SUAVIZADO = 0.5;

export class Pizarra {
  constructor(ctx, ancho, alto) {
    this.ctx = ctx;
    this.ancho = ancho;
    this.alto = alto;
    this.color = 0;
    this.anterior = new Map(); // ultimo punto de cada mano
    this.levantado = new Set(); // manos que vienen de la barra: no unir con una linea
    this.palmaDesde = null;
    this.modo = new Map();
    this.encima = null;
  }

  borrar() {
    this.ctx.clearRect(0, 0, this.ancho, this.alto);
  }

  // manos = [{lado, dedos: [5 booleanos], x, y}] con x, y = punta del indice en pixeles
  actualizar(manos, ahora) {
    let hayPalma = false;
    this.encima = null;
    const vistas = new Set();
    for (const mano of manos) {
      const [p, indice, corazon, anular, menique] = mano.dedos;
      const palma = p && indice && corazon && anular && menique;
      const seleccion = !palma && indice && corazon && !(anular && menique);
      const pinta = !palma && !seleccion && indice && !corazon;
      hayPalma ||= palma;
      vistas.add(mano.lado);

      let { x, y } = mano;
      const previo = this.anterior.get(mano.lado);
      if (previo) {
        x = previo.x * SUAVIZADO + x * (1 - SUAVIZADO);
        y = previo.y * SUAVIZADO + y * (1 - SUAVIZADO);
      }

      if ((seleccion || pinta) && y < ZONA_SELECCION * this.alto) {
        this.modo.set(mano.lado, "seleccion");
        this.color = Math.min(Math.max(Math.floor(x / (this.ancho / PALETA.length)), 0), PALETA.length - 1);
        this.encima = this.color;
        this.levantado.add(mano.lado);
        this.anterior.set(mano.lado, { x, y });
      } else if (seleccion) {
        this.modo.set(mano.lado, "seleccion");
        this.levantado.add(mano.lado);
        this.anterior.set(mano.lado, { x, y });
      } else if (pinta) {
        this.modo.set(mano.lado, "pintar");
        if (previo && !this.levantado.has(mano.lado)) this.trazo(previo, { x, y });
        this.levantado.delete(mano.lado);
        this.anterior.set(mano.lado, { x, y });
      } else {
        this.modo.set(mano.lado, "nada");
        this.anterior.delete(mano.lado);
      }
    }
    for (const lado of [...this.anterior.keys()]) {
      if (!vistas.has(lado)) this.anterior.delete(lado);
    }

    if (hayPalma) {
      this.palmaDesde ??= ahora;
      if (ahora - this.palmaDesde >= SEGUNDOS_BORRAR) {
        this.borrar();
        this.palmaDesde = null;
      }
    } else {
      this.palmaDesde = null;
    }
  }

  trazo(desde, hasta) {
    const { color } = PALETA[this.color];
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = "round";
    if (color === null) {
      ctx.globalCompositeOperation = "destination-out"; // la goma borra lo pintado
      ctx.lineWidth = 50;
      ctx.strokeStyle = "rgba(0, 0, 0, 1)";
    } else {
      ctx.lineWidth = 8;
      ctx.strokeStyle = color;
      ctx.shadowColor = color; // brillo neon
      ctx.shadowBlur = 15;
    }
    ctx.beginPath();
    ctx.moveTo(desde.x, desde.y);
    ctx.lineTo(hasta.x, hasta.y);
    ctx.stroke();
    ctx.restore();
  }

  progresoBorrado(ahora) {
    return this.palmaDesde === null ? 0 : Math.min((ahora - this.palmaDesde) / SEGUNDOS_BORRAR, 1);
  }
}
