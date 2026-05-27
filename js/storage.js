let autosaveInterval = null;

function saveBtnLabel() {
  return 'Save' + charCloudBadge(state.character?.name, state);
}

function flashSaveBtn(msg, duration) {
  const btn = document.getElementById('btnSaveLocal');
  if (!btn) return;
  btn.innerHTML = msg;
  clearTimeout(flashSaveBtn._t);
  if (duration > 0) flashSaveBtn._t = setTimeout(() => {
    const b = document.getElementById('btnSaveLocal');
    if (b) b.innerHTML = saveBtnLabel();
  }, duration);
}

function saveToLocalStorage(){
  return saveChar(state);
}

function startAutosave(){
  stopAutosave();
  if (!appSettings.autosaveMs) return; // autosave disabled
  autosaveInterval = setInterval(() => {
    flashSaveBtn('Saving…', 0);
    const ok = saveToLocalStorage();
    flashSaveBtn(ok ? 'Saved ✓' : 'Save failed', 2000);
  }, appSettings.autosaveMs);
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

function saveFavTabs() {
  try { localStorage.setItem(FAV_TABS_KEY, JSON.stringify(favTabs)); } catch(_){}
}