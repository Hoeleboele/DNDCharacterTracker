function renderStats(c){
  if (!c.ability_scores) c.ability_scores = { str:10, dex:10, con:10, int:10, wis:10, cha:10 };
  if (!Array.isArray(c.skill_proficiencies)) c.skill_proficiencies = [];
  if (!Array.isArray(c.skill_disadvantages)) c.skill_disadvantages = [];
  if (!Array.isArray(c.saving_throw_proficiencies)) c.saving_throw_proficiencies = [];
  if (!Array.isArray(c.ability_disadvantages)) c.ability_disadvantages = [];
  const as = c.ability_scores;
  const profBonus = c.combat.proficiency_bonus || 2;

  const stats = [
    { key:'str', label:'Strength',     abbr:'STR' },
    { key:'dex', label:'Dexterity',    abbr:'DEX' },
    { key:'con', label:'Constitution', abbr:'CON' },
    { key:'int', label:'Intelligence', abbr:'INT' },
    { key:'wis', label:'Wisdom',       abbr:'WIS' },
    { key:'cha', label:'Charisma',     abbr:'CHA' },
  ];

  const SKILLS = [
    { key:'acrobatics',      label:'Acrobatics',      stat:'dex' },
    { key:'animal_handling', label:'Animal Handling',  stat:'wis' },
    { key:'arcana',          label:'Arcana',           stat:'int' },
    { key:'athletics',       label:'Athletics',        stat:'str' },
    { key:'deception',       label:'Deception',        stat:'cha' },
    { key:'history',         label:'History',          stat:'int' },
    { key:'insight',         label:'Insight',          stat:'wis' },
    { key:'intimidation',    label:'Intimidation',     stat:'cha' },
    { key:'investigation',   label:'Investigation',    stat:'int' },
    { key:'medicine',        label:'Medicine',         stat:'wis' },
    { key:'nature',          label:'Nature',           stat:'int' },
    { key:'perception',      label:'Perception',       stat:'wis' },
    { key:'performance',     label:'Performance',      stat:'cha' },
    { key:'persuasion',      label:'Persuasion',       stat:'cha' },
    { key:'religion',        label:'Religion',         stat:'int' },
    { key:'sleight_of_hand', label:'Sleight of Hand',  stat:'dex' },
    { key:'stealth',         label:'Stealth',          stat:'dex' },
    { key:'survival',        label:'Survival',         stat:'wis' },
  ];

  const statAbbr = { str:'STR', dex:'DEX', con:'CON', int:'INT', wis:'WIS', cha:'CHA' };

  function abilityMod(statKey){ return Math.floor((toInt(as[statKey], 10) - 10) / 2); }
  function modStr(score){ const m = Math.floor((score - 10) / 2); return (m >= 0 ? '+' : '') + m; }
  function skillTotal(sk){ return abilityMod(sk.stat) + (c.skill_proficiencies.includes(sk.key) ? profBonus : 0); }
  function skillModStr(sk){ const t = skillTotal(sk); return (t >= 0 ? '+' : '') + t; }

  $('#contentCard').innerHTML = `
    <div class="grid2">
      <div class="col">
        <h2>Ability Scores</h2>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px;" class="ability-scores-grid">
          <div class="col" style="gap:8px;">
            ${stats.slice(0,3).map(s => {
              const score = toInt(as[s.key], 10);
              const positive = score >= 10;
              return `
                <div class="stat-block">
                  <div class="stat-abbr">${s.abbr}</div>
                  <div class="stat-label">${s.label}</div>
                  <div class="stat-mod" data-stat-mod="${s.key}" style="color:${positive ? 'var(--good)' : 'var(--bad)'}">${modStr(score)}</div>
                  <input type="number" class="stat-input" data-stat="${s.key}" value="${score}" min="1" max="30" />
                </div>
              `;
            }).join('')}
          </div>
          <div class="col" style="gap:8px;">
            ${stats.slice(3).map(s => {
              const score = toInt(as[s.key], 10);
              const positive = score >= 10;
              return `
                <div class="stat-block">
                  <div class="stat-abbr">${s.abbr}</div>
                  <div class="stat-label">${s.label}</div>
                  <div class="stat-mod" data-stat-mod="${s.key}" style="color:${positive ? 'var(--good)' : 'var(--bad)'}">${modStr(score)}</div>
                  <input type="number" class="stat-input" data-stat="${s.key}" value="${score}" min="1" max="30" />
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>

      <div class="col">
        <h2>Skills <span class="mini" style="margin-left:6px;">Prof bonus: +${profBonus}</span></h2>
        <div class="skill-list" style="margin-top:10px;">
          ${stats.map(s => {
            const savePro = c.saving_throw_proficiencies.includes(s.key);
            const saveDis = c.ability_disadvantages.includes(s.key);
            const saveTotal = abilityMod(s.key) + (savePro ? profBonus : 0);
            return `
              <div class="skill-row ability-in-list">
                <button class="skill-prof-dot${savePro ? ' proficient' : ''}" data-save-toggle="${s.key}" title="Toggle saving throw proficiency"></button>
                <button class="skill-dis-btn${saveDis ? ' active' : ''}" data-save-dis="${s.key}" title="Toggle disadvantage">DIS</button>
                <span class="skill-mod-val" data-save-mod="${s.key}" style="color:${saveTotal >= 0 ? 'var(--good)' : 'var(--bad)'}">${saveTotal >= 0 ? '+' : ''}${saveTotal}</span>
                <span class="skill-name">${s.label}</span>
                <span class="skill-stat-tag">${s.abbr}</span>
              </div>
            `;
          }).join('')}

          <div style="height:1px;background:var(--line);margin:8px 0;"></div>

          ${SKILLS.map(sk => {
            const t = skillTotal(sk);
            const isProficient = c.skill_proficiencies.includes(sk.key);
            const isDis = c.skill_disadvantages.includes(sk.key);
            return `
              <div class="skill-row">
                <button class="skill-prof-dot${isProficient ? ' proficient' : ''}" data-skill-toggle="${sk.key}" title="Toggle proficiency"></button>
                <button class="skill-dis-btn${isDis ? ' active' : ''}" data-skill-dis="${sk.key}" title="Toggle disadvantage">DIS</button>
                <span class="skill-mod-val" data-skill-mod="${sk.key}" style="color:${t >= 0 ? 'var(--good)' : 'var(--bad)'}">${skillModStr(sk)}</span>
                <span class="skill-name">${sk.label}</span>
                <span class="skill-stat-tag">${statAbbr[sk.stat]}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;

  $('#contentCard').querySelectorAll('[data-stat]').forEach(inp => {
    inp.oninput = () => {
      const key = inp.dataset.stat;
      const val = clamp(toInt(inp.value, 10), 1, 30);
      c.ability_scores[key] = val;
      const modEl = $('#contentCard').querySelector(`[data-stat-mod="${key}"]`);
      modEl.textContent = modStr(val);
      modEl.style.color = val >= 10 ? 'var(--good)' : 'var(--bad)';
      // update any save-mod displays for this ability (ability rows and ability-in-list)
      $('#contentCard').querySelectorAll(`[data-save-mod="${key}"]`).forEach(el => {
        const isSavePro = c.saving_throw_proficiencies.includes(key);
        const saveVal = abilityMod(key) + (isSavePro ? profBonus : 0);
        el.textContent = (saveVal >= 0 ? '+' : '') + saveVal;
        el.style.color = saveVal >= 0 ? 'var(--good)' : 'var(--bad)';
      });

      // update any leftover legacy ability-mod pills (if present)
      const pillEl = $('#contentCard').querySelector(`[data-ability-mod="${key}"]`);
      if (pillEl) {
        pillEl.textContent = statAbbr[key] + ' ' + modStr(val);
        pillEl.style.color = val >= 10 ? 'var(--good)' : 'var(--bad)';
      }

      // update skills that use this ability
      SKILLS.filter(sk => sk.stat === key).forEach(sk => {
        const el = $('#contentCard').querySelector(`[data-skill-mod="${sk.key}"]`);
        if (!el) return;
        const t = skillTotal(sk);
        el.textContent = skillModStr(sk);
        el.style.color = t >= 0 ? 'var(--good)' : 'var(--bad)';
      });
    };
  });

  $('#contentCard').querySelectorAll('[data-skill-toggle]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.skillToggle;
      const idx = c.skill_proficiencies.indexOf(key);
      if (idx === -1) c.skill_proficiencies.push(key);
      else c.skill_proficiencies.splice(idx, 1);
      const isProficient = c.skill_proficiencies.includes(key);
      btn.classList.toggle('proficient', isProficient);
      const sk = SKILLS.find(s => s.key === key);
      const el = $('#contentCard').querySelector(`[data-skill-mod="${key}"]`);
      const t = skillTotal(sk);
      el.textContent = skillModStr(sk);
      el.style.color = t >= 0 ? 'var(--good)' : 'var(--bad)';
      saveToLocalStorage();
    };
  });

  $('#contentCard').querySelectorAll('[data-skill-dis]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.skillDis;
      const idx = c.skill_disadvantages.indexOf(key);
      if (idx === -1) c.skill_disadvantages.push(key);
      else c.skill_disadvantages.splice(idx, 1);
      btn.classList.toggle('active', c.skill_disadvantages.includes(key));
      saveToLocalStorage();
    };
  });

  // Saving throw proficiency toggles for abilities (update all matching elements)
  $('#contentCard').querySelectorAll('[data-save-toggle]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.saveToggle;
      const idx = c.saving_throw_proficiencies.indexOf(key);
      if (idx === -1) c.saving_throw_proficiencies.push(key);
      else c.saving_throw_proficiencies.splice(idx, 1);
      const isPro = c.saving_throw_proficiencies.includes(key);
      // update all save-toggle buttons for this ability
      $('#contentCard').querySelectorAll(`[data-save-toggle="${key}"]`).forEach(b => b.classList.toggle('proficient', isPro));
      // update all save-mod displays for this ability
      $('#contentCard').querySelectorAll(`[data-save-mod="${key}"]`).forEach(el => {
        const v = abilityMod(key) + (isPro ? profBonus : 0);
        el.textContent = (v >= 0 ? '+' : '') + v;
        el.style.color = v >= 0 ? 'var(--good)' : 'var(--bad)';
      });
      saveToLocalStorage();
    };
  });

  // Ability disadvantage toggles
  $('#contentCard').querySelectorAll('[data-save-dis]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.saveDis;
      const idx = c.ability_disadvantages.indexOf(key);
      if (idx === -1) c.ability_disadvantages.push(key);
      else c.ability_disadvantages.splice(idx, 1);
      const active = c.ability_disadvantages.includes(key);
      $('#contentCard').querySelectorAll(`[data-save-dis="${key}"]`).forEach(b => b.classList.toggle('active', active));
      saveToLocalStorage();
    };
  });
}
