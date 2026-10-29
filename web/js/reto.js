// Reto de gestos (como "Simón dice"): aparece una orden y tienes que hacerla con las manos
// antes de que se acabe el tiempo. Puede ser un gesto (✌️ 👍 ✊...) o un numero de dedos
// (del 1 al 10: a partir de 6 hacen falta las dos manos). Cada acierto da menos tiempo.
// Para empezar se ensena la mano abierta 1 segundo, asi no hace falta el teclado.

export const VIDAS = 3;
export const MANTENER = 0.35; // segundos que hay que mantener la postura para que cuente
export const ESPERA_EMPEZAR = 1; // segundos con la mano abierta para empezar
export const GESTOS_RETO = [
  { gesto: "Victoria", texto: "✌️ Victoria" },
  { gesto: "Pulgar arriba", texto: "👍 Pulgar arriba" },
  { gesto: "Pulgar abajo", texto: "👎 Pulgar abajo" },
  { gesto: "Puño", texto: "✊ Puño" },
  { gesto: "Apuntar arriba", texto: "☝️ Apunta arriba" },
  { gesto: "Te quiero", texto: "🤟 Te quiero" },
];

// Tiempo para cada orden: empieza en 4 s y baja con cada acierto (minimo 1,5 s)
export function tiempoPara(aciertos) {
  return Math.max(1.5, 4 - aciertos * 0.15);
}

// entrada = {gestos: ["Victoria", ...], dedos: total de dedos levantados}
export function cumple(tarea, entrada) {
  if (tarea.tipo === "gesto") return entrada.gestos.includes(tarea.gesto);
  return entrada.dedos === tarea.dedos;
}

export class Reto {
  constructor(azar = Math.random) {
    this.azar = azar;
    this.record = 0;
    this.estado = "espera"; // espera -> jugando -> fin -> espera...
    this.reiniciar();
  }

  reiniciar() {
    this.puntos = 0;
    this.aciertos = 0;
    this.vidas = VIDAS;
    this.tarea = null;
    this.inicioTarea = 0;
    this.mantenido = 0; // segundos que llevas haciendo bien la orden (o con la mano abierta para empezar)
    this.nuevoRecord = false;
  }

  nuevaTarea(ahora) {
    let tarea;
    let intentos = 0;
    do {
      if (this.azar() < 0.5) {
        const g = GESTOS_RETO[Math.floor(this.azar() * GESTOS_RETO.length) % GESTOS_RETO.length];
        tarea = { tipo: "gesto", ...g };
      } else {
        const n = 1 + (Math.floor(this.azar() * 10) % 10);
        tarea = { tipo: "dedos", dedos: n, texto: `${n} ${n === 1 ? "dedo" : "dedos"}` };
      }
    } while (this.tarea && tarea.texto === this.tarea.texto && ++intentos < 5); // que no se repita seguida
    this.tarea = tarea;
    this.inicioTarea = ahora;
    this.limite = tiempoPara(this.aciertos);
    this.mantenido = 0;
  }

  tiempoRestante(ahora) {
    return this.estado === "jugando" ? Math.max(0, this.limite - (ahora - this.inicioTarea)) : 0;
  }

  // Devuelve una lista de eventos: {tipo: "empezar" | "acierto" | "fallo" | "fin", ...}
  actualizar(entrada, dt, ahora) {
    dt = Math.min(dt, 0.1);
    const eventos = [];
    if (this.estado !== "jugando") {
      // Mano abierta un segundo = empezar
      this.mantenido = entrada.gestos.includes("Mano abierta") ? this.mantenido + dt : 0;
      if (this.mantenido >= ESPERA_EMPEZAR) {
        this.reiniciar();
        this.estado = "jugando";
        this.nuevaTarea(ahora);
        eventos.push({ tipo: "empezar" });
      }
      return eventos;
    }
    this.mantenido = cumple(this.tarea, entrada) ? this.mantenido + dt : 0;
    if (this.mantenido >= MANTENER) {
      // Mas puntos cuanto mas rapido
      const extra = Math.round((this.tiempoRestante(ahora) / this.limite) * 2);
      this.puntos += 1 + extra;
      this.aciertos += 1;
      eventos.push({ tipo: "acierto", puntos: 1 + extra, tarea: this.tarea });
      this.nuevaTarea(ahora);
    } else if (this.tiempoRestante(ahora) <= 0) {
      this.vidas -= 1;
      eventos.push({ tipo: "fallo", tarea: this.tarea });
      if (this.vidas <= 0) {
        this.estado = "fin";
        this.mantenido = 0;
        if (this.puntos > this.record) {
          this.record = this.puntos;
          this.nuevoRecord = true;
        }
        eventos.push({ tipo: "fin", puntos: this.puntos });
      } else {
        this.nuevaTarea(ahora);
      }
    }
    return eventos;
  }
}
