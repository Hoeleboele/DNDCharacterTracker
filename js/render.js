// --- Rendering ---
// Re-render tabs on resize so mobile/desktop layout switches
(() => {
  let _lastMobile = window.innerWidth < 640;
  window.addEventListener('resize', () => {
    const mobile = window.innerWidth < 640;
    if (mobile !== _lastMobile) { _lastMobile = mobile; renderTabs(); }
  });
})();

function render(){
  renderHeader();
  renderTabs();
  renderContent();
  syncToHost();
}

function renderHeader(){
  const c = state.character;
  const title = `${escapeHtml(c.name)} · Level ${c.level} ${escapeHtml(c.class)}${c.subclass ? ` (${escapeHtml(c.subclass)})` : ''}`;
  const sub = [c.race, c.background].filter(Boolean).map(escapeHtml).join(' · ');

  const as = c.ability_scores || {};
  const profBonus = toInt(c.combat.proficiency_bonus, 2);
  const wisMod = Math.floor((toInt(as.wis, 10) - 10) / 2);
  const percProf = Array.isArray(c.skill_proficiencies) && c.skill_proficiencies.includes('perception');
  const passivePerception = 10 + wisMod + (percProf ? profBonus : 0) + toInt(c.combat.pp_bonus, 0);

  const hpMax = c.hp.max || 1;
  const hpCur = clamp(Number(c.hp.current) || 0, 0, hpMax);
  const pct = Math.round((hpCur / hpMax) * 100);
  const low = pct <= 33;

  const conditions = (c.conditions || []).slice(0, 6).map(x => `<span class="pill">${escapeHtml(x)}</span>`).join('');

  $('#headerCard').innerHTML = `
    <div class="row" style="justify-content:space-between; align-items:flex-start;">
      <div class="col" style="gap:6px; min-width:240px;">
        <div style="display:flex; flex-direction:column; gap:4px;">
          <div style="font-size:18px; font-weight:700;">${title}</div>
          <div class="mini">${sub || '<span class="muted">(race/background not set)</span>'}</div>
        </div>
        <div class="row" style="gap:8px;">
          <button class="btn" id="btnSaveLocal" style="padding:5px 14px; font-size:13px;">${saveBtnLabel()}</button>
        </div>
        <div class="row" style="gap:8px;">
          <span class="pill">AC <b style="color:var(--text)">${c.combat.ac}</b></span>
          <span class="pill">Speed <b style="color:var(--text)">${c.combat.speed}</b></span>
          <span class="pill">Init <b style="color:var(--text)">${signed(Math.floor((toInt(c.ability_scores?.dex,10)-10)/2) + toInt(c.combat.initiative_mod,0))}</b></span>
          <span class="pill">PP <b style="color:var(--text)">${passivePerception}</b></span>
        </div>
      </div>

      <div class="col" style="flex:1; max-width:520px;">
        <div class="row" style="justify-content:space-between;">
          <div><b>HP</b> <span class="muted">(temp: ${c.hp.temp || 0})</span></div>
          <div class="muted">${hpCur} / ${hpMax} (${pct}%)</div>
        </div>
        <div class="hpbar" aria-label="HP bar">
          <div class="hpfill ${low ? 'low':''}" style="width:${pct}%;"></div>
        </div>
        <div class="row" style="margin-top:8px;">
          ${(c.conditions || []).length ? `<div class="row" style="gap:6px;">${conditions}</div>` : `<div class="mini">No conditions set. Miracles do happen.</div>`}
        </div>
      </div>
    </div>
  `;

  // Wire header save button
  $('#btnSaveLocal').onclick = () => {
    state.exported_at = new Date().toISOString();
    flashSaveBtn('Saving…', 0);
    const ok = saveToLocalStorage();
    flashSaveBtn(ok ? 'Saved ✓' : 'Save failed', 2000);
  };

  // Apply tab color glow to header card
  const headerCard = document.getElementById('headerCard');
  if (headerCard) {
    const rgb = tabRgb(activeTab);
    headerCard.style.border = `1px solid rgba(${rgb},${appSettings.cardGlow ? '0.65' : '0.2'})`;
    headerCard.style.boxShadow = appSettings.cardGlow
      ? `0 14px 30px rgba(0,0,0,.35), 0 0 0 1px rgba(${rgb},0.25), 0 0 28px rgba(${rgb},0.35)`
      : `0 14px 30px rgba(0,0,0,.35)`;
  }
}


function switchTab(id) {
  activeTab = id;
  renderContent();
  renderTabs();
  if (appSettings.showAppTutorial && !tutorialSeenTabs.has(id)) {
    tutorialSeenTabs.add(id);
    const tip = TAB_TIPS[id];
    if (tip) setTimeout(() => showTabTip(tip.title, tip.body, id), 120);
  }
}

function showTabTip(title, body, tabId) {
  const existing = document.getElementById('tabTipCard');
  if (existing) existing.remove();
  if (document.getElementById('tutorialOverlay')) return;
  const tabsCard = document.getElementById('tabsCard');
  if (!tabsCard) return;
  const tabsRect = tabsCard.getBoundingClientRect();
  const rgb = tabRgb(tabId);
  const bottomOffset = Math.round(window.innerHeight - tabsRect.top) + 8;
  const tip = document.createElement('div');
  tip.id = 'tabTipCard';
  tip.style.cssText = `
    position:fixed; z-index:400;
    left:12px; right:12px;
    bottom:${bottomOffset}px;
    background:var(--panel);
    border:1px solid rgba(${rgb},0.7);
    border-top:3px solid rgba(${rgb},1);
    border-radius:var(--radius);
    padding:12px 14px 12px 14px;
    box-shadow:0 8px 32px rgba(0,0,0,.65), 0 0 0 1px rgba(${rgb},0.2);
    display:flex; align-items:flex-start; gap:10px;
    animation:tabTipIn .22s ease;
    pointer-events:auto;
  `;
  tip.innerHTML = `
    <div style="flex:1;">
      <div style="font-size:14px;font-weight:700;margin-bottom:5px;color:rgba(${rgb},1);">${title}</div>
      <div style="font-size:13px;line-height:1.6;color:var(--text);">${body}</div>
    </div>
    <button id="btnTabTipClose" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--muted);line-height:1;flex-shrink:0;padding:0 2px;margin-top:-2px;">✕</button>
  `;
  document.body.appendChild(tip);
  if (!document.getElementById('tabTipStyle')) {
    const s = document.createElement('style');
    s.id = 'tabTipStyle';
    s.textContent = '@keyframes tabTipIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}';
    document.head.appendChild(s);
  }
  const dismiss = () => { tip.style.opacity = '0'; tip.style.transition = 'opacity .18s'; setTimeout(() => tip.remove(), 180); };
  document.getElementById('btnTabTipClose').onclick = dismiss;
  setTimeout(dismiss, 10000);
}

function renderTabNotch(label, aRgb) {
  const old = document.getElementById('tabTitleNotch');
  if (old) old.remove();
  const tabsCard = document.getElementById('tabsCard');
  if (!tabsCard) return;
  const h = tabsCard.offsetHeight;
  const notch = document.createElement('div');
  notch.id = 'tabTitleNotch';
  notch.textContent = label;
  notch.style.cssText = `
    position:fixed; bottom:${h}px; left:50%; transform:translateX(-50%);
    z-index:21; white-space:nowrap;
    background:var(--panel);
    border:1px solid rgba(${aRgb},0.5);
    border-bottom:none;
    border-radius:8px 8px 0 0;
    padding:3px 14px 4px;
    font-size:11px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase;
    color:rgba(${aRgb},1);
    pointer-events:none;
    transition:bottom .22s cubic-bezier(.4,0,.2,1);
  `;
  document.body.appendChild(notch);
}

function renderTabsDesktop(allTabs){
  const activeLabel = (allTabs.find(t => t.id === activeTab) || {}).label || '';
  const aRgb = tabRgb(activeTab);
  $('#tabsCard').innerHTML = `
    <div style="display:flex; justify-content:center; padding:6px 10px; overflow-x:auto; scrollbar-width:none;">
      <div class="row" style="gap:6px; flex-wrap:nowrap; align-items:center;">
        ${allTabs.map(t => {
          const rgb = tabRgb(t.id);
          const isActive = t.id === activeTab;
          return `<button class="tab ${isActive?'active':''}" data-tab="${t.id}"
            style="white-space:nowrap; padding:10px 14px; font-size:14px;
              color:rgba(${rgb},1);
              ${isActive ? `border-color:rgba(${rgb},0.6); background:rgba(${rgb},0.12);` : `border-color:rgba(${rgb},0.2);`}"
          >${t.label}</button>`;
        }).join('')}
        <button id="btnMenuToggle" class="tab" style="white-space:nowrap; padding:10px 14px; font-size:14px;">Save to Main Menu</button>
      </div>
    </div>
  `;
  $('#tabsCard').style.background = `rgba(${aRgb},0.06)`;
  renderTabNotch(activeLabel, aRgb);
  // Remove any leftover mobile overlay
  const ov = document.getElementById('tabDrawerOverlay');
  if (ov) ov.remove();
  tabDrawerOpen = false;

  $('#tabsCard').querySelectorAll('[data-tab]').forEach(btn => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });
  document.getElementById('btnMenuToggle').onclick = () => {
    flashSaveBtn('Saving…', 0);
    saveToLocalStorage();
    returnToMenu();
  };
}

function renderTabs(){
  const isCaster = !!state.character.spellcasting;
  const allTabs = [
    { id:'overview',   label:'Overview' },
    { id:'stats',      label:'Stats' },
    { id:'class_race', label:'Character' },
    { id:'features',   label:'Features' },
    { id:'spells',     label:'Spells', hide: !isCaster },
    { id:'combat',     label:'Combat' },
    { id:'inventory',  label:'Inventory' },
    { id:'camp',       label:'Camp' },
    { id:'settings',   label:'Settings' },
  ].filter(t => !t.hide);

  // If current tab got hidden, bounce to overview
  if (!allTabs.some(t => t.id === activeTab)) activeTab = 'overview';

  if (window.innerWidth >= 640) return renderTabsDesktop(allTabs);

  // Remove stale favorites (e.g. spells when not a caster)
  favTabs = favTabs.filter(id => allTabs.some(t => t.id === id));

  const favSet = new Set(favTabs);
  const visibleTabs = allTabs.filter(t => favSet.has(t.id))
    .sort((a, b) => favTabs.indexOf(a.id) - favTabs.indexOf(b.id));

  const activeLabel = (allTabs.find(t => t.id === activeTab) || {}).label || '';
  const aRgbM = tabRgb(activeTab);
  $('#tabsCard').innerHTML = `
    <div class="row" style="gap:6px; flex-wrap:nowrap; align-items:center; padding:6px 10px;">
      ${visibleTabs.map(t => {
        const rgb = tabRgb(t.id);
        const isActive = t.id === activeTab;
        return `<button class="tab ${isActive?'active':''}" data-tab="${t.id}"
          style="flex:1; white-space:nowrap; padding:10px 8px; font-size:13px;
            color:rgba(${rgb},1);
            ${isActive ? `border-color:rgba(${rgb},0.6); background:rgba(${rgb},0.12);` : `border-color:rgba(${rgb},0.2);`}"
        >${t.label}</button>`;
      }).join('')}
      <button id="btnTabDrawer" class="tab" style="flex-shrink:0; padding:10px 12px; font-size:18px; line-height:1;">&#9776;</button>
    </div>
  `;
  $('#tabsCard').style.background = `rgba(${aRgbM},0.06)`;
  renderTabNotch(activeLabel, aRgbM);

  // Tab drawer overlay
  let existing = document.getElementById('tabDrawerOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'tabDrawerOverlay';
  overlay.style.cssText = `
    position:fixed; inset:0; z-index:19; background:rgba(0,0,0,0);
    pointer-events:none; transition:background .2s;
  `;
  const drawer = document.createElement('div');
  drawer.id = 'tabDrawer';
  const tabBarH = (document.getElementById('tabsCard') || {}).offsetHeight || 64;
  drawer.style.cssText = `
    position:absolute; bottom:${tabBarH}px; left:0; right:0;
    background:var(--panel); border-top:1px solid var(--line);
    border-radius:18px 18px 0 0; padding:14px 10px 10px;
    transform:translateY(100%); transition:transform .22s cubic-bezier(.4,0,.2,1);
    display:grid; grid-template-columns:repeat(3,1fr); gap:8px;
  `;

  // Hint label
  const hint = document.createElement('div');
  hint.style.cssText = 'grid-column:1/-1; font-size:11px; color:var(--muted); text-align:center; margin-bottom:2px;';
  hint.textContent = '★ pin up to 4 tabs to the bar';
  drawer.appendChild(hint);

  allTabs.forEach(t => {
    const isFav = favSet.has(t.id);
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative; display:flex;';

    const btn = document.createElement('button');
    btn.className = 'tab' + (t.id === activeTab ? ' active' : '');
    btn.dataset.tab = t.id;
    const bRgb = tabRgb(t.id);
    const isActive = t.id === activeTab;
    btn.style.cssText = `flex:1; padding:12px 6px 12px 6px; font-size:14px; text-align:center; padding-right:28px;
      color:rgba(${bRgb},1);
      ${isActive ? `border-color:rgba(${bRgb},0.6); background:rgba(${bRgb},0.12);` : `border-color:rgba(${bRgb},0.2);`}`;
    btn.textContent = t.label;

    if (t.id === 'settings') { wrap.appendChild(btn); drawer.appendChild(wrap); return; }

    const star = document.createElement('button');
    star.dataset.favBtn = t.id;
    star.style.cssText = `
      position:absolute; right:4px; top:50%; transform:translateY(-50%);
      background:none; border:none; cursor:pointer; font-size:15px; line-height:1;
      color:${isFav ? 'var(--warn)' : 'var(--muted)'}; padding:4px;
    `;
    star.textContent = isFav ? '★' : '☆';
    star.title = isFav ? 'Unpin from bar' : (favTabs.length >= 4 ? 'Unpin another tab first' : 'Pin to bar');

    wrap.appendChild(btn);
    wrap.appendChild(star);
    drawer.appendChild(wrap);
  });

  // Main Menu button
  const menuBtn = document.createElement('button');
  menuBtn.id = 'btnMenuToggle';
  menuBtn.className = 'tab';
  menuBtn.textContent = 'Save to Main Menu';
  menuBtn.style.cssText = 'padding:12px 6px; font-size:14px; grid-column:1/-1;';
  drawer.appendChild(menuBtn);

  overlay.appendChild(drawer);
  document.body.appendChild(overlay);

  function openDrawer() {
    tabDrawerOpen = true;
    overlay.style.background = 'rgba(0,0,0,.5)';
    overlay.style.pointerEvents = 'auto';
    requestAnimationFrame(() => {
      drawer.style.transform = 'translateY(0)';
      const notch = document.getElementById('tabTitleNotch');
      if (notch) notch.style.bottom = (tabBarH + drawer.offsetHeight) + 'px';
    });
  }
  function closeDrawer() {
    tabDrawerOpen = false;
    overlay.style.background = 'rgba(0,0,0,0)';
    overlay.style.pointerEvents = 'none';
    drawer.style.transform = 'translateY(100%)';
    const notch = document.getElementById('tabTitleNotch');
    if (notch) notch.style.bottom = tabBarH + 'px';
  }

  document.getElementById('btnTabDrawer').onclick = (e) => {
    e.stopPropagation();
    tabDrawerOpen ? closeDrawer() : openDrawer();
  };

  overlay.addEventListener('click', (e) => {
    if (!drawer.contains(e.target)) closeDrawer();
  });

  // Star toggle handlers
  drawer.querySelectorAll('[data-fav-btn]').forEach(star => {
    star.onclick = (e) => {
      e.stopPropagation();
      const id = star.dataset.favBtn;
      if (favTabs.includes(id)) {
        favTabs = favTabs.filter(x => x !== id);
      } else if (favTabs.length < 4) {
        favTabs = [...favTabs, id];
      } else {
        // Replace the last favorited tab with the new one
        favTabs = [...favTabs.slice(0, 3), id];
      }
      saveFavTabs();
      renderTabs();
      // Re-open drawer after re-render
      requestAnimationFrame(() => {
        const newOverlay = document.getElementById('tabDrawerOverlay');
        const newDrawer  = document.getElementById('tabDrawer');
        if (newOverlay && newDrawer) {
          newOverlay.style.background = 'rgba(0,0,0,.5)';
          newOverlay.style.pointerEvents = 'auto';
          newDrawer.style.transition = 'none';
          newDrawer.style.transform = 'translateY(0)';
          requestAnimationFrame(() => { newDrawer.style.transition = ''; });
        }
        tabDrawerOpen = true;
      });
    };
  });

  // Tab navigation handlers
  drawer.querySelectorAll('[data-tab]').forEach(btn => {
    btn.onclick = () => {
      closeDrawer();
      switchTab(btn.dataset.tab);
    };
  });

  menuBtn.onclick = () => {
    closeDrawer();
    flashSaveBtn('Saving…', 0);
    saveToLocalStorage();
    returnToMenu();
  };

  // Wire quick-tab buttons in bar
  $('#tabsCard').querySelectorAll('[data-tab]').forEach(btn => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });
}

function renderContent(){
  const c = state.character;
  if (activeTab === 'overview') renderOverview(c);
  else if (activeTab === 'stats') renderStats(c);
  else if (activeTab === 'class_race') renderCharacter(c);
  else if (activeTab === 'features') renderFeatures(c);
  else if (activeTab === 'spells') renderSpells(c);
  else if (activeTab === 'combat') renderCombat(c);
  else if (activeTab === 'inventory') renderInventory(c);
  else if (activeTab === 'camp') renderCamp(c);
  else if (activeTab === 'settings') renderSettings();
  const rgb = tabRgb(activeTab);
  const card = document.getElementById('contentCard');
  if (card) {
    card.style.border = `1px solid rgba(${rgb},${appSettings.cardGlow ? '0.65' : '0.2'})`;
    card.style.boxShadow = appSettings.cardGlow
      ? `0 14px 30px rgba(0,0,0,.35), 0 0 0 1px rgba(${rgb},0.25), 0 0 28px rgba(${rgb},0.35)`
      : `0 14px 30px rgba(0,0,0,.35)`;
  }
  const headerCard = document.getElementById('headerCard');
  if (headerCard) {
    headerCard.style.border = `1px solid rgba(${rgb},${appSettings.cardGlow ? '0.65' : '0.2'})`;
    headerCard.style.boxShadow = appSettings.cardGlow
      ? `0 14px 30px rgba(0,0,0,.35), 0 0 0 1px rgba(${rgb},0.25), 0 0 28px rgba(${rgb},0.35)`
      : `0 14px 30px rgba(0,0,0,.35)`;
  }
}
