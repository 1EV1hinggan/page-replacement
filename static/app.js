'use strict';
/* Page Replacement Simulator - browser behaviour.
   All text from the server is inserted with textContent / createTextNode (never innerHTML). */

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

const DEF = { refs: '1, 2, 4, 5, 6, 7, 2, 3, 1, 8, 9', frames: 7 };
const LIMITS = { minFrames: 1, maxFrames: 30, maxRefs: 500, timeoutMs: 15000 };
const ALGOS = ['FIFO', 'LRU', 'Optimal'];
const INFO = {
  FIFO: { name: 'First in, first out', text: 'Replaces the page that entered memory first.' },
  LRU: { name: 'Least recently used', text: 'Replaces the page that has not been used for the longest time.' },
  Optimal: { name: 'Optimal replacement', text: 'Replaces the page whose next use is farthest in the future. It needs knowledge of future references, so it is a benchmark rather than a practical policy.' }
};
const KIND_LABEL = { hit: 'page hit', loaded: 'page loaded', replaced: 'page replaced' };
const KIND_TITLE = { hit: 'Page hit', loaded: 'Page loaded', replaced: 'Page replaced' };

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const canHover = matchMedia('(hover: hover)');

let data = null;      // last successful /api/simulate payload
let algo = 'FIFO';
let sel = -1;         // pinned row index
let active = 0;       // roving-tabindex row
let hotCol = -1;
let filter = null;    // legend filter (persistent)
let busy = false;

const steps = () => data.results.find(x => x.algorithm === algo).steps;
const fmtFrames = a => a.map(p => (p === null ? '\u2013' : p)).join(', ');
const pct = n => n.toFixed(2) + '%';

/* ------------------------------------------------------------ announcements */
function announce(msg) { $('sr-summary').textContent = msg; }

/* --------------------------------------------------------------- cell kinds */
function kinds(s, prev) {
  const k = s.frames.map(() => '');
  if (s.result === 'HIT') {
    const j = s.frames.indexOf(s.ref);
    if (j >= 0) k[j] = 'hit';
  } else {
    s.frames.forEach((p, j) => { if (p !== prev[j]) k[j] = prev[j] === null ? 'loaded' : 'replaced'; });
  }
  return k;
}

/* ------------------------------------------------------------------- tween */
const rafOf = new WeakMap();
function tween(node, to, dec = 0, suf = '') {
  cancelAnimationFrame(rafOf.get(node));
  if (reducedMotion.matches) { node.textContent = to.toFixed(dec) + suf; return; }
  const t0 = performance.now(), d = 600;
  const f = t => {
    const p = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - p, 3);
    node.textContent = (to * e).toFixed(dec) + suf;
    if (p < 1) rafOf.set(node, requestAnimationFrame(f));
  };
  rafOf.set(node, requestAnimationFrame(f));
}

/* ------------------------------------------------------------- form / errors */
function clearErrors() {
  const er = $('err');
  er.textContent = '';
  er.classList.remove('shake');
  $('refs').removeAttribute('aria-invalid');
  $('frames').removeAttribute('aria-invalid');
}
function showError(msg, field) {
  const er = $('err');
  er.textContent = msg;
  const input = field === 'frames' ? $('frames') : field === 'refs' ? $('refs') : null;
  if (input) { input.setAttribute('aria-invalid', 'true'); input.focus(); }
  void er.offsetWidth;
  er.classList.add('shake');
}
function validateInputs() {
  const refs = $('refs').value.trim();
  if (!refs) { showError('Enter at least one page number, for example 1, 2, 3.', 'refs'); return false; }
  if (refs.split(/[\s,]+/).filter(Boolean).length > LIMITS.maxRefs) {
    showError(`Too many references (maximum ${LIMITS.maxRefs}).`, 'refs'); return false;
  }
  const f = $('frames').value.trim();
  const n = Number(f);
  if (!/^\d+$/.test(f) || n < LIMITS.minFrames || n > LIMITS.maxFrames) {
    showError(`Number of frames must be a whole number between ${LIMITS.minFrames} and ${LIMITS.maxFrames}.`, 'frames'); return false;
  }
  return true;
}
function setBusy(on) {
  busy = on;
  const b = $('run');
  if (on) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
  $('run-label').textContent = on ? 'Running\u2026' : 'Run Simulation';
  $('panel').setAttribute('aria-busy', String(on));
}

async function run(silent = false) {
  if (busy) return;
  clearErrors();
  if (!silent && !validateInputs()) return;
  setBusy(true);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LIMITS.timeoutMs);
  try {
    const r = await fetch('/api/simulate', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refs: $('refs').value, frames: $('frames').value })
    });
    let j = null;
    try { j = await r.json(); } catch (_) { /* non-JSON body */ }
    if (!r.ok || !j || !Array.isArray(j.results)) {
      if (!silent) showError((j && j.error) || `The server returned an unexpected response (${r.status}).`, j && j.field);
      return;
    }
    data = j; sel = -1; active = 0;
    render(true);
    const r0 = j.results.find(x => x.algorithm === algo);
    announce(`Simulation complete. ${algo}: ${r0.hits} hits, ${r0.faults} faults.`);
  } catch (e) {
    if (!silent) {
      showError(e.name === 'AbortError'
        ? 'The request timed out. Please try again.'
        : 'Could not reach the server. Check that it is running and try again.');
    }
  } finally {
    clearTimeout(timer);
    setBusy(false);
  }
}

/* ------------------------------------------------------------------ render */
function idleText() {
  return canHover.matches
    ? 'Hover or focus a row to see why it hit or faulted. Click it or press Enter to pin it.'
    : 'Tap a row to see why it hit or faulted.';
}
function setIdle() {
  const box = $('insp');
  box.classList.remove('on');
  box.textContent = idleText();
}

function renderHeader() {
  document.querySelectorAll('.tab').forEach(t => {
    const on = t.dataset.a === algo;
    t.classList.toggle('on', on);
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  });
  $('panel').setAttribute('aria-labelledby', 't-' + algo);
  $('algo-name').textContent = INFO[algo].name;
  $('algo-text').textContent = INFO[algo].text;
}

function renderStats() {
  const r = data.results.find(x => x.algorithm === algo);
  const hp = r.hits / r.total * 100;
  tween($('hits'), r.hits);
  tween($('faults'), r.faults);
  tween($('ratio'), hp, 2, '%');
  $('fr').textContent = `Fault ratio ${pct(100 - hp)} (${r.hits}:${r.faults} hit/fault)`;
  $('final').textContent = '[' + fmtFrames(r.final) + ']';
  announce(`${algo}: ${r.hits} hits, ${r.faults} faults, hit ratio ${pct(hp)}. Final frames: ${fmtFrames(r.final)}.`);
}

function renderCompare() {
  const t = $('cmp');
  t.replaceChildren();
  if (!data) return;
  const fs = data.results.map(r => r.faults), minF = Math.min(...fs), tied = minF === Math.max(...fs);
  const cap = el('caption', 'sr-only', 'Hits, faults and hit ratio for each algorithm');
  const head = el('tr');
  [['Algorithm', ''], ['Hits', 'n'], ['Faults', 'n'], ['Hit ratio', 'n']].forEach(([h, c]) => {
    const th = el('th', c, h); th.scope = 'col'; head.append(th);
  });
  const thead = el('thead'); thead.append(head);
  const tb = el('tbody');
  ALGOS.forEach(a => {
    const r = data.results.find(x => x.algorithm === a); if (!r) return;
    const tr = el('tr');
    if (a === algo) tr.setAttribute('aria-current', 'true');
    const th = el('th', null, a); th.scope = 'row';
    if (!tied && r.faults === minF) th.append(el('span', 'best', 'Fewest faults'));
    tr.append(th, el('td', 'n', String(r.hits)), el('td', 'n', String(r.faults)), el('td', 'n', pct(r.hits / r.total * 100)));
    tb.append(tr);
  });
  t.append(cap, thead, tb);
}

function render(animate) {
  renderHeader();
  const tbl = $('tbl');
  const has = !!data;
  $('empty').hidden = has;
  tbl.hidden = !has;
  $('replay').disabled = !has;
  $('csv').disabled = !has;
  $('tw').tabIndex = has ? -1 : 0;
  tbl.replaceChildren();
  renderCompare();

  if (!has) {
    ['hits', 'faults'].forEach(i => { $(i).textContent = '0'; });
    $('ratio').textContent = '0%';
    $('fr').textContent = '';
    $('final').textContent = '\u2013';
    announce('');
    setIdle();
    updateHint();
    return;
  }

  const n = data.frames, r = data.results.find(x => x.algorithm === algo);
  tbl.style.setProperty('--n', n);

  const cap = el('caption', 'sr-only', `${INFO[algo].name} simulation, ${n} frames, step by step`);
  const hr = el('tr');
  const heads = ['Ref', ...Array.from({ length: n }, (_, k) => 'F' + (k + 1)), 'Result'];
  heads.forEach((h, c) => { const th = el('th', null, h); th.scope = 'col'; th.dataset.c = c; hr.append(th); });
  const thead = el('thead'); thead.append(hr);

  const tb = el('tbody');
  r.steps.forEach((s, i) => {
    const prev = i ? r.steps[i - 1].frames : Array(n).fill(null);
    const k = kinds(s, prev);
    const tr = el('tr');
    tr.dataset.i = i;
    tr.tabIndex = i === active ? 0 : -1;
    if (animate && !reducedMotion.matches) { tr.classList.add('row-in'); tr.style.setProperty('--i', Math.min(i, 25)); }
    if (i === sel) tr.setAttribute('aria-current', 'true');

    const ref = el('th', null, String(s.ref)); ref.scope = 'row'; ref.dataset.c = 0;
    tr.append(ref);
    s.frames.forEach((p, j) => {
      const td = el('td', 'c' + (k[j] ? ' ' + k[j] : ''));
      td.dataset.c = j + 1; td.dataset.k = k[j];
      if (p === null) {
        td.append(el('span', 'dash', '\u2013'), el('span', 'sr-only', 'empty'));
        td.firstChild.setAttribute('aria-hidden', 'true');
      } else {
        td.append(document.createTextNode(String(p)));
        if (k[j]) td.append(el('span', 'sr-only', ', ' + KIND_LABEL[k[j]]));
      }
      tr.append(td);
    });
    const res = el('td'); res.dataset.c = n + 1;
    const chip = el('span', 'chip ' + s.result[0]);
    chip.append(el('span', null, s.result[0]));
    chip.firstChild.setAttribute('aria-hidden', 'true');
    chip.append(el('span', 'sr-only', s.result === 'HIT' ? 'Hit' : 'Fault'));
    res.append(chip); tr.append(res);
    tb.append(tr);
  });
  tbl.append(cap, thead, tb);

  renderStats();
  applyFilter(filter);
  updateHint();
  if (sel >= 0) inspect(sel, true); else setIdle();
}

/* ------------------------------------------------------------- inspection */
function inspect(i, pin) {
  const s = steps()[i];
  const box = $('insp');
  box.replaceChildren(el('b', null, `Step ${i + 1} \u00b7 Ref ${s.ref} \u00b7 ${s.result}`), document.createTextNode(' \u2014 ' + s.note));
  box.classList.toggle('on', !!pin);
}
const rows = () => $('tbl').querySelectorAll('tbody tr[data-i]');

function setActive(i) {
  const rs = rows();
  if (!rs[i]) return;
  if (rs[active]) rs[active].tabIndex = -1;
  rs[i].tabIndex = 0;
  active = i;
}
function pin(i) {
  const rs = rows();
  rs.forEach(r => r.removeAttribute('aria-current'));
  rs[i].setAttribute('aria-current', 'true');
  sel = i; setActive(i); inspect(i, true);
}
function unpin(i) {
  const rs = rows();
  if (rs[i]) rs[i].removeAttribute('aria-current');
  sel = -1; inspect(i, false);
}
function toggle(i) { if (sel === i) unpin(i); else pin(i); }
function focusRow(i) {
  const rs = rows(); if (!rs.length) return;
  i = Math.max(0, Math.min(rs.length - 1, i));
  setActive(i);
  rs[i].focus();
}

/* hover: tooltip, column highlight, inspector preview (mouse only) */
const tip = $('tip'), tbl = $('tbl');
function setCol(c) {
  if (c === hotCol) return;
  clearCol();
  hotCol = c;
  if (c > 0 && data && c <= data.frames) tbl.querySelectorAll(`[data-c="${c}"]`).forEach(x => x.classList.add('colhl'));
}
function clearCol() { tbl.querySelectorAll('.colhl').forEach(c => c.classList.remove('colhl')); hotCol = -1; }

tbl.addEventListener('mouseover', e => {
  if (!canHover.matches || !data) return;
  const cell = e.target.closest('td,th'), tr = e.target.closest('tbody tr[data-i]');
  if (!cell || !tr) return;
  setCol(+cell.dataset.c);
  const i = +tr.dataset.i, s = steps()[i], k = cell.dataset.k;
  tip.replaceChildren(
    el('b', null, `Step ${i + 1} \u00b7 Ref ${s.ref} \u00b7 ${s.result}${k ? ' \u00b7 ' + KIND_TITLE[k] : ''}`),
    document.createTextNode(s.note));
  tip.classList.add('on');
  if (sel < 0) inspect(i, false);
});
tbl.addEventListener('mousemove', e => {
  const x = Math.min(e.clientX + 16, innerWidth - tip.offsetWidth - 10);
  tip.style.left = Math.max(4, x) + 'px';
  tip.style.top = Math.max(4, Math.min(e.clientY + 18, innerHeight - tip.offsetHeight - 10)) + 'px';
});
tbl.addEventListener('mouseleave', () => {
  tip.classList.remove('on'); clearCol();
  if (sel < 0 && !tbl.contains(document.activeElement)) setIdle();
});
$('tw').addEventListener('scroll', () => tip.classList.remove('on'), { passive: true });

/* keyboard / focus: roving tabindex, one tab stop for the whole table */
tbl.addEventListener('focusin', e => {
  const tr = e.target.closest('tbody tr[data-i]');
  if (!tr || e.target !== tr) return;
  setActive(+tr.dataset.i);
  if (sel < 0) inspect(+tr.dataset.i, false);
});
tbl.addEventListener('focusout', e => {
  if (sel < 0 && !tbl.contains(e.relatedTarget)) setIdle();
});
tbl.addEventListener('keydown', e => {
  const tr = e.target.closest('tbody tr[data-i]');
  if (!tr || e.target !== tr || e.altKey || e.ctrlKey || e.metaKey) return;
  const i = +tr.dataset.i, last = rows().length - 1;
  switch (e.key) {
    case 'ArrowDown': e.preventDefault(); focusRow(i + 1); break;
    case 'ArrowUp': e.preventDefault(); focusRow(i - 1); break;
    case 'Home': e.preventDefault(); focusRow(0); break;
    case 'End': e.preventDefault(); focusRow(last); break;
    case 'Enter': case ' ': e.preventDefault(); toggle(i); break;
    case 'Escape': tip.classList.remove('on'); if (sel >= 0) unpin(sel); break;
  }
});
tbl.addEventListener('click', e => {
  const tr = e.target.closest('tbody tr[data-i]');
  if (tr) { setActive(+tr.dataset.i); toggle(+tr.dataset.i); }
});

/* legend filter: hover previews, click / Enter toggles */
function applyFilter(k) { if (k) $('tw').dataset.f = k; else delete $('tw').dataset.f; }
document.querySelectorAll('.lg').forEach(b => {
  const k = b.dataset.k;
  b.addEventListener('mouseenter', () => applyFilter(k));
  b.addEventListener('mouseleave', () => applyFilter(filter));
  b.addEventListener('click', () => {
    filter = filter === k ? null : k;
    document.querySelectorAll('.lg').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.k === filter)));
    applyFilter(filter);
  });
});

/* horizontal-scroll hint, driven by the real overflow instead of magic widths */
function updateHint() {
  const w = $('tw');
  $('hint').hidden = !(data && w.scrollWidth > w.clientWidth + 2);
}
if ('ResizeObserver' in window) {
  const ro = new ResizeObserver(updateHint);
  ro.observe($('tw')); ro.observe($('tbl'));
} else {
  addEventListener('resize', updateHint);
}

/* ------------------------------------------------------------------ export */
function csvCell(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }
function downloadCsv() {
  if (!data) return;
  const n = data.frames;
  const head = ['Step', 'Ref', ...Array.from({ length: n }, (_, k) => 'F' + (k + 1)), 'Result', 'Note'];
  const lines = [head.map(csvCell).join(',')];
  steps().forEach((s, i) => lines.push([i + 1, s.ref, ...s.frames.map(p => (p === null ? '' : p)), s.result, s.note].map(csvCell).join(',')));
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = el('a');
  a.href = URL.createObjectURL(blob);
  a.download = `page-replacement-${algo}.csv`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  announce('CSV downloaded.');
}

/* ---------------------------------------------------------------- controls */
function setAlgo(a, focus) {
  algo = a; render(false);
  if (focus) $('t-' + a).focus();
}
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => setAlgo(t.dataset.a, false)));
$('tabs').addEventListener('keydown', e => {
  const tabs = [...document.querySelectorAll('.tab')];
  const i = tabs.indexOf(document.activeElement);
  if (i < 0) return;
  let to = -1;
  if (e.key === 'ArrowRight') to = (i + 1) % tabs.length;
  else if (e.key === 'ArrowLeft') to = (i + tabs.length - 1) % tabs.length;
  else if (e.key === 'Home') to = 0;
  else if (e.key === 'End') to = tabs.length - 1;
  if (to < 0) return;
  e.preventDefault();
  setAlgo(tabs[to].dataset.a, true);
});

$('form').addEventListener('submit', e => { e.preventDefault(); run(false); });
$('replay').addEventListener('click', () => { if (data) render(true); });
$('csv').addEventListener('click', downloadCsv);
$('reset').addEventListener('click', () => {
  $('refs').value = DEF.refs; $('frames').value = DEF.frames;
  clearErrors();
  data = null; sel = -1; active = 0; filter = null;
  document.querySelectorAll('.lg').forEach(x => x.setAttribute('aria-pressed', 'false'));
  render(false);
  announce('Inputs reset to defaults. Results cleared.');
  $('refs').focus();
});
const bump = d => {
  const cur = Number($('frames').value);
  const base = Number.isFinite(cur) && $('frames').value !== '' ? cur : LIMITS.minFrames;
  $('frames').value = Math.max(LIMITS.minFrames, Math.min(LIMITS.maxFrames, Math.round(base) + d));
  $('frames').removeAttribute('aria-invalid');
};
$('up').addEventListener('click', () => bump(1));
$('dn').addEventListener('click', () => bump(-1));

/* ----------------------------------------------------------------- startup */
$('refs').value = DEF.refs;
$('frames').value = DEF.frames;
render(false);
run(true);   // silent first run: a down server must not show an error before the user acts
