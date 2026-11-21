import * as THREE from 'three';
import {
  CAMERA,
  ECONOMY,
  ENEMIES,
  GARBAGE_CATCH,
  OBSTACLES as OBSTACLES_CFG,
} from '../config/balance';
import {
  getDifficultyProfile,
  type DifficultyProfile,
} from '../config/difficulty';
import { getLevelState, LEVELS } from '../config/levels';
import { REVIVE_INVULNERABILITY_SECONDS } from '../config/revive';
import { Clock } from '../core/Clock';
import { getDeviceQuality } from '../core/device';
import { Loop } from '../core/Loop';
import { SpawnReservations } from '../core/SpawnReservations';
import { EconomyManager } from '../economy/EconomyManager';
import { Environment } from '../world/Environment';
import { Player } from '../player/Player';
import {
  GarbageSystem,
  type GarbageCollectEvent,
} from '../collectibles/GarbageSystem';
import { Particles } from '../collectibles/Particles';
import { MathGateSystem, type GateActivation } from '../gates/MathGateSystem';
import { Hud, type RunResults } from '../ui/Hud';
import { InputController } from '../input/InputController';
import { AudioManager } from '../audio/AudioManager';
import {
  ObstacleSystem,
  type ObstacleHitEvent,
  type ObstacleBreakEvent,
} from '../obstacles/ObstacleSystem';
import { EnemySystem, type EnemyHitEvent, type EnemyDefeatedEvent } from '../enemies/EnemySystem';
import { PunchSystem } from '../enemies/PunchSystem';
import {
  PowerUpSystem,
  type PowerUpCollectEvent,
} from '../powerups/PowerUpSystem';
import type { PowerUpType } from '../powerups/PowerUpTimers';

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new Clock();
  private readonly loop: Loop;
  private readonly economy: EconomyManager;
  private readonly environment: Environment;
  private readonly player: Player;
  private readonly garbage: GarbageSystem;
  private readonly particles: Particles;
  private readonly gates: MathGateSystem;
  private readonly hud: Hud;
  private readonly input: InputController;
  private readonly audio = new AudioManager();
  private readonly obstacles: ObstacleSystem;
  private readonly enemies: EnemySystem;
  private readonly punch: PunchSystem;
  private readonly powerups: PowerUpSystem;
  private readonly reservations = new SpawnReservations();
  private readonly cameraLook = new THREE.Vector3();
  private readonly projected = new THREE.Vector3();
  private readonly pixelRatioCap: number;
  private distance = 0;
  private started = false;
  private paused = true;
  private gameOver = false;
  private currentLevelIndex = -1;
  private hitSpeedTimer = 0;
  private catchCooldown = 0;
  private runCoins = 0;
  private runGates = 0;
  private runEnemies = 0;
  private revivePending = false;
  private invulnerabilityTimer = 0;
  private runEndReason = '';

  constructor(private readonly root: HTMLElement) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const quality = getDeviceQuality();
    this.pixelRatioCap = quality.pixelRatioCap;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, this.pixelRatioCap),
    );
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.root.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      CAMERA.fov,
      width / height,
      CAMERA.near,
      CAMERA.far,
    );
    this.camera.position.set(0, CAMERA.height, CAMERA.distance);
    this.camera.lookAt(0, 1.35, -CAMERA.lookAhead);

    this.economy = new EconomyManager();
    this.hud = new Hud(this.root, {
      onStart: () => this.startRun(),
      onPause: () => {
        this.hud.dismissTutorial();
        this.togglePause();
      },
      onResume: () => this.setPaused(false),
      onCatch: () => {
        this.hud.dismissTutorial();
        this.audio.unlock();
        if (
          this.paused ||
          this.gameOver ||
          this.catchCooldown > 0
        ) {
          return;
        }
        this.catchCooldown = GARBAGE_CATCH.cooldown;
        this.player.catchNet();
        this.garbage.catchNearby(
          this.player.z,
          this.player.x,
          this.clock.time,
          GARBAGE_CATCH.rangeX,
          GARBAGE_CATCH.rangeZ,
        );
      },
      onRestart: () => {
        this.hud.dismissTutorial();
        this.restartRun();
      },
      onWatchRevive: () => this.watchReviveVideo(),
      onReviveComplete: () => this.completeRevive(),
      onReviveFailure: () => this.failRevive(),
      onEndRun: () => this.finalizeRun(),
    });
    this.hud.setBalance(this.economy.balance, false);
    this.hud.setLevel(LEVELS[0]);
    this.economy.onBalanceChange((entry) => {
      this.hud.setBalance(entry.balanceAfter, true);
    });

    this.environment = new Environment(this.scene);
    this.environment.onZoneTransition = (zoneName, active) => {
      this.hud.setZoneTransition(zoneName, active);
    };
    (window as unknown as Record<string, unknown>).__collectopia = this;
    this.player = new Player();
    this.scene.add(this.player.group);
    this.particles = new Particles(this.scene);
    this.garbage = new GarbageSystem(
      this.scene,
      this.economy,
      {
        onCollect: (event) => this.handleGarbageCollection(event),
      },
      this.reservations,
    );
    this.gates = new MathGateSystem(
      this.scene,
      this.economy,
      {
        onActivate: (activation) => this.handleGate(activation),
      },
      this.reservations,
    );

    this.obstacles = new ObstacleSystem(
      this.scene,
      {
        onHit: (event) => this.handleObstacleHit(event),
        onBreak: (event) => this.handleObstacleBreak(event),
      },
      this.reservations,
    );

    this.enemies = new EnemySystem(
      this.scene,
      this.economy,
      {
        onPlayerHit: (event) => this.handleEnemyHit(event),
        onEnemyDefeated: (event) => this.handleEnemyDefeated(event),
      },
      this.reservations,
    );

    this.powerups = new PowerUpSystem(
      this.scene,
      {
        onCollect: (event) => this.handlePowerUpCollect(event),
      },
      this.reservations,
    );

    this.punch = new PunchSystem(this.enemies, {
      onHit: (_superPunch) => {
        this.player.punch();
        this.audio.punchHit();
        this.particles.spawn(
          new THREE.Vector3(this.player.x, 0.12, this.player.z - 2.2),
        );
      },
      onMiss: () => {
        this.player.punch();
        this.audio.punchMiss();
      },
    });

    this.input = new InputController(this.renderer.domElement, {
      onSteer: (direction) => {
        this.hud.dismissTutorial();
        this.audio.unlock();
        if (!this.paused && !this.gameOver) this.player.steer(direction);
      },
      onPause: () => {
        this.hud.dismissTutorial();
        this.audio.unlock();
        this.togglePause();
      },
      onPunch: () => {
        this.hud.dismissTutorial();
        this.audio.unlock();
        if (!this.paused && !this.gameOver) {
          this.punch.trigger(this.player.z, this.player.x);
        }
      },
    });

    this.loop = new Loop(
      (_dt, now) => {
        const dt = this.clock.tick(now);
        if (this.started && !this.clock.isPaused && !this.gameOver) {
          this.update(dt);
        }
      },
      () => {
        this.renderer.render(this.scene, this.camera);
      },
    );

    window.addEventListener('resize', this.handleResize);
    document.addEventListener('visibilitychange', this.handleVisibility);
    window.addEventListener('pointerdown', this.unlockAudio, { passive: true });
    window.addEventListener('keydown', this.unlockAudio);
  }

  start(): void {
    this.clock.start(performance.now());
    this.clock.setPaused(true);
    this.renderer.render(this.scene, this.camera);
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    window.removeEventListener('pointerdown', this.unlockAudio);
    window.removeEventListener('keydown', this.unlockAudio);
    this.input.dispose();
    this.player.dispose();
    this.hud.dispose();
    this.garbage.dispose();
    this.particles.dispose();
    this.gates.dispose();
    this.obstacles.dispose();
    this.enemies.dispose();
    this.powerups.dispose();
    this.environment.dispose();
    this.reservations.clear();
    delete (window as unknown as Record<string, unknown>).__collectopia;
    this.renderer.domElement.remove();
    this.renderer.dispose();
  }

  private readonly handleResize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, this.pixelRatioCap),
    );
    this.renderer.setSize(width, height);
  };

  private readonly handleVisibility = (): void => {
    if (document.hidden) {
      this.hud.dismissTutorial();
      if (this.revivePending) this.hud.interruptReviveVideo();
      this.setPaused(true);
    }
  };

  private readonly unlockAudio = (): void => {
    this.audio.unlock();
  };

  private startRun(): void {
    if (this.started || this.gameOver) return;
    this.started = true;
    this.paused = false;
    this.clock.setPaused(false);
    this.hud.beginRun();
    this.audio.unlock();
  }

  private togglePause(): void {
    if (!this.started || this.gameOver) return;
    this.setPaused(!this.paused);
  }

  private setPaused(paused: boolean): void {
    if (this.gameOver || this.paused === paused) return;
    this.paused = paused;
    this.clock.setPaused(paused);
    this.hud.setPaused(paused);
  }

  private update(dt: number): void {
    this.catchCooldown = Math.max(0, this.catchCooldown - dt);
    this.invulnerabilityTimer = Math.max(0, this.invulnerabilityTimer - dt);
    const invulnerable = this.invulnerabilityTimer > 0;
    this.obstacles.invulnerable = invulnerable;
    this.enemies.invulnerable = invulnerable;

    const previousLevel = getLevelState(this.distance).level;
    const baseSpeed = previousLevel.speed;
    const speedFactor = this.hitSpeedTimer > 0 ? OBSTACLES_CFG.speedPenaltyFactor : 1;
    const speed = baseSpeed * speedFactor;
    if (this.hitSpeedTimer > 0) this.hitSpeedTimer = Math.max(0, this.hitSpeedTimer - dt);
    this.distance += speed * dt;

    const levelState = getLevelState(this.distance);
    const difficulty = getDifficultyProfile(levelState.level.index);
    this.reservations.prune(this.distance);
    if (levelState.level.index !== this.currentLevelIndex) {
      if (this.currentLevelIndex >= 0) {
        this.audio.levelUp();
      }
      this.currentLevelIndex = levelState.level.index;
      this.hud.setLevel(levelState.level);
    }

    this.player.update(dt, this.clock.time, this.distance, speed);
    this.environment.update(this.player.z, this.player.x, this.distance, dt);
    this.gates.update(
      this.player.z,
      this.player.x,
      this.distance,
      this.clock.time,
    );
    this.obstacles.update(
      this.player.z,
      this.player.x,
      this.distance,
      dt,
      difficulty,
    );
    this.enemies.update(
      this.player.z,
      this.player.x,
      this.distance,
      dt,
      speed,
      difficulty,
    );
    const expired = this.powerups.update(
      dt,
      this.clock.time,
      this.distance,
      this.player.x,
    );
    for (const type of expired) this.deactivatePowerUp(type);
    this.garbage.update(
      dt,
      this.clock.time,
      this.distance,
      this.player.x,
      difficulty,
    );
    this.hud.setPowerUps(this.powerups.timers.getStates());
    this.punch.update(dt);
    this.hud.setCatchCooldown(this.catchCooldown / GARBAGE_CATCH.cooldown);
    this.particles.update(dt);
    this.hud.setProgress(levelState.progress);

    this.camera.position.x = THREE.MathUtils.damp(
      this.camera.position.x,
      this.player.x * CAMERA.followX,
      CAMERA.smoothing,
      dt,
    );
    this.camera.position.y = CAMERA.height;
    this.camera.position.z = this.player.z + CAMERA.distance;
    this.cameraLook.set(
      this.player.x * 0.34,
      1.35,
      this.player.z - CAMERA.lookAhead,
    );
    this.camera.lookAt(this.cameraLook);
  }

  private handleGarbageCollection(event: GarbageCollectEvent): void {
    this.particles.spawn(event.position);
    this.audio.coin();
    this.runCoins += 1;

    this.projected.copy(event.position).project(this.camera);
    const screenX = (this.projected.x * 0.5 + 0.5) * window.innerWidth;
    const screenY = (-this.projected.y * 0.5 + 0.5) * window.innerHeight;
    this.hud.showCoinGain(event.amount, screenX, screenY);
  }

  private handleGate(activation: GateActivation): void {
    this.runGates += 1;
    this.particles.spawnSplash(activation.position);
    this.audio.gate(activation.positive);
    this.hud.showCalculation(activation.text, activation.positive);
  }

  private handleObstacleHit(event: ObstacleHitEvent): void {
    if (this.gameOver) return;

    if (event.shieldBlocked) {
      this.consumeShield(event.position);
      return;
    }

    if (event.fatal) {
      this.particles.spawn(event.position);
      this.audio.hit();
      this.hud.flashHit();
      this.endRun('Crashed into floating river debris.');
    }
  }

  private handleObstacleBreak(event: ObstacleBreakEvent): void {
    this.particles.spawn(event.position);
    this.audio.obstacleBreak();
  }

  private handleEnemyHit(event: EnemyHitEvent): void {
    if (this.gameOver) return;

    if (event.shieldBlocked) {
      this.consumeShield(event.position);
      return;
    }

    this.audio.enemyHit();
    this.particles.spawn(event.position);
    this.hitSpeedTimer = OBSTACLES_CFG.speedPenaltyDuration;
    this.hud.flashHit();

    this.projected.copy(event.position).project(this.camera);
    const screenX = (this.projected.x * 0.5 + 0.5) * window.innerWidth;
    const screenY = (-this.projected.y * 0.5 + 0.5) * window.innerHeight;
    this.hud.showHitPenalty(ENEMIES.damagePenalty, screenX, screenY);
  }

  private handleEnemyDefeated(event: EnemyDefeatedEvent): void {
    this.runEnemies += 1;
    this.audio.enemyDefeated();

    this.projected.copy(event.position).project(this.camera);
    const screenX = (this.projected.x * 0.5 + 0.5) * window.innerWidth;
    const screenY = (-this.projected.y * 0.5 + 0.5) * window.innerHeight;
    this.hud.showEnemyReward(event.reward, screenX, screenY);
  }

  private handlePowerUpCollect(event: PowerUpCollectEvent): void {
    this.particles.spawn(event.position);
    this.audio.powerUp();
    this.hud.showPowerUp(event.type);
    this.activatePowerUp(event.type);
    this.hud.setPowerUps(this.powerups.timers.getStates());
  }

  private activatePowerUp(type: PowerUpType): void {
    switch (type) {
      case 'magnet':
        this.garbage.setMagnet(true);
        break;
      case 'shield':
        this.obstacles.shieldActive = true;
        this.enemies.shieldActive = true;
        break;
      case 'super-punch':
        this.obstacles.breakableActive = true;
        this.punch.superPunchActive = true;
        break;
      case 'double-coins':
        this.garbage.setCoinMultiplier(2);
        break;
      case 'freeze':
        this.enemies.setFreeze(true);
        break;
    }
  }

  private deactivatePowerUp(type: PowerUpType): void {
    switch (type) {
      case 'magnet':
        this.garbage.setMagnet(false);
        break;
      case 'shield':
        this.setShieldEffects(false);
        break;
      case 'super-punch':
        this.obstacles.breakableActive = false;
        this.punch.superPunchActive = false;
        break;
      case 'double-coins':
        this.garbage.setCoinMultiplier(1);
        break;
      case 'freeze':
        this.enemies.setFreeze(false);
        break;
    }
  }

  private consumeShield(position: THREE.Vector3): void {
    if (!this.powerups.consume('shield')) return;
    this.setShieldEffects(false);
    this.particles.spawn(position);
    this.audio.shieldBlock();
    this.hud.setPowerUps(this.powerups.timers.getStates());
  }

  private setShieldEffects(active: boolean): void {
    this.obstacles.shieldActive = active;
    this.enemies.shieldActive = active;
  }

  private endRun(reason: string): void {
    if (this.gameOver) return;
    this.gameOver = true;
    this.runEndReason = reason;
    this.clock.setPaused(true);
    this.hud.setPaused(false);
    this.audio.gameOver();

    const level = getLevelState(this.distance).level;
    const results: RunResults = {
      distance: this.distance,
      level: level.index + 1,
      coinsCollected: this.runCoins,
      gatesPassed: this.runGates,
      enemiesDefeated: this.runEnemies,
      finalBalance: this.economy.balance,
      reason,
    };
    this.revivePending = false;
    this.hud.showRevivePrompt(results);
  }

  private watchReviveVideo(): void {
    if (!this.gameOver || this.revivePending) return;

    this.revivePending = true;
    if (!this.hud.playReviveVideo()) {
      this.failRevive();
    }
  }

  private completeRevive(): void {
    if (!this.gameOver || !this.revivePending) return;

    this.revivePending = false;
    this.obstacles.resumeAfterFatal();
    this.invulnerabilityTimer = REVIVE_INVULNERABILITY_SECONDS;
    this.obstacles.invulnerable = true;
    this.enemies.invulnerable = true;
    this.gameOver = false;
    this.clock.setPaused(false);
    this.hud.hideResults();
  }

  private failRevive(): void {
    this.revivePending = false;
  }

  private finalizeRun(): void {
    if (!this.gameOver) return;

    const level = getLevelState(this.distance).level;
    const results: RunResults = {
      distance: this.distance,
      level: level.index + 1,
      coinsCollected: this.runCoins,
      gatesPassed: this.runGates,
      enemiesDefeated: this.runEnemies,
      finalBalance: this.economy.balance,
      reason: this.runEndReason,
    };
    this.hud.showResults(results);
  }

  private restartRun(): void {
    this.hud.dismissTutorial();
    this.reservations.clear();
    this.economy.resetRun(ECONOMY.startingBalance);
    this.player.reset();
    this.garbage.reset();
    this.gates.reset();
    this.obstacles.reset();
    this.enemies.reset();
    this.powerups.reset();
    this.punch.reset();
    this.particles.reset();
    this.environment.reset(0);

    this.distance = 0;
    this.currentLevelIndex = -1;
    this.hitSpeedTimer = 0;
    this.catchCooldown = 0;
    this.runCoins = 0;
    this.runGates = 0;
    this.runEnemies = 0;
    this.gameOver = false;
    this.paused = false;
    this.revivePending = false;
    this.invulnerabilityTimer = 0;
    this.runEndReason = '';

    this.clock.setPaused(false);
    this.hud.setPaused(false);
    this.hud.hideResults();
    this.hud.setBalance(this.economy.balance, false);
    this.hud.setLevel(LEVELS[0]);
    this.hud.setProgress(0);
    this.hud.setPowerUps([]);

    this.camera.position.set(0, CAMERA.height, CAMERA.distance);
    this.camera.lookAt(0, 1.35, -CAMERA.lookAhead);
  }
}
