import * as THREE from 'three';
import type { GateSpec } from '../economy/gateMath';
import {
  createGateGlowTexture,
  createGateTexture,
} from '../assets/proceduralTextures';
import { bakeStaticGroup } from '../core/bakeStaticGroup';

const PASSAGE_HALF_WIDTH = 1.53;
const PONTOON_X = 1.85;
const PONTOON_RADIUS = 0.3;
const DECK_Y = 0.44;
const DISPLAY_WIDTH = 3.2;
const DISPLAY_HEIGHT = 1.8;
const DISPLAY_Y = 3.2;
const PANEL_Z = 0.1;
const TRIM_Z = 0.105;

const navyMaterial = new THREE.MeshStandardMaterial({
  color: 0x1b2a38,
  roughness: 0.46,
  metalness: 0.32,
});
const charcoalMaterial = new THREE.MeshStandardMaterial({
  color: 0x121a22,
  roughness: 0.56,
  metalness: 0.26,
});
const safetyYellowMaterial = new THREE.MeshStandardMaterial({
  color: 0xd6a022,
  roughness: 0.55,
  metalness: 0.16,
});
const safetyBlackMaterial = new THREE.MeshStandardMaterial({
  color: 0x0f1418,
  roughness: 0.62,
  metalness: 0.2,
});
const metalMaterial = new THREE.MeshStandardMaterial({
  color: 0x6d787e,
  roughness: 0.34,
  metalness: 0.84,
});
const tealMaterial = new THREE.MeshStandardMaterial({
  color: 0x2b837c,
  roughness: 0.5,
  metalness: 0.24,
});

const foamGeometry = new THREE.RingGeometry(0.4, 0.62, 26);
const foamMaterial = new THREE.MeshBasicMaterial({
  color: 0xd9f2ec,
  transparent: true,
  opacity: 0.15,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const rippleGeometry = new THREE.TorusGeometry(1, 0.016, 5, 30);
const rippleMaterial = new THREE.MeshBasicMaterial({
  color: 0xbfeee8,
  transparent: true,
  opacity: 0.2,
  depthWrite: false,
  side: THREE.DoubleSide,
});

export function boatFitsGateOpening(
  boatX: number,
  gateX: number,
  boatHalfWidth: number,
  openingHalfWidth: number,
): boolean {
  return (
    Number.isFinite(boatX) &&
    Number.isFinite(gateX) &&
    Number.isFinite(boatHalfWidth) &&
    Number.isFinite(openingHalfWidth) &&
    boatHalfWidth >= 0 &&
    openingHalfWidth >= 0 &&
    Math.abs(boatX - gateX) + boatHalfWidth <= openingHalfWidth
  );
}

function addPart(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  castShadow = true,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addBeam(
  parent: THREE.Object3D,
  material: THREE.Material,
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  castShadow = true,
): void {
  const delta = new THREE.Vector3().subVectors(end, start);
  const length = delta.length();
  if (length <= 0) return;

  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 8),
    material,
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.normalize(),
  );
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
}

function buildCheckpointTemplate(): THREE.Group {
  const source = new THREE.Group();

  for (const side of [-1, 1]) {
    const x = side * PONTOON_X;

    // Compact tapered marine hull, half-submerged.
    addPart(
      source,
      new THREE.CapsuleGeometry(PONTOON_RADIUS, 2.5, 5, 16),
      navyMaterial,
      x,
      0.1,
      0,
    ).rotation.x = Math.PI / 2;

    // Restrained yellow/black waterline safety band.
    addPart(
      source,
      new THREE.CylinderGeometry(
        PONTOON_RADIUS + 0.014,
        PONTOON_RADIUS + 0.014,
        0.62,
        18,
        1,
        true,
      ),
      safetyYellowMaterial,
      x,
      0.14,
      0,
    ).rotation.x = Math.PI / 2;
    addPart(
      source,
      new THREE.CylinderGeometry(
        PONTOON_RADIUS + 0.016,
        PONTOON_RADIUS + 0.016,
        0.07,
        18,
        1,
        true,
      ),
      safetyBlackMaterial,
      x,
      0.14,
      0.33,
    ).rotation.x = Math.PI / 2;

    // Deck plate and teal edge trim.
    addPart(
      source,
      new THREE.BoxGeometry(0.58, 0.1, 2.3),
      charcoalMaterial,
      x,
      DECK_Y,
      0,
    );
    addPart(
      source,
      new THREE.BoxGeometry(0.6, 0.025, 2.32),
      tealMaterial,
      x,
      DECK_Y + 0.055,
      0,
      false,
    );

    // Mooring cleat.
    addPart(
      source,
      new THREE.BoxGeometry(0.32, 0.07, 0.1),
      metalMaterial,
      x,
      DECK_Y + 0.12,
      0.88,
    );
  }

  // Slim masts and rear A-frame bracing.
  for (const side of [-1, 1]) {
    const x = side * 1.62;
    addPart(
      source,
      new THREE.BoxGeometry(0.1, 1.9, 0.1),
      metalMaterial,
      x,
      1.39,
      -0.12,
    );
    addPart(
      source,
      new THREE.BoxGeometry(0.24, 0.08, 0.3),
      charcoalMaterial,
      x,
      DECK_Y + 0.06,
      -0.12,
    );
    addBeam(
      source,
      metalMaterial,
      new THREE.Vector3(x, DECK_Y + 0.1, -1.0),
      new THREE.Vector3(x, 4.02, -0.2),
      0.036,
    );
    addBeam(
      source,
      metalMaterial,
      new THREE.Vector3(x, DECK_Y + 0.1, -1.0),
      new THREE.Vector3(x, 2.32, -0.16),
      0.026,
    );
  }

  addPart(
    source,
    new THREE.BoxGeometry(3.42, 0.1, 0.1),
    metalMaterial,
    0,
    4.16,
    -0.12,
  );

  // Display housing: dark backing with a thin marine bezel.
  addPart(
    source,
    new THREE.BoxGeometry(3.36, 1.98, 0.16),
    charcoalMaterial,
    0,
    DISPLAY_Y,
    -0.02,
  );
  addPart(
    source,
    new THREE.BoxGeometry(3.46, 0.1, 0.2),
    metalMaterial,
    0,
    DISPLAY_Y + 0.95,
    0.0,
  );
  addPart(
    source,
    new THREE.BoxGeometry(3.46, 0.1, 0.2),
    metalMaterial,
    0,
    DISPLAY_Y - 0.95,
    0.0,
  );
  addPart(
    source,
    new THREE.BoxGeometry(0.1, 1.9, 0.2),
    metalMaterial,
    -1.68,
    DISPLAY_Y,
    0.0,
  );
  addPart(
    source,
    new THREE.BoxGeometry(0.1, 1.9, 0.2),
    metalMaterial,
    1.68,
    DISPLAY_Y,
    0.0,
  );

  // Small steady navigation light above the display.
  addPart(
    source,
    new THREE.BoxGeometry(0.42, 0.12, 0.2),
    charcoalMaterial,
    0,
    DISPLAY_Y + 1.06,
    -0.2,
  );

  // Weathered hull trim near the waterline.
  addPart(
    source,
    new THREE.BoxGeometry(0.04, 0.16, 1.9),
    tealMaterial,
    2.12,
    0.16,
    0,
    false,
  );
  addPart(
    source,
    new THREE.BoxGeometry(0.04, 0.16, 1.9),
    tealMaterial,
    -2.12,
    0.16,
    0,
    false,
  );

  return bakeStaticGroup(source);
}

let checkpointTemplate: THREE.Group | undefined;

function getCheckpointTemplate(): THREE.Group {
  if (!checkpointTemplate) checkpointTemplate = buildCheckpointTemplate();
  return checkpointTemplate;
}

export class Gate {
  readonly group = new THREE.Group();

  private readonly buoyRoot = new THREE.Group();
  private readonly waterRoot = new THREE.Group();
  private readonly accentMaterial = new THREE.MeshStandardMaterial({
    color: 0x2fbf83,
    emissive: 0x2fbf83,
    emissiveIntensity: 0.55,
    metalness: 0.3,
    roughness: 0.32,
  });
  private readonly auraMaterial = new THREE.MeshBasicMaterial({
    color: 0x2fbf83,
    map: createGateGlowTexture(),
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  private readonly panelMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    alphaTest: 0.04,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly reflectionMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.09,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  private readonly ripples: { mesh: THREE.Mesh; base: number }[] = [];

  laneIndex = 1;
  id = '';
  spec: GateSpec | null = null;

  constructor() {
    this.buildCheckpoint();
    this.group.visible = false;
  }

  setSpec(spec: GateSpec, laneIndex: number, laneX: number, id: string): void {
    this.spec = spec;
    this.laneIndex = laneIndex;
    this.id = id;

    this.accentMaterial.color.set(spec.color);
    this.accentMaterial.emissive.set(spec.color);
    this.auraMaterial.color.set(spec.color);
    this.reflectionMaterial.color.set(spec.color);
    this.panelMaterial.map = createGateTexture(spec);
    this.reflectionMaterial.map = this.panelMaterial.map;
    this.panelMaterial.needsUpdate = true;
    this.reflectionMaterial.needsUpdate = true;

    this.buoyRoot.position.x = 0;
    this.waterRoot.position.x = 0;
    this.group.position.x = laneX;
    this.group.visible = true;
    this.setSelected(false);
  }

  canPass(boatX: number, boatHalfWidth: number): boolean {
    return boatFitsGateOpening(
      boatX,
      this.group.position.x,
      boatHalfWidth,
      PASSAGE_HALF_WIDTH,
    );
  }

  setSelected(selected: boolean): void {
    this.accentMaterial.emissiveIntensity = selected ? 1.05 : 0.55;
    this.auraMaterial.opacity = selected ? 0.26 : 0.14;
  }

  hide(): void {
    this.group.visible = false;
    this.setSelected(false);
  }

  update(time: number): void {
    if (!this.group.visible) return;

    const bob = Math.sin(time * 0.8 + this.laneIndex * 1.7) * 0.045;
    this.buoyRoot.position.y = bob;
    this.buoyRoot.rotation.z = Math.sin(time * 0.52 + this.laneIndex) * 0.014;
    this.buoyRoot.rotation.x = Math.cos(time * 0.45 + this.laneIndex) * 0.01;

    for (let index = 0; index < this.ripples.length; index += 1) {
      const ripple = this.ripples[index];
      const scale =
        ripple.base *
        (1 + Math.sin(time * 0.85 + this.laneIndex + index * 1.5) * 0.03);
      ripple.mesh.scale.setScalar(scale);
    }
  }

  private buildCheckpoint(): void {
    this.group.add(this.buoyRoot, this.waterRoot);
    this.buoyRoot.add(getCheckpointTemplate().clone(true));

    // Thin illuminated border around the display glass.
    const trim = this.accentMaterial;
    const topTrim = new THREE.Mesh(
      new THREE.BoxGeometry(DISPLAY_WIDTH - 0.06, 0.022, 0.02),
      trim,
    );
    topTrim.position.set(0, DISPLAY_Y + DISPLAY_HEIGHT / 2 - 0.02, TRIM_Z);
    topTrim.castShadow = false;
    topTrim.receiveShadow = false;
    this.buoyRoot.add(topTrim);

    const bottomTrim = topTrim.clone();
    bottomTrim.position.y = DISPLAY_Y - DISPLAY_HEIGHT / 2 + 0.02;
    this.buoyRoot.add(bottomTrim);

    const leftTrim = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, DISPLAY_HEIGHT - 0.06, 0.02),
      trim,
    );
    leftTrim.position.set(-DISPLAY_WIDTH / 2 + 0.02, DISPLAY_Y, TRIM_Z);
    leftTrim.castShadow = false;
    leftTrim.receiveShadow = false;
    this.buoyRoot.add(leftTrim);

    const rightTrim = leftTrim.clone();
    rightTrim.position.x = DISPLAY_WIDTH / 2 - 0.02;
    this.buoyRoot.add(rightTrim);

    const statusLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 10, 8),
      trim,
    );
    statusLight.position.set(0, DISPLAY_Y + 1.16, -0.2);
    statusLight.castShadow = false;
    statusLight.receiveShadow = false;
    this.buoyRoot.add(statusLight);

    const aura = new THREE.Mesh(
      new THREE.PlaneGeometry(DISPLAY_WIDTH + 0.24, DISPLAY_HEIGHT + 0.24),
      this.auraMaterial,
    );
    aura.position.set(0, DISPLAY_Y, PANEL_Z - 0.05);
    aura.renderOrder = 2;
    this.buoyRoot.add(aura);

    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(DISPLAY_WIDTH, DISPLAY_HEIGHT),
      this.panelMaterial,
    );
    panel.position.set(0, DISPLAY_Y, PANEL_Z);
    panel.castShadow = false;
    panel.receiveShadow = false;
    panel.renderOrder = 3;
    this.buoyRoot.add(panel);

    const reflection = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 1.7),
      this.reflectionMaterial,
    );
    reflection.rotation.x = -Math.PI / 2;
    reflection.position.set(0, 0.03, 1.55);
    reflection.renderOrder = 1;
    this.waterRoot.add(reflection);

    for (const side of [-1, 1]) {
      const x = side * PONTOON_X;

      const foam = new THREE.Mesh(foamGeometry, foamMaterial);
      foam.rotation.x = -Math.PI / 2;
      foam.position.set(x, 0.026, 0);
      foam.scale.set(1, 2.5, 1);
      foam.castShadow = false;
      foam.receiveShadow = false;
      this.waterRoot.add(foam);

      for (let index = 0; index < 2; index += 1) {
        const base = 0.58 + index * 0.26;
        const ripple = new THREE.Mesh(rippleGeometry, rippleMaterial);
        ripple.rotation.x = -Math.PI / 2;
        ripple.position.set(x, 0.03, 0);
        ripple.scale.setScalar(base);
        ripple.castShadow = false;
        ripple.receiveShadow = false;
        this.ripples.push({ mesh: ripple, base });
        this.waterRoot.add(ripple);
      }
    }
  }
}
