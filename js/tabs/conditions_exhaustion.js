function renderConditionsExhaustion(c){
  const lvl = clamp(toInt(c.exhaustion, 0), 0, 6);
  const explanations = {
    1: 'Disadvantage on ability checks.',
    2: 'Speed is halved.',
    3: 'Disadvantage on attack rolls and saving throws.',
    4: 'Hit point maximum is halved.',
    5: 'Speed is reduced to 0.',
    6: 'Death.'
  };

  const condOptions = ['Blinded','Charmed','Deafened','Frightened','Grappled','Incapacitated','Invisible','Paralyzed','Petrified','Poisoned','Prone','Restrained','Stunned','Unconscious'];

  $('#contentCard').innerHTML = `
    <div class="card" style="margin-bottom:12px; padding:12px 16px;">
      <div class="row" style="justify-content:space-between; margin-bottom:6px;">
        <div><b>Conditions & Exhaustion</b></div>
        <div class="muted">Manage conditions and exhaustion levels (1–6)</div>
      </div>

      <div style="margin-bottom:12px;">
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="btn" id="btnExhDec">−</button>
          <div id="exhValue" style="min-width:44px; text-align:center; font-weight:700;">${lvl}</div>
          <button class="btn" id="btnExhInc">+</button>
          <div class="mini muted" style="margin-left:8px;">Exhaustion level</div>
        </div>
        <div id="exhExplain" style="margin-top:10px;">
          <div class="mini" style="margin-bottom:6px;"><b>Level ${lvl}</b>: ${escapeHtml(explanations[lvl] || 'No exhaustion.')}</div>
          <div class="mini" style="color:var(--muted);">Levels are cumulative; higher levels include earlier effects.</div>
        </div>
      </div>

      <div style="border-top:1px solid var(--line); padding-top:10px;">
        <h2>Conditions</h2>
        <div class="row" style="margin-top:8px;">
          <select id="condInputConditions">
            <option value="">— Select condition —</option>
            ${condOptions.map(x => `<option value="${x}">${x}</option>`).join('')}
            <option value="__custom__">Custom...</option>
          </select>
          <button class="btn" id="btnAddCondConditions">Add</button>
        </div>
        <div class="row" style="margin-top:8px; flex-wrap:wrap; gap:6px;" id="condListConditions">
          ${(c.conditions||[]).length ? (c.conditions||[]).map((x,i)=>`<span class="pill">${escapeHtml(x)} <a href="#" data-del-cond-conditions="${i}" title="remove">×</a></span>`).join('') : `<div class="mini">No conditions.</div>`}
        </div>
      </div>
    </div>
  `;

  function applyExhaustionEffects(character){
    const e = computeExhaustionEffects(character);
    let changed = false;
    character.conditions = character.conditions || [];
    if (e.flags.death) {
      if (toInt(character.hp?.current, 0) !== 0) { character.hp.current = 0; changed = true; }
      if (!character.conditions.includes('Dead')) { character.conditions.push('Dead'); changed = true; }
    } else {
      if (character.conditions.includes('Dead')) { character.conditions = character.conditions.filter(x=>x!=='Dead'); changed = true; }
      if (toInt(character.hp?.current, 0) > e.effectiveHpMax) { character.hp.current = e.effectiveHpMax; changed = true; }
    }
    if (changed) saveToLocalStorage();
  }

  document.getElementById('btnExhInc').onclick = () => {
    const next = clamp(toInt(c.exhaustion, 0) + 1, 0, 6);
    if (next === toInt(c.exhaustion, 0)) return;
    c.exhaustion = next;
    applyExhaustionEffects(c);
    render();
  };
  document.getElementById('btnExhDec').onclick = () => {
    const prev = clamp(toInt(c.exhaustion, 0) - 1, 0, 6);
    if (prev === toInt(c.exhaustion, 0)) return;
    c.exhaustion = prev;
    applyExhaustionEffects(c);
    render();
  };

  document.getElementById('btnAddCondConditions').onclick = () => {
    let v = (document.getElementById('condInputConditions').value || '').trim();
    if (!v) return;
    if (v === '__custom__'){
      const custom = prompt('Enter custom condition:');
      if (!custom || !custom.trim()) return;
      v = custom.trim();
    }
    c.conditions = c.conditions || [];
    if (!c.conditions.includes(v)) c.conditions.push(v);
    document.getElementById('condInputConditions').value = '';
    saveToLocalStorage();
    render();
  };

  $('#contentCard').querySelectorAll('[data-del-cond-conditions]').forEach(a => {
    a.onclick = (e) => {
      e.preventDefault();
      const idx = toInt(a.dataset.delCondConditions, -1);
      if (idx >= 0) c.conditions.splice(idx, 1);
      saveToLocalStorage();
      render();
    };
  });
}
