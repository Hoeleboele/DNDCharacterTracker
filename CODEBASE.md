# CharacterTracker — Codebase Reference

## Overview
A single-page D&D 5e character tracker app. Pure vanilla JS (no build step), Firebase Firestore + Auth for cloud sync, PeerJS for multiplayer. All state lives in a single `state` global. Tabs render into `#contentCard`.

---

## Entry Point

### `index.html`
Static shell. Defines:
- `#landingOverlay` — landing screen (character picker, host/join buttons, auth bar)
- `#hostView` — DM's multiplayer overview panel
- `.app` — main app wrapper containing `#headerCard`, `#tabsCard`, `#contentCard`
- Script load order: CDN libs → `constants.js` → `state.js` → `utils.js` → `fields.js` → `data.js` → `storage.js` → `firebase.js` → `actions.js` → `render.js` → `multiplayer.js` → `landing.js` → tabs → `boot.js`

### `styles.css`
All styling. CSS custom properties on `:root` for theming (`--accent`, `--bg`, `--card`, `--line`, `--text`, `--muted`, `--good`, `--bad`, `--warn`). Key classes: `.card`, `.btn`, `.pill`, `.item`, `.list`, `.grid2`, `.grid3`, `.hpbar/.hpfill`, `.mini`, `.muted`.

---

## Core JS Files (`js/`)

### `constants.js`
- Storage key constants: `STORAGE_KEY`, `CHARS_KEY`, `FAV_TABS_KEY`, `STARRED_FIELDS_KEY`, `SETTINGS_KEY`
- `EXAMPLE` — full example character object (schema `dnd-char-tracker@1`)
- `DMGPT_PROMPT` — system prompt string for AI export

### `state.js`
Global mutable state variables:
- `appSettings` — `{ colorMode, cardGlow, autosaveMs, cloudSaveOnExit, showTutorial, showAppTutorial }`; persisted via `SETTINGS_KEY`
- `starredFields` — `[{ key, label }]`; fields pinned to Overview; persisted via `STARRED_FIELDS_KEY`
- `loadAllChars()` / `saveChar(charState)` / `deleteChar(name)` — multi-character localStorage CRUD (key: `CHARS_KEY`); includes legacy migration from `STORAGE_KEY`
- `newBlank()` — returns a default blank character state object (full schema)

### `utils.js`
Pure helpers — no side effects:
- `$` — alias for `document.querySelector`
- `clamp(n, min, max)`, `deepClone(obj)`, `toInt(v, fallback)`
- `stripCodeFences(txt)`, `parseJSONLoose(input)` — JSON parsing from AI output
- `normalize(data)` — deep-merges partial data onto `newBlank()`; coerces all types
- `deepMerge`, `setPath(obj, dottedPath, value)`, `getPath(obj, dottedPath)` — dot-notation object access
- `escapeHtml(s)`, `escapeAttr(s)` — XSS-safe string helpers
- `safeFilename(s)`, `genCode()`, `charToCode(state)`, `codeToChar(code)` — share code encode/decode

### `constants.js` → also contains
- `computeExhaustionEffects(c)` — returns `{ effectiveSpeed, effectiveHpMax, flags: { death } }` based on `c.exhaustion`

### `fields.js`
HTML field component factory + two-way binding:
- `fieldStar(path, label)` — star/unstar button for Overview pinning
- `textField(label, path, value)` → `<input type="text" data-text="path">`
- `numField(label, path, value, min)` → `<input type="number" data-num="path">`
- `selectField(label, path, value, options)` → `<select data-sel="path">`
- `textAreaField(label, path, value)` → `<textarea data-area="path">`
- `wireTextFields(rootSel)`, `wireNumberFields(rootSel)`, `wireSelectFields(rootSel)`, `wireTextAreaFields(rootSel)` — attach `oninput` listeners that call `setPath(state.character, ...)` and re-render header

### `data.js`
External wiki fetch utilities (CORS proxied):
- `wikiLookupItem(itemName, itemType)` — fetches dnd5e.wikidot.com/armor or /weapons; returns AC string or damage/properties string
- `wikiLookupSpell(spellName)` — fetches dnd5e.wikidot.com/spell:{slug}; returns stats block string

### `actions.js`
Character mutation functions (all call `render()` after):
- `applyHpDelta(delta)` — damage absorbs temp HP first; healing capped at max
- `setTempHp(temp)`
- `doRest(kind)` — `'short'` or `'long'`; resets slots/resources/features per their `reset` flag

### `storage.js`
Persistence layer wrapping `state.js` functions:
- `saveToLocalStorage()` — calls `saveChar(state)`
- `downloadJSON()` — triggers browser download of `state` as `.json`
- `startAutosave()` / `stopAutosave()` — interval-based autosave using `appSettings.autosaveMs`
- `saveBtnLabel()` — returns save button label with optional cloud sync badge
- `flashSaveBtn(msg, duration)` — temporarily changes save button text
- `saveFavTabs()` — persists `favTabs` array to `FAV_TABS_KEY`

### `firebase.js`
Firebase compat SDK (loaded via CDN). Exposes:
- `fbAuth`, `fbDb`, `fbUser` (current user)
- `cloudSyncedData` — Map of name → last-synced JSON (drift detection)
- `updateAuthBar()` — re-renders sign-in/sign-out UI in landing
- `saveCharToCloud(charState, name?)`, `deleteCharFromCloud(name)`, `mergeCloudToLocal()` — Firestore sync
- `charCloudBadge(name, state)` — returns badge HTML if cloud state differs from local

### `render.js`
Top-level rendering orchestration:
- `render()` — calls `renderHeader()` + `renderTabs()` + `renderContent()` + `syncToHost()`
- `renderHeader()` — updates `#headerCard`; computes passive perception, exhaustion effects, conditions; HP bar
- `renderTabs()` — builds tab bar in `#tabsCard`; handles fav tabs, mobile drawer
- `renderContent()` — calls the active tab's render function based on `activeTab`

### `multiplayer.js`
PeerJS-based multiplayer (uses global `mpPeer`, `mpPlayerConns`, `mpHostConn`):
- `startHost()` — becomes DM; renders `#hostView` with connected players
- `joinGame(code)` — connects as player; syncs state to host on every `render()`
- `syncToHost()` — called by `render()`; sends `{ type:'sync', state }` to host if in player mode
- `renderHostView()` — DM panel showing all connected player sheets
- Key state: `gameMode` (`null` | `'host'` | `'player'`), `mpRoomCode`

### `landing.js`
Landing screen logic:
- `showLanding()` — shows `#landingOverlay`, hides `.app`
- `showCharPicker()` — populates `#charPickerList` from `loadAllChars()`
- `returnToMenu()` — saves and returns to landing
- `showTutorial(context)` — step-through tooltip overlay; context: `'landing'` or `'app'`

### `boot.js`
Sidebar button wiring + app initialization:
- Wires `#btnMainMenu`, `#btnGetCode`, `#btnCopyCode`, `#btnLoadCode`, `#btnWipe`
- Global `click` delegate for `.field-star-btn` (starred field toggling)
- Bootstraps app from `loadAllChars()` or shows landing

---

## Tab Files (`js/tabs/`)

All tab render functions receive `c = state.character` and write to `$('#contentCard').innerHTML`.

| File | Function | Renders |
|------|----------|---------|
| `overview.js` | `renderOverview(c)` | Starred fields grid + `getPath`/`setPath` computed values; virtual paths like `_initiative`, `_passive_perception`, `_hit_dice`, `_currency`, `_conditions`, `_spell_dc`, `_spell_atk`, `_slot_N` |
| `character.js` | `renderCharacter(c)` | Identity fields, ability scores, HP, hit dice, spellcasting config, proficiencies, languages, notes; uses all `*Field()` helpers |
| `combat.js` | `renderCombat(c)` | HP bar + damage/heal/temp controls, death saving throws, attacks list, actions list, inline spell slots (if caster) |
| `stats.js` | `renderStats(c)` | Ability scores (STR/DEX/CON/INT/WIS/CHA), skill proficiencies checklist, saving throw proficiencies |
| `spells.js` | `renderSpells(c)` | Spell slots (track used/max), cantrips, prepared spells, known spells; wiki lookup button; no-op if `c.spellcasting` is null |
| `features.js` | `renderFeatures(c)` | Resources (uses/max + reset type) and class features (optional uses); add/remove/edit inline |
| `inventory.js` | `renderInventory(c)` | Equipped items list, full inventory list (type: weapon/armor/misc), currency (CP/SP/EP/GP/PP); wiki lookup for weapons/armor |
| `conditions_exhaustion.js` | `renderConditionsExhaustion(c)` | Exhaustion level stepper (0–6) with effect descriptions; conditions pill list with add (dropdown + custom) and remove |
| `camp.js` | `renderCamp(c)` | Long Rest / Short Rest buttons → `doRest()`; hit dice tracker (spend 1); camp notes textarea |
| `settings.js` | `renderSettings()` | Color mode toggle, card glow toggle, autosave interval, cloud-save-on-exit; import/export JSON; share code; DMGPT prompt copy |

---

## State Schema (`state` global)

```
state = {
  schema: 'dnd-char-tracker@1',
  exported_at: ISO string,
  character: {
    id, name, level, class, subclass, race, alignment, background,
    combat: { ac, speed, initiative_mod, proficiency_bonus, pp_bonus },
    hp: { current, max, temp, notes },
    hit_dice: { die, total, used },
    ability_scores: { str, dex, con, int, wis, cha },
    skill_proficiencies: string[],       // skill keys e.g. 'perception'
    skill_disadvantages: string[],
    saving_throw_proficiencies: string[],
    spellcasting: null | {
      ability, save_dc, attack_bonus, dc_bonus, atk_bonus,
      notes, max_prepared,
      spell_slots: [{ level, max, used }],
      cantrips: [{ name, notes }],
      prepared_spells: [{ name, level, notes }],
      known_spells: [{ name, level, notes }]
    },
    resources: [{ name, max, used, reset, notes }],  // reset: 'short'|'long'|'none'
    features: [{ name, description, uses_max, uses_used, reset }],
    attacks: [{ name, to_hit, damage, notes }],
    actions: [{ name, description, notes }],
    inventory: {
      currency: { cp, sp, ep, gp, pp },
      items: [{ name, type, qty, equipped, notes }]
    },
    conditions: string[],
    exhaustion: 0–6,
    death_saves: { successes: bool[3], failures: bool[3] },
    proficiencies: string[],
    languages: string[],
    quests: [{ title, status, summary, steps:[{text,done}], rewards, notes }],
    notes: string,
    camp_notes: string,
    inspiration: number
  }
}
```

---

## Key Globals

| Variable | Declared in | Purpose |
|----------|-------------|---------|
| `state` | (boot/landing) | Active character state |
| `activeTab` | render.js | Current tab ID string |
| `favTabs` | render.js | `string[]` of pinned tab IDs (max 3) |
| `currentSaveName` | state.js | Name key used for localStorage save |
| `gameMode` | multiplayer.js | `null` \| `'host'` \| `'player'` |
| `appSettings` | state.js | App-level settings object |
| `starredFields` | state.js | `[{key, label}]` pinned to Overview |
| `menuOpen` | render.js | Whether the tab drawer is open |

---

## Tab IDs
`overview`, `character`, `combat`, `stats`, `spells`, `features`, `inventory`, `conditions_exhaustion`, `camp`, `settings`
