// Draws each Play Store asset onto a canvas. Every function takes the
// settings `s` and loaded assets `a`, and returns a list of problems
// (empty when the result is clean).
import { fitText } from './text.js';

export const SIZES = {
  icon: [512, 512],
  feature: [1024, 500],
  screenshot: [1080, 1920],
};

// ---------------------------------------------------------------- helpers

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mixes `a` toward `b` by `t` (0..1). */
export function mix(a, b, t) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const c = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

function font(s, weight, size) {
  return `${weight} ${size}px ${s.fontFamily ? `"${s.fontFamily}", ` : ''}system-ui, sans-serif`;
}

function setType(ctx, s, weight, size, tracking = 0) {
  ctx.font = font(s, weight, size);
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${tracking * size}px`;
}

const measureWith = (ctx, s, weight, tracking) => (size) => {
  setType(ctx, s, weight, size, tracking);
  return (str) => ctx.measureText(str).width;
};

/** Draws `img` scaled to fit inside the box, centred. */
function drawContain(ctx, { img, w, h }, x, y, bw, bh) {
  const k = Math.min(bw / w, bh / h);
  const dw = w * k;
  const dh = h * k;
  ctx.drawImage(img, x + (bw - dw) / 2, y + (bh - dh) / 2, dw, dh);
}

function circle(ctx, cx, cy, r, color) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/** Upper half of an ellipse plus everything below it: a hill. */
function hill(ctx, cx, cy, rx, ry, bottom, color) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0);
  ctx.lineTo(cx + rx, bottom);
  ctx.lineTo(cx - rx, bottom);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function withShadow(ctx, color, blur, offsetY, draw) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = offsetY;
  draw();
  ctx.restore();
}

function rgba(hex, alpha) {
  return `rgba(${hexToRgb(hex).join(',')},${alpha})`;
}

/** A small seeded PRNG (mulberry32), so scattered decorations stay put. */
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Up to `n` seeded points in W×H, kept only where `ok(x, y)`. */
function scatter(seed, n, W, H, ok) {
  const r = rng(seed);
  const pts = [];
  for (let tries = 0; pts.length < n && tries < n * 50; tries++) {
    const x = r() * W;
    const y = r() * H;
    if (ok(x, y)) pts.push({ x, y, k: r(), t: r() });
  }
  return pts;
}

/** A four-pointed star. */
function sparkle(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fillStyle = color;
  ctx.fill();
}

/** A circle with a bite taken out of its upper right. */
function crescent(ctx, cx, cy, r, color) {
  const bx = cx + r * 0.42;
  const by = cy - r * 0.28;
  const br = r * 0.86;
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - r * 2, cy - r * 2, r * 4, r * 4);
  ctx.moveTo(bx + br, by);
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.clip('evenodd');
  circle(ctx, cx, cy, r, color);
  ctx.restore();
}

/** A sine wave across the full width, filled down (or up) to `edge`. */
function wave(ctx, W, y, amp, len, phase, edge, color) {
  ctx.beginPath();
  ctx.moveTo(0, edge);
  for (let x = 0; x <= W; x += 8) ctx.lineTo(x, y + amp * Math.sin((x / len) * Math.PI * 2 + phase));
  ctx.lineTo(W, edge);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function glow(ctx, cx, cy, r, color, alpha) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}

/** Concentric outlines, thinning and fading outward. */
function rings(ctx, cx, cy, radii, width, color) {
  ctx.save();
  ctx.strokeStyle = color;
  const base = ctx.globalAlpha;
  radii.forEach((r, i) => {
    ctx.globalAlpha = base * (0.85 - (i * 0.6) / radii.length);
    ctx.lineWidth = width * (1 - (i * 0.5) / radii.length);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.restore();
}

/** A band slanting up to the right; `x` is where its left edge meets `bottom`. */
function slant(ctx, x, width, bottom, run, color) {
  ctx.beginPath();
  ctx.moveTo(x, bottom);
  ctx.lineTo(x + width, bottom);
  ctx.lineTo(x + width + run, 0);
  ctx.lineTo(x + run, 0);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function confettiPiece(ctx, p, size, colors) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.t * Math.PI);
  ctx.fillStyle = colors[Math.floor(p.t * colors.length)];
  ctx.beginPath();
  if (p.k < 0.4) ctx.arc(0, 0, size * 0.45, 0, Math.PI * 2);
  else if (p.k < 0.75) ctx.roundRect(-size * 0.25, -size * 0.6, size * 0.5, size * 1.2, size * 0.2);
  else {
    ctx.moveTo(0, -size * 0.55);
    ctx.lineTo(size * 0.5, size * 0.4);
    ctx.lineTo(-size * 0.5, size * 0.4);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------ decorations
// Each style may draw on the feature graphic behind the phone (`feature`),
// in front of it (`featureFront`), and on the screenshots (`screenshot`).
// The feature graphic's copy sits left of FEATURE_TEXT_RIGHT, between
// y≈110 and y≈390, and the phone is centred on x=818. On screenshots the
// caption fills the top band. Decorations stay out of both.
// Keys match the <option> values in index.html. Draw through `paintDecor`,
// which resolves `s.decorColor` and applies the intensity.

const FEATURE_TEXT_RIGHT = 640;

function paintDecor(ctx, s, part, geometry) {
  const draw = (DECORATIONS[s.decor] ?? DECORATIONS.none)[part];
  if (!draw) return;
  ctx.save();
  ctx.globalAlpha = s.decorOpacity ?? 1;
  draw(ctx, { ...s, decorColor: s.decorMatchAccent === false ? s.decorColor : s.accent }, geometry);
  ctx.restore();
}

export const DECORATIONS = {
  sunrise: {
    feature(ctx, s) {
      circle(ctx, 790, 400, 150, s.decorColor);
      ctx.save();
      ctx.translate(790, 400);
      ctx.fillStyle = s.decorColor;
      for (const deg of [-60, -30, 0, 30, 60]) {
        ctx.save();
        ctx.rotate((deg * Math.PI) / 180);
        ctx.beginPath();
        ctx.roundRect(-5, -208, 10, 34, 5);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    },
    featureFront(ctx, s, { H }) {
      hill(ctx, 512, 522, 592, 130, H, mix(s.background, '#ffffff', 0.3));
      hill(ctx, 832, 550, 452, 130, H, mix(s.background, '#000000', 0.35));
    },
    screenshot(ctx, s, { W }) {
      circle(ctx, W * 0.87, 0, W * 0.065, s.decorColor);
    },
  },

  circle: {
    feature(ctx, s) {
      circle(ctx, 790, 400, 150, s.decorColor);
    },
    screenshot(ctx, s, { W }) {
      circle(ctx, W * 0.87, 0, W * 0.065, s.decorColor);
    },
  },

  rings: {
    feature(ctx, s, { W, H }) {
      rings(ctx, W, H, [130, 190, 250, 310, 370], 12, s.decorColor);
    },
    screenshot(ctx, s, { W }) {
      rings(ctx, W, 0, [W * 0.07, W * 0.11, W * 0.15], 10, s.decorColor);
    },
  },

  waves: {
    featureFront(ctx, s, { W, H }) {
      wave(ctx, W, 440, 12, 420, 0.5, H, mix(s.background, s.decorColor, 0.45));
      wave(ctx, W, 462, 10, 330, 2.4, H, s.decorColor);
      wave(ctx, W, 482, 7, 260, 4.1, H, mix(s.background, '#000000', 0.3));
    },
    screenshot(ctx, s, { W }) {
      wave(ctx, W, 52, 14, 560, 0.5, 0, mix(s.background, s.decorColor, 0.4));
      wave(ctx, W, 26, 10, 420, 2.4, 0, s.decorColor);
    },
  },

  dots: {
    feature(ctx, s, { W, H }) {
      // Halftone: dots grow toward the right edge.
      ctx.fillStyle = rgba(s.decorColor, 0.7);
      for (let x = FEATURE_TEXT_RIGHT + 11; x < W; x += 22) {
        const r = 1 + 5 * ((x - FEATURE_TEXT_RIGHT) / (W - FEATURE_TEXT_RIGHT));
        for (let y = 11; y < H; y += 22) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
    screenshot(ctx, s, { W }) {
      // Halftone triangle in the top-right corner.
      const reach = W * 0.3;
      ctx.fillStyle = rgba(s.decorColor, 0.75);
      for (let x = W - 14; x > W - reach; x -= 28) {
        for (let y = 14; y < reach; y += 28) {
          const d = (W - x + y) / reach;
          if (d >= 1) continue;
          ctx.beginPath();
          ctx.arc(x, y, 1.5 + 6 * (1 - d), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
  },

  glow: {
    feature(ctx, s) {
      glow(ctx, 0, 0, 340, mix(s.background, '#ffffff', 0.5), 0.18);
      glow(ctx, 818, 290, 380, s.decorColor, 0.6);
    },
    screenshot(ctx, s, { W, H }) {
      glow(ctx, W, 0, W * 0.5, s.decorColor, 0.5);
      glow(ctx, 0, H, W * 0.6, s.decorColor, 0.35);
    },
  },

  stripes: {
    feature(ctx, s, { H }) {
      slant(ctx, 560, 150, H, 300, s.decorColor);
      slant(ctx, 736, 26, H, 300, mix(s.background, s.decorColor, 0.5));
      slant(ctx, 790, 10, H, 300, mix(s.background, s.decorColor, 0.5));
    },
    screenshot(ctx, s, { W }) {
      ctx.save();
      ctx.translate(W, 0);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = s.decorColor;
      ctx.fillRect(-W, W * 0.11, W * 2, W * 0.06);
      ctx.fillStyle = mix(s.background, s.decorColor, 0.5);
      ctx.fillRect(-W, W * 0.2, W * 2, W * 0.015);
      ctx.restore();
    },
  },

  confetti: {
    feature(ctx, s, { W, H }) {
      const colors = [s.decorColor, mix(s.decorColor, '#ffffff', 0.45), mix(s.background, '#ffffff', 0.35)];
      const ok = (x, y) => x > FEATURE_TEXT_RIGHT || y < 60 || y > 440;
      for (const p of scatter(7, 36, W, H, ok)) confettiPiece(ctx, p, 14 + p.k * 10, colors);
    },
    screenshot(ctx, s, { W, H, side, band }) {
      const colors = [s.decorColor, mix(s.decorColor, '#ffffff', 0.45), mix(s.background, '#ffffff', 0.35)];
      const ok = (x, y) => y < 64 || (y > band && (x < side - 22 || x > W - side + 22));
      for (const p of scatter(11, 40, W, H, ok)) confettiPiece(ctx, p, 20 + p.k * 14, colors);
    },
  },

  night: {
    feature(ctx, s, { W, H }) {
      const star = mix(s.decorColor, '#ffffff', 0.5);
      const ok = (x, y) => (x > FEATURE_TEXT_RIGHT || y < 100) && Math.hypot(x - 660, y - 70) > 70;
      for (const p of scatter(3, 30, W, H, ok)) {
        if (p.k < 0.5) circle(ctx, p.x, p.y, 1.5 + p.t * 1.5, rgba(star, 0.7));
        else sparkle(ctx, p.x, p.y, 5 + p.t * 7, star);
      }
      crescent(ctx, 660, 70, 38, s.decorColor);
    },
    screenshot(ctx, s, { W, H, side, band }) {
      const star = mix(s.decorColor, '#ffffff', 0.5);
      const [mx, my] = [W * 0.88, 58];
      const ok = (x, y) =>
        (y < 80 || (y > band && (x < side - 16 || x > W - side + 16))) && Math.hypot(x - mx, y - my) > 70;
      for (const p of scatter(5, 34, W, H, ok)) {
        if (p.k < 0.5) circle(ctx, p.x, p.y, 2 + p.t * 2, rgba(star, 0.7));
        else sparkle(ctx, p.x, p.y, 7 + p.t * 9, star);
      }
      crescent(ctx, mx, my, 36, s.decorColor);
    },
  },

  none: {},
};

// ------------------------------------------------------------------- icon

export function drawIcon(ctx, s, a) {
  const [W, H] = SIZES.icon;
  const problems = [];
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = s.iconBackground;
  ctx.fillRect(0, 0, W, H);
  const src = a.iconImage ?? a.logo;
  if (!src) return ['add a logo'];
  const pad = W * s.iconPadding;
  const box = W - pad * 2;
  drawContain(ctx, src, pad, pad, box, box);
  if (!src.vector && Math.max(src.w, src.h) < box * 0.9) {
    problems.push(`source image is ${src.w}×${src.h}px, so the icon will look soft; use an SVG or a ${Math.ceil(box)}px+ image`);
  }
  return problems;
}

// -------------------------------------------------------- feature graphic

export function drawFeature(ctx, s, a) {
  const [W, H] = SIZES.feature;
  const problems = [];
  const shot = a.screens[s.featureScreen] ?? a.screens[0];
  const phoneTop = s.decor === 'sunrise' ? 58 : 70;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = s.background;
  ctx.fillRect(0, 0, W, H);
  paintDecor(ctx, s, 'feature', { W, H });

  if (shot) {
    const x = 700;
    const y = phoneTop;
    withShadow(ctx, 'rgba(0,0,0,0.35)', 48, 24, () => {
      ctx.beginPath();
      ctx.roundRect(x, y, 236, 512, 34);
      ctx.fillStyle = s.frame;
      ctx.fill();
    });
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x + 9, y + 9, 218, 494, 26);
    ctx.clip();
    ctx.drawImage(shot.img, x + 9, y + 9, 218, (218 * shot.h) / shot.w);
    ctx.restore();
  }

  paintDecor(ctx, s, 'featureFront', { W, H });

  // Copy block, centred vertically on the left.
  const left = 72;
  const width = shot ? 540 : 880;
  const tile = a.logo ? 76 : 0;
  const nameWidth = width - (tile ? tile + 18 : 0);
  const name = fitText(s.name || ' ', { max: 58, min: 34, maxWidth: nameWidth, maxLines: 1 }, measureWith(ctx, s, 800, -0.02));
  if (!name.fits) problems.push('app name is too long for the feature graphic');

  setType(ctx, s, 500, 30);
  const tagLines = [];
  for (const para of (s.tagline || '').split('\n')) {
    if (!para.trim()) continue;
    const words = para.trim().split(/\s+/);
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (ctx.measureText(next).width <= width || !line) line = next;
      else {
        tagLines.push(line);
        line = w;
      }
    }
    tagLines.push(line);
  }
  if (tagLines.length > 3) problems.push('tagline runs over 3 lines on the feature graphic');
  const shownTag = tagLines.slice(0, 3);

  const rowH = Math.max(tile, name.size * 1.05);
  const blockH = rowH + (shownTag.length ? 26 + shownTag.length * 39 : 0);
  const top = Math.round((H - blockH) / 2);

  if (a.logo) {
    ctx.beginPath();
    ctx.roundRect(left, top + (rowH - tile) / 2, tile, tile, 18);
    ctx.fillStyle = s.logoTile;
    ctx.fill();
    drawContain(ctx, a.logo, left + 6, top + (rowH - tile) / 2 + 6, tile - 12, tile - 12);
  }
  setType(ctx, s, 800, name.size, -0.02);
  ctx.fillStyle = s.text;
  ctx.textBaseline = 'middle';
  ctx.fillText(name.lines[0] ?? '', left + (tile ? tile + 18 : 0), top + rowH / 2);

  setType(ctx, s, 500, 30);
  ctx.fillStyle = s.muted;
  ctx.textBaseline = 'top';
  shownTag.forEach((l, i) => ctx.fillText(l, left, top + rowH + 26 + i * 39));
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

  if (!shot) problems.push('no screenshot: the feature graphic shows text only');
  return problems;
}

// --------------------------------------------------- captioned screenshot

export function drawScreenshot(ctx, s, shot) {
  const [W, H] = SIZES.screenshot;
  const problems = [];
  const side = Math.round(W * 0.0926);
  const band = Math.round(H * 0.185);
  const radius = W * 0.044;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = s.background;
  ctx.fillRect(0, 0, W, H);
  paintDecor(ctx, s, 'screenshot', { W, H, side, band });

  // Caption: up to two balanced lines, vertically centred in the band.
  const max = Math.round(W * 0.07);
  const cap = fitText(
    shot.caption || ' ',
    { max, min: Math.round(max * 0.6), maxWidth: W - side * 2, maxLines: 2 },
    measureWith(ctx, s, 800, -0.02),
  );
  if (!cap.fits) problems.push('caption is too long to fit on two lines');
  setType(ctx, s, 800, cap.size, -0.02);
  ctx.fillStyle = s.text;
  ctx.textBaseline = 'middle';
  const lh = cap.size * 1.1;
  const firstY = band / 2 - ((cap.lines.length - 1) * lh) / 2;
  cap.lines.forEach((l, i) => ctx.fillText(l, side, firstY + i * lh));
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

  // Screen: runs off the bottom edge; only the top corners are rounded.
  const sw = W - side * 2;
  const sh = (sw * shot.h) / shot.w;
  const path = () => {
    ctx.beginPath();
    ctx.roundRect(side, band, sw, Math.max(sh, H - band), [radius, radius, 0, 0]);
  };
  withShadow(ctx, 'rgba(0,0,0,0.3)', 60, -10, () => {
    path();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  });
  ctx.save();
  path();
  ctx.clip();
  ctx.drawImage(shot.img, side, band, sw, sh);
  ctx.restore();

  if (shot.w < sw * 0.9) problems.push(`screenshot is only ${shot.w}px wide and will look soft; capture at 1080px or wider`);
  if (band + sh < H - 2) problems.push('screenshot is shorter than the frame; the bottom will show white');
  return problems;
}
