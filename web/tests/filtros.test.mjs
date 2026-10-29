import assert from "node:assert/strict";
import { test } from "node:test";

import { anclas, Arcoiris, BOCA_ABIERTA } from "../js/filtros.js";

// Cara de juguete en pixeles: ojos a la altura 100, frente en 40, barbilla en 240
function cara({ boca = 0, inclinar = 0 } = {}) {
  const p = Array.from({ length: 478 }, () => ({ x: 200, y: 140 }));
  const girar = ({ x, y }) => {
    const c = Math.cos(inclinar);
    const s = Math.sin(inclinar);
    return { x: 200 + (x - 200) * c - (y - 140) * s, y: 140 + (x - 200) * s + (y - 140) * c };
  };
  const poner = (i, x, y) => (p[i] = girar({ x, y }));
  poner(33, 150, 100);
  poner(133, 170, 100);
  poner(362, 230, 100);
  poner(263, 250, 100);
  poner(10, 200, 40);
  poner(152, 200, 240);
  poner(4, 200, 140);
  poner(13, 200, 180 - boca / 2);
  poner(14, 200, 180 + boca / 2);
  poner(234, 120, 130);
  poner(454, 280, 130);
  return p;
}

test("anclas encuentra ojos, boca y tamano de la cara", () => {
  const a = anclas(cara());
  assert.deepEqual(a.ojoIzq, { x: 160, y: 100 });
  assert.deepEqual(a.ojoDer, { x: 240, y: 100 });
  assert.equal(a.distOjos, 80);
  assert.equal(a.angulo, 0);
  assert.equal(a.altoCara, 200);
  assert.equal(a.anchoCara, 160);
  assert.equal(a.abertura, 0);
  assert.ok(Math.abs(a.abajo.x) < 1e-9 && Math.abs(a.abajo.y - 1) < 1e-9);
});

test("anclas mide cuanto esta abierta la boca", () => {
  assert.ok(anclas(cara({ boca: 40 })).abertura > BOCA_ABIERTA);
  assert.ok(anclas(cara({ boca: 5 })).abertura < BOCA_ABIERTA);
});

test("con la cabeza inclinada, el angulo y 'abajo' giran con ella", () => {
  const a = anclas(cara({ inclinar: 0.3 }));
  assert.ok(Math.abs(a.angulo - 0.3) < 1e-9);
  assert.ok(a.abajo.x < 0, "abajo apunta un poco hacia la izquierda");
});

test("el arcoiris solo sale con la boca abierta, cae y desaparece", () => {
  const r = new Arcoiris(() => 0.5);
  const origen = { x: 100, y: 100 };
  const abajo = { x: 0, y: 1 };
  r.actualizar(false, origen, abajo, 200, 1 / 60);
  assert.equal(r.particulas.length, 0);
  for (let i = 0; i < 30; i++) r.actualizar(true, origen, abajo, 200, 1 / 60);
  assert.ok(r.particulas.length >= 6 * 25, "seis colores por rafaga");
  assert.ok(r.particulas.every((p) => p.y >= origen.y), "sale hacia abajo de la cara");
  for (let i = 0; i < 120; i++) r.actualizar(false, origen, abajo, 200, 1 / 60);
  assert.equal(r.particulas.length, 0, "al cerrar la boca se acaba");
});
