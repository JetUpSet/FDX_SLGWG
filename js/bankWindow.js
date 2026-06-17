// js/bankWindow.js — makes the Trip Bank a floating, movable/resizable window
// with collapse + close, plus a toolbar toggle to reopen it. Owns window chrome
// only; bank.js owns the content (counters + staged bars). No persistence:
// geometry lives in the DOM for the session and resets to bottom-center on reload.
const EDGE = 24;        // gap from viewport edges for the default position
const TOOLBAR_GAP = 80; // keep clear of the bottom selection toolbar
const MIN_W = 280;
const MIN_BODY_H = 60;

export function initBankWindow() {
  const bank = document.getElementById('tripBank');
  const titlebar = document.getElementById('bankTitlebar');
  const body = document.getElementById('bankBody');
  const resize = document.getElementById('bankResize');
  const collapseBtn = document.getElementById('bankCollapseBtn');
  const closeBtn = document.getElementById('bankCloseBtn');
  const toggleBtn = document.getElementById('bankToggleBtn');
  if (!bank || !titlebar) return;

  // ---- default position: bottom-center ----
  const w = bank.offsetWidth, h = bank.offsetHeight;
  bank.style.left = Math.max(EDGE, (window.innerWidth - w) / 2) + 'px';
  bank.style.top = Math.max(EDGE, window.innerHeight - h - TOOLBAR_GAP) + 'px';

  // ---- drag to move (title bar) ----
  titlebar.addEventListener('mousedown', e => {
    if (e.target.closest('.bank-win-btn')) return; // let the control buttons work
    e.preventDefault();
    const r = bank.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    const panelW = bank.offsetWidth; // capture once; width can't change mid-drag
    function onMove(ev) {
      let left = ev.clientX - dx, top = ev.clientY - dy;
      left = Math.max(0, Math.min(window.innerWidth - panelW, left));
      top = Math.max(0, Math.min(window.innerHeight - 40, top));
      bank.style.left = left + 'px';
      bank.style.top = top + 'px';
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  // ---- drag to resize (corner): width on the panel, height on the body ----
  if (resize) resize.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const startW = bank.getBoundingClientRect().width;
    const startBodyH = body.getBoundingClientRect().height;
    function onMove(ev) {
      bank.style.width = Math.max(MIN_W, startW + (ev.clientX - startX)) + 'px';
      body.style.height = Math.max(MIN_BODY_H, startBodyH + (ev.clientY - startY)) + 'px';
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  // ---- collapse (roll up to the title bar) ----
  if (collapseBtn) collapseBtn.addEventListener('click', () => {
    const collapsed = bank.classList.toggle('collapsed');
    collapseBtn.textContent = collapsed ? '▸' : '▾';
  });

  // ---- close + toolbar toggle ----
  function setOpen(open) {
    bank.classList.toggle('hidden', !open);
    if (toggleBtn) toggleBtn.classList.toggle('is-open', open);
    if (open && bank.classList.contains('collapsed')) {
      bank.classList.remove('collapsed'); // reopening shows the full panel, not a rolled-up one
      if (collapseBtn) collapseBtn.textContent = '▾';
    }
  }
  if (closeBtn) closeBtn.addEventListener('click', () => setOpen(false));
  if (toggleBtn) toggleBtn.addEventListener('click', () => setOpen(bank.classList.contains('hidden')));
}
