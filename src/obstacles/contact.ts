import type { ObstacleKind } from './ObstacleMeshBuilder';

export type ObstacleContactOutcome = 'break' | 'shield' | 'fatal';

/**
 * Pure contact resolution so gameplay rules are testable without a renderer.
 * Super Punch breaks tangled debris; Shield absorbs one hit; other collisions
 * end the run.
 */
export function resolveObstacleContact(
  kind: ObstacleKind,
  shieldActive: boolean,
  breakableActive: boolean,
): ObstacleContactOutcome {
  if (kind === 'wall-breakable' && breakableActive) return 'break';
  if (shieldActive) return 'shield';
  return 'fatal';
}
