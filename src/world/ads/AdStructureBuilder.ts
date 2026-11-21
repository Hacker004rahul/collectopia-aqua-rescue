/**
 * AdStructureBuilder
 *
 * Procedural 3D builders for every advertising format.
 *
 * KEY GEOMETRY FACTS
 * ──────────────────
 * River edge:          8.8 m   (±8.8 m from centre)
 * Grassy bank outer edge: 14.5 m from centre
 * Riverside house fronts begin beyond the bank.
 *
 * RIVERSIDE BILLBOARD DESIGN
 * ─────────────────────────────────────────
 * All ad structures sit on the grassy banks beyond the water edge. Artwork is
 * raised and turned toward the river channel.
 *
 * Large branded faces remain readable from the boat without standing in water.
 *
 * LOGO ASPECT RATIO
 * ─────────────────
 * Native logo: 640 × 271 px  →  ratio 2.3616 : 1
 * Logo-only panels preserve that ratio; the large printed layout draws the
 * original artwork at the same ratio within its wider advertisement face.
 *
 * SIDE PLACEMENTS
 * ───────────────
 * Panel footprints stay inside the bank, including when angled toward the river.
 */
import * as THREE from 'three';
import {
  makeBuildingBoardTexture,
  makeShopfrontBoardTexture,
  makeLogoBillboardTexture,
  makePlinthTexture,
  getSpryntworksLogo,
} from './AdTextures';

export type AdFormatId =
  | 'gantry'
  | 'hoarding'
  | 'building-board'
  | 'shopfront-board'
  | 'premium-install';

// ─── scene geometry constants ─────────────────────────────────────────────────
const LOGO_RATIO      = 640 / 271;      // 2.3616
const BUILDING_FACE_X = 11.2;
const RIVER_EDGE_X    = 8.8;
const BANK_OUTER_X    = 14.5;
const PILLAR_X        = 2.5;
const VERGE_X         = 10.7;
const HOARDING_X      = 11.2;

// ─── material helpers ─────────────────────────────────────────────────────────

function std(
  color: number,
  roughness = 0.8,
  metalness = 0,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color, roughness, metalness,
    flatShading: false,
  });
}

function logoBillboardMat(panelW: number, panelH: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: makeLogoBillboardTexture(panelW, panelH),
    color: 0xffffff,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}

function box(
  w: number, h: number, d: number,
  x: number, y: number, z: number,
  mat: THREE.Material,
  cast = true,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

function plane(
  w: number, h: number,
  x: number, y: number, z: number,
  mat: THREE.Material,
  rotY = 0,
  receiveShadow = false,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  mesh.castShadow = false;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

/** Create a logo panel Material and register the async logo load. */
function logoMat(): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    toneMapped: false,
  });
  getSpryntworksLogo((texture) => {
    mat.map = texture;
    mat.needsUpdate = true;
  });
  return mat;
}

// ─── highway gantry ──────────────────────────────────────────────────────────

function buildGantry(): THREE.Group {
  const g = new THREE.Group();
  const steel   = std(0x4a5058, 0.45, 0.55);
  const steelDk = std(0x28292e, 0.60, 0.50);
  const footing = std(0x8a8680, 0.92);

  // Freestanding bank-side frame; it no longer spans or rests in the river.
  const pillarH  = 8.6;
  const beamY    = pillarH;          // beam sits at pillar top
  const beamSpan = PILLAR_X * 2 + 0.6;

  // Panel: sized to logo ratio, slightly smaller for realism
  const panelW   = 4.2;
  const panelH   = panelW * (271 / 640); // ~1.78 m
  const panelY   = beamY - 0.25 - panelH / 2;

  // Pillars with X-cross bracing (two diagonal boxes per side)
  for (const side of [-1, 1] as const) {
    const x = side * PILLAR_X;
    // Main vertical pillar
    g.add(box(0.26, pillarH, 0.26, x, pillarH / 2, 0, steel));
    // Concrete footing pad
    g.add(box(0.80, 0.30, 0.80, x, 0.15, 0, footing));
    // X-brace: two diagonal members (approximated as rotated boxes)
    const xb = new THREE.Mesh(new THREE.BoxGeometry(0.12, pillarH * 0.55, 0.12), steelDk);
    xb.position.set(x, pillarH * 0.38, 0.14);
    xb.rotation.z = side * 0.38;
    xb.castShadow = true;
    g.add(xb);
    const xb2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, pillarH * 0.55, 0.12), steelDk);
    xb2.position.set(x, pillarH * 0.38, -0.14);
    xb2.rotation.z = -side * 0.38;
    xb2.castShadow = true;
    g.add(xb2);
  }

  // Overhead I-beam (top flange / web / bottom flange)
  g.add(box(beamSpan, 0.18, 0.50, 0, beamY + 0.09, 0, steelDk)); // top flange
  g.add(box(beamSpan, 0.55, 0.16, 0, beamY - 0.28, 0, steelDk)); // web
  g.add(box(beamSpan, 0.14, 0.44, 0, beamY - 0.62, 0, steelDk)); // bottom flange

  // Vertical drop rods from beam bottom to panel top
  const rodTop    = beamY - 0.30;
  const rodBottom = panelY + panelH / 2;
  const rodH      = rodTop - rodBottom;
  for (const rx of [-panelW * 0.38, -panelW * 0.13, panelW * 0.13, panelW * 0.38]) {
    g.add(box(0.07, rodH, 0.07, rx, rodBottom + rodH / 2, -0.05, steel));
  }

  // Sign panel — dark frame + full-frame logo face
  const frame = std(0x0e1228, 0.52, 0.20);
  g.add(box(panelW + 0.20, panelH + 0.20, 0.24, 0, panelY, 0, frame));
  g.add(plane(panelW, panelH, 0, panelY, 0.13,
    logoBillboardMat(panelW, panelH), 0, true));
  g.add(plane(panelW, panelH, 0, panelY, -0.13,
    std(0x0e1228, 0.92), Math.PI));

  // Spotlights along top of panel
  const spotMat     = std(0x3a3a3a, 0.4, 0.6);
  const spotLensMat = std(0xffffee, 0.15, 0.05);
  for (const rx of [-panelW * 0.35, -panelW * 0.12, panelW * 0.12, panelW * 0.35]) {
    g.add(box(0.18, 0.13, 0.22, rx, panelY + panelH / 2 + 0.10, 0.05, spotMat));
    g.add(box(0.09, 0.07, 0.09, rx, panelY + panelH / 2 + 0.19, 0.09, spotLensMat));
  }

  return g;
}

// Hoarding panel: sized to logo's native 640:271 ratio so logo fills perfectly
const HOARDING_PANEL_W = 4.4;
const HOARDING_PANEL_H = HOARDING_PANEL_W * (271 / 640); // ~1.52 m

function buildHoarding(): THREE.Group {
  const g = new THREE.Group();
  const steel   = std(0x5a6068, 0.55, 0.42);
  const frame   = std(0x0e1228, 0.55, 0.18);
  const footing = std(0x99958d, 0.92);

  // Single centre post, panel sits at eye level
  const postH  = 4.0;
  const panelY = postH + HOARDING_PANEL_H / 2;

  // Single thick post centred
  g.add(box(0.18, postH, 0.18, 0, postH / 2, -0.08, steel));
  g.add(box(0.56, 0.24, 0.56, 0, 0.12, -0.08, footing));
  // Horizontal back brace
  g.add(box(HOARDING_PANEL_W * 0.7, 0.10, 0.10, 0, panelY - HOARDING_PANEL_H * 0.3, -0.18, steel));

  // Panel
  g.add(box(HOARDING_PANEL_W + 0.16, HOARDING_PANEL_H + 0.16, 0.18, 0, panelY, 0, frame));
  g.add(plane(HOARDING_PANEL_W, HOARDING_PANEL_H, 0, panelY, 0.10,
    logoBillboardMat(HOARDING_PANEL_W, HOARDING_PANEL_H), 0, true));
  g.add(plane(HOARDING_PANEL_W, HOARDING_PANEL_H, 0, panelY, -0.10,
    std(0x0e1228, 0.92), Math.PI));

  return g;
}

// ─── building board builder ───────────────────────────────────────────────────

function buildBuildingBoard(): THREE.Group {
  const g = new THREE.Group();

  const accentPalette = [0xc41e88, 0x1a56c4, 0x1aa852, 0xc47a1a];
  const accent = accentPalette[Math.floor(Math.random() * accentPalette.length)];
  const accentHex = '#' + accent.toString(16).padStart(6, '0');

  const panelH = 1.52;
  const panelW = panelH * LOGO_RATIO;  // 3.59 m
  const mountH = 4.8;

  // independent steel posts and footings (the board no longer floats)
  const bMat = std(0x2a2e2c, 0.70, 0.32);
  const footMat = std(0x8a8580, 0.94, 0);
  for (const px of [-panelW * 0.32, panelW * 0.32]) {
    g.add(box(0.12, mountH, 0.12, px, mountH / 2, 0.02, bMat));
    g.add(box(0.5, 0.16, 0.5, px, 0.08, 0.02, footMat));
    g.add(box(0.08, 0.5, 0.5, px, mountH, 0.06, bMat));
  }

  // panel shell
  g.add(box(panelW + 0.22, panelH + 0.22, 0.12, 0, mountH, 0.06, std(0x181818, 0.9)));

  // board background
  const boardBg = new THREE.MeshStandardMaterial({
    map: makeBuildingBoardTexture(accentHex), roughness: 0.82, metalness: 0,
    color: 0xffffff,
  });
  g.add(plane(panelW + 0.1, panelH + 0.1, 0, mountH, 0.13, boardBg));

  // logo face
  const lm = logoMat();
  const fp = plane(panelW, panelH, 0, mountH, 0.19, lm);
  fp.name = 'adLogoPanel';
  g.add(fp);

  return g;
}

// ─── shopfront board builder ──────────────────────────────────────────────────

function buildShopfrontBoard(): THREE.Group {
  const g = new THREE.Group();

  const taglines = ['The Sprint Starts Here', 'India Runs Forward', 'Speed. Earn. Repeat.'];
  const tagline  = taglines[Math.floor(Math.random() * taglines.length)];
  const bgPalette = ['#c41e88', '#1a56c4', '#0a7c3c', '#8b1a1a'];
  const bg        = bgPalette[Math.floor(Math.random() * bgPalette.length)];

  const panelH = 1.0;
  const panelW = panelH * LOGO_RATIO;  // 2.362 m
  const mountH = 3.5;

  // independent posts and footings
  const postMat = std(0x242826, 0.72, 0.28);
  const footMat = std(0x87827c, 0.94, 0);
  for (const px of [-panelW * 0.32, panelW * 0.32]) {
    g.add(box(0.1, mountH, 0.1, px, mountH / 2, 0, postMat));
    g.add(box(0.42, 0.14, 0.42, px, 0.07, 0, footMat));
  }

  // shell
  g.add(box(panelW + 0.16, panelH + 0.16, 0.14, 0, mountH, 0, std(0x111111, 0.9)));

  // background face
  const boardBg = new THREE.MeshStandardMaterial({
    map: makeShopfrontBoardTexture(bg, tagline), roughness: 0.86, metalness: 0,
    color: 0xffffff,
  });
  g.add(plane(panelW + 0.06, panelH + 0.06, 0, mountH, 0.08, boardBg));

  // logo face (left half of board)
  const lm = logoMat();
  const fp = plane(panelW * 0.44, panelH * 0.44, -panelW * 0.22, mountH, 0.11, lm);
  fp.name = 'adLogoPanel';
  g.add(fp);

  return g;
}

// ─── premium install builder ──────────────────────────────────────────────────

function buildPremiumInstall(): THREE.Group {
  const g = new THREE.Group();

  const plinthMat = new THREE.MeshStandardMaterial({
    map: makePlinthTexture(), roughness: 0.38, metalness: 0.34, color: 0xffffff,
  });
  const totemMat  = std(0x0c0d18, 0.48, 0.22);
  const capMat    = std(0x1e2028, 0.36, 0.44);

  const totemW = 1.4;
  const totemH = 5.4;
  const panelH = totemH * 0.42;         // 2.1 m
  const panelW = panelH * LOGO_RATIO;   // 4.96 m — NB: wider than totem; fits on face

  // plinth
  g.add(box(totemW + 0.6, 0.52, 0.64, 0, 0.26, 0, plinthMat));
  g.add(box(totemW + 0.4, 0.14, 0.52, 0, 0.59, 0, capMat));

  // totem body
  g.add(box(totemW, totemH, 0.30, 0, totemH / 2 + 0.52, 0, totemMat));

  // logo panel — centred vertically on totem
  const lm = logoMat();
  const panelY = totemH / 2 + 0.52 + 0.2;
  // constrain panel width to fit totem face width + small overhang
  const clampedW = Math.min(panelW, totemW + 0.2);
  const clampedH = clampedW / LOGO_RATIO;
  const fp = plane(clampedW, clampedH, 0, panelY, 0.19, lm);
  fp.name = 'adLogoPanel';
  g.add(fp);

  // top cap
  g.add(box(totemW + 0.1, 0.16, 0.38, 0, totemH + 0.52, 0, capMat));

  return g;
}

// ─── public API ───────────────────────────────────────────────────────────────

export function buildAdStructure(format: AdFormatId, _side: -1 | 1): THREE.Group {
  switch (format) {
    case 'gantry':          return buildGantry();
    case 'hoarding':        return buildHoarding();
    case 'building-board':  return buildBuildingBoard();
    case 'shopfront-board': return buildShopfrontBoard();
    case 'premium-install': return buildPremiumInstall();
  }
}

/**
 * Lateral X offset from river centre for each format.
 * Even the widest angled panel remains within the grassy banks.
 */
export const AD_SIDE_OFFSET: Record<AdFormatId, number> = {
  'gantry':          11.5,
  'hoarding':        HOARDING_X,
  'building-board':  VERGE_X,
  'shopfront-board': VERGE_X,
  'premium-install': VERGE_X,
};

export const AD_BUILDING_FACE_X    = BUILDING_FACE_X;
export const AD_RIVER_EDGE_X      = RIVER_EDGE_X;
export const AD_BANK_OUTER_X      = BANK_OUTER_X;
export const AD_SIDEWALK_OUTER_X   = 7.36;
export const AD_PLAYER_FACING_LEAN = 0.5;
export const AD_HOARDING_PANEL_WIDTH  = HOARDING_PANEL_W;
export const AD_HOARDING_PANEL_HEIGHT = HOARDING_PANEL_H;
