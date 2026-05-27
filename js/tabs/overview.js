function getPath(obj, dotted){
  if (dotted === '_initiative') {
    const s = obj; const as2 = s.ability_scores||{};
    const dex = Math.floor((toInt(as2.dex,10)-10)/2);
    const extra = toInt((s.combat||{}).initiative_mod,0);
    return (dex+extra >= 0 ? '+' : '') + (dex+extra);
  }
  if (dotted === '_passive_perception') {
    const s = obj; const as2 = s.ability_scores||{};
    const wis = Math.floor((toInt(as2.wis,10)-10)/2);
    const prof = toInt((s.combat||{}).proficiency_bonus,2);
    const hasPP = Array.isArray(s.skill_proficiencies) && s.skill_proficiencies.includes('perception');
    const bonus = toInt((s.combat||{}).pp_bonus,0);
    return String(10 + wis + (hasPP ? prof : 0) + bonus);
  }
  if (dotted === '_hit_dice') {
    const hd = obj.hit_dice || {};
    return `${toInt(hd.total, obj.level||1)} / ${hd.die||'d8'}`;
  }
  if (dotted === '_currency') {
    const cur = (obj.inventory || {}).currency || {};
    return [['CP',cur.cp],['SP',cur.sp],['EP',cur.ep],['GP',cur.gp],['PP',cur.pp]]
      .map(([l,v]) => `${l}:\u00a0${toInt(v,0)}`).join(' / ');
  }
  if (dotted === '_proficiencies') {
    const profs = obj.proficiencies || [];
    return profs.length ? profs.join(', ') : 'None';
  }
  if (dotted === '_languages') {
    const langs = obj.languages || [];
    return langs.length ? langs.join(', ') : 'None';
  }
  if (dotted === '_conditions') {
    const conds = obj.conditions || [];
    return conds.length ? conds.join(', ') : 'None';
  }
  if (dotted === '_spell_dc') {
    const sc = obj.spellcasting || {}; const as2 = obj.ability_scores||{};
    const abilKey2 = (sc.ability||'INT').toLowerCase();
    const abilMod2 = Math.floor((toInt(as2[abilKey2],10)-10)/2);
    const prof2 = toInt((obj.combat||{}).proficiency_bonus,2);
    const bonus2 = toInt(sc.dc_bonus,0);
    return String(8 + prof2 + abilMod2 + bonus2);
  }
  if (dotted === '_spell_atk') {
    const sc = obj.spellcasting || {}; const as2 = obj.ability_scores||{};
    const abilKey2 = (sc.ability||'INT').toLowerCase();
    const abilMod2 = Math.floor((toInt(as2[abilKey2],10)-10)/2);
    const prof2 = toInt((obj.combat||{}).proficiency_bonus,2);
    const bonus2 = toInt(sc.atk_bonus,0);
    const val = prof2 + abilMod2 + bonus2;
    return (val >= 0 ? '+' : '') + val;
  }
  if (String(dotted).startsWith('_slot_')) {
    const lvl = toInt(String(dotted).replace('_slot_',''), 1);
    const slots = (obj.spellcasting||{}).spell_slots || [];
    const ss = slots.find(s => toInt(s.level,1) === lvl);
    if (!ss) return '—';
    const used = clamp(toInt(ss.used,0), 0, toInt(ss.max,0));
    return `${Math.max(0, toInt(ss.max,0)-used)} / ${toInt(ss.max,0)}`;
  }
  return String(dotted).split('.').reduce((cur, p) => (cur != null ? cur[p] : undefined), obj);
}

function tabForKey(key){
  if (key.startsWith('_slot_') || key.startsWith('spellcasting.')) return 'spells';
  if (key.startsWith('inventory.')) return 'inventory';
  if (key === '_currency') return 'inventory';
  if (key === '_proficiencies' || key === '_languages') return 'class_race';
  if (key.startsWith('ability_scores.') || key.startsWith('skill_')) return 'stats';
  if (key === 'attacks' || key === 'actions' || key === 'combat_spells') return 'combat';
  if (key.startsWith('resources.') || key.startsWith('features.')) return 'features';
  if (key === '_spell_dc' || key === '_spell_atk') return 'spells';
  if (key === '_conditions') return 'combat';
  return 'class_race';
}

function renderOverview(c){
  const starred = starredFields;

  const rows = starred.map(f => {
    const val = getPath(c, f.key);
    const display = val == null || val === '' ? '<span style="color:var(--muted)">—</span>' : escapeHtml(String(val));
    const tab = tabForKey(f.key);
    return `
      <div class="row" style="justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--line); gap:8px;">
        <button class="btn" data-jump-tab="${escapeAttr(tab)}" style="flex-shrink:0; padding:4px 10px; font-size:12px;">Jump to</button>
        <span class="mini" style="color:var(--muted); flex:1;">${escapeHtml(f.label)}</span>
        <span style="font-weight:600; text-align:right; flex:1;">${display}</span>
        <button data-unstar-key="${escapeAttr(f.key)}" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--muted);padding:0 4px;flex-shrink:0;" title="Remove from overview">×</button>
      </div>
    `;
  }).join('');

  $('#contentCard').innerHTML = `
    <h2>Overview</h2>
    ${starred.length === 0 ? `
      <div style="margin-top:32px; text-align:center; color:var(--muted); line-height:1.7;">
        <div style="font-size:2em; margin-bottom:12px;">✨</div>
        <div>This looks clean….</div>
        <div class="mini" style="margin-top:8px;">You can add stuff here by pressing the <span style="color:var(--warn);">★</span> throughout the app.</div>
      </div>
    ` : `
      <div style="margin-top:12px; max-width:520px;">
        ${rows}
      </div>
    `}
  `;

  $('#contentCard').querySelectorAll('[data-jump-tab]').forEach(btn => {
    btn.onclick = () => {
      activeTab = btn.dataset.jumpTab;
      renderContent();
      renderTabs();
    };
  });

  $('#contentCard').querySelectorAll('[data-unstar-key]').forEach(btn => {
    btn.onclick = () => {
      starredFields = starredFields.filter(f => f.key !== btn.dataset.unstarKey);
      saveStarredFields(starredFields);
      renderOverview(c);
    };
  });
}
