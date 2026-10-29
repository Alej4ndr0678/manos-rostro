// Instrumento musical con las manos:
// - Mitad IZQUIERDA de la pantalla: bateria. 4 pads abajo que suenan al meter la punta del
//   indice desde fuera (como golpear un tambor).
// - Mitad DERECHA: theremin. La altura del indice elige la nota (de una escala pentatonica,
//   asi casi cualquier combinacion suena bien) y la posicion horizontal cambia el timbre.
//   Con la mano abierta suena; con el puno se calla.
// La logica (que nota, que pad) no depende del navegador. El sonido se genera con Web Audio
// (sin archivos de audio: todo sintetizado) y recibe el AudioContext desde fuera.

export const ESCALA = ["C", "D", "E", "G", "A"]; // pentatonica de Do mayor
const SEMITONOS = { C: 0, D: 2, E: 4, G: 7, A: 9 };
export const OCTAVA_BAJA = 4;
export const NUM_NOTAS = 11; // de C4 a C6: dos octavas de la escala
export const PADS = [
  { nombre: "Bombo", color: "#f87171" },
  { nombre: "Caja", color: "#fbbf24" },
  { nombre: "Charles", color: "#34d399" },
  { nombre: "Palmas", color: "#60a5fa" },
];
export const ESPERA_PAD = 0.12; // segundos minimos entre dos golpes del mismo pad
export const ARRIBA_PADS = 0.62; // los pads ocupan la parte de abajo de la pantalla (fraccion del alto)

// Nota n de la escala (0 = la mas grave) -> {nombre, frecuencia en Hz}
export function nota(n) {
  const octava = OCTAVA_BAJA + Math.floor(n / ESCALA.length);
  const letra = ESCALA[n % ESCALA.length];
  const midi = 12 * (octava + 1) + SEMITONOS[letra]; // C4 = 60
  return { nombre: `${letra}${octava}`, frecuencia: 440 * 2 ** ((midi - 69) / 12) };
}

// Altura en el theremin (0 = arriba, 1 = abajo) -> numero de nota (arriba = mas agudo)
export function notaEnAltura(y) {
  const n = Math.floor((1 - Math.min(Math.max(y, 0), 0.9999)) * NUM_NOTAS);
  return Math.min(n, NUM_NOTAS - 1);
}

// Rectangulos de los pads (en fracciones de la pantalla): 2 x 2 en la mitad izquierda, abajo
export function zonasPads() {
  const zonas = [];
  const ancho = 0.5 / 2;
  const alto = (1 - ARRIBA_PADS) / 2;
  for (let i = 0; i < PADS.length; i++) {
    const col = i % 2;
    const fila = Math.floor(i / 2);
    zonas.push({ x: col * ancho + 0.01, y: ARRIBA_PADS + fila * alto + 0.01, w: ancho - 0.02, h: alto - 0.02 });
  }
  return zonas;
}

const dentro = (z, x, y) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;

export class Bateria {
  constructor() {
    this.zonas = zonasPads();
    this.antes = new Map(); // donde estaba cada dedo: clave -> indice del pad (o -1)
    this.ultimoGolpe = this.zonas.map(() => -Infinity);
    this.encendido = this.zonas.map(() => -Infinity); // para el destello al golpear
  }

  // dedos = [{clave, x, y}] en fracciones de la pantalla. Devuelve los pads golpeados.
  actualizar(dedos, ahora) {
    const golpes = [];
    const vistos = new Map();
    for (const { clave, x, y } of dedos) {
      const pad = this.zonas.findIndex((z) => dentro(z, x, y));
      vistos.set(clave, pad);
      const antes = this.antes.has(clave) ? this.antes.get(clave) : -1;
      // Solo cuenta al ENTRAR en el pad (si el dedo se queda dentro no repite)
      if (pad >= 0 && antes !== pad && ahora - this.ultimoGolpe[pad] >= ESPERA_PAD) {
        this.ultimoGolpe[pad] = ahora;
        this.encendido[pad] = ahora;
        golpes.push(pad);
      }
    }
    this.antes = vistos;
    return golpes;
  }

  brillo(pad, ahora) {
    return Math.max(0, 1 - (ahora - this.encendido[pad]) / 0.25);
  }
}

export class Theremin {
  constructor() {
    this.nota = null; // numero de nota que suena (o null en silencio)
    this.timbre = 0.5; // 0 = suave, 1 = brillante
  }

  // mano = {x, y, abierta} en fracciones de la pantalla, o null. Devuelve {nota, timbre}.
  actualizar(mano) {
    if (!mano || !mano.abierta || mano.x < 0.5) {
      this.nota = null;
    } else {
      this.nota = notaEnAltura(mano.y);
      this.timbre = (mano.x - 0.5) / 0.5;
    }
    return { nota: this.nota, timbre: this.timbre };
  }
}

// ---------- Sonido (Web Audio) ----------

export const INSTRUMENTOS = {
  sintetizador: { onda: "sawtooth", nombre: "Sintetizador" },
  organo: { onda: "square", nombre: "Órgano" },
  flauta: { onda: "sine", nombre: "Flauta" },
};

export class Sintetizador {
  constructor(audio) {
    this.audio = audio;
    this.salida = audio.createGain();
    this.salida.gain.value = 0.8;
    this.salida.connect(audio.destination);
    this.ruido = this.crearRuido();
    this.voz = null;
  }

  crearRuido() {
    // 1 segundo de ruido blanco, para la caja, el charles y las palmas
    const datos = this.audio.createBuffer(1, this.audio.sampleRate, this.audio.sampleRate);
    const canal = datos.getChannelData(0);
    for (let i = 0; i < canal.length; i++) canal[i] = Math.random() * 2 - 1;
    return datos;
  }

  // Theremin: una voz continua que se desliza de nota en nota (portamento)
  tocar(nNota, timbre, instrumento = "sintetizador") {
    const t = this.audio.currentTime;
    if (nNota === null) {
      if (this.voz) {
        this.voz.volumen.gain.setTargetAtTime(0, t, 0.05);
        const voz = this.voz;
        setTimeout(() => voz.osc.stop(), 400);
        this.voz = null;
      }
      return;
    }
    const onda = INSTRUMENTOS[instrumento]?.onda ?? "sawtooth";
    if (!this.voz || this.voz.onda !== onda) {
      this.tocar(null);
      const osc = this.audio.createOscillator();
      const vibrato = this.audio.createOscillator();
      const profundidad = this.audio.createGain();
      const filtro = this.audio.createBiquadFilter();
      const volumen = this.audio.createGain();
      osc.type = onda;
      vibrato.frequency.value = 5.5; // vibrato suave, como un theremin de verdad
      profundidad.gain.value = 4;
      vibrato.connect(profundidad).connect(osc.frequency);
      filtro.type = "lowpass";
      volumen.gain.value = 0;
      osc.connect(filtro).connect(volumen).connect(this.salida);
      osc.frequency.value = nota(nNota).frecuencia;
      osc.start();
      vibrato.start();
      this.voz = { osc, vibrato, filtro, volumen, onda };
    }
    this.voz.osc.frequency.setTargetAtTime(nota(nNota).frecuencia, t, 0.03);
    this.voz.filtro.frequency.setTargetAtTime(400 + timbre * 4000, t, 0.05);
    // Cada onda suena con distinta fuerza: las igualamos un poco
    const volumen = { sine: 0.22, square: 0.1, sawtooth: 0.18 }[onda] ?? 0.15;
    this.voz.volumen.gain.setTargetAtTime(volumen, t, 0.03);
  }

  // Pitido corto (para los juegos)
  bip(frecuencia, duracion = 0.08) {
    const t = this.audio.currentTime;
    const osc = this.audio.createOscillator();
    const g = this.audio.createGain();
    osc.type = "square";
    osc.frequency.value = frecuencia;
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duracion);
    osc.connect(g).connect(this.salida);
    osc.start(t);
    osc.stop(t + duracion);
  }

  // "Fshh" de un tajo: ruido que pasa de grave a agudo (para el modo ninja)
  corte() {
    const t = this.audio.currentTime;
    const fuente = this.audio.createBufferSource();
    fuente.buffer = this.ruido;
    const filtro = this.audio.createBiquadFilter();
    filtro.type = "bandpass";
    filtro.Q.value = 2;
    filtro.frequency.setValueAtTime(800, t);
    filtro.frequency.exponentialRampToValueAtTime(5000, t + 0.12);
    const g = this.audio.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    fuente.connect(filtro).connect(g).connect(this.salida);
    fuente.start(t);
    fuente.stop(t + 0.15);
  }

  // Explosion: ruido grave y largo
  explosion() {
    const t = this.audio.currentTime;
    const fuente = this.audio.createBufferSource();
    fuente.buffer = this.ruido;
    const filtro = this.audio.createBiquadFilter();
    filtro.type = "lowpass";
    filtro.frequency.setValueAtTime(1200, t);
    filtro.frequency.exponentialRampToValueAtTime(80, t + 0.9);
    const g = this.audio.createGain();
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1);
    fuente.connect(filtro).connect(g).connect(this.salida);
    fuente.start(t);
    fuente.stop(t + 1);
  }

  golpe(pad) {
    const a = this.audio;
    const t = a.currentTime;
    const envolvente = (nodo, pico, duracion) => {
      const g = a.createGain();
      g.gain.setValueAtTime(pico, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + duracion);
      nodo.connect(g).connect(this.salida);
      return g;
    };
    const ruido = (filtroTipo, frecuencia, pico, duracion, retraso = 0) => {
      const fuente = a.createBufferSource();
      fuente.buffer = this.ruido;
      const filtro = a.createBiquadFilter();
      filtro.type = filtroTipo;
      filtro.frequency.value = frecuencia;
      fuente.connect(filtro);
      envolvente(filtro, pico, duracion);
      fuente.start(t + retraso);
      fuente.stop(t + retraso + duracion);
    };
    if (pad === 0) {
      // Bombo: un tono grave que cae rapido de frecuencia
      const osc = a.createOscillator();
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.15);
      envolvente(osc, 1, 0.4);
      osc.start(t);
      osc.stop(t + 0.4);
    } else if (pad === 1) {
      // Caja: ruido + un poco de tono
      ruido("highpass", 1200, 0.6, 0.2);
      const osc = a.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = 190;
      envolvente(osc, 0.4, 0.1);
      osc.start(t);
      osc.stop(t + 0.1);
    } else if (pad === 2) {
      // Charles: ruido muy agudo y cortito
      ruido("highpass", 7000, 0.7, 0.06);
    } else {
      // Palmas: tres rafagas de ruido muy seguidas
      for (const retraso of [0, 0.012, 0.025]) ruido("bandpass", 1500, 0.9, 0.12, retraso);
    }
  }
}
