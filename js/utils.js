// --- Helpers ---
const $ = (sel) => document.querySelector(sel);

function clamp(n, min, max){
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}


function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

function stripCodeFences(txt){
  const t = (txt || '').trim();
  // Remove ```json ... ``` or ``` ... ``` wrappers.
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : t;
}

function parseJSONLoose(input){
  const cleaned = stripCodeFences(input);
  // Some models output leading/trailing junk; try to extract first {...} block.
  if (!cleaned.startsWith('{')) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
  }
  return JSON.parse(cleaned);
}

function normalize(data){
  // Make a best-effort to accept partial data.
  const base = newBlank();
  const out = deepMerge(base, data || {});

  // Ensure required paths exist
  out.schema = out.schema || 'dnd-char-tracker@1';
  out.exported_at = out.exported_at || new Date().toISOString();
  out.character = out.character || base.character;
  out.character.combat = out.character.combat || base.character.combat;
  out.character.hp = out.character.hp || base.character.hp;

  // Coerce types
  out.character.level = toInt(out.character.level, 1);
  out.character.combat.ac = toInt(out.character.combat.ac, 10);
  out.character.combat.speed = toInt(out.character.combat.speed, 30);
  out.character.combat.initiative_mod = toInt(out.character.combat.initiative_mod, 0);
  out.character.combat.proficiency_bonus = toInt(out.character.combat.proficiency_bonus, 2);

  out.character.hp.max = toInt(out.character.hp.max, 1);
  out.character.hp.current = clamp(toInt(out.character.hp.current, out.character.hp.max), 0, out.character.hp.max);
  out.character.hp.temp = clamp(toInt(out.character.hp.temp, 0), 0, 999);

  if (out.character.spellcasting) {
    out.character.spellcasting.spell_slots = Array.isArray(out.character.spellcasting.spell_slots) ? out.character.spellcasting.spell_slots : [];
    out.character.spellcasting.cantrips = Array.isArray(out.character.spellcasting.cantrips) ? out.character.spellcasting.cantrips : [];
    out.character.spellcasting.prepared_spells = Array.isArray(out.character.spellcasting.prepared_spells) ? out.character.spellcasting.prepared_spells : [];
    out.character.spellcasting.known_spells = Array.isArray(out.character.spellcasting.known_spells) ? out.character.spellcasting.known_spells : [];
    if (out.character.spellcasting.max_prepared == null || toInt(out.character.spellcasting.max_prepared,1) < 1) out.character.spellcasting.max_prepared = 1;
    // Coerce slot levels
    out.character.spellcasting.spell_slots = out.character.spellcasting.spell_slots.map(s => ({
      level: toInt(s.level, 1),
      max: clamp(toInt(s.max, 0), 0, 99),
      used: clamp(toInt(s.used, 0), 0, 99)
    })).sort((a,b)=>a.level-b.level);
  }

  out.character.conditions = Array.isArray(out.character.conditions) ? out.character.conditions : [];
  out.character.death_saves = out.character.death_saves || { successes: [false,false,false], failures: [false,false,false] };
  out.character.death_saves.successes = Array.isArray(out.character.death_saves.successes) ? out.character.death_saves.successes.map(Boolean) : [false,false,false];
  out.character.death_saves.failures  = Array.isArray(out.character.death_saves.failures)  ? out.character.death_saves.failures.map(Boolean)  : [false,false,false];
  while (out.character.death_saves.successes.length < 3) out.character.death_saves.successes.push(false);
  while (out.character.death_saves.failures.length  < 3) out.character.death_saves.failures.push(false);
  out.character.resources = Array.isArray(out.character.resources) ? out.character.resources : [];
  out.character.features = Array.isArray(out.character.features) ? out.character.features : [];
  out.character.attacks = Array.isArray(out.character.attacks) ? out.character.attacks : [];
  out.character.quests = Array.isArray(out.character.quests) ? out.character.quests : [];
  if (out.character.hit_dice && typeof out.character.hit_dice === 'object') {
    out.character.hit_dice.total = Math.max(1, toInt(out.character.hit_dice.total, out.character.level || 1));
    out.character.hit_dice.used = clamp(toInt(out.character.hit_dice.used, 0), 0, out.character.hit_dice.total);
  }

  if (!out.character.inventory) out.character.inventory = deepClone(base.character.inventory);
  if (!out.character.inventory.currency) out.character.inventory.currency = deepClone(base.character.inventory.currency);
  if (!Array.isArray(out.character.inventory.items)) out.character.inventory.items = [];

  if (!out.character.ability_scores || typeof out.character.ability_scores !== 'object') {
    out.character.ability_scores = { str:10, dex:10, con:10, int:10, wis:10, cha:10 };
  }
  const as = out.character.ability_scores;
  for (const key of ['str','dex','con','int','wis','cha']) {
    as[key] = clamp(toInt(as[key], 10), 1, 30);
  }

  if (!Array.isArray(out.character.skill_proficiencies)) out.character.skill_proficiencies = [];
  if (!Array.isArray(out.character.skill_disadvantages)) out.character.skill_disadvantages = [];

  return out;
}

function deepMerge(target, source){
  if (!source || typeof source !== 'object') return target;
  const out = Array.isArray(target) ? target.slice() : { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target && typeof target[k] === 'object' && !Array.isArray(target[k])) {
      out[k] = deepMerge(target[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function toInt(v, fallback){
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function safeFilename(name){
  return String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || 'character';
}

function toast(msg){
  // Minimal, non-annoying: use alert for now.
  alert(msg);
}

function setPath(obj, dotted, value){
  const parts = String(dotted).split('.');
  let cur = obj;
  for (let i=0; i<parts.length-1; i++) {
    const p = parts[i];
    if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length-1]] = value;
}

// --- Escaping ---
function escapeHtml(str){
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function escapeAttr(str){
  return escapeHtml(str).replace(/\n/g,'&#10;');
}

function signed(n){
  const v = toInt(n, 0);
  return (v >= 0 ? '+' : '') + v;
}