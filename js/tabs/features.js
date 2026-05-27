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
    c.resources.push({ name:'New Resource', max:1, used:0, reset:'short', notes:'', is_action:false });
    render();
  };
  $('#btnAddFeature').onclick = () => {
    c.features = c.features || [];
    c.features.push({ name:'New Feature', description:'', uses_max:null, uses_used:null, reset:'none', is_action:false });
    render();
  };

  function renderResourcesList(){
    const list = $('#resourcesList');
    const r = c.resources || [];
    list.innerHTML = r.length ? r.map((x,i) => `
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
    list.querySelectorAll('[data-res-action]').forEach(cb => cb.onchange = () => {
      const i = toInt(cb.dataset.resAction, -1);
      c.resources[i].is_action = !!cb.checked;
      saveToLocalStorage();
      render();
    });
  }

  function renderFeaturesList(){
    const list = $('#featuresList');
    const f = c.features || [];
    list.innerHTML = f.length ? f.map((x,i) => `
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
    list.querySelectorAll('[data-feat-action]').forEach(cb => cb.onchange = () => {
      const i = toInt(cb.dataset.featAction, -1);
      c.features[i].is_action = !!cb.checked;
      saveToLocalStorage();
      render();
    });
  }
}
