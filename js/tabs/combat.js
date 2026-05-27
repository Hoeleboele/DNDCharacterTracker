function renderCombat(c){
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

    const existingPicker = document.getElementById('weaponPicker');
    if (existingPicker) { existingPicker.remove(); return; }

    const picker = document.createElement('div');
    picker.id = 'weaponPicker';
    picker.style.cssText = 'margin-top:8px; padding:10px; background:var(--panel); border:1px solid var(--line); border-radius:var(--radius); display:flex; flex-direction:column; gap:6px;';
    picker.innerHTML = `
      ${equippedWeapons.length ? `
        <div class="mini" style="font-weight:600;">Add from equipped weapon:</div>
        ${equippedWeapons.map((w,idx) => `
          <button class="btn" data-pick="${idx}" style="text-align:left;">
            ${escapeHtml(w.name)}${w.notes ? ` <span class="muted" style="font-size:0.85em;">(${escapeHtml(w.notes)})</span>` : ''}
          </button>
        `).join('')}
        <div class="mini" style="margin-top:4px; font-weight:600;">Or:</div>
      ` : ''}
      <button class="btn" id="btnPickManual">+ Manual entry</button>
      <button class="btn danger" id="btnPickCancel">Cancel</button>
    `;
    $('#btnAddAttack').insertAdjacentElement('afterend', picker);

    picker.querySelectorAll('[data-pick]').forEach(btn => btn.onclick = () => {
      const w = equippedWeapons[toInt(btn.dataset.pick, 0)];
      c.attacks = c.attacks || [];
      c.attacks.push({ name: w.name, to_hit: defaultToHit, damage: w.notes || '', notes: '' });
      picker.remove();
      render();
    });

    document.getElementById('btnPickManual').onclick = () => {
      c.attacks = c.attacks || [];
      c.attacks.push({ name:'New Attack', to_hit: defaultToHit, damage:'', notes:'' });
      picker.remove();
      render();
    };

    document.getElementById('btnPickCancel').onclick = () => picker.remove();
  };

  

  $('#btnAddAction').onclick = () => {
    c.actions = c.actions || [];
    const actionFeatures = (c.features || []).map((f, idx) => ({ ...f, _idx: idx })).filter(f => f.is_action);
    const actionResources = (c.resources || []).map((r, idx) => ({ ...r, _idx: idx })).filter(r => r.is_action);

    const existingPicker = document.getElementById('actionPicker');
    if (existingPicker) { existingPicker.remove(); return; }

    const picker = document.createElement('div');
    picker.id = 'actionPicker';
    picker.style.cssText = 'margin-top:8px; padding:10px; background:var(--panel); border:1px solid var(--line); border-radius:var(--radius); display:flex; flex-direction:column; gap:6px;';
    picker.innerHTML = `
      ${actionFeatures.length ? `<div class="mini" style="font-weight:600;">Add from Features (Action):</div>
        ${actionFeatures.map((f) => `
          <button class="btn" data-pick-type="feature" data-pick-idx="${f._idx}" style="text-align:left;">
            ${escapeHtml(f.name)} <span class="muted" style="font-size:0.85em;">Feature</span>
            ${f.description ? `<div class="mini" style="margin-top:4px;">${escapeHtml(f.description)}</div>` : ''}
          </button>
        `).join('')}` : ''}
      ${actionResources.length ? `<div class="mini" style="font-weight:600; margin-top:6px;">Add from Resources (Action):</div>
        ${actionResources.map((r) => `
          <button class="btn" data-pick-type="resource" data-pick-idx="${r._idx}" style="text-align:left;">
            ${escapeHtml(r.name)} <span class="muted" style="font-size:0.85em;">Resource</span>
            ${r.notes ? `<div class="mini" style="margin-top:4px;">${escapeHtml(r.notes)}</div>` : ''}
          </button>
        `).join('')}` : ''}
      <div class="mini" style="margin-top:4px; font-weight:600;">Or:</div>
      <button class="btn" id="btnPickManualAction">+ Manual entry</button>
      <button class="btn danger" id="btnPickActionCancel">Cancel</button>
    `;
    $('#btnAddAction').insertAdjacentElement('afterend', picker);

    picker.querySelectorAll('[data-pick-type]').forEach(btn => btn.onclick = () => {
      const type = btn.dataset.pickType;
      const idx = toInt(btn.dataset.pickIdx, 0);
      if (type === 'feature') {
        const feat = c.features[idx];
        c.actions.push({ name: feat.name, notes: feat.description || '' });
      } else if (type === 'resource') {
        const res = c.resources[idx];
        c.actions.push({ name: res.name, notes: res.notes || '' });
      }
      picker.remove();
      render();
    });

    document.getElementById('btnPickManualAction').onclick = () => {
      c.actions.push({ name:'New Action', notes:'' });
      picker.remove();
      render();
    };
    document.getElementById('btnPickActionCancel').onclick = () => picker.remove();
  };

  if (c.spellcasting) {
    document.getElementById('btnAddCombatSpell').onclick = () => {
      const preparedSpells = (c.spellcasting.prepared_spells || []);
      const existingPicker = document.getElementById('combatSpellPicker');
      if (existingPicker) { existingPicker.remove(); return; }

      const picker = document.createElement('div');
      picker.id = 'combatSpellPicker';
      picker.style.cssText = 'margin-top:8px; padding:10px; background:var(--panel); border:1px solid var(--line); border-radius:var(--radius); display:flex; flex-direction:column; gap:6px;';
      const cantrips = (c.spellcasting.cantrips || []);
      const allSpellOptions = [
        ...cantrips.map(sp => ({ ...sp, _type: 'cantrip' })),
        ...preparedSpells.map(sp => ({ ...sp, _type: 'prepared' }))
      ];
      picker.innerHTML = `
        ${allSpellOptions.length ? `<div class="mini" style="font-weight:600;">Add from spells:</div>
        ${allSpellOptions.map((sp,idx) => `
          <button class="btn" data-pick-spell="${idx}" style="text-align:left;">
            ${escapeHtml(sp.name)} <span class="muted" style="font-size:0.85em;">${sp._type === 'cantrip' ? 'Cantrip' : `Lvl ${sp.level||0}`}</span>
          </button>
        `).join('')}
        <div class="mini" style="margin-top:4px; font-weight:600;">Or:</div>` : ''}
        <button class="btn" id="btnPickCustomSpell">+ Custom spell</button>
        <button class="btn danger" id="btnSpellPickCancel">Cancel</button>
      `;
      document.getElementById('btnAddCombatSpell').insertAdjacentElement('afterend', picker);

      picker.querySelectorAll('[data-pick-spell]').forEach(btn => btn.onclick = () => {
        const sp = allSpellOptions[toInt(btn.dataset.pickSpell, 0)];
        c.combat_spells = c.combat_spells || [];
        const { _type, ...spData } = sp;
        c.combat_spells.push({ ...spData, level: spData.level || 0 });
        picker.remove();
        render();
      });

      document.getElementById('btnPickCustomSpell').onclick = () => {
        c.combat_spells = c.combat_spells || [];
        c.combat_spells.push({ name:'New Spell', level:1, notes:'' });
        picker.remove();
        render();
      };

      document.getElementById('btnSpellPickCancel').onclick = () => picker.remove();
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
          <div class="mini"><b>Damage:</b> ${escapeHtml(a.damage || '')}</div>
          <div class="mini">${escapeHtml(a.notes || '')}</div>
        </div>
        <div class="col" style="min-width:160px;">
          <div class="row" style="justify-content:flex-end;">
            <button class="btn" data-atk-edit="${i}">Edit</button>
            <button class="btn" data-atk-tohit="${i}">To Hit</button>
            <button class="btn danger" data-atk-del="${i}">Delete</button>
          </div>
        </div>
      </div>
    `).join('') : `<div class="mini">No attacks listed.</div>`;

    list.querySelectorAll('[data-atk-edit]').forEach(btn => btn.onclick = () => {
      const i = toInt(btn.dataset.atkEdit, -1);
      const atk = c.attacks[i];
      const name = prompt('Name:', atk.name ?? '');
      if (name == null) return;
      const dmg = prompt('Damage text:', atk.damage ?? '');
      if (dmg == null) return;
      const notes = prompt('Notes:', atk.notes ?? '');
      if (notes == null) return;
      atk.name = name;
      atk.damage = dmg;
      atk.notes = notes;
      render();
    });

    list.querySelectorAll('[data-atk-tohit]').forEach(btn => btn.onclick = () => {
      const i = toInt(btn.dataset.atkTohit, -1);
      const atk = c.attacks[i];
      const toHit = prompt('To-hit bonus (blank for none):', atk.to_hit ?? '');
      if (toHit == null) return;
      const th = String(toHit).trim();
      atk.to_hit = th !== '' ? toInt(th, 0) : null;
      render();
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
    list.innerHTML = acts.length ? acts.map((a,i) => `
      <div class="item">
        <div>
          <b>${escapeHtml(a.name || 'Action')}</b>
          <div class="mini">${escapeHtml(a.notes || '')}</div>
        </div>
        <div class="row" style="justify-content:flex-end;">
          <button class="btn" data-act-edit="${i}">Edit</button>
          <button class="btn danger" data-act-del="${i}">Delete</button>
        </div>
      </div>
    `).join('') : `<div class="mini">No actions listed.</div>`;

    list.querySelectorAll('[data-act-edit]').forEach(btn => btn.onclick = () => {
      const i = toInt(btn.dataset.actEdit, -1);
      const act = c.actions[i];
      const name = prompt('Name:', act.name ?? '');
      if (name == null) return;
      const notes = prompt('Notes:', act.notes ?? '');
      if (notes == null) return;
      act.name = name;
      act.notes = notes;
      render();
    });
    list.querySelectorAll('[data-act-del]').forEach(btn => btn.onclick = () => {
      const i = toInt(btn.dataset.actDel, -1);
      c.actions.splice(i, 1);
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
