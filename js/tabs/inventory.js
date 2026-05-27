function renderInventory(c){
  const inv = c.inventory || { currency:{cp:0,sp:0,ep:0,gp:0,pp:0}, items:[] };
  const ITEM_TYPES = ['weapon','armor','misc'];

  $('#contentCard').innerHTML = `
    <div class="grid2">
      <div class="col">
        <h2>Equipped</h2>
        <div class="list" id="equippedList" style="margin-top:10px;"></div>
        <h2 style="margin-top:14px;">Inventory</h2>
        <div class="list" id="itemsList" style="margin-top:10px;"></div>
        <div class="row" style="margin-top:10px; gap:8px; flex-wrap:wrap;">
          <input type="text" id="newItemName" placeholder="Item name" style="flex:1; min-width:140px;" />
          <select id="newItemType" style="padding:6px 10px; border-radius:var(--radius); background:var(--btn); color:var(--text); border:1px solid var(--line);">
            ${ITEM_TYPES.map(t => `<option value="${t}">${t.charAt(0).toUpperCase()+t.slice(1)}</option>`).join('')}
          </select>
          <button class="btn" id="btnAddItem">Add Item</button>
        </div>
      </div>

      <div class="col">
        <h2 style="display:flex; align-items:center; gap:6px;">Currency${fieldStar('_currency','Currency')}</h2>
        <div class="grid3" style="margin-top:10px;">
          <label class="col" style="gap:4px;"><div class="mini">CP (Copper pieces)</div><input type="number" data-num="inventory.currency.cp" value="${escapeAttr(String(inv.currency.cp ?? 0))}" /></label>
          <label class="col" style="gap:4px;"><div class="mini">SP (Silver pieces)</div><input type="number" data-num="inventory.currency.sp" value="${escapeAttr(String(inv.currency.sp ?? 0))}" /></label>
          <label class="col" style="gap:4px;"><div class="mini">EP (Electrum piece)</div><input type="number" data-num="inventory.currency.ep" value="${escapeAttr(String(inv.currency.ep ?? 0))}" /></label>
          <label class="col" style="gap:4px;"><div class="mini">GP (Gold piece)</div><input type="number" data-num="inventory.currency.gp" value="${escapeAttr(String(inv.currency.gp ?? 0))}" /></label>
          <label class="col" style="gap:4px;"><div class="mini">PP (Platinum piece)</div><input type="number" data-num="inventory.currency.pp" value="${escapeAttr(String(inv.currency.pp ?? 0))}" /></label>
        </div>
      </div>
    </div>
  `;

  wireNumberFields('#contentCard');

  renderItems();

  $('#btnAddItem').onclick = () => {
    const name = ($('#newItemName').value || '').trim();
    if (!name) { $('#newItemName').focus(); return; }
    const type = $('#newItemType').value || 'misc';
    inv.items = inv.items || [];
    inv.items.push({ name, type, qty:1, equipped:false, notes:'' });
    c.inventory = inv;
    $('#newItemName').value = '';
    render();
  };

  function renderItems(){
    const items = inv.items || [];
    const equipped = items.filter(it => it.equipped);
    const unequipped = items.filter(it => !it.equipped);

    function itemHtml(it, i){
      const typeTag = it.type ? `<span class="pill" style="text-transform:capitalize;">${escapeHtml(it.type)}</span>` : '';
      return `
        <div class="item">
          <div style="flex:1;">
            <div class="row" style="justify-content:space-between; flex-wrap:wrap; gap:4px;">
              <div class="row" style="gap:6px; align-items:center;">
                <b>${escapeHtml(it.name || 'Item')}</b>
                ${typeTag}
              </div>
              <div class="row" style="gap:4px; align-items:center;">
                ${!['weapon','armor'].includes(it.type) ? `
                  <button class="btn" style="padding:2px 8px; font-size:0.9em;" data-it-dec="${i}">−</button>
                  <span class="pill">${Math.max(toInt(it.qty,0),0)}</span>
                  <button class="btn" style="padding:2px 8px; font-size:0.9em;" data-it-inc="${i}">+</button>
                ` : ''}
              </div>
            </div>
            ${it.notes ? `<div class="mini" style="margin-top:4px;">${escapeHtml(it.notes)}</div>` : ''}
          </div>
          <div class="row" style="justify-content:flex-end; flex-wrap:wrap;">
            <button class="btn" data-it-equip="${i}">${it.equipped ? 'Unequip' : 'Equip'}</button>
            ${['weapon','armor'].includes(it.type) ? `<button class="btn" data-it-lookup="${i}">Lookup</button>` : ''}
            <button class="btn" data-it-notes="${i}">Notes</button>
            <button class="btn danger" data-it-del="${i}">Delete</button>
          </div>
        </div>
      `;
    }

    $('#equippedList').innerHTML = equipped.length
      ? equipped.map(it => itemHtml(it, items.indexOf(it))).join('')
      : `<div class="mini">Nothing equipped.</div>`;

    $('#itemsList').innerHTML = unequipped.length
      ? unequipped.map(it => itemHtml(it, items.indexOf(it))).join('')
      : `<div class="mini">Inventory is empty.</div>`;

    ['#equippedList','#itemsList'].forEach(sel => {
      const list = $(sel);

      list.querySelectorAll('[data-it-equip]').forEach(btn => btn.onclick = () => {
        items[toInt(btn.dataset.itEquip,-1)].equipped ^= true;
        render();
      });

      list.querySelectorAll('[data-it-lookup]').forEach(btn => btn.onclick = async () => {
        const i = toInt(btn.dataset.itLookup, -1);
        const it = items[i];
        btn.disabled = true;
        btn.textContent = '…';
        try {
          const result = await wikiLookupItem(it.name, it.type);
          it.notes = result;
          render();
        } catch (e) {
          toast(e.message || 'Lookup failed.');
          btn.disabled = false;
          btn.textContent = 'Lookup';
        }
      });

      list.querySelectorAll('[data-it-inc]').forEach(btn => btn.onclick = () => {
        const it = items[toInt(btn.dataset.itInc,-1)];
        it.qty = clamp(toInt(it.qty,0) + 1, 0, 999);
        render();
      });

      list.querySelectorAll('[data-it-dec]').forEach(btn => btn.onclick = () => {
        const it = items[toInt(btn.dataset.itDec,-1)];
        it.qty = clamp(toInt(it.qty,0) - 1, 0, 999);
        render();
      });

      list.querySelectorAll('[data-it-notes]').forEach(btn => btn.onclick = () => {
        const it = items[toInt(btn.dataset.itNotes,-1)];
        const n = prompt('Notes:', it.notes ?? '');
        if (n == null) return;
        it.notes = n;
        render();
      });

      list.querySelectorAll('[data-it-del]').forEach(btn => btn.onclick = () => {
        items.splice(toInt(btn.dataset.itDel,-1), 1);
        render();
      });
    });
  }
}
