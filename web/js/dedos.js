// Contador de dedos: la misma idea que paso5_dedos.py, pero en JavaScript.
// Este archivo no usa la camara ni el navegador, asi que se puede probar con Node.

export const BASE_CORAZON = 9;
export const PULGAR_PUNTA = 4;
export const PULGAR_ARTICULACION = 3;
// (base, articulacion media, articulacion de arriba, punta) de indice, corazon, anular y menique
export const DEDOS = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
export const ANGULO_DOBLADO = 80; // si un dedo se dobla mas que esto, cuenta como bajado
export const FRAMES_SUAVIZADO = 5;

export function distancia(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Angulo en grados entre el segmento a->b (base del dedo) y c->d (punta). 0 = dedo recto.
export function angulo(a, b, c, d) {
  const v1 = [b.x - a.x, b.y - a.y, b.z - a.z];
  const v2 = [d.x - c.x, d.y - c.y, d.z - c.z];
  const producto = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  const normas = Math.hypot(...v1) * Math.hypot(...v2);
  const coseno = Math.max(-1, Math.min(1, producto / normas));
  return (Math.acos(coseno) * 180) / Math.PI;
}

// Devuelve 5 booleanos: [pulgar, indice, corazon, anular, menique].
// El pulgar se mira en 2D (se mueve de lado); el resto, con angulos en 3D (puntos3d =
// "world landmarks"), para que funcione aunque ensenes el dorso de la mano.
export function dedosLevantados(puntos, puntos3d) {
  const pulgar =
    distancia(puntos[PULGAR_PUNTA], puntos[BASE_CORAZON]) >
    distancia(puntos[PULGAR_ARTICULACION], puntos[BASE_CORAZON]);
  const otros = DEDOS.map(
    ([base, media, arriba, punta]) =>
      angulo(puntos3d[base], puntos3d[media], puntos3d[arriba], puntos3d[punta]) < ANGULO_DOBLADO,
  );
  return [pulgar, ...otros];
}

// Guarda los ultimos frames de cada mano y devuelve el estado que mas se repite,
// para que el numero no parpadee por un frame suelto con error.
export class Suavizador {
  constructor(frames = FRAMES_SUAVIZADO) {
    this.frames = frames;
    this.historial = new Map();
  }

  actualizar(lado, estado) {
    const lista = this.historial.get(lado) ?? [];
    lista.push(estado.join(","));
    if (lista.length > this.frames) lista.shift();
    this.historial.set(lado, lista);
    const cuenta = new Map();
    for (const clave of lista) cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1);
    let mejor = lista[0];
    for (const [clave, n] of cuenta) if (n > cuenta.get(mejor)) mejor = clave;
    return mejor.split(",").map((v) => v === "true");
  }
}
