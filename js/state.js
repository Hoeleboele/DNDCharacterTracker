function loadAppSettings(){ try { const v = JSON.parse(localStorage.getItem(SETTINGS_KEY)); return Object.assign({ colorMode: true, cardGlow: true, autosaveMs: 30000, cloudSaveOnExit: true, showTutorial: true, showAppTutorial: true }, v || {}); } catch(_){ return { colorMode: true, cardGlow: true, autosaveMs: 30000, cloudSaveOnExit: true, showTutorial: true, showAppTutorial: true }; } }
function saveAppSettings(){ try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings)); } catch(_){} }
let appSettings = loadAppSettings();

function loadStarredFields(){ try { const v = JSON.parse(localStorage.getItem(STARRED_FIELDS_KEY)); return Array.isArray(v) ? v : []; } catch(_){ return []; } }
function saveStarredFields(arr){ try { localStorage.setItem(STARRED_FIELDS_KEY, JSON.stringify(arr)); } catch(_){} }
let starredFields = loadStarredFields();

function loadAllChars(){
  try {
    const raw = localStorage.getItem(CHARS_KEY);
    const chars = raw ? JSON.parse(raw) : {};
    // Migrate legacy single-char save if present and not already migrated
    const legacy = localStorage.getItem(STORAGE_KEY);
    if (legacy) {
      try {
        const legState = normalize(JSON.parse(legacy));
        const name = legState.character.name || 'Unnamed';
        if (!chars[name]) chars[name] = legState;
      } catch {}
      localStorage.removeItem(STORAGE_KEY);
    }
    return chars;
  } catch { return {}; }
}

function saveChar(charState){
  try {
    const chars = loadAllChars();
    const name = charState.character.name || 'Unnamed';
    const oldName = (currentSaveName && currentSaveName !== name) ? currentSaveName : null;
    if (oldName && chars[oldName]) delete chars[oldName];
    chars[name] = charState;
    currentSaveName = name;
    localStorage.setItem(CHARS_KEY, JSON.stringify(chars));
    return true;
  } catch { return false; }
}

function deleteChar(name){
  try {
    const chars = loadAllChars();
    delete chars[name];
    localStorage.setItem(CHARS_KEY, JSON.stringify(chars));
    deleteCharFromCloud(name); // fire-and-forget cloud sync
  } catch {}
}

/**
 * Base schema (compatible with the user's DMGPT export snippet), plus optional extensions.
 */

function newBlank() {
  const now = new Date().toISOString();
  return {
    schema: 'dnd-char-tracker@1',
    exported_at: now,
    character: {
      id: 'char-' + Math.random().toString(16).slice(2),
      name: 'Unnamed Adventurer',
      level: 1,
      class: 'Fighter',
      subclass: '',
      race: '',
      alignment: '',
      background: '',
      combat: { ac: 10, speed: 30, initiative_mod: 0, proficiency_bonus: 2 },
      hp: { current: 10, max: 10, temp: 0, notes: '' },

      // Optional spellcasting section (leave null/undefined for non-casters)
      spellcasting: null,

      // Optional extras
      conditions: [],
      resources: [],
      features: [],
      attacks: [],
      inventory: {
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
        items: []
      },
      quests: [],
      notes: '',
      ability_scores: { str:10, dex:10, con:10, int:10, wis:10, cha:10 },
      skill_proficiencies: [],
      skill_disadvantages: []
    }
  };
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

let state = normalize(newBlank());
let currentSaveName = null;   // tracks which name key we last saved under
let activeTab = 'overview';
let favTabs = (() => { try { const v = JSON.parse(localStorage.getItem(FAV_TABS_KEY)); return Array.isArray(v) ? v.slice(0,4) : []; } catch(_){ return []; } })();
if (!favTabs.length) favTabs = ['overview', 'combat', 'stats'];
let tabDrawerOpen = false;
let combatShowSpells = false;
let tutorialSeenTabs = new Set();
let menuOpen = false;

let gameMode = null;       // null | 'solo' | 'host' | 'player'