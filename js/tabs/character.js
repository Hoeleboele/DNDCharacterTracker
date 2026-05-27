function renderCharacter(c){
  // --- Identity & settings ---
  const isCaster = !!c.spellcasting;
  const as = c.ability_scores || {};
  const profBonus = toInt(c.combat.proficiency_bonus, 2);
  const wisMod = Math.floor((toInt(as.wis, 10) - 10) / 2);
  const dexMod  = Math.floor((toInt(as.dex, 10) - 10) / 2);
  const percProf = Array.isArray(c.skill_proficiencies) && c.skill_proficiencies.includes('perception');
  const ppBonus = toInt(c.combat.pp_bonus, 0);
  const passivePerception = 10 + wisMod + (percProf ? profBonus : 0) + ppBonus;
  const initExtra = toInt(c.combat.initiative_mod, 0);
  const initTotal = dexMod + initExtra;

  const editHtml = `
    <hr style="margin:24px 0; border-color:var(--line);" />
    <div class="grid2">
      <div class="col">
        <h2>Identity</h2>
        ${textField('Name','name', c.name || '')}
        <div class="grid2">
          ${numField('Level','level', c.level)}
          ${textField('Class','class', c.class || '')}
          ${textField('Subclass','subclass', c.subclass || '')}
          ${textField('Race','race', c.race || '')}
          ${textField('Alignment','alignment', c.alignment || '')}
          ${textField('Background','background', c.background || '')}
          ${numField('AC','combat.ac', c.combat.ac)}
          ${numField('Proficiency','combat.proficiency_bonus', c.combat.proficiency_bonus)}
          ${numField('Speed','combat.speed', c.combat.speed)}
          ${numField('Inspiration','inspiration', toInt(c.inspiration, 0))}
          <label class="col" style="gap:6px;">
            <div class="mini" style="display:flex;align-items:center;gap:4px;">
              Initiative
              ${fieldStar('_initiative','Initiative')}
              <button id="btnInitToggle" style="background:none;border:none;cursor:pointer;font-size:11px;color:var(--muted);margin-left:auto;padding:0;">&#9660; bonus</button>
            </div>
            <span class="pill" style="font-size:1.1em; font-weight:700;">${initTotal >= 0 ? '+' : ''}${initTotal}</span>
            <div class="mini muted">DEX mod (${dexMod >= 0 ? '+' : ''}${dexMod}) + bonus (${initExtra >= 0 ? '+' : ''}${initExtra})</div>
          </label>
          <div id="initBonusField" style="display:none;">${numField('Init Extra Bonus','combat.initiative_mod', initExtra).replace(fieldStar('combat.initiative_mod','Init Extra Bonus'),'')}</div>
        </div>
        <div class="grid2" style="margin-top:10px;">
          <label class="col" style="gap:6px;">
            <div class="mini" style="display:flex;align-items:center;gap:4px;">
              Passive Perception
              ${fieldStar('_passive_perception','Passive Perception')}
              <button id="btnPpToggle" style="background:none;border:none;cursor:pointer;font-size:11px;color:var(--muted);margin-left:auto;padding:0;">&#9660; bonus</button>
            </div>
            <span class="pill" style="font-size:1.1em; font-weight:700;">${passivePerception}</span>
            <div class="mini muted">10 + WIS (${wisMod >= 0 ? '+' : ''}${wisMod})${percProf ? ` + Prof (+${profBonus})` : ''} + bonus (${ppBonus >= 0 ? '+' : ''}${ppBonus})</div>
          </label>
          <div id="ppBonusField" style="display:none;">${numField('PP Extra Bonus','combat.pp_bonus', ppBonus).replace(fieldStar('combat.pp_bonus','PP Extra Bonus'),'')}</div>
        </div>

        <h2 style="margin-top:14px;">HP</h2>
        <div class="grid3">
          ${numField('Max','hp.max', c.hp.max)}
        </div>

        <h2 style="margin-top:14px;">Hit Dice ${fieldStar('_hit_dice','Hit Dice')}</h2>
        <div class="grid2">
          <label class="col" style="gap:4px;"><div class="mini">Die Type</div>
            <select data-sel="hit_dice.die">
              ${['d4','d6','d8','d10','d12','d20'].map(o => `<option value="${o}" ${((c.hit_dice||{}).die||'d8')===o?'selected':''}>${o}</option>`).join('')}
            </select>
          </label>
          <label class="col" style="gap:4px;"><div class="mini">Total</div>
            <input type="number" data-num="hit_dice.total" value="${(c.hit_dice||{}).total||(c.level||1)}" min="1" />
          </label>
        </div>

        <div class="row" style="margin-top:14px; align-items:center;">
          <button class="btn" id="btnToggleCaster">${isCaster ? 'Disable Spellcasting' : 'Enable Spellcasting'}</button>
        </div>

        <div class="mini" style="margin-top:14px; font-weight:600; display:flex; align-items:center; gap:4px;">Proficiencies${fieldStar('_proficiencies','Proficiencies')}</div>
        <div class="row" style="margin-top:6px;">
          <input type="text" id="profInput" placeholder="Add a proficiency…" style="flex:1;" />
          <button class="btn" id="btnAddProf">Add</button>
        </div>
        <div class="row" style="margin-top:8px; flex-wrap:wrap; gap:6px;">
          ${(c.proficiencies||[]).length ? (c.proficiencies||[]).map((x,i) => `<span class="pill">${escapeHtml(x)} <a href="#" data-del-prof="${i}" title="remove">×</a></span>`).join('') : `<div class="mini">No proficiencies added.</div>`}
        </div>

        <div class="mini" style="margin-top:14px; font-weight:600; display:flex; align-items:center; gap:4px;">Languages${fieldStar('_languages','Languages')}</div>
        <div class="row" style="margin-top:6px;">
          <input type="text" id="langInput" placeholder="Add a language…" style="flex:1;" />
          <button class="btn" id="btnAddLang">Add</button>
        </div>
        <div class="row" style="margin-top:8px; flex-wrap:wrap; gap:6px;">
          ${(c.languages||[]).length ? (c.languages||[]).map((x,i) => `<span class="pill">${escapeHtml(x)} <a href="#" data-del-lang="${i}" title="remove">×</a></span>`).join('') : `<div class="mini">No languages added.</div>`}
        </div>
      </div>
    </div>
  `;
  $('#contentCard').innerHTML = editHtml;

  wireTextFields('#contentCard');
  wireNumberFields('#contentCard');
  wireSelectFields('#contentCard');

  // Re-render when initiative/PP bonus changes so computed pills update
  const initInpC = $('#contentCard').querySelector('[data-num="combat.initiative_mod"]');
  if (initInpC) initInpC.oninput = () => { c.combat.initiative_mod = toInt(initInpC.value, 0); render(); };
  const ppInpC = $('#contentCard').querySelector('[data-num="combat.pp_bonus"]');
  if (ppInpC) ppInpC.oninput = () => { c.combat.pp_bonus = toInt(ppInpC.value, 0); render(); };

  // Collapsible bonus toggles
  const btnInitToggle = document.getElementById('btnInitToggle');
  if (btnInitToggle) btnInitToggle.onclick = () => {
    const f = document.getElementById('initBonusField');
    const open = f.style.display === 'none';
    f.style.display = open ? 'block' : 'none';
    btnInitToggle.innerHTML = open ? '&#9650; bonus' : '&#9660; bonus';
  };
  const btnPpToggle = document.getElementById('btnPpToggle');
  if (btnPpToggle) btnPpToggle.onclick = () => {
    const f = document.getElementById('ppBonusField');
    const open = f.style.display === 'none';
    f.style.display = open ? 'block' : 'none';
    btnPpToggle.innerHTML = open ? '&#9650; bonus' : '&#9660; bonus';
  };

  const nameInput = $('#contentCard').querySelector('[data-text="name"]');
  if (nameInput) {
    // Inject error message element after the input
    const errSpan = document.createElement('div');
    errSpan.className = 'mini';
    errSpan.style.cssText = 'color:var(--bad); display:none; margin-top:2px;';
    nameInput.parentNode.appendChild(errSpan);

    nameInput.oninput = () => {
      const newName = nameInput.value.trim();
      const chars = loadAllChars();
      if (newName && chars[newName] && newName !== currentSaveName) {
        errSpan.textContent = `"${newName}" already exists — name not saved.`;
        errSpan.style.display = 'block';
        nameInput.style.borderColor = 'var(--bad)';
        // Do NOT update state.character.name
      } else {
        errSpan.style.display = 'none';
        nameInput.style.borderColor = '';
        setPath(state.character, 'name', nameInput.value);
        renderHeader();
      }
    };
  }

  $('#btnAddLang').onclick = () => {
    const v = ($('#langInput').value || '').trim();
    if (!v) return;
    c.languages = c.languages || [];
    if (!c.languages.includes(v)) c.languages.push(v);
    $('#langInput').value = '';
    render();
  };
  $('#langInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btnAddLang').click(); });
  $('#contentCard').querySelectorAll('[data-del-lang]').forEach(a => {
    a.onclick = e => {
      e.preventDefault();
      c.languages.splice(toInt(a.dataset.delLang, -1), 1);
      render();
    };
  });

  $('#btnAddProf').onclick = () => {
    const v = ($('#profInput').value || '').trim();
    if (!v) return;
    c.proficiencies = c.proficiencies || [];
    if (!c.proficiencies.includes(v)) c.proficiencies.push(v);
    $('#profInput').value = '';
    render();
  };
  $('#profInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btnAddProf').click(); });
  $('#contentCard').querySelectorAll('[data-del-prof]').forEach(a => {
    a.onclick = e => {
      e.preventDefault();
      c.proficiencies.splice(toInt(a.dataset.delProf, -1), 1);
      render();
    };
  });

  $('#btnToggleCaster').onclick = () => {
    if (c.spellcasting) {
      c.spellcasting = null;
    } else {
      c.spellcasting = {
        ability: 'INT', save_dc: 0, attack_bonus: 0, notes: '',
        spell_slots: [ { level: 1, max: 0, used: 0 } ],
        cantrips: [], prepared_spells: [], known_spells: []
      };
    }
    render();
  };
}
