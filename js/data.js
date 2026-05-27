async function wikiLookupItem(itemName, itemType) {
  const url = itemType === 'armor'
    ? 'https://dnd5e.wikidot.com/armor'
    : 'https://dnd5e.wikidot.com/weapons';

  let rawHtml = '';
  for (const proxyUrl of [
    `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(url)}`
  ]) {
    try {
      const resp = await fetch(proxyUrl);
      if (!resp.ok) continue;
      const text = await resp.text();
      rawHtml = (text.trimStart().startsWith('{'))
        ? (JSON.parse(text).contents || '')
        : text;
      if (rawHtml.length > 500) break;
    } catch { /* try next proxy */ }
  }
  if (!rawHtml) throw new Error('Could not reach the wiki.');

  const doc = (new DOMParser()).parseFromString(rawHtml, 'text/html');
  const rows = Array.from(doc.querySelectorAll('table tr'));
  const nameLower = itemName.toLowerCase().trim();

  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll('td'));
    if (cells.length < 2) continue;
    const cellName = cells[0].textContent.trim().toLowerCase();
    if (cellName !== nameLower) continue;

    if (itemType === 'armor') {
      // cols: Name | AC | Strength | Stealth | Weight | Cost
      const ac = cells[1] ? cells[1].textContent.trim() : '';
      if (!ac) throw new Error(`AC not found for "${itemName}".`);
      return `AC: ${ac}`;
    } else {
      // cols: Name | Cost | Damage | Weight | Properties
      const damage = cells[2] ? cells[2].textContent.trim() : '';
      const props  = cells[4] ? cells[4].textContent.trim() : '';
      if (!damage) throw new Error(`Damage not found for "${itemName}".`);
      return props && props !== '—' ? `${damage} - ${props}` : damage;
    }
  }
  throw new Error(`"${itemName}" not found on the wiki.`);
}

async function wikiLookupSpell(spellName) {
  const slug = spellName.toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const targetUrl = `https://dnd5e.wikidot.com/spell:${slug}`;

  // Try two CORS proxies; allorigins returns JSON, corsproxy returns raw HTML
  let rawHtml = '';
  for (const proxyUrl of [
    `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`
  ]) {
    try {
      const resp = await fetch(proxyUrl);
      if (!resp.ok) continue;
      const text = await resp.text();
      rawHtml = (text.trimStart().startsWith('{'))
        ? (JSON.parse(text).contents || '')
        : text;
      if (rawHtml.length > 500) break;
    } catch { /* try next proxy */ }
  }
  if (!rawHtml) throw new Error('Could not reach the wiki. Check your internet connection.');

  if (/does not exist/i.test(rawHtml))
    throw new Error(`"${spellName}" not found on the wiki.`);

  // ── Stats extraction ────────────────────────────────────────────────────
  // Capture the raw HTML from "Casting Time:" to the closing </p> of the stats block.
  // The raw HTML has <strong>Duration:</strong> so the char after "Duration:" is "<";
  // stopping at [^<] would miss the value — capturing to </p> avoids that entirely.
  const statsHtmlMatch = rawHtml.match(/Casting Time:[\s\S]*?<\/p>/i)
    || rawHtml.match(/Casting Time:[\s\S]{0,900}/i);   // fallback: no </p> found
  if (!statsHtmlMatch)
    throw new Error(`Stats not found for "${spellName}". Check the spell name.`);

  const statsText = statsHtmlMatch[0]
    .replace(/<\/p[^>]*>/gi, '\n')  // </p> → newline (marks end of stats block)
    .replace(/<br\s*\/?>/gi, ' ')   // <br>  → space
    .replace(/<[^>]+>/g, '')        // strip all remaining tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')        // collapse spaces/tabs (keep newlines)
    .trim();

  // Each field: capture from the label to end, then trim at the next label.
  // Duration uses [^\n]+ to stop at the paragraph-end newline we inserted above.
  const g = (pat) => (statsText.match(pat)?.[1] || '').trim();
  const casting_time = g(/Casting Time:\s*(.+)/i) .replace(/\s*Range(?:\/Area)?:.*$/i,  '').trim();
  const range_area   = g(/Range(?:\/Area)?:\s*(.+)/i).replace(/\s*Components?:.*$/i,    '').trim();
  const components   = g(/Components?:\s*(.+)/i)  .replace(/\s*Duration:.*$/i,          '').trim();
  const duration     = g(/Duration:\s*([^\n]+)/i);

  // ── Subtitle & description ───────────────────────────────────────────────
  const doc = (new DOMParser()).parseFromString(rawHtml, 'text/html');
  const pageContent = doc.querySelector('#page-content') || doc.body;
  const fullTxt = pageContent.textContent;

  const sub = fullTxt.match(/((?:\d+\w*[- ]level|cantrip)\s+\w[\w ]*)/i);
  const subtitle = sub ? sub[1].trim() : '';

  const skipPat = /^(Casting Time|Range|Components|Duration|Source|Spell Lists)/i;
  const descParts = Array.from(pageContent.querySelectorAll('p'))
    .map(el => el.textContent.trim())
    .filter(t => t.length > 15 && !skipPat.test(t) && !/cantrip|\d+\w*[- ]level/i.test(t));

  return { subtitle, casting_time, range_area, components, duration, description: descParts.join('\n\n') };
}


function uint8ToBase32(bytes) {
  let bits = 0, val = 0, out = '';
  for (let i = 0; i < bytes.length; i++) {
    val = (val << 8) | bytes[i]; bits += 8;
    while (bits >= 5) { bits -= 5; out += B32[(val >> bits) & 31]; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out.match(/.{1,6}/g).join('-');
}

function base32ToUint8(str) {
  const clean = str.replace(/-/g,'').toUpperCase();
  let bits = 0, val = 0; const out = [];
  for (const c of clean) {
    if (!(c in B32_DEC)) throw new Error('Bad char: ' + c);
    val = (val << 5) | B32_DEC[c]; bits += 5;
    if (bits >= 8) { bits -= 8; out.push((val >> bits) & 255); }
  }
  return new Uint8Array(out);
}

async function charToCode(charState) {
  const bytes = new TextEncoder().encode(JSON.stringify(charState));
  const cs = new CompressionStream('deflate-raw');
  const w = cs.writable.getWriter();
  w.write(bytes); w.close();
  const chunks = [];
  const reader = cs.readable.getReader();
  while (true) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
  let len = 0; chunks.forEach(c => len += c.length);
  const merged = new Uint8Array(len); let off = 0;
  chunks.forEach(c => { merged.set(c, off); off += c.length; });
  return uint8ToBase32(merged);
}

async function codeToChar(code) {
  const trimmed = code.trim();
  let bytes;
  // Detect legacy base64url (contains lowercase or underscore)
  if (/[a-z_]/.test(trimmed)) {
    const b64 = trimmed.replace(/-/g,'+').replace(/_/g,'/');
    const padded = b64 + '=='.slice(0, (4 - b64.length % 4) % 4);
    const bin = atob(padded);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else {
    bytes = base32ToUint8(trimmed);
  }
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter();
  w.write(bytes); w.close();
  const chunks = [];
  const reader = ds.readable.getReader();
  while (true) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
  let len = 0; chunks.forEach(c => len += c.length);
  const merged = new Uint8Array(len); let off = 0;
  chunks.forEach(c => { merged.set(c, off); off += c.length; });
  return JSON.parse(new TextDecoder().decode(merged));
}