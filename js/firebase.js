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


let fbUser = null;           // current Firebase authenticated user
// Maps character name → JSON string of last cloud-synced state (for drift detection)
const cloudSyncedData = new Map();

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
      <div style="display:flex;flex-direction:column;gap:8px;padding:12px 0 0;border-top:1px solid var(--line);margin-top:4px;">
        <div style="display:flex;align-items:center;gap:8px;justify-content:center;">
          ${fbUser.photoURL ? `<img src="${escapeAttr(fbUser.photoURL)}" style="width:28px;height:28px;border-radius:50%;" referrerpolicy="no-referrer">` : ''}
          <span class="mini" style="color:var(--text);">${escapeHtml(fbUser.displayName || fbUser.email || 'Signed in')}</span>
          <button class="btn" id="btnSignOut" style="padding:4px 10px;font-size:12px;">Sign out</button>
        </div>
        <button class="btn landing-btn" id="btnSyncCloud" style="width:100%;">&#x2601; Save All to Cloud</button>
      </div>`;
    document.getElementById('btnSignOut').onclick = () => fbAuth.signOut();
    document.getElementById('btnSyncCloud').onclick = async () => {
      const btn = document.getElementById('btnSyncCloud');
      btn.textContent = '☁ Syncing…';
      btn.disabled = true;
      try {
        const chars = loadAllChars();
        await Promise.all(Object.values(chars).map(c => saveCharToCloud(c, null)));
        btn.textContent = '☁ Saved ✓';
        if (document.getElementById('landingCharPicker').style.display !== 'none') showCharPicker();
      } catch { btn.textContent = '☁ Failed'; }
      setTimeout(() => { btn.textContent = '☁ Save All to Cloud'; btn.disabled = false; }, 2000);
    };
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
    snap.forEach(d => {
      const s = d.data().state;
      if (s) { chars[d.id] = s; cloudSyncedData.set(d.id, JSON.stringify(s)); }
    });
    localStorage.setItem(CHARS_KEY, JSON.stringify(chars));
  } catch (e) { console.warn('Cloud pull failed:', e); }
}

async function saveCharToCloud(charState, oldName) {
  if (!fbUser) return;
  try {
    const name = charState.character.name || 'Unnamed';
    const col = fbDb.collection('users').doc(fbUser.uid).collection('characters');
    await col.doc(name).set({ state: charState, updatedAt: new Date().toISOString() });
    cloudSyncedData.set(name, JSON.stringify(charState));
    if (oldName && oldName !== name) { await col.doc(oldName).delete(); cloudSyncedData.delete(oldName); }
    // Refresh save button if app is open
    const b = document.getElementById('btnSaveLocal');
    if (b) b.innerHTML = saveBtnLabel();
  } catch (e) { console.warn('Cloud save failed:', e); }
}

async function deleteCharFromCloud(name) {
  if (!fbUser) return;
  try {
    await fbDb.collection('users').doc(fbUser.uid).collection('characters').doc(name).delete();
    cloudSyncedData.delete(name);
  } catch (e) { console.warn('Cloud delete failed:', e); }
}
