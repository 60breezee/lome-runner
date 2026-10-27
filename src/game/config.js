export const GAME_WIDTH = 390;
export const GAME_HEIGHT = 844;

export const PERSPECTIVE = {
  horizonY: 250,
  vanishingPointX: 195,
  roadBaseY: 844,
  laneSpacingAtHorizon: 13.3,
  laneSpacingGrowth: 123.3,
  referenceLaneSpacing: 136.7,
};

export const COLORS = {
  asphalt: 0x3b3a38,
  laterite: 0xb5532f,
  cream: 0xf1e3c6,
  sky: 0x7cc8e8,
  mist: 0xd6eef4,
  sun: 0xffe08a,
  curb: 0xd9d2c3,
  ochre: 0xf4b400,
};

export const STATIC_OBJECTS = {
  obstacles: [
    { key: 'zemidjan', lane: 1, depth: 0.3 },
    { key: 'taxi', lane: -1, depth: 0.45 },
    { key: 'market', lane: 0, depth: 0.62 },
    { key: 'worksite', lane: 1, depth: 0.72 },
  ],
  coins: [
    { lane: 0, depth: 0.3 },
    { lane: 0, depth: 0.37 },
    { lane: 0, depth: 0.44 },
    { lane: -1, depth: 0.8 },
  ],
  palms: [0.18, 0.35, 0.55, 0.8],
  houses: [0.28, 0.5, 0.75],
};

// avoid: 'lane' = changer de voie, 'jump' = sauter par-dessus, 'slide' = glisser dessous.
export const OBSTACLES = {
  zemidjan: { asset: '/assets/zemidjan.svg', avoid: 'lane', unlockMeters: 0, weight: 1 },
  taxi: { asset: '/assets/taxi.svg', avoid: 'lane', unlockMeters: 0, weight: 1 },
  market: { asset: '/assets/etal-marche.svg', avoid: 'lane', unlockMeters: 0, weight: 1 },
  worksite: { asset: '/assets/chantier-cones.svg', avoid: 'jump', unlockMeters: 150, weight: 0.9 },
  gate: { asset: '/assets/portique.svg', avoid: 'slide', unlockMeters: 450, weight: 0.9 },
};

export const MOVEMENT = {
  runnerScale: 0.82,
  laneChangeDurationMs: 120,
  swipeThresholdPx: 30,
  strideRadPerMs: 0.0105,
  jumpDurationMs: 640,
  jumpHeightPx: 120,
  jumpClearRatio: 0.35,
  landingSquashMs: 120,
  slideDurationMs: 680,
  slideScaleY: 0.52,
};

export const GAMEPLAY = {
  startSpeedPxPerSecond: 280,
  maxSpeedPxPerSecond: 800,
  speedRampMeters: 2500,
  distancePixelsPerMeter: 10,
  levelEveryMeters: 1000,
  rowGapStart: 0.62,
  rowGapEnd: 0.46,
  wallUnlockMeters: 900,
  wallExtraGap: 0.2,
  collisionDepth: 0.93,
  collisionWindow: 0.055,
  maxFrameDeltaMs: 50,
  poolSizes: { obstaclesPerType: 6, coins: 32 },
};
