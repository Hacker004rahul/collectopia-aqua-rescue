import * as THREE from 'three';
import { GATE_BIAS, GATES, LANES, PLAYER } from '../config/balance';
import { Rng } from '../core/Rng';
import type { SpawnReservations } from '../core/SpawnReservations';
import type { EconomyManager } from '../economy/EconomyManager';
import {
  formatGateCalculation,
  gateSpecKey,
  selectGatePair,
  type GatePairSelection,
} from '../economy/gateMath';
import type { TransactionType } from '../economy/types';
import { Gate } from './Gate';

interface GatePair {
  group: THREE.Group;
  gates: [Gate, Gate];
  distance: number;
  z: number;
  active: boolean;
  used: boolean;
  selectedGate: Gate | null;
  id: number;
}

const GATE_RESERVATION_HALF_LENGTH = 4.5;
const GATE_RESERVATION_PAD = 12;
const GATE_APPROACH_HIGHLIGHT_DISTANCE = 28;
const GATE_RECYCLE_DISTANCE = 5;

export interface GateActivation {
  text: string;
  positive: boolean;
  position: THREE.Vector3;
}

export interface GateSystemCallbacks {
  onActivate: (activation: GateActivation) => void;
}

const OPERATION_TRANSACTION: Record<string, TransactionType> = {
  add: 'gate-add',
  subtract: 'gate-subtract',
  multiply: 'gate-multiply',
  divide: 'gate-divide',
};

export class MathGateSystem {
  private readonly pairs: GatePair[] = [];
  private rng = new Rng(0x6a7e5eed);
  private nextDistance = GATES.initialDistance;
  private nextPairId = 1;
  private lastPlayerZ = 0;
  private lastPlayerX = 0;
  private initialized = false;
  private readonly recentPairs: string[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly economy: EconomyManager,
    private readonly callbacks: GateSystemCallbacks,
    private readonly reservations?: SpawnReservations,
  ) {
    for (let i = 0; i < GATES.maxActivePairs; i += 1) {
      const group = new THREE.Group();
      const first = new Gate();
      const second = new Gate();
      group.add(first.group, second.group);
      group.visible = false;
      scene.add(group);

      this.pairs.push({
        group,
        gates: [first, second],
        distance: 0,
        z: 0,
        active: false,
        used: false,
        selectedGate: null,
        id: 0,
      });
    }
  }

  update(playerZ: number, playerX: number, distance: number, time = 0): void {
    while (
      this.nextDistance < distance + GATES.spawnAhead &&
      this.pairs.some((pair) => !pair.active)
    ) {
      const pair = this.pairs.find((candidate) => !candidate.active);
      if (!pair) break;
      if (!this.spawnPair(pair, this.nextDistance)) {
        this.nextDistance += 12;
        continue;
      }
      this.nextDistance += this.rng.range(GATES.spacingMin, GATES.spacingMax);
    }

    if (!this.initialized) {
      this.lastPlayerZ = playerZ;
      this.lastPlayerX = playerX;
      this.initialized = true;
    }

    for (const pair of this.pairs) {
      if (!pair.active) continue;

      pair.gates[0].update(time + pair.id);
      pair.gates[1].update(time + pair.id);

      if (!pair.used) {
        pair.selectedGate =
          playerZ > pair.z &&
          playerZ - pair.z <= GATE_APPROACH_HIGHLIGHT_DISTANCE
            ? this.findPassableGate(pair, playerX) ?? null
            : null;
        pair.gates[0].setSelected(pair.selectedGate === pair.gates[0]);
        pair.gates[1].setSelected(pair.selectedGate === pair.gates[1]);
      }

      if (!pair.used && this.lastPlayerZ > pair.z && playerZ <= pair.z) {
        pair.used = true;
        const crossingFraction = THREE.MathUtils.clamp(
          (this.lastPlayerZ - pair.z) / (this.lastPlayerZ - playerZ),
          0,
          1,
        );
        const crossingX = THREE.MathUtils.lerp(
          this.lastPlayerX,
          playerX,
          crossingFraction,
        );
        const gate = this.findPassableGate(pair, crossingX);
        pair.selectedGate = gate ?? null;
        if (gate) {
          gate.setSelected(true);
          this.activateGate(pair, gate);
        }
      }

      if (
        pair.z > playerZ + (pair.used ? GATE_RECYCLE_DISTANCE : 12)
      ) {
        this.releasePair(pair);
      }
    }

    this.lastPlayerZ = playerZ;
    this.lastPlayerX = playerX;
  }

  reset(): void {
    for (const pair of this.pairs) {
      this.releasePair(pair);
    }
    this.rng = new Rng(0x6a7e5eed);
    this.nextDistance = GATES.initialDistance;
    this.nextPairId = 1;
    this.lastPlayerZ = 0;
    this.lastPlayerX = 0;
    this.initialized = false;
    this.recentPairs.length = 0;
  }

  dispose(): void {
    for (const pair of this.pairs) {
      this.scene.remove(pair.group);
    }
  }

  private spawnPair(pair: GatePair, distance: number): boolean {
    if (
      this.reservations &&
      !this.reservations.isClear(
        distance,
        GATE_RESERVATION_HALF_LENGTH,
        [0, 1, 2],
        GATE_RESERVATION_PAD,
      )
    ) {
      return false;
    }

    const selection = this.pickPair();
    const lanes: [number, number] = [0, 2];

    pair.id = this.nextPairId++;
    pair.distance = distance;
    pair.z = -distance;
    pair.active = true;
    pair.used = false;
    pair.selectedGate = null;

    pair.gates[0].setSpec(
      selection.first,
      lanes[0],
      LANES[lanes[0]],
      `${pair.id}:${lanes[0]}`,
    );
    pair.gates[1].setSpec(
      selection.second,
      lanes[1],
      LANES[lanes[1]],
      `${pair.id}:${lanes[1]}`,
    );

    pair.group.position.z = -distance;
    pair.group.visible = true;

    this.reservations?.reserve({
      owner: 'gate',
      distance,
      halfLength: GATE_RESERVATION_HALF_LENGTH,
      lanes: [0, 1, 2],
      pad: GATE_RESERVATION_PAD,
    });
    return true;
  }

  private findPassableGate(pair: GatePair, playerX: number): Gate | undefined {
    return pair.gates.find((gate) =>
      gate.canPass(playerX, PLAYER.collisionHalfWidth),
    );
  }

  private pickPair(): GatePairSelection {
    const threshold = GATE_BIAS.highBalanceThreshold;
    let selection = selectGatePair(
      this.economy.totalCoinsCollected,
      () => this.rng.next(),
      threshold,
    );

    const key = this.pairKey(selection);
    for (let attempt = 0; attempt < 3 && this.recentPairs.includes(key); attempt += 1) {
      selection = selectGatePair(
        this.economy.totalCoinsCollected,
        () => this.rng.next(),
        threshold,
      );
    }

    this.recentPairs.push(this.pairKey(selection));
    if (this.recentPairs.length > 4) this.recentPairs.shift();
    return selection;
  }

  private pairKey(selection: GatePairSelection): string {
    return [gateSpecKey(selection.first), gateSpecKey(selection.second)]
      .sort()
      .join('|');
  }

  private releasePair(pair: GatePair): void {
    pair.active = false;
    pair.used = false;
    pair.selectedGate = null;
    pair.group.visible = false;
    pair.gates[0].hide();
    pair.gates[1].hide();
  }

  private activateGate(pair: GatePair, gate: Gate): void {
    const spec = gate.spec;
    if (!spec) return;

    const type = OPERATION_TRANSACTION[spec.operation];
    const result = this.economy.apply({
      type,
      sourceId: `gate:${gate.id}`,
      amount: spec.value,
      label: `${spec.label} gate`,
    });

    if (!result.applied || !result.entry) return;

    const text = formatGateCalculation(
      result.entry.balanceBefore,
      spec,
      result.entry.balanceAfter,
    );

    this.callbacks.onActivate({
      text,
      positive: result.entry.balanceAfter >= result.entry.balanceBefore,
      position: new THREE.Vector3(
        gate.group.position.x,
        0.14,
        pair.group.position.z,
      ),
    });
  }
}
