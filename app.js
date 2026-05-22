(() => {
  // Firebase is loaded via compat CDN scripts in index.html
  const _fbApp = firebase.initializeApp({
    apiKey:            'AIzaSyAYBRIgVU47t4sa1FxvREb5OmNR8y6VWxk',
    authDomain:        'dnd-tracker-4aebf.firebaseapp.com',
    projectId:         'dnd-tracker-4aebf',
    storageBucket:     'dnd-tracker-4aebf.firebasestorage.app',
    messagingSenderId: '498366497361',
    appId:             '1:498366497361:web:49f28c4475372fb0602e70',
  });
  const fbAuth = firebase.auth(_fbApp);
  const fbDb   = firebase.firestore(_fbApp);


  const STORAGE_KEY = 'dndCharTracker.v1';       // legacy single-char key
  const CHARS_KEY   = 'dndCharTracker.chars';     // multi-char store: { name → state }

  // --- Multi-character storage helpers ---
  function loadAllChars(){
    try {
      const raw = localStorage.getItem(CHARS_KEY);
      const chars = raw ? JSON.parse(raw) : {};
      // Migrate legacy single-char save if present and not already migrated
      const legacy = localStorage.getItem(STORAGE_KEY);
      if (legacy) {
        try {
          const legState = normalize(JSON.parse(legacy));
          const name = legState.character.name || 'Unnamed';
          if (!chars[name]) chars[name] = legState;
        } catch {}
        localStorage.removeItem(STORAGE_KEY);
      }
      return chars;
    } catch { return {}; }
  }

  function saveChar(charState){
    try {
      const chars = loadAllChars();
      const name = charState.character.name || 'Unnamed';
      const oldName = (currentSaveName && currentSaveName !== name) ? currentSaveName : null;
      if (oldName && chars[oldName]) delete chars[oldName];
      chars[name] = charState;
      currentSaveName = name;
      localStorage.setItem(CHARS_KEY, JSON.stringify(chars));
      return true;
    } catch { return false; }
  }

  function deleteChar(name){
    try {
      const chars = loadAllChars();
      delete chars[name];
      localStorage.setItem(CHARS_KEY, JSON.stringify(chars));
      deleteCharFromCloud(name); // fire-and-forget cloud sync
    } catch {}
  }

  /**
   * Base schema (compatible with the user's DMGPT export snippet), plus optional extensions.
   */
  function newBlank() {
    const now = new Date().toISOString();
    return {
      schema: 'dnd-char-tracker@1',
      exported_at: now,
      character: {
        id: 'char-' + Math.random().toString(16).slice(2),
        name: 'Unnamed Adventurer',
        level: 1,
        class: 'Fighter',
        subclass: '',
        race: '',
        background: '',
        combat: { ac: 10, speed: 30, initiative_mod: 0, proficiency_bonus: 2 },
        hp: { current: 10, max: 10, temp: 0, notes: '' },

        // Optional spellcasting section (leave null/undefined for non-casters)
        spellcasting: null,

        // Optional extras
        conditions: [],
        resources: [],
        features: [],
        attacks: [],
        inventory: {
          currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
          items: []
        },
        quests: [],
        notes: '',
        ability_scores: { str:10, dex:10, con:10, int:10, wis:10, cha:10 },
        skill_proficiencies: [],
        skill_disadvantages: []
      }
    };
  }

  const EXAMPLE = {
    schema: 'dnd-char-tracker@1',
    exported_at: new Date().toISOString(),
    character: {
      id: 'corax-01',
      name: 'Corax',
      level: 3,
      class: 'Cleric',
      subclass: 'Grave Domain',
      race: 'Human',
      background: 'Acolyte',
      combat: { ac: 16, speed: 30, initiative_mod: 1, proficiency_bonus: 2 },
      hp: { current: 21, max: 24, temp: 0, notes: 'Spare the Dying cantrip does not require a spell slot.' },
      spellcasting: {
        ability: 'WIS',
        save_dc: 13,
        attack_bonus: 5,
        notes: 'Prepare spells after a long rest.',
        spell_slots: [
          { level: 1, max: 4, used: 1 },
          { level: 2, max: 2, used: 0 }
        ],
        cantrips: [
          { name: 'Sacred Flame', notes: '' },
          { name: 'Guidance', notes: '' },
          { name: 'Spare the Dying', notes: 'Bonus range with Grave? (check feature)' }
        ],
        prepared_spells: [
          { name: 'Bless', level: 1, notes: '' },
          { name: 'Healing Word', level: 1, notes: '' },
          { name: 'Lesser Restoration', level: 2, notes: '' }
        ],
        known_spells: []
      },
      resources: [
        { name: 'Channel Divinity', max: 1, used: 0, reset: 'short', notes: 'Path to the Grave, etc.' }
      ],
      features: [
        { name: 'Circle of Mortality', description: 'Maximize healing dice on a creature with 0 HP.', uses_max: null, uses_used: null, reset: 'none' },
        { name: 'Sentinel at Death\'s Door', description: 'Cancel crits (later levels).', uses_max: null, uses_used: null, reset: 'none' }
      ],
      attacks: [
        { name: 'Mace', to_hit: 4, damage: '1d6+2 bludgeoning', notes: '' },
        { name: 'Sacred Flame', to_hit: null, damage: '1d8 radiant (DEX save)', notes: '' }
      ],
      inventory: {
        currency: { cp: 2, sp: 8, ep: 0, gp: 14, pp: 0 },
        items: [
          { name: 'Shield', qty: 1, equipped: true, notes: '+2 AC' },
          { name: 'Chain Shirt', qty: 1, equipped: true, notes: '' },
          { name: 'Holy Symbol', qty: 1, equipped: true, notes: '' },
          { name: 'Rations', qty: 6, equipped: false, notes: '' }
        ]
      },
      quests: [
        {
          title: 'Find the Source of the Blight',
          status: 'active',
          summary: 'Track the unnatural pressure points in the forest and stop the cause.',
          steps: [
            { text: 'Reach the next node', done: false },
            { text: 'Disable the transmitting drone', done: false }
          ],
          rewards: 'Council favor',
          notes: ''
        }
      ],
      conditions: [],
      notes: 'Don\'t forget: long rest resets spell slots and most resources.'
    }
  };

  const DMGPT_PROMPT = `You are DMGPT. When the user types /exportcharacter you MUST output EXACTLY ONE JSON code block and nothing else.

Rules:
- Output must be valid JSON.
- Use schema = "dnd-char-tracker@1".
- Do not add commentary outside the JSON code block.
- Numbers must be numbers (not strings).
- If a section is not applicable (e.g., spellcasting for a Fighter), use null or omit it.

Required structure:
{
  "schema": "dnd-char-tracker@1",
  "exported_at": "YYYY-MM-DDTHH:MM:SSZ",
  "character": {
    "id": "stable-id",
    "name": "...",
    "level": 1,
    "class": "...",
    "subclass": "",
    "race": "",
    "background": "",
    "combat": { "ac": 0, "speed": 0, "initiative_mod": 0, "proficiency_bonus": 2 },
    "hp": { "current": 0, "max": 0, "temp": 0, "notes": "" },

    "spellcasting": {
      "ability": "INT|WIS|CHA",
      "save_dc": 0,
      "attack_bonus": 0,
      "notes": "",
      "spell_slots": [ { "level": 1, "max": 0, "used": 0 } ],
      "cantrips": [ { "name": "...", "notes": "" } ],
      "prepared_spells": [ { "name": "...", "level": 1, "notes": "" } ],
      "known_spells": [ { "name": "...", "level": 1, "notes": "" } ]
    },

    "resources": [ { "name": "...", "max": 0, "used": 0, "reset": "short|long|none", "notes": "" } ],
    "features": [ { "name": "...", "description": "...", "uses_max": null, "uses_used": null, "reset": "short|long|none" } ],
    "attacks": [ { "name": "...", "to_hit": 0, "damage": "...", "notes": "" } ],

    "inventory": {
      "currency": { "cp": 0, "sp": 0, "ep": 0, "gp": 0, "pp": 0 },
      "items": [ { "name": "...", "qty": 1, "equipped": false, "notes": "" } ]
    },

    "quests": [
      { "title": "...", "status": "active|completed|failed", "summary": "...", "steps": [ { "text": "...", "done": false } ], "rewards": "", "notes": "" }
    ],

    "conditions": ["..."],
    "notes": "..."
  }
}`;

  // --- State ---
  let state = normalize(newBlank());
  let currentSaveName = null;   // tracks which name key we last saved under
  let activeTab = 'overview';
  let menuOpen = false;

  // ── Multiplayer ────────────────────────────────────────────────────────────
  let gameMode = null;       // null | 'solo' | 'host' | 'player'
  let mpPeer = null;
  let autosaveInterval = null;
  let mpHostConn = null;     // player → host connection
  let mpPlayerConns = {};    // host's map: peerId → { conn, state }
  let mpRoomCode = '';
  let mpExpandedPlayer = null;
  let mpRefreshing = false;
  let mpViewingPlayer = null;
  let mpDetailTab = 'overview';
  let fbUser = null;  // current Firebase authenticated user

  // --- Firebase auth state ---
  fbAuth.onAuthStateChanged(async (user) => {
    fbUser = user;
    updateAuthBar();
    if (user) {
      await mergeCloudToLocal();
      // refresh picker if currently open
      if (document.getElementById('landingCharPicker').style.display !== 'none') showCharPicker();
    }
  });

  function updateAuthBar() {
    const bar = document.getElementById('landingAuthBar');
    if (!bar) return;
    if (fbUser) {
      bar.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;justify-content:center;padding:12px 0 0;border-top:1px solid var(--line);margin-top:4px;">
          ${fbUser.photoURL ? `<img src="${escapeAttr(fbUser.photoURL)}" style="width:28px;height:28px;border-radius:50%;" referrerpolicy="no-referrer">` : ''}
          <span class="mini" style="color:var(--text);">${escapeHtml(fbUser.displayName || fbUser.email || 'Signed in')}</span>
          <button class="btn" id="btnSignOut" style="padding:4px 10px;font-size:12px;">Sign out</button>
        </div>`;
      document.getElementById('btnSignOut').onclick = () => fbAuth.signOut();
    } else {
      bar.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;justify-content:center;padding:12px 0 0;border-top:1px solid var(--line);margin-top:4px;">
          <button class="btn" id="btnSignIn" style="padding:8px 16px;">Sign in with Google</button>
          <span class="mini" style="color:var(--muted);">to sync characters across devices</span>
        </div>`;
      document.getElementById('btnSignIn').onclick = () =>
        fbAuth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e => console.warn('Sign-in:', e));
    }
  }

  async function mergeCloudToLocal() {
    if (!fbUser) return;
    try {
      const snap = await fbDb.collection('users').doc(fbUser.uid).collection('characters').get();
      if (snap.empty) return;
      const chars = loadAllChars();
      snap.forEach(d => { if (d.data().state) chars[d.id] = d.data().state; });
      localStorage.setItem(CHARS_KEY, JSON.stringify(chars));
    } catch (e) { console.warn('Cloud pull failed:', e); }
  }

  async function saveCharToCloud(charState, oldName) {
    if (!fbUser) return;
    try {
      const name = charState.character.name || 'Unnamed';
      const col = fbDb.collection('users').doc(fbUser.uid).collection('characters');
      await col.doc(name).set({ state: charState, updatedAt: new Date().toISOString() });
      if (oldName && oldName !== name) await col.doc(oldName).delete();
    } catch (e) { console.warn('Cloud save failed:', e); }
  }

  async function deleteCharFromCloud(name) {
    if (!fbUser) return;
    try { await fbDb.collection('users').doc(fbUser.uid).collection('characters').doc(name).delete(); }
    catch (e) { console.warn('Cloud delete failed:', e); }
  }

  function showLanding(){
    document.getElementById('landingOverlay').style.display = 'flex';
    document.querySelector('.app').style.display = 'none';
    document.getElementById('hostView').style.display = 'none';
    document.getElementById('landingStatus').textContent = '';
    // Reset to step 1
    document.getElementById('landingMainBtns').style.display = 'flex';
    document.getElementById('landingCharPicker').style.display = 'none';
    document.getElementById('landingModePicker').style.display = 'none';
    document.getElementById('landingJoinForm').style.display = 'none';
    document.getElementById('mpCodeInput').value = '';

    document.getElementById('btnHost').onclick = startHost;
    document.getElementById('btnChooseChar').onclick = () => showCharPicker();
    updateAuthBar();
  }

  function showCharPicker(){
    document.getElementById('landingMainBtns').style.display = 'none';
    document.getElementById('landingCharPicker').style.display = 'block';
    document.getElementById('landingModePicker').style.display = 'none';
    document.getElementById('landingStatus').textContent = '';
    document.getElementById('newCharForm').style.display = 'none';
    document.getElementById('btnNewChar').style.display = '';
    document.getElementById('loadCodeForm').style.display = 'none';
    document.getElementById('btnLoadFromCode').style.display = '';

    const chars = loadAllChars();
    const names = Object.keys(chars).sort();
    const list = document.getElementById('charPickerList');

    list.innerHTML = names.length
      ? names.map(n => `
          <div data-charblock="${escapeAttr(n)}">
            <div style="display:flex; gap:6px; align-items:center;">
              <button class="btn landing-btn" data-charname="${escapeAttr(n)}" style="flex:1; text-align:left;">${escapeHtml(n)}${fbUser ? ' <span title="Synced to cloud" style="font-size:11px;opacity:.6;">☁</span>' : ''}</button>
              <button class="btn" data-charexport="${escapeAttr(n)}" style="padding:6px 10px;" title="Export Code">⬆</button>
              <button class="btn danger" data-chardelete="${escapeAttr(n)}" style="padding:6px 10px;" title="Delete">✕</button>
            </div>
            <div data-codearea="${escapeAttr(n)}" style="display:none; margin-top:4px;">
              <textarea readonly style="width:100%; min-height:52px; font-size:10px; word-break:break-all;"></textarea>
              <button class="btn" data-codecopy="${escapeAttr(n)}" style="margin-top:4px; width:100%;">Copy Code</button>
            </div>
          </div>`).join('')
      : `<div class="mini" style="text-align:center; padding:10px;">No saved characters yet.</div>`;

    list.querySelectorAll('[data-charname]').forEach(btn => btn.onclick = () => {
      const name = btn.dataset.charname;
      state = normalize(chars[name]);
      currentSaveName = name;
      showModePicker(name);
    });

    list.querySelectorAll('[data-chardelete]').forEach(btn => btn.onclick = () => {
      const name = btn.dataset.chardelete;
      if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
      deleteChar(name);
      showCharPicker();
    });

    list.querySelectorAll('[data-charexport]').forEach(btn => btn.onclick = async () => {
      const name = btn.dataset.charexport;
      const block = list.querySelector(`[data-codearea="${CSS.escape(name)}"]`);
      const ta = block.querySelector('textarea');
      if (block.style.display !== 'none') { block.style.display = 'none'; return; }
      btn.textContent = '…';
      try {
        ta.value = await charToCode(normalize(chars[name]));
        block.style.display = 'block';
      } catch { alert('Failed to generate code.'); }
      btn.textContent = '⬆';
    });

    list.querySelectorAll('[data-codecopy]').forEach(btn => btn.onclick = () => {
      const name = btn.dataset.codecopy;
      const ta = list.querySelector(`[data-codearea="${CSS.escape(name)}"] textarea`);
      if (!ta?.value) return;
      navigator.clipboard.writeText(ta.value).then(() => { btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy Code', 1500); })
        .catch(() => { ta.select(); document.execCommand('copy'); btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy Code', 1500); });
    });

    document.getElementById('btnNewChar').onclick = () => {
      document.getElementById('btnNewChar').style.display = 'none';
      document.getElementById('newCharForm').style.display = 'block';
      const nameInput = document.getElementById('newCharNameInput');
      nameInput.value = '';
      nameInput.focus();
    };

    const confirmNew = () => {
      const name = (document.getElementById('newCharNameInput').value || '').trim();
      const errEl = document.getElementById('newCharError');
      if (!name) {
        errEl.textContent = 'Please enter a name.';
        errEl.style.display = 'block';
        return;
      }
      const existing = loadAllChars();
      if (existing[name]) {
        errEl.textContent = `"${name}" already exists. Choose a different name.`;
        errEl.style.display = 'block';
        document.getElementById('newCharNameInput').select();
        return;
      }
      errEl.style.display = 'none';
      setLandingStatus('');
      state = normalize(newBlank());
      state.character.name = name;
      currentSaveName = null;
      showModePicker(name);
    };

    document.getElementById('btnNewCharConfirm').onclick = confirmNew;
    document.getElementById('newCharNameInput').onkeydown = e => { if (e.key === 'Enter') confirmNew(); };
    document.getElementById('btnNewCharCancel').onclick = () => {
      document.getElementById('newCharForm').style.display = 'none';
      document.getElementById('btnNewChar').style.display = '';
      document.getElementById('newCharError').style.display = 'none';
      setLandingStatus('');
    };

    document.getElementById('btnBackFromPicker').onclick = () => showLanding();

    document.getElementById('btnLoadFromCode').onclick = () => {
      document.getElementById('loadCodeForm').style.display = 'block';
      document.getElementById('btnLoadFromCode').style.display = 'none';
      document.getElementById('loadCodeError').style.display = 'none';
      document.getElementById('landingCodeInput').value = '';
      document.getElementById('landingCodeInput').focus();
    };

    document.getElementById('btnLandingLoadCode').onclick = async () => {
      const code = (document.getElementById('landingCodeInput').value || '').trim();
      const errEl = document.getElementById('loadCodeError');
      if (!code) { errEl.textContent = 'Paste a code first.'; errEl.style.display = 'block'; return; }
      try {
        const loaded = await codeToChar(code);
        state = normalize(loaded);
        currentSaveName = state.character.name || 'Unnamed';
        saveToLocalStorage();
        showModePicker(currentSaveName);
      } catch {
        errEl.textContent = 'Invalid code — could not load character.';
        errEl.style.display = 'block';
      }
    };

    document.getElementById('btnCancelLoadCode').onclick = () => {
      document.getElementById('loadCodeForm').style.display = 'none';
      document.getElementById('btnLoadFromCode').style.display = '';
      document.getElementById('loadCodeError').style.display = 'none';
    };
  }

  function showModePicker(charName){
    document.getElementById('landingCharPicker').style.display = 'none';
    document.getElementById('landingModePicker').style.display = 'block';
    document.getElementById('landingModeLabel').textContent = `Playing as: ${charName}`;
    document.getElementById('landingJoinForm').style.display = 'none';
    document.getElementById('landingStatus').textContent = '';

    document.getElementById('btnGoSolo').onclick = startSolo;

    document.getElementById('btnGoJoin').onclick = () => {
      document.getElementById('landingJoinForm').style.display = 'block';
    };

    document.getElementById('btnJoinConfirm').onclick = () => {
      const code = (document.getElementById('mpCodeInput').value || '').trim().toUpperCase();
      if (!code) { setLandingStatus('Enter a room code.'); return; }
      joinGame(code);
    };

    document.getElementById('mpCodeInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btnJoinConfirm').click();
    });

    document.getElementById('btnBackFromMode').onclick = () => showCharPicker();
  }

  function setLandingStatus(msg){ document.getElementById('landingStatus').textContent = msg; }

  function startSolo(){
    gameMode = 'solo';
    document.getElementById('landingOverlay').style.display = 'none';
    document.querySelector('.app').style.display = '';
    startAutosave();
    render();
  }

  function startHost(){
    setLandingStatus('Starting…');
    gameMode = 'host';
    mpPlayerConns = {};
    mpExpandedPlayer = null;

    function tryHost(code){
      mpRoomCode = code;
      if (mpPeer) { try { mpPeer.destroy(); } catch(_){} }
      mpPeer = new Peer(code);
      mpPeer.on('open', () => {
        mpRoomCode = mpPeer.id.toUpperCase();
        document.getElementById('landingOverlay').style.display = 'none';
        document.querySelector('.app').style.display = 'none';
        document.getElementById('hostView').style.display = 'block';
        startAutosave();
        renderHostView();
      });
      mpPeer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
          tryHost(genCode());
        } else {
          setLandingStatus('Error: ' + (err.message || err.type));
          gameMode = null;
        }
      });
      mpPeer.on('connection', (conn) => {
        mpPlayerConns[conn.peer] = { conn, state: null };
        conn.on('data', (data) => {
          if (data.type === 'sync') {
            mpPlayerConns[conn.peer].state = data.state;
            mpRefreshing = false;
            renderHostView();
          }
        });
        conn.on('close', () => { delete mpPlayerConns[conn.peer]; renderHostView(); });
        conn.on('error', () => { delete mpPlayerConns[conn.peer]; renderHostView(); });
        renderHostView();
      });
    }
    tryHost(genCode());
  }

  function joinGame(code){
    setLandingStatus('Connecting…');
    gameMode = 'player';
    mpRoomCode = code;
    if (mpPeer) { try { mpPeer.destroy(); } catch(_){} }
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

  function syncToHost(){
    if (gameMode === 'player' && mpHostConn && mpHostConn.open) {
      mpHostConn.send({ type: 'sync', state });
    }
    saveToLocalStorage();
  }

  function returnToMenu(){
    if (gameMode !== 'host') saveToLocalStorage(); // save character before leaving (not for host)
    stopAutosave();
    if (mpPeer) { try { mpPeer.destroy(); } catch(_){} mpPeer = null; }
    mpHostConn = null;
    mpPlayerConns = {};
    mpExpandedPlayer = null;
    mpRoomCode = '';
    gameMode = null;
    document.getElementById('hostView').style.display = 'none';
    document.querySelector('.app').style.display = 'none';
    showLanding();
  }

  function genCode(){
    return Math.random().toString(36).substr(2, 6).toUpperCase();
  }

  function renderHostView(){
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
          <button class="btn" id="btnHostMenu">Main Menu</button>
        </div>
      </div>
      ${playersHtml}
    `;

    inner.querySelectorAll('[data-expand]').forEach(btn => {
      btn.onclick = () => {
        const pid = btn.dataset.expand;
        mpExpandedPlayer = mpExpandedPlayer === pid ? null : pid;
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
  }

  function renderPlayerCard(pid, pd){
    const ch = pd.state ? pd.state.character : null;
    const isExpanded = mpExpandedPlayer === pid;

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
    const as2 = ch.ability_scores || {};
    const profB = toInt(combat.proficiency_bonus, 2);
    const wisM = Math.floor((toInt(as2.wis, 10) - 10) / 2);
    const percP = Array.isArray(ch.skill_proficiencies) && ch.skill_proficiencies.includes('perception');
    const pp = 10 + wisM + (percP ? profB : 0);
    const statPills = [
      `AC ${combat.ac ?? 10}`,
      `Speed ${combat.speed ?? 30}`,
      `Init ${wisM >= 0 ? '+' : ''}${Math.floor((toInt(as2.dex,10)-10)/2) + toInt(combat.initiative_mod,0)}`,
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
        </div>
      </div>`;
  }

  function renderHostFullView(){
    const pd = mpPlayerConns[mpViewingPlayer];
    const inner = document.getElementById('hostViewInner');
    if (!inner || !pd || !pd.state) return renderHostView();
    const ch = pd.state.character;

    const tabs = [
      { id:'overview', label:'Overview' },
      { id:'stats',    label:'Stats' },
      { id:'class_race',label:'Character' },
      { id:'combat',   label:'Combat' },
      { id:'inventory',label:'Inventory' },
      { id:'spells',   label:'Spells', hide: !ch.spellcasting },
    ].filter(t => !t.hide);

    function mod(v){ const m=Math.floor((toInt(v,10)-10)/2); return (m>=0?'+':'')+m; }
    const as = ch.ability_scores || {};
    const combat = ch.combat || {};
    const profBonus = toInt(combat.proficiency_bonus, 2);
    const profs = ch.skill_proficiencies || [];
    const disadv = ch.skill_disadvantages || [];
    const wisM = Math.floor((toInt(as.wis,10)-10)/2);
    const pp = 10 + wisM + (profs.includes('perception') ? profBonus : 0);

    const SKILLS = [
      {key:'acrobatics',label:'Acrobatics',stat:'dex'},{key:'animal_handling',label:'Animal Handling',stat:'wis'},
      {key:'arcana',label:'Arcana',stat:'int'},{key:'athletics',label:'Athletics',stat:'str'},
      {key:'deception',label:'Deception',stat:'cha'},{key:'history',label:'History',stat:'int'},
      {key:'insight',label:'Insight',stat:'wis'},{key:'intimidation',label:'Intimidation',stat:'cha'},
      {key:'investigation',label:'Investigation',stat:'int'},{key:'medicine',label:'Medicine',stat:'wis'},
      {key:'nature',label:'Nature',stat:'int'},{key:'perception',label:'Perception',stat:'wis'},
      {key:'performance',label:'Performance',stat:'cha'},{key:'persuasion',label:'Persuasion',stat:'cha'},
      {key:'religion',label:'Religion',stat:'int'},{key:'sleight_of_hand',label:'Sleight of Hand',stat:'dex'},
      {key:'stealth',label:'Stealth',stat:'dex'},{key:'survival',label:'Survival',stat:'wis'},
    ];

    function tabContent(){
      if (mpDetailTab === 'overview'){
        const hp = ch.hp || {};
        const hpCur = toInt(hp.current,0); const hpMax = Math.max(toInt(hp.max,1),1);
        const hpPct = clamp(Math.round(hpCur/hpMax*100),0,100);
        const hpColor = hpPct>50?'var(--good)':hpPct>25?'var(--warn)':'var(--bad)';
        return `
          <div class="grid2">
            <div class="col">
              <h2>Quick Stats</h2>
              <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
                <span class="pill">AC ${combat.ac??10}</span>
                <span class="pill">Speed ${combat.speed??30}</span>
                <span class="pill">Init ${mod(as.dex)}</span>
                <span class="pill">Prof +${profBonus}</span>
                <span class="pill">Passive Perception ${pp}</span>
              </div>
              <h2 style="margin-top:14px;">HP</h2>
              <div style="font-size:26px; font-weight:700; color:${hpColor};">${hpCur} / ${hpMax}${hp.temp?` <span style="font-size:14px; color:var(--muted);">(+${hp.temp} temp)</span>`:''}</div>
              <div style="margin-top:8px; height:10px; border-radius:5px; background:var(--line); overflow:hidden;">
                <div style="height:100%; width:${hpPct}%; background:${hpColor}; border-radius:5px;"></div>
              </div>
              ${(ch.conditions||[]).length ? `
                <h2 style="margin-top:14px;">Conditions</h2>
                <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
                  ${(ch.conditions||[]).map(c=>`<span class="pill" style="background:rgba(255,107,107,.15);color:var(--bad);">${escapeHtml(c)}</span>`).join('')}
                </div>` : ''}
            </div>
            <div class="col">
              <h2>Resources</h2>
              ${(ch.resources||[]).length ? (ch.resources||[]).map(r=>`
                <div class="item"><b>${escapeHtml(r.name)}</b>
                  <span class="pill">${toInt(r.used,0)} / ${toInt(r.max,0)}</span>
                </div>`).join('') : '<div class="mini">No resources.</div>'}
              <h2 style="margin-top:14px;">Features</h2>
              ${(ch.features||[]).length ? (ch.features||[]).map(f=>`
                <div class="item">
                  <div><b>${escapeHtml(f.name)}</b><div class="mini">${escapeHtml(f.description||'')}</div></div>
                  ${f.uses_max!=null?`<span class="pill">${toInt(f.uses_used,0)} / ${toInt(f.uses_max,0)}</span>`:''}
                </div>`).join('') : '<div class="mini">No features.</div>'}
            </div>
          </div>`;
      }
      if (mpDetailTab === 'stats'){
        return `
          <div class="grid2">
            <div class="col">
              <h2>Ability Scores</h2>
              <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:10px;">
                ${['str','dex','con','int','wis','cha'].map(s=>`
                  <div class="stat-block">
                    <div class="stat-abbr">${s.toUpperCase()}</div>
                    <div class="stat-mod" style="color:${toInt(as[s],10)>=10?'var(--good)':'var(--bad)'}">${mod(as[s])}</div>
                    <div class="stat-label">${toInt(as[s],10)}</div>
                  </div>`).join('')}
              </div>
            </div>
            <div class="col">
              <h2>Skills <span class="mini">Prof +${profBonus}</span></h2>
              <div class="skill-list" style="margin-top:8px;">
                ${SKILLS.map(sk=>{
                  const t = Math.floor((toInt(as[sk.stat],10)-10)/2) + (profs.includes(sk.key)?profBonus:0);
                  const tStr = (t>=0?'+':'')+t;
                  return `<div class="skill-row">
                    <span class="skill-prof-dot${profs.includes(sk.key)?' proficient':''}"></span>
                    <span class="skill-dis-btn${disadv.includes(sk.key)?' active':''}">DIS</span>
                    <span class="skill-mod-val" style="color:${t>=0?'var(--good)':'var(--bad)'}">${tStr}</span>
                    <span class="skill-name">${sk.label}</span>
                    <span class="skill-stat-tag">${sk.stat.toUpperCase()}</span>
                  </div>`;
                }).join('')}
              </div>
            </div>
          </div>`;
      }
      if (mpDetailTab === 'classrace'){
        return `
          <div class="grid2">
            <div class="col">
              <h2>Resources</h2>
              ${(ch.resources||[]).length ? (ch.resources||[]).map(r=>`
                <div class="item">
                  <div><b>${escapeHtml(r.name)}</b><div class="mini">${escapeHtml(r.notes||'')} · resets on ${r.reset||'never'}</div></div>
                  <span class="pill">${toInt(r.used,0)} / ${toInt(r.max,0)}</span>
                </div>`).join('') : '<div class="mini">No resources.</div>'}
            </div>
            <div class="col">
              <h2>Features</h2>
              ${(ch.features||[]).length ? (ch.features||[]).map(f=>`
                <div class="item">
                  <div><b>${escapeHtml(f.name)}</b><div class="mini">${escapeHtml(f.description||'')}</div></div>
                  ${f.uses_max!=null?`<span class="pill">${toInt(f.uses_used,0)} / ${toInt(f.uses_max,0)}</span>`:''}
                </div>`).join('') : '<div class="mini">No features.</div>'}
            </div>
          </div>`;
      }
      if (mpDetailTab === 'combat'){
        return `
          <div class="grid2">
            <div class="col">
              <h2>Attacks</h2>
              ${(ch.attacks||[]).length ? (ch.attacks||[]).map(a=>`
                <div class="item">
                  <div>
                    <b>${escapeHtml(a.name||'Attack')}</b>
                    <span class="pill" style="margin-left:6px;">to hit: ${a.to_hit!=null?signed(toInt(a.to_hit,0)):'—'}</span>
                    <div class="mini"><b>Damage:</b> ${escapeHtml(a.damage||'')}</div>
                    <div class="mini">${escapeHtml(a.notes||'')}</div>
                  </div>
                </div>`).join('') : '<div class="mini">No attacks.</div>'}
              <h2 style="margin-top:14px;">Actions</h2>
              ${(ch.actions||[]).length ? (ch.actions||[]).map(a=>`
                <div class="item">
                  <div><b>${escapeHtml(a.name||'Action')}</b><div class="mini">${escapeHtml(a.notes||'')}</div></div>
                </div>`).join('') : '<div class="mini">No actions.</div>'}
            </div>
          </div>`;
      }
      if (mpDetailTab === 'inventory'){
        const inv = ch.inventory || {};
        const currency = inv.currency || {};
        const items = inv.items || [];
        const coins = [['CP',currency.cp],['SP',currency.sp],['EP',currency.ep],['GP',currency.gp],['PP',currency.pp]].filter(([,v])=>toInt(v,0)>0);
        return `
          <div class="grid2">
            <div class="col">
              <h2>Items</h2>
              ${items.length ? items.map(it=>`
                <div class="item">
                  <div>
                    <b>${escapeHtml(it.name||'Item')}</b>
                    ${it.equipped?`<span class="pill" style="margin-left:6px; font-size:11px;">equipped</span>`:''}
                    <div class="mini">${escapeHtml(it.notes||'')}</div>
                  </div>
                  <span class="pill">qty ${Math.max(toInt(it.qty,0),0)}</span>
                </div>`).join('') : '<div class="mini">No items.</div>'}
            </div>
            <div class="col">
              <h2>Currency</h2>
              ${coins.length ? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">${coins.map(([l,v])=>`<span class="pill">${toInt(v,0)} ${l}</span>`).join('')}</div>` : '<div class="mini">No currency.</div>'}
            </div>
          </div>`;
      }
      if (mpDetailTab === 'spells'){
        const s = ch.spellcasting || {};
        const slots = s.spell_slots || [];
        const cantrips = s.cantrips || [];
        const prepared = s.prepared_spells || [];
        const known = s.known_spells || [];
        function spellItem(sp){ return `<div class="item"><div><b>${escapeHtml(sp.name||'Spell')}</b>${sp.level?' (L'+sp.level+')':''}<div class="mini">${escapeHtml(sp.notes||'')}</div></div></div>`; }
        return `
          <div class="grid2">
            <div class="col">
              <h2>Spell Slots</h2>
              ${slots.length ? slots.map(ss=>`<span class="pill" style="margin:2px;">L${ss.level}: ${toInt(ss.used,0)} / ${toInt(ss.max,0)}</span>`).join('') : '<div class="mini">No slots.</div>'}
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
      if (mpDetailTab === 'quests'){
        return `<div class="col">
          ${(ch.quests||[]).length ? (ch.quests||[]).map(q=>`
            <div class="item"><div>
              <b>${escapeHtml(q.title||'Quest')}</b>
              <span class="pill" style="margin-left:6px; font-size:11px;">${q.status||'active'}</span>
              <div class="mini">${escapeHtml(q.notes||'')}</div>
            </div></div>`).join('') : '<div class="mini">No quests.</div>'}
        </div>`;
      }
      if (mpDetailTab === 'notes'){
        return `<div style="white-space:pre-wrap; font-size:14px; line-height:1.6;">${escapeHtml(ch.notes||'No notes.')}</div>`;
      }
      return '';
    }

    const hp2 = ch.hp || {};
    const hpC = toInt(hp2.current,0); const hpM2 = Math.max(toInt(hp2.max,1),1);
    const hpPct2 = clamp(Math.round(hpC/hpM2*100),0,100);
    const hpCol2 = hpPct2>50?'var(--good)':hpPct2>25?'var(--warn)':'var(--bad)';

    inner.innerHTML = `
      <div style="max-width:1200px; margin:0 auto; padding:16px;">
        <div class="host-header">
          <div>
            <button class="btn" id="btnBackToHost">← Back</button>
          </div>
          <div style="flex:1; padding:0 16px;">
            <div style="font-size:22px; font-weight:700;">${escapeHtml(ch.name||'Unnamed')}</div>
            <div class="mini">${escapeHtml([ch.race,ch.background,`Level ${ch.level||1}`,ch.class_name].filter(Boolean).join(' · '))}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:22px; font-weight:700; color:${hpCol2};">${hpC} / ${hpM2} HP</div>
            <div style="margin-top:4px; width:140px; height:6px; border-radius:3px; background:var(--line); overflow:hidden; margin-left:auto;">
              <div style="height:100%; width:${hpPct2}%; background:${hpCol2}; border-radius:3px;"></div>
            </div>
          </div>
        </div>
        <div class="card" style="padding:0; overflow:hidden;">
          <div class="tabs" style="padding:10px 14px 0; border-bottom:1px solid var(--line);">
            ${tabs.map(t=>`<div class="tab ${t.id===mpDetailTab?'active':''}" data-dtab="${t.id}">${t.label}</div>`).join('')}
          </div>
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
  }

  function renderCharacterDetails(ch){
    const as = ch.ability_scores || {};
    const combat = ch.combat || {};
    const profBonus = combat.proficiency_bonus || 2;
    function mod(v){ const m = Math.floor((toInt(v,10)-10)/2); return (m>=0?'+':'')+m; }

    const abilityHtml = `
      <h3 style="margin:0 0 8px;">Ability Scores</h3>
      <div style="display:grid; grid-template-columns:repeat(6,1fr); gap:6px; text-align:center; margin-bottom:14px;">
        ${['str','dex','con','int','wis','cha'].map(s => `
          <div style="background:var(--btn); border-radius:8px; padding:6px 4px;">
            <div style="font-size:10px; color:var(--muted); letter-spacing:.5px;">${s.toUpperCase()}</div>
            <div style="font-size:16px; font-weight:700;">${mod(as[s])}</div>
            <div style="font-size:11px; color:var(--muted);">${toInt(as[s],10)}</div>
          </div>`).join('')}
      </div>`;

    const combatHtml = `
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
        <span class="pill">AC ${combat.ac ?? 10}</span>
        <span class="pill">Speed ${combat.speed ?? 30}</span>
        <span class="pill">Prof +${profBonus}</span>
        <span class="pill">Passive Perception ${(()=>{ const wm=Math.floor((toInt(as.wis,10)-10)/2); const pp2=(ch.skill_proficiencies||[]).includes('perception'); return 10+wm+(pp2?profBonus:0); })()}</span>
      </div>`;

    const resources = (ch.resources || []);
    const resourcesHtml = resources.length ? `
      <h3 style="margin:0 0 8px;">Resources</h3>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
        ${resources.map(r => `<span class="pill">${escapeHtml(r.name)}: ${toInt(r.used,0)} / ${toInt(r.max,0)}</span>`).join('')}
      </div>` : '';

    const features = (ch.features || []).filter(f => f.uses_max != null);
    const featuresHtml = features.length ? `
      <h3 style="margin:0 0 8px;">Features</h3>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
        ${features.map(f => `<span class="pill">${escapeHtml(f.name)}: ${toInt(f.uses_used,0)} / ${toInt(f.uses_max,0)}</span>`).join('')}
      </div>` : '';

    const spells = ch.spellcasting;
    const slotsHtml = spells && (spells.spell_slots || []).length ? `
      <h3 style="margin:0 0 8px;">Spell Slots</h3>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
        ${spells.spell_slots.map(ss => `<span class="pill">L${ss.level}: ${toInt(ss.used,0)} / ${toInt(ss.max,0)}</span>`).join('')}
      </div>` : '';

    const attacks = (ch.attacks || []);
    const attacksHtml = attacks.length ? `
      <h3 style="margin:0 0 8px;">Attacks</h3>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
        ${attacks.map(a => `<span class="pill">${escapeHtml(a.name || 'Attack')}${a.to_hit != null ? ' ' + signed(toInt(a.to_hit,0)) : ''}</span>`).join('')}
      </div>` : '';

    return abilityHtml + combatHtml + resourcesHtml + featuresHtml + slotsHtml + attacksHtml;
  }
  // ── End Multiplayer ────────────────────────────────────────────────────────

  // --- Helpers ---
  const $ = (sel) => document.querySelector(sel);

  function clamp(n, min, max){
    if (Number.isNaN(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

  function stripCodeFences(txt){
    const t = (txt || '').trim();
    // Remove ```json ... ``` or ``` ... ``` wrappers.
    const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenced ? fenced[1].trim() : t;
  }

  function parseJSONLoose(input){
    const cleaned = stripCodeFences(input);
    // Some models output leading/trailing junk; try to extract first {...} block.
    if (!cleaned.startsWith('{')) {
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        return JSON.parse(cleaned.slice(start, end + 1));
      }
    }
    return JSON.parse(cleaned);
  }

  function normalize(data){
    // Make a best-effort to accept partial data.
    const base = newBlank();
    const out = deepMerge(base, data || {});

    // Ensure required paths exist
    out.schema = out.schema || 'dnd-char-tracker@1';
    out.exported_at = out.exported_at || new Date().toISOString();
    out.character = out.character || base.character;
    out.character.combat = out.character.combat || base.character.combat;
    out.character.hp = out.character.hp || base.character.hp;

    // Coerce types
    out.character.level = toInt(out.character.level, 1);
    out.character.combat.ac = toInt(out.character.combat.ac, 10);
    out.character.combat.speed = toInt(out.character.combat.speed, 30);
    out.character.combat.initiative_mod = toInt(out.character.combat.initiative_mod, 0);
    out.character.combat.proficiency_bonus = toInt(out.character.combat.proficiency_bonus, 2);

    out.character.hp.max = toInt(out.character.hp.max, 1);
    out.character.hp.current = clamp(toInt(out.character.hp.current, out.character.hp.max), 0, out.character.hp.max);
    out.character.hp.temp = clamp(toInt(out.character.hp.temp, 0), 0, 999);

    if (out.character.spellcasting) {
      out.character.spellcasting.spell_slots = Array.isArray(out.character.spellcasting.spell_slots) ? out.character.spellcasting.spell_slots : [];
      out.character.spellcasting.cantrips = Array.isArray(out.character.spellcasting.cantrips) ? out.character.spellcasting.cantrips : [];
      out.character.spellcasting.prepared_spells = Array.isArray(out.character.spellcasting.prepared_spells) ? out.character.spellcasting.prepared_spells : [];
      out.character.spellcasting.known_spells = Array.isArray(out.character.spellcasting.known_spells) ? out.character.spellcasting.known_spells : [];
      if (out.character.spellcasting.max_prepared == null || toInt(out.character.spellcasting.max_prepared,1) < 1) out.character.spellcasting.max_prepared = 1;
      // Coerce slot levels
      out.character.spellcasting.spell_slots = out.character.spellcasting.spell_slots.map(s => ({
        level: toInt(s.level, 1),
        max: clamp(toInt(s.max, 0), 0, 99),
        used: clamp(toInt(s.used, 0), 0, 99)
      })).sort((a,b)=>a.level-b.level);
    }

    out.character.conditions = Array.isArray(out.character.conditions) ? out.character.conditions : [];
    out.character.resources = Array.isArray(out.character.resources) ? out.character.resources : [];
    out.character.features = Array.isArray(out.character.features) ? out.character.features : [];
    out.character.attacks = Array.isArray(out.character.attacks) ? out.character.attacks : [];
    out.character.quests = Array.isArray(out.character.quests) ? out.character.quests : [];
    if (out.character.hit_dice && typeof out.character.hit_dice === 'object') {
      out.character.hit_dice.total = Math.max(1, toInt(out.character.hit_dice.total, out.character.level || 1));
      out.character.hit_dice.used = clamp(toInt(out.character.hit_dice.used, 0), 0, out.character.hit_dice.total);
    }

    if (!out.character.inventory) out.character.inventory = deepClone(base.character.inventory);
    if (!out.character.inventory.currency) out.character.inventory.currency = deepClone(base.character.inventory.currency);
    if (!Array.isArray(out.character.inventory.items)) out.character.inventory.items = [];

    if (!out.character.ability_scores || typeof out.character.ability_scores !== 'object') {
      out.character.ability_scores = { str:10, dex:10, con:10, int:10, wis:10, cha:10 };
    }
    const as = out.character.ability_scores;
    for (const key of ['str','dex','con','int','wis','cha']) {
      as[key] = clamp(toInt(as[key], 10), 1, 30);
    }

    if (!Array.isArray(out.character.skill_proficiencies)) out.character.skill_proficiencies = [];
    if (!Array.isArray(out.character.skill_disadvantages)) out.character.skill_disadvantages = [];

    return out;
  }

  function deepMerge(target, source){
    if (!source || typeof source !== 'object') return target;
    const out = Array.isArray(target) ? target.slice() : { ...target };
    for (const [k, v] of Object.entries(source)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && target && typeof target[k] === 'object' && !Array.isArray(target[k])) {
        out[k] = deepMerge(target[k], v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  function toInt(v, fallback){
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
  }

  async function wikiLookupItem(itemName, itemType) {
    const url = itemType === 'armor'
      ? 'https://dnd5e.wikidot.com/armor'
      : 'https://dnd5e.wikidot.com/weapons';

    let rawHtml = '';
    for (const proxyUrl of [
      `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
      `https://corsproxy.io/?url=${encodeURIComponent(url)}`
    ]) {
      try {
        const resp = await fetch(proxyUrl);
        if (!resp.ok) continue;
        const text = await resp.text();
        rawHtml = (text.trimStart().startsWith('{'))
          ? (JSON.parse(text).contents || '')
          : text;
        if (rawHtml.length > 500) break;
      } catch { /* try next proxy */ }
    }
    if (!rawHtml) throw new Error('Could not reach the wiki.');

    const doc = (new DOMParser()).parseFromString(rawHtml, 'text/html');
    const rows = Array.from(doc.querySelectorAll('table tr'));
    const nameLower = itemName.toLowerCase().trim();

    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll('td'));
      if (cells.length < 2) continue;
      const cellName = cells[0].textContent.trim().toLowerCase();
      if (cellName !== nameLower) continue;

      if (itemType === 'armor') {
        // cols: Name | AC | Strength | Stealth | Weight | Cost
        const ac = cells[1] ? cells[1].textContent.trim() : '';
        if (!ac) throw new Error(`AC not found for "${itemName}".`);
        return `AC: ${ac}`;
      } else {
        // cols: Name | Cost | Damage | Weight | Properties
        const damage = cells[2] ? cells[2].textContent.trim() : '';
        const props  = cells[4] ? cells[4].textContent.trim() : '';
        if (!damage) throw new Error(`Damage not found for "${itemName}".`);
        return props && props !== '—' ? `${damage} - ${props}` : damage;
      }
    }
    throw new Error(`"${itemName}" not found on the wiki.`);
  }

  async function wikiLookupSpell(spellName) {
    const slug = spellName.toLowerCase()
      .replace(/'/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const targetUrl = `https://dnd5e.wikidot.com/spell:${slug}`;

    // Try two CORS proxies; allorigins returns JSON, corsproxy returns raw HTML
    let rawHtml = '';
    for (const proxyUrl of [
      `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`,
      `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`
    ]) {
      try {
        const resp = await fetch(proxyUrl);
        if (!resp.ok) continue;
        const text = await resp.text();
        rawHtml = (text.trimStart().startsWith('{'))
          ? (JSON.parse(text).contents || '')
          : text;
        if (rawHtml.length > 500) break;
      } catch { /* try next proxy */ }
    }
    if (!rawHtml) throw new Error('Could not reach the wiki. Check your internet connection.');

    if (/does not exist/i.test(rawHtml))
      throw new Error(`"${spellName}" not found on the wiki.`);

    // ── Stats extraction ────────────────────────────────────────────────────
    // Capture the raw HTML from "Casting Time:" to the closing </p> of the stats block.
    // The raw HTML has <strong>Duration:</strong> so the char after "Duration:" is "<";
    // stopping at [^<] would miss the value — capturing to </p> avoids that entirely.
    const statsHtmlMatch = rawHtml.match(/Casting Time:[\s\S]*?<\/p>/i)
      || rawHtml.match(/Casting Time:[\s\S]{0,900}/i);   // fallback: no </p> found
    if (!statsHtmlMatch)
      throw new Error(`Stats not found for "${spellName}". Check the spell name.`);

    const statsText = statsHtmlMatch[0]
      .replace(/<\/p[^>]*>/gi, '\n')  // </p> → newline (marks end of stats block)
      .replace(/<br\s*\/?>/gi, ' ')   // <br>  → space
      .replace(/<[^>]+>/g, '')        // strip all remaining tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/[ \t]+/g, ' ')        // collapse spaces/tabs (keep newlines)
      .trim();

    // Each field: capture from the label to end, then trim at the next label.
    // Duration uses [^\n]+ to stop at the paragraph-end newline we inserted above.
    const g = (pat) => (statsText.match(pat)?.[1] || '').trim();
    const casting_time = g(/Casting Time:\s*(.+)/i) .replace(/\s*Range(?:\/Area)?:.*$/i,  '').trim();
    const range_area   = g(/Range(?:\/Area)?:\s*(.+)/i).replace(/\s*Components?:.*$/i,    '').trim();
    const components   = g(/Components?:\s*(.+)/i)  .replace(/\s*Duration:.*$/i,          '').trim();
    const duration     = g(/Duration:\s*([^\n]+)/i);

    // ── Subtitle & description ───────────────────────────────────────────────
    const doc = (new DOMParser()).parseFromString(rawHtml, 'text/html');
    const pageContent = doc.querySelector('#page-content') || doc.body;
    const fullTxt = pageContent.textContent;

    const sub = fullTxt.match(/((?:\d+\w*[- ]level|cantrip)\s+\w[\w ]*)/i);
    const subtitle = sub ? sub[1].trim() : '';

    const skipPat = /^(Casting Time|Range|Components|Duration|Source|Spell Lists)/i;
    const descParts = Array.from(pageContent.querySelectorAll('p'))
      .map(el => el.textContent.trim())
      .filter(t => t.length > 15 && !skipPat.test(t) && !/cantrip|\d+\w*[- ]level/i.test(t));

    return { subtitle, casting_time, range_area, components, duration, description: descParts.join('\n\n') };
  }

  function flashSaveBtn(msg, duration) {
    const btn = document.getElementById('btnSaveLocal');
    if (!btn) return;
    btn.textContent = msg;
    clearTimeout(flashSaveBtn._t);
    if (duration > 0) flashSaveBtn._t = setTimeout(() => {
      const b = document.getElementById('btnSaveLocal');
      if (b) b.textContent = 'Save';
    }, duration);
  }

  function saveToLocalStorage(){
    return saveChar(state);
  }

  function startAutosave(){
    stopAutosave();
    autosaveInterval = setInterval(() => {
      flashSaveBtn('Saving…', 0);
      const ok = saveToLocalStorage();
      flashSaveBtn(ok ? 'Saved ✓' : 'Save failed', 2000);
    }, 30000);
  }

  function stopAutosave(){
    if (autosaveInterval) { clearInterval(autosaveInterval); autosaveInterval = null; }
  }

  function loadFromLocalStorage(){
    // Legacy — no longer used for initial load
    return null;
  }

  function downloadJSON(){
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeFilename(state.character?.name || 'character')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function safeFilename(name){
    return String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || 'character';
  }

  function toast(msg){
    // Minimal, non-annoying: use alert for now.
    alert(msg);
  }

  // --- Rendering ---
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

    // Wire header buttons — none left here
  }

  function renderTabs(){
    const isCaster = !!state.character.spellcasting;
    const tabs = [
      { id:'overview', label:'Overview' },
      { id:'stats', label:'Stats' },
      { id:'class_race', label:'Character' },
      { id:'spells', label:'Spells', hide: !isCaster },
      { id:'combat', label:'Combat' },
      { id:'inventory', label:'Inventory' },
      { id:'camp', label:'Camp' },
    ].filter(t => !t.hide);

    // If current tab got hidden (e.g., caster -> non-caster), bounce to overview
    if (!tabs.some(t => t.id === activeTab)) activeTab = 'overview';

    $('#tabsCard').innerHTML = `
      <div class="row" style="gap:6px; flex-wrap:nowrap; align-items:center;">
        <button class="btn" id="btnSaveLocal" style="flex-shrink:0;">Save</button>
        ${fbUser ? '<button class="btn" id="btnSaveCloud" style="flex-shrink:0;">&#x2601; Cloud</button>' : ''}
        <button id="tabScrollLeft" class="tab" style="flex-shrink:0;">&#8249;</button>
        <div class="tabs" id="tabsScroller" style="flex:1; min-width:0;">
          ${tabs.map(t => `<div class="tab ${t.id===activeTab?'active':''}" data-tab="${t.id}" style="white-space:nowrap;">${t.label}</div>`).join('')}
          <div class="tab" id="btnMenuToggle" style="white-space:nowrap;">Main Menu</div>
        </div>
        <button id="tabScrollRight" class="tab" style="flex-shrink:0;">&#8250;</button>
      </div>
    `;

    $('#menuPanel').style.display = 'none';

    const scroller = document.getElementById('tabsScroller');
    const leftBtn  = document.getElementById('tabScrollLeft');
    const rightBtn = document.getElementById('tabScrollRight');

    function updateArrows(){
      const canLeft  = scroller.scrollLeft > 1;
      const canRight = scroller.scrollLeft < scroller.scrollWidth - scroller.clientWidth - 1;
      leftBtn.style.visibility  = canLeft  ? 'visible' : 'hidden';
      rightBtn.style.visibility = canRight ? 'visible' : 'hidden';
    }
    scroller.addEventListener('scroll', updateArrows);
    // Wait for layout to be painted before checking overflow
    requestAnimationFrame(() => requestAnimationFrame(updateArrows));
    new ResizeObserver(updateArrows).observe(scroller);

    leftBtn.onclick  = () => {
      const scrollerRect = scroller.getBoundingClientRect();
      const tabs = [...scroller.querySelectorAll('.tab')];
      // Find the last tab that is partially or fully off the left edge
      const target = [...tabs].reverse().find(t => t.getBoundingClientRect().left < scrollerRect.left);
      if (target) {
        // Scroll so this tab's right edge aligns with the scroller's right edge
        const targetRect = target.getBoundingClientRect();
        scroller.scrollLeft += targetRect.right - scrollerRect.right;
      }
    };
    rightBtn.onclick = () => {
      const scrollerRect = scroller.getBoundingClientRect();
      const tabs = [...scroller.querySelectorAll('.tab')];
      // Find the first tab that is partially or fully off the right edge
      const target = tabs.find(t => t.getBoundingClientRect().right > scrollerRect.right);
      if (target) {
        // Scroll so this tab's left edge aligns with the scroller's left edge
        const targetRect = target.getBoundingClientRect();
        scroller.scrollLeft += targetRect.left - scrollerRect.left;
      }
    };

    $('#tabsCard').querySelectorAll('.tab').forEach(el => {
      if (el.id === 'btnMenuToggle' || el.id === 'tabScrollLeft' || el.id === 'tabScrollRight') return;
      el.onclick = () => { activeTab = el.dataset.tab; renderContent(); renderTabs(); };
    });

    $('#btnMenuToggle').onclick = () => {
      flashSaveBtn('Saving…', 0);
      saveToLocalStorage();
      returnToMenu();
    };

    $('#btnSaveLocal').onclick = () => {
      state.exported_at = new Date().toISOString();
      flashSaveBtn('Saving…', 0);
      const ok = saveToLocalStorage();
      flashSaveBtn(ok ? 'Saved ✓' : 'Save failed', 2000);
    };

    if (fbUser) {
      $('#btnSaveCloud').onclick = async () => {
        const btn = $('#btnSaveCloud');
        const orig = btn.textContent;
        btn.textContent = '☁ Saving…';
        btn.disabled = true;
        try {
          saveToLocalStorage();
          await saveCharToCloud(state, null);
          btn.textContent = '☁ Saved ✓';
        } catch { btn.textContent = '☁ Failed'; }
        setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
      };
    }
  }

  function renderContent(){
    const c = state.character;
    if (activeTab === 'overview') return renderOverview(c);
    if (activeTab === 'stats') return renderStats(c);
    if (activeTab === 'class_race') return renderCharacter(c);
    if (activeTab === 'spells') return renderSpells(c);
    if (activeTab === 'combat') return renderCombat(c);
    if (activeTab === 'inventory') return renderInventory(c);
    if (activeTab === 'camp') return renderCamp(c);
  }

  function renderOverview(c){
    const as = c.ability_scores || {};
    const profBonus = toInt(c.combat.proficiency_bonus, 2);
    const wisMod = Math.floor((toInt(as.wis, 10) - 10) / 2);
    const dexMod  = Math.floor((toInt(as.dex, 10) - 10) / 2);
    const percProf = Array.isArray(c.skill_proficiencies) && c.skill_proficiencies.includes('perception');
    const ppBonus = toInt(c.combat.pp_bonus, 0);
    const passivePerception = 10 + wisMod + (percProf ? profBonus : 0) + ppBonus;
    const initExtra = toInt(c.combat.initiative_mod, 0);
    const initTotal = dexMod + initExtra;

    $('#contentCard').innerHTML = `
      <div class="grid2">
        <div class="col">
          <h2>Quick Stats</h2>
          <div class="grid2">
            ${numField('AC','combat.ac', c.combat.ac)}
            ${numField('Proficiency','combat.proficiency_bonus', c.combat.proficiency_bonus)}
            ${numField('Speed','combat.speed', c.combat.speed)}
            ${numField('Inspiration','inspiration', toInt(c.inspiration, 0))}
            <label class="col" style="gap:6px;"><div class="mini">Initiative</div><span class="pill" style="font-size:1.1em; font-weight:700;">${initTotal >= 0 ? '+' : ''}${initTotal}</span><div class="mini muted">DEX mod (${dexMod >= 0 ? '+' : ''}${dexMod}) + bonus (${initExtra >= 0 ? '+' : ''}${initExtra})</div></label>
            ${numField('Init Extra Bonus','combat.initiative_mod', initExtra)}
          </div>
          <div class="grid2" style="margin-top:10px;">
            <label class="col" style="gap:6px;"><div class="mini">Passive Perception</div><span class="pill" style="font-size:1.1em; font-weight:700;">${passivePerception}</span><div class="mini muted">10 + WIS mod (${wisMod >= 0 ? '+' : ''}${wisMod})${percProf ? ` + Prof (+${profBonus})` : ''} + bonus (${ppBonus >= 0 ? '+' : ''}${ppBonus})</div></label>
            ${numField('PP Extra Bonus','combat.pp_bonus', ppBonus)}
          </div>

          <h2 style="margin-top:10px;">Conditions</h2>
          <div class="row" style="margin-top:8px;">
            <select id="condInput">
              <option value="">— Select condition —</option>
              ${['Blinded','Charmed','Deafened','Exhaustion','Frightened','Grappled','Incapacitated','Invisible','Paralyzed','Petrified','Poisoned','Prone','Restrained','Stunned','Unconscious'].map(x => `<option value="${x}">${x}</option>`).join('')}
            </select>
            <button class="btn" id="btnAddCond">Add</button>
          </div>
          <div class="row" style="margin-top:8px;">
            ${(c.conditions||[]).length ? (c.conditions||[]).map((x,i)=>`<span class="pill">${escapeHtml(x)} <a href="#" data-del-cond="${i}" title="remove">×</a></span>`).join('') : `<div class="mini">No conditions.</div>`}
          </div>
        </div>

      </div>
    `;

    wireNumberFields('#contentCard');

    // Re-render when init extra bonus changes so the computed pill updates
    const initInp = $('#contentCard').querySelector('[data-num="combat.initiative_mod"]');
    if (initInp) initInp.oninput = () => { c.combat.initiative_mod = toInt(initInp.value, 0); render(); };
    const ppInp = $('#contentCard').querySelector('[data-num="combat.pp_bonus"]');
    if (ppInp) ppInp.oninput = () => { c.combat.pp_bonus = toInt(ppInp.value, 0); render(); };

    $('#btnAddCond').onclick = () => {
      const v = ($('#condInput').value || '').trim();
      if (!v) return;
      c.conditions = c.conditions || [];
      if (!c.conditions.includes(v)) c.conditions.push(v);
      $('#condInput').value = '';
      render();
    };

    $('#contentCard').querySelectorAll('[data-del-cond]').forEach(a => {
      a.onclick = (e) => {
        e.preventDefault();
        const idx = toInt(a.dataset.delCond, -1);
        if (idx >= 0) c.conditions.splice(idx, 1);
        render();
      };
    });

  }

  function renderCharacter(c){
    $('#contentCard').innerHTML = `
      <div class="grid2">
        <div class="col">
          <div class="row" style="justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
            <h2 style="margin:0;">Resources</h2>
          </div>
          <div class="mini" style="margin-top:4px;">For Fighters: Action Surge, Second Wind. For anyone: class features with uses.</div>
          <div class="list" id="resourcesList" style="margin-top:10px;"></div>
          <button class="btn" id="btnAddResource">Add Resource</button>
        </div>
        <div class="col">
          <h2>Features</h2>
          <div class="list" id="featuresList" style="margin-top:10px;"></div>
          <button class="btn" id="btnAddFeature">Add Feature</button>
        </div>
      </div>
    `;

    renderResourcesList();
    renderFeaturesList();

    $('#btnAddResource').onclick = () => {
      c.resources = c.resources || [];
      c.resources.push({ name:'New Resource', max:1, used:0, reset:'short', notes:'' });
      render();
    };
    $('#btnAddFeature').onclick = () => {
      c.features = c.features || [];
      c.features.push({ name:'New Feature', description:'', uses_max:null, uses_used:null, reset:'none' });
      render();
    };

    function renderResourcesList(){
      const list = $('#resourcesList');
      const r = c.resources || [];
      list.innerHTML = r.length ? r.map((x,i) => `
        <div class="item">
          <div>
            <div class="row" style="justify-content:space-between; align-items:center; gap:6px;">
              <b>${escapeHtml(x.name || 'Resource')}</b>
              <select class="reset-sel" data-res-reset="${i}" style="font-size:12px; padding:2px 6px; border-radius:6px; background:var(--btn); color:var(--text); border:1px solid var(--line); cursor:pointer;">
                <option value="short" ${(x.reset||'none')==='short'?'selected':''}>Short Rest</option>
                <option value="long" ${(x.reset||'none')==='long'?'selected':''}>Long Rest</option>
                <option value="none" ${(x.reset||'none')==='none'?'selected':''}>Never</option>
              </select>
            </div>
            <div class="mini">${escapeHtml(x.notes || '')}</div>
          </div>
          <div class="col" style="min-width:160px;">
            <div class="row" style="justify-content:flex-end;">
              <button class="btn" data-res-use="${i}">Use</button>
              <button class="btn" data-res-refund="${i}">Refund</button>
              <button class="btn danger" data-res-del="${i}">Delete</button>
            </div>
            <div class="row" style="justify-content:flex-end;">
              <span class="pill"><b>${toInt(x.used,0)}</b> / ${toInt(x.max,0)}</span>
            </div>
          </div>
        </div>
      `).join('') : `<div class="mini">No resources tracked.</div>`;

      list.querySelectorAll('[data-res-use]').forEach(btn => btn.onclick = () => {
        const i = toInt(btn.dataset.resUse, -1);
        const rr = c.resources[i];
        rr.used = clamp(toInt(rr.used, 0) + 1, 0, toInt(rr.max, 0));
        render();
      });
      list.querySelectorAll('[data-res-refund]').forEach(btn => btn.onclick = () => {
        const i = toInt(btn.dataset.resRefund, -1);
        const rr = c.resources[i];
        rr.used = clamp(toInt(rr.used, 0) - 1, 0, toInt(rr.max, 0));
        render();
      });
      list.querySelectorAll('[data-res-del]').forEach(btn => btn.onclick = () => {
        const i = toInt(btn.dataset.resDel, -1);
        c.resources.splice(i, 1);
        render();
      });
      list.querySelectorAll('[data-res-reset]').forEach(sel => sel.onchange = () => {
        const i = toInt(sel.dataset.resReset, -1);
        c.resources[i].reset = sel.value;
        saveToLocalStorage();
      });
    }

    function renderFeaturesList(){
      const list = $('#featuresList');
      const f = c.features || [];
      list.innerHTML = f.length ? f.map((x,i) => `
        <div class="item">
          <div>
            <div class="row" style="justify-content:space-between; align-items:center; gap:6px;">
              <b>${escapeHtml(x.name || 'Feature')}</b>
              <select class="reset-sel" data-feat-reset="${i}" style="font-size:12px; padding:2px 6px; border-radius:6px; background:var(--btn); color:var(--text); border:1px solid var(--line); cursor:pointer;">
                <option value="short" ${(x.reset||'none')==='short'?'selected':''}>Short Rest</option>
                <option value="long" ${(x.reset||'none')==='long'?'selected':''}>Long Rest</option>
                <option value="none" ${(x.reset||'none')==='none'?'selected':''}>Never</option>
              </select>
            </div>
            <div class="mini">${escapeHtml(x.description || '')}</div>
          </div>
          <div class="col" style="min-width:160px;">
            ${(x.uses_max != null) ? `
              <div class="row" style="justify-content:flex-end;">
                <button class="btn" data-feat-use="${i}">Use</button>
                <button class="btn" data-feat-refund="${i}">Refund</button>
                <button class="btn danger" data-feat-del="${i}">Delete</button>
              </div>
              <div class="row" style="justify-content:flex-end;">
                <span class="pill"><b>${toInt(x.uses_used,0)}</b> / ${toInt(x.uses_max,0)}</span>
              </div>
            ` : `
              <div class="row" style="justify-content:flex-end;">
                <button class="btn" data-feat-edit="${i}">Edit Uses</button>
                <button class="btn danger" data-feat-del="${i}">Delete</button>
              </div>
            `}
          </div>
        </div>
      `).join('') : `<div class="mini">No features listed.</div>`;

      list.querySelectorAll('[data-feat-use]').forEach(btn => btn.onclick = () => {
        const i = toInt(btn.dataset.featUse, -1);
        const ff = c.features[i];
        ff.uses_used = clamp(toInt(ff.uses_used, 0) + 1, 0, toInt(ff.uses_max, 0));
        render();
      });
      list.querySelectorAll('[data-feat-refund]').forEach(btn => btn.onclick = () => {
        const i = toInt(btn.dataset.featRefund, -1);
        const ff = c.features[i];
        ff.uses_used = clamp(toInt(ff.uses_used, 0) - 1, 0, toInt(ff.uses_max, 0));
        render();
      });
      list.querySelectorAll('[data-feat-edit]').forEach(btn => btn.onclick = () => {
        const i = toInt(btn.dataset.featEdit, -1);
        const ff = c.features[i];
        const max = prompt('Uses max (leave blank to remove tracking):', ff.uses_max ?? '');
        if (max == null) return;
        const trimmed = String(max).trim();
        if (!trimmed) {
          ff.uses_max = null; ff.uses_used = null;
        } else {
          ff.uses_max = clamp(toInt(trimmed, 0), 0, 99);
          ff.uses_used = clamp(toInt(ff.uses_used, 0), 0, ff.uses_max);
        }
        render();
      });
      list.querySelectorAll('[data-feat-del]').forEach(btn => btn.onclick = () => {
        const i = toInt(btn.dataset.featDel, -1);
        c.features.splice(i, 1);
        render();
      });
      list.querySelectorAll('[data-feat-reset]').forEach(sel => sel.onchange = () => {
        const i = toInt(sel.dataset.featReset, -1);
        c.features[i].reset = sel.value;
        saveToLocalStorage();
      });
    }

    // --- Identity & settings (formerly Edit tab) ---
    const isCaster = !!c.spellcasting;
    const editHtml = `
      <hr style="margin:24px 0; border-color:var(--line);" />
      <div class="grid2">
        <div class="col">
          <h2>Identity</h2>
          ${textField('Name','name', c.name || '')}
          <div class="grid2">
            ${numField('Level','level', c.level)}
            ${textField('Class','class', c.class || '')}
            ${textField('Subclass','subclass', c.subclass || '')}
            ${textField('Race','race', c.race || '')}
            ${textField('Background','background', c.background || '')}
          </div>

          <div class="mini" style="margin-top:10px; font-weight:600;">Languages</div>
          <div class="row" style="margin-top:6px;">
            <input type="text" id="langInput" placeholder="Add a language…" style="flex:1;" />
            <button class="btn" id="btnAddLang">Add</button>
          </div>
          <div class="row" style="margin-top:8px; flex-wrap:wrap; gap:6px;">
            ${(c.languages||[]).length ? (c.languages||[]).map((x,i) => `<span class="pill">${escapeHtml(x)} <a href="#" data-del-lang="${i}" title="remove">×</a></span>`).join('') : `<div class="mini">No languages added.</div>`}
          </div>

          <h2 style="margin-top:14px;">HP</h2>
          <div class="grid3">
            ${numField('Max','hp.max', c.hp.max)}
          </div>

          <h2 style="margin-top:14px;">Spellcasting</h2>
          <div class="mini">Enable for Wizards/Clerics/etc. Disable for martial characters.</div>
          <div class="row" style="margin-top:8px;">
            <button class="btn" id="btnToggleCaster">${isCaster ? 'Disable Spellcasting' : 'Enable Spellcasting'}</button>
          </div>
        </div>
      </div>
    `;
    $('#contentCard').innerHTML += editHtml;

    wireTextFields('#contentCard');
    wireNumberFields('#contentCard');

    // Name duplicate validation
    const nameInput = $('#contentCard').querySelector('[data-text="name"]');
    if (nameInput) {
      // Inject error message element after the input
      const errSpan = document.createElement('div');
      errSpan.className = 'mini';
      errSpan.style.cssText = 'color:var(--bad); display:none; margin-top:2px;';
      nameInput.parentNode.appendChild(errSpan);

      nameInput.oninput = () => {
        const newName = nameInput.value.trim();
        const chars = loadAllChars();
        if (newName && chars[newName] && newName !== currentSaveName) {
          errSpan.textContent = `"${newName}" already exists — name not saved.`;
          errSpan.style.display = 'block';
          nameInput.style.borderColor = 'var(--bad)';
          // Do NOT update state.character.name
        } else {
          errSpan.style.display = 'none';
          nameInput.style.borderColor = '';
          setPath(state.character, 'name', nameInput.value);
          renderHeader();
        }
      };
    }

    $('#btnAddLang').onclick = () => {
      const v = ($('#langInput').value || '').trim();
      if (!v) return;
      c.languages = c.languages || [];
      if (!c.languages.includes(v)) c.languages.push(v);
      $('#langInput').value = '';
      render();
    };
    $('#langInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btnAddLang').click(); });
    $('#contentCard').querySelectorAll('[data-del-lang]').forEach(a => {
      a.onclick = e => {
        e.preventDefault();
        c.languages.splice(toInt(a.dataset.delLang, -1), 1);
        render();
      };
    });

    $('#btnToggleCaster').onclick = () => {
      if (c.spellcasting) {
        c.spellcasting = null;
      } else {
        c.spellcasting = {
          ability: 'INT', save_dc: 0, attack_bonus: 0, notes: '',
          spell_slots: [ { level: 1, max: 0, used: 0 } ],
          cantrips: [], prepared_spells: [], known_spells: []
        };
      }
      render();
    };
  }

  function renderSpells(c){
    const s = c.spellcasting;
    if (!s) {
      $('#contentCard').innerHTML = `
        <h2>Spells</h2>
        <div class="mini">This character has <b>no spellcasting</b> configured. If you have spells, go to <span class="kbd">Edit</span> and add the spellcasting section (or import from DMGPT).</div>
      `;
      return;
    }

    const profBonus = toInt(c.combat.proficiency_bonus, 2);
    const abilKey = (s.ability || 'INT').toLowerCase();
    const abilScore = toInt(c.ability_scores?.[abilKey], 10);
    const abilMod = Math.floor((abilScore - 10) / 2);
    const dcBonus  = toInt(s.dc_bonus, 0);
    const atkBonusExtra = toInt(s.atk_bonus, 0);
    const saveDC   = 8 + profBonus + abilMod + dcBonus;
    const atkBonus = profBonus + abilMod + atkBonusExtra;

    $('#contentCard').innerHTML = `
      <div class="grid2">
        <div class="col">
          <h2>Spellcasting</h2>
          <div class="grid3">
            ${selectField('Ability','spellcasting.ability', s.ability || 'INT', ['INT','WIS','CHA'])}
            <label class="col" style="gap:6px;"><div class="mini">Save DC</div><span class="pill" style="font-size:1.1em; font-weight:700;">${saveDC}</span><div class="mini muted">8 + Prof (+${profBonus}) + ${s.ability||'INT'} mod (${abilMod >= 0 ? '+' : ''}${abilMod}) + bonus (${dcBonus >= 0 ? '+' : ''}${dcBonus})</div></label>
            ${numField('DC Extra Bonus','spellcasting.dc_bonus', s.dc_bonus ?? 0)}
            <label class="col" style="gap:6px;"><div class="mini">Attack Bonus</div><span class="pill" style="font-size:1.1em; font-weight:700;">${atkBonus >= 0 ? '+' : ''}${atkBonus}</span><div class="mini muted">Prof (+${profBonus}) + ${s.ability||'INT'} mod (${abilMod >= 0 ? '+' : ''}${abilMod}) + bonus (${atkBonusExtra >= 0 ? '+' : ''}${atkBonusExtra})</div></label>
            ${numField('Atk Extra Bonus','spellcasting.atk_bonus', s.atk_bonus ?? 0)}
          </div>

          <h2 style="margin-top:14px;">Spell Slots</h2>
          <div class="list" id="slotsList" style="margin-top:10px;"></div>
          <button class="btn" id="btnAddSlot">Add Slot Level</button>

          <h2 style="margin-top:14px;">Cantrips</h2>
          <div class="list" id="cantripsList" style="margin-top:10px;"></div>
          <button class="btn" id="btnAddCantrip">Add Cantrip</button>
        </div>

        <div class="col">
          <div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
            <h2>Prepared Spells</h2>
            ${(() => { const cnt = (s.prepared_spells||[]).length; const mx = toInt(s.max_prepared,1); const over = cnt > mx; return `<span style="font-size:1.1em; font-weight:700; color:${over ? 'var(--bad)' : 'var(--accent)'}">${cnt}</span><span style="color:var(--muted)"> / </span><input type="number" id="inlineMaxPrepared" value="${mx}" min="1" style="width:52px; font-size:1em; font-weight:700; text-align:center; padding:2px 4px;">`; })()}
          </div>
          <div class="mini">Track what you have ready today. (Yes, you can forget to update this. That’s the tradition.)</div>
          <div class="list" id="preparedList" style="margin-top:10px;"></div>
          <button class="btn" id="btnAddPrepared">Add Prepared Spell</button>

          <h2 style="margin-top:14px;">Known Spells</h2>
          <div class="list" id="knownList" style="margin-top:10px;"></div>
          <button class="btn" id="btnAddKnown">Add Known Spell</button>
        </div>
      </div>
    `;

    wireNumberFields('#contentCard');
    wireSelectFields('#contentCard');

    // extra bonus fields and max_prepared must re-render to update the computed values
    const maxPrepInp = document.getElementById('inlineMaxPrepared');
    if (maxPrepInp) maxPrepInp.oninput = () => {
      let v = toInt(maxPrepInp.value, 1);
      if (v < 1) { v = 1; maxPrepInp.value = 1; }
      s.max_prepared = v;
      render();
    };
    const dcBonusInp = $('#contentCard').querySelector('[data-num="spellcasting.dc_bonus"]');
    if (dcBonusInp) dcBonusInp.oninput = () => { s.dc_bonus = toInt(dcBonusInp.value, 0); render(); };
    const atkBonusInp = $('#contentCard').querySelector('[data-num="spellcasting.atk_bonus"]');
    if (atkBonusInp) atkBonusInp.oninput = () => { s.atk_bonus = toInt(atkBonusInp.value, 0); render(); };

    // Re-render when ability changes so DC/attack bonus update immediately
    const abilitySel = $('#contentCard').querySelector('[data-sel="spellcasting.ability"]');
    if (abilitySel) abilitySel.onchange = () => { s.ability = abilitySel.value; render(); };

    renderSlots();
    renderSpellList('cantrips', '#cantripsList');
    renderSpellList('prepared_spells', '#preparedList', true, 'known_spells', 'Unprepare');
    renderSpellList('known_spells', '#knownList', true, 'prepared_spells', 'Prepare');

    $('#btnAddSlot').onclick = () => {
      s.spell_slots = s.spell_slots || [];
      const next = nextSlotLevel(s.spell_slots);
      s.spell_slots.push({ level: next, max: 0, used: 0 });
      s.spell_slots.sort((a,b)=>a.level-b.level);
      render();
    };
    $('#btnAddCantrip').onclick = () => {
      const name = prompt('Cantrip name:');
      if (!name) return;
      s.cantrips = s.cantrips || [];
      s.cantrips.push({ name: name.trim(), notes:'' });
      render();
    };
    $('#btnAddPrepared').onclick = () => {
      const name = prompt('Spell name:');
      if (!name) return;
      s.prepared_spells = s.prepared_spells || [];
      s.prepared_spells.push({ name: name.trim(), level: 1, notes:'' });
      render();
    };
    $('#btnAddKnown').onclick = () => {
      const name = prompt('Spell name:');
      if (!name) return;
      s.known_spells = s.known_spells || [];
      s.known_spells.push({ name: name.trim(), level: 1, notes:'' });
      render();
    };

    function renderSlots(){
      const list = $('#slotsList');
      const slots = s.spell_slots || [];
      list.innerHTML = slots.length ? slots.map((x,i)=>{
        const used = clamp(toInt(x.used,0), 0, toInt(x.max,0));
        const max = clamp(toInt(x.max,0), 0, 99);
        return `
          <div class="item">
            <div>
              <div class="row" style="justify-content:space-between;">
                <b>Level ${toInt(x.level,1)} Slots</b>
                <span class="pill"><b>${used}</b> / ${max}</span>
              </div>
              <div class="mini">Used: ${used}. Remaining: ${Math.max(0, max-used)}.</div>
            </div>
            <div class="row" style="justify-content:flex-end; align-items:center;">
              <button class="btn" data-slot-use="${i}">Use</button>
              <button class="btn" data-slot-refund="${i}">Refund</button>
              <button class="btn" data-slot-set="${i}">Set Max</button>
              <button class="btn danger" data-slot-del="${i}">Delete</button>
            </div>
          </div>
        `;
      }).join('') : `<div class="mini">No spell slots tracked.</div>`;

      list.querySelectorAll('[data-slot-use]').forEach(btn => btn.onclick = () => {
        const i = toInt(btn.dataset.slotUse, -1);
        const ss = s.spell_slots[i];
        ss.used = clamp(toInt(ss.used, 0) + 1, 0, toInt(ss.max, 0));
        render();
      });
      list.querySelectorAll('[data-slot-refund]').forEach(btn => btn.onclick = () => {
        const i = toInt(btn.dataset.slotRefund, -1);
        const ss = s.spell_slots[i];
        ss.used = clamp(toInt(ss.used, 0) - 1, 0, toInt(ss.max, 0));
        render();
      });
      list.querySelectorAll('[data-slot-set]').forEach(btn => btn.onclick = () => {
        const i = toInt(btn.dataset.slotSet, -1);
        const ss = s.spell_slots[i];
        const max = prompt('Set slot max:', ss.max);
        if (max == null) return;
        ss.max = clamp(toInt(max, 0), 0, 99);
        ss.used = clamp(toInt(ss.used, 0), 0, ss.max);
        render();
      });
      list.querySelectorAll('[data-slot-del]').forEach(btn => btn.onclick = () => {
        const i = toInt(btn.dataset.slotDel, -1);
        s.spell_slots.splice(i, 1);
        render();
      });
    }

    function renderSpellList(field, containerSel, hasLevel, moveToField, moveLabel){
      const list = $(containerSel);
      const arr = s[field] || [];
      const maxPrep = toInt(s.max_prepared, 1);
      const prepCount = (s.prepared_spells || []).length;
      const overMax = field === 'prepared_spells' && prepCount > maxPrep;
      list.innerHTML = arr.length ? arr.map((x,i)=>{
        const statsHtml = [
          x.casting_time ? `<span><b>Casting Time:</b> <span class="spell-val">${escapeHtml(x.casting_time)}</span></span>` : '',
          x.range_area   ? `<span><b>Range/Area:</b> <span class="spell-val">${escapeHtml(x.range_area)}</span></span>` : '',
          x.duration     ? `<span><b>Duration:</b> <span class="spell-val">${escapeHtml(x.duration)}</span></span>` : '',
          x.components   ? `<span><b>Components:</b> <span class="spell-val">${escapeHtml(x.components)}</span></span>` : '',
        ].filter(Boolean).join('<span class="spell-dot"> · </span>');
        const hasStats = !!(x.casting_time || x.range_area || x.duration || x.components);
        return `
          <div class="item" style="grid-template-columns:1fr;${overMax ? ' border-color:var(--bad);' : ''}">
            <div class="row" style="justify-content:space-between; align-items:flex-start;">
              <div class="row" style="gap:8px; align-items:center;">
                <b style="${overMax ? 'color:var(--bad);' : ''}">${escapeHtml(x.name || 'Spell')}</b>
                ${hasLevel ? `<span class="pill">lvl ${toInt(x.level,1)}</span>` : ''}
              </div>
              <div class="row" style="gap:6px;">
                ${hasLevel ? `<button class="btn" data-spell-level="${field}:${i}">Level</button>` : ''}
                ${moveToField ? `<button class="btn" data-spell-move="${field}:${i}:${moveToField}">${moveLabel}</button>` : ''}
                <button class="btn" data-spell-expand="${field}:${i}">Details</button>
                <button class="btn danger" data-spell-del="${field}:${i}">Delete</button>
              </div>
            </div>
            ${x.notes ? `<div class="mini" style="margin-top:4px;">${escapeHtml(x.notes)}</div>` : ''}
            <div class="spell-card-full" style="display:none; margin-top:10px;">
              <div class="spell-card">
                <div class="spell-card-title">${escapeHtml(x.name || 'Spell')}</div>
                ${x.subtitle ? `<div class="spell-card-subtitle">${escapeHtml(x.subtitle)}</div>` : ''}
                <hr class="spell-card-rule" />
                ${hasStats ? `<div class="spell-card-stats">${statsHtml}</div>` : ''}
                ${hasStats && x.description ? `<hr class="spell-card-rule" />` : ''}
                ${x.description ? `<div class="spell-card-desc">${escapeHtml(x.description).replace(/\n/g,'<br/>')}</div>` : '<div class="mini">No description yet.</div>'}
                <div class="row" style="margin-top:12px; gap:8px;">
                  <button class="btn" data-spell-edit="${field}:${i}">Edit Details</button>
                  <button class="btn" data-spell-wiki="${field}:${i}">Wiki Lookup</button>
                  <button class="btn" data-spell-notes="${field}:${i}">Notes</button>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('') : `<div class="mini">None listed.</div>`;

      list.querySelectorAll('[data-spell-expand]').forEach(btn => btn.onclick = () => {
        const card = btn.closest('.item').querySelector('.spell-card-full');
        const isOpen = card.style.display !== 'none';
        card.style.display = isOpen ? 'none' : 'block';
        btn.textContent = isOpen ? 'Details' : 'Close';
      });

      list.querySelectorAll('[data-spell-edit]').forEach(btn => btn.onclick = () => {
        const [f, idxStr] = btn.dataset.spellEdit.split(':');
        const i = toInt(idxStr, -1);
        const sp = s[f][i];
        const name = prompt('Name:', sp.name ?? '');
        if (name == null) return;
        const subtitle = prompt('Subtitle (e.g. "1st-level Divination"):', sp.subtitle ?? '');
        if (subtitle == null) return;
        const casting_time = prompt('Casting Time:', sp.casting_time ?? '');
        if (casting_time == null) return;
        const range_area = prompt('Range/Area:', sp.range_area ?? '');
        if (range_area == null) return;
        const duration = prompt('Duration:', sp.duration ?? '');
        if (duration == null) return;
        const components = prompt('Components:', sp.components ?? '');
        if (components == null) return;
        const description = prompt('Description:', sp.description ?? '');
        if (description == null) return;
        sp.name = name; sp.subtitle = subtitle; sp.casting_time = casting_time;
        sp.range_area = range_area; sp.duration = duration; sp.components = components;
        sp.description = description;
        render();
      });

      list.querySelectorAll('[data-spell-level]').forEach(btn => btn.onclick = () => {
        const [f, idxStr] = btn.dataset.spellLevel.split(':');
        const i = toInt(idxStr, -1);
        const sp = s[f][i];
        const lvl = prompt('Spell level:', sp.level ?? 1);
        if (lvl == null) return;
        sp.level = clamp(toInt(lvl, 1), 0, 9);
        render();
      });

      list.querySelectorAll('[data-spell-notes]').forEach(btn => btn.onclick = () => {
        const [f, idxStr] = btn.dataset.spellNotes.split(':');
        const i = toInt(idxStr, -1);
        const sp = s[f][i];
        const notes = prompt('Notes:', sp.notes ?? '');
        if (notes == null) return;
        sp.notes = notes;
        render();
      });

      list.querySelectorAll('[data-spell-del]').forEach(btn => btn.onclick = () => {
        const [f, idxStr] = btn.dataset.spellDel.split(':');
        const i = toInt(idxStr, -1);
        s[f].splice(i, 1);
        render();
      });

      list.querySelectorAll('[data-spell-move]').forEach(btn => btn.onclick = () => {
        const [f, idxStr, targetField] = btn.dataset.spellMove.split(':');
        const i = toInt(idxStr, -1);
        const sp = s[f].splice(i, 1)[0];
        s[targetField] = s[targetField] || [];
        s[targetField].push(sp);
        render();
      });

      list.querySelectorAll('[data-spell-wiki]').forEach(btn => btn.onclick = async () => {
        const [f, idxStr] = btn.dataset.spellWiki.split(':');
        const i = toInt(idxStr, -1);
        const sp = s[f][i];
        const orig = btn.textContent;
        btn.textContent = 'Loading…';
        btn.disabled = true;
        try {
          const data = await wikiLookupSpell(sp.name || '');
          if (data.subtitle)     sp.subtitle     = data.subtitle;
          if (data.casting_time) sp.casting_time = data.casting_time;
          if (data.range_area)   sp.range_area   = data.range_area;
          if (data.components)   sp.components   = data.components;
          if (data.duration)     sp.duration     = data.duration;
          if (data.description)  sp.description  = data.description;
          render();
        } catch (err) {
          btn.textContent = orig;
          btn.disabled = false;
          alert('Wiki lookup failed: ' + err.message);
        }
      });
    }

    function nextSlotLevel(slots){
      const levels = new Set((slots||[]).map(x => toInt(x.level,1)));
      for (let i=1; i<=9; i++) if (!levels.has(i)) return i;
      return 1;
    }
  }

  function renderStats(c){
    if (!c.ability_scores) c.ability_scores = { str:10, dex:10, con:10, int:10, wis:10, cha:10 };
    if (!Array.isArray(c.skill_proficiencies)) c.skill_proficiencies = [];
    if (!Array.isArray(c.skill_disadvantages)) c.skill_disadvantages = [];
    const as = c.ability_scores;
    const profBonus = c.combat.proficiency_bonus || 2;

    const stats = [
      { key:'str', label:'Strength',     abbr:'STR' },
      { key:'dex', label:'Dexterity',    abbr:'DEX' },
      { key:'con', label:'Constitution', abbr:'CON' },
      { key:'int', label:'Intelligence', abbr:'INT' },
      { key:'wis', label:'Wisdom',       abbr:'WIS' },
      { key:'cha', label:'Charisma',     abbr:'CHA' },
    ];

    const SKILLS = [
      { key:'acrobatics',      label:'Acrobatics',      stat:'dex' },
      { key:'animal_handling', label:'Animal Handling',  stat:'wis' },
      { key:'arcana',          label:'Arcana',           stat:'int' },
      { key:'athletics',       label:'Athletics',        stat:'str' },
      { key:'deception',       label:'Deception',        stat:'cha' },
      { key:'history',         label:'History',          stat:'int' },
      { key:'insight',         label:'Insight',          stat:'wis' },
      { key:'intimidation',    label:'Intimidation',     stat:'cha' },
      { key:'investigation',   label:'Investigation',    stat:'int' },
      { key:'medicine',        label:'Medicine',         stat:'wis' },
      { key:'nature',          label:'Nature',           stat:'int' },
      { key:'perception',      label:'Perception',       stat:'wis' },
      { key:'performance',     label:'Performance',      stat:'cha' },
      { key:'persuasion',      label:'Persuasion',       stat:'cha' },
      { key:'religion',        label:'Religion',         stat:'int' },
      { key:'sleight_of_hand', label:'Sleight of Hand',  stat:'dex' },
      { key:'stealth',         label:'Stealth',          stat:'dex' },
      { key:'survival',        label:'Survival',         stat:'wis' },
    ];

    const statAbbr = { str:'STR', dex:'DEX', con:'CON', int:'INT', wis:'WIS', cha:'CHA' };

    function abilityMod(statKey){ return Math.floor((toInt(as[statKey], 10) - 10) / 2); }
    function modStr(score){ const m = Math.floor((score - 10) / 2); return (m >= 0 ? '+' : '') + m; }
    function skillTotal(sk){ return abilityMod(sk.stat) + (c.skill_proficiencies.includes(sk.key) ? profBonus : 0); }
    function skillModStr(sk){ const t = skillTotal(sk); return (t >= 0 ? '+' : '') + t; }

    $('#contentCard').innerHTML = `
      <div class="grid2">
        <div class="col">
          <h2>Ability Scores</h2>
          <div class="grid3" style="margin-top:12px;">
            ${stats.map(s => {
              const score = toInt(as[s.key], 10);
              const positive = score >= 10;
              return `
                <div class="stat-block">
                  <div class="stat-abbr">${s.abbr}</div>
                  <div class="stat-label">${s.label}</div>
                  <div class="stat-mod" data-stat-mod="${s.key}" style="color:${positive ? 'var(--good)' : 'var(--bad)'}">${modStr(score)}</div>
                  <input type="number" class="stat-input" data-stat="${s.key}" value="${score}" min="1" max="30" />
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="col">
          <h2>Skills <span class="mini" style="margin-left:6px;">Prof bonus: +${profBonus}</span></h2>
          <div class="skill-list" style="margin-top:10px;">
            ${SKILLS.map(sk => {
              const t = skillTotal(sk);
              const isProficient = c.skill_proficiencies.includes(sk.key);
              const isDis = c.skill_disadvantages.includes(sk.key);
              return `
                <div class="skill-row">
                  <button class="skill-prof-dot${isProficient ? ' proficient' : ''}" data-skill-toggle="${sk.key}" title="Toggle proficiency"></button>
                  <button class="skill-dis-btn${isDis ? ' active' : ''}" data-skill-dis="${sk.key}" title="Toggle disadvantage">DIS</button>
                  <span class="skill-mod-val" data-skill-mod="${sk.key}" style="color:${t >= 0 ? 'var(--good)' : 'var(--bad)'}">${skillModStr(sk)}</span>
                  <span class="skill-name">${sk.label}</span>
                  <span class="skill-stat-tag">${statAbbr[sk.stat]}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    $('#contentCard').querySelectorAll('[data-stat]').forEach(inp => {
      inp.oninput = () => {
        const key = inp.dataset.stat;
        const val = clamp(toInt(inp.value, 10), 1, 30);
        c.ability_scores[key] = val;
        const modEl = $('#contentCard').querySelector(`[data-stat-mod="${key}"]`);
        modEl.textContent = modStr(val);
        modEl.style.color = val >= 10 ? 'var(--good)' : 'var(--bad)';
        SKILLS.filter(sk => sk.stat === key).forEach(sk => {
          const el = $('#contentCard').querySelector(`[data-skill-mod="${sk.key}"]`);
          if (!el) return;
          const t = skillTotal(sk);
          el.textContent = skillModStr(sk);
          el.style.color = t >= 0 ? 'var(--good)' : 'var(--bad)';
        });
      };
    });

    $('#contentCard').querySelectorAll('[data-skill-toggle]').forEach(btn => {
      btn.onclick = () => {
        const key = btn.dataset.skillToggle;
        const idx = c.skill_proficiencies.indexOf(key);
        if (idx === -1) c.skill_proficiencies.push(key);
        else c.skill_proficiencies.splice(idx, 1);
        const isProficient = c.skill_proficiencies.includes(key);
        btn.classList.toggle('proficient', isProficient);
        const sk = SKILLS.find(s => s.key === key);
        const el = $('#contentCard').querySelector(`[data-skill-mod="${key}"]`);
        const t = skillTotal(sk);
        el.textContent = skillModStr(sk);
        el.style.color = t >= 0 ? 'var(--good)' : 'var(--bad)';
        saveToLocalStorage();
      };
    });

    $('#contentCard').querySelectorAll('[data-skill-dis]').forEach(btn => {
      btn.onclick = () => {
        const key = btn.dataset.skillDis;
        const idx = c.skill_disadvantages.indexOf(key);
        if (idx === -1) c.skill_disadvantages.push(key);
        else c.skill_disadvantages.splice(idx, 1);
        btn.classList.toggle('active', c.skill_disadvantages.includes(key));
        saveToLocalStorage();
      };
    });
  }

  function renderCombat(c){
    const hpMax = c.hp.max || 1;
    const hpCur = clamp(Number(c.hp.current) || 0, 0, hpMax);
    const pct = Math.round((hpCur / hpMax) * 100);
    const low = pct <= 33;
    const attacks = c.attacks || [];
    const actions = c.actions || [];
    $('#contentCard').innerHTML = `
      <div class="card" style="margin-bottom:12px; padding:12px 16px;">
        <div class="row" style="justify-content:space-between; margin-bottom:6px;">
          <div><b>HP</b> <span class="muted">(temp: ${c.hp.temp || 0})</span></div>
          <div class="muted">${hpCur} / ${hpMax} (${pct}%)</div>
        </div>
        <div class="hpbar" aria-label="HP bar"><div class="hpfill ${low ? 'low':''}" style="width:${pct}%;"></div></div>
        <div class="row" style="margin-top:8px;">
          <input type="number" id="hpDelta" min="0" step="1" value="1" style="max-width:110px;" />
          <button class="btn danger" id="btnDamage">Damage</button>
          <button class="btn good" id="btnHeal">Heal</button>
          <button class="btn" id="btnTemp">Set Temp</button>
        </div>
      </div>
      <div class="grid2">
        <div class="col">
          <h2>Attacks / Actions</h2>
          <div class="mini">Track your bread-and-butter: weapon attacks, cantrip attacks, special actions.</div>
          <div class="list" id="attacksList" style="margin-top:10px;"></div>
          <button class="btn" id="btnAddAttack">Add Attack</button>

          <h2 style="margin-top:14px;">Actions</h2>
          <div class="list" id="actionsList" style="margin-top:10px;"></div>
          <button class="btn" id="btnAddAction">Add Action</button>
        </div>

      </div>
    `;

    renderAttacks();
    renderActions();

    $('#btnDamage').onclick = () => applyHpDelta(-toInt($('#hpDelta').value, 0));
    $('#btnHeal').onclick   = () => applyHpDelta(+toInt($('#hpDelta').value, 0));
    $('#btnTemp').onclick   = () => setTempHp(toInt($('#hpDelta').value, 0));

    $('#btnAddAttack').onclick = () => {
      const equippedWeapons = ((c.inventory || {}).items || [])
        .filter(it => it.type === 'weapon' && it.equipped);

      if (equippedWeapons.length === 0) {
        // No equipped weapons — just add a blank attack
        c.attacks = c.attacks || [];
        c.attacks.push({ name:'New Attack', to_hit: 0, damage:'', notes:'' });
        render();
        return;
      }

      // Build a small inline picker above the list
      const existingPicker = document.getElementById('weaponPicker');
      if (existingPicker) { existingPicker.remove(); return; }

      const picker = document.createElement('div');
      picker.id = 'weaponPicker';
      picker.style.cssText = 'margin-top:8px; padding:10px; background:var(--panel); border:1px solid var(--line); border-radius:var(--radius); display:flex; flex-direction:column; gap:6px;';
      picker.innerHTML = `
        <div class="mini" style="font-weight:600;">Add from equipped weapon:</div>
        ${equippedWeapons.map((w,idx) => `
          <button class="btn" data-pick="${idx}" style="text-align:left;">
            ${escapeHtml(w.name)}${w.notes ? ` <span class="muted" style="font-size:0.85em;">(${escapeHtml(w.notes)})</span>` : ''}
          </button>
        `).join('')}
        <button class="btn" id="btnPickManual">+ Manual entry</button>
        <button class="btn danger" id="btnPickCancel">Cancel</button>
      `;
      $('#btnAddAttack').insertAdjacentElement('afterend', picker);

      picker.querySelectorAll('[data-pick]').forEach(btn => btn.onclick = () => {
        const w = equippedWeapons[toInt(btn.dataset.pick, 0)];
        c.attacks = c.attacks || [];
        c.attacks.push({ name: w.name, to_hit: 0, damage: w.notes || '', notes: '' });
        picker.remove();
        render();
      });

      document.getElementById('btnPickManual').onclick = () => {
        c.attacks = c.attacks || [];
        c.attacks.push({ name:'New Attack', to_hit: 0, damage:'', notes:'' });
        picker.remove();
        render();
      };

      document.getElementById('btnPickCancel').onclick = () => picker.remove();
    };

    $('#btnAddAction').onclick = () => {
      c.actions = c.actions || [];
      c.actions.push({ name:'New Action', notes:'' });
      render();
    };

    function renderAttacks(){
      const list = $('#attacksList');
      list.innerHTML = attacks.length ? attacks.map((a,i)=> `
        <div class="item">
          <div>
            <div class="row" style="justify-content:space-between; align-items:flex-start;">
              <b>${escapeHtml(a.name || 'Attack')}</b>
              <span class="pill">to hit: ${a.to_hit == null ? '—' : signed(toInt(a.to_hit,0))}</span>
            </div>
            <div class="mini"><b>Damage:</b> ${escapeHtml(a.damage || '')}</div>
            <div class="mini">${escapeHtml(a.notes || '')}</div>
          </div>
          <div class="col" style="min-width:160px;">
            <div class="row" style="justify-content:flex-end;">
              <button class="btn" data-atk-edit="${i}">Edit</button>
              <button class="btn" data-atk-tohit="${i}">To Hit</button>
              <button class="btn danger" data-atk-del="${i}">Delete</button>
            </div>
          </div>
        </div>
      `).join('') : `<div class="mini">No attacks listed.</div>`;

      list.querySelectorAll('[data-atk-edit]').forEach(btn => btn.onclick = () => {
        const i = toInt(btn.dataset.atkEdit, -1);
        const atk = c.attacks[i];
        const name = prompt('Name:', atk.name ?? '');
        if (name == null) return;
        const dmg = prompt('Damage text:', atk.damage ?? '');
        if (dmg == null) return;
        const notes = prompt('Notes:', atk.notes ?? '');
        if (notes == null) return;
        atk.name = name;
        atk.damage = dmg;
        atk.notes = notes;
        render();
      });

      list.querySelectorAll('[data-atk-tohit]').forEach(btn => btn.onclick = () => {
        const i = toInt(btn.dataset.atkTohit, -1);
        const atk = c.attacks[i];
        const toHit = prompt('To-hit bonus (blank for none):', atk.to_hit ?? '');
        if (toHit == null) return;
        const th = String(toHit).trim();
        atk.to_hit = th !== '' ? toInt(th, 0) : null;
        render();
      });

      list.querySelectorAll('[data-atk-del]').forEach(btn => btn.onclick = () => {
        const i = toInt(btn.dataset.atkDel, -1);
        c.attacks.splice(i, 1);
        render();
      });
    }

    function renderActions(){
      const list = $('#actionsList');
      const acts = c.actions || [];
      list.innerHTML = acts.length ? acts.map((a,i) => `
        <div class="item">
          <div>
            <b>${escapeHtml(a.name || 'Action')}</b>
            <div class="mini">${escapeHtml(a.notes || '')}</div>
          </div>
          <div class="row" style="justify-content:flex-end;">
            <button class="btn" data-act-edit="${i}">Edit</button>
            <button class="btn danger" data-act-del="${i}">Delete</button>
          </div>
        </div>
      `).join('') : `<div class="mini">No actions listed.</div>`;

      list.querySelectorAll('[data-act-edit]').forEach(btn => btn.onclick = () => {
        const i = toInt(btn.dataset.actEdit, -1);
        const act = c.actions[i];
        const name = prompt('Name:', act.name ?? '');
        if (name == null) return;
        const notes = prompt('Notes:', act.notes ?? '');
        if (notes == null) return;
        act.name = name;
        act.notes = notes;
        render();
      });
      list.querySelectorAll('[data-act-del]').forEach(btn => btn.onclick = () => {
        const i = toInt(btn.dataset.actDel, -1);
        c.actions.splice(i, 1);
        render();
      });
    }
  }

  function renderInventory(c){
    const inv = c.inventory || { currency:{cp:0,sp:0,ep:0,gp:0,pp:0}, items:[] };
    const ITEM_TYPES = ['weapon','armor','misc'];

    $('#contentCard').innerHTML = `
      <div class="grid2">
        <div class="col">
          <h2>Equipped</h2>
          <div class="list" id="equippedList" style="margin-top:10px;"></div>
          <h2 style="margin-top:14px;">Inventory</h2>
          <div class="list" id="itemsList" style="margin-top:10px;"></div>
          <div class="row" style="margin-top:10px; gap:8px; flex-wrap:wrap;">
            <input type="text" id="newItemName" placeholder="Item name" style="flex:1; min-width:140px;" />
            <select id="newItemType" style="padding:6px 10px; border-radius:var(--radius); background:var(--btn); color:var(--text); border:1px solid var(--line);">
              ${ITEM_TYPES.map(t => `<option value="${t}">${t.charAt(0).toUpperCase()+t.slice(1)}</option>`).join('')}
            </select>
            <button class="btn" id="btnAddItem">Add Item</button>
          </div>
        </div>

        <div class="col">
          <h2>Currency</h2>
          <div class="grid3" style="margin-top:10px;">
            ${numField('CP','inventory.currency.cp', inv.currency.cp)}
            ${numField('SP','inventory.currency.sp', inv.currency.sp)}
            ${numField('EP','inventory.currency.ep', inv.currency.ep)}
            ${numField('GP','inventory.currency.gp', inv.currency.gp)}
            ${numField('PP','inventory.currency.pp', inv.currency.pp)}
          </div>
        </div>
      </div>
    `;

    wireNumberFields('#contentCard');

    renderItems();

    $('#btnAddItem').onclick = () => {
      const name = ($('#newItemName').value || '').trim();
      if (!name) { $('#newItemName').focus(); return; }
      const type = $('#newItemType').value || 'misc';
      inv.items = inv.items || [];
      inv.items.push({ name, type, qty:1, equipped:false, notes:'' });
      c.inventory = inv;
      $('#newItemName').value = '';
      render();
    };

    function renderItems(){
      const items = inv.items || [];
      const equipped = items.filter(it => it.equipped);
      const unequipped = items.filter(it => !it.equipped);

      function itemHtml(it, i){
        const typeTag = it.type ? `<span class="pill" style="text-transform:capitalize;">${escapeHtml(it.type)}</span>` : '';
        return `
          <div class="item">
            <div style="flex:1;">
              <div class="row" style="justify-content:space-between; flex-wrap:wrap; gap:4px;">
                <div class="row" style="gap:6px; align-items:center;">
                  <b>${escapeHtml(it.name || 'Item')}</b>
                  ${typeTag}
                </div>
                <div class="row" style="gap:4px; align-items:center;">
                  ${!['weapon','armor'].includes(it.type) ? `
                    <button class="btn" style="padding:2px 8px; font-size:0.9em;" data-it-dec="${i}">−</button>
                    <span class="pill">${Math.max(toInt(it.qty,0),0)}</span>
                    <button class="btn" style="padding:2px 8px; font-size:0.9em;" data-it-inc="${i}">+</button>
                  ` : ''}
                </div>
              </div>
              ${it.notes ? `<div class="mini" style="margin-top:4px;">${escapeHtml(it.notes)}</div>` : ''}
            </div>
            <div class="row" style="justify-content:flex-end; flex-wrap:wrap;">
              <button class="btn" data-it-equip="${i}">${it.equipped ? 'Unequip' : 'Equip'}</button>
              ${['weapon','armor'].includes(it.type) ? `<button class="btn" data-it-lookup="${i}">Lookup</button>` : ''}
              <button class="btn" data-it-notes="${i}">Notes</button>
              <button class="btn danger" data-it-del="${i}">Delete</button>
            </div>
          </div>
        `;
      }

      $('#equippedList').innerHTML = equipped.length
        ? equipped.map(it => itemHtml(it, items.indexOf(it))).join('')
        : `<div class="mini">Nothing equipped.</div>`;

      $('#itemsList').innerHTML = unequipped.length
        ? unequipped.map(it => itemHtml(it, items.indexOf(it))).join('')
        : `<div class="mini">Inventory is empty.</div>`;

      ['#equippedList','#itemsList'].forEach(sel => {
        const list = $(sel);

        list.querySelectorAll('[data-it-equip]').forEach(btn => btn.onclick = () => {
          items[toInt(btn.dataset.itEquip,-1)].equipped ^= true;
          render();
        });

        list.querySelectorAll('[data-it-lookup]').forEach(btn => btn.onclick = async () => {
          const i = toInt(btn.dataset.itLookup, -1);
          const it = items[i];
          btn.disabled = true;
          btn.textContent = '…';
          try {
            const result = await wikiLookupItem(it.name, it.type);
            it.notes = result;
            render();
          } catch (e) {
            toast(e.message || 'Lookup failed.');
            btn.disabled = false;
            btn.textContent = 'Lookup';
          }
        });

        list.querySelectorAll('[data-it-inc]').forEach(btn => btn.onclick = () => {
          const it = items[toInt(btn.dataset.itInc,-1)];
          it.qty = clamp(toInt(it.qty,0) + 1, 0, 999);
          render();
        });

        list.querySelectorAll('[data-it-dec]').forEach(btn => btn.onclick = () => {
          const it = items[toInt(btn.dataset.itDec,-1)];
          it.qty = clamp(toInt(it.qty,0) - 1, 0, 999);
          render();
        });

        list.querySelectorAll('[data-it-notes]').forEach(btn => btn.onclick = () => {
          const it = items[toInt(btn.dataset.itNotes,-1)];
          const n = prompt('Notes:', it.notes ?? '');
          if (n == null) return;
          it.notes = n;
          render();
        });

        list.querySelectorAll('[data-it-del]').forEach(btn => btn.onclick = () => {
          items.splice(toInt(btn.dataset.itDel,-1), 1);
          render();
        });
      });
    }
  }

  function renderCamp(c){
    const hd = c.hit_dice || { die: 'd8', total: c.level || 1, used: 0 };
    const hdUsed = toInt(hd.used, 0);
    const hdTotal = toInt(hd.total, 1);
    const hdAvail = Math.max(0, hdTotal - hdUsed);

    $('#contentCard').innerHTML = `
      <h2>Camp</h2>

      <div class="col" style="gap:10px; max-width:420px; margin-bottom:28px;">
        <div class="mini">Take a rest to recover HP, spell slots, and resources.</div>
        <div class="row" style="gap:12px;">
          <button class="btn" id="btnLongRest" style="flex:1; padding:14px 0; font-size:1.05em;">&#x1F319; Long Rest</button>
          <button class="btn" id="btnShortRest" style="flex:1; padding:14px 0; font-size:1.05em;">&#x26FA; Short Rest</button>
        </div>
        <div class="mini muted">Short rest: recovers short-rest resources. Long rest: restores HP, spell slots, all resources, and all hit dice.</div>
      </div>

      <h2>Hit Dice</h2>
      <div class="col" style="gap:10px; max-width:420px; margin-bottom:28px;">
        <div class="grid2" style="align-items:end;">
          ${selectField('Die Type','hit_dice.die', hd.die || 'd8', ['d4','d6','d8','d10','d12','d20'])}
          ${numField('Total','hit_dice.total', hdTotal, 1)}
        </div>
        <div class="row" style="gap:8px; align-items:center;">
          <span class="pill" style="font-size:1em;">${hdAvail} / ${hdTotal} available</span>
          <button class="btn" id="btnSpendHd" ${hdAvail < 1 ? 'disabled' : ''}>Spend 1</button>
        </div>
      </div>

      <h2>Camp Notes</h2>
      <div style="margin-top:8px; max-width:660px;">
        ${textAreaField('Camp Notes','camp_notes', c.camp_notes || '')}
      </div>
    `;

    $('#btnLongRest').onclick = () => { if (confirm('Take a Long Rest? This will restore HP, spell slots, and all resources.')) doRest('long'); };
    $('#btnShortRest').onclick = () => doRest('short');
    $('#btnSpendHd').onclick = () => {
      c.hit_dice = c.hit_dice || { die: 'd8', total: c.level || 1, used: 0 };
      c.hit_dice.used = Math.min(toInt(c.hit_dice.used, 0) + 1, toInt(c.hit_dice.total, 1));
      render();
    };

    wireNumberFields('#contentCard');
    wireSelectFields('#contentCard');
    wireTextAreaFields('#contentCard');

    // hit_dice.total change must re-render to update the available counter
    const hdTotalInp = document.querySelector('[data-num="hit_dice.total"]');
    if (hdTotalInp) hdTotalInp.oninput = () => {
      const minVal = hdTotalInp.min !== '' ? toInt(hdTotalInp.min, null) : null;
      let v = toInt(hdTotalInp.value, 0);
      if (minVal != null && v < minVal) { v = minVal; hdTotalInp.value = v; }
      const c = state.character;
      c.hit_dice = c.hit_dice || {};
      c.hit_dice.total = v;
      // clamp used so it never exceeds the new total
      c.hit_dice.used = clamp(toInt(c.hit_dice.used, 0), 0, v);
      state = normalize(state);
      render();
    };
  }

  // --- Field templates & wiring ---
  function textField(label, path, value){
    return `
      <label class="col" style="gap:6px;">
        <div class="mini">${escapeHtml(label)}</div>
        <input type="text" data-text="${escapeHtml(path)}" value="${escapeAttr(String(value ?? ''))}" />
      </label>
    `;
  }

  function numField(label, path, value, min){
    return `
      <label class="col" style="gap:6px;">
        <div class="mini">${escapeHtml(label)}</div>
        <input type="number" data-num="${escapeHtml(path)}" value="${escapeAttr(String(value ?? 0))}"${min != null ? ` min="${min}"` : ''} />
      </label>
    `;
  }

  function selectField(label, path, value, options){
    return `
      <label class="col" style="gap:6px;">
        <div class="mini">${escapeHtml(label)}</div>
        <select data-sel="${escapeHtml(path)}">
          ${options.map(o => `<option value="${escapeAttr(o)}" ${o===value?'selected':''}>${escapeHtml(o)}</option>`).join('')}
        </select>
      </label>
    `;
  }

  function textAreaField(label, path, value){
    return `
      <label class="col" style="gap:6px;">
        <div class="mini">${escapeHtml(label)}</div>
        <textarea data-area="${escapeHtml(path)}">${escapeHtml(String(value ?? ''))}</textarea>
      </label>
    `;
  }

  function wireTextFields(rootSel){
    const root = document.querySelector(rootSel);
    root.querySelectorAll('[data-text]').forEach(inp => {
      inp.oninput = () => {
        setPath(state.character, inp.dataset.text, inp.value);
        renderHeader();
      };
    });
  }

  function wireNumberFields(rootSel){
    const root = document.querySelector(rootSel);
    root.querySelectorAll('[data-num]').forEach(inp => {
      inp.oninput = () => {
        const path = inp.dataset.num;
        const minVal = inp.min !== '' ? toInt(inp.min, null) : null;
        let v = toInt(inp.value, 0);
        if (minVal != null && v < minVal) { v = minVal; inp.value = v; }
        setPath(state.character, path, v);
        state = normalize(state);
        renderHeader();
      };
    });
  }

  function wireTextAreaFields(rootSel){
    const root = document.querySelector(rootSel);
    root.querySelectorAll('[data-area]').forEach(area => {
      area.oninput = () => {
        setPath(state.character, area.dataset.area, area.value);
      };
    });
  }

  function wireSelectFields(rootSel){
    const root = document.querySelector(rootSel);
    root.querySelectorAll('[data-sel]').forEach(sel => {
      sel.onchange = () => {
        setPath(state.character, sel.dataset.sel, sel.value);
      };
    });
  }

  function setPath(obj, dotted, value){
    const parts = String(dotted).split('.');
    let cur = obj;
    for (let i=0; i<parts.length-1; i++) {
      const p = parts[i];
      if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = {};
      cur = cur[p];
    }
    cur[parts[parts.length-1]] = value;
  }

  // --- Actions ---
  function applyHpDelta(delta){
    const c = state.character;
    const max = toInt(c.hp.max, 1);
    if (delta < 0) {
      // Damage: absorb into temp HP first
      const temp = toInt(c.hp.temp, 0);
      const absorbed = Math.min(temp, -delta);
      c.hp.temp = temp - absorbed;
      const remaining = -delta - absorbed;
      c.hp.current = clamp(toInt(c.hp.current, 0) - remaining, 0, max);
    } else {
      // Healing: never raises above max, never affects temp
      c.hp.current = clamp(toInt(c.hp.current, 0) + delta, 0, max);
    }
    render();
  }

  function setTempHp(temp){
    const c = state.character;
    c.hp.temp = clamp(toInt(temp, 0), 0, 999);
    render();
  }

  function doRest(kind){
    const c = state.character;
    if (kind === 'long') {
      c.hp.current = toInt(c.hp.max, 1);
      c.hp.temp = 0;
      // reset hit dice
      if (c.hit_dice) c.hit_dice.used = 0;
      // reset spell slots
      if (c.spellcasting?.spell_slots) {
        c.spellcasting.spell_slots.forEach(s => { s.used = 0; });
      }
    }

    // reset resources/features based on reset flag
    (c.resources || []).forEach(r => {
      const reset = String(r.reset || 'none').toLowerCase();
      if (kind === 'short' && reset === 'short') r.used = 0;
      if (kind === 'long' && (reset === 'short' || reset === 'long')) r.used = 0;
    });
    (c.features || []).forEach(f => {
      if (f.uses_max == null) return;
      const reset = String(f.reset || 'none').toLowerCase();
      if (kind === 'short' && reset === 'short') f.uses_used = 0;
      if (kind === 'long' && (reset === 'short' || reset === 'long')) f.uses_used = 0;
    });

    render();
  }

  // --- Escaping ---
  function escapeHtml(str){
    return String(str)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }
  function escapeAttr(str){
    return escapeHtml(str).replace(/\n/g,'&#10;');
  }

  function signed(n){
    const v = toInt(n, 0);
    return (v >= 0 ? '+' : '') + v;
  }

  // --- Sidebar actions ---
  $('#btnMainMenu').onclick = () => returnToMenu();

  // Crockford base32: digits + uppercase minus I, L, O, U — easy to read/type
  const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const B32_DEC = Object.fromEntries([...B32].map((c,i) => [c,i]));
  // Common look-alike substitutions
  Object.assign(B32_DEC, { I:1, L:1, O:0, U:27 });

  function uint8ToBase32(bytes) {
    let bits = 0, val = 0, out = '';
    for (let i = 0; i < bytes.length; i++) {
      val = (val << 8) | bytes[i]; bits += 8;
      while (bits >= 5) { bits -= 5; out += B32[(val >> bits) & 31]; }
    }
    if (bits > 0) out += B32[(val << (5 - bits)) & 31];
    return out.match(/.{1,6}/g).join('-');
  }

  function base32ToUint8(str) {
    const clean = str.replace(/-/g,'').toUpperCase();
    let bits = 0, val = 0; const out = [];
    for (const c of clean) {
      if (!(c in B32_DEC)) throw new Error('Bad char: ' + c);
      val = (val << 5) | B32_DEC[c]; bits += 5;
      if (bits >= 8) { bits -= 8; out.push((val >> bits) & 255); }
    }
    return new Uint8Array(out);
  }

  async function charToCode(charState) {
    const bytes = new TextEncoder().encode(JSON.stringify(charState));
    const cs = new CompressionStream('deflate-raw');
    const w = cs.writable.getWriter();
    w.write(bytes); w.close();
    const chunks = [];
    const reader = cs.readable.getReader();
    while (true) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
    let len = 0; chunks.forEach(c => len += c.length);
    const merged = new Uint8Array(len); let off = 0;
    chunks.forEach(c => { merged.set(c, off); off += c.length; });
    return uint8ToBase32(merged);
  }

  async function codeToChar(code) {
    const trimmed = code.trim();
    let bytes;
    // Detect legacy base64url (contains lowercase or underscore)
    if (/[a-z_]/.test(trimmed)) {
      const b64 = trimmed.replace(/-/g,'+').replace(/_/g,'/');
      const padded = b64 + '=='.slice(0, (4 - b64.length % 4) % 4);
      const bin = atob(padded);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      bytes = base32ToUint8(trimmed);
    }
    const ds = new DecompressionStream('deflate-raw');
    const w = ds.writable.getWriter();
    w.write(bytes); w.close();
    const chunks = [];
    const reader = ds.readable.getReader();
    while (true) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
    let len = 0; chunks.forEach(c => len += c.length);
    const merged = new Uint8Array(len); let off = 0;
    chunks.forEach(c => { merged.set(c, off); off += c.length; });
    return JSON.parse(new TextDecoder().decode(merged));
  }

  $('#btnGetCode').onclick = async () => {
    try {
      const code = await charToCode(state);
      $('#codeOutput').value = code;
      $('#codeOutputBox').style.display = 'block';
      toast('Code generated!');
    } catch (e) {
      toast('Failed to generate code: ' + e.message);
    }
  };

  $('#btnCopyCode').onclick = () => {
    const code = $('#codeOutput').value;
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => toast('Code copied!'), () => {
      $('#codeOutput').select();
      document.execCommand('copy');
      toast('Code copied!');
    });
  };

  $('#btnLoadCode').onclick = async () => {
    const code = ($('#codeImportText').value || '').trim();
    if (!code) { toast('Paste a share code first.'); return; }
    try {
      const loaded = await codeToChar(code);
      state = normalize(loaded);
      currentSaveName = state.character.name || 'Unnamed';
      saveToLocalStorage();
      activeTab = 'overview';
      menuOpen = false;
      render();
      toast('Character loaded from code!');
    } catch (e) {
      toast('Invalid code — could not load character.');
    }
  };

  $('#btnWipe').onclick = () => {
    if (!confirm('Wipe local save for this character? This does not affect downloaded files.')) return;
    const name = state.character.name || 'Unnamed';
    deleteChar(name);
    currentSaveName = null;
    toast('Local save wiped.');
  };

  // --- Boot ---
  // Run migration (legacy v1 → multi-char) immediately on load
  loadAllChars();
  state = normalize(state);
  showLanding();

})();
