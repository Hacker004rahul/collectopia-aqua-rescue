import * as THREE from 'three';
import { COINS, ECONOMY, LANES, POWERUPS } from '../config/balance';
import {
  getDifficultyProfile,
  type DifficultyProfile,
} from '../config/difficulty';
import { Rng } from '../core/Rng';
import type { SpawnReservations } from '../core/SpawnReservations';
import type { EconomyManager } from '../economy/EconomyManager';
import {
  createBisleriLabelTexture,
  createChipsWrapperTexture,
  createCocaColaLabelTexture,
  createGlowTexture,
} from '../assets/proceduralTextures';
import { applyMagnetPull } from './magnet';

interface GarbageRecord {
  index: number;
  id: number;
  distance: number;
  x: number;
  phase: number;
  heading: number;
  floatHeight: number;
  bobAmplitude: number;
  driftAmplitude: number;
  kind: number;
  collected: boolean;
}

export interface GarbageCollectEvent {
  position: THREE.Vector3;
  amount: number;
  kind: GarbageKind;
}

export interface GarbageSystemCallbacks {
  onCollect: (event: GarbageCollectEvent) => void;
}

export const GARBAGE_KINDS = [
  'bottle',
  'plastic-bag',
  'aluminium-can',
  'food-wrapper',
  'plastic-cup',
] as const;

export type GarbageKind = (typeof GARBAGE_KINDS)[number];
const GARBAGE_LABELS = [
  'Bisleri bottle',
  'polythene bag',
  'Coca-Cola can',
  'chips wrapper',
  'plastic cup',
] as const;
const FLOAT_HEIGHTS = [0.12, 0.062, 0.14, 0.045, 0.12] as const;
const GARBAGE_VALUE_MULTIPLIERS = [1, 1, 1, 1, 1] as const;

function createBottleGeometry(): THREE.BufferGeometry {
  const bottle = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.015, -0.62),
      new THREE.Vector2(0.075, -0.59),
      new THREE.Vector2(0.11, -0.52),
      new THREE.Vector2(0.122, -0.42),
      new THREE.Vector2(0.128, -0.24),
      new THREE.Vector2(0.116, 0.11),
      new THREE.Vector2(0.15, 0.23),
      new THREE.Vector2(0.134, 0.31),
      new THREE.Vector2(0.09, 0.37),
      new THREE.Vector2(0.064, 0.43),
      new THREE.Vector2(0.062, 0.54),
      new THREE.Vector2(0.08, 0.565),
    ],
    18,
  );
  const positions = bottle.getAttribute('position');
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const ribs = 1 + 0.02 * Math.sin(y * 34);
    const dent = 1 - 0.055 * Math.max(0, Math.sin(y * 13 + Math.atan2(z, x) * 2.7));
    positions.setX(index, x * dent * ribs);
    positions.setZ(index, z * dent * ribs);
  }
  positions.needsUpdate = true;
  bottle.computeVertexNormals();
  bottle.rotateX(Math.PI / 2);
  return bottle;
}

function createCanGeometry(): THREE.BufferGeometry {
  const can = new THREE.CylinderGeometry(0.18, 0.18, 0.58, 20, 6, true);
  const positions = can.getAttribute('position');
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const dent = 1 - 0.045 * Math.sin(y * 17 + x * 31);
    positions.setX(index, x * dent);
    positions.setZ(index, positions.getZ(index) * dent);
  }
  positions.needsUpdate = true;
  can.computeVertexNormals();
  can.rotateX(Math.PI / 2);
  return can;
}

function createBagGeometry(): THREE.BufferGeometry {
  const bagShape = new THREE.Shape();
  bagShape.moveTo(-0.25, -0.32);
  bagShape.lineTo(-0.34, -0.08);
  bagShape.lineTo(-0.28, 0.27);
  bagShape.lineTo(-0.13, 0.19);
  bagShape.lineTo(-0.09, 0.38);
  bagShape.lineTo(0.01, 0.25);
  bagShape.lineTo(0.11, 0.36);
  bagShape.lineTo(0.16, 0.2);
  bagShape.lineTo(0.3, 0.29);
  bagShape.lineTo(0.34, -0.06);
  bagShape.lineTo(0.24, -0.34);
  bagShape.quadraticCurveTo(0, -0.4, -0.25, -0.32);
  const bag = new THREE.ExtrudeGeometry(bagShape, {
    depth: 0.08,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.025,
    bevelThickness: 0.025,
    curveSegments: 4,
  });
  const positions = bag.getAttribute('position');
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const folds =
      Math.sin(x * 24 + y * 9) * 0.03 +
      Math.sin(y * 19 - x * 13) * 0.022 +
      Math.cos(x * 11 + y * 21) * 0.014;
    positions.setZ(index, positions.getZ(index) + folds);
  }
  positions.needsUpdate = true;
  bag.computeVertexNormals();
  bag.translate(0, 0, -0.04);
  bag.rotateX(-Math.PI / 2);
  return bag;
}

function createWrapperGeometry(): THREE.BufferGeometry {
  const wrapper = new THREE.PlaneGeometry(0.82, 0.56, 20, 14);
  const positions = wrapper.getAttribute('position');
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    positions.setZ(
      index,
      Math.sin(x * 29 + y * 13) * 0.04 +
        Math.sin(y * 37 - x * 11) * 0.026 +
        Math.sin(x * 43 + y * 19) * 0.014,
    );
  }
  positions.needsUpdate = true;
  wrapper.computeVertexNormals();
  wrapper.rotateX(-Math.PI / 2);
  return wrapper;
}

function createCupGeometry(): THREE.BufferGeometry {
  const cup = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.003, -0.31),
      new THREE.Vector2(0.07, -0.31),
      new THREE.Vector2(0.082, -0.292),
      new THREE.Vector2(0.1, -0.2),
      new THREE.Vector2(0.128, 0.2),
      new THREE.Vector2(0.14, 0.3),
      new THREE.Vector2(0.14, 0.316),
      new THREE.Vector2(0.129, 0.318),
      new THREE.Vector2(0.118, 0.2),
      new THREE.Vector2(0.09, -0.22),
      new THREE.Vector2(0.062, -0.286),
      new THREE.Vector2(0.003, -0.288),
    ],
    22,
  );
  const positions = cup.getAttribute('position');
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const crease =
      1 + 0.012 * Math.sin(Math.atan2(z, x) * 12) * Math.max(0, y + 0.3);
    positions.setX(index, x * crease);
    positions.setZ(index, z * crease);
  }
  positions.needsUpdate = true;
  cup.computeVertexNormals();
  return cup;
}

function createDebrisGeometries(): THREE.BufferGeometry[] {
  return [
    createBottleGeometry(),
    createBagGeometry(),
    createCanGeometry(),
    createWrapperGeometry(),
    createCupGeometry(),
  ];
}

interface DebrisDetail {
  kind: number;
  mesh: THREE.InstancedMesh;
  localTransform: THREE.Matrix4;
}

export class GarbageSystem {
  private readonly debris: THREE.InstancedMesh[] = [];
  private readonly detailParts: DebrisDetail[] = [];
  private readonly generatedTextures: THREE.Texture[] = [];
  private readonly glow: THREE.Points;
  private readonly glowPositions: Float32Array;
  private readonly glowTexture = createGlowTexture();
  private readonly records: Array<GarbageRecord | null> = new Array(COINS.maxActive).fill(null);
  private readonly freeIndices: number[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly instanceTransform = new THREE.Object3D();
  private readonly hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  private readonly collectPosition = new THREE.Vector3();
  private rng = new Rng(0x51c0ffee);
  private nextId = 1;
  private nextPatternDistance = COINS.initialPatternDistance;
  private magnetActive = false;
  private coinMultiplier = 1;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly economy: EconomyManager,
    private readonly callbacks: GarbageSystemCallbacks,
    private readonly reservations?: SpawnReservations,
  ) {
    const geometries = createDebrisGeometries();

    const bisleriTexture = createBisleriLabelTexture();
    const colaTexture = createCocaColaLabelTexture();
    const chipsTexture = createChipsWrapperTexture();
    this.generatedTextures.push(bisleriTexture, colaTexture, chipsTexture);

    const bottleMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xe4f5f1,
      roughness: 0.08,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    const bagMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xf1f5ef,
      roughness: 0.48,
      metalness: 0,
      clearcoat: 0.35,
      clearcoatRoughness: 0.5,
      sheen: 0.6,
      sheenColor: new THREE.Color(0xffffff),
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const canMaterial = new THREE.MeshStandardMaterial({
      map: colaTexture,
      color: 0xffffff,
      roughness: 0.34,
      metalness: 0.55,
      side: THREE.FrontSide,
    });
    const wrapperMaterial = new THREE.MeshStandardMaterial({
      map: chipsTexture,
      color: 0xffffff,
      roughness: 0.42,
      metalness: 0.28,
      side: THREE.DoubleSide,
    });
    const cupMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xf5f8f2,
      roughness: 0.12,
      metalness: 0,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const materials: THREE.Material[] = [
      bottleMaterial,
      bagMaterial,
      canMaterial,
      wrapperMaterial,
      cupMaterial,
    ];

    for (let kind = 0; kind < geometries.length; kind += 1) {
      const mesh = new THREE.InstancedMesh(
        geometries[kind],
        materials[kind],
        COINS.maxActive,
      );
      mesh.name = `garbage-${GARBAGE_KINDS[kind]}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = kind === 2 || kind === 3;
      this.debris.push(mesh);
    }

    const addDetail = (
      kind: number,
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      position: THREE.Vector3,
      rotation = new THREE.Euler(),
    ): void => {
      const mesh = new THREE.InstancedMesh(geometry, material, COINS.maxActive);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      const localTransform = new THREE.Matrix4().compose(
        position,
        new THREE.Quaternion().setFromEuler(rotation),
        new THREE.Vector3(1, 1, 1),
      );
      this.detailParts.push({ kind, mesh, localTransform });
      scene.add(mesh);
    };

    const bottleAxis = new THREE.Euler(Math.PI / 2, 0, 0);

    addDetail(
      0,
      new THREE.CylinderGeometry(0.076, 0.076, 0.085, 18),
      new THREE.MeshStandardMaterial({
        color: 0x1d63c8,
        roughness: 0.34,
        metalness: 0.08,
      }),
      new THREE.Vector3(0, 0, 0.588),
      bottleAxis,
    );
    addDetail(
      0,
      new THREE.TorusGeometry(0.072, 0.009, 6, 18),
      new THREE.MeshStandardMaterial({
        color: 0xe8f4ee,
        roughness: 0.3,
        metalness: 0.05,
      }),
      new THREE.Vector3(0, 0, 0.482),
    );
    addDetail(
      0,
      new THREE.CylinderGeometry(0.133, 0.133, 0.22, 28, 1, true),
      new THREE.MeshStandardMaterial({
        map: bisleriTexture,
        color: 0xffffff,
        roughness: 0.42,
        metalness: 0.04,
        side: THREE.DoubleSide,
      }),
      new THREE.Vector3(0, 0, -0.02),
      bottleAxis,
    );

    const canAxis = new THREE.Euler(Math.PI / 2, 0, 0);
    const canLidMaterial = new THREE.MeshStandardMaterial({
      color: 0xd9e0df,
      metalness: 0.8,
      roughness: 0.28,
    });
    const canCapGeometry = new THREE.CylinderGeometry(0.179, 0.179, 0.02, 26);
    addDetail(
      2,
      canCapGeometry,
      canLidMaterial,
      new THREE.Vector3(0, 0, 0.288),
      canAxis,
    );
    addDetail(
      2,
      canCapGeometry,
      canLidMaterial,
      new THREE.Vector3(0, 0, -0.288),
      canAxis,
    );

    const canRimMaterial = new THREE.MeshStandardMaterial({
      color: 0xc6cfce,
      metalness: 0.85,
      roughness: 0.22,
    });
    addDetail(
      2,
      new THREE.TorusGeometry(0.171, 0.014, 6, 22),
      canRimMaterial,
      new THREE.Vector3(0, 0, 0.29),
    );
    addDetail(
      2,
      new THREE.TorusGeometry(0.171, 0.012, 6, 22),
      canRimMaterial,
      new THREE.Vector3(0, 0, -0.29),
    );

    const canTab = new THREE.Shape();
    canTab.absellipse(0, 0, 0.064, 0.034, 0, Math.PI * 2, false);
    const canTabHole = new THREE.Path();
    canTabHole.absellipse(0.012, -0.004, 0.028, 0.016, 0, Math.PI * 2, true);
    canTab.holes.push(canTabHole);
    addDetail(
      2,
      new THREE.ExtrudeGeometry(canTab, {
        depth: 0.012,
        bevelEnabled: true,
        bevelSegments: 1,
        bevelSize: 0.004,
        bevelThickness: 0.003,
      }),
      new THREE.MeshStandardMaterial({
        color: 0xd7e0e0,
        metalness: 0.78,
        roughness: 0.25,
        side: THREE.DoubleSide,
      }),
      new THREE.Vector3(0, 0, 0.306),
    );

    const bagHandle = new THREE.TorusGeometry(0.09, 0.018, 5, 12);
    bagHandle.rotateX(-Math.PI / 2);
    const bagHandleMaterial = new THREE.MeshStandardMaterial({
      color: 0xe9f7f0,
      roughness: 0.46,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.82,
    });
    addDetail(
      1,
      bagHandle,
      bagHandleMaterial,
      new THREE.Vector3(-0.14, 0.04, -0.31),
    );
    addDetail(
      1,
      bagHandle,
      bagHandleMaterial,
      new THREE.Vector3(0.14, 0.04, -0.31),
    );
    const bagFold = new THREE.BufferGeometry();
    bagFold.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          -0.24, 0.008, -0.27,
          -0.06, 0.012, -0.08,
          -0.02, 0.018, 0.27,
          0.18, 0.01, -0.18,
          0.23, 0.015, 0.21,
        ],
        3,
      ),
    );
    bagFold.setIndex([0, 1, 2, 1, 3, 4]);
    bagFold.computeVertexNormals();
    addDetail(
      1,
      bagFold,
      new THREE.MeshStandardMaterial({
        color: 0xf2fff8,
        roughness: 0.42,
        metalness: 0.05,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      }),
      new THREE.Vector3(0, 0.008, 0),
    );

    const cupRimGeometry = new THREE.TorusGeometry(0.141, 0.008, 6, 24);
    cupRimGeometry.rotateX(Math.PI / 2);
    addDetail(
      4,
      cupRimGeometry,
      new THREE.MeshPhysicalMaterial({
        color: 0xf8fbf6,
        roughness: 0.16,
        metalness: 0,
        clearcoat: 0.7,
        transparent: true,
        opacity: 0.6,
      }),
      new THREE.Vector3(0, 0.312, 0),
    );

    this.glowPositions = new Float32Array(COINS.maxActive * 3);
    const glowGeometry = new THREE.BufferGeometry();
    glowGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.glowPositions, 3),
    );
    glowGeometry.setDrawRange(0, 0);

    this.glow = new THREE.Points(
      glowGeometry,
      new THREE.PointsMaterial({
        map: this.glowTexture,
        color: 0xffffff,
        size: 0.56,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.NormalBlending,
        sizeAttenuation: true,
      }),
    );
    this.glow.frustumCulled = false;
    this.glow.visible = false;

    scene.add(...this.debris, this.glow);

    for (let index = COINS.maxActive - 1; index >= 0; index -= 1) {
      this.freeIndices.push(index);
      for (const mesh of this.debris) {
        mesh.setMatrixAt(index, this.hiddenMatrix);
      }
      for (const part of this.detailParts) {
        part.mesh.setMatrixAt(index, this.hiddenMatrix);
      }
    }
    for (const mesh of this.debris) {
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (const part of this.detailParts) {
      part.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  update(
    dt: number,
    time: number,
    playerDistance: number,
    playerX: number,
    difficulty: DifficultyProfile = getDifficultyProfile(0),
  ): void {
    while (
      this.nextPatternDistance < playerDistance + COINS.patternsAhead &&
      this.freeIndices.length > 0
    ) {
      const span = this.spawnPattern(this.nextPatternDistance);
      this.nextPatternDistance +=
        Math.max(span, 8) +
        this.rng.range(
          difficulty.coin.patternGapMin,
          difficulty.coin.patternGapMax,
        );
    }

    let glowCount = 0;

    for (let i = 0; i < this.records.length; i += 1) {
      const record = this.records[i];
      if (!record) continue;

      if (this.magnetActive && !record.collected) {
        applyMagnetPull(
          record,
          playerX,
          playerDistance,
          dt,
          POWERUPS.magnetRadius,
          POWERUPS.magnetPullSpeed,
        );
      }

      const angle =
        record.heading + Math.sin(time * 0.48 + record.phase) * 0.035;
      const bob = Math.sin(time * 1.8 + record.phase) * record.bobAmplitude;
      const x =
        record.x +
        Math.sin(time * 0.4 + record.phase) * record.driftAmplitude;
      const y = record.floatHeight + bob;
      const z =
        -record.distance +
        Math.sin(time * 0.33 + record.phase * 1.3) *
          record.driftAmplitude *
          0.45;
      const dz = Math.abs(z + playerDistance);
      const dx = Math.abs(x - playerX);

      if (
        !record.collected &&
        dz <= Math.max(COINS.collectRadiusZ, 1.65) &&
        dx <= Math.max(COINS.collectRadiusX, 1.4)
      ) {
        this.collectGarbage(record, x, y, z);
      }

      if (
        record.collected ||
        record.distance < playerDistance - COINS.recycleBehind
      ) {
        for (const mesh of this.debris) {
          mesh.setMatrixAt(record.index, this.hiddenMatrix);
        }
        for (const part of this.detailParts) {
          part.mesh.setMatrixAt(record.index, this.hiddenMatrix);
        }
        this.freeIndices.push(record.index);
        this.records[i] = null;
        continue;
      }

      this.setDebrisMatrix(record, x, y, z, angle, time);

      const offset = glowCount * 3;
      this.glowPositions[offset] = x;
      this.glowPositions[offset + 1] = y;
      this.glowPositions[offset + 2] = z;
      glowCount += 1;
    }

    for (const mesh of this.debris) {
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (const part of this.detailParts) {
      part.mesh.instanceMatrix.needsUpdate = true;
    }

    const glowGeometry = this.glow.geometry;
    glowGeometry.setDrawRange(0, glowCount);
    glowGeometry.attributes.position.needsUpdate = true;
  }

  catchNearby(
    playerZ: number,
    playerX: number,
    time: number,
    rangeX: number,
    rangeZ: number,
  ): number {
    let caught = 0;
    for (const record of this.records) {
      if (!record || record.collected) continue;

      const x =
        record.x +
        Math.sin(time * 0.4 + record.phase) * record.driftAmplitude;
      const y =
        record.floatHeight +
        Math.sin(time * 1.8 + record.phase) * record.bobAmplitude;
      const z =
        -record.distance +
        Math.sin(time * 0.33 + record.phase * 1.3) *
          record.driftAmplitude *
          0.45;
      const forwardDistance = playerZ - z;
      if (
        forwardDistance < -0.5 ||
        forwardDistance > rangeZ ||
        Math.abs(x - playerX) > rangeX
      ) {
        continue;
      }

      if (this.collectGarbage(record, x, y, z)) caught += 1;
    }
    return caught;
  }

  setMagnet(active: boolean): void {
    this.magnetActive = active;
  }

  setCoinMultiplier(multiplier: number): void {
    this.coinMultiplier =
      Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  }

  reset(): void {
    for (const record of this.records) {
      if (!record) continue;
      for (const mesh of this.debris) {
        mesh.setMatrixAt(record.index, this.hiddenMatrix);
      }
      for (const part of this.detailParts) {
        part.mesh.setMatrixAt(record.index, this.hiddenMatrix);
      }
    }
    this.records.fill(null);
    this.freeIndices.length = 0;
    for (let index = COINS.maxActive - 1; index >= 0; index -= 1) {
      this.freeIndices.push(index);
    }
    for (const mesh of this.debris) {
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (const part of this.detailParts) {
      part.mesh.instanceMatrix.needsUpdate = true;
    }
    this.glow.geometry.setDrawRange(0, 0);
    this.rng = new Rng(0x51c0ffee);
    this.nextId = 1;
    this.nextPatternDistance = COINS.initialPatternDistance;
    this.magnetActive = false;
    this.coinMultiplier = 1;
  }

  dispose(): void {
    this.scene.remove(
      ...this.debris,
      ...this.detailParts.map((part) => part.mesh),
      this.glow,
    );
    for (const mesh of this.debris) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    const disposedGeometries = new Set<THREE.BufferGeometry>();
    const disposedMaterials = new Set<THREE.Material>();
    for (const part of this.detailParts) {
      if (!disposedGeometries.has(part.mesh.geometry)) {
        part.mesh.geometry.dispose();
        disposedGeometries.add(part.mesh.geometry);
      }
      const material = part.mesh.material as THREE.Material;
      if (!disposedMaterials.has(material)) {
        material.dispose();
        disposedMaterials.add(material);
      }
    }
    for (const texture of this.generatedTextures) {
      texture.dispose();
    }
    this.glow.geometry.dispose();
    (this.glow.material as THREE.Material).dispose();
    this.glowTexture.dispose();
  }

  private collectGarbage(
    record: GarbageRecord,
    x: number,
    y: number,
    z: number,
  ): boolean {
    if (record.collected) return false;

    const amount =
      ECONOMY.coinValue *
      GARBAGE_VALUE_MULTIPLIERS[record.kind] *
      this.coinMultiplier;
    const result = this.economy.apply({
      type: 'coin',
      sourceId: `garbage:${record.id}`,
      amount,
      label: `Collected ${GARBAGE_LABELS[record.kind]}`,
    });
    if (!result.applied) return false;

    record.collected = true;
    this.collectPosition.set(x, y, z);
    this.callbacks.onCollect({
      position: this.collectPosition,
      amount,
      kind: GARBAGE_KINDS[record.kind],
    });
    return true;
  }

  private spawnPattern(baseDistance: number): number {
    const kind = this.rng.int(0, 3);
    const placements: Array<{ offset: number; lane: number; xJitter?: number }> = [];

    if (kind === 0) {
      const lane = this.rng.int(0, 2);
      const count = this.rng.int(5, 8);
      for (let i = 0; i < count; i += 1) {
        placements.push({
          offset: i * this.rng.range(1.9, 2.8),
          lane,
          xJitter: this.rng.range(-0.3, 0.3),
        });
      }
    } else if (kind === 1) {
      let lane = this.rng.int(0, 2);
      let direction = this.rng.chance(0.5) ? -1 : 1;
      const count = this.rng.int(7, 10);
      for (let i = 0; i < count; i += 1) {
        placements.push({
          offset: i * this.rng.range(1.9, 2.8),
          lane,
          xJitter: this.rng.range(-0.35, 0.35),
        });
        if (i % 2 === 1) {
          if (lane + direction < 0 || lane + direction > 2) {
            direction *= -1;
          }
          lane = THREE.MathUtils.clamp(lane + direction, 0, 2);
        }
      }
    } else if (kind === 2) {
      const sequence = [0, 1, 2, 1, 0];
      for (let i = 0; i < sequence.length; i += 1) {
        for (let j = 0; j < 2; j += 1) {
          placements.push({
            offset: (i * 2 + j) * this.rng.range(1.85, 2.7),
            lane: sequence[i],
            xJitter: this.rng.range(-0.3, 0.3),
          });
        }
      }
    } else {
      const count = this.rng.int(4, 6);
      const centerLane = this.rng.int(0, 2);
      for (let i = 0; i < count; i += 1) {
        const lane = THREE.MathUtils.clamp(
          centerLane + this.rng.int(-1, 1),
          0,
          LANES.length - 1,
        );
        placements.push({
          offset: i * this.rng.range(0.7, 1.15),
          lane,
          xJitter: this.rng.range(-0.6, 0.6),
        });
      }
    }

    let maxOffset = 0;
    for (const placement of placements) {
      const distance = baseDistance + placement.offset;
      const x = LANES[placement.lane] + (placement.xJitter ?? 0);
      const spawned = this.spawnGarbage(distance, x, placement.lane);
      if (!spawned) continue;
      maxOffset = Math.max(maxOffset, placement.offset);
    }

    return maxOffset;
  }

  private spawnGarbage(
    distance: number,
    x: number,
    lane: number,
  ): boolean {
    if (
      this.reservations &&
      !this.reservations.isClear(distance, 0.65, [lane], 1.4)
    ) {
      return false;
    }

    for (const active of this.records) {
      if (!active || active.collected) continue;
      if (
        Math.abs(active.distance - distance) < 1.1 &&
        Math.abs(active.x - x) < 0.78
      ) {
        return false;
      }
    }

    const index = this.freeIndices.pop();
    if (index === undefined) return false;

    const id = this.nextId++;
    const kind = this.rng.int(0, GARBAGE_KINDS.length - 1);
    const record: GarbageRecord = {
      index,
      id,
      distance,
      x,
      phase: this.rng.range(0, Math.PI * 2),
      heading: this.rng.range(-Math.PI, Math.PI),
      floatHeight:
        FLOAT_HEIGHTS[kind] + this.rng.range(-0.012, 0.012),
      bobAmplitude: this.rng.range(0.018, 0.045),
      driftAmplitude: this.rng.range(0.025, 0.095),
      kind,
      collected: false,
    };

    this.records[index] = record;
    for (const mesh of this.debris) {
      mesh.setMatrixAt(index, this.hiddenMatrix);
    }
    for (const part of this.detailParts) {
      part.mesh.setMatrixAt(index, this.hiddenMatrix);
    }
    this.setDebrisMatrix(
      record,
      x,
      record.floatHeight,
      -distance,
      record.heading,
      0,
    );
    return true;
  }

  private setDebrisMatrix(
    record: GarbageRecord,
    x: number,
    y: number,
    z: number,
    angle: number,
    time: number,
  ): void {
    const roll = Math.sin(time * 1.7 + record.phase) * 0.09;
    const baseTilt = record.kind === 4 ? 1.26 : 0;
    const transform = this.instanceTransform;
    transform.position.set(x, y, z);
    transform.rotation.set(
      baseTilt + roll,
      angle + Math.sin(time * 0.55 + record.phase) * 0.04,
      Math.cos(time + record.phase) * 0.055 + (record.kind === 4 ? -0.32 : 0),
    );
    transform.scale.setScalar(1.28);

    if (record.kind === 1) {
      transform.scale.set(1.28 * 0.95, 1.28 * 0.82, 1.28 * 0.9);
    } else if (record.kind === 2) {
      transform.scale.multiplyScalar(1.06);
    } else if (record.kind === 4) {
      transform.scale.setScalar(1.14);
    }

    transform.updateMatrix();
    this.debris[record.kind].setMatrixAt(record.index, transform.matrix);
    for (const part of this.detailParts) {
      if (part.kind !== record.kind) continue;
      this.matrix.multiplyMatrices(transform.matrix, part.localTransform);
      part.mesh.setMatrixAt(record.index, this.matrix);
    }
  }
}
