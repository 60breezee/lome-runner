import { GAMEPLAY, OBSTACLES } from './config.js';

// 0 au départ, tend vers 1 sans jamais l'atteindre : la vitesse monte vite au début puis se stabilise.
export function getProgress(distanceMeters) {
  return 1 - Math.exp(-Math.max(0, distanceMeters) / GAMEPLAY.speedRampMeters);
}

export function getSpeedForDistance(distanceMeters) {
  const { startSpeedPxPerSecond, maxSpeedPxPerSecond } = GAMEPLAY;
  return startSpeedPxPerSecond + (maxSpeedPxPerSecond - startSpeedPxPerSecond) * getProgress(distanceMeters);
}

export function getRowGapForDistance(distanceMeters) {
  const { rowGapStart, rowGapEnd } = GAMEPLAY;
  return rowGapStart - (rowGapStart - rowGapEnd) * getProgress(distanceMeters);
}

export function getLevelForDistance(distanceMeters) {
  return 1 + Math.floor(Math.max(0, distanceMeters) / GAMEPLAY.levelEveryMeters);
}

export function getDoubleObstacleChance(distanceMeters) {
  return 0.25 + 0.25 * getProgress(distanceMeters);
}

export function getWallChance(distanceMeters) {
  if (distanceMeters < GAMEPLAY.wallUnlockMeters) return 0;
  return Math.min(0.22, 0.08 + (distanceMeters - GAMEPLAY.wallUnlockMeters) / 10000);
}

export function pickObstacleKey(distanceMeters, random) {
  const unlocked = Object.entries(OBSTACLES).filter(([, type]) => distanceMeters >= type.unlockMeters);
  const totalWeight = unlocked.reduce((sum, [, type]) => sum + type.weight, 0);
  let threshold = random * totalWeight;
  for (const [key, type] of unlocked) {
    threshold -= type.weight;
    if (threshold < 0) return key;
  }
  return unlocked[unlocked.length - 1][0];
}
