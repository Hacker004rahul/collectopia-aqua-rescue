import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LANES, PLAYER, PUNCH, STARTING_LANE } from '../config/balance';
import { createGlowTexture } from '../assets/proceduralTextures';

interface Limb {
  pivot: THREE.Group;
}

export class Player {
  readonly group = new THREE.Group();

  private readonly model = new THREE.Group();
  private readonly boat = new THREE.Group();
  private readonly collectionNet = new THREE.Group();
  private readonly arms: Limb[] = [];
  private readonly wakeTexture = createGlowTexture();
  private readonly wakeRibbonPositions = new Float32Array(2 * 23 * 2 * 3);
  private readonly wakeRibbonGeometry = new THREE.BufferGeometry();
  private readonly wakeRibbonMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });
  private readonly wakeRibbon = new THREE.Mesh(
    this.wakeRibbonGeometry,
    this.wakeRibbonMaterial,
  );
  private readonly wakeMaterial = new THREE.PointsMaterial({
    map: this.wakeTexture,
    color: 0xb7f8ff,
    size: 0.18,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    sizeAttenuation: true,
  });
  private readonly wakeGeometry = new THREE.BufferGeometry();
  private readonly wakePositions = new Float32Array(22 * 3);
  private readonly wake = new THREE.Points(this.wakeGeometry, this.wakeMaterial);
  private readonly sternFoamMaterial = new THREE.PointsMaterial({
    map: this.wakeTexture,
    color: 0xe0f7ff,
    size: 0.12,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    sizeAttenuation: true,
  });
  private readonly sternFoamGeometry = new THREE.BufferGeometry();
  private readonly sternFoamPositions = new Float32Array(32 * 3);
  private readonly sternFoam = new THREE.Points(this.sternFoamGeometry, this.sternFoamMaterial);
  private readonly punchGlowMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd79a,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  private laneIndexValue: number = STARTING_LANE;
  private targetX: number = LANES[STARTING_LANE];
  private currentX: number = LANES[STARTING_LANE];
  private punchTimer = 0;
  private catchNetTimer = 0;
  private punchGlow: THREE.Mesh | null = null;

  constructor() {
    this.group.add(this.boat, this.model, this.wakeRibbon, this.wake, this.sternFoam);
    this.buildModel();
    this.buildBoat();
    this.buildWakeRibbon();
    this.model.position.y = 0.45;
    this.wakeGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.wakePositions, 3),
    );
    this.wakeGeometry.setDrawRange(0, 0);
    this.wake.frustumCulled = false;

    this.sternFoamGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.sternFoamPositions, 3),
    );
    this.sternFoamGeometry.setDrawRange(0, 0);
    this.sternFoam.frustumCulled = false;

    this.group.position.set(this.currentX, 0, 0);
  }

  get laneIndex(): number {
    return this.laneIndexValue;
  }

  get x(): number {
    return this.currentX;
  }

  get z(): number {
    return this.group.position.z;
  }

  steer(direction: -1 | 1): void {
    const next = THREE.MathUtils.clamp(
      this.laneIndexValue + direction,
      0,
      LANES.length - 1,
    );
    this.laneIndexValue = next;
    this.targetX = LANES[next];
  }

  punch(): void {
    this.punchTimer = PUNCH.animDuration;
  }

  catchNet(): void {
    this.catchNetTimer = 0.38;
  }

  reset(): void {
    this.laneIndexValue = STARTING_LANE;
    this.targetX = LANES[STARTING_LANE];
    this.currentX = LANES[STARTING_LANE];
    this.punchTimer = 0;
    this.catchNetTimer = 0;
    this.collectionNet.rotation.set(0, 0, 0);
    this.punchGlowMaterial.opacity = 0;
    if (this.punchGlow) this.punchGlow.visible = false;
    this.group.position.set(this.currentX, 0.02, 0);
    this.group.rotation.set(0, 0, 0);
    this.model.position.y = 0.45;
    this.model.rotation.y = 0;
    this.boat.position.set(0, 0, 0);
    this.boat.rotation.set(0, 0, 0);
    this.wakeGeometry.setDrawRange(0, 0);
    this.wakeRibbon.visible = false;
    this.sternFoamGeometry.setDrawRange(0, 0);
    this.sternFoam.visible = false;
  }

  update(dt: number, time: number, distance: number, speed: number): void {
    this.currentX = THREE.MathUtils.damp(
      this.currentX,
      this.targetX,
      PLAYER.laneSmoothing,
      dt,
    );

    this.group.position.x = this.currentX;
    this.group.position.z = -distance;
    this.group.position.y = 0.02 + Math.sin(time * 2.15) * 0.035;
    this.model.position.y = 0.45 + Math.sin(time * 2.15 + 0.35) * 0.018;
    this.boat.position.x = Math.sin(time * 1.25) * 0.025;
    const ramProgress = 1 - this.punchTimer / PUNCH.animDuration;
    const ramMotion = this.punchTimer > 0
      ? Math.sin(THREE.MathUtils.clamp(ramProgress, 0, 1) * Math.PI)
      : 0;
    this.boat.position.z = -ramMotion * 0.18;
    this.boat.rotation.x = Math.sin(time * 0.88) * 0.012 - ramMotion * 0.045;
    const netSweep = this.catchNetTimer > 0
      ? Math.sin(
          THREE.MathUtils.clamp(1 - this.catchNetTimer / 0.38, 0, 1) *
            Math.PI,
        )
      : 0;
    this.catchNetTimer = Math.max(0, this.catchNetTimer - dt);
    this.collectionNet.rotation.y = THREE.MathUtils.damp(
      this.collectionNet.rotation.y,
      netSweep * 0.72,
      18,
      dt,
    );
    this.collectionNet.rotation.z = THREE.MathUtils.damp(
      this.collectionNet.rotation.z,
      -netSweep * 0.22,
      18,
      dt,
    );
    this.wakeMaterial.opacity = 0.2 + Math.min(speed / PLAYER.forwardSpeed, 1.2) * 0.16;
    this.updateWake(time, speed);

    if (this.punchTimer > 0) {
      this.punchTimer = Math.max(0, this.punchTimer - dt);
      const progress = 1 - this.punchTimer / PUNCH.animDuration;
      const pose =
        progress < 0.3
          ? THREE.MathUtils.smoothstep(progress / 0.3, 0, 1)
          : 1 - THREE.MathUtils.smoothstep((progress - 0.3) / 0.7, 0, 1);
      const rightArm = this.arms[1].pivot;
      rightArm.rotation.x = THREE.MathUtils.lerp(
        rightArm.rotation.x,
        1.8,
        pose,
      );
      rightArm.rotation.z = THREE.MathUtils.lerp(
        rightArm.rotation.z,
        0.45,
        pose,
      );
      const leftArm = this.arms[0].pivot;
      leftArm.rotation.x = THREE.MathUtils.lerp(
        leftArm.rotation.x,
        -0.35,
        pose * 0.6,
      );
      leftArm.rotation.z = THREE.MathUtils.lerp(
        leftArm.rotation.z,
        -0.18,
        pose * 0.6,
      );
      this.model.rotation.y = THREE.MathUtils.lerp(
        this.model.rotation.y,
        -0.22,
        pose,
      );
      if (this.punchGlow) {
        this.punchGlow.visible = pose > 0.02;
        this.punchGlow.scale.setScalar(0.55 + pose * 0.8);
      }
      this.punchGlowMaterial.opacity = pose * 0.45;
    } else {
      this.arms[1].pivot.rotation.z = THREE.MathUtils.damp(
        this.arms[1].pivot.rotation.z,
        0,
        18,
        dt,
      );
      this.arms[0].pivot.rotation.z = THREE.MathUtils.damp(
        this.arms[0].pivot.rotation.z,
        0,
        18,
        dt,
      );
      for (const arm of this.arms) {
        arm.pivot.rotation.x = THREE.MathUtils.damp(
          arm.pivot.rotation.x,
          0,
          18,
          dt,
        );
      }
      this.model.rotation.y = THREE.MathUtils.damp(
        this.model.rotation.y,
        0,
        14,
        dt,
      );
      this.punchGlowMaterial.opacity = 0;
      if (this.punchGlow) this.punchGlow.visible = false;
    }

    const lean = THREE.MathUtils.clamp((this.targetX - this.currentX) * -0.16, -0.18, 0.18);
    this.group.rotation.z = THREE.MathUtils.damp(this.group.rotation.z, lean, 10, dt);
    this.group.rotation.y = THREE.MathUtils.damp(
      this.group.rotation.y,
      (this.targetX - this.currentX) * 0.035,
      10,
      dt,
    );
    this.boat.rotation.y = THREE.MathUtils.damp(
      this.boat.rotation.y,
      THREE.MathUtils.clamp((this.targetX - this.currentX) * 0.08, -0.15, 0.15),
      8,
      dt,
    );
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.group.traverse((object) => {
      const renderable = object as THREE.Mesh | THREE.Points;
      if (!renderable.geometry) return;
      renderable.geometry.dispose();
      const material = renderable.material;
      if (Array.isArray(material)) {
        for (const item of material) item.dispose();
      } else {
        material.dispose();
      }
    });
    this.wakeTexture.dispose();
    this.sternFoamMaterial.dispose();
    this.sternFoamGeometry.dispose();
  }

  private buildModel(): void {
    // Original COLLECTOPIA character, reproduced exactly (geometry, colours,
    // flat shading) and adapted only into a seated pose.
    const skin = this.material(0xd99a6c, 0.72);
    const shirt = this.material(0x1f8a8a, 0.8);
    const shirtDark = this.material(0x156a6a, 0.82);
    const pants = this.material(0x28364a, 0.88);
    const shoe = this.material(0xf2efe9, 0.65);
    const hair = this.material(0x1b1b22, 0.9);
    const eye = new THREE.MeshBasicMaterial({ color: 0x16161d });
    const backpackMat = this.material(0xe05a3b, 0.82);
    const scarf = this.material(0xd93b3b, 0.85);
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });

    const addLimb = (
      from: THREE.Vector3,
      to: THREE.Vector3,
      radius: number,
      material: THREE.Material,
    ): void => {
      const dir = new THREE.Vector3().subVectors(to, from);
      const length = dir.length();
      const mesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(radius, Math.max(0.02, length - radius * 2), 4, 8),
        material,
      );
      mesh.position.copy(from).addScaledVector(dir, 0.5);
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir.clone().normalize(),
      );
      this.addShadowed(mesh);
    };

    // ── Torso (teal jacket), upright on the seat ──
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.4, 4, 12), shirt);
    torso.position.set(0, 0.49, 0);
    this.addShadowed(torso);

    const chestStripe = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.03), shirtDark);
    chestStripe.position.set(0, 0.58, -0.265);
    this.addShadowed(chestStripe);

    // ── Red scarf around the neck ──
    const scarfRing = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 6, 12), scarf);
    scarfRing.position.set(0, 0.96, 0);
    scarfRing.rotation.x = Math.PI / 2;
    this.addShadowed(scarfRing);

    const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.56), scarf);
    scarfTail.position.set(0.1, 0.88, 0.28);
    scarfTail.rotation.x = -0.22;
    this.addShadowed(scarfTail);

    // ── Orange backpack on the back ──
    const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.2), backpackMat);
    backpack.position.set(0, 0.54, 0.27);
    this.addShadowed(backpack);

    const backpackPocket = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.05), shirtDark);
    backpackPocket.position.set(0, 0.44, 0.39);
    this.addShadowed(backpackPocket);

    // ── Neck ──
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.14, 10), skin);
    neck.position.set(0, 0.94, 0);
    this.addShadowed(neck);

    // ── Head (original proportions) ──
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 14), skin);
    head.position.set(0, 1.18, 0);
    this.addShadowed(head);

    // ── Black cap: original dark dome (hair-cap), not a flat disc ──
    const hairCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.278, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
      hair,
    );
    hairCap.position.set(0, 1.2, 0);
    hairCap.rotation.x = -0.12;
    this.addShadowed(hairCap);

    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), skin);
      ear.position.set(side * 0.265, 1.18, 0);
      this.addShadowed(ear);

      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 8), eye);
      pupil.position.set(side * 0.1, 1.2, -0.255);
      this.model.add(pupil);

      const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 8), white);
      eyeWhite.position.set(side * 0.1, 1.2, -0.248);
      eyeWhite.scale.set(1, 0.78, 0.5);
      this.model.add(eyeWhite);
    }

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), skin);
    nose.position.set(0, 1.12, -0.27);
    this.addShadowed(nose);

    // ── Arms reaching toward the steering wheel ──
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Vector3(side * 0.34, 0.74, -0.05);
      const handTarget = new THREE.Vector3(side * 0.17, 0.64, -0.5);
      const armPivot = new THREE.Group();
      armPivot.position.copy(shoulder);
      this.model.add(armPivot);

      const reach = new THREE.Vector3().subVectors(handTarget, shoulder);
      const dirN = reach.clone().normalize();
      const upperArm = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.085, Math.max(0.02, reach.length() - 0.17), 4, 8),
        shirt,
      );
      upperArm.position.copy(dirN).multiplyScalar(reach.length() * 0.5);
      upperArm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirN);
      this.addShadowed(upperArm, armPivot);

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 8), skin);
      hand.position.copy(reach);
      this.addShadowed(hand, armPivot);

      if (side === 1) {
        const glow = new THREE.Mesh(
          new THREE.SphereGeometry(0.13, 10, 8),
          this.punchGlowMaterial,
        );
        glow.position.copy(reach);
        glow.visible = false;
        armPivot.add(glow);
        this.punchGlow = glow;
      }

      this.arms.push({ pivot: armPivot });
    }

    // ── Legs: bent at the knee, feet resting in the footwell ──
    for (const side of [-1, 1]) {
      const hip = new THREE.Vector3(side * 0.14, 0.06, 0.08);
      const knee = new THREE.Vector3(side * 0.16, 0.06, -0.1);
      const ankle = new THREE.Vector3(side * 0.16, -0.04, -0.1);

      addLimb(hip, knee, 0.105, pants);
      addLimb(knee, ankle, 0.08, pants);

      const shoeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.28), shoe);
      shoeMesh.position.set(side * 0.16, 0.01, -0.12);
      this.addShadowed(shoeMesh);

      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.03, 0.3), shirtDark);
      sole.position.set(side * 0.16, -0.03, -0.12);
      this.addShadowed(sole);
    }
  }

  private buildBoat(): void {
    // Bright rescue-orange hull. Standard (not physical) keeps the orange
    // saturated under ACES tone mapping; low metalness avoids a dull sheen.
    const hullMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.45,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });

    // Safety-orange deck surfaces (bow, stern and cockpit surround).
    const deckMaterial = new THREE.MeshStandardMaterial({
      color: 0xff7a21,
      roughness: 0.52,
      metalness: 0.03,
      side: THREE.DoubleSide,
    });

    // Dark marine-teal cockpit interior.
    const darkMaterial = new THREE.MeshStandardMaterial({
      color: 0x123f43,
      roughness: 0.62,
      metalness: 0.16,
      side: THREE.DoubleSide,
    });

    // Mid-teal detailing (console, motor accents).
    const tealMaterial = new THREE.MeshStandardMaterial({
      color: 0x0c8f8c,
      roughness: 0.4,
      metalness: 0.12,
      side: THREE.DoubleSide,
    });

    const trimMaterial = new THREE.MeshStandardMaterial({
      color: 0xffb64d,
      roughness: 0.34,
      metalness: 0.36,
    });

    const seatMaterial = new THREE.MeshStandardMaterial({
      color: 0xff7a2a,
      roughness: 0.66,
      metalness: 0.04,
    });

    const metalMaterial = new THREE.MeshStandardMaterial({
      color: 0xc8d2d0,
      roughness: 0.3,
      metalness: 0.72,
    });

    const rubberMaterial = new THREE.MeshStandardMaterial({
      color: 0x252b30,
      roughness: 0.92,
      metalness: 0.04,
    });

    const whiteMaterial = new THREE.MeshBasicMaterial({ color: 0xf3fff9 });

    // ── Unified two-tone hull ──
    // Curved cross-sections: pointed bow, wide stern, flat bottom, visible depth.
    const hullSections = [
      { z: -1.95, halfWidth: 0.03, topY: 0.92, bottomY: 0.18 },
      { z: -1.75, halfWidth: 0.20, topY: 0.88, bottomY: 0.12 },
      { z: -1.45, halfWidth: 0.40, topY: 0.86, bottomY: 0.07 },
      { z: -1.10, halfWidth: 0.55, topY: 0.85, bottomY: 0.04 },
      { z: -0.70, halfWidth: 0.64, topY: 0.85, bottomY: 0.03 },
      { z: -0.30, halfWidth: 0.69, topY: 0.85, bottomY: 0.02 },
      { z: 0.10,  halfWidth: 0.71, topY: 0.85, bottomY: 0.02 },
      { z: 0.50,  halfWidth: 0.72, topY: 0.84, bottomY: 0.02 },
      { z: 0.90,  halfWidth: 0.72, topY: 0.84, bottomY: 0.03 },
      { z: 1.30,  halfWidth: 0.71, topY: 0.83, bottomY: 0.04 },
      { z: 1.65,  halfWidth: 0.70, topY: 0.82, bottomY: 0.05 },
    ];

    const profile: Array<{ x: number; y: number }> = [
      { x: -1.0,  y: 1.0 },
      { x: -0.98, y: 0.80 },
      { x: -0.92, y: 0.55 },
      { x: -0.85, y: 0.34 },
      { x: -0.80, y: 0.26 },
      { x: -0.76, y: 0.20 },
      { x: -0.45, y: 0.04 },
      { x: 0.0,   y: 0.0 },
      { x: 0.45,  y: 0.04 },
      { x: 0.76,  y: 0.20 },
      { x: 0.80,  y: 0.26 },
      { x: 0.85,  y: 0.34 },
      { x: 0.92,  y: 0.55 },
      { x: 0.98,  y: 0.80 },
      { x: 1.0,   y: 1.0 },
    ];

    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    const orangeColor = new THREE.Color(0xff6b1a);
    const tealColor = new THREE.Color(0x0a9490);
    const waterlineY = 0.3;

    for (const section of hullSections) {
      for (const pt of profile) {
        const x = pt.x * section.halfWidth;
        const y = section.bottomY + pt.y * (section.topY - section.bottomY);
        positions.push(x, y, section.z);

        if (y < waterlineY) {
          colors.push(tealColor.r, tealColor.g, tealColor.b);
        } else {
          colors.push(orangeColor.r, orangeColor.g, orangeColor.b);
        }
      }
    }

    const pp = profile.length;
    for (let s = 0; s < hullSections.length - 1; s += 1) {
      for (let p = 0; p < pp - 1; p += 1) {
        const a = s * pp + p;
        const b = a + 1;
        const c = (s + 1) * pp + p;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const sternSection = hullSections[hullSections.length - 1];
    const sternCenterIdx = positions.length / 3;
    const sternCenterY = (sternSection.bottomY + sternSection.topY) / 2;
    positions.push(0, sternCenterY, sternSection.z);
    colors.push(tealColor.r, tealColor.g, tealColor.b);

    const sternBase = (hullSections.length - 1) * pp;
    for (let p = 0; p < pp - 1; p += 1) {
      indices.push(sternCenterIdx, sternBase + p + 1, sternBase + p);
    }

    const bowSection = hullSections[0];
    const bowCenterIdx = positions.length / 3;
    const bowCenterY = (bowSection.bottomY + bowSection.topY) / 2;
    positions.push(0, bowCenterY, bowSection.z - 0.04);
    colors.push(orangeColor.r, orangeColor.g, orangeColor.b);

    for (let p = 0; p < pp - 1; p += 1) {
      indices.push(bowCenterIdx, p, p + 1);
    }

    const hullGeometry = new THREE.BufferGeometry();
    hullGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    hullGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    hullGeometry.setIndex(indices);
    hullGeometry.computeVertexNormals();
    hullGeometry.computeBoundingSphere();

    const hullMesh = new THREE.Mesh(hullGeometry, hullMaterial);
    hullMesh.castShadow = true;
    hullMesh.receiveShadow = true;
    this.boat.add(hullMesh);

    // ── Recessed cockpit floor ──
    const cockpitShape = new THREE.Shape();
    cockpitShape.moveTo(-0.5, 0.95);
    cockpitShape.lineTo(0.5, 0.95);
    cockpitShape.lineTo(0.5, -0.78);
    cockpitShape.lineTo(-0.5, -0.78);
    cockpitShape.closePath();

    const cockpitGeometry = new THREE.ShapeGeometry(cockpitShape, 12);
    cockpitGeometry.rotateX(-Math.PI / 2);
    const cockpitFloor = new THREE.Mesh(cockpitGeometry, darkMaterial);
    cockpitFloor.position.set(0, 0.40, 0);
    cockpitFloor.receiveShadow = true;
    this.boat.add(cockpitFloor);

    // ── Bright orange deck with cockpit cut-out ──
    // This is the surface most visible from the elevated gameplay camera, so
    // it carries the rescue-orange identity: solid over the bow and stern,
    // open in the middle where the cockpit, console and seat sit.
    const deckShape = new THREE.Shape();
    deckShape.moveTo(0.03, 1.95);
    deckShape.lineTo(0.40, 1.45);
    deckShape.lineTo(0.55, 1.10);
    deckShape.lineTo(0.64, 0.70);
    deckShape.lineTo(0.69, 0.30);
    deckShape.lineTo(0.71, -0.10);
    deckShape.lineTo(0.72, -0.50);
    deckShape.lineTo(0.72, -0.90);
    deckShape.lineTo(0.71, -1.30);
    deckShape.lineTo(0.70, -1.65);
    deckShape.lineTo(-0.70, -1.65);
    deckShape.lineTo(-0.71, -1.30);
    deckShape.lineTo(-0.72, -0.90);
    deckShape.lineTo(-0.72, -0.50);
    deckShape.lineTo(-0.71, -0.10);
    deckShape.lineTo(-0.69, 0.30);
    deckShape.lineTo(-0.64, 0.70);
    deckShape.lineTo(-0.55, 1.10);
    deckShape.lineTo(-0.40, 1.45);
    deckShape.lineTo(-0.03, 1.95);
    deckShape.closePath();

    const cockpitHole = new THREE.Path();
    cockpitHole.moveTo(-0.5, 0.95);
    cockpitHole.lineTo(-0.5, -0.78);
    cockpitHole.lineTo(0.5, -0.78);
    cockpitHole.lineTo(0.5, 0.95);
    cockpitHole.closePath();
    deckShape.holes.push(cockpitHole);

    const deckGeometry = new THREE.ShapeGeometry(deckShape, 12);
    deckGeometry.rotateX(-Math.PI / 2);
    const deck = new THREE.Mesh(deckGeometry, deckMaterial);
    deck.position.set(0, 0.85, 0);
    deck.receiveShadow = true;
    this.boat.add(deck);

    // ── Rubber side bumpers ──
    for (const side of [-1, 1]) {
      const bumper = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.08, 2.8),
        rubberMaterial,
      );
      bumper.position.set(side * 0.715, 0.50, 0);
      this.boat.add(bumper);
    }

    // ── Gunwale cap rails (charcoal rubber bumpers) ──
    const railMaterial = new THREE.MeshStandardMaterial({
      color: 0x252b30,
      roughness: 0.92,
      metalness: 0.04,
    });

    for (const side of [-1, 1]) {
      const gunwale = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, 0.06, 3.0),
        railMaterial,
      );
      gunwale.position.set(side * 0.715, 0.87, 0);
      gunwale.castShadow = true;
      this.boat.add(gunwale);
    }

    // ── Console / dashboard ──
    const consoleGroup = new THREE.Group();

    const consoleBody = new THREE.Mesh(
      new RoundedBoxGeometry(0.8, 0.5, 0.4, 4, 0.08),
      tealMaterial,
    );
    consoleBody.position.set(0, 0.65, -0.55);
    consoleBody.castShadow = true;
    consoleGroup.add(consoleBody);

    const consoleFace = new THREE.Mesh(
      new RoundedBoxGeometry(0.7, 0.38, 0.05, 3, 0.03),
      darkMaterial,
    );
    consoleFace.position.set(0, 0.85, -0.35);
    consoleGroup.add(consoleFace);

    const consoleTop = new THREE.Mesh(
      new RoundedBoxGeometry(0.75, 0.04, 0.06, 2, 0.02),
      trimMaterial,
    );
    consoleTop.position.set(0, 1.08, -0.35);
    consoleGroup.add(consoleTop);

    const display = new THREE.Mesh(
      new RoundedBoxGeometry(0.24, 0.16, 0.02, 3, 0.02),
      new THREE.MeshBasicMaterial({ color: 0x6cdac2 }),
    );
    display.position.set(0, 0.88, -0.33);
    consoleGroup.add(display);

    for (const side of [-1, 1]) {
      const gauge = new THREE.Mesh(
        new THREE.CircleGeometry(0.055, 10),
        new THREE.MeshBasicMaterial({ color: 0xf5c86c }),
      );
      gauge.position.set(side * 0.2, 0.88, -0.325);
      consoleGroup.add(gauge);
    }

    this.boat.add(consoleGroup);

    // ── Steering wheel ──
    const wheelGroup = new THREE.Group();
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.025, 10, 32),
      metalMaterial,
    );
    wheel.rotation.x = Math.PI / 2;
    wheelGroup.add(wheel);

    for (let spoke = 0; spoke < 3; spoke += 1) {
      const bar = new THREE.Mesh(
        new RoundedBoxGeometry(0.022, 0.18, 0.022, 2, 0.007),
        metalMaterial,
      );
      bar.rotation.z = (spoke * Math.PI * 2) / 3;
      wheelGroup.add(bar);
    }

    const wheelHub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12),
      darkMaterial,
    );
    wheelHub.rotation.x = Math.PI / 2;
    wheelGroup.add(wheelHub);

    wheelGroup.position.set(0, 1.10, -0.52);
    wheelGroup.rotation.y = -0.12;
    this.boat.add(wheelGroup);

    // ── Seat ──
    const seatBase = new THREE.Mesh(
      new RoundedBoxGeometry(0.48, 0.07, 0.38, 3, 0.035),
      darkMaterial,
    );
    seatBase.position.set(0, 0.40, 0.15);
    seatBase.receiveShadow = true;
    this.boat.add(seatBase);

    const seatCushion = new THREE.Mesh(
      new RoundedBoxGeometry(0.42, 0.05, 0.32, 3, 0.025),
      seatMaterial,
    );
    seatCushion.position.set(0, 0.45, 0.13);
    seatCushion.receiveShadow = true;
    this.boat.add(seatCushion);

    const seatBack = new THREE.Mesh(
      new RoundedBoxGeometry(0.4, 0.28, 0.07, 3, 0.035),
      darkMaterial,
    );
    seatBack.position.set(0, 0.60, 0.31);
    seatBack.rotation.x = -0.12;
    seatBack.castShadow = true;
    this.boat.add(seatBack);

    const seatBackPad = new THREE.Mesh(
      new RoundedBoxGeometry(0.34, 0.22, 0.025, 2, 0.02),
      seatMaterial,
    );
    seatBackPad.position.set(0, 0.61, 0.28);
    this.boat.add(seatBackPad);

    // ── Outboard motor (attached to transom) ──
    const motorGroup = new THREE.Group();

    const motorMount = new THREE.Mesh(
      new RoundedBoxGeometry(0.38, 0.16, 0.14, 3, 0.03),
      darkMaterial,
    );
    motorMount.position.set(0, 0.55, 1.68);
    motorMount.castShadow = true;
    motorGroup.add(motorMount);

    const motorCowl = new THREE.Mesh(
      new RoundedBoxGeometry(0.3, 0.4, 0.28, 4, 0.06),
      deckMaterial,
    );
    motorCowl.position.set(0, 0.82, 1.75);
    motorCowl.castShadow = true;
    motorGroup.add(motorCowl);

    const motorTop = new THREE.Mesh(
      new RoundedBoxGeometry(0.26, 0.08, 0.24, 3, 0.03),
      darkMaterial,
    );
    motorTop.position.set(0, 1.05, 1.75);
    motorGroup.add(motorTop);

    const motorAccent = new THREE.Mesh(
      new RoundedBoxGeometry(0.22, 0.06, 0.04, 2, 0.015),
      trimMaterial,
    );
    motorAccent.position.set(0, 0.86, 1.89);
    motorGroup.add(motorAccent);

    const motorLeg = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.06, 0.35, 3, 8),
      darkMaterial,
    );
    motorLeg.position.set(0, 0.32, 1.78);
    motorGroup.add(motorLeg);

    const propellerHub = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 6),
      metalMaterial,
    );
    propellerHub.position.set(0, 0.1, 1.82);
    motorGroup.add(propellerHub);

    for (let blade = 0; blade < 3; blade += 1) {
      const propBlade = new THREE.Mesh(
        new RoundedBoxGeometry(0.05, 0.26, 0.025, 2, 0.01),
        metalMaterial,
      );
      propBlade.position.set(0, 0.08, 1.85);
      propBlade.rotation.z = (blade * Math.PI * 2) / 3;
      motorGroup.add(propBlade);
    }

    this.boat.add(motorGroup);

    // ── Navigation lights ──
    for (const side of [-1, 1]) {
      const navLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 7),
        new THREE.MeshBasicMaterial({
          color: side < 0 ? 0xf24b43 : 0x48e09a,
          toneMapped: false,
        }),
      );
      navLight.position.set(side * 0.6, 0.88, -1.45);
      this.boat.add(navLight);
    }

    // ── Cleats ──
    for (const side of [-1, 1]) {
      const cleat = new THREE.Mesh(
        new RoundedBoxGeometry(0.16, 0.04, 0.06, 2, 0.015),
        metalMaterial,
      );
      cleat.position.set(side * 0.55, 0.88, 0.85);
      this.boat.add(cleat);
    }

    // ── Recycling / rescue emblems ──
    const recyclingShape = new THREE.Shape();
    recyclingShape.moveTo(-0.05, -0.09);
    recyclingShape.lineTo(0.05, -0.09);
    recyclingShape.lineTo(0.05, 0.065);
    recyclingShape.lineTo(0.14, 0.065);
    recyclingShape.lineTo(0, 0.22);
    recyclingShape.lineTo(-0.14, 0.065);
    recyclingShape.lineTo(-0.05, 0.065);
    recyclingShape.closePath();

    const buildRecyclingEmblem = (scale: number): THREE.Group => {
      const group = new THREE.Group();
      for (let arrow = 0; arrow < 3; arrow += 1) {
        const symbol = new THREE.Mesh(
          new THREE.ShapeGeometry(recyclingShape),
          whiteMaterial,
        );
        symbol.rotation.z = (arrow * Math.PI * 2) / 3;
        group.add(symbol);
      }
      group.scale.setScalar(scale);
      return group;
    };

    // Emblems on both hull sides, mounted flush on the orange hull.
    for (const side of [-1, 1]) {
      const emblem = buildRecyclingEmblem(0.85);
      emblem.position.set(side * 0.69, 0.56, 0.25);
      emblem.rotation.y = (side * Math.PI) / 2;
      this.boat.add(emblem);
    }

    // Recycling emblem on the stern transom.
    const sternEmblem = buildRecyclingEmblem(0.5);
    sternEmblem.position.set(0, 0.34, 1.665);
    this.boat.add(sternEmblem);

    // Small rescue identification placards on the bow sides.
    for (const side of [-1, 1]) {
      const placard = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.12, 0.34),
        whiteMaterial,
      );
      placard.position.set(side * 0.6, 0.66, -0.95);
      this.boat.add(placard);

      const placardStripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.024, 0.035, 0.34),
        tealMaterial,
      );
      placardStripe.position.set(side * 0.602, 0.66, -0.95);
      this.boat.add(placardStripe);
    }

    // ── Collection net ──
    this.collectionNet.position.set(0.72, 0.72, -0.05);
    const netHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.03, 0.7, 8),
      metalMaterial,
    );
    netHandle.position.set(0.14, 0.12, -0.03);
    netHandle.rotation.z = Math.PI / 2;
    netHandle.rotation.y = -0.28;
    this.collectionNet.add(netHandle);

    const netHoop = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.02, 7, 18),
      metalMaterial,
    );
    netHoop.position.set(0.36, 0.05, -0.12);
    netHoop.rotation.y = Math.PI / 2;
    this.collectionNet.add(netHoop);

    const netLines: number[] = [];
    const netRings = 5;
    const netSegments = 12;
    for (let ring = 0; ring < netRings; ring += 1) {
      const depth = ring / (netRings - 1);
      const ringX = 1.1 - depth * 0.35;
      const radius = 0.18 * (1 - depth * 0.58);
      const ringY = 0.68 - depth * 0.13;
      const ringZ = -0.16 + depth * 0.11;
      for (let segment = 0; segment < netSegments; segment += 1) {
        const a = (segment * Math.PI * 2) / netSegments;
        const b = ((segment + 1) * Math.PI * 2) / netSegments;
        const pa = [ringX, ringY + Math.cos(a) * radius, ringZ + Math.sin(a) * radius];
        const pb = [ringX, ringY + Math.cos(b) * radius, ringZ + Math.sin(b) * radius];
        netLines.push(...pa, ...pb);
        if (ring < netRings - 1) {
          const nextX = 1.1 - ((ring + 1) / (netRings - 1)) * 0.35;
          const nextRadius = 0.18 * (1 - ((ring + 1) / (netRings - 1)) * 0.58);
          const nextY = 0.68 - ((ring + 1) / (netRings - 1)) * 0.13;
          const nextZ = -0.16 + ((ring + 1) / (netRings - 1)) * 0.11;
          netLines.push(
            ringX, ringY + Math.cos(a) * radius, ringZ + Math.sin(a) * radius,
            nextX, nextY + Math.cos(a) * nextRadius, nextZ + Math.sin(a) * nextRadius,
          );
        }
      }
    }
    const netGeometry = new THREE.BufferGeometry();
    netGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(netLines, 3),
    );
    netGeometry.translate(-0.72, -0.62, 0.05);
    const net = new THREE.LineSegments(
      netGeometry,
      new THREE.LineBasicMaterial({ color: 0x9bd2c0 }),
    );
    this.collectionNet.add(net);
    this.boat.add(this.collectionNet);
  }

  private buildWakeRibbon(): void {
    const segmentCount = 22;
    const vertexCount = 2 * (segmentCount + 1) * 2;
    const colors = new Float32Array(vertexCount * 3);
    const indices: number[] = [];

    for (let stream = 0; stream < 2; stream += 1) {
      const streamOffset = stream * (segmentCount + 1) * 2;
      for (let segment = 0; segment <= segmentCount; segment += 1) {
        const progress = segment / segmentCount;
        // Foam color at stern (progress=0), fading to clear water at back
        const foam = 1 - progress;
        const color = new THREE.Color().setRGB(
          0.7 + foam * 0.2,
          0.9 + foam * 0.1,
          1.0,
        );
        for (let edge = 0; edge < 2; edge += 1) {
          const offset = (streamOffset + segment * 2 + edge) * 3;
          colors[offset] = color.r;
          colors[offset + 1] = color.g;
          colors[offset + 2] = color.b;
        }
        if (segment < segmentCount) {
          const a = streamOffset + segment * 2;
          const b = a + 1;
          const c = a + 2;
          const d = a + 3;
          indices.push(a, b, c, b, d, c);
        }
      }
    }

    this.wakeRibbonGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.wakeRibbonPositions, 3),
    );
    this.wakeRibbonGeometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(colors, 3),
    );
    this.wakeRibbonGeometry.setIndex(indices);
    this.wakeRibbon.frustumCulled = false;
    this.wakeRibbon.renderOrder = 1;
  }

  private updateWake(time: number, speed: number): void {
    const speedScale = Math.min(speed / PLAYER.forwardSpeed, 1.3);
    const ribbonPositions = this.wakeRibbonGeometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute;
    for (let stream = 0; stream < 2; stream += 1) {
      const direction = stream === 0 ? -1 : 1;
      const streamOffset = stream * 23 * 2;
      for (let segment = 0; segment <= 22; segment += 1) {
        const progress = segment / 22;
        const spread = 0.45 + progress * 0.6;
        const width = 0.02 + progress * 0.09;
        // Wake starts narrow at stern, widens behind
        const centerX =
          direction * spread +
          Math.sin(time * 2.4 + progress * 8 + stream) * progress * 0.05;
        const y =
          -0.01 +
          Math.sin(time * 4 + progress * 11 + stream * Math.PI) *
            (0.01 + progress * 0.015);
        const z = 1.0 + progress * 2.6 * speedScale;
        const vertex = (streamOffset + segment * 2) * 3;
        ribbonPositions.setXYZ(vertex / 3, centerX - width, y, z);
        ribbonPositions.setXYZ(vertex / 3 + 1, centerX + width, y, z);
      }
    }
    ribbonPositions.needsUpdate = true;
    this.wakeRibbon.visible = speedScale > 0.05;
    this.wakeRibbonMaterial.opacity = 0.25 + speedScale * 0.1;

    // Stern foam particles near the boat
    const foamPositions = this.sternFoamGeometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute;
    let foamCount = 0;
    for (let i = 0; i < this.sternFoamPositions.length / 3; i += 1) {
      const progress = i / (this.sternFoamPositions.length / 3 - 1);
      const side = i % 2 === 0 ? -1 : 1;
      const foamX = side * (0.15 + progress * 0.25);
      const foamY = -0.02 + Math.sin(time * 6 + i) * 0.015;
      const foamZ = 0.95 + progress * 0.9;
      foamPositions.setXYZ(foamCount, foamX, foamY, foamZ);
      foamCount += 1;
    }
    foamPositions.needsUpdate = true;
    this.sternFoamGeometry.setDrawRange(0, speedScale > 0.1 ? foamCount : 0);
    this.sternFoam.visible = speedScale > 0.1;

    // Small wake points around hull
    for (let index = 0; index < this.wakePositions.length / 3; index += 1) {
      const progress = index / (this.wakePositions.length / 3 - 1);
      const spread = 0.12 + progress * 0.95;
      const wobble = Math.sin(time * 2.8 + index * 1.7);
      const offset = index * 3;
      this.wakePositions[offset] = wobble * spread * 0.42;
      this.wakePositions[offset + 1] = -0.015 + Math.cos(time * 3.4 + index) * 0.018;
      this.wakePositions[offset + 2] = 0.72 + progress * 3.0 * speedScale;
    }
    this.wakeGeometry.attributes.position.needsUpdate = true;
    this.wakeGeometry.setDrawRange(0, speedScale > 0 ? this.wakePositions.length / 3 : 0);
  }

  private material(color: number, roughness: number): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0,
      flatShading: true,
    });
  }

  private addShadowed(mesh: THREE.Mesh, parent: THREE.Object3D = this.model): void {
    mesh.castShadow = true;
    parent.add(mesh);
  }
}
