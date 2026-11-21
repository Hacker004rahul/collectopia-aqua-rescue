import * as THREE from 'three';
import { createGlowTexture } from '../assets/proceduralTextures';

interface Particle {
  active: boolean;
  life: number;
  maxLife: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
}

interface WaterRipple {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  opacity: number;
}

const MAX_PARTICLES = 72;
const BURST_SIZE = 14;
const RIPPLE_COUNT = 6;

export class Particles {
  private readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly particles: Particle[] = [];
  private readonly glowTexture = createGlowTexture();
  private readonly rippleGeometry = new THREE.RingGeometry(0.86, 1, 20);
  private readonly ripples: WaterRipple[] = [];
  private nextRipple = 0;

  constructor(private readonly scene: THREE.Scene) {
    this.positions = new Float32Array(MAX_PARTICLES * 3);

    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      this.particles.push({
        active: false,
        life: 0,
        maxLife: 1,
        position: new THREE.Vector3(0, -100, 0),
        velocity: new THREE.Vector3(),
      });
      this.positions[i * 3 + 1] = -100;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

    this.points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        map: this.glowTexture,
        color: 0xffd76a,
        size: 0.2,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);

    this.rippleGeometry.rotateX(-Math.PI / 2);
    for (let i = 0; i < RIPPLE_COUNT; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x9feeff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.rippleGeometry, material);
      mesh.visible = false;
      mesh.renderOrder = 1;
      this.ripples.push({ mesh, material, life: 0, maxLife: 0.62, opacity: 0.72 });
      scene.add(mesh);
    }
  }

  spawn(origin: THREE.Vector3): void {
    this.startRipple(origin, 0.72);

    let spawned = 0;

    for (const particle of this.particles) {
      if (spawned >= BURST_SIZE) break;
      if (particle.active) continue;

      particle.active = true;
      particle.maxLife = 0.45 + Math.random() * 0.35;
      particle.life = particle.maxLife;
      particle.position.copy(origin);
      particle.position.x += (Math.random() - 0.5) * 0.3;
      particle.position.y += (Math.random() - 0.5) * 0.3;
      particle.velocity.set(
        (Math.random() - 0.5) * 2.4,
        1.8 + Math.random() * 2.4,
        (Math.random() - 0.5) * 2.4,
      );
      spawned += 1;
    }
  }

  spawnSplash(origin: THREE.Vector3): void {
    this.startRipple(origin, 0.38);
  }

  private startRipple(origin: THREE.Vector3, opacity: number): void {
    const ripple = this.ripples[this.nextRipple];
    this.nextRipple = (this.nextRipple + 1) % this.ripples.length;
    ripple.life = ripple.maxLife;
    ripple.opacity = opacity;
    ripple.mesh.position.set(origin.x, 0.026, origin.z);
    ripple.mesh.scale.setScalar(0.12);
    ripple.mesh.visible = true;
    ripple.material.opacity = opacity;
  }

  update(dt: number): void {
    for (let i = 0; i < this.particles.length; i += 1) {
      const particle = this.particles[i];
      const offset = i * 3;

      if (!particle.active) {
        this.positions[offset + 1] = -100;
        continue;
      }

      particle.life -= dt;
      if (particle.life <= 0) {
        particle.active = false;
        this.positions[offset + 1] = -100;
        continue;
      }

      particle.velocity.y -= 8.5 * dt;
      particle.position.addScaledVector(particle.velocity, dt);

      this.positions[offset] = particle.position.x;
      this.positions[offset + 1] = particle.position.y;
      this.positions[offset + 2] = particle.position.z;
    }

    for (const ripple of this.ripples) {
      if (ripple.life <= 0) continue;
      ripple.life = Math.max(0, ripple.life - dt);
      const progress = 1 - ripple.life / ripple.maxLife;
      ripple.mesh.scale.setScalar(0.12 + progress * 0.9);
      ripple.material.opacity = ripple.opacity * (1 - progress);
      ripple.mesh.visible = ripple.life > 0;
    }

    this.points.geometry.attributes.position.needsUpdate = true;
  }

  reset(): void {
    for (let i = 0; i < this.particles.length; i += 1) {
      const particle = this.particles[i];
      particle.active = false;
      particle.life = 0;
      this.positions[i * 3 + 1] = -100;
    }
    for (const ripple of this.ripples) {
      ripple.life = 0;
      ripple.material.opacity = 0;
      ripple.mesh.visible = false;
    }
    this.nextRipple = 0;
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.points, ...this.ripples.map((ripple) => ripple.mesh));
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.glowTexture.dispose();
    this.rippleGeometry.dispose();
    for (const ripple of this.ripples) {
      ripple.material.dispose();
    }
  }
}
