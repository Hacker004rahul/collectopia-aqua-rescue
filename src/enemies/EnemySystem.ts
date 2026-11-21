/**
 * EnemySystem
 *
 * Responsibilities
 *  - Procedurally spawn enemy encounters ahead of the player.
 *  - Animate swimming crocodiles with approach, chase, attack and stun states.
 *  - Apply one damage transaction per telegraphed bite via EconomyManager.
 *  - Support punch hits: reduce HP, trigger knockback, award defeat reward once.
 *  - Recycle enemies behind the player.
 *  - Integrate Shield and Freeze power-ups without changing their economy rules.
 *  - Scale difficulty with the current level index (faster, denser, tougher).
 */
import * as THREE from 'three';
import { ENEMIES, LANES, PLAYER, PUNCH } from '../config/balance';
import {
  getDifficultyProfile,
  pickWeighted,
  type DifficultyProfile,
} from '../config/difficulty';
import { Rng } from '../core/Rng';
import type { SpawnReservations } from '../core/SpawnReservations';
import type { EconomyManager } from '../economy/EconomyManager';
import {
  animateEnemyMesh,
  buildEnemyMesh,
  ENEMY_HALF_EXTENTS,
  ENEMY_MAX_HP,
  type CrocodileState,
  type EnemyKind,
} from './EnemyMeshBuilder';

// ─── public types ─────────────────────────────────────────────────────────────

export interface EnemyHitEvent {
  position: THREE.Vector3;
  shieldBlocked: boolean;
}

export interface EnemyDefeatedEvent {
  position: THREE.Vector3;
  kind: EnemyKind;
  reward: number;
}

export interface EnemySystemCallbacks {
  onPlayerHit: (event: EnemyHitEvent) => void;
  onEnemyDefeated: (event: EnemyDefeatedEvent) => void;
}

// ─── internal ─────────────────────────────────────────────────────────────────

interface EnemyRecord {
  id: number;
  kind: EnemyKind;
  group: THREE.Group;
  /** Current world-space X (may change during lane changes). */
  x: number;
  /** Fixed world-space distance along the track. */
  distance: number;
  laneIndex: number;
  targetLaneIndex: number;
  halfX: number;
  halfZ: number;
  hp: number;
  maxHp: number;
  state: CrocodileState;
  stateTimer: number;
  frozenState: CrocodileState;
  attackCooldown: number;
  attackTimer: number;
  attackCount: number;
  attackHitApplied: boolean;
  /** Knockback: metres remaining to push the enemy back. */
  knockbackRemaining: number;
  rewardClaimed: boolean;
  active: boolean;
  /** Defeat flash/fade timer (s). */
  defeatTimer: number;
  /** Approach speed this enemy uses (m/s, scaled by level). */
  approachSpeed: number;
  /** Group scale restored after the entrance animation. */
  spawnScale: number;
}

// Reward table keyed by kind
const REWARDS: Record<EnemyKind, number> = {
  basic: ENEMIES.rewardBasic,
  fast:  ENEMIES.rewardFast,
  guard: ENEMIES.rewardGuard,
  heavy: ENEMIES.rewardHeavy,
  boss:  ENEMIES.rewardBoss,
};

// HP table
const HP: Record<EnemyKind, number> = {
  basic: ENEMIES.hpBasic,
  fast:  ENEMIES.hpFast,
  guard: ENEMIES.hpGuard,
  heavy: ENEMIES.hpHeavy,
  boss:  ENEMIES.hpBoss,
};

const DEFEAT_FLASH_DURATION = 0.4;

export function isEnemyInPunchRange(
  playerZ: number,
  playerX: number,
  enemyDistance: number,
  enemyX: number,
): boolean {
  const forwardDistance = playerZ + enemyDistance;
  return (
    forwardDistance >= -0.25 &&
    forwardDistance <= PUNCH.rangeZ &&
    Math.abs(playerX - enemyX) <= PUNCH.rangeX
  );
}

// ─── EnemySystem ──────────────────────────────────────────────────────────────

export class EnemySystem {
  /** Set true when Shield power-up is active (Phase 5). */
  shieldActive = false;
  /** Set true when Freeze Enemy power-up is active (Phase 5). */
  freezeActive = false;
  /** Set true while the player has temporary revive invulnerability. */
  invulnerable = false;

  private readonly records: EnemyRecord[] = [];
  private rng = new Rng(0xf4ce1a7b);
  private nextDistance: number;
  private nextId = 1;
  private time = 0;
  private frozenVisualActive = false;

  // reusable vectors — zero per-frame allocation
  private readonly _pMin = new THREE.Vector3();
  private readonly _pMax = new THREE.Vector3();
  private readonly _eMin = new THREE.Vector3();
  private readonly _eMax = new THREE.Vector3();
  private readonly _hitPos = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly economy: EconomyManager,
    private readonly callbacks: EnemySystemCallbacks,
    private readonly reservations?: SpawnReservations,
  ) {
    this.rng = new Rng(0xf4ce1a7b);
    this.nextDistance = ENEMIES.initialDistance;
  }

  // ─── public API ─────────────────────────────────────────────────────────────

  /**
   * Called by Game.update() every frame.
   * @param playerZ     current player world-Z (negative = further along)
   * @param playerX     current player world-X
   * @param playerDistance  distance counter (positive, metres)
   * @param dt          frame delta (seconds)
   * @param speed       current forward speed (m/s)
   * @param difficulty  current difficulty profile
   */
  update(
    playerZ: number,
    playerX: number,
    playerDistance: number,
    dt: number,
    speed: number,
    difficulty: DifficultyProfile = getDifficultyProfile(0),
  ): void {
    this.time += dt;

    const config = difficulty.enemy;

    // spawn patterns ahead of the player
    while (this.nextDistance < playerDistance + ENEMIES.spawnAhead) {
      const active = this.records.filter((r) => r.active).length;
      if (active < config.maxActive) {
        this.spawnEncounter(this.nextDistance, difficulty);
      }
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

    for (let i = this.records.length - 1; i >= 0; i--) {
      const rec = this.records[i];
      if (!rec.active) continue;

      // Recycle objects that have passed safely behind the boat.
      if (-rec.distance > playerZ + ENEMIES.recycleBehind) {
        this.deactivate(i);
        continue;
      }

      // Defeated crocodiles fade out before their pooled scene record is removed.
      if (rec.hp <= 0) {
        rec.defeatTimer -= dt;
        if (rec.defeatTimer <= 0) {
          this.deactivate(i);
        } else {
          const alpha = rec.defeatTimer / DEFEAT_FLASH_DURATION;
          rec.group.scale.setScalar(rec.spawnScale * alpha);
          rec.group.traverse((obj) => {
            const m = obj as THREE.Mesh;
            if (!m.isMesh) return;
            const mat = m.material as THREE.MeshStandardMaterial;
            if (!mat.transparent) {
              mat.transparent = true;
              mat.depthWrite = false;
            }
            mat.opacity = alpha;
          });
        }
        continue;
      }

      if (this.freezeActive || rec.state === 'frozen') {
        if (rec.state !== 'frozen') {
          rec.frozenState = rec.state;
          rec.state = 'frozen';
        }
        this.updateEnemyTransform(rec, dt);
        animateEnemyMesh(rec.group, this.time, false, true, 'frozen');
        continue;
      }

      const gap = rec.distance - playerDistance;
      let attacking = false;
      let closingScale = 0.65;

      if (rec.state === 'spawning') {
        rec.stateTimer = Math.max(0, rec.stateTimer - dt);
        const progress = 1 - rec.stateTimer / 0.48;
        rec.group.scale.setScalar(
          rec.spawnScale * THREE.MathUtils.lerp(0.24, 1, progress),
        );
        if (rec.stateTimer === 0) rec.state = 'swimming';
      } else if (rec.state === 'stunned') {
        rec.stateTimer = Math.max(0, rec.stateTimer - dt);
        if (rec.knockbackRemaining > 0) {
          const step = Math.min(
            rec.knockbackRemaining,
            (ENEMIES.knockbackDistance / ENEMIES.knockbackDuration) * dt,
          );
          rec.distance += step;
          rec.knockbackRemaining = Math.max(0, rec.knockbackRemaining - step);
        }
        if (rec.stateTimer === 0) rec.state = 'approaching';
      } else if (rec.state === 'attacking') {
        rec.attackTimer = Math.max(0, rec.attackTimer - dt);
        if (rec.attackTimer === 0) {
          rec.state = 'chasing';
          rec.attackCooldown = ENEMIES.hitCooldown;
        } else {
          attacking = true;
          closingScale =
            rec.attackTimer <= ENEMIES.attackDamageWindow ? 1.8 : 0.9;
        }
      } else {
        rec.attackCooldown = Math.max(0, rec.attackCooldown - dt);
        if (gap <= ENEMIES.attackTriggerDistance && rec.attackCooldown === 0) {
          rec.state = 'attacking';
          rec.attackTimer = ENEMIES.attackDuration;
          rec.attackCount += 1;
          rec.attackHitApplied = false;
          attacking = true;
          closingScale = 0.9;
        } else if (gap <= ENEMIES.chaseDistance) {
          rec.state = 'chasing';
          rec.targetLaneIndex = this.playerLane(playerX);
          closingScale = 1;
        } else if (gap <= ENEMIES.approachDistance) {
          rec.state = 'approaching';
          rec.targetLaneIndex = this.playerLane(playerX);
          closingScale = 0.82;
        } else {
          rec.state = 'swimming';
          closingScale = 0.65;
        }
      }

      if (
        rec.state !== 'stunned' &&
        rec.state !== 'spawning'
      ) {
        const lunge = attacking && rec.attackTimer <= ENEMIES.attackDamageWindow
          ? ENEMIES.attackLungeSpeed
          : 0;
        rec.distance -= (rec.approachSpeed * closingScale + lunge) * dt;
      }

      this.updateEnemyTransform(rec, dt);
      animateEnemyMesh(rec.group, this.time, attacking, false, rec.state);

      // AABB overlap test
      const ez = -rec.distance;
      this._eMin.set(rec.x - rec.halfX, 0, ez - rec.halfZ);
      this._eMax.set(rec.x + rec.halfX, 2.2, ez + rec.halfZ);

      const overlaps =
        this._pMin.x <= this._eMax.x &&
        this._pMax.x >= this._eMin.x &&
        this._pMin.z <= this._eMax.z &&
        this._pMax.z >= this._eMin.z;

      if (
        !overlaps ||
        rec.state !== 'attacking' ||
        rec.attackTimer > ENEMIES.attackDamageWindow ||
        rec.attackHitApplied
      ) continue;

      rec.attackHitApplied = true;
      if (this.invulnerable) {
        this.stunEnemy(rec, ENEMIES.knockbackDistance * 2);
        continue;
      }

      this._hitPos.set(rec.x, 0.45, ez);

      if (this.shieldActive) {
        this.stunEnemy(rec, ENEMIES.knockbackDistance * 2);
        this.callbacks.onPlayerHit({
          position: this._hitPos.clone(),
          shieldBlocked: true,
        });
        continue;
      }

      const sourceId = `enemy:${rec.id}:${rec.attackCount}`;
      const result = this.economy.apply({
        type: 'enemy-damage',
        sourceId,
        amount: ENEMIES.damagePenalty,
        label: 'Enemy hit',
      });

      if (result.applied) {
        this.callbacks.onPlayerHit({
          position: this._hitPos.clone(),
          shieldBlocked: false,
        });
      }
    }

    this.reservations?.prune(playerDistance);
  }

  setFreeze(active: boolean): void {
    if (this.freezeActive === active) return;
    this.freezeActive = active;
    for (const rec of this.records) {
      if (!rec.active || rec.hp <= 0) continue;
      if (active) {
        rec.frozenState = rec.state;
        rec.state = 'frozen';
      } else if (rec.state === 'frozen') {
        rec.state =
          rec.frozenState === 'attacking'
            ? 'approaching'
            : rec.frozenState;
        rec.attackCooldown = Math.max(rec.attackCooldown, 0.6);
      }
    }
    this.setFrozenVisual(active);
  }

  /**
   * Register a punch hit attempt.  Returns whether any enemy was struck.
   * @param playerZ  current player world-Z
   * @param playerX  current player world-X
   * @param superPunch  whether Super Punch power-up is active (Phase 5)
   */
  punch(playerZ: number, playerX: number, superPunch = false): boolean {
    let hit = false;

    for (const rec of this.records) {
      if (!rec.active || rec.hp <= 0) continue;

      const ez = -rec.distance;
      if (!isEnemyInPunchRange(playerZ, playerX, rec.distance, rec.x)) continue;

      const damage = superPunch ? 2 : 1;
      rec.hp = Math.max(0, rec.hp - damage);
      rec.knockbackRemaining = ENEMIES.knockbackDistance;
      rec.state = 'stunned';
      rec.stateTimer = superPunch ? ENEMIES.stunDuration * 1.5 : ENEMIES.stunDuration;
      rec.attackCooldown = Math.max(rec.attackCooldown, ENEMIES.hitCooldown);

      // boss health bar update
      if (rec.kind === 'boss') {
        this.updateBossHpBar(rec);
      }

      // flash the enemy on hit
      this.flashEnemy(rec);

      if (rec.hp <= 0 && !rec.rewardClaimed) {
        rec.rewardClaimed = true;
        rec.defeatTimer = DEFEAT_FLASH_DURATION;
        rec.state = 'despawning';

        const reward = REWARDS[rec.kind];
        const sourceId = `enemy-reward:${rec.id}`;
        this.economy.apply({
          type: 'enemy-reward',
          sourceId,
          amount: reward,
          label: `Defeated ${rec.kind} enemy`,
        });

        this.callbacks.onEnemyDefeated({
          position: new THREE.Vector3(rec.x, 1.5, ez),
          kind: rec.kind,
          reward,
        });
      }

      hit = true;
      break; // one target per punch
    }

    return hit;
  }

  reset(): void {
    for (let i = this.records.length - 1; i >= 0; i -= 1) {
      this.deactivate(i);
    }
    this.records.length = 0;
    this.rng = new Rng(0xf4ce1a7b);
    this.nextDistance = ENEMIES.initialDistance;
    this.nextId = 1;
    this.time = 0;
    this.frozenVisualActive = false;
    this.shieldActive = false;
    this.freezeActive = false;
    this.invulnerable = false;
  }

  dispose(): void {
    for (let i = this.records.length - 1; i >= 0; i--) {
      const rec = this.records[i];
      this.scene.remove(rec.group);
      disposeGroup(rec.group);
    }
    this.records.length = 0;
  }

  /** Returns all currently active enemy records (read-only, for tests). */
  getActiveRecords(): ReadonlyArray<Readonly<EnemyRecord>> {
    return this.records.filter((r) => r.active);
  }

  // ─── private ─────────────────────────────────────────────────────────────

  private spawnEncounter(
    baseDistance: number,
    difficulty: DifficultyProfile,
  ): void {
    const kind = this.pickKind(difficulty);
    const laneIndex = this.rng.int(0, 2);
    const half = ENEMY_HALF_EXTENTS[kind];

    if (
      this.reservations &&
      !this.reservations.isClear(
        baseDistance,
        half.z,
        [laneIndex],
        ENEMIES.gateExclusionZone,
      )
    ) {
      return;
    }

    // compute HP and speed with level scaling
    const hp = HP[kind];
    const approachSpeed =
      ENEMIES.approachSpeed * difficulty.enemy.approachSpeedScale;

    const group = buildEnemyMesh(kind);
    const x = LANES[laneIndex];
    group.position.set(x, 0, -baseDistance);
    const spawnScale = group.scale.x;
    group.scale.multiplyScalar(0.24);
    this.scene.add(group);
    if (this.frozenVisualActive) this.applyFrozenMaterial(group, true);

    // decide target lane for lane-changers (fast + guard may change lane)
    const targetLaneIndex =
      (kind === 'fast' || kind === 'guard') &&
      this.rng.chance(difficulty.enemy.laneChangeChance)
        ? this.rng.int(0, 2)
        : laneIndex;

    this.records.push({
      id: this.nextId++,
      kind,
      group,
      x,
      distance: baseDistance,
      laneIndex,
      targetLaneIndex,
      halfX: half.x,
      halfZ: half.z,
      hp,
      maxHp: ENEMY_MAX_HP[kind],
      state: 'spawning',
      stateTimer: 0.48,
      frozenState: 'swimming',
      attackCooldown: this.rng.range(1.3, 2.1),
      attackTimer: 0,
      attackCount: 0,
      attackHitApplied: false,
      knockbackRemaining: 0,
      rewardClaimed: false,
      active: true,
      defeatTimer: 0,
      approachSpeed,
      spawnScale,
    });

    this.reservations?.reserve({
      owner: 'enemy',
      distance: baseDistance,
      halfLength: half.z,
      lanes: [laneIndex],
      pad: 2,
    });
  }

  private pickKind(difficulty: DifficultyProfile): EnemyKind {
    return pickWeighted(difficulty.enemy.kindWeights, this.rng.next());
  }

  private playerLane(playerX: number): number {
    let closest = 0;
    for (let lane = 1; lane < LANES.length; lane += 1) {
      if (Math.abs(LANES[lane] - playerX) < Math.abs(LANES[closest] - playerX)) {
        closest = lane;
      }
    }
    return closest;
  }

  private updateEnemyTransform(rec: EnemyRecord, dt: number): void {
    if (
      !this.freezeActive &&
      rec.state !== 'stunned' &&
      rec.state !== 'spawning'
    ) {
      const targetX = LANES[rec.targetLaneIndex];
      rec.x = THREE.MathUtils.damp(
        rec.x,
        targetX,
        rec.state === 'chasing' ? ENEMIES.laneChangeSpeed : ENEMIES.laneChangeSpeed * 0.68,
        dt,
      );
      if (Math.abs(rec.x - targetX) < 0.035) {
        rec.x = targetX;
        rec.laneIndex = rec.targetLaneIndex;
      }
    }

    rec.group.position.set(
      rec.x,
      0.025 + Math.sin(this.time * 2.2 + rec.id) * 0.035,
      -rec.distance,
    );
    const targetX = LANES[rec.targetLaneIndex];
    rec.group.rotation.y = THREE.MathUtils.damp(
      rec.group.rotation.y,
      THREE.MathUtils.clamp((targetX - rec.x) * 0.1, -0.22, 0.22),
      8,
      dt,
    );
  }

  private stunEnemy(rec: EnemyRecord, knockback: number): void {
    rec.state = 'stunned';
    rec.stateTimer = ENEMIES.stunDuration;
    rec.knockbackRemaining = Math.max(rec.knockbackRemaining, knockback);
    rec.attackCooldown = Math.max(rec.attackCooldown, ENEMIES.hitCooldown);
  }

  private setFrozenVisual(active: boolean): void {
    this.frozenVisualActive = active;
    for (const rec of this.records) {
      if (!rec.active) continue;
      this.applyFrozenMaterial(rec.group, active);
    }
  }

  private applyFrozenMaterial(group: THREE.Group, active: boolean): void {
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (!material?.emissive) return;

      if (active) {
        if (material.userData.freezeEmissive === undefined) {
          material.userData.freezeEmissive = material.emissive.getHex();
          material.userData.freezeIntensity = material.emissiveIntensity;
        }
        material.emissive.setHex(0x5bc0ff);
        material.emissiveIntensity = 0.85;
      } else if (material.userData.freezeEmissive !== undefined) {
        material.emissive.setHex(material.userData.freezeEmissive as number);
        material.emissiveIntensity = material.userData.freezeIntensity as number;
        delete material.userData.freezeEmissive;
        delete material.userData.freezeIntensity;
      }
    });
  }

  private deactivate(index: number): void {
    const rec = this.records[index];
    rec.active = false;
    this.scene.remove(rec.group);
    disposeGroup(rec.group);
    this.records.splice(index, 1);
  }

  private flashEnemy(rec: EnemyRecord): void {
    rec.group.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (!mat.emissive) return;
      if (mat.userData.flashEmissive === undefined) {
        mat.userData.flashEmissive = mat.emissive.getHex();
        mat.userData.flashIntensity = mat.emissiveIntensity;
      }
      mat.emissive.set(0xffffff);
      mat.emissiveIntensity = 0.9;
    });
    setTimeout(() => {
      if (!rec.active) return;
      rec.group.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (!mat.emissive) return;
        if (mat.userData.flashEmissive === undefined) return;
        mat.emissive.setHex(mat.userData.flashEmissive as number);
        mat.emissiveIntensity = mat.userData.flashIntensity as number;
        delete mat.userData.flashEmissive;
        delete mat.userData.flashIntensity;
      });
      if (this.freezeActive) this.applyFrozenMaterial(rec.group, true);
    }, 100);
  }

  private updateBossHpBar(rec: EnemyRecord): void {
    const fill = rec.group.getObjectByName('bossHpFill');
    if (!fill) return;
    const ratio = Math.max(0, rec.hp / rec.maxHp);
    fill.scale.x = ratio;
    fill.position.x = -(1 - ratio) * 0.38; // anchor left
    // colour shift: green → red as hp drops
    const mesh = fill as THREE.Mesh;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const r = Math.round(0x22 + (0xcc - 0x22) * (1 - ratio));
    const gv = Math.round(0xcc - (0xcc - 0x22) * (1 - ratio));
    mat.color.setRGB(r / 255, gv / 255, 0x22 / 255);
    mat.emissive.setRGB(r / 255, gv / 255, 0x22 / 255);
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function disposeGroup(group: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) geometries.add(mesh.geometry);
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    if (Array.isArray(mat)) mat.forEach((m) => materials.add(m));
    else materials.add(mat);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}
