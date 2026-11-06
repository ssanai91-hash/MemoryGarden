import * as THREE from 'three';

// Photo-inspired black poodle. Real, articulated geometry: no photo billboard.
// One shared geometry set for every visitor; distance LOD bounds the curl cost.
let shared;
const UP = new THREE.Vector3(0, 0, 1);
function merge(parts) {
  const attributes = {};
  for (const name of ['position', 'normal', 'uv']) {
    const size = name === 'uv' ? 2 : 3;
    const length = parts.reduce((n, p) => n + p.attributes[name].array.length, 0);
    const array = new Float32Array(length);
    let offset = 0;
    for (const part of parts) { array.set(part.attributes[name].array, offset); offset += part.attributes[name].array.length; }
    attributes[name] = new THREE.BufferAttribute(array, size);
  }
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(attributes)) geometry.setAttribute(name, attribute);
  geometry.computeBoundingSphere();
  for (const part of parts) part.dispose();
  return geometry;
}
function resources() {
  if (shared) return shared;
  const sphere = new THREE.SphereGeometry(1, 20, 14).toNonIndexed();
  const curl = new THREE.TorusGeometry(1, .36, 3, 7, Math.PI * 1.8).toNonIndexed();
  const transform = new THREE.Object3D(), normal = new THREE.Vector3();
  // Shapes: centre, radii, curl count, curl radius. Fibonacci sampling is stable
  // across reloads and creates a complete coat rather than random bare patches.
  function coat(shapes, fraction) {
    const parts = [];
    for (const [centre, radii, count, radius] of shapes) {
      transform.position.fromArray(centre); transform.scale.fromArray(radii); transform.quaternion.identity(); transform.updateMatrix();
      parts.push(sphere.clone().applyMatrix4(transform.matrix));
      const n = Math.round(count * fraction);
      for (let i = 0; i < n; i++) {
        const y = 1 - 2 * (i + .5) / n, r = Math.sqrt(1 - y * y), angle = i * 2.399963229728653;
        const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
        normal.set(x / radii[0], y / radii[1], z / radii[2]).normalize();
        transform.position.set(centre[0] + x * radii[0], centre[1] + y * radii[1], centre[2] + z * radii[2]);
        transform.quaternion.setFromUnitVectors(UP, normal);
        transform.rotateZ(i * 1.71);
        const size = radius * (fraction < 1 ? 1.3 : 1) * (.88 + .24 * Math.sin(i * 12.7) ** 2);
        transform.scale.set(size, size * (.8 + .25 * Math.cos(i * 4.3) ** 2), size);
        transform.updateMatrix(); parts.push(curl.clone().applyMatrix4(transform.matrix));
      }
    }
    return merge(parts);
  }
  const shapes = {
    body: [[[0, .435, -.015], [.137, .157, .266], 620, .012], [[0, .565, .202], [.092, .13, .1], 145, .011]],
    head: [[[0, 0, 0], [.134, .13, .119], 290, .011], [[0, .086, -.015], [.136, .079, .112], 160, .011],
      [[-.149, -.036, -.022], [.052, .133, .07], 155, .010], [[.149, -.036, -.022], [.052, .133, .07], 155, .010],
      [[0, -.042, .113], [.077, .05, .07], 75, .008]],
    front: [[[0, -.137, 0], [.041, .14, .043], 130, .009], [[0, -.282, .025], [.051, .035, .068], 60, .009]],
    rear: [[[0, -.047, -.013], [.057, .09, .066], 85, .010], [[0, -.172, .006], [.038, .105, .04], 90, .009], [[0, -.282, .028], [.05, .035, .067], 60, .009]],
    tail: [[[0, .065, -.025], [.028, .077, .032], 50, .008], [[0, .143, -.048], [.047, .052, .049], 80, .009]]
  };
  const geometries = {};
  for (const [key, values] of Object.entries(shapes)) geometries[key] = [1, .3, 0].map(fraction => coat(values, fraction));
  // Dark charcoal values keep curls readable in the garden's day/night lighting.
  const color = value => new THREE.Color(value).convertSRGBToLinear();
  const fur = new THREE.MeshStandardMaterial({ color: color(0x17191d), roughness: .88 });
  const black = new THREE.MeshStandardMaterial({ color: color(0x08090b), roughness: .24 });
  const brown = new THREE.MeshStandardMaterial({ color: color(0x4c2b16), roughness: .24 });
  const pink = new THREE.MeshStandardMaterial({ color: color(0xe1819b), roughness: .62 });
  const mouth = new THREE.MeshStandardMaterial({ color: color(0x130c11), roughness: .96 });
  const silver = new THREE.MeshStandardMaterial({ color: color(0xbac1c9), metalness: .72, roughness: .3 });
  const orange = new THREE.MeshStandardMaterial({ color: color(0xe25c2f), roughness: .55 });
  const white = new THREE.MeshBasicMaterial({ color: color(0xffefe0) });
  const eye = new THREE.SphereGeometry(1, 18, 12);
  const ring = new THREE.TorusGeometry(1, .15, 5, 12);
  // Bake the complete chain into one mesh instead of one draw call per link.
  const links = [];
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    transform.position.set(Math.cos(a) * .101, .55 - Math.sin(a) * .046, .202 + Math.sin(a) * .094);
    transform.rotation.set(Math.PI / 2, i % 2 ? .85 : 0, -a);
    transform.scale.setScalar(.012); transform.updateMatrix(); links.push(ring.clone().applyMatrix4(transform.matrix));
  }
  const chain = merge(links);
  const tag = new THREE.CylinderGeometry(.018, .018, .005, 3); tag.rotateX(Math.PI / 2);
  sphere.dispose(); curl.dispose();
  shared = { geometries, fur, black, brown, pink, mouth, silver, orange, white, eye, ring, chain, tag };
  return shared;
}

export function isPhotoPoodle(spec) { return spec?.kind !== 'cat' && spec?.b === 3 && spec?.coat === 2; }

export function makeBlackPoodle({ scene, blobShadow, disableActorShadows }) {
  const R = resources(), g = new THREE.Group(), rig = new THREE.Group();
  g.name = 'photo-black-poodle'; g.add(rig);
  const lods = [];
  function fur(parent, key) {
    const lod = new THREE.LOD();
    R.geometries[key].forEach((geometry, i) => {
      const mesh = new THREE.Mesh(geometry, R.fur); mesh.receiveShadow = true;
      lod.addLevel(mesh, [0, 7, 19][i], .12);
    });
    parent.add(lod); lods.push(lod); return lod;
  }
  function mesh(parent, geometry, material, position, scale) {
    const object = new THREE.Mesh(geometry, material); object.position.fromArray(position);
    if (scale) object.scale.fromArray(scale); parent.add(object); return object;
  }
  fur(rig, 'body');
  const head = new THREE.Group(); head.position.set(0, .676, .286); rig.add(head); fur(head, 'head');
  mesh(head, R.eye, R.mouth, [0, -.088, .134], [.063, .042, .035]);
  const tongue = mesh(head, R.eye, R.pink, [0, -.116, .16], [.032, .038, .009]); tongue.rotation.x = -.3;
  mesh(head, R.eye, R.black, [0, -.027, .185], [.043, .03, .027]);
  const eyes = [];
  for (const side of [-1, 1]) {
    const socket = new THREE.Group(); socket.position.set(side * .06, .025, .106); head.add(socket); eyes.push(socket);
    mesh(socket, R.eye, R.black, [0, 0, 0], [.03, .034, .021]);
    mesh(socket, R.eye, R.brown, [0, 0, .017], [.022, .027, .01]);
    mesh(socket, R.eye, R.black, [0, 0, .024], [.013, .022, .006]);
    mesh(socket, R.eye, R.white, [-.007, .011, .029], [.005, .006, .002]);
  }
  const legs = [];
  for (const [side, front] of [[-1, true], [1, true], [-1, false], [1, false]]) {
    const leg = new THREE.Group(); leg.position.set(side * .089, .32, front ? .172 : -.186);
    rig.add(leg); fur(leg, front ? 'front' : 'rear'); legs.push(leg);
  }
  const tail = new THREE.Group(); tail.position.set(0, .52, -.258); rig.add(tail); fur(tail, 'tail');
  mesh(rig, R.chain, R.silver, [0, 0, 0]);
  mesh(rig, R.ring, R.silver, [0, .478, .302], [.023, .028, .018]);
  mesh(rig, R.tag, R.silver, [0, .441, .308]);
  mesh(rig, R.tag, R.orange, [0, .441, .311], [.61, .61, .61]);
  if (blobShadow) g.add(blobShadow(.34));
  disableActorShadows?.(g); scene.add(g);
  // Mesh geometry/materials are shared. LOD objects are per-pet; release renderer
  // references on replacement without disposing resources used by other dogs.
  function dispose() { g.removeFromParent(); for (const lod of lods) lod.clear(); g.clear(); }
  function updateDetail(camera, time) {
    // LOD switches automatically in the renderer; no per-frame geometry work.
    const blink = time % 5.8 > 5.64 ? .12 : 1;
    for (const eye of eyes) eye.scale.y = blink;
    tongue.rotation.x = -.3 + Math.sin(time * 3.1) * .045;
  }
  return { g, rig, head, legs, tail, eyes, walk: 0, B: { leg: .3, len: .52 }, photoPoodle: true, updateDetail, dispose };
}
