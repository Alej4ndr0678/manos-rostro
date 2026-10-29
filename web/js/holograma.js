// Holograma 3D de tu cara: los 478 puntos de la malla facial de MediaPipe tienen profundidad (z),
// asi que se pueden dibujar en 3D y girar para verte de lado. Aqui va la parte que no depende
// del navegador: pasar los puntos a coordenadas 3D y el giro con la mano (con inercia).

// puntos = [{x, y, z}] de MediaPipe (x e y de 0 a 1 en la imagen SIN voltear; z en la misma
// escala que x, mas negativo = mas cerca de la camara). aspecto = ancho / alto de la imagen.
// Devuelve un Float32Array [x0, y0, z0, x1, ...] centrado en la cara, con la cara de unas
// "alto" unidades de alto, en modo espejo (como la camara), y = arriba y z = hacia ti.
export function centrarMalla(puntos, aspecto = 16 / 9, alto = 2) {
  const n = puntos.length;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of puntos) {
    cx += p.x * aspecto;
    cy += p.y;
    cz += p.z * aspecto;
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  cx /= n;
  cy /= n;
  cz /= n;
  const escala = alto / (maxY - minY || 1);
  const salida = new Float32Array(n * 3);
  puntos.forEach((p, i) => {
    salida[i * 3] = -(p.x * aspecto - cx) * escala; // espejo
    salida[i * 3 + 1] = -(p.y - cy) * escala; // en 3D la y va hacia arriba
    salida[i * 3 + 2] = -(p.z * aspecto - cz) * escala; // z de MediaPipe: negativo = cerca
  });
  return salida;
}

export const SENSIBILIDAD = 5; // radianes por cada ancho de pantalla que arrastras
export const ESPERA_AUTO = 2.5; // segundos sin tocarlo antes de que empiece a girar solo
const GIRO_AUTO = 0.5; // radianes por segundo
const ROZAMIENTO = 2.5; // cuanto frena la inercia (por segundo)
const LIMITE_X = 1.2; // no dejamos voltearlo del todo arriba/abajo

// Girar el holograma pellizcando y arrastrando (como girar un globo terraqueo)
export class Rotador {
  constructor() {
    this.rotY = 0; // girar a los lados
    this.rotX = 0; // inclinar arriba/abajo
    this.vY = 0;
    this.vX = 0;
    this.anterior = null; // donde estaba el pellizco en el frame anterior
    this.quieto = 0; // segundos sin que nadie lo toque
  }

  // pinza = {x, y, pellizco} en fracciones de la pantalla (o null si no hay mano). dt en segundos.
  actualizar(pinza, dt) {
    dt = Math.min(dt, 0.1);
    if (pinza?.pellizco) {
      if (this.anterior && dt > 0) {
        const dY = (pinza.x - this.anterior.x) * SENSIBILIDAD;
        const dX = (pinza.y - this.anterior.y) * SENSIBILIDAD;
        this.rotY += dY;
        this.rotX += dX;
        // Velocidad suavizada, para lanzarlo al soltar
        this.vY = 0.5 * this.vY + 0.5 * (dY / dt);
        this.vX = 0.5 * this.vX + 0.5 * (dX / dt);
      }
      this.anterior = { x: pinza.x, y: pinza.y };
      this.quieto = 0;
    } else {
      this.anterior = null;
      this.quieto += dt;
      this.rotY += this.vY * dt;
      this.rotX += this.vX * dt;
      const frena = Math.exp(-ROZAMIENTO * dt);
      this.vY *= frena;
      this.vX *= frena;
      if (this.quieto > ESPERA_AUTO) {
        // Sin tocarlo: gira solo despacio y vuelve poco a poco a la altura de los ojos
        this.rotY += GIRO_AUTO * dt;
        this.rotX *= Math.exp(-dt);
      }
    }
    this.rotX = Math.max(-LIMITE_X, Math.min(LIMITE_X, this.rotX));
    return { rotX: this.rotX, rotY: this.rotY };
  }
}
