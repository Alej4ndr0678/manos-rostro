import assert from "node:assert/strict";
import { test } from "node:test";

import { cruce, distanciaSegmento, hoja, LARGO, Sables } from "../js/sables.js";

// Una mano "de pie": muneca abajo (y = 0.8) y nudillos encima (y = 0.7), en la x indicada
function mano(x, inclinacion = 0) {
  const puntos = Array.from({ length: 21 }, () => ({ x, y: 0.75 }));
  puntos[0] = { x, y: 0.8 };
  puntos[9] = { x: x + inclinacion, y: 0.7 };
  return puntos;
}

test("distanciaSegmento mide hasta el punto mas cercano del segmento", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 1, y: 0 };
  assert.equal(distanciaSegmento({ x: 0.5, y: 0.2 }, a, b), 0.2);
  assert.equal(distanciaSegmento({ x: 2, y: 0 }, a, b), 1); // mas alla de la punta
});

test("cruce encuentra donde se cortan dos segmentos y null si no se tocan", () => {
  const p = cruce({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 0 });
  assert.deepEqual(p, { x: 0.5, y: 0.5 });
  assert.equal(cruce({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }), null);
});

test("la hoja sale de los nudillos hacia donde apuntan los dedos", () => {
  const { base, punta } = hoja(mano(0.5), 1);
  assert.deepEqual(base, { x: 0.5, y: 0.7 });
  assert.equal(punta.x, 0.5);
  assert.ok(Math.abs(punta.y - (0.7 - LARGO)) < 1e-9); // hacia arriba
});

test("el sable se enciende poco a poco y se apaga al perder la mano", () => {
  const s = new Sables(1, () => 0.5);
  const ev = s.actualizar([{ clave: "Derecha", puntos: mano(0.5) }], 0.1);
  assert.ok(ev.some((e) => e.tipo === "encender"));
  assert.ok(s.activos()[0].encendido < 1);
  for (let i = 0; i < 5; i++) s.actualizar([{ clave: "Derecha", puntos: mano(0.5) }], 0.1);
  assert.equal(s.activos()[0].encendido, 1);
  let apagado = false;
  for (let i = 0; i < 10; i++) apagado ||= s.actualizar([], 0.1).some((e) => e.tipo === "apagar");
  assert.ok(apagado);
  assert.equal(s.activos().length, 0);
});

test("cruzar los dos sables da un choque", () => {
  const s = new Sables(1, () => 0.5);
  // Dos sables inclinados que se cruzan en el centro
  const manos = [
    { clave: "Izquierda", puntos: mano(0.3, 0.1) },
    { clave: "Derecha", puntos: mano(0.7, -0.1) },
  ];
  let choques = 0;
  for (let i = 0; i < 6; i++) choques += s.actualizar(manos, 0.1).filter((e) => e.tipo === "choque").length;
  assert.equal(choques, 1); // mantenerlos cruzados no repite el choque
});

test("un rayo que toca la hoja se desvia hacia el dron", () => {
  const s = new Sables(1, () => 0.5);
  for (let i = 0; i < 3; i++) s.actualizar([{ clave: "Derecha", puntos: mano(0.5) }], 0.1);
  // Rayo que viene de la izquierda directo hacia la hoja (que esta en x = 0.5, y de 0.2 a 0.7)
  s.rayos = [{ x: 0.4, y: 0.5, vx: 0.55, vy: 0, desviado: false }];
  s.proximoDisparo = 99;
  let ev = [];
  for (let i = 0; i < 20 && !ev.some((e) => e.tipo === "desvio"); i++) {
    ev = s.actualizar([{ clave: "Derecha", puntos: mano(0.5) }], 1 / 60);
  }
  assert.ok(ev.some((e) => e.tipo === "desvio"));
  assert.equal(s.racha, 1);
  assert.ok(s.rayos[0].vy < 0); // ahora sube, hacia el dron
});

test("un rayo que no desvias es un impacto y corta la racha", () => {
  const s = new Sables(1, () => 0.5);
  s.racha = 4;
  s.proximoDisparo = 99;
  s.rayos = [{ x: 0.5, y: 1.05, vx: 0, vy: 0.55, desviado: false }];
  const ev = s.actualizar([], 0.1);
  assert.ok(ev.some((e) => e.tipo === "impacto"));
  assert.equal(s.racha, 0);
  assert.equal(s.rayos.length, 0);
});

test("el dron solo dispara si hay algun sable encendido", () => {
  const s = new Sables(1, () => 0.5);
  for (let i = 0; i < 40; i++) s.actualizar([], 0.1);
  assert.equal(s.rayos.length, 0);
  let disparos = 0;
  for (let i = 0; i < 40; i++) disparos += s.actualizar([{ clave: "Derecha", puntos: mano(0.5) }], 0.1).filter((e) => e.tipo === "disparo").length;
  assert.ok(disparos >= 1);
});
