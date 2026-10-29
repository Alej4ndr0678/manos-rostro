import assert from "node:assert/strict";
import { test } from "node:test";

import { cortaSegmento, dificultad, Ninja, RADIO, VIDAS } from "../js/ninja.js";

const fijo = (v) => () => v;

// Pasa el dedo de (x1, y1) a (x2, y2) en "pasos" frames de 1/60 s. Devuelve todos los eventos.
function tajo(n, x1, y1, x2, y2, desde, pasos = 6, clave = "d") {
  const eventos = [];
  for (let i = 0; i <= pasos; i++) {
    const t = desde + i / 60;
    eventos.push(...n.actualizar([{ clave, x: x1 + ((x2 - x1) * i) / pasos, y: y1 + ((y2 - y1) * i) / pasos }], 1 / 60, t));
  }
  return eventos;
}
const tipos = (eventos) => eventos.map((e) => e.tipo);
// Deja pasar el tiempo sin dedos
function esperar(n, segundos, desde) {
  const eventos = [];
  for (let i = 1; i <= segundos * 60; i++) eventos.push(...n.actualizar([], 1 / 60, desde + i / 60));
  return eventos;
}

test("cortaSegmento detecta si la linea pasa por el circulo", () => {
  const c = { x: 0.5, y: 0.5 };
  assert.ok(cortaSegmento({ x: 0.3, y: 0.5 }, { x: 0.7, y: 0.5 }, c, 0.05));
  assert.ok(!cortaSegmento({ x: 0.3, y: 0.6 }, { x: 0.7, y: 0.6 }, c, 0.05));
  // El segmento se queda corto: no llega a la fruta
  assert.ok(!cortaSegmento({ x: 0.1, y: 0.5 }, { x: 0.3, y: 0.5 }, c, 0.05));
  // Con aspecto 2 la distancia horizontal cuenta el doble
  assert.ok(!cortaSegmento({ x: 0.53, y: 0.3 }, { x: 0.53, y: 0.7 }, c, 0.05, 2));
  assert.ok(cortaSegmento({ x: 0.53, y: 0.3 }, { x: 0.53, y: 0.7 }, c, 0.05, 1));
});

test("cortar la sandia del centro empieza la partida", () => {
  const n = new Ninja(1, fijo(0.5));
  assert.equal(n.estado, "espera");
  const eventos = tajo(n, 0.2, 0.45, 0.8, 0.45, 0);
  assert.ok(tipos(eventos).includes("empezar"));
  assert.equal(n.estado, "jugando");
  assert.equal(n.trozos.length, 2, "la sandia se parte en dos");
});

test("un dedo lento no corta", () => {
  const n = new Ninja(1, fijo(0.5));
  const eventos = tajo(n, 0.3, 0.45, 0.7, 0.45, 0, 120); // 2 segundos para cruzar: muy lento
  assert.ok(!tipos(eventos).includes("corte"));
  assert.equal(n.estado, "espera");
});

test("las frutas suben y vuelven a caer; si no las cortas pierdes vidas hasta el final", () => {
  const n = new Ninja(1, fijo(0.5));
  tajo(n, 0.2, 0.45, 0.8, 0.45, 0);
  let eventos = esperar(n, 0.8, 0.1);
  const fruta = n.objetos[0];
  assert.ok(fruta, "ha salido una fruta");
  assert.ok(fruta.vy < 0 && fruta.y < 1, "va subiendo");
  eventos = esperar(n, 20, 0.9);
  assert.ok(tipos(eventos).includes("fallo"));
  assert.equal(n.estado, "fin");
  assert.equal(n.vidas, 0);
  assert.equal(tipos(eventos).filter((t) => t === "fallo").length, VIDAS);
});

test("cortar una fruta da un punto y deja zumo", () => {
  const n = new Ninja(1, fijo(0.5));
  tajo(n, 0.2, 0.45, 0.8, 0.45, 0);
  esperar(n, 1.2, 0.1);
  const f = n.objetos[0];
  const eventos = tajo(n, f.x - 0.2, f.y, f.x + 0.2, f.y, 1.31, 4);
  assert.ok(tipos(eventos).includes("corte"));
  assert.equal(n.puntos, 1);
  assert.ok(n.manchas.length >= 1);
  assert.ok(!n.objetos.includes(f));
});

test("tres frutas de un tajo hacen combo", () => {
  const n = new Ninja(1, fijo(0.5));
  tajo(n, 0.2, 0.45, 0.8, 0.45, 0);
  n.objetos = [0.3, 0.5, 0.7].map((x) => ({ emoji: "🍎", color: "#f00", x, y: 0.5, vx: 0, vy: 0, giro: 0, vGiro: 0, radio: RADIO }));
  n.proximaOleada = Infinity;
  const eventos = [...tajo(n, 0.1, 0.5, 0.9, 0.5, 1, 6), ...esperar(n, 0.5, 1.1)];
  assert.equal(tipos(eventos).filter((t) => t === "corte").length, 3);
  const combo = eventos.find((e) => e.tipo === "combo");
  assert.equal(combo?.n, 3);
  assert.equal(n.puntos, 6, "3 frutas + 3 de combo");
});

test("cortar una bomba termina la partida y guarda el record", () => {
  const n = new Ninja(1, fijo(0.5));
  tajo(n, 0.2, 0.45, 0.8, 0.45, 0);
  n.puntos = 4;
  n.objetos = [{ emoji: "💣", color: "#fff", bomba: true, x: 0.5, y: 0.5, vx: 0, vy: 0, giro: 0, vGiro: 0, radio: RADIO }];
  const eventos = tajo(n, 0.2, 0.5, 0.8, 0.5, 2);
  assert.ok(tipos(eventos).includes("bomba"));
  assert.equal(n.estado, "fin");
  assert.equal(n.record, 4);
  assert.ok(n.nuevoRecord);
});

test("tras perder vuelve a salir la sandia y se puede jugar otra vez", () => {
  const n = new Ninja(1, fijo(0.5));
  tajo(n, 0.2, 0.45, 0.8, 0.45, 0);
  n.objetos = [{ emoji: "💣", color: "#fff", bomba: true, x: 0.5, y: 0.5, vx: 0, vy: 0, giro: 0, vGiro: 0, radio: RADIO }];
  tajo(n, 0.2, 0.5, 0.8, 0.5, 2);
  esperar(n, 0.5, 2.2);
  assert.ok(!n.objetos.some((o) => o.diana), "aun no");
  esperar(n, 1.5, 2.7);
  assert.ok(n.objetos.some((o) => o.diana));
  const eventos = tajo(n, 0.2, 0.45, 0.8, 0.45, 5);
  assert.ok(tipos(eventos).includes("empezar"));
  assert.equal(n.vidas, VIDAS);
  assert.equal(n.puntos, 0);
});

test("la dificultad sube con el tiempo y al principio no hay bombas", () => {
  assert.equal(dificultad(0).probBomba, 0);
  assert.ok(dificultad(60).intervalo < dificultad(0).intervalo);
  assert.ok(dificultad(60).maxPorOleada > dificultad(0).maxPorOleada);
  assert.ok(dificultad(1000).probBomba <= 0.3);
  assert.ok(dificultad(1000).intervalo >= 0.8);
});
