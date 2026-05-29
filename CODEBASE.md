# CharacterTracker — Codebase Reference

**Vanilla JS D&D 5e tracker:** Single-page app, Firebase cloud sync, PeerJS multiplayer, all state in `state` global.

## Entry Point

**HTML:** `#landingOverlay` (char picker, auth), `#hostView` (DM panel), `.app` container.
**Load order:** CDN libs → `constants.js` → `state.js` → `utils.js` → `fields.js` → `data.js` → `storage.js` → `firebase.js` → `actions.js` → `render.js` → `multiplayer.js` → `landing.js` → tabs → `boot.js`
**Styles:** CSS variables for theming; classes: `.card`, `.btn`, `.pill`, `.list`, `.grid2`, `.grid3`, `.hpbar`, `.mini`, `.muted`


## Core Files (`js/`)

| File | Purpose |
|------|---------|
| `constants.js` | Storage keys, `EXAMPLE` schema, `SKILLS` array, `DMGPT_PROMPT` |
| `state.js` | `appSettings`, `starredFields`, `loadAllChars()`, `saveChar()`, `deleteChar()`, `newBlank()`, `normalize()` |
| `utils.js` | Helpers: `$`, `clamp`, `deepClone`, `toInt`, `normalize`, `deepMerge`, `setPath`, `getPath`, `escapeHtml`, `escapeAttr`, `safeFilename`, `charToCode`, `codeToChar`, `computeExhaustionEffects` |
| `fields.js` | Form components: `textField`, `numField`, `selectField`, `textAreaField`, `fieldStar`, wire functions |
| `data.js` | Wiki lookups: `wikiLookupItem()`, `wikiLookupSpell()` |
| `actions.js` | Character mutations: `applyHpDelta()`, `setTempHp()`, `doRest()` |
| `storage.js` | Persistence: `saveToLocalStorage()`, `downloadJSON()`, `startAutosave()`, `saveBtnLabel()`, `flashSaveBtn()`, `saveFavTabs()` |
| `firebase.js` | Cloud: `fbAuth`, `fbDb`, `fbUser`, `updateAuthBar()`, `saveCharToCloud()`, `mergeCloudToLocal()` |
| `render.js` | Orchestration: `render()`, `renderHeader()`, `renderTabs()`, `renderContent()` |
| `multiplayer.js` | PeerJS: `startHost()`, `joinGame()`, `syncToHost()`, `renderHostView()` |
| `landing.js` | UI: `showLanding()`, `showCharPicker()`, `returnToMenu()`, `showTutorial()` |
| `boot.js` | Init: button wiring, field-star delegate, app bootstrap |


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


## State Schema

```
state.schema, exported_at
state.character: {
  id, name, level, class, subclass, race, alignment, background, inspiration, notes, camp_notes,
  combat: { ac, speed, initiative_mod, proficiency_bonus },
  hp: { current, max, temp, notes },
  hit_dice: { die, total, used },
  ability_scores: { str, dex, con, int, wis, cha },
  skill_proficiencies: string[], skill_disadvantages: string[], saving_throw_proficiencies: string[],
  proficiencies: string[], languages: string[],
  conditions: string[], exhaustion: 0-6,
  death_saves: { successes: bool[3], failures: bool[3] },
  spellcasting: null | { ability, save_dc, attack_bonus, notes, max_prepared,
    spell_slots: [{ level, max, used }], cantrips: [{ name, notes }],
    prepared_spells: [{ name, level, notes }], known_spells: [{ name, level, notes }]
  },
  resources: [{ name, max, used, reset, notes, is_action }],
  features: [{ name, description, uses_max, uses_used, reset, is_action }],
  attacks: [{ name, to_hit, damage, notes }],
  actions: [{ name, description, notes }],
  inventory: { currency: { cp, sp, ep, gp, pp }, items: [{ name, type, qty, equipped, notes }] },
  quests: [{ title, status, summary, steps: [{text, done}], rewards, notes }]
}
```


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
