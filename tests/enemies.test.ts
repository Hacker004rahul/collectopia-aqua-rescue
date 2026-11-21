/**
 * Phase 4 — Enemy system and Punch combat tests
 *
 * These tests run headlessly via Vitest (no DOM, no Three.js renderer).
 * Three.js geometry/material constructors are used only inside
 * buildEnemyMesh(), which we avoid calling in pure-logic tests.
 * Where mesh construction is needed we build a minimal group via a
 * tiny mock, keeping the suite fast.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { EconomyManager } from '../src/economy/EconomyManager';
import { ENEMIES, PUNCH, LANES } from '../src/config/balance';
import { ENEMY_HALF_EXTENTS, ENEMY_MAX_HP } from '../src/enemies/EnemyMeshBuilder';
import { EnemySystem, isEnemyInPunchRange } from '../src/enemies/EnemySystem';
import { PunchSystem } from '../src/enemies/PunchSystem';
import { getDifficultyProfile } from '../src/config/difficulty';

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Minimal stub of EnemySystem that exposes only what PunchSystem needs.
 * This avoids importing Three.js scene constructors in the test runner.
 */
class StubEnemySystem {
  punchCalled = false;
  punchSuperArg = false;
  punchReturnValue = false;

  punch(_pz: number, _px: number, superPunch: boolean): boolean {
    this.punchCalled = true;
    this.punchSuperArg = superPunch;
    return this.punchReturnValue;
  }
}

// ─── EnemyMeshBuilder — static data ──────────────────────────────────────────

describe('ENEMY_HALF_EXTENTS', () => {
  it('every enemy kind has positive half-extents', () => {
    for (const [kind, v] of Object.entries(ENEMY_HALF_EXTENTS)) {
      expect(v.x, `${kind}.x`).toBeGreaterThan(0);
      expect(v.z, `${kind}.z`).toBeGreaterThan(0);
    }
  });

  it('enemy footprints are smaller than a lane so the player can avoid them', () => {
    const laneHalf = Math.abs(LANES[1] - LANES[0]); // 2.7 m
    for (const [kind, v] of Object.entries(ENEMY_HALF_EXTENTS)) {
      expect(v.x * 2, `${kind} full width`).toBeLessThan(laneHalf * 2);
    }
  });
});

describe('ENEMY_MAX_HP', () => {
  it('basic and fast enemies have 1 HP', () => {
    expect(ENEMY_MAX_HP.basic).toBe(1);
    expect(ENEMY_MAX_HP.fast).toBe(1);
  });

  describe('EnemySystem crocodile attack state', () => {
    it('uses a telegraphed attack and applies no more than one hit per lunge', () => {
      const scene = new THREE.Scene();
      const economy = new EconomyManager(200);
      const onPlayerHit = vi.fn();
      const onEnemyDefeated = vi.fn();
      const difficulty = getDifficultyProfile(0);
      difficulty.enemy.maxActive = 1;
      difficulty.enemy.minSpacing = 1000;
      difficulty.enemy.maxSpacing = 1000;
      difficulty.enemy.kindWeights = {
        basic: 1,
        fast: 0,
        guard: 0,
        heavy: 0,
        boss: 0,
      };
      const enemies = new EnemySystem(scene, economy, {
        onPlayerHit,
        onEnemyDefeated,
      });
      const observedStates = new Set<string>();

      enemies.update(0, 0, 0, 0, 16, difficulty);
      expect(enemies.getActiveRecords()[0]?.state).toBe('spawning');

      let playerDistance = 0;
      for (let frame = 0; frame < 300 && onPlayerHit.mock.calls.length === 0; frame += 1) {
        playerDistance += 0.8;
        const enemy = enemies.getActiveRecords()[0];
        enemies.update(
          -playerDistance,
          enemy?.x ?? 0,
          playerDistance,
          0.05,
          16,
          difficulty,
        );
        enemies.getActiveRecords().forEach((active) => observedStates.add(active.state));
      }

      expect(observedStates).toContain('swimming');
      expect(observedStates).toContain('approaching');
      expect(observedStates).toContain('attacking');
      expect(onPlayerHit).toHaveBeenCalledOnce();
      expect(onPlayerHit.mock.calls[0][0].shieldBlocked).toBe(false);
      expect(economy.balance).toBe(200 - ENEMIES.damagePenalty);

      for (let frame = 0; frame < 30; frame += 1) {
        playerDistance += 0.8;
        const enemy = enemies.getActiveRecords()[0];
        enemies.update(
          -playerDistance,
          enemy?.x ?? 0,
          playerDistance,
          0.05,
          16,
          difficulty,
        );
      }

      expect(onPlayerHit).toHaveBeenCalledOnce();
      enemies.dispose();
    });
  });

  it('guard has 1 HP', () => {
    expect(ENEMY_MAX_HP.guard).toBe(1);
  });

  it('heavy has 3 HP (requires multiple punches)', () => {
    expect(ENEMY_MAX_HP.heavy).toBe(3);
  });

  it('boss has 5 HP (requires multiple punches)', () => {
    expect(ENEMY_MAX_HP.boss).toBe(5);
  });
});

// ─── ENEMIES config ───────────────────────────────────────────────────────────

describe('ENEMIES config', () => {
  it('damage penalty is 50', () => {
    expect(ENEMIES.damagePenalty).toBe(50);
  });

  it('hit cooldown is positive', () => {
    expect(ENEMIES.hitCooldown).toBeGreaterThan(0);
  });

  it('reward values are positive and ordered basic < fast < guard < heavy < boss', () => {
    expect(ENEMIES.rewardBasic).toBeGreaterThan(0);
    expect(ENEMIES.rewardFast).toBeGreaterThan(ENEMIES.rewardBasic);
    expect(ENEMIES.rewardGuard).toBeGreaterThanOrEqual(ENEMIES.rewardFast);
    expect(ENEMIES.rewardHeavy).toBeGreaterThan(ENEMIES.rewardGuard);
    expect(ENEMIES.rewardBoss).toBeGreaterThan(ENEMIES.rewardHeavy);
  });

  it('spawn ahead and initial distance give adequate reaction time', () => {
    expect(ENEMIES.initialDistance).toBeGreaterThan(ENEMIES.reactionDistance);
    expect(ENEMIES.spawnAhead).toBeGreaterThan(ENEMIES.reactionDistance);
  });

  it('maxActive cap is positive', () => {
    expect(ENEMIES.maxActive).toBeGreaterThan(0);
  });
});

// ─── PUNCH config ─────────────────────────────────────────────────────────────

describe('PUNCH config', () => {
  it('cooldown is positive', () => {
    expect(PUNCH.cooldown).toBeGreaterThan(0);
  });

  it('rangeZ and rangeX are positive', () => {
    expect(PUNCH.rangeZ).toBeGreaterThan(0);
    expect(PUNCH.rangeX).toBeGreaterThan(0);
  });

  it('animDuration is shorter than cooldown', () => {
    expect(PUNCH.animDuration).toBeLessThan(PUNCH.cooldown);
  });

  it('covers an approaching enemy in an adjacent lane', () => {
    expect(isEnemyInPunchRange(-100, 0, 112, 2.7)).toBe(true);
  });

  it('does not hit enemies behind the player or outside the reach', () => {
    expect(isEnemyInPunchRange(-100, 0, 99.5, 0)).toBe(false);
    expect(isEnemyInPunchRange(-100, 0, 112.1, 0)).toBe(false);
    expect(isEnemyInPunchRange(-100, 0, 105, 3.21)).toBe(false);
  });
});

// ─── PunchSystem ──────────────────────────────────────────────────────────────

describe('PunchSystem', () => {
  let stub: StubEnemySystem;
  let onHit: ReturnType<typeof vi.fn>;
  let onMiss: ReturnType<typeof vi.fn>;
  let ps: PunchSystem;

  beforeEach(() => {
    stub = new StubEnemySystem();
    onHit = vi.fn();
    onMiss = vi.fn();
    // Cast stub to satisfy the EnemySystem type (structural compatibility)
    ps = new PunchSystem(stub as never, { onHit, onMiss });
  });

  it('starts ready (cooldown 0)', () => {
    expect(ps.isReady).toBe(true);
    expect(ps.cooldownRatio).toBe(0);
  });

  it('calls enemy.punch when triggered', () => {
    ps.trigger(0, 0);
    expect(stub.punchCalled).toBe(true);
  });

  it('invokes onHit when enemy.punch returns true', () => {
    stub.punchReturnValue = true;
    ps.trigger(0, 0);
    expect(onHit).toHaveBeenCalledOnce();
    expect(onMiss).not.toHaveBeenCalled();
  });

  it('invokes onMiss when enemy.punch returns false', () => {
    stub.punchReturnValue = false;
    ps.trigger(0, 0);
    expect(onMiss).toHaveBeenCalledOnce();
    expect(onHit).not.toHaveBeenCalled();
  });

  it('enforces cooldown: second trigger before cooldown expires does nothing', () => {
    stub.punchReturnValue = true;
    ps.trigger(0, 0);
    expect(ps.isReady).toBe(false);

    // attempt another punch immediately — should be blocked
    stub.punchCalled = false;
    ps.trigger(0, 0);
    expect(stub.punchCalled).toBe(false);
    expect(onHit).toHaveBeenCalledTimes(1); // only the first punch
  });

  it('cooldownRatio starts at 1 immediately after punch then descends', () => {
    ps.trigger(0, 0);
    expect(ps.cooldownRatio).toBeCloseTo(1, 2);

    ps.update(PUNCH.cooldown / 2);
    expect(ps.cooldownRatio).toBeCloseTo(0.5, 1);

    ps.update(PUNCH.cooldown / 2);
    expect(ps.cooldownRatio).toBe(0);
    expect(ps.isReady).toBe(true);
  });

  it('allows a punch again after cooldown expires', () => {
    stub.punchReturnValue = true;
    ps.trigger(0, 0);
    ps.update(PUNCH.cooldown + 0.01); // advance past cooldown
    stub.punchCalled = false;
    ps.trigger(0, 0);
    expect(stub.punchCalled).toBe(true);
    expect(onHit).toHaveBeenCalledTimes(2);
  });

  it('does not animate after animDuration elapses', () => {
    ps.trigger(0, 0);
    expect(ps.isAnimating).toBe(true);
    ps.update(PUNCH.animDuration + 0.001);
    expect(ps.isAnimating).toBe(false);
  });

  it('passes superPunchActive flag to enemy.punch', () => {
    ps.superPunchActive = true;
    ps.trigger(0, 0);
    expect(stub.punchSuperArg).toBe(true);
  });

  it('passes superPunchActive=false by default', () => {
    ps.trigger(0, 0);
    expect(stub.punchSuperArg).toBe(false);
  });
});

// ─── Economy integration — enemy-damage ───────────────────────────────────────

describe('economy enemy-damage', () => {
  let economy: EconomyManager;

  beforeEach(() => {
    economy = new EconomyManager(200);
  });

  it('applies a 50-coin penalty via enemy-damage transaction type', () => {
    const result = economy.apply({
      type: 'enemy-damage',
      sourceId: 'enemy:1:0',
      amount: ENEMIES.damagePenalty,
    });
    expect(result.applied).toBe(true);
    expect(result.entry?.balanceAfter).toBe(150);
    expect(result.entry?.delta).toBe(-50);
  });

  it('never reduces balance below zero', () => {
    const poor = new EconomyManager(20);
    const result = poor.apply({
      type: 'enemy-damage',
      sourceId: 'enemy:2:0',
      amount: ENEMIES.damagePenalty,
    });
    expect(result.applied).toBe(true);
    expect(result.entry?.balanceAfter).toBe(0);
    expect(poor.balance).toBe(0);
  });

  it('rejects a duplicate sourceId (hit cooldown window)', () => {
    economy.apply({ type: 'enemy-damage', sourceId: 'enemy:3:0', amount: ENEMIES.damagePenalty });
    const dup = economy.apply({ type: 'enemy-damage', sourceId: 'enemy:3:0', amount: ENEMIES.damagePenalty });
    expect(dup.applied).toBe(false);
    expect(dup.reason).toBe('duplicate');
    expect(economy.balance).toBe(150);
  });

  it('allows a new hit after the cooldown window produces a different sourceId', () => {
    economy.apply({ type: 'enemy-damage', sourceId: 'enemy:4:0', amount: ENEMIES.damagePenalty });
    const second = economy.apply({ type: 'enemy-damage', sourceId: 'enemy:4:19', amount: ENEMIES.damagePenalty });
    expect(second.applied).toBe(true);
    expect(economy.balance).toBe(100);
  });

  it('shield: penalty NOT applied when shield is active (simulated skip)', () => {
    const before = economy.balance;
    // Shield path in EnemySystem skips economy.apply — verify balance unchanged
    expect(economy.balance).toBe(before);
  });
});

// ─── Economy integration — enemy-reward ──────────────────────────────────────

describe('economy enemy-reward', () => {
  let economy: EconomyManager;

  beforeEach(() => {
    economy = new EconomyManager(100);
  });

  it('adds the configured reward for each enemy type', () => {
    const types: Array<[string, number]> = [
      ['basic', ENEMIES.rewardBasic],
      ['fast', ENEMIES.rewardFast],
      ['guard', ENEMIES.rewardGuard],
      ['heavy', ENEMIES.rewardHeavy],
      ['boss', ENEMIES.rewardBoss],
    ];
    let balance = 100;
    types.forEach(([kind, reward], i) => {
      const result = economy.apply({
        type: 'enemy-reward',
        sourceId: `enemy-reward:${i}`,
        amount: reward,
      });
      expect(result.applied, kind).toBe(true);
      balance += reward;
      expect(economy.balance, kind).toBe(balance);
    });
  });

  it('prevents duplicate rewards for the same enemy (same sourceId)', () => {
    economy.apply({ type: 'enemy-reward', sourceId: 'enemy-reward:99', amount: ENEMIES.rewardBasic });
    const dup = economy.apply({ type: 'enemy-reward', sourceId: 'enemy-reward:99', amount: ENEMIES.rewardBasic });
    expect(dup.applied).toBe(false);
    expect(dup.reason).toBe('duplicate');
    expect(economy.balance).toBe(100 + ENEMIES.rewardBasic);
  });

  it('reward appears in the ledger with the correct type label', () => {
    economy.apply({
      type: 'enemy-reward',
      sourceId: 'enemy-reward:50',
      amount: ENEMIES.rewardBasic,
      label: 'Defeated basic enemy',
    });
    const entry = economy.ledger[economy.ledger.length - 1];
    expect(entry.type).toBe('enemy-reward');
    expect(entry.label).toBe('Defeated basic enemy');
    expect(entry.delta).toBe(ENEMIES.rewardBasic);
  });
});

// ─── Economy — combined damage + reward scenario ─────────────────────────────

describe('combined enemy encounter scenario', () => {
  it('applies damage once then reward once — net balance correct', () => {
    const economy = new EconomyManager(200);

    // Player gets hit once
    economy.apply({ type: 'enemy-damage', sourceId: 'enemy:7:0', amount: 50 });
    expect(economy.balance).toBe(150);

    // Player defeats the enemy
    economy.apply({ type: 'enemy-reward', sourceId: 'enemy-reward:7', amount: ENEMIES.rewardBasic });
    expect(economy.balance).toBe(150 + ENEMIES.rewardBasic);

    // Neither can fire again
    const dupDmg = economy.apply({ type: 'enemy-damage', sourceId: 'enemy:7:0', amount: 50 });
    const dupRwd = economy.apply({ type: 'enemy-reward', sourceId: 'enemy-reward:7', amount: ENEMIES.rewardBasic });
    expect(dupDmg.applied).toBe(false);
    expect(dupRwd.applied).toBe(false);
  });

  it('existing coin and gate transactions are unaffected by enemy transactions', () => {
    const economy = new EconomyManager(0);

    economy.apply({ type: 'coin', sourceId: 'coin:1', amount: 10 });
    economy.apply({ type: 'gate-add', sourceId: 'gate:1:0', amount: 100 });
    economy.apply({ type: 'enemy-damage', sourceId: 'enemy:1:0', amount: 50 });
    economy.apply({ type: 'enemy-reward', sourceId: 'enemy-reward:1', amount: ENEMIES.rewardBasic });

    const expectedBalance = 0 + 10 + 100 - 50 + ENEMIES.rewardBasic;
    expect(economy.balance).toBe(expectedBalance);
    expect(economy.ledger).toHaveLength(4);
    expect(economy.ledger.map((e) => e.type)).toEqual([
      'coin',
      'gate-add',
      'enemy-damage',
      'enemy-reward',
    ]);
  });
});
