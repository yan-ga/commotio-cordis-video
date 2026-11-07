// Rescuer's hands for the CPR shot in s10: two straight arms in sleeves, one hand stacked on the other with
// the fingers interlaced, the heel of the lower hand at the origin pressing towards -Y. The rescuer kneels
// on +X, so the arms rise up and back towards +X and the fingers point across the chest towards -X.
import * as L3 from './lib3d.js';
const { THREE } = L3;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// A capsule from a to b with radius r.
function limb(a, b, r, mat) {
  const d = b.clone().sub(a), len = d.length();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len), 10, 28), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
  return m;
}
function blob(pos, scale, mat, rot = [0, 0, 0]) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), mat);
  m.position.copy(pos); m.scale.set(...scale); m.rotation.set(...rot);
  return m;
}
// A finger as two jointed segments through three points.
function finger(pts, r, mat, g) {
  g.add(limb(pts[0], pts[1], r, mat), limb(pts[1], pts[2], r * 0.9, mat));
}

export function createCPRHands() {
  const g = new THREE.Group();
  const skin = L3.skinMaterial('#d39d7c');
  const sleeveMat = L3.fabricMaterial('#3c6fd0', [30, 16]);
  // Lower hand: heel on the breastbone, palm flat, fingers reaching across and lifted off the ribs.
  g.add(blob(V(-0.03, 0.045, 0), [0.17, 0.05, 0.135], skin));
  // Upper hand on its back.
  g.add(blob(V(0.0, 0.115, 0.0), [0.16, 0.055, 0.13], skin, [0, 0.1, 0.06]));
  // Interlaced fingers: lower and upper hand alternate across the width.
  for (let i = 0; i < 8; i++) {
    const z = -0.112 + i * 0.032, lower = i % 2 === 0, len = i === 0 || i === 7 ? 0.8 : 1;
    const y0 = lower ? 0.07 : 0.13;
    finger([V(-0.14, y0, z), V(-0.25 * len, lower ? 0.1 : 0.12, z * 1.05), V(-0.31 * len, lower ? 0.075 : 0.08, z * 1.08)], lower ? 0.022 : 0.023, skin, g);
  }
  // Thumbs.
  finger([V(-0.02, 0.13, 0.13), V(-0.1, 0.15, 0.17), V(-0.16, 0.15, 0.18)], 0.026, skin, g);
  finger([V(-0.02, 0.06, -0.13), V(-0.1, 0.07, -0.17), V(-0.16, 0.07, -0.18)], 0.025, skin, g);
  // Straight, locked arms up to the shoulders, out of frame above.
  const sh = [V(0.85, 2.9, -0.42), V(0.85, 2.9, 0.42)];
  const wr = [V(0.11, 0.09, -0.06), V(0.12, 0.14, 0.06)];
  for (let k = 0; k < 2; k++) {
    const elbow = wr[k].clone().lerp(sh[k], 0.48);
    g.add(limb(wr[k], elbow, 0.075, skin));
    g.add(limb(elbow, sh[k], 0.095, skin));
    // Long sleeve from a little above the wrist.
    g.add(limb(wr[k].clone().lerp(sh[k], 0.2), sh[k].clone().add(V(0.1, 0.4, 0)), 0.115, sleeveMat));
  }
  return g;
}
