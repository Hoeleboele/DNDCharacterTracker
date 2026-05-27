const STORAGE_KEY = 'dndCharTracker.v1';       // legacy single-char key
const CHARS_KEY   = 'dndCharTracker.chars';     // multi-char store: { name → state }
const FAV_TABS_KEY = 'dndCharTracker.favTabs';  // favorited tab IDs (max 3)
const STARRED_FIELDS_KEY = 'dndCharTracker.starred'; // starred fields: [{key,label}]
const SETTINGS_KEY = 'dndCharTracker.settings'; // app settings

const EXAMPLE = {
  schema: 'dnd-char-tracker@1',
  exported_at: new Date().toISOString(),
  character: {
    id: 'corax-01',
    name: 'Corax',
    level: 3,
    class: 'Cleric',
    subclass: 'Grave Domain',
    race: 'Human',
    background: 'Acolyte',
    combat: { ac: 16, speed: 30, initiative_mod: 1, proficiency_bonus: 2 },
    hp: { current: 21, max: 24, temp: 0, notes: 'Spare the Dying cantrip does not require a spell slot.' },
    spellcasting: {
      ability: 'WIS',
      save_dc: 13,
      attack_bonus: 5,
      notes: 'Prepare spells after a long rest.',
      spell_slots: [
        { level: 1, max: 4, used: 1 },
        { level: 2, max: 2, used: 0 }
      ],
      cantrips: [
        { name: 'Sacred Flame', notes: '' },
        { name: 'Guidance', notes: '' },
        { name: 'Spare the Dying', notes: 'Bonus range with Grave? (check feature)' }
      ],
      prepared_spells: [
        { name: 'Bless', level: 1, notes: '' },
        { name: 'Healing Word', level: 1, notes: '' },
        { name: 'Lesser Restoration', level: 2, notes: '' }
      ],
      known_spells: []
    },
    resources: [
      { name: 'Channel Divinity', max: 1, used: 0, reset: 'short', notes: 'Path to the Grave, etc.' }
    ],
    features: [
      { name: 'Circle of Mortality', description: 'Maximize healing dice on a creature with 0 HP.', uses_max: null, uses_used: null, reset: 'none' },
      { name: 'Sentinel at Death\'s Door', description: 'Cancel crits (later levels).', uses_max: null, uses_used: null, reset: 'none' }
    ],
    attacks: [
      { name: 'Mace', to_hit: 4, damage: '1d6+2 bludgeoning', notes: '' },
      { name: 'Sacred Flame', to_hit: null, damage: '1d8 radiant (DEX save)', notes: '' }
    ],
    inventory: {
      currency: { cp: 2, sp: 8, ep: 0, gp: 14, pp: 0 },
      items: [
        { name: 'Shield', qty: 1, equipped: true, notes: '+2 AC' },
        { name: 'Chain Shirt', qty: 1, equipped: true, notes: '' },
        { name: 'Holy Symbol', qty: 1, equipped: true, notes: '' },
        { name: 'Rations', qty: 6, equipped: false, notes: '' }
      ]
    },
    quests: [
      {
        title: 'Find the Source of the Blight',
        status: 'active',
        summary: 'Track the unnatural pressure points in the forest and stop the cause.',
        steps: [
          { text: 'Reach the next node', done: false },
          { text: 'Disable the transmitting drone', done: false }
        ],
        rewards: 'Council favor',
        notes: ''
      }
    ],
    conditions: [],
    notes: 'Don\'t forget: long rest resets spell slots and most resources.'
  }
};

const DMGPT_PROMPT = `You are DMGPT. When the user types /exportcharacter you MUST output EXACTLY ONE JSON code block and nothing else.

Rules:
- Output must be valid JSON.
- Use schema = "dnd-char-tracker@1".
- Do not add commentary outside the JSON code block.
- Numbers must be numbers (not strings).
- If a section is not applicable (e.g., spellcasting for a Fighter), use null or omit it.

Required structure:
{
"schema": "dnd-char-tracker@1",
"exported_at": "YYYY-MM-DDTHH:MM:SSZ",
"character": {
  "id": "stable-id",
  "name": "...",
  "level": 1,
  "class": "...",
  "subclass": "",
  "race": "",
  "background": "",
  "combat": { "ac": 0, "speed": 0, "initiative_mod": 0, "proficiency_bonus": 2 },
  "hp": { "current": 0, "max": 0, "temp": 0, "notes": "" },

  "spellcasting": {
    "ability": "INT|WIS|CHA",
    "save_dc": 0,
    "attack_bonus": 0,
    "notes": "",
    "spell_slots": [ { "level": 1, "max": 0, "used": 0 } ],
    "cantrips": [ { "name": "...", "notes": "" } ],
    "prepared_spells": [ { "name": "...", "level": 1, "notes": "" } ],
    "known_spells": [ { "name": "...", "level": 1, "notes": "" } ]
  },

  "resources": [ { "name": "...", "max": 0, "used": 0, "reset": "short|long|none", "notes": "" } ],
  "features": [ { "name": "...", "description": "...", "uses_max": null, "uses_used": null, "reset": "short|long|none" } ],
  "attacks": [ { "name": "...", "to_hit": 0, "damage": "...", "notes": "" } ],

  "inventory": {
    "currency": { "cp": 0, "sp": 0, "ep": 0, "gp": 0, "pp": 0 },
    "items": [ { "name": "...", "qty": 1, "equipped": false, "notes": "" } ]
  },

  "quests": [
    { "title": "...", "status": "active|completed|failed", "summary": "...", "steps": [ { "text": "...", "done": false } ], "rewards": "", "notes": "" }
  ],

  "conditions": ["..."],
  "notes": "..."
}
}`;

const TAB_COLORS = {
  overview:   '#94a3b8',  // slate — neutral, "big picture"
  stats:      '#38bdf8',  // sky blue — numbers, intellect
  class_race: '#fb923c',  // orange — personal identity
  features:   '#a3e635',  // lime — class abilities
  spells:     '#c084fc',  // purple — arcane magic
  combat:     '#f87171',  // red — danger
  inventory:  '#fbbf24',  // amber — treasure & items
  camp:       '#4ade80',  // green — rest & nature
  settings:   '#7cc0ff',  // accent blue — UI
};
function tabRgb(id){ if (!appSettings.colorMode) return '124,192,255'; const h=TAB_COLORS[id]||'#7cc0ff'; return `${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}`; }

const TAB_TIPS = {
  overview:   { title: '⭐ Overview',    body: 'This tab shows all your starred fields. Click the <b>☆</b> icon next to any field label in the app to pin it here.' },
  stats:      { title: '🎲 Stats',       body: 'Track your ability scores, saving throws, and skill proficiencies. Proficiencies are marked with a dot.' },
  class_race: { title: '👤 Character',   body: 'Set your identity, manage HP, configure spellcasting, and edit proficiencies and languages.' },
  features:   { title: '🌿 Features',    body: 'Manage class features and limited-use resources like Channel Divinity or Ki Points. Reset them on a short or long rest.' },
  spells:     { title: '✨ Spells',       body: 'Track spell slots, prepared spells, and cantrips. Your Save DC and Attack Bonus are calculated automatically.' },
  combat:     { title: '⚔️ Combat',      body: 'Track HP, death saves, attacks and conditions. Casters also get a Spells panel — use the toggle on mobile to switch between them.' },
  inventory:  { title: '🎒 Inventory',   body: 'Manage items, equipment, and currency. Mark items as equipped to track what your character is carrying.' },
  camp:       { title: '🏕️ Camp',        body: 'Take a Short or Long Rest to recover HP, spend hit dice, and reset your resources and spell slots.' },
  settings:   { title: '⚙️ Settings',    body: 'Customise tab colors, card glow, autosave interval, cloud sync, and tutorial preferences.' },
};

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const B32_DEC = Object.fromEntries([...B32].map((c,i) => [c,i]));
// Common look-alike substitutions
Object.assign(B32_DEC, { I:1, L:1, O:0, U:27 });