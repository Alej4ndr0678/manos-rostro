import assert from "node:assert/strict";
import { test } from "node:test";

import { Chispas, visibles } from "../js/neon.js";

test("visibles se queda con los puntos que se ven bien", () => {
  const v = visibles([{ visibility: 0.9 }, { visibility: 0.2 }, {}]);
  assert.deepEqual([...v], [0, 2]);
});

test("una mano quieta no suelta chispas y una rapida si", () => {
  const c = new Chispas(() => 0.5);
  c.actualizar([{ clave: "m", x: 0.5, y: 0.5 }], 1 / 60, 1);
  c.actualizar([{ clave: "m", x: 0.5, y: 0.5 }], 1 / 60, 1);
  assert.equal(c.lista.length, 0);
  c.actualizar([{ clave: "m", x: 0.55, y: 0.5 }], 1 / 60, 1); // 3 altos por segundo
  assert.ok(c.lista.length > 0);
  assert.ok(c.lista.every((p) => p.vx > 0), "salen en la direccion del movimiento");
});

test("las chispas se apagan solas", () => {
  const c = new Chispas(() => 0.5);
  c.actualizar([{ clave: "m", x: 0.2, y: 0.5 }], 1 / 60, 1);
  c.actualizar([{ clave: "m", x: 0.3, y: 0.5 }], 1 / 60, 1);
  assert.ok(c.lista.length > 0);
  for (let i = 0; i < 60; i++) c.actualizar([], 1 / 60, 1);
  assert.equal(c.lista.length, 0);
});
