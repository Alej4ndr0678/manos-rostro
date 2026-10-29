import assert from "node:assert/strict";
import { test } from "node:test";

import { Bateria, ESPERA_PAD, nota, notaEnAltura, NUM_NOTAS, PADS, Sintetizador, Theremin, zonasPads } from "../js/musica.js";

test("notas de la escala pentatonica con su frecuencia", () => {
  assert.equal(nota(0).nombre, "C4");
  assert.ok(Math.abs(nota(0).frecuencia - 261.63) < 0.01, "Do central");
  assert.equal(nota(4).nombre, "A4");
  assert.ok(Math.abs(nota(4).frecuencia - 440) < 1e-9, "La 440");
  assert.equal(nota(5).nombre, "C5");
  assert.equal(nota(NUM_NOTAS - 1).nombre, "C6");
  for (let i = 1; i < NUM_NOTAS; i++) assert.ok(nota(i).frecuencia > nota(i - 1).frecuencia);
});

test("arriba = agudo, abajo = grave, y nunca se sale de la escala", () => {
  assert.equal(notaEnAltura(0), NUM_NOTAS - 1);
  assert.equal(notaEnAltura(1), 0);
  assert.equal(notaEnAltura(-0.5), NUM_NOTAS - 1);
  assert.equal(notaEnAltura(1.5), 0);
  assert.ok(notaEnAltura(0.3) > notaEnAltura(0.7));
});

test("los pads estan en la mitad izquierda y no se solapan", () => {
  const zonas = zonasPads();
  assert.equal(zonas.length, PADS.length);
  for (const z of zonas) assert.ok(z.x >= 0 && z.x + z.w <= 0.5 && z.y + z.h <= 1);
  for (let i = 0; i < zonas.length; i++) {
    for (let j = i + 1; j < zonas.length; j++) {
      const [a, b] = [zonas[i], zonas[j]];
      assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
    }
  }
});

const centro = (z) => ({ x: z.x + z.w / 2, y: z.y + z.h / 2 });

test("golpear: suena al entrar en el pad, no mientras el dedo sigue dentro", () => {
  const b = new Bateria();
  const c = centro(b.zonas[1]);
  assert.deepEqual(b.actualizar([{ clave: "d", x: c.x, y: 0.2 }], 0), []);
  assert.deepEqual(b.actualizar([{ clave: "d", ...c }], 0.05), [1]);
  assert.deepEqual(b.actualizar([{ clave: "d", ...c }], 0.3), [], "sigue dentro: no repite");
  assert.deepEqual(b.actualizar([{ clave: "d", x: c.x, y: 0.2 }], 0.4), []);
  assert.deepEqual(b.actualizar([{ clave: "d", ...c }], 0.5), [1], "sale y vuelve a entrar");
  assert.ok(b.brillo(1, 0.5) === 1 && b.brillo(1, 1) === 0);
});

test("dos dedos a la vez en pads distintos suenan los dos", () => {
  const b = new Bateria();
  const golpes = b.actualizar([{ clave: "a", ...centro(b.zonas[0]) }, { clave: "b", ...centro(b.zonas[3]) }], 0);
  assert.deepEqual(golpes.sort(), [0, 3]);
});

test("un temblor en el borde no hace redobles", () => {
  const b = new Bateria();
  const z = b.zonas[2];
  let n = 0;
  // El dedo entra y sale del borde muy rapido: la espera minima limita los golpes
  for (let i = 0; i < 10; i++) {
    n += b.actualizar([{ clave: "d", x: z.x + 0.01, y: i % 2 ? z.y - 0.005 : z.y + 0.005 }], i * 0.02).length;
  }
  assert.ok(n <= Math.ceil((10 * 0.02) / ESPERA_PAD) + 1, `${n} golpes`);
});

test("theremin: mano abierta a la derecha suena, puno o izquierda calla", () => {
  const t = new Theremin();
  assert.equal(t.actualizar({ x: 0.75, y: 0.0, abierta: true }).nota, NUM_NOTAS - 1);
  assert.equal(t.timbre, 0.5);
  assert.equal(t.actualizar({ x: 0.75, y: 0.5, abierta: false }).nota, null);
  assert.equal(t.actualizar({ x: 0.25, y: 0.5, abierta: true }).nota, null);
  assert.equal(t.actualizar(null).nota, null);
});

// AudioContext falso: apunta los nodos que se crean
function audioFalso() {
  const creados = [];
  const param = () => ({ value: 0, setValueAtTime() {}, setTargetAtTime() {}, exponentialRampToValueAtTime() {} });
  const nodo = (tipo) => {
    const n = { tipo, gain: param(), frequency: param(), type: "", buffer: null };
    n.connect = (otro) => otro;
    n.start = () => { n.empezado = true; };
    n.stop = () => { n.parado = true; };
    creados.push(n);
    return n;
  };
  return {
    creados,
    currentTime: 0,
    sampleRate: 8000,
    destination: {},
    createGain: () => nodo("gain"),
    createOscillator: () => nodo("osc"),
    createBiquadFilter: () => nodo("filtro"),
    createBufferSource: () => nodo("ruido"),
    createBuffer: (canales, largo) => ({ getChannelData: () => new Float32Array(largo) }),
  };
}

test("cada pad genera su sonido sin errores", () => {
  for (let pad = 0; pad < PADS.length; pad++) {
    const audio = audioFalso();
    new Sintetizador(audio).golpe(pad);
    assert.ok(audio.creados.some((n) => n.empezado), `pad ${pad} suena`);
  }
});

test("el theremin reutiliza la voz al cambiar de nota y la cambia al cambiar de instrumento", () => {
  const audio = audioFalso();
  const s = new Sintetizador(audio);
  s.tocar(3, 0.5);
  const primera = s.voz;
  s.tocar(7, 0.2);
  assert.equal(s.voz, primera, "misma voz: se desliza de nota");
  s.tocar(7, 0.2, "flauta");
  assert.notEqual(s.voz, primera);
  assert.equal(s.voz.osc.type, "sine");
  s.tocar(null);
  assert.equal(s.voz, null);
});
