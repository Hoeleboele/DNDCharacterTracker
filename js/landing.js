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

  const hostBtn = document.getElementById('btnHost');
  const savedRoom = (function(){ try { return localStorage.getItem('mpLastRoomCode') || localStorage.getItem('mpRoomCode'); } catch(_) { return null; } })();

  // Ensure host button always starts a fresh host session
  hostBtn.textContent = 'Host a Game';
  hostBtn.onclick = startHost;

  // Create or update a separate Reconnect button (placed to the right)
  let reconnectBtn = document.getElementById('btnReconnect');
  if (!reconnectBtn) {
    reconnectBtn = document.createElement('button');
    reconnectBtn.className = 'btn landing-btn';
    reconnectBtn.id = 'btnReconnect';
    reconnectBtn.style.marginLeft = 'auto';
    document.getElementById('landingMainBtns').appendChild(reconnectBtn);
  }
  if (savedRoom) {
    reconnectBtn.style.display = '';
    reconnectBtn.textContent = '↻ Reconnect';
    reconnectBtn.onclick = () => {
      if (typeof mpTryHost === 'function') {
        mpTryHost(savedRoom, false);
      } else {
        startHost();
      }
    };
  } else {
    reconnectBtn.style.display = 'none';
  }
  document.getElementById('btnChooseChar').onclick = () => showCharPicker();
  updateAuthBar();

  if (appSettings.showTutorial) showTutorial();
}


function charCloudBadge(name, charState) {
  if (!fbUser) return '';
  const inSync = cloudSyncedData.has(name) && cloudSyncedData.get(name) === JSON.stringify(charState);
  const notInCloud = !cloudSyncedData.has(name);
  const color = inSync ? 'var(--accent)' : 'var(--muted)';
  const tip   = inSync    ? 'In sync with cloud'
              : notInCloud ? 'Not saved to cloud'
              :              'Local changes \u2014 not yet saved to cloud';
  const icon  = inSync ? '\u2601' : '\u25cb';
  return ` <span style="font-size:11px;color:${color};" title="${tip}">${icon}</span>`;
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
            <button class="btn landing-btn" data-charname="${escapeAttr(n)}" style="flex:1; text-align:left;">${escapeHtml(n)}${charCloudBadge(n, chars[n])}</button>
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
    if (Object.keys(existing).length >= 3) {
      errEl.textContent = 'Character limit reached (3 max). Delete a character to create a new one.';
      errEl.style.display = 'block';
      return;
    }
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
      const existing = loadAllChars();
      const loadedName = normalize(loaded).character.name || 'Unnamed';
      if (!existing[loadedName] && Object.keys(existing).length >= 3) {
        errEl.textContent = 'Character limit reached (3 max). Delete a character to load a new one.';
        errEl.style.display = 'block';
        return;
      }
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
    const savedRoom = (function(){ try { return localStorage.getItem('mpLastRoomCode') || localStorage.getItem('mpRoomCode'); } catch(_) { return null; } })();
    const mpInput = document.getElementById('mpCodeInput');
    if (savedRoom) mpInput.value = savedRoom.toUpperCase();
    mpInput.focus();
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
  tutorialSeenTabs = new Set();
  document.getElementById('landingOverlay').style.display = 'none';
  document.querySelector('.app').style.display = '';
  startAutosave();
  render();
  if (appSettings.showAppTutorial) setTimeout(() => showTutorial('app'), 300);
}


function returnToMenu(){
  const ov = document.getElementById('tabDrawerOverlay');
  if (ov) ov.remove();
  const notch = document.getElementById('tabTitleNotch');
  if (notch) notch.remove();
  tabDrawerOpen = false;
  if (gameMode !== 'host') {
    saveToLocalStorage(); // save locally before leaving
    if (appSettings.cloudSaveOnExit && (gameMode === 'solo' || gameMode === 'player')) {
      saveCharToCloud(state, null); // fire-and-forget cloud sync
    }
  }
  stopAutosave();
  if (mpPeer) { try { mpPeer.destroy(); } catch(_){} mpPeer = null; }
  mpHostConn = null;
  mpPlayerConns = {};
  mpExpandedPlayers = new Set();
  mpRoomCode = '';
  try { localStorage.removeItem('mpRoomCode'); } catch(_) {}
  gameMode = null;
  document.getElementById('hostView').style.display = 'none';
  document.querySelector('.app').style.display = 'none';
  showLanding();
}