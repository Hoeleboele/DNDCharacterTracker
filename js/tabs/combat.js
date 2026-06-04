// ── Global attack recompute (called when ability scores / prof bonus change) ─
function recomputeAttacks(c) {
  if (!c || !Array.isArray(c.attacks)) return;
  c.attacks.forEach(atk => {
    if (atk.to_hit_ability == null) return; // old attack without component fields
    atk.to_hit  = computeToHit(c, atk.to_hit_ability, atk.to_hit_prof, atk.to_hit_extra);
    atk.damage  = computeDamage(atk.damage_dice || '', c, atk.damage_ability, atk.damage_extra);
  });
}

// ── Attack helpers ────────────────────────────────────────────────────
const ABILITY_OPTS = [
  { key: 'str', label: 'STR' },
  { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' },
  { key: 'cha', label: 'CHA' },
  { key: 'none', label: 'None' }
];

function getAbilityMod(c, ability) {
  if (!ability || ability === 'none') return 0;
  const score = toInt((c.ability_scores || {})[ability], 10);
  return Math.floor((score - 10) / 2);
}

function computeToHit(c, ability, useProf, extra) {
  const abilityMod = getAbilityMod(c, ability);
  const profBonus = useProf ? toInt(c.combat?.proficiency_bonus, 2) : 0;
  return abilityMod + profBonus + toInt(extra, 0);
}

function parseDiceFromNotes(notes) {
  if (!notes) return '';
  // Split on " - " (wiki properties separator) and keep only the dice part
  const diceStr = notes.split(' - ')[0].trim();
  return diceStr;
}

function computeDamage(dice, c, ability, extra) {
  const bonus = getAbilityMod(c, ability) + toInt(extra, 0);
  const diceStr = (dice || '').trim();
  return diceStr ? `${diceStr} + ${bonus}` : `+ ${bonus}`;
}

function openAttackModal({ atk, onSave }) {
  // Remove any existing modal
  const existing = document.getElementById('attackModal');
  if (existing) existing.remove();

  const c = state.character;
  // Pre-fill from stored components, or sensible defaults for old attacks
  const name        = atk.name          || '';
  const thAbility   = atk.to_hit_ability || 'str';
  const thProf      = atk.to_hit_prof != null ? atk.to_hit_prof : true;
  const thExtra     = atk.to_hit_extra  != null ? atk.to_hit_extra : 0;
  const dmgDice     = atk.damage_dice   || '';
  const dmgAbility  = atk.damage_ability || 'str';
  const dmgExtra    = atk.damage_extra  != null ? atk.damage_extra : 0;
  const notes       = atk.notes         || '';

  const abilityOptions = (sel) => ABILITY_OPTS.map(o =>
    `<option value="${o.key}" ${o.key === sel ? 'selected' : ''}>${escapeHtml(o.label)}</option>`
  ).join('');

  const overlay = document.createElement('div');
  overlay.id = 'attackModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;';
  overlay.innerHTML = `
    <div class="card" style="width:100%;max-width:420px;padding:20px;display:flex;flex-direction:column;gap:14px;max-height:90vh;overflow-y:auto;">
      <h2 style="margin:0;">Edit Attack</h2>

      <label class="col" style="gap:4px;">
        <div class="mini" style="font-weight:600;">Name</div>
        <input id="amName" type="text" value="${escapeAttr(name)}" style="width:100%;" />
      </label>

      <div style="border:1px solid var(--line);border-radius:var(--radius);padding:12px;display:flex;flex-direction:column;gap:10px;">
        <div class="mini" style="font-weight:600;">To Hit</div>
        <div class="grid2" style="gap:8px;">
          <label class="col" style="gap:4px;">
            <div class="mini">Ability</div>
            <select id="amThAbility">${abilityOptions(thAbility)}</select>
          </label>
          <label class="col" style="gap:4px;">
            <div class="mini">Extra bonus</div>
            <input id="amThExtra" type="number" value="${escapeAttr(String(thExtra))}" style="width:100%;" />
          </label>
        </div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input id="amThProf" type="checkbox" ${thProf ? 'checked' : ''} />
          <span class="mini">Add proficiency bonus</span>
        </label>
        <div id="amThPreview" class="mini" style="color:var(--accent);font-weight:600;"></div>
      </div>

      <div style="border:1px solid var(--line);border-radius:var(--radius);padding:12px;display:flex;flex-direction:column;gap:10px;">
        <div class="mini" style="font-weight:600;">Damage</div>
        <label class="col" style="gap:4px;">
          <div class="mini">Dice (e.g. 1d8 slashing)</div>
          <input id="amDmgDice" type="text" value="${escapeAttr(dmgDice)}" style="width:100%;" />
        </label>
        <div class="grid2" style="gap:8px;">
          <label class="col" style="gap:4px;">
            <div class="mini">Ability modifier</div>
            <select id="amDmgAbility">${abilityOptions(dmgAbility)}</select>
          </label>
          <label class="col" style="gap:4px;">
            <div class="mini">Extra bonus</div>
            <input id="amDmgExtra" type="number" value="${escapeAttr(String(dmgExtra))}" style="width:100%;" />
          </label>
        </div>
        <div id="amDmgPreview" class="mini" style="color:var(--accent);font-weight:600;"></div>
      </div>

      <label class="col" style="gap:4px;">
        <div class="mini">Notes</div>
        <input id="amNotes" type="text" value="${escapeAttr(notes)}" style="width:100%;" />
      </label>

      <div class="row" style="gap:8px;margin-top:4px;">
        <button class="btn good" id="amSave" style="flex:1;">Save</button>
        <button class="btn danger" id="amCancel">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Live preview updater
  function updatePreviews() {
    const ability  = document.getElementById('amThAbility').value;
    const useProf  = document.getElementById('amThProf').checked;
    const extra    = toInt(document.getElementById('amThExtra').value, 0);
    const th       = computeToHit(c, ability, useProf, extra);
    document.getElementById('amThPreview').textContent = `To Hit: ${signed(th)}`;

    const dAbility = document.getElementById('amDmgAbility').value;
    const dExtra   = toInt(document.getElementById('amDmgExtra').value, 0);
    const dice     = document.getElementById('amDmgDice').value.trim();
    document.getElementById('amDmgPreview').textContent = `Damage: ${computeDamage(dice, c, dAbility, dExtra)}`;
  }

  updatePreviews();
  ['amThAbility','amThProf','amThExtra','amDmgAbility','amDmgExtra','amDmgDice'].forEach(id => {
    document.getElementById(id).addEventListener('input', updatePreviews);
    document.getElementById(id).addEventListener('change', updatePreviews);
  });

  document.getElementById('amSave').onclick = () => {
    const ability  = document.getElementById('amThAbility').value;
    const useProf  = document.getElementById('amThProf').checked;
    const extra    = toInt(document.getElementById('amThExtra').value, 0);
    const dAbility = document.getElementById('amDmgAbility').value;
    const dExtra   = toInt(document.getElementById('amDmgExtra').value, 0);
    const dice     = document.getElementById('amDmgDice').value.trim();

    atk.name           = document.getElementById('amName').value.trim() || 'Attack';
    atk.to_hit_ability = ability;
    atk.to_hit_prof    = useProf;
    atk.to_hit_extra   = extra;
    atk.to_hit         = computeToHit(c, ability, useProf, extra);
    atk.damage_dice    = dice;
    atk.damage_ability = dAbility;
    atk.damage_extra   = dExtra;
    atk.damage         = computeDamage(dice, c, dAbility, dExtra);
    atk.notes          = document.getElementById('amNotes').value.trim();

    overlay.remove();
    onSave(atk);
  };

  const closeModal = () => overlay.remove();
  document.getElementById('amCancel').onclick = closeModal;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
}

// ── Picker factory ────────────────────────────────────────────────────
function openPicker({ pickerId, insertAfterId, items, onSelect, onManual, onCancel, title, manualLabel = '+ Manual entry' }) {
  const existing = document.getElementById(pickerId);
  if (existing) { existing.remove(); return; }

  const picker = document.createElement('div');
  picker.id = pickerId;
  picker.style.cssText = 'margin-top:8px; padding:10px; background:var(--panel); border:1px solid var(--line); border-radius:var(--radius); display:flex; flex-direction:column; gap:6px;';
  
  picker.innerHTML = `
    ${items.length ? `<div class="mini" style="font-weight:600;">${title}</div>
      ${items.map((item, idx) => `
        <button class="btn" data-pick-idx="${idx}" style="text-align:left;">
          ${escapeHtml(item.label)}${item.subtitle ? ` <span class="muted" style="font-size:0.85em;">${item.subtitle}</span>` : ''}
          ${item.detail ? `<div class="mini" style="margin-top:4px;">${item.detail}</div>` : ''}
        </button>
      `).join('')}
      <div class="mini" style="margin-top:4px; font-weight:600;">Or:</div>` : ''}
    ${onManual ? `<button class="btn" id="btnPickManual${pickerId}">+ ${manualLabel}</button>` : ''}
    <button class="btn danger" id="btnPickCancel${pickerId}">Cancel</button>
  `;
  
  $('#' + insertAfterId).insertAdjacentElement('afterend', picker);

  picker.querySelectorAll('[data-pick-idx]').forEach(btn => btn.onclick = () => {
    const idx = toInt(btn.dataset.pickIdx, 0);
    onSelect(items[idx], idx);
  });

  if (onManual) {
    document.getElementById('btnPickManual' + pickerId).onclick = () => {
      onManual();
      picker.remove();
    };
  }

  document.getElementById('btnPickCancel' + pickerId).onclick = () => picker.remove();
}

function renderCombat(c){
  recomputeAttacks(c);
  const effects = computeExhaustionEffects(c);
  const hpMax = effects.effectiveHpMax ?? (c.hp.max || 1);
  const hpCur = clamp(Number(c.hp.current) || 0, 0, hpMax);
  const pct = hpMax ? Math.round((hpCur / hpMax) * 100) : 0;
  const low = pct <= 33;
  const attacks = c.attacks || [];
  const actions = c.actions || [];
  $('#contentCard').innerHTML = `
    <div class="card" style="margin-bottom:12px; padding:12px 16px;">
      <div class="row" style="justify-content:space-between; margin-bottom:6px;">
        <div><b>HP</b> <span class="muted">(temp: ${c.hp.temp || 0})</span></div>
        <div class="muted">${hpCur} / ${hpMax} (${pct}%)</div>
      </div>
      <div class="hpbar" aria-label="HP bar"><div class="hpfill ${low ? 'low':''}" style="width:${pct}%;"></div></div>
      <div class="row" style="margin-top:8px;">
        <input type="number" id="hpDelta" min="0" step="1" value="1" style="max-width:110px;" />
        <button class="btn danger" id="btnDamage">Damage</button>
        <button class="btn good" id="btnHeal">Heal</button>
        <button class="btn" id="btnTemp">Set Temp</button>
      </div>
      <div style="margin-top:12px; border-top:1px solid var(--line); padding-top:10px;">
        <div class="row" style="justify-content:space-between; align-items:center; cursor:pointer; user-select:none;" id="btnDstToggle">
          <div class="mini" style="font-weight:600;">Death Saving Throws</div>
          <span id="dstChevron" style="font-size:12px; color:var(--muted);">▼</span>
        </div>
        <div id="dstBody" style="display:none; margin-top:8px;">
          <div class="row" style="gap:8px; align-items:center;">
            <span class="mini" style="width:64px; color:var(--good);">Successes</span>
            ${[0,1,2].map(i => `<button class="dst-btn" data-dst-type="successes" data-dst-idx="${i}" style="width:26px;height:26px;border-radius:50%;border:2px solid var(--good);background:${(c.death_saves?.successes||[])[i] ? 'var(--good)' : 'transparent'};cursor:pointer;"></button>`).join('')}
          </div>
          <div class="row" style="gap:8px; align-items:center; margin-top:6px;">
            <span class="mini" style="width:64px; color:var(--bad);">Failures</span>
            ${[0,1,2].map(i => `<button class="dst-btn" data-dst-type="failures" data-dst-idx="${i}" style="width:26px;height:26px;border-radius:50%;border:2px solid var(--bad);background:${(c.death_saves?.failures||[])[i] ? 'var(--bad)' : 'transparent'};cursor:pointer;"></button>`).join('')}
          </div>
        </div>
      </div>
    </div>
    <div class="grid2" id="combatSectionsGrid">
      ${c.spellcasting ? `
      <div id="combatToggleBar" style="grid-column:1/-1; display:none; border-radius:10px; overflow:hidden; border:1px solid var(--line);" class="row">
        <button id="btnCombatTabAttacks" style="flex:1; padding:10px; border:none; border-radius:0; background:var(--accent); color:#000; font-weight:600; font-size:13px; cursor:pointer;">Attacks</button>
        <button id="btnCombatTabSpells" style="flex:1; padding:10px; border:none; border-radius:0; background:var(--btn); color:var(--text); font-size:13px; cursor:pointer;">Spells</button>
      </div>
      ` : ''}
      <div class="col" id="combatAttacksCol">
        <h2>Attacks</h2>
        <div class="mini">Track your bread-and-butter: weapon attacks, cantrip attacks, special actions.</div>
        <div class="list" id="attacksList" style="margin-top:10px;"></div>
        <button class="btn" id="btnAddAttack">Add Attack</button>

        <h2 style="margin-top:14px;">Actions</h2>
        <div class="list" id="actionsList" style="margin-top:10px;"></div>
        <button class="btn" id="btnAddAction">Add Action</button>
      </div>

      ${c.spellcasting ? `
      <div class="col" id="combatSpellsCol">
        <h2>Spells</h2>
        <div class="mini">Prepared or custom spells ready to cast.</div>
        <h3 style="margin-top:10px; margin-bottom:6px; font-size:1.05em;">Spell Slots</h3>
        <div class="list" id="combatSlotsList" style="margin-top:6px;"></div>
        <div style="height:8px"></div>
        <div class="list" id="combatSpellsList" style="margin-top:10px;"></div>
        <button class="btn" id="btnAddCombatSpell">Add Spell</button>
      </div>
      ` : ''}
    </div>

    
  `;

  renderAttacks();
  renderActions();
  if (c.spellcasting) {
    renderSpellSlots(c, '#combatSlotsList', true);
    renderCombatSpells();
  }

  $('#btnDamage').onclick = () => applyHpDelta(-toInt($('#hpDelta').value, 0));
  $('#btnHeal').onclick   = () => applyHpDelta(+toInt($('#hpDelta').value, 0));
  $('#btnTemp').onclick   = () => setTempHp(toInt($('#hpDelta').value, 0));

  document.getElementById('btnDstToggle').onclick = () => {
    const body = document.getElementById('dstBody');
    const chevron = document.getElementById('dstChevron');
    const open = body.style.display === 'none';
    body.style.display = open ? 'block' : 'none';
    chevron.textContent = open ? '▲' : '▼';
  };

  $('#contentCard').querySelectorAll('.dst-btn').forEach(btn => {
    btn.onclick = () => {
      const type = btn.dataset.dstType;
      const idx  = toInt(btn.dataset.dstIdx, 0);
      c.death_saves = c.death_saves || { successes:[false,false,false], failures:[false,false,false] };
      c.death_saves[type][idx] = !c.death_saves[type][idx];
      const color = type === 'successes' ? 'var(--good)' : 'var(--bad)';
      btn.style.background = c.death_saves[type][idx] ? color : 'transparent';
      saveToLocalStorage();
    };
  });

  // Mobile toggle between Attacks/Actions and Spells
  if (c.spellcasting) {
    const toggleBar    = document.getElementById('combatToggleBar');
    const attacksCol   = document.getElementById('combatAttacksCol');
    const spellsCol    = document.getElementById('combatSpellsCol');
    const btnAttackTab = document.getElementById('btnCombatTabAttacks');
    const btnSpellTab  = document.getElementById('btnCombatTabSpells');

    function applyCombatToggle(showSpells) {
      if (window.innerWidth >= 640) {
        toggleBar.style.display = 'none';
        attacksCol.style.display = '';
        spellsCol.style.display = '';
      } else {
        toggleBar.style.display = 'flex';
        attacksCol.style.display = showSpells ? 'none' : '';
        spellsCol.style.display  = showSpells ? '' : 'none';
        btnAttackTab.style.background = showSpells ? 'var(--btn)' : 'var(--accent)';
        btnAttackTab.style.color      = showSpells ? 'var(--text)' : '#000';
        btnAttackTab.style.fontWeight = showSpells ? 'normal' : '600';
        btnSpellTab.style.background  = showSpells ? 'var(--accent)' : 'var(--btn)';
        btnSpellTab.style.color       = showSpells ? '#000' : 'var(--text)';
        btnSpellTab.style.fontWeight  = showSpells ? '600' : 'normal';
      }
    }

    applyCombatToggle(combatShowSpells);
    btnAttackTab.onclick = () => { combatShowSpells = false; applyCombatToggle(false); };
    btnSpellTab.onclick  = () => { combatShowSpells = true;  applyCombatToggle(true); };
  }

  $('#btnAddAttack').onclick = () => {
    const strMod = Math.floor((toInt(c.ability_scores?.str, 10) - 10) / 2);
    const profBonus = toInt(c.combat?.proficiency_bonus, 2);
    const defaultToHit = strMod + profBonus;

    const equippedWeapons = ((c.inventory || {}).items || [])
      .filter(it => it.type === 'weapon' && it.equipped);

    const items = equippedWeapons.map(w => ({
      label: escapeHtml(w.name),
      subtitle: w.notes ? `(${escapeHtml(w.notes)})` : null
    }));

    openPicker({
      pickerId: 'weaponPicker',
      insertAfterId: 'btnAddAttack',
      items,
      title: 'Add from equipped weapon:',
      manualLabel: 'Manual entry',
      onSelect: (item, idx) => {
        const w = equippedWeapons[idx];
        c.attacks = c.attacks || [];
        const atk = {
          name: w.name,
          to_hit: defaultToHit,
          to_hit_ability: 'str',
          to_hit_prof: true,
          to_hit_extra: 0,
          damage: '',
          damage_dice: parseDiceFromNotes(w.notes || ''),
          damage_ability: 'str',
          damage_extra: 0,
          notes: ''
        };
        c.attacks.push(atk);
        openAttackModal({ atk, onSave: () => { saveToLocalStorage(); render(); } });
      },
      onManual: () => {
        c.attacks = c.attacks || [];
        const atk = {
          name: 'New Attack',
          to_hit: defaultToHit,
          to_hit_ability: 'str',
          to_hit_prof: true,
          to_hit_extra: 0,
          damage: '',
          damage_dice: '',
          damage_ability: 'str',
          damage_extra: 0,
          notes: ''
        };
        c.attacks.push(atk);
        openAttackModal({ atk, onSave: () => { saveToLocalStorage(); render(); } });
      },
      onCancel: () => {}
    });
  };

  

  $('#btnAddAction').onclick = () => {
    c.actions = c.actions || [];
    const actionFeatures = (c.features || []).map((f, idx) => ({ ...f, _idx: idx })).filter(f => f.is_action);
    const actionResources = (c.resources || []).map((r, idx) => ({ ...r, _idx: idx })).filter(r => r.is_action);

    const items = [
      ...actionFeatures.map(f => ({
        label: escapeHtml(f.name),
        subtitle: 'Feature',
        detail: f.description ? escapeHtml(f.description) : null,
        _type: 'feature',
        _idx: f._idx
      })),
      ...actionResources.map(r => ({
        label: escapeHtml(r.name),
        subtitle: 'Resource',
        detail: r.notes ? escapeHtml(r.notes) : null,
        _type: 'resource',
        _idx: r._idx
      }))
    ];

    openPicker({
      pickerId: 'actionPicker',
      insertAfterId: 'btnAddAction',
      items,
      title: items.length ? 'Add from Features & Resources:' : '',
      manualLabel: 'Manual entry',
      onSelect: (item) => {
        const type = item._type;
        const idx = item._idx;
        if (type === 'feature') {
          const feat = c.features[idx];
          c.actions.push({
            name: feat.name,
            notes: feat.description || '',
            uses_max: feat.uses_max != null ? toInt(feat.uses_max, 0) : null,
            uses_used: toInt(feat.uses_used, 0),
            _src: 'feature',
            _src_idx: idx
          });
        } else if (type === 'resource') {
          const res = c.resources[idx];
          c.actions.push({
            name: res.name,
            notes: res.notes || '',
            max: toInt(res.max, 0),
            used: toInt(res.used, 0),
            _src: 'resource',
            _src_idx: idx
          });
        }
        saveToLocalStorage();
        render();
      },
      onManual: () => {
        c.actions.push({ name:'New Action', notes:'' });
        render();
      },
      onCancel: () => {}
    });
  };

  if (c.spellcasting) {
    document.getElementById('btnAddCombatSpell').onclick = () => {
      const preparedSpells = (c.spellcasting.prepared_spells || []);
      const cantrips = (c.spellcasting.cantrips || []);
      const allSpellOptions = [
        ...cantrips.map(sp => ({ ...sp, _type: 'cantrip' })),
        ...preparedSpells.map(sp => ({ ...sp, _type: 'prepared' }))
      ];

      const items = allSpellOptions.map((sp) => ({
        label: escapeHtml(sp.name),
        subtitle: sp._type === 'cantrip' ? 'Cantrip' : `Lvl ${sp.level||0}`,
        _data: sp
      }));

      openPicker({
        pickerId: 'combatSpellPicker',
        insertAfterId: 'btnAddCombatSpell',
        items,
        title: items.length ? 'Add from spells:' : '',
        manualLabel: 'Custom spell',
        onSelect: (item) => {
          const sp = item._data;
          c.combat_spells = c.combat_spells || [];
          const { _type, ...spData } = sp;
          c.combat_spells.push({ ...spData, level: spData.level || 0 });
          render();
        },
        onManual: () => {
          c.combat_spells = c.combat_spells || [];
          c.combat_spells.push({ name:'New Spell', level:1, notes:'' });
          render();
        },
        onCancel: () => {}
      });
    };
  }

  function renderAttacks(){
    const list = $('#attacksList');
    list.innerHTML = attacks.length ? attacks.map((a,i)=> `
      <div class="item">
        <div>
          <div class="row" style="justify-content:space-between; align-items:flex-start;">
            <b>${escapeHtml(a.name || 'Attack')}</b>
            <span class="pill">to hit: ${a.to_hit == null ? '—' : signed(toInt(a.to_hit,0))}</span>
          </div>
          <div class="mini" style="margin-top:4px;"><b>Damage:</b> ${escapeHtml(a.damage || '')}</div>
        </div>
        <div class="col" style="min-width:160px;">
          <div class="row" style="justify-content:flex-end;">
            <button class="btn" data-atk-edit="${i}">Edit</button>
            <button class="btn danger" data-atk-del="${i}">Delete</button>
          </div>
        </div>
        ${a.notes ? `<div class="mini" style="grid-column:1/-1; margin-top:2px;">${escapeHtml(a.notes)}</div>` : ''}
      </div>
    `).join('') : `<div class="mini">No attacks listed.</div>`;

    list.querySelectorAll('[data-atk-edit]').forEach(btn => btn.onclick = () => {
      const i = toInt(btn.dataset.atkEdit, -1);
      const atk = c.attacks[i];
      openAttackModal({ atk, onSave: () => { saveToLocalStorage(); render(); } });
    });

    list.querySelectorAll('[data-atk-del]').forEach(btn => btn.onclick = () => {
      const i = toInt(btn.dataset.atkDel, -1);
      c.attacks.splice(i, 1);
      render();
    });
  }

  function renderActions(){
    const list = $('#actionsList');
    const acts = c.actions || [];
    let html = '';
    if (acts.length) {
      for (let i = 0; i < acts.length; i++) {
        const a = acts[i];
        // Determine current usage from linked source when available
        let srcMax = null;
        let srcUsed = null;
        if (a._src === 'resource' && Array.isArray(c.resources) && c.resources[a._src_idx]) {
          const rr = c.resources[a._src_idx];
          srcMax = toInt(rr.max, 0);
          srcUsed = toInt(rr.used, 0);
        } else if (a._src === 'feature' && Array.isArray(c.features) && c.features[a._src_idx]) {
          const ff = c.features[a._src_idx];
          srcMax = toInt(ff.uses_max, 0);
          srcUsed = toInt(ff.uses_used, 0);
        } else {
          srcMax = toInt(a.max ?? a.uses_max, 0);
          srcUsed = toInt(a.used ?? a.uses_used, 0);
        }
        const hasUses = srcMax > 0;
        const counterHtml = hasUses ? `<span class="pill" style="margin-right:6px;"><b>${srcUsed}</b> / ${srcMax}</span>` : '';

        const actionControls = hasUses ? `${counterHtml}<button class="btn" data-act-use="${i}">Use</button>` : `<button class="btn" data-act-edit="${i}">Edit</button>`;

        html += `
          <div class="item">
            <div>
              <b>${escapeHtml(a.name || 'Action')}</b>
              <div class="mini">${escapeHtml(a.notes || '')}</div>
            </div>
            <div class="row" style="justify-content:flex-end; gap:8px; align-items:center;">
              ${actionControls}
              <button class="btn danger" data-act-del="${i}">X</button>
            </div>
          </div>
        `;
      }
    } else {
      html = `<div class="mini">No actions listed.</div>`;
    }

    list.innerHTML = html;

    list.querySelectorAll('[data-act-edit]').forEach(btn => btn.onclick = () => {
      const i = toInt(btn.dataset.actEdit, -1);
      const act = c.actions[i];
      const name = prompt('Name:', act.name ?? '');
      if (name == null) return;
      const notes = prompt('Notes:', act.notes ?? '');
      if (notes == null) return;
      act.name = name;
      act.notes = notes;
      saveToLocalStorage();
      render();
    });

    list.querySelectorAll('[data-act-use]').forEach(btn => btn.onclick = () => {
      const i = toInt(btn.dataset.actUse, -1);
      const act = c.actions[i];
      if (act._src === 'resource' && c.resources && c.resources[act._src_idx]) {
        const rr = c.resources[act._src_idx];
        rr.used = clamp(toInt(rr.used, 0) + 1, 0, toInt(rr.max, 0));
        act.used = rr.used;
      } else if (act._src === 'feature' && c.features && c.features[act._src_idx]) {
        const ff = c.features[act._src_idx];
        ff.uses_used = clamp(toInt(ff.uses_used, 0) + 1, 0, toInt(ff.uses_max, 0));
        act.uses_used = ff.uses_used;
      } else if (toInt(act.max,0) > 0) {
        act.used = clamp(toInt(act.used, 0) + 1, 0, toInt(act.max, 0));
      } else if (toInt(act.uses_max,0) > 0) {
        act.uses_used = clamp(toInt(act.uses_used, 0) + 1, 0, toInt(act.uses_max, 0));
      }
      saveToLocalStorage();
      render();
    });

    list.querySelectorAll('[data-act-del]').forEach(btn => btn.onclick = () => {
      const i = toInt(btn.dataset.actDel, -1);
      c.actions.splice(i, 1);
      saveToLocalStorage();
      render();
    });
  }

  function renderCombatSpells(){
    const list = document.getElementById('combatSpellsList');
    if (!list) return;
    const spells = c.combat_spells || [];
    list.innerHTML = spells.length ? spells.map((x,i) => {
      const statsHtml = [
        x.casting_time ? `<span><b>Casting Time:</b> <span class="spell-val">${escapeHtml(x.casting_time)}</span></span>` : '',
        x.range_area   ? `<span><b>Range/Area:</b> <span class="spell-val">${escapeHtml(x.range_area)}</span></span>` : '',
        x.duration     ? `<span><b>Duration:</b> <span class="spell-val">${escapeHtml(x.duration)}</span></span>` : '',
        x.components   ? `<span><b>Components:</b> <span class="spell-val">${escapeHtml(x.components)}</span></span>` : '',
      ].filter(Boolean).join('<span class="spell-dot"> · </span>');
      const hasStats = !!(x.casting_time || x.range_area || x.duration || x.components);
      const levelLabel = (x.level || 0) === 0 ? 'Cantrip' : `lvl ${x.level}`;
      return `
        <div class="item" style="grid-template-columns:1fr;">
          <div class="row" style="justify-content:space-between; align-items:flex-start;">
            <div class="row" style="gap:8px; align-items:center;">
              <b>${escapeHtml(x.name || 'Spell')}</b>
              <span class="pill">${levelLabel}</span>
            </div>
            <div class="row" style="gap:6px;">
              <button class="btn" data-csp-expand="${i}">Details</button>
              <button class="btn danger" data-csp-del="${i}">Delete</button>
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
                <button class="btn" data-csp-edit="${i}">Edit Details</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('') : `<div class="mini">No spells added.</div>`;

    list.querySelectorAll('[data-csp-expand]').forEach(btn => btn.onclick = () => {
      const card = btn.closest('.item').querySelector('.spell-card-full');
      const isOpen = card.style.display !== 'none';
      card.style.display = isOpen ? 'none' : 'block';
      btn.textContent = isOpen ? 'Details' : 'Close';
    });

    list.querySelectorAll('[data-csp-edit]').forEach(btn => btn.onclick = () => {
      const i = toInt(btn.dataset.cspEdit, -1);
      const sp = c.combat_spells[i];
      const name = prompt('Name:', sp.name ?? '');
      if (name == null) return;
      const subtitle = prompt('Subtitle (e.g. "1st-level Evocation"):', sp.subtitle ?? '');
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

    list.querySelectorAll('[data-csp-del]').forEach(btn => btn.onclick = () => {
      const i = toInt(btn.dataset.cspDel, -1);
      c.combat_spells.splice(i, 1);
      render();
    });
  }
}
