import * as THREE from 'three';
import type { GateSpec } from '../economy/gateMath';

export const SIGN_ATLAS_COLUMNS = 4;
export const SIGN_ATLAS_ROWS = 4;

export const SIGN_CELLS = {
  kirana: 0,
  generalStore: 1,
  chai: 2,
  sweets: 3,
  medical: 4,
  tailor: 5,
  salon: 6,
  electricals: 7,
  vegetables: 8,
  temple: 9,
  repair: 10,
  school: 11,
  noHorn: 12,
  society: 13,
  dairy: 14,
  mobile: 15,
} as const;

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(
  canvas: HTMLCanvasElement,
  options: {
    repeat?: [number, number];
    clamp?: boolean;
    colorSpace?: THREE.ColorSpace;
    anisotropy?: number;
  } = {},
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  const repeat = options.repeat ?? [1, 1];
  texture.wrapS = options.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  texture.wrapT = options.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.colorSpace = options.colorSpace ?? THREE.SRGBColorSpace;
  texture.anisotropy = options.anisotropy ?? 4;
  return texture;
}

function makeCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create a procedural texture canvas');
  return { canvas, ctx };
}

function addGrain(
  ctx: CanvasRenderingContext2D,
  random: () => number,
  width: number,
  height: number,
  count: number,
  minAlpha: number,
  maxAlpha: number,
): void {
  for (let i = 0; i < count; i += 1) {
    const shade = Math.floor(40 + random() * 120);
    ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${
      minAlpha + random() * (maxAlpha - minAlpha)
    })`;
    const size = 0.5 + random() * 3.5;
    ctx.fillRect(random() * width, random() * height, size, size);
  }
}

function addCracks(
  ctx: CanvasRenderingContext2D,
  random: () => number,
  width: number,
  height: number,
  count: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let i = 0; i < count; i += 1) {
    let x = random() * width;
    let y = random() * height;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 3 + Math.floor(random() * 5);
    for (let step = 0; step < steps; step += 1) {
      x += (random() - 0.5) * 26;
      y += 7 + random() * 20;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

export function createAsphaltTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(512, 512);
  const random = seeded(0xa5fa17);

  ctx.fillStyle = '#252d38';
  ctx.fillRect(0, 0, 512, 512);

  addGrain(ctx, random, 512, 512, 5600, 0.025, 0.13);

  for (let i = 0; i < 22; i += 1) {
    const x = random() * 512;
    const y = random() * 512;
    const radiusX = 18 + random() * 90;
    const radiusY = 6 + random() * 28;
    ctx.fillStyle = `rgba(24, 27, 31, ${0.05 + random() * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(x, y, radiusX, radiusY, random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 12; i += 1) {
    const x = random() * 512;
    const y = random() * 512;
    const width = 24 + random() * 100;
    const height = 12 + random() * 48;
    ctx.fillStyle = `rgba(126, 137, 149, ${0.07 + random() * 0.09})`;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(25, 27, 30, 0.22)';
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(20, 22, 25, 0.5)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 9; i += 1) {
    let x = random() * 512;
    let y = random() * 512;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let step = 0; step < 6; step += 1) {
      x += (random() - 0.5) * 34;
      y += 10 + random() * 26;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const sheen = ctx.createLinearGradient(0, 0, 512, 0);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0)');
  sheen.addColorStop(0.5, 'rgba(255, 255, 255, 0.025)');
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, 512, 512);

  return canvasTexture(canvas);
}

export function createPaverTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(512, 512);
  const random = seeded(0x9a71e1);

  ctx.fillStyle = '#8b8173';
  ctx.fillRect(0, 0, 512, 512);

  const rowHeight = 64;
  const paverWidth = 126;
  for (let row = 0; row < 8; row += 1) {
    const offset = row % 2 === 0 ? -63 : 0;
    for (let x = offset; x < 512; x += paverWidth) {
      const shade = 158 + Math.floor(random() * 30);
      ctx.fillStyle = `rgb(${shade + 8}, ${shade + 2}, ${shade - 9})`;
      ctx.fillRect(x + 3, row * rowHeight + 3, paverWidth - 6, rowHeight - 6);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(x + 6, row * rowHeight + 6, paverWidth - 12, 4);
      ctx.fillStyle = 'rgba(51, 45, 38, 0.08)';
      ctx.fillRect(x + 6, row * rowHeight + rowHeight - 13, paverWidth - 12, 4);
    }
  }

  addGrain(ctx, random, 512, 512, 1700, 0.015, 0.075);

  for (let i = 0; i < 10; i += 1) {
    ctx.fillStyle = `rgba(39, 45, 34, ${0.03 + random() * 0.07})`;
    ctx.beginPath();
    ctx.ellipse(
      random() * 512,
      random() * 512,
      14 + random() * 60,
      6 + random() * 22,
      random() * Math.PI,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  return canvasTexture(canvas);
}

export function createPlasterTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  const random = seeded(0x4f1a2b);

  ctx.fillStyle = '#f3efe8';
  ctx.fillRect(0, 0, 256, 256);
  addGrain(ctx, random, 256, 256, 2400, 0.012, 0.07);

  for (let i = 0; i < 18; i += 1) {
    ctx.fillStyle = `rgba(120, 108, 91, ${0.02 + random() * 0.05})`;
    ctx.beginPath();
    ctx.ellipse(
      random() * 256,
      random() * 256,
      8 + random() * 34,
      4 + random() * 18,
      random() * Math.PI,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  addCracks(ctx, random, 256, 256, 4, 'rgba(93, 84, 71, 0.2)');

  const drips = ctx.createLinearGradient(0, 190, 0, 256);
  drips.addColorStop(0, 'rgba(99, 89, 73, 0)');
  drips.addColorStop(1, 'rgba(99, 89, 73, 0.08)');
  ctx.fillStyle = drips;
  ctx.fillRect(0, 190, 256, 66);

  return canvasTexture(canvas);
}

export function createBrickTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  const random = seeded(0x0b21c4);

  ctx.fillStyle = '#d9d2c7';
  ctx.fillRect(0, 0, 256, 256);

  const brickHeight = 32;
  const brickWidth = 64;
  for (let row = 0; row < 8; row += 1) {
    const offset = row % 2 === 0 ? -32 : 0;
    for (let x = offset; x < 256; x += brickWidth) {
      const shade = 176 + Math.floor(random() * 48);
      ctx.fillStyle = `rgb(${shade}, ${shade - 10}, ${shade - 22})`;
      ctx.fillRect(x + 2, row * brickHeight + 2, brickWidth - 4, brickHeight - 4);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(x + 4, row * brickHeight + 4, brickWidth - 8, 2);
    }
  }

  addGrain(ctx, random, 256, 256, 900, 0.015, 0.09);
  addCracks(ctx, random, 256, 256, 2, 'rgba(72, 61, 50, 0.16)');

  return canvasTexture(canvas);
}

export function createConcreteTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  const random = seeded(0xc0c2e7);

  ctx.fillStyle = '#d8d4cc';
  ctx.fillRect(0, 0, 256, 256);
  addGrain(ctx, random, 256, 256, 2600, 0.015, 0.08);

  for (let i = 0; i < 14; i += 1) {
    ctx.fillStyle = `rgba(91, 88, 82, ${0.025 + random() * 0.045})`;
    ctx.beginPath();
    ctx.ellipse(
      random() * 256,
      random() * 256,
      8 + random() * 32,
      4 + random() * 14,
      random() * Math.PI,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(101, 97, 89, 0.16)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i += 1) {
    const y = random() * 256;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y + (random() - 0.5) * 5);
    ctx.stroke();
  }

  return canvasTexture(canvas);
}

export function createRoofTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  const random = seeded(0x52ee91);

  ctx.fillStyle = '#b8aa99';
  ctx.fillRect(0, 0, 256, 256);

  const rowHeight = 32;
  for (let row = 0; row < 8; row += 1) {
    const offset = row % 2 === 0 ? -22 : 0;
    for (let x = offset; x < 256; x += 44) {
      const shade = 162 + Math.floor(random() * 50);
      ctx.fillStyle = `rgb(${shade + 6}, ${shade - 3}, ${shade - 15})`;
      ctx.beginPath();
      ctx.roundRect(x + 2, row * rowHeight + 3, 40, rowHeight - 3, [10, 10, 3, 3]);
      ctx.fill();
      ctx.strokeStyle = 'rgba(70, 55, 43, 0.2)';
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.11)';
      ctx.fillRect(x + 7, row * rowHeight + 6, 30, 3);
    }
  }

  addGrain(ctx, random, 256, 256, 1000, 0.015, 0.08);
  return canvasTexture(canvas);
}

export function createWoodTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(128, 256);
  const random = seeded(0x7a11d3);
  ctx.fillStyle = '#b48a5d';
  ctx.fillRect(0, 0, 128, 256);

  for (let plank = 0; plank < 4; plank += 1) {
    const x = plank * 32;
    ctx.fillStyle = 'rgba(60, 34, 17, 0.22)';
    ctx.fillRect(x, 0, 2, 256);
    for (let line = 0; line < 7; line += 1) {
      ctx.strokeStyle = `rgba(73, 43, 22, ${0.05 + random() * 0.1})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const lineX = x + 7 + random() * 20;
      ctx.moveTo(lineX, 0);
      for (let y = 0; y <= 256; y += 32) {
        ctx.lineTo(lineX + Math.sin(y * 0.04 + plank) * 3 + (random() - 0.5) * 2, y);
      }
      ctx.stroke();
    }
  }

  addGrain(ctx, random, 128, 256, 700, 0.02, 0.09);
  return canvasTexture(canvas);
}

export function createDirtTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  const random = seeded(0xd147c0);

  ctx.fillStyle = '#96865e';
  ctx.fillRect(0, 0, 256, 256);
  addGrain(ctx, random, 256, 256, 3200, 0.02, 0.1);

  for (let i = 0; i < 54; i += 1) {
    const shade = 105 + Math.floor(random() * 60);
    ctx.fillStyle = `rgba(${shade + 15}, ${shade + 7}, ${shade - 18}, 0.2)`;
    ctx.beginPath();
    ctx.arc(random() * 256, random() * 256, 1 + random() * 5, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 9; i += 1) {
    ctx.fillStyle = `rgba(78, 88, 46, ${0.05 + random() * 0.1})`;
    ctx.beginPath();
    ctx.ellipse(
      random() * 256,
      random() * 256,
      10 + random() * 36,
      5 + random() * 18,
      random() * Math.PI,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  return canvasTexture(canvas);
}

export function createGrassTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  const random = seeded(0x6a5512);

  ctx.fillStyle = '#5f8741';
  ctx.fillRect(0, 0, 256, 256);

  for (let patch = 0; patch < 30; patch += 1) {
    const x = random() * 256;
    const y = random() * 256;
    const radius = 12 + random() * 46;
    const light = random() > 0.46;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(
      0,
      light
        ? `rgba(143, 181, 94, ${0.10 + random() * 0.16})`
        : `rgba(48, 92, 45, ${0.10 + random() * 0.16})`,
    );
    gradient.addColorStop(1, light ? 'rgba(143, 181, 94, 0)' : 'rgba(48, 92, 45, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  addGrain(ctx, random, 256, 256, 2400, 0.025, 0.11);

  for (let blade = 0; blade < 1400; blade += 1) {
    const x = random() * 256;
    const y = random() * 256;
    const height = 2 + random() * 9;
    const shade = Math.floor(82 + random() * 84);
    ctx.strokeStyle = `rgba(${Math.max(0, shade - 32)}, ${shade}, ${Math.max(
      0,
      shade - 52,
    )}, ${0.16 + random() * 0.28})`;
    ctx.lineWidth = 0.6 + random() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + (random() - 0.5) * 4,
      y - height * 0.55,
      x + (random() - 0.5) * 7,
      y - height,
    );
    ctx.stroke();
  }

  for (let flower = 0; flower < 26; flower += 1) {
    const x = random() * 256;
    const y = random() * 256;
    const palette = ['#f2e6a6', '#f4f1e1', '#e7b84c', '#d98fa8'];
    ctx.fillStyle = palette[Math.floor(random() * palette.length)];
    ctx.globalAlpha = 0.55 + random() * 0.35;
    ctx.beginPath();
    ctx.arc(x, y, 0.9 + random() * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  for (let soil = 0; soil < 16; soil += 1) {
    const x = random() * 256;
    const y = random() * 256;
    ctx.fillStyle = `rgba(104, 82, 54, ${0.05 + random() * 0.1})`;
    ctx.beginPath();
    ctx.ellipse(
      x,
      y,
      3 + random() * 16,
      2 + random() * 7,
      random() * Math.PI,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  return canvasTexture(canvas);
}

export function createShoreTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  const random = seeded(0x5a0e21);

  ctx.fillStyle = '#8a7556';
  ctx.fillRect(0, 0, 256, 256);

  for (let patch = 0; patch < 22; patch += 1) {
    const x = random() * 256;
    const y = random() * 256;
    const radius = 10 + random() * 46;
    const sand = random() > 0.5;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(
      0,
      sand
        ? `rgba(182, 156, 112, ${0.14 + random() * 0.2})`
        : `rgba(74, 61, 43, ${0.14 + random() * 0.2})`,
    );
    gradient.addColorStop(1, sand ? 'rgba(182, 156, 112, 0)' : 'rgba(74, 61, 43, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  addGrain(ctx, random, 256, 256, 3200, 0.03, 0.14);

  for (let pebble = 0; pebble < 220; pebble += 1) {
    const x = random() * 256;
    const y = random() * 256;
    const radius = 0.8 + random() * 3.4;
    const shade = Math.floor(88 + random() * 96);
    ctx.fillStyle = `rgb(${shade + 8}, ${shade}, ${shade - 14})`;
    ctx.beginPath();
    ctx.ellipse(
      x,
      y,
      radius,
      radius * (0.55 + random() * 0.4),
      random() * Math.PI,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 248, 226, 0.16)';
    ctx.beginPath();
    ctx.ellipse(
      x - radius * 0.24,
      y - radius * 0.24,
      radius * 0.42,
      radius * 0.28,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  for (let root = 0; root < 12; root += 1) {
    ctx.strokeStyle = `rgba(84, 62, 38, ${0.12 + random() * 0.14})`;
    ctx.lineWidth = 0.8 + random() * 1.6;
    let x = random() * 256;
    let y = random() * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let step = 0; step < 4; step += 1) {
      x += (random() - 0.5) * 30;
      y += (random() - 0.5) * 30;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  return canvasTexture(canvas);
}

export function createWaterTexture(): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size, size);
  const random = seeded(0x2a7195);
  const pixels = ctx.createImageData(size, size);
  const tau = Math.PI * 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const wave = Math.sin((v * 8 + Math.sin(u * tau * 3) * 0.12) * tau);
      const crossWave = Math.cos((u * 4 + v * 5) * tau);
      const index = (y * size + x) * 4;
      pixels.data[index] = 5 + Math.max(0, wave) * 2;
      pixels.data[index + 1] = 39 + wave * 9 + crossWave * 3;
      pixels.data[index + 2] = 62 + wave * 11 + crossWave * 5;
      pixels.data[index + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);

  const wrapOffsets = [-size, 0, size];
  for (let ripple = 0; ripple < 110; ripple += 1) {
    const x = random() * size;
    const y = random() * size;
    const length = 8 + random() * 38;
    const bend = (random() - 0.5) * 8;
    const alpha = 0.08 + random() * 0.24;
    ctx.strokeStyle =
      random() < 0.82
        ? `rgba(118, 205, 198, ${alpha})`
        : `rgba(246, 191, 111, ${alpha * 0.68})`;
    ctx.lineWidth = 0.6 + random() * 1.8;
    for (const offsetY of wrapOffsets) {
      for (const offsetX of wrapOffsets) {
        ctx.beginPath();
        ctx.moveTo(x + offsetX, y + offsetY);
        ctx.quadraticCurveTo(
          x + length * 0.52 + offsetX,
          y + bend + offsetY,
          x + length + offsetX,
          y + bend * 0.35 + offsetY,
        );
        ctx.stroke();
      }
    }
  }

  for (let glint = 0; glint < 24; glint += 1) {
    const x = random() * size;
    const y = random() * size;
    const gradient = ctx.createLinearGradient(x, y, x + 24, y);
    gradient.addColorStop(0, 'rgba(230, 246, 221, 0)');
    gradient.addColorStop(0.5, `rgba(230, 246, 221, ${0.12 + random() * 0.2})`);
    gradient.addColorStop(1, 'rgba(230, 246, 221, 0)');
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1 + random() * 2;
    const offsetYChange = (random() - 0.5) * 2;
    for (const offsetY of wrapOffsets) {
      for (const offsetX of wrapOffsets) {
        ctx.beginPath();
        ctx.moveTo(x + offsetX, y + offsetY);
        ctx.lineTo(x + 24 + offsetX, y + offsetYChange + offsetY);
        ctx.stroke();
      }
    }
  }

  const texture = canvasTexture(canvas, { anisotropy: 2 });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function createWaterEnvironmentMap(): THREE.CubeTexture {
  const faces: HTMLCanvasElement[] = [];
  const random = seeded(0x71a4c2);

  for (let face = 0; face < 6; face += 1) {
    const { canvas, ctx } = makeCanvas(64, 64);
    const sky = ctx.createLinearGradient(0, 0, 0, 64);
    sky.addColorStop(0, '#647a9b');
    sky.addColorStop(0.52, '#d98e76');
    sky.addColorStop(0.68, '#f3bb76');
    sky.addColorStop(0.72, '#657852');
    sky.addColorStop(1, '#244c43');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 64, 64);

    if (face !== 2 && face !== 3) {
      for (let tree = 0; tree < 9; tree += 1) {
        const x = random() * 76 - 6;
        const y = 42 + random() * 17;
        const radius = 4 + random() * 9;
        ctx.fillStyle = `rgba(27, ${55 + Math.floor(random() * 25)}, 39, 0.7)`;
        ctx.beginPath();
        ctx.ellipse(x, y, radius, radius * 0.72, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    faces.push(canvas);
  }

  const environment = new THREE.CubeTexture(faces);
  environment.colorSpace = THREE.SRGBColorSpace;
  environment.mapping = THREE.CubeReflectionMapping;
  environment.needsUpdate = true;
  return environment;
}

const SIGN_LABELS = [
  ['KIRANA', 'STORE'],
  ['SHARMA', 'GENERAL STORE'],
  ['CHAI', '& SNACKS'],
  ['SWEETS', '& NAMKEEN'],
  ['MEDICAL', 'STORE'],
  ['TAILOR', 'MASTER'],
  ['SALON', 'UNISEX'],
  ['ELECTRICALS'],
  ['SABZI', 'MANDI'],
  ['OM', 'SHANTI'],
  ['SCOOTER', 'REPAIR'],
  ['SCHOOL', 'AHEAD'],
  ['NO', 'HORN'],
  ['SOCIETY', 'PARK'],
  ['FRESH', 'DAIRY'],
  ['MOBILE', 'REPAIR'],
] as const;

const SIGN_COLORS = [
  ['#bf3d2f', '#fff4df'],
  ['#1f6b58', '#fff8e2'],
  ['#d79022', '#231a0f'],
  ['#a53139', '#fff4df'],
  ['#226487', '#fff4df'],
  ['#633b7c', '#fff4df'],
  ['#b3437d', '#fff4df'],
  ['#31558d', '#fff4df'],
  ['#42752f', '#fff4df'],
  ['#b94b29', '#fff4df'],
  ['#2d3d55', '#ffdd85'],
  ['#ede2c4', '#374657'],
  ['#e8e2cf', '#b12a27'],
  ['#2c6950', '#fff4df'],
  ['#d7e3ec', '#275570'],
  ['#404247', '#ffde72'],
] as const;

function drawSignCell(
  ctx: CanvasRenderingContext2D,
  index: number,
  random: () => number,
): void {
  const cell = 256;
  const columns = 4;
  const col = index % columns;
  const row = Math.floor(index / columns);
  const x = col * cell;
  const y = row * cell;
  const [background, foreground] = SIGN_COLORS[index];
  const labels = SIGN_LABELS[index];

  ctx.fillStyle = background;
  ctx.fillRect(x, y, cell, cell);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 6;
  ctx.strokeRect(x + 8, y + 8, cell - 16, cell - 16);

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 13, y + 13, cell - 26, cell - 26);

  ctx.fillStyle = foreground;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const longest = Math.max(...labels.map((label) => label.length));
  const fontSize = longest > 11 ? 30 : longest > 7 ? 39 : 48;
  ctx.font = `900 ${fontSize}px "Arial Narrow", "Segoe UI", sans-serif`;

  if (labels.length === 1) {
    ctx.fillText(labels[0], x + cell / 2, y + cell / 2 + 2);
  } else {
    ctx.fillText(labels[0], x + cell / 2, y + cell / 2 - fontSize * 0.62);
    ctx.fillText(labels[1], x + cell / 2, y + cell / 2 + fontSize * 0.62);
  }

  for (let i = 0; i < 28; i += 1) {
    ctx.fillStyle = `rgba(0, 0, 0, ${random() * 0.07})`;
    ctx.fillRect(x + random() * cell, y + random() * cell, 1 + random() * 3, 1 + random() * 3);
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(x, y, cell, 4);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
  ctx.fillRect(x, y + cell - 4, cell, 4);
}

export function createSignAtlasTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(1024, 1024);
  const random = seeded(0x51a9c2);

  for (let index = 0; index < SIGN_ATLAS_COLUMNS * SIGN_ATLAS_ROWS; index += 1) {
    drawSignCell(ctx, index, random);
  }

  ctx.fillStyle = 'rgba(29, 33, 31, 0.28)';
  for (let i = 0; i <= SIGN_ATLAS_COLUMNS; i += 1) {
    ctx.fillRect(i * 256 - 2, 0, 4, 1024);
  }
  for (let i = 0; i <= SIGN_ATLAS_ROWS; i += 1) {
    ctx.fillRect(0, i * 256 - 2, 1024, 4);
  }

  return canvasTexture(canvas, { clamp: true, anisotropy: 8 });
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(128, 128);
  const gradient = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(14, 18, 17, 0.55)');
  gradient.addColorStop(0.45, 'rgba(14, 18, 17, 0.3)');
  gradient.addColorStop(1, 'rgba(14, 18, 17, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return canvasTexture(canvas, {
    clamp: true,
    colorSpace: THREE.NoColorSpace,
    anisotropy: 1,
  });
}

export function createCloudTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 128);
  const random = seeded(0xc10d5);
  for (let i = 0; i < 18; i += 1) {
    const x = 36 + random() * 184;
    const y = 42 + random() * 50;
    const radius = 18 + random() * 38;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.62)');
    gradient.addColorStop(0.6, 'rgba(255, 250, 240, 0.32)');
    gradient.addColorStop(1, 'rgba(255, 250, 240, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvasTexture(canvas, { clamp: true, anisotropy: 1 });
}

export function createBisleriLabelTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(512, 256);

  const background = ctx.createLinearGradient(0, 0, 0, 256);
  background.addColorStop(0, '#f7fdf9');
  background.addColorStop(0.62, '#eef9f2');
  background.addColorStop(1, '#dff2e6');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 512, 256);

  ctx.fillStyle = '#1f7a43';
  ctx.fillRect(0, 0, 512, 26);
  ctx.fillStyle = '#1b74c9';
  ctx.fillRect(0, 26, 512, 8);

  ctx.fillStyle = 'rgba(31, 122, 67, 0.12)';
  ctx.beginPath();
  ctx.moveTo(0, 206);
  ctx.bezierCurveTo(140, 170, 300, 244, 512, 190);
  ctx.lineTo(512, 256);
  ctx.lineTo(0, 256);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(27, 116, 201, 0.16)';
  ctx.beginPath();
  ctx.moveTo(0, 232);
  ctx.bezierCurveTo(170, 204, 330, 262, 512, 222);
  ctx.lineTo(512, 256);
  ctx.lineTo(0, 256);
  ctx.closePath();
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#0f7d3f';
  ctx.font = '900 96px "Arial Black", "Arial Narrow", sans-serif';
  ctx.fillText('Bisleri', 256, 118);

  ctx.fillStyle = '#1b74c9';
  ctx.font = '700 26px "Segoe UI", Arial, sans-serif';
  ctx.fillText('PACKAGED DRINKING WATER', 256, 184);

  ctx.fillStyle = 'rgba(15, 125, 63, 0.18)';
  for (let drop = 0; drop < 26; drop += 1) {
    const x = (drop * 89) % 512;
    const y = 46 + ((drop * 53) % 28);
    ctx.beginPath();
    ctx.arc(x, y, 2 + (drop % 3), 0, Math.PI * 2);
    ctx.fill();
  }

  return canvasTexture(canvas, { clamp: true, anisotropy: 4 });
}

export function createCocaColaLabelTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(512, 256);

  const background = ctx.createLinearGradient(0, 0, 0, 256);
  background.addColorStop(0, '#f01528');
  background.addColorStop(0.5, '#d40018');
  background.addColorStop(1, '#a80012');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 512, 256);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.beginPath();
  ctx.moveTo(0, 168);
  ctx.bezierCurveTo(150, 128, 340, 200, 512, 146);
  ctx.lineTo(512, 256);
  ctx.lineTo(0, 256);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, 214);
  ctx.bezierCurveTo(160, 178, 330, 238, 512, 196);
  ctx.lineTo(512, 256);
  ctx.lineTo(0, 256);
  ctx.closePath();
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font =
    'italic 900 92px "Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive';
  ctx.fillText('Coca-Cola', 256, 104);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.font = '700 22px "Segoe UI", Arial, sans-serif';
  ctx.fillText('ORIGINAL TASTE', 256, 156);

  ctx.fillStyle = 'rgba(90, 0, 8, 0.18)';
  ctx.fillRect(0, 0, 512, 14);
  ctx.fillRect(0, 242, 512, 14);

  return canvasTexture(canvas, { clamp: true, anisotropy: 4 });
}

export function createChipsWrapperTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(512, 512);
  const random = seeded(0x5eedc4);

  const background = ctx.createLinearGradient(0, 0, 512, 512);
  background.addColorStop(0, '#ffd21f');
  background.addColorStop(0.45, '#ff9d1f');
  background.addColorStop(1, '#f24d1f');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 512, 512);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  for (let i = 0; i < 26; i += 1) {
    const x = random() * 512;
    const y = random() * 512;
    ctx.beginPath();
    ctx.arc(x, y, 3 + random() * 12, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#0f6f5c';
  ctx.beginPath();
  ctx.moveTo(0, 92);
  ctx.quadraticCurveTo(256, 40, 512, 96);
  ctx.lineTo(512, 148);
  ctx.quadraticCurveTo(256, 100, 0, 150);
  ctx.closePath();
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff8e6';
  ctx.font = '900 62px "Arial Black", "Arial Narrow", sans-serif';
  ctx.fillText('CRUNCHY', 256, 78);

  ctx.fillStyle = '#b51d12';
  ctx.font = '900 88px "Arial Black", "Arial Narrow", sans-serif';
  ctx.fillText('MASALA', 256, 214);
  ctx.fillStyle = '#3a1908';
  ctx.font = '900 74px "Arial Black", "Arial Narrow", sans-serif';
  ctx.fillText('CHIPS', 256, 292);

  const chipColors = ['#f6cf63', '#eab545', '#f0c256'];
  for (let chip = 0; chip < 22; chip += 1) {
    const x = 40 + random() * 432;
    const y = 356 + random() * 128;
    const radius = 12 + random() * 20;
    ctx.fillStyle = chipColors[chip % chipColors.length];
    ctx.beginPath();
    ctx.ellipse(
      x,
      y,
      radius,
      radius * 0.62,
      random() * Math.PI,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.strokeStyle = 'rgba(150, 86, 20, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = '700 20px "Segoe UI", Arial, sans-serif';
  ctx.fillText('POTATO CHIPS', 256, 330);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.fillRect(0, 0, 512, 10);
  ctx.fillStyle = 'rgba(70, 24, 0, 0.22)';
  ctx.fillRect(0, 502, 512, 10);

  return canvasTexture(canvas, { clamp: true, anisotropy: 4 });
}

export function createRoadTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(512, 1024);
  const random = seeded(0x0ad5eed);
  ctx.fillStyle = '#3c4048';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  addGrain(ctx, random, canvas.width, canvas.height, 4500, 0.02, 0.12);
  addCracks(ctx, random, canvas.width, canvas.height, 6, 'rgba(20, 22, 26, 0.35)');

  ctx.fillStyle = 'rgba(238, 228, 200, 0.78)';
  ctx.fillRect(28, 0, 7, canvas.height);
  ctx.fillRect(canvas.width - 35, 0, 7, canvas.height);

  ctx.fillStyle = 'rgba(244, 238, 218, 0.62)';
  for (const x of [canvas.width / 3, (canvas.width * 2) / 3]) {
    for (let y = -40; y < canvas.height + 40; y += 150) {
      ctx.fillRect(x - 4, y, 8, 78);
    }
  }

  return canvasTexture(canvas, { repeat: [1, 2] });
}

export function createGlowTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(128, 128);

  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.22, 'rgba(255, 243, 194, 0.9)');
  gradient.addColorStop(0.55, 'rgba(255, 207, 92, 0.35)');
  gradient.addColorStop(1, 'rgba(255, 190, 50, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  return canvasTexture(canvas, { clamp: true });
}

const gateTextureCache = new Map<string, THREE.CanvasTexture>();
let gateGlowTexture: THREE.CanvasTexture | undefined;

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function createGateGlowTexture(): THREE.CanvasTexture {
  if (gateGlowTexture) return gateGlowTexture;

  const width = 960;
  const height = 540;
  const { canvas, ctx } = makeCanvas(width, height);
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 40;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.68)';
  roundedRect(ctx, 56, 34, width - 112, height - 68, 44);
  ctx.fill();

  gateGlowTexture = canvasTexture(canvas, { clamp: true });
  return gateGlowTexture;
}

export function createGateTexture(spec: GateSpec): THREE.CanvasTexture {
  const cacheKey = `${spec.operation}:${spec.value}:${spec.color}`;
  const cached = gateTextureCache.get(cacheKey);
  if (cached) return cached;

  const width = 960;
  const height = 540;
  const { canvas, ctx } = makeCanvas(width, height);

  roundedRect(ctx, 8, 8, width - 16, height - 16, 44);
  ctx.save();
  ctx.clip();

  const background = ctx.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, '#16293a');
  background.addColorStop(0.56, '#0b1a27');
  background.addColorStop(1, '#07101a');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const screen = ctx.createLinearGradient(0, 40, 0, height - 40);
  screen.addColorStop(0, '#0c2030');
  screen.addColorStop(0.6, '#091824');
  screen.addColorStop(1, '#060f18');
  ctx.fillStyle = screen;
  roundedRect(ctx, 40, 40, width - 80, height - 80, 34);
  ctx.fill();

  const sheen = ctx.createLinearGradient(0, 0, width * 0.8, height * 0.7);
  sheen.addColorStop(0, 'rgba(198, 226, 235, 0.09)');
  sheen.addColorStop(0.4, 'rgba(198, 226, 235, 0.025)');
  sheen.addColorStop(1, 'rgba(198, 226, 235, 0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, width, height);

  const colorWash = ctx.createRadialGradient(
    width / 2,
    height * 0.58,
    20,
    width / 2,
    height * 0.58,
    width * 0.56,
  );
  colorWash.addColorStop(0, spec.color);
  colorWash.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = colorWash;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = 'rgba(196, 220, 226, 0.58)';
  ctx.font = '600 27px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('R I V E R   C H E C K P O I N T', width / 2, 76);

  ctx.strokeStyle = 'rgba(198, 226, 235, 0.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width * 0.22, 116);
  ctx.lineTo(width * 0.78, 116);
  ctx.stroke();

  const value = `${spec.symbol}${spec.value}`;
  let fontSize = 262;
  ctx.font = `800 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
  while (ctx.measureText(value).width > width - 210 && fontSize > 150) {
    fontSize -= 8;
    ctx.font = `800 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
  }
  ctx.fillStyle = '#f4fffb';
  ctx.shadowColor = spec.color;
  ctx.shadowBlur = 24;
  ctx.fillText(value, width / 2, height * 0.54);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#e4f1f3';
  ctx.font = '700 56px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(spec.label, width / 2, height * 0.835);

  ctx.strokeStyle = spec.color;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(width * 0.42, height * 0.905);
  ctx.lineTo(width * 0.58, height * 0.905);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.restore();

  roundedRect(ctx, 8, 8, width - 16, height - 16, 44);
  ctx.shadowColor = spec.color;
  ctx.shadowBlur = 16;
  ctx.strokeStyle = spec.color;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;

  roundedRect(ctx, 20, 20, width - 40, height - 40, 36);
  ctx.strokeStyle = 'rgba(222, 240, 244, 0.2)';
  ctx.lineWidth = 2;
  ctx.stroke();

  roundedRect(ctx, 25, 25, width - 50, height - 50, 32);
  ctx.strokeStyle = spec.color;
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 1;

  const bracket = 30;
  const inset = 34;
  ctx.strokeStyle = 'rgba(214, 233, 238, 0.42)';
  ctx.lineWidth = 3;
  for (const corner of [
    [inset, inset, 1, 1],
    [width - inset, inset, -1, 1],
    [inset, height - inset, 1, -1],
    [width - inset, height - inset, -1, -1],
  ] as const) {
    const [x, y, dx, dy] = corner;
    ctx.beginPath();
    ctx.moveTo(x + dx * bracket, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * bracket);
    ctx.stroke();
  }

  const texture = canvasTexture(canvas, { clamp: true, anisotropy: 8 });
  gateTextureCache.set(cacheKey, texture);
  return texture;
}
