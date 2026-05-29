// renderHeader.js — Header card rendering with HP, AC, conditions

function renderHeader(){
  const c = state.character;
  const title = `${escapeHtml(c.name)} · Level ${c.level} ${escapeHtml(c.class)}${c.subclass ? ` (${escapeHtml(c.subclass)})` : ''}`;
  const sub = [c.race, c.background].filter(Boolean).map(escapeHtml).join(' · ');

  const as = c.ability_scores || {};
  const profBonus = toInt(c.combat.proficiency_bonus, 2);
  const wisMod = Math.floor((toInt(as.wis, 10) - 10) / 2);
  const percProf = Array.isArray(c.skill_proficiencies) && c.skill_proficiencies.includes('perception');
  const passivePerception = 10 + wisMod + (percProf ? profBonus : 0) + toInt(c.combat.pp_bonus, 0);

  // Apply exhaustion-derived computed values and persist minimal changes (clamp HP, dead flag)
  const effects = computeExhaustionEffects(c);
  const displayedSpeed = effects.effectiveSpeed ?? (c.combat?.speed ?? 30);
  const displayedHpMax = effects.effectiveHpMax ?? (c.hp.max || 1);
  c.conditions = c.conditions || [];
  let _changed = false;
  if (effects.flags.death) {
    if (toInt(c.hp.current, 0) !== 0) { c.hp.current = 0; _changed = true; }
    if (!c.conditions.includes('Dead')) { c.conditions.push('Dead'); _changed = true; }
  } else {
    if (c.conditions.includes('Dead')) { c.conditions = c.conditions.filter(x => x !== 'Dead'); _changed = true; }
    if (toInt(c.hp.current, 0) > displayedHpMax) { c.hp.current = displayedHpMax; _changed = true; }
  }
  if (_changed) saveToLocalStorage();

  const hpMax = displayedHpMax;
  const hpCur = clamp(Number(c.hp.current) || 0, 0, hpMax);
  const pct = Math.round((hpCur / hpMax) * 100);
  const low = pct <= 33;

  const conditions = (c.conditions || []).slice(0, 6).map(x => `<span class="pill">${escapeHtml(x)}</span>`).join('');

  $('#headerCard').innerHTML = `
    <div class="row" style="justify-content:space-between; align-items:flex-start;">
      <div class="col" style="gap:6px; min-width:240px;">
        <div style="display:flex; flex-direction:column; gap:4px;">
          <div style="font-size:18px; font-weight:700;">${title}</div>
          <div class="mini">${sub || '<span class="muted">(race/background not set)</span>'}</div>
        </div>
        <div class="row" style="gap:8px;">
          <button class="btn" id="btnSaveLocal" style="padding:5px 14px; font-size:13px;">${saveBtnLabel()}</button>
        </div>
        <div class="row" style="gap:8px;">
          <span class="pill">AC <b style="color:var(--text)">${c.combat.ac}</b></span>
          <span class="pill">Speed <b style="color:var(--text)">${displayedSpeed}</b></span>
          <span class="pill">Init <b style="color:var(--text)">${signed(Math.floor((toInt(c.ability_scores?.dex,10)-10)/2) + toInt(c.combat.initiative_mod,0))}</b></span>
          <span class="pill">PP <b style="color:var(--text)">${passivePerception}</b></span>
        </div>
      </div>

      <div class="col" style="flex:1; max-width:520px;">
        <div class="row" style="justify-content:space-between;">
          <div><b>HP</b> <span class="muted">(temp: ${c.hp.temp || 0})</span></div>
          <div class="muted">${hpCur} / ${hpMax} (${pct}%)</div>
        </div>
        <div class="hpbar" aria-label="HP bar">
          <div class="hpfill ${low ? 'low':''}" style="width:${pct}%;"></div>
        </div>
        <div class="row" style="margin-top:8px;">
          ${(c.conditions || []).length ? `<div class="row" style="gap:6px;">${conditions}</div>` : `<div class="mini">No conditions set. Miracles do happen.</div>`}
        </div>
      </div>
    </div>
  `;

  // Wire header save button
  $('#btnSaveLocal').onclick = () => {
    state.exported_at = new Date().toISOString();
    flashSaveBtn('Saving…', 0);
    const ok = saveToLocalStorage();
    flashSaveBtn(ok ? 'Saved ✓' : 'Save failed', 2000);
  };

  // Apply tab color glow to header card
  const headerCard = document.getElementById('headerCard');
  if (headerCard) {
    const rgb = tabRgb(activeTab);
    headerCard.style.border = `1px solid rgba(${rgb},${appSettings.cardGlow ? '0.65' : '0.2'})`;
    headerCard.style.boxShadow = appSettings.cardGlow
      ? `0 14px 30px rgba(0,0,0,.35), 0 0 0 1px rgba(${rgb},0.25), 0 0 28px rgba(${rgb},0.35)`
      : `0 14px 30px rgba(0,0,0,.35)`;
  }
}
