// --- Field templates & wiring ---
function fieldStar(path, label){
  const isStarred = starredFields.some(f => f.key === path);
  return `<button class="field-star-btn" data-star-key="${escapeAttr(path)}" data-star-label="${escapeAttr(label)}" title="${isStarred ? 'Remove from overview' : 'Add to overview'}" style="background:none;border:none;cursor:pointer;font-size:13px;line-height:1;padding:0 2px;color:${isStarred ? 'var(--warn)' : 'var(--muted)'}">${isStarred ? '★' : '☆'}</button>`;
}

function textField(label, path, value){
  return `
    <label class="col" style="gap:4px;">
      <div class="mini" style="display:flex;align-items:center;gap:4px;">${escapeHtml(label)}${fieldStar(path, label)}</div>
      <input type="text" data-text="${escapeHtml(path)}" value="${escapeAttr(String(value ?? ''))}" />
    </label>
  `;
}

function numField(label, path, value, min){
  return `
    <label class="col" style="gap:4px;">
      <div class="mini" style="display:flex;align-items:center;gap:4px;">${escapeHtml(label)}${fieldStar(path, label)}</div>
      <input type="number" data-num="${escapeHtml(path)}" value="${escapeAttr(String(value ?? 0))}"${min != null ? ` min="${min}"` : ''} />
    </label>
  `;
}

function selectField(label, path, value, options){
  return `
    <label class="col" style="gap:4px;">
      <div class="mini" style="display:flex;align-items:center;gap:4px;">${escapeHtml(label)}${fieldStar(path, label)}</div>
      <select data-sel="${escapeHtml(path)}">
        ${options.map(o => `<option value="${escapeAttr(o)}" ${o===value?'selected':''}>${escapeHtml(o)}</option>`).join('')}
      </select>
    </label>
  `;
}

function textAreaField(label, path, value){
  return `
    <label class="col" style="gap:4px;">
      <div class="mini" style="display:flex;align-items:center;gap:4px;">${escapeHtml(label)}${fieldStar(path, label)}</div>
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