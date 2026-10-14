// Line breaking for canvas text. `measure(str)` returns a width in pixels for
// the current font, so these helpers stay independent of the canvas API.

/**
 * Splits `text` into at most `maxLines` lines no wider than `maxWidth`,
 * balancing line lengths. Returns null if it cannot fit.
 */
export function wrapBalanced(text, maxWidth, maxLines, measure) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  if (measure(words.join(' ')) <= maxWidth) return [words.join(' ')];
  if (maxLines < 2) return null;

  // Two lines: pick the break that makes the longer line as short as possible.
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const widest = Math.max(measure(a), measure(b));
    if (widest <= maxWidth && (!best || widest < best.widest)) best = { lines: [a, b], widest };
  }
  if (best || maxLines === 2) return best ? best.lines : null;

  // More lines: greedy fill, then give up if it still overflows.
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (measure(next) <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  lines.push(line);
  return lines.length <= maxLines && lines.every((l) => measure(l) <= maxWidth) ? lines : null;
}

/**
 * Finds the largest font size from `max` down to `min` (step 2) at which
 * `text` fits. `measureAt(size)` returns a measure function for that size.
 * Returns `{ size, lines, fits }`; when nothing fits it returns the `min`
 * size with a greedy wrap and `fits: false`.
 */
export function fitText(text, { max, min, maxWidth, maxLines }, measureAt) {
  for (let size = max; size >= min; size -= 2) {
    const lines = wrapBalanced(text, maxWidth, maxLines, measureAt(size));
    if (lines) return { size, lines, fits: true };
  }
  const lines = wrapBalanced(text, Infinity, 1, measureAt(min)) ?? [text];
  return { size: min, lines, fits: false };
}
