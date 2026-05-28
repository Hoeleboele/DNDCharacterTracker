let mpPeer = null;

let mpHostConn = null;     // player → host connection
let mpPlayerConns = {};    // host's map: peerId → { conn, state }
let mpRoomCode = '';
let mpExpandedPlayers = new Set();
let mpNotesExpanded = new Set();
let mpRefreshing = false;
let mpViewingPlayer = null;
let mpDetailTab = 'overview';
const MP_PLAYER_NOTES_KEY = 'mp_player_notes_v1';
let mpPlayerNotes = {};

function startHost() {
  setLandingStatus('Starting…');
  gameMode = 'host';
  mpPlayerConns = {};
  mpExpandedPlayers = new Set();

  // Load any host-side fallback notes saved for players so undelivered notes
  // can be applied when a player next connects.
  try { mpPlayerNotes = JSON.parse(localStorage.getItem(MP_PLAYER_NOTES_KEY) || '{}') || {}; } catch (_) { mpPlayerNotes = {}; }

  mpTryHost(genCode());
}

function mpTryHost(code, allowFallback = true) {
  mpRoomCode = code;
  if (mpPeer) { try { mpPeer.destroy(); } catch (_) { } }
  mpPeer = new Peer(code);
  mpPeer.on('open', () => {
    mpRoomCode = mpPeer.id.toUpperCase();
    try { localStorage.setItem('mpRoomCode', mpRoomCode); localStorage.setItem('mpLastRoomCode', mpRoomCode); } catch (_) { }
    document.getElementById('landingOverlay').style.display = 'none';
    document.querySelector('.app').style.display = 'none';
    document.getElementById('hostView').style.display = 'block';
    startAutosave();
    renderHostView();
  });
  mpPeer.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      if (allowFallback) {
        mpTryHost(genCode(), true);
      } else {
        setLandingStatus('Room code unavailable — another host may still be active.');
        gameMode = null;
      }
    } else {
      setLandingStatus('Error: ' + (err.message || err.type));
      gameMode = null;
    }
  });
  mpPeer.on('connection', (conn) => {
    mpPlayerConns[conn.peer] = { conn, state: null, notes: '' };
    // If we have a stored host-side fallback note for this player, send it now
    try {
      if (mpPlayerNotes[conn.peer]) {
        if (conn && conn.open) conn.send({ type: 'host_notes', notes: String(mpPlayerNotes[conn.peer]) });
        mpPlayerConns[conn.peer].notes = mpPlayerNotes[conn.peer] || '';
      }
    } catch (_) {}
    conn.on('data', (data) => {
      if (data.type === 'sync') {
        mpPlayerConns[conn.peer].state = data.state;
        // if the player included their locally-saved host note, use it
        if (data.host_notes != null) mpPlayerConns[conn.peer].notes = data.host_notes || '';
        mpRefreshing = false;
        renderHostView();
      }
    });
    conn.on('close', () => { delete mpPlayerConns[conn.peer]; renderHostView(); });
    conn.on('error', () => { delete mpPlayerConns[conn.peer]; renderHostView(); });
    renderHostView();
  });
};

function joinGame(code) {
  setLandingStatus('Connecting…');
  gameMode = 'player';
  mpRoomCode = code;
  try { localStorage.setItem('mpLastRoomCode', mpRoomCode); } catch (_) { }
  if (mpPeer) { try { mpPeer.destroy(); } catch (_) { } }
  mpPeer = new Peer();
  mpPeer.on('open', () => {
    mpHostConn = mpPeer.connect(mpRoomCode);
    mpHostConn.on('open', () => {
      document.getElementById('landingOverlay').style.display = 'none';
      document.querySelector('.app').style.display = '';
      startAutosave();
      syncToHost();
      render();
    });
    mpHostConn.on('data', (data) => {
      if (data.type === 'request-sync') syncToHost();
      else if (data.type === 'host_notes') {
        // Host is sending a note for this player — persist it locally under the host room code.
        try {
          const map = JSON.parse(localStorage.getItem(MP_PLAYER_NOTES_KEY) || '{}') || {};
          map[mpRoomCode] = String(data.notes || '');
          localStorage.setItem(MP_PLAYER_NOTES_KEY, JSON.stringify(map));
        } catch (_) {}
        try { render(); } catch (_) {}
      }
    });
    mpHostConn.on('error', () => {
      setLandingStatus('Could not connect. Check the code and try again.');
      gameMode = null;
    });
  });
  mpPeer.on('error', (err) => {
    setLandingStatus('Network error: ' + (err.message || err.type));
    gameMode = null;
  });
  setTimeout(() => {
    if (gameMode === 'player' && (!mpHostConn || !mpHostConn.open)) {
      setLandingStatus('Connection timed out. Check the code and try again.');
      gameMode = null;
    }
  }, 10000);
}


function syncToHost() {
  if (gameMode === 'player' && mpHostConn && mpHostConn.open) {
    // Include any locally-saved note for this host so the host can display it.
    let hostNote = '';
    try { const map = JSON.parse(localStorage.getItem(MP_PLAYER_NOTES_KEY) || '{}') || {}; hostNote = map[mpRoomCode] || ''; } catch (_) { hostNote = ''; }
    mpHostConn.send({ type: 'sync', state, host_notes: hostNote });
  }
  saveToLocalStorage();
}


function genCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function renderHostView() {
  const players = Object.entries(mpPlayerConns);
  const inner = document.getElementById('hostViewInner');
  if (!inner) return;

  const playersHtml = players.length === 0
    ? `<div class="card" style="text-align:center; padding:48px; max-width:500px; margin:0 auto;">
         <div style="font-size:48px; margin-bottom:16px;">⏳</div>
         <h2>Waiting for players…</h2>
         <div class="mini">Share the room code with your players</div>
       </div>`
    : `<div class="host-grid">${players.map(([pid, pd]) => renderPlayerCard(pid, pd)).join('')}</div>`;

  inner.innerHTML = `
    <div class="host-header" style="max-width:1400px; margin:0 auto;">
      <div>
        <div style="font-size:13px; color:var(--muted); letter-spacing:.5px; margin-bottom:2px;">ROOM CODE</div>
        <div class="room-code">${escapeHtml(mpRoomCode)}</div>
      </div>
      <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
        <span class="pill">${players.length} player${players.length !== 1 ? 's' : ''} connected</span>
        ${mpRefreshing
      ? `<span class="mini" style="color:var(--warn);">⏳ Retrieving data…</span>`
      : `<button class="btn" id="btnHostRefresh">↺ Refresh</button>`}
        <button class="btn" id="btnHostReconnect">↻ Reconnect</button>
        <button class="btn" id="btnHostMenu">Main Menu</button>
      </div>
    </div>
    ${playersHtml}
  `;

  inner.querySelectorAll('[data-expand]').forEach(btn => {
    btn.onclick = () => {
      const pid = btn.dataset.expand;
      if (mpExpandedPlayers.has(pid)) mpExpandedPlayers.delete(pid); else mpExpandedPlayers.add(pid);
      renderHostView();
    };
  });

  inner.querySelectorAll('[data-fullview]').forEach(btn => {
    btn.onclick = () => {
      mpViewingPlayer = btn.dataset.fullview;
      mpDetailTab = 'overview';
      renderHostFullView();
    };
  });

  inner.querySelectorAll('[data-notes]').forEach(btn => {
    btn.onclick = () => {
      const pid = btn.dataset.notes;
      if (mpNotesExpanded.has(pid)) mpNotesExpanded.delete(pid); else mpNotesExpanded.add(pid);
      renderHostView();
    };
  });

  // Save/close handlers for inline notes textarea
  inner.querySelectorAll('[data-notes-save]').forEach(btn => {
    btn.onclick = () => {
      const pid = btn.dataset.notesSave;
      const ta = document.getElementById('notesArea-' + pid);
      const val = ta ? String(ta.value || '') : '';
      try {
        mpPlayerNotes[pid] = val;
        localStorage.setItem(MP_PLAYER_NOTES_KEY, JSON.stringify(mpPlayerNotes));
        if (mpPlayerConns[pid] && mpPlayerConns[pid].conn && mpPlayerConns[pid].conn.open) {
          mpPlayerConns[pid].conn.send({ type: 'host_notes', notes: val });
          mpPlayerConns[pid].notes = val;
        }
      } catch (e) {}
      mpNotesExpanded.delete(pid);
      renderHostView();
    };
  });
  inner.querySelectorAll('[data-notes-close]').forEach(btn => {
    btn.onclick = () => {
      const pid = btn.dataset.notesClose;
      mpNotesExpanded.delete(pid);
      renderHostView();
    };
  });

  const refreshBtn = inner.querySelector('#btnHostRefresh');
  if (refreshBtn) refreshBtn.onclick = () => {
    mpRefreshing = true;
    renderHostView();
    Object.values(mpPlayerConns).forEach(pd => {
      if (pd.conn && pd.conn.open) pd.conn.send({ type: 'request-sync' });
    });
    setTimeout(() => {
      mpRefreshing = false;
      renderHostView();
    }, 3000);
  };

  const menuBtn = inner.querySelector('#btnHostMenu');
  if (menuBtn) menuBtn.onclick = () => returnToMenu();

  const reconnectBtn = inner.querySelector('#btnHostReconnect');
  if (reconnectBtn) reconnectBtn.onclick = () => {
    const code = mpRoomCode || genCode();
    mpPlayerConns = {};
    mpExpandedPlayers = new Set();
    mpViewingPlayer = null;
    mpRefreshing = false;
    // Try to reclaim the original room code. If it's unavailable, do not
    // silently fall back to a different code — surface the error instead.
    if (typeof mpTryHost === 'function') mpTryHost(code, false);
  };

  // Render a compact tab bar in the host view as well
  try {
    let hostTabs = document.getElementById('hostTabsCard');
    if (!hostTabs) {
      hostTabs = document.createElement('div');
      hostTabs.id = 'hostTabsCard';
      document.getElementById('hostView').appendChild(hostTabs);
    }
    // Use the same tabs as the main app (so host can quickly jump to similar views if desired)
    const allTabs = [
      { id:'overview',   label:'Overview' },
      { id:'stats',      label:'Stats' },
      { id:'class_race', label:'Character' },
      { id:'features',   label:'Features' },
      { id:'spells',     label:'Spells' },
      { id:'combat',     label:'Combat' },
      { id:'conditions_exhaustion', label:'Conditions' },
      { id:'inventory',  label:'Inventory' },
      { id:'camp',       label:'Camp' },
      { id:'settings',   label:'Settings' },
    ];
    renderTabBar('hostTabsCard', allTabs, activeTab || 'overview', (id) => { switchTab(id); });
  } catch (e) {}
}

function renderPlayerCard(pid, pd) {
  const ch = pd.state ? pd.state.character : null;
  const isExpanded = mpExpandedPlayers.has(pid);

  if (!ch) return `
    <div class="player-card">
      <div class="player-card-header">
        <div class="mini">Player connecting…</div>
      </div>
    </div>`;

  const hp = ch.hp || {};
  const hpCur = toInt(hp.current, 0);
  const hpMax = Math.max(toInt(hp.max, 1), 1);
  const hpPct = clamp(Math.round(hpCur / hpMax * 100), 0, 100);
  const hpColor = hpPct > 50 ? 'var(--good)' : hpPct > 25 ? 'var(--warn)' : 'var(--bad)';

  const meta = [ch.race, ch.background, `Level ${ch.level || 1}`, ch.class_name].filter(Boolean).join(' · ');
  const conditions = (ch.conditions || []);
  const combat = ch.combat || {};
  const ex = computeExhaustionEffects(ch);
  const as2 = ch.ability_scores || {};
  const profB = toInt(combat.proficiency_bonus, 2);
  const wisM = Math.floor((toInt(as2.wis, 10) - 10) / 2);
  const percP = Array.isArray(ch.skill_proficiencies) && ch.skill_proficiencies.includes('perception');
  const pp = 10 + wisM + (percP ? profB : 0);
  const statPills = [
    `AC ${combat.ac ?? 10}`,
    `Speed ${ex.effectiveSpeed ?? (combat.speed ?? 30)}`,
    `Init ${wisM >= 0 ? '+' : ''}${Math.floor((toInt(as2.dex, 10) - 10) / 2) + toInt(combat.initiative_mod, 0)}`,
    `PP ${pp}`,
  ].map(s => `<span class="pill" style="font-size:12px;">${s}</span>`).join('');

  return `
    <div class="player-card">
      <div class="player-card-header">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; flex-wrap:wrap;">
          <div>
            <b style="font-size:18px;">${escapeHtml(ch.name || 'Unnamed')}</b>
            <div class="mini" style="margin-top:2px;">${escapeHtml(meta)}</div>
            <div style="margin-top:6px; display:flex; gap:4px; flex-wrap:wrap;">${statPills}</div>
          </div>
          <div style="text-align:right; flex-shrink:0;">
            <div style="font-size:22px; font-weight:700; color:${hpColor};">${hpCur} / ${hpMax}</div>
            <div class="mini">HP${hp.temp ? ` (+${hp.temp} temp)` : ''}</div>
          </div>
        </div>
        <div style="margin-top:10px; height:8px; border-radius:4px; background:var(--line); overflow:hidden;">
          <div style="height:100%; width:${hpPct}%; background:${hpColor}; border-radius:4px;"></div>
        </div>
        ${conditions.length ? `
          <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
            ${conditions.map(c => `<span class="pill" style="background:rgba(255,107,107,.15); color:var(--bad);">${escapeHtml(c)}</span>`).join('')}
          </div>` : ''}
      </div>
      ${isExpanded ? `<div class="player-card-details">${renderCharacterDetails(ch)}</div>` : ''}
      <div class="player-card-footer">
        <button class="btn" data-expand="${pid}">${isExpanded ? 'Collapse' : 'View Details'}</button>
        ${isExpanded ? `<button class="btn" data-fullview="${pid}">Full Overview</button>` : ''}
        <button class="btn" data-notes="${pid}">Notes</button>
      </div>
      ${mpNotesExpanded.has(pid) ? `
        <div class="player-notes" style="padding:12px 16px; border-top:1px solid var(--line); background:rgba(8,12,18,.45);">
          <textarea id="notesArea-${pid}">${escapeHtml((pd && pd.notes) || mpPlayerNotes[pid] || '')}</textarea>
          <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:8px;">
            <button class="btn" data-notes-save="${pid}">Save</button>
            <button class="btn" data-notes-close="${pid}">Close</button>
          </div>
        </div>
      ` : ''}
    </div>`;
}

function renderHostFullView() {
  const pd = mpPlayerConns[mpViewingPlayer];
  const inner = document.getElementById('hostViewInner');
  if (!inner || !pd || !pd.state) return renderHostView();
  const ch = pd.state.character;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'stats', label: 'Stats' },
    { id: 'class_race', label: 'Character' },
    { id: 'features', label: 'Features' },
    { id: 'combat', label: 'Combat' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'spells', label: 'Spells', hide: !ch.spellcasting },
  ].filter(t => !t.hide);

  function mod(v) { const m = Math.floor((toInt(v, 10) - 10) / 2); return (m >= 0 ? '+' : '') + m; }
  const as = ch.ability_scores || {};
  const combat = ch.combat || {};
  const profBonus = toInt(combat.proficiency_bonus, 2);
  const profs = ch.skill_proficiencies || [];
  const disadv = ch.skill_disadvantages || [];
  const wisM = Math.floor((toInt(as.wis, 10) - 10) / 2);
  const pp = 10 + wisM + (profs.includes('perception') ? profBonus : 0);

  const SKILLS = [
    { key: 'acrobatics', label: 'Acrobatics', stat: 'dex' }, { key: 'animal_handling', label: 'Animal Handling', stat: 'wis' },
    { key: 'arcana', label: 'Arcana', stat: 'int' }, { key: 'athletics', label: 'Athletics', stat: 'str' },
    { key: 'deception', label: 'Deception', stat: 'cha' }, { key: 'history', label: 'History', stat: 'int' },
    { key: 'insight', label: 'Insight', stat: 'wis' }, { key: 'intimidation', label: 'Intimidation', stat: 'cha' },
    { key: 'investigation', label: 'Investigation', stat: 'int' }, { key: 'medicine', label: 'Medicine', stat: 'wis' },
    { key: 'nature', label: 'Nature', stat: 'int' }, { key: 'perception', label: 'Perception', stat: 'wis' },
    { key: 'performance', label: 'Performance', stat: 'cha' }, { key: 'persuasion', label: 'Persuasion', stat: 'cha' },
    { key: 'religion', label: 'Religion', stat: 'int' }, { key: 'sleight_of_hand', label: 'Sleight of Hand', stat: 'dex' },
    { key: 'stealth', label: 'Stealth', stat: 'dex' }, { key: 'survival', label: 'Survival', stat: 'wis' },
  ];

  function tabContent() {
    if (mpDetailTab === 'overview') {
      const hp = ch.hp || {};
      const hpCur = toInt(hp.current, 0); const hpMax = Math.max(toInt(hp.max, 1), 1);
      const hpPct = clamp(Math.round(hpCur / hpMax * 100), 0, 100);
      const hpColor = hpPct > 50 ? 'var(--good)' : hpPct > 25 ? 'var(--warn)' : 'var(--bad)';
      return `
        <div class="grid2">
          <div class="col">
            <h2>Quick Stats</h2>
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
              <span class="pill">AC ${combat.ac ?? 10}</span>
              <span class="pill">Speed ${combat.speed ?? 30}</span>
              <span class="pill">Init ${mod(as.dex)}</span>
              <span class="pill">Prof +${profBonus}</span>
              <span class="pill">Passive Perception ${pp}</span>
            </div>
            <h2 style="margin-top:14px;">HP</h2>
            <div style="font-size:26px; font-weight:700; color:${hpColor};">${hpCur} / ${hpMax}${hp.temp ? ` <span style="font-size:14px; color:var(--muted);">(+${hp.temp} temp)</span>` : ''}</div>
            <div style="margin-top:8px; height:10px; border-radius:5px; background:var(--line); overflow:hidden;">
              <div style="height:100%; width:${hpPct}%; background:${hpColor}; border-radius:5px;"></div>
            </div>
            ${(ch.conditions || []).length ? `
              <h2 style="margin-top:14px;">Conditions</h2>
              <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
                ${(ch.conditions || []).map(c => `<span class="pill" style="background:rgba(255,107,107,.15);color:var(--bad);">${escapeHtml(c)}</span>`).join('')}
              </div>` : ''}
          </div>
          <div class="col">
            <h2>Resources</h2>
            ${(ch.resources || []).length ? (ch.resources || []).map(r => `
              <div class="item"><b>${escapeHtml(r.name)}</b>
                <span class="pill">${toInt(r.used, 0)} / ${toInt(r.max, 0)}</span>
              </div>`).join('') : '<div class="mini">No resources.</div>'}
            <h2 style="margin-top:14px;">Features</h2>
            ${(ch.features || []).length ? (ch.features || []).map(f => `
              <div class="item">
                <div><b>${escapeHtml(f.name)}</b><div class="mini">${escapeHtml(f.description || '')}</div></div>
                ${f.uses_max != null ? `<span class="pill">${toInt(f.uses_used, 0)} / ${toInt(f.uses_max, 0)}</span>` : ''}
              </div>`).join('') : '<div class="mini">No features.</div>'}
          </div>
        </div>`;
    }
    if (mpDetailTab === 'stats') {
      return `
        <div>
          <h2>Abilities</h2>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
            ${['str', 'dex', 'con', 'int', 'wis', 'cha'].map(s => `<span class="pill" style="font-size:12px;">${s.toUpperCase()} ${mod(as[s])}</span>`).join('')}
          </div>
        </div>

        <div class="grid2">
          <div class="col">
            <h2>Ability Scores</h2>
            <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:10px;">
              ${['str', 'dex', 'con', 'int', 'wis', 'cha'].map(s => `
                <div class="stat-block">
                  <div class="stat-abbr">${s.toUpperCase()}</div>
                  <div class="stat-mod" style="color:${toInt(as[s], 10) >= 10 ? 'var(--good)' : 'var(--bad)'}">${mod(as[s])}</div>
                  <div class="stat-label">${toInt(as[s], 10)}</div>
                </div>`).join('')}
            </div>
          </div>
          <div class="col">
            <h2>Skills <span class="mini">Prof +${profBonus}</span></h2>
            <div class="skill-list" style="margin-top:8px;">
              ${SKILLS.map(sk => {
        const t = Math.floor((toInt(as[sk.stat], 10) - 10) / 2) + (profs.includes(sk.key) ? profBonus : 0);
        const tStr = (t >= 0 ? '+' : '') + t;
        return `<div class="skill-row">
                  <span class="skill-prof-dot${profs.includes(sk.key) ? ' proficient' : ''}"></span>
                  <span class="skill-dis-btn${disadv.includes(sk.key) ? ' active' : ''}">DIS</span>
                  <span class="skill-mod-val" style="color:${t >= 0 ? 'var(--good)' : 'var(--bad)'}">${tStr}</span>
                  <span class="skill-name">${sk.label}</span>
                  <span class="skill-stat-tag">${sk.stat.toUpperCase()}</span>
                </div>`;
      }).join('')}
            </div>
          </div>
        </div>`;
    }
    if (mpDetailTab === 'classrace') {
      return `
        <div class="grid2">
          <div class="col">
            <h2>Resources</h2>
            ${(ch.resources || []).length ? (ch.resources || []).map(r => `
              <div class="item">
                <div><b>${escapeHtml(r.name)}</b><div class="mini">${escapeHtml(r.notes || '')} · resets on ${r.reset || 'never'}</div></div>
                <span class="pill">${toInt(r.used, 0)} / ${toInt(r.max, 0)}</span>
              </div>`).join('') : '<div class="mini">No resources.</div>'}
          </div>
          <div class="col">
            <h2>Features</h2>
            ${(ch.features || []).length ? (ch.features || []).map(f => `
              <div class="item">
                <div><b>${escapeHtml(f.name)}</b><div class="mini">${escapeHtml(f.description || '')}</div></div>
                ${f.uses_max != null ? `<span class="pill">${toInt(f.uses_used, 0)} / ${toInt(f.uses_max, 0)}</span>` : ''}
              </div>`).join('') : '<div class="mini">No features.</div>'}
          </div>
        </div>`;
    }
    if (mpDetailTab === 'features') {
      return `
        <div class="grid2">
          <div class="col">
            <h2>Resources</h2>
            ${(ch.resources || []).length ? (ch.resources || []).map(r => `
              <div class="item">
                <div><b>${escapeHtml(r.name)}</b><div class="mini">${escapeHtml(r.notes || '')} · resets on ${r.reset || 'never'}</div></div>
                <span class="pill">${toInt(r.used, 0)} / ${toInt(r.max, 0)}</span>
              </div>`).join('') : '<div class="mini">No resources.</div>'}
          </div>
          <div class="col">
            <h2>Features</h2>
            ${(ch.features || []).length ? (ch.features || []).map(f => `
              <div class="item">
                <div>
                  <b>${escapeHtml(f.name || 'Feature')}</b>
                  <div class="mini">${escapeHtml(f.description || '')}</div>
                </div>
                ${f.uses_max != null ? `<span class="pill">${toInt(f.uses_used, 0)} / ${toInt(f.uses_max, 0)}</span>` : ''}
              </div>`).join('') : '<div class="mini">No features.</div>'}
            ${ (ch.feats && (ch.feats.length > 0)) ? `
              <h2 style="margin-top:14px;">Feats</h2>
              ${(ch.feats || []).map(ft => `
                <div class="item">
                  <div>
                    <b>${escapeHtml(ft.name || 'Feat')}</b>
                    <div class="mini">${escapeHtml(ft.description || ft.notes || '')}</div>
                  </div>
                </div>`).join('')}
            ` : ''}
          </div>
        </div>`;
    }
    if (mpDetailTab === 'combat') {
      return `
        <div class="grid2">
          <div class="col">
            <h2>Attacks</h2>
            ${(ch.attacks || []).length ? (ch.attacks || []).map(a => `
              <div class="item">
                <div>
                  <b>${escapeHtml(a.name || 'Attack')}</b>
                  <span class="pill" style="margin-left:6px;">to hit: ${a.to_hit != null ? signed(toInt(a.to_hit, 0)) : '—'}</span>
                  <div class="mini"><b>Damage:</b> ${escapeHtml(a.damage || '')}</div>
                  <div class="mini">${escapeHtml(a.notes || '')}</div>
                </div>
              </div>`).join('') : '<div class="mini">No attacks.</div>'}
            <h2 style="margin-top:14px;">Actions</h2>
            ${(ch.actions || []).length ? (ch.actions || []).map(a => `
              <div class="item">
                <div><b>${escapeHtml(a.name || 'Action')}</b><div class="mini">${escapeHtml(a.notes || '')}</div></div>
              </div>`).join('') : '<div class="mini">No actions.</div>'}
          </div>
        </div>`;
    }
    if (mpDetailTab === 'inventory') {
      const inv = ch.inventory || {};
      const currency = inv.currency || {};
      const items = inv.items || [];
      const coins = [['CP', currency.cp], ['SP', currency.sp], ['EP', currency.ep], ['GP', currency.gp], ['PP', currency.pp]].filter(([, v]) => toInt(v, 0) > 0);
      return `
        <div class="grid2">
          <div class="col">
            <h2>Items</h2>
            ${items.length ? items.map(it => `
              <div class="item">
                <div>
                  <b>${escapeHtml(it.name || 'Item')}</b>
                  ${it.equipped ? `<span class="pill" style="margin-left:6px; font-size:11px;">equipped</span>` : ''}
                  <div class="mini">${escapeHtml(it.notes || '')}</div>
                </div>
                <span class="pill">qty ${Math.max(toInt(it.qty, 0), 0)}</span>
              </div>`).join('') : '<div class="mini">No items.</div>'}
          </div>
          <div class="col">
            <h2>Currency</h2>
            ${coins.length ? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">${coins.map(([l, v]) => `<span class="pill">${toInt(v, 0)} ${l}</span>`).join('')}</div>` : '<div class="mini">No currency.</div>'}
          </div>
        </div>`;
    }
    if (mpDetailTab === 'spells') {
      const s = ch.spellcasting || {};
      const slots = s.spell_slots || [];
      const cantrips = s.cantrips || [];
      const prepared = s.prepared_spells || [];
      const known = s.known_spells || [];
      function spellItem(sp) { return `<div class="item"><div><b>${escapeHtml(sp.name || 'Spell')}</b>${sp.level ? ' (L' + sp.level + ')' : ''}<div class="mini">${escapeHtml(sp.notes || '')}</div></div></div>`; }
      return `
        <div class="grid2">
          <div class="col">
            <h2>Spell Slots</h2>
            ${slots.length ? slots.map(ss => `<span class="pill" style="margin:2px;">L${ss.level}: ${toInt(ss.used, 0)} / ${toInt(ss.max, 0)}</span>`).join('') : '<div class="mini">No slots.</div>'}
            <h2 style="margin-top:14px;">Cantrips</h2>
            ${cantrips.length ? cantrips.map(spellItem).join('') : '<div class="mini">No cantrips.</div>'}
          </div>
          <div class="col">
            <h2>Prepared Spells</h2>
            ${prepared.length ? prepared.map(spellItem).join('') : '<div class="mini">None.</div>'}
            <h2 style="margin-top:14px;">Known Spells</h2>
            ${known.length ? known.map(spellItem).join('') : '<div class="mini">None.</div>'}
          </div>
        </div>`;
    }
    if (mpDetailTab === 'quests') {
      return `<div class="col">
        ${(ch.quests || []).length ? (ch.quests || []).map(q => `
          <div class="item"><div>
            <b>${escapeHtml(q.title || 'Quest')}</b>
            <span class="pill" style="margin-left:6px; font-size:11px;">${q.status || 'active'}</span>
            <div class="mini">${escapeHtml(q.notes || '')}</div>
          </div></div>`).join('') : '<div class="mini">No quests.</div>'}
      </div>`;
    }
    if (mpDetailTab === 'notes') {
      return `<div style="white-space:pre-wrap; font-size:14px; line-height:1.6;">${escapeHtml(ch.notes || 'No notes.')}</div>`;
    }
    return '';
  }

  const hp2 = ch.hp || {};
  const hpC = toInt(hp2.current, 0); const hpM2 = Math.max(toInt(hp2.max, 1), 1);
  const hpPct2 = clamp(Math.round(hpC / hpM2 * 100), 0, 100);
  const hpCol2 = hpPct2 > 50 ? 'var(--good)' : hpPct2 > 25 ? 'var(--warn)' : 'var(--bad)';
  const hostNotes = (pd && pd.notes) || mpPlayerNotes[mpViewingPlayer] || '';

  inner.innerHTML = `
    <div style="max-width:1200px; margin:0 auto; padding:16px;">
      <div class="host-header">
        <div>
          <button class="btn" id="btnBackToHost">← Back</button>
        </div>
        <div style="flex:1; padding:0 16px;">
          <div style="font-size:22px; font-weight:700;">${escapeHtml(ch.name || 'Unnamed')}</div>
          <div class="mini">${escapeHtml([ch.race, ch.background, `Level ${ch.level || 1}`, ch.class_name].filter(Boolean).join(' · '))}</div>
          ${hostNotes ? `<div style="margin-top:6px;"><div class="mini" style="white-space:pre-wrap;">Host notes: ${escapeHtml(hostNotes)}</div><div style="margin-top:6px;"><button class="btn" id="btnEditHostNotes">Edit Notes</button></div></div>` : `<div style="margin-top:6px;"><button class="btn" id="btnEditHostNotes">Add Notes</button></div>`}
        </div>
        <div style="text-align:right;">
          <div style="font-size:22px; font-weight:700; color:${hpCol2};">${hpC} / ${hpM2} HP</div>
          <div style="margin-top:4px; width:140px; height:6px; border-radius:3px; background:var(--line); overflow:hidden; margin-left:auto;">
            <div style="height:100%; width:${hpPct2}%; background:${hpCol2}; border-radius:3px;"></div>
          </div>
        </div>
      </div>
      <div class="card" style="padding:0; overflow:hidden;">
        <div style="padding:16px;">
          ${tabContent()}
        </div>
      </div>
    </div>`;

  inner.querySelector('#btnBackToHost').onclick = () => {
    mpViewingPlayer = null;
    renderHostView();
  };
  inner.querySelectorAll('[data-dtab]').forEach(el => {
    el.onclick = () => { mpDetailTab = el.dataset.dtab; renderHostFullView(); };
  });
  const editBtn = inner.querySelector('#btnEditHostNotes');
  if (editBtn) editBtn.onclick = () => {
    const existing = mpPlayerNotes[mpViewingPlayer] || (mpPlayerConns[mpViewingPlayer] && mpPlayerConns[mpViewingPlayer].notes) || '';
    const val = prompt('Host notes for player (saved locally):', existing || '');
    if (val == null) return;
    try {
      mpPlayerNotes[mpViewingPlayer] = String(val);
      localStorage.setItem(MP_PLAYER_NOTES_KEY, JSON.stringify(mpPlayerNotes));
      if (mpPlayerConns[mpViewingPlayer] && mpPlayerConns[mpViewingPlayer].conn && mpPlayerConns[mpViewingPlayer].conn.open) {
        mpPlayerConns[mpViewingPlayer].conn.send({ type: 'host_notes', notes: String(val) });
        mpPlayerConns[mpViewingPlayer].notes = String(val);
      }
    } catch (e) {}
    renderHostFullView();
  };

  // Render bottom tab bar inside host view (reuse renderTabBar helper)
  try {
    // Ensure host tab container exists
    let hostTabs = document.getElementById('hostTabsCard');
    if (!hostTabs) {
      hostTabs = document.createElement('div');
      hostTabs.id = 'hostTabsCard';
      document.getElementById('hostView').appendChild(hostTabs);
    }
    renderTabBar('hostTabsCard', tabs, mpDetailTab, (id) => { mpDetailTab = id; renderHostFullView(); });
  } catch (e) {}
}

function renderCharacterDetails(ch) {
  const as = ch.ability_scores || {};
  const combat = ch.combat || {};
  const profBonus = combat.proficiency_bonus || 2;
  function mod(v) { const m = Math.floor((toInt(v, 10) - 10) / 2); return (m >= 0 ? '+' : '') + m; }

  const abilityHtml = `
    <h3 style="margin:0 0 8px;">Ability Scores</h3>
    <div style="display:grid; grid-template-columns:repeat(6,1fr); gap:6px; text-align:center; margin-bottom:14px;">
      ${['str', 'dex', 'con', 'int', 'wis', 'cha'].map(s => `
        <div style="background:var(--btn); border-radius:8px; padding:6px 4px;">
          <div style="font-size:10px; color:var(--muted); letter-spacing:.5px;">${s.toUpperCase()}</div>
          <div style="font-size:16px; font-weight:700;">${mod(as[s])}</div>
          <div style="font-size:11px; color:var(--muted);">${toInt(as[s], 10)}</div>
        </div>`).join('')}
    </div>`;

  const combatHtml = `
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
      <span class="pill">AC ${combat.ac ?? 10}</span>
      <span class="pill">Speed ${combat.speed ?? 30}</span>
      <span class="pill">Prof +${profBonus}</span>
      <span class="pill">Passive Perception ${(() => { const wm = Math.floor((toInt(as.wis, 10) - 10) / 2); const pp2 = (ch.skill_proficiencies || []).includes('perception'); return 10 + wm + (pp2 ? profBonus : 0); })()}</span>
    </div>`;

  const resources = (ch.resources || []);
  const resourcesHtml = resources.length ? `
    <h3 style="margin:0 0 8px;">Resources</h3>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
      ${resources.map(r => `<span class="pill">${escapeHtml(r.name)}: ${toInt(r.used, 0)} / ${toInt(r.max, 0)}</span>`).join('')}
    </div>` : '';

  const features = (ch.features || []).filter(f => f.uses_max != null);
  const featuresHtml = features.length ? `
    <h3 style="margin:0 0 8px;">Features</h3>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
      ${features.map(f => `<span class="pill">${escapeHtml(f.name)}: ${toInt(f.uses_used, 0)} / ${toInt(f.uses_max, 0)}</span>`).join('')}
    </div>` : '';

  const spells = ch.spellcasting;
  const slotsHtml = spells && (spells.spell_slots || []).length ? `
    <h3 style="margin:0 0 8px;">Spell Slots</h3>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
      ${spells.spell_slots.map(ss => `<span class="pill">L${ss.level}: ${toInt(ss.used, 0)} / ${toInt(ss.max, 0)}</span>`).join('')}
    </div>` : '';

  const attacks = (ch.attacks || []);
  const attacksHtml = attacks.length ? `
    <h3 style="margin:0 0 8px;">Attacks</h3>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
      ${attacks.map(a => `<span class="pill">${escapeHtml(a.name || 'Attack')}${a.to_hit != null ? ' ' + signed(toInt(a.to_hit, 0)) : ''}</span>`).join('')}
    </div>` : '';

  return abilityHtml + combatHtml + resourcesHtml + featuresHtml + slotsHtml + attacksHtml;
}