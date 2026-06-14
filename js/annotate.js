// js/annotate.js — free-floating annotation layer for explaining scenarios.
// Tools: select/move, text note, arrow, pin, freehand pen. Coordinates are in
// page space so annotations scroll with the document. Independent of trips.

const SVG_NS = 'http://www.w3.org/2000/svg';
const COLORS = ['#dc2626', '#1d4ed8', '#059669', '#d97706', '#111827', '#ffffff'];

let layer, svg, notesEl, toolbar, annotateBtn, colorsEl;

let annotations = [];
let mode = false;
let tool = 'select';
let color = COLORS[0];
let selectedId = null;
let nextId = 1;
let pinSeq = 1;
let drag = null; // active draw/move operation

export function initAnnotate() {
  layer = document.getElementById('annotateLayer');
  svg = document.getElementById('annotateSvg');
  notesEl = document.getElementById('annotateNotes');
  toolbar = document.getElementById('annotateToolbar');
  annotateBtn = document.getElementById('annotateBtn');
  colorsEl = document.getElementById('atbColors');
  if (!layer || !toolbar) return;

  // Color swatches
  COLORS.forEach(c => {
    const s = document.createElement('div');
    s.className = 'atb-color' + (c === color ? ' active' : '');
    s.style.background = c;
    s.dataset.color = c;
    s.addEventListener('click', () => { color = c; refreshColors(); });
    colorsEl.appendChild(s);
  });

  // Tool buttons
  toolbar.querySelectorAll('.atb-tool').forEach(b => {
    b.addEventListener('click', () => setTool(b.dataset.tool));
  });
  document.getElementById('atbDelete').addEventListener('click', deleteSelected);
  document.getElementById('atbClear').addEventListener('click', clearAll);
  document.getElementById('atbDone').addEventListener('click', () => setMode(false));
  annotateBtn.addEventListener('click', () => setMode(!mode));

  // Scenario panel toggle (title + description)
  const scenarioBtn = document.getElementById('scenarioBtn');
  const scenario = document.getElementById('scenario');
  if (scenarioBtn && scenario) {
    scenarioBtn.addEventListener('click', () => {
      const open = scenario.classList.toggle('open');
      scenarioBtn.classList.toggle('active', open);
    });
  }

  layer.addEventListener('mousedown', onLayerDown);
  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', render);
  window.addEventListener('scroll', sizeOverlay);

  setTool('select');
  render();
}

function setMode(on) {
  mode = on;
  layer.classList.toggle('active', on);
  toolbar.classList.toggle('visible', on);
  annotateBtn.classList.toggle('active', on);
  if (!on) selectedId = null;
  render();
}

function setTool(t) {
  tool = t;
  toolbar.querySelectorAll('.atb-tool').forEach(b => {
    b.classList.toggle('active', b.dataset.tool === t);
  });
  layer.style.cursor = (t === 'select') ? 'default' : 'crosshair';
}

function refreshColors() {
  colorsEl.querySelectorAll('.atb-color').forEach(s => {
    s.classList.toggle('active', s.dataset.color === color);
  });
}

// ---------- create / interaction ----------
function onLayerDown(e) {
  if (!mode || e.button !== 0) return;
  if (e.target.closest('.annotate-note')) return; // notes handle themselves
  const x = e.pageX, y = e.pageY;

  if (tool === 'note') {
    const a = { id: nextId++, type: 'note', x, y, text: '', color };
    annotations.push(a);
    selectedId = a.id;
    setTool('select'); // avoid accidentally dropping another note
    render();
    const ta = notesEl.querySelector(`.annotate-note[data-id="${a.id}"] textarea`);
    if (ta) ta.focus();
    return;
  }
  if (tool === 'pin') {
    annotations.push({ id: nextId++, type: 'pin', x, y, n: pinSeq++, color });
    render();
    return;
  }
  if (tool === 'arrow') {
    drag = { kind: 'arrow', temp: { type: 'arrow', color, x1: x, y1: y, x2: x, y2: y } };
    startWindowDrag();
    return;
  }
  if (tool === 'pen') {
    drag = { kind: 'pen', temp: { type: 'pen', color, points: [[x, y]] } };
    startWindowDrag();
    return;
  }
  // select tool, empty click → deselect
  selectedId = null;
  render();
}

function startItemMove(a, e) {
  e.preventDefault();
  e.stopPropagation();
  selectedId = a.id;
  drag = { kind: 'move', a, sx: e.pageX, sy: e.pageY, orig: JSON.parse(JSON.stringify(a)) };
  startWindowDrag();
  render();
}

function startWindowDrag() {
  window.addEventListener('mousemove', onWinMove);
  window.addEventListener('mouseup', onWinUp);
}

function onWinMove(e) {
  if (!drag) return;
  const x = e.pageX, y = e.pageY;
  if (drag.kind === 'arrow') { drag.temp.x2 = x; drag.temp.y2 = y; }
  else if (drag.kind === 'pen') { drag.temp.points.push([x, y]); }
  else if (drag.kind === 'move') {
    const dx = x - drag.sx, dy = y - drag.sy, a = drag.a, o = drag.orig;
    if (a.type === 'arrow') { a.x1 = o.x1 + dx; a.y1 = o.y1 + dy; a.x2 = o.x2 + dx; a.y2 = o.y2 + dy; }
    else if (a.type === 'pen') { a.points = o.points.map(p => [p[0] + dx, p[1] + dy]); }
    else { a.x = o.x + dx; a.y = o.y + dy; }
  }
  render();
}

function onWinUp() {
  window.removeEventListener('mousemove', onWinMove);
  window.removeEventListener('mouseup', onWinUp);
  if (drag && drag.kind === 'arrow') {
    const t = drag.temp;
    if (Math.hypot(t.x2 - t.x1, t.y2 - t.y1) >= 5) annotations.push({ id: nextId++, ...t });
  } else if (drag && drag.kind === 'pen') {
    if (drag.temp.points.length >= 2) annotations.push({ id: nextId++, ...drag.temp });
  }
  drag = null;
  render();
}

function onKeyDown(e) {
  if (!mode) return;
  const tag = (e.target && e.target.tagName) || '';
  if ((e.key === 'Delete' || e.key === 'Backspace') && tag !== 'TEXTAREA' && tag !== 'INPUT') {
    if (selectedId != null) { e.preventDefault(); deleteSelected(); }
  }
  if (e.key === 'Escape') setMode(false);
}

function deleteSelected() {
  if (selectedId == null) return;
  annotations = annotations.filter(a => a.id !== selectedId);
  selectedId = null;
  render();
}

function clearAll() {
  if (annotations.length === 0) return;
  if (!confirm('Remove all annotations?')) return;
  annotations = [];
  selectedId = null;
  pinSeq = 1;
  render();
}

// ---------- rendering ----------
function sizeOverlay() {
  if (!layer) return;
  const w = Math.max(document.documentElement.scrollWidth, window.innerWidth);
  const h = Math.max(document.documentElement.scrollHeight, window.innerHeight);
  layer.style.width = w + 'px';
  layer.style.height = h + 'px';
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
}

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function arrowHeadPoints(x1, y1, x2, y2, size) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const a1 = ang + Math.PI - Math.PI / 7;
  const a2 = ang + Math.PI + Math.PI / 7;
  return `${x2},${y2} ${x2 + size * Math.cos(a1)},${y2 + size * Math.sin(a1)} ${x2 + size * Math.cos(a2)},${y2 + size * Math.sin(a2)}`;
}

function render() {
  if (!layer) return;
  sizeOverlay();
  svg.innerHTML = '';
  notesEl.innerHTML = '';

  annotations.forEach(a => {
    if (a.type === 'arrow') drawArrow(a, false);
    else if (a.type === 'pen') drawPen(a, false);
    else if (a.type === 'pin') drawPin(a);
    else if (a.type === 'note') drawNote(a);
  });

  if (drag && drag.kind === 'arrow') drawArrow(drag.temp, true);
  if (drag && drag.kind === 'pen') drawPen(drag.temp, true);
}

function drawArrow(a, preview) {
  const sel = !preview && a.id === selectedId;
  const line = svgEl('line', { x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2, stroke: a.color, 'stroke-width': sel ? 5 : 3, 'stroke-linecap': 'round' });
  const head = svgEl('polygon', { points: arrowHeadPoints(a.x1, a.y1, a.x2, a.y2, 12), fill: a.color });
  svg.appendChild(line);
  svg.appendChild(head);
  if (!preview) {
    const hit = svgEl('line', { x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2, stroke: 'transparent', 'stroke-width': 16 });
    hit.setAttribute('class', 'anno-hit');
    hit.addEventListener('mousedown', e => onItemDown(a, e));
    svg.appendChild(hit);
  }
}

function drawPen(a, preview) {
  const sel = !preview && a.id === selectedId;
  const pts = a.points.map(p => p.join(',')).join(' ');
  const line = svgEl('polyline', { points: pts, fill: 'none', stroke: a.color, 'stroke-width': sel ? 5 : 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  svg.appendChild(line);
  if (!preview) {
    const hit = svgEl('polyline', { points: pts, fill: 'none', stroke: 'transparent', 'stroke-width': 16 });
    hit.setAttribute('class', 'anno-hit');
    hit.addEventListener('mousedown', e => onItemDown(a, e));
    svg.appendChild(hit);
  }
}

function drawPin(a) {
  const sel = a.id === selectedId;
  const g = svgEl('g', { class: 'anno-hit' });
  if (sel) g.appendChild(svgEl('circle', { cx: a.x, cy: a.y, r: 14, fill: 'none', stroke: '#1d4ed8', 'stroke-width': 2 }));
  g.appendChild(svgEl('circle', { cx: a.x, cy: a.y, r: 11, fill: a.color, stroke: '#fff', 'stroke-width': 1.5 }));
  const text = svgEl('text', { x: a.x, y: a.y, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'annotate-pin-num' });
  text.textContent = a.n;
  g.appendChild(text);
  g.addEventListener('mousedown', e => onItemDown(a, e));
  svg.appendChild(g);
}

function drawNote(a) {
  const div = document.createElement('div');
  div.className = 'annotate-note' + (a.id === selectedId ? ' selected' : '');
  div.dataset.id = a.id;
  div.style.left = a.x + 'px';
  div.style.top = a.y + 'px';
  div.style.borderColor = a.color;

  const handle = document.createElement('div');
  handle.className = 'annotate-note-handle';
  handle.style.background = a.color;
  handle.addEventListener('mousedown', e => { if (mode) startItemMove(a, e); });
  div.appendChild(handle);

  const ta = document.createElement('textarea');
  ta.value = a.text;
  ta.placeholder = 'Note…';
  if (a.w) ta.style.width = a.w + 'px';
  if (a.h) ta.style.height = a.h + 'px';
  ta.addEventListener('mousedown', e => e.stopPropagation());
  ta.addEventListener('focus', () => { selectedId = a.id; div.classList.add('selected'); });
  ta.addEventListener('input', () => { a.text = ta.value; });
  div.appendChild(ta);

  // Persist the user's manual resize so it survives re-renders. Read the
  // border-box size to match the width/height we set above (box-sizing:
  // border-box), otherwise each re-render would shrink the note by its padding.
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(entries => {
      for (const en of entries) {
        const box = en.borderBoxSize && en.borderBoxSize[0];
        const w = box ? box.inlineSize : en.contentRect.width;
        const h = box ? box.blockSize : en.contentRect.height;
        if (w > 0 && h > 0) { a.w = Math.round(w); a.h = Math.round(h); }
      }
    });
    ro.observe(ta);
  }

  notesEl.appendChild(div);
}

function onItemDown(a, e) {
  if (!mode) return;
  if (tool !== 'select') return; // let other tools create instead
  startItemMove(a, e);
}
