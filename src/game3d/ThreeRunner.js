import * as THREE from 'three';
import { GAMEPLAY, MOVEMENT, OBSTACLES, STATIC_OBJECTS } from '../game/config.js';
import {
  getDoubleObstacleChance,
  getLevelForDistance,
  getRowGapForDistance,
  getSpeedForDistance,
  getWallChance,
  pickObstacleKey,
} from '../game/difficulty.js';
import { coinMaterial, disposeModelCache, farMaterial, flatMaterial, getModelGeometry } from './modelKit.js';
import { createRunnerModel, poseRunner } from './runnerModel.js';
import {
  createCurbTexture,
  createGroundTexture,
  createRoadTexture,
  createSidewalkTexture,
  createSkyTexture,
} from './textures.js';

// Gameplay keeps the 2D "depth" units (0 = horizon, 0.93 = runner) so difficulty and collisions match exactly;
// depth is only converted to world z for rendering.
const DEPTH_TO_Z = 75;
const LANE_WIDTH = 1.9;
const ROAD_WIDTH = LANE_WIDTH * 3 + 0.3;
const CURB_WIDTH = 0.3;
const CURB_HEIGHT = 0.16;
const SIDEWALK_WIDTH = 2.2;
const WORLD_NEAR = 14;
const WORLD_FAR = -115;
const WORLD_LENGTH = WORLD_NEAR - WORLD_FAR;
const WORLD_CENTER_Z = (WORLD_NEAR + WORLD_FAR) / 2;
const ROAD_TILE_LENGTH = 24;
const DECOR_SPACING = 12;
const JUMP_HEIGHT = 2.1;
const HORIZON_COLOR = '#cbeaf3';
const WALL_KEYS = ['worksite', 'gate'];
const COUNTDOWN_STEP_MS = 750;

const depthToZ = (depth) => (depth - GAMEPLAY.collisionDepth) * DEPTH_TO_Z;
const easeOutSine = (t) => Math.sin((t * Math.PI) / 2);

class Emitter {
  constructor() {
    this.listeners = new Map();
  }

  on(event, listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(listener);
  }

  emit(event, ...args) {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }

  clear() {
    this.listeners.clear();
  }
}

export default class ThreeRunner {
  constructor(container) {
    this.container = container;
    this.events = new Emitter();
    this.disposables = [];
    this.obstaclePool = [];
    this.coinPool = [];
    this.activeObstacles = [];
    this.activeCoins = [];
    this.decor = [];
    this.clouds = [];
    this.scrollingTextures = [];
    this.cameraX = 0;
    this.shakeMs = 0;
    this.clockMs = 0;

    this.setupRenderer();
    this.buildWorld();
    this.createPools();
    this.runnerModel = createRunnerModel();
    this.scene.add(this.runnerModel.root);
    this.resetRunState();
    this.setupControls();

    this.lastFrame = performance.now();
    this.frame = this.frame.bind(this);
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.container.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(HORIZON_COLOR, 28, 92);
    this.camera = new THREE.PerspectiveCamera(68, 390 / 844, 0.3, 170);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
  }

  resize() {
    const width = this.container.clientWidth || 390;
    const height = this.container.clientHeight || 844;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  track(resource) {
    this.disposables.push(resource);
    return resource;
  }

  buildWorld() {
    const { scene } = this;
    scene.background = this.track(createSkyTexture(0.38, HORIZON_COLOR));

    scene.add(new THREE.HemisphereLight(0xe6f6ff, 0xb5532f, 2.1));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
    sun.position.set(-5, 14, 5);
    sun.target.position.set(0, 0, -7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 16, bottom: -16, near: 1, far: 45 });
    sun.shadow.bias = -0.0008;
    scene.add(sun, sun.target);

    this.buildGround();
    this.buildSky();
    this.buildDecor();
  }

  addPlane(width, length, material, { x = 0, y = 0, rotateZ = 0 } = {}) {
    const geometry = this.track(new THREE.PlaneGeometry(width, length));
    geometry.rotateX(-Math.PI / 2);
    if (rotateZ) geometry.rotateZ(rotateZ);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, WORLD_CENTER_Z);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  scrollingMaterial(texture, tileLength) {
    this.track(texture);
    this.scrollingTextures.push({ texture, tileLength });
    const anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    texture.anisotropy = Math.min(8, anisotropy);
    return this.track(new THREE.MeshLambertMaterial({ map: texture }));
  }

  buildGround() {
    const roadMaterial = this.scrollingMaterial(
      createRoadTexture({
        roadWidth: ROAD_WIDTH,
        laneWidth: LANE_WIDTH,
        tileLength: ROAD_TILE_LENGTH,
        repeatY: WORLD_LENGTH / ROAD_TILE_LENGTH,
      }),
      ROAD_TILE_LENGTH,
    );
    this.addPlane(ROAD_WIDTH, WORLD_LENGTH, roadMaterial);

    const curbMaterial = this.scrollingMaterial(createCurbTexture(WORLD_LENGTH / 2), 2);
    const sidewalkMaterial = this.scrollingMaterial(createSidewalkTexture(WORLD_LENGTH / 2), 2);
    const groundWidth = 60;
    const groundMaterial = this.scrollingMaterial(createGroundTexture(groundWidth / 16, WORLD_LENGTH / 16), 16);
    const sidewalkBody = this.track(new THREE.MeshLambertMaterial({ color: 0xb5a68c }));

    [-1, 1].forEach((side) => {
      const curbX = side * (ROAD_WIDTH / 2 + CURB_WIDTH / 2);
      this.addPlane(CURB_WIDTH, WORLD_LENGTH, curbMaterial, { x: curbX, y: CURB_HEIGHT + 0.002 });
      this.addPlane(CURB_HEIGHT, WORLD_LENGTH, curbMaterial, {
        x: side * (ROAD_WIDTH / 2),
        y: CURB_HEIGHT / 2,
        rotateZ: (-side * Math.PI) / 2,
      });

      const sidewalkX = side * (ROAD_WIDTH / 2 + CURB_WIDTH + SIDEWALK_WIDTH / 2);
      const body = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(SIDEWALK_WIDTH, CURB_HEIGHT, WORLD_LENGTH)),
        sidewalkBody,
      );
      body.position.set(sidewalkX, CURB_HEIGHT / 2, WORLD_CENTER_Z);
      this.scene.add(body);
      this.addPlane(SIDEWALK_WIDTH, WORLD_LENGTH, sidewalkMaterial, { x: sidewalkX, y: CURB_HEIGHT + 0.002 });

      this.addPlane(groundWidth, WORLD_LENGTH, groundMaterial, {
        x: side * (ROAD_WIDTH / 2 + groundWidth / 2),
        y: -0.001,
      });
    });
  }

  buildSky() {
    const skyline = new THREE.Mesh(getModelGeometry('skyline'), farMaterial);
    skyline.position.set(0, 0, -108);
    this.scene.add(skyline);

    const sunDisc = new THREE.Mesh(
      this.track(new THREE.CircleGeometry(4, 28)),
      this.track(new THREE.MeshBasicMaterial({ color: 0xffe08a, fog: false })),
    );
    const halo = new THREE.Mesh(
      this.track(new THREE.CircleGeometry(8, 28)),
      this.track(new THREE.MeshBasicMaterial({ color: 0xffe08a, fog: false, transparent: true, opacity: 0.25 })),
    );
    sunDisc.position.set(26, 34, -112);
    halo.position.set(26, 34, -112.2);
    this.scene.add(halo, sunDisc);

    const cloudMaterial = this.track(
      new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xaab4bc, fog: false, flatShading: true }),
    );
    const puff = this.track(new THREE.IcosahedronGeometry(1, 1));
    [
      [-28, 30, 1.2, 1.6],
      [10, 38, 1, 1.1],
      [38, 26, 0.9, 1.3],
    ].forEach(([x, y, size, speed]) => {
      const cloud = new THREE.Group();
      [
        [0, 0, 3.2],
        [-3, -0.5, 2.4],
        [3, -0.6, 2.2],
        [1.2, 1.2, 2.2],
      ].forEach(([dx, dy, radius]) => {
        const mesh = new THREE.Mesh(puff, cloudMaterial);
        mesh.position.set(dx * size, dy * size, 0);
        mesh.scale.set(radius * size, radius * size * 0.7, radius * size * 0.6);
        cloud.add(mesh);
      });
      cloud.position.set(x, y, -100);
      this.scene.add(cloud);
      this.clouds.push({ group: cloud, speed });
    });
  }

  buildDecor() {
    const count = Math.ceil(WORLD_LENGTH / DECOR_SPACING);
    const houseX = ROAD_WIDTH / 2 + CURB_WIDTH + SIDEWALK_WIDTH + 1.8;
    const palmX = ROAD_WIDTH / 2 + CURB_WIDTH + 1.5;
    [-1, 1].forEach((side) => {
      for (let index = 0; index < count; index += 1) {
        const z = WORLD_NEAR - index * DECOR_SPACING;
        const key = (index + (side > 0 ? 1 : 0)) % 2 === 0 ? 'house' : 'shop';
        this.addDecor(key, side * houseX, z, side > 0 ? Math.PI : 0, count);
        this.addDecor('palm', side * palmX, z - DECOR_SPACING / 2, index * 1.7, count);
      }
    });
  }

  addDecor(key, x, z, rotationY, count) {
    const mesh = new THREE.Mesh(getModelGeometry(key), flatMaterial);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = rotationY;
    if (key === 'palm') mesh.position.y = CURB_HEIGHT;
    // Palms behind the camera would drop large shadows on the road with no visible source.
    mesh.castShadow = key !== 'palm';
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.decor.push({ mesh, initialZ: z, span: count * DECOR_SPACING });
  }

  createPools() {
    Object.keys(OBSTACLES).forEach((key) => {
      for (let index = 0; index < GAMEPLAY.poolSizes.obstaclesPerType; index += 1) {
        const mesh = new THREE.Mesh(getModelGeometry(key), flatMaterial);
        mesh.castShadow = true;
        mesh.visible = false;
        this.scene.add(mesh);
        this.obstaclePool.push({ mesh, key, active: false, cleared: false, depth: 0, lane: 0 });
      }
    });
    for (let index = 0; index < GAMEPLAY.poolSizes.coins; index += 1) {
      const mesh = new THREE.Mesh(getModelGeometry('coin'), coinMaterial);
      mesh.castShadow = true;
      mesh.visible = false;
      this.scene.add(mesh);
      this.coinPool.push({ mesh, key: 'coin', active: false, depth: 0, lane: 0, collectMs: 0 });
    }
  }

  resetRunState() {
    this.lane = 0;
    this.laneFrom = 0;
    this.laneProgress = 1;
    this.pendingLaneChange = 0;
    this.action = 'run';
    this.actionElapsedMs = 0;
    this.landingMs = 0;
    this.strideTime = 0;
    this.pointerStart = null;
    this.speedPxPerSecond = GAMEPLAY.startSpeedPxPerSecond;
    this.distanceMeters = 0;
    this.coinsCollected = 0;
    this.depthSinceRow = 0;
    this.nextRowGap = getRowGapForDistance(0);
    this.level = 1;
    this.isGameOver = false;
    this.isRunning = false;
    this.isPaused = false;
    this.countdown = null;
    this.crashMs = 0;
  }

  // Public API, shared with the Phaser scene so useGame can drive either engine.
  showPreview() {
    this.clearCountdown();
    this.releaseAllActiveObjects();
    this.resetDecor();
    this.resetRunState();
    STATIC_OBJECTS.obstacles.forEach(({ key, lane, depth }) => {
      const object = this.activateObstacle(lane, key);
      if (object) object.depth = depth;
    });
    STATIC_OBJECTS.coins.forEach(({ lane, depth }) => this.activateCoin(lane, depth));
    this.positionActiveObjects();
  }

  startNewRun() {
    this.clearCountdown();
    this.releaseAllActiveObjects();
    this.resetDecor();
    this.resetRunState();
    this.events.emit('score-updated', { distance: 0, coins: 0 });
    this.countdown = { remaining: 3, timerMs: COUNTDOWN_STEP_MS };
    this.events.emit('countdown', 3);
  }

  pauseRun() {
    if (this.isGameOver || this.isPaused) return;
    this.isPaused = true;
  }

  resumeRun() {
    if (this.isGameOver || !this.isPaused) return;
    this.isPaused = false;
  }

  clearCountdown() {
    this.countdown = null;
    this.events.emit('countdown', 0);
  }

  frame(now) {
    this.frameHandle = requestAnimationFrame(this.frame);
    const delta = Math.min(now - this.lastFrame, GAMEPLAY.maxFrameDeltaMs);
    this.lastFrame = now;
    this.clockMs += delta;
    this.update(delta);
    this.renderer.render(this.scene, this.camera);
  }

  update(delta) {
    this.clouds.forEach((cloud) => {
      cloud.group.position.x += (cloud.speed * delta) / 1000;
      if (cloud.group.position.x > 60) cloud.group.position.x = -60;
    });

    if (!this.isPaused) {
      this.updateCountdown(delta);
      if (this.isRunning && !this.isGameOver) this.updateRun(delta);
      this.updateCollectingCoins(delta);
    }
    this.animateRunner(this.isPaused ? 0 : delta);
    this.updateCamera(delta);
  }

  updateCountdown(delta) {
    if (!this.countdown) return;
    this.countdown.timerMs -= delta;
    if (this.countdown.timerMs > 0) return;
    this.countdown.remaining -= 1;
    if (this.countdown.remaining > 0) {
      this.countdown.timerMs += COUNTDOWN_STEP_MS;
      this.events.emit('countdown', this.countdown.remaining);
      return;
    }
    this.countdown = null;
    this.isRunning = true;
    this.spawnRow();
    this.events.emit('countdown', 0);
  }

  updateRun(delta) {
    this.speedPxPerSecond = getSpeedForDistance(this.distanceMeters);
    this.distanceMeters += (this.speedPxPerSecond * delta) / 1000 / GAMEPLAY.distancePixelsPerMeter;
    const depthDelta = (this.speedPxPerSecond * delta) / 1000 / 594;
    const worldDelta = depthDelta * DEPTH_TO_Z;

    this.scrollingTextures.forEach(({ texture, tileLength }) => {
      texture.offset.y = (texture.offset.y + worldDelta / tileLength) % 1;
    });
    this.decor.forEach(({ mesh, span }) => {
      mesh.position.z += worldDelta;
      if (mesh.position.z > WORLD_NEAR) mesh.position.z -= span;
    });

    this.activeObstacles.slice().forEach((object) => this.advanceObject(object, depthDelta));
    this.activeCoins.slice().forEach((object) => this.advanceObject(object, depthDelta));
    this.updateRunnerAction(delta);
    this.updateLaneChange(delta);
    this.checkCollisions();
    if (this.isGameOver) return;

    this.depthSinceRow += depthDelta;
    if (this.depthSinceRow >= this.nextRowGap) {
      this.depthSinceRow = 0;
      this.spawnRow();
    }

    const level = getLevelForDistance(this.distanceMeters);
    if (level > this.level) {
      this.level = level;
      this.events.emit('level-up', level);
    }
    this.events.emit('score-updated', { distance: Math.floor(this.distanceMeters), coins: this.coinsCollected });
  }

  advanceObject(object, depthDelta) {
    object.depth += depthDelta;
    if (object.depth > 1.1) this.releaseObject(object);
    else this.positionObject(object);
  }

  positionObject(object) {
    const { mesh } = object;
    mesh.position.set(object.lane * LANE_WIDTH, 0, depthToZ(object.depth));
    if (object.key === 'coin') {
      const phase = this.clockMs * 0.006 + object.depth * 14;
      mesh.position.y = 0.75 + Math.sin(phase) * 0.08 + (object.collectMs ? (1 - object.collectMs / 160) * 1.2 : 0);
      mesh.rotation.y = phase * 0.8;
    }
  }

  positionActiveObjects() {
    this.activeObstacles.forEach((object) => this.positionObject(object));
    this.activeCoins.forEach((object) => this.positionObject(object));
  }

  updateCollectingCoins(delta) {
    this.coinPool.forEach((object) => {
      if (!object.collectMs) return;
      object.collectMs = Math.max(0, object.collectMs - delta);
      const scale = object.collectMs / 160;
      object.mesh.scale.setScalar(Math.max(0.01, scale * 1.4));
      object.mesh.position.y = 0.75 + (1 - scale) * 1.2;
      if (!object.collectMs) {
        object.mesh.visible = false;
        object.mesh.scale.setScalar(1);
      }
    });
    if (!this.isRunning) this.activeCoins.forEach((object) => this.positionObject(object));
  }

  spawnRow() {
    const distance = this.distanceMeters;
    if (Math.random() < getWallChance(distance)) {
      const key = WALL_KEYS[Math.floor(Math.random() * WALL_KEYS.length)];
      [-1, 0, 1].forEach((lane) => this.activateObstacle(lane, key));
      this.nextRowGap = getRowGapForDistance(distance) + GAMEPLAY.wallExtraGap;
      return;
    }

    this.nextRowGap = getRowGapForDistance(distance);
    const lanes = [-1, 0, 1].sort(() => Math.random() - 0.5);
    const obstacleCount = Math.random() < getDoubleObstacleChance(distance) ? 2 : 1;
    lanes.slice(0, obstacleCount).forEach((lane) => this.activateObstacle(lane, pickObstacleKey(distance, Math.random())));
    if (Math.random() < 0.75) {
      const coinLane = lanes[obstacleCount];
      const count = 3 + Math.floor(Math.random() * 3);
      for (let index = 0; index < count; index += 1) this.activateCoin(coinLane, 0.02 + index * 0.055);
    }
  }

  activateObstacle(lane, key) {
    const object = this.obstaclePool.find((candidate) => !candidate.active && candidate.key === key);
    if (!object) return null;
    Object.assign(object, { active: true, cleared: false, depth: 0.02, lane });
    object.mesh.visible = true;
    this.positionObject(object);
    this.activeObstacles.push(object);
    return object;
  }

  activateCoin(lane, depth) {
    const object = this.coinPool.find((candidate) => !candidate.active && !candidate.collectMs);
    if (!object) return;
    Object.assign(object, { active: true, depth, lane, collectMs: 0 });
    object.mesh.visible = true;
    object.mesh.scale.setScalar(1);
    this.positionObject(object);
    this.activeCoins.push(object);
  }

  releaseObject(object) {
    object.active = false;
    if (!object.collectMs) object.mesh.visible = false;
    const collection = object.key === 'coin' ? this.activeCoins : this.activeObstacles;
    const index = collection.indexOf(object);
    if (index !== -1) collection.splice(index, 1);
  }

  releaseAllActiveObjects() {
    this.activeObstacles.slice().forEach((object) => this.releaseObject(object));
    this.activeCoins.slice().forEach((object) => this.releaseObject(object));
    this.coinPool.forEach((object) => {
      object.collectMs = 0;
      object.mesh.visible = false;
      object.mesh.scale.setScalar(1);
    });
  }

  resetDecor() {
    this.decor.forEach(({ mesh, initialZ }) => {
      mesh.position.z = initialZ;
    });
    this.scrollingTextures.forEach(({ texture }) => {
      texture.offset.y = 0;
    });
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

  checkCollisions() {
    const playerDepth = GAMEPLAY.collisionDepth;
    for (const object of this.activeObstacles) {
      if (object.cleared || object.lane !== this.lane) continue;
      if (Math.abs(object.depth - playerDepth) > GAMEPLAY.collisionWindow) continue;
      const { avoid } = OBSTACLES[object.key];
      if (this.isAvoiding(avoid)) {
        object.cleared = true;
        continue;
      }
      if (avoid !== 'lane' && object.depth < playerDepth) continue;
      this.endGame();
      return;
    }

    this.activeCoins.slice().forEach((object) => {
      if (object.lane === this.lane && Math.abs(object.depth - playerDepth) <= GAMEPLAY.collisionWindow) {
        this.coinsCollected += 1;
        object.collectMs = 160;
        this.releaseObject(object);
        this.events.emit('coin-collected', this.coinsCollected);
      }
    });
  }

  endGame() {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.isRunning = false;
    this.shakeMs = 260;
    this.crashMs = 1;
    this.events.emit('game-over', { distance: Math.floor(this.distanceMeters), coins: this.coinsCollected });
  }

  canControl() {
    return this.isRunning && !this.isPaused && !this.isGameOver;
  }

  requestLaneChange(direction) {
    if (!direction || !this.canControl()) return;
    if (this.laneProgress < 1) {
      this.pendingLaneChange = direction;
      return;
    }
    const nextLane = Math.max(-1, Math.min(1, this.lane + direction));
    if (nextLane === this.lane) return;
    this.laneFrom = this.lane;
    this.lane = nextLane;
    this.laneProgress = 0;
  }

  updateLaneChange(delta) {
    if (this.laneProgress >= 1) return;
    this.laneProgress = Math.min(1, this.laneProgress + delta / MOVEMENT.laneChangeDurationMs);
    if (this.laneProgress === 1 && this.pendingLaneChange) {
      const direction = this.pendingLaneChange;
      this.pendingLaneChange = 0;
      this.requestLaneChange(direction);
    }
  }

  getRunnerX() {
    const t = easeOutSine(this.laneProgress);
    return (this.laneFrom + (this.lane - this.laneFrom) * t) * LANE_WIDTH;
  }

  requestJump() {
    if (!this.canControl() || this.action === 'jump') return;
    this.action = 'jump';
    this.actionElapsedMs = 0;
    this.events.emit('jump');
  }

  requestSlide() {
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

  animateRunner(delta) {
    const model = this.runnerModel;
    const { root } = model;
    root.position.set(this.getRunnerX(), 0, 0);
    root.rotation.set(0, 0, 0);
    root.scale.set(1, 1, 1);

    if (this.isGameOver) {
      this.crashMs = Math.min(1, this.crashMs + delta / 300);
      root.rotation.x = 0.45 * this.crashMs;
      poseRunner(model, { lean: 0.2, leftShoulder: -1.8, rightShoulder: -1.6, armSpread: 0.5, leftKnee: -0.4 });
      return;
    }

    if (!this.isRunning) {
      const breath = Math.sin(this.clockMs * 0.003);
      poseRunner(model, {
        lean: -0.05,
        leftShoulder: 0.15 + breath * 0.05,
        rightShoulder: -0.15 - breath * 0.05,
        leftElbow: 0.4,
        rightElbow: 0.4,
        rightThigh: 0.15,
        rightKnee: -0.2,
      });
      return;
    }

    if (this.laneProgress < 1) root.rotation.z = -Math.sign(this.lane - this.laneFrom) * 0.14 * (1 - this.laneProgress);

    if (this.action === 'jump') {
      root.position.y = this.getJumpRatio() * JUMP_HEIGHT;
      poseRunner(model, {
        lean: -0.25,
        leftThigh: 1.1,
        rightThigh: 0.7,
        leftKnee: -1.5,
        rightKnee: -1.2,
        leftShoulder: -2.3,
        rightShoulder: -2.1,
        leftElbow: 0.3,
        rightElbow: 0.3,
      });
      return;
    }

    if (this.action === 'slide') {
      const t = this.actionElapsedMs / MOVEMENT.slideDurationMs;
      const blend = Math.min(1, Math.min(t, 1 - t) / 0.15);
      root.rotation.x = 1.15 * blend;
      poseRunner(model, {
        lean: -0.2 * blend,
        leftThigh: 0.4 * blend,
        rightThigh: 0.55 * blend,
        leftKnee: -0.15 * blend,
        rightKnee: -0.9 * blend,
        leftShoulder: 0.9 * blend,
        rightShoulder: 0.7 * blend,
        armSpread: 0.4 * blend,
      });
      return;
    }

    const speedFactor = Math.min(1.7, this.speedPxPerSecond / GAMEPLAY.startSpeedPxPerSecond);
    this.strideTime += delta * speedFactor;
    const phase = this.strideTime * 0.0125;
    const swing = Math.sin(phase);
    root.position.y = Math.abs(Math.cos(phase)) * 0.09;
    if (this.landingMs > 0) {
      const squash = this.landingMs / MOVEMENT.landingSquashMs;
      root.scale.set(1 + 0.08 * squash, 1 - 0.16 * squash, 1 + 0.08 * squash);
    }
    poseRunner(model, {
      lean: -0.16,
      leftThigh: swing * 0.85,
      rightThigh: -swing * 0.85,
      leftKnee: -(0.25 + Math.max(0, -swing) * 1.3),
      rightKnee: -(0.25 + Math.max(0, swing) * 1.3),
      leftShoulder: -swing * 0.9,
      rightShoulder: swing * 0.9,
      leftElbow: 1.25,
      rightElbow: 1.25,
    });
  }

  updateCamera(delta) {
    const targetX = this.getRunnerX() * 0.55;
    this.cameraX += (targetX - this.cameraX) * Math.min(1, delta * 0.008);
    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeMs > 0) {
      this.shakeMs = Math.max(0, this.shakeMs - delta);
      const strength = (this.shakeMs / 260) * 0.18;
      shakeX = (Math.random() - 0.5) * strength;
      shakeY = (Math.random() - 0.5) * strength;
    }
    this.camera.position.set(this.cameraX + shakeX, 4.1 + shakeY, 7.4);
    this.camera.lookAt(this.cameraX * 0.9, 0.9, -11);
  }

  setupControls() {
    this.keyHandler = (event) => {
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      let handled = true;
      if (['arrowleft', 'q', 'a'].includes(key)) this.requestLaneChange(-1);
      else if (['arrowright', 'd'].includes(key)) this.requestLaneChange(1);
      else if (['arrowup', 'w', 'z', ' '].includes(key)) this.requestJump();
      else if (['arrowdown', 's'].includes(key)) this.requestSlide();
      else handled = false;
      if (handled && this.canControl() && key.startsWith('arrow')) event.preventDefault();
    };
    window.addEventListener('keydown', this.keyHandler);

    this.pointerDown = (event) => {
      this.pointerStart = this.canControl() ? { x: event.clientX, y: event.clientY, handled: false } : null;
    };
    // Swipes trigger as soon as the threshold is crossed instead of waiting for the finger to lift.
    this.pointerMove = (event) => {
      const start = this.pointerStart;
      if (!start || start.handled) return;
      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < MOVEMENT.swipeThresholdPx) return;
      start.handled = true;
      this.handleSwipe(deltaX, deltaY);
    };
    this.pointerUp = (event) => {
      const start = this.pointerStart;
      this.pointerStart = null;
      if (!start || start.handled || !this.canControl()) return;
      const rect = this.canvas.getBoundingClientRect();
      this.requestLaneChange(event.clientX < rect.left + rect.width / 2 ? -1 : 1);
    };
    this.canvas.addEventListener('pointerdown', this.pointerDown);
    this.canvas.addEventListener('pointermove', this.pointerMove);
    this.canvas.addEventListener('pointerup', this.pointerUp);
    this.canvas.style.touchAction = 'none';

    this.visibilityHandler = () => {
      if (document.hidden && (this.isRunning || this.countdown) && !this.isPaused && !this.isGameOver) {
        this.events.emit('auto-pause');
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  handleSwipe(deltaX, deltaY) {
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      if (deltaY < 0) this.requestJump();
      else this.requestSlide();
    } else {
      this.requestLaneChange(Math.sign(deltaX));
    }
  }

  destroy() {
    cancelAnimationFrame(this.frameHandle);
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.keyHandler);
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.canvas.removeEventListener('pointerdown', this.pointerDown);
    this.canvas.removeEventListener('pointermove', this.pointerMove);
    this.canvas.removeEventListener('pointerup', this.pointerUp);
    this.events.clear();
    this.disposables.forEach((resource) => resource.dispose());
    disposeModelCache();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
