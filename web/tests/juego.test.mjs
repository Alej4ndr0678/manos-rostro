import assert from "node:assert/strict";
import { test } from "node:test";

import { DURACION, elegirTipo, Juego, MARGEN_TOQUE } from "../js/juego.js";

// "Azar" que siempre devuelve lo mismo: las pruebas salen siempre igual
const fijo = (valor) => () => valor;

test("elegir tipo segun las probabilidades", () => {
  assert.equal(elegirTipo(0.1), "normal");
  assert.equal(elegirTipo(0.8), "dorada");
  assert.equal(elegirTipo(0.95), "bomba");
});

test("no pasa nada hasta empezar", () => {
  const juego = new Juego(1280, 720, fijo(0.5));
  assert.deepEqual(juego.actualizar([], 1), []);
  assert.equal(juego.bolas.length, 0);
  assert.equal(juego.tiempoRestante(5), DURACION);
});

test("las bolas caen y desaparecen por abajo", () => {
  const juego = new Juego(1280, 720, fijo(0.5));
  juego.empezar(0);
  juego.actualizar([], 0.0);
  const bola = juego.bolas[0];
  const yInicial = bola.y;
  juego.actualizar([], 0.1);
  assert.ok(bola.y > yInicial, "la bola baja");
  // La velocidad no depende de los FPS: 10 frames de 0.01 s = 1 frame de 0.1 s
  const a = new Juego(1280, 720, fijo(0.5));
  const b = new Juego(1280, 720, fijo(0.5));
  a.empezar(0); b.empezar(0);
  a.actualizar([], 0); b.actualizar([], 0);
  for (let i = 1; i <= 10; i++) a.actualizar([], i * 0.01);
  b.actualizar([], 0.1);
  assert.ok(Math.abs(a.bolas[0].y - b.bolas[0].y) < 1e-6);
  // Muchos segundos despues ya ha salido de la pantalla
  for (let t = 0.2; t < 10; t += 0.05) juego.actualizar([], t);
  assert.ok(!juego.bolas.includes(bola));
});

test("tocar una bola normal suma 1 y la explota", () => {
  const juego = new Juego(1280, 720, fijo(0.1)); // 0.1 -> normal
  juego.empezar(0);
  juego.actualizar([], 0);
  const bola = juego.bolas[0];
  const explotadas = juego.actualizar([{ x: bola.x, y: bola.y + bola.radio + MARGEN_TOQUE - 2 }], 0.001);
  assert.equal(explotadas.length, 1);
  assert.equal(juego.puntos, 1);
  assert.ok(!juego.bolas.includes(bola));
});

test("un dedo lejos no explota nada", () => {
  const juego = new Juego(1280, 720, fijo(0.1));
  juego.empezar(0);
  juego.actualizar([], 0);
  const bola = juego.bolas[0];
  assert.deepEqual(juego.actualizar([{ x: bola.x + 300, y: bola.y }], 0.001), []);
  assert.equal(juego.puntos, 0);
});

test("la dorada da 3 y la bomba quita 5 y hace temblar", () => {
  const dorada = new Juego(1280, 720, fijo(0.8));
  dorada.empezar(0);
  dorada.actualizar([], 0);
  const b = dorada.bolas[0];
  assert.equal(b.tipo, "dorada");
  dorada.actualizar([{ x: b.x, y: b.y }], 0.001);
  assert.equal(dorada.puntos, 3);

  const bomba = new Juego(1280, 720, fijo(0.95));
  bomba.empezar(0);
  bomba.actualizar([], 0);
  const c = bomba.bolas[0];
  assert.equal(c.tipo, "bomba");
  bomba.actualizar([{ x: c.x, y: c.y }], 0.001);
  assert.equal(bomba.puntos, -5);
  assert.ok(bomba.temblando(0.1));
  assert.ok(!bomba.temblando(1));
});

test("salen bolas mas seguido al final de la partida", () => {
  const juego = new Juego(1280, 720, fijo(0.5));
  juego.empezar(0);
  const contar = (desde, hasta) => {
    let n = 0;
    for (let t = desde; t < hasta; t += 0.02) {
      juego.bolas.length = 0; // las quitamos para contar solo las nuevas
      juego.actualizar([], t);
      n += juego.bolas.length;
    }
    return n;
  };
  const alPrincipio = contar(0, 5);
  juego.actualizar([], 50);
  const alFinal = contar(50, 55);
  assert.ok(alFinal > alPrincipio, `${alFinal} > ${alPrincipio}`);
});

test("la partida termina a los 60 s y guarda el record", () => {
  const juego = new Juego(1280, 720, fijo(0.1));
  juego.record = 0;
  juego.empezar(0);
  juego.actualizar([], 0);
  const b = juego.bolas[0];
  juego.actualizar([{ x: b.x, y: b.y }], 0.001);
  juego.actualizar([], DURACION + 0.01);
  assert.equal(juego.estado, "fin");
  assert.equal(juego.record, 1);
  assert.ok(juego.nuevoRecord);
  // Otra partida peor no cambia el record
  juego.empezar(100);
  juego.actualizar([], 100 + DURACION + 0.01);
  assert.equal(juego.record, 1);
  assert.ok(!juego.nuevoRecord);
});

test("una pausa larga (pestana en segundo plano) no teletransporta las bolas", () => {
  const juego = new Juego(1280, 720, fijo(0.5));
  juego.empezar(0);
  juego.actualizar([], 0);
  const bola = juego.bolas[0];
  const y = bola.y;
  juego.actualizar([], 5);
  assert.ok(bola.y - y <= bola.vy * 0.1 + 1e-9);
});
