import { getZoneTheme, ZONE_ORDER, type ZoneId } from './zones';

export interface LevelDefinition {
  index: number;
  name: string;
  zone: string;
  zoneId: ZoneId;
  length: number;
  speed: number;
}

export const LEVEL_LENGTH = 900;
export const ENDLESS_START_INDEX = 10;
export const ENDLESS_SPEED_START = 24.7;
export const ENDLESS_SPEED_STEP = 0.7;
export const ENDLESS_SPEED_CAP = 31;

export const LEVELS: readonly LevelDefinition[] = [
  {
    index: 0,
    name: 'Level 1',
    zone: 'Riverside Stretch',
    zoneId: 'residential',
    length: LEVEL_LENGTH,
    speed: 16.5,
  },
  {
    index: 1,
    name: 'Level 2',
    zone: 'Riverside Market',
    zoneId: 'market',
    length: LEVEL_LENGTH,
    speed: 17.2,
  },
  {
    index: 2,
    name: 'Level 3',
    zone: 'Bridge Works',
    zoneId: 'construction',
    length: LEVEL_LENGTH,
    speed: 17.9,
  },
  {
    index: 3,
    name: 'Level 4',
    zone: 'Temple Ghat',
    zoneId: 'temple',
    length: LEVEL_LENGTH,
    speed: 18.6,
  },
  {
    index: 4,
    name: 'Level 5',
    zone: 'Festival Riverfront',
    zoneId: 'festival',
    length: LEVEL_LENGTH,
    speed: 19.4,
  },
  {
    index: 5,
    name: 'Level 6',
    zone: 'River Crossing',
    zoneId: 'traffic',
    length: LEVEL_LENGTH,
    speed: 20.2,
  },
  {
    index: 6,
    name: 'Level 7',
    zone: 'Open Riverside',
    zoneId: 'outskirts',
    length: LEVEL_LENGTH,
    speed: 21.1,
  },
  {
    index: 7,
    name: 'Level 8',
    zone: 'Upper Riverbank',
    zoneId: 'residential',
    length: LEVEL_LENGTH,
    speed: 22,
  },
  {
    index: 8,
    name: 'Level 9',
    zone: 'Rough Water Bend',
    zoneId: 'construction',
    length: LEVEL_LENGTH,
    speed: 23,
  },
  {
    index: 9,
    name: 'Level 10',
    zone: 'Aqua Rescue Finale',
    zoneId: 'festival',
    length: LEVEL_LENGTH,
    speed: 24,
  },
] as const;

export const PREDEFINED_LEVEL_LENGTH = LEVELS.length * LEVEL_LENGTH;

const generatedLevels = new Map<number, LevelDefinition>();

export function isEndlessLevel(levelIndex: number): boolean {
  return levelIndex >= ENDLESS_START_INDEX;
}

export function getLevelDefinition(levelIndex: number): LevelDefinition {
  const safeIndex = Number.isFinite(levelIndex)
    ? Math.max(0, Math.floor(levelIndex))
    : 0;

  const predefined = LEVELS[safeIndex];
  if (predefined) return predefined;

  const cached = generatedLevels.get(safeIndex);
  if (cached) return cached;

  const zoneOffset = safeIndex - ENDLESS_START_INDEX;
  const zoneId = ZONE_ORDER[zoneOffset % ZONE_ORDER.length];
  const speed = Math.min(
    ENDLESS_SPEED_CAP,
    ENDLESS_SPEED_START + zoneOffset * ENDLESS_SPEED_STEP,
  );
  const level: LevelDefinition = {
    index: safeIndex,
    name: `Level ${safeIndex + 1}`,
    zone: getZoneTheme(zoneId).name,
    zoneId,
    length: LEVEL_LENGTH,
    speed,
  };
  generatedLevels.set(safeIndex, level);
  return level;
}

export function getNextLevel(levelIndex: number): LevelDefinition {
  return getLevelDefinition(levelIndex + 1);
}

export function getLevelStartDistance(levelIndex: number): number {
  const safeIndex = Number.isFinite(levelIndex)
    ? Math.max(0, Math.floor(levelIndex))
    : 0;
  return safeIndex * LEVEL_LENGTH;
}

export interface LevelState {
  level: LevelDefinition;
  distanceIntoLevel: number;
  progress: number;
}

export function getLevelState(distance: number): LevelState {
  const safeDistance = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  const levelIndex = Math.floor(safeDistance / LEVEL_LENGTH);
  const level = getLevelDefinition(levelIndex);
  const distanceIntoLevel = safeDistance - levelIndex * LEVEL_LENGTH;
  return {
    level,
    distanceIntoLevel,
    progress: distanceIntoLevel / level.length,
  };
}
