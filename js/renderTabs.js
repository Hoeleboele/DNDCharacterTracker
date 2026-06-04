// renderTabs.js — Tab bar rendering and switching logic

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

function renderTabNotch(label, aRgb, containerId = 'tabsCard', noTransition = false) {
  const old = document.getElementById('tabTitleNotch');
  if (old) old.remove();
  const tabsCard = document.getElementById(containerId);
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
    ${noTransition ? '' : 'transition:bottom .22s cubic-bezier(.4,0,.2,1);'}
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
    { id:'conditions_exhaustion', label:'Conditions' },
    { id:'inventory',  label:'Inventory' },
    { id:'camp',       label:'Camp' },
    { id:'settings',   label:'Settings' },
    { id:'notes',      label:'Notes' },
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
  renderTabNotch(activeLabel, aRgbM, 'tabsCard', tabDrawerOpen);

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

  // Top row: Settings + Main Menu side-by-side (moved to top of drawer)
  const topRow = document.createElement('div');
  topRow.style.cssText = 'grid-column:1/-1; display:flex; gap:8px; margin-bottom:8px;';

  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'tab';
  settingsBtn.textContent = 'Settings';
  settingsBtn.dataset.tab = 'settings';
  settingsBtn.style.cssText = 'flex:1; padding:12px 6px; font-size:14px;';

  const notesBtn = document.createElement('button');
  notesBtn.className = 'tab';
  notesBtn.textContent = 'Notes';
  notesBtn.dataset.tab = 'notes';
  notesBtn.style.cssText = 'flex:1; padding:12px 6px; font-size:14px;';

  const menuBtn = document.createElement('button');
  menuBtn.id = 'btnMenuToggle';
  menuBtn.className = 'tab';
  menuBtn.textContent = 'Save to Main Menu';
  menuBtn.style.cssText = 'flex:1; padding:12px 6px; font-size:14px;';

  topRow.appendChild(settingsBtn);
  topRow.appendChild(notesBtn);
  topRow.appendChild(menuBtn);
  drawer.appendChild(topRow);

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

    if (t.id === 'settings' || t.id === 'notes') { return; }

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

  overlay.appendChild(drawer);
  document.body.appendChild(overlay);

  function openDrawer() {
    tabDrawerOpen = true;
    overlay.style.background = 'rgba(0,0,0,.5)';
    overlay.style.pointerEvents = 'auto';
    requestAnimationFrame(() => {
      drawer.style.transform = 'translateY(0)';
      const notch = document.getElementById('tabTitleNotch');
      if (notch) {
        notch.style.transition = 'none';
        notch.style.bottom = (tabBarH + drawer.offsetHeight) + 'px';
        requestAnimationFrame(() => { notch.style.transition = ''; });
      }
    });
  }
  function closeDrawer() {
    tabDrawerOpen = false;
    overlay.style.background = 'rgba(0,0,0,0)';
    overlay.style.pointerEvents = 'none';
    drawer.style.transform = 'translateY(100%)';
    const notch = document.getElementById('tabTitleNotch');
    if (notch) {
      notch.style.transition = 'none';
      notch.style.bottom = tabBarH + 'px';
      requestAnimationFrame(() => { notch.style.transition = ''; });
    }
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
      star.blur();
      renderTabs();
      // Re-open drawer after re-render, notch already at correct position (no transition)
      requestAnimationFrame(() => {
        const newOverlay = document.getElementById('tabDrawerOverlay');
        const newDrawer  = document.getElementById('tabDrawer');
        if (newOverlay && newDrawer) {
          newOverlay.style.background = 'rgba(0,0,0,.5)';
          newOverlay.style.pointerEvents = 'auto';
          newDrawer.style.transition = 'none';
          newDrawer.style.transform = 'translateY(0)';
          const notch = document.getElementById('tabTitleNotch');
          if (notch) notch.style.bottom = (tabBarH + newDrawer.offsetHeight) + 'px';
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

// Reusable tab bar renderer for embedding tab UI elsewhere (e.g. host view)
// Responsive: matches player tab bar styling in both mobile and desktop modes
function renderTabBar(containerId, allTabs, activeId, onSwitch) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const visibleTabs = allTabs.filter(t => !t.hide);
  const activeLabel = (visibleTabs.find(t => t.id === activeId) || {}).label || '';
  const aRgb = tabRgb(activeId);

  // Desktop mode (640px+)
  if (window.innerWidth >= 640) {
    container.innerHTML = `
      <div style="display:flex; justify-content:center; padding:6px 10px; overflow-x:auto; scrollbar-width:none;">
        <div class="row" style="gap:6px; flex-wrap:nowrap; align-items:center;">
          ${visibleTabs.map(t => {
            const rgb = tabRgb(t.id);
            const isActive = t.id === activeId;
            return `<button class="tab ${isActive?'active':''}" data-tab="${t.id}"
              style="white-space:nowrap; padding:10px 14px; font-size:14px;
                color:rgba(${rgb},1);
                ${isActive ? `border-color:rgba(${rgb},0.6); background:rgba(${rgb},0.12);` : `border-color:rgba(${rgb},0.2);`}"
            >${t.label}</button>`;
          }).join('')}
        </div>
      </div>
    `;
    container.style.background = `rgba(${aRgb},0.06)`;
    renderTabNotch(activeLabel, aRgb, containerId);
    // Remove any leftover mobile overlay
    const ov = document.getElementById('hostTabDrawerOverlay');
    if (ov) ov.remove();
  } else {
    // Mobile mode (<640px)
    const favSet = new Set(favTabs || []);
    const visibleFavTabs = visibleTabs.filter(t => favSet.has(t.id))
      .sort((a, b) => favTabs.indexOf(a.id) - favTabs.indexOf(b.id));

    container.innerHTML = `
      <div class="row" style="gap:6px; flex-wrap:nowrap; align-items:center; padding:6px 10px; width:100%;">
        ${visibleFavTabs.map(t => {
          const rgb = tabRgb(t.id);
          const isActive = t.id === activeId;
          return `<button class="tab ${isActive?'active':''}" data-tab="${t.id}"
            style="flex:1; white-space:nowrap; padding:10px 8px; font-size:13px;
              color:rgba(${rgb},1);
              ${isActive ? `border-color:rgba(${rgb},0.6); background:rgba(${rgb},0.12);` : `border-color:rgba(${rgb},0.2);`}"
          >${t.label}</button>`;
        }).join('')}
        <button id="btnHostTabDrawer" class="tab" style="flex-shrink:0; padding:10px 12px; font-size:18px; line-height:1;">&#9776;</button>
      </div>
    `;
    container.style.background = `rgba(${aRgb},0.06)`;
    const _hostDrawerWasOpen = !!document.getElementById('hostTabDrawerOverlay');
    renderTabNotch(activeLabel, aRgb, containerId, _hostDrawerWasOpen);

    // Tab drawer overlay (mobile menu)
    let existing = document.getElementById('hostTabDrawerOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'hostTabDrawerOverlay';
    overlay.style.cssText = `
      position:fixed; inset:0; z-index:19; background:rgba(0,0,0,0);
      pointer-events:none; transition:background .2s;
    `;
    const drawer = document.createElement('div');
    drawer.id = 'hostTabDrawer';
    const tabBarH = container.offsetHeight || 64;
    drawer.style.cssText = `
      position:absolute; bottom:${tabBarH}px; left:0; right:0;
      background:var(--panel); border-top:1px solid var(--line);
      border-radius:18px 18px 0 0; padding:14px 10px 10px;
      transform:translateY(100%); transition:transform .22s cubic-bezier(.4,0,.2,1);
      display:grid; grid-template-columns:repeat(3,1fr); gap:8px;
    `;

    // Back button (top row)
    const topRow = document.createElement('div');
    topRow.style.cssText = 'grid-column:1/-1; display:flex; gap:8px; margin-bottom:8px;';

    const backBtn = document.createElement('button');
    backBtn.className = 'tab';
    backBtn.className = 'btnBackToHost';
    backBtn.textContent = 'Back to Overview';
    backBtn.id = 'btnHostMenuToggleMobile';
    backBtn.style.cssText = 'flex:1; padding:12px 6px; font-size:14px;';

    topRow.appendChild(backBtn);
    drawer.appendChild(topRow);

    // Hint label
    const hint = document.createElement('div');
    hint.style.cssText = 'grid-column:1/-1; font-size:11px; color:var(--muted); text-align:center; margin-bottom:2px;';
    hint.textContent = '★ pin up to 4 tabs to the bar';
    drawer.appendChild(hint);

    // All tabs with star buttons
    visibleTabs.forEach(t => {
      const isFav = favSet.has(t.id);
      const rgb = tabRgb(t.id);
      const isActive = t.id === activeId;

      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative; display:flex;';

      const btn = document.createElement('button');
      btn.className = `tab ${isActive ? 'active' : ''}`;
      btn.dataset.tab = t.id;
      btn.style.cssText = `
        flex:1; padding:12px 6px 12px 6px; font-size:12px; text-align:center; padding-right:28px;
        color:rgba(${rgb},1);
        ${isActive ? `border-color:rgba(${rgb},0.6); background:rgba(${rgb},0.12);` : `border-color:rgba(${rgb},0.2);`}
      `;
      btn.textContent = t.label;

      const star = document.createElement('button');
      star.dataset.hostFavBtn = t.id;
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

    overlay.appendChild(drawer);
    document.body.appendChild(overlay);

    let isOpen = false;

    function openHostDrawer() {
      isOpen = true;
      overlay.style.background = 'rgba(0,0,0,0.4)';
      overlay.style.pointerEvents = 'auto';
      requestAnimationFrame(() => {
        drawer.style.transform = 'translateY(0)';
        const notch = document.getElementById('tabTitleNotch');
        if (notch) {
          notch.style.transition = 'none';
          notch.style.bottom = (tabBarH + drawer.offsetHeight) + 'px';
          requestAnimationFrame(() => { notch.style.transition = ''; });
        }
      });
    }

    function closeHostDrawer() {
      isOpen = false;
      overlay.style.background = 'rgba(0,0,0,0)';
      overlay.style.pointerEvents = 'none';
      drawer.style.transform = 'translateY(100%)';
      const notch = document.getElementById('tabTitleNotch');
      if (notch) {
        notch.style.transition = 'none';
        notch.style.bottom = tabBarH + 'px';
        requestAnimationFrame(() => { notch.style.transition = ''; });
      }
    }

    // Star toggle handlers
    drawer.querySelectorAll('[data-host-fav-btn]').forEach(star => {
      star.onclick = (e) => {
        e.stopPropagation();
        const id = star.dataset.hostFavBtn;
        if (favTabs.includes(id)) {
          favTabs = favTabs.filter(x => x !== id);
        } else if (favTabs.length < 4) {
          favTabs = [...favTabs, id];
        } else {
          // Replace the last favorited tab with the new one
          favTabs = [...favTabs.slice(0, 3), id];
        }
        saveFavTabs();
        star.blur();
        renderTabBar(containerId, allTabs, activeId, onSwitch);
        // Re-open drawer after re-render, reposition notch without transition
        requestAnimationFrame(() => {
          const newOverlay = document.getElementById('hostTabDrawerOverlay');
          const newDrawer = document.getElementById('hostTabDrawer');
          if (newOverlay && newDrawer) {
            newOverlay.style.background = 'rgba(0,0,0,0.4)';
            newOverlay.style.pointerEvents = 'auto';
            newDrawer.style.transition = 'none';
            newDrawer.style.transform = 'translateY(0)';
            const notch = document.getElementById('tabTitleNotch');
            if (notch) notch.style.bottom = (tabBarH + newDrawer.offsetHeight) + 'px';
            requestAnimationFrame(() => { newDrawer.style.transition = ''; });
          }
          isOpen = true;
        });
      };
    });

    const drawerBtn = document.getElementById('btnHostTabDrawer');
    if (drawerBtn) {
      drawerBtn.onclick = (e) => {
        e.stopPropagation();
        isOpen ? closeHostDrawer() : openHostDrawer();
      };
    }

    overlay.addEventListener('click', (e) => {
      if (!drawer.contains(e.target)) closeHostDrawer();
    });

    drawer.querySelectorAll('[data-tab]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        closeHostDrawer();
        const id = btn.dataset.tab;
        if (typeof onSwitch === 'function') onSwitch(id);
      };
    });

    backBtn.onclick = (e) => {
      e.stopPropagation();
      closeHostDrawer();
      if (typeof window.mpViewingPlayer !== 'undefined') {
        mpViewingPlayer = null;
        mpDetailTab = 'overview';
        renderHostView();
      }
    };
  }



  // Wire main tab buttons in bar
  container.querySelectorAll('[data-tab]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.tab;
      if (typeof onSwitch === 'function') onSwitch(id);
    };
  });
}
