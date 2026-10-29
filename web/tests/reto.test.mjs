import assert from "node:assert/strict";
import { test } from "node:test";

import { cumple, ESPERA_EMPEZAR, MANTENER, Reto, tiempoPara, VIDAS } from "../js/reto.js";

const nada = { gestos: [], dedos: 0 };
const mano = { gestos: ["Mano abierta"], dedos: 5 };
// Repite la misma entrada durante "segundos" a 60 FPS
function durante(r, entrada, segundos, desde) {
  const eventos = [];
  const n = Math.round(segundos * 60);
  for (let i = 1; i <= n; i++) eventos.push(...r.actualizar(typeof entrada === "function" ? entrada(r) : entrada, 1 / 60, desde + i / 60));
  return eventos;
}
const tipos = (e) => e.map((x) => x.tipo);
// La entrada que cumple la orden actual
const correcta = (r) => (r.tarea.tipo === "gesto" ? { gestos: [r.tarea.gesto], dedos: 0 } : { gestos: [], dedos: r.tarea.dedos });

test("cumple compara gestos y numero de dedos", () => {
  assert.ok(cumple({ tipo: "gesto", gesto: "Victoria" }, { gestos: ["Puño", "Victoria"], dedos: 2 }));
  assert.ok(!cumple({ tipo: "gesto", gesto: "Victoria" }, { gestos: [], dedos: 2 }));
  assert.ok(cumple({ tipo: "dedos", dedos: 7 }, { gestos: [], dedos: 7 }));
  assert.ok(!cumple({ tipo: "dedos", dedos: 7 }, { gestos: [], dedos: 5 }));
});

test("cada acierto da menos tiempo, con un minimo", () => {
  assert.equal(tiempoPara(0), 4);
  assert.ok(tiempoPara(5) < tiempoPara(0));
  assert.equal(tiempoPara(100), 1.5);
});

test("se empieza ensenando la mano abierta un segundo", () => {
  const r = new Reto(() => 0.3);
  durante(r, mano, ESPERA_EMPEZAR / 2, 0);
  assert.equal(r.estado, "espera");
  durante(r, nada, 0.1, 1);
  const e = durante(r, mano, ESPERA_EMPEZAR + 0.05, 2);
  assert.ok(tipos(e).includes("empezar"));
  assert.equal(r.estado, "jugando");
  assert.ok(r.tarea);
});

test("hay que mantener la postura un momento para acertar", () => {
  const r = new Reto(() => 0.3);
  durante(r, mano, 1.1, 0);
  let e = durante(r, correcta, MANTENER / 2, 2);
  assert.ok(!tipos(e).includes("acierto"));
  e = durante(r, correcta, MANTENER, 3);
  assert.ok(tipos(e).includes("acierto"));
  assert.ok(r.puntos >= 1);
  assert.equal(r.aciertos, 1);
});

test("si se acaba el tiempo pierdes una vida y al perderlas todas se acaba", () => {
  const r = new Reto(() => 0.7);
  durante(r, mano, 1.1, 0);
  const e = durante(r, nada, 4.1 * VIDAS, 2);
  assert.equal(tipos(e).filter((t) => t === "fallo").length, VIDAS);
  assert.ok(tipos(e).includes("fin"));
  assert.equal(r.estado, "fin");
});

test("guarda el record y se puede volver a jugar con la mano abierta", () => {
  const r = new Reto(() => 0.3);
  durante(r, mano, 1.1, 0);
  durante(r, correcta, MANTENER + 0.05, 2);
  durante(r, nada, 20, 3);
  assert.equal(r.estado, "fin");
  assert.ok(r.record >= 1 && r.nuevoRecord);
  const e = durante(r, mano, 1.1, 30);
  assert.ok(tipos(e).includes("empezar"));
  assert.equal(r.puntos, 0);
  assert.equal(r.vidas, VIDAS);
});
