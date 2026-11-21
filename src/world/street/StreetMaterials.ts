import * as THREE from 'three';
import {
  createAsphaltTexture,
  createBrickTexture,
  createConcreteTexture,
  createContactShadowTexture,
  createDirtTexture,
  createGrassTexture,
  createPaverTexture,
  createPlasterTexture,
  createRoofTexture,
  createShoreTexture,
  createSignAtlasTexture,
  createWaterEnvironmentMap,
  createWoodTexture,
} from '../../assets/proceduralTextures';

function vertexMaterial(
  options: THREE.MeshStandardMaterialParameters,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    ...options,
  });
}

export class StreetMaterials {
  readonly asphalt: THREE.MeshStandardMaterial;
  readonly roadPatch: THREE.MeshStandardMaterial;
  readonly paver: THREE.MeshStandardMaterial;
  readonly marking: THREE.MeshStandardMaterial;
  readonly dirt: THREE.MeshStandardMaterial;
  readonly grass: THREE.MeshStandardMaterial;
  readonly shore: THREE.MeshStandardMaterial;
  readonly water: THREE.ShaderMaterial;
  readonly plaster: THREE.MeshStandardMaterial;
  readonly brick: THREE.MeshStandardMaterial;
  readonly concrete: THREE.MeshStandardMaterial;
  readonly roof: THREE.MeshStandardMaterial;
  readonly wood: THREE.MeshStandardMaterial;
  readonly metal: THREE.MeshStandardMaterial;
  readonly glass: THREE.MeshStandardMaterial;
  readonly litWindow: THREE.MeshStandardMaterial;
  readonly foliage: THREE.MeshStandardMaterial;
  readonly fabric: THREE.MeshStandardMaterial;
  readonly signAtlas: THREE.MeshStandardMaterial;
  readonly contactShadow: THREE.MeshBasicMaterial;
  readonly lampGlow: THREE.MeshBasicMaterial;
  readonly wire: THREE.LineBasicMaterial;
  readonly distant: THREE.MeshStandardMaterial;

  private readonly textures: THREE.Texture[] = [];
  private readonly materials: THREE.Material[] = [];
  constructor() {
    const asphaltMap = this.texture(createAsphaltTexture());
    const paverMap = this.texture(createPaverTexture());
    const dirtMap = this.texture(createDirtTexture());
    const grassMap = this.texture(createGrassTexture());
    const shoreMap = this.texture(createShoreTexture());
    const waterEnvironmentMap = this.texture(createWaterEnvironmentMap());
    const plasterMap = this.texture(createPlasterTexture());
    const brickMap = this.texture(createBrickTexture());
    const concreteMap = this.texture(createConcreteTexture());
    const roofMap = this.texture(createRoofTexture());
    const woodMap = this.texture(createWoodTexture());
    const signMap = this.texture(createSignAtlasTexture());
    const shadowMap = this.texture(createContactShadowTexture());

    this.asphalt = this.material(
      new THREE.MeshStandardMaterial({
        name: 'asphalt',
        map: asphaltMap,
        color: 0xffffff,
        roughness: 0.97,
        metalness: 0.01,
      }),
    );

    this.roadPatch = this.material(
      new THREE.MeshStandardMaterial({
        name: 'roadPatch',
        color: 0x3a3c3d,
        roughness: 1,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );

    this.paver = this.material(
      new THREE.MeshStandardMaterial({
        name: 'paver',
        map: paverMap,
        color: 0xf6efe3,
        roughness: 0.94,
        metalness: 0,
      }),
    );

    this.marking = this.material(
      new THREE.MeshStandardMaterial({
        name: 'marking',
        color: 0xeee4c9,
        roughness: 0.68,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );

    this.dirt = this.material(
      new THREE.MeshStandardMaterial({
        name: 'dirt',
        map: dirtMap,
        color: 0xe5ddc3,
        roughness: 1,
        metalness: 0,
      }),
    );

    this.grass = this.material(
      new THREE.MeshStandardMaterial({
        name: 'grass',
        map: grassMap,
        color: 0xffffff,
        roughness: 0.96,
        metalness: 0,
        vertexColors: true,
      }),
    );

    this.shore = this.material(
      new THREE.MeshStandardMaterial({
        name: 'shore',
        map: shoreMap,
        color: 0xd8c6a4,
        roughness: 1,
        metalness: 0,
        vertexColors: true,
      }),
    );

    this.water = this.material(
      new THREE.ShaderMaterial({
        name: 'riverWater',
        uniforms: {
          uTime: { value: 0 },
          uEnvironment: { value: waterEnvironmentMap },
          uSunDirection: { value: new THREE.Vector3(0.5, 0.72, 0.36).normalize() },
          uRiverWidth: { value: 17.6 },
          uBoatPosition: { value: new THREE.Vector3() },
          fogColor: { value: new THREE.Color() },
          fogNear: { value: 1 },
          fogFar: { value: 1000 },
        },
        vertexShader: `
          uniform float uTime;
          varying vec3 vWorldPosition;
          varying vec3 vWorldNormal;
          varying vec3 vViewDirection;
          #include <fog_pars_vertex>

          float riverWave(vec2 p, float t) {
            return
              sin(dot(p, vec2(0.78, 0.28)) * 1.35 + t * 0.70) * 0.030 +
              sin(dot(p, vec2(-0.34, 0.92)) * 2.15 - t * 0.52) * 0.016 +
              sin(dot(p, vec2(0.93, -0.24)) * 3.90 + t * 0.92) * 0.007 +
              sin(dot(p, vec2(-0.72, -0.55)) * 6.20 - t * 1.18) * 0.0035;
          }

          void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vec2 wp = worldPosition.xz;
            vec2 drift = vec2(
              sin(wp.y * 0.035 + uTime * 0.16) * 0.10,
              -uTime * 0.42
            );
            worldPosition.y += riverWave((wp + drift) * 0.55, uTime * 0.9);
            vec4 mvPosition = viewMatrix * worldPosition;
            vWorldPosition = worldPosition.xyz;
            vWorldNormal = normalize(mat3(modelMatrix) * normal);
            vViewDirection = cameraPosition - worldPosition.xyz;
            gl_Position = projectionMatrix * mvPosition;
            #include <fog_vertex>
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform samplerCube uEnvironment;
          uniform vec3 uSunDirection;
          uniform float uRiverWidth;
          uniform vec3 uBoatPosition;
          varying vec3 vWorldPosition;
          varying vec3 vWorldNormal;
          varying vec3 vViewDirection;
          #include <fog_pars_fragment>

          float hash21(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
          }

          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
              mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0)), f.x),
              f.y
            );
          }

          float fbm(vec2 p) {
            return noise(p) * 0.55 +
                   noise(p * 2.07 + 11.3) * 0.28 +
                   noise(p * 4.10 - 7.1) * 0.17;
          }

          float rippleField(vec2 p, float t) {
            return
              sin(dot(p, vec2(0.78, 0.28)) * 1.35 + t * 0.70) * 0.055 +
              sin(dot(p, vec2(-0.34, 0.92)) * 2.15 - t * 0.52) * 0.030 +
              sin(dot(p, vec2(0.93, -0.24)) * 3.90 + t * 0.92) * 0.014 +
              sin(dot(p, vec2(-0.72, -0.55)) * 6.20 - t * 1.18) * 0.007 +
              (fbm(p * 3.1 + vec2(t * 0.16, -t * 0.22)) - 0.5) * 0.030;
          }

          void main() {
            float t = uTime;
            vec2 drift = vec2(
              sin(vWorldPosition.z * 0.035 + t * 0.16) * 0.10,
              -t * 0.42
            );
            vec2 p = (vWorldPosition.xz + drift) * 0.55;

            float eps = 0.035;
            float hL = rippleField(p - vec2(eps, 0.0), t);
            float hR = rippleField(p + vec2(eps, 0.0), t);
            float hD = rippleField(p - vec2(0.0, eps), t);
            float hU = rippleField(p + vec2(0.0, eps), t);
            vec3 normal = normalize(vec3((hL - hR) * 4.0, 1.0, (hD - hU) * 4.0));

            vec2 toBoat = vWorldPosition.xz - uBoatPosition.xz;
            float boatDist = length(toBoat);
            normal.xz += normalize(toBoat + vec2(0.0001)) *
                         sin(boatDist * 7.0 - t * 2.6) *
                         exp(-boatDist * 1.1) * 0.10;
            normal = normalize(normal);

            vec3 viewDirection = normalize(vViewDirection);
            vec3 reflectionDirection = reflect(-viewDirection, normal);
            reflectionDirection.xz += normal.xz * 0.18;
            vec3 reflectedSky = textureCube(uEnvironment, reflectionDirection).rgb;

            float depthNoise = fbm(p * 0.42 + vec2(t * 0.015, -t * 0.03));
            vec3 deepWater = vec3(0.008, 0.045, 0.105);
            vec3 tealWater = vec3(0.015, 0.135, 0.175);
            vec3 shallowWater = vec3(0.10, 0.30, 0.30);
            vec3 waterColor = mix(deepWater, tealWater, smoothstep(0.18, 0.82, depthNoise));
            float shoreMix = smoothstep(
              0.62,
              1.0,
              abs(vWorldPosition.x) / (uRiverWidth * 0.5)
            );
            waterColor = mix(waterColor, shallowWater, shoreMix * 0.45);

            float fresnel = 0.12 +
              0.72 * pow(1.0 - max(dot(normal, viewDirection), 0.0), 4.0);
            waterColor = mix(
              waterColor,
              reflectedSky,
              clamp(0.10 + fresnel * 0.62, 0.0, 0.88)
            );

            float streak = sin(
              dot(p, vec2(0.55, 0.83)) * 3.2 - t * 1.1 + fbm(p * 0.7) * 3.0
            );
            waterColor += vec3(0.10, 0.30, 0.30) *
              smoothstep(0.86, 1.0, streak) * 0.06;

            vec3 sunDir = normalize(uSunDirection);
            vec3 halfVec = normalize(viewDirection + sunDir);
            float specular = pow(max(dot(normal, halfVec), 0.0), 180.0);
            float sparkle = smoothstep(
              0.74,
              0.98,
              fbm(p * 5.0 + vec2(t * 0.40, -t * 0.30))
            ) * pow(max(dot(normal, sunDir), 0.0), 8.0);
            waterColor += vec3(1.0, 0.86, 0.62) *
              (specular * 0.55 + sparkle * 0.22);

            float shoreDistance = uRiverWidth * 0.5 - abs(vWorldPosition.x);
            float foamBand = 1.0 - smoothstep(0.0, 1.35, shoreDistance);
            float foamPattern =
              fbm(vec2(vWorldPosition.z * 2.4 + t * 0.55, vWorldPosition.x * 3.8)) *
              fbm(vec2(vWorldPosition.z * 6.5 - t * 0.90, 2.7));
            float foam = foamBand * smoothstep(0.20, 0.62, foamPattern);
            waterColor = mix(
              waterColor,
              vec3(0.78, 0.90, 0.88),
              clamp(foam * 0.50, 0.0, 0.60)
            );

            float boatFoam = (1.0 - smoothstep(0.35, 2.4, boatDist)) *
              (0.35 + 0.65 * fbm(vWorldPosition.xz * 4.0 + t));
            waterColor = mix(
              waterColor,
              vec3(0.82, 0.93, 0.92),
              clamp(boatFoam * 0.22, 0.0, 0.35)
            );

            gl_FragColor = vec4(waterColor, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            #include <fog_fragment>
          }
        `,
        fog: true,
        side: THREE.DoubleSide,
      }),
    );

    this.plaster = this.material(
      vertexMaterial({
        name: 'plaster',
        map: plasterMap,
        roughness: 0.96,
      }),
    );

    this.brick = this.material(
      vertexMaterial({
        name: 'brick',
        map: brickMap,
        roughness: 0.96,
      }),
    );

    this.concrete = this.material(
      vertexMaterial({
        name: 'concrete',
        map: concreteMap,
        roughness: 0.95,
      }),
    );

    this.roof = this.material(
      vertexMaterial({
        name: 'roof',
        map: roofMap,
        roughness: 0.92,
      }),
    );

    this.wood = this.material(
      vertexMaterial({
        name: 'wood',
        map: woodMap,
        roughness: 0.86,
      }),
    );

    this.metal = this.material(
      vertexMaterial({
        name: 'metal',
        roughness: 0.5,
        metalness: 0.34,
      }),
    );

    this.glass = this.material(
      vertexMaterial({
        name: 'glass',
        roughness: 0.22,
        metalness: 0.18,
      }),
    );

    this.litWindow = this.material(
      new THREE.MeshStandardMaterial({
        name: 'litWindow',
        color: 0xffd48a,
        emissive: 0xffad45,
        emissiveIntensity: 0.58,
        roughness: 0.42,
        metalness: 0.05,
      }),
    );

    this.foliage = this.material(
      vertexMaterial({
        name: 'foliage',
        roughness: 0.94,
        flatShading: true,
      }),
    );

    this.fabric = this.material(
      vertexMaterial({
        name: 'fabric',
        roughness: 1,
        side: THREE.DoubleSide,
      }),
    );

    this.signAtlas = this.material(
      new THREE.MeshStandardMaterial({
        name: 'signAtlas',
        map: signMap,
        color: 0xffffff,
        roughness: 0.72,
        metalness: 0.02,
        side: THREE.DoubleSide,
      }),
    );

    this.contactShadow = this.material(
      new THREE.MeshBasicMaterial({
        name: 'contactShadow',
        map: shadowMap,
        color: 0xffffff,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        toneMapped: false,
      }),
    );

    this.lampGlow = this.material(
      new THREE.MeshBasicMaterial({
        name: 'lampGlow',
        color: 0xffe2a3,
        toneMapped: false,
      }),
    );

    this.wire = this.material(
      new THREE.LineBasicMaterial({
        name: 'wire',
        color: 0x292a28,
        transparent: true,
        opacity: 0.62,
      }),
    );

    this.distant = this.material(
      vertexMaterial({
        name: 'distant',
        map: plasterMap,
        roughness: 1,
        side: THREE.DoubleSide,
      }),
    );
  }

  dispose(): void {
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.materials.length = 0;
    this.textures.length = 0;
  }

  updateWater(dt: number): void {
    this.water.uniforms.uTime.value += dt;
  }

  private texture<T extends THREE.Texture>(texture: T): T {
    this.textures.push(texture);
    return texture;
  }

  private material<T extends THREE.Material>(material: T): T {
    this.materials.push(material);
    return material;
  }
}
