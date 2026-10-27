import assert from 'node:assert/strict';
import { GAMEPLAY } from '../src/game/config.js';
import {
  getLevelForDistance,
  getRowGapForDistance,
  getSpeedForDistance,
  getWallChance,
  pickObstacleKey,
} from '../src/game/difficulty.js';
import { getPerspective } from '../src/game/perspective.js';

const horizon = getPerspective(0, 0);
assert.equal(horizon.x, 195);
assert.equal(horizon.y, 250);

const bottom = getPerspective(1, 0);
assert.equal(bottom.y, 844);
assert.ok(bottom.scale > horizon.scale);

const left = getPerspective(0.5, -1);
const right = getPerspective(0.5, 1);
assert.equal(left.x + right.x, 390);
assert.ok(left.x < 195 && right.x > 195);

console.log('Perspective checks passed.');

assert.equal(getSpeedForDistance(0), GAMEPLAY.startSpeedPxPerSecond);
let previousSpeed = 0;
for (let distance = 0; distance <= 20000; distance += 250) {
  const speed = getSpeedForDistance(distance);
  assert.ok(speed > previousSpeed, `speed must increase at ${distance} m`);
  assert.ok(speed < GAMEPLAY.maxSpeedPxPerSecond, `speed must stay below max at ${distance} m`);
  previousSpeed = speed;
}

assert.equal(getRowGapForDistance(0), GAMEPLAY.rowGapStart);
assert.ok(getRowGapForDistance(5000) < getRowGapForDistance(1000));
assert.ok(getRowGapForDistance(100000) >= GAMEPLAY.rowGapEnd);

assert.equal(getLevelForDistance(0), 1);
assert.equal(getLevelForDistance(GAMEPLAY.levelEveryMeters - 1), 1);
assert.equal(getLevelForDistance(GAMEPLAY.levelEveryMeters), 2);

assert.equal(getWallChance(0), 0);
assert.ok(getWallChance(5000) > 0);

for (let step = 0; step < 100; step += 1) {
  const key = pickObstacleKey(0, step / 100);
  assert.ok(['zemidjan', 'taxi', 'market'].includes(key), `${key} must not appear at 0 m`);
}

console.log('Difficulty checks passed.');
