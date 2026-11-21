/**
 * ObstacleSystem
 *
 * Responsibilities:
 *  - Procedurally spawn obstacle patterns ahead of the player.
 *  - Validate every pattern for fairness (>=1 safe lane, reaction distance).
 *  - Detect AABB collisions with the player footprint.
 *  - End the run on the first unblocked collision.
 *  - Support Shield (one blocked hit) and Super Punch (breakable debris).
 *  - Scale density and pattern complexity with the difficulty profile.
 *  - Coordinate spawns with gates, enemies and power-ups.
 *  - Animate moving walls and recycle objects behind the player.
 */
import * as THREE from 'three';
import { LANES, OBSTACLES, PLAYER, ROAD } from '../config/balance';
import {
  getDifficultyProfile,
  pickWeighted,
  type DifficultyProfile,
} from '../config/difficulty';
import { Rng } from '../core/Rng';
import type { SpawnReservations } from '../core/SpawnReservations';
import { resolveObstacleContact } from './contact';
import {
  buildObstacleMesh,
  OBSTACLE_HALF_EXTENTS,
  type ObstacleKind,
} from './ObstacleMeshBuilder';

// ─── public types ─────────────────────────────────────────────────────────────

export interface ObstacleHitEvent {
  position: THREE.Vector3;
  shieldBlocked: boolean;
  fatal: boolean;
  kind: ObstacleKind;
}

export interface ObstacleBreakEvent {
  position: THREE.Vector3;
  kind: ObstacleKind;
}

export interface ObstacleSystemCallbacks {
  onHit: (event: ObstacleHitEvent) => void;
  onBreak?: (event: ObstacleBreakEvent) => void;
}

// ─── internal types ───────────────────────────────────────────────────────────

interface ObstacleRecord {
  id: number;
  kind: ObstacleKind;
  group: THREE.Group;
  x: number;
  distance: number;
  laneIndex: number;
  halfX: number;
  halfZ: number;
  movePhase: number;
  moveAmplitude: number;
  broken: boolean;
  active: boolean;
}

interface Placement {
  laneIndex: number;
  offsetZ: number;
  kind: ObstacleKind;
}

interface Pattern {
  placements: Placement[];
  span: number;
}

// Lane X positions
const LX = LANES as readonly number[];
const OBSTACLE_RESERVATION_PAD = 7;
const OBSTACLE_OWN_RESERVATION_PAD = 2;

// ─── ObstacleSystem ───────────────────────────────────────────────────────────

export class ObstacleSystem {
  /** Set true when Shield power-up is active. */
  shieldActive = false;
  /** Set true when Super Punch power-up is active. */
  breakableActive = false;
  /** Set true while the player has temporary revive invulnerability. */
  invulnerable = false;

  private readonly records: ObstacleRecord[] = [];
  private rng = new Rng(0x0b57ac1e);
  private nextDistance: number;
  private nextId = 1;
  private time = 0;
  private runEnded = false;
  private fatalObstacleId: number | null = null;
  private difficulty: DifficultyProfile = getDifficultyProfile(0);

  // reusable vectors — zero per-frame allocation
  private readonly _pMin = new THREE.Vector3();
  private readonly _pMax = new THREE.Vector3();
  private readonly _oMin = new THREE.Vector3();
  private readonly _oMax = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly callbacks: ObstacleSystemCallbacks,
    private readonly reservations?: SpawnReservations,
  ) {
    this.nextDistance = OBSTACLES.initialDistance;
  }

  update(
    playerZ: number,
    playerX: number,
    playerDistance: number,
    dt: number,
    difficulty: DifficultyProfile = this.difficulty,
  ): void {
    if (this.runEnded) return;
    this.difficulty = difficulty;
    this.time += dt;

    const config = this.difficulty.obstacle;
    while (this.nextDistance < playerDistance + OBSTACLES.spawnAhead) {
      this.spawnPattern(this.nextDistance);
      this.nextDistance += this.rng.range(
        config.minSpacing,
        config.maxSpacing,
      );
    }

    // player AABB (reused each frame)
    this._pMin.set(
      playerX - PLAYER.collisionHalfWidth,
      0,
      playerZ - PLAYER.collisionHalfDepth,
    );
    this._pMax.set(
      playerX + PLAYER.collisionHalfWidth,
      2.2,
      playerZ + PLAYER.collisionHalfDepth,
    );

    // iterate backwards so splice inside deactivate is safe
    for (let i = this.records.length - 1; i >= 0; i--) {
      const rec = this.records[i];
      if (!rec.active) continue;

      // recycle when far behind player
      if (-rec.distance > playerZ + OBSTACLES.recycleBehind) {
        this.deactivate(i);
        continue;
      }

      // Floating movement and lateral barrel drift share the encounter pattern.
      if (rec.moveAmplitude > 0) {
        rec.x = LX[1] + Math.sin(this.time * 1.4 + rec.movePhase) * rec.moveAmplitude;
        rec.group.position.x = rec.x;
      }
      const floatPhase = this.time * 2.3 + rec.movePhase;
      rec.group.position.y = 0.02 + Math.sin(floatPhase) * 0.035;
      rec.group.rotation.x = Math.cos(floatPhase * 0.8) * 0.025;
      rec.group.rotation.z = Math.sin(floatPhase) * 0.035;
      rec.group.rotation.y = Math.sin(floatPhase * 0.52) * 0.08;
      const ripple = rec.group.getObjectByName(
        'obstacleWaterRipple',
      ) as THREE.Mesh | undefined;
      if (ripple) {
        const rippleMaterial = ripple.material as THREE.MeshBasicMaterial;
        ripple.scale.setScalar(1 + Math.sin(floatPhase * 0.7) * 0.06);
        rippleMaterial.opacity = 0.19 + (Math.sin(floatPhase * 0.7) + 1) * 0.08;
      }

      // broken walls have no collision
      if (rec.broken) continue;

      // AABB overlap test
      const obsZ = -rec.distance;
      this._oMin.set(rec.x - rec.halfX, 0, obsZ - rec.halfZ);
      this._oMax.set(rec.x + rec.halfX, 2.2, obsZ + rec.halfZ);

      const overlaps =
        this._pMin.x <= this._oMax.x &&
        this._pMax.x >= this._oMin.x &&
        this._pMin.z <= this._oMax.z &&
        this._pMax.z >= this._oMin.z;

      if (!overlaps) continue;

      if (this.invulnerable) continue;

      const outcome = resolveObstacleContact(
        rec.kind,
        this.shieldActive,
        this.breakableActive,
      );

      if (outcome === 'break') {
        this.breakObstacle(rec, obsZ);
        continue;
      }

      // Shield absorbs one collision and shatters the obstacle.
      if (outcome === 'shield') {
        rec.broken = true;
        rec.group.visible = false;
        this.callbacks.onHit({
          position: new THREE.Vector3(rec.x, 0.22, obsZ),
          shieldBlocked: true,
          fatal: false,
          kind: rec.kind,
        });
        continue;
      }

      // First unblocked collision ends the run. Game stops updating after this.
      this.runEnded = true;
      this.fatalObstacleId = rec.id;
      this.callbacks.onHit({
        position: new THREE.Vector3(rec.x, 0.22, obsZ),
        shieldBlocked: false,
        fatal: true,
        kind: rec.kind,
      });
      break;
    }

    this.reservations?.prune(playerDistance);
  }

  reset(): void {
    for (let i = this.records.length - 1; i >= 0; i -= 1) {
      this.deactivate(i);
    }
    this.records.length = 0;
    this.rng = new Rng(0x0b57ac1e);
    this.nextDistance = OBSTACLES.initialDistance;
    this.nextId = 1;
    this.time = 0;
    this.runEnded = false;
    this.fatalObstacleId = null;
    this.shieldActive = false;
    this.breakableActive = false;
    this.invulnerable = false;
    this.difficulty = getDifficultyProfile(0);
  }

  resumeAfterFatal(): void {
    if (!this.runEnded || this.fatalObstacleId === null) return;

    const fatalObstacle = this.records.find(
      (record) => record.id === this.fatalObstacleId,
    );
    if (fatalObstacle) {
      fatalObstacle.broken = true;
      fatalObstacle.group.visible = false;
    }

    this.fatalObstacleId = null;
    this.runEnded = false;
  }

  dispose(): void {
    for (let i = this.records.length - 1; i >= 0; i--) {
      const rec = this.records[i];
      this.scene.remove(rec.group);
      disposeGroup(rec.group);
    }
    this.records.length = 0;
  }

  /** Returns all currently active obstacle records (read-only, for tests). */
  getActiveRecords(): ReadonlyArray<Readonly<ObstacleRecord>> {
    return this.records.filter((record) => record.active);
  }

  // ─── private ─────────────────────────────────────────────────────────────

  private spawnPattern(baseDistance: number): void {
    const pattern = this.pickPattern();
    if (!validatePattern(pattern)) return;

    const lanes = [...new Set(pattern.placements.map((p) => p.laneIndex))];
    const centre = baseDistance + pattern.span / 2;
    if (
      this.reservations &&
      !this.reservations.isClear(
        centre,
        pattern.span / 2,
        lanes,
        OBSTACLE_RESERVATION_PAD,
      )
    ) {
      return;
    }

    for (const p of pattern.placements) {
      const distance = baseDistance + p.offsetZ;
      if (!this.spawnObstacle(p.kind, LX[p.laneIndex], distance, p.laneIndex)) {
        continue;
      }
      const half = OBSTACLE_HALF_EXTENTS[p.kind];
      this.reservations?.reserve({
        owner: 'obstacle',
        distance,
        halfLength: half.z,
        lanes: [p.laneIndex],
        pad: OBSTACLE_OWN_RESERVATION_PAD,
      });
    }
  }

  private pickPattern(): Pattern {
    const weights = this.difficulty.obstacle.patternWeights;
    const pick = pickWeighted(weights, this.rng.next());

    if (pick === 'narrow') {
      return {
        placements: [
          { laneIndex: 0, offsetZ: 0, kind: 'wall-low' },
          { laneIndex: 2, offsetZ: 0, kind: 'wall-low' },
        ],
        span: 2,
      };
    }

    if (pick === 'adjacent') {
      const lanes = this.rng.chance(0.5) ? [0, 1] : [1, 2];
      const kind = this.pickKind();
      return {
        placements: [
          { laneIndex: lanes[0], offsetZ: 0, kind },
          { laneIndex: lanes[1], offsetZ: 0, kind },
        ],
        span: 2,
      };
    }

    if (pick === 'staggered') {
      const first = this.rng.int(0, 2);
      const second = first === 1 ? (this.rng.chance(0.5) ? 0 : 2) : 1;
      const kind = this.pickKind();
      return {
        placements: [
          { laneIndex: first, offsetZ: 0, kind },
          { laneIndex: second, offsetZ: 8, kind },
        ],
        span: 10,
      };
    }

    if (pick === 'moving') {
      return {
        placements: [{ laneIndex: 1, offsetZ: 0, kind: 'wall-moving' }],
        span: 2,
      };
    }

    const lane = this.rng.int(0, 2);
    return {
      placements: [{ laneIndex: lane, offsetZ: 0, kind: this.pickKind() }],
      span: 2,
    };
  }

  private pickKind(): ObstacleKind {
    const r = this.rng.next();
    const config = this.difficulty.obstacle;

    if (r < config.breakableChance) return 'wall-breakable';

    if (r < config.breakableChance + config.vehicleBias) {
      const vehicles: readonly ObstacleKind[] = [
        'scooter',
        'motorcycle',
        'auto-rickshaw',
        'bicycle',
        'vegetable-cart',
      ];
      return this.rng.pick(vehicles);
    }

    const wallRoll = this.rng.next();
    if (wallRoll < 0.14) return 'barrier';
    if (wallRoll < 0.26) return 'crate';
    if (wallRoll < 0.34) return 'water-container';

    const walls: readonly ObstacleKind[] = [
      'wall-concrete',
      'wall-brick',
      'wall-wood',
      'wall-low',
    ];
    return this.rng.pick(walls);
  }

  private spawnObstacle(
    kind: ObstacleKind,
    x: number,
    distance: number,
    laneIndex: number,
  ): boolean {
    const active = this.records.filter((r) => r.active).length;
    if (active >= this.difficulty.obstacle.maxActive) return false;

    const half = OBSTACLE_HALF_EXTENTS[kind];
    const group = buildObstacleMesh(kind);
    group.position.set(x, 0, -distance);
    this.scene.add(group);

    this.records.push({
      id: this.nextId++,
      kind,
      group,
      x,
      distance,
      laneIndex,
      halfX: half.x,
      halfZ: half.z,
      movePhase: this.rng.range(0, Math.PI * 2),
      moveAmplitude: kind === 'wall-moving' ? ROAD.laneWidth * 0.38 : 0,
      broken: false,
      active: true,
    });
    return true;
  }

  private breakObstacle(rec: ObstacleRecord, obsZ: number): void {
    rec.broken = true;
    rec.group.visible = false;
    this.callbacks.onBreak?.({
      position: new THREE.Vector3(rec.x, 0.22, obsZ),
      kind: rec.kind,
    });
  }

  private deactivate(index: number): void {
    const rec = this.records[index];
    rec.active = false;
    this.scene.remove(rec.group);
    disposeGroup(rec.group);
    this.records.splice(index, 1);
  }
}

// ─── fairness validator (exported for tests) ──────────────────────────────────

/**
 * Returns true when the pattern leaves at least one lane free at every
 * Z-slice.  Placements within 1 m of each other are considered co-planar.
 */
export function validatePattern(pattern: Pattern): boolean {
  const offsets = [...new Set(pattern.placements.map((p) => p.offsetZ))];
  for (const z of offsets) {
    const nearby = pattern.placements.filter((p) => Math.abs(p.offsetZ - z) <= 1);
    const blocked = new Set(nearby.map((p) => p.laneIndex));
    const free = [0, 1, 2].some((l) => !blocked.has(l));
    if (!free) return false;
  }
  return true;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function disposeGroup(group: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) geometries.add(mesh.geometry);
    // materials are shared across instances — never dispose here
  });
  geometries.forEach((geometry) => geometry.dispose());
}
