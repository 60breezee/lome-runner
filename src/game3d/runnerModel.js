import * as THREE from 'three';

const COLORS = {
  skin: 0x7a4b2a,
  hair: 0x1a120d,
  jersey: 0x2f7d4f,
  band: 0xf1e3c6,
  shorts: 0xf4b400,
  shoes: 0xc62828,
  sole: 0xf1f0ea,
};

export const RUNNER_HIP_HEIGHT = 0.96;

const materials = new Map();
function material(color) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshLambertMaterial({ color, flatShading: true }));
  return materials.get(color);
}

function part(geometry, color, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, material(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

function limb(pivotX, pivotY, upper, lower, color, extras = []) {
  const pivot = new THREE.Group();
  pivot.position.set(pivotX, pivotY, 0);
  pivot.add(part(new THREE.BoxGeometry(upper.width, upper.length, upper.width), color, 0, -upper.length / 2, 0));
  const joint = new THREE.Group();
  joint.position.y = -upper.length;
  joint.add(part(new THREE.BoxGeometry(lower.width, lower.length, lower.width), color, 0, -lower.length / 2, 0));
  extras.forEach((mesh) => joint.add(mesh));
  pivot.add(joint);
  return { pivot, joint };
}

// The runner faces -z, so the camera behind it sees its back like the 2D sprite.
export function createRunnerModel() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = RUNNER_HIP_HEIGHT;
  root.add(body);

  body.add(part(new THREE.BoxGeometry(0.52, 0.24, 0.3), COLORS.shorts, 0, -0.02, 0));
  body.add(part(new THREE.BoxGeometry(0.5, 0.6, 0.28), COLORS.jersey, 0, 0.38, 0));
  body.add(part(new THREE.BoxGeometry(0.51, 0.08, 0.29), COLORS.band, 0, 0.44, 0));
  body.add(part(new THREE.BoxGeometry(0.12, 0.1, 0.12), COLORS.skin, 0, 0.72, 0));

  const head = new THREE.Group();
  head.position.y = 0.88;
  head.add(part(new THREE.IcosahedronGeometry(0.17, 1), COLORS.skin));
  const hair = part(new THREE.IcosahedronGeometry(0.18, 1), COLORS.hair, 0, 0.04, 0.02);
  hair.scale.set(1, 0.75, 1);
  head.add(hair);
  head.add(part(new THREE.BoxGeometry(0.06, 0.09, 0.05), COLORS.skin, -0.17, 0, 0));
  head.add(part(new THREE.BoxGeometry(0.06, 0.09, 0.05), COLORS.skin, 0.17, 0, 0));
  body.add(head);

  const arm = { width: 0.12, length: 0.3 };
  const forearm = { width: 0.11, length: 0.28 };
  const leftArm = limb(-0.32, 0.64, arm, forearm, COLORS.skin);
  const rightArm = limb(0.32, 0.64, arm, forearm, COLORS.skin);
  body.add(leftArm.pivot, rightArm.pivot);

  const thigh = { width: 0.17, length: 0.42 };
  const shin = { width: 0.15, length: 0.38 };
  const shoe = () => [
    part(new THREE.BoxGeometry(0.18, 0.1, 0.3), COLORS.shoes, 0, -0.4, -0.05),
    part(new THREE.BoxGeometry(0.19, 0.04, 0.31), COLORS.sole, 0, -0.46, -0.05),
  ];
  const leftLeg = limb(-0.13, -0.06, thigh, shin, COLORS.skin, shoe());
  const rightLeg = limb(0.13, -0.06, thigh, shin, COLORS.skin, shoe());
  body.add(leftLeg.pivot, rightLeg.pivot);

  return { root, body, head, leftArm, rightArm, leftLeg, rightLeg };
}

export function poseRunner(model, pose) {
  const { body, leftArm, rightArm, leftLeg, rightLeg } = model;
  body.rotation.x = pose.lean ?? 0;
  leftLeg.pivot.rotation.x = pose.leftThigh ?? 0;
  rightLeg.pivot.rotation.x = pose.rightThigh ?? 0;
  leftLeg.joint.rotation.x = pose.leftKnee ?? 0;
  rightLeg.joint.rotation.x = pose.rightKnee ?? 0;
  leftArm.pivot.rotation.x = pose.leftShoulder ?? 0;
  rightArm.pivot.rotation.x = pose.rightShoulder ?? 0;
  leftArm.joint.rotation.x = pose.leftElbow ?? 0;
  rightArm.joint.rotation.x = pose.rightElbow ?? 0;
  leftArm.pivot.rotation.z = pose.armSpread ?? 0;
  rightArm.pivot.rotation.z = -(pose.armSpread ?? 0);
}
