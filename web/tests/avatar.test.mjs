import assert from "node:assert/strict";
import { test } from "node:test";

import { dibujarAvatar, ESTILOS, parametros, pose, Suavizado } from "../js/avatar.js";

test("cara neutra: ojos abiertos, boca cerrada, cejas en su sitio", () => {
  const p = parametros({});
  assert.equal(p.ojoIzq, 1);
  assert.equal(p.ojoDer, 1);
  assert.equal(p.boca, 0);
  assert.equal(p.sonrisa, 0);
  assert.equal(p.cejaIzq, 0);
});

test("guino: solo se cierra un ojo", () => {
  const p = parametros({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.05 });
  assert.ok(p.ojoIzq < 0.2);
  assert.ok(p.ojoDer > 0.9);
});

test("sonrisa y tristeza mueven la boca al reves", () => {
  assert.ok(parametros({ mouthSmileLeft: 0.9, mouthSmileRight: 0.8 }).sonrisa > 0.8);
  assert.ok(parametros({ mouthFrownLeft: 0.7, mouthFrownRight: 0.7 }).sonrisa < -0.6);
});

test("cejas: arriba con sorpresa, abajo al fruncir, pero no al reir", () => {
  assert.ok(parametros({ browInnerUp: 0.8, browOuterUpLeft: 0.8 }).cejaIzq > 0.7);
  assert.ok(parametros({ browDownLeft: 0.8 }).cejaIzq < -0.7);
  // Riendo, las cejas bajan solas (como en la foto de las pruebas de Python): no es enfado
  const risa = parametros({ browDownLeft: 0.84, mouthSmileLeft: 0.96, mouthSmileRight: 0.93 });
  assert.ok(risa.cejaIzq > -0.2, `ceja ${risa.cejaIzq}`);
});

test("la mirada sigue a los ojos", () => {
  assert.ok(parametros({ eyeLookOutRight: 0.8, eyeLookInLeft: 0.8 }).miradaX > 0.7);
  assert.ok(parametros({ eyeLookOutLeft: 0.8, eyeLookInRight: 0.8 }).miradaX < -0.7);
  assert.ok(parametros({ eyeLookUpLeft: 0.6, eyeLookUpRight: 0.6 }).miradaY < -0.5);
});

test("todo queda dentro de sus limites", () => {
  const todo = Object.fromEntries(
    ["eyeBlinkLeft", "eyeWideLeft", "jawOpen", "mouthPucker", "cheekPuff", "browInnerUp", "browDownLeft"].map((n) => [n, 1]),
  );
  for (const [k, v] of Object.entries(parametros(todo))) {
    assert.ok(v >= -1 && v <= 1, `${k} = ${v}`);
  }
});

// Cara inventada: puntos clave de la malla en pixeles
function cara({ nariz = 0, inclinar = 0, cx = 500, cy = 400 } = {}) {
  const puntos = Array.from({ length: 478 }, () => ({ x: cx, y: cy }));
  const rot = (x, y) => ({
    x: cx + x * Math.cos(inclinar) - y * Math.sin(inclinar),
    y: cy + x * Math.sin(inclinar) + y * Math.cos(inclinar),
  });
  puntos[234] = rot(-100, 0);
  puntos[454] = rot(100, 0);
  puntos[33] = rot(-50, -30);
  puntos[263] = rot(50, -30);
  puntos[1] = rot(nariz, 10);
  puntos[10] = rot(0, -130);
  puntos[152] = rot(0, 130);
  return puntos;
}

test("pose de frente", () => {
  const g = pose(cara());
  assert.ok(Math.abs(g.yaw) < 0.01);
  assert.ok(Math.abs(g.roll) < 0.01);
  assert.ok(Math.abs(g.pitch) < 0.05);
  assert.equal(g.ancho, 200);
  assert.equal(g.alto, 260);
});

test("girar la cabeza mueve la nariz y cambia el signo del giro", () => {
  assert.ok(pose(cara({ nariz: 50 })).yaw > 0.5);
  assert.ok(pose(cara({ nariz: -50 })).yaw < -0.5);
});

test("inclinar la cabeza da el angulo de inclinacion y no confunde el giro", () => {
  const g = pose(cara({ inclinar: 0.4 }));
  assert.ok(Math.abs(g.roll - 0.4) < 1e-6);
  assert.ok(Math.abs(g.yaw) < 0.01);
});

test("el suavizado amortigua los saltos pero deja pasar los parpadeos rapido", () => {
  const s = new Suavizado(0.5);
  s.actualizar({ boca: 0, ojoIzq: 1 });
  const v = s.actualizar({ boca: 1, ojoIzq: 0 });
  assert.equal(v.boca, 0.5);
  assert.ok(v.ojoIzq < 0.2);
});

// Canvas falso: acepta cualquier llamada y cuenta cuantas se hacen
function ctxFalso() {
  const llamadas = { total: 0 };
  return new Proxy(llamadas, {
    get: (obj, k) => (k in obj ? obj[k] : () => { obj.total++; }),
    set: () => true,
  });
}

test("cada estilo se dibuja sin errores en cualquier expresion", () => {
  const expresiones = [
    {}, { eyeBlinkLeft: 1 }, { jawOpen: 1 }, { mouthPucker: 1 }, { mouthSmileLeft: 1, mouthSmileRight: 1, cheekPuff: 1 },
    { mouthFrownLeft: 1, mouthFrownRight: 1, browDownLeft: 1, browDownRight: 1 },
  ];
  for (const estilo of ESTILOS) {
    for (const formas of expresiones) {
      const ctx = ctxFalso();
      dibujarAvatar(ctx, parametros(formas), { yaw: 0.5, pitch: -0.3 }, estilo);
      assert.ok(ctx.total > 10, `${estilo} dibuja algo`);
    }
  }
});
