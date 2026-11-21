import * as THREE from 'three';
import { ROAD } from '../config/balance';
import {
  getLevelState,
  getNextLevel,
  LEVELS,
} from '../config/levels';
import { getZoneTheme, ZONE_ORDER, type ZoneId, type ZoneTheme } from '../config/zones';
import { createCloudTexture, createGlowTexture } from '../assets/proceduralTextures';
import { getDeviceQuality } from '../core/device';
import {
  RIVER_WIDTH,
  StreetChunkBuilder,
  type BuiltStreetChunk,
} from './street/StreetChunkBuilder';
import { StreetMaterials } from './street/StreetMaterials';
import { AdSystem } from './ads/AdSystem';

const CHUNKS_PER_THEME = 5;
const DETAIL_AHEAD = 100;
const DETAIL_BEHIND = 24;
const VIEW_AHEAD = 170;
const VIEW_BEHIND = 20;
const FAR_LOD_AHEAD = 118;
const ATMOSPHERE_SMOOTHING = 1.7;
const PREFETCH_BUDGET_MS = 2.5;
const MAX_RETAINED_POOLS = 3;
const TRANSITION_SWAP_DELAY = 0.28;
const TRANSITION_TOTAL = 0.9;
const RIVER_LENGTH = 1200;

function createRiverSurface(material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(RIVER_WIDTH, RIVER_LENGTH, 48, 900);
  geometry.rotateX(-Math.PI / 2);

  const surface = new THREE.Mesh(geometry, material);
  surface.position.y = 0.012;
  surface.receiveShadow = true;
  return surface;
}

interface ChunkState extends BuiltStreetChunk {
  variant: number;
}

interface ThemePool {
  root: THREE.Group;
  chunks: ChunkState[];
  nextChunkZ: number;
  built: boolean;
  lastUsed: number;
}

interface PrefetchState {
  zoneId: ZoneId;
  zone: ZoneTheme;
  pool: ThemePool;
  nextVariant: number;
  task: Generator<string, BuiltStreetChunk, void> | null;
}

interface ZoneTransition {
  zoneId: ZoneId;
  elapsed: number;
  swapped: boolean;
}

export interface BuildStats {
  lastStepMs: number;
  maxStepMs: number;
  totalStepMs: number;
  steps: number;
  chunksBuilt: number;
  syncFallbacks: number;
  lastStepLabel: string;
  maxStepLabel: string;
  initialBuildMs: number;
}

export class Environment {
  readonly root = new THREE.Group();
  readonly buildStats: BuildStats = {
    lastStepMs: 0,
    maxStepMs: 0,
    totalStepMs: 0,
    steps: 0,
    chunksBuilt: 0,
    syncFallbacks: 0,
    lastStepLabel: '',
    maxStepLabel: '',
    initialBuildMs: 0,
  };

  onZoneTransition?: (zoneName: string, active: boolean) => void;

  private readonly pools = new Map<ZoneId, ThemePool>();
  private readonly skyRig = new THREE.Group();
  private readonly sunLight: THREE.DirectionalLight;
  private readonly hemisphereLight: THREE.HemisphereLight;
  private readonly riverSurface: THREE.Mesh;
  private readonly materials = new StreetMaterials();
  private readonly builder = new StreetChunkBuilder(this.materials);
  private readonly ads: AdSystem;
  private readonly glowTexture = createGlowTexture();
  private readonly cloudTexture = createCloudTexture();
  private readonly skyTop = new THREE.Color();
  private readonly skyBottom = new THREE.Color();
  private readonly backgroundColor = new THREE.Color();
  private readonly fogColor = new THREE.Color();
  private readonly hemisphereSky = new THREE.Color();
  private readonly hemisphereGround = new THREE.Color();
  private readonly sunColor = new THREE.Color();
  private readonly sunGlowColor = new THREE.Color();
  private readonly targetColor = new THREE.Color();
  private readonly skyMaterial: THREE.ShaderMaterial;
  private sunHalo!: THREE.Sprite;
  private sunCore!: THREE.Sprite;
  private activeZoneId: ZoneId | null = null;
  private prefetch: PrefetchState | null = null;
  private transition: ZoneTransition | null = null;
  private currentLevelIndex = 0;
  private poolUseCounter = 0;
  private fogNear = 64;
  private fogFar = 205;
  private hemisphereIntensity = 1.14;
  private sunIntensity = 2.32;

  constructor(private readonly scene: THREE.Scene) {
    const zone = getZoneTheme(LEVELS[0].zoneId);
    this.skyTop.setHex(zone.sky.top);
    this.skyBottom.setHex(zone.sky.bottom);
    this.backgroundColor.setHex(zone.sky.background);
    this.fogColor.setHex(zone.sky.fog);
    this.hemisphereSky.setHex(zone.light.hemisphereSky);
    this.hemisphereGround.setHex(zone.light.hemisphereGround);
    this.sunColor.setHex(zone.light.sunColor);
    this.sunGlowColor.setHex(zone.sky.sunGlow);
    this.fogNear = zone.sky.fogNear;
    this.fogFar = zone.sky.fogFar;
    this.hemisphereIntensity = zone.light.hemisphereIntensity;
    this.sunIntensity = zone.light.sunIntensity;

    scene.fog = new THREE.Fog(this.fogColor, this.fogNear, this.fogFar);
    scene.background = this.backgroundColor;
    this.riverSurface = createRiverSurface(this.materials.water);
    const waterUniforms = this.materials.water.uniforms;
    waterUniforms.uRiverWidth.value = RIVER_WIDTH;
    (waterUniforms.uSunDirection.value as THREE.Vector3)
      .set(18, 22, 10)
      .normalize();
    this.root.add(this.riverSurface);

    this.skyMaterial = this.buildSky();
    const quality = getDeviceQuality();

    this.hemisphereLight = new THREE.HemisphereLight(
      this.hemisphereSky,
      this.hemisphereGround,
      this.hemisphereIntensity,
    );
    scene.add(this.hemisphereLight);

    this.sunLight = new THREE.DirectionalLight(
      this.sunColor,
      this.sunIntensity,
    );
    this.sunLight.position.set(18, 22, 10);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(
      quality.shadowMapSize,
      quality.shadowMapSize,
    );
    this.sunLight.shadow.camera.left = -31;
    this.sunLight.shadow.camera.right = 31;
    this.sunLight.shadow.camera.top = 31;
    this.sunLight.shadow.camera.bottom = -31;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 95;
    this.sunLight.shadow.bias = -0.00035;
    this.sunLight.shadow.normalBias = 0.038;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    for (const id of ZONE_ORDER) {
      const pool: ThemePool = {
        root: new THREE.Group(),
        chunks: [],
        nextChunkZ: 0,
        built: false,
        lastUsed: 0,
      };
      pool.root.visible = false;
      this.pools.set(id, pool);
      this.root.add(pool.root);
    }

    this.ads = new AdSystem(scene);
    scene.add(this.root);
    scene.add(this.skyRig);
    this.activate(zone.id, 0, false);
  }

  update(playerZ: number, playerX: number, distance: number, dt: number): void {
    this.materials.updateWater(dt);
    this.riverSurface.position.z = playerZ;
    (this.materials.water.uniforms.uBoatPosition.value as THREE.Vector3).set(
      playerX,
      0,
      playerZ,
    );
    const level = getLevelState(distance).level;
    const zone = getZoneTheme(level.zoneId);
    this.currentLevelIndex = level.index;

    if (this.transition) {
      const transition = this.transition;
      transition.elapsed += dt;
      if (
        !transition.swapped &&
        transition.elapsed >= TRANSITION_SWAP_DELAY
      ) {
        this.swapToZone(transition.zoneId, playerZ);
        transition.swapped = true;
      }
      if (transition.elapsed >= TRANSITION_TOTAL) {
        this.transition = null;
        this.onZoneTransition?.(zone.name, false);
      }
    }

    if (!this.transition && zone.id !== this.activeZoneId) {
      this.beginTransition(zone.id);
    }

    this.ensurePrefetchForLevel(level.index);
    this.pumpPrefetch(PREFETCH_BUDGET_MS);

    const pool = this.activeZoneId
      ? this.pools.get(this.activeZoneId)
      : undefined;
    if (pool) {
      this.recycle(pool, playerZ);
      this.updateVisibility(pool, playerZ);
    }

    this.updateAtmosphere(dt, zone);
    if (this.activeZoneId) {
      this.ads.update(distance, playerZ, this.activeZoneId);
    }

    this.skyRig.position.set(playerX * 0.15, 0, playerZ);

    this.sunLight.position.set(playerX + 18, 22, playerZ + 10);
    this.sunLight.target.position.set(playerX, 0, playerZ - 16);
  }

  reset(playerZ = 0): void {
    this.riverSurface.position.z = playerZ;
    (this.materials.water.uniforms.uBoatPosition.value as THREE.Vector3).set(
      0,
      0,
      playerZ,
    );
    this.cancelPrefetch();
    this.transition = null;
    this.onZoneTransition?.('', false);
    this.ads.reset();

    const zone = getZoneTheme(LEVELS[0].zoneId);
    this.currentLevelIndex = 0;
    this.activeZoneId = null;
    this.poolUseCounter = 0;
    this.activate(zone.id, playerZ, false);
    this.updateAtmosphere(10, zone);
  }

  dispose(): void {
    this.cancelPrefetch();
    this.ads.dispose();

    for (const pool of this.pools.values()) {
      this.disposePool(pool);
      this.root.remove(pool.root);
    }
    this.riverSurface.geometry.dispose();

    this.skyRig.traverse((object) => {
      const renderable = object as THREE.Mesh | THREE.Sprite;
      if ((renderable as THREE.Mesh).isMesh) {
        (renderable as THREE.Mesh).geometry.dispose();
      }
      const material = (renderable as THREE.Mesh).material;
      if (material instanceof THREE.Material) material.dispose();
    });

    this.scene.remove(
      this.root,
      this.skyRig,
      this.hemisphereLight,
      this.sunLight,
    );
    this.scene.remove(this.sunLight.target);
    this.glowTexture.dispose();
    this.cloudTexture.dispose();
    this.materials.dispose();
    this.scene.fog = null;
    this.pools.clear();
    this.activeZoneId = null;
  }

  private activate(
    zoneId: ZoneId,
    playerZ: number,
    countFallback = true,
  ): void {
    const zone = getZoneTheme(zoneId);
    const pool = this.pools.get(zoneId);
    if (!pool) return;

    this.activeZoneId = zoneId;
    if (!pool.built) {
      this.finishPoolSync(pool, zone, zoneId, countFallback);
    }

    for (const [id, candidate] of this.pools) {
      candidate.root.visible = id === zoneId;
    }

    this.layoutPool(pool, playerZ);
    pool.lastUsed = ++this.poolUseCounter;
    this.retainPools();
    this.ensurePrefetchForLevel(this.currentLevelIndex);
  }

  private beginTransition(zoneId: ZoneId): void {
    this.transition = { zoneId, elapsed: 0, swapped: false };
    this.onZoneTransition?.(getZoneTheme(zoneId).name, true);
  }

  private swapToZone(zoneId: ZoneId, playerZ: number): void {
    const zone = getZoneTheme(zoneId);
    const pool = this.pools.get(zoneId);
    if (!pool) return;

    this.activeZoneId = zoneId;
    if (!pool.built) {
      this.finishPoolSync(pool, zone, zoneId);
    }

    for (const [id, candidate] of this.pools) {
      candidate.root.visible = id === zoneId;
    }

    this.layoutPool(pool, playerZ);
    pool.lastUsed = ++this.poolUseCounter;
    this.retainPools();
    this.ensurePrefetchForLevel(this.currentLevelIndex);
  }

  private ensurePrefetchForLevel(levelIndex: number): void {
    const next = getNextLevel(levelIndex);

    const zoneId = next.zoneId;
    const pool = this.pools.get(zoneId);
    if (!pool || pool.built || zoneId === this.activeZoneId) return;

    if (this.prefetch) {
      if (this.prefetch.zoneId === zoneId) return;
      if (this.prefetch.zoneId === this.activeZoneId) return;
      this.cancelPrefetch();
    }

    this.startPrefetch(zoneId);
  }

  private startPrefetch(zoneId: ZoneId): void {
    const pool = this.pools.get(zoneId);
    if (!pool || pool.built) return;

    this.resetPool(pool);
    pool.root.visible = false;
    this.prefetch = {
      zoneId,
      zone: getZoneTheme(zoneId),
      pool,
      nextVariant: 0,
      task: null,
    };
  }

  private cancelPrefetch(): void {
    if (!this.prefetch) return;
    this.resetPool(this.prefetch.pool);
    this.prefetch = null;
  }

  private pumpPrefetch(budgetMs: number): void {
    if (!this.prefetch) return;

    const start = performance.now();
    while (performance.now() - start < budgetMs) {
      if (this.runPrefetchStep()) break;
    }
  }

  private runPrefetchStep(): boolean {
    const state = this.prefetch;
    if (!state) return true;

    if (state.nextVariant >= CHUNKS_PER_THEME) {
      this.finalizePrefetch(state);
      return true;
    }

    if (!state.task) {
      state.task = this.builder.createBuildTask(
        state.zone,
        state.nextVariant,
      );
    }

    const started = performance.now();
    const step = state.task.next();
    this.recordBuild(
      performance.now() - started,
      step.done ? 'chunk-complete' : step.value,
    );

    if (step.done) {
      const chunk = step.value;
      state.pool.root.add(chunk.group);
      state.pool.chunks.push({ ...chunk, variant: state.nextVariant });
      state.nextVariant += 1;
      state.task = null;
      this.buildStats.chunksBuilt += 1;

      if (state.nextVariant >= CHUNKS_PER_THEME) {
        this.finalizePrefetch(state);
        return true;
      }
    }

    return false;
  }

  private finalizePrefetch(state: PrefetchState): void {
    state.pool.built = true;
    state.pool.lastUsed = ++this.poolUseCounter;
    this.prefetch = null;
    this.retainPools();
  }

  private finishPoolSync(
    pool: ThemePool,
    zone: ZoneTheme,
    zoneId: ZoneId,
    countFallback = true,
  ): void {
    if (this.prefetch?.zoneId === zoneId) {
      while (!this.runPrefetchStep()) {
        //
      }
    } else {
      if (this.prefetch) this.cancelPrefetch();
      this.resetPool(pool);
      const started = performance.now();
      for (let index = 0; index < CHUNKS_PER_THEME; index += 1) {
        const chunk = this.builder.build(zone, index);
        pool.root.add(chunk.group);
        pool.chunks.push({ ...chunk, variant: index });
      }
      const elapsed = performance.now() - started;
      this.recordBuild(elapsed, 'sync-build');
      if (!countFallback) this.buildStats.initialBuildMs = elapsed;
      pool.built = true;
    }

    if (countFallback) this.buildStats.syncFallbacks += 1;
  }

  private recordBuild(ms: number, label: string): void {
    this.buildStats.lastStepMs = ms;
    this.buildStats.lastStepLabel = label;
    this.buildStats.totalStepMs += ms;
    this.buildStats.steps += 1;
    if (ms > this.buildStats.maxStepMs) {
      this.buildStats.maxStepMs = ms;
      this.buildStats.maxStepLabel = label;
    }
  }

  private retainPools(): void {
    const built = [...this.pools.entries()].filter(([, pool]) => pool.built);
    if (built.length <= MAX_RETAINED_POOLS) return;

    const prefetchZone = this.prefetch?.zoneId ?? null;
    const candidates = built
      .filter(
        ([id]) => id !== this.activeZoneId && id !== prefetchZone,
      )
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

    let count = built.length;
    for (const [, pool] of candidates) {
      if (count <= MAX_RETAINED_POOLS) break;
      this.disposePool(pool);
      count -= 1;
    }
  }

  private resetPool(pool: ThemePool): void {
    this.disposePool(pool);
    pool.nextChunkZ = 0;
    pool.built = false;
    pool.lastUsed = 0;
  }

  private disposePool(pool: ThemePool): void {
    const geometries = new Set<THREE.BufferGeometry>();
    for (const chunk of pool.chunks) {
      chunk.group.traverse((object) => {
        const renderable = object as THREE.Mesh | THREE.Line;
        if (renderable.geometry) geometries.add(renderable.geometry);
      });
    }
    for (const geometry of geometries) geometry.dispose();
    pool.root.clear();
    pool.chunks.length = 0;
    pool.root.visible = false;
    pool.built = false;
    pool.lastUsed = 0;
    pool.nextChunkZ = 0;
  }

  private layoutPool(pool: ThemePool, playerZ: number): void {
    const startZ = playerZ + VIEW_BEHIND + ROAD.chunkLength / 2;
    for (let index = 0; index < pool.chunks.length; index += 1) {
      pool.chunks[index].group.position.z =
        startZ - index * ROAD.chunkLength;
    }
    pool.nextChunkZ =
      startZ - (pool.chunks.length - 1) * ROAD.chunkLength;
  }

  private recycle(pool: ThemePool, playerZ: number): void {
    for (const chunk of pool.chunks) {
      while (chunk.group.position.z > playerZ + ROAD.chunkLength) {
        chunk.group.position.z = pool.nextChunkZ - ROAD.chunkLength;
        pool.nextChunkZ = chunk.group.position.z;
      }
    }
  }

  private updateVisibility(pool: ThemePool, playerZ: number): void {
    const half = ROAD.chunkLength / 2;
    for (const chunk of pool.chunks) {
      const z = chunk.group.position.z;
      const visible =
        z + half > playerZ - VIEW_AHEAD && z - half < playerZ + VIEW_BEHIND;
      chunk.group.visible = visible;
      if (!visible) continue;

      const far = playerZ - (z + half) > FAR_LOD_AHEAD;
      chunk.core.visible = !far;
      chunk.far.visible = far;
      chunk.detail.visible =
        !far &&
        z + half > playerZ - DETAIL_AHEAD &&
        z - half < playerZ + DETAIL_BEHIND;
    }
  }

  private updateAtmosphere(dt: number, zone: ZoneTheme): void {
    const blend = 1 - Math.exp(-dt * ATMOSPHERE_SMOOTHING);

    this.skyTop.lerp(this.targetColor.setHex(zone.sky.top), blend);
    this.skyBottom.lerp(this.targetColor.setHex(zone.sky.bottom), blend);
    this.backgroundColor.lerp(
      this.targetColor.setHex(zone.sky.background),
      blend,
    );
    this.fogColor.lerp(this.targetColor.setHex(zone.sky.fog), blend);
    this.hemisphereSky.lerp(
      this.targetColor.setHex(zone.light.hemisphereSky),
      blend,
    );
    this.hemisphereGround.lerp(
      this.targetColor.setHex(zone.light.hemisphereGround),
      blend,
    );
    this.sunColor.lerp(this.targetColor.setHex(zone.light.sunColor), blend);
    this.sunGlowColor.lerp(this.targetColor.setHex(zone.sky.sunGlow), blend);

    this.fogNear = THREE.MathUtils.damp(
      this.fogNear,
      zone.sky.fogNear,
      ATMOSPHERE_SMOOTHING,
      dt,
    );
    this.fogFar = THREE.MathUtils.damp(
      this.fogFar,
      zone.sky.fogFar,
      ATMOSPHERE_SMOOTHING,
      dt,
    );
    this.hemisphereIntensity = THREE.MathUtils.damp(
      this.hemisphereIntensity,
      zone.light.hemisphereIntensity,
      ATMOSPHERE_SMOOTHING,
      dt,
    );
    this.sunIntensity = THREE.MathUtils.damp(
      this.sunIntensity,
      zone.light.sunIntensity,
      ATMOSPHERE_SMOOTHING,
      dt,
    );

    const uniforms = this.skyMaterial.uniforms;
    (uniforms.topColor.value as THREE.Color).copy(this.skyTop);
    (uniforms.bottomColor.value as THREE.Color).copy(this.skyBottom);

    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(this.fogColor);
      this.scene.fog.near = this.fogNear;
      this.scene.fog.far = this.fogFar;
    }

    this.hemisphereLight.color.copy(this.hemisphereSky);
    this.hemisphereLight.groundColor.copy(this.hemisphereGround);
    this.hemisphereLight.intensity = this.hemisphereIntensity;

    this.sunLight.color.copy(this.sunColor);
    this.sunLight.intensity = this.sunIntensity;

    this.sunHalo.material.color.copy(this.sunGlowColor);
    this.sunCore.material.color.copy(this.sunColor);
  }

  private buildSky(): THREE.ShaderMaterial {
    const skyGeometry = new THREE.SphereGeometry(500, 24, 16);
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: this.skyTop.clone() },
        bottomColor: { value: this.skyBottom.clone() },
        offset: { value: 18 },
        exponent: { value: 0.46 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
          float t = pow(max(h, 0.0), exponent);
          gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
        }
      `,
    });

    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    sky.renderOrder = -1000;
    this.skyRig.add(sky);

    const cloudPositions: Array<[number, number, number, number, number]> = [
      [-112, 72, -218, 96, 34],
      [86, 84, -270, 118, 42],
      [190, 58, -350, 88, 28],
      [-208, 90, -334, 132, 46],
      [24, 104, -428, 150, 52],
      [-76, 56, -148, 70, 24],
    ];

    for (const [x, y, z, width, height] of cloudPositions) {
      const cloud = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.cloudTexture,
          color: 0xfff8ec,
          transparent: true,
          opacity: 0.56,
          depthWrite: false,
          fog: false,
        }),
      );
      cloud.position.set(x, y, z);
      cloud.scale.set(width, height, 1);
      this.skyRig.add(cloud);
    }

    this.sunHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: this.sunGlowColor,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    this.sunHalo.scale.set(165, 165, 1);
    this.sunHalo.position.set(-105, 68, -238);
    this.skyRig.add(this.sunHalo);

    this.sunCore = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: this.sunColor,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    this.sunCore.scale.set(66, 66, 1);
    this.sunCore.position.set(-105, 68, -236);
    this.skyRig.add(this.sunCore);

    return skyMaterial;
  }
}
