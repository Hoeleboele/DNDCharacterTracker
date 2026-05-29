// --- Rendering Orchestration ---
// Re-render tabs on resize so mobile/desktop layout switches
(() => {
  let _lastMobile = window.innerWidth < 640;
  window.addEventListener('resize', () => {
    const mobile = window.innerWidth < 640;
    if (mobile !== _lastMobile) { _lastMobile = mobile; renderTabs(); }
  });
})();

function render(){
  renderHeader();
  renderTabs();
  renderContent();
  syncToHost();
}

function renderContent(){
  const c = state.character;
  if (activeTab === 'overview') renderOverview(c);
  else if (activeTab === 'stats') renderStats(c);
  else if (activeTab === 'class_race') renderCharacter(c);
  else if (activeTab === 'features') renderFeatures(c);
  else if (activeTab === 'spells') renderSpells(c);
  else if (activeTab === 'combat') renderCombat(c);
  else if (activeTab === 'conditions_exhaustion') renderConditionsExhaustion(c);
  else if (activeTab === 'inventory') renderInventory(c);
  else if (activeTab === 'camp') renderCamp(c);
  else if (activeTab === 'settings') renderSettings();
  const rgb = tabRgb(activeTab);
  const card = document.getElementById('contentCard');
  if (card) {
    card.style.border = `1px solid rgba(${rgb},${appSettings.cardGlow ? '0.65' : '0.2'})`;
    card.style.boxShadow = appSettings.cardGlow
      ? `0 14px 30px rgba(0,0,0,.35), 0 0 0 1px rgba(${rgb},0.25), 0 0 28px rgba(${rgb},0.35)`
      : `0 14px 30px rgba(0,0,0,.35)`;
  }
  const headerCard = document.getElementById('headerCard');
  if (headerCard) {
    headerCard.style.border = `1px solid rgba(${rgb},${appSettings.cardGlow ? '0.65' : '0.2'})`;
    headerCard.style.boxShadow = appSettings.cardGlow
      ? `0 14px 30px rgba(0,0,0,.35), 0 0 0 1px rgba(${rgb},0.25), 0 0 28px rgba(${rgb},0.35)`
      : `0 14px 30px rgba(0,0,0,.35)`;
  }
}

