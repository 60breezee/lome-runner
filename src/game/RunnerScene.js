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
  ...Object.fromEntries(Object.entries(OBSTACLES).map(([key, { asset }]) => [key, asset])),
};

const ROAD_DEPTH_SPAN = GAME_HEIGHT - PERSPECTIVE.horizonY;
const WALL_KEYS = ['worksite', 'gate'];

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
    this.drawLaneDashes();
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
    this.dashOffset = 0;
  }

  showPreview() {
    this.clearCountdown();
    this.tweens.killAll();
    this.releaseAllActiveObjects();
    this.resetDecorationsToInitial();
    this.resetRunState();
    this.drawLaneDashes(0);
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
    this.drawLaneDashes(0);
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

    this.drawLaneDashes(depthDelta);
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
    const graphics = this.add.graphics().setDepth(-10);
    graphics.fillStyle(COLORS.sky, 1).fillRect(0, 0, GAME_WIDTH, 250);
    graphics.fillStyle(COLORS.mist, 1).fillRect(0, 190, GAME_WIDTH, 60);
    graphics.fillStyle(COLORS.sun, 1).fillCircle(310, 170, 24);

    const cloudSpecs = [
      { x: 80, y: 90, width: 96, height: 24, speed: 6 },
      { x: 260, y: 60, width: 80, height: 20, speed: 4.5 },
    ];
    cloudSpecs.forEach(({ x, y, width, height, speed }) => {
      const cloudGraphic = this.add.graphics().setDepth(-9);
      cloudGraphic.fillStyle(0xffffff, 0.85);
      cloudGraphic.fillEllipse(0, 0, width, height);
      cloudGraphic.setPosition(x, y);
      this.clouds.push({ graphic: cloudGraphic, x, y, rx: width / 2, speed });
    });

    const buildings = [
      [0, 40, 50, 0x9fb4c0],
      [36, 34, 80, 0xe8c86a],
      [70, 44, 60, COLORS.laterite],
      [114, 30, 96, 0x8e9aa3],
      [144, 36, 46, 0xe8c86a],
      [220, 30, 70, COLORS.laterite],
      [250, 40, 92, 0x9fb4c0],
      [290, 36, 56, 0xe8c86a],
      [326, 64, 70, 0x8e9aa3],
    ];
    buildings.forEach(([x, width, height, color]) => {
      graphics.fillStyle(color, 1).fillRect(x, 250 - height, width, height);
    });

    graphics.fillStyle(COLORS.laterite, 1);
    graphics.fillPoints(
      [
        { x: 0, y: 250 },
        { x: 175, y: 250 },
        { x: -10, y: 844 },
        { x: 0, y: 844 },
      ],
      true,
    );
    graphics.fillPoints(
      [
        { x: 215, y: 250 },
        { x: 390, y: 250 },
        { x: 390, y: 844 },
        { x: 400, y: 844 },
      ],
      true,
    );
    graphics.fillStyle(COLORS.asphalt, 1);
    graphics.fillPoints(
      [
        { x: 175, y: 250 },
        { x: 215, y: 250 },
        { x: 400, y: 844 },
        { x: -10, y: 844 },
      ],
      true,
    );

    graphics.lineStyle(4, COLORS.curb, 1);
    graphics.lineBetween(175, 250, -10, 844);
    graphics.lineBetween(215, 250, 400, 844);
  }

  drawLaneDashes(depthOffset = 0) {
    if (this.laneDashes) this.laneDashes.clear();
    else this.laneDashes = this.add.graphics().setDepth(-5);
    let index = 0;
    let depth = 0.04 + (this.dashOffset ?? 0);
    this.dashOffset = ((this.dashOffset ?? 0) + depthOffset) % 0.2;
    while (depth < 1) {
      const nextDepth = Math.min(depth * 1.3, 1);
      if (index % 2 === 0) {
        [-0.5, 0.5].forEach((lane) => {
          const start = getPerspective(depth, lane);
          const end = getPerspective(nextDepth, lane);
          const halfWidth = 0.5 + 2.5 * depth;
          this.laneDashes.fillStyle(COLORS.cream, 0.9);
          this.laneDashes.fillPoints(
            [
              { x: start.x - halfWidth, y: start.y },
              { x: start.x + halfWidth, y: start.y },
              { x: end.x + halfWidth, y: end.y },
              { x: end.x - halfWidth, y: end.y },
            ],
            true,
          );
        });
      }
      depth = nextDepth;
      index += 1;
    }
  }

  drawDecorations() {
    STATIC_OBJECTS.houses.forEach((depth) => {
      [-1, 1].forEach((side) => {
        const point = getSideDecorationPosition(depth, side, 110.5, getPerspective(depth).scale);
        const sprite = this.add
          .image(point.x, point.y, 'house')
          .setOrigin(0.5, 1)
          .setScale(point.scale)
          .setDepth(depth);
        this.movingObjects.push({
          sprite,
          key: 'house',
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
      object.key === 'house' || object.key === 'palm'
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
