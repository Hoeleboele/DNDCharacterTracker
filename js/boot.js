// --- Sidebar actions ---
$('#btnMainMenu').onclick = () => returnToMenu();

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
// Global handler for field star buttons
document.addEventListener('click', e => {
  const btn = e.target.closest('.field-star-btn');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const key = btn.dataset.starKey;
  const label = btn.dataset.starLabel;
  const idx = starredFields.findIndex(f => f.key === key);
  if (idx >= 0) starredFields.splice(idx, 1);
  else starredFields.push({ key, label });
  saveStarredFields(starredFields);
  // Refresh just the star icon without full re-render
  const isNowStarred = starredFields.some(f => f.key === key);
  btn.textContent = isNowStarred ? '★' : '☆';
  btn.style.color = isNowStarred ? 'var(--warn)' : 'var(--muted)';
  btn.title = isNowStarred ? 'Remove from overview' : 'Add to overview';
});

// Run migration (legacy v1 → multi-char) immediately on load
loadAllChars();
state = normalize(state);
showLanding();