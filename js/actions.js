// --- Actions ---
function applyHpDelta(delta){
  const c = state.character;
  const max = toInt(c.hp.max, 1);
  if (delta < 0) {
    // Damage: absorb into temp HP first
    const temp = toInt(c.hp.temp, 0);
    const absorbed = Math.min(temp, -delta);
    c.hp.temp = temp - absorbed;
    const remaining = -delta - absorbed;
    c.hp.current = clamp(toInt(c.hp.current, 0) - remaining, 0, max);
  } else {
    // Healing: never raises above max, never affects temp
    c.hp.current = clamp(toInt(c.hp.current, 0) + delta, 0, max);
  }
  render();
}

function setTempHp(temp){
  const c = state.character;
  c.hp.temp = clamp(toInt(temp, 0), 0, 999);
  render();
}

function doRest(kind){
  const c = state.character;
  if (kind === 'long') {
    c.hp.current = toInt(c.hp.max, 1);
    c.hp.temp = 0;
    // reset hit dice
    if (c.hit_dice) c.hit_dice.used = 0;
    // reset spell slots
    if (c.spellcasting?.spell_slots) {
      c.spellcasting.spell_slots.forEach(s => { s.used = 0; });
    }
  }

  // reset resources/features based on reset flag
  (c.resources || []).forEach(r => {
    const reset = String(r.reset || 'none').toLowerCase();
    if (kind === 'short' && reset === 'short') r.used = 0;
    if (kind === 'long' && (reset === 'short' || reset === 'long')) r.used = 0;
  });
  (c.features || []).forEach(f => {
    if (f.uses_max == null) return;
    const reset = String(f.reset || 'none').toLowerCase();
    if (kind === 'short' && reset === 'short') f.uses_used = 0;
    if (kind === 'long' && (reset === 'short' || reset === 'long')) f.uses_used = 0;
  });

  render();
}