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

// Holograma de la cara: puntos y lineas de la malla facial que brillan, sobre un proyector.
// conexiones = [{start, end}] (FaceLandmarker.FACE_LANDMARKS_TESSELATION). numPuntos = 478.
export async function crearHolograma(ancho, alto, conexiones, numPuntos = 478) {
  const THREE = await import(URL_THREE);
  const lienzo = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas: lienzo, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(ancho, alto, false);
  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(40, ancho / alto, 0.1, 100);
  camara.position.set(0, 0.3, 6.5);
  camara.lookAt(0, -0.2, 0);

  const color = new THREE.Color(0x22d3ee);
  const brillo = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
  const posiciones = new THREE.BufferAttribute(new Float32Array(numPuntos * 3), 3);
  posiciones.setUsage(THREE.DynamicDrawUsage);
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute("position", posiciones);
  geometria.setIndex(conexiones.flatMap(({ start, end }) => [start, end]));

  const cara = new THREE.Group();
  const lineas = new THREE.LineSegments(geometria, new THREE.LineBasicMaterial({ color, opacity: 0.35, ...brillo }));
  const puntos = new THREE.Points(geometria, new THREE.PointsMaterial({ color: 0xa5f3fc, size: 0.035, opacity: 0.9, ...brillo }));
  cara.add(lineas, puntos);
  escena.add(cara);

  // Proyector: un aro en el suelo y un cono de luz que sube hasta la cara
  const proyector = new THREE.Group();
  proyector.position.y = -1.7;
  const aro = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.05, 64),
    new THREE.MeshBasicMaterial({ color, opacity: 0.8, side: THREE.DoubleSide, ...brillo }),
  );
  aro.rotation.x = -Math.PI / 2;
  const disco = new THREE.Mesh(
    new THREE.CircleGeometry(0.85, 64),
    new THREE.MeshBasicMaterial({ color, opacity: 0.15, side: THREE.DoubleSide, ...brillo }),
  );
  disco.rotation.x = -Math.PI / 2;
  const cono = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 0.9, 3, 48, 1, true),
    new THREE.MeshBasicMaterial({ color, opacity: 0.06, side: THREE.DoubleSide, ...brillo }),
  );
  cono.position.y = 1.5;
  proyector.add(aro, disco, cono);
  escena.add(proyector);

  let hayCara = false;
  return {
    lienzo,
    // malla = Float32Array de centrarMalla (o null para dejar la ultima). t = segundos.
    dibujar(malla, rotX, rotY, t) {
      if (malla) {
        posiciones.array.set(malla);
        posiciones.needsUpdate = true;
        geometria.computeBoundingSphere();
        hayCara = true;
      }
      cara.visible = hayCara;
      cara.rotation.set(rotX, rotY, 0);
      // Parpadeo de holograma: casi siempre estable, con algun "fallo" de vez en cuando
      const fallo = Math.sin(t * 13) > 0.97 ? 0.35 : 0;
      lineas.material.opacity = 0.3 + 0.05 * Math.sin(t * 40) - fallo;
      cara.position.x = fallo ? 0.05 * Math.sin(t * 90) : 0;
      aro.scale.setScalar(1 + 0.04 * Math.sin(t * 3));
      renderer.render(escena, camara);
      return lienzo;
    },
  };
}

// Escultura de luz: cada punto de los trazos es una bolita que brilla. Todos los trazos van
// dentro de un grupo que gira (el "torno"). maxPuntos = MAX_PUNTOS de escultura.js.
export async function crearEscultura(ancho, alto, maxPuntos) {
  const THREE = await import(URL_THREE);
  const lienzo = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas: lienzo, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(ancho, alto, false);
  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(FOV, ancho / alto, 0.1, 100);
  camara.position.z = DISTANCIA_CAMARA;
  const altoMundo = 2 * DISTANCIA_CAMARA * Math.tan((FOV * Math.PI) / 360);
  const anchoMundo = altoMundo * (ancho / alto);

  const torno = new THREE.Group();
  escena.add(torno);
  // Suelo con una rejilla circular que gira con la escultura (asi se nota el giro)
  const suelo = new THREE.PolarGridHelper(altoMundo * 0.4, 16, 5, 64, 0x0e7490, 0x155e75);
  suelo.position.y = -altoMundo * 0.42;
  torno.add(suelo);
  // Con luz, para que los trazos parezcan tubos con volumen
  escena.add(new THREE.HemisphereLight(0xffffff, 0x1e293b, 2.2));
  const luz = new THREE.DirectionalLight(0xffffff, 1.5);
  luz.position.set(3, 5, 6);
  escena.add(luz);
  const bolitas = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshLambertMaterial(), maxPuntos);
  bolitas.count = 0;
  bolitas.frustumCulled = false;
  torno.add(bolitas);

  const matriz = new THREE.Matrix4();
  const color = new THREE.Color();
  let dibujados = 0;
  let version = -1;
  return {
    lienzo,
    anchoMundo,
    altoMundo,
    // escultura = la de escultura.js
    dibujar(escultura) {
      if (escultura.version !== version) {
        version = escultura.version;
        dibujados = 0;
      }
      // Solo anadimos los puntos nuevos (los anteriores no cambian)
      let i = 0;
      for (const trazo of escultura.trazos) {
        color.setHSL(trazo.color / 360, 0.9, 0.6);
        for (const p of trazo.puntos) {
          if (i >= dibujados && i < maxPuntos) {
            matriz.makeTranslation(p.x, p.y, p.z);
            bolitas.setMatrixAt(i, matriz);
            bolitas.setColorAt(i, color);
          }
          i++;
        }
      }
      if (i !== dibujados) {
        dibujados = Math.min(i, maxPuntos);
        bolitas.count = dibujados;
        bolitas.instanceMatrix.needsUpdate = true;
        if (bolitas.instanceColor) bolitas.instanceColor.needsUpdate = true;
      }
      torno.rotation.y = escultura.giro;
      renderer.render(escena, camara);
      return lienzo;
    },
  };
}
