let lastNewItemType = 'weapon';

function renderInventory(c){
  const inv = c.inventory || { currency:{cp:0,sp:0,ep:0,gp:0,pp:0}, items:[] };
  const ITEM_TYPES = ['weapon','armor','misc','pack'];
  const selectedType = ITEM_TYPES.includes(lastNewItemType) ? lastNewItemType : 'weapon';

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
            ${ITEM_TYPES.map(t => `<option value="${t}" ${t === selectedType ? 'selected' : ''}>${t.charAt(0).toUpperCase()+t.slice(1)}</option>`).join('')}
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

  $('#newItemType').onchange = (e) => {
    lastNewItemType = e.target.value || 'weapon';
  };

  $('#btnAddItem').onclick = () => {
    const name = ($('#newItemName').value || '').trim();
    if (!name) { $('#newItemName').focus(); return; }
    const type = $('#newItemType').value || 'misc';
    lastNewItemType = type;
    inv.items = inv.items || [];
    inv.items.push({ name, type, qty:1, equipped:false, notes:'', ...(type === 'pack' ? { contents:'' } : {}) });
    c.inventory = inv;
    $('#newItemName').value = '';
    render();
  };

  function renderItems(){
    const items = inv.items || [];
    const equipped = items.filter(it => it.equipped && it.type !== 'pack');
    const unequipped = items.filter(it => !it.equipped || it.type === 'pack');

    function itemHtml(it, i){
      const typeTag = it.type ? `<span class="pill" style="text-transform:capitalize;">${escapeHtml(it.type)}</span>` : '';
      return `
        <div class="item">
          <div style="flex:1;">
            <div class="row" style="gap:6px; align-items:center; flex-wrap:wrap;">
              <b>${escapeHtml(it.name || 'Item')}</b>
              ${typeTag}
            </div>
            ${!['weapon','armor','pack'].includes(it.type) ? `
              <div class="row" style="gap:4px; align-items:center; margin-top:4px;">
                <button class="btn" style="padding:2px 8px; font-size:0.9em;" data-it-dec="${i}">−</button>
                <span class="pill">${Math.max(toInt(it.qty,0),0)}</span>
                <button class="btn" style="padding:2px 8px; font-size:0.9em;" data-it-inc="${i}">+</button>
              </div>
            ` : ''}
          </div>
          <div class="row" style="justify-content:flex-end; flex-wrap:wrap; align-items:flex-start;">
            ${it.type !== 'pack' ? `<button class="btn" data-it-equip="${i}">${it.equipped ? 'Unequip' : 'Equip'}</button>` : ''}
            ${['weapon','armor'].includes(it.type) ? `<button class="btn" data-it-lookup="${i}">Lookup</button>` : ''}
            ${it.type === 'pack' ? `<button class="btn" data-it-pack-lookup="${i}">Lookup</button>` : ''}
            ${it.type === 'pack' ? `<button class="btn" data-it-contents="${i}">Contents</button>` : ''}
            ${it.type !== 'pack' ? `<button class="btn" data-it-notes="${i}">Notes</button>` : ''}
            <button class="btn danger" data-it-del="${i}">Delete</button>
          </div>
          ${it.type !== 'pack' && it.notes ? `<div class="mini" style="grid-column:1/-1; margin-top:2px;">${escapeHtml(it.notes)}</div>` : ''}
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

      list.querySelectorAll('[data-it-pack-lookup]').forEach(btn => btn.onclick = async () => {
        const i = toInt(btn.dataset.itPackLookup, -1);
        const it = items[i];
        btn.disabled = true;
        btn.textContent = '…';
        try {
          const result = await wikiLookupPack(it.name);
          it.contents = result;
          render();
        } catch (e) {
          toast(e.message || 'Lookup failed.');
          btn.disabled = false;
          btn.textContent = 'Lookup';
        }
      });

      list.querySelectorAll('[data-it-contents]').forEach(btn => btn.onclick = () => {
        const it = items[toInt(btn.dataset.itContents, -1)];
        openContentsModal(it);
      });
    });
  }

  function openContentsModal(it) {
    const existing = document.getElementById('packContentsModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'packContentsModal';
    modal.className = 'overlay';
    modal.style.cssText = 'display:flex; align-items:center; justify-content:center; z-index:200;';
    modal.innerHTML = `
      <div class="dialog" style="width:min(520px,92vw); display:flex; flex-direction:column; gap:10px;" id="packContentsDialog">
        <h3 style="margin:0;">${escapeHtml(it.name)}</h3>
        <div class="mini muted">Contents</div>
        <textarea id="packContentsTextarea" rows="9" style="resize:vertical; background:var(--input,var(--btn)); color:var(--text); border:1px solid var(--line); border-radius:var(--radius); padding:8px; font-size:0.95em;">${escapeHtml(it.contents || '')}</textarea>
        <div class="row" style="gap:8px; justify-content:flex-end;">
          <button class="btn" id="btnPackContentsSave">Save</button>
          <button class="btn" id="btnPackContentsClose">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const textarea = document.getElementById('packContentsTextarea');
    document.getElementById('btnPackContentsSave').onclick = () => {
      it.contents = textarea.value;
      modal.remove();
      render();
    };
    document.getElementById('btnPackContentsClose').onclick = () => modal.remove();
    modal.addEventListener('click', (e) => {
      if (!document.getElementById('packContentsDialog').contains(e.target)) modal.remove();
    });
  }
}
