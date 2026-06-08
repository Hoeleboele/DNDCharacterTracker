function noteSortValue(note) {
  const raw = (note && (note.updated_at || note.created_at)) || '';
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? ts : 0;
}

function getSortedNotes(c) {
  const notes = Array.isArray(c.notes) ? c.notes.slice() : [];
  const mode = (appSettings && appSettings.notesSort) || 'newest';
  if (mode === 'oldest') {
    return notes.sort((a, b) => noteSortValue(a) - noteSortValue(b));
  }
  if (mode === 'alpha') {
    return notes.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' }));
  }
  return notes.sort((a, b) => noteSortValue(b) - noteSortValue(a));
}

function openNoteModal(opts) {
  const note = opts.note || {};
  const isNew = !!opts.isNew;
  let isReadonly = !!note.readonly;

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.55); display:flex; align-items:center; justify-content:center; z-index:1000;';

  const card = document.createElement('div');
  card.className = 'card';
  card.style.cssText = 'width:min(720px, calc(100vw - 24px)); max-height:80vh; overflow:auto; display:flex; flex-direction:column; gap:10px;';
  card.innerHTML = `
    <h2 style="margin:0;">${isNew ? 'New Note' : 'Note'}</h2>

    <label class="mini" style="font-weight:600;">Title</label>
    <input data-note-title type="text" value="${escapeAttr(note.title || '')}" placeholder="Enter note title" style="padding:8px; font-size:13px;" />

    <label class="mini" style="font-weight:600;">Notes</label>
    <textarea data-note-body placeholder="Write your note" style="min-height:180px; padding:8px; font-size:13px; resize:vertical;">${escapeHtml(note.body || '')}</textarea>

    <div class="row" style="justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:center; margin-top:4px;">
      <button class="btn" data-note-readonly-toggle></button>
      <div class="row" style="gap:8px;">
        ${!isNew ? '<button class="btn" data-note-delete>Delete</button>' : ''}
        <button class="btn" data-note-cancel>Cancel</button>
        <button class="btn" data-note-save>Save</button>
      </div>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const titleInput = card.querySelector('[data-note-title]');
  const bodyInput = card.querySelector('[data-note-body]');
  const toggleBtn = card.querySelector('[data-note-readonly-toggle]');
  const saveBtn = card.querySelector('[data-note-save]');

  function syncReadonlyUi() {
    if (toggleBtn) {
      toggleBtn.textContent = isReadonly ? 'Read only: On' : 'Read only: Off';
    }
    if (titleInput) titleInput.disabled = isReadonly;
    if (bodyInput) bodyInput.disabled = isReadonly;
    if (saveBtn) {
      saveBtn.textContent = isReadonly ? 'Save Read Only State' : 'Save';
    }
  }

  function close() {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  document.addEventListener('keydown', onKey);

  card.querySelector('[data-note-cancel]').onclick = close;
  if (toggleBtn) {
    toggleBtn.onclick = () => {
      isReadonly = !isReadonly;
      syncReadonlyUi();
    };
  }

  const del = card.querySelector('[data-note-delete]');
  if (del) {
    del.onclick = () => {
      try {
        opts.onDelete && opts.onDelete();
      } catch (_) {}
      close();
    };
  }

  saveBtn.onclick = () => {
    const title = String(titleInput.value || '').trim();
    if (!title) {
      alert('Title is required.');
      titleInput.focus();
      return;
    }
    const body = String(bodyInput.value || '');
    try {
      opts.onSave && opts.onSave({ title, body, readonly: isReadonly });
    } catch (_) {}
    close();
  };

  syncReadonlyUi();
  setTimeout(() => {
    if (titleInput && !isReadonly) titleInput.focus();
  }, 0);
}

function renderNotes(c) {
  if (!Array.isArray(c.notes)) c.notes = [];

  const sorted = getSortedNotes(c);
  const noteRows = sorted.length
    ? sorted.map((note) => {
        const title = note.title || 'Untitled Note';
        const id = note.id || '';
        const preview = String(note.body || '').trim();
        const previewText = preview.length > 120 ? preview.slice(0, 120) + '...' : preview;
        return `
          <div class="item" style="display:grid; gap:8px;">
            <div class="row" style="justify-content:space-between; gap:8px; flex-wrap:wrap; align-items:center;">
              <button class="btn" data-note-open="${escapeAttr(id)}">${escapeHtml(title)}</button>
              <div class="row" style="gap:6px;">
                <button class="btn" data-note-readonly="${escapeAttr(id)}">${note.readonly ? 'Read only: On' : 'Read only: Off'}</button>
                <button class="btn" data-note-delete="${escapeAttr(id)}">Delete</button>
              </div>
            </div>
            ${previewText ? `<div class="mini" style="white-space:pre-wrap;">${escapeHtml(previewText)}</div>` : '<div class="mini muted">No content.</div>'}
          </div>
        `;
      }).join('')
    : '<div class="mini" style="padding:8px 0;">No notes yet. Add one to get started.</div>';

  $('#contentCard').innerHTML = `
    <h2>Notes</h2>
    <div class="mini" style="margin-bottom:12px;">Keep a list of notes with safe read-only mode. ${gameMode === 'player' ? '<b>Your DM can view these notes.</b>' : ''}</div>

    <div class="row" style="justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
      <button class="btn" id="btnAddNote">+ Add Note</button>
      <label class="row" style="gap:8px; align-items:center;">
        <span class="mini">Sort</span>
        <select id="noteSort" style="padding:7px 10px; border-radius:10px; border:1px solid var(--line); background:var(--card); color:var(--text);">
          <option value="newest" ${(appSettings.notesSort || 'newest') === 'newest' ? 'selected' : ''}>Newest first</option>
          <option value="oldest" ${appSettings.notesSort === 'oldest' ? 'selected' : ''}>Oldest first</option>
          <option value="alpha" ${appSettings.notesSort === 'alpha' ? 'selected' : ''}>Alphabetical</option>
        </select>
      </label>
    </div>

    <div class="list" id="notesList">${noteRows}</div>
  `;

  const sortSel = document.getElementById('noteSort');
  if (sortSel) {
    sortSel.onchange = () => {
      appSettings.notesSort = sortSel.value || 'newest';
      saveAppSettings();
      renderNotes(c);
    };
  }

  function byId(id) {
    return (Array.isArray(c.notes) ? c.notes : []).find(n => String(n.id) === String(id));
  }

  function updateNote(id, updates) {
    const idx = (Array.isArray(c.notes) ? c.notes : []).findIndex(n => String(n.id) === String(id));
    if (idx < 0) return;
    const existing = c.notes[idx] || {};
    c.notes[idx] = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString()
    };
    render();
  }

  document.getElementById('btnAddNote').onclick = () => {
    openNoteModal({
      isNew: true,
      note: { title: '', body: '', readonly: false },
      onSave: (payload) => {
        const nowIso = new Date().toISOString();
        c.notes.push({
          id: 'note-' + Math.random().toString(16).slice(2),
          title: payload.title,
          body: payload.body,
          readonly: !!payload.readonly,
          created_at: nowIso,
          updated_at: nowIso
        });
        render();
      }
    });
  };

  const list = document.getElementById('notesList');
  if (!list) return;

  list.querySelectorAll('[data-note-open]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.noteOpen;
      const note = byId(id);
      if (!note) return;
      openNoteModal({
        note,
        onSave: (payload) => {
          updateNote(id, {
            title: payload.title,
            body: payload.body,
            readonly: !!payload.readonly
          });
        },
        onDelete: () => {
          c.notes = c.notes.filter(n => String(n.id) !== String(id));
          render();
        }
      });
    };
  });

  list.querySelectorAll('[data-note-delete]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.noteDelete;
      c.notes = c.notes.filter(n => String(n.id) !== String(id));
      render();
    };
  });

  list.querySelectorAll('[data-note-readonly]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.noteReadonly;
      const note = byId(id);
      if (!note) return;
      updateNote(id, { readonly: !note.readonly });
    };
  });
}
