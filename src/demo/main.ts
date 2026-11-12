import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/400-italic.css';
import '@fontsource/eb-garamond/500.css';
import '@fontsource/ibm-plex-mono/400.css';
import './style.css';

import { hyphenateEnglish } from '../core/english.ts';
import {
  block,
  breakFirstFit,
  breakKnuthPlass,
  circle,
  dropCap,
  findRivers,
  layout,
  textToItems,
  type BreakResult,
  type Line,
  type Measure,
  type River,
  type Shape,
} from '../core/index.ts';
import { TEXTS } from './texts.ts';

type Algorithm = 'first' | 'total';
type ShapeName = 'block' | 'dropcap' | 'circle';

const FONT = '"EB Garamond"';
const LEADING = 1.45;
const GUTTER = 46;
const SVG = 'http://www.w3.org/2000/svg';

const state = {
  text: 'frog',
  custom: '',
  /** What the reader asked for; `measure` is that, limited to what fits on screen. */
  wanted: 400,
  measure: 400,
  size: 18,
  shape: 'block' as ShapeName,
  features: new Set(['hyphenate', 'hang']),
  looseness: 0,
  overlays: new Set(['spacing']),
};

/* ---------- measuring ---------- */

const ctx = document.createElement('canvas').getContext('2d')!;
const widths = new Map<string, number>();

/** Text widths come from a canvas using the same font the page draws with. */
function measurer(size: number): Measure {
  const font = `${size}px ${FONT}`;
  return (s) => {
    const key = `${size}|${s}`;
    let w = widths.get(key);
    if (w === undefined) {
      ctx.font = font;
      w = ctx.measureText(s).width;
      if (widths.size > 50000) widths.clear();
      widths.set(key, w);
    }
    return w;
  };
}

/** Distance from the top of a line box to its baseline, for a given size and line height. */
function baseline(size: number, lineHeight: number): number {
  ctx.font = `${size}px ${FONT}`;
  const m = ctx.measureText('H');
  const ascent = m.fontBoundingBoxAscent;
  const descent = m.fontBoundingBoxDescent;
  return (lineHeight - (ascent + descent)) / 2 + ascent;
}

/* ---------- composing ---------- */

interface Cap {
  char: string;
  size: number;
  top: number;
}

interface Composition {
  lines: Line[];
  results: BreakResult[];
  rivers: River[];
  width: number;
  height: number;
  lineHeight: number;
  radius?: number;
  cap?: Cap;
}

function sourceText(): string {
  return state.text === 'own' ? state.custom : TEXTS[state.text];
}

function compose(algorithm: Algorithm): Composition {
  const size = state.size;
  const lineHeight = Math.round(size * LEADING);
  const measure = measurer(size);
  const total = algorithm === 'total';

  let paragraphs = sourceText().split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) paragraphs = ['Type something.'];
  if (state.shape === 'circle') paragraphs = [paragraphs.join(' ')];

  const pour = (shape: Shape, uniform: number | null) => {
    const lines: Line[] = [];
    const results: BreakResult[] = [];
    paragraphs.forEach((paragraph, k) => {
      const firstLine = lines.length;
      const items = textToItems(paragraph, measure, {
        hyphenate: total && state.features.has('hyphenate') ? hyphenateEnglish : null,
        hang: total && state.features.has('hang'),
        indent: k > 0 ? size * 1.2 : 0,
      });
      // A plain number lets the breaker treat all lines as interchangeable.
      const lineWidth = uniform ?? ((i: number) => shape.width(i + firstLine));
      const result = total
        ? breakKnuthPlass(items, { lineWidth, looseness: state.looseness })
        : breakFirstFit(items, { lineWidth });
      results.push(result);
      lines.push(
        ...layout(items, result, {
          lineWidth,
          lineOffset: (i) => shape.offset(i + firstLine),
          lineHeight,
          firstLine,
        }),
      );
    });
    return { lines, results };
  };

  const finish = (poured: ReturnType<typeof pour>, width: number, extra: Partial<Composition> = {}) => ({
    ...poured,
    rivers: findRivers(poured.lines),
    width,
    height: Math.max(poured.lines.length * lineHeight, extra.radius ? extra.radius * 2 : 0),
    lineHeight,
    ...extra,
  });

  if (state.shape === 'circle') {
    // Grow the disc until the text just fits inside it.
    const natural = measure(paragraphs[0]);
    let radius = Math.sqrt((natural * lineHeight) / Math.PI) * 0.96;
    for (let tries = 0; tries < 120; tries++, radius += lineHeight / 5) {
      const poured = pour(circle(radius, lineHeight), null);
      const overfull = poured.results.some((r) => r.overfull);
      if (poured.lines.length * lineHeight <= radius * 2 && !overfull) {
        return finish(poured, radius * 2, { radius });
      }
    }
    return finish(pour(circle(radius, lineHeight), null), radius * 2, { radius });
  }

  if (state.shape === 'dropcap') {
    const span = 3;
    const char = [...paragraphs[0]][0];
    paragraphs[0] = paragraphs[0].slice(char.length).trimStart();
    // Size the initial so its cap height runs from the top of line one to the baseline of line three.
    ctx.font = `${size}px ${FONT}`;
    const capHeight = ctx.measureText('H').actualBoundingBoxAscent;
    const capSize = (size * ((span - 1) * lineHeight + capHeight)) / capHeight;
    ctx.font = `${capSize}px ${FONT}`;
    const inset = ctx.measureText(char).width + size * 0.22;
    const top = (span - 1) * lineHeight + baseline(size, lineHeight) - baseline(capSize, capSize);
    const poured = pour(dropCap(state.measure, span, inset), null);
    return finish(poured, state.measure, { cap: { char, size: capSize, top } });
  }

  return finish(pour(block(state.measure), state.measure), state.measure);
}

/* ---------- drawing ---------- */

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, typeof v === 'number' ? v.toFixed(2) : v);
  return el;
}

function draw(column: HTMLElement, c: Composition, tallest: number) {
  const sheet = column.querySelector<HTMLElement>('.sheet')!;
  sheet.replaceChildren();
  sheet.style.width = `${c.width}px`;
  sheet.style.height = `${c.height}px`;
  sheet.style.marginBottom = `${tallest - c.height}px`;
  sheet.style.fontSize = `${state.size}px`;
  sheet.style.lineHeight = `${c.lineHeight}px`;

  const under = svg('svg', { class: 'layer', width: c.width, height: c.height });
  const over = svg('svg', { class: 'layer', width: c.width, height: c.height });
  const text = document.createElement('div');
  text.className = 'text';

  if (state.overlays.has('spacing')) {
    for (const line of c.lines) {
      if (line.last) continue;
      for (const gap of line.gaps) {
        const change = gap.width / gap.natural - 1;
        if (Math.abs(change) < 0.04) continue;
        const strength = change > 0 ? Math.min(0.1 + change * 0.45, 0.8) : Math.min(0.15 + -change * 1.6, 0.8);
        under.append(
          svg('rect', {
            class: change > 0 ? 'loose' : 'tight',
            x: gap.x,
            y: line.y + c.lineHeight * 0.16,
            width: Math.max(gap.width, 1),
            height: c.lineHeight * 0.72,
            opacity: strength,
          }),
        );
      }
    }
  }

  if (state.overlays.has('margins')) {
    if (c.radius) {
      over.append(svg('circle', { class: 'margin', cx: c.radius, cy: c.radius, r: c.radius }));
    } else {
      for (const x of [0, c.width]) over.append(svg('line', { class: 'margin', x1: x, x2: x, y1: -8, y2: c.height + 8 }));
    }
  }

  if (state.overlays.has('rivers')) {
    for (const river of c.rivers) {
      const points = river.links.map((l) => `${(l.x + l.width / 2).toFixed(1)},${(l.line + 0.5) * c.lineHeight}`);
      over.append(svg('polyline', { class: 'river', points: points.join(' ') }));
    }
  }

  for (const line of c.lines) {
    for (const run of line.runs) {
      const span = document.createElement('span');
      span.textContent = run.text;
      span.style.left = `${run.x.toFixed(2)}px`;
      span.style.top = `${line.y}px`;
      text.append(span);
    }
    if (state.overlays.has('ratios')) {
      const label = document.createElement('i');
      const r = line.ratio;
      label.textContent = line.last ? '·' : `${r < 0 ? '−' : '+'}${Math.min(Math.abs(r), 9.99).toFixed(2)}`;
      label.className = line.last ? '' : r > 1 ? 'loose' : r < -0.5 ? 'tight' : '';
      label.style.top = `${line.y}px`;
      label.style.right = `${c.width - line.x + 12}px`;
      text.append(label);
    }
  }

  if (c.cap) {
    const cap = document.createElement('b');
    cap.textContent = c.cap.char;
    cap.style.fontSize = `${c.cap.size}px`;
    cap.style.top = `${c.cap.top}px`;
    text.append(cap);
  }

  sheet.append(under, text, over);

  if (!c.radius) {
    const handle = document.createElement('div');
    handle.className = 'handle';
    handle.title = 'Drag to change the measure';
    handle.addEventListener('pointerdown', startDrag);
    sheet.append(handle);
  }

  ledger(column.querySelector('.ledger')!, c);
}

function ledger(el: Element, c: Composition) {
  const body = c.lines.filter((l) => !l.last && l.gaps.length > 0);
  const widest = Math.max(1, ...body.flatMap((l) => l.gaps.map((g) => g.width / g.natural)));
  const mean = body.reduce((s, l) => s + Math.min(Math.abs(l.ratio), 10), 0) / Math.max(body.length, 1);
  const demerits = c.results.reduce((s, r) => s + r.demerits, 0);
  const rows: [string, string][] = [
    ['Lines', String(c.lines.length)],
    ['Hyphens', String(c.lines.filter((l) => l.hyphenated).length)],
    ['Widest space', `${widest.toFixed(2)}×`],
    ['Mean adjustment', mean.toFixed(2)],
    ['Rivers', String(c.rivers.length)],
    ['Demerits', demerits >= 1e7 ? demerits.toExponential(1).replace('e+', ' × 10^') : Math.round(demerits).toLocaleString('en')],
  ];
  el.replaceChildren(
    ...rows.flatMap(([k, v]) => {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = k;
      dd.textContent = v;
      return [dt, dd];
    }),
  );
}

/* ---------- shareable state ---------- */

/** The settings live in the URL hash, so a link reproduces exactly what you were looking at. */
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  const int = (key: string, lo: number, hi: number, fallback: number) => {
    const n = Number(q.get(key));
    return q.has(key) && Number.isFinite(n) ? Math.min(Math.max(Math.round(n), lo), hi) : fallback;
  };
  const set = (key: string, allowed: string[], target: Set<string>) => {
    if (!q.has(key)) return;
    target.clear();
    for (const v of q.get(key)!.split(',')) if (allowed.includes(v)) target.add(v);
  };
  const text = q.get('text');
  if (text && text in TEXTS) state.text = text;
  const shape = q.get('shape');
  if (shape === 'block' || shape === 'dropcap' || shape === 'circle') state.shape = shape;
  state.wanted = int('measure', 170, 560, state.wanted);
  state.size = int('size', 14, 26, state.size);
  state.looseness = int('loose', -1, 1, state.looseness);
  set('fit', ['hyphenate', 'hang'], state.features);
  set('show', ['spacing', 'rivers', 'ratios', 'margins'], state.overlays);
}

function writeHash() {
  const q = new URLSearchParams({
    text: state.text === 'own' ? 'frog' : state.text,
    measure: String(state.wanted),
    size: String(state.size),
    shape: state.shape,
    loose: String(state.looseness),
    fit: [...state.features].join(','),
    show: [...state.overlays].join(','),
  });
  history.replaceState(null, '', `#${q.toString().replaceAll('%2C', ',')}`);
}

/* ---------- controls ---------- */

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const first = $('first');
const total = $('total');
const measureInput = $<HTMLInputElement>('measure');
const sizeInput = $<HTMLInputElement>('size');
const custom = $<HTMLTextAreaElement>('custom');

function maxMeasure(): number {
  const stage = first.querySelector<HTMLElement>('.stage')!;
  return Math.max(170, Math.min(560, Math.floor(stage.clientWidth - GUTTER - 14)));
}

let queued = false;
/** The address bar stays clean until the reader changes something. */
let touched = false;
function render(event?: unknown) {
  if (!Array.isArray(event)) touched = true;
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    renderNow();
  });
}

function renderNow() {
  const max = maxMeasure();
  measureInput.max = String(max);
  state.measure = Math.min(Math.max(state.wanted, 170), max);
  measureInput.value = String(state.measure);
  measureInput.disabled = state.shape === 'circle';
  sizeInput.value = String(state.size);
  const perLine = Math.round(state.measure / (measurer(state.size)('abcdefghijklmnopqrstuvwxyz') / 26));
  $('measure-out').textContent = state.shape === 'circle' ? 'fitted' : `${state.measure}px · about ${perLine} characters`;
  $('size-out').textContent = `${state.size}px`;
  custom.hidden = state.text !== 'own';

  sync('shape', (v) => v === state.shape);
  sync('features', (v) => state.features.has(v));
  sync('looseness', (v) => Number(v) === state.looseness);
  sync('overlays', (v) => state.overlays.has(v));

  const a = compose('first');
  const b = compose('total');
  // Keep the two ledgers level even when the columns differ by a line.
  const tallest = Math.max(a.height, b.height);
  draw(first, a, tallest);
  draw(total, b, tallest);
  if (touched) writeHash();
}

function sync(id: string, on: (value: string) => boolean) {
  for (const b of $(id).querySelectorAll<HTMLButtonElement>('button')) {
    b.setAttribute('aria-pressed', String(on(b.dataset.value!)));
  }
}

function onPress(id: string, handler: (value: string) => void) {
  $(id).addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest('button');
    if (!button) return;
    handler(button.dataset.value!);
    render();
  });
}

const toggle = (set: Set<string>) => (v: string) => void (set.has(v) ? set.delete(v) : set.add(v));
onPress('shape', (v) => (state.shape = v as ShapeName));
onPress('features', toggle(state.features));
onPress('looseness', (v) => (state.looseness = Number(v)));
onPress('overlays', toggle(state.overlays));

$<HTMLSelectElement>('text').addEventListener('change', (e) => {
  state.text = (e.target as HTMLSelectElement).value;
  if (state.text === 'own' && !state.custom) {
    state.custom = custom.value = TEXTS.frog;
  }
  render();
  if (state.text === 'own') custom.focus();
});
custom.addEventListener('input', () => {
  state.custom = custom.value;
  render();
});
measureInput.addEventListener('input', () => {
  state.wanted = Number(measureInput.value);
  render();
});
sizeInput.addEventListener('input', () => {
  state.size = Number(sizeInput.value);
  render();
});

function startDrag(e: PointerEvent) {
  e.preventDefault();
  const from = e.clientX;
  const initial = state.measure;
  document.body.classList.add('dragging');
  const move = (m: PointerEvent) => {
    state.wanted = Math.round(initial + m.clientX - from);
    render();
  };
  const stop = () => {
    document.body.classList.remove('dragging');
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);
}

window.addEventListener('hashchange', () => {
  readHash();
  $<HTMLSelectElement>('text').value = state.text;
  renderNow();
});

// A resize is not the reader changing a setting; the observer passes an array of entries.
new ResizeObserver(render).observe($('specimen'));

// Widths measured before the font arrives would be widths of the fallback.
Promise.all([document.fonts.load(`19px ${FONT}`), document.fonts.load(`500 19px ${FONT}`)])
  .catch(() => undefined)
  .then(() => {
    widths.clear();
    readHash();
    $<HTMLSelectElement>('text').value = state.text;
    renderNow();
    document.documentElement.classList.add('ready');
  });

// Handy when poking at the engine from the console.
Object.assign(window, { galley: { state, compose, render: renderNow } });
