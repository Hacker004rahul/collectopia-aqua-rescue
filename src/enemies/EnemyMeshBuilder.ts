import * as THREE from 'three';

export type EnemyKind = 'basic' | 'fast' | 'guard' | 'heavy' | 'boss';
export type CrocodileState =
  | 'spawning'
  | 'swimming'
  | 'approaching'
  | 'chasing'
  | 'attacking'
  | 'stunned'
  | 'frozen'
  | 'despawning';

interface CrocodileAnimation {
  body: THREE.Group;
  jaw: THREE.Group;
  legs: THREE.Group[];
  tailSegments: THREE.Group[];
  ripple: THREE.Mesh;
  frozenAura: THREE.Mesh;
  phase: number;
}

const ENEMY_STYLE: Record<EnemyKind, { scale: number; color: number }> = {
  basic: { scale: 0.96, color: 0x557c3a },
  fast: { scale: 0.88, color: 0x6a8e3f },
  guard: { scale: 1.04, color: 0x3f6740 },
  heavy: { scale: 1.13, color: 0x476d35 },
  boss: { scale: 1.2, color: 0x315535 },
};

interface BodyStation {
  z: number;
  width: number;
  top: number;
  bottom: number;
}

const BODY_STATIONS: readonly BodyStation[] = [
  { z: -1.32, width: 0.055, top: 0.47, bottom: 0.34 },
  { z: -1.08, width: 0.19, top: 0.58, bottom: 0.26 },
  { z: -0.78, width: 0.34, top: 0.67, bottom: 0.2 },
  { z: -0.38, width: 0.47, top: 0.72, bottom: 0.17 },
  { z: 0.08, width: 0.49, top: 0.7, bottom: 0.16 },
  { z: 0.49, width: 0.42, top: 0.66, bottom: 0.18 },
  { z: 0.82, width: 0.31, top: 0.59, bottom: 0.22 },
  { z: 1.02, width: 0.2, top: 0.51, bottom: 0.29 },
];

function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material);
  result.position.set(x, y, z);
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

function makeBodyGeometry(baseColor: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const skin = new THREE.Color(baseColor);
  const belly = new THREE.Color(0xb7aa75);
  const ringCount = 18;

  BODY_STATIONS.forEach((station, row) => {
    const along = row / (BODY_STATIONS.length - 1);
    for (let ring = 0; ring <= ringCount; ring += 1) {
      const angle = (ring / ringCount) * Math.PI * 2;
      const vertical = Math.sin(angle);
      const x = Math.cos(angle) * station.width;
      const y = (station.top + station.bottom) * 0.5 +
        vertical * (station.top - station.bottom) * 0.5;
      const variation = 0.94 + Math.sin(along * 36 + ring * 1.7) * 0.035;
      const color = skin.clone().lerp(
        belly,
        THREE.MathUtils.smoothstep(-vertical, 0.42, 0.78),
      ).multiplyScalar(variation);
      positions.push(x, y, station.z);
      colors.push(color.r, color.g, color.b);
      uvs.push(ring / ringCount, along);
    }
  });

  const rowLength = ringCount + 1;
  for (let row = 0; row < BODY_STATIONS.length - 1; row += 1) {
    for (let ring = 0; ring < ringCount; ring += 1) {
      const a = row * rowLength + ring;
      const b = a + rowLength;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeSectionGeometry(
  stations: readonly BodyStation[],
  segments = 12,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const station of stations) {
    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      positions.push(
        Math.cos(angle) * station.width,
        (station.top + station.bottom) * 0.5 +
          Math.sin(angle) * (station.top - station.bottom) * 0.5,
        station.z,
      );
    }
  }
  const rowLength = segments + 1;
  const reverse = stations[stations.length - 1].z < stations[0].z;
  for (let row = 0; row < stations.length - 1; row += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const a = row * rowLength + segment;
      const b = a + rowLength;
      if (reverse) {
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      } else {
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeScuteGeometry(kind: EnemyKind): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const rows = kind === 'boss' || kind === 'heavy' ? 3 : 2;
  const count = kind === 'boss' ? 12 : 10;

  for (let row = 0; row < rows; row += 1) {
    const side = row === 0 ? 0 : row === 1 ? -1 : 1;
    for (let index = 0; index < count; index += 1) {
      const z = -0.94 + index * 0.145;
      const bodyStation = BODY_STATIONS.reduce((nearest, station) =>
        Math.abs(station.z - z) < Math.abs(nearest.z - z) ? station : nearest,
      );
      const x = side === 0 ? 0 : side * bodyStation.width * 0.58;
      const y = bodyStation.top - (side === 0 ? 0.005 : 0.045);
      const width = side === 0 ? 0.105 : 0.082;
      const length = 0.12;
      const base = positions.length / 3;
      positions.push(
        x - width, y, z - length * 0.5,
        x + width, y, z - length * 0.5,
        x + width, y, z + length * 0.5,
        x - width, y, z + length * 0.5,
        x, y + (kind === 'boss' ? 0.105 : 0.075), z,
      );
      indices.push(
        base, base + 1, base + 4,
        base + 1, base + 2, base + 4,
        base + 2, base + 3, base + 4,
        base + 3, base, base + 4,
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeTeethGeometry(
  count: number,
  spacing: number,
  length: number,
  pointDown: boolean,
): THREE.BufferGeometry {
  const cone = new THREE.ConeGeometry(0.038, length, 4);
  const source = cone.getAttribute('position');
  const positions: number[] = [];
  const indices: number[] = [];
  const total = (count - 1) * spacing;

  for (let tooth = 0; tooth < count; tooth += 1) {
    const base = positions.length / 3;
    const offsetZ = tooth * spacing - total * 0.5;
    for (let vertex = 0; vertex < source.count; vertex += 1) {
      const x = source.getX(vertex);
      const y = source.getY(vertex);
      positions.push(x, pointDown ? -y : y, source.getZ(vertex) + offsetZ);
    }
    for (let index = 0; index < cone.index!.count; index += 1) {
      indices.push(base + cone.index!.getX(index));
    }
  }
  cone.dispose();

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildCrocodile(kind: EnemyKind): THREE.Group {
  const style = ENEMY_STYLE[kind];
  const group = new THREE.Group();
  group.name = `crocodile-${kind}`;
  group.scale.setScalar(style.scale);

  const skin = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.84,
    flatShading: false,
  });
  const darkSkin = new THREE.MeshStandardMaterial({
    color: style.color,
    roughness: 0.82,
  });
  const scutes = new THREE.MeshStandardMaterial({
    color: kind === 'boss' ? 0x233d2c : 0x304b31,
    roughness: 0.91,
  });
  const mouth = new THREE.MeshStandardMaterial({
    color: 0x352c28,
    roughness: 0.88,
    side: THREE.DoubleSide,
  });
  const tooth = new THREE.MeshStandardMaterial({
    color: 0xf1dfb6,
    roughness: 0.55,
  });
  const eye = new THREE.MeshStandardMaterial({
    color: 0xf1c54a,
    emissive: 0x67450c,
    emissiveIntensity: 0.35,
    roughness: 0.36,
  });
  const pupil = new THREE.MeshBasicMaterial({ color: 0x101514 });
  const highlight = new THREE.MeshBasicMaterial({ color: 0xfff0cf });

  const body = new THREE.Group();
  group.add(body);
  body.add(mesh(makeBodyGeometry(style.color), skin));
  body.add(mesh(makeScuteGeometry(kind), scutes));

  const head = new THREE.Group();
  head.position.set(0, 0.48, 0.77);
  body.add(head);
  const skull = makeSectionGeometry([
    { z: -0.06, width: 0.32, top: 0.19, bottom: -0.16 },
    { z: 0.2, width: 0.36, top: 0.2, bottom: -0.16 },
    { z: 0.46, width: 0.3, top: 0.13, bottom: -0.13 },
    { z: 0.82, width: 0.23, top: 0.075, bottom: -0.11 },
    { z: 1.08, width: 0.26, top: 0.03, bottom: -0.12 },
  ]);
  head.add(mesh(skull, darkSkin));
  head.add(
    mesh(
      new THREE.BoxGeometry(0.43, 0.055, 0.92),
      mouth,
      0,
      -0.105,
      0.56,
    ),
  );

  const jaw = new THREE.Group();
  jaw.position.set(0, -0.11, 0.07);
  jaw.add(
    mesh(
      makeSectionGeometry([
        { z: 0, width: 0.27, top: 0.015, bottom: -0.075 },
        { z: 0.24, width: 0.28, top: 0.01, bottom: -0.08 },
        { z: 0.62, width: 0.21, top: 0.005, bottom: -0.065 },
        { z: 1.02, width: 0.24, top: -0.015, bottom: -0.07 },
      ]),
      darkSkin,
      0,
      -0.005,
      0.06,
    ),
  );
  jaw.add(
    mesh(
      makeTeethGeometry(6, 0.13, 0.13, false),
      tooth,
      0,
      -0.035,
      0.57,
    ),
  );
  head.add(jaw);
  head.add(
    mesh(
      makeTeethGeometry(6, 0.13, 0.12, true),
      tooth,
      0,
      -0.09,
      0.58,
    ),
  );

  const eyeSocket = new THREE.SphereGeometry(0.13, 10, 8);
  const eyeGeometry = new THREE.SphereGeometry(0.083, 10, 8);
  const pupilGeometry = new THREE.SphereGeometry(0.034, 8, 6);
  const glintGeometry = new THREE.SphereGeometry(0.012, 6, 5);
  const nostrilGeometry = new THREE.SphereGeometry(0.035, 7, 5);
  for (const side of [-1, 1]) {
    head.add(mesh(eyeSocket, darkSkin, side * 0.28, 0.14, 0.2));
    head.add(mesh(eyeGeometry, eye, side * 0.3, 0.17, 0.22));
    head.add(mesh(pupilGeometry, pupil, side * 0.3, 0.17, 0.29));
    head.add(mesh(glintGeometry, highlight, side * 0.31, 0.2, 0.31));
    head.add(mesh(nostrilGeometry, mouth, side * 0.13, 0.038, 1.01));
  }

  const legs: THREE.Group[] = [];
  const upperLeg = new THREE.CapsuleGeometry(0.095, 0.22, 3, 7);
  const footGeometry = new THREE.SphereGeometry(0.12, 8, 6);
  const clawGeometry = makeTeethGeometry(3, 0.08, 0.075, false);
  for (const side of [-1, 1]) {
    for (const z of [-0.56, 0.47]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.39, 0.31, z);
      leg.add(mesh(upperLeg, darkSkin, side * 0.055, -0.045, 0));
      leg.add(mesh(footGeometry, darkSkin, side * 0.11, -0.12, 0.055));
      leg.add(mesh(clawGeometry, tooth, side * 0.11, -0.19, 0.12));
      body.add(leg);
      legs.push(leg);
    }
  }

  const tailSegments: THREE.Group[] = [];
  const tailLengths = [0.58, 0.56, 0.52];
  const tailWidths = [0.3, 0.22, 0.14];
  let tailParent = body;
  let tailZ = -1.12;
  for (let index = 0; index < tailLengths.length; index += 1) {
    const length = tailLengths[index];
    const width = tailWidths[index];
    const tailSegment = new THREE.Group();
    tailSegment.position.set(index === 0 ? 0 : 0, index === 0 ? 0.39 : 0, tailZ);
    tailParent.add(tailSegment);
    const endWidth = index === tailLengths.length - 1 ? 0.025 : width * 0.63;
    tailSegment.add(
      mesh(
        makeSectionGeometry([
          { z: 0, width, top: width * 0.5, bottom: -width * 0.5 },
          { z: -length * 0.55, width: width * 0.8, top: width * 0.4, bottom: -width * 0.4 },
          { z: -length, width: endWidth, top: endWidth * 0.55, bottom: -endWidth * 0.55 },
        ]),
        darkSkin,
      ),
    );
    tailSegments.push(tailSegment);
    tailParent = tailSegment;
    tailZ = -length;
  }

  const rippleMaterial = new THREE.MeshBasicMaterial({
    color: 0xa6e5e8,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ripple = mesh(new THREE.RingGeometry(0.64, 0.79, 24), rippleMaterial);
  ripple.name = 'crocodileRipple';
  ripple.rotation.x = -Math.PI / 2;
  ripple.position.y = 0.025;
  ripple.castShadow = false;
  ripple.receiveShadow = false;
  group.add(ripple);

  const frozenMaterial = new THREE.MeshBasicMaterial({
    color: 0x8fe6ff,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const frozenAura = mesh(new THREE.RingGeometry(0.88, 1.04, 24), frozenMaterial);
  frozenAura.name = 'frozenWaterAura';
  frozenAura.rotation.x = -Math.PI / 2;
  frozenAura.position.y = 0.04;
  frozenAura.visible = false;
  frozenAura.castShadow = false;
  group.add(frozenAura);

  if (kind === 'boss') {
    const barBacking = mesh(
      new THREE.BoxGeometry(0.88, 0.11, 0.07),
      mouth,
      0,
      1.16,
      0.9,
    );
    body.add(barBacking);
    const hpFill = mesh(
      new THREE.BoxGeometry(0.76, 0.065, 0.04),
      new THREE.MeshStandardMaterial({
        color: 0x22cc44,
        emissive: 0x22cc44,
        emissiveIntensity: 0.4,
      }),
      0,
      1.16,
      0.95,
    );
    hpFill.name = 'bossHpFill';
    body.add(hpFill);
  }

  group.userData.crocodileAnimation = {
    body,
    jaw,
    legs,
    tailSegments,
    ripple,
    frozenAura,
    phase: kind.length * 0.91 + style.scale,
  } satisfies CrocodileAnimation;
  return group;
}

export function buildEnemyMesh(kind: EnemyKind): THREE.Group {
  return buildCrocodile(kind);
}

export function animateEnemyMesh(
  group: THREE.Group,
  time: number,
  attacking: boolean,
  frozen: boolean,
  state?: CrocodileState,
): void {
  const animation = group.userData.crocodileAnimation as CrocodileAnimation | undefined;
  if (!animation) return;

  const frozenNow = frozen || state === 'frozen';
  animation.frozenAura.visible = frozenNow;
  if (frozenNow) {
    animation.jaw.rotation.x = 0;
    animation.ripple.scale.setScalar(0.9);
    return;
  }

  const phase = time * 4.7 + animation.phase;
  const swimming = state === 'swimming' || state === 'approaching' || state === 'chasing';
  const tailStrength = state === 'stunned' ? 0.08 : swimming ? 0.34 : 0.2;
  animation.tailSegments.forEach((segment, index) => {
    segment.rotation.y = Math.sin(phase - index * 0.62) * tailStrength;
    segment.rotation.x = Math.sin(phase * 0.7 - index * 0.5) * 0.025;
  });
  animation.jaw.rotation.x = attacking ? 0.32 + Math.abs(Math.sin(phase * 0.6)) * 0.14 : 0;
  animation.body.rotation.x = attacking
    ? -0.055
    : Math.sin(phase * 0.45) * 0.012;
  animation.body.rotation.z =
    state === 'stunned' ? Math.sin(phase * 2) * 0.06 : Math.sin(phase * 0.35) * 0.018;
  for (let index = 0; index < animation.legs.length; index += 1) {
    animation.legs[index].rotation.z = swimming
      ? Math.sin(phase + (index % 2) * Math.PI) * 0.18
      : 0;
    animation.legs[index].rotation.x = swimming
      ? Math.cos(phase + index * 0.9) * 0.07
      : 0;
  }
  animation.ripple.scale.set(
    1 + Math.sin(phase * 0.46) * 0.08,
    1,
    1 + Math.cos(phase * 0.46) * 0.08,
  );
  (animation.ripple.material as THREE.MeshBasicMaterial).opacity =
    0.15 + (Math.sin(phase * 0.46) + 1) * 0.055;
}

export const ENEMY_HALF_EXTENTS: Record<EnemyKind, { x: number; z: number }> = {
  basic: { x: 0.72, z: 2.15 },
  fast: { x: 0.66, z: 2.0 },
  guard: { x: 0.78, z: 2.3 },
  heavy: { x: 0.86, z: 2.45 },
  boss: { x: 0.94, z: 2.58 },
};

export const ENEMY_MAX_HP: Record<EnemyKind, number> = {
  basic: 1,
  fast: 1,
  guard: 1,
  heavy: 3,
  boss: 5,
};
