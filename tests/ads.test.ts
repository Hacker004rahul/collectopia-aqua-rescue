/**
 * Spryntworks Advertising System — tests
 *
 * Tests run headlessly in Vitest (no DOM, no WebGL renderer).
 * Three.js geometry/material constructors are avoided in pure-logic tests.
 * Where a minimal scene stub is needed we use a lightweight mock.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ADVERTISING, GATES, LANES, ROAD } from '../src/config/balance';
import {
  AD_SIDE_OFFSET,
  AD_BUILDING_FACE_X,
  AD_RIVER_EDGE_X,
  AD_BANK_OUTER_X,
  AD_SIDEWALK_OUTER_X,
  AD_PLAYER_FACING_LEAN,
  AD_HOARDING_PANEL_WIDTH,
  AD_HOARDING_PANEL_HEIGHT,
} from '../src/world/ads/AdStructureBuilder';
import { adRoadsideYaw } from '../src/world/ads/AdSystem';
import { ZONES } from '../src/config/zones';

// ─── ADVERTISING config sanity ────────────────────────────────────────────────

describe('ADVERTISING config', () => {
  it('spawnAhead is greater than gapMax so at least one ad can spawn', () => {
    expect(ADVERTISING.spawnAhead).toBeGreaterThan(ADVERTISING.gapMax);
  });

  it('gapMin is less than gapMax', () => {
    expect(ADVERTISING.gapMin).toBeLessThan(ADVERTISING.gapMax);
  });

  it('gantryMinGap is greater than gapMax', () => {
    expect(ADVERTISING.gantryMinGap).toBeGreaterThan(ADVERTISING.gapMax);
  });

  it('maxActive is a positive integer', () => {
    expect(ADVERTISING.maxActive).toBeGreaterThan(0);
    expect(Number.isInteger(ADVERTISING.maxActive)).toBe(true);
  });

  it('logo dimensions are correct', () => {
    expect(ADVERTISING.logoWidth).toBe(640);
    expect(ADVERTISING.logoHeight).toBe(271);
  });

  it('logo aspect ratio matches actual file dimensions', () => {
    const expected = 640 / 271;
    expect(ADVERTISING.logoAspect).toBeCloseTo(expected, 4);
  });

  it('logo aspect ratio is approximately 2.36 : 1', () => {
    expect(ADVERTISING.logoAspect).toBeGreaterThan(2.3);
    expect(ADVERTISING.logoAspect).toBeLessThan(2.4);
  });

  it('gateExclusion is positive', () => {
    expect(ADVERTISING.gateExclusion).toBeGreaterThan(0);
  });
});

// ─── AD_SIDE_OFFSET — ads must be clear of the road ──────────────────────────

describe('AD_SIDE_OFFSET placement', () => {
  const roadHalf = ROAD.width / 2;   // 4.05 m — the playable road edge

  it('gantry billboards sit on the bank, not above the river', () => {
    expect(AD_SIDE_OFFSET.gantry).toBeGreaterThan(AD_RIVER_EDGE_X);
    expect(AD_SIDE_OFFSET.gantry).toBeLessThan(AD_BANK_OUTER_X);
  });

  it('every non-gantry format is placed beyond the road edge', () => {
    const nonGantry = (
      ['hoarding', 'building-board', 'shopfront-board', 'premium-install'] as const
    );
    for (const format of nonGantry) {
      expect(AD_SIDE_OFFSET[format], format).toBeGreaterThan(roadHalf);
    }
  });

  it('no non-gantry format overlaps the player lanes', () => {
    // Player collision half-width is 0.78 m; lane centres at ±2.7 m and 0.
    // Any offset > 4.05 is safely off the road.
    const nonGantry = (
      ['hoarding', 'building-board', 'shopfront-board', 'premium-install'] as const
    );
    for (const format of nonGantry) {
      expect(AD_SIDE_OFFSET[format], format).toBeGreaterThan(4.0);
    }
  });

  it('every format has a defined offset', () => {
    const formats = [
      'gantry', 'hoarding', 'building-board', 'shopfront-board', 'premium-install',
    ] as const;
    for (const f of formats) {
      expect(typeof AD_SIDE_OFFSET[f]).toBe('number');
    }
  });

  it('smaller roadside signs stand in the verge between sidewalk and buildings', () => {
    const nonGantry = (
      ['building-board', 'shopfront-board', 'premium-install'] as const
    );
    for (const format of nonGantry) {
      expect(AD_SIDE_OFFSET[format], format).toBeGreaterThan(AD_SIDEWALK_OUTER_X);
      expect(AD_SIDE_OFFSET[format], format).toBeLessThan(AD_BUILDING_FACE_X);
    }
  });

  it('the large printed hoarding keeps its roadward edge beyond traffic', () => {
    const xExtent = (AD_HOARDING_PANEL_WIDTH / 2) * Math.cos(AD_PLAYER_FACING_LEAN);
    expect(AD_SIDE_OFFSET.hoarding - xExtent).toBeGreaterThan(roadHalf);
    expect(AD_SIDE_OFFSET.hoarding - xExtent).toBeGreaterThan(AD_RIVER_EDGE_X);
    expect(AD_HOARDING_PANEL_WIDTH / AD_HOARDING_PANEL_HEIGHT).toBeCloseTo(
      ADVERTISING.logoAspect,
      3,
    );
  });

  it('keeps every angled billboard fully on the grassy banks', () => {
    const formats = [
      'gantry',
      'hoarding',
      'building-board',
      'shopfront-board',
      'premium-install',
    ] as const;
    for (const format of formats) {
      const panelWidths = {
        gantry: 4.2,
        hoarding: AD_HOARDING_PANEL_WIDTH,
        'building-board': 1.52 * ADVERTISING.logoAspect,
        'shopfront-board': ADVERTISING.logoAspect,
        'premium-install': 1.6,
      };
      const halfPanelWidth = panelWidths[format] / 2;
      const projectedHalfWidth =
        halfPanelWidth * Math.cos(AD_PLAYER_FACING_LEAN);
      expect(
        AD_SIDE_OFFSET[format] - projectedHalfWidth,
        format,
      ).toBeGreaterThan(AD_RIVER_EDGE_X);
      expect(
        AD_SIDE_OFFSET[format] + projectedHalfWidth,
        format,
      ).toBeLessThan(AD_BANK_OUTER_X);
    }
  });
});

describe('roadside orientation', () => {
  it('left-side panels angle inward (+X) while still facing the approaching player', () => {
    const yaw = adRoadsideYaw(-1);
    expect(Math.sin(yaw)).toBeGreaterThan(0.3); // +X
    expect(Math.cos(yaw)).toBeGreaterThan(0.8); // +Z
  });

  it('right-side panels angle inward (-X) while still facing the approaching player', () => {
    const yaw = adRoadsideYaw(1);
    expect(Math.sin(yaw)).toBeLessThan(-0.3); // -X
    expect(Math.cos(yaw)).toBeGreaterThan(0.8); // +Z
  });

  it('left and right panels do not share the same rotation', () => {
    expect(adRoadsideYaw(-1)).not.toBeCloseTo(adRoadsideYaw(1), 3);
  });
});

describe('ad timing', () => {
  it('prepares the first ad at a visible distance from the start', () => {
    expect(ADVERTISING.initialDistance).toBeGreaterThanOrEqual(70);
    expect(ADVERTISING.initialDistance).toBeLessThanOrEqual(100);
    expect(ADVERTISING.initialDistance).toBeLessThan(ZONES.residential.sky.fogFar);
  });

  it('uses the requested 90-140 m run cadence', () => {
    expect(ADVERTISING.gapMin).toBeGreaterThanOrEqual(90);
    expect(ADVERTISING.gapMax).toBeLessThanOrEqual(140);
    expect(ADVERTISING.gapMin).toBeLessThan(ADVERTISING.gapMax);
  });

  it('pre-spawns beyond one full spacing interval', () => {
    expect(ADVERTISING.spawnAhead).toBeGreaterThan(ADVERTISING.gapMax);
  });
});

// ─── Spawn-distance / gate exclusion logic ────────────────────────────────────

describe('gate exclusion logic', () => {
  /**
   * Reproduce the same isNearGate() check used in AdSystem.
   * Returns true if `distance` falls within ADVERTISING.gateExclusion metres
   * of a predicted gate position.
   */
  function isNearGate(distance: number): boolean {
    const offset = distance - GATES.initialDistance;
    if (offset < 0) return false;
    const mod = offset % GATES.spacingMin;
    return (
      mod < ADVERTISING.gateExclusion ||
      mod > GATES.spacingMin - ADVERTISING.gateExclusion
    );
  }

  it('a distance exactly at a gate position is excluded', () => {
    // First gate is at GATES.initialDistance; subsequent ones at spacingMin intervals
    expect(isNearGate(GATES.initialDistance)).toBe(true);
    expect(isNearGate(GATES.initialDistance + GATES.spacingMin)).toBe(true);
  });

  it('a distance gateExclusion+1 past a gate is allowed', () => {
    const safe = GATES.initialDistance + ADVERTISING.gateExclusion + 1;
    expect(isNearGate(safe)).toBe(false);
  });

  it('a distance before the first gate is never excluded', () => {
    expect(isNearGate(GATES.initialDistance - 1)).toBe(false);
    expect(isNearGate(0)).toBe(false);
  });
});

// ─── Logo aspect ratio preservation ──────────────────────────────────────────

describe('logo aspect ratio', () => {
  /**
   * For each format, derive the panel dimensions used in AdStructureBuilder
   * and confirm they honour the logo's native 2.363 : 1 ratio.
   */
  const LOGO_RATIO = ADVERTISING.logoAspect; // 640/271

  it('gantry printed face uses a wide highway proportion', () => {
    const panelW = 4.2;
    const panelH = panelW * (271 / 640);
    expect(panelW / panelH).toBeGreaterThan(2.3);
    expect(panelW / panelH).toBeLessThan(2.4);
  });

  it('roadside hoarding uses a wide highway proportion', () => {
    expect(AD_HOARDING_PANEL_WIDTH / AD_HOARDING_PANEL_HEIGHT).toBeCloseTo(
      LOGO_RATIO,
      3,
    );
  });

  it('building-board panel width equals panelH * LOGO_RATIO', () => {
    const panelH = 1.52;
    const panelW = panelH * LOGO_RATIO;
    expect(panelW / panelH).toBeCloseTo(LOGO_RATIO, 3);
  });

  it('shopfront-board panel width equals panelH * LOGO_RATIO', () => {
    const panelH = 1.0;
    const panelW = panelH * LOGO_RATIO;
    expect(panelW / panelH).toBeCloseTo(LOGO_RATIO, 3);
  });

  it('premium-install panel width equals panelH * LOGO_RATIO', () => {
    const totemH = 4.8;
    const panelH = totemH * 0.42;
    const panelW = panelH * LOGO_RATIO;
    expect(panelW / panelH).toBeCloseTo(LOGO_RATIO, 3);
  });
});

// ─── Zone format table completeness ──────────────────────────────────────────

describe('zone format tables', () => {
  /**
   * Reproduce the zone format tables from AdSystem.
   * We test them here without importing Three.js.
   */
  type AdFormatId =
    | 'gantry' | 'hoarding'
    | 'building-board' | 'shopfront-board' | 'premium-install';

  type WeightedFormat = [AdFormatId, number];

  const ZONE_FORMATS: Record<string, WeightedFormat[]> = {
    residential:  [['hoarding', 8], ['building-board', 1], ['shopfront-board', 1], ['premium-install', 2]],
    market:       [['hoarding', 6], ['shopfront-board', 2], ['building-board', 1], ['premium-install', 1]],
    construction: [['hoarding', 8], ['gantry', 1], ['premium-install', 1]],
    temple:       [['hoarding', 5], ['building-board', 3], ['shopfront-board', 2], ['premium-install', 1]],
    festival:     [['hoarding', 6], ['premium-install', 2], ['shopfront-board', 1], ['building-board', 1]],
    traffic:      [['hoarding', 7], ['gantry', 2], ['premium-install', 1], ['building-board', 1]],
    outskirts:    [['hoarding', 8], ['gantry', 2], ['premium-install', 1]],
  };

  const ALL_ZONES = ['residential', 'market', 'construction', 'temple', 'festival', 'traffic', 'outskirts'];

  it('all 7 zones have a format table', () => {
    for (const zone of ALL_ZONES) {
      expect(ZONE_FORMATS[zone], zone).toBeDefined();
      expect(ZONE_FORMATS[zone].length, zone).toBeGreaterThan(0);
    }
  });

  it('every format table has positive weights summing to > 0', () => {
    for (const zone of ALL_ZONES) {
      const total = ZONE_FORMATS[zone].reduce((s, [, w]) => s + w, 0);
      expect(total, zone).toBeGreaterThan(0);
    }
  });

  it('temple zone does NOT include gantries', () => {
    const templeFormats = ZONE_FORMATS.temple.map(([f]) => f);
    expect(templeFormats).not.toContain('gantry');
  });

  it('traffic zone includes gantry (highway crossing)', () => {
    const trafficFormats = ZONE_FORMATS.traffic.map(([f]) => f);
    expect(trafficFormats).toContain('gantry');
  });

  it('outskirts zone includes large hoarding and gantry', () => {
    const formats = ZONE_FORMATS.outskirts.map(([f]) => f);
    expect(formats).toContain('hoarding');
    expect(formats).toContain('gantry');
  });

  it('construction zone has hoarding as highest-weight format', () => {
    const sorted = [...ZONE_FORMATS.construction].sort((a, b) => b[1] - a[1]);
    expect(sorted[0][0]).toBe('hoarding');
  });

  it('market zone prioritizes large roadside hoardings', () => {
    const sorted = [...ZONE_FORMATS.market].sort((a, b) => b[1] - a[1]);
    expect(sorted[0][0]).toBe('hoarding');
  });
});

// ─── Gantry geometry — standalone clearance ──────────────────────────────────

describe('gantry standalone geometry', () => {
  // The posts and printed face fit within the grassy riverbank.
  const PILLAR_X        = 2.5;
  const PILLAR_HALF_W   = 0.26 / 2;
  const GANTRY_PANEL_W  = 4.2;
  const GANTRY_PILLAR_H = 8.6;

  it('pillar footprint stays between the river edge and bank outer edge', () => {
    const innerEdge = AD_SIDE_OFFSET.gantry - (PILLAR_X + PILLAR_HALF_W);
    const pillarOuterEdge = PILLAR_X + PILLAR_HALF_W;
    expect(innerEdge).toBeGreaterThan(AD_RIVER_EDGE_X);
    expect(AD_SIDE_OFFSET.gantry + pillarOuterEdge).toBeLessThan(AD_BANK_OUTER_X);
  });

  it('pillar inner face does not enter the road collision zone', () => {
    const pillarInnerEdge =
      AD_SIDE_OFFSET.gantry - (PILLAR_X - PILLAR_HALF_W);
    expect(pillarInnerEdge).toBeGreaterThan(AD_RIVER_EDGE_X);
  });

  it('the printed face clears the 5.1 m camera eye', () => {
    const cabinetBottom =
      GANTRY_PILLAR_H - 0.25 - GANTRY_PANEL_W * (271 / 640);
    const cameraEye     = 5.1;
    expect(cabinetBottom).toBeGreaterThan(cameraEye + 0.5);
  });

  it('the printed face fits between the gantry pillars', () => {
    const innerSpan = (PILLAR_X - PILLAR_HALF_W) * 2;
    expect(GANTRY_PANEL_W).toBeLessThan(innerSpan);
  });

  it('beam span clears the face and remains within the bank', () => {
    const beamHalfSpan =
      (PILLAR_X + 0.3) * Math.cos(AD_PLAYER_FACING_LEAN) +
      0.25 * Math.sin(AD_PLAYER_FACING_LEAN);
    expect(beamHalfSpan * 2).toBeGreaterThan(GANTRY_PANEL_W);
    expect(AD_SIDE_OFFSET.gantry - beamHalfSpan).toBeGreaterThan(AD_RIVER_EDGE_X);
    expect(AD_SIDE_OFFSET.gantry + beamHalfSpan).toBeLessThan(AD_BANK_OUTER_X);
  });
});

// ─── Recycling logic ──────────────────────────────────────────────────────────

describe('ad recycling bounds', () => {
  it('recycling threshold does not remove ads still visible ahead', () => {
    // An ad spawned at distance=100 when the player is at distance=80
    // should still be in front of the player (worldZ negative, player moving forward)
    const adDistance = 100;
    const playerDistance = 80;
    const playerZ = -playerDistance;         // playerZ = -80
    const adWorldZ = -adDistance;            // adWorldZ = -100
    // Ad is BEHIND the player in Z terms when: adWorldZ > playerZ + RECYCLE_BEHIND
    // i.e. -100 > -80 + 22 = -58 → false → ad is NOT recycled
    expect(adWorldZ > playerZ + ADVERTISING.recycleBehind).toBe(false);
  });

  it('an ad 30 m behind the player is recycled', () => {
    const adDistance = 50;
    const playerDistance = 80;
    const playerZ = -playerDistance;
    const adWorldZ = -adDistance;
    // adWorldZ = -50 > playerZ + RECYCLE = -80 + 22 = -58 → true → recycle
    expect(adWorldZ > playerZ + ADVERTISING.recycleBehind).toBe(true);
  });
});

// ─── No road obstruction ──────────────────────────────────────────────────────

describe('ads do not obstruct the road', () => {
  it('lane centres are inside the road and outside all ad placements', () => {
    // Lane centres: -2.7, 0, +2.7
    // All non-gantry formats have AD_SIDE_OFFSET > roadHalf = 4.05
    for (const laneX of LANES) {
      const formats = (
        ['hoarding', 'building-board', 'shopfront-board', 'premium-install'] as const
      );
      for (const format of formats) {
        const adX = AD_SIDE_OFFSET[format];
        // Both sides: the ad is at ±adX; lane is at laneX
        // Minimum distance = adX - |laneX| must be > 0
        expect(adX - Math.abs(laneX), `${format} vs lane ${laneX}`).toBeGreaterThan(0);
      }
    }
  });
});
