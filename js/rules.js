// Google Play graphic asset requirements, checked against every export.

const MB = 1024 * 1024;

export const RULES = {
  icon: { label: 'App icon', width: 512, height: 512, maxBytes: 1 * MB },
  feature: { label: 'Feature graphic', width: 1024, height: 500, maxBytes: 15 * MB },
  screenshot: { label: 'Phone screenshot', minSide: 320, maxSide: 3840, maxRatio: 2, maxBytes: 8 * MB },
};

/** Returns human-readable problems; an empty list means the asset passes. */
export function checkAsset(kind, { width, height, bytes, colorType }) {
  const r = RULES[kind];
  const problems = [];
  if (r.width && (width !== r.width || height !== r.height)) {
    problems.push(`must be ${r.width}×${r.height}, is ${width}×${height}`);
  }
  if (r.minSide) {
    const short = Math.min(width, height);
    const long = Math.max(width, height);
    if (short < r.minSide) problems.push(`shortest side ${short}px is under ${r.minSide}px`);
    if (long > r.maxSide) problems.push(`longest side ${long}px is over ${r.maxSide}px`);
    if (long / short > r.maxRatio) problems.push(`aspect ratio ${(long / short).toFixed(2)}:1 is over ${r.maxRatio}:1`);
  }
  if (bytes > r.maxBytes) problems.push(`${(bytes / MB).toFixed(2)} MB is over the ${r.maxBytes / MB} MB limit`);
  if (kind === 'feature' && colorType !== 2) problems.push('must be a 24-bit PNG without alpha');
  return problems;
}
