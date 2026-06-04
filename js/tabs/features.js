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

function openResourceModal({ res, onSave, onDelete }) {
  const existing = document.getElementById('resourceModal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'resourceModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;';

  overlay.innerHTML = `
    <div class="card" style="width:100%;max-width:420px;padding:20px;display:flex;flex-direction:column;gap:14px;max-height:90vh;overflow-y:auto;">
      <h2 style="margin:0;">Edit Resource</h2>

      <label class="col" style="gap:4px;">
        <div class="mini" style="font-weight:600;">Name</div>
        <input id="rmName" type="text" value="${escapeAttr(res.name || '')}" style="width:100%;" />
      </label>

      <label class="col" style="gap:4px;">
        <div class="mini" style="font-weight:600;">Notes</div>
        <textarea id="rmNotes" style="width:100%;min-height:80px;padding:8px;font-size:13px;box-sizing:border-box;">${escapeHtml(res.notes || '')}</textarea>
      </label>

      <div class="grid2" style="gap:8px;">
        <label class="col" style="gap:4px;">
          <div class="mini" style="font-weight:600;">Uses Max</div>
          <input id="rmMax" type="number" min="0" max="99" value="${escapeAttr(String(res.max != null ? res.max : 1))}" style="width:100%;" />
        </label>
        <label class="col" style="gap:4px;">
          <div class="mini" style="font-weight:600;">Resets on</div>
          <select id="rmReset" style="width:100%;background:var(--btn);color:var(--text);border:1px solid var(--line);border-radius:var(--radius);padding:6px;">
            <option value="short" ${(res.reset||'none')==='short' ? 'selected' : ''}>Short Rest</option>
            <option value="long" ${(res.reset||'none')==='long' ? 'selected' : ''}>Long Rest</option>
            <option value="none" ${(res.reset||'none')==='none' ? 'selected' : ''}>Never</option>
          </select>
        </label>
      </div>

      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input id="rmIsAction" type="checkbox" ${res.is_action ? 'checked' : ''} />
        <span class="mini">Show as Action</span>
      </label>

      <div class="row" style="gap:8px;margin-top:4px;justify-content:space-between;">
        ${onDelete ? `<button class="btn danger" id="rmDelete">Delete</button>` : '<div></div>'}
        <div class="row" style="gap:8px;">
          <button class="btn" id="rmCancel">Cancel</button>
          <button class="btn good" id="rmSave">Save</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  function close() {
    const el = document.getElementById('resourceModal');
    if (el) el.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);

  document.getElementById('rmSave').onclick = () => {
    const name = document.getElementById('rmName').value.trim();
    if (!name) { document.getElementById('rmName').focus(); return; }
    res.name = name;
    res.notes = document.getElementById('rmNotes').value;
    res.max = clamp(toInt(document.getElementById('rmMax').value, 1), 0, 99);
    res.used = clamp(toInt(res.used, 0), 0, res.max);
    res.reset = document.getElementById('rmReset').value;
    res.is_action = document.getElementById('rmIsAction').checked;
    close();
    onSave && onSave();
  };

  document.getElementById('rmCancel').onclick = () => close();
  if (onDelete) {
    document.getElementById('rmDelete').onclick = () => { close(); onDelete(); };
  }

  setTimeout(() => document.getElementById('rmName') && document.getElementById('rmName').focus(), 10);
}

function openFeatureModal({ feat, onSave, onDelete }) {
  const existing = document.getElementById('featureModal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'featureModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;';

  const usesMaxVal = feat.uses_max != null ? String(feat.uses_max) : '';

  overlay.innerHTML = `
    <div class="card" style="width:100%;max-width:420px;padding:20px;display:flex;flex-direction:column;gap:14px;max-height:90vh;overflow-y:auto;">
      <h2 style="margin:0;">Edit Feature</h2>

      <label class="col" style="gap:4px;">
        <div class="mini" style="font-weight:600;">Name</div>
        <input id="fmName" type="text" value="${escapeAttr(feat.name || '')}" style="width:100%;" />
      </label>

      <label class="col" style="gap:4px;">
        <div class="mini" style="font-weight:600;">Description</div>
        <textarea id="fmDescription" style="width:100%;min-height:100px;padding:8px;font-size:13px;box-sizing:border-box;">${escapeHtml(feat.description || '')}</textarea>
      </label>

      <div class="grid2" style="gap:8px;">
        <label class="col" style="gap:4px;">
          <div class="mini" style="font-weight:600;">Uses Max</div>
          <input id="fmUsesMax" type="number" min="0" max="99" value="${escapeAttr(usesMaxVal)}" placeholder="(none)" style="width:100%;" />
        </label>
        <label class="col" style="gap:4px;">
          <div class="mini" style="font-weight:600;">Resets on</div>
          <select id="fmReset" style="width:100%;background:var(--btn);color:var(--text);border:1px solid var(--line);border-radius:var(--radius);padding:6px;">
            <option value="short" ${(feat.reset||'none')==='short' ? 'selected' : ''}>Short Rest</option>
            <option value="long" ${(feat.reset||'none')==='long' ? 'selected' : ''}>Long Rest</option>
            <option value="none" ${(feat.reset||'none')==='none' ? 'selected' : ''}>Never</option>
          </select>
        </label>
      </div>

      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input id="fmIsAction" type="checkbox" ${feat.is_action ? 'checked' : ''} />
        <span class="mini">Show as Action</span>
      </label>

      <div class="row" style="gap:8px;margin-top:4px;justify-content:space-between;">
        ${onDelete ? `<button class="btn danger" id="fmDelete">Delete</button>` : '<div></div>'}
        <div class="row" style="gap:8px;">
          <button class="btn" id="fmCancel">Cancel</button>
          <button class="btn good" id="fmSave">Save</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  function close() {
    const el = document.getElementById('featureModal');
    if (el) el.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);

  document.getElementById('fmSave').onclick = () => {
    const name = document.getElementById('fmName').value.trim();
    if (!name) { document.getElementById('fmName').focus(); return; }
    feat.name = name;
    feat.description = document.getElementById('fmDescription').value;
    const usesRaw = document.getElementById('fmUsesMax').value.trim();
    if (!usesRaw) {
      feat.uses_max = null;
      feat.uses_used = null;
    } else {
      feat.uses_max = clamp(toInt(usesRaw, 0), 0, 99);
      feat.uses_used = clamp(toInt(feat.uses_used, 0), 0, feat.uses_max);
    }
    feat.reset = document.getElementById('fmReset').value;
    feat.is_action = document.getElementById('fmIsAction').checked;
    close();
    onSave && onSave();
  };

  document.getElementById('fmCancel').onclick = () => close();
  if (onDelete) {
    document.getElementById('fmDelete').onclick = () => { close(); onDelete(); };
  }

  setTimeout(() => document.getElementById('fmName') && document.getElementById('fmName').focus(), 10);
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
    const newRes = { name: '', max: 1, used: 0, reset: 'short', notes: '', is_action: false };
    openResourceModal({
      res: newRes,
      onSave: () => {
        c.resources.push(newRes);
        saveToLocalStorage();
        render();
      }
    });
  };
  $('#btnAddFeature').onclick = () => {
    c.features = c.features || [];
    const newFeat = { name: '', description: '', uses_max: null, uses_used: null, reset: 'none', is_action: false };
    openFeatureModal({
      feat: newFeat,
      onSave: () => {
        c.features.push(newFeat);
        saveToLocalStorage();
        render();
      }
    });
  };

  function renderResourcesList(){
    const list = $('#resourcesList');
    const r = c.resources || [];
    list.innerHTML = r.length ? r.map((x,i) => `
      <div class="item">
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:8px;">
            <b>${escapeHtml(x.name || 'Resource')}</b>
            ${x.is_action ? `<span class="pill">Action</span>` : ''}
          </div>
          <div class="mini">${escapeHtml(x.notes || '')}</div>
        </div>
        <div class="col" style="min-width:120px;">
          <div class="row" style="justify-content:flex-end; gap:8px;">
            <button class="btn" data-res-use="${i}">Use</button>
            <button class="btn" data-res-refund="${i}">Refund</button>
            <button class="btn" data-res-edit="${i}">Edit</button>
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
    list.querySelectorAll('[data-res-edit]').forEach(btn => btn.onclick = () => {
      const i = toInt(btn.dataset.resEdit, -1);
      const rr = c.resources[i];
      openResourceModal({
        res: rr,
        onSave: () => { saveToLocalStorage(); render(); },
        onDelete: () => { c.resources.splice(i, 1); saveToLocalStorage(); render(); }
      });
    });
  }

  function renderFeaturesList(){
    const list = $('#featuresList');
    const f = c.features || [];
    list.innerHTML = f.length ? f.map((x,i) => `
      <div class="item">
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:8px;">
            <b>${escapeHtml(x.name || 'Feature')}</b>
            ${x.is_action ? `<span class="pill">Action</span>` : ''}
          </div>
          <div class="mini">${escapeHtml(x.description || '')}</div>
        </div>
        <div class="col" style="min-width:140px;">
          ${(x.uses_max != null) ? `
            <div class="row" style="justify-content:flex-end; gap:8px;">
              <button class="btn" data-feat-use="${i}">Use</button>
              <button class="btn" data-feat-refund="${i}">Refund</button>
              <button class="btn" data-feat-lookup="${i}">Lookup</button>
              <button class="btn" data-feat-edit="${i}">Edit</button>
            </div>
            <div class="row" style="justify-content:flex-end;">
              <span class="pill"><b>${toInt(x.uses_used,0)}</b> / ${toInt(x.uses_max,0)}</span>
            </div>
          ` : `
            <div class="row" style="justify-content:flex-end; gap:8px;">
              <button class="btn" data-feat-lookup="${i}">Lookup</button>
              <button class="btn" data-feat-edit="${i}">Edit</button>
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
      openFeatureModal({
        feat: ff,
        onSave: () => { saveToLocalStorage(); render(); },
        onDelete: () => { c.features.splice(i, 1); saveToLocalStorage(); render(); }
      });
    });
    list.querySelectorAll('[data-feat-lookup]').forEach(btn => btn.onclick = async () => {
      const i = toInt(btn.dataset.featLookup, -1);
      const ff = c.features[i];
      const race = (c.race || '').trim();
      if (!race) { alert('Set your character\'s Race first (Character tab).'); return; }
      if (!(ff.name || '').trim()) { alert('This feature has no name to look up.'); return; }
      btn.disabled = true;
      btn.textContent = 'Loading…';
      try {
        const result = await wikiLookupLineage(ff.name, race);
        ff.description = result;
        saveToLocalStorage();
        render();
      } catch (err) {
        alert(err.message || 'Lookup failed.');
        btn.disabled = false;
        btn.textContent = 'Lookup';
      }
    });
  }
}
