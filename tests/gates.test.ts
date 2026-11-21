import { describe, expect, it } from 'vitest';
import {
  GATE_SPECS,
  GATE_VARIANTS,
  applyGateOperation,
  formatGate,
  formatGateCalculation,
  gateSpecKey,
  selectGatePair,
} from '../src/economy/gateMath';
import { GATE_BIAS } from '../src/config/balance';
import { boatFitsGateOpening } from '../src/gates/Gate';

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('gate math', () => {
  it('adds, subtracts, multiplies and divides with integer flooring', () => {
    expect(applyGateOperation(0, 'add', 100)).toBe(100);
    expect(applyGateOperation(40, 'subtract', 50)).toBe(0);
    expect(applyGateOperation(100, 'subtract', 100)).toBe(0);
    expect(applyGateOperation(7, 'multiply', 2)).toBe(14);
    expect(applyGateOperation(7, 'multiply', 1)).toBe(7);
    expect(applyGateOperation(101, 'divide', 2)).toBe(50);
    expect(applyGateOperation(101, 'divide', 4)).toBe(25);
    expect(applyGateOperation(5, 'divide', 2)).toBe(2);
  });

  it('never returns a negative balance or divides by zero', () => {
    expect(applyGateOperation(10, 'subtract', 999)).toBe(0);
    expect(applyGateOperation(10, 'divide', 0)).toBe(10);
    expect(applyGateOperation(-5, 'add', 10)).toBe(5);
  });

  it('formats gate labels for the HUD', () => {
    expect(formatGate(GATE_SPECS.add)).toBe('+100');
    expect(formatGate(GATE_SPECS.subtract)).toBe('−50');
    expect(formatGate(GATE_SPECS.multiply)).toBe('×2');
    expect(GATE_SPECS.add.color).toBe('#2fbf83');
    expect(GATE_SPECS.subtract.color).toBe('#e0445e');
    expect(GATE_SPECS.multiply.color).toBe('#00a86b');
    expect(GATE_SPECS.divide.color).toBe('#3b82f6');
    expect(formatGate(GATE_SPECS.divide)).toBe('÷2');
    expect(formatGateCalculation(100, GATE_SPECS.subtract, 50)).toBe(
      '100 − 50 = 50',
    );
  });

  it('keeps every gate operation within the configured non-negative floor', () => {
    for (const spec of GATE_VARIANTS) {
      expect(applyGateOperation(0, spec.operation, spec.value)).toBeGreaterThanOrEqual(0);
      expect(applyGateOperation(1, spec.operation, spec.value)).toBeGreaterThanOrEqual(0);
    }
  });

  it('contains every required gate value', () => {
    const keys = new Set(GATE_VARIANTS.map(gateSpecKey));
    expect(keys).toEqual(
      new Set([
        'add:100',
        'subtract:50',
        'subtract:100',
        'multiply:1',
        'multiply:2',
        'divide:2',
        'divide:4',
      ]),
    );
  });
});

describe('gate passage clearance', () => {
  it('requires the full boat bounds to fit inside one gate opening', () => {
    expect(boatFitsGateOpening(-2.7, -2.7, 1.02, 1.53)).toBe(true);
    expect(boatFitsGateOpening(2.7, 2.7, 1.02, 1.53)).toBe(true);
    expect(boatFitsGateOpening(-2.2, -2.7, 1.02, 1.53)).toBe(true);
    expect(boatFitsGateOpening(-2.17, -2.7, 1.02, 1.53)).toBe(false);
    expect(boatFitsGateOpening(0, -2.7, 1.02, 1.53)).toBe(false);
  });

  it('rejects invalid positions and bounds', () => {
    expect(boatFitsGateOpening(Number.NaN, 0, 1.02, 1.53)).toBe(false);
    expect(boatFitsGateOpening(0, 0, -1, 1.53)).toBe(false);
    expect(boatFitsGateOpening(0, 0, 1.02, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('gate pair selection', () => {
  it('always offers two distinct choices', () => {
    const random = seededRandom(0x603d);
    for (let index = 0; index < 500; index += 1) {
      const pair = selectGatePair(index % 2 === 0 ? 0 : 500_000, random);
      expect(gateSpecKey(pair.first)).not.toBe(gateSpecKey(pair.second));
    }
  });

  it('uses the required 200,000 lifetime-coin threshold', () => {
    expect(GATE_BIAS.highBalanceThreshold).toBe(200_000);
  });

  it('keeps the distribution balanced below the threshold', () => {
    const random = seededRandom(0xabc123);
    const counts = new Map<string, number>();
    for (let index = 0; index < 3_500; index += 1) {
      const pair = selectGatePair(0, random);
      for (const gate of [pair.first, pair.second]) {
        const key = gateSpecKey(gate);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    const values = [...counts.values()];
    const min = Math.min(...values);
    const max = Math.max(...values);
    expect(max / min).toBeLessThan(1.25);
  });

  it('biases toward subtract and divide above the threshold', () => {
    const random = seededRandom(0xdef456);
    let lowReductions = 0;
    let highReductions = 0;

    const lowRandom = seededRandom(0x13579);
    const highRandom = seededRandom(0x24680);
    for (let index = 0; index < 2_000; index += 1) {
      const low = selectGatePair(0, lowRandom);
      const high = selectGatePair(200_000, highRandom);
      for (const gate of [low.first, low.second]) {
        if (gate.operation === 'subtract' || gate.operation === 'divide') {
          lowReductions += 1;
        }
      }
      for (const gate of [high.first, high.second]) {
        if (gate.operation === 'subtract' || gate.operation === 'divide') {
          highReductions += 1;
        }
      }
    }

    expect(highReductions).toBeGreaterThan(lowReductions * 1.2);
    expect(random).toBeTypeOf('function');
  });
});
