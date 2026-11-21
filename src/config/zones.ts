export type ZoneId =
  | 'residential'
  | 'market'
  | 'construction'
  | 'temple'
  | 'festival'
  | 'traffic'
  | 'outskirts';

export interface ZoneSky {
  top: number;
  bottom: number;
  background: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  sunGlow: number;
}

export interface ZoneLight {
  hemisphereSky: number;
  hemisphereGround: number;
  hemisphereIntensity: number;
  sunColor: number;
  sunIntensity: number;
}

export interface ZoneDressing {
  shopChance: number;
  treeCount: readonly [number, number];
  vehicleCount: readonly [number, number];
  stallCount: readonly [number, number];
}

export interface ZoneTheme {
  id: ZoneId;
  name: string;
  sky: ZoneSky;
  light: ZoneLight;
  dressing: ZoneDressing;
}

export const ZONES: Record<ZoneId, ZoneTheme> = {
  residential: {
    id: 'residential',
    name: 'Riverside Stretch',
    sky: {
      top: 0x50749a,
      bottom: 0xffcb98,
      background: 0xb9c4cb,
      fog: 0xdfcbb0,
      fogNear: 72,
      fogFar: 220,
      sunGlow: 0xffd9a8,
    },
    light: {
      hemisphereSky: 0xc6d8e6,
      hemisphereGround: 0x7f6b4d,
      hemisphereIntensity: 1.12,
      sunColor: 0xffd4a0,
      sunIntensity: 2.38,
    },
    dressing: {
      shopChance: 0.34,
      treeCount: [3, 4],
      vehicleCount: [1, 2],
      stallCount: [0, 1],
    },
  },
  market: {
    id: 'market',
    name: 'Riverside Market',
    sky: {
      top: 0x4388cf,
      bottom: 0xffd79f,
      background: 0xc6dcf0,
      fog: 0xefd9bb,
      fogNear: 66,
      fogFar: 212,
      sunGlow: 0xffe2a4,
    },
    light: {
      hemisphereSky: 0xd6e8ff,
      hemisphereGround: 0x907856,
      hemisphereIntensity: 1.16,
      sunColor: 0xffe6bd,
      sunIntensity: 2.38,
    },
    dressing: {
      shopChance: 0.88,
      treeCount: [1, 2],
      vehicleCount: [1, 2],
      stallCount: [2, 3],
    },
  },
  construction: {
    id: 'construction',
    name: 'Bridge Works',
    sky: {
      top: 0x6e9dc9,
      bottom: 0xf3dcc0,
      background: 0xd3e0ea,
      fog: 0xe6d6c2,
      fogNear: 48,
      fogFar: 186,
      sunGlow: 0xffeccb,
    },
    light: {
      hemisphereSky: 0xd8e2ea,
      hemisphereGround: 0x9a8870,
      hemisphereIntensity: 1.2,
      sunColor: 0xfff0d2,
      sunIntensity: 2.18,
    },
    dressing: {
      shopChance: 0.1,
      treeCount: [0, 1],
      vehicleCount: [0, 1],
      stallCount: [0, 0],
    },
  },
  temple: {
    id: 'temple',
    name: 'Temple Ghat',
    sky: {
      top: 0x3a78c4,
      bottom: 0xffc98e,
      background: 0xc4d6e9,
      fog: 0xf0d3ac,
      fogNear: 62,
      fogFar: 206,
      sunGlow: 0xffdf9c,
    },
    light: {
      hemisphereSky: 0xd7e4ff,
      hemisphereGround: 0x94704a,
      hemisphereIntensity: 1.12,
      sunColor: 0xffdcaa,
      sunIntensity: 2.4,
    },
    dressing: {
      shopChance: 0.2,
      treeCount: [2, 3],
      vehicleCount: [1, 1],
      stallCount: [0, 1],
    },
  },
  festival: {
    id: 'festival',
    name: 'Festival Riverfront',
    sky: {
      top: 0x2d3f7e,
      bottom: 0xf0a06a,
      background: 0x73749e,
      fog: 0xd8a58f,
      fogNear: 54,
      fogFar: 196,
      sunGlow: 0xffb877,
    },
    light: {
      hemisphereSky: 0x8e9cd4,
      hemisphereGround: 0x6d4b3c,
      hemisphereIntensity: 0.98,
      sunColor: 0xffc98f,
      sunIntensity: 1.86,
    },
    dressing: {
      shopChance: 0.62,
      treeCount: [1, 2],
      vehicleCount: [1, 2],
      stallCount: [1, 2],
    },
  },
  traffic: {
    id: 'traffic',
    name: 'River Crossing',
    sky: {
      top: 0x4a8fd4,
      bottom: 0xffe0b0,
      background: 0xc9e1f2,
      fog: 0xe9dcc4,
      fogNear: 70,
      fogFar: 218,
      sunGlow: 0xffedbc,
    },
    light: {
      hemisphereSky: 0xdcecff,
      hemisphereGround: 0x8f7f65,
      hemisphereIntensity: 1.2,
      sunColor: 0xfff2cf,
      sunIntensity: 2.45,
    },
    dressing: {
      shopChance: 0.3,
      treeCount: [1, 2],
      vehicleCount: [3, 4],
      stallCount: [1, 1],
    },
  },
  outskirts: {
    id: 'outskirts',
    name: 'Open Riverside',
    sky: {
      top: 0x5a9bd8,
      bottom: 0xffe3b6,
      background: 0xd2e4f0,
      fog: 0xeadfc6,
      fogNear: 80,
      fogFar: 232,
      sunGlow: 0xfff0c0,
    },
    light: {
      hemisphereSky: 0xe0edff,
      hemisphereGround: 0x9a8a6c,
      hemisphereIntensity: 1.18,
      sunColor: 0xfff3d6,
      sunIntensity: 2.4,
    },
    dressing: {
      shopChance: 0.04,
      treeCount: [3, 4],
      vehicleCount: [0, 1],
      stallCount: [0, 0],
    },
  },
};

export const ZONE_ORDER: readonly ZoneId[] = [
  'residential',
  'market',
  'construction',
  'temple',
  'festival',
  'traffic',
  'outskirts',
] as const;

export function getZoneTheme(id: ZoneId): ZoneTheme {
  return ZONES[id];
}
