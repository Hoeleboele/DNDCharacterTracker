let mpPeer = null;

let mpHostConn = null;     // player → host connection
let mpPlayerConns = {};    // host's map: peerId → { conn, state, notes, disconnected, disconnectedAt }
let mpRoomCode = '';
let mpExpandedPlayers = new Set();
let mpNotesExpanded = new Set();
let mpRefreshing = false;
let mpViewingPlayer = null;
let mpDetailTab = 'overview';
const MP_PLAYER_NOTES_KEY = 'mp_player_notes_v1';
let mpPlayerNotes = {};
let mpDisconnectTimers = {};  // peerId → timeoutId

// ── Initiative tracker ──────────────────────────────────────────────────────
const MP_INITIATIVE_KEY = 'mp_initiative_v1';
let mpView = 'players';   // 'players' | 'initiative'
let mpInitShowAddForm = false;
let mpInitAddFormType = 'enemy';  // 'enemy' | 'friendly'
let mpInitCondPickerId = null; // id of entry whose inline condition picker is open
/**
 * mpInitiative shape:
 *   { entries: [{ id, name, kind, playerPid?, initiative, status,
 *                 ac?, conditions?: string[]   // enemy-only fields }],
 *     round: number (0 = not started),
 *     activeId: string|null }
 * Player conditions are read live from mpPlayerConns[pid].state.character.conditions;
 * enemy conditions live on the entry itself.
 */
let mpInitiative = { entries: [], round: 0, activeId: null };

function mpInitLoad() {
  try {
    const raw = localStorage.getItem(MP_INITIATIVE_KEY);
    if (raw) mpInitiative = JSON.parse(raw) || mpInitiative;
  } catch (_) {}
}

function mpInitSave() {
  try { localStorage.setItem(MP_INITIATIVE_KEY, JSON.stringify(mpInitiative)); } catch (_) {}
}

/** Keep player entries in sync with mpPlayerConns (live players only). */
function mpInitSyncPlayers() {
  const existing = mpInitiative.entries;

  // Build a set of pids for connected (not permanently gone) players
  const livePids = new Set(
    Object.entries(mpPlayerConns)
      .filter(([, pd]) => !pd.disconnected || (pd.disconnectedAt && (Date.now() - pd.disconnectedAt) < 600000))
      .map(([pid]) => pid)
  );

  // Add entries for players not yet tracked
  for (const pid of livePids) {
    if (!existing.find(e => e.playerPid === pid)) {
      const ch = mpPlayerConns[pid]?.state?.character;
      existing.push({
        id: 'p_' + pid,
        name: ch?.name || 'Player',
        kind: 'player',
        playerPid: pid,
        initiative: null,
        status: 'active',
      });
    } else {
      // Update name if character state changed
      const entry = existing.find(e => e.playerPid === pid);
      const ch = mpPlayerConns[pid]?.state?.character;
      if (ch?.name) entry.name = ch.name;
    }
  }

  // Remove player entries whose pid is completely gone (cleaned up from mpPlayerConns)
  const allPids = new Set(Object.keys(mpPlayerConns));
  mpInitiative.entries = existing.filter(e => e.kind !== 'player' || allPids.has(e.playerPid));
}

/**
 * Returns entries sorted desc by initiative (nulls last),
 * grouped into arrays of equal initiative: [[e,e], [e], [e,e], ...]
 */
function mpInitSortedGroups() {
  const withVal = mpInitiative.entries.filter(e => e.initiative !== null);
  const noVal   = mpInitiative.entries.filter(e => e.initiative === null);

  // stable sort desc
  const sorted = withVal.slice().sort((a, b) => b.initiative - a.initiative);

  const groups = [];
  for (const e of sorted) {
    const last = groups[groups.length - 1];
    if (last && last[0].initiative === e.initiative) last.push(e);
    else groups.push([e]);
  }
  if (noVal.length) groups.push(noVal);
  return groups;
}

/** Flat array of entries in turn order (high→low, nulls last, insertion order for ties). */
function mpInitFlatOrder() {
  return mpInitSortedGroups().flat();
}

/** Next GROUP's first entry id (groups with same initiative are treated as one turn). */
function mpInitNextGroupId(currentId) {
  const groups = mpInitSortedGroups();
  if (!groups.length) return null;
  
  // Find which group the current id is in
  let currentGroupIdx = -1;
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].some(e => e.id === currentId)) {
      currentGroupIdx = i;
      break;
    }
  }
  
  if (currentGroupIdx === -1) return groups[0]?.[0]?.id || null;
  
  // Get the next group (wrap around)
  const nextGroupIdx = (currentGroupIdx + 1) % groups.length;
  return groups[nextGroupIdx]?.[0]?.id || null;
}

/** Next entry id after currentId in flat order, wrapping to start. */
function mpInitNextId(currentId) {
  const order = mpInitFlatOrder();
  if (!order.length) return null;
  const idx = order.findIndex(e => e.id === currentId);
  if (idx === -1) return order[0].id;
  return order[(idx + 1) % order.length].id;
}

/** On-deck (next) entry id. */
function mpInitOnDeckId(currentId) {
  return mpInitNextGroupId(currentId);
}

/** Host helper: push a new conditions array to a connected player and mirror locally. */
function mpSendConditionsToPlayer(pid, conditionsArr) {
  const pd = mpPlayerConns[pid];
  if (!pd) return;
  const arr = Array.isArray(conditionsArr) ? conditionsArr.slice() : [];
  // Mirror immediately so host UI reflects the change before the player echoes back.
  if (pd.state && pd.state.character) {
    pd.state.character.conditions = arr;
  }
  try {
    if (pd.conn && pd.conn.open) pd.conn.send({ type: 'set_conditions', conditions: arr });
  } catch (_) {}
}

function startHost() {
  setLandingStatus('Starting…');
  gameMode = 'host';
  mpPlayerConns = {};
  mpExpandedPlayers = new Set();

  // Load any host-side fallback notes saved for players so undelivered notes
  // can be applied when a player next connects.
  try { mpPlayerNotes = JSON.parse(localStorage.getItem(MP_PLAYER_NOTES_KEY) || '{}') || {}; } catch (_) { mpPlayerNotes = {}; }

  mpView = 'players';
  mpInitShowAddForm = false;
  mpInitLoad();

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
    mpPlayerConns[conn.peer] = { conn, state: null, notes: '', disconnected: false, disconnectedAt: null };
    // If we have a stored host-side fallback note for this player, send it now
    try {
      if (mpPlayerNotes[conn.peer]) {
        if (conn && conn.open) conn.send({ type: 'host_notes', notes: String(mpPlayerNotes[conn.peer]) });
        mpPlayerConns[conn.peer].notes = mpPlayerNotes[conn.peer] || '';
      }
    } catch (_) {}
    conn.on('data', (data) => {
      if (data.type === 'sync') {
        // Before storing new state, check if this is a reconnect by matching character name
        // to a disconnected slot. If found, copy notes and clean up the old slot.
        const charName = data.state?.character?.name;
        if (charName) {
          for (const [oldPid, oldPd] of Object.entries(mpPlayerConns)) {
            if (oldPd.disconnected && oldPd.state?.character?.name === charName) {
              // Found a match! Copy notes to new slot and remove old slot
              mpPlayerConns[conn.peer].notes = oldPd.notes;
              if (mpDisconnectTimers[oldPid]) {
                clearTimeout(mpDisconnectTimers[oldPid]);
                delete mpDisconnectTimers[oldPid];
              }
              delete mpPlayerConns[oldPid];
              break;
            }
          }
        }
        mpPlayerConns[conn.peer].state = data.state;
        mpPlayerConns[conn.peer].disconnected = false;
        mpPlayerConns[conn.peer].disconnectedAt = null;
        // if the player included their locally-saved host note, use it
        if (data.host_notes != null) mpPlayerConns[conn.peer].notes = data.host_notes || '';
        mpRefreshing = false;
        // If host is viewing this player's detail, update that view; otherwise show the player list
        if (mpViewingPlayer === conn.peer) {
          renderHostFullView();
        } else {
          renderHostView();
        }
      }
    });
    conn.on('close', () => {
      mpPlayerConns[conn.peer].conn = null;
      mpPlayerConns[conn.peer].disconnected = true;
      mpPlayerConns[conn.peer].disconnectedAt = Date.now();
      // Schedule cleanup after 10 minutes (600000 ms)
      mpDisconnectTimers[conn.peer] = setTimeout(() => {
        delete mpPlayerConns[conn.peer];
        delete mpDisconnectTimers[conn.peer];
        renderHostView();
      }, 600000);
      renderHostView();
    });
    conn.on('error', () => {
      mpPlayerConns[conn.peer].conn = null;
      mpPlayerConns[conn.peer].disconnected = true;
      mpPlayerConns[conn.peer].disconnectedAt = Date.now();
      // Schedule cleanup after 10 minutes (600000 ms)
      mpDisconnectTimers[conn.peer] = setTimeout(() => {
        delete mpPlayerConns[conn.peer];
        delete mpDisconnectTimers[conn.peer];
        renderHostView();
      }, 600000);
      renderHostView();
    });
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
      else if (data.type === 'set_conditions') {
        try {
          if (state && state.character) {
            state.character.conditions = Array.isArray(data.conditions) ? data.conditions.slice() : [];
            saveToLocalStorage();
            syncToHost();
            render();
          }
        } catch (_) {}
      }
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

/** Remove a player from the game (disconnect them). */
function mpRemovePlayer(pid) {
  const pd = mpPlayerConns[pid];
  if (!pd) return;
  
  // Close the connection if it's open
  if (pd.conn && pd.conn.open) {
    try { pd.conn.close(); } catch (_) {}
  }
  
  // Clear any pending disconnect timer
  if (mpDisconnectTimers[pid]) {
    clearTimeout(mpDisconnectTimers[pid]);
    delete mpDisconnectTimers[pid];
  }
  
  // Remove from player connections map
  delete mpPlayerConns[pid];
  delete mpPlayerNotes[pid];
  
  // Remove from expanded/notes display sets
  mpExpandedPlayers.delete(pid);
  mpNotesExpanded.delete(pid);
  
  // If viewing this player in full view, go back to player list
  if (mpViewingPlayer === pid) {
    mpViewingPlayer = null;
    renderHostView();
  } else {
    renderHostView();
  }
}

function renderHostView() {
  mpInitSyncPlayers();
  const players = Object.entries(mpPlayerConns);
  const inner = document.getElementById('hostViewInner');
  if (!inner) return;

  // Ensure the tab bar used for full-detail view is removed in the summary host view.
  try {
    const hostTabsCard = document.getElementById('hostTabsCard');
    if (hostTabsCard && hostTabsCard.parentNode) hostTabsCard.parentNode.removeChild(hostTabsCard);
    const notch = document.getElementById('tabTitleNotch');
    if (notch) notch.remove();
  } catch (e) {}

  // ── Shared header ────────────────────────────────────────────────────────
  const headerHtml = `
    <div class="host-header" style="max-width:1400px; margin:0 auto;">
      <div>
        <div style="font-size:13px; color:var(--muted); letter-spacing:.5px; margin-bottom:2px;">ROOM CODE</div>
        <div class="room-code">${escapeHtml(mpRoomCode)}</div>
      </div>
      <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
        <span class="pill">${players.length} player${players.length !== 1 ? 's' : ''} connected</span>
        <button class="btn${mpView === 'initiative' ? ' btn-accent' : ''}" id="btnToggleView">
          ${mpView === 'players' ? '⚔ Initiative' : '👥 Players'}
        </button>
        ${mpView === 'players'
          ? (mpRefreshing
              ? `<span class="mini" style="color:var(--warn);">⏳ Retrieving data…</span>`
              : `<button class="btn" id="btnHostRefresh">↺ Refresh</button>`)
          : ''}
        <button class="btn" id="btnHostReconnect">↻ Reconnect</button>
        <button class="btn" id="btnHostMenu">Main Menu</button>
      </div>
    </div>`;

  if (mpView === 'initiative') {
    inner.innerHTML = headerHtml + renderInitiativeView();
    // ── Initiative view handlers ─────────────────────────────────────────
    inner.querySelector('#btnToggleView').onclick = () => { mpView = 'players'; renderHostView(); };
    inner.querySelector('#btnHostMenu').onclick = () => returnToMenu();
    inner.querySelector('#btnHostReconnect').onclick = () => {
      const code = mpRoomCode || genCode();
      Object.values(mpDisconnectTimers).forEach(tid => clearTimeout(tid));
      mpDisconnectTimers = {};
      mpPlayerConns = {};
      mpExpandedPlayers = new Set();
      mpViewingPlayer = null;
      mpRefreshing = false;
      if (typeof mpTryHost === 'function') mpTryHost(code, false);
    };

    // Start Round
    const btnStart = inner.querySelector('#btnInitStartRound');
    if (btnStart) btnStart.onclick = () => {
      const order = mpInitFlatOrder();
      if (!order.length) return;
      mpInitiative.round = 1;
      mpInitiative.activeId = order[0].id;
      mpInitCondPickerId = null;
      mpInitSave(); renderHostView();
    };

    // End Turn
    const btnEnd = inner.querySelector('#btnInitEndTurn');
    if (btnEnd) btnEnd.onclick = () => {
      const groups = mpInitSortedGroups();
      if (!groups.length) return;
      
      // Find which group the current id is in
      let currentGroupIdx = -1;
      for (let i = 0; i < groups.length; i++) {
        if (groups[i].some(e => e.id === mpInitiative.activeId)) {
          currentGroupIdx = i;
          break;
        }
      }
      
      if (currentGroupIdx === -1) return;
      
      // Move to next group
      const nextGroupIdx = (currentGroupIdx + 1) % groups.length;
      if (nextGroupIdx === 0) mpInitiative.round++;
      mpInitiative.activeId = groups[nextGroupIdx][0].id;
      mpInitCondPickerId = null;
      mpInitSave(); renderHostView();
    };

    // End Round (keeps entries + values, just stops the round)
    const btnEndRound = inner.querySelector('#btnInitEndRound');
    if (btnEndRound) btnEndRound.onclick = () => {
      mpInitiative.round = 0;
      mpInitiative.activeId = null;
      mpInitCondPickerId = null;
      mpInitSave(); renderHostView();
    };

    // Reset to Players
    const btnReset = inner.querySelector('#btnInitReset');
    if (btnReset) btnReset.onclick = () => {
      mpInitiative.entries = mpInitiative.entries.filter(e => e.kind === 'player');
      mpInitiative.entries.forEach(e => { e.initiative = null; e.status = 'active'; });
      mpInitiative.round = 0;
      mpInitiative.activeId = null;
      mpInitShowAddForm = false;
      mpInitCondPickerId = null;
      mpInitSave(); renderHostView();
    };

    // Toggle add form and set type to enemy
    const btnAddEnemy = inner.querySelector('#btnInitAddEnemy');
    if (btnAddEnemy) btnAddEnemy.onclick = () => { mpInitAddFormType = 'enemy'; mpInitShowAddForm = !mpInitShowAddForm; renderHostView(); };

    // Toggle add form and set type to friendly
    const btnAddFriendly = inner.querySelector('#btnInitAddFriendly');
    if (btnAddFriendly) btnAddFriendly.onclick = () => { mpInitAddFormType = 'friendly'; mpInitShowAddForm = !mpInitShowAddForm; renderHostView(); };

    // Cancel add form
    const btnAddCancel = inner.querySelector('#btnInitAddCancel');
    if (btnAddCancel) btnAddCancel.onclick = () => { mpInitShowAddForm = false; renderHostView(); };

    // Submit add form (handles both enemy and friendly)
    const formAdd = inner.querySelector('#initAddForm');
    if (formAdd) formAdd.onsubmit = (ev) => {
      ev.preventDefault();
      const nameEl = inner.querySelector('#initAddName');
      const initEl = inner.querySelector('#initAddInit');
      const acEl   = inner.querySelector('#initAddAc');
      const name = nameEl ? nameEl.value.trim() : '';
      if (!name) return;
      const initVal = initEl && initEl.value.trim() !== '' ? parseInt(initEl.value, 10) : null;
      const acVal   = acEl  && acEl.value.trim()  !== '' ? parseInt(acEl.value,  10) : null;
      const newEntry = {
        id: (mpInitAddFormType === 'friendly' ? 'f_' : 'e_') + Date.now() + '_' + Math.floor(Math.random() * 10000),
        name,
        kind: mpInitAddFormType,
        initiative: isNaN(initVal) ? null : initVal,
        ac: isNaN(acVal) ? null : acVal,
        status: 'active',
        conditions: [],
      };
      mpInitiative.entries.push(newEntry);
      mpInitShowAddForm = false;
      mpInitSave(); renderHostView();
    };

    // Initiative inputs (setup view)
    inner.querySelectorAll('[data-init-set]').forEach(inp => {
      inp.onchange = () => {
        const id = inp.dataset.initSet;
        const entry = mpInitiative.entries.find(e => e.id === id);
        if (!entry) return;
        const v = inp.value.trim();
        entry.initiative = v === '' ? null : parseInt(v, 10);
        if (isNaN(entry.initiative)) entry.initiative = null;
        mpInitSave(); renderHostView();
      };
    });

    // AC inputs (setup view, enemies only)
    inner.querySelectorAll('[data-init-ac]').forEach(inp => {
      inp.onchange = () => {
        const id = inp.dataset.initAc;
        const entry = mpInitiative.entries.find(e => e.id === id);
        if (!entry) return;
        const v = inp.value.trim();
        entry.ac = v === '' ? null : parseInt(v, 10);
        if (isNaN(entry.ac)) entry.ac = null;
        mpInitSave();
      };
    });

    // Remove enemy button (setup view)
    inner.querySelectorAll('[data-init-remove]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.initRemove;
        mpInitiative.entries = mpInitiative.entries.filter(e => e.id !== id);
        mpInitSave(); renderHostView();
      };
    });

    // Down / Revive toggle
    inner.querySelectorAll('[data-init-down]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.initDown;
        const entry = mpInitiative.entries.find(e => e.id === id);
        if (!entry) return;
        entry.status = entry.status === 'down' ? 'active' : 'down';
        mpInitSave(); renderHostView();
      };
    });

    // Kill button
    inner.querySelectorAll('[data-init-kill]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.initKill;
        const wasActive = mpInitiative.activeId === id;
        const order = mpInitFlatOrder();
        const idx = order.findIndex(e => e.id === id);
        mpInitiative.entries = mpInitiative.entries.filter(e => e.id !== id);
        if (wasActive) {
          const newOrder = mpInitFlatOrder();
          if (!newOrder.length) {
            mpInitiative.activeId = null;
          } else {
            const nextIdx = idx >= newOrder.length ? 0 : idx;
            mpInitiative.activeId = newOrder[nextIdx].id;
          }
        }
        if (mpInitCondPickerId === id) mpInitCondPickerId = null;
        mpInitSave(); renderHostView();
      };
    });

    // Toggle inline condition picker
    inner.querySelectorAll('[data-init-condadd]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.initCondadd;
        mpInitCondPickerId = (mpInitCondPickerId === id) ? null : id;
        renderHostView();
      };
    });

    // Cancel condition picker
    inner.querySelectorAll('[data-init-cond-cancel]').forEach(btn => {
      btn.onclick = () => { mpInitCondPickerId = null; renderHostView(); };
    });

    // Confirm condition picker → add condition
    inner.querySelectorAll('[data-init-cond-confirm]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.initCondConfirm;
        const sel = inner.querySelector(`[data-init-cond-select="${id}"]`);
        if (!sel) return;
        let v = (sel.value || '').trim();
        if (!v) return;
        if (v === '__custom__') {
          const custom = prompt('Enter custom condition:');
          if (!custom || !custom.trim()) return;
          v = custom.trim();
        }
        const entry = mpInitiative.entries.find(e => e.id === id);
        if (!entry) return;
        if (entry.kind === 'player') {
          const cur = mpPlayerConns[entry.playerPid]?.state?.character?.conditions || [];
          if (!cur.includes(v)) {
            const next = cur.concat([v]);
            mpSendConditionsToPlayer(entry.playerPid, next);
          }
        } else {
          entry.conditions = entry.conditions || [];
          if (!entry.conditions.includes(v)) entry.conditions.push(v);
        }
        mpInitCondPickerId = null;
        mpInitSave(); renderHostView();
      };
    });

    // Remove condition pill
    inner.querySelectorAll('[data-init-condrm]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.initCondrm;
        const name = btn.dataset.initCond;
        const entry = mpInitiative.entries.find(e => e.id === id);
        if (!entry) return;
        if (entry.kind === 'player') {
          const cur = mpPlayerConns[entry.playerPid]?.state?.character?.conditions || [];
          const next = cur.filter(x => x !== name);
          mpSendConditionsToPlayer(entry.playerPid, next);
        } else {
          entry.conditions = (entry.conditions || []).filter(x => x !== name);
        }
        mpInitSave(); renderHostView();
      };
    });

    return; // skip player-view wiring below
  }

  // ── Players view ─────────────────────────────────────────────────────────
  const playersHtml = players.length === 0
    ? `<div class="card" style="text-align:center; padding:48px; max-width:500px; margin:0 auto;">
         <div style="font-size:48px; margin-bottom:16px;">⏳</div>
         <h2>Waiting for players…</h2>
         <div class="mini">Share the room code with your players</div>
       </div>`
    : `<div class="host-grid">${players.map(([pid, pd]) => renderPlayerCard(pid, pd)).join('')}</div>`;

  inner.innerHTML = headerHtml + playersHtml;

  inner.querySelector('#btnToggleView').onclick = () => { mpView = 'initiative'; renderHostView(); };

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

  inner.querySelectorAll('[data-remove]').forEach(btn => {
    btn.onclick = () => {
      const pid = btn.dataset.remove;
      const ch = mpPlayerConns[pid]?.state?.character;
      const charName = ch?.name || 'this player';
      if (confirm(`Remove ${escapeHtml(charName)} from the game?`)) {
        mpRemovePlayer(pid);
      }
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
    // Clear all pending disconnect timers before resetting
    Object.values(mpDisconnectTimers).forEach(tid => clearTimeout(tid));
    mpDisconnectTimers = {};
    mpPlayerConns = {};
    mpExpandedPlayers = new Set();
    mpViewingPlayer = null;
    mpRefreshing = false;
    // Try to reclaim the original room code. If it's unavailable, do not
    // silently fall back to a different code — surface the error instead.
    if (typeof mpTryHost === 'function') mpTryHost(code, false);
  };

}

function renderInitiativeView() {
  const { entries, round, activeId } = mpInitiative;
  const isActive = round > 0;
  const onDeckId = isActive ? mpInitOnDeckId(activeId) : null;

  // ── Action bar ────────────────────────────────────────────────────────────
  const canStart = !isActive && entries.length > 0 && entries.every(e => e.initiative !== null);
  const actionBar = `
    <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:16px;">
      ${isActive
        ? `<span class="pill" style="background:rgba(124,192,255,.15); color:var(--accent); font-size:13px;">Round ${round}</span>
           <button class="btn" id="btnInitEndTurn">▶ End Turn</button>
           <button class="btn" id="btnInitEndRound">⏹ End Round</button>`
        : `<span class="pill" style="color:var(--muted); font-size:13px;">Not started</span>
           <button class="btn${canStart ? '' : ''}" id="btnInitStartRound"${canStart ? '' : ' disabled style="opacity:.5;"'}>▶ Start Round</button>`}
      <button class="btn" id="btnInitAddEnemy">+ Add Enemy</button>
      <button class="btn" id="btnInitAddFriendly">+ Add Friendly</button>
      <button class="btn" style="margin-left:auto;" id="btnInitReset">↺ Reset to Players</button>
    </div>`;

  // ── Add-enemy/friendly form ────────────────────────────────────────────────────────
  const addForm = mpInitShowAddForm ? `
    <div class="card" style="padding:14px 16px; margin-bottom:16px; max-width:500px;">
      <div class="mini" style="margin-bottom:8px;">${mpInitAddFormType === 'friendly' ? '+ Add Friendly NPC' : '+ Add Enemy'}</div>
      <form id="initAddForm" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
        <div style="flex:1; min-width:140px;">
          <div class="mini" style="margin-bottom:4px;">Name</div>
          <input id="initAddName" type="text" placeholder="Goblin…" autocomplete="off" required
                 style="width:100%;">
        </div>
        <div style="width:68px;">
          <div class="mini" style="margin-bottom:4px;">Initiative</div>
          <input id="initAddInit" type="number" placeholder="—"
                 style="width:100%;">
        </div>
        <div style="width:60px;">
          <div class="mini" style="margin-bottom:4px;">AC</div>
          <input id="initAddAc" type="number" placeholder="—" min="0"
                 style="width:100%;">
        </div>
        <button class="btn" type="submit" style="align-self:flex-end;">Add</button>
        <button class="btn" type="button" id="btnInitAddCancel" style="align-self:flex-end;">Cancel</button>
      </form>
    </div>` : '';

  // ── Entries ────────────────────────────────────────────────────────────────
  let entriesHtml = '';
  if (!entries.length) {
    entriesHtml = `<div class="card" style="padding:32px; text-align:center; color:var(--muted); max-width:700px; margin:0 auto;">
      No entries yet. Add enemies or wait for players to connect.
    </div>`;
  } else if (!isActive) {
    // Setup view: list with editable initiative inputs
    entriesHtml = `<div style="max-width:700px; margin:0 auto; display:flex; flex-direction:column; gap:8px;">
      ${entries.map(e => `
        <div class="init-row" style="display:flex; align-items:center; gap:10px; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:10px 14px;">
          <span class="pill" style="font-size:11px; min-width:56px; text-align:center;
            ${e.kind === 'player' ? 'background:rgba(107,255,179,.12); color:var(--good);' : e.kind === 'friendly' ? 'background:rgba(255,209,102,.15); color:var(--warn);' : 'background:rgba(255,107,107,.10); color:var(--bad);'}">
            ${e.kind === 'player' ? 'Player' : e.kind === 'friendly' ? 'Friendly' : 'Enemy'}
          </span>
          <span style="flex:1; font-weight:600;">${escapeHtml(e.name)}</span>
          ${e.kind === 'player'
            ? (() => { const playerAc = mpPlayerConns[e.playerPid]?.state?.character?.combat?.ac; return playerAc != null ? `<span class="pill" style="font-size:12px; min-width:50px; text-align:center; color:var(--muted);">AC ${playerAc}</span>` : ''; })()
            : `<input type="number" data-init-ac="${escapeAttr(e.id)}"
                 value="${e.ac !== null && e.ac !== undefined ? e.ac : ''}"
                 placeholder="AC" style="width:58px; text-align:center;">`}
          <input type="number" data-init-set="${escapeAttr(e.id)}"
                 value="${e.initiative !== null ? e.initiative : ''}"
                 placeholder="Init" style="width:68px; text-align:center;">
          ${e.kind === 'enemy'
            ? `<button class="btn" data-init-remove="${escapeAttr(e.id)}" style="color:var(--bad); min-width:30px; padding:4px 8px;" title="Remove">✕</button>`
            : ''}
        </div>`).join('')}
    </div>`;
  } else {
    // Active round: grouped rows, current/on-deck highlighted
    const groups = mpInitSortedGroups();
    const groupRows = groups.map(group => {
      const isCurrent  = group.some(e => e.id === activeId);
      const isOnDeck   = !isCurrent && group.some(e => e.id === onDeckId);
      const rowClass   = isCurrent ? 'init-row current' : isOnDeck ? 'init-row ondeck' : 'init-row';
      const badge      = isCurrent
        ? `<span class="pill" style="background:rgba(124,192,255,.25); color:var(--accent); font-size:11px; font-weight:700;">CURRENT TURN</span>`
        : isOnDeck
          ? `<span class="pill" style="background:rgba(255,209,102,.15); color:var(--warn); font-size:11px;">ON DECK</span>`
          : '';

      const initVal = group[0].initiative !== null ? `<span class="pill" style="font-size:12px; min-width:44px; text-align:center;">${group[0].initiative}</span>` : '';

      const entries2 = group.map((e, idx) => {
        const isDown = e.status === 'down';
        const entryConds = e.kind === 'player'
          ? (mpPlayerConns[e.playerPid]?.state?.character?.conditions || [])
          : (e.conditions || []);
        const isPickerOpen = mpInitCondPickerId === e.id;
        const condPills = entryConds.map(name => `
          <span class="pill" style="font-size:11px; background:rgba(255,107,107,.15); color:var(--bad); display:inline-flex; align-items:center; gap:4px;">
            ${escapeHtml(name)}
            <button class="btn" data-init-condrm="${escapeAttr(e.id)}" data-init-cond="${escapeAttr(name)}"
                    style="font-size:10px; padding:0 6px; line-height:18px; min-width:18px; color:var(--bad); background:transparent; border:none;"
                    title="Remove">×</button>
          </span>`).join('');
        const pickerHtml = isPickerOpen ? `
          <div data-init-cond-picker="${escapeAttr(e.id)}" style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-top:6px; padding:6px 8px; background:rgba(255,255,255,.03); border-radius:6px;">
            <select data-init-cond-select="${escapeAttr(e.id)}" style="font-size:12px;">
              <option value="">— Select condition —</option>
              ${CONDITIONS.map(x => `<option value="${escapeAttr(x)}">${escapeHtml(x)}</option>`).join('')}
              <option value="__custom__">Custom...</option>
            </select>
            <button class="btn" data-init-cond-confirm="${escapeAttr(e.id)}" style="font-size:11px; padding:3px 8px;">Add</button>
            <button class="btn" data-init-cond-cancel="${escapeAttr(e.id)}" style="font-size:11px; padding:3px 8px;">Cancel</button>
          </div>` : '';
        const isLastInGroup = idx === group.length - 1;
        return `
          <div class="${isDown ? 'init-entry init-down' : 'init-entry'}" style="display:flex; flex-direction:column; gap:4px; flex:1; min-width:200px; padding:6px 10px; border-radius:8px; ${isDown ? 'opacity:.45;' : ''}${!isLastInGroup ? 'border-bottom:1px solid var(--line); padding-bottom:10px;' : ''}">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span style="font-weight:600; flex:1;">${escapeHtml(e.name)}</span>
              ${isDown ? `<span class="pill" style="font-size:11px; background:rgba(255,107,107,.18); color:var(--bad);">DOWN</span>` : ''}
              ${(() => { const ac = e.kind === 'player' ? mpPlayerConns[e.playerPid]?.state?.character?.combat?.ac : e.ac; return ac != null ? `<span class="pill" style="font-size:11px; min-width:46px; text-align:center;">AC ${ac}</span>` : ''; })()}
              <span class="pill" style="font-size:11px; min-width:50px; text-align:center;
                ${e.kind === 'player' ? 'background:rgba(107,255,179,.12); color:var(--good);' : e.kind === 'friendly' ? 'background:rgba(255,209,102,.15); color:var(--warn);' : 'background:rgba(255,107,107,.10); color:var(--bad);'}">
                ${e.kind === 'player' ? 'Player' : e.kind === 'friendly' ? 'Friendly' : 'Enemy'}
              </span>
              <button class="btn" data-init-condadd="${escapeAttr(e.id)}"
                      style="font-size:11px; padding:3px 8px;"
                      title="Add status effect">+ Effect</button>
              <button class="btn" data-init-down="${escapeAttr(e.id)}"
                      style="font-size:11px; padding:3px 8px;"
                      title="${isDown ? 'Revive' : 'Down'}">${isDown ? '↑ Revive' : '↓ Down'}</button>
              <button class="btn" data-init-kill="${escapeAttr(e.id)}"
                      style="font-size:11px; padding:3px 8px; color:var(--bad);"
                      title="Kill / Remove">✕ Kill</button>
            </div>
            ${condPills ? `<div style="display:flex; flex-wrap:wrap; gap:4px;">${condPills}</div>` : ''}
            ${pickerHtml}
          </div>`;
      }).join('');

      return `
        <div class="${rowClass}" style="
          display:flex; flex-direction:column; align-items:stretch; gap:0;
          background:var(--panel); border:1px solid ${isCurrent ? 'var(--accent)' : isOnDeck ? 'var(--warn)' : 'var(--line)'};
          border-radius:10px; padding:10px 14px; margin-bottom:8px;
          ${isCurrent ? 'box-shadow:0 0 0 2px rgba(124,192,255,.2);' : ''}">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:${group.length > 1 ? '10px' : '0'};">
            ${initVal}
            ${badge}
          </div>
          <div style="display:flex; flex-direction:column; gap:0;">${entries2}</div>
        </div>`;
    }).join('');

    entriesHtml = `<div style="max-width:900px; margin:0 auto;">${groupRows}</div>`;
  }

  return `
    <div style="max-width:1400px; margin:0 auto; padding-top:4px;">
      ${actionBar}
      ${addForm}
      ${entriesHtml}
    </div>`;
}

function renderPlayerCard(pid, pd) {
  const ch = pd.state ? pd.state.character : null;
  const isExpanded = mpExpandedPlayers.has(pid);
  const isDisconnected = pd.disconnected || false;

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

  const footerButtonsDisabled = isDisconnected ? 'disabled style="opacity:0.6; cursor:not-allowed;"' : '';

  return `
    <div class="player-card">
      <div class="player-card-header">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; flex-wrap:wrap;">
          <div>
            <div style="display:flex; align-items:center; gap:6px;">
              <b style="font-size:18px;">${escapeHtml(ch.name || 'Unnamed')}</b>
              ${isDisconnected ? `<span class="pill" style="background:rgba(255,107,107,.2); color:var(--bad); font-size:11px;">Disconnected</span>` : ''}
            </div>
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
        <button class="btn" data-notes="${pid}" ${isDisconnected ? 'disabled style="opacity:0.6; cursor:not-allowed;"' : ''}>Notes</button>
        <button class="btn" data-remove="${pid}" style="color:var(--bad); margin-left:auto;" title="Remove this player from the game">Remove</button>
      </div>
      ${mpNotesExpanded.has(pid) ? `
        <div class="player-notes" style="padding:12px 16px; border-top:1px solid var(--line); background:rgba(8,12,18,.45);">
          <textarea id="notesArea-${pid}" ${isDisconnected ? 'disabled' : ''}>${escapeHtml((pd && pd.notes) || mpPlayerNotes[pid] || '')}</textarea>
          <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:8px;">
            <button class="btn" data-notes-save="${pid}" ${isDisconnected ? 'disabled style="opacity:0.6; cursor:not-allowed;"' : ''}>Save</button>
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
    { id: 'player_notes', label: 'Notes' },
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
    if (mpDetailTab === 'player_notes') {
      const noteItems = Array.isArray(ch.notes) ? ch.notes : [];
      if (noteItems.length) {
        return `<div class="col">${noteItems.map(note => `
          <div class="item" style="display:block;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <b>${escapeHtml(note.title || 'Untitled Note')}</b>
              ${note.readonly ? '<span class="pill" style="font-size:11px;">read only</span>' : ''}
            </div>
            <div class="mini" style="white-space:pre-wrap; margin-top:6px;">${escapeHtml(note.body || '')}</div>
          </div>`).join('')}</div>`;
      }
      return `<div style="white-space:pre-wrap; font-size:14px; line-height:1.6;">${escapeHtml(ch.player_notes || 'No notes.')}</div>`;
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
      const noteItems = Array.isArray(ch.notes) ? ch.notes : [];
      if (!noteItems.length) {
        return `<div style="white-space:pre-wrap; font-size:14px; line-height:1.6;">No notes.</div>`;
      }
      return `<div class="col">${noteItems.map(note => `
        <div class="item" style="display:block;">
          <b>${escapeHtml(note.title || 'Untitled Note')}</b>
          <div class="mini" style="white-space:pre-wrap; margin-top:6px;">${escapeHtml(note.body || '')}</div>
        </div>`).join('')}</div>`;
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
    mpDetailTab = 'overview';
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
    // Ensure host tab container exists and is properly positioned
    let hostTabs = document.getElementById('hostTabsCard');
    if (!hostTabs) {
      hostTabs = document.createElement('div');
      hostTabs.id = 'hostTabsCard';
      hostTabs.style.cssText = 'position:fixed; bottom:0; left:0; right:0; background:var(--panel); border-top:1px solid var(--line); z-index:20;';
      document.getElementById('hostView').appendChild(hostTabs);
    }
    renderTabBar('hostTabsCard', tabs, mpDetailTab, (id) => { 
      if (id === 'overview') {
        // Clicking overview stays in player view on overview tab
        mpDetailTab = id;
        renderHostFullView();
      } else {
        mpDetailTab = id;
        renderHostFullView();
      }
    });
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