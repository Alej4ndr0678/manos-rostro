import assert from "node:assert/strict";
import { test } from "node:test";

import { PALETA, Pizarra, SEGUNDOS_BORRAR } from "../js/pintar.js";

// Un canvas falso que solo apunta las lineas y los borrados
function ctxFalso() {
  return {
    lineas: 0,
    borrados: 0,
    save() {}, restore() {}, beginPath() {}, moveTo() {},
    lineTo() { this.lineas++; },
    stroke() {},
    clearRect() { this.borrados++; },
  };
}

const INDICE = [false, true, false, false, false];
const V = [false, true, true, false, false];
const ABIERTA = [true, true, true, true, true];

test("el indice pinta", () => {
  const ctx = ctxFalso();
  const p = new Pizarra(ctx, 1280, 720);
  for (let i = 0; i <= 10; i++) p.actualizar([{ lado: "Derecha", dedos: INDICE, x: 300 + i * 40, y: 400 }], i * 0.03);
  assert.ok(ctx.lineas >= 9);
});

test("la V mueve sin pintar", () => {
  const ctx = ctxFalso();
  const p = new Pizarra(ctx, 1280, 720);
  for (let i = 0; i <= 10; i++) p.actualizar([{ lado: "Derecha", dedos: V, x: 300 + i * 40, y: 400 }], i * 0.03);
  assert.equal(ctx.lineas, 0);
});

test("subir el dedo a la barra elige color y no pinta", () => {
  const ctx = ctxFalso();
  const p = new Pizarra(ctx, 1200, 720);
  // x = 450 -> casilla 2 de 6 (cada una mide 200 px)
  for (let i = 0; i < 6; i++) p.actualizar([{ lado: "Derecha", dedos: INDICE, x: 450, y: 50 }], i * 0.03);
  assert.equal(PALETA[p.color].nombre, "Verde");
  assert.equal(ctx.lineas, 0);
});

test("al bajar de la barra no hay linea desde la barra", () => {
  const ctx = ctxFalso();
  const p = new Pizarra(ctx, 1280, 720);
  p.actualizar([{ lado: "Derecha", dedos: INDICE, x: 500, y: 50 }], 0);
  p.actualizar([{ lado: "Derecha", dedos: INDICE, x: 500, y: 500 }], 0.03);
  assert.equal(ctx.lineas, 0);
});

test("mano abierta mantenida borra", () => {
  const ctx = ctxFalso();
  const p = new Pizarra(ctx, 1280, 720);
  for (let t = 0; t <= SEGUNDOS_BORRAR + 0.1; t += 0.05) {
    p.actualizar([{ lado: "Derecha", dedos: ABIERTA, x: 600, y: 400 }], t);
  }
  assert.equal(ctx.borrados, 1);
});
