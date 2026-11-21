/**
 * AdSystem
 *
 * Manages the full lifecycle of Spryntworks premium in-game advertising.
 *
 * Spawn rules
 *  - The first ad is prepared at ADVERTISING.initialDistance.
 *  - Ads are spawned ADVERTISING.spawnAhead metres in front of the player.
 *  - Run distance between successive ads is ADVERTISING.gapMin..gapMax.
 *  - Ads recycle ADVERTISING.recycleBehind metres after they pass the player.
 *  - Never placed within ADVERTISING.gateExclusion metres of a known gate z.
 *  - Gantry-style billboards are limited to one every
 *    ADVERTISING.gantryMinGap metres.
 *
 * Zone weights
 *  Each zone type specifies a probability table for which ad formats appear.
 *  This ensures the advertising mix matches the environment character.
 *
 * Performance
 *  - All ad groups are removed from the scene and re-added when recycled;
 *    no per-frame allocation after initial construction.
 *  - Maximum MAX_ACTIVE ads in the scene simultaneously.
 *  - Ad groups are disposed when the system is torn down.
 */
import * as THREE from 'three';
import { Rng } from '../../core/Rng';
import type { ZoneId } from '../../config/zones';
import { ADVERTISING, GATES } from '../../config/balance';
import {
  buildAdStructure,
  AD_SIDE_OFFSET,
  AD_PLAYER_FACING_LEAN,
  type AdFormatId,
} from './AdStructureBuilder';
import { disposeLogo } from './AdTextures';

// ─── zone ad-format weight tables ─────────────────────────────────────────────
// Each entry is [formatId, weight].  Weights are relative (not normalised).

type WeightedFormat = [AdFormatId, number];

const ZONE_FORMATS: Record<ZoneId, WeightedFormat[]> = {
  residential: [
    ['gantry',          3],
    ['hoarding',        6],
    ['building-board',  1],
    ['shopfront-board', 1],
    ['premium-install', 1],
  ],
  market: [
    ['gantry',          2],
    ['hoarding',        5],
    ['shopfront-board', 2],
    ['building-board',  1],
    ['premium-install', 1],
  ],
  construction: [
    ['gantry',          4],
    ['hoarding',        6],
    ['premium-install', 1],
  ],
  temple: [
    ['gantry',          2],
    ['hoarding',        5],
    ['building-board',  2],
    ['shopfront-board', 1],
    ['premium-install', 1],
  ],
  festival: [
    ['gantry',          3],
    ['hoarding',        5],
    ['premium-install', 2],
    ['shopfront-board', 1],
  ],
  traffic: [
    ['gantry',          4],
    ['hoarding',        5],
    ['premium-install', 1],
    ['building-board',  1],
  ],
  outskirts: [
    ['gantry',          4],
    ['hoarding',        6],
    ['premium-install', 1],
  ],
};

/** Rotation that turns a +Z-facing ad panel inward and toward the player. */
export function adRoadsideYaw(side: -1 | 1): number {
  return -side * AD_PLAYER_FACING_LEAN;
}

// ─── types ────────────────────────────────────────────────────────────────────

interface AdRecord {
  id: number;
  format: AdFormatId;
  side: -1 | 1;
  distance: number;   // distance along the track where the ad sits
  group: THREE.Group;
  active: boolean;
}

// ─── AdSystem ─────────────────────────────────────────────────────────────────

export class AdSystem {
  private readonly records: AdRecord[] = [];
  private rng: Rng;

  /** Next ad distance along the run. */
  private nextDistance: number = ADVERTISING.initialDistance;
  /** Alternates roadside placement so the street does not mirror itself. */
  private nextSide: -1 | 1 = -1;
  /** Distance of the last gantry placed. */
  private lastGantryDistance = -9999;

  private nextId = 1;
  private currentZoneId: ZoneId = 'residential';

  constructor(private readonly scene: THREE.Scene) {
    this.rng = new Rng(0xad5e32f1);
  }

  /**
   * Call every frame from Environment.update().
   * @param playerDistance  player's distance counter (metres, always positive)
   * @param playerZ         player's world-Z position
   * @param zoneId          current active zone
   */
  update(
    playerDistance: number,
    playerZ: number,
    zoneId: ZoneId,
  ): void {
    this.currentZoneId = zoneId;

    while (this.nextDistance < playerDistance + ADVERTISING.spawnAhead) {
      const scheduled = this.nextDistance;
      const spawnDistance = this.resolveSpawnDistance(scheduled);
      if (this.trySpawn(spawnDistance, this.nextSide)) {
        this.nextSide = this.nextSide === -1 ? 1 : -1;
      }
      this.nextDistance =
        scheduled + this.rng.range(ADVERTISING.gapMin, ADVERTISING.gapMax);
    }

    // recycle
    for (let i = this.records.length - 1; i >= 0; i--) {
      const rec = this.records[i];
      if (!rec.active) continue;
      const worldZ = -rec.distance;
      if (worldZ > playerZ + ADVERTISING.recycleBehind) {
        this.deactivate(i);
      }
    }
  }

  reset(): void {
    for (let i = this.records.length - 1; i >= 0; i -= 1) {
      const rec = this.records[i];
      if (rec.active) this.scene.remove(rec.group);
      disposeGroup(rec.group);
    }
    this.records.length = 0;
    this.rng = new Rng(0xad5e32f1);
    this.nextDistance = ADVERTISING.initialDistance;
    this.nextSide = -1;
    this.lastGantryDistance = -9999;
    this.nextId = 1;
    this.currentZoneId = 'residential';
  }

  dispose(): void {
    for (let i = this.records.length - 1; i >= 0; i--) {
      const rec = this.records[i];
      if (rec.active) this.scene.remove(rec.group);
      disposeGroup(rec.group);
    }
    this.records.length = 0;
    disposeLogo();
  }

  // ─── inspection (for tests) ─────────────────────────────────────────────────

  getActiveCount(): number {
    return this.records.filter((r) => r.active).length;
  }

  getActiveRecords(): ReadonlyArray<Readonly<AdRecord>> {
    return this.records.filter((r) => r.active);
  }

  // ─── private ─────────────────────────────────────────────────────────────

  private trySpawn(distance: number, side: -1 | 1): boolean {
    if (this.getActiveCount() >= ADVERTISING.maxActive) return false;

    let format = this.pickFormat(this.currentZoneId);

    if (
      format === 'gantry' &&
      distance - this.lastGantryDistance < ADVERTISING.gantryMinGap
    ) {
      format = this.pickRoadsideFormat(this.currentZoneId);
    }

    // Hoardings always spawn as a mirrored pair (left + right simultaneously)
    if (format === 'hoarding') {
      if (this.getActiveCount() + 2 > ADVERTISING.maxActive) return false;
      for (const s of [-1, 1] as const) {
        const group = buildAdStructure(format, s);
        this.positionAd(group, format, s, distance);
        this.scene.add(group);
        this.records.push({ id: this.nextId++, format, side: s, distance, group, active: true });
      }
      return true;
    }

    const group = buildAdStructure(format, side);
    this.positionAd(group, format, side, distance);
    this.scene.add(group);

    if (format === 'gantry') this.lastGantryDistance = distance;

    this.records.push({ id: this.nextId++, format, side, distance, group, active: true });
    return true;
  }

  private positionAd(
    group: THREE.Group,
    format: AdFormatId,
    side: -1 | 1,
    distance: number,
  ): void {
    const xOffset = AD_SIDE_OFFSET[format];

    if (format === 'gantry') {
      group.rotation.y = adRoadsideYaw(side);
      group.position.set(side * xOffset, 0, -distance);
    } else {
      // Panels are built facing +Z. Rotate inward toward the road and lean
      // toward the approaching player by AD_PLAYER_FACING_LEAN radians.
      // Left (-1): +~70deg, right (+1): -~70deg.
      group.rotation.y = adRoadsideYaw(side);
      group.position.set(side * xOffset, 0, -distance);
    }
  }

  /** Nudge a scheduled ad forward until it clears the gate exclusion band. */
  private resolveSpawnDistance(distance: number): number {
    let candidate = distance;
    for (let step = 0; step < 10 && this.isNearGate(candidate); step += 1) {
      candidate += 4;
    }
    return candidate;
  }

  private isNearGate(distance: number): boolean {
    // Gates use varied spacing, so this is a conservative modular guard around
    // the minimum gate cadence rather than an exact prediction.
    const offset = distance - GATES.initialDistance;
    if (offset < 0) return false;
    const mod = offset % GATES.spacingMin;
    return (
      mod < ADVERTISING.gateExclusion ||
      mod > GATES.spacingMin - ADVERTISING.gateExclusion
    );
  }

  private pickFormat(zoneId: ZoneId): AdFormatId {
    const table = ZONE_FORMATS[zoneId] ?? ZONE_FORMATS.residential;
    return this.pickWeighted(table);
  }

  private pickRoadsideFormat(zoneId: ZoneId): AdFormatId {
    const table = (ZONE_FORMATS[zoneId] ?? ZONE_FORMATS.residential).filter(
      ([format]) => format !== 'gantry',
    );
    return table.length > 0
      ? this.pickWeighted(table)
      : 'hoarding';
  }

  private pickWeighted(table: WeightedFormat[]): AdFormatId {
    const totalWeight = table.reduce((s, [, w]) => s + w, 0);
    let r = this.rng.next() * totalWeight;
    for (const [format, weight] of table) {
      r -= weight;
      if (r <= 0) return format;
    }
    return table[0][0];
  }

  private deactivate(index: number): void {
    const rec = this.records[index];
    rec.active = false;
    this.scene.remove(rec.group);
    disposeGroup(rec.group);
    this.records.splice(index, 1);
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function disposeGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[];
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat.dispose();
  });
}
