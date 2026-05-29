// tutorial.js — Tutorial overlay with SVG spotlight system

function showTutorial(context) {
  const existing = document.getElementById('tutorialOverlay');
  if (existing) existing.remove();

  // Auto-detect context: 'landing' or 'app'
  if (!context) {
    const appEl = document.querySelector('.app');
    context = (appEl && appEl.style.display !== 'none') ? 'app' : 'landing';
  }

  const landingSteps = [
    { target: null, pos: 'center',
      title: '⚔️ Welcome to DnD Character Tracker',
      body: 'This quick tour shows you where everything is. Use the arrows to step through, or press ✕ to skip.' },
    { target: '#btnChooseChar', pos: 'bottom',
      title: '👤 Choose a Character',
      body: 'Click here to load an existing character or create a new one. You can also import from a JSON share code.' },
    { target: '#btnHost', pos: 'bottom',
      title: '🎮 Host a Game',
      body: 'Start a multiplayer session. Players can connect with a room code and you can view their sheets in real time.' },
    { target: '#landingAuthBar', pos: 'top',
      title: '☁️ Cloud Sync',
      body: 'Sign in with Google to sync your characters across devices. All saves are also stored locally so the app works offline.' },
  ];

  const appSteps = [
    { target: '#headerCard', pos: 'bottom',
      title: '📋 Character Header',
      body: 'Your key stats — HP, AC, Speed, Initiative and Passive Perception — are always visible here at the top.' },
    { target: '#tabsCard', pos: 'top',
      title: '🗂️ Tab Bar',
      body: 'Switch between sections here. On mobile tap <b>☰</b> to open the full drawer and <b>★</b> to pin your favourite tabs to the quick bar.<br><br>Open any tab to get a quick tip about what it does.' },
  ];

  const steps = context === 'app' ? appSteps : landingSteps;
  let step = 0;

  // ── DOM structure ──────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'tutorialOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:500;pointer-events:none;';

  // SVG spotlight layer
  const svgNS = 'http://www.w3.org/2000/svg';
  const svgEl = document.createElementNS(svgNS, 'svg');
  svgEl.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';

  // Click blocker (dims area but allows tooltip interaction)
  const blocker = document.createElement('div');
  blocker.style.cssText = 'position:absolute;inset:0;pointer-events:auto;';

  // Tooltip card
  const tooltip = document.createElement('div');
  tooltip.style.cssText = `
    position:fixed; z-index:501; pointer-events:auto;
    max-width:320px; width:calc(100vw - 32px);
    background:var(--panel); border:1px solid rgba(124,192,255,0.4);
    border-radius:var(--radius); padding:16px 16px 12px;
    box-shadow:0 16px 48px rgba(0,0,0,.7), 0 0 0 1px rgba(124,192,255,0.15);
  `;

  overlay.appendChild(svgEl);
  overlay.appendChild(blocker);
  overlay.appendChild(tooltip);

  // ── Spotlight renderer ─────────────────────────────────────────────────
  function updateSpotlight(rect) {
    svgEl.innerHTML = '';
    const W = window.innerWidth, H = window.innerHeight;

    if (!rect) {
      const dim = document.createElementNS(svgNS, 'rect');
      dim.setAttribute('width', W); dim.setAttribute('height', H);
      dim.setAttribute('fill', 'rgba(0,0,0,0.68)');
      svgEl.appendChild(dim);
      return;
    }

    const PAD = 10, R = 10;
    const x = Math.round(rect.left - PAD), y = Math.round(rect.top - PAD);
    const w = Math.round(rect.width + PAD * 2), h = Math.round(rect.height + PAD * 2);

    const defs  = document.createElementNS(svgNS, 'defs');
    const mask  = document.createElementNS(svgNS, 'mask');
    mask.id = 'tut-mask';
    const mbg   = document.createElementNS(svgNS, 'rect');
    mbg.setAttribute('width', W); mbg.setAttribute('height', H); mbg.setAttribute('fill', 'white');
    const mhole = document.createElementNS(svgNS, 'rect');
    mhole.setAttribute('x', x); mhole.setAttribute('y', y);
    mhole.setAttribute('width', w); mhole.setAttribute('height', h);
    mhole.setAttribute('rx', R); mhole.setAttribute('fill', 'black');
    mask.appendChild(mbg); mask.appendChild(mhole); defs.appendChild(mask);
    svgEl.appendChild(defs);

    const dim = document.createElementNS(svgNS, 'rect');
    dim.setAttribute('width', W); dim.setAttribute('height', H);
    dim.setAttribute('fill', 'rgba(0,0,0,0.68)');
    dim.setAttribute('mask', 'url(#tut-mask)');
    svgEl.appendChild(dim);

    const ring = document.createElementNS(svgNS, 'rect');
    ring.setAttribute('x', x); ring.setAttribute('y', y);
    ring.setAttribute('width', w); ring.setAttribute('height', h);
    ring.setAttribute('rx', R); ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', 'rgba(124,192,255,0.75)');
    ring.setAttribute('stroke-width', '2');
    svgEl.appendChild(ring);
  }

  // ── Tooltip positioner ─────────────────────────────────────────────────
  function positionTooltip(rect, pos, arrowContainer) {
    const TW = Math.min(320, window.innerWidth - 32);
    const TH_EST = 230; // estimated tooltip height for clamping
    const vw = window.innerWidth, vh = window.innerHeight;
    const PAD = 10;
    tooltip.style.maxWidth = TW + 'px';
    ['top','bottom','left','right','transform'].forEach(p => tooltip.style.removeProperty(p));
    arrowContainer.innerHTML = '';

    if (!rect || pos === 'center') {
      tooltip.style.top = '50%';
      tooltip.style.left = '50%';
      tooltip.style.transform = 'translate(-50%,-50%)';
      return;
    }

    let left = Math.round(rect.left + rect.width / 2 - TW / 2);
    left = Math.max(PAD, Math.min(left, vw - TW - PAD));
    const arrowOff = Math.max(16, Math.min(TW - 16, Math.round(rect.left + rect.width / 2) - left));

    // Flip side if not enough room
    let actualPos = pos;
    if (pos === 'bottom' && rect.bottom + 14 + TH_EST > vh - PAD) actualPos = 'top';
    if (pos === 'top'    && rect.top  - 14 - TH_EST < PAD)         actualPos = 'bottom';

    let topPx;
    if (actualPos === 'bottom') {
      topPx = Math.max(PAD, Math.min(Math.round(rect.bottom + 14), vh - TH_EST - PAD));
      arrowContainer.innerHTML = `
        <div style="position:absolute;top:-8px;left:${arrowOff}px;transform:translateX(-50%);width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-bottom:9px solid rgba(124,192,255,0.4);"></div>
        <div style="position:absolute;top:-6px;left:${arrowOff}px;transform:translateX(-50%);width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:8px solid var(--panel);"></div>`;
    } else {
      topPx = Math.max(PAD, Math.round(rect.top - TH_EST - 14));
      arrowContainer.innerHTML = `
        <div style="position:absolute;bottom:-8px;left:${arrowOff}px;transform:translateX(-50%);width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-top:9px solid rgba(124,192,255,0.4);"></div>
        <div style="position:absolute;bottom:-6px;left:${arrowOff}px;transform:translateX(-50%);width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:8px solid var(--panel);"></div>`;
    }
    tooltip.style.top  = topPx + 'px';
    tooltip.style.left = left + 'px';
  }

  // ── Step renderer ──────────────────────────────────────────────────────
  function renderStep() {
    const s = steps[step];
    if (s.before) s.before();

    const targetEl = s.target ? document.querySelector(s.target) : null;
    const rect = targetEl ? targetEl.getBoundingClientRect() : null;

    updateSpotlight(rect);

    const dots = steps.map((_, i) =>
      `<div style="width:7px;height:7px;border-radius:50%;flex-shrink:0;
        background:${i === step ? 'var(--accent)' : 'rgba(255,255,255,0.18)'};
        transition:background .2s;"></div>`
    ).join('');

    tooltip.innerHTML = `
      <div id="tutArrow" style="position:absolute;"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:8px;">
        <div style="font-size:14px;font-weight:700;line-height:1.3;">${s.title}</div>
        <button id="btnTutClose" style="background:none;border:none;cursor:pointer;font-size:17px;color:var(--muted);line-height:1;flex-shrink:0;padding:0;">✕</button>
      </div>
      <div style="font-size:13px;line-height:1.6;color:var(--text);margin-bottom:12px;">${s.body}</div>
      <div style="display:flex;justify-content:center;gap:5px;margin-bottom:12px;">${dots}</div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button id="btnTutPrev" class="btn" style="padding:6px 14px;font-size:12px;${step===0?'visibility:hidden;':''}">← Back</button>
        <div style="flex:1;text-align:center;font-size:11px;color:var(--muted);">${step+1} / ${steps.length}</div>
        ${step === steps.length - 1
          ? `<button id="btnTutDone" class="btn" style="padding:6px 16px;font-size:12px;background:rgba(124,192,255,0.15);border-color:var(--accent);color:var(--accent);">Done ✓</button>`
          : `<button id="btnTutNext" class="btn" style="padding:6px 16px;font-size:12px;background:rgba(124,192,255,0.15);border-color:var(--accent);color:var(--accent);">Next →</button>`
        }
      </div>
      <label style="display:flex;align-items:center;gap:7px;cursor:pointer;margin-top:9px;">
        <input type="checkbox" id="chkDontShow" ${!appSettings.showTutorial?'checked':''} style="cursor:pointer;">
        <span style="font-size:11px;color:var(--muted);">Don't show on startup</span>
      </label>
    `;

    const arrowContainer = tooltip.querySelector('#tutArrow');
    positionTooltip(rect, s.pos, arrowContainer);

    tooltip.querySelector('#btnTutClose').onclick = close;
    const prev = tooltip.querySelector('#btnTutPrev');
    if (prev) prev.onclick = () => { step--; renderStep(); };
    const next = tooltip.querySelector('#btnTutNext');
    if (next) next.onclick = () => { step++; renderStep(); };
    const done = tooltip.querySelector('#btnTutDone');
    if (done) done.onclick = close;
    tooltip.querySelector('#chkDontShow').onchange = (e) => {
      appSettings.showTutorial = !e.target.checked;
      saveAppSettings();
    };
  }

  function close() {
    overlay.remove();
    window.removeEventListener('resize', onResize);
  }

  function onResize() { renderStep(); }
  window.addEventListener('resize', onResize);

  document.body.appendChild(overlay);
  renderStep();
}
