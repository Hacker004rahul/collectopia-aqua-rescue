import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/assets/proceduralTextures', async () => {
  const three = await import('three');
  const texture = () => new three.Texture();
  return {
    createGlowTexture: texture,
    createBisleriLabelTexture: texture,
    createCocaColaLabelTexture: texture,
    createChipsWrapperTexture: texture,
  };
});

import { GarbageSystem } from '../src/collectibles/GarbageSystem';
import { EconomyManager } from '../src/economy/EconomyManager';
import { GARBAGE_CATCH } from '../src/config/balance';

describe('garbage catch action', () => {
  let scene: THREE.Scene;
  let economy: EconomyManager;
  let garbage: GarbageSystem | undefined;
  let collectedCount: number;

  beforeEach(() => {
    scene = new THREE.Scene();
    economy = new EconomyManager();
    collectedCount = 0;
    garbage = new GarbageSystem(scene, economy, {
      onCollect: () => {
        collectedCount += 1;
      },
    });
    garbage.update(0, 0, 0, 0);
  });

  afterEach(() => {
    garbage?.dispose();
    garbage = undefined;
  });

  it('catches nearby river waste once and preserves its coin reward', () => {
    const matrix = new THREE.Matrix4();
    let target: THREE.Vector3 | undefined;
    for (const object of scene.children) {
      if (!(object instanceof THREE.InstancedMesh) || !object.name.startsWith('garbage-')) {
        continue;
      }
      for (let index = 0; index < object.count; index += 1) {
        object.getMatrixAt(index, matrix);
        const scaleX = Math.hypot(
          matrix.elements[0],
          matrix.elements[1],
          matrix.elements[2],
        );
        if (scaleX > 0.1) {
          target = new THREE.Vector3().setFromMatrixPosition(matrix);
          break;
        }
      }
      if (target) break;
    }

    expect(target).toBeDefined();
    const playerZ = target!.z + 3.5;
    const caught = garbage!.catchNearby(
      playerZ,
      target!.x,
      0,
      GARBAGE_CATCH.rangeX,
      GARBAGE_CATCH.rangeZ,
    );
    const balanceAfterCatch = economy.balance;

    expect(caught).toBeGreaterThan(0);
    expect(collectedCount).toBe(caught);
    expect(balanceAfterCatch).toBeGreaterThan(0);
    expect(
      garbage!.catchNearby(
        playerZ,
        target!.x,
        0,
        GARBAGE_CATCH.rangeX,
        GARBAGE_CATCH.rangeZ,
      ),
    ).toBe(0);
    expect(economy.balance).toBe(balanceAfterCatch);
  });
});
