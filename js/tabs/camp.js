function renderCamp(c){
  const hd = c.hit_dice || { die: 'd8', total: c.level || 1, used: 0 };
  const hdUsed = toInt(hd.used, 0);
  const hdTotal = toInt(hd.total, 1);
  const hdAvail = Math.max(0, hdTotal - hdUsed);

  $('#contentCard').innerHTML = `
    <h2>Camp</h2>

    <div class="col" style="gap:10px; max-width:420px; margin-bottom:28px;">
      <div class="mini">Take a rest to recover HP, spell slots, and resources.</div>
      <div class="row" style="gap:12px;">
        <button class="btn" id="btnLongRest" style="flex:1; padding:14px 0; font-size:1.05em;">&#x1F319; Long Rest</button>
        <button class="btn" id="btnShortRest" style="flex:1; padding:14px 0; font-size:1.05em;">&#x26FA; Short Rest</button>
      </div>
      <div class="mini muted">Short rest: recovers short-rest resources. Long rest: restores HP, spell slots, all resources, and all hit dice.</div>
    </div>

    <h2>Hit Dice</h2>
    <div class="col" style="gap:10px; max-width:420px; margin-bottom:28px;">
      <div class="row" style="gap:8px; align-items:center;">
        <span class="pill" style="font-size:1em;">${hdAvail} / ${hdTotal} ${hd.die || 'd8'} available</span>
        <button class="btn" id="btnSpendHd" ${hdAvail < 1 ? 'disabled' : ''}>Spend 1</button>
      </div>
    </div>

    <h2>Camp Notes</h2>
    <div style="margin-top:8px; max-width:660px;">
      ${textAreaField('Camp Notes','camp_notes', c.camp_notes || '')}
    </div>
  `;

  $('#btnLongRest').onclick = () => { if (confirm('Take a Long Rest? This will restore HP, spell slots, and all resources.')) doRest('long'); };
  $('#btnShortRest').onclick = () => doRest('short');
  $('#btnSpendHd').onclick = () => {
    c.hit_dice = c.hit_dice || { die: 'd8', total: c.level || 1, used: 0 };
    c.hit_dice.used = Math.min(toInt(c.hit_dice.used, 0) + 1, toInt(c.hit_dice.total, 1));
    render();
  };

  wireTextAreaFields('#contentCard');
}
