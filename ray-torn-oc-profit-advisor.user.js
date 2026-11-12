// ==UserScript==
// @name         Ray's Torn OC Profit Advisor (ohne API)
// @namespace    ray.torn.oc-profit
// @version      1.0.0
// @description  OC-2.0-Belohnungen, persönlicher Anteil und Vergleich pro Tag direkt in TornPDA – ohne API-Key.
// @author       Ray + ChatGPT
// @match        https://www.torn.com/factions.php*
// @match        https://www.torn.com/organizedcrimes.php*
// @match        https://torn.com/factions.php*
// @match        https://torn.com/organizedcrimes.php*
// @updateURL    https://raw.githubusercontent.com/PatchPilotGer/ray-torn-scripts/main/ray-torn-oc-profit-advisor.user.js
// @downloadURL  https://raw.githubusercontent.com/PatchPilotGer/ray-torn-scripts/main/ray-torn-oc-profit-advisor.user.js
// @run-at       document-end
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';
  // Quellenstand: Torn Wiki, Organized Crime 2.0, abgerufen 12.11.2026.
  // Geld: Faction-Gesamtbelohnung bei ERFOLG, nicht persönlicher Betrag.
  // items / unlock: unbewertete Sach- und Folge-Belohnungen bleiben bewusst ohne erfundenen Marktwert.
  const WIKI = 'https://wiki.torn.com/wiki/Organized_Crime_2.0';
  const ITEMS_NOTE = 'Gegenstände werden von der Fraktion verteilt oder zum Marktwert ausgezahlt; nicht automatisch direkt an dich.';
  const KEY = 'ray-oc-profit-advisor-v1';
  const DEFAULT = { payout: 100, xanax: 840000, daily: true };

  // [Name, Schwierigkeit, Planungstage, Mitglieder, Art, Minimum Gesamt, Maximum Gesamt, Beschreibung]
  const LIST = [
    ['First Aid and Abet',1,3,3,'items',null,null,'4–26 Morphine, 1–2 Box of Medical Supplies, 2 Small First Aid Kits ODER 3–4 First Aid Kits'],
    ['Mob Mentality',1,4,4,'cash',673000,1500000,''],
    ['Pet Project',1,3,3,'cash',414000,806000,''],
    ['Disorderly Conduct',2,4,4,'unknown',null,null,'Geldbelohnung derzeit im Wiki nicht verlässlich angegeben'],
    ['Thou Shalt Not Steal',2,3,3,'unknown',null,null,'Geldbelohnung derzeit im Wiki nicht verlässlich angegeben'],
    ['Cash Me If You Can',2,3,3,'cash',829000,1601000,''],
    ['Best of the Lot',2,4,4,'items',null,null,'1 Auto: Mercia SLR ODER Echo R8 ODER Lolo 458'],
    ['Smoke and Wing Mirrors',3,4,4,'items',null,null,'1 Auto: Veloria LFA ODER Weston Marlin 177 ODER Lambrini Torobravo'],
    ['Market Forces',3,5,5,'cash',5095000,8575000,''],
    ['Gaslight the Way',3,6,6,'items',null,null,'Alkohol / Energydrinks / Pixie Sticks; Anzahl und Marktwert variieren'],
    ['Snow Blind',4,4,4,'cash',5575000,10565000,''],
    ['Plucking the Lotus Petal',4,4,4,'partial',null,8976000,'Untergrenze im Wiki noch unbekannt'],
    ['Stage Fright',4,6,6,'xanax',10,30,'10–30 Xanax für die Fraktion'],
    ['Guardian Angels',5,3,3,'cash',6296000,8883000,''],
    ['Honey Trap',5,3,3,'cash',15753000,25671000,''],
    ['Counter Offer',5,5,5,'items',null,null,'Graue Waffen und Rüstung. Wiki schätzt ≥ $24 Mio. Gesamt-Verkaufswert; keine gesicherte Spanne'],
    ['No Reserve',5,3,3,'unlock',null,null,'Keine direkte Prämie. Die Beteiligten erhalten einen Anteil an Bidding War, falls auch dieses erfolgreich endet.'],
    ['Bidding War',6,6,6,'cash',71291000,133980000,''],
    ['Leave No Trace',6,3,3,'cash',9660000,13474000,''],
    ['Dish It Out',6,5,5,'unknown',null,null,'Geldbelohnung im Wiki noch nicht angegeben'],
    ['Sneaky Git Grab',6,4,4,'cash',21384000,38757000,''],
    ['Blast from the Past',7,6,6,'cash',98046000,202382000,''],
    ['Window of Opportunity',7,5,5,'items',null,null,'Priceless Painting ODER Naval Cutlass; eventuell weitere Sammlerstücke'],
    ['Cleared for Takeoff',7,6,6,'unknown',null,null,'Geldbelohnung im Wiki noch nicht angegeben'],
    ['Break the Bank',8,6,6,'cash',195135000,395980000,''],
    ['Ship Happens',8,5,5,'shop',30000000,130000000,'1 Schmuckstück: Alexandrite Manchette ($30 Mio.), Emerald Plastron ($70 Mio.) ODER Ruby Brooch ($130 Mio.) – Shop-Verkaufswerte'],
    ['Clinical Precision',8,4,4,'cash',61363000,122565000,''],
    ['Stacking the Deck',8,4,4,'unlock',null,null,'Keine direkte Prämie. Anteil an Ace in the Hole bei erfolgreicher Folgestufe.'],
    ['Lock Stock',8,5,5,'unlock',null,null,'Keine direkte Prämie. Anteil an Hostile Takeover bei erfolgreicher Folgestufe.'],
    ['Manifest Cruelty',8,4,4,'unlock',null,null,'Erste Stufe einer Dreierkette. Potenzieller Anteil an Cesium-137 aus Crane Reaction bei vollständigem Erfolg.'],
    ['Ace in the Hole',9,5,5,'cash',280005000,579919000,''],
    ['Gone Fission',9,5,5,'unlock',null,null,'Zweite Stufe der Dreierkette. Potenzieller Anteil an Cesium-137 bei vollständigem Erfolg.'],
    ['Hostile Takeover',9,6,6,'cash',511000000,872025000,''],
    ['Crane Reaction',10,6,6,'items',null,null,'1–3 Cesium-137; enorm wertvoll, aber ohne aktuelle Marktpreise nicht seriös in $ umgerechnet']
  ];
  const DATA = new Map(LIST.map(([name, level, days, players, type, min, max, note]) =>
    [normalize(name), { name, level, days, players, type, min, max, note }]));

  // Bei Ketten bekommt jeder Teilnehmer ALLER Stufen einen Anteil der letzten Belohnung.
  // Beispiele: No Reserve (3) + Bidding War (6) = 9 Anteile.
  // Eine Teilnahme an zwei Stufen liefert entsprechend zwei Anteile.
  const CHAINS = [
    ['No Reserve', 'Bidding War'],
    ['Stacking the Deck', 'Ace in the Hole'],
    ['Lock Stock', 'Hostile Takeover'],
    ['Manifest Cruelty', 'Gone Fission', 'Crane Reaction']
  ];
  const CHAIN_MAP = new Map();
  CHAINS.forEach(names => {
    const records = names.map(name => DATA.get(normalize(name)));
    const slots = records.reduce((sum, row) => sum + row.players, 0);
    records.forEach((record, index) => CHAIN_MAP.set(normalize(record.name), {
      names, index, slots, final: records[records.length - 1],
      remainingDays: records.slice(index).reduce((sum, row) => sum + row.days, 0)
    }));
  });

  let settings = readSettings();
  let scanTimer = null;

  function normalize(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  function clamp(n, lo, hi, fallback) {
    n = Number(n);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
  }
  function readSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
      return {
        payout: clamp(saved.payout ?? DEFAULT.payout, 0, 100, DEFAULT.payout),
        xanax: clamp(saved.xanax ?? DEFAULT.xanax, 0, 10000000, DEFAULT.xanax),
        daily: typeof saved.daily === 'boolean' ? saved.daily : DEFAULT.daily
      };
    } catch { return { ...DEFAULT }; }
  }
  function saveSettings() {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (_) { /* private mode */ }
  }
  function compact(value) {
    if (!Number.isFinite(value)) return '–';
    if (Math.abs(value) >= 1e9) return (value / 1e9).toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' Mrd.';
    if (Math.abs(value) >= 1e6) return (value / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' Mio.';
    if (Math.abs(value) >= 1e3) return (value / 1e3).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' Tsd.';
    return Math.round(value).toLocaleString('de-DE');
  }
  function money(value) { return '$' + compact(value); }
  function pct() { return settings.payout / 100; }

  // Werte sind bei Erfolg, Anteil am gesamten Fraktionsgewinn gleichmäßig auf alle Slots verteilt.
  function calc(record) {
    const chain = CHAIN_MAP.get(normalize(record.name));
    const reward = chain ? chain.final : record;
    const period = chain ? chain.remainingDays : record.days;
    const totalSlots = chain ? chain.slots : record.players;
    if (['cash','shop','xanax','partial'].includes(reward.type)) {
      const multiplier = reward.type === 'xanax' ? settings.xanax : 1;
      const min = reward.min === null ? null : reward.min * multiplier * pct() / totalSlots;
      const max = reward.max === null ? null : reward.max * multiplier * pct() / totalSlots;
      const avg = min !== null && max !== null ? (min + max) / 2 : null;
      return { min, max, avg, perDay: avg === null ? null : avg / period, chain, period };
    }
    return { min: null, max: null, avg: null, perDay: null, chain, period };
  }
  function payoutString(record, values) {
    const reward = values.chain ? values.chain.final : record;
    if (reward.type === 'unknown') return 'Noch keine belastbare Auszahlung bekannt';
    if (reward.type === 'unlock') return 'Folge-OC statt direkter Auszahlung';
    if (reward.type === 'items') return values.chain ? 'Kettenbelohnung: ' + reward.note : 'Item-Belohnung – kein belastbarer $-Wert';
    if (reward.type === 'partial') return 'Maximal ' + money(values.max) + ' (Minimum unbekannt)';
    if (reward.type === 'xanax' && settings.xanax === 0) return 'Xanax-Preis in den Einstellungen ergänzen';
    return money(values.min) + ' – ' + money(values.max);
  }
  function kindLabel(record) {
    if (CHAIN_MAP.get(normalize(record.name))?.index < CHAIN_MAP.get(normalize(record.name))?.names.length - 1)
      return 'Folge-OC / Kette';
    return ({cash:'Geld', items:'Items', xanax:'Xanax (Schätzwert)', shop:'Item / Shopverkauf',
      partial:'Geld (unvollständig)', unlock:'Folge-OC', unknown:'Unbekannt'})[record.type];
  }

  function getName(oc) {
    const title = oc.querySelector('[class*="panelTitle"]');
    return title ? title.textContent.trim() : '';
  }
  function getOCs() {
    return [...document.querySelectorAll('[data-oc-id]')]
      .filter(oc => !oc.parentElement?.closest('[data-oc-id]'))
      .map(oc => ({ element: oc, record: DATA.get(normalize(getName(oc))) }))
      .filter(x => x.record);
  }
  function isJoinable(oc) {
    if (oc.querySelector('[class*="waitingJoin"]')) return true;
    const buttons = [...oc.querySelectorAll('button')];
    return buttons.some(button => /^join$/i.test(button.textContent.trim()) && !button.disabled);
  }
  function make(tag, className, html) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (html !== undefined) el.innerHTML = html;
    return el;
  }
  function escapeHTML(str) {
    return String(str ?? '').replace(/[&<>"']/g, ch =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function style() {
    if (document.getElementById('ray-oc-profit-css')) return;
    const css = `
      .ray-oc-card, .ray-oc-overview { box-sizing:border-box; color:#eee; font:13px/1.45 Arial,sans-serif;
        background:linear-gradient(145deg,#203340,#172630); border:1px solid #507184;
        border-radius:7px; margin:9px 6px 11px; padding:10px; text-align:left; max-width:100%; }
      .ray-oc-card *,.ray-oc-overview * {box-sizing:border-box}
      .ray-oc-top {display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:5px}
      .ray-oc-label {font-weight:bold;color:#aee5ff;font-size:12px}
      .ray-oc-pill {font-size:10px;border:1px solid #608798;border-radius:99px;padding:2px 8px;color:#c2deeb}
      .ray-oc-big {font-size:17px;font-weight:800;color:#a9edbc;line-height:1.4;overflow-wrap:anywhere}
      .ray-oc-small {font-size:11px;color:#c4d3de;line-height:1.48}
      .ray-oc-warn {color:#ffdba2}
      .ray-oc-overview {margin:9px 0 14px;padding:11px;background:#253c4a}
      .ray-oc-overview h3 {color:#fff;font-size:15px;margin:0 0 8px}
      .ray-oc-overview .ray-oc-row {display:flex;gap:8px;align-items:center;justify-content:space-between;
        padding:6px 0;border-top:1px solid #416071}
      .ray-oc-overview .ray-oc-row button {color:#bde9ff;font-size:12px;flex:1;border:0;background:transparent;
        padding:3px 0;text-align:left;cursor:pointer;overflow-wrap:anywhere}
      .ray-oc-overview strong {white-space:nowrap;font-size:12px;color:#b7efc4}
      .ray-oc-overview details {margin-top:8px;border-top:1px solid #426071;padding-top:8px}
      .ray-oc-overview summary {font-size:12px;cursor:pointer;color:#b7e8ff;font-weight:bold}
      .ray-oc-overview label {display:flex;gap:8px;align-items:center;justify-content:space-between;margin:7px 0;font-size:12px}
      .ray-oc-overview input {width:118px;max-width:52%;border:1px solid #6b8b99;background:#0f1a20;
        color:#fff;border-radius:4px;padding:6px;font-size:13px}
      .ray-oc-overview a {color:#b2dfff;text-decoration:underline}
      .ray-oc-flash {outline:3px solid #b6f0b2;outline-offset:2px}
    `;
    const el = document.createElement('style');
    el.id = 'ray-oc-profit-css'; el.textContent = css; document.head.appendChild(el);
  }

  function drawCard(oc, record) {
    const val = calc(record);
    const status = isJoinable(oc) ? 'Freie Rolle sichtbar' : 'Keine freie Rolle erkannt';
    const sig = [settings.payout, settings.xanax, settings.daily, record.name, status].join(':');
    let card = oc.querySelector('.ray-oc-card');
    if (card && card.dataset.sig === sig) return;
    if (!card) { card = make('div', 'ray-oc-card'); oc.appendChild(card); }
    const reward = val.chain ? val.chain.final : record;
    const isMoney = val.avg !== null;
    const perDayLine = isMoney && settings.daily ? `<span class="ray-oc-small">Ø ${money(val.avg)} pro OC · ` +
       `<b>${money(val.perDay)}/Tag</b> über ${val.period} Tage${val.chain ? ' bis Kettenende' : ''}</span>` : '';
    const special = (reward.type === 'xanax' || reward.type === 'shop') ?
      '<div class="ray-oc-small ray-oc-warn">Item-Wert, keine garantierte Barauszahlung.</div>' : '';
    const note = record.note ? `<div class="ray-oc-small">${escapeHTML(record.note)}</div>` : '';
    const info = (reward.type === 'items' || reward.type === 'xanax' || reward.type === 'shop') ?
      '<div class="ray-oc-small">Die Fraktion entscheidet über die Verteilung der Items bzw. deren Geldwert.</div>' : '';
    const chainNote = val.chain ? `<div class="ray-oc-small ray-oc-warn">Kette: ${escapeHTML(val.chain.names.join(' → '))}. Belohnung nur bei Erfolg aller Stufen; auf ${val.chain.slots} Rollen verteilt (bei doppelter Teilnahme zwei Anteile).</div>` : '';
    card.innerHTML = `
      <div class="ray-oc-top"><span class="ray-oc-label">💰 Ray's OC Profit</span>
      <span class="ray-oc-pill">${escapeHTML(kindLabel(record))} · ${record.days} Tage · ${record.players} Spieler</span></div>
      <div class="ray-oc-small">Dein rechnerischer Anteil bei Erfolg (${settings.payout}% an Mitglieder):</div>
      <div class="ray-oc-big">${escapeHTML(payoutString(record, val))}</div>
      ${perDayLine}${special}${chainNote}${note}${info}
      <div class="ray-oc-small" style="opacity:.75;margin-top:4px">${escapeHTML(status)} · Ohne Erfolgswahrscheinlichkeit & Materialkosten</div>`;
    card.dataset.sig = sig;
  }

  function drawOverview(entries) {
    const first = entries[0]?.element;
    if (!first || !first.parentElement) return;
    const parent = first.parentElement;
    // Auch beim Wechsel zwischen Recruiting / Planning bleibt nur eine aktuelle Übersicht.
    document.querySelectorAll('.ray-oc-overview').forEach(old => {
      if (old.parentElement !== parent || old.nextElementSibling !== first) old.remove();
    });
    let box = [...parent.children].find(el => el.classList.contains('ray-oc-overview'));
    if (!box) { box = make('section','ray-oc-overview'); parent.insertBefore(box,first); }
    const ranked = entries.filter(({element, record}) => isJoinable(element) && calc(record).perDay !== null)
      .sort((a,b) => calc(b.record).perDay - calc(a.record).perDay);
    const signature = JSON.stringify({ ranked: ranked.map(x => x.element.getAttribute('data-oc-id') + ':' + x.record.name),
      payout: settings.payout,xanax:settings.xanax,daily:settings.daily });
    if (box.dataset.sig === signature) return;
    box.innerHTML = `<h3>🏆 OC-Ertragsvergleich</h3>
      <div class="ray-oc-small">Top-Auszahlungen pro Mitglied und Tag unter <b>sichtbaren OCs mit freiem Slot</b> (bei Erfolg):</div>
      <div class="ray-oc-rankings"></div>
      <div class="ray-oc-small ray-oc-warn">Nur bekannte, bewertbare Belohnungen im Ranking. Items ohne Marktwert können trotzdem wertvoller sein!</div>
      <details><summary>⚙️ Auszahlung / Xanax-Preis anpassen</summary>
        <label>OC-Auszahlung an Mitglieder (%) <input inputmode="decimal" type="number" min="0" max="100" step="1" data-setting="payout" value="${settings.payout}"></label>
        <label>Xanax-Preis pro Stück ($) <input inputmode="numeric" type="number" min="0" max="10000000" step="1000" data-setting="xanax" value="${settings.xanax}"></label>
        <label>Ø-Auszahlung pro Tag anzeigen <input type="checkbox" data-setting="daily" ${settings.daily ? 'checked' : ''} style="width:20px"></label>
        <div class="ray-oc-small">100 % bedeutet: Alle Belohnungen gehen gleichmäßig an die Mitspieler. Deine Faction kann weniger auszahlen.</div>
        <div class="ray-oc-small">Der Xanax-Preis ist ein manuell änderbarer Richtwert (kein Live-Preis). Bei unbekannten Loot-Mengen/Preisen erfolgt keine $-Schätzung.</div>
        <div class="ray-oc-small">Quelle: <a href="${WIKI}" target="_blank" rel="noopener noreferrer">Torn Wiki – Organized Crime 2.0</a> · Datenstand 12.11.2026.</div>
      </details>`;
    const rankEl = box.querySelector('.ray-oc-rankings');
    if (!ranked.length) {
      rankEl.innerHTML = '<div class="ray-oc-small">Aktuell keine bekannten Geld-/bewertbaren Item-OCs mit freier Rolle auf dieser Ansicht.</div>';
    } else {
      ranked.slice(0, 5).forEach(({element, record}, i) => {
        const row = make('div', 'ray-oc-row');
        const button = make('button', '', `${i + 1}. ${escapeHTML(record.name)}${CHAIN_MAP.has(normalize(record.name)) ? ' (Kette)' : ''}`);
        button.type = 'button';
        button.addEventListener('click', () => {
          element.scrollIntoView({behavior:'smooth',block:'center'});
          element.classList.add('ray-oc-flash');
          setTimeout(() => element.classList.remove('ray-oc-flash'), 1600);
        });
        row.appendChild(button);
        const value = make('strong'); value.textContent = money(calc(record).perDay) + '/Tag';
        row.appendChild(value); rankEl.appendChild(row);
      });
    }
    box.querySelectorAll('[data-setting]').forEach(input => {
      const prop = input.getAttribute('data-setting');
      input.addEventListener('change', () => {
        if (prop === 'daily') settings.daily = input.checked;
        else if (prop === 'payout') settings.payout = clamp(input.value, 0, 100, DEFAULT.payout);
        else if (prop === 'xanax') settings.xanax = clamp(input.value, 0, 10000000, DEFAULT.xanax);
        saveSettings();
        const wasOpen = box.querySelector('details')?.open;
        // Beim Aktualisieren Details-Einstellungen offen lassen.
        box.dataset.sig = '';
        for (const {element,record} of entries) drawCard(element,record);
        drawOverview(entries);
        const details = box.querySelector('details');
        if (details) details.open = wasOpen;
      });
    });
    box.dataset.sig = signature;
  }

  function scan() {
    if (!document.body || !document.head) return;
    const entries = getOCs();
    if (!entries.length) {
      document.querySelectorAll('.ray-oc-overview').forEach(x => x.remove());
      return;
    }
    style();
    for (const {element,record} of entries) drawCard(element,record);
    drawOverview(entries);
  }
  function schedule() {
    if (scanTimer !== null) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => { scanTimer = null; scan(); }, 180);
  }
  function start() {
    scan();
    new MutationObserver(mutations => {
      // Nur Veränderungen der Torn-Oberfläche nachverarbeiten, eigene Einblendungen ignorieren.
      if (mutations.some(m => {
        const target = m.target instanceof Element ? m.target : m.target.parentElement;
        if (target?.closest('.ray-oc-card, .ray-oc-overview')) return false;
        return m.addedNodes.length || m.removedNodes.length;
      })) schedule();
    }).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('hashchange',schedule);
    window.addEventListener('popstate',schedule);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();