let editingResourceIndex = null;
let editingFeatureIndex = null;

function openNameNotesModal(opts){
  // opts: { title, name, notes, confirmText, onConfirm }
  const title = opts.title || 'Edit';
  const nameVal = opts.name || '';
  const notesVal = opts.notes || '';
  const confirmText = opts.confirmText || 'Save';

  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.background = 'rgba(0,0,0,0.45)';
  overlay.style.zIndex = '9999';

  const dlg = document.createElement('div');
  dlg.className = 'card';
  dlg.style.width = '520px';
  dlg.style.maxWidth = '94%';
  dlg.style.boxSizing = 'border-box';
  dlg.style.padding = '12px 14px';

  dlg.innerHTML = `
    <h3 style="margin:0 0 8px 0;">${escapeHtml(title)}</h3>
    <div style="display:flex;flex-direction:column;gap:8px;">
      <input data-modal-name style="padding:8px; font-size:14px;" placeholder="Name" value="${escapeHtml(nameVal)}" />
      <textarea data-modal-notes style="min-height:120px; padding:8px; font-size:13px;" placeholder="Notes">${escapeHtml(notesVal)}</textarea>
      <div style="display:flex; justify-content:flex-end; gap:8px;">
        <button class="btn" data-modal-cancel>Cancel</button>
        <button class="btn primary" data-modal-save>${escapeHtml(confirmText)}</button>
      </div>
    </div>
  `;

  overlay.appendChild(dlg);
  document.body.appendChild(overlay);

  const nameInp = dlg.querySelector('[data-modal-name]');
  const notesTxt = dlg.querySelector('[data-modal-notes]');
  const saveBtn = dlg.querySelector('[data-modal-save]');
  const cancelBtn = dlg.querySelector('[data-modal-cancel]');

  function close(){
    try{ document.body.removeChild(overlay); }catch(e){}
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e){
    if (e.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKey);

  saveBtn.onclick = () => {
    const n = nameInp.value.trim();
    const ns = notesTxt.value;
    if (!n) {
      nameInp.focus();
      return;
    }
    try{ opts.onConfirm && opts.onConfirm({ name: n, notes: ns }); }catch(e){}
    close();
  };
  cancelBtn.onclick = () => close();

  setTimeout(() => nameInp.focus(), 10);
}

function renderFeatures(c){
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
    openNameNotesModal({
      title: 'New Resource',
      name: '',
      notes: '',
      confirmText: 'Add',
      onConfirm: ({name, notes}) => {
        c.resources.push({ name: name, max:1, used:0, reset:'short', notes: notes || '', is_action:false });
        saveToLocalStorage();
        render();
      }
    });
  };
  $('#btnAddFeature').onclick = () => {
    c.features = c.features || [];
    openNameNotesModal({
      title: 'New Feature',
      name: '',
      notes: '',
      confirmText: 'Add',
      onConfirm: ({name, notes}) => {
        c.features.push({ name: name, description: notes || '', uses_max:null, uses_used:null, reset:'none', is_action:false });
        saveToLocalStorage();
        render();
      }
    });
  };

  function renderResourcesList(){
    const list = $('#resourcesList');
    const r = c.resources || [];
    list.innerHTML = r.length ? r.map((x,i) => {
      if (editingResourceIndex === i) {
        return `
      <div class="item">
        <div style="flex:1">
          <input data-res-name-input="${i}" placeholder="Name" value="${escapeHtml(x.name || '')}" style="width:100%; padding:6px;" />
          <textarea data-res-notes="${i}" placeholder="Notes" style="width:100%; margin-top:6px; padding:6px;">${escapeHtml(x.notes || '')}</textarea>
        </div>
        <div class="col" style="min-width:160px;">
          <div class="row" style="justify-content:flex-end;">
            <button class="btn" data-res-done="${i}">Done</button>
            <button class="btn" data-res-cancel="${i}">Cancel</button>
            <button class="btn danger" data-res-del="${i}">Delete</button>
          </div>
        </div>
      </div>
      `;
      }
      return `
      <div class="item">
        <div>
          <div class="row" style="justify-content:space-between; align-items:center; gap:6px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <b>${escapeHtml(x.name || 'Resource')}</b>
              ${x.is_action ? `<span class="pill">Action</span>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <label style="font-size:12px; display:flex; align-items:center; gap:6px; cursor:pointer;">
                <input type="checkbox" data-res-action="${i}" ${x.is_action ? 'checked' : ''} />
                Action
              </label>
              <select class="reset-sel" data-res-reset="${i}" style="font-size:12px; padding:2px 6px; border-radius:6px; background:var(--btn); color:var(--text); border:1px solid var(--line); cursor:pointer;">
                <option value="short" ${(x.reset||'none')==='short'?'selected':''}>Short Rest</option>
                <option value="long" ${(x.reset||'none')==='long'?'selected':''}>Long Rest</option>
                <option value="none" ${(x.reset||'none')==='none'?'selected':''}>Never</option>
              </select>
            </div>
          </div>
          <div class="mini">${escapeHtml(x.notes || '')}</div>
        </div>
        <div class="col" style="min-width:160px;">
          <div class="row" style="justify-content:flex-end; gap:8px;">
            <button class="btn" data-res-use="${i}">Use</button>
            <button class="btn" data-res-refund="${i}">Refund</button>
            <button class="btn" data-res-edit-notes="${i}">Edit</button>
            <button class="btn danger" data-res-del="${i}">Delete</button>
          </div>
          <div class="row" style="justify-content:flex-end;">
            <span class="pill"><b>${toInt(x.used,0)}</b> / ${toInt(x.max,0)}</span>
          </div>
        </div>
      </div>
    `;
    }).join('') : `<div class="mini">No resources tracked.</div>`;

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
      if (editingResourceIndex === i) editingResourceIndex = null;
      render();
    });
    list.querySelectorAll('[data-res-edit-notes]').forEach(btn => btn.onclick = () => {
      const i = toInt(btn.dataset.resEditNotes, -1);
      const rr = c.resources[i];
      openNameNotesModal({
        title: 'Edit Resource',
        name: rr.name || '',
        notes: rr.notes || '',
        confirmText: 'Save',
        onConfirm: ({name, notes}) => {
          rr.name = name;
          rr.notes = notes;
          saveToLocalStorage();
          render();
        }
      });
    });
    list.querySelectorAll('[data-res-reset]').forEach(sel => sel.onchange = () => {
      const i = toInt(sel.dataset.resReset, -1);
      c.resources[i].reset = sel.value;
      saveToLocalStorage();
    });
    list.querySelectorAll('[data-res-action]').forEach(cb => cb.onchange = () => {
      const i = toInt(cb.dataset.resAction, -1);
      c.resources[i].is_action = !!cb.checked;
      saveToLocalStorage();
      render();
    });
    // editing handlers
    list.querySelectorAll('[data-res-name-input]').forEach(inp => {
      const i = toInt(inp.dataset.resNameInput, -1);
      inp.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const name = inp.value.trim();
          if (name) c.resources[i].name = name;
          editingResourceIndex = null;
          saveToLocalStorage();
          render();
        }
      };
    });
    list.querySelectorAll('[data-res-done]').forEach(btn => btn.onclick = () => {
      const i = toInt(btn.dataset.resDone, -1);
      const nameInp = list.querySelector('[data-res-name-input="' + i + '"]');
      const notesTxt = list.querySelector('[data-res-notes="' + i + '"]');
      if (nameInp) c.resources[i].name = nameInp.value;
      if (notesTxt) c.resources[i].notes = notesTxt.value;
      editingResourceIndex = null;
      saveToLocalStorage();
      render();
    });
    list.querySelectorAll('[data-res-cancel]').forEach(btn => btn.onclick = () => {
      const i = toInt(btn.dataset.resCancel, -1);
      if (!c.resources[i].name && !c.resources[i].notes) {
        c.resources.splice(i, 1);
      }
      editingResourceIndex = null;
      render();
    });
    list.querySelectorAll('[data-res-notes]').forEach(txt => {
      // notes are saved on Done
    });
  }

  function renderFeaturesList(){
    const list = $('#featuresList');
    const f = c.features || [];
    list.innerHTML = f.length ? f.map((x,i) => {
      if (editingFeatureIndex === i) {
        return `
      <div class="item">
        <div style="flex:1">
          <input data-feat-name-input="${i}" placeholder="Name" value="${escapeHtml(x.name || '')}" style="width:100%; padding:6px;" />
          <textarea data-feat-desc="${i}" placeholder="Description" style="width:100%; margin-top:6px; padding:6px;">${escapeHtml(x.description || '')}</textarea>
        </div>
        <div class="col" style="min-width:160px;">
          <div class="row" style="justify-content:flex-end;">
            <button class="btn" data-feat-done="${i}">Done</button>
            <button class="btn" data-feat-cancel="${i}">Cancel</button>
            <button class="btn danger" data-feat-del="${i}">Delete</button>
          </div>
        </div>
      </div>
      `;
      }
      return `
      <div class="item">
        <div>
          <div class="row" style="justify-content:space-between; align-items:center; gap:6px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <b>${escapeHtml(x.name || 'Feature')}</b>
              ${x.is_action ? `<span class="pill">Action</span>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <label style="font-size:12px; display:flex; align-items:center; gap:6px; cursor:pointer;">
                <input type="checkbox" data-feat-action="${i}" ${x.is_action ? 'checked' : ''} />
                Action
              </label>
              <select class="reset-sel" data-feat-reset="${i}" style="font-size:12px; padding:2px 6px; border-radius:6px; background:var(--btn); color:var(--text); border:1px solid var(--line); cursor:pointer;">
                <option value="short" ${(x.reset||'none')==='short'?'selected':''}>Short Rest</option>
                <option value="long" ${(x.reset||'none')==='long'?'selected':''}>Long Rest</option>
                <option value="none" ${(x.reset||'none')==='none'?'selected':''}>Never</option>
              </select>
            </div>
          </div>
          <div class="mini">${escapeHtml(x.description || '')}</div>
        </div>
        <div class="col" style="min-width:160px;">
          ${(x.uses_max != null) ? `
            <div class="row" style="justify-content:flex-end; gap:8px;">
              <button class="btn" data-feat-use="${i}">Use</button>
              <button class="btn" data-feat-refund="${i}">Refund</button>
              <button class="btn" data-feat-edit-notes="${i}">Edit</button>
              <button class="btn danger" data-feat-del="${i}">Delete</button>
            </div>
            <div class="row" style="justify-content:flex-end;">
              <span class="pill"><b>${toInt(x.uses_used,0)}</b> / ${toInt(x.uses_max,0)}</span>
            </div>
          ` : `
            <div class="row" style="justify-content:flex-end; gap:8px;">
              <button class="btn" data-feat-edit="${i}">Edit Uses</button>
              <button class="btn" data-feat-edit-notes="${i}">Edit</button>
              <button class="btn danger" data-feat-del="${i}">Delete</button>
            </div>
          `}
        </div>
      </div>
    `;
    }).join('') : `<div class="mini">No features listed.</div>`;

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
      if (editingFeatureIndex === i) editingFeatureIndex = null;
      render();
    });
    list.querySelectorAll('[data-feat-edit-notes]').forEach(btn => btn.onclick = () => {
      const i = toInt(btn.dataset.featEditNotes, -1);
      const ff = c.features[i];
      openNameNotesModal({
        title: 'Edit Feature',
        name: ff.name || '',
        notes: ff.description || '',
        confirmText: 'Save',
        onConfirm: ({name, notes}) => {
          ff.name = name;
          ff.description = notes;
          saveToLocalStorage();
          render();
        }
      });
    });
    list.querySelectorAll('[data-feat-reset]').forEach(sel => sel.onchange = () => {
      const i = toInt(sel.dataset.featReset, -1);
      c.features[i].reset = sel.value;
      saveToLocalStorage();
    });
    list.querySelectorAll('[data-feat-action]').forEach(cb => cb.onchange = () => {
      const i = toInt(cb.dataset.featAction, -1);
      c.features[i].is_action = !!cb.checked;
      saveToLocalStorage();
      render();
    });
    // editing handlers for features
    list.querySelectorAll('[data-feat-name-input]').forEach(inp => {
      const i = toInt(inp.dataset.featNameInput, -1);
      inp.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const name = inp.value.trim();
          if (name) c.features[i].name = name;
          editingFeatureIndex = null;
          saveToLocalStorage();
          render();
        }
      };
    });
    list.querySelectorAll('[data-feat-done]').forEach(btn => btn.onclick = () => {
      const i = toInt(btn.dataset.featDone, -1);
      const nameInp = list.querySelector('[data-feat-name-input="' + i + '"]');
      const descTxt = list.querySelector('[data-feat-desc="' + i + '"]');
      if (nameInp) c.features[i].name = nameInp.value;
      if (descTxt) c.features[i].description = descTxt.value;
      editingFeatureIndex = null;
      saveToLocalStorage();
      render();
    });
    list.querySelectorAll('[data-feat-cancel]').forEach(btn => btn.onclick = () => {
      const i = toInt(btn.dataset.featCancel, -1);
      if (!c.features[i].name && !c.features[i].description) {
        c.features.splice(i, 1);
      }
      editingFeatureIndex = null;
      render();
    });
    list.querySelectorAll('[data-feat-desc]').forEach(txt => {
      // description saved on Done
    });
  }
}
