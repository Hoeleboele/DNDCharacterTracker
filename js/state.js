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
      exhaustion: 0,
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