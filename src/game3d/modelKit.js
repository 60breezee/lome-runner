import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Every model is merged into one vertex-coloured geometry: one draw call per object keeps phones smooth.
export const flatMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
export const coinMaterial = new THREE.MeshLambertMaterial({
  vertexColors: true,
  flatShading: true,
  emissive: 0x4a3300,
});
export const farMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });

const C = {
  yellow: 0xf4b400,
  yellowDark: 0xd99a00,
  red: 0xc62828,
  brick: 0xb3261e,
  tail: 0xff3b30,
  green: 0x2f7d4f,
  greenDark: 0x246340,
  blue: 0x1e6fa8,
  blueDark: 0x185a8a,
  cream: 0xf1e3c6,
  white: 0xf1f0ea,
  glass: 0x26323c,
  tyre: 0x151515,
  dark: 0x2e2e2e,
  grey: 0x9e9e9e,
  skin: 0x7a4b2a,
  wood: 0x8d5a33,
  woodLight: 0xa86b3c,
  orange: 0xf57c00,
  navy: 0x2b3a55,
  laterite: 0xb5532f,
  ochre: 0xe8c86a,
  tin: 0x9aa6ae,
  trunk: 0x6b4a2b,
  leaf: 0x2f7d4f,
  leafDark: 0x246340,
  sand: 0xd9b77a,
};

const tmpColor = new THREE.Color();
const tmpMatrix = new THREE.Matrix4();
const tmpQuaternion = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpPosition = new THREE.Vector3();
const tmpScale = new THREE.Vector3();

class Kit {
  constructor() {
    this.parts = [];
  }

  add(geometry, color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
    const part = geometry.index ? geometry.toNonIndexed() : geometry;
    geometry.dispose();
    part.deleteAttribute('uv');
    tmpMatrix.compose(
      tmpPosition.set(x, y, z),
      tmpQuaternion.setFromEuler(tmpEuler.set(rx, ry, rz)),
      tmpScale.set(sx, sy, sz),
    );
    part.applyMatrix4(tmpMatrix);
    tmpColor.set(color);
    const colors = new Float32Array(part.attributes.position.count * 3);
    for (let index = 0; index < colors.length; index += 3) {
      colors[index] = tmpColor.r;
      colors[index + 1] = tmpColor.g;
      colors[index + 2] = tmpColor.b;
    }
    part.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push(part);
    return this;
  }

  box(width, height, depth, color, transform) {
    return this.add(new THREE.BoxGeometry(width, height, depth), color, transform);
  }

  cylinder(radiusTop, radiusBottom, height, segments, color, transform) {
    return this.add(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), color, transform);
  }

  cone(radius, height, segments, color, transform) {
    return this.add(new THREE.ConeGeometry(radius, height, segments), color, transform);
  }

  ball(radius, color, transform, detail = 0) {
    return this.add(new THREE.IcosahedronGeometry(radius, detail), color, transform);
  }

  wheel(x, z, radius = 0.33, width = 0.26) {
    this.cylinder(radius, radius, width, 10, C.tyre, { x, y: radius, z, rz: Math.PI / 2 });
    return this.cylinder(radius * 0.5, radius * 0.5, width + 0.02, 8, C.grey, { x, y: radius, z, rz: Math.PI / 2 });
  }

  build() {
    const geometry = mergeGeometries(this.parts);
    this.parts.forEach((part) => part.dispose());
    geometry.computeBoundingSphere();
    return geometry;
  }
}

// Vehicles are seen from behind: their rear faces +z, towards the camera.
function car(kit, body, bodyDark, { length = 3.6, cabinHeight = 0.5, cabinLength = 1.9 } = {}) {
  const rear = length / 2;
  [-0.78, 0.78].forEach((x) => [-length * 0.32, length * 0.32].forEach((z) => kit.wheel(x, z)));
  kit.box(1.7, 0.6, length, body, { y: 0.56 });
  kit.box(1.72, 0.14, length + 0.02, bodyDark, { y: 0.32 });
  kit.box(1.46, cabinHeight, cabinLength, C.glass, { y: 0.86 + cabinHeight / 2, z: 0.1 });
  kit.box(1.5, 0.08, cabinLength + 0.05, body, { y: 0.9 + cabinHeight, z: 0.1 });
  kit.box(0.08, cabinHeight, 0.08, body, { x: -0.7, y: 0.86 + cabinHeight / 2, z: 0.1 + cabinLength / 2 });
  kit.box(0.08, cabinHeight, 0.08, body, { x: 0.7, y: 0.86 + cabinHeight / 2, z: 0.1 + cabinLength / 2 });
  kit.box(0.34, 0.16, 0.05, C.tail, { x: -0.62, y: 0.68, z: rear + 0.01 });
  kit.box(0.34, 0.16, 0.05, C.tail, { x: 0.62, y: 0.68, z: rear + 0.01 });
  kit.box(0.44, 0.14, 0.04, 0xf5f5f5, { y: 0.5, z: rear + 0.02 });
  kit.box(1.76, 0.16, 0.14, C.dark, { y: 0.3, z: rear });
  return kit;
}

const builders = {
  taxi() {
    const kit = car(new Kit(), C.yellow, C.yellowDark);
    kit.box(0.5, 0.18, 0.26, C.green, { y: 1.54, z: 0.1 });
    return kit.build();
  },

  sedan() {
    const kit = car(new Kit(), C.blue, C.blueDark, { length: 3.8, cabinHeight: 0.44, cabinLength: 1.8 });
    kit.box(1.2, 0.04, 0.05, 0xd9d9d9, { y: 0.82, z: 1.91 });
    return kit.build();
  },

  minibus() {
    const kit = new Kit();
    [-0.8, 0.8].forEach((x) => [-1.4, 1.4].forEach((z) => kit.wheel(x, z, 0.36)));
    kit.box(1.8, 1.55, 4.4, C.white, { y: 1.08 });
    kit.box(1.82, 0.5, 3.4, C.glass, { y: 1.48, z: -0.3 });
    kit.box(1.5, 0.55, 0.05, C.glass, { y: 1.45, z: 2.21 });
    kit.box(1.83, 0.1, 4.42, C.green, { y: 0.92 });
    kit.box(1.83, 0.1, 4.42, C.yellow, { y: 0.82 });
    kit.box(1.83, 0.1, 4.42, C.red, { y: 0.72 });
    kit.box(1.6, 0.06, 3.2, 0x555555, { y: 1.9, z: -0.2 });
    kit.box(0.6, 0.35, 0.8, C.blue, { x: -0.45, y: 2.1, z: -1.1 });
    kit.box(0.7, 0.45, 0.9, C.red, { x: 0.2, y: 2.15, z: 0.1 });
    kit.box(0.55, 0.3, 0.7, C.yellow, { x: -0.4, y: 2.08, z: 1.0 });
    kit.ball(0.32, 0xe9dfc8, { x: 0.55, y: 2.15, z: -1.0, sy: 0.7 });
    kit.box(0.06, 1.3, 0.06, C.grey, { x: 0.62, y: 1.25, z: 2.23 });
    kit.box(0.06, 1.3, 0.06, C.grey, { x: 0.8, y: 1.25, z: 2.23 });
    for (let y = 0.75; y < 1.9; y += 0.22) kit.box(0.2, 0.04, 0.04, C.grey, { x: 0.71, y, z: 2.23 });
    kit.box(0.2, 0.4, 0.05, C.tail, { x: -0.72, y: 0.9, z: 2.21 });
    kit.box(0.2, 0.4, 0.05, C.tail, { x: 0.45, y: 0.9, z: 2.21 });
    kit.box(0.44, 0.14, 0.04, 0xf5f5f5, { y: 0.55, z: 2.22 });
    kit.box(1.84, 0.18, 0.14, C.dark, { y: 0.36, z: 2.2 });
    return kit.build();
  },

  pickup() {
    const kit = new Kit();
    [-0.8, 0.8].forEach((x) => [-1.3, 1.3].forEach((z) => kit.wheel(x, z, 0.35)));
    kit.box(1.75, 0.55, 4.2, C.white, { y: 0.6 });
    kit.box(1.7, 0.8, 1.6, C.white, { y: 1.25, z: -1.2 });
    kit.box(1.5, 0.4, 0.05, C.glass, { y: 1.35, z: -0.39 });
    kit.box(1.72, 0.36, 1.2, C.glass, { y: 1.35, z: -1.3 });
    kit.box(0.08, 0.42, 2.4, 0xdad5c9, { x: -0.84, y: 1.08, z: 0.85 });
    kit.box(0.08, 0.42, 2.4, 0xdad5c9, { x: 0.84, y: 1.08, z: 0.85 });
    kit.box(1.76, 0.42, 0.08, 0xdad5c9, { y: 1.08, z: 2.06 });
    kit.ball(0.45, 0xe9dfc8, { x: -0.4, y: 1.15, z: 0.4, sy: 0.65 });
    kit.ball(0.45, 0xd8c9a4, { x: 0.4, y: 1.18, z: 0.5, sy: 0.7 });
    kit.ball(0.42, 0xe9dfc8, { x: 0, y: 1.15, z: 1.4, sy: 0.65 });
    kit.ball(0.4, 0xd8c9a4, { x: 0.1, y: 1.6, z: 0.8, sy: 0.65 });
    kit.box(0.5, 0.12, 0.14, 0xf4d03f, { x: -0.4, y: 1.55, z: 1.3, ry: 0.4 });
    kit.box(0.5, 0.12, 0.14, 0x7cb342, { x: 0.5, y: 1.5, z: 1.5, ry: -0.3 });
    kit.box(0.14, 0.3, 0.05, C.tail, { x: -0.8, y: 1.0, z: 2.11 });
    kit.box(0.14, 0.3, 0.05, C.tail, { x: 0.8, y: 1.0, z: 2.11 });
    kit.box(0.44, 0.14, 0.04, 0xf5f5f5, { y: 0.55, z: 2.12 });
    kit.box(1.78, 0.16, 0.14, C.dark, { y: 0.34, z: 2.1 });
    return kit.build();
  },

  tricycle() {
    const kit = new Kit();
    kit.wheel(-0.72, 0.55, 0.32);
    kit.wheel(0.72, 0.55, 0.32);
    kit.wheel(0, -1.35, 0.3, 0.14);
    kit.box(1.5, 0.7, 1.6, C.green, { y: 0.85, z: 0.55 });
    kit.box(1.54, 0.08, 1.64, C.greenDark, { y: 1.22, z: 0.55 });
    for (let x = -0.45; x <= 0.46; x += 0.45) {
      for (let z = 0.15; z <= 0.96; z += 0.4) {
        kit.box(0.36, 0.46, 0.28, (x + z) % 0.9 < 0.4 ? C.yellow : C.yellowDark, { x, y: 1.49, z });
        kit.box(0.1, 0.08, 0.1, C.yellowDark, { x: x + 0.08, y: 1.76, z });
      }
    }
    kit.box(0.26, 0.12, 0.05, C.tail, { x: -0.55, y: 0.6, z: 1.36 });
    kit.box(0.26, 0.12, 0.05, C.tail, { x: 0.55, y: 0.6, z: 1.36 });
    kit.box(0.4, 0.12, 0.04, 0xf5f5f5, { y: 0.66, z: 1.37 });
    kit.box(0.4, 0.4, 1.2, C.red, { y: 0.62, z: -0.75 });
    kit.box(0.42, 0.56, 0.3, C.blue, { y: 1.28, z: -0.62 });
    kit.ball(0.17, C.skin, { y: 1.72, z: -0.64 }, 1);
    kit.ball(0.18, C.green, { y: 1.78, z: -0.64, sy: 0.6 }, 1);
    kit.box(0.8, 0.05, 0.05, 0x222222, { y: 1.12, z: -1.1 });
    return kit.build();
  },

  zemidjan() {
    const kit = new Kit();
    kit.cylinder(0.32, 0.32, 0.14, 10, C.tyre, { y: 0.32, z: 0.7, rz: Math.PI / 2 });
    kit.cylinder(0.32, 0.32, 0.14, 10, C.tyre, { y: 0.32, z: -0.7, rz: Math.PI / 2 });
    kit.box(0.34, 0.36, 1.1, C.red, { y: 0.66 });
    kit.box(0.36, 0.1, 0.6, 0x1b1b1b, { y: 0.88, z: 0.2 });
    kit.box(0.26, 0.1, 0.4, C.red, { y: 0.66, z: 0.72 });
    kit.box(0.18, 0.08, 0.04, C.tail, { y: 0.74, z: 0.93 });
    kit.box(0.22, 0.1, 0.03, 0xf5f5f5, { y: 0.6, z: 0.93 });
    kit.cylinder(0.05, 0.05, 0.6, 6, C.grey, { x: 0.22, y: 0.45, z: 0.35, rx: Math.PI / 2 });
    kit.box(0.82, 0.05, 0.05, 0x222222, { y: 1.12, z: -0.55 });
    kit.box(0.16, 0.5, 0.18, C.navy, { x: -0.2, y: 0.78, z: 0.1, rx: 0.4 });
    kit.box(0.16, 0.5, 0.18, C.navy, { x: 0.2, y: 0.78, z: 0.1, rx: 0.4 });
    kit.box(0.5, 0.6, 0.32, C.yellow, { y: 1.28, z: 0.15 });
    kit.box(0.26, 0.2, 0.02, C.green, { y: 1.3, z: 0.32 });
    kit.box(0.12, 0.42, 0.12, C.yellow, { x: -0.3, y: 1.22, z: -0.2, rx: -0.9 });
    kit.box(0.12, 0.42, 0.12, C.yellow, { x: 0.3, y: 1.22, z: -0.2, rx: -0.9 });
    kit.ball(0.16, C.skin, { y: 1.72, z: 0.12 }, 1);
    kit.ball(0.19, 0x222222, { y: 1.78, z: 0.12, sy: 0.85 }, 1);
    return kit.build();
  },

  market() {
    const kit = new Kit();
    [-0.85, 0.85].forEach((x) =>
      [-0.6, 0.6].forEach((z) => kit.box(0.08, 1.9, 0.08, 0x5a4636, { x, y: 0.95, z })),
    );
    kit.box(1.75, 0.08, 1.1, C.woodLight, { y: 0.85 });
    kit.box(1.7, 0.5, 0.06, C.wood, { y: 0.58, z: 0.52 });
    kit.box(0.5, 0.35, 0.4, 0xc08a4e, { x: -0.5, y: 0.18, z: 0.2 });
    const produce = [C.orange, 0xe53935, 0x7cb342];
    produce.forEach((color, column) => {
      const x = -0.55 + column * 0.55;
      [
        [-0.12, 0.98, 0.1],
        [0.12, 0.98, 0.1],
        [0, 0.98, -0.12],
        [0, 1.15, 0],
      ].forEach(([dx, y, dz]) => kit.ball(0.12, color, { x: x + dx, y, z: dz }));
    });
    const stripes = [C.red, C.yellow, C.green, C.blue, C.yellow, C.red];
    stripes.forEach((color, index) => {
      kit.box(0.32, 0.07, 1.5, color, { x: -0.8 + index * 0.32, y: 1.92 });
      kit.box(0.32, 0.2, 0.04, color, { x: -0.8 + index * 0.32, y: 1.8, z: 0.75 });
    });
    return kit.build();
  },

  worksite() {
    const kit = new Kit();
    kit.cone(0.55, 0.32, 8, C.sand, { z: -0.35, y: 0.16 });
    [-0.72, 0.72].forEach((x) => {
      kit.box(0.5, 0.06, 0.5, 0xc85a00, { x, y: 0.03 });
      kit.cone(0.22, 0.72, 10, C.orange, { x, y: 0.42 });
      kit.cylinder(0.13, 0.16, 0.12, 10, 0xf5f5f5, { x, y: 0.38 });
      kit.cylinder(0.07, 0.09, 0.08, 10, 0xf5f5f5, { x, y: 0.62 });
    });
    kit.box(0.06, 0.6, 0.06, 0x5a4636, { x: -0.5, y: 0.3, z: 0.05 });
    kit.box(0.06, 0.6, 0.06, 0x5a4636, { x: 0.5, y: 0.3, z: 0.05 });
    kit.box(1.2, 0.2, 0.06, 0xf5f5f5, { y: 0.62, z: 0.08 });
    for (let x = -0.45; x <= 0.46; x += 0.3) kit.box(0.12, 0.2, 0.065, 0xe53935, { x, y: 0.62, z: 0.08 });
    kit.ball(0.07, 0xffb300, { x: -0.5, y: 0.78, z: 0.08 });
    kit.ball(0.07, 0xffb300, { x: 0.5, y: 0.78, z: 0.08 });
    return kit.build();
  },

  gate() {
    const kit = new Kit();
    [-0.92, 0.92].forEach((x) => {
      kit.box(0.16, 2.1, 0.16, C.yellow, { x, y: 1.05 });
      for (let y = 0.15; y < 1.5; y += 0.3) kit.box(0.17, 0.12, 0.17, 0x181614, { x, y });
      kit.ball(0.08, C.tail, { x, y: 2.16 });
    });
    kit.box(2.0, 0.42, 0.12, C.cream, { y: 1.76 });
    for (let x = -0.7; x <= 0.71; x += 0.47) kit.box(0.24, 0.42, 0.13, C.red, { x, y: 1.76 });
    return kit.build();
  },

  coin() {
    const kit = new Kit();
    kit.cylinder(0.3, 0.3, 0.08, 14, 0xd99a00, { rx: Math.PI / 2 });
    kit.cylinder(0.22, 0.22, 0.1, 14, C.yellow, { rx: Math.PI / 2 });
    return kit.build();
  },

  // Houses face +x: the left side of the road uses them as is, the right side is rotated by π.
  house() {
    const kit = new Kit();
    kit.box(3, 2.4, 3, C.ochre, { y: 1.2 });
    kit.box(3.02, 0.35, 3.02, C.laterite, { y: 0.18 });
    kit.box(3.5, 0.1, 3.5, C.tin, { y: 2.5, rz: 0.06 });
    kit.box(0.05, 1.1, 0.6, C.skin, { x: 1.51, y: 0.55, z: 0.5 });
    [-0.7].forEach((z) => {
      kit.box(0.05, 0.6, 0.6, C.glass, { x: 1.51, y: 1.4, z });
      kit.box(0.06, 0.6, 0.18, C.blue, { x: 1.51, y: 1.4, z: z - 0.39 });
      kit.box(0.06, 0.6, 0.18, C.blue, { x: 1.51, y: 1.4, z: z + 0.39 });
    });
    kit.box(0.6, 0.6, 0.05, C.glass, { x: 0.5, y: 1.4, z: 1.51 });
    kit.box(0.18, 0.6, 0.06, C.blue, { x: 0.11, y: 1.4, z: 1.51 });
    kit.box(0.18, 0.6, 0.06, C.blue, { x: 0.89, y: 1.4, z: 1.51 });
    return kit.build();
  },

  shop() {
    const kit = new Kit();
    kit.box(3, 2.6, 3, C.cream, { y: 1.3 });
    kit.box(3.02, 0.35, 3.02, C.green, { y: 0.18 });
    kit.box(0.08, 0.6, 2.8, C.brick, { x: 1.54, y: 2.35 });
    kit.box(0.09, 0.12, 2.0, C.cream, { x: 1.55, y: 2.35 });
    kit.box(0.9, 0.06, 2.8, C.yellow, { x: 1.9, y: 1.85, rz: -0.3 });
    kit.box(0.05, 1.4, 2.2, 0x3a2a1e, { x: 1.51, y: 1.0 });
    [0.6, 1.1].forEach((y) => kit.box(0.3, 0.05, 2.1, C.wood, { x: 1.6, y }));
    [C.red, C.blue, C.yellow, 0x7cb342, C.orange].forEach((color, index) => {
      kit.box(0.2, 0.2, 0.25, color, { x: 1.62, y: 0.73, z: -0.8 + index * 0.4 });
      kit.box(0.2, 0.2, 0.25, color, { x: 1.62, y: 1.23, z: -0.6 + index * 0.35 });
    });
    kit.box(3.1, 0.12, 3.1, C.tin, { y: 2.66 });
    return kit.build();
  },

  palm() {
    const kit = new Kit();
    let x = 0;
    let y = 0;
    for (let index = 0; index < 5; index += 1) {
      const lean = 0.06 + index * 0.025;
      kit.cylinder(0.13, 0.16, 0.9, 7, index % 2 ? C.trunk : 0x5c3f24, { x: x + lean * 0.45, y: y + 0.45, rz: -lean });
      x += Math.sin(lean) * 0.9;
      y += Math.cos(lean) * 0.88;
    }
    const crown = new THREE.Vector3(x, y, 0);
    const leafCount = 8;
    for (let index = 0; index < leafCount; index += 1) {
      const angle = (index / leafCount) * Math.PI * 2;
      const droop = index % 2 ? -0.55 : -0.35;
      const length = index % 2 ? 1.8 : 2.1;
      const euler = new THREE.Euler(0, angle, droop);
      const center = new THREE.Vector3(length / 2, 0, 0).applyEuler(euler).add(crown);
      kit.box(length, 0.05, 0.42, index % 2 ? C.leafDark : C.leaf, {
        x: center.x,
        y: center.y,
        z: center.z,
        ry: angle,
        rz: droop,
      });
    }
    [
      [0.12, -0.15, 0.1],
      [-0.1, -0.18, 0.05],
      [0, -0.16, -0.12],
    ].forEach(([dx, dy, dz]) => kit.ball(0.13, 0x7a5a2a, { x: x + dx, y: y + dy, z: dz }));
    return kit.build();
  },

  skyline() {
    const kit = new Kit();
    const buildings = [
      [-46, 9, 8, 0xb7c6cf],
      [-36, 7, 13, 0xe9d49a],
      [-27, 9, 10, 0xc98a6a],
      [-12, 7, 8, 0xe9d49a],
      [10, 7, 11, 0xc98a6a],
      [19, 9, 15, 0xb7c6cf],
      [29, 8, 9, 0xe9d49a],
      [40, 13, 12, 0xa9b4bb],
    ];
    buildings.forEach(([x, width, height, color]) => {
      kit.box(width, height, 4, color, { x, y: height / 2 });
      for (let row = 1.6; row < height - 0.8; row += 1.9) {
        kit.box(width * 0.8, 0.5, 4.05, 0x8c9ca6, { x, y: row });
      }
    });
    kit.box(5, 26, 5, 0xa9b4bb, { x: -19, y: 13 });
    kit.box(6.2, 1.4, 6.2, 0xc5d0d6, { x: -19, y: 26.5 });
    kit.box(0.3, 4, 0.3, 0x8c9ca6, { x: -19, y: 29 });
    for (let row = 1.5; row < 25; row += 1.4) kit.box(4.2, 0.4, 5.05, 0xd6eef4, { x: -19, y: row });
    return kit.build();
  },
};

const cache = new Map();

export function getModelGeometry(key) {
  if (!cache.has(key)) cache.set(key, builders[key]());
  return cache.get(key);
}

export function disposeModelCache() {
  cache.forEach((geometry) => geometry.dispose());
  cache.clear();
}

export { C as MODEL_COLORS };
