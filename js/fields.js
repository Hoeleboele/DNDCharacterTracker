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

// Render spell slots UI into a container and wire controls for use/refund/set/delete.
function renderSpellSlots(c, containerSel, compact){
  compact = compact === true;
  const s = c.spellcasting || {};
  const slots = s.spell_slots || [];
  const container = typeof containerSel === 'string' ? document.querySelector(containerSel) : containerSel;
  if (!container) return;

  if (!slots.length) {
    container.innerHTML = `<div class="mini">No spell slots tracked.</div>`;
    return;
  }

  container.innerHTML = slots.map((x,i) => {
    const used = clamp(toInt(x.used,0), 0, toInt(x.max,0));
    const max = clamp(toInt(x.max,0), 0, 99);
    const slotKey = `_slot_${toInt(x.level,1)}`;
    const slotLabel = `Level ${toInt(x.level,1)} Slots`;
    if (compact) {
      return `
      <div class="item">
        <div>
          <div class="row" style="justify-content:space-between; align-items:center;">
            <b>Level ${toInt(x.level,1)} Slots ${fieldStar(slotKey, slotLabel)}</b>
            <span class="pill"><b>${used}</b> / ${max}</span>
          </div>
        </div>
        <div class="row" style="justify-content:flex-end; align-items:center;">
          <button class="btn" data-slot-use="${i}">Use</button>
        </div>
      </div>
      `;
    }

    return `
      <div class="item">
        <div>
          <div class="row" style="justify-content:space-between; align-items:center;">
            <b>Level ${toInt(x.level,1)} Slots ${fieldStar(slotKey, slotLabel)}</b>
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
  }).join('');

  // wire handlers (always wire Use)
  container.querySelectorAll('[data-slot-use]').forEach(btn => btn.onclick = () => {
    const i = toInt(btn.dataset.slotUse, -1);
    const ss = slots[i];
    ss.used = clamp(toInt(ss.used, 0) + 1, 0, toInt(ss.max, 0));
    render();
  });

  if (compact) return;

  container.querySelectorAll('[data-slot-refund]').forEach(btn => btn.onclick = () => {
    const i = toInt(btn.dataset.slotRefund, -1);
    const ss = slots[i];
    ss.used = clamp(toInt(ss.used, 0) - 1, 0, toInt(ss.max, 0));
    render();
  });
  container.querySelectorAll('[data-slot-set]').forEach(btn => btn.onclick = () => {
    const i = toInt(btn.dataset.slotSet, -1);
    const ss = slots[i];
    const max = prompt('Set slot max:', ss.max);
    if (max == null) return;
    ss.max = clamp(toInt(max, 0), 0, 99);
    ss.used = clamp(toInt(ss.used, 0), 0, ss.max);
    render();
  });
  container.querySelectorAll('[data-slot-del]').forEach(btn => btn.onclick = () => {
    const i = toInt(btn.dataset.slotDel, -1);
    slots.splice(i, 1);
    render();
  });
}