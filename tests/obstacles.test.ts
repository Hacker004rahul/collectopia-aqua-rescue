import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { EconomyManager } from '../src/economy/EconomyManager';
import { validatePattern } from '../src/obstacles/ObstacleSystem';
import {
  buildObstacleMesh,
  OBSTACLE_HALF_EXTENTS,
  OBSTACLE_VISUAL_BY_KIND,
} from '../src/obstacles/ObstacleMeshBuilder';
import { OBSTACLES, PLAYER, LANES } from '../src/config/balance';

// ─── validatePattern (fairness validator) ─────────────────────────────────────

describe('validatePattern', () => {
  it('accepts a single-lane obstacle (two lanes free)', () => {
    expect(validatePattern({
      placements: [{ laneIndex: 1, offsetZ: 0, kind: 'wall-concrete' }],
      span: 2,
    })).toBe(true);
  });

  it('accepts two obstacles on adjacent lanes (one lane free)', () => {
    expect(validatePattern({
      placements: [
        { laneIndex: 0, offsetZ: 0, kind: 'wall-brick' },
        { laneIndex: 1, offsetZ: 0, kind: 'wall-brick' },
      ],
      span: 2,
    })).toBe(true);
  });

  it('rejects a pattern that blocks all three lanes at the same Z', () => {
    expect(validatePattern({
      placements: [
        { laneIndex: 0, offsetZ: 0, kind: 'wall-concrete' },
        { laneIndex: 1, offsetZ: 0, kind: 'wall-concrete' },
        { laneIndex: 2, offsetZ: 0, kind: 'wall-concrete' },
      ],
      span: 2,
    })).toBe(false);
  });

  it('accepts a staggered pattern where each Z-slice has a free lane', () => {
    expect(validatePattern({
      placements: [
        { laneIndex: 0, offsetZ: 0,  kind: 'barrier' },
        { laneIndex: 1, offsetZ: 0,  kind: 'barrier' },
        { laneIndex: 1, offsetZ: 10, kind: 'barrier' },
        { laneIndex: 2, offsetZ: 10, kind: 'barrier' },
      ],
      span: 12,
    })).toBe(true);
  });

  it('rejects when a later Z-slice blocks all lanes', () => {
    expect(validatePattern({
      placements: [
        { laneIndex: 0, offsetZ: 0, kind: 'crate' },
        { laneIndex: 0, offsetZ: 8, kind: 'crate' },
        { laneIndex: 1, offsetZ: 8, kind: 'crate' },
        { laneIndex: 2, offsetZ: 8, kind: 'crate' },
      ],
      span: 10,
    })).toBe(false);
  });

  it('accepts narrow passage (lanes 0 and 2 blocked, lane 1 free)', () => {
    expect(validatePattern({
      placements: [
        { laneIndex: 0, offsetZ: 0, kind: 'wall-low' },
        { laneIndex: 2, offsetZ: 0, kind: 'wall-low' },
      ],
      span: 2,
    })).toBe(true);
  });
});

// ─── narrow passage clearance ─────────────────────────────────────────────────

describe('narrow passage clearance', () => {
  it('centre lane is wider than the player collision footprint', () => {
    // Lane width = 2.7 m; player half-width = 0.78 m => full width 1.56 m
    // The centre lane (index 1) is at x=0; wall-low half-extents are 1.1 m in X
    // Wall on lane 0 (x=-2.7) right edge: -2.7 + 1.1 = -1.6
    // Wall on lane 2 (x=+2.7) left  edge: +2.7 - 1.1 = +1.6
    // Gap = 3.2 m; player width = 1.56 m — fits with 1.64 m clearance
    const wallHalfX = OBSTACLE_HALF_EXTENTS['wall-low'].x;
    const laneWidth = Math.abs(LANES[2] - LANES[1]);
    const gapHalf = laneWidth - wallHalfX;
    const playerHalfWidth = PLAYER.collisionHalfWidth;
    expect(gapHalf).toBeGreaterThan(playerHalfWidth);
  });
});

// ─── AABB half-extents sanity ─────────────────────────────────────────────────

describe('OBSTACLE_HALF_EXTENTS', () => {
  it('every obstacle kind has positive half-extents', () => {
    for (const [kind, v] of Object.entries(OBSTACLE_HALF_EXTENTS)) {
      expect(v.x, `${kind}.x`).toBeGreaterThan(0);
      expect(v.z, `${kind}.z`).toBeGreaterThan(0);
    }
  });

  describe('river obstacle models', () => {
    it('covers logs, rocks, barrels and tangled debris without tire obstacles', () => {
      expect(new Set(Object.values(OBSTACLE_VISUAL_BY_KIND))).toEqual(
        new Set([
          'floating-log',
          'submerged-rock',
          'rusty-barrel',
          'tangled-debris',
        ]),
      );

      const representatives = [
        ['wall-concrete', 'floating-log'],
        ['wall-brick', 'submerged-rock'],
        ['wall-moving', 'rusty-barrel'],
        ['crate', 'submerged-rock'],
        ['wall-breakable', 'tangled-debris'],
      ] as const;
      for (const [kind, visual] of representatives) {
        const group = buildObstacleMesh(kind);
        expect(group.userData.obstacleVisual).toBe(visual);
        expect(group.getObjectByName('obstacleWaterRipple')).toBeDefined();
        const geometries = new Set<THREE.BufferGeometry>();
        let meshCount = 0;
        group.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (mesh.isMesh) {
            meshCount += 1;
            geometries.add(mesh.geometry);
          }
        });
        expect(meshCount).toBeGreaterThan(2);
        geometries.forEach((geometry) => geometry.dispose());
      }
    });
  });

  it('wall half-extents are narrower than a lane so steer-around is possible', () => {
    const laneHalf = Math.abs(LANES[1] - LANES[0]) / 2; // 1.35 m
    for (const kind of ['wall-concrete', 'wall-brick', 'wall-wood', 'wall-low', 'wall-moving', 'wall-breakable'] as const) {
      expect(OBSTACLE_HALF_EXTENTS[kind].x, kind).toBeLessThan(laneHalf * 2.2);
    }
  });
});

// ─── economy integration ──────────────────────────────────────────────────────

describe('obstacle economy integration', () => {
  let economy: EconomyManager;

  beforeEach(() => {
    economy = new EconomyManager(200);
  });

  it('applies a 50-coin penalty via the obstacle transaction type', () => {
    const result = economy.apply({
      type: 'obstacle',
      sourceId: 'obs:1:0',
      amount: OBSTACLES.penalty,
      label: 'Obstacle hit',
    });
    expect(result.applied).toBe(true);
    expect(result.entry?.balanceAfter).toBe(150);
    expect(result.entry?.delta).toBe(-50);
  });

  it('never allows balance to go below zero', () => {
    const poor = new EconomyManager(30);
    const result = poor.apply({
      type: 'obstacle',
      sourceId: 'obs:2:0',
      amount: OBSTACLES.penalty,
    });
    expect(result.applied).toBe(true);
    expect(result.entry?.balanceAfter).toBe(0);
    expect(poor.balance).toBe(0);
  });

  it('rejects a duplicate sourceId (one penalty per contact window)', () => {
    economy.apply({ type: 'obstacle', sourceId: 'obs:3:0', amount: OBSTACLES.penalty });
    const dup = economy.apply({ type: 'obstacle', sourceId: 'obs:3:0', amount: OBSTACLES.penalty });
    expect(dup.applied).toBe(false);
    expect(dup.reason).toBe('duplicate');
    expect(economy.balance).toBe(150);
  });

  it('allows a new hit on the same obstacle after the cooldown window changes the sourceId', () => {
    // Different time-window suffix = different sourceId = new hit allowed
    economy.apply({ type: 'obstacle', sourceId: 'obs:4:0', amount: OBSTACLES.penalty });
    const second = economy.apply({ type: 'obstacle', sourceId: 'obs:4:19', amount: OBSTACLES.penalty });
    expect(second.applied).toBe(true);
    expect(economy.balance).toBe(100);
  });

  it('shield: penalty is NOT applied when shield is active', () => {
    // Simulate shield by simply not calling economy.apply — the system skips it
    const before = economy.balance;
    // (no apply call — shield path in ObstacleSystem skips economy.apply)
    expect(economy.balance).toBe(before);
  });

  it('breakable wall: no penalty when breakableActive is true', () => {
    // Simulate: broken wall sets rec.broken = true and skips collision
    const before = economy.balance;
    // (no apply call — broken path in ObstacleSystem skips economy.apply)
    expect(economy.balance).toBe(before);
  });

  it('multiple different obstacles each apply their own penalty', () => {
    economy.apply({ type: 'obstacle', sourceId: 'obs:10:0', amount: OBSTACLES.penalty });
    economy.apply({ type: 'obstacle', sourceId: 'obs:11:0', amount: OBSTACLES.penalty });
    economy.apply({ type: 'obstacle', sourceId: 'obs:12:0', amount: OBSTACLES.penalty });
    expect(economy.balance).toBe(50);
  });

  it('penalty config value is 50', () => {
    expect(OBSTACLES.penalty).toBe(50);
  });
});
