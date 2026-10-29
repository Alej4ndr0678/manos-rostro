// Pruebas de la logica de la version web. Ejecutar con:  node --test web/tests/
import assert from "node:assert/strict";
import { test } from "node:test";

import { angulo, dedosLevantados, Suavizador } from "../js/dedos.js";
import { crearMano } from "./mano.mjs";

const POSTURAS = [
  [true, true, true, true, true],
  [false, false, false, false, false],
  [false, true, false, false, false],
  [false, true, true, false, false],
  [true, false, false, false, true],
];

for (const postura of POSTURAS) {
  test(`cuenta los dedos ${postura.map(Number).join("")}`, () => {
    const mano = crearMano(postura);
    assert.deepEqual(dedosLevantados(mano, mano), postura);
  });
}

test("angulo de un dedo recto y uno doblado", () => {
  const mano = crearMano([false, true, false, false, false]);
  assert.ok(angulo(mano[5], mano[6], mano[7], mano[8]) < 10);
  assert.ok(angulo(mano[9], mano[10], mano[11], mano[12]) > 80);
});

test("el suavizador ignora un frame suelto", () => {
  const s = new Suavizador();
  const cinco = [true, true, true, true, true];
  for (let i = 0; i < 4; i++) s.actualizar("Derecha", cinco);
  assert.deepEqual(s.actualizar("Derecha", [false, false, false, false, false]), cinco);
});

test("el suavizador separa cada mano", () => {
  const s = new Suavizador();
  s.actualizar("Derecha", [true, true, true, true, true]);
  assert.deepEqual(s.actualizar("Izquierda", [false, true, false, false, false]), [false, true, false, false, false]);
});
