import assert from "node:assert/strict";
import { test } from "node:test";

import { centrarMalla, ESPERA_AUTO, Explosion, Rotador, SENSIBILIDAD, UMBRAL_EXPLOSION } from "../js/holograma.js";

// Cara de juguete: frente arriba, barbilla abajo, nariz mas cerca de la camara (z negativa)
const frente = { x: 0.5, y: 0.3, z: 0 };
const barbilla = { x: 0.5, y: 0.7, z: 0 };
const nariz = { x: 0.5, y: 0.5, z: -0.1 };
const izquierdaImagen = { x: 0.4, y: 0.5, z: 0.05 };

test("centrarMalla centra, escala y orienta la cara", () => {
  const m = centrarMalla([frente, barbilla, nariz, izquierdaImagen], 1, 2);
  const punto = (i) => [m[i * 3], m[i * 3 + 1], m[i * 3 + 2]];
  // Escala: de la frente a la barbilla hay 2 unidades
  assert.ok(Math.abs(punto(0)[1] - punto(1)[1] - 2) < 1e-6);
  // La frente queda arriba (y positiva) y la nariz hacia ti (z mayor que la del resto)
  assert.ok(punto(0)[1] > 0 && punto(1)[1] < 0);
  assert.ok(punto(2)[2] > punto(0)[2]);
  // Modo espejo: lo que esta a la izquierda en la imagen queda a la derecha (x positiva)
  assert.ok(punto(3)[0] > punto(0)[0]);
  // Centrado: la media de x es 0
  const media = [0, 1, 2, 3].reduce((a, i) => a + punto(i)[0], 0) / 4;
  assert.ok(Math.abs(media) < 1e-6);
});

test("centrarMalla tiene en cuenta el aspecto de la imagen", () => {
  const a = centrarMalla([frente, barbilla, izquierdaImagen], 1);
  const b = centrarMalla([frente, barbilla, izquierdaImagen], 2);
  assert.ok(Math.abs(b[6] - b[0] - 2 * (a[6] - a[0])) < 1e-6);
});

test("pellizcar y arrastrar gira el holograma", () => {
  const r = new Rotador();
  r.actualizar({ x: 0.5, y: 0.5, pellizco: true }, 1 / 60);
  const { rotY, rotX } = r.actualizar({ x: 0.6, y: 0.5, pellizco: true }, 1 / 60);
  assert.ok(Math.abs(rotY - 0.1 * SENSIBILIDAD) < 1e-9);
  assert.equal(rotX, 0);
});

test("sin pellizcar, mover la mano no lo gira", () => {
  const r = new Rotador();
  r.actualizar({ x: 0.5, y: 0.5, pellizco: false }, 1 / 60);
  r.actualizar({ x: 0.9, y: 0.5, pellizco: false }, 1 / 60);
  assert.equal(r.rotY, 0);
});

test("al soltarlo sigue girando un poco y va frenando", () => {
  const r = new Rotador();
  for (let i = 0; i <= 10; i++) r.actualizar({ x: 0.3 + i * 0.02, y: 0.5, pellizco: true }, 1 / 60);
  const alSoltar = r.rotY;
  r.actualizar(null, 1 / 60);
  const v1 = r.vY;
  assert.ok(r.rotY > alSoltar, "sigue por inercia");
  for (let i = 0; i < 60; i++) r.actualizar(null, 1 / 60);
  assert.ok(Math.abs(r.vY) < Math.abs(v1) / 5, "frena");
});

test("si nadie lo toca, gira solo despacio", () => {
  const r = new Rotador();
  r.rotX = 0.8;
  for (let i = 0; i < ESPERA_AUTO * 60 - 5; i++) r.actualizar(null, 1 / 60);
  const antes = r.rotY;
  for (let i = 0; i < 60; i++) r.actualizar(null, 1 / 60);
  assert.ok(r.rotY > antes);
  assert.ok(r.rotX < 0.8, "vuelve a la altura de los ojos");
});

test("no se puede voltear del todo arriba o abajo", () => {
  const r = new Rotador();
  r.actualizar({ x: 0.5, y: 0, pellizco: true }, 1 / 60);
  r.actualizar({ x: 0.5, y: 1, pellizco: true }, 1 / 60);
  assert.ok(r.rotX <= 1.2);
});

test("al abrir la boca el holograma explota hacia fuera y al cerrarla se recompone", () => {
  const e = new Explosion(3, () => 0.5);
  const malla = Float32Array.from([1, 0, 0, 0, -1, 0, 0, 0, 1]);
  assert.equal(e.aplicar(malla), malla, "boca cerrada: sin cambios");
  for (let i = 0; i < 60; i++) e.actualizar(0.8, 1 / 60);
  assert.ok(e.nivel > 0.9);
  const fuera = e.aplicar(malla);
  assert.ok(fuera[0] > 2, "el punto de la derecha se va mas a la derecha");
  assert.ok(fuera[4] < -1, "el de abajo, mas abajo");
  assert.ok(fuera[8] > 2, "el de delante, mas hacia delante");
  for (let i = 0; i < 600; i++) e.actualizar(0.1, 1 / 60);
  assert.equal(e.nivel, 0);
  assert.equal(e.aplicar(malla), malla);
});

test("con la boca un poco abierta (hablando) no explota", () => {
  const e = new Explosion();
  for (let i = 0; i < 120; i++) e.actualizar(UMBRAL_EXPLOSION - 0.1, 1 / 60);
  assert.equal(e.nivel, 0);
});
