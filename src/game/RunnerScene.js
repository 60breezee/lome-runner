import Phaser from 'phaser';
import {
  COLORS,
  GAME_HEIGHT,
  GAME_WIDTH,
  GAMEPLAY,
  MOVEMENT,
  OBSTACLES,
  PERSPECTIVE,
  STATIC_OBJECTS,
} from './config.js';
import {
  getDoubleObstacleChance,
  getLevelForDistance,
  getRowGapForDistance,
  getSpeedForDistance,
  getWallChance,
  pickObstacleKey,
} from './difficulty.js';
import { getPerspective, getSideDecorationPosition } from './perspective.js';

const ASSETS = {
  runner: '/assets/runner.svg',
  coin: '/assets/piece.svg',
  palm: '/assets/palmier.svg',
  house: '/assets/maison.svg',
  shop: '/assets/boutique.svg',
  ...Object.fromEntries(Object.entries(OBSTACLES).map(([key, { asset }]) => [key, asset])),
};

const ROAD_DEPTH_SPAN = GAME_HEIGHT - PERSPECTIVE.horizonY;
const WALL_KEYS = ['worksite', 'gate'];
// Multiple of every road pattern period (dashes, curbs, joints, decals) so the wrap-around is invisible.
const ROAD_PATTERN_PERIOD = 1.2;

const depthToY = (depth) => PERSPECTIVE.horizonY + ROAD_DEPTH_SPAN * depth;
const getRoadHalfWidth = (depth) => getPerspective(depth).spacing * 1.5;
const getCurbOuter = (depth) => getRoadHalfWidth(depth) + 1.5 + 9 * depth;
const getSidewalkOuter = (depth) => getCurbOuter(depth) + 3 + 34 * depth;

// Calls back for each segment of a pattern repeating every `period` in depth, shifted by `scroll`.
// The index parity stays attached to the same segment while it scrolls, so alternating colours don't flicker.
function forEachScrolledSegment(scroll, period, length, callback) {
  const offset = scroll % (period * 2);
  let index = 0;
  for (let start = offset - period * 2; start < 1; start += period, index += 1) {
    const end = start + length;
    if (end < 0 || (length === 0 && start < 0)) continue;
    callback(Math.max(0, start), Math.min(1, end), index);
  }
}

export default class RunnerScene extends Phaser.Scene {
  constructor() {
    super('RunnerScene');
  }

  preload() {
    Object.entries(ASSETS).forEach(([key, path]) => this.load.svg(key, path));
  }

  create() {
    this.movingObjects = [];
    this.previewObjects = [];
    this.clouds = [];
    this.obstaclePool = [];
    this.coinPool = [];
    this.activeObstacles = [];
    this.activeCoins = [];
    this.resetRunState();

    this.drawBackground();
    this.createRoadDecals();
    this.drawRoadScroll();
    this.drawDecorations();
    this.createPools();
    this.drawPreviewObjects();
    this.drawRunner();
    this.setupControls();
    this.setupVisibilityPause();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanupListeners());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanupListeners());
  }

  resetRunState() {
    this.playerLane = 0;
    this.laneChangeInProgress = false;
    this.pendingLaneChange = 0;
    this.laneBankAngle = 0;
    this.action = 'run';
    this.actionElapsedMs = 0;
    this.landingMs = 0;
    this.strideTime = 0;
    this.pointerStart = null;
    this.speedPxPerSecond = GAMEPLAY.startSpeedPxPerSecond;
    this.distanceMeters = 0;
    this.coinsCollected = 0;
    this.elapsedMs = 0;
    this.depthSinceRow = 0;
    this.nextRowGap = getRowGapForDistance(0);
    this.level = 1;
    this.isGameOver = false;
    this.isRunning = false;
    this.isPaused = false;
    this.roadScroll = 0;
  }

  showPreview() {
    this.clearCountdown();
    this.tweens.killAll();
    this.releaseAllActiveObjects();
    this.resetDecorationsToInitial();
    this.resetRunState();
    this.drawRoadScroll(0);
    this.setPreviewObjectsVisible(true);
    this.resetRunnerPose();
  }

  startNewRun() {
    this.clearCountdown();
    this.tweens.killAll();
    this.releaseAllActiveObjects();
    this.resetDecorationsToInitial();
    this.setPreviewObjectsVisible(false);
    this.resetRunState();
    this.drawRoadScroll(0);
    this.resetRunnerPose();

    this.events.emit('score-updated', { distance: 0, coins: 0 });
    this.startCountdown();
  }

  pauseRun() {
    if (this.isGameOver || this.isPaused) return;
    this.isPaused = true;
    if (this.countdownTimer) this.countdownTimer.paused = true;
    this.tweens.pauseAll();
  }

  resumeRun() {
    if (this.isGameOver || !this.isPaused) return;
    this.isPaused = false;
    if (this.countdownTimer) this.countdownTimer.paused = false;
    this.tweens.resumeAll();
  }

  clearCountdown() {
    if (this.countdownTimer) {
      this.countdownTimer.remove(false);
      this.countdownTimer = null;
    }
    this.events.emit('countdown', 0);
  }

  startCountdown() {
    let remaining = 3;
    this.events.emit('countdown', remaining);
    this.countdownTimer = this.time.addEvent({
      delay: 750,
      repeat: 2,
      callback: () => {
        remaining -= 1;
        if (remaining > 0) {
          this.events.emit('countdown', remaining);
        } else {
          this.countdownTimer = null;
          this.isRunning = true;
          this.spawnRow();
          this.events.emit('countdown', 0);
        }
      },
    });
  }

  update(_time, rawDelta) {
    // Long frames would move obstacles past the collision window in a single step.
    const delta = Math.min(rawDelta, GAMEPLAY.maxFrameDeltaMs);
    this.updateClouds(delta);

    if (this.isGameOver || !this.isRunning || this.isPaused) return;

    this.elapsedMs += delta;
    this.speedPxPerSecond = getSpeedForDistance(this.distanceMeters);
    this.distanceMeters += (this.speedPxPerSecond * delta) / 1000 / GAMEPLAY.distancePixelsPerMeter;

    const depthDelta = (this.speedPxPerSecond * delta) / 1000 / ROAD_DEPTH_SPAN;
    this.movingObjects.forEach((object) => {
      object.depth += depthDelta;
      if (object.depth > 1.05) object.depth = 0.02;
      this.positionWorldObject(object);
    });

    this.activeObstacles.slice().forEach((object) => this.advanceActiveObject(object, depthDelta));
    this.activeCoins.slice().forEach((object) => this.advanceActiveObject(object, depthDelta));
    this.updateRunnerAction(delta);
    this.animateRunner(delta);
    this.checkCollisions();
    if (this.isGameOver) return;

    this.depthSinceRow += depthDelta;
    if (this.depthSinceRow >= this.nextRowGap) {
      this.depthSinceRow = 0;
      this.spawnRow();
    }

    this.drawRoadScroll(depthDelta);
    this.updateLevel();
    this.events.emit('score-updated', {
      distance: Math.floor(this.distanceMeters),
      coins: this.coinsCollected,
    });
  }

  updateLevel() {
    const level = getLevelForDistance(this.distanceMeters);
    if (level <= this.level) return;
    this.level = level;
    this.events.emit('level-up', level);
  }

  updateClouds(delta) {
    if (this.isPaused) return;
    this.clouds.forEach((cloud) => {
      cloud.x += cloud.speed * (delta / 1000);
      if (cloud.x - cloud.rx > GAME_WIDTH + 20) {
        cloud.x = -cloud.rx - 20;
      }
      cloud.graphic.setPosition(cloud.x, cloud.y);
    });
  }

  canControl() {
    return this.isRunning && !this.isPaused && !this.isGameOver;
  }

  requestJump() {
    if (!this.canControl() || this.action === 'jump') return;
    this.action = 'jump';
    this.actionElapsedMs = 0;
    this.events.emit('jump');
  }

  requestSlide() {
    // Sliding mid-jump drops the runner straight to the ground.
    if (!this.canControl() || this.action === 'slide') return;
    this.action = 'slide';
    this.actionElapsedMs = 0;
    this.landingMs = 0;
    this.events.emit('slide');
  }

  updateRunnerAction(delta) {
    if (this.landingMs > 0) this.landingMs = Math.max(0, this.landingMs - delta);
    if (this.action === 'run') return;

    this.actionElapsedMs += delta;
    const duration = this.action === 'jump' ? MOVEMENT.jumpDurationMs : MOVEMENT.slideDurationMs;
    if (this.actionElapsedMs < duration) return;

    if (this.action === 'jump') this.landingMs = MOVEMENT.landingSquashMs;
    this.action = 'run';
    this.actionElapsedMs = 0;
  }

  getJumpRatio() {
    if (this.action !== 'jump') return 0;
    const t = Math.min(1, this.actionElapsedMs / MOVEMENT.jumpDurationMs);
    return 4 * t * (1 - t);
  }

  isAvoiding(avoid) {
    if (avoid === 'jump') return this.getJumpRatio() >= MOVEMENT.jumpClearRatio;
    if (avoid === 'slide') return this.action === 'slide';
    return false;
  }

  animateRunner(delta) {
    if (!this.runner) return;
    const base = getPerspective(GAMEPLAY.collisionDepth, this.playerLane);
    const jumpRatio = this.getJumpRatio();
    let offsetY = 0;
    let scaleX = MOVEMENT.runnerScale;
    let scaleY = MOVEMENT.runnerScale;
    let rotation = this.laneBankAngle;

    if (this.action === 'jump') {
      offsetY = jumpRatio * MOVEMENT.jumpHeightPx;
      scaleX *= 0.94;
      scaleY *= 1.04;
    } else if (this.action === 'slide') {
      const t = this.actionElapsedMs / MOVEMENT.slideDurationMs;
      const blend = Math.min(1, Math.min(t, 1 - t) / 0.15);
      scaleY *= 1 - (1 - MOVEMENT.slideScaleY) * blend;
      scaleX *= 1 + 0.12 * blend;
    } else {
      // The sprite's legs and arms are asymmetric, so mirroring it on each step reads as a stride.
      const speedFactor = this.speedPxPerSecond / GAMEPLAY.startSpeedPxPerSecond;
      this.strideTime += delta * Math.min(1.6, speedFactor);
      const phase = this.strideTime * MOVEMENT.strideRadPerMs;
      offsetY = Math.abs(Math.sin(phase)) * 5;
      rotation += Math.sin(phase) * 0.035;
      this.runner.setFlipX(Math.sin(phase) < 0);
      if (this.landingMs > 0) {
        const squash = this.landingMs / MOVEMENT.landingSquashMs;
        scaleY *= 1 - 0.18 * squash;
        scaleX *= 1 + 0.1 * squash;
      }
    }

    if (!this.laneChangeInProgress) this.runner.x = base.x;
    this.runner.y = base.y - offsetY;
    this.runner.setScale(scaleX, scaleY);
    this.runner.setRotation(rotation);
    this.runnerShadow
      .setPosition(this.runner.x, base.y - 2)
      .setScale(1 - 0.45 * jumpRatio)
      .setAlpha(0.3 * (1 - 0.4 * jumpRatio));
  }

  resetRunnerPose() {
    if (!this.runner) return;
    const point = getPerspective(GAMEPLAY.collisionDepth, 0);
    this.runner
      .setPosition(point.x, point.y)
      .setScale(MOVEMENT.runnerScale)
      .setRotation(0)
      .setFlipX(false)
      .setDepth(GAMEPLAY.collisionDepth);
    this.runnerShadow.setPosition(point.x, point.y - 2).setScale(1).setAlpha(0.3);
  }

  createPools() {
    Object.keys(OBSTACLES).forEach((key) => {
      for (let index = 0; index < GAMEPLAY.poolSizes.obstaclesPerType; index += 1) {
        const sprite = this.add.image(0, 0, key).setOrigin(0.5, 1).setVisible(false);
        this.obstaclePool.push({ sprite, key, active: false, cleared: false, depth: 0, lane: 0 });
      }
    });
    for (let index = 0; index < GAMEPLAY.poolSizes.coins; index += 1) {
      const sprite = this.add.image(0, 0, 'coin').setOrigin(0.5, 1).setVisible(false);
      this.coinPool.push({ sprite, key: 'coin', active: false, depth: 0, lane: 0 });
    }
  }

  spawnRow() {
    const distance = this.distanceMeters;

    if (Math.random() < getWallChance(distance)) {
      const key = Phaser.Utils.Array.GetRandom(WALL_KEYS);
      [-1, 0, 1].forEach((lane) => this.activateObstacle(lane, key));
      this.nextRowGap = getRowGapForDistance(distance) + GAMEPLAY.wallExtraGap;
      return;
    }

    this.nextRowGap = getRowGapForDistance(distance);
    const lanes = Phaser.Utils.Array.Shuffle([-1, 0, 1]);
    const obstacleCount = Math.random() < getDoubleObstacleChance(distance) ? 2 : 1;
    lanes
      .slice(0, obstacleCount)
      .forEach((lane) => this.activateObstacle(lane, pickObstacleKey(distance, Math.random())));

    const coinLane = lanes[obstacleCount];
    if (Math.random() < 0.75) this.spawnCoinSequence(coinLane, 3 + Math.floor(Math.random() * 3));
  }

  activateObstacle(lane, key) {
    const object = this.obstaclePool.find((candidate) => !candidate.active && candidate.key === key);
    if (!object) return;
    object.active = true;
    object.cleared = false;
    object.depth = 0.02;
    object.lane = lane;
    object.sprite.setVisible(true);
    this.positionWorldObject(object);
    this.activeObstacles.push(object);
  }

  spawnCoinSequence(lane, count) {
    for (let index = 0; index < count; index += 1) {
      const object = this.coinPool.find((candidate) => !candidate.active);
      if (!object) return;
      object.active = true;
      object.depth = 0.02 + index * 0.055;
      object.lane = lane;
      object.sprite.setVisible(true);
      this.positionWorldObject(object);
      this.activeCoins.push(object);
    }
  }

  advanceActiveObject(object, depthDelta) {
    object.depth += depthDelta;
    if (object.depth > 1.05) this.releaseObject(object);
    else this.positionWorldObject(object);
  }

  releaseObject(object) {
    object.active = false;
    object.sprite.setVisible(false);
    const collection = object.key === 'coin' ? this.activeCoins : this.activeObstacles;
    const index = collection.indexOf(object);
    if (index !== -1) collection.splice(index, 1);
  }

  releaseAllActiveObjects() {
    this.activeObstacles.slice().forEach((object) => this.releaseObject(object));
    this.activeCoins.slice().forEach((object) => this.releaseObject(object));
  }

  checkCollisions() {
    const playerDepth = GAMEPLAY.collisionDepth;
    for (const object of this.activeObstacles) {
      if (object.cleared || object.lane !== this.playerLane) continue;
      if (Math.abs(object.depth - playerDepth) > GAMEPLAY.collisionWindow) continue;
      // Clearing at first contact counts for the whole crossing, so a jump that lands mid-obstacle still passes.
      const { avoid } = OBSTACLES[object.key];
      if (this.isAvoiding(avoid)) {
        object.cleared = true;
        continue;
      }
      // A slightly late jump or slide is forgiven until the obstacle reaches the runner's feet.
      if (avoid !== 'lane' && object.depth < playerDepth) continue;
      this.endGame();
      return;
    }

    this.activeCoins.slice().forEach((object) => {
      if (object.lane === this.playerLane && Math.abs(object.depth - playerDepth) <= GAMEPLAY.collisionWindow) {
        this.coinsCollected += 1;
        this.spawnCoinBurst(object.sprite.x, object.sprite.y - 26);
        this.releaseObject(object);
        this.events.emit('coin-collected', this.coinsCollected);
      }
    });
  }

  spawnCoinBurst(x, y) {
    const ring = this.add.circle(x, y, 10, COLORS.ochre, 0.85).setDepth(0.96);
    this.tweens.add({
      targets: ring,
      y: y - 28,
      scale: 2.1,
      alpha: 0,
      duration: 240,
      ease: 'Quad.Out',
      onComplete: () => ring.destroy(),
    });
  }

  endGame() {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.isRunning = false;
    this.runner?.setRotation(0);
    this.cameras.main.shake(180, 0.012);
    this.cameras.main.flash(140, 179, 38, 30, false);
    this.events.emit('game-over', {
      distance: Math.floor(this.distanceMeters),
      coins: this.coinsCollected,
    });
  }

  setupControls() {
    const bindKeys = (keys, handler) => {
      keys.forEach((key) => {
        this.input.keyboard.on(`keydown-${key}`, (event) => {
          if (!event.repeat) handler();
        });
      });
    };
    bindKeys(['LEFT', 'Q', 'A'], () => this.requestLaneChange(-1));
    bindKeys(['RIGHT', 'D'], () => this.requestLaneChange(1));
    bindKeys(['UP', 'W', 'Z', 'SPACE'], () => this.requestJump());
    bindKeys(['DOWN', 'S'], () => this.requestSlide());

    this.input.on('pointerdown', (pointer) => {
      this.pointerStart = this.canControl() ? { x: pointer.x, y: pointer.y, handled: false } : null;
    });
    // Swipes trigger as soon as the threshold is crossed instead of waiting for the finger to lift.
    this.input.on('pointermove', (pointer) => {
      const start = this.pointerStart;
      if (!start || start.handled || !pointer.isDown) return;
      const deltaX = pointer.x - start.x;
      const deltaY = pointer.y - start.y;
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < MOVEMENT.swipeThresholdPx) return;
      start.handled = true;
      this.handleSwipe(deltaX, deltaY);
    });
    this.input.on('pointerup', (pointer) => {
      const start = this.pointerStart;
      this.pointerStart = null;
      if (!start || start.handled || !this.canControl()) return;
      const deltaX = pointer.x - start.x;
      const deltaY = pointer.y - start.y;
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= MOVEMENT.swipeThresholdPx) {
        this.handleSwipe(deltaX, deltaY);
      } else {
        this.requestLaneChange(pointer.x < GAME_WIDTH / 2 ? -1 : 1);
      }
    });
  }

  handleSwipe(deltaX, deltaY) {
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      if (deltaY < 0) this.requestJump();
      else this.requestSlide();
    } else {
      this.requestLaneChange(Math.sign(deltaX));
    }
  }

  setupVisibilityPause() {
    this.visibilityHandler = () => {
      if (document.hidden && (this.isRunning || this.countdownTimer) && !this.isPaused && !this.isGameOver) {
        this.events.emit('auto-pause');
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  cleanupListeners() {
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  requestLaneChange(direction) {
    if (!direction || !this.canControl()) return;
    if (this.laneChangeInProgress) {
      this.pendingLaneChange = direction;
      return;
    }
    this.startLaneChange(direction);
  }

  startLaneChange(direction) {
    const nextLane = Phaser.Math.Clamp(this.playerLane + direction, -1, 1);
    if (nextLane === this.playerLane) return;

    this.playerLane = nextLane;
    this.laneChangeInProgress = true;
    this.laneBankAngle = direction * 0.11;
    const targetX = getPerspective(GAMEPLAY.collisionDepth, this.playerLane).x;
    this.tweens.add({
      targets: this.runner,
      x: targetX,
      duration: MOVEMENT.laneChangeDurationMs,
      ease: 'Sine.Out',
      onComplete: () => {
        this.laneChangeInProgress = false;
        this.laneBankAngle = 0;
        if (this.pendingLaneChange) {
          const queuedDirection = this.pendingLaneChange;
          this.pendingLaneChange = 0;
          this.startLaneChange(queuedDirection);
        }
      },
    });
  }

  drawBackground() {
    const { horizonY } = PERSPECTIVE;
    const graphics = this.add.graphics().setDepth(-10);
    graphics.fillGradientStyle(0x4fa9d9, 0x4fa9d9, 0xbfe6f2, 0xbfe6f2, 1);
    graphics.fillRect(0, 0, GAME_WIDTH, horizonY);
    graphics.fillStyle(COLORS.sun, 0.12).fillCircle(310, 170, 64);
    graphics.fillStyle(COLORS.sun, 0.22).fillCircle(310, 170, 40);
    graphics.fillStyle(COLORS.sun, 1).fillCircle(310, 170, 24);

    [
      { x: 80, y: 90, width: 96, height: 24, speed: 6 },
      { x: 260, y: 60, width: 80, height: 20, speed: 4.5 },
      { x: 180, y: 128, width: 58, height: 14, speed: 3 },
    ].forEach(({ x, y, width, height, speed }) => {
      const cloudGraphic = this.add.graphics().setDepth(-9);
      cloudGraphic.fillStyle(0xffffff, 0.88);
      cloudGraphic.fillEllipse(0, 0, width, height);
      cloudGraphic.fillEllipse(-width * 0.18, -height * 0.45, width * 0.45, height * 1.1);
      cloudGraphic.fillEllipse(width * 0.15, -height * 0.55, width * 0.38, height * 1.2);
      cloudGraphic.setPosition(x, y);
      this.clouds.push({ graphic: cloudGraphic, x, y, rx: width / 2, speed });
    });

    this.drawSkyline(graphics);
    this.drawGround(graphics);
    this.drawHorizonPalms();

    const mist = this.add.graphics().setDepth(-4);
    mist.fillGradientStyle(COLORS.mist, COLORS.mist, COLORS.mist, COLORS.mist, 0.55, 0.55, 0, 0);
    mist.fillRect(0, horizonY, GAME_WIDTH, 80);
  }

  drawSkyline(graphics) {
    const base = PERSPECTIVE.horizonY;
    const buildings = [
      [0, 40, 50, 0x9fb4c0],
      [36, 34, 80, 0xe8c86a],
      [70, 44, 60, COLORS.laterite],
      [144, 36, 46, 0xe8c86a],
      [220, 30, 70, COLORS.laterite],
      [250, 40, 92, 0x9fb4c0],
      [290, 36, 56, 0xe8c86a],
      [326, 64, 70, 0x8e9aa3],
    ];
    buildings.forEach(([x, width, height, color]) => {
      graphics.fillStyle(color, 1).fillRect(x, base - height, width, height);
      graphics.fillStyle(0x000000, 0.12).fillRect(x + width - 6, base - height, 6, height);
      graphics.fillStyle(0x26323c, 0.35);
      for (let row = base - height + 8; row < base - 10; row += 12) {
        for (let column = x + 5; column < x + width - 9; column += 9) {
          graphics.fillRect(column, row, 4, 5);
        }
      }
    });

    // Hôtel du 2 Février, the tower that dominates the Lomé skyline.
    graphics.fillStyle(0x8e9aa3, 1).fillRect(118, base - 148, 28, 148);
    graphics.fillStyle(0x6e7a83, 1).fillRect(140, base - 148, 6, 148);
    graphics.fillStyle(0xb8c4cc, 1).fillRect(113, base - 156, 38, 10);
    graphics.lineStyle(2, 0x6e7a83, 1).lineBetween(132, base - 156, 132, base - 176);
    graphics.fillStyle(0xd6eef4, 0.5);
    for (let row = base - 140; row < base - 8; row += 8) {
      graphics.fillRect(121, row, 17, 3);
    }

    graphics.fillStyle(COLORS.mist, 0.55).fillRect(0, base - 40, GAME_WIDTH, 40);
  }

  drawGround(graphics) {
    const { horizonY, vanishingPointX } = PERSPECTIVE;
    graphics.fillGradientStyle(0xc2714a, 0xc2714a, COLORS.laterite, COLORS.laterite, 1);
    graphics.fillRect(0, horizonY, GAME_WIDTH, GAME_HEIGHT - horizonY);

    [-1, 1].forEach((side) => {
      this.fillRoadBand(graphics, 0, 1, side, getRoadHalfWidth, getSidewalkOuter, COLORS.sidewalk, 1);
    });

    const strips = 16;
    for (let index = 0; index < strips; index += 1) {
      const startDepth = index / strips;
      const endDepth = (index + 1) / strips;
      const blend = Math.sqrt((startDepth + endDepth) / 2);
      const color = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(COLORS.asphaltFar),
        Phaser.Display.Color.ValueToColor(COLORS.asphalt),
        100,
        blend * 100,
      );
      graphics.fillStyle(Phaser.Display.Color.GetColor(color.r, color.g, color.b), 1);
      graphics.fillPoints(
        [
          { x: vanishingPointX - getRoadHalfWidth(startDepth), y: depthToY(startDepth) },
          { x: vanishingPointX + getRoadHalfWidth(startDepth), y: depthToY(startDepth) },
          { x: vanishingPointX + getRoadHalfWidth(endDepth) + 1, y: depthToY(endDepth) + 1 },
          { x: vanishingPointX - getRoadHalfWidth(endDepth) - 1, y: depthToY(endDepth) + 1 },
        ],
        true,
      );
    }

    [-1, 1].forEach((side) => {
      this.fillRoadBand(
        graphics,
        0.02,
        1,
        side,
        (depth) => getPerspective(depth).spacing * 1.38,
        (depth) => getPerspective(depth).spacing * 1.38 + 0.6 + 2.4 * depth,
        COLORS.cream,
        0.85,
      );
    });
  }

  drawHorizonPalms() {
    [
      [14, 0.42],
      [52, 0.32],
      [96, 0.26],
      [292, 0.26],
      [340, 0.34],
      [380, 0.44],
    ].forEach(([x, scale]) => {
      this.add
        .image(x, PERSPECTIVE.horizonY + 4, 'palm')
        .setOrigin(0.5, 1)
        .setScale(scale)
        .setTint(0x8fae9c)
        .setAlpha(0.85)
        .setDepth(-9);
    });
  }

  // Fills the band between two horizontal offsets from the road centre, from startDepth to endDepth.
  fillRoadBand(graphics, startDepth, endDepth, side, innerOffset, outerOffset, color, alpha) {
    const from = Math.max(0, startDepth);
    const to = Math.min(1, endDepth);
    if (to <= from) return;
    const centerX = PERSPECTIVE.vanishingPointX;
    graphics.fillStyle(color, alpha);
    graphics.fillPoints(
      [
        { x: centerX + side * innerOffset(from), y: depthToY(from) },
        { x: centerX + side * outerOffset(from), y: depthToY(from) },
        { x: centerX + side * outerOffset(to), y: depthToY(to) },
        { x: centerX + side * innerOffset(to), y: depthToY(to) },
      ],
      true,
    );
  }

  createRoadDecals() {
    this.roadDecals = [
      { phase: 0.05, lane: -0.85, type: 'patch', width: 0.5, length: 0.05 },
      { phase: 0.21, lane: 0.3, type: 'manhole' },
      { phase: 0.34, lane: 1.05, type: 'crack' },
      { phase: 0.47, lane: -0.25, type: 'stain' },
      { phase: 0.63, lane: 0.8, type: 'patch', width: 0.4, length: 0.07 },
      { phase: 0.78, lane: -1.05, type: 'crack' },
      { phase: 0.9, lane: 0.05, type: 'stain' },
      { phase: 1.02, lane: -0.7, type: 'manhole' },
      { phase: 1.12, lane: 0.55, type: 'crack' },
    ];
  }

  // Everything painted on the road scrolls at the obstacles' speed so the ground never seems to slide.
  drawRoadScroll(depthDelta = 0) {
    if (!this.roadLayer) this.roadLayer = this.add.graphics().setDepth(-5);
    this.roadScroll = (this.roadScroll + depthDelta) % ROAD_PATTERN_PERIOD;
    const graphics = this.roadLayer.clear();

    this.drawRoadDecals(graphics);

    forEachScrolledSegment(this.roadScroll, 0.12, 0.06, (from, to) => {
      [-0.5, 0.5].forEach((lane) => {
        const alpha = 0.9 * Phaser.Math.Clamp((from - 0.02) * 6, 0, 1);
        const halfWidth = (depth) => 0.6 + 2.6 * depth;
        graphics.fillStyle(COLORS.cream, alpha);
        graphics.fillPoints(
          [
            { x: getPerspective(from, lane).x - halfWidth(from), y: depthToY(from) },
            { x: getPerspective(from, lane).x + halfWidth(from), y: depthToY(from) },
            { x: getPerspective(to, lane).x + halfWidth(to), y: depthToY(to) },
            { x: getPerspective(to, lane).x - halfWidth(to), y: depthToY(to) },
          ],
          true,
        );
      });
    });

    forEachScrolledSegment(this.roadScroll, 0.06, 0.06, (from, to, index) => {
      const color = index % 2 === 0 ? COLORS.brick : COLORS.cream;
      [-1, 1].forEach((side) => {
        this.fillRoadBand(graphics, from, to, side, getRoadHalfWidth, getCurbOuter, color, 1);
      });
    });

    forEachScrolledSegment(this.roadScroll, 0.08, 0, (from) => {
      const y = depthToY(from);
      graphics.lineStyle(0.8 + 1.4 * from, 0x9c8f78, 0.8);
      [-1, 1].forEach((side) => {
        graphics.lineBetween(
          PERSPECTIVE.vanishingPointX + side * getCurbOuter(from),
          y,
          PERSPECTIVE.vanishingPointX + side * getSidewalkOuter(from),
          y,
        );
      });
    });
  }

  drawRoadDecals(graphics) {
    this.roadDecals.forEach((decal) => {
      const depth = ((decal.phase + this.roadScroll) % ROAD_PATTERN_PERIOD) - 0.1;
      if (depth < 0.04 || depth > 1.05) return;
      const point = getPerspective(depth, decal.lane);
      const s = point.scale;

      if (decal.type === 'patch') {
        const left = (d) => getPerspective(d, decal.lane - decal.width / 2).x;
        const right = (d) => getPerspective(d, decal.lane + decal.width / 2).x;
        const end = depth + decal.length;
        graphics.fillStyle(COLORS.asphaltPatch, 0.5);
        graphics.fillPoints(
          [
            { x: left(depth), y: depthToY(depth) },
            { x: right(depth), y: depthToY(depth) },
            { x: right(end), y: depthToY(end) },
            { x: left(end), y: depthToY(end) },
          ],
          true,
        );
      } else if (decal.type === 'manhole') {
        graphics.fillStyle(0x2a2927, 1).fillEllipse(point.x, point.y, 36 * s, 13 * s);
        graphics.lineStyle(Math.max(1, 2 * s), 0x5a5751, 1).strokeEllipse(point.x, point.y, 36 * s, 13 * s);
        graphics.lineStyle(Math.max(0.5, 1.2 * s), 0x4a4843, 1);
        graphics.lineBetween(point.x - 12 * s, point.y, point.x + 12 * s, point.y);
      } else if (decal.type === 'stain') {
        graphics.fillStyle(0x1f1e1c, 0.35).fillEllipse(point.x, point.y, 46 * s, 11 * s);
        graphics.fillStyle(0x1f1e1c, 0.25).fillEllipse(point.x + 14 * s, point.y + 3 * s, 22 * s, 6 * s);
      } else {
        graphics.lineStyle(Math.max(0.8, 2 * s), 0x262523, 0.9);
        graphics.strokePoints(
          [
            { x: point.x - 18 * s, y: point.y - 8 * s },
            { x: point.x - 6 * s, y: point.y - 2 * s },
            { x: point.x - 9 * s, y: point.y + 5 * s },
            { x: point.x + 8 * s, y: point.y + 9 * s },
            { x: point.x + 20 * s, y: point.y + 16 * s },
          ],
          false,
        );
      }
    });
  }

  drawDecorations() {
    STATIC_OBJECTS.houses.forEach((depth, index) => {
      [-1, 1].forEach((side) => {
        const key = (index + (side > 0 ? 1 : 0)) % 2 === 0 ? 'house' : 'shop';
        const point = getSideDecorationPosition(depth, side, 110.5, getPerspective(depth).scale);
        const sprite = this.add
          .image(point.x, point.y, key)
          .setOrigin(0.5, 1)
          .setScale(point.scale)
          .setDepth(depth);
        this.movingObjects.push({
          sprite,
          key,
          lane: 0,
          depth,
          initialDepth: depth,
          side,
          offset: 110.5,
          multiplier: 1,
        });
      });
    });

    STATIC_OBJECTS.palms.forEach((depth) => {
      [-1, 1].forEach((side) => {
        const scale = getPerspective(depth).scale;
        const point = getSideDecorationPosition(depth, side, 54.4, scale);
        const sprite = this.add
          .image(point.x, point.y, 'palm')
          .setOrigin(0.5, 1)
          .setScale(scale * 1.1)
          .setDepth(depth);
        this.movingObjects.push({
          sprite,
          key: 'palm',
          lane: 0,
          depth,
          initialDepth: depth,
          side,
          offset: 54.4,
          multiplier: 1.1,
        });
      });
    });
  }

  resetDecorationsToInitial() {
    this.movingObjects.forEach((object) => {
      object.depth = object.initialDepth;
      this.positionWorldObject(object);
    });
  }

  drawPreviewObjects() {
    const objects = [
      ...STATIC_OBJECTS.obstacles,
      ...STATIC_OBJECTS.coins.map((coin) => ({ ...coin, key: 'coin' })),
    ].sort((a, b) => a.depth - b.depth);

    objects.forEach(({ key, lane, depth }) => {
      const point = getPerspective(depth, lane);
      const sprite = this.add
        .image(point.x, point.y, key)
        .setOrigin(0.5, 1)
        .setScale(point.scale)
        .setDepth(depth);
      this.previewObjects.push(sprite);
    });
  }

  setPreviewObjectsVisible(visible) {
    this.previewObjects.forEach((sprite) => sprite.setVisible(visible));
  }

  drawRunner() {
    const point = getPerspective(GAMEPLAY.collisionDepth, 0);
    this.runnerShadow = this.add
      .ellipse(point.x, point.y - 2, 62, 15, 0x000000, 0.3)
      .setDepth(GAMEPLAY.collisionDepth - 0.001);
    this.runner = this.add
      .image(point.x, point.y, 'runner')
      .setOrigin(0.5, 1)
      .setScale(MOVEMENT.runnerScale)
      .setDepth(GAMEPLAY.collisionDepth);
  }

  positionWorldObject(object) {
    const scale = getPerspective(object.depth).scale;
    const point =
      object.side !== undefined
        ? getSideDecorationPosition(object.depth, object.side, object.offset, scale)
        : getPerspective(object.depth, object.lane);

    if (object.key === 'coin') {
      const spinPhase = this.elapsedMs * 0.008 + object.depth * 14;
      const bobOffset = Math.sin(spinPhase) * 3.5 * point.scale;
      const pulseScaleX = point.scale * (0.78 + 0.22 * Math.abs(Math.cos(spinPhase)));
      object.sprite.setPosition(point.x, point.y - bobOffset);
      object.sprite.setScale(pulseScaleX, point.scale);
    } else {
      object.sprite.setPosition(point.x, point.y);
      object.sprite.setScale(object.multiplier ? point.scale * object.multiplier : point.scale);
    }
    object.sprite.setDepth(object.depth);
  }
}
