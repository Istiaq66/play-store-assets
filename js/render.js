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

  if (s.decor !== 'none') circle(ctx, 790, 400, 150, s.accent);
  if (s.decor === 'sunrise') {
    ctx.save();
    ctx.translate(790, 400);
    ctx.fillStyle = s.accent;
    for (const deg of [-60, -30, 0, 30, 60]) {
      ctx.save();
      ctx.rotate((deg * Math.PI) / 180);
      ctx.beginPath();
      ctx.roundRect(-5, -208, 10, 34, 5);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

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

  if (s.decor === 'sunrise') {
    hill(ctx, 512, 522, 592, 130, H, mix(s.background, '#ffffff', 0.3));
    hill(ctx, 832, 550, 452, 130, H, mix(s.background, '#000000', 0.35));
  }

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
  if (s.decor !== 'none') circle(ctx, W * 0.87, 0, W * 0.065, s.accent);

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
