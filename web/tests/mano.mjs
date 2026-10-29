// Mano inventada (21 puntos), igual que crear_mano() de tests/conftest.py
const BASES_X = [0.42, 0.5, 0.58, 0.66];
const p = (x, y, z = 0) => ({ x, y, z });

export function crearMano(levantados, dx = 0, dy = 0) {
  const pts = new Array(21);
  pts[0] = p(0.5, 0.9);
  pts[1] = p(0.42, 0.8);
  pts[2] = p(0.38, 0.72);
  pts[3] = p(0.35, 0.66);
  pts[4] = levantados[0] ? p(0.28, 0.6) : p(0.45, 0.62);
  BASES_X.forEach((bx, n) => {
    const base = 5 + n * 4;
    pts[base] = p(bx, 0.6);
    pts[base + 1] = p(bx, 0.5);
    if (levantados[n + 1]) {
      pts[base + 2] = p(bx, 0.42);
      pts[base + 3] = p(bx, 0.35);
    } else {
      pts[base + 2] = p(bx, 0.52, 0.05);
      pts[base + 3] = p(bx, 0.6, 0.05);
    }
  });
  return pts.map((q) => p(q.x + dx, q.y + dy, q.z));
}
