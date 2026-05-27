function renderSpells(c){
  const s = c.spellcasting;
  if (!s) {
    $('#contentCard').innerHTML = `
      <h2>Spells</h2>
      <div class="mini">This character has <b>no spellcasting</b> configured. If you have spells, go to <span class="kbd">Edit</span> and add the spellcasting section (or import from DMGPT).</div>
    `;
    return;
  }

  const profBonus = toInt(c.combat.proficiency_bonus, 2);
  const abilKey = (s.ability || 'INT').toLowerCase();
  const abilScore = toInt(c.ability_scores?.[abilKey], 10);
  const abilMod = Math.floor((abilScore - 10) / 2);
  const dcBonus  = toInt(s.dc_bonus, 0);
  const atkBonusExtra = toInt(s.atk_bonus, 0);
  const saveDC   = 8 + profBonus + abilMod + dcBonus;
  const atkBonus = profBonus + abilMod + atkBonusExtra;

  $('#contentCard').innerHTML = `
    <div class="grid2">
      <div class="col">
        <h2>Spellcasting</h2>
        <div class="grid3">
          ${selectField('Ability','spellcasting.ability', s.ability || 'INT', ['INT','WIS','CHA'])}
          <label class="col" style="gap:6px;"><div class="mini" style="display:flex;align-items:center;gap:4px;">Save DC${fieldStar('_spell_dc','Save DC')}<button id="btnDcToggle" style="background:none;border:none;cursor:pointer;font-size:11px;color:var(--muted);margin-left:auto;padding:0;">&#9660; bonus</button></div><span class="pill" style="font-size:1.1em; font-weight:700;">${saveDC}</span><div class="mini muted">8 + Prof (+${profBonus}) + ${s.ability||'INT'} mod (${abilMod >= 0 ? '+' : ''}${abilMod}) + bonus (${dcBonus >= 0 ? '+' : ''}${dcBonus})</div></label>
          <div id="dcBonusField" style="display:none;"><label class="col" style="gap:4px;"><div class="mini">DC Extra Bonus</div><input type="number" data-num="spellcasting.dc_bonus" value="${escapeAttr(String(s.dc_bonus ?? 0))}" /></label></div>
          <label class="col" style="gap:6px;"><div class="mini" style="display:flex;align-items:center;gap:4px;">Attack Bonus${fieldStar('_spell_atk','Attack Bonus')}<button id="btnAtkToggle" style="background:none;border:none;cursor:pointer;font-size:11px;color:var(--muted);margin-left:auto;padding:0;">&#9660; bonus</button></div><span class="pill" style="font-size:1.1em; font-weight:700;">${atkBonus >= 0 ? '+' : ''}${atkBonus}</span><div class="mini muted">Prof (+${profBonus}) + ${s.ability||'INT'} mod (${abilMod >= 0 ? '+' : ''}${abilMod}) + bonus (${atkBonusExtra >= 0 ? '+' : ''}${atkBonusExtra})</div></label>
          <div id="atkBonusField" style="display:none;"><label class="col" style="gap:4px;"><div class="mini">Atk Extra Bonus</div><input type="number" data-num="spellcasting.atk_bonus" value="${escapeAttr(String(s.atk_bonus ?? 0))}" /></label></div>
        </div>

        <h2 style="margin-top:14px;">Spell Slots</h2>
        <div class="list" id="slotsList" style="margin-top:10px;"></div>
        <button class="btn" id="btnAddSlot">Add Slot Level</button>

        <h2 style="margin-top:14px;">Cantrips</h2>
        <div class="list" id="cantripsList" style="margin-top:10px;"></div>
        <button class="btn" id="btnAddCantrip">Add Cantrip</button>
      </div>

      <div class="col">
        <div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
          <h2>Prepared Spells</h2>
          ${(() => { const cnt = (s.prepared_spells||[]).length; const mx = toInt(s.max_prepared,1); const over = cnt > mx; return `<span style="font-size:1.1em; font-weight:700; color:${over ? 'var(--bad)' : 'var(--accent)'}">${cnt}</span><span style="color:var(--muted)"> / </span><input type="number" id="inlineMaxPrepared" value="${mx}" min="1" style="width:52px; font-size:1em; font-weight:700; text-align:center; padding:2px 4px;">`; })()}
        </div>
        <div class="mini">Track what you have ready today. (Yes, you can forget to update this. That’s the tradition.)</div>
        <div class="list" id="preparedList" style="margin-top:10px;"></div>
        <button class="btn" id="btnAddPrepared">Add Prepared Spell</button>

        <h2 style="margin-top:14px;">Known Spells</h2>
        <div class="list" id="knownList" style="margin-top:10px;"></div>
        <button class="btn" id="btnAddKnown">Add Known Spell</button>
      </div>
    </div>
  `;

  wireNumberFields('#contentCard');
  wireSelectFields('#contentCard');

  // extra bonus fields and max_prepared must re-render to update the computed values
  const maxPrepInp = document.getElementById('inlineMaxPrepared');
  if (maxPrepInp) maxPrepInp.oninput = () => {
    let v = toInt(maxPrepInp.value, 1);
    if (v < 1) { v = 1; maxPrepInp.value = 1; }
    s.max_prepared = v;
    render();
  };
  const dcBonusInp = $('#contentCard').querySelector('[data-num="spellcasting.dc_bonus"]');
  if (dcBonusInp) dcBonusInp.oninput = () => { s.dc_bonus = toInt(dcBonusInp.value, 0); render(); };
  const atkBonusInp = $('#contentCard').querySelector('[data-num="spellcasting.atk_bonus"]');
  if (atkBonusInp) atkBonusInp.oninput = () => { s.atk_bonus = toInt(atkBonusInp.value, 0); render(); };

  document.getElementById('btnDcToggle').onclick = () => {
    const f = document.getElementById('dcBonusField');
    const open = f.style.display === 'none';
    f.style.display = open ? '' : 'none';
    document.getElementById('btnDcToggle').textContent = open ? '▲ bonus' : '▾ bonus';
  };
  document.getElementById('btnAtkToggle').onclick = () => {
    const f = document.getElementById('atkBonusField');
    const open = f.style.display === 'none';
    f.style.display = open ? '' : 'none';
    document.getElementById('btnAtkToggle').textContent = open ? '▲ bonus' : '▾ bonus';
  };

  // Re-render when ability changes so DC/attack bonus update immediately
  const abilitySel = $('#contentCard').querySelector('[data-sel="spellcasting.ability"]');
  if (abilitySel) abilitySel.onchange = () => { s.ability = abilitySel.value; render(); };

  renderSlots();
  renderSpellList('cantrips', '#cantripsList');
  renderSpellList('prepared_spells', '#preparedList', true, 'known_spells', 'Unprepare');
  renderSpellList('known_spells', '#knownList', true, 'prepared_spells', 'Prepare');

  $('#btnAddSlot').onclick = () => {
    s.spell_slots = s.spell_slots || [];
    const next = nextSlotLevel(s.spell_slots);
    s.spell_slots.push({ level: next, max: 0, used: 0 });
    s.spell_slots.sort((a,b)=>a.level-b.level);
    render();
  };
  $('#btnAddCantrip').onclick = () => {
    const name = prompt('Cantrip name:');
    if (!name) return;
    s.cantrips = s.cantrips || [];
    s.cantrips.push({ name: name.trim(), notes:'' });
    render();
  };
  $('#btnAddPrepared').onclick = () => {
    const name = prompt('Spell name:');
    if (!name) return;
    s.prepared_spells = s.prepared_spells || [];
    s.prepared_spells.push({ name: name.trim(), level: 1, notes:'' });
    render();
  };
  $('#btnAddKnown').onclick = () => {
    const name = prompt('Spell name:');
    if (!name) return;
    s.known_spells = s.known_spells || [];
    s.known_spells.push({ name: name.trim(), level: 1, notes:'' });
    render();
  };

  function renderSlots(){
    const list = $('#slotsList');
    const slots = s.spell_slots || [];
    list.innerHTML = slots.length ? slots.map((x,i)=>{
      const used = clamp(toInt(x.used,0), 0, toInt(x.max,0));
      const max = clamp(toInt(x.max,0), 0, 99);
      const slotKey = `_slot_${toInt(x.level,1)}`;
      const slotLabel = `Level ${toInt(x.level,1)} Slots`;
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
    }).join('') : `<div class="mini">No spell slots tracked.</div>`;

    list.querySelectorAll('[data-slot-use]').forEach(btn => btn.onclick = () => {
      const i = toInt(btn.dataset.slotUse, -1);
      const ss = s.spell_slots[i];
      ss.used = clamp(toInt(ss.used, 0) + 1, 0, toInt(ss.max, 0));
      render();
    });
    list.querySelectorAll('[data-slot-refund]').forEach(btn => btn.onclick = () => {
      const i = toInt(btn.dataset.slotRefund, -1);
      const ss = s.spell_slots[i];
      ss.used = clamp(toInt(ss.used, 0) - 1, 0, toInt(ss.max, 0));
      render();
    });
    list.querySelectorAll('[data-slot-set]').forEach(btn => btn.onclick = () => {
      const i = toInt(btn.dataset.slotSet, -1);
      const ss = s.spell_slots[i];
      const max = prompt('Set slot max:', ss.max);
      if (max == null) return;
      ss.max = clamp(toInt(max, 0), 0, 99);
      ss.used = clamp(toInt(ss.used, 0), 0, ss.max);
      render();
    });
    list.querySelectorAll('[data-slot-del]').forEach(btn => btn.onclick = () => {
      const i = toInt(btn.dataset.slotDel, -1);
      s.spell_slots.splice(i, 1);
      render();
    });
  }

  function renderSpellList(field, containerSel, hasLevel, moveToField, moveLabel){
    const list = $(containerSel);
    const arr = s[field] || [];
    const maxPrep = toInt(s.max_prepared, 1);
    const prepCount = (s.prepared_spells || []).length;
    const overMax = field === 'prepared_spells' && prepCount > maxPrep;
    list.innerHTML = arr.length ? arr.map((x,i)=>{
      const statsHtml = [
        x.casting_time ? `<span><b>Casting Time:</b> <span class="spell-val">${escapeHtml(x.casting_time)}</span></span>` : '',
        x.range_area   ? `<span><b>Range/Area:</b> <span class="spell-val">${escapeHtml(x.range_area)}</span></span>` : '',
        x.duration     ? `<span><b>Duration:</b> <span class="spell-val">${escapeHtml(x.duration)}</span></span>` : '',
        x.components   ? `<span><b>Components:</b> <span class="spell-val">${escapeHtml(x.components)}</span></span>` : '',
      ].filter(Boolean).join('<span class="spell-dot"> · </span>');
      const hasStats = !!(x.casting_time || x.range_area || x.duration || x.components);
      return `
        <div class="item" style="grid-template-columns:1fr;${overMax ? ' border-color:var(--bad);' : ''}">
          <div class="row" style="justify-content:space-between; align-items:flex-start;">
            <div class="row" style="gap:8px; align-items:center;">
              <b style="${overMax ? 'color:var(--bad);' : ''}">${escapeHtml(x.name || 'Spell')}</b>
              ${hasLevel ? `<span class="pill">lvl ${toInt(x.level,1)}</span>` : ''}
            </div>
            <div class="row" style="gap:6px;">
              ${hasLevel ? `<button class="btn" data-spell-level="${field}:${i}">Level</button>` : ''}
              ${moveToField ? `<button class="btn" data-spell-move="${field}:${i}:${moveToField}">${moveLabel}</button>` : ''}
              <button class="btn" data-spell-expand="${field}:${i}">Details</button>
              <button class="btn danger" data-spell-del="${field}:${i}">Delete</button>
            </div>
          </div>
          ${x.notes ? `<div class="mini" style="margin-top:4px;">${escapeHtml(x.notes)}</div>` : ''}
          <div class="spell-card-full" style="display:none; margin-top:10px;">
            <div class="spell-card">
              <div class="spell-card-title">${escapeHtml(x.name || 'Spell')}</div>
              ${x.subtitle ? `<div class="spell-card-subtitle">${escapeHtml(x.subtitle)}</div>` : ''}
              <hr class="spell-card-rule" />
              ${hasStats ? `<div class="spell-card-stats">${statsHtml}</div>` : ''}
              ${hasStats && x.description ? `<hr class="spell-card-rule" />` : ''}
              ${x.description ? `<div class="spell-card-desc">${escapeHtml(x.description).replace(/\n/g,'<br/>')}</div>` : '<div class="mini">No description yet.</div>'}
              <div class="row" style="margin-top:12px; gap:8px;">
                <button class="btn" data-spell-edit="${field}:${i}">Edit Details</button>
                <button class="btn" data-spell-wiki="${field}:${i}">Wiki Lookup</button>
                <button class="btn" data-spell-notes="${field}:${i}">Notes</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('') : `<div class="mini">None listed.</div>`;

    list.querySelectorAll('[data-spell-expand]').forEach(btn => btn.onclick = () => {
      const card = btn.closest('.item').querySelector('.spell-card-full');
      const isOpen = card.style.display !== 'none';
      card.style.display = isOpen ? 'none' : 'block';
      btn.textContent = isOpen ? 'Details' : 'Close';
    });

    list.querySelectorAll('[data-spell-edit]').forEach(btn => btn.onclick = () => {
      const [f, idxStr] = btn.dataset.spellEdit.split(':');
      const i = toInt(idxStr, -1);
      const sp = s[f][i];
      const name = prompt('Name:', sp.name ?? '');
      if (name == null) return;
      const subtitle = prompt('Subtitle (e.g. "1st-level Divination"):', sp.subtitle ?? '');
      if (subtitle == null) return;
      const casting_time = prompt('Casting Time:', sp.casting_time ?? '');
      if (casting_time == null) return;
      const range_area = prompt('Range/Area:', sp.range_area ?? '');
      if (range_area == null) return;
      const duration = prompt('Duration:', sp.duration ?? '');
      if (duration == null) return;
      const components = prompt('Components:', sp.components ?? '');
      if (components == null) return;
      const description = prompt('Description:', sp.description ?? '');
      if (description == null) return;
      sp.name = name; sp.subtitle = subtitle; sp.casting_time = casting_time;
      sp.range_area = range_area; sp.duration = duration; sp.components = components;
      sp.description = description;
      render();
    });

    list.querySelectorAll('[data-spell-level]').forEach(btn => btn.onclick = () => {
      const [f, idxStr] = btn.dataset.spellLevel.split(':');
      const i = toInt(idxStr, -1);
      const sp = s[f][i];
      const lvl = prompt('Spell level:', sp.level ?? 1);
      if (lvl == null) return;
      sp.level = clamp(toInt(lvl, 1), 0, 9);
      render();
    });

    list.querySelectorAll('[data-spell-notes]').forEach(btn => btn.onclick = () => {
      const [f, idxStr] = btn.dataset.spellNotes.split(':');
      const i = toInt(idxStr, -1);
      const sp = s[f][i];
      const notes = prompt('Notes:', sp.notes ?? '');
      if (notes == null) return;
      sp.notes = notes;
      render();
    });

    list.querySelectorAll('[data-spell-del]').forEach(btn => btn.onclick = () => {
      const [f, idxStr] = btn.dataset.spellDel.split(':');
      const i = toInt(idxStr, -1);
      s[f].splice(i, 1);
      render();
    });

    list.querySelectorAll('[data-spell-move]').forEach(btn => btn.onclick = () => {
      const [f, idxStr, targetField] = btn.dataset.spellMove.split(':');
      const i = toInt(idxStr, -1);
      const sp = s[f].splice(i, 1)[0];
      s[targetField] = s[targetField] || [];
      s[targetField].push(sp);
      render();
    });

    list.querySelectorAll('[data-spell-wiki]').forEach(btn => btn.onclick = async () => {
      const [f, idxStr] = btn.dataset.spellWiki.split(':');
      const i = toInt(idxStr, -1);
      const sp = s[f][i];
      const orig = btn.textContent;
      btn.textContent = 'Loading…';
      btn.disabled = true;
      try {
        const data = await wikiLookupSpell(sp.name || '');
        if (data.subtitle)     sp.subtitle     = data.subtitle;
        if (data.casting_time) sp.casting_time = data.casting_time;
        if (data.range_area)   sp.range_area   = data.range_area;
        if (data.components)   sp.components   = data.components;
        if (data.duration)     sp.duration     = data.duration;
        if (data.description)  sp.description  = data.description;
        render();
      } catch (err) {
        btn.textContent = orig;
        btn.disabled = false;
        alert('Wiki lookup failed: ' + err.message);
      }
    });
  }

  function nextSlotLevel(slots){
    const levels = new Set((slots||[]).map(x => toInt(x.level,1)));
    for (let i=1; i<=9; i++) if (!levels.has(i)) return i;
    return 1;
  }
}
