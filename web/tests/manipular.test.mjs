import assert from "node:assert/strict";
import { test } from "node:test";

import { difAngulo, leerMano, Manipulador, RADIO_AGARRE } from "../js/manipular.js";

const ASPECTO = 1; // en las pruebas, pantalla cuadrada: las cuentas son mas faciles

// Mano inventada: el pellizco (pulgar + indice) en (x, y), la muneca debajo, girada "angulo" radianes
function mano(x, y, { pellizco = true, angulo = 0 } = {}) {
  const pts = Array.from({ length: 21 }, () => ({ x, y }));
  const separacion = pellizco ? 0.01 : 0.12;
  pts[4] = { x: x - separacion / 2, y };
  pts[8] = { x: x + separacion / 2, y };
  // Muneca 0.15 por debajo del nudillo del corazon (9), girada
  pts[9] = { x: x, y: y + 0.05 };
  pts[0] = { x: x - 0.15 * Math.sin(angulo), y: y + 0.05 + 0.15 * Math.cos(angulo) };
  return pts;
}

const nuevo = () => new Manipulador([{ id: "a", x: 0.3, y: 0.5, escala: 1, giro: 0 }, { id: "b", x: 0.7, y: 0.5, escala: 1, giro: 0 }], ASPECTO);

test("leer la mano: pellizco con histeresis y angulo de la muneca", () => {
  assert.equal(leerMano(mano(0.5, 0.5), false, ASPECTO).pellizco, true);
  assert.equal(leerMano(mano(0.5, 0.5, { pellizco: false }), false, ASPECTO).pellizco, false);
  // Un poco abierto (entre los dos umbrales): sigue como estaba
  const medio = mano(0.5, 0.5);
  medio[4] = { x: 0.5 - 0.025, y: 0.5 };
  medio[8] = { x: 0.5 + 0.025, y: 0.5 };
  assert.equal(leerMano(medio, false, ASPECTO).pellizco, false);
  assert.equal(leerMano(medio, true, ASPECTO).pellizco, true);
  assert.ok(Math.abs(leerMano(mano(0.5, 0.5, { angulo: 0.5 }), false, ASPECTO).angulo - 0.5) < 1e-9);
});

test("diferencia de angulos sin saltos al dar la vuelta", () => {
  assert.ok(Math.abs(difAngulo(3.1, -3.1) - (6.2 - 2 * Math.PI)) < 1e-9);
  assert.ok(Math.abs(difAngulo(0.2, 0.1) - 0.1) < 1e-9);
});

test("agarrar el objeto cercano y moverlo", () => {
  const m = nuevo();
  m.actualizar([{ lado: "Derecha", puntos: mano(0.32, 0.5) }], 1 / 60);
  assert.deepEqual(m.agarradoPor(m.objetos[0]), ["Derecha"]);
  m.actualizar([{ lado: "Derecha", puntos: mano(0.42, 0.4) }], 1 / 60);
  // Se mueve igual que la mano, manteniendo el desfase del agarre (0.02 a la izquierda)
  assert.ok(Math.abs(m.objetos[0].x - 0.4) < 1e-9);
  assert.ok(Math.abs(m.objetos[0].y - 0.4) < 1e-9);
  assert.equal(m.objetos[1].x, 0.7, "el otro no se mueve");
});

test("pellizcar lejos de todo no agarra nada", () => {
  const m = nuevo();
  m.actualizar([{ lado: "Derecha", puntos: mano(0.5, 0.1) }], 1 / 60);
  assert.equal(m.agarres.size, 0);
  assert.ok(RADIO_AGARRE < 0.4);
});

test("la mano abierta no agarra", () => {
  const m = nuevo();
  m.actualizar([{ lado: "Derecha", puntos: mano(0.3, 0.5, { pellizco: false }) }], 1 / 60);
  assert.equal(m.agarres.size, 0);
});

test("girar la muneca gira el objeto", () => {
  const m = nuevo();
  m.actualizar([{ lado: "Derecha", puntos: mano(0.3, 0.5) }], 1 / 60);
  m.actualizar([{ lado: "Derecha", puntos: mano(0.3, 0.5, { angulo: 0.6 }) }], 1 / 60);
  assert.ok(Math.abs(m.objetos[0].giro + 0.6) < 1e-6);
});

test("soltar en movimiento lo lanza y luego frena", () => {
  const m = nuevo();
  for (let i = 0; i <= 10; i++) m.actualizar([{ lado: "Derecha", puntos: mano(0.3 + i * 0.01, 0.5) }], 1 / 60);
  m.actualizar([{ lado: "Derecha", puntos: mano(0.41, 0.5, { pellizco: false }) }], 1 / 60);
  assert.equal(m.agarres.size, 0);
  const x0 = m.objetos[0].x;
  m.actualizar([], 1 / 60);
  assert.ok(m.objetos[0].x > x0, "sigue avanzando");
  for (let i = 0; i < 300; i++) m.actualizar([], 1 / 60);
  assert.ok(Math.abs(m.objetos[0].vx) < 1e-4, "y acaba parandose");
  assert.ok(m.objetos[0].x <= 0.95, "sin salirse de la pantalla");
});

test("con las dos manos se escala segun la distancia entre ellas", () => {
  const m = nuevo();
  const dos = (sep) => [
    { lado: "Izquierda", puntos: mano(0.3 - sep, 0.5) },
    { lado: "Derecha", puntos: mano(0.3 + sep, 0.5) },
  ];
  m.actualizar(dos(0.05), 1 / 60);
  assert.equal(m.agarradoPor(m.objetos[0]).length, 2);
  assert.ok(m.dosManos);
  m.actualizar(dos(0.1), 1 / 60);
  assert.ok(Math.abs(m.objetos[0].escala - 2) < 1e-6, `escala ${m.objetos[0].escala}`);
  m.actualizar(dos(0.5), 1 / 60);
  assert.equal(m.objetos[0].escala, 3, "con un maximo");
  // Al soltar una mano, la otra sigue llevandolo sin que pegue un salto
  const x = m.objetos[0].x;
  m.actualizar([{ lado: "Derecha", puntos: mano(0.8, 0.5) }], 1 / 60);
  assert.equal(m.dosManos, null);
  assert.ok(Math.abs(m.objetos[0].x - x) < 1e-9);
});

test("si la mano desaparece, suelta el objeto", () => {
  const m = nuevo();
  m.actualizar([{ lado: "Derecha", puntos: mano(0.3, 0.5) }], 1 / 60);
  m.actualizar([], 1 / 60);
  assert.equal(m.agarres.size, 0);
  assert.equal(m.pellizcos.size, 0);
});
