import { drawFeature, drawIcon, drawScreenshot, SIZES } from './render.js';
import { encodeRgbPng, pngInfo } from './png.js';
import { checkAsset } from './rules.js';
import { zip } from './zip.js';

const STORE_KEY = 'play-store-assets:settings:v1';

const DEFAULTS = {
  name: 'Your App',
  tagline: 'Say what it does.\nThen why it matters.',
  background: '#0f5233',
  text: '#f4f5eb',
  muted: '#d7e8dc',
  accent: '#e0ac4a',
  iconBackground: '#f4f5eb',
  logoTile: '#f4f5eb',
  frame: '#0b1a12',
  decor: 'sunrise',
  iconPadding: 0.12,
};

/** Settings are plain, persisted values; assets are loaded images. */
const settings = { ...DEFAULTS, fontFamily: null, featureScreen: 0 };
const assets = { logo: null, iconImage: null, screens: [] };

const $ = (sel) => document.querySelector(sel);
const form = $('#setup');

// ------------------------------------------------------------- persistence

function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    for (const k of Object.keys(DEFAULTS)) if (k in saved) settings[k] = saved[k];
  } catch {
    // Private mode or blocked storage: start from defaults.
  }
}

function save() {
  try {
    const out = {};
    for (const k of Object.keys(DEFAULTS)) out[k] = settings[k];
    localStorage.setItem(STORE_KEY, JSON.stringify(out));
  } catch {
    // Not fatal; settings just won't be remembered.
  }
}

// ----------------------------------------------------------------- loading

let fontSeq = 0;

async function loadFont(source) {
  const family = `BrandFont${++fontSeq}`;
  const face = new FontFace(family, source, { weight: '100 900' });
  document.fonts.add(await face.load());
  settings.fontFamily = family;
}

async function loadImage(blob, name = '') {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  await img.decode();
  const vector = blob.type === 'image/svg+xml' || /\.svg$/i.test(name);
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (vector) {
    // An SVG with only a viewBox has no reliable intrinsic size; use its
    // aspect ratio, since it is drawn as a vector at any size anyway.
    const m = (await blob.text()).match(/viewBox\s*=\s*["'][^"']*?([\d.]+)[\s,]+([\d.]+)\s*["']/i);
    if (m) {
      w = 1024;
      h = Math.round((1024 * Number(m[2])) / Number(m[1]));
    } else if (!w || !h) {
      w = h = 1024;
    }
  }
  return { img, w, h, vector, url, name };
}

function captionFromName(name) {
  return name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/^\d+[-_ ]*/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}

async function addScreens(files) {
  for (const f of files) {
    try {
      const shot = await loadImage(f, f.name);
      shot.caption = captionFromName(f.name);
      assets.screens.push(shot);
    } catch {
      alert(`Could not read ${f.name} as an image.`);
    }
  }
  renderScreenList();
  schedule();
}

// --------------------------------------------------------------- the form

function syncForm() {
  for (const el of form.elements) {
    if (!el.name || !(el.name in settings)) continue;
    el.value = settings[el.name];
  }
  $('#padding-out').textContent = `${Math.round(settings.iconPadding * 100)}%`;
}

form.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.name || !(el.name in DEFAULTS)) return;
  settings[el.name] = el.type === 'range' ? Number(el.value) : el.value;
  if (el.name === 'iconPadding') $('#padding-out').textContent = `${Math.round(settings.iconPadding * 100)}%`;
  save();
  schedule();
});

$('#font-file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    await loadFont(await f.arrayBuffer());
    schedule();
  } catch {
    alert(`Could not load ${f.name} as a font.`);
  }
});

$('#logo-file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  assets.logo = await loadImage(f, f.name);
  schedule();
});

$('#icon-file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  assets.iconImage = await loadImage(f, f.name);
  schedule();
});

$('#screens-file').addEventListener('change', (e) => {
  addScreens([...e.target.files]);
  e.target.value = '';
});

function renderScreenList() {
  const list = $('#screen-list');
  list.replaceChildren();
  if (settings.featureScreen >= assets.screens.length) settings.featureScreen = 0;
  assets.screens.forEach((shot, i) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <img alt="">
      <label>Caption ${i + 1}<input type="text" maxlength="60"></label>
      <div class="row">
        <button type="button" class="secondary" data-act="up" aria-label="Move up">↑</button>
        <button type="button" class="secondary" data-act="down" aria-label="Move down">↓</button>
        <button type="button" class="secondary" data-act="remove">Remove</button>
        <label><input type="radio" name="feature-shot"> On feature graphic</label>
      </div>`;
    li.querySelector('img').src = shot.url;
    const cap = li.querySelector('input[type="text"]');
    cap.value = shot.caption;
    cap.addEventListener('input', () => {
      shot.caption = cap.value;
      schedule();
    });
    const radio = li.querySelector('input[type="radio"]');
    radio.checked = i === settings.featureScreen;
    radio.addEventListener('change', () => {
      settings.featureScreen = i;
      schedule();
    });
    li.querySelector('[data-act="up"]').disabled = i === 0;
    li.querySelector('[data-act="down"]').disabled = i === assets.screens.length - 1;
    li.addEventListener('click', (ev) => {
      const act = ev.target.dataset?.act;
      if (!act) return;
      const s = assets.screens;
      if (act === 'remove') {
        URL.revokeObjectURL(s[i].url);
        s.splice(i, 1);
      } else {
        const j = act === 'up' ? i - 1 : i + 1;
        [s[i], s[j]] = [s[j], s[i]];
        if (settings.featureScreen === i) settings.featureScreen = j;
        else if (settings.featureScreen === j) settings.featureScreen = i;
      }
      renderScreenList();
      schedule();
    });
    list.append(li);
  });
}

// --------------------------------------------------------------- rendering

let pending = false;

function schedule() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    renderAll();
  });
}

function setStatus(el, problems, okText = 'Meets Google Play requirements') {
  el.textContent = problems.length ? problems.join(' · ') : okText;
  el.className = `status ${problems.length ? 'warn' : 'ok'}`;
}

const shotCanvases = [];

function renderAll() {
  setStatus($('#icon-status'), drawIcon($('#icon-canvas').getContext('2d'), settings, assets));
  setStatus($('#feature-status'), drawFeature($('#feature-canvas').getContext('2d'), settings, assets));

  const host = $('#shots');
  while (shotCanvases.length > assets.screens.length) shotCanvases.pop().wrap.remove();
  while (shotCanvases.length < assets.screens.length) {
    const i = shotCanvases.length;
    const wrap = document.createElement('div');
    wrap.className = 'shot';
    const canvas = document.createElement('canvas');
    [canvas.width, canvas.height] = SIZES.screenshot;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'secondary';
    btn.textContent = 'Download';
    btn.addEventListener('click', () => downloadOne('screenshot', i));
    const status = document.createElement('p');
    wrap.append(canvas, btn, status);
    host.append(wrap);
    shotCanvases.push({ wrap, canvas, status });
  }
  assets.screens.forEach((shot, i) => {
    const { canvas, status } = shotCanvases[i];
    canvas.setAttribute('aria-label', `Screenshot ${i + 1}: ${shot.caption}`);
    setStatus(status, drawScreenshot(canvas.getContext('2d'), settings, shot), 'Ready');
  });
  $('#shots-empty').hidden = assets.screens.length > 0;
}

// ----------------------------------------------------------------- export

const slug = (s) =>
  (s || 'app')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'app';

async function encode(kind, canvas) {
  const { width, height } = canvas;
  const rgba = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  const png = await encodeRgbPng(rgba, width, height);
  return { png, problems: checkAsset(kind, { ...pngInfo(png), bytes: png.length }) };
}

function jobs() {
  const base = slug(settings.name);
  const list = [
    { kind: 'icon', canvas: $('#icon-canvas'), name: `${base}-icon-512.png` },
    { kind: 'feature', canvas: $('#feature-canvas'), name: `${base}-feature-graphic-1024x500.png` },
  ];
  assets.screens.forEach((shot, i) => {
    list.push({
      kind: 'screenshot',
      canvas: shotCanvases[i].canvas,
      name: `screenshots/${String(i + 1).padStart(2, '0')}-${slug(shot.caption)}.png`,
    });
  });
  return list;
}

function saveFile(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function downloadOne(kind, index = 0) {
  renderAll();
  const job = jobs().filter((j) => j.kind === kind)[index];
  if (!job) return;
  const { png, problems } = await encode(job.kind, job.canvas);
  if (problems.length) alert(`${job.name}:\n${problems.join('\n')}`);
  saveFile(png, job.name.replace('screenshots/', ''), 'image/png');
}

document.querySelectorAll('[data-download]').forEach((b) =>
  b.addEventListener('click', () => downloadOne(b.dataset.download)),
);

$('#download-all').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Preparing…';
  try {
    renderAll();
    const files = [];
    const problems = [];
    for (const job of jobs()) {
      const r = await encode(job.kind, job.canvas);
      files.push({ name: job.name, data: r.png });
      problems.push(...r.problems.map((p) => `${job.name}: ${p}`));
    }
    if (problems.length) alert(`Some assets do not meet Google Play's requirements:\n${problems.join('\n')}`);
    saveFile(zip(files), `${slug(settings.name)}-play-assets.zip`, 'application/zip');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Download all (.zip)';
  }
});

// ---------------------------------------------------------------- example

async function fetchBlob(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.blob();
}

$('#load-example').addEventListener('click', async () => {
  const dir = 'examples/subh-warrior/';
  Object.assign(settings, {
    name: 'Subh Warrior',
    tagline: 'Wake for Fajr.\nMake the morning count.',
    background: '#0f5233',
    text: '#f4f5eb',
    muted: '#d7e8dc',
    accent: '#e0ac4a',
    iconBackground: '#f4f5eb',
    logoTile: '#f4f5eb',
    frame: '#0b1a12',
    decor: 'sunrise',
    iconPadding: 0,
    featureScreen: 0,
  });
  assets.logo = await loadImage(await fetchBlob(`${dir}logo.svg`), 'logo.svg');
  assets.iconImage = await loadImage(await fetchBlob(`${dir}play-icon.svg`), 'play-icon.svg');
  assets.screens.forEach((s) => URL.revokeObjectURL(s.url));
  assets.screens = [];
  const shots = [
    ['01-home-fajr.png', 'Wake for Fajr, every day'],
    ['03-log-your-morning.png', 'Log your morning in a minute'],
    ['05-progress.png', 'Track your 28-day challenge'],
  ];
  for (const [file, caption] of shots) {
    const shot = await loadImage(await fetchBlob(`${dir}screens/${file}`), file);
    shot.caption = caption;
    assets.screens.push(shot);
  }
  save();
  syncForm();
  renderScreenList();
  schedule();
});

// -------------------------------------------------------------------- boot

loadSaved();
syncForm();
renderScreenList();
try {
  await loadFont('url(fonts/PlusJakartaSans-var.ttf)');
} catch {
  // Falls back to the system font.
}
schedule();
window.__app = { settings, assets, renderAll, encode, jobs };
