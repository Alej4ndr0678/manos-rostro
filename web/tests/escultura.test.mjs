import assert from "node:assert/strict";
import { test } from "node:test";

import { aEscena, Escultura, MAX_PUNTOS, SEPARACION, VELOCIDAD_GIRO } from "../js/escultura.js";

const cerca = (a, b) => Math.abs(a - b) < 1e-9;

test("sin girar, el centro de la pantalla es el origen y arriba es y positiva", () => {
  const p = aEscena(0.5, 0.5, 0, 8, 4);
  assert.ok(cerca(p.x, 0) && cerca(p.y, 0) && cerca(p.z, 0));
  const q = aEscena(1, 0, 0, 8, 4);
  assert.ok(cerca(q.x, 4) && cerca(q.y, 2) && cerca(q.z, 0));
});

test("con la escena girada 90 grados, dibujar a la derecha deja el punto en el eje z", () => {
  const p = aEscena(1, 0.5, Math.PI / 2, 8, 4);
  assert.ok(cerca(p.x, 0));
  assert.ok(cerca(p.z, 4));
  // Y al volver a girar ese punto 90 grados, esta otra vez a la derecha de la pantalla
  const g = Math.PI / 2;
  const xMundo = p.x * Math.cos(g) + p.z * Math.sin(g);
  assert.ok(cerca(xMundo, 4));
});

test("la escena gira sola y se puede parar", () => {
  const e = new Escultura(8, 4);
  e.actualizar(null, 0.5);
  assert.ok(cerca(e.giro, VELOCIDAD_GIRO * 0.1), "dt se limita a 0.1 s");
  e.girando = false;
  e.actualizar(null, 0.05);
  assert.ok(cerca(e.giro, VELOCIDAD_GIRO * 0.1));
});

test("pellizcar empieza un trazo y soltar lo termina", () => {
  const e = new Escultura(8, 4);
  e.girando = false;
  e.actualizar({ x: 0.5, y: 0.5, pellizco: true }, 1 / 60);
  e.actualizar({ x: 0.6, y: 0.5, pellizco: true }, 1 / 60);
  e.actualizar({ x: 0.6, y: 0.5, pellizco: false }, 1 / 60);
  e.actualizar({ x: 0.2, y: 0.2, pellizco: true }, 1 / 60);
  assert.equal(e.trazos.length, 2);
  assert.notEqual(e.trazos[0].color, e.trazos[1].color, "cada trazo de un color");
});

test("si la mano va rapido se rellenan los huecos", () => {
  const e = new Escultura(8, 4);
  e.girando = false;
  e.actualizar({ x: 0.5, y: 0.5, pellizco: true }, 1 / 60);
  e.actualizar({ x: 0.75, y: 0.5, pellizco: true }, 1 / 60); // 2 unidades de golpe
  const pts = e.trazos[0].puntos;
  assert.ok(pts.length >= 2 / SEPARACION);
  for (let i = 1; i < pts.length; i++) {
    assert.ok(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) <= SEPARACION + 1e-9);
  }
});

test("deshacer quita el ultimo trazo y borrar los quita todos", () => {
  const e = new Escultura(8, 4);
  for (const x of [0.2, 0.5]) {
    e.actualizar({ x, y: 0.5, pellizco: true }, 1 / 60);
    e.actualizar(null, 1 / 60);
  }
  const v = e.version;
  e.deshacer();
  assert.equal(e.trazos.length, 1);
  assert.ok(e.version > v);
  e.borrar();
  assert.equal(e.trazos.length, 0);
});

test("hay un limite de puntos", () => {
  const e = new Escultura(8, 4);
  e.girando = false;
  for (let i = 0; i < 400; i++) e.actualizar({ x: i % 2, y: 0.5, pellizco: true }, 1 / 60);
  assert.ok(e.total <= MAX_PUNTOS);
});
