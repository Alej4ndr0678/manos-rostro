// Escena 3D con Three.js para el modo 3D: dibuja los objetos que mueve manipular.js.
// Three.js solo se descarga al entrar en el modo (son ~700 KB), con import() dinamico.
const URL_THREE = "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js";

export const OBJETOS = [
  { id: "cubo", x: 0.3, y: 0.35, escala: 1, giro: 0 },
  { id: "nudo", x: 0.7, y: 0.35, escala: 1, giro: 0 },
  { id: "planeta", x: 0.3, y: 0.7, escala: 1, giro: 0 },
  { id: "gema", x: 0.7, y: 0.7, escala: 1, giro: 0 },
];

const DISTANCIA_CAMARA = 10;
const FOV = 50;

export async function crearEscena(ancho, alto) {
  const THREE = await import(URL_THREE);
  const lienzo = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas: lienzo, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(ancho, alto, false);
  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(FOV, ancho / alto, 0.1, 100);
  camara.position.z = DISTANCIA_CAMARA;

  escena.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.4));
  const sol = new THREE.DirectionalLight(0xffffff, 2.2);
  sol.position.set(3, 5, 6);
  escena.add(sol);
  const contraluz = new THREE.PointLight(0x22d3ee, 30, 30);
  contraluz.position.set(-5, -3, 3);
  escena.add(contraluz);

  const mallas = {};
  // Cubo: cada cara de un color
  const colores = [0xf87171, 0xfbbf24, 0x34d399, 0x60a5fa, 0xa78bfa, 0xf472b6];
  mallas.cubo = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 1.3, 1.3),
    colores.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35 })),
  );
  // Nudo toroidal metalico
  mallas.nudo = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.55, 0.2, 160, 24),
    new THREE.MeshStandardMaterial({ color: 0x22d3ee, metalness: 0.7, roughness: 0.2 }),
  );
  // Planeta con anillos
  const planeta = new THREE.Group();
  planeta.add(new THREE.Mesh(new THREE.SphereGeometry(0.65, 48, 32), new THREE.MeshStandardMaterial({ color: 0xfb923c, roughness: 0.6 })));
  const anillo = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 1.25, 64),
    new THREE.MeshStandardMaterial({ color: 0xfde68a, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }),
  );
  anillo.rotation.x = Math.PI / 2.4;
  planeta.add(anillo);
  mallas.planeta = planeta;
  // Gema con caras planas
  mallas.gema = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.8, 0),
    new THREE.MeshStandardMaterial({ color: 0xa78bfa, flatShading: true, metalness: 0.3, roughness: 0.15 }),
  );
  for (const m of Object.values(mallas)) escena.add(m);

  // Tamano del mundo visible en z = 0, para pasar de fracciones de pantalla a coordenadas 3D
  const altoMundo = 2 * DISTANCIA_CAMARA * Math.tan((FOV * Math.PI) / 360);
  const anchoMundo = altoMundo * (ancho / alto);

  return {
    lienzo,
    // objetos = los del Manipulador; agarrados = Map objeto -> agarres
    dibujar(objetos, agarrados) {
      for (const o of objetos) {
        const m = mallas[o.id];
        m.position.set((o.x - 0.5) * anchoMundo, (0.5 - o.y) * altoMundo, agarrados.has(o) ? 1 : 0);
        m.rotation.set(0.5, o.giroY, o.giro);
        m.scale.setScalar(o.escala * (agarrados.has(o) ? 1.1 : 1));
        // Brilla un poco mientras lo tienes agarrado
        m.traverse((hijo) => {
          for (const mat of [hijo.material].flat()) {
            if (mat?.emissive) mat.emissive.setHex(agarrados.has(o) ? 0x333333 : 0x000000);
          }
        });
      }
      renderer.render(escena, camara);
      return lienzo;
    },
  };
}
