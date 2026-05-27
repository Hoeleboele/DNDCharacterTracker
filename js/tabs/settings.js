function renderSettings(){
  const rgb = tabRgb('settings');
  const autosaveOptions = [
    { label: '15 seconds', ms: 15000 },
    { label: '30 seconds', ms: 30000 },
    { label: '2 minutes',  ms: 120000 },
    { label: '5 minutes',  ms: 300000 },
    { label: 'Off',        ms: 0 },
  ];

  $('#contentCard').innerHTML = `
    <h2>Settings</h2>

    <div class="col" style="gap:20px; max-width:480px;">

      <div class="col" style="gap:8px;">
        <div style="font-size:14px; font-weight:600;">Tab Color Mode</div>
        <div class="mini muted" style="margin-bottom:4px;">When enabled, each tab has its own color for buttons, borders, and glows. When disabled, the default blue accent color is used everywhere.</div>
        <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
          <div id="colorModeToggle" style="
            position:relative; width:44px; height:24px; border-radius:12px; flex-shrink:0;
            background:${appSettings.colorMode ? `rgba(${rgb},0.85)` : 'var(--line)'};
            border:1px solid rgba(255,255,255,0.1);
            transition:background .2s;
            cursor:pointer;
          ">
            <div style="
              position:absolute; top:3px; left:${appSettings.colorMode ? '22px' : '3px'};
              width:16px; height:16px; border-radius:50%;
              background:#fff; transition:left .2s;
            "></div>
          </div>
          <span style="font-size:14px;">${appSettings.colorMode ? 'Enabled' : 'Disabled'}</span>
        </label>
      </div>

      <div class="col" style="gap:8px;">
        <div style="font-size:14px; font-weight:600;">Card Glow</div>
        <div class="mini muted" style="margin-bottom:4px;">Adds a colored glow to the borders of the header and content cards matching the active tab color.</div>
        <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
          <div id="cardGlowToggle" style="
            position:relative; width:44px; height:24px; border-radius:12px; flex-shrink:0;
            background:${appSettings.cardGlow ? `rgba(${rgb},0.85)` : 'var(--line)'};
            border:1px solid rgba(255,255,255,0.1);
            transition:background .2s;
            cursor:pointer;
          ">
            <div style="
              position:absolute; top:3px; left:${appSettings.cardGlow ? '22px' : '3px'};
              width:16px; height:16px; border-radius:50%;
              background:#fff; transition:left .2s;
            "></div>
          </div>
          <span style="font-size:14px;">${appSettings.cardGlow ? 'Enabled' : 'Disabled'}</span>
        </label>
      </div>

      <div class="col" style="gap:8px;">
        <div style="font-size:14px; font-weight:600;">Cloud Save on Exit</div>
        <div class="mini muted" style="margin-bottom:4px;">When enabled, your character is synced to the cloud every time you return to the main menu.</div>
        <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
          <div id="cloudSaveToggle" style="
            position:relative; width:44px; height:24px; border-radius:12px; flex-shrink:0;
            background:${appSettings.cloudSaveOnExit ? `rgba(${rgb},0.85)` : 'var(--line)'};
            border:1px solid rgba(255,255,255,0.1);
            transition:background .2s;
            cursor:pointer;
          ">
            <div style="
              position:absolute; top:3px; left:${appSettings.cloudSaveOnExit ? '22px' : '3px'};
              width:16px; height:16px; border-radius:50%;
              background:#fff; transition:left .2s;
            "></div>
          </div>
          <span style="font-size:14px;">${appSettings.cloudSaveOnExit ? 'Enabled' : 'Disabled'}</span>
        </label>
      </div>

      <div class="col" style="gap:8px;">
        <div style="font-size:14px; font-weight:600;">Tutorial on Landing Startup</div>
        <div class="mini muted" style="margin-bottom:4px;">Show the landing page tutorial each time you open the app.</div>
        <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
          <div id="tutorialToggle" style="
            position:relative; width:44px; height:24px; border-radius:12px; flex-shrink:0;
            background:${appSettings.showTutorial ? `rgba(${rgb},0.85)` : 'var(--line)'};
            border:1px solid rgba(255,255,255,0.1); transition:background .2s; cursor:pointer;
          ">
            <div style="position:absolute; top:3px; left:${appSettings.showTutorial ? '22px' : '3px'};
              width:16px; height:16px; border-radius:50%; background:#fff; transition:left .2s;"></div>
          </div>
          <span style="font-size:14px;">${appSettings.showTutorial ? 'Enabled' : 'Disabled'}</span>
        </label>
      </div>

      <div class="col" style="gap:8px;">
        <div style="font-size:14px; font-weight:600;">Tutorial after Character Load</div>
        <div class="mini muted" style="margin-bottom:4px;">Automatically show the in-app tutorial guide each time you load a character.</div>
        <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
          <div id="appTutorialToggle" style="
            position:relative; width:44px; height:24px; border-radius:12px; flex-shrink:0;
            background:${appSettings.showAppTutorial ? `rgba(${rgb},0.85)` : 'var(--line)'};
            border:1px solid rgba(255,255,255,0.1); transition:background .2s; cursor:pointer;
          ">
            <div style="position:absolute; top:3px; left:${appSettings.showAppTutorial ? '22px' : '3px'};
              width:16px; height:16px; border-radius:50%; background:#fff; transition:left .2s;"></div>
          </div>
          <span style="font-size:14px;">${appSettings.showAppTutorial ? 'Enabled' : 'Disabled'}</span>
        </label>
      </div>

      <div class="col" style="gap:8px;">
        <div style="font-size:14px; font-weight:600;">Autosave Interval</div>
        <div class="mini muted" style="margin-bottom:4px;">How often your character is automatically saved to local storage.</div>
        <div class="row" style="gap:8px; flex-wrap:wrap;">
          ${autosaveOptions.map(o => `
            <button class="btn autosave-opt" data-ms="${o.ms}" style="
              padding:7px 16px; font-size:13px;
              ${appSettings.autosaveMs === o.ms
                ? `background:rgba(${rgb},0.25); border-color:rgba(${rgb},0.7); color:rgba(${rgb},1);`
                : ''}
            ">${escapeHtml(o.label)}</button>
          `).join('')}
        </div>
      </div>

    </div>
  `;

  document.getElementById('colorModeToggle').onclick = () => {
    appSettings.colorMode = !appSettings.colorMode;
    saveAppSettings();
    render();
  };

  document.getElementById('cardGlowToggle').onclick = () => {
    appSettings.cardGlow = !appSettings.cardGlow;
    saveAppSettings();
    render();
  };

  document.getElementById('cloudSaveToggle').onclick = () => {
    appSettings.cloudSaveOnExit = !appSettings.cloudSaveOnExit;
    saveAppSettings();
    renderSettings();
  };

  document.getElementById('tutorialToggle').onclick = () => {
    appSettings.showTutorial = !appSettings.showTutorial;
    saveAppSettings();
    renderSettings();
  };

  document.getElementById('appTutorialToggle').onclick = () => {
    appSettings.showAppTutorial = !appSettings.showAppTutorial;
    saveAppSettings();
    renderSettings();
  };

  document.querySelectorAll('.autosave-opt').forEach(btn => {
    btn.onclick = () => {
      appSettings.autosaveMs = Number(btn.dataset.ms);
      saveAppSettings();
      startAutosave();
      renderSettings();
    };
  });
}
