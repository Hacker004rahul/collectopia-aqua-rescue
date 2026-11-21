import * as THREE from 'three';
import { ROAD } from '../../config/balance';
import { Rng } from '../../core/Rng';
import {
  bakeStaticGroupAsSteps,
  bakeStaticGroupSteps,
} from '../../core/bakeStaticGroup';
import { SIGN_CELLS } from '../../assets/proceduralTextures';
import type { ZoneTheme } from '../../config/zones';
import type { StreetMaterials } from './StreetMaterials';

type Side = -1 | 1;

interface BuildContext {
  core: THREE.Group;
  detail: THREE.Group;
  wires: number[];
}

interface MeshOptions {
  cast?: boolean;
  receive?: boolean;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  tile?: number;
  scaleY?: number;
}

const HALF = ROAD.chunkLength / 2;
const ROAD_EDGE = ROAD.width / 2;
const SIDEWALK_INNER = ROAD_EDGE + 0.12;
const SIDEWALK_OUTER = 7.36;
const SIDEWALK_WIDTH = SIDEWALK_OUTER - SIDEWALK_INNER;
const SIDEWALK_MID = (SIDEWALK_INNER + SIDEWALK_OUTER) / 2;
export const RIVER_WIDTH = 17.6;
const RIVER_HALF_WIDTH = RIVER_WIDTH / 2;
const BANK_INNER = RIVER_HALF_WIDTH + 0.08;
const BANK_OUTER = 14.5;
const BANK_WIDTH = BANK_OUTER - BANK_INNER;
const BANK_MID = (BANK_INNER + BANK_OUTER) / 2;
const WALL_X = 10.6;
const FRONT_X = 11.2;
const SIDEWALK_TOP = 0.018;
const LOT_COUNT = 4;
const LOT_WIDTH = ROAD.chunkLength / LOT_COUNT;

const PLASTER_COLORS = [
  0xefd8b2, 0xe9bea1, 0xdda089, 0xe7c578, 0xc7d7bd, 0xaacbc8, 0xd3bdd8,
  0xf0dfbf, 0xd8c7b1, 0xbfd1de, 0xe1b6ae, 0xcdd2a8,
] as const;
const MUTED_COLORS = [
  0xcdbfa6, 0xc2b09a, 0xbdb9ad, 0xb5a98f, 0xcbbba9, 0xaab4ac,
] as const;
const ROOF_COLORS = [0x8e5848, 0x796054, 0x6e7477, 0x9a624d, 0x7d6a58] as const;
const TRIM_COLORS = [0xf2e9d8, 0xeee3ce, 0xdcd1bd, 0xf5efe2] as const;
const DOOR_COLORS = [0x734b32, 0x315e60, 0x485a7a, 0x6c3e36, 0x84633c] as const;
const GATE_COLORS = [0x3e4b4c, 0x5b3d33, 0x365b61, 0x6a5040] as const;
const LEAF_COLORS = [0x4d843f, 0x3f7739, 0x67994c, 0x557f3b, 0x6f9c4a] as const;
const LEAF_SHADOWS = [0x2f5f33, 0x3a6b38, 0x35602f, 0x48793b] as const;
const LEAF_HIGHLIGHTS = [0x86b45c, 0x9ac56a, 0x74a44e] as const;
const FLOWER_COLORS = [0xe77a8a, 0xf2c14e, 0xf4efe6, 0xd88ad6, 0xe9a15a] as const;
const VILLAGE_WALLS = [
  0xf2e6ca, 0xecd9b5, 0xf0e1bf, 0xe7d3ad, 0xe3cba2, 0xefdcc0, 0xdcc9a8,
  0xf3ead7, 0xead2ac, 0xe6d6b8,
] as const;
const TERRACOTTA = [
  0xa65a3c, 0x9b5138, 0xb26543, 0x8f4a34, 0xaf6244, 0x7f4533,
] as const;
const VEHICLE_COLORS = [0x316f98, 0xb6493d, 0x5a8c55, 0xd2a23e, 0x6b6f7a] as const;
const FABRIC_COLORS = [0xe26a48, 0x3d8b83, 0xd8a03f, 0x8e5a8e, 0xe8d9b4] as const;
const CHUNK_WAVE = (Math.PI * 2) / ROAD.chunkLength;

const SHOP_SIGNS = [
  SIGN_CELLS.kirana,
  SIGN_CELLS.generalStore,
  SIGN_CELLS.sweets,
  SIGN_CELLS.medical,
  SIGN_CELLS.tailor,
  SIGN_CELLS.salon,
  SIGN_CELLS.electricals,
  SIGN_CELLS.dairy,
  SIGN_CELLS.mobile,
  SIGN_CELLS.repair,
] as const;

export interface BuiltStreetChunk {
  group: THREE.Group;
  core: THREE.Group;
  detail: THREE.Group;
  far: THREE.Group;
}

export class StreetChunkBuilder {
  constructor(private readonly materials: StreetMaterials) {}

  build(theme: ZoneTheme, variant: number): BuiltStreetChunk {
    const task = this.createBuildTask(theme, variant);
    let step = task.next();
    while (!step.done) {
      step = task.next();
    }
    return step.value;
  }

  /**
   * Frame-sliceable street build. Each yield marks a safe point where the
   * caller can stop and resume without corrupting the generated chunk.
   */
  *createBuildTask(
    theme: ZoneTheme,
    variant: number,
  ): Generator<string, BuiltStreetChunk, void> {
    const rng = new Rng(0x7c011ec7 ^ Math.imul(variant + 1, 0x9e3779b1));
    const context: BuildContext = {
      core: new THREE.Group(),
      detail: new THREE.Group(),
      wires: [],
    };

    this.addGround(context);
    yield 'ground';
    yield* this.addRiverbanksSteps(context, rng);
    if (variant % 3 === 1) {
      this.addBridge(context, rng, -HALF + 11);
      yield 'bridge';
    }

    for (const side of [-1, 1] as const) {
      for (let lotIndex = 0; lotIndex < LOT_COUNT; lotIndex += 1) {
        const startZ = -HALF + lotIndex * LOT_WIDTH;
        const endZ = startZ + LOT_WIDTH;
        yield* this.addLotSteps(
          context,
          rng,
          side,
          startZ,
          endZ,
          lotIndex,
          variant,
          theme,
        );
      }
    }

    this.addDistantScenery(context, rng);
    yield 'distant-scenery';
    this.addTrees(context, rng, theme);
    yield 'trees';
    if (context.wires.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(context.wires, 3),
      );
      const line = new THREE.LineSegments(geometry, this.materials.wire);
      context.detail.add(line);
    }
    yield 'wires';

    const detailMaterials = new Set<THREE.Material>([
      this.materials.metal,
      this.materials.glass,
      this.materials.wood,
      this.materials.fabric,
      this.materials.signAtlas,
    ]);
    for (const object of [...context.core.children]) {
      if (object instanceof THREE.Mesh && detailMaterials.has(object.material)) {
        context.detail.add(object);
      }
    }
    yield 'relocate';

    const bakedFar = yield* bakeStaticGroupAsSteps(
      context.core,
      this.materials.distant,
    );
    yield 'far-bake';
    const bakedCore = yield* bakeStaticGroupSteps(context.core);
    yield 'bake-core';
    const bakedDetail = yield* bakeStaticGroupSteps(context.detail);
    bakedDetail.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) {
        (object as THREE.Mesh).castShadow = false;
      }
    });
    bakedFar.visible = false;

    const group = new THREE.Group();
    group.add(bakedCore, bakedDetail, bakedFar);
    return {
      group,
      core: bakedCore,
      detail: bakedDetail,
      far: bakedFar,
    };
  }

  private addGround(context: BuildContext): void {
    const ground = this.plane(this.materials.grass, 110, ROAD.chunkLength, 8, 8);
    ground.position.y = -0.065;
    ground.receiveShadow = true;
    context.core.add(ground);

  }

  private bankRise(absX: number, z: number): number {
    const t = Math.min(
      1,
      Math.max(0, (absX - BANK_INNER) / (BANK_OUTER - BANK_INNER)),
    );
    const rise = Math.sin(t * Math.PI) * 0.19 + Math.pow(t, 0.72) * 0.035;
    const noise =
      Math.sin(z * CHUNK_WAVE * 2 + absX * 0.55) * 0.026 +
      Math.sin(z * CHUNK_WAVE * 3 - absX * 0.85 + 1.7) * 0.015 +
      Math.sin(z * CHUNK_WAVE * 5 + absX * 1.4 + 0.4) * 0.008;
    return Math.max(0, rise + noise * (0.4 + t * 0.6));
  }

  private bankHeight(absX: number, z: number): number {
    const t = Math.min(
      1,
      Math.max(0, (absX - BANK_INNER) / (BANK_OUTER - BANK_INNER)),
    );
    let y = this.bankRise(absX, z);
    if (t > 0.8) {
      const blend = (t - 0.8) / 0.2;
      y = y * (1 - blend * blend) - 0.072 * blend * blend;
    }
    return y;
  }

  private shoreX(z: number, side: Side): number {
    return (
      BANK_INNER -
      0.26 +
      Math.sin(z * CHUNK_WAVE * 2 + side * 1.1) * 0.2 +
      Math.sin(z * CHUNK_WAVE * 3 - side * 0.6) * 0.1 +
      Math.sin(z * CHUNK_WAVE * 5 + side * 2.3) * 0.045
    );
  }

  private *addRiverbanksSteps(
    context: BuildContext,
    rng: Rng,
  ): Generator<string, void, void> {
    for (const side of [-1, 1] as const) {
      const cols = 12;
      const rows = 24;
      const positions: number[] = [];
      const colors: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];

      for (let row = 0; row <= rows; row += 1) {
        const z = -HALF + (row / rows) * ROAD.chunkLength;
        const inner = this.shoreX(z, side);
        const outer =
          BANK_OUTER +
          0.32 +
          Math.sin(z * CHUNK_WAVE * 2 + side * 2.1) * 0.16;
        for (let col = 0; col <= cols; col += 1) {
          const t = col / cols;
          const absX = inner + (outer - inner) * t;
          const y = this.bankHeight(absX, z);
          positions.push(side * absX, y, z);
          uvs.push(absX / 2.4, z / 2.4);
          const shade =
            0.84 +
            0.1 * (0.5 + 0.5 * Math.sin(absX * 2.1 + z * 1.3 + side));
          const damp = 0.82 + Math.min(1, t * 1.5) * 0.18;
          colors.push(
            shade * damp * 1.02,
            shade * damp * 1.03,
            shade * damp * 0.84,
          );
        }
      }

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const a = row * (cols + 1) + col;
          const b = a + 1;
          const c = a + cols + 1;
          const d = c + 1;
          if (side === 1) {
            indices.push(a, c, b, b, c, d);
          } else {
            indices.push(a, b, c, b, d, c);
          }
        }
      }

      const bankGeometry = new THREE.BufferGeometry();
      bankGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3),
      );
      bankGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      bankGeometry.setAttribute(
        'color',
        new THREE.Float32BufferAttribute(colors, 3),
      );
      bankGeometry.setIndex(indices);
      bankGeometry.computeVertexNormals();
      const bank = new THREE.Mesh(bankGeometry, this.materials.grass);
      bank.receiveShadow = true;
      bank.castShadow = false;
      context.core.add(bank);
      yield 'riverbank-shape';

      const stripRows = 24;
      const stripCols = 2;
      const stripPositions: number[] = [];
      const stripColors: number[] = [];
      const stripUvs: number[] = [];
      const stripIndices: number[] = [];
      for (let row = 0; row <= stripRows; row += 1) {
        const z = -HALF + (row / stripRows) * ROAD.chunkLength;
        const edge = this.shoreX(z, side);
        for (let col = 0; col <= stripCols; col += 1) {
          const t = col / stripCols;
          const absX = edge - 0.3 + t * 0.95;
          const y =
            Math.max(this.bankHeight(absX, z) + 0.018, 0.02) +
            Math.sin(z * CHUNK_WAVE * 7 + col * 1.7) * 0.005;
          stripPositions.push(side * absX, y, z);
          stripUvs.push(absX / 1.5, z / 1.5);
          const tint = 0.78 + t * 0.18;
          stripColors.push(tint, tint * 0.9, tint * 0.72);
        }
      }
      for (let row = 0; row < stripRows; row += 1) {
        for (let col = 0; col < stripCols; col += 1) {
          const a = row * (stripCols + 1) + col;
          const b = a + 1;
          const c = a + stripCols + 1;
          const d = c + 1;
          if (side === 1) {
            stripIndices.push(a, c, b, b, c, d);
          } else {
            stripIndices.push(a, b, c, b, d, c);
          }
        }
      }
      const stripGeometry = new THREE.BufferGeometry();
      stripGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(stripPositions, 3),
      );
      stripGeometry.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute(stripUvs, 2),
      );
      stripGeometry.setAttribute(
        'color',
        new THREE.Float32BufferAttribute(stripColors, 3),
      );
      stripGeometry.setIndex(stripIndices);
      stripGeometry.computeVertexNormals();
      const shoreStrip = new THREE.Mesh(stripGeometry, this.materials.shore);
      shoreStrip.receiveShadow = true;
      shoreStrip.castShadow = false;
      context.core.add(shoreStrip);
      yield 'shoreline-strip';

      const fenceX = BANK_OUTER - 0.32;
      if (rng.chance(0.45)) {
        const postZs: number[] = [];
        for (let post = 0; post <= 9; post += 1) {
          postZs.push(-HALF + 2.4 + post * 4.8 + rng.range(-0.14, 0.14));
        }
        for (let post = 0; post < postZs.length; post += 1) {
          const z = postZs[post];
          const baseY = this.bankHeight(fenceX, z);
          this.box(
            context.core,
            this.materials.wood,
            post % 2 === 0 ? 0x795335 : 0x916b43,
            0.14,
            0.86,
            0.14,
            side * fenceX,
            baseY + 0.4,
            z,
            { cast: false, receive: true, tile: 0 },
          );
          if (post < postZs.length - 1) {
            const nextZ = postZs[post + 1];
            const railZ = (z + nextZ) / 2;
            const railLength = nextZ - z - 0.12;
            const railBase = (baseY + this.bankHeight(fenceX, nextZ)) / 2;
            for (const offset of [0.3, 0.6]) {
              this.box(
                context.core,
                this.materials.wood,
                0x987044,
                0.09,
                0.09,
                railLength,
                side * fenceX,
                railBase + offset,
                railZ,
                { cast: false, receive: true, tile: 0 },
              );
            }
          }
        }
        yield 'riverbank-fence';
      }

      for (let cluster = 0; cluster < 5; cluster += 1) {
        const clusterZ = rng.range(-HALF + 1, HALF - 1);
        for (let rock = 0; rock < rng.int(2, 4); rock += 1) {
          const size = rng.range(0.18, 0.62);
          const absX = rng.range(
            RIVER_HALF_WIDTH + 0.02,
            RIVER_HALF_WIDTH + 0.9,
          );
          this.sphere(
            context.core,
            this.materials.concrete,
            rng.pick([0x9b8b73, 0xb19d7e, 0x857a69, 0xc3aa82] as const),
            size,
            7,
            5,
            side * absX,
            0.02 + size * 0.22,
            clusterZ + rng.range(-0.7, 0.7),
            { scaleY: rng.range(0.45, 0.75), cast: false, receive: true },
          );
        }
        if (cluster % 2 === 0) yield 'riverbank-rocks';
      }

      for (let pebble = 0; pebble < 16; pebble += 1) {
        const size = rng.range(0.05, 0.16);
        const absX = rng.range(RIVER_HALF_WIDTH - 0.1, BANK_INNER + 0.85);
        const z = rng.range(-HALF, HALF);
        this.sphere(
          context.core,
          this.materials.concrete,
          rng.pick([0x9a8d78, 0xb0a186, 0x8b8172] as const),
          size,
          6,
          4,
          side * absX,
          Math.max(0.02, this.bankHeight(absX, z) * 0.5) + size * 0.4,
          z,
          { scaleY: 0.5, cast: false, receive: true },
        );
      }

      for (let clump = 0; clump < 20; clump += 1) {
        const absX = rng.range(BANK_INNER + 0.15, BANK_OUTER - 0.5);
        const z = rng.range(-HALF, HALF);
        const baseY = this.bankHeight(absX, z);
        const height = rng.range(0.3, 0.78);
        for (let blade = 0; blade < 4; blade += 1) {
          this.box(
            context.core,
            this.materials.foliage,
            rng.pick([0x78a94b, 0x91b85a, 0x4f8d48, 0xb2bd5d] as const),
            0.07,
            height * rng.range(0.6, 1),
            0.055,
            side * (absX + rng.range(-0.14, 0.14)),
            baseY + height * 0.4,
            z + rng.range(-0.14, 0.14),
            { cast: false, receive: false, tile: 0, rotZ: rng.range(-0.3, 0.3) },
          );
        }
        if (clump % 5 === 4) yield 'riverbank-grass';
      }

      for (let flower = 0; flower < 5; flower += 1) {
        const absX = rng.range(BANK_INNER + 0.9, BANK_OUTER - 0.7);
        const z = rng.range(-HALF, HALF);
        const baseY = this.bankHeight(absX, z);
        const height = rng.range(0.35, 0.62);
        this.cylinder(
          context.core,
          this.materials.foliage,
          0x5d8a45,
          0.014,
          0.022,
          height,
          5,
          side * absX,
          baseY + height / 2,
          z,
          { cast: false, receive: false },
        );
        this.sphere(
          context.core,
          this.materials.foliage,
          rng.pick([0xe77a8a, 0xf2c14e, 0xf4efe6, 0xd88ad6, 0xe9a15a] as const),
          rng.range(0.08, 0.13),
          7,
          5,
          side * absX,
          baseY + height + 0.04,
          z,
          { cast: false, receive: false, scaleY: 0.8 },
        );
      }

      for (let bush = 0; bush < 4; bush += 1) {
        const absX = rng.range(BANK_INNER + 1.6, BANK_OUTER - 0.6);
        const z = rng.range(-HALF, HALF);
        const baseY = this.bankHeight(absX, z);
        const radius = rng.range(0.42, 0.72);
        this.sphere(
          context.core,
          this.materials.foliage,
          rng.pick(LEAF_COLORS),
          radius,
          8,
          6,
          side * absX,
          baseY + radius * 0.62,
          z,
          { scaleY: 0.82, cast: true, receive: true },
        );
        this.sphere(
          context.core,
          this.materials.foliage,
          rng.pick(LEAF_HIGHLIGHTS),
          radius * 0.62,
          7,
          5,
          side * (absX + rng.range(-0.45, 0.45)),
          baseY + radius * 0.95,
          z + rng.range(-0.45, 0.45),
          { scaleY: 0.85, cast: false, receive: true },
        );
      }

      for (let pad = 0; pad < 5; pad += 1) {
        const radius = rng.range(0.16, 0.34);
        this.cylinder(
          context.core,
          this.materials.foliage,
          rng.pick([0x3f6b3a, 0x517d3f, 0x5f8c47] as const),
          radius,
          radius * 0.95,
          0.018,
          8,
          side * rng.range(RIVER_HALF_WIDTH - 1.5, RIVER_HALF_WIDTH - 0.3),
          0.05,
          rng.range(-HALF, HALF),
          { cast: false, receive: false },
        );
      }
      yield 'riverbank-vegetation';
    }
  }

  private addBridge(context: BuildContext, rng: Rng, z: number): void {
    const span = RIVER_HALF_WIDTH * 2 + 2.6;
    const deckY = 6.6;
    const deckDepth = 3.0;
    const stoneColors = [0x9c9184, 0x8c8378, 0xa89c8b] as const;

    for (const side of [-1, 1] as const) {
      const abutmentX = side * (RIVER_HALF_WIDTH + 0.65);
      this.box(
        context.core,
        this.materials.concrete,
        rng.pick(stoneColors),
        1.5,
        deckY,
        deckDepth + 0.9,
        abutmentX,
        deckY / 2 - 0.05,
        z,
        { cast: true, receive: true, tile: 1.2 },
      );
      this.box(
        context.core,
        this.materials.concrete,
        0xb0a391,
        1.9,
        0.3,
        deckDepth + 1.2,
        abutmentX,
        deckY - 0.18,
        z,
        { cast: false, receive: true, tile: 1.2 },
      );
    }

    for (const side of [-1, 1] as const) {
      const pierX = side * 5.5;
      this.cylinder(
        context.core,
        this.materials.concrete,
        rng.pick(stoneColors),
        0.62,
        0.78,
        deckY - 0.45,
        8,
        pierX,
        (deckY - 0.45) / 2,
        z,
        { cast: true, receive: true },
      );
      this.box(
        context.core,
        this.materials.concrete,
        0xa79a88,
        1.3,
        0.35,
        deckDepth + 0.4,
        pierX,
        0.18,
        z,
        { cast: false, receive: true, tile: 1.1 },
      );
    }

    const archSegments = 10;
    const archSpan = 11.0;
    for (let segment = 0; segment < archSegments; segment += 1) {
      const t0 = segment / archSegments;
      const t1 = (segment + 1) / archSegments;
      const tm = (t0 + t1) / 2;
      const y0 = deckY - 1.95 + Math.sin(t0 * Math.PI) * 1.5;
      const y1 = deckY - 1.95 + Math.sin(t1 * Math.PI) * 1.5;
      const x0 = -archSpan / 2 + t0 * archSpan;
      const x1 = -archSpan / 2 + t1 * archSpan;
      const angle = Math.atan2(y1 - y0, x1 - x0);
      this.box(
        context.core,
        this.materials.concrete,
        rng.pick(stoneColors),
        Math.hypot(x1 - x0, y1 - y0) + 0.08,
        0.44,
        deckDepth - 0.25,
        (x0 + x1) / 2,
        (y0 + y1) / 2,
        z,
        { cast: false, receive: true, tile: 0, rotZ: angle },
      );
      if (segment === 4 || segment === 5) {
        this.box(
          context.core,
          this.materials.concrete,
          0xb6aa97,
          0.42,
          0.55,
          deckDepth - 0.15,
          (x0 + x1) / 2,
          Math.max(y0, y1) + 0.3 * Math.sin(tm * Math.PI),
          z,
          { cast: false, receive: true, tile: 0, rotZ: angle },
        );
      }
    }

    this.box(
      context.core,
      this.materials.wood,
      0x8c6540,
      span,
      0.22,
      deckDepth,
      0,
      deckY,
      z,
      { cast: true, receive: true, tile: 0.8 },
    );

    for (let plank = -6; plank <= 6; plank += 1) {
      this.box(
        context.core,
        this.materials.wood,
        plank % 2 === 0 ? 0xb18858 : 0x9a744b,
        span - 0.35,
        0.04,
        0.2,
        0,
        deckY + 0.13,
        z + plank * 0.22,
        { cast: false, receive: false, tile: 0 },
      );
    }

    for (const side of [-1, 1] as const) {
      const railX = side * (span / 2 - 0.22);
      for (const postZ of [-1.1, -0.37, 0.37, 1.1]) {
        this.box(
          context.core,
          this.materials.wood,
          0x765638,
          0.16,
          1.02,
          0.16,
          railX,
          deckY + 0.58,
          z + postZ,
          { cast: false, receive: true, tile: 0 },
        );
      }
      for (const railY of [deckY + 0.5, deckY + 0.94]) {
        this.box(
          context.core,
          this.materials.wood,
          0x5e4936,
          0.1,
          0.1,
          deckDepth - 0.18,
          railX,
          railY,
          z,
          { cast: false, receive: true, tile: 0 },
        );
      }
      for (const postZ of [-1, 1]) {
        this.box(
          context.core,
          this.materials.concrete,
          0xa79a88,
          0.38,
          1.35,
          0.38,
          railX,
          deckY + 0.58,
          z + postZ * (deckDepth / 2 - 0.16),
          { cast: false, receive: true, tile: 1 },
        );
      }
    }
  }

  private addSidewalks(context: BuildContext, rng: Rng): void {
    for (const side of [-1, 1] as const) {
      this.box(
        context.core,
        this.materials.paver,
        0xffffff,
        SIDEWALK_WIDTH,
        SIDEWALK_TOP,
        ROAD.chunkLength,
        side * SIDEWALK_MID,
        SIDEWALK_TOP / 2,
        0,
        { cast: false, receive: true, tile: 1.45 },
      );

      this.box(
        context.core,
        this.materials.concrete,
        0xd5ccbb,
        0.2,
        0.25,
        ROAD.chunkLength,
        side * (ROAD_EDGE + 0.1),
        0.125,
        0,
        { cast: true, receive: true, tile: 1.5 },
      );

      this.box(
        context.core,
        this.materials.concrete,
        0x817768,
        0.16,
        0.035,
        ROAD.chunkLength,
        side * (SIDEWALK_OUTER - 0.08),
        SIDEWALK_TOP + 0.018,
        0,
        { cast: false, receive: true, tile: 0 },
      );

      for (let z = -HALF + 12; z < HALF; z += 16) {
        const grateZ = z + rng.range(-2, 2);
        this.box(
          context.detail,
          this.materials.metal,
          0x303633,
          0.34,
          0.018,
          0.72,
          side * (ROAD_EDGE - 0.03),
          0.025,
          grateZ,
          { cast: false, receive: true, tile: 0 },
        );
        for (let slot = -1; slot <= 1; slot += 1) {
          this.box(
            context.detail,
            this.materials.concrete,
            0x232826,
            0.26,
            0.008,
            0.055,
            side * (ROAD_EDGE - 0.03),
            0.037,
            grateZ + slot * 0.18,
            { cast: false, receive: false, tile: 0 },
          );
        }
      }
    }

    this.cylinder(
      context.detail,
      this.materials.metal,
      0x3e4442,
      0.34,
      0.34,
      0.018,
      12,
      -2.5,
      0.023,
      -HALF + 7,
      { cast: false, receive: true },
    );
    this.cylinder(
      context.detail,
      this.materials.metal,
      0x3e4442,
      0.34,
      0.34,
      0.018,
      12,
      2.7,
      0.023,
      HALF - 8,
      { cast: false, receive: true },
    );
  }

  private *addMarkingsSteps(context: BuildContext): Generator<string, void, void> {
    for (const side of [-1, 1] as const) {
      this.box(
        context.core,
        this.materials.marking,
        0xffffff,
        0.075,
        0.012,
        ROAD.chunkLength - 1,
        side * (ROAD_EDGE - 0.24),
        0.017,
        0,
        { cast: false, receive: false, tile: 0 },
      );
    }
    yield 'markings-edges';

    for (const x of [-1.35, 1.35]) {
      for (let z = -HALF + 2.4; z < HALF - 1.5; z += 5.4) {
        this.box(
          context.core,
          this.materials.marking,
          0xffffff,
          0.09,
          0.012,
          2.25,
          x,
          0.017,
          z,
          { cast: false, receive: false, tile: 0 },
        );
      }
      yield 'markings-lane';
    }
  }

  private addRoadWear(context: BuildContext, rng: Rng, theme: ZoneTheme): void {
    const potholes = theme.id === 'construction' ? 3 : 2;
    for (let index = 0; index < potholes; index += 1) {
      this.addPothole(
        context,
        rng,
        rng.range(-ROAD_EDGE + 0.7, ROAD_EDGE - 0.7),
        rng.range(-HALF + 5, HALF - 5),
        rng.range(0.32, 0.62),
      );
    }

    const repairCount = theme.id === 'construction' ? 4 : 2;
    for (let index = 0; index < repairCount; index += 1) {
      const x = rng.range(-ROAD_EDGE + 0.5, ROAD_EDGE - 0.5);
      const z = rng.range(-HALF + 4, HALF - 4);
      const width = rng.range(0.45, 1.5);
      const depth = rng.range(0.16, 0.36);
      this.box(
        context.core,
        this.materials.roadPatch,
        0x3a3c3d,
        width,
        0.007,
        depth,
        x,
        0.013,
        z,
        { cast: false, receive: true, tile: 0, rotY: rng.range(-0.3, 0.3) },
      );
      this.box(
        context.core,
        this.materials.roadPatch,
        0x46474a,
        Math.max(0.18, width * 0.62),
        0.008,
        0.07,
        x + rng.range(-0.2, 0.2),
        0.014,
        z + rng.range(-0.24, 0.24),
        { cast: false, receive: true, tile: 0, rotY: rng.range(-0.8, 0.8) },
      );
    }

    if (theme.id === 'construction') {
      const side = rng.chance(0.5) ? -1 : 1;
      const trenchZ = rng.range(-HALF + 8, HALF - 8);
      const trenchX = side * (ROAD_EDGE - 1.05);
      this.box(
        context.core,
        this.materials.roadPatch,
        0x2f3032,
        1.15,
        0.008,
        3.6,
        trenchX,
        0.012,
        trenchZ,
        { cast: false, receive: true, tile: 0 },
      );
      for (let edge = 0; edge < 8; edge += 1) {
        this.box(
          context.core,
          this.materials.concrete,
          rng.chance(0.5) ? 0x7b7366 : 0x9a8f7d,
          rng.range(0.16, 0.34),
          0.022,
          rng.range(0.18, 0.34),
          trenchX - 0.62 + edge * 0.18,
          0.018,
          trenchZ + rng.range(-1.8, 1.8),
          { cast: false, receive: true, tile: 0, rotY: rng.range(-0.6, 0.6) },
        );
      }
    }
  }

  private addPothole(
    context: BuildContext,
    rng: Rng,
    x: number,
    z: number,
    radius: number,
  ): void {
    const blobs = rng.int(2, 3);
    for (let blob = 0; blob < blobs; blob += 1) {
      this.cylinder(
        context.core,
        this.materials.roadPatch,
        0x292b2d,
        radius * rng.range(0.68, 1),
        radius * rng.range(0.8, 1.05),
        0.008,
        9,
        x + rng.range(-radius * 0.36, radius * 0.36),
        0.0125,
        z + rng.range(-radius * 0.36, radius * 0.36),
        { cast: false, receive: true },
      );
    }

    const rimSegments = 6;
    for (let segment = 0; segment < rimSegments; segment += 1) {
      const angle = (segment / rimSegments) * Math.PI * 2 + rng.range(-0.18, 0.18);
      this.box(
        context.core,
        this.materials.concrete,
        rng.chance(0.5) ? 0x6a6257 : 0x81786a,
        rng.range(0.14, 0.26),
        0.014,
        rng.range(0.1, 0.2),
        x + Math.cos(angle) * radius * 1.03,
        0.014,
        z + Math.sin(angle) * radius * 1.03,
        { cast: false, receive: true, tile: 0, rotY: angle },
      );
    }

    for (let crack = 0; crack < 2; crack += 1) {
      const angle = rng.range(-Math.PI, Math.PI);
      this.box(
        context.core,
        this.materials.roadPatch,
        0x282a2b,
        rng.range(0.45, 1.0),
        0.004,
        0.045,
        x + Math.cos(angle) * radius * 1.3,
        0.014,
        z + Math.sin(angle) * radius * 1.3,
        { cast: false, receive: true, tile: 0, rotY: angle },
      );
    }
  }

  private *addLotSteps(
    context: BuildContext,
    rng: Rng,
    side: Side,
    startZ: number,
    endZ: number,
    lotIndex: number,
    variant: number,
    theme: ZoneTheme,
  ): Generator<string, void, void> {
    const centerZ = (startZ + endZ) / 2;
    const hasHouse = rng.chance(0.82);
    if (hasHouse) {
      this.addRiversideHouse(
        context,
        rng,
        side,
        centerZ + rng.range(-1.6, 1.6),
      );
    }
    if (rng.chance(0.48)) {
      this.addRiversideHouse(
        context,
        rng,
        side,
        centerZ + rng.range(-2.4, 2.4),
        { background: true },
      );
    } else if (!hasHouse) {
      this.addGardenPlot(context, rng, side, centerZ);
    }

    for (let clump = 0; clump < 3; clump += 1) {
      this.addReeds(
        context,
        rng,
        side * rng.range(RIVER_HALF_WIDTH + 0.3, RIVER_HALF_WIDTH + 1.8),
        rng.range(startZ + 0.5, endZ - 0.5),
      );
    }

    for (let flower = 0; flower < 2; flower += 1) {
      const absX = rng.range(BANK_INNER + 0.4, BANK_OUTER - 1);
      const z = rng.range(startZ + 0.6, endZ - 0.6);
      const baseY = this.bankHeight(absX, z);
      const height = rng.range(0.32, 0.55);
      this.cylinder(
        context.core,
        this.materials.foliage,
        0x5d8a45,
        0.013,
        0.02,
        height,
        5,
        side * absX,
        baseY + height / 2,
        z,
        { cast: false, receive: false },
      );
      this.sphere(
        context.core,
        this.materials.foliage,
        rng.pick(FLOWER_COLORS),
        rng.range(0.09, 0.14),
        7,
        5,
        side * absX,
        baseY + height,
        z,
        { cast: false, receive: false, scaleY: 0.8 },
      );
    }

    if ((lotIndex + variant) % 2 === 0 && rng.chance(0.6)) {
      const absX = rng.range(RIVER_HALF_WIDTH + 2.5, BANK_OUTER - 0.7);
      const shrubZ = rng.range(startZ + 1, endZ - 1);
      const baseY = this.bankHeight(absX, shrubZ);
      const radius = rng.range(0.45, 0.78);
      this.sphere(
        context.core,
        this.materials.foliage,
        rng.pick(LEAF_COLORS),
        radius,
        8,
        6,
        side * absX,
        baseY + radius * 0.55,
        shrubZ,
        { scaleY: 0.72, cast: true, receive: true },
      );
    }

    yield 'riverside-lot';
  }

  private gableRoof(
    parent: THREE.Object3D,
    roofColor: number,
    gableColor: number,
    width: number,
    depth: number,
    height: number,
    x: number,
    y: number,
    z: number,
  ): void {
    const halfW = width / 2;
    const halfD = depth / 2;
    const roofGeometry = new THREE.BufferGeometry();
    roofGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          -halfW, 0, -halfD,
          -halfW, 0, halfD,
          0, height, -halfD,
          0, height, halfD,
          halfW, 0, -halfD,
          halfW, 0, halfD,
        ],
        3,
      ),
    );
    roofGeometry.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(
        [0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 1],
        2,
      ),
    );
    roofGeometry.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4]);
    setVertexColor(roofGeometry, roofColor);
    roofGeometry.computeVertexNormals();
    const roof = new THREE.Mesh(roofGeometry, this.materials.roof);
    roof.position.set(x, y, z);
    roof.castShadow = true;
    roof.receiveShadow = true;
    parent.add(roof);

    const gableGeometry = new THREE.BufferGeometry();
    gableGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          -halfW, 0, -halfD,
          0, height, -halfD,
          halfW, 0, -halfD,
          -halfW, 0, halfD,
          halfW, 0, halfD,
          0, height, halfD,
        ],
        3,
      ),
    );
    gableGeometry.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(
        [0, 0, 0.5, 1, 1, 0, 0, 0, 1, 0, 0.5, 1],
        2,
      ),
    );
    gableGeometry.setIndex([0, 1, 2, 3, 4, 5]);
    setVertexColor(gableGeometry, gableColor);
    gableGeometry.computeVertexNormals();
    const gable = new THREE.Mesh(gableGeometry, this.materials.plaster);
    gable.position.set(x, y, z);
    gable.castShadow = true;
    gable.receiveShadow = true;
    parent.add(gable);

    const ridgeColor = new THREE.Color(roofColor)
      .multiplyScalar(0.72)
      .getHex();
    this.box(
      parent,
      this.materials.roof,
      ridgeColor,
      0.2,
      0.13,
      depth + 0.06,
      x,
      y + height - 0.02,
      z,
      { cast: false, receive: true, tile: 0 },
    );
  }

  private addGardenPlot(
    context: BuildContext,
    rng: Rng,
    side: Side,
    z: number,
  ): void {
    const baseX = BANK_OUTER + 0.7;
    for (let bush = 0; bush < 5; bush += 1) {
      const absX = rng.range(baseX, baseX + 3.2);
      const bz = z + rng.range(-3.6, 3.6);
      const radius = rng.range(0.4, 0.7);
      this.sphere(
        context.core,
        this.materials.foliage,
        rng.pick(LEAF_COLORS),
        radius,
        8,
        6,
        side * absX,
        this.bankHeight(absX, bz) + radius * 0.6,
        bz,
        { scaleY: 0.85, cast: true, receive: true },
      );
    }
    for (let flower = 0; flower < 4; flower += 1) {
      const absX = rng.range(baseX, baseX + 3);
      const fz = z + rng.range(-3.4, 3.4);
      const baseY = this.bankHeight(absX, fz);
      const height = rng.range(0.32, 0.55);
      this.cylinder(
        context.core,
        this.materials.foliage,
        0x5d8a45,
        0.013,
        0.02,
        height,
        5,
        side * absX,
        baseY + height / 2,
        fz,
        { cast: false, receive: false },
      );
      this.sphere(
        context.core,
        this.materials.foliage,
        rng.pick(FLOWER_COLORS),
        rng.range(0.08, 0.14),
        7,
        5,
        side * absX,
        baseY + height,
        fz,
        { cast: false, receive: false, scaleY: 0.8 },
      );
    }
    for (let stone = 0; stone < 4; stone += 1) {
      this.box(
        context.core,
        this.materials.concrete,
        0xbcae97,
        0.55,
        0.04,
        0.45,
        side * (BANK_OUTER + 0.4 + stone * 0.62),
        -0.045,
        z + rng.range(-0.35, 0.35),
        { cast: false, receive: true, tile: 1 },
      );
    }
  }

  private addRiversideHouse(
    context: BuildContext,
    rng: Rng,
    side: Side,
    z: number,
    options: { background?: boolean } = {},
  ): void {
    const background = options.background ?? false;
    const width = rng.range(3.5, 4.8);
    const depth = rng.range(3.6, 5);
    const groundH = rng.range(2.3, 2.75);
    const twoStorey = !background && rng.chance(0.18);
    const upperH = twoStorey ? rng.range(2.1, 2.45) : 0;
    const wallH = groundH + upperH;
    const wallColor = rng.pick(VILLAGE_WALLS);
    const trimColor = rng.pick(TRIM_COLORS);
    const roofColor = rng.pick(TERRACOTTA);
    const setback = background ? rng.range(7.2, 9.2) : rng.range(0.9, 1.9);
    const riverFaceX = side * (BANK_OUTER + setback);
    const centerX = riverFaceX + side * (width / 2);
    const plinthH = 0.3;
    const base = plinthH - 0.02;
    const windowOffset = Math.min(1.35, depth / 2 - 0.62);

    this.box(
      context.core,
      this.materials.plaster,
      wallColor,
      width + 0.28,
      plinthH + 0.06,
      depth + 0.28,
      centerX,
      plinthH / 2 - 0.045,
      z,
      { cast: true, receive: true, tile: 0.9 },
    );

    this.box(
      context.core,
      this.materials.plaster,
      wallColor,
      width,
      wallH,
      depth,
      centerX,
      base + wallH / 2,
      z,
      { cast: true, receive: true, tile: 1 },
    );

    if (twoStorey) {
      this.box(
        context.core,
        this.materials.concrete,
        trimColor,
        width + 0.14,
        0.13,
        depth + 0.14,
        centerX,
        base + groundH,
        z,
        { cast: false, receive: true, tile: 1 },
      );
    }

    const roofH = width * 0.3 + 0.18;
    this.gableRoof(
      context.core,
      roofColor,
      wallColor,
      width + 0.7,
      depth + 0.8,
      roofH,
      centerX,
      base + wallH,
      z,
    );

    if (rng.chance(0.5)) {
      this.box(
        context.core,
        this.materials.concrete,
        0x9b8f80,
        0.28,
        0.9,
        0.28,
        centerX + side * width * 0.18,
        base + wallH + roofH * 0.5,
        z + depth * 0.2,
        { cast: true, receive: true, tile: 1 },
      );
    }

    const doorHeight = 1.55;
    const doorX = riverFaceX - side * 0.045;
    this.box(
      context.core,
      this.materials.wood,
      rng.pick(DOOR_COLORS),
      0.09,
      doorHeight,
      0.7,
      doorX,
      base + doorHeight / 2,
      z,
      { cast: false, receive: true, tile: 0 },
    );
    for (const offset of [-0.43, 0.43]) {
      this.box(
        context.core,
        this.materials.plaster,
        trimColor,
        0.14,
        doorHeight + 0.16,
        0.11,
        doorX,
        base + doorHeight / 2,
        z + offset,
        { cast: false, receive: true, tile: 0 },
      );
    }
    this.box(
      context.core,
      this.materials.plaster,
      trimColor,
      0.14,
      0.14,
      0.98,
      doorX,
      base + doorHeight + 0.08,
      z,
      { cast: false, receive: true, tile: 0 },
    );
    this.sphere(
      context.core,
      this.materials.metal,
      0xb08d54,
      0.035,
      6,
      4,
      doorX - side * 0.05,
      base + 0.95,
      z + 0.2,
      { cast: false, receive: false },
    );

    const hasVeranda = !background && rng.chance(0.62);
    if (hasVeranda) {
      this.box(
        context.core,
        this.materials.concrete,
        0xbcae97,
        0.42,
        0.16,
        1.1,
        riverFaceX - side * 1.42,
        0.08,
        z,
        { cast: false, receive: true, tile: 1 },
      );
      this.box(
        context.core,
        this.materials.concrete,
        0xb0a28b,
        0.42,
        0.16,
        1.2,
        riverFaceX - side * 1.78,
        -0.02,
        z,
        { cast: false, receive: true, tile: 1 },
      );
    } else {
      this.box(
        context.core,
        this.materials.concrete,
        0xbcae97,
        0.42,
        0.18,
        1.1,
        riverFaceX - side * 0.36,
        0.19,
        z,
        { cast: false, receive: true, tile: 1 },
      );
      this.box(
        context.core,
        this.materials.concrete,
        0xb0a28b,
        0.42,
        0.18,
        1.2,
        riverFaceX - side * 0.76,
        0.02,
        z,
        { cast: false, receive: true, tile: 1 },
      );
    }

    if (!background) {
      this.box(
        context.core,
        this.materials.roof,
        roofColor,
        0.95,
        0.08,
        1.3,
        riverFaceX - side * 0.4,
        base + doorHeight + 0.34,
        z,
        { cast: false, receive: false, rotZ: side * 0.16, tile: 0.8 },
      );
      for (const offset of [-0.5, 0.5]) {
        this.box(
          context.core,
          this.materials.wood,
          0x765638,
          0.06,
          0.3,
          0.06,
          riverFaceX - side * 0.78,
          base + doorHeight + 0.16,
          z + offset,
          { cast: false, receive: false, tile: 0 },
        );
      }
    }

    const paneColors = [0x6ea6ab, 0x87b3bb, 0x9cc3b8, 0x7d9fb8] as const;
    const addWindow = (
      wy: number,
      wz: number,
      paneColor: number,
      shutters: boolean,
      flowers: boolean,
    ): void => {
      const wx = riverFaceX - side * 0.02;
      this.box(
        context.core,
        this.materials.plaster,
        trimColor,
        0.1,
        0.9,
        0.88,
        wx,
        wy,
        wz,
        { cast: false, receive: true, tile: 0 },
      );
      this.box(
        context.core,
        this.materials.glass,
        paneColor,
        0.06,
        0.66,
        0.7,
        riverFaceX - side * 0.055,
        wy,
        wz,
        { cast: false, receive: false, tile: 0 },
      );
      this.box(
        context.core,
        this.materials.concrete,
        0xd8cdb9,
        0.2,
        0.08,
        0.96,
        riverFaceX - side * 0.06,
        wy - 0.48,
        wz,
        { cast: false, receive: true, tile: 0 },
      );
      this.box(
        context.core,
        this.materials.wood,
        0x8c6540,
        0.08,
        0.66,
        0.05,
        riverFaceX - side * 0.07,
        wy,
        wz,
        { cast: false, receive: false, tile: 0 },
      );
      if (shutters) {
        for (const dir of [-1, 1] as const) {
          this.box(
            context.core,
            this.materials.wood,
            rng.pick([0x5b4636, 0x6c4f39, 0x46605c] as const),
            0.045,
            0.86,
            0.32,
            riverFaceX - side * 0.045,
            wy,
            wz + dir * 0.6,
            { cast: false, receive: true, tile: 0, rotY: dir * 0.16 },
          );
        }
      }
      if (flowers) {
        this.box(
          context.core,
          this.materials.wood,
          0x8a5a38,
          0.24,
          0.16,
          0.76,
          riverFaceX - side * 0.16,
          wy - 0.62,
          wz,
          { cast: false, receive: true, tile: 0 },
        );
        for (let flower = 0; flower < 3; flower += 1) {
          this.sphere(
            context.core,
            this.materials.foliage,
            rng.pick(FLOWER_COLORS),
            0.07,
            6,
            4,
            riverFaceX - side * 0.18,
            wy - 0.5,
            wz + (flower - 1) * 0.2,
            { cast: false, receive: false, scaleY: 0.8 },
          );
        }
      }
    };

    const windowY = base + 1.5;
    addWindow(windowY, z - windowOffset, rng.pick(paneColors), rng.chance(0.5), !background && rng.chance(0.5));
    addWindow(windowY, z + windowOffset, rng.pick(paneColors), rng.chance(0.5), !background && rng.chance(0.5));
    if (twoStorey) {
      const upperY = base + groundH + 1.3;
      addWindow(upperY, z - windowOffset * 0.85, rng.pick(paneColors), true, false);
      addWindow(upperY, z + windowOffset * 0.85, rng.pick(paneColors), true, false);

      const balconyY = base + groundH + 0.05;
      this.box(
        context.core,
        this.materials.wood,
        0x9a744b,
        1.05,
        0.12,
        depth * 0.7,
        riverFaceX - side * 0.52,
        balconyY,
        z,
        { cast: true, receive: true, tile: 0 },
      );
      this.box(
        context.core,
        this.materials.wood,
        0x765638,
        0.09,
        1.45,
        0.6,
        riverFaceX - side * 0.03,
        balconyY + 0.78,
        z,
        { cast: false, receive: true, tile: 0 },
      );
      for (const dir of [-1, 1] as const) {
        for (const railY of [0.34, 0.66]) {
          this.box(
            context.core,
            this.materials.wood,
            0x5e4936,
            0.08,
            0.08,
            depth * 0.66,
            riverFaceX - side * 0.98,
            balconyY + railY,
            z,
            { cast: false, receive: true, tile: 0 },
          );
        }
        for (const postZ of [-depth * 0.3, depth * 0.3]) {
          this.box(
            context.core,
            this.materials.wood,
            0x765638,
            0.09,
            0.72,
            0.09,
            riverFaceX - side * 0.98,
            balconyY + 0.36,
            z + postZ,
            { cast: false, receive: true, tile: 0 },
          );
        }
      }
    }

    if (hasVeranda) {
      const platformY = 0.19;
      const platformDepth = 1.15;
      const verandaDepth = depth * 0.87;
      const platformX = riverFaceX - side * (platformDepth / 2 - 0.02);
      const verandaRoofY = base + groundH - 0.24;
      this.box(
        context.core,
        this.materials.wood,
        0x9a744b,
        platformDepth,
        0.12,
        verandaDepth,
        platformX,
        platformY,
        z,
        { cast: true, receive: true, tile: 0 },
      );
      for (const dir of [-1, 1] as const) {
        this.box(
          context.core,
          this.materials.wood,
          0x765638,
          0.11,
          verandaRoofY - platformY,
          0.11,
          riverFaceX - side * (platformDepth - 0.12),
          (platformY + verandaRoofY) / 2,
          z + dir * (verandaDepth / 2 - 0.2),
          { cast: false, receive: true, tile: 0 },
        );
      }
      for (const railY of [0.36, 0.62]) {
        this.box(
          context.core,
          this.materials.wood,
          0x5e4936,
          0.08,
          0.08,
          verandaDepth - 0.2,
          riverFaceX - side * (platformDepth - 0.1),
          platformY + railY,
          z,
          { cast: false, receive: true, tile: 0 },
        );
      }
      for (const post of [-1, 0, 1] as const) {
        this.box(
          context.core,
          this.materials.wood,
          0x765638,
          0.09,
          0.7,
          0.09,
          riverFaceX - side * (platformDepth - 0.1),
          platformY + 0.35,
          z + post * verandaDepth * 0.32,
          { cast: false, receive: true, tile: 0 },
        );
      }
      this.box(
        context.core,
        this.materials.roof,
        roofColor,
        1.6,
        0.09,
        verandaDepth + 0.3,
        riverFaceX - side * 0.68,
        verandaRoofY,
        z,
        { cast: false, receive: true, rotZ: side * 0.14, tile: 0.9 },
      );
      for (const dir of [-1, 1] as const) {
        this.cylinder(
          context.core,
          this.materials.plaster,
          0x9a7a56,
          0.16,
          0.2,
          0.32,
          7,
          riverFaceX - side * (platformDepth - 0.15),
          platformY + 0.18,
          z + dir * (verandaDepth / 2 - 0.35),
          { cast: false, receive: true },
        );
        this.sphere(
          context.core,
          this.materials.foliage,
          rng.pick(LEAF_COLORS),
          0.26,
          7,
          5,
          riverFaceX - side * (platformDepth - 0.15),
          platformY + 0.5,
          z + dir * (verandaDepth / 2 - 0.35),
          { cast: false, receive: true, scaleY: 0.85 },
        );
      }
    }

    if (!background) {
      const pathStart = side * (BANK_OUTER + 0.15);
      const pathLength = Math.abs(riverFaceX - pathStart);
      this.box(
        context.core,
        this.materials.dirt,
        0x9a8362,
        pathLength,
        0.02,
        1.05,
        (pathStart + riverFaceX) / 2,
        -0.06,
        z,
        { cast: false, receive: true, tile: 1.6 },
      );
      if (setback > 1.2 && rng.chance(0.55)) {
        const wallX = side * (BANK_OUTER + 0.15);
        const wallBase = -0.07;
        const wallLength = depth + 1.1;
        const gateWidth = 1.3;
        for (const dir of [-1, 1] as const) {
          const segmentLength = (wallLength - gateWidth) / 2;
          const segmentZ = z + dir * (gateWidth / 2 + segmentLength / 2);
          this.box(
            context.core,
            this.materials.plaster,
            rng.pick([0xe0cba8, 0xd8c19b, 0xcbb58f] as const),
            0.22,
            0.72,
            segmentLength,
            wallX,
            wallBase + 0.36,
            segmentZ,
            { cast: true, receive: true, tile: 1 },
          );
          this.box(
            context.core,
            this.materials.concrete,
            0xcbbda6,
            0.3,
            0.08,
            segmentLength + 0.08,
            wallX,
            wallBase + 0.76,
            segmentZ,
            { cast: false, receive: true, tile: 1 },
          );
        }
        for (const dir of [-1, 1] as const) {
          this.box(
            context.core,
            this.materials.concrete,
            0xcdbfa8,
            0.34,
            1,
            0.34,
            wallX,
            wallBase + 0.5,
            z + dir * (gateWidth / 2),
            { cast: true, receive: true, tile: 1 },
          );
          this.box(
            context.core,
            this.materials.concrete,
            0xd7cab3,
            0.44,
            0.12,
            0.44,
            wallX,
            wallBase + 1.04,
            z + dir * (gateWidth / 2),
            { cast: false, receive: true, tile: 1 },
          );
        }
        if (rng.chance(0.45)) {
          for (const dir of [-1, 1] as const) {
            this.box(
              context.core,
              this.materials.metal,
              0x3b4b49,
              0.06,
              0.84,
              0.58,
              wallX,
              wallBase + 0.44,
              z + dir * 0.3,
              { cast: false, receive: true, tile: 0 },
            );
          }
        }
      }
    }

    for (const dir of [-1, 1] as const) {
      const bushX = riverFaceX - side * 0.35;
      const bushZ = z + dir * (depth / 2 + 0.55);
      const radius = rng.range(0.36, 0.58);
      this.sphere(
        context.core,
        this.materials.foliage,
        rng.pick(LEAF_COLORS),
        radius,
        8,
        6,
        bushX,
        -0.065 + radius * 0.6,
        bushZ,
        { scaleY: 0.85, cast: true, receive: true },
      );
      this.sphere(
        context.core,
        this.materials.foliage,
        rng.pick(FLOWER_COLORS),
        0.09,
        6,
        4,
        bushX + rng.range(-0.25, 0.25),
        -0.065 + radius * 1.15,
        bushZ + rng.range(-0.25, 0.25),
        { cast: false, receive: false, scaleY: 0.8 },
      );
    }
  }

  private addReeds(
    context: BuildContext,
    rng: Rng,
    x: number,
    z: number,
  ): void {
    const baseY = this.bankHeight(Math.abs(x), z);
    for (let blade = 0; blade < 6; blade += 1) {
      const height = rng.range(0.45, 1.05);
      const lean = rng.range(-0.24, 0.24);
      const bladeX = x + rng.range(-0.18, 0.18);
      const bladeZ = z + rng.range(-0.18, 0.18);
      this.cylinder(
        context.core,
        this.materials.foliage,
        rng.pick([0x648f42, 0x83a44c, 0xa2ad57, 0x4c7f43] as const),
        0.012,
        0.045,
        height,
        5,
        bladeX,
        baseY + height / 2,
        bladeZ,
        { cast: false, receive: false, rotZ: lean, rotX: lean * 0.7 },
      );
      if (blade % 2 === 0) {
        this.cylinder(
          context.core,
          this.materials.foliage,
          rng.pick([0x7a5a3a, 0x8a6841] as const),
          0.03,
          0.05,
          0.2,
          5,
          bladeX,
          baseY + height + 0.06,
          bladeZ,
          { cast: false, receive: false, rotZ: lean, rotX: lean * 0.7 },
        );
      }
    }
  }

  private *addConstructionLotSteps(
    context: BuildContext,
    rng: Rng,
    side: Side,
    startZ: number,
    endZ: number,
    lotIndex: number,
    variant: number,
  ): Generator<string, void, void> {
    const centerZ = (startZ + endZ) / 2;
    const hasSite = rng.chance(0.64);
    const wallColor = rng.pick([0x9a5a44, 0xa9684e, 0x8b503c] as const);

    this.addConstructionBoundary(
      context,
      rng,
      side,
      startZ,
      endZ,
      wallColor,
    );
    yield 'construction-boundary';

    if (!hasSite) {
      this.addConstructionMaterials(
        context,
        rng,
        side * (FRONT_X - 0.2),
        centerZ,
        rng.range(-1.4, 1.4),
      );
      yield 'construction-materials';
      return;
    }

    const depth = rng.range(5.0, 6.5);
    const width = Math.min(LOT_WIDTH - rng.range(2.2, 3.2), rng.range(6.5, 8.2));
    const centerX = side * (FRONT_X + depth / 2);
    yield* this.addUnfinishedBuildingSteps(
      context,
      rng,
      side,
      centerX,
      centerZ,
      width,
      depth,
      (lotIndex + variant) % 3,
    );
    this.addConstructionMaterials(
      context,
      rng,
      side * 9.85,
      centerZ + rng.range(-4.0, 4.0),
      0.3,
    );
    yield 'construction-materials';
  }

  private addConstructionBoundary(
    context: BuildContext,
    rng: Rng,
    side: Side,
    startZ: number,
    endZ: number,
    brickColor: number,
  ): void {
    const x = side * WALL_X;
    const length = endZ - startZ;
    const segments = rng.int(4, 6);
    const segmentLength = length / segments;

    for (let segment = 0; segment < segments; segment += 1) {
      const segmentStart = startZ + segment * segmentLength;
      const segmentEnd = segmentStart + segmentLength;
      const gap = rng.chance(0.2);
      if (gap) continue;

      const height = rng.range(0.48, 1.15);
      const centerZ = (segmentStart + segmentEnd) / 2;
      this.box(
        context.core,
        this.materials.concrete,
        0xb2a79a,
        0.3,
        0.22,
        segmentLength - 0.16,
        x,
        0.11,
        centerZ,
        { cast: true, receive: true, tile: 1.2 },
      );
      this.box(
        context.core,
        this.materials.brick,
        brickColor,
        0.22,
        height,
        segmentLength - 0.22,
        x,
        0.22 + height / 2,
        centerZ,
        { cast: true, receive: true, tile: 0.7 },
      );
      if (rng.chance(0.55)) {
        this.box(
          context.core,
          this.materials.brick,
          0xb36a50,
          0.26,
          rng.range(0.12, 0.25),
          rng.range(0.25, 0.6),
          x,
          0.22 + height + 0.08,
          centerZ + rng.range(-0.2, 0.2),
          { cast: true, receive: true, tile: 0 },
        );
      }
    }

    for (const z of [startZ + 0.5, endZ - 0.5]) {
      this.cylinder(
        context.detail,
        this.materials.metal,
        0x7b7162,
        0.035,
        0.035,
        1.7,
        6,
        side * (WALL_X - 0.4),
        0.85,
        z,
        { cast: true, receive: true },
      );
      this.box(
        context.detail,
        this.materials.fabric,
        rng.chance(0.5) ? 0xe08a2e : 0xd7d0bf,
        0.02,
        0.36,
        1.18,
        side * (WALL_X - 0.4),
        1.46,
        z + 0.18,
        { cast: false, receive: false, tile: 0 },
      );
    }
  }

  private *addUnfinishedBuildingSteps(
    context: BuildContext,
    rng: Rng,
    side: Side,
    centerX: number,
    centerZ: number,
    width: number,
    depth: number,
    stage: number,
  ): Generator<string, void, void> {
    const baseY = 0.18;
    const floors = stage === 0 ? 1 : stage === 1 ? 2 : 3;
    const floorHeight = rng.range(2.55, 2.85);
    const shellHeight = floors * floorHeight;
    const frontX = side * FRONT_X;
    const brickColor = rng.pick([0xa65c44, 0xb0674d, 0x95513c, 0xb87558] as const);
    const concreteColor = rng.pick([0xb5ab9a, 0xc1b7a5, 0xa89f90] as const);

    this.box(
      context.core,
      this.materials.concrete,
      0xb9ae9c,
      depth + 0.5,
      0.22,
      width + 0.5,
      centerX,
      0.11,
      centerZ,
      { cast: true, receive: true, tile: 1.6 },
    );
    yield 'unfinished-base';

    const columnCount = Math.max(3, Math.round(width / 2.0));
    for (let column = 0; column <= columnCount; column += 1) {
      const z = centerZ - width / 2 + (column / columnCount) * width;
      const x = side * (FRONT_X + rng.range(-0.05, 0.2));
      const height = Math.min(
        shellHeight + rng.range(-0.5, 0.4),
        floors * floorHeight,
      );
      this.box(
        context.core,
        this.materials.concrete,
        concreteColor,
        0.3,
        height,
        0.3,
        x,
        baseY + height / 2,
        z,
        { cast: true, receive: true, tile: 1.2 },
      );
      this.box(
        context.core,
        this.materials.concrete,
        0x9d9485,
        0.42,
        0.18,
        0.42,
        x,
        baseY + 0.09,
        z,
        { cast: true, receive: true, tile: 1.1 },
      );

      for (let bar = 0; bar < 3; bar += 1) {
        this.cylinder(
          context.detail,
          this.materials.metal,
          0x8e6a4c,
          0.018,
          0.018,
          rng.range(0.28, 0.58),
          5,
          x + (bar - 1) * 0.075,
          baseY + height + 0.16,
          z + rng.range(-0.04, 0.04),
          { cast: false, receive: true },
        );
      }
    }
    yield 'unfinished-columns';

    for (let floor = 0; floor < floors; floor += 1) {
      const beamY = baseY + floor * floorHeight + floorHeight - 0.16;
      this.box(
        context.core,
        this.materials.concrete,
        concreteColor,
        0.36,
        0.22,
        width + 0.1,
        frontX + side * 0.02,
        beamY,
        centerZ,
        { cast: true, receive: true, tile: 1.1 },
      );
      if (floor < floors - 1) {
        this.box(
          context.core,
          this.materials.concrete,
          0xb0a695,
          depth * rng.range(0.45, 0.72),
          0.2,
          width + 0.1,
          centerX + side * rng.range(-0.2, 0.4),
          beamY + 0.02,
          centerZ,
          { cast: true, receive: true, tile: 1.7 },
        );
      }
    }
    yield 'unfinished-beams';

    const wallStart = centerZ - width / 2 + 0.2;
    const wallEnd = centerZ + width / 2 - 0.2;
    const courses = rng.int(5, 9);
    for (let course = 0; course < courses; course += 1) {
      const z = wallStart + (course / courses) * (wallEnd - wallStart);
      const height = rng.range(0.18, 0.3);
      const wallHeight = rng.range(0.42, 1.25);
      this.box(
        context.core,
        this.materials.brick,
        brickColor,
        0.22,
        wallHeight,
        (wallEnd - wallStart) / courses - 0.04,
        frontX - side * 0.06,
        baseY + wallHeight / 2,
        z,
        { cast: true, receive: true, tile: 0.7 },
      );
      if (rng.chance(0.35)) {
        this.box(
          context.core,
          this.materials.brick,
          0xc07a5d,
          0.26,
          height,
          rng.range(0.2, 0.35),
          frontX - side * 0.04,
          baseY + wallHeight + height / 2,
          z + rng.range(-0.1, 0.1),
          { cast: false, receive: true, tile: 0 },
        );
      }
    }
    yield 'unfinished-walls';

    const scaffoldX = frontX - side * 0.72;
    const scaffoldHeight = Math.min(shellHeight + 0.8, 5.6);
    for (const z of [centerZ - width / 2 + 0.5, centerZ + width / 2 - 0.5]) {
      for (const x of [scaffoldX, scaffoldX - side * 0.72]) {
        this.cylinder(
          context.detail,
          this.materials.metal,
          0x767466,
          0.045,
          0.045,
          scaffoldHeight,
          6,
          x,
          0.16 + scaffoldHeight / 2,
          z,
          { cast: true, receive: true },
        );
      }
    }
    for (const y of [1.3, 2.7, 4.1]) {
      if (y > scaffoldHeight - 0.4) continue;
      this.box(
        context.detail,
        this.materials.metal,
        0x767466,
        0.05,
        0.05,
        width + 0.1,
        scaffoldX - side * 0.36,
        0.16 + y,
        centerZ,
        { cast: false, receive: false, tile: 0 },
      );
      this.box(
        context.detail,
        this.materials.wood,
        0x9b7951,
        1.1,
        0.06,
        width + 0.2,
        scaffoldX,
        0.16 + y,
        centerZ,
        { cast: true, receive: true, tile: 0.8 },
      );
    }
    yield 'unfinished-scaffold';

    if (rng.chance(0.6)) {
      this.box(
        context.detail,
        this.materials.fabric,
        rng.chance(0.5) ? 0x2e5e86 : 0x3f7d70,
        0.03,
        rng.range(0.9, 1.3),
        rng.range(1.5, 2.8),
        scaffoldX - side * 0.74,
        2.2,
        centerZ + rng.range(-1.2, 1.2),
        { cast: false, receive: false, tile: 0, rotZ: side * 0.04 },
      );
    }

    this.sign(
      context.detail,
      SIGN_CELLS.repair,
      1.15,
      0.62,
      frontX - side * 0.62,
      1.85,
      centerZ + width / 2 - 1.0,
      side,
    );
    yield 'unfinished-sign';

    for (let pipe = 0; pipe < 3; pipe += 1) {
      this.cylinder(
        context.detail,
        this.materials.wood,
        0xb8945b,
        0.09,
        0.11,
        rng.range(1.2, 2.0),
        8,
        side * rng.range(9.5, 9.65),
        0.18,
        centerZ + rng.range(-width / 2, width / 2),
        { cast: true, receive: true, rotZ: Math.PI / 2, rotY: rng.range(-0.4, 0.4) },
      );
    }
    yield 'unfinished-pipes';
  }

  private addConstructionMaterials(
    context: BuildContext,
    rng: Rng,
    x: number,
    z: number,
    spread: number,
  ): void {
    for (let pile = 0; pile < 2; pile += 1) {
      const pileX = x + rng.range(-spread, spread);
      const pileZ = z + rng.range(-2.2, 2.2);
      this.sphere(
        context.core,
        this.materials.concrete,
        rng.chance(0.5) ? 0xbaa77e : 0x9f8d70,
        rng.range(0.6, 1.0),
        8,
        6,
        pileX,
        0.18,
        pileZ,
        { scaleY: 0.38, cast: true, receive: true },
      );
    }

    for (let stack = 0; stack < 2; stack += 1) {
      const brickX = x + rng.range(-spread, spread);
      const brickZ = z + rng.range(-2.6, 2.6);
      for (let row = 0; row < 3; row += 1) {
        for (let column = 0; column < 3; column += 1) {
          this.box(
            context.core,
            this.materials.brick,
            rng.pick([0xa65c44, 0xb0674d, 0x95513c] as const),
            0.32,
            0.12,
            0.16,
            brickX + (column - 1) * 0.34,
            0.12 + row * 0.13,
            brickZ + rng.range(-0.04, 0.04),
            { cast: true, receive: true, tile: 0 },
          );
        }
      }
    }

    for (let bag = 0; bag < 3; bag += 1) {
      this.box(
        context.core,
        this.materials.fabric,
        0xb8ab8d,
        0.52,
        0.2,
        0.72,
        x + rng.range(-0.6, 0.6),
        0.12 + bag * 0.18,
        z + rng.range(-1.4, 1.4),
        { cast: true, receive: true, tile: 0, rotZ: rng.range(-0.06, 0.06) },
      );
    }

    this.addWheelbarrow(context, rng, x + rng.range(-0.8, 0.8), z + rng.range(-2.2, 2.2));

    if (rng.chance(0.65)) {
      this.addCementMixer(context, rng, x + rng.range(-1.0, 1.0), z + rng.range(-2.8, 2.8));
    }
  }

  private addWheelbarrow(
    context: BuildContext,
    rng: Rng,
    x: number,
    z: number,
  ): void {
    const y = SIDEWALK_TOP;
    this.shadow(context.detail, 0.9, 1.3, x, z, y + 0.012);
    this.box(
      context.detail,
      this.materials.metal,
      0x6b7a78,
      0.72,
      0.3,
      1.05,
      x,
      y + 0.38,
      z,
      { cast: true, receive: true, tile: 0, rotZ: rng.range(-0.08, 0.08) },
    );
    this.box(
      context.detail,
      this.materials.metal,
      0x8a918c,
      0.6,
      0.05,
      0.9,
      x,
      y + 0.55,
      z,
      { cast: false, receive: true, tile: 0 },
    );
    for (const offset of [-0.24, 0.24]) {
      this.cylinder(
        context.detail,
        this.materials.metal,
        0x4f5552,
        0.035,
        0.045,
        1.25,
        6,
        x + offset,
        y + 0.22,
        z + 1.05,
        { cast: true, receive: true, rotX: Math.PI / 2.4 },
      );
    }
    this.cylinder(
      context.detail,
      this.materials.metal,
      0x2b2f30,
      0.24,
      0.24,
      0.1,
      10,
      x,
      y + 0.24,
      z - 0.52,
      { cast: true, receive: true, rotZ: Math.PI / 2 },
    );
  }

  private addCementMixer(
    context: BuildContext,
    rng: Rng,
    x: number,
    z: number,
  ): void {
    const y = SIDEWALK_TOP;
    this.shadow(context.detail, 1.4, 1.8, x, z, y + 0.012);
    this.box(
      context.detail,
      this.materials.metal,
      0x6f7470,
      0.85,
      0.5,
      1.2,
      x,
      y + 0.32,
      z,
      { cast: true, receive: true, tile: 0 },
    );
    for (const offset of [-0.28, 0.28]) {
      this.cylinder(
        context.detail,
        this.materials.metal,
        0x2b2f30,
        0.2,
        0.2,
        0.12,
        10,
        x + offset,
        y + 0.22,
        z + 0.35,
        { cast: true, receive: true, rotZ: Math.PI / 2 },
      );
    }
    this.cylinder(
      context.detail,
      this.materials.metal,
      rng.chance(0.5) ? 0xc47a3f : 0x8d6a4d,
      0.48,
      0.36,
      0.82,
      12,
      x,
      y + 0.92,
      z - 0.18,
      { cast: true, receive: true, rotX: Math.PI / 3.2, rotZ: Math.PI / 2 },
    );
    this.cylinder(
      context.detail,
      this.materials.metal,
      0x4f5552,
      0.05,
      0.05,
      0.9,
      6,
      x + 0.45,
      y + 0.65,
      z - 0.6,
      { cast: true, receive: true, rotZ: Math.PI / 5 },
    );
  }

  private addGarden(
    context: BuildContext,
    rng: Rng,
    side: Side,
    centerZ: number,
  ): void {
    const x = side * rng.range(9.55, 9.7);
    const length = rng.range(1.9, 2.9);
    const width = rng.range(1.0, 1.22);
    const top = SIDEWALK_TOP;
    const soilColor = rng.chance(0.5) ? 0x6f5338 : 0x7d5f40;

    this.box(
      context.core,
      this.materials.dirt,
      soilColor,
      width,
      0.025,
      length,
      x,
      top + 0.0125,
      centerZ,
      { cast: false, receive: true, tile: 0.9 },
    );

    const bushes = rng.int(3, 5);
    for (let bush = 0; bush < bushes; bush += 1) {
      const bushZ = centerZ - length / 2 + 0.32 + (bush / bushes) * (length - 0.64);
      this.sphere(
        context.core,
        this.materials.foliage,
        rng.pick(LEAF_COLORS),
        rng.range(0.24, 0.42),
        7,
        6,
        x + rng.range(-0.18, 0.18),
        top + rng.range(0.3, 0.44),
        bushZ,
        { scaleY: 0.82, cast: true, receive: true },
      );
      if (rng.chance(0.72)) {
        const flowerColor = rng.pick([
          0xd85a35, 0xe1a52f, 0xc94c73, 0xe8e2a8, 0x9c5fc0,
        ] as const);
        for (let flower = 0; flower < 2; flower += 1) {
          this.sphere(
            context.detail,
            this.materials.foliage,
            flowerColor,
            0.065,
            6,
            5,
            x + rng.range(-0.22, 0.22),
            top + rng.range(0.42, 0.56),
            bushZ + rng.range(-0.22, 0.22),
            { cast: false, receive: false },
          );
        }
      }
    }

  }

  private addCompoundWall(
    context: BuildContext,
    rng: Rng,
    side: Side,
    startZ: number,
    endZ: number,
    templeLot: boolean,
    openFrontage = false,
  ): void {
    const gateCenter = (startZ + endZ) / 2 + rng.range(-1.1, 1.1);
    const gateWidth = openFrontage
      ? Math.min((endZ - startZ) * 0.52, 6.2)
      : templeLot
        ? 2.8
        : rng.range(2.35, 2.75);
    const gateStart = gateCenter - gateWidth / 2;
    const gateEnd = gateCenter + gateWidth / 2;
    const wallColor = rng.chance(0.5) ? rng.pick(PLASTER_COLORS) : 0xe6dcc9;
    const height = rng.range(1.1, 1.42);
    const x = side * WALL_X;

    this.addWallSegment(context, x, startZ + 0.12, gateStart - 0.12, height, wallColor);
    this.addWallSegment(context, x, gateEnd + 0.12, endZ - 0.12, height, wallColor);

    for (const z of [gateStart, gateEnd]) {
      this.box(
        context.core,
        this.materials.plaster,
        rng.pick(PLASTER_COLORS),
        0.34,
        1.5,
        0.34,
        x,
        0.75,
        z,
        { cast: true, receive: true, tile: 2.1 },
      );
      this.box(
        context.core,
        this.materials.concrete,
        0xe2d8c5,
        0.46,
        0.1,
        0.46,
        x,
        1.55,
        z,
        { cast: true, receive: true, tile: 1.3 },
      );
      this.box(
        context.core,
        this.materials.concrete,
        0xc4b7a3,
        0.4,
        0.12,
        0.4,
        x,
        0.06,
        z,
        { cast: false, receive: true, tile: 0 },
      );
    }

    if (!openFrontage) {
      const railColor = rng.pick(GATE_COLORS);
      const gateTop = rng.range(1.42, 1.68);
      for (const y of [gateTop, 0.65]) {
        this.box(
          context.core,
          this.materials.metal,
          railColor,
          0.07,
          0.07,
          gateWidth - 0.35,
          x,
          y,
          gateCenter,
          { cast: true, receive: true, tile: 0 },
        );
      }

      for (let bar = 0; bar < 9; bar += 1) {
        const z = gateStart + 0.32 + (bar / 8) * (gateWidth - 0.64);
        this.box(
          context.core,
          this.materials.metal,
          railColor,
          0.045,
          gateTop - 0.12,
          0.045,
          x,
          gateTop / 2 + 0.05,
          z,
          { cast: true, receive: true, tile: 0 },
        );
      }

      this.box(
        context.core,
        this.materials.metal,
        0x9c8658,
        0.1,
        0.2,
        0.3,
        x - side * 0.06,
        1.02,
        gateStart - 0.32,
        { cast: true, receive: false, tile: 0 },
      );
    }
  }

  private addWallSegment(
    context: BuildContext,
    x: number,
    startZ: number,
    endZ: number,
    height: number,
    color: number,
  ): void {
    if (endZ - startZ < 0.25) return;
    const length = endZ - startZ;
    const centerZ = (startZ + endZ) / 2;

    this.box(
      context.core,
      this.materials.concrete,
      0xc6b9a5,
      0.28,
      0.28,
      length,
      x,
      0.14,
      centerZ,
      { cast: true, receive: true, tile: 1.5 },
    );
    this.box(
      context.core,
      this.materials.plaster,
      color,
      0.2,
      height,
      length,
      x,
      0.28 + height / 2,
      centerZ,
      { cast: true, receive: true, tile: 2.1 },
    );
    this.box(
      context.core,
      this.materials.concrete,
      0xe4dac7,
      0.31,
      0.1,
      length,
      x,
      0.28 + height + 0.05,
      centerZ,
      { cast: true, receive: true, tile: 1.3 },
    );

    const strips = Math.max(2, Math.floor(length / 2.3));
    for (let i = 1; i < strips; i += 1) {
      this.box(
        context.core,
        this.materials.concrete,
        0xf0e7d8,
        0.02,
        height * 0.78,
        0.06,
        x - Math.sign(x) * 0.105,
        0.35 + height * 0.45,
        startZ + (length * i) / strips,
        { cast: false, receive: false, tile: 0 },
      );
    }
  }

  private *addBuildingSteps(
    context: BuildContext,
    rng: Rng,
    side: Side,
    centerZ: number,
    shop: boolean,
  ): Generator<string, void, void> {
    const local: BuildContext = {
      core: new THREE.Group(),
      detail: new THREE.Group(),
      wires: context.wires,
    };
    const setback = rng.chance(0.42) ? rng.range(0.25, 0.95) : 0;
    const facadeWidth = Math.min(
      LOT_WIDTH - rng.range(2.8, 4.4),
      rng.range(7.2, 8.8),
    );
    const depth = rng.range(5.2, 6.8);
    const stories = rng.chance(0.14) ? 4 : rng.chance(0.5) ? 3 : 2;
    const groundHeight = shop ? 3.15 : rng.range(2.8, 3.0);
    const floorHeight = rng.range(2.68, 2.88);
    const height = groundHeight + (stories - 1) * floorHeight;
    const centerX = side * (FRONT_X + depth / 2);
    const bodyZ = centerZ + rng.range(-0.3, 0.3);
    const bodyColor = rng.pick(PLASTER_COLORS);
    const trimColor = rng.pick(TRIM_COLORS);
    const roofColor = rng.pick(ROOF_COLORS);
    const doorColor = rng.pick(DOOR_COLORS);
    const baseY = 0.35;
    const roofY = baseY + height;

    this.box(
      local.core,
      this.materials.concrete,
      0xd5c9b4,
      depth + 0.18,
      0.35,
      facadeWidth + 0.18,
      centerX,
      baseY / 2,
      bodyZ,
      { cast: true, receive: true, tile: 1.8 },
    );
    this.box(
      local.core,
      this.materials.plaster,
      bodyColor,
      depth,
      height,
      facadeWidth,
      centerX,
      baseY + height / 2,
      bodyZ,
      { cast: true, receive: true, tile: 2.6 },
    );
    this.box(
      local.core,
      this.materials.concrete,
      roofColor,
      depth + 0.38,
      0.2,
      facadeWidth + 0.38,
      centerX,
      roofY + 0.1,
      bodyZ,
      { cast: true, receive: true, tile: 1.9 },
    );

    const parapetColor = rng.chance(0.5) ? trimColor : bodyColor;
    this.box(
      local.core,
      this.materials.plaster,
      parapetColor,
      0.2,
      0.52,
      facadeWidth + 0.3,
      side * (FRONT_X + 0.02),
      roofY + 0.46,
      bodyZ,
      { cast: true, receive: true, tile: 2.2 },
    );
    this.box(
      local.core,
      this.materials.plaster,
      parapetColor,
      0.2,
      0.52,
      facadeWidth + 0.3,
      side * (FRONT_X + depth - 0.02),
      roofY + 0.46,
      bodyZ,
      { cast: true, receive: true, tile: 2.2 },
    );
    for (const z of [bodyZ - facadeWidth / 2, bodyZ + facadeWidth / 2]) {
      this.box(
        local.core,
        this.materials.plaster,
        parapetColor,
        depth,
        0.52,
        0.2,
        centerX,
        roofY + 0.46,
        z,
        { cast: true, receive: true, tile: 2.2 },
      );
    }
    yield 'building-shell';

    this.addFacadeBands(
      local,
      side,
      bodyZ,
      facadeWidth,
      baseY,
      groundHeight,
      floorHeight,
      stories,
      trimColor,
    );
    yield 'building-bands';

    if (shop) {
      this.addShopFront(local, rng, side, bodyZ, facadeWidth, baseY, groundHeight, doorColor);
    } else {
      this.addResidentialFront(local, rng, side, bodyZ, facadeWidth, baseY, groundHeight, doorColor);
    }
    yield 'building-front';

    this.addWindows(
      local,
      rng,
      side,
      bodyZ,
      facadeWidth,
      baseY,
      groundHeight,
      floorHeight,
      stories,
    );
    yield 'building-windows';
    this.addBalcony(local, rng, side, bodyZ, facadeWidth, baseY, groundHeight);
    yield 'building-balcony';
    this.addFacadeServices(local, rng, side, bodyZ, facadeWidth, roofY);
    yield 'building-services';
    this.addRooftop(local, rng, side, centerX, bodyZ, facadeWidth, roofY);
    yield 'building-roof';

    const shift = side * setback;
    local.core.position.x = shift;
    local.detail.position.x = shift;
    context.core.add(local.core);
    context.detail.add(local.detail);
  }

  private addFacadeBands(
    context: BuildContext,
    side: Side,
    bodyZ: number,
    facadeWidth: number,
    baseY: number,
    groundHeight: number,
    floorHeight: number,
    stories: number,
    trimColor: number,
  ): void {
    const frontX = side * FRONT_X;

    this.box(
      context.core,
      this.materials.concrete,
      trimColor,
      0.13,
      0.16,
      facadeWidth + 0.04,
      frontX - side * 0.04,
      baseY + groundHeight,
      bodyZ,
      { cast: true, receive: true, tile: 1.1 },
    );

    for (let floor = 1; floor < stories; floor += 1) {
      const y = baseY + groundHeight + floor * floorHeight;
      this.box(
        context.core,
        this.materials.concrete,
        trimColor,
        0.1,
        0.11,
        facadeWidth + 0.02,
        frontX - side * 0.025,
        y,
        bodyZ,
        { cast: true, receive: true, tile: 1 },
      );
    }
  }

  private addResidentialFront(
    context: BuildContext,
    rng: Rng,
    side: Side,
    bodyZ: number,
    facadeWidth: number,
    baseY: number,
    groundHeight: number,
    doorColor: number,
  ): void {
    const frontX = side * FRONT_X;
    const doorZ = bodyZ + rng.range(-facadeWidth * 0.22, facadeWidth * 0.22);

    this.box(
      context.core,
      this.materials.wood,
      doorColor,
      0.13,
      2.12,
      1.24,
      frontX - side * 0.04,
      baseY + 1.06,
      doorZ,
      { cast: true, receive: true, tile: 0.9 },
    );
    for (const offset of [-0.7, 0.7]) {
      this.box(
        context.core,
        this.materials.concrete,
        0xf0e7d7,
        0.16,
        2.32,
        0.14,
        frontX - side * 0.06,
        baseY + 1.14,
        doorZ + offset,
        { cast: true, receive: true, tile: 0.8 },
      );
    }
    this.box(
      context.core,
      this.materials.concrete,
      0xece2cf,
      0.16,
      0.16,
      1.55,
      frontX - side * 0.06,
      baseY + 2.2,
      doorZ,
      { cast: true, receive: true, tile: 0.8 },
    );
    this.box(
      context.core,
      this.materials.concrete,
      0xcfc2ad,
      0.42,
      0.19,
      1.7,
      frontX - side * 0.22,
      SIDEWALK_TOP + 0.095,
      doorZ,
      { cast: true, receive: true, tile: 0.8 },
    );
    this.box(
      context.core,
      this.materials.metal,
      rng.chance(0.45) ? 0xb89a5d : 0x526f6b,
      0.055,
      0.26,
      0.46,
      frontX - side * 0.105,
      baseY + 2.02,
      doorZ + 1.02,
      { cast: false, receive: true, tile: 0 },
    );

    const sideWindowZ =
      doorZ > bodyZ ? bodyZ - facadeWidth * 0.3 : bodyZ + facadeWidth * 0.3;
    this.addWindow(context, side, sideWindowZ, baseY + 1.55, 1.28, 1.04, true);
    this.box(
      context.core,
      this.materials.concrete,
      0xdfd4bf,
      0.18,
      0.18,
      0.62,
      frontX - side * 0.12,
      baseY + 1.04,
      doorZ,
      { cast: true, receive: true, tile: 0 },
    );
    this.cylinder(
      context.detail,
      this.materials.metal,
      0x6e6655,
      0.04,
      0.04,
      0.84,
      8,
      frontX - side * 0.2,
      baseY + groundHeight - 0.18,
      doorZ - 0.52,
      { cast: true, receive: true },
    );
  }

  private addShopFront(
    context: BuildContext,
    rng: Rng,
    side: Side,
    bodyZ: number,
    facadeWidth: number,
    baseY: number,
    groundHeight: number,
    doorColor: number,
  ): void {
    const frontX = side * FRONT_X;
    const shutterWidth = Math.min(facadeWidth * 0.56, 4.15);
    const shutterColor = rng.chance(0.5) ? 0x5f6a67 : 0x6f563d;

    this.box(
      context.core,
      this.materials.metal,
      shutterColor,
      0.12,
      groundHeight - 0.22,
      shutterWidth,
      frontX - side * 0.05,
      baseY + (groundHeight - 0.22) / 2,
      bodyZ,
      { cast: true, receive: true, tile: 0 },
    );

    for (let slat = 0; slat < 7; slat += 1) {
      this.box(
        context.core,
        this.materials.metal,
        slat % 2 === 0 ? 0x838b86 : 0x4e5653,
        0.145,
        0.045,
        shutterWidth - 0.14,
        frontX - side * 0.06,
        baseY + 0.42 + slat * 0.28,
        bodyZ,
        { cast: false, receive: false, tile: 0 },
      );
    }

    const signWidth = Math.min(shutterWidth + 0.5, 4.7);
    this.sign(
      context.core,
      rng.pick(SHOP_SIGNS),
      signWidth,
      0.58,
      frontX - side * 0.09,
      baseY + groundHeight - 0.26,
      bodyZ,
      side,
    );

    const awningColor = rng.pick(FABRIC_COLORS);
    this.box(
      context.core,
      this.materials.fabric,
      awningColor,
      1.05,
      0.07,
      signWidth + 0.14,
      frontX - side * 0.53,
      baseY + groundHeight - 0.64,
      bodyZ,
      { cast: true, receive: true, tile: 0, rotZ: side * 0.1 },
    );
    this.box(
      context.core,
      this.materials.fabric,
      awningColor,
      0.035,
      0.28,
      signWidth + 0.14,
      frontX - side * 1.03,
      baseY + groundHeight - 0.85,
      bodyZ,
      { cast: true, receive: true, tile: 0 },
    );

    for (const z of [bodyZ - signWidth / 2 + 0.12, bodyZ + signWidth / 2 - 0.12]) {
      this.cylinder(
        context.detail,
        this.materials.metal,
        0x565f5a,
        0.045,
        0.045,
        groundHeight - 0.56,
        7,
        frontX - side * 1.01,
        baseY + (groundHeight - 0.56) / 2,
        z,
        { cast: true, receive: true },
      );
    }

    const doorZ =
      bodyZ + (shutterWidth / 2 + 0.85) * (rng.chance(0.5) ? -1 : 1);
    if (Math.abs(doorZ - bodyZ) < facadeWidth / 2 - 0.5) {
      this.box(
        context.core,
        this.materials.wood,
        doorColor,
        0.13,
        2.08,
        0.92,
        frontX - side * 0.04,
        baseY + 1.04,
        doorZ,
        { cast: true, receive: true, tile: 0.9 },
      );
    }

    this.box(
      context.core,
      this.materials.concrete,
      0xd8cdb8,
      0.3,
      0.18,
      shutterWidth + 0.3,
      frontX - side * 0.16,
      SIDEWALK_TOP + 0.09,
      bodyZ,
      { cast: true, receive: true, tile: 0.9 },
    );
  }

  private addWindows(
    context: BuildContext,
    rng: Rng,
    side: Side,
    bodyZ: number,
    facadeWidth: number,
    baseY: number,
    groundHeight: number,
    floorHeight: number,
    stories: number,
  ): void {
    const frontX = side * FRONT_X;

    for (let floor = 1; floor < stories; floor += 1) {
      const windowY = baseY + groundHeight + (floor - 1) * floorHeight + 1.38;
      const offsets = [-0.32, 0, 0.32];
      for (let bay = 0; bay < offsets.length; bay += 1) {
        if (bay === 1 && rng.chance(0.3)) continue;
        const windowZ = bodyZ + offsets[bay] * facadeWidth;
        this.addWindow(
          context,
          side,
          windowZ,
          windowY,
          rng.range(0.98, 1.16),
          0.98,
          floor === 1,
        );

        if (rng.chance(0.27)) {
          this.box(
            context.detail,
            this.materials.metal,
            0xd8d6ca,
            0.42,
            0.36,
            0.66,
            frontX - side * 0.36,
            windowY - 0.8,
            windowZ,
            { cast: true, receive: true, tile: 0 },
          );
          this.box(
            context.detail,
            this.materials.metal,
            0x3d4443,
            0.045,
            0.19,
            0.48,
            frontX - side * 0.59,
            windowY - 0.8,
            windowZ,
            { cast: false, receive: false, tile: 0 },
          );
        }
      }
    }

    if (rng.chance(0.55)) {
      this.addFlowerBox(
        context,
        side,
        bodyZ + rng.range(-facadeWidth * 0.3, facadeWidth * 0.3),
        baseY + groundHeight + 0.82,
      );
    }
  }

  private addWindow(
    context: BuildContext,
    side: Side,
    z: number,
    y: number,
    height: number,
    width: number,
    grill: boolean,
  ): void {
    const frontX = side * FRONT_X;

    this.box(
      context.core,
      this.materials.glass,
      0x294c58,
      0.07,
      height,
      width,
      frontX - side * 0.04,
      y,
      z,
      { cast: false, receive: true, tile: 0 },
    );

    const frameColor = 0xf0e8d8;
    this.box(
      context.core,
      this.materials.concrete,
      frameColor,
      0.12,
      0.1,
      width + 0.18,
      frontX - side * 0.06,
      y + height / 2 + 0.04,
      z,
      { cast: true, receive: true, tile: 0 },
    );
    this.box(
      context.core,
      this.materials.concrete,
      frameColor,
      0.14,
      0.11,
      width + 0.22,
      frontX - side * 0.08,
      y - height / 2 - 0.04,
      z,
      { cast: true, receive: true, tile: 0 },
    );
    for (const offset of [-1, 1]) {
      this.box(
        context.core,
        this.materials.concrete,
        frameColor,
        0.12,
        height + 0.16,
        0.09,
        frontX - side * 0.06,
        y,
        z + offset * (width / 2 + 0.055),
        { cast: true, receive: true, tile: 0 },
      );
    }
    this.box(
      context.core,
      this.materials.concrete,
      frameColor,
      0.12,
      height,
      0.055,
      frontX - side * 0.07,
      y,
      z,
      { cast: false, receive: false, tile: 0 },
    );

    if (grill) {
      for (let bar = -2; bar <= 2; bar += 1) {
        this.box(
          context.core,
          this.materials.metal,
          0x39413e,
          0.08,
          height - 0.06,
          0.035,
          frontX - side * 0.11,
          y,
          z + (bar * width) / 6,
          { cast: false, receive: false, tile: 0 },
        );
      }
      this.box(
        context.core,
        this.materials.metal,
        0x39413e,
        0.08,
        0.035,
        width - 0.05,
        frontX - side * 0.11,
        y,
        z,
        { cast: false, receive: false, tile: 0 },
      );
    }
  }

  private addFlowerBox(
    context: BuildContext,
    side: Side,
    z: number,
    y: number,
  ): void {
    const frontX = side * FRONT_X;
    this.box(
      context.core,
      this.materials.plaster,
      0x9d4a33,
      0.32,
      0.24,
      1.1,
      frontX - side * 0.24,
      y,
      z,
      { cast: true, receive: true, tile: 0 },
    );
    for (let flower = -2; flower <= 2; flower += 1) {
      this.sphere(
        context.detail,
        this.materials.foliage,
        flower % 2 === 0 ? 0x4f8b42 : 0xd06a36,
        0.11,
        7,
        6,
        frontX - side * 0.24,
        y + 0.2,
        z + flower * 0.2,
        { cast: false, receive: false, scaleY: 0.8 },
      );
    }
  }

  private addBalcony(
    context: BuildContext,
    rng: Rng,
    side: Side,
    bodyZ: number,
    facadeWidth: number,
    baseY: number,
    groundHeight: number,
  ): void {
    if (!rng.chance(0.62)) return;

    const frontX = side * FRONT_X;
    const width = Math.min(facadeWidth * 0.48, 4.6);
    const floorY = baseY + groundHeight;

    this.box(
      context.core,
      this.materials.concrete,
      0xe7ddca,
      1.15,
      0.13,
      width,
      frontX - side * 0.55,
      floorY,
      bodyZ,
      { cast: true, receive: true, tile: 1.1 },
    );
    this.box(
      context.core,
      this.materials.concrete,
      0xd7cbb7,
      0.08,
      0.37,
      width,
      frontX - side * 1.11,
      floorY - 0.27,
      bodyZ,
      { cast: true, receive: true, tile: 0 },
    );

    const railX = frontX - side * 1.09;
    const railColor = rng.pick(GATE_COLORS);
    for (let bar = 0; bar <= 9; bar += 1) {
      this.box(
        context.core,
        this.materials.metal,
        railColor,
        0.04,
        0.82,
        0.04,
        railX,
        floorY + 0.5,
        bodyZ - width / 2 + 0.18 + (bar / 9) * (width - 0.36),
        { cast: true, receive: false, tile: 0 },
      );
    }
    for (const y of [floorY + 0.26, floorY + 0.93]) {
      this.box(
        context.core,
        this.materials.metal,
        railColor,
        0.07,
        y > floorY + 0.5 ? 0.07 : 0.06,
        width - 0.12,
        railX,
        y,
        bodyZ,
        { cast: true, receive: false, tile: 0 },
      );
    }

    for (const z of [bodyZ - width * 0.36, bodyZ + width * 0.36]) {
      this.box(
        context.detail,
        this.materials.fabric,
        rng.pick(FABRIC_COLORS),
        0.035,
        0.48,
        0.32,
        railX - side * 0.035,
        floorY + 0.61,
        z,
        { cast: true, receive: false, tile: 0 },
      );
    }
  }

  private addFacadeServices(
    context: BuildContext,
    rng: Rng,
    side: Side,
    bodyZ: number,
    facadeWidth: number,
    roofY: number,
  ): void {
    const frontX = side * FRONT_X;
    const pipeZ = bodyZ + (rng.chance(0.5) ? -1 : 1) * (facadeWidth * 0.42);
    this.cylinder(
      context.core,
      this.materials.metal,
      0x5f5b50,
      0.055,
      0.055,
      roofY - 0.4,
      7,
      frontX - side * 0.14,
      0.35 + (roofY - 0.4) / 2,
      pipeZ,
      { cast: true, receive: true },
    );

    if (rng.chance(0.55)) {
      this.box(
        context.core,
        this.materials.metal,
        0xa6a69d,
        0.18,
        0.48,
        0.36,
        frontX - side * 0.15,
        2.1,
        bodyZ - facadeWidth * 0.46,
        { cast: true, receive: true, tile: 0 },
      );
    }

    if (rng.chance(0.38)) {
      this.box(
        context.detail,
        this.materials.fabric,
        rng.pick(FABRIC_COLORS),
        0.03,
        0.65,
        0.42,
        frontX - side * 0.16,
        roofY - 1.0,
        bodyZ + facadeWidth * 0.38,
        { cast: false, receive: false, tile: 0 },
      );
    }
  }

  private addRooftop(
    context: BuildContext,
    rng: Rng,
    side: Side,
    centerX: number,
    bodyZ: number,
    facadeWidth: number,
    roofY: number,
  ): void {
    const tankX = centerX + side * rng.range(-0.8, 0.8);
    const tankZ = bodyZ + rng.range(-facadeWidth * 0.25, facadeWidth * 0.25);
    const tankColor = rng.pick([0x2f3b3a, 0x2f6f8f, 0xd7d2c2, 0x30484f] as const);

    this.box(
      context.core,
      this.materials.concrete,
      0xbab0a0,
      1.0,
      0.22,
      1.0,
      tankX,
      roofY + 0.31,
      tankZ,
      { cast: true, receive: true, tile: 0 },
    );
    this.cylinder(
      context.core,
      this.materials.metal,
      tankColor,
      0.5,
      0.5,
      0.95,
      14,
      tankX,
      roofY + 0.89,
      tankZ,
      { cast: true, receive: true },
    );
    this.cylinder(
      context.core,
      this.materials.metal,
      0x1f2928,
      0.54,
      0.54,
      0.08,
      14,
      tankX,
      roofY + 1.4,
      tankZ,
      { cast: true, receive: false },
    );

    if (rng.chance(0.72)) {
      const roomX = centerX + side * rng.range(-0.9, 0.9);
      const roomZ = bodyZ + (rng.chance(0.5) ? -1 : 1) * facadeWidth * 0.3;
      this.box(
        context.core,
        this.materials.plaster,
        rng.pick(MUTED_COLORS),
        2.3,
        1.8,
        2.0,
        roomX,
        roofY + 1.12,
        roomZ,
        { cast: true, receive: true, tile: 1.8 },
      );
      this.box(
        context.core,
        this.materials.concrete,
        0xb6aa98,
        2.55,
        0.15,
        2.25,
        roomX,
        roofY + 2.08,
        roomZ,
        { cast: true, receive: true, tile: 1.2 },
      );
      this.box(
        context.core,
        this.materials.wood,
        0x5e4634,
        0.1,
        1.2,
        0.65,
        roomX - side * 1.17,
        roofY + 0.9,
        roomZ,
        { cast: true, receive: true, tile: 0.8 },
      );
    }

    if (rng.chance(0.42)) {
      const panelX = centerX - side * rng.range(0.2, 1.1);
      const panelZ = bodyZ + rng.range(-facadeWidth * 0.24, facadeWidth * 0.24);
      this.box(
        context.core,
        this.materials.glass,
        0x1d3f67,
        1.45,
        0.055,
        0.95,
        panelX,
        roofY + 0.72,
        panelZ,
        { cast: true, receive: true, tile: 0, rotZ: side * 0.25 },
      );
      for (const offset of [-0.5, 0.5]) {
        this.box(
          context.core,
          this.materials.metal,
          0x666b6a,
          0.08,
          0.42,
          0.08,
          panelX + offset * 0.9,
          roofY + 0.36,
          panelZ + offset * 0.3,
          { cast: true, receive: true, tile: 0 },
        );
      }
    }

    if (rng.chance(0.44)) {
      const dishZ = bodyZ + facadeWidth * 0.4;
      this.cylinder(
        context.detail,
        this.materials.metal,
        0xd6d5ca,
        0.32,
        0.32,
        0.045,
        16,
        centerX - side * 0.3,
        roofY + 1.4,
        dishZ,
        { cast: true, receive: false, rotX: Math.PI / 2.6, rotZ: -side * 0.3 },
      );
      this.cylinder(
        context.detail,
        this.materials.metal,
        0x5d605a,
        0.035,
        0.035,
        1.15,
        6,
        centerX - side * 0.3,
        roofY + 0.85,
        dishZ,
        { cast: true, receive: true },
      );
    }
  }

  private addForecourt(
    context: BuildContext,
    rng: Rng,
    side: Side,
    centerZ: number,
  ): void {
    const length = Math.min(LOT_WIDTH - 3.2, rng.range(5.6, 7.6));
    const depth = rng.range(3.4, 4.4);
    const x = side * (FRONT_X + 0.9 + rng.range(-0.2, 0.35));

    this.box(
      context.core,
      this.materials.paver,
      0xbcb2a2,
      depth,
      0.05,
      length,
      x,
      SIDEWALK_TOP + 0.025,
      centerZ,
      { cast: false, receive: true, tile: 0.9 },
    );

    const edgeX = x + side * (depth / 2 + 0.16);
    this.box(
      context.core,
      this.materials.concrete,
      0xc9c0af,
      0.32,
      0.22,
      length + 0.2,
      edgeX,
      SIDEWALK_TOP + 0.11,
      centerZ,
      { cast: true, receive: true, tile: 1.1 },
    );

    const hedgeLength = length * rng.range(0.55, 0.8);
    this.box(
      context.core,
      this.materials.foliage,
      rng.pick(LEAF_COLORS),
      0.5,
      rng.range(0.65, 0.95),
      hedgeLength,
      edgeX + side * 0.12,
      SIDEWALK_TOP + 0.55,
      centerZ + rng.range(-0.5, 0.5),
      { cast: true, receive: true, tile: 0 },
    );

    for (const offset of [-1, 1]) {
      const potZ = centerZ + offset * (length / 2 - 0.65);
      this.cylinder(
        context.detail,
        this.materials.plaster,
        rng.chance(0.5) ? 0xa55236 : 0xc0844b,
        0.2,
        0.27,
        0.5,
        9,
        x - side * 0.75,
        SIDEWALK_TOP + 0.3,
        potZ,
        { cast: true, receive: true },
      );
      this.sphere(
        context.detail,
        this.materials.foliage,
        rng.pick(LEAF_COLORS),
        0.34,
        7,
        6,
        x - side * 0.75,
        SIDEWALK_TOP + 0.76,
        potZ,
        { scaleY: 0.9, cast: true, receive: true },
      );
    }

    if (rng.chance(0.55)) {
      this.addPalm(
        context,
        side * (FRONT_X + 2.5),
        centerZ + rng.range(-2.2, 2.2),
        rng,
      );
    }
  }

  private addRearBuilding(
    context: BuildContext,
    rng: Rng,
    side: Side,
    centerZ: number,
  ): void {
    const centerX = side * rng.range(18.2, 20.2);
    const width = rng.range(8.4, 10.7);
    const depth = rng.range(4.2, 6.0);
    const height = rng.range(4.4, 7.8);

    this.box(
      context.core,
      this.materials.plaster,
      rng.pick(MUTED_COLORS),
      depth,
      height,
      width,
      centerX,
      0.35 + height / 2,
      centerZ + rng.range(-1, 1),
      { cast: true, receive: true, tile: 2.6 },
    );
    this.box(
      context.core,
      this.materials.concrete,
      rng.pick(ROOF_COLORS),
      depth + 0.3,
      0.18,
      width + 0.3,
      centerX,
      0.44 + height,
      centerZ,
      { cast: true, receive: true, tile: 1.8 },
    );

    if (rng.chance(0.5)) {
      this.cylinder(
        context.core,
        this.materials.metal,
        0x2f3b3a,
        0.42,
        0.42,
        0.8,
        12,
        centerX,
        0.6 + height,
        centerZ + rng.range(-width * 0.2, width * 0.2),
        { cast: true, receive: true },
      );
    }
  }

  private addTemple(
    context: BuildContext,
    rng: Rng,
    side: Side,
    centerZ: number,
  ): void {
    const shrineWidth = rng.range(3.0, 3.6);
    const centerX = side * (FRONT_X + rng.range(1.1, 1.8));
    const shrineDepth = rng.range(2.6, 3.1);
    const shrineHeight = rng.range(2.35, 2.75);
    const baseY = 0.35;
    const cream = 0xf1e4c3;
    const saffron = 0xd26c2f;
    const gold = 0xd9aa45;
    const frontX = side * FRONT_X;

    this.box(
      context.core,
      this.materials.concrete,
      0xd8c9ae,
      shrineDepth + 1.15,
      0.35,
      shrineWidth + 1.35,
      centerX,
      0.175,
      centerZ,
      { cast: true, receive: true, tile: 1.4 },
    );
    this.box(
      context.core,
      this.materials.plaster,
      cream,
      shrineDepth,
      shrineHeight,
      shrineWidth,
      centerX,
      baseY + shrineHeight / 2,
      centerZ,
      { cast: true, receive: true, tile: 2.2 },
    );
    for (const z of [centerZ - shrineWidth / 2, centerZ + shrineWidth / 2]) {
      this.box(
        context.core,
        this.materials.plaster,
        saffron,
        0.22,
        shrineHeight + 0.2,
        0.22,
        side * (FRONT_X + 0.26),
        baseY + shrineHeight / 2,
        z,
        { cast: true, receive: true, tile: 0 },
      );
    }

    this.box(
      context.core,
      this.materials.wood,
      0x3f2a1d,
      0.15,
      1.72,
      1.22,
      frontX - side * 0.09,
      baseY + 0.86,
      centerZ,
      { cast: true, receive: true, tile: 0.7 },
    );
    for (const z of [centerZ - 0.7, centerZ + 0.7]) {
      this.box(
        context.core,
        this.materials.metal,
        gold,
        0.09,
        1.9,
        0.1,
        frontX - side * 0.1,
        baseY + 0.95,
        z,
        { cast: true, receive: false, tile: 0 },
      );
    }
    this.sign(
      context.core,
      SIGN_CELLS.temple,
      1.35,
      0.46,
      frontX - side * 0.12,
      baseY + 2.22,
      centerZ,
      side,
    );

    for (let step = 0; step < 4; step += 1) {
      this.box(
        context.core,
        this.materials.plaster,
        step % 2 === 0 ? cream : saffron,
        shrineDepth - step * 0.12,
        0.52,
        shrineWidth + 0.7 - step * 0.32,
        centerX,
        baseY + shrineHeight + 0.26 + step * 0.48,
        centerZ,
        { cast: true, receive: true, tile: 1.7 },
      );
    }
    this.cylinder(
      context.core,
      this.materials.metal,
      gold,
      0.13,
      0.13,
      0.45,
      10,
      centerX,
      baseY + shrineHeight + 2.35,
      centerZ,
      { cast: true, receive: false },
    );

    for (let flower = -3; flower <= 3; flower += 1) {
      this.sphere(
        context.detail,
        this.materials.foliage,
        0xe88b2f,
        0.075,
        6,
        5,
        frontX - side * 0.16,
        baseY + 2.04 - Math.abs(flower) * 0.045,
        centerZ + flower * 0.17,
        { cast: false, receive: false },
      );
    }

    const flagX = frontX - side * 0.4;
    const flagZ = centerZ - shrineWidth * 0.66;
    this.cylinder(
      context.core,
      this.materials.metal,
      0x5d5444,
      0.04,
      0.04,
      2.7,
      7,
      flagX,
      0.35 + 1.35,
      flagZ,
      { cast: true, receive: true },
    );
    this.box(
      context.detail,
      this.materials.fabric,
      saffron,
      0.02,
      0.45,
      0.68,
      flagX - side * 0.35,
      2.85,
      flagZ,
      { cast: false, receive: false, tile: 0 },
    );
    this.cylinder(
      context.detail,
      this.materials.metal,
      gold,
      0.09,
      0.12,
      0.28,
      8,
      frontX - side * 0.18,
      baseY + 2.55,
      centerZ + shrineWidth * 0.3,
      { cast: false, receive: false },
    );
  }

  private addTrees(context: BuildContext, rng: Rng, theme: ZoneTheme): void {
    const [minTrees, maxTrees] = theme.dressing.treeCount;
    for (const side of [-1, 1] as const) {
      const treeCount = rng.int(
        Math.max(4, minTrees + 1),
        Math.max(6, maxTrees + 3),
      );
      for (let tree = 0; tree < treeCount; tree += 1) {
        const z =
          -HALF +
          3.2 +
          (tree + 0.35) * (ROAD.chunkLength / (treeCount + 0.4)) +
          rng.range(-1.7, 1.7);
        const absX = rng.range(BANK_INNER + 2.7, BANK_OUTER - 1);
        const baseY = this.bankHeight(absX, z);
        if (rng.chance(0.38)) {
          this.addPalm(context, side * absX, z, rng, baseY);
        } else {
          this.addNeem(context, side * absX, z, rng, baseY);
        }
      }

      for (let tree = 0; tree < 4; tree += 1) {
        this.addBackgroundTree(
          context,
          rng,
          side * rng.range(29, 36),
          -HALF + rng.range(1, ROAD.chunkLength - 1),
        );
      }
    }
  }

  private addPalm(
    context: BuildContext,
    x: number,
    z: number,
    rng: Rng,
    baseY = SIDEWALK_TOP,
  ): void {
    const height = rng.range(4.1, 6.1);
    const trunkColor = rng.pick([0x7b5c3c, 0x8c6943, 0x6f5236] as const);
    const leafColor = rng.pick(LEAF_COLORS);
    const top = baseY + height;

    this.addTreePit(context, x, z, baseY);
    this.cylinder(
      context.core,
      this.materials.wood,
      trunkColor,
      0.13,
      0.24,
      height,
      8,
      x,
      baseY + height / 2,
      z,
      { cast: true, receive: true },
    );
    for (let ring = 0; ring < 5; ring += 1) {
      const ringY = baseY + 0.6 + (ring * (height - 1.2)) / 5;
      const ringRadius = 0.225 - ring * 0.014;
      this.cylinder(
        context.core,
        this.materials.wood,
        0x5f4731,
        ringRadius,
        ringRadius + 0.02,
        0.06,
        8,
        x,
        ringY,
        z,
        { cast: false, receive: false },
      );
    }
    this.cylinder(
      context.core,
      this.materials.wood,
      0x6c5238,
      0.1,
      0.16,
      0.2,
      8,
      x,
      top + 0.05,
      z,
      { cast: true, receive: false },
    );

    const fronds = rng.int(8, 11);
    for (let frond = 0; frond < fronds; frond += 1) {
      const angle = (frond / fronds) * Math.PI * 2 + rng.range(-0.12, 0.12);
      const length = rng.range(1.9, 2.9);
      const tilt = rng.range(0.24, 0.62);
      this.box(
        context.core,
        this.materials.foliage,
        leafColor,
        0.14,
        0.04,
        length,
        x - Math.sin(angle) * (length / 2),
        top - Math.sin(tilt) * length * 0.42,
        z - Math.cos(angle) * (length / 2),
        { cast: true, receive: true, rotY: angle, rotX: -tilt, tile: 0 },
      );
      this.box(
        context.core,
        this.materials.foliage,
        rng.pick(LEAF_SHADOWS),
        0.34,
        0.025,
        length * 0.55,
        x - Math.sin(angle) * (length * 0.64),
        top - Math.sin(tilt) * length * 0.5 - 0.02,
        z - Math.cos(angle) * (length * 0.64),
        {
          cast: false,
          receive: false,
          rotY: angle + (frond % 2 === 0 ? 0.55 : -0.55),
          rotX: -tilt,
          tile: 0,
        },
      );
    }

    for (let nut = 0; nut < 3; nut += 1) {
      this.sphere(
        context.detail,
        this.materials.wood,
        0x65442d,
        0.12,
        7,
        6,
        x + Math.cos(nut * 2.1) * 0.2,
        top - 0.13,
        z + Math.sin(nut * 2.1) * 0.2,
        { cast: true, receive: true, scaleY: 1.1 },
      );
    }

    this.shadow(context.detail, 2.6, 2.6, x, z, baseY + 0.012);
  }

  private addNeem(
    context: BuildContext,
    x: number,
    z: number,
    rng: Rng,
    baseY = SIDEWALK_TOP,
  ): void {
    const height = rng.range(3, 4.6);
    const leafColor = rng.pick(LEAF_COLORS);
    const top = baseY + height;

    this.addTreePit(context, x, z, baseY);
    this.cylinder(
      context.core,
      this.materials.wood,
      0x6e5136,
      0.13,
      0.23,
      height,
      8,
      x,
      baseY + height / 2,
      z,
      { cast: true, receive: true },
    );
    for (let branch = 0; branch < 3; branch += 1) {
      const angle = branch * 2.1 + rng.range(-0.4, 0.4);
      this.cylinder(
        context.core,
        this.materials.wood,
        0x5f4630,
        0.05,
        0.11,
        rng.range(0.9, 1.5),
        6,
        x + Math.cos(angle) * 0.45,
        top - 0.95 + rng.range(-0.2, 0.2),
        z + Math.sin(angle) * 0.45,
        {
          cast: true,
          receive: true,
          rotZ: Math.cos(angle) * 0.6,
          rotX: Math.sin(angle) * 0.6,
        },
      );
    }

    const canopyCount = rng.int(6, 8);
    for (let blob = 0; blob < canopyCount; blob += 1) {
      const angle = rng.range(0, Math.PI * 2);
      const distance = rng.range(0, 1.15);
      const color = rng.chance(0.28)
        ? rng.pick(LEAF_HIGHLIGHTS)
        : rng.chance(0.28)
          ? rng.pick(LEAF_SHADOWS)
          : leafColor;
      this.sphere(
        context.core,
        this.materials.foliage,
        color,
        rng.range(0.85, 1.35),
        8,
        6,
        x + Math.cos(angle) * distance,
        top + rng.range(-0.5, 0.85),
        z + Math.sin(angle) * distance,
        { cast: true, receive: true, scaleY: rng.range(0.7, 0.9) },
      );
    }

    this.shadow(context.detail, 3.4, 3.4, x, z, baseY + 0.012);
  }

  private addBackgroundTree(
    context: BuildContext,
    rng: Rng,
    x: number,
    z: number,
  ): void {
    const height = rng.range(4.5, 8);
    const baseY = -0.06;
    this.cylinder(
      context.core,
      this.materials.wood,
      rng.pick([0x6b523a, 0x5f4a35] as const),
      0.18,
      0.32,
      height,
      6,
      x,
      baseY + height / 2,
      z,
      { cast: false, receive: true },
    );
    const shadowColor = rng.pick(LEAF_SHADOWS);
    for (let blob = 0; blob < 3; blob += 1) {
      this.sphere(
        context.core,
        this.materials.foliage,
        blob === 0 ? shadowColor : rng.pick(LEAF_COLORS),
        rng.range(1.6, 2.6),
        7,
        5,
        x + rng.range(-1.2, 1.2),
        baseY + height * 0.82 + rng.range(-0.6, 1.2),
        z + rng.range(-1.2, 1.2),
        { cast: false, receive: true, scaleY: 0.85 },
      );
    }
  }

  private addTreePit(
    context: BuildContext,
    x: number,
    z: number,
    baseY = SIDEWALK_TOP,
  ): void {
    this.box(
      context.core,
      this.materials.dirt,
      0x715d3d,
      1.15,
      0.025,
      1.15,
      x,
      baseY + 0.0125,
      z,
      { cast: false, receive: true, tile: 1 },
    );
  }

  private addDistantScenery(context: BuildContext, rng: Rng): void {
    for (const side of [-1, 1] as const) {
      for (let tree = 0; tree < 10; tree += 1) {
        const x = side * rng.range(32, 47);
        const z = -HALF + rng.range(0, ROAD.chunkLength);
        const height = rng.range(5, 9);
        const baseY = -0.08;
        this.cylinder(
          context.core,
          this.materials.wood,
          0x5c4a38,
          0.22,
          0.38,
          height,
          5,
          x,
          baseY + height / 2,
          z,
          { cast: false, receive: false },
        );
        this.sphere(
          context.core,
          this.materials.foliage,
          rng.pick(LEAF_SHADOWS),
          rng.range(2.2, 3.6),
          7,
          5,
          x,
          baseY + height * 0.85,
          z,
          { cast: false, receive: false, scaleY: 0.8 },
        );
        this.sphere(
          context.core,
          this.materials.foliage,
          rng.pick(LEAF_COLORS),
          rng.range(1.5, 2.6),
          6,
          4,
          x + rng.range(-1.4, 1.4),
          baseY + height * 0.95,
          z + rng.range(-1.4, 1.4),
          { cast: false, receive: false, scaleY: 0.8 },
        );
      }

      for (let house = 0; house < 4; house += 1) {
        const x = side * rng.range(34, 43);
        const z = -HALF + rng.range(0, ROAD.chunkLength);
        const width = rng.range(3.2, 4.6);
        const depth = rng.range(3.4, 4.6);
        const height = rng.range(2.4, 3.2);
        const wallColor = rng.pick(VILLAGE_WALLS);
        this.box(
          context.core,
          this.materials.plaster,
          wallColor,
          width,
          height,
          depth,
          x,
          height / 2 - 0.06,
          z,
          { cast: false, receive: false, tile: 0.9 },
        );
        this.gableRoof(
          context.core,
          rng.pick(TERRACOTTA),
          wallColor,
          width + 0.5,
          depth + 0.5,
          width * 0.28 + 0.1,
          x,
          height - 0.06,
          z,
        );
        this.box(
          context.core,
          this.materials.glass,
          0x718a8c,
          0.06,
          0.55,
          0.8,
          x - side * (width / 2 + 0.02),
          1.35,
          z,
          { cast: false, receive: false, tile: 0 },
        );
      }

      for (let hill = 0; hill < 3; hill += 1) {
        const x = side * rng.range(44, 50);
        const z = -HALF + rng.range(0, ROAD.chunkLength);
        this.sphere(
          context.core,
          this.materials.foliage,
          rng.pick([0x3f6134, 0x466b39, 0x38572f] as const),
          rng.range(9, 15),
          8,
          6,
          x,
          -2.5,
          z,
          { cast: false, receive: false, scaleY: 0.45 },
        );
      }
    }
  }

  private addUtilityLine(context: BuildContext, rng: Rng): void {
    const poleZs = [-18, -6, 6, 18];
    const wireYs = [7.02, 6.68, 6.34];

    for (const side of [-1, 1] as const) {
      const x = side * 6.98;
      for (const z of poleZs) {
        this.cylinder(
          context.detail,
          this.materials.concrete,
          0xa69d8c,
          0.13,
          0.17,
          7.35,
          8,
          x,
          3.675,
          z + rng.range(-0.3, 0.3),
          { cast: true, receive: true },
        );
        this.box(
          context.detail,
          this.materials.metal,
          0x4d4d47,
          1.9,
          0.1,
          0.1,
          x - side * 0.2,
          7.12,
          z,
          { cast: true, receive: false, tile: 0 },
        );
        for (const offset of [-0.68, 0, 0.68]) {
          this.cylinder(
            context.detail,
            this.materials.metal,
            0xc3c0b2,
            0.075,
            0.075,
            0.17,
            7,
            x - side * 0.2 + offset,
            7.25,
            z,
            { cast: false, receive: false },
          );
        }
        if (rng.chance(0.22)) {
          this.cylinder(
            context.detail,
            this.materials.metal,
            0x59625d,
            0.33,
            0.33,
            0.85,
            12,
            x + side * 0.35,
            6.1,
            z,
            { cast: true, receive: true },
          );
        }
      }

      for (const depth of [-0.2, 0, 0.2]) {
        const wireX = x - side * depth;
        for (const y of wireYs) {
          this.sagWire(
            context,
            new THREE.Vector3(wireX, y, -HALF),
            new THREE.Vector3(wireX, y, HALF),
            0.42,
            12,
          );
        }
      }
    }

    for (const z of [-12, 12]) {
      this.sagWire(
        context,
        new THREE.Vector3(-6.78, 6.98, z),
        new THREE.Vector3(6.78, 6.98, z),
        0.58,
        14,
      );
      this.sagWire(
        context,
        new THREE.Vector3(-6.78, 6.56, z + 0.8),
        new THREE.Vector3(6.78, 6.4, z + 0.8),
        0.68,
        14,
      );
    }
  }

  private addStreetLamps(context: BuildContext, rng: Rng): void {
    for (const side of [-1, 1] as const) {
      const z = side === -1 ? rng.range(-15, -3) : rng.range(2, 16);
      const x = side * 9.8;
      const height = rng.range(4.0, 4.55);
      const armX = x - side * 0.92;

      this.cylinder(
        context.detail,
        this.materials.metal,
        0x3e4747,
        0.065,
        0.09,
        height,
        8,
        x,
        SIDEWALK_TOP + height / 2,
        z,
        { cast: true, receive: true },
      );
      this.box(
        context.detail,
        this.materials.metal,
        0x3e4747,
        0.9,
        0.07,
        0.07,
        x - side * 0.42,
        SIDEWALK_TOP + height - 0.05,
        z,
        { cast: true, receive: false, tile: 0, rotZ: side * 0.03 },
      );
      this.box(
        context.detail,
        this.materials.metal,
        0x4b5350,
        0.38,
        0.12,
        0.24,
        armX,
        SIDEWALK_TOP + height - 0.1,
        z,
        { cast: true, receive: false, tile: 0 },
      );
      this.box(
        context.detail,
        this.materials.lampGlow,
        0xffffff,
        0.26,
        0.045,
        0.16,
        armX,
        SIDEWALK_TOP + height - 0.18,
        z,
        { cast: false, receive: false, tile: 0 },
      );
      this.shadow(context.detail, 1.1, 1.1, x, z, SIDEWALK_TOP + 0.014);
    }
  }

  private addStreetSigns(context: BuildContext, rng: Rng): void {
    const cells = [
      SIGN_CELLS.noHorn,
      SIGN_CELLS.school,
      SIGN_CELLS.society,
    ] as const;

    for (const side of [-1, 1] as const) {
      const x = side * 9.8;
      const z = rng.range(-18, 18);
      this.cylinder(
        context.detail,
        this.materials.metal,
        0x6c6d63,
        0.045,
        0.055,
        2.6,
        7,
        x,
        SIDEWALK_TOP + 1.3,
        z,
        { cast: true, receive: true },
      );
      this.sign(
        context.detail,
        rng.pick(cells),
        0.72,
        0.78,
        x,
        SIDEWALK_TOP + 2.25,
        z + 0.04,
        0,
      );
      this.shadow(context.detail, 0.8, 0.8, x, z, SIDEWALK_TOP + 0.013);
    }
  }

  private addVehicles(context: BuildContext, rng: Rng, theme: ZoneTheme): void {
    const [minVehicles, maxVehicles] = theme.dressing.vehicleCount;
    for (const side of [-1, 1] as const) {
      const count = rng.int(minVehicles, maxVehicles);
      for (let i = 0; i < count; i += 1) {
        const z = rng.range(-20, 20);
        const x = side * rng.range(9.1, 9.35);
        const roll = rng.next();
        if (roll < 0.34) {
          this.addMotorcycle(context, x, z, rng);
        } else if (roll < 0.5 && i === 0) {
          this.addAutoRickshaw(context, x + side * 0.3, z, rng);
        } else {
          this.addScooter(context, x, z, rng);
        }
      }
    }

    if (
      (theme.id === 'residential' ||
        theme.id === 'market' ||
        theme.id === 'traffic') &&
      rng.chance(0.7)
    ) {
      const side = rng.chance(0.5) ? -1 : 1;
      this.addMotorcycle(
        context,
        side * rng.range(5.0, 5.2),
        rng.range(-19, 19),
        rng,
      );
    }
  }

  private addMotorcycle(
    context: BuildContext,
    x: number,
    z: number,
    rng: Rng,
  ): void {
    const color = rng.pick(VEHICLE_COLORS);
    const trim = rng.pick([0x2d3032, 0x3e4443, 0x6d6f6b] as const);
    const y = SIDEWALK_TOP;

    this.shadow(context.detail, 0.92, 1.95, x, z, y + 0.014);
    for (const wheelZ of [z - 0.64, z + 0.6]) {
      this.cylinder(
        context.detail,
        this.materials.metal,
        0x24282a,
        0.31,
        0.31,
        0.11,
        14,
        x,
        y + 0.31,
        wheelZ,
        { cast: true, receive: true, rotZ: Math.PI / 2 },
      );
      this.cylinder(
        context.detail,
        this.materials.metal,
        0xb5b3a8,
        0.12,
        0.12,
        0.13,
        10,
        x,
        y + 0.31,
        wheelZ,
        { cast: true, receive: false, rotZ: Math.PI / 2 },
      );
    }

    this.box(
      context.detail,
      this.materials.metal,
      trim,
      0.34,
      0.14,
      1.1,
      x,
      y + 0.52,
      z,
      { cast: true, receive: true, tile: 0 },
    );
    this.box(
      context.detail,
      this.materials.metal,
      color,
      0.36,
      0.3,
      0.56,
      x,
      y + 0.74,
      z - 0.12,
      { cast: true, receive: true, tile: 0 },
    );
    this.box(
      context.detail,
      this.materials.fabric,
      0x24262a,
      0.3,
      0.1,
      0.66,
      x,
      y + 0.82,
      z + 0.36,
      { cast: true, receive: true, tile: 0 },
    );
    this.box(
      context.detail,
      this.materials.metal,
      color,
      0.26,
      0.36,
      0.12,
      x,
      y + 0.75,
      z - 0.62,
      { cast: true, receive: true, tile: 0, rotX: -0.18 },
    );
    this.box(
      context.detail,
      this.materials.lampGlow,
      0xffe9b0,
      0.15,
      0.11,
      0.05,
      x,
      y + 0.88,
      z - 0.7,
      { cast: false, receive: false, tile: 0 },
    );
    this.box(
      context.detail,
      this.materials.metal,
      0xc6c6bd,
      0.66,
      0.04,
      0.04,
      x,
      y + 1.01,
      z - 0.58,
      { cast: true, receive: false, tile: 0 },
    );
    for (const offset of [-0.24, 0.24]) {
      this.cylinder(
        context.detail,
        this.materials.metal,
        0x6d6f6b,
        0.025,
        0.03,
        0.64,
        6,
        x + offset,
        y + 0.7,
        z - 0.6,
        { cast: true, receive: true, rotX: 0.2 },
      );
    }
    this.cylinder(
      context.detail,
      this.materials.metal,
      0x8a8b83,
      0.045,
      0.05,
      0.9,
      7,
      x + 0.18,
      y + 0.42,
      z + 0.3,
      { cast: true, receive: true, rotX: Math.PI / 2.2 },
    );
    this.box(
      context.detail,
      this.materials.metal,
      trim,
      0.36,
      0.22,
      0.34,
      x,
      y + 0.76,
      z + 0.72,
      { cast: true, receive: true, tile: 0 },
    );
  }

  private addScooter(
    context: BuildContext,
    x: number,
    z: number,
    rng: Rng,
  ): void {
    const color = rng.pick(VEHICLE_COLORS);
    const y = SIDEWALK_TOP;

    this.shadow(context.detail, 1.15, 1.8, x, z, y + 0.014);
    this.box(
      context.detail,
      this.materials.metal,
      color,
      0.4,
      0.34,
      1.14,
      x,
      y + 0.58,
      z,
      { cast: true, receive: true, tile: 0 },
    );
    this.box(
      context.detail,
      this.materials.fabric,
      0x2c2e31,
      0.34,
      0.13,
      0.5,
      x,
      y + 0.83,
      z + 0.15,
      { cast: true, receive: true, tile: 0 },
    );
    this.box(
      context.detail,
      this.materials.metal,
      color,
      0.36,
      0.52,
      0.18,
      x,
      y + 0.66,
      z - 0.5,
      { cast: true, receive: true, tile: 0 },
    );
    this.box(
      context.detail,
      this.materials.lampGlow,
      0xffe9b0,
      0.18,
      0.13,
      0.05,
      x,
      y + 0.75,
      z - 0.6,
      { cast: false, receive: false, tile: 0 },
    );
    this.box(
      context.detail,
      this.materials.metal,
      0xc6c6bd,
      0.66,
      0.04,
      0.04,
      x,
      y + 0.98,
      z - 0.48,
      { cast: true, receive: false, tile: 0 },
    );
    for (const wheelZ of [z - 0.52, z + 0.48]) {
      const wheel = this.cylinder(
        context.detail,
        this.materials.metal,
        0x252a2d,
        0.23,
        0.23,
        0.13,
        12,
        x,
        y + 0.24,
        wheelZ,
        { cast: true, receive: true, rotZ: Math.PI / 2 },
      );
      wheel.rotation.z = Math.PI / 2;
    }
    this.box(
      context.detail,
      this.materials.metal,
      0x252a2d,
      0.44,
      0.06,
      0.18,
      x,
      y + 0.42,
      z + 0.6,
      { cast: true, receive: true, tile: 0 },
    );
  }

  private addAutoRickshaw(
    context: BuildContext,
    x: number,
    z: number,
    rng: Rng,
  ): void {
    const yellow = rng.chance(0.5) ? 0xe5b83f : 0x2f7d4a;
    const green = yellow === 0xe5b83f ? 0x2f7d4a : 0xe5b83f;
    const y = SIDEWALK_TOP;

    this.shadow(context.detail, 1.55, 2.45, x, z, y + 0.014);
    this.box(
      context.detail,
      this.materials.metal,
      green,
      1.0,
      0.55,
      1.7,
      x,
      y + 0.52,
      z,
      { cast: true, receive: true, tile: 0 },
    );
    this.box(
      context.detail,
      this.materials.metal,
      yellow,
      1.0,
      0.57,
      1.7,
      x,
      y + 0.97,
      z,
      { cast: true, receive: true, tile: 0 },
    );
    this.box(
      context.detail,
      this.materials.metal,
      yellow,
      0.92,
      0.64,
      1.02,
      x,
      y + 1.34,
      z - 0.14,
      { cast: true, receive: true, tile: 0 },
    );
    this.box(
      context.detail,
      this.materials.fabric,
      0x25282c,
      0.96,
      0.08,
      1.14,
      x,
      y + 1.7,
      z - 0.14,
      { cast: true, receive: false, tile: 0 },
    );
    this.box(
      context.detail,
      this.materials.glass,
      0x587a8a,
      0.82,
      0.42,
      0.06,
      x,
      y + 1.36,
      z - 0.68,
      { cast: false, receive: true, tile: 0 },
    );
    for (const wheelX of [-0.55, 0.55]) {
      this.cylinder(
        context.detail,
        this.materials.metal,
        0x25282c,
        0.26,
        0.26,
        0.14,
        12,
        x + wheelX,
        y + 0.26,
        z + 0.58,
        { cast: true, receive: true, rotZ: Math.PI / 2 },
      );
    }
    this.cylinder(
      context.detail,
      this.materials.metal,
      0x25282c,
      0.22,
      0.22,
      0.12,
      12,
      x,
      y + 0.22,
      z - 0.64,
      { cast: true, receive: true, rotZ: Math.PI / 2 },
    );
    this.box(
      context.detail,
      this.materials.metal,
      0xebd8a1,
      1.03,
      0.1,
      1.7,
      x,
      y + 0.24,
      z,
      { cast: true, receive: true, tile: 0 },
    );
    this.box(
      context.detail,
      this.materials.metal,
      0x25282c,
      0.5,
      0.12,
      0.12,
      x,
      y + 1.84,
      z - 0.14,
      { cast: true, receive: false, tile: 0 },
    );
  }

  private addStalls(context: BuildContext, rng: Rng, theme: ZoneTheme): void {
    const [minStalls, maxStalls] = theme.dressing.stallCount;
    const count = rng.int(minStalls, maxStalls);
    for (let stall = 0; stall < count; stall += 1) {
      const side = (stall % 2 === 0 ? -1 : 1) as Side;
      const z = rng.range(-17, 17);
      if (rng.chance(0.58)) {
        this.addTeaStall(context, side * rng.range(5.45, 5.9), z, rng);
      } else {
        this.addVegetableCart(context, side * rng.range(5.35, 5.8), z, rng);
      }
    }
  }

  private addTeaStall(
    context: BuildContext,
    x: number,
    z: number,
    rng: Rng,
  ): void {
    const y = SIDEWALK_TOP;
    const canopyColor = rng.pick(FABRIC_COLORS);
    const woodColor = rng.pick([0x765536, 0x8b643e, 0x664a34] as const);

    this.shadow(context.detail, 1.8, 3.0, x, z, y + 0.014);
    this.box(
      context.detail,
      this.materials.wood,
      woodColor,
      0.92,
      0.82,
      2.35,
      x,
      y + 0.43,
      z,
      { cast: true, receive: true, tile: 0.8 },
    );
    this.box(
      context.detail,
      this.materials.wood,
      0x9d7749,
      1.02,
      0.08,
      2.5,
      x,
      y + 0.88,
      z,
      { cast: true, receive: true, tile: 0.8 },
    );
    this.box(
      context.detail,
      this.materials.fabric,
      canopyColor,
      1.18,
      0.065,
      2.6,
      x,
      y + 2.22,
      z,
      { cast: true, receive: true, tile: 0, rotZ: Math.sign(x) * 0.07 },
    );
    this.box(
      context.detail,
      this.materials.fabric,
      canopyColor,
      0.035,
      0.3,
      2.6,
      x - Math.sign(x) * 0.58,
      y + 2.04,
      z,
      { cast: true, receive: false, tile: 0 },
    );

    for (const poleZ of [z - 1.12, z + 1.12]) {
      this.cylinder(
        context.detail,
        this.materials.metal,
        0x54584f,
        0.035,
        0.035,
        2.1,
        6,
        x - Math.sign(x) * 0.5,
        y + 1.05,
        poleZ,
        { cast: true, receive: true },
      );
    }

    this.sign(
      context.detail,
      SIGN_CELLS.chai,
      1.35,
      0.45,
      x - Math.sign(x) * 0.48,
      y + 1.88,
      z,
      Math.sign(x) as Side,
    );

    this.cylinder(
      context.detail,
      this.materials.metal,
      0xb7b3a5,
      0.13,
      0.16,
      0.25,
      9,
      x,
      y + 1.03,
      z + 0.55,
      { cast: true, receive: true },
    );
    this.cylinder(
      context.detail,
      this.materials.metal,
      0x4f5552,
      0.18,
      0.18,
      0.06,
      10,
      x,
      y + 1.18,
      z + 0.55,
      { cast: true, receive: false },
    );
    for (let jar = 0; jar < 3; jar += 1) {
      this.cylinder(
        context.detail,
        this.materials.glass,
        [0x9fbfc0, 0xd9b76d, 0xb57e54][jar],
        0.1,
        0.1,
        0.22,
        8,
        x + (jar - 1) * 0.24,
        y + 1.11,
        z - 0.6,
        { cast: true, receive: true },
      );
    }

    this.box(
      context.detail,
      this.materials.wood,
      woodColor,
      0.38,
      0.06,
      0.55,
      x + Math.sign(x) * 0.72,
      y + 0.55,
      z + 0.45,
      { cast: true, receive: true, tile: 0 },
    );
    for (const legZ of [z + 0.25, z + 0.65]) {
      this.cylinder(
        context.detail,
        this.materials.metal,
        0x55584f,
        0.035,
        0.035,
        0.5,
        6,
        x + Math.sign(x) * 0.72,
        y + 0.28,
        legZ,
        { cast: true, receive: true },
      );
    }
  }

  private addVegetableCart(
    context: BuildContext,
    x: number,
    z: number,
    rng: Rng,
  ): void {
    const y = SIDEWALK_TOP;
    const woodColor = rng.pick([0x7a5937, 0x8c6942, 0x62462f] as const);
    const produceColors = [0xd85e35, 0x5b8f37, 0xd9a52e, 0x7a4b8e, 0xb33d37] as const;

    this.shadow(context.detail, 1.45, 2.55, x, z, y + 0.014);
    this.box(
      context.detail,
      this.materials.wood,
      woodColor,
      1.0,
      0.16,
      2.1,
      x,
      y + 0.82,
      z,
      { cast: true, receive: true, tile: 0.8 },
    );
    for (const sideOffset of [-0.42, 0.42]) {
      this.box(
        context.detail,
        this.materials.wood,
        woodColor,
        0.1,
        0.68,
        2.0,
        x + sideOffset,
        y + 0.48,
        z,
        { cast: true, receive: true, tile: 0.7 },
      );
    }
    for (const wheelZ of [z - 0.68, z + 0.68]) {
      this.cylinder(
        context.detail,
        this.materials.metal,
        0x3a3228,
        0.38,
        0.38,
        0.1,
        12,
        x,
        y + 0.39,
        wheelZ,
        { cast: true, receive: true, rotZ: Math.PI / 2 },
      );
      this.cylinder(
        context.detail,
        this.materials.wood,
        0x9a7a52,
        0.12,
        0.12,
        0.12,
        8,
        x,
        y + 0.39,
        wheelZ,
        { cast: true, receive: false, rotZ: Math.PI / 2 },
      );
    }

    for (let crate = 0; crate < 4; crate += 1) {
      const crateZ = z - 0.72 + (crate % 2) * 0.72;
      const crateX = x + (crate < 2 ? -0.22 : 0.22);
      this.box(
        context.detail,
        this.materials.wood,
        0x9a7449,
        0.4,
        0.18,
        0.62,
        crateX,
        y + 1.0,
        crateZ,
        { cast: true, receive: true, tile: 0 },
      );
      for (let item = 0; item < 4; item += 1) {
        this.sphere(
          context.detail,
          this.materials.foliage,
          produceColors[(crate + item) % produceColors.length],
          0.09,
          6,
          5,
          crateX + ((item % 2) - 0.5) * 0.19,
          y + 1.13,
          crateZ + (Math.floor(item / 2) - 0.5) * 0.22,
          { cast: false, receive: false, scaleY: 0.9 },
        );
      }
    }

    if (rng.chance(0.6)) {
      this.box(
        context.detail,
        this.materials.fabric,
        0xe4d6b7,
        0.03,
        0.3,
        0.8,
        x - Math.sign(x) * 0.53,
        y + 1.22,
        z + 0.35,
        { cast: false, receive: false, tile: 0 },
      );
      this.cylinder(
        context.detail,
        this.materials.metal,
        0x5c5749,
        0.035,
        0.035,
        0.78,
        6,
        x - Math.sign(x) * 0.34,
        y + 1.17,
        z + 0.72,
        { cast: true, receive: true, rotX: Math.PI / 2 },
      );
    }
  }

  private addShopDisplay(
    context: BuildContext,
    rng: Rng,
    side: Side,
    centerZ: number,
  ): void {
    const x = side * rng.range(4.95, 5.25);
    const z = centerZ + rng.range(1.9, 3.0) * (rng.chance(0.5) ? -1 : 1);
    const palette = [0xd85e35, 0x5b8f37, 0xd9a52e, 0xb33d37, 0x7c4e8d] as const;

    this.shadow(context.detail, 1.2, 1.5, x, z, SIDEWALK_TOP + 0.014);
    for (let crate = 0; crate < 2; crate += 1) {
      this.box(
        context.detail,
        this.materials.wood,
        0x9a7449,
        0.62,
        0.32,
        0.58,
        x,
        SIDEWALK_TOP + 0.18 + crate * 0.3,
        z + crate * 0.65,
        { cast: true, receive: true, tile: 0.7 },
      );
      for (let item = 0; item < 4; item += 1) {
        this.sphere(
          context.detail,
          this.materials.foliage,
          palette[(crate + item) % palette.length],
          0.1,
          6,
          5,
          x + ((item % 2) - 0.5) * 0.25,
          SIDEWALK_TOP + 0.4 + crate * 0.3,
          z + crate * 0.65 + (Math.floor(item / 2) - 0.5) * 0.27,
          { cast: false, receive: false, scaleY: 0.9 },
        );
      }
    }
  }

  private addSmallProps(context: BuildContext, rng: Rng): void {
    for (const side of [-1, 1] as const) {
      this.addBin(context, side * rng.range(6.5, 6.9), rng.range(-16, 16), rng);
      this.addBin(context, side * rng.range(6.5, 6.9), rng.range(-16, 16), rng);
      for (let planter = 0; planter < 2; planter += 1) {
        this.addPlanter(
          context,
          side * rng.range(6.45, 6.95),
          rng.range(-18, 18),
          rng,
        );
      }
    }
  }

  private addPedestrians(context: BuildContext, rng: Rng, theme: ZoneTheme): void {
    const count =
      theme.id === 'market' ||
      theme.id === 'traffic' ||
      theme.id === 'festival'
        ? 4
        : theme.id === 'construction'
          ? 1
          : 2;

    for (let index = 0; index < count; index += 1) {
      const side = rng.chance(0.5) ? -1 : 1;
      const x = side * rng.range(5.35, 6.55);
      const z = rng.range(-HALF + 4, HALF - 4);
      this.addPedestrian(context, x, z, rng);
    }
  }

  private addPedestrian(
    context: BuildContext,
    x: number,
    z: number,
    rng: Rng,
  ): void {
    const figure = new THREE.Group();
    figure.position.set(x, SIDEWALK_TOP, z);
    figure.rotation.y = rng.range(0, Math.PI * 2);
    figure.scale.setScalar(rng.range(0.92, 1.04));
    context.detail.add(figure);

    const skin = rng.pick([0x9a6a4f, 0x7d5038, 0xb47a58, 0x6b452f] as const);
    const shirt = rng.pick([
      0xd9e2e8, 0x3d8b83, 0xe26a48, 0x8e5a8e, 0xd8a03f, 0x5b7fa8, 0xe8d9b4,
    ] as const);
    const trousers = rng.pick([0x344355, 0x4f4539, 0x2e343a, 0x6c655d] as const);
    const hair = rng.chance(0.85) ? 0x241c18 : 0xb9b0a2;
    const walk = rng.range(-0.15, 0.15);

    this.shadow(figure, 0.75, 0.62, 0, 0, 0.012);

    for (const offset of [-0.11, 0.11]) {
      this.box(
        figure,
        this.materials.fabric,
        trousers,
        0.14,
        0.7,
        0.17,
        offset,
        0.35,
        offset > 0 ? walk : -walk,
        { cast: true, receive: true, tile: 0 },
      );
      this.box(
        figure,
        this.materials.metal,
        0x2b2c2d,
        0.15,
        0.09,
        0.25,
        offset,
        0.045,
        (offset > 0 ? walk : -walk) - 0.03,
        { cast: false, receive: true, tile: 0 },
      );
    }

    this.box(
      figure,
      this.materials.fabric,
      shirt,
      0.38,
      0.56,
      0.23,
      0,
      1.0,
      0,
      { cast: true, receive: true, tile: 0 },
    );
    this.box(
      figure,
      this.materials.fabric,
      shirt,
      0.44,
      0.12,
      0.25,
      0,
      0.75,
      0,
      { cast: false, receive: true, tile: 0 },
    );

    for (const offset of [-0.25, 0.25]) {
      this.cylinder(
        figure,
        this.materials.plaster,
        skin,
        0.052,
        0.058,
        0.58,
        7,
        offset,
        0.98,
        offset > 0 ? -walk * 0.7 : walk * 0.7,
        { cast: true, receive: true, rotX: offset > 0 ? 0.12 : -0.12 },
      );
    }

    this.sphere(
      figure,
      this.materials.plaster,
      skin,
      0.135,
      9,
      7,
      0,
      1.41,
      0,
      { scaleY: 1.08, cast: true, receive: true },
    );
    this.sphere(
      figure,
      this.materials.fabric,
      hair,
      0.138,
      9,
      6,
      0,
      1.47,
      0.015,
      { scaleY: 0.62, cast: false, receive: false },
    );

    if (rng.chance(0.45)) {
      this.box(
        figure,
        this.materials.fabric,
        rng.pick(FABRIC_COLORS),
        0.07,
        0.48,
        0.3,
        0.24,
        1.0,
        0.02,
        { cast: false, receive: false, tile: 0 },
      );
    }

    if (rng.chance(0.3)) {
      this.box(
        figure,
        this.materials.wood,
        0x8a6a44,
        0.28,
        0.2,
        0.06,
        0,
        1.0,
        -0.16,
        { cast: false, receive: false, tile: 0 },
      );
    }
  }

  private addBin(
    context: BuildContext,
    x: number,
    z: number,
    rng: Rng,
  ): void {
    const color = rng.chance(0.5) ? 0x2f6b4f : 0x2d5f79;
    this.shadow(context.detail, 0.75, 0.75, x, z, SIDEWALK_TOP + 0.012);
    this.cylinder(
      context.detail,
      this.materials.metal,
      color,
      0.27,
      0.23,
      0.72,
      10,
      x,
      SIDEWALK_TOP + 0.36,
      z,
      { cast: true, receive: true },
    );
    this.cylinder(
      context.detail,
      this.materials.metal,
      0x243a34,
      0.29,
      0.29,
      0.08,
      10,
      x,
      SIDEWALK_TOP + 0.74,
      z,
      { cast: true, receive: false },
    );
  }

  private addPlanter(
    context: BuildContext,
    x: number,
    z: number,
    rng: Rng,
  ): void {
    const potColor = rng.chance(0.5) ? 0x9d4b35 : 0xb77746;
    const flowerColor = rng.pick([0xd85a35, 0xe1a52f, 0xc94c73, 0xe1df9e] as const);
    this.shadow(context.detail, 0.75, 0.75, x, z, SIDEWALK_TOP + 0.011);
    this.cylinder(
      context.detail,
      this.materials.plaster,
      potColor,
      0.19,
      0.27,
      0.48,
      9,
      x,
      SIDEWALK_TOP + 0.24,
      z,
      { cast: true, receive: true },
    );
    this.sphere(
      context.detail,
      this.materials.foliage,
      0x4a813c,
      0.35,
      7,
      6,
      x,
      SIDEWALK_TOP + 0.62,
      z,
      { cast: true, receive: true, scaleY: 0.8 },
    );
    for (let flower = 0; flower < 3; flower += 1) {
      this.sphere(
        context.detail,
        this.materials.foliage,
        flowerColor,
        0.075,
        6,
        5,
        x + Math.cos(flower * 2.1) * 0.16,
        SIDEWALK_TOP + 0.78,
        z + Math.sin(flower * 2.1) * 0.16,
        { cast: false, receive: false },
      );
    }
  }

  private addThemeDressing(
    context: BuildContext,
    rng: Rng,
    variant: number,
    theme: ZoneTheme,
  ): void {
    switch (theme.id) {
      case 'market':
        this.addMarketDressing(context, rng);
        break;
      case 'construction':
        this.addConstructionDressing(context, rng, variant);
        break;
      case 'temple':
        this.addTempleDressing(context, rng, variant);
        break;
      case 'festival':
        this.addFestivalDressing(context, rng);
        break;
      case 'traffic':
        this.addTrafficDressing(context, rng);
        break;
      case 'outskirts':
        this.addOutskirtsDressing(context, rng, variant);
        break;
      default:
        break;
    }
  }

  private addMarketDressing(context: BuildContext, rng: Rng): void {
    for (const side of [-1, 1] as const) {
      for (let awning = 0; awning < 2; awning += 1) {
        const z = -HALF + 8 + awning * 20 + rng.range(-2, 2);
        this.box(
          context.detail,
          this.materials.fabric,
          rng.pick(FABRIC_COLORS),
          1.35,
          0.06,
          3.1,
          side * (FRONT_X - 0.55),
          2.85,
          z,
          { rotZ: -side * 0.18, cast: true, receive: false, tile: 0 },
        );
      }

      for (let crate = 0; crate < 3; crate += 1) {
        const z = rng.range(-18, 18);
        const x = side * (SIDEWALK_INNER + 0.85);
        this.box(
          context.detail,
          this.materials.wood,
          rng.pick([0x8a623c, 0x9d7448, 0x77543a] as const),
          0.62,
          0.4,
          0.5,
          x,
          SIDEWALK_TOP + 0.2,
          z,
          { tile: 0.8 },
        );
        this.box(
          context.detail,
          this.materials.wood,
          0x6f4e33,
          0.62,
          0.4,
          0.5,
          x,
          SIDEWALK_TOP + 0.6,
          z,
          { tile: 0.8 },
        );
        this.sphere(
          context.detail,
          this.materials.fabric,
          0xa8895f,
          0.28,
          7,
          5,
          x + 0.55,
          SIDEWALK_TOP + 0.22,
          z + 0.45,
          { scaleY: 1.15, cast: true, receive: true },
        );
      }
    }
  }

  private addConstructionDressing(
    context: BuildContext,
    rng: Rng,
    variant: number,
  ): void {
    const side = (variant % 2 === 0 ? 1 : -1) as Side;
    const barrierX = side * (SIDEWALK_INNER + 0.72);

    for (let barrier = 0; barrier < 4; barrier += 1) {
      const z = -HALF + 7 + barrier * 9.5 + rng.range(-1.2, 1.2);
      this.shadow(
        context.detail,
        0.6,
        2.05,
        barrierX,
        z,
        SIDEWALK_TOP + 0.012,
      );
      this.box(
        context.core,
        this.materials.concrete,
        0xb9b2a4,
        0.3,
        0.16,
        1.9,
        barrierX,
        SIDEWALK_TOP + 0.08,
        z,
        { tile: 1.2 },
      );
      this.box(
        context.core,
        this.materials.concrete,
        barrier % 2 === 0 ? 0xc9573f : 0xd9d2c4,
        0.14,
        0.58,
        1.72,
        barrierX,
        SIDEWALK_TOP + 0.45,
        z,
        { tile: 0.6 },
      );
      for (const legZ of [z - 0.72, z + 0.72]) {
        this.box(
          context.core,
          this.materials.concrete,
          0x8f8b81,
          0.34,
          0.05,
          0.34,
          barrierX,
          SIDEWALK_TOP + 0.03,
          legZ,
          { cast: false, receive: true, tile: 0 },
        );
      }
    }

    for (let cone = 0; cone < 3; cone += 1) {
      const z = -HALF + 12 + cone * 14 + rng.range(-1, 1);
      const x = side * (ROAD_EDGE + 0.3);
      this.cylinder(
        context.detail,
        this.materials.plaster,
        0xd96b2f,
        0.05,
        0.17,
        0.46,
        10,
        x,
        SIDEWALK_TOP + 0.23,
        z,
        { cast: true, receive: true },
      );
      this.box(
        context.detail,
        this.materials.plaster,
        0xd9d2c4,
        0.26,
        0.05,
        0.26,
        x,
        SIDEWALK_TOP + 0.025,
        z,
        { cast: false, receive: true, tile: 0 },
      );
    }

    for (const propSide of [-1, 1] as const) {
      this.sphere(
        context.core,
        this.materials.concrete,
        0xbca57e,
        0.85,
        9,
        6,
        propSide * 6.35,
        SIDEWALK_TOP + 0.2,
        rng.range(-16, 16),
        { scaleY: 0.42, cast: true, receive: true },
      );

      const brickZ = rng.range(-18, 18);
      for (let row = 0; row < 3; row += 1) {
        this.box(
          context.core,
          this.materials.brick,
          0xa35a44,
          0.85,
          0.18,
          0.45,
          propSide * 6.9,
          SIDEWALK_TOP + 0.09 + row * 0.18,
          brickZ,
          { tile: 0.8 },
        );
      }
    }

    const scaffoldZ = rng.range(-14, 14);
    const scaffoldX = side * (FRONT_X + 0.55);
    for (const dx of [-0.9, 0.9]) {
      for (const dz of [-2.2, 2.2]) {
        this.cylinder(
          context.detail,
          this.materials.metal,
          0x6f6b60,
          0.05,
          0.05,
          4.2,
          6,
          scaffoldX + dx,
          SIDEWALK_TOP + 2.1,
          scaffoldZ + dz,
          { cast: true, receive: true },
        );
      }
    }
    for (const y of [1.4, 2.8, 4.0]) {
      this.box(
        context.detail,
        this.materials.metal,
        0x6f6b60,
        2.0,
        0.06,
        0.06,
        scaffoldX,
        SIDEWALK_TOP + y,
        scaffoldZ,
        { cast: true, receive: false, tile: 0 },
      );
      this.box(
        context.detail,
        this.materials.metal,
        0x6f6b60,
        0.06,
        0.06,
        4.4,
        scaffoldX,
        SIDEWALK_TOP + y,
        scaffoldZ,
        { cast: true, receive: false, tile: 0 },
      );
    }

    for (let patch = 0; patch < 3; patch += 1) {
      this.box(
        context.core,
        this.materials.concrete,
        0x46474a,
        rng.range(1.1, 2.2),
        0.008,
        rng.range(1.4, 2.6),
        rng.range(-2.6, 2.6),
        0.012,
        rng.range(-18, 18),
        { cast: false, receive: true, tile: 0 },
      );
    }
  }

  private addTempleDressing(
    context: BuildContext,
    rng: Rng,
    variant: number,
  ): void {
    const side = (variant % 2 === 0 ? 1 : -1) as Side;

    for (let bead = 0; bead < 8; bead += 1) {
      const z = -HALF + 6 + bead * 5.5;
      this.sphere(
        context.detail,
        this.materials.foliage,
        bead % 2 === 0 ? 0xe08a2e : 0xd94b3f,
        0.09,
        6,
        5,
        side * (FRONT_X - 0.2),
        3.05 - Math.sin(bead * 0.9) * 0.08,
        z,
        { cast: false, receive: false },
      );
    }

    for (let flag = 0; flag < 3; flag += 1) {
      const z = -HALF + 10 + flag * 14 + rng.range(-1, 1);
      const x = side * (SIDEWALK_INNER + 0.5);
      this.cylinder(
        context.core,
        this.materials.metal,
        0x6c5a3a,
        0.035,
        0.045,
        3.2,
        6,
        x,
        SIDEWALK_TOP + 1.6,
        z,
        { cast: true, receive: true },
      );
      this.box(
        context.detail,
        this.materials.fabric,
        0xd9772f,
        0.02,
        0.55,
        0.85,
        x + side * 0.03,
        SIDEWALK_TOP + 2.75,
        z + 0.45,
        { cast: false, receive: false, tile: 0 },
      );
    }
  }

  private addFestivalDressing(context: BuildContext, rng: Rng): void {
    for (const z of [-HALF + 12, HALF - 14]) {
      this.box(
        context.detail,
        this.materials.metal,
        0x2d2b28,
        ROAD.width + 2.4,
        0.03,
        0.03,
        0,
        4.9,
        z,
        { cast: false, receive: false, tile: 0 },
      );
      for (let bulb = 0; bulb < 9; bulb += 1) {
        const x = -ROAD.width / 2 - 0.6 + (bulb / 8) * (ROAD.width + 1.2);
        this.sphere(
          context.detail,
          this.materials.lampGlow,
          0xffffff,
          0.085,
          6,
          5,
          x,
          4.82,
          z,
          { cast: false, receive: false },
        );
        if (bulb % 2 === 0) {
          this.box(
            context.detail,
            this.materials.fabric,
            rng.pick(FABRIC_COLORS),
            0.32,
            0.55,
            0.02,
            x,
            4.45,
            z + 0.02,
            { cast: false, receive: false, tile: 0 },
          );
        }
      }
    }

    for (const side of [-1, 1] as const) {
      for (let rangoli = 0; rangoli < 3; rangoli += 1) {
        const z = rng.range(-18, 18);
        const x = side * (SIDEWALK_INNER + 1.0);
        this.box(
          context.detail,
          this.materials.plaster,
          rng.pick([0xd94b3f, 0xe2a63a, 0x4ca36a, 0xe0d8f0] as const),
          0.95,
          0.008,
          0.95,
          x,
          SIDEWALK_TOP + 0.006,
          z,
          { rotY: Math.PI / 4, cast: false, receive: true, tile: 0 },
        );
        this.box(
          context.detail,
          this.materials.plaster,
          0xf2e8cf,
          0.34,
          0.009,
          0.34,
          x,
          SIDEWALK_TOP + 0.007,
          z,
          { rotY: Math.PI / 4, cast: false, receive: true, tile: 0 },
        );
      }

      const bannerZ = rng.range(-18, 18);
      this.box(
        context.detail,
        this.materials.fabric,
        rng.pick(FABRIC_COLORS),
        0.03,
        0.8,
        2.2,
        side * (FRONT_X - 0.12),
        3.2,
        bannerZ,
        { cast: false, receive: false, tile: 0 },
      );
    }
  }

  private addTrafficDressing(context: BuildContext, rng: Rng): void {
    const crossingZ = -HALF + 16 + rng.range(-2, 2);

    for (let stripe = 0; stripe < 7; stripe += 1) {
      this.box(
        context.core,
        this.materials.marking,
        0xffffff,
        0.55,
        0.012,
        3.0,
        -3.3 + stripe * 1.1,
        0.014,
        crossingZ,
        { cast: false, receive: true, tile: 0 },
      );
    }
    this.box(
      context.core,
      this.materials.marking,
      0xffffff,
      ROAD.width - 0.7,
      0.012,
      0.24,
      0,
      0.014,
      crossingZ + 2.2,
      { cast: false, receive: true, tile: 0 },
    );

    for (const side of [-1, 1] as const) {
      const x = side * (ROAD_EDGE + 0.55);
      this.cylinder(
        context.detail,
        this.materials.metal,
        0x4b4f4c,
        0.06,
        0.075,
        3.4,
        8,
        x,
        SIDEWALK_TOP + 1.7,
        crossingZ,
        { cast: true, receive: true },
      );
      this.box(
        context.detail,
        this.materials.metal,
        0x3b3f3c,
        0.26,
        0.85,
        0.22,
        x,
        SIDEWALK_TOP + 3.45,
        crossingZ,
        { cast: true, receive: false, tile: 0 },
      );
      const lights = [0xcf4a3e, 0xe2a63a, 0x4ca36a] as const;
      for (let light = 0; light < lights.length; light += 1) {
        this.sphere(
          context.detail,
          this.materials.plaster,
          lights[light],
          0.075,
          6,
          5,
          x,
          SIDEWALK_TOP + 3.72 - light * 0.24,
          crossingZ + 0.12,
          { cast: false, receive: false },
        );
      }
    }

    for (const side of [-1, 1] as const) {
      const z = rng.range(-18, 18);
      this.box(
        context.core,
        this.materials.marking,
        0xffffff,
        0.18,
        0.012,
        2.2,
        side * 1.35,
        0.014,
        z,
        { cast: false, receive: true, tile: 0 },
      );
      this.box(
        context.core,
        this.materials.marking,
        0xffffff,
        0.55,
        0.012,
        0.18,
        side * 1.35,
        0.014,
        z - 1.02,
        { cast: false, receive: true, tile: 0 },
      );
    }
  }

  private addOutskirtsDressing(
    context: BuildContext,
    rng: Rng,
    variant: number,
  ): void {
    const side = (variant % 2 === 0 ? 1 : -1) as Side;

    for (let hedge = 0; hedge < 3; hedge += 1) {
      const z = -HALF + 8 + hedge * 16 + rng.range(-2, 2);
      this.box(
        context.core,
        this.materials.foliage,
        rng.pick(LEAF_COLORS),
        0.9,
        0.55,
        6.5,
        side * 12.5,
        0.3,
        z,
        { cast: true, receive: true, tile: 0 },
      );
    }

    for (let stack = 0; stack < 2; stack += 1) {
      const z = rng.range(-18, 18);
      const x = side * rng.range(10.5, 12.5);
      this.cylinder(
        context.core,
        this.materials.wood,
        0xc2a05a,
        0.55,
        0.8,
        1.1,
        10,
        x,
        0.55,
        z,
        { cast: true, receive: true },
      );
      this.sphere(
        context.core,
        this.materials.wood,
        0xd2b46a,
        0.7,
        8,
        6,
        x,
        1.15,
        z,
        { scaleY: 0.6, cast: true, receive: true },
      );
    }
  }

  private box(
    parent: THREE.Object3D,
    material: THREE.Material,
    color: number,
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    options: MeshOptions = {},
  ): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    if ((options.tile ?? 0) > 0 && (material as THREE.MeshStandardMaterial).map) {
      scaleBoxUvs(geometry, width, height, depth, options.tile ?? 1);
    }
    setVertexColor(geometry, color);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.set(
      options.rotX ?? 0,
      options.rotY ?? 0,
      options.rotZ ?? 0,
    );
    mesh.castShadow = options.cast ?? true;
    mesh.receiveShadow = options.receive ?? true;
    parent.add(mesh);
    return mesh;
  }

  private plane(
    material: THREE.Material,
    width: number,
    depth: number,
    uTile: number,
    vTile: number,
    widthSegments = 1,
    depthSegments = 1,
  ): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(
      width,
      depth,
      widthSegments,
      depthSegments,
    );
    const uv = geometry.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i += 1) {
      uv.setXY(i, (uv.getX(i) * width) / uTile, (uv.getY(i) * depth) / vTile);
    }
    uv.needsUpdate = true;
    geometry.rotateX(-Math.PI / 2);
    setVertexColor(geometry, 0xffffff);

    const mesh = new THREE.Mesh(geometry, material);
    return mesh;
  }

  private cylinder(
    parent: THREE.Object3D,
    material: THREE.Material,
    color: number,
    radiusTop: number,
    radiusBottom: number,
    height: number,
    segments: number,
    x: number,
    y: number,
    z: number,
    options: MeshOptions = {},
  ): THREE.Mesh {
    const geometry = new THREE.CylinderGeometry(
      radiusTop,
      radiusBottom,
      height,
      segments,
    );
    setVertexColor(geometry, color);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.set(
      options.rotX ?? 0,
      options.rotY ?? 0,
      options.rotZ ?? 0,
    );
    mesh.castShadow = options.cast ?? true;
    mesh.receiveShadow = options.receive ?? true;
    parent.add(mesh);
    return mesh;
  }

  private sphere(
    parent: THREE.Object3D,
    material: THREE.Material,
    color: number,
    radius: number,
    widthSegments: number,
    heightSegments: number,
    x: number,
    y: number,
    z: number,
    options: MeshOptions = {},
  ): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(
      radius,
      widthSegments,
      heightSegments,
    );
    setVertexColor(geometry, color);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.y = options.scaleY ?? 1;
    mesh.castShadow = options.cast ?? true;
    mesh.receiveShadow = options.receive ?? true;
    parent.add(mesh);
    return mesh;
  }

  private sign(
    parent: THREE.Object3D,
    cell: number,
    width: number,
    height: number,
    x: number,
    y: number,
    z: number,
    side: Side | 0,
  ): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(width, height);
    const uv = geometry.attributes.uv as THREE.BufferAttribute;
    const cellSize = 1 / 4;
    const column = cell % 4;
    const row = Math.floor(cell / 4);
    const baseV = 1 - (row + 1) * cellSize;

    for (let i = 0; i < uv.count; i += 1) {
      uv.setXY(
        i,
        (column + uv.getX(i)) * cellSize,
        baseV + uv.getY(i) * cellSize,
      );
    }
    uv.needsUpdate = true;
    setVertexColor(geometry, 0xffffff);

    const mesh = new THREE.Mesh(geometry, this.materials.signAtlas);
    mesh.position.set(x, y, z);
    mesh.rotation.y = side === 1 ? -Math.PI / 2 : side === -1 ? Math.PI / 2 : 0;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private shadow(
    parent: THREE.Object3D,
    width: number,
    depth: number,
    x: number,
    z: number,
    y: number,
  ): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(width, depth);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, this.materials.contactShadow);
    mesh.position.set(x, y, z);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
  }

  private sagWire(
    context: BuildContext,
    from: THREE.Vector3,
    to: THREE.Vector3,
    sag: number,
    segments: number,
  ): void {
    let previous = from.clone();
    for (let i = 1; i <= segments; i += 1) {
      const t = i / segments;
      const point = new THREE.Vector3().lerpVectors(from, to, t);
      point.y -= Math.sin(Math.PI * t) * sag;
      context.wires.push(
        previous.x,
        previous.y,
        previous.z,
        point.x,
        point.y,
        point.z,
      );
      previous = point;
    }
  }
}

function setVertexColor(geometry: THREE.BufferGeometry, color: number): void {
  const count = geometry.attributes.position.count;
  const data = new Float32Array(count * 3);
  const value = new THREE.Color(color);
  for (let i = 0; i < count; i += 1) {
    data[i * 3] = value.r;
    data[i * 3 + 1] = value.g;
    data[i * 3 + 2] = value.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
}

function scaleBoxUvs(
  geometry: THREE.BufferGeometry,
  width: number,
  height: number,
  depth: number,
  tile: number,
): void {
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  const repeats: Array<[number, number]> = [
    [depth, height],
    [depth, height],
    [width, depth],
    [width, depth],
    [width, height],
    [width, height],
  ];

  for (let face = 0; face < 6; face += 1) {
    const [repeatU, repeatV] = repeats[face];
    for (let vertex = 0; vertex < 4; vertex += 1) {
      const index = face * 4 + vertex;
      uv.setXY(
        index,
        (uv.getX(index) * repeatU) / tile,
        (uv.getY(index) * repeatV) / tile,
      );
    }
  }
  uv.needsUpdate = true;
}