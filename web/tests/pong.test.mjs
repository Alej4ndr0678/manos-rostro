import assert from "node:assert/strict";
import { test } from "node:test";

import { ALTO_PALA, Pong, PUNTOS_PARA_GANAR } from "../js/pong.js";

const fijo = (v) => () => v;
// Juega "segundos" a 60 FPS con las manos dadas (funcion del juego -> [y, y])
function jugar(pong, segundos, manos, desde = 0) {
  const eventos = [];
  for (let i = 1; i <= segundos * 60; i++) {
    const e = pong.actualizar(manos(pong), 1 / 60, desde + i / 60);
    if (e) eventos.push(e);
  }
  return eventos;
}

test("la pelota espera un momento antes de salir y luego se mueve", () => {
  const p = new Pong(1, fijo(0.7));
  p.actualizar([0.5, 0.5], 1 / 60, 0);
  p.actualizar([0.5, 0.5], 1 / 60, 0.5);
  assert.equal(p.pelota.x, 0.5, "aun esperando");
  jugar(p, 0.5, () => [0.5, 0.5], 0.5);
  assert.notEqual(p.pelota.x, 0.5);
});

test("rebota en la pala si la mano esta a la altura de la pelota", () => {
  const p = new Pong(1, fijo(0.5)); // azar 0.5: saca recto
  const eventos = jugar(p, 3, (j) => [j.pelota.y, j.pelota.y]);
  assert.ok(eventos.includes("golpe"));
  assert.deepEqual(p.marcador, [0, 0]);
});

test("si no llegas a la pelota, punto para el otro", () => {
  const p = new Pong(1, fijo(0.4)); // azar < 0.5: saca hacia la izquierda
  // Pala izquierda arriba del todo y la pelota va por el centro: punto para la derecha
  const eventos = jugar(p, 4, (j) => [0, j.pelota.y]);
  assert.ok(eventos.includes("punto1"), eventos.join());
  assert.equal(p.marcador[1] >= 1, true);
});

test("las palas no se salen de la pantalla", () => {
  const p = new Pong(1, fijo(0.5));
  p.actualizar([-1, 2], 1 / 60, 0);
  assert.equal(p.palas[0], ALTO_PALA / 2);
  assert.equal(p.palas[1], 1 - ALTO_PALA / 2);
});

test("el ordenador juega si falta una mano, pero se le puede ganar", () => {
  const p = new Pong(1, fijo(0.5));
  const antes = p.palas[1];
  p.pelota.y = 0.9;
  p.pelota.vx = 0.5; // va hacia la derecha
  p.esperaHasta = -1;
  p.actualizar([0.5, null], 0.05, 1);
  assert.ok(p.palas[1] > antes, "la pala del ordenador va hacia la pelota");
  assert.ok(p.palas[1] - antes <= 0.55 * 0.05 + 1e-9, "con velocidad limitada");
});

test("cada golpe acelera la pelota, con un maximo", () => {
  const p = new Pong(1, fijo(0.5));
  jugar(p, 30, (j) => [j.pelota.y, j.pelota.y]);
  assert.ok(p.golpes > 5);
  assert.ok(p.velocidad > 0.45 && p.velocidad <= 1.6);
  assert.deepEqual(p.marcador, [0, 0], "con las palas siempre bien colocadas nadie falla");
});

test("al llegar a 7 se acaba la partida, y se puede reiniciar", () => {
  const p = new Pong(1, fijo(0.5));
  p.marcador = [PUNTOS_PARA_GANAR - 1, 0];
  p.pelota = { x: 1.01, y: 0.5, vx: 0.5, vy: 0, radio: 0.018 };
  p.esperaHasta = -1;
  assert.equal(p.actualizar([0.5, 0.0], 1 / 60, 1), "fin");
  assert.equal(p.ganador, 0);
  assert.equal(p.actualizar([0.5, 0.5], 1 / 60, 2), null, "parada");
  p.reiniciar();
  assert.deepEqual(p.marcador, [0, 0]);
  assert.equal(p.estado, "jugando");
});

test("con pantalla ancha la pelota no atraviesa la pala a baja velocidad de frames", () => {
  const p = new Pong(16 / 9, fijo(0.5));
  // 10 FPS: pasos grandes. Las palas siguen la pelota: no debe haber puntos
  for (let i = 1; i <= 200; i++) p.actualizar([p.pelota.y, p.pelota.y], 0.1, i * 0.1);
  assert.deepEqual(p.marcador, [0, 0]);
});
