import * as THREE from 'three';

export type ObstacleKind =
  | 'wall-concrete'
  | 'wall-brick'
  | 'wall-wood'
  | 'wall-low'
  | 'wall-moving'
  | 'wall-breakable'
  | 'barrier'
  | 'crate'
  | 'water-container'
  | 'scooter'
  | 'motorcycle'
  | 'auto-rickshaw'
  | 'bicycle'
  | 'vegetable-cart';

export type ObstacleVisual =
  | 'floating-log'
  | 'submerged-rock'
  | 'rusty-barrel'
  | 'tangled-debris';

export const OBSTACLE_VISUAL_BY_KIND: Record<ObstacleKind, ObstacleVisual> = {
  'wall-concrete': 'floating-log',
  'wall-brick': 'submerged-rock',
  'wall-wood': 'tangled-debris',
  'wall-low': 'submerged-rock',
  'wall-moving': 'rusty-barrel',
  'wall-breakable': 'tangled-debris',
  barrier: 'floating-log',
  crate: 'submerged-rock',
  'water-container': 'rusty-barrel',
  scooter: 'submerged-rock',
  motorcycle: 'rusty-barrel',
  'auto-rickshaw': 'tangled-debris',
  bicycle: 'submerged-rock',
  'vegetable-cart': 'tangled-debris',
};

export const OBSTACLE_HALF_EXTENTS: Record<ObstacleKind, THREE.Vector3> = {
  'wall-concrete': new THREE.Vector3(1.02, 0.38, 0.38),
  'wall-brick': new THREE.Vector3(0.9, 0.52, 0.68),
  'wall-wood': new THREE.Vector3(0.92, 0.46, 0.7),
  'wall-low': new THREE.Vector3(0.9, 0.4, 0.66),
  'wall-moving': new THREE.Vector3(0.95, 0.42, 0.48),
  'wall-breakable': new THREE.Vector3(0.94, 0.5, 0.72),
  barrier: new THREE.Vector3(0.82, 0.34, 0.36),
  crate: new THREE.Vector3(1.0, 0.62, 0.75),
  'water-container': new THREE.Vector3(0.86, 0.42, 0.46),
  scooter: new THREE.Vector3(1.0, 0.62, 0.75),
  motorcycle: new THREE.Vector3(0.86, 0.42, 0.46),
  'auto-rickshaw': new THREE.Vector3(0.94, 0.5, 0.72),
  bicycle: new THREE.Vector3(1.0, 0.62, 0.75),
  'vegetable-cart': new THREE.Vector3(0.94, 0.5, 0.72),
};

const M = {
  driftwood: new THREE.MeshStandardMaterial({
    color: 0x9a7045,
    roughness: 0.94,
    vertexColors: true,
  }),
  woodLight: new THREE.MeshStandardMaterial({ color: 0xc49b68, roughness: 0.91 }),
  barkGroove: new THREE.MeshStandardMaterial({ color: 0x523a28, roughness: 0.98 }),
  rock: new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.95,
  }),
  rustyMetal: new THREE.MeshStandardMaterial({
    color: 0xb86a42,
    metalness: 0.34,
    roughness: 0.76,
  }),
  barrelRim: new THREE.MeshStandardMaterial({
    color: 0x5d6663,
    metalness: 0.72,
    roughness: 0.5,
  }),
  plastic: new THREE.MeshStandardMaterial({
    color: 0x846c9e,
    roughness: 0.72,
    side: THREE.DoubleSide,
  }),
  tealPlastic: new THREE.MeshStandardMaterial({
    color: 0x438f85,
    roughness: 0.7,
  }),
  rope: new THREE.MeshStandardMaterial({ color: 0x594a38, roughness: 0.96 }),
  net: new THREE.LineBasicMaterial({ color: 0x574b3f }),
  water: new THREE.MeshBasicMaterial({
    color: 0xd5fff0,
    transparent: true,
    opacity: 0.31,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
};

export const OBSTACLE_MATERIALS: THREE.Material[] = Object.values(M);

function makeLogGeometry(length: number, radius: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const rings = 20;
  const segments = 12;
  const bark = new THREE.Color(0xffffff);
  for (let ring = 0; ring <= rings; ring += 1) {
    const along = ring / rings;
    const x = (along - 0.5) * length;
    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      const grain = 0.92 +
        Math.sin(along * 88 + Math.sin(angle * 5) * 2) * 0.035 +
        Math.cos(angle * 9) * 0.025;
      const radial = radius * grain;
      positions.push(x, Math.cos(angle) * radial, Math.sin(angle) * radial);
      const shade = 0.83 + Math.sin(along * 24 + segment * 0.8) * 0.11;
      const color = bark.clone().multiplyScalar(shade);
      colors.push(color.r, color.g, color.b);
    }
  }
  const rowLength = segments + 1;
  for (let ring = 0; ring < rings; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const a = ring * rowLength + segment;
      const b = a + rowLength;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addLog(
  group: THREE.Group,
  length: number,
  radius: number,
  x = 0,
  z = 0,
): void {
  const log = new THREE.Mesh(makeLogGeometry(length, radius), M.driftwood);
  log.position.set(x, radius * 0.76, z);
  log.castShadow = true;
  log.receiveShadow = true;
  group.add(log);

  for (let groove = 0; groove < 5; groove += 1) {
    const angle = (groove / 5) * Math.PI * 2;
    const points: THREE.Vector3[] = [];
    for (let segment = 0; segment <= 6; segment += 1) {
      const along = segment / 6;
      const wave = angle + Math.sin(along * 7 + groove) * 0.045;
      points.push(
        new THREE.Vector3(
          x + (along - 0.5) * length,
          radius * 0.76 + Math.cos(wave) * radius * 0.94,
          z + Math.sin(wave) * radius * 0.94,
        ),
      );
    }
    const barkSeam = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        18,
        Math.max(0.009, radius * 0.045),
        4,
        false,
      ),
      M.barkGroove,
    );
    group.add(barkSeam);
  }

  for (const [along, angle] of [[-0.22, 1.1], [0.2, 4.2]] as const) {
    const knot = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.12, 8, 6),
      M.barkGroove,
    );
    knot.scale.set(1.5, 0.75, 0.5);
    knot.position.set(
      x + along * length,
      radius * 0.76 + Math.cos(angle) * radius * 0.93,
      z + Math.sin(angle) * radius * 0.93,
    );
    group.add(knot);
  }

  const endGrain = new THREE.CircleGeometry(radius * 0.76, 12);
  const endMaterial = M.woodLight;
  for (const side of [-1, 1]) {
    const end = new THREE.Mesh(endGrain, endMaterial);
    end.position.set(x + side * length * 0.5, radius * 0.76, z);
    end.rotation.y = side < 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(end);
    for (const ringRadius of [0.3, 0.49, 0.66]) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius * ringRadius, 0.009, 4, 12),
        M.barkGroove,
      );
      ring.position.copy(end.position);
      ring.rotation.copy(end.rotation);
      group.add(ring);
    }
  }
}

function buildLog(length = 2.12, radius = 0.22): THREE.Group {
  const group = new THREE.Group();
  addLog(group, length, radius);
  return group;
}

function makeRockGeometry(radius: number, seed: number): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(radius, 1);
  const positions = geometry.getAttribute('position');
  const colors: number[] = [];
  const stone = new THREE.Color(0x92978b);
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const variation = 0.86 + Math.sin(x * 13 + seed) * 0.06 +
      Math.cos(z * 17 - seed * 0.8) * 0.055;
    positions.setXYZ(
      index,
      x * variation * 1.12,
      y * (0.72 + Math.sin(seed + x * 7) * 0.08),
      z * variation,
    );
    const color = stone.clone().lerp(
      new THREE.Color(0xaba58e),
      THREE.MathUtils.clamp((y + 0.25) * 0.22, 0, 0.38),
    );
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function addRock(
  group: THREE.Group,
  radius: number,
  x: number,
  z: number,
  seed: number,
  scale = 1,
): void {
  const rock = new THREE.Mesh(makeRockGeometry(radius, seed), M.rock);
  rock.scale.set(scale, scale, scale);
  rock.position.set(x, radius * 0.68, z);
  rock.rotation.set(seed * 0.13, seed * 0.22, seed * 0.17);
  rock.castShadow = true;
  rock.receiveShadow = true;
  group.add(rock);
}

function buildRockCluster(): THREE.Group {
  const group = new THREE.Group();
  addRock(group, 0.43, -0.48, 0.02, 2.2, 0.84);
  addRock(group, 0.5, 0.02, -0.04, 4.7, 0.9);
  addRock(group, 0.38, 0.51, 0.09, 7.1, 0.88);
  addRock(group, 0.22, -0.18, 0.36, 8.6, 0.72);
  return group;
}

function buildLargeRock(): THREE.Group {
  const group = new THREE.Group();
  addRock(group, 0.62, -0.28, 0.02, 3.4, 1.08);
  addRock(group, 0.52, 0.34, -0.04, 6.1, 0.96);
  addRock(group, 0.3, 0.1, 0.43, 8.2, 0.84);
  return group;
}

function makeBarrelGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0.25, -0.34),
    new THREE.Vector2(0.31, -0.3),
    new THREE.Vector2(0.35, -0.16),
    new THREE.Vector2(0.36, 0),
    new THREE.Vector2(0.35, 0.16),
    new THREE.Vector2(0.31, 0.3),
    new THREE.Vector2(0.25, 0.34),
  ];
  return new THREE.LatheGeometry(profile, 18);
}

function addBarrel(group: THREE.Group, x: number, z: number, yaw: number): void {
  const barrel = new THREE.Group();
  barrel.position.set(x, 0.31, z);
  barrel.rotation.y = yaw;
  const body = new THREE.Mesh(makeBarrelGeometry(), M.rustyMetal);
  body.rotation.z = Math.PI / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  barrel.add(body);

  const bands = [-0.19, 0.19];
  for (const position of bands) {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.33, 0.025, 5, 16),
      M.barrelRim,
    );
    band.rotation.y = Math.PI / 2;
    band.position.x = position;
    barrel.add(band);
  }

  for (const side of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.27, 16), M.barrelRim);
    cap.position.x = side * 0.34;
    cap.rotation.y = side * Math.PI / 2;
    barrel.add(cap);
  }

  const plug = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 0.035, 8),
    M.barrelRim,
  );
  plug.position.set(0.1, 0.24, 0.06);
  plug.rotation.z = Math.PI / 2;
  barrel.add(plug);
  group.add(barrel);
}

function buildBarrelRow(): THREE.Group {
  const group = new THREE.Group();
  addBarrel(group, 0, 0, 0.08);
  return group;
}

function buildDebris(): THREE.Group {
  const group = new THREE.Group();
  addLog(group, 1.4, 0.12, -0.12, 0.18);
  addLog(group, 0.94, 0.075, 0.16, -0.22);

  const ropePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.74, 0.2, -0.34),
    new THREE.Vector3(-0.44, 0.3, 0.24),
    new THREE.Vector3(0.02, 0.2, -0.28),
    new THREE.Vector3(0.42, 0.28, 0.3),
    new THREE.Vector3(0.7, 0.19, -0.18),
  ]);
  group.add(
    new THREE.Mesh(new THREE.TubeGeometry(ropePath, 20, 0.024, 5, false), M.rope),
  );

  const linePositions: number[] = [];
  for (let column = 0; column <= 6; column += 1) {
    const x = -0.48 + column * 0.16;
    linePositions.push(x, 0.16, -0.24, x + Math.sin(column) * 0.12, 0.13, 0.25);
  }
  for (let row = 0; row <= 4; row += 1) {
    const z = -0.24 + row * 0.12;
    linePositions.push(-0.48, 0.15, z, 0.48, 0.15, z + Math.cos(row) * 0.08);
  }
  const netGeometry = new THREE.BufferGeometry();
  netGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(linePositions, 3),
  );
  group.add(new THREE.LineSegments(netGeometry, M.net));

  const plastic = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([
    new THREE.Vector2(-0.35, -0.2),
    new THREE.Vector2(-0.18, -0.32),
    new THREE.Vector2(0.02, -0.18),
    new THREE.Vector2(0.28, -0.26),
    new THREE.Vector2(0.35, 0.12),
    new THREE.Vector2(0.14, 0.28),
    new THREE.Vector2(-0.16, 0.2),
  ])), M.plastic);
  plastic.rotation.x = -Math.PI / 2;
  plastic.position.set(0.18, 0.13, -0.06);
  group.add(plastic);
  return group;
}

const BUILDERS: Record<ObstacleKind, () => THREE.Group> = {
  'wall-concrete': () => buildLog(2.12, 0.22),
  'wall-brick': buildRockCluster,
  'wall-wood': buildDebris,
  'wall-low': buildRockCluster,
  'wall-moving': buildBarrelRow,
  'wall-breakable': buildDebris,
  barrier: () => buildLog(1.62, 0.18),
  crate: buildLargeRock,
  'water-container': () => buildBarrelRow(),
  scooter: buildLargeRock,
  motorcycle: () => buildBarrelRow(),
  'auto-rickshaw': buildDebris,
  bicycle: buildLargeRock,
  'vegetable-cart': buildDebris,
};

export function buildObstacleMesh(kind: ObstacleKind): THREE.Group {
  const group = BUILDERS[kind]();
  group.name = `river-obstacle-${OBSTACLE_VISUAL_BY_KIND[kind]}`;
  group.userData.obstacleVisual = OBSTACLE_VISUAL_BY_KIND[kind];
  const radius = Math.max(1.02, OBSTACLE_HALF_EXTENTS[kind].x * 1.08);
  const ripple = new THREE.Mesh(
    new THREE.RingGeometry(radius, radius + 0.16, 24),
    M.water,
  );
  ripple.name = 'obstacleWaterRipple';
  ripple.rotation.x = -Math.PI / 2;
  ripple.position.y = 0.02;
  ripple.castShadow = false;
  ripple.receiveShadow = false;
  group.add(ripple);
  return group;
}

export function disposeObstacleMaterials(): void {
  for (const material of OBSTACLE_MATERIALS) material.dispose();
}
