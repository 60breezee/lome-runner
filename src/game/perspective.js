import { PERSPECTIVE } from './config.js';

export function getPerspective(depth, lane = 0) {
  const { horizonY, vanishingPointX, laneSpacingAtHorizon, laneSpacingGrowth, referenceLaneSpacing } = PERSPECTIVE;
  const spacing = laneSpacingAtHorizon + laneSpacingGrowth * depth;

  return {
    x: vanishingPointX + lane * spacing,
    y: horizonY + (PERSPECTIVE.roadBaseY - horizonY) * depth,
    spacing,
    scale: spacing / referenceLaneSpacing,
  };
}

export function getSideDecorationPosition(depth, side, offset, scale) {
  const edge = 20 + 185 * depth;
  const point = getPerspective(depth);

  return {
    x: point.x + side * (edge + offset * scale),
    y: point.y,
    scale,
  };
}
