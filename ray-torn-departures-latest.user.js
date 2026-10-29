// ==UserScript==
// @name         Ray's Torn Departures
// @namespace    ray.torn.departures
// @version      0.9.0
// @description  Mobile airport-style Oracle restock departure board for TornPDA
// @match        https://www.torn.com/page.php?sid=travel*
// @updateURL    https://raw.githubusercontent.com/PatchPilotGer/ray-torn-scripts/main/ray-torn-departures-latest.user.js
// @downloadURL  https://raw.githubusercontent.com/PatchPilotGer/ray-torn-scripts/main/ray-torn-departures-latest.user.js
// @run-at       document-end
// ==/UserScript==

(async function () {
    "use strict";

    const ID = "ray-torn-departures-v05";

    const ORACLE_HOST = "https://torn-oracle.duckdns.org";
    const ORACLE_PREFIX = "/api/v1";
    const ORACLE_VERSION = "2.6.4";

    const SETTINGS_KEY = "ray_departures_v05_settings";
    const SHOP_CACHE_KEY = "ray_departures_v05_shops";
    const ARMED_KEY = "ray_departures_v07_armed";

    const DEFAULTS = {
        token: "",
        item: "Xanax",
        watches: null,
        travel: "standard",
        buffer: 5,
        rows: 5
    };

    const COUNTRY = {
        mex: { name: "Mexico", flag: "🇲🇽", mins: [24, 17, 12, 7] },
        cay: { name: "Cayman Islands", flag: "🇰🇾", mins: [33, 23, 17, 10] },
        can: { name: "Canada", flag: "🇨🇦", mins: [39, 27, 19, 12] },
        haw: { name: "Hawaii", flag: "🇺🇸", mins: [127, 89, 63, 38] },
        uni: { name: "United Kingdom", flag: "🇬🇧", mins: [151, 106, 75, 45] },
        arg: { name: "Argentina", flag: "🇦🇷", mins: [158, 111, 79, 47] },
        swi: { name: "Switzerland", flag: "🇨🇭", mins: [166, 116, 83, 50] },
        jap: { name: "Japan", flag: "🇯🇵", mins: [213, 149, 107, 64] },
        chi: { name: "China", flag: "🇨🇳", mins: [229, 160, 114, 69] },
        uae: { name: "UAE", flag: "🇦🇪", mins: [257, 180, 128, 77] },
        sou: { name: "South Africa", flag: "🇿🇦", mins: [282, 197, 141, 85] }
    };

    const TRAVEL_INDEX = {
        standard: 0,
        airstrip: 1,
        wlt: 2,
        business: 3
    };

    let settings = loadSettings();
    let shops = {};
    let boardRows = [];
    let loading = false;

    function loadSettings() {
        try {
            return {
                ...DEFAULTS,
                ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")
            };
        } catch {
            return { ...DEFAULTS };
        }
    }

    function saveSettings() {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }

    function esc(v) {
        return String(v ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function pdaHttp(url, headers = {}) {
        if (typeof PDA_httpGet === "function") {
            const r = await PDA_httpGet(url, headers);
            const status = Number(r?.status ?? 200);

            if (status < 200 || status >= 300) {
                throw new Error(`HTTP ${status}`);
            }

            return r?.responseText ?? r?.response ?? "";
        }

        if (
            window.flutter_inappwebview &&
            typeof window.flutter_inappwebview.callHandler === "function"
        ) {
            const r = await window.flutter_inappwebview.callHandler(
                "PDA_httpGet",
                url,
                headers
            );

            const status = Number(r?.status ?? 200);

            if (status < 200 || status >= 300) {
                throw new Error(`HTTP ${status}`);
            }

            return r?.responseText ?? "";
        }

        const r = await fetch(url, {
            headers,
            cache: "no-store"
        });

        if (!r.ok) {
            throw new Error(`HTTP ${r.status}`);
        }

        return await r.text();
    }

    async function oracleGet(path, retries = 2) {
        if (!settings.token || !settings.token.startsWith("orc_")) {
            throw new Error("Oracle token missing");
        }

        const url = ORACLE_HOST + ORACLE_PREFIX + path;

        const headers = {
            "Accept": "application/json",
            "Authorization": "Bearer " + settings.token,
            "X-Oracle-Script-Version": ORACLE_VERSION
        };

        let last;

        for (let i = 0; i <= retries; i++) {
            try {
                const text = await pdaHttp(url, headers);
                const json = JSON.parse(text);

                if (json?.error) {
                    throw new Error(
                        json.error.message ||
                        json.error.code ||
                        "Oracle error"
                    );
                }

                return json?.data ?? json;
            } catch (e) {
                last = e;

                if (i < retries) {
                    await sleep(700 * (i + 1));
                }
            }
        }

        throw last;
    }

    function loadCachedShops() {
        try {
            const c = JSON.parse(
                localStorage.getItem(SHOP_CACHE_KEY) || "null"
            );

            if (!c?.shops) return null;

            if (Date.now() - c.time > 6 * 60 * 60 * 1000) {
                return null;
            }

            return c.shops;
        } catch {
            return null;
        }
    }

    function saveCachedShops() {
        localStorage.setItem(
            SHOP_CACHE_KEY,
            JSON.stringify({
                time: Date.now(),
                shops
            })
        );
    }

    async function validateOracle() {
        const me = await oracleGet("/me");

        return {
            ok: true,
            name: me?.torn_name || "connected"
        };
    }

    async function loadShops(force = false) {
        if (!force) {
            const cached = loadCachedShops();

            if (cached) {
                shops = cached;
                return;
            }
        }

        shops = {};

        const codes = Object.keys(COUNTRY);

        for (let i = 0; i < codes.length; i += 3) {
            const batch = codes.slice(i, i + 3);

            const result = await Promise.allSettled(
                batch.map(async code => {
                    const shop = await oracleGet("/shop/" + code);
                    return { code, shop };
                })
            );

            for (const r of result) {
                if (r.status === "fulfilled") {
                    shops[r.value.code] = r.value.shop;
                }
            }

            if (i + 3 < codes.length) {
                await sleep(350);
            }
        }

        saveCachedShops();
    }

    function allItems() {
        const names = new Set();

        for (const shop of Object.values(shops)) {
            for (const item of shop?.items || []) {
                if (item?.name) {
                    names.add(item.name);
                }
            }
        }

        names.add("Xanax");

        return [...names].sort((a, b) => a.localeCompare(b));
    }

    function itemCountries(itemName) {
        const out = [];

        for (const [code, shop] of Object.entries(shops)) {
            const item = (shop?.items || []).find(
                x =>
                    String(x.name).toLowerCase() ===
                    itemName.toLowerCase()
            );

            if (item) {
                out.push({
                    code,
                    item,
                    shop
                });
            }
        }

        return out;
    }

    function itemsForCountry(code) {
        return (shops?.[code]?.items || [])
            .filter(item => item?.name)
            .slice()
            .sort((a, b) =>
                String(a.name).localeCompare(String(b.name))
            );
    }

    function ensureWatchlist() {
        if (Array.isArray(settings.watches)) {
            return;
        }

        settings.watches = itemCountries(settings.item)
            .map(entry => ({
                code: entry.code,
                item: entry.item.name
            }));

        saveSettings();
    }

    function watchEntries() {
        const result = [];
        const seen = new Set();

        for (const watch of settings.watches || []) {
            const code = watch?.code;
            const itemName = watch?.item;

            if (!COUNTRY[code] || !itemName) {
                continue;
            }

            const shop = shops?.[code];
            const item = (shop?.items || []).find(
                x =>
                    String(x.name).toLowerCase() ===
                    String(itemName).toLowerCase()
            );

            if (!item) {
                continue;
            }

            const key = code + "::" + String(item.name).toLowerCase();

            if (seen.has(key)) {
                continue;
            }

            seen.add(key);

            result.push({
                code,
                item,
                shop
            });
        }

        return result;
    }

    function flightMinutes(code) {
        const c = COUNTRY[code];
        if (!c) return null;

        const idx = TRAVEL_INDEX[settings.travel] ?? 0;
        return c.mins[idx];
    }

    function parseDate(v) {
        if (!v) return null;

        if (typeof v === "number") {
            return v > 1e12 ? v : v * 1000;
        }

        const n = Number(v);

        if (!Number.isNaN(n) && n > 1e9) {
            return n > 1e12 ? n : n * 1000;
        }

        const parsed = Date.parse(v);

        return Number.isNaN(parsed) ? null : parsed;
    }

    async function getForecastRows(entry) {
        const { code, item, shop } = entry;

        const query =
            `?travel=${encodeURIComponent(settings.travel)}` +
            `&floor=0.25&target=0.75`;

        const batch = await oracleGet(
            "/forecasts/" + code + query
        );

        const id = String(item.item_id);

        const forecast = batch?.forecasts?.[id] || null;
        const restockBand = batch?.restocks?.[id] || null;
        const reason = batch?.reasons?.[id] || null;

        if (!forecast?.upcoming?.length) {
            return [];
        }

        const flightMin = flightMinutes(code);

        if (!flightMin) {
            return [];
        }

        const now = Date.now();
        const rows = [];

        for (let idx = 0; idx < forecast.upcoming.length; idx++) {
            const w = forecast.upcoming[idx];

            const anchors = (w?.anchors || [])
                .map(a => ({
                    at: parseDate(a.at),
                    hit: a.hit,
                    shelf: a.shelf
                }))
                .filter(a => a.at);

            let landAt =
                parseDate(w?.land_at) ||
                parseDate(w?.land_by) ||
                anchors[0]?.at ||
                null;

            let confidence = null;
            let shelf = null;

            if (anchors.length) {
                anchors.sort((a, b) => {
                    const ah = a.hit == null ? -1 : Number(a.hit);
                    const bh = b.hit == null ? -1 : Number(b.hit);
                    return bh - ah;
                });

                landAt = anchors[0].at || landAt;

                confidence =
                    anchors[0].hit != null
                        ? Math.round(Number(anchors[0].hit) * 100)
                        : null;

                shelf =
                    anchors[0].shelf ?? null;
            }

            if (!landAt) {
                continue;
            }

            let restockAt = null;

            if (idx === 0) {
                restockAt =
                    parseDate(restockBand?.p50) ||
                    parseDate(item.restock_at) ||
                    null;
            }

            if (!restockAt || restockAt <= landAt) {
                restockAt =
                    landAt +
                    settings.buffer * 60_000;
            }

            const departureAt =
                landAt -
                flightMin * 60_000;

            if (departureAt <= now - 20 * 60_000) {
                continue;
            }

            rows.push({
                code,
                country: COUNTRY[code].name,
                flag: COUNTRY[code].flag,
                itemName: item.name,
                itemId: item.item_id,
                stock: Number(item.quantity || 0),
                cost: Number(item.cost || 0),
                departureAt,
                landAt,
                restockAt,
                flightMin,
                confidence,
                shelf,
                reason: reason?.reason || null,
                observedAt: shop?.observed_at || null,
                forecastIndex: idx
            });
        }

        return rows;
    }

    async function buildBoard() {
        const entries = watchEntries();
        const results = [];

        for (let i = 0; i < entries.length; i += 2) {
            const batch = entries.slice(i, i + 2);

            const settled = await Promise.allSettled(
                batch.map(getForecastRows)
            );

            for (const r of settled) {
                if (r.status !== "fulfilled") {
                    continue;
                }

                for (const row of r.value || []) {
                    results.push(row);
                }
            }

            if (i + 2 < entries.length) {
                await sleep(300);
            }
        }

        results.sort(
            (a, b) =>
                a.departureAt -
                b.departureAt
        );

        boardRows = results.slice(0, settings.rows);
    }

    function fmtTime(ms) {
        return new Date(ms).toLocaleTimeString(
            [],
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        );
    }

    function remaining(ms) {
        const diff = ms - Date.now();

        if (diff >= 0) {
            const mins = Math.floor(diff / 60000);
            const h = Math.floor(mins / 60);
            const m = mins % 60;

            return h ? `${h}h ${m}m` : `${m}m`;
        }

        const lateMins = Math.floor(Math.abs(diff) / 60000);

        return `+${lateMins}m`;
    }

    function boardingState(ms) {
        const diff = ms - Date.now();

        if (diff > 5 * 60_000) {
            return "normal";
        }

        if (diff > 0) {
            return "soon";
        }

        if (diff >= -20 * 60_000) {
            return "late";
        }

        return "expired";
    }

    function confidenceClass(value) {
        if (value == null) return "neutral";
        if (value >= 75) return "good";
        if (value >= 50) return "mid";
        return "low";
    }

    function installCss() {
        if (document.getElementById("rtd05-style")) return;

        const s = document.createElement("style");
        s.id = "rtd05-style";

        s.textContent = `
#${ID}{
    width:100%;
    max-width:680px;
    margin:10px auto;
    background:#0a0f12;
    border:1px solid #2c383f;
    border-radius:6px;
    overflow:hidden;
    color:#dfe6e8;
    font-family:Arial,Helvetica,sans-serif
}

#${ID} *{box-sizing:border-box}

.rtd05-head{
    display:flex;
    justify-content:space-between;
    align-items:center;
    gap:8px;
    padding:10px 12px;
    background:#141a1e;
    border-bottom:4px solid #8fd400
}

.rtd05-title{
    color:#9be000;
    font-size:18px;
    font-weight:800;
    letter-spacing:1.2px
}

.rtd05-actions{display:flex;gap:6px}

.rtd05-icon{
    width:38px;
    height:38px;
    border:1px solid #46525a;
    border-radius:4px;
    background:#171f24;
    color:#edf1f2;
    font-size:16px
}

.rtd05-status{
    padding:6px 10px;
    color:#6fd18f;
    font-size:9px;
    letter-spacing:.8px;
    border-bottom:1px solid #263038;
    background:#0c1215
}

.rtd05-status.warn{color:#d7aa46}
.rtd05-status.bad{color:#df746b}

.rtd05-settings{
    display:none;
    padding:10px;
    border-bottom:1px solid #303b40;
    background:#0d1418
}

.rtd05-settings.open{display:block}

.rtd05-field{margin-bottom:9px}
.rtd05-field:last-child{margin-bottom:0}

.rtd05-field label{
    display:block;
    margin-bottom:4px;
    color:#87949a;
    font-size:8px;
    letter-spacing:1.4px
}

.rtd05-field input,
.rtd05-field select{
    width:100%;
    min-height:42px;
    border:1px solid #45545d;
    border-radius:4px;
    background:#0a0f12;
    color:#edf1f2;
    padding:8px 10px;
    font-size:14px
}

.rtd09-watchlist{
    display:flex;
    flex-direction:column;
    gap:7px;
    margin-bottom:10px
}

.rtd09-watch-row{
    display:grid;
    grid-template-columns:.9fr 1.35fr 36px;
    gap:6px;
    align-items:center
}

.rtd09-watch-row select{
    min-width:0;
    width:100%;
    min-height:40px;
    border:1px solid #45545d;
    border-radius:4px;
    background:#0a0f12;
    color:#edf1f2;
    padding:7px 8px;
    font-size:12px
}

.rtd09-remove,
.rtd09-add{
    border-radius:4px;
    font-weight:800
}

.rtd09-remove{
    width:36px;
    height:40px;
    border:1px solid #714047;
    background:#291518;
    color:#ff8d98;
    font-size:18px
}

.rtd09-add{
    width:100%;
    min-height:38px;
    margin-bottom:10px;
    border:1px dashed #6f8e00;
    background:#142000;
    color:#bdf143;
    font-size:12px
}

.rtd05-save{
    width:100%;
    min-height:42px;
    margin-top:6px;
    border:1px solid #6f8e00;
    border-radius:4px;
    background:#263500;
    color:#cfff4d;
    font-weight:700;
    font-size:12px
}

.rtd08-board-head,
.rtd08-row-main{
    display:grid;
    grid-template-columns:minmax(0,1.55fr) .72fr .72fr .82fr .66fr;
    align-items:center;
    gap:6px
}

.rtd08-board-head{
    padding:7px 10px;
    background:#9bd800;
    color:#101511;
    font-size:8px;
    font-weight:800;
    text-transform:uppercase;
    letter-spacing:.3px
}

.rtd08-row{
    border-top:1px solid #2c353b;
    background:#11171b
}

.rtd08-row:nth-child(even){background:#151c21}

.rtd08-row-main{
    padding:8px 10px;
    cursor:pointer;
    min-height:46px
}

.rtd08-dest{
    min-width:0;
    display:flex;
    align-items:center;
    gap:6px
}

.rtd08-flag{font-size:16px;line-height:1}
.rtd08-country{
    min-width:0;
    color:#f0d467;
    font-size:11px;
    font-weight:700;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis
}

.rtd08-time{
    color:#f1f3f4;
    font-size:12px;
    font-weight:700;
    text-align:center
}

.rtd08-time.boarding-soon{
    background:#ffd900;
    color:#111;
    border-radius:3px;
    padding:4px 2px;
    animation:rtd08-blink-soon 1s steps(2,start) infinite
}

.rtd08-time.boarding-late{
    background:#b72222;
    color:#fff;
    border-radius:3px;
    padding:4px 2px;
    animation:rtd08-blink-late 1s steps(2,start) infinite
}

@keyframes rtd08-blink-soon{
    0%,49%{opacity:1}
    50%,100%{opacity:.32}
}

@keyframes rtd08-blink-late{
    0%,49%{opacity:.32}
    50%,100%{opacity:1}
}

.rtd08-restock{color:#f0d467}

.rtd08-remark{
    display:flex;
    justify-content:flex-end;
    align-items:center;
    gap:4px
}

.rtd08-confidence{
    min-width:34px;
    text-align:center;
    font-size:9px;
    font-weight:800;
    color:#8bf2a6
}

.rtd05-alarm{
    width:30px;
    height:30px;
    min-width:30px;
    min-height:30px;
    padding:0;
    border-radius:3px;
    border:1px solid #6c7526;
    background:#2a2a10;
    color:#ffe16a;
    font-size:14px;
    font-weight:700
}

.rtd05-alarm.armed{
    background:#10251a;
    border-color:#3f8059;
    color:#73d99a
}

.rtd08-detail{
    display:none;
    padding:8px 10px 10px;
    background:#0b1114;
    border-top:1px solid #232c31
}

.rtd08-row.open .rtd08-detail{display:block}

.rtd08-detail-grid{
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:6px 12px
}

.rtd08-detail-item{
    font-size:10px;
    color:#c9d0d3
}

.rtd08-detail-item b{
    color:#7e8b91;
    font-size:8px;
    text-transform:uppercase;
    letter-spacing:.5px
}

.rtd08-countdown{
    margin-top:7px;
    color:#8f9ba0;
    font-size:9px
}

.rtd05-placeholder{
    padding:10px;
    border-top:1px solid #232e33;
    color:#455159;
    font-size:9px;
    text-align:center
}

.rtd05-loading,
.rtd05-empty{
    padding:22px 14px;
    text-align:center;
    color:#879399;
    line-height:1.5;
    font-size:10px
}

.rtd05-foot{
    display:flex;
    justify-content:space-between;
    gap:10px;
    padding:7px 10px;
    color:#66747a;
    border-top:1px solid #283339;
    font-size:8px
}

@media(max-width:420px){
    .rtd05-head{padding:9px 10px}
    .rtd05-title{font-size:16px}
    .rtd05-icon{width:36px;height:36px}
    .rtd08-board-head,
    .rtd08-row-main{
        grid-template-columns:minmax(0,1.5fr) .72fr .72fr .82fr .7fr;
        gap:4px
    }
    .rtd08-country{font-size:10px}
    .rtd08-time{font-size:11px}
    .rtd08-board-head{font-size:7px}
}
        `;

        document.head.appendChild(s);
    }

    function host() {
        return (
            document.querySelector("#mainContainer") ||
            document.querySelector("main") ||
            document.body
        );
    }

    function findOracleAnchor() {
        const candidates = Array.from(
            document.querySelectorAll("div, section")
        )
            .filter(el => {
                if (el.id === ID || el.closest("#" + ID)) {
                    return false;
                }

                const text =
                    (el.textContent || "")
                        .replace(/\\s+/g, " ")
                        .trim();

                return (
                    text.includes("Torn Oracle") &&
                    text.includes("Ready to fly") &&
                    text.includes("Trip kit packed")
                );
            })
            .sort(
                (a, b) =>
                    (a.textContent || "").length -
                    (b.textContent || "").length
            );

        return candidates[0] || null;
    }

    function placePanel(el) {
        const oracle =
            findOracleAnchor();

        if (
            oracle &&
            oracle.parentElement
        ) {
            oracle.parentElement.insertBefore(
                el,
                oracle
            );
            return true;
        }

        placePanel(el);
        return false;
    }

    function createPanel() {
        if (document.getElementById(ID)) return;

        installCss();

        const el = document.createElement("section");
        el.id = ID;

        el.innerHTML = `
<div class="rtd05-head">

    <div class="rtd05-title">
        ✈ DEPARTURES
    </div>

    <div class="rtd05-actions">

        <button class="rtd05-icon" id="rtd05-refresh">
            ↻
        </button>

        <button class="rtd05-icon" id="rtd05-settings-btn">
            ⚙
        </button>

    </div>

</div>

<div class="rtd05-status warn" id="rtd05-status">
    Oracle token required
</div>

<div class="rtd05-settings" id="rtd05-settings">

    <div class="rtd05-field">
        <label>ORACLE TOKEN</label>

        <input
            id="rtd05-token"
            type="password"
            placeholder="orc_..."
            autocomplete="off">
    </div>

    <div class="rtd05-field">
        <label>DEPARTURE WATCHLIST</label>

        <div class="rtd09-watchlist" id="rtd09-watchlist"></div>

        <button
            type="button"
            class="rtd09-add"
            id="rtd09-add">
            + LAND / ITEM HINZUFÜGEN
        </button>
    </div>

    <div class="rtd05-field">
        <label>TRAVEL METHOD</label>

        <select id="rtd05-travel">
            <option value="standard">Standard</option>
            <option value="airstrip">Airstrip</option>
            <option value="wlt">Wind Lines Travel</option>
            <option value="business">Business Class</option>
        </select>
    </div>

    <div class="rtd05-field">
        <label>LAND BEFORE RESTOCK (MIN)</label>

        <input
            id="rtd05-buffer"
            type="number"
            value="5"
            min="0"
            max="30">
    </div>

    <button class="rtd05-save" id="rtd05-save">
        SAVE & REFRESH
    </button>

</div>

<div class="rtd05-board" id="rtd05-board">
    <div class="rtd05-empty">
        Open ⚙ and add your Oracle token.
    </div>
</div>

<div class="rtd05-foot">
    <span>ORACLE FORECASTS</span>
    <span>BOARDING = -1 MIN</span>
</div>
        `;

        host().prepend(el);

        document
            .getElementById("rtd05-settings-btn")
            .onclick = () => {
                document
                    .getElementById("rtd05-settings")
                    .classList
                    .toggle("open");
            };

        document
            .getElementById("rtd05-refresh")
            .onclick = () => refresh(true);

        document
            .getElementById("rtd05-save")
            .onclick = saveFromForm;

        document
            .getElementById("rtd09-add")
            .onclick = () => {
                const firstCountry =
                    Object.keys(COUNTRY)
                        .find(code => itemsForCountry(code).length) ||
                    "can";

                const firstItem =
                    itemsForCountry(firstCountry)[0]?.name ||
                    "Xanax";

                settings.watches = [
                    ...(settings.watches || []),
                    {
                        code: firstCountry,
                        item: firstItem
                    }
                ];

                renderWatchlistEditor();
            };

        syncForm();
    }

    function syncForm() {
        document.getElementById("rtd05-token").value =
            settings.token || "";

        document.getElementById("rtd05-travel").value =
            settings.travel;

        document.getElementById("rtd05-buffer").value =
            settings.buffer;

        renderWatchlistEditor();
    }

    function renderWatchlistEditor() {
        const holder =
            document.getElementById("rtd09-watchlist");

        if (!holder) {
            return;
        }

        const watches =
            Array.isArray(settings.watches)
                ? settings.watches
                : [];

        if (!watches.length) {
            holder.innerHTML =
                '<div class="rtd05-empty" style="padding:10px 4px">Noch keine Kombination gewählt.</div>';
            return;
        }

        holder.innerHTML = watches
            .map((watch, index) => {
                const countryOptions =
                    Object.entries(COUNTRY)
                        .filter(([code]) =>
                            itemsForCountry(code).length
                        )
                        .map(([code, country]) =>
                            `<option value="${code}" ${code === watch.code ? "selected" : ""}>${country.flag} ${esc(country.name)}</option>`
                        )
                        .join("");

                const itemOptions =
                    itemsForCountry(watch.code)
                        .map(item =>
                            `<option value="${esc(item.name)}" ${String(item.name).toLowerCase() === String(watch.item).toLowerCase() ? "selected" : ""}>${esc(item.name)}</option>`
                        )
                        .join("");

                return `
<div class="rtd09-watch-row" data-watch="${index}">
    <select class="rtd09-country">${countryOptions}</select>
    <select class="rtd09-item">${itemOptions}</select>
    <button type="button" class="rtd09-remove" aria-label="Remove">×</button>
</div>
                `;
            })
            .join("");

        holder
            .querySelectorAll(".rtd09-watch-row")
            .forEach(row => {
                const index =
                    Number(row.dataset.watch);

                const countrySelect =
                    row.querySelector(".rtd09-country");

                const itemSelect =
                    row.querySelector(".rtd09-item");

                countrySelect.onchange = () => {
                    const code =
                        countrySelect.value;

                    const firstItem =
                        itemsForCountry(code)[0]?.name || "";

                    settings.watches[index] = {
                        code,
                        item: firstItem
                    };

                    renderWatchlistEditor();
                };

                itemSelect.onchange = () => {
                    settings.watches[index].item =
                        itemSelect.value;
                };

                row
                    .querySelector(".rtd09-remove")
                    .onclick = () => {
                        settings.watches.splice(index, 1);
                        renderWatchlistEditor();
                    };
            });
    }

    async function saveFromForm() {
        settings.token =
            document
                .getElementById("rtd05-token")
                .value
                .trim();

        settings.travel =
            document
                .getElementById("rtd05-travel")
                .value;

        settings.buffer =
            Math.max(
                0,
                Math.min(
                    30,
                    Number(
                        document
                            .getElementById("rtd05-buffer")
                            .value || 5
                    )
                )
            );

        settings.watches =
            Array.from(
                document.querySelectorAll(
                    "#rtd09-watchlist .rtd09-watch-row"
                )
            )
                .map(row => ({
                    code:
                        row.querySelector(".rtd09-country")?.value,
                    item:
                        row.querySelector(".rtd09-item")?.value
                }))
                .filter(w => w.code && w.item);

        saveSettings();

        document
            .getElementById("rtd05-settings")
            .classList
            .remove("open");

        await refresh(true);
    }

    function setStatus(text, kind = "") {
        const s = document.getElementById("rtd05-status");

        s.textContent = text;

        s.className =
            "rtd05-status" +
            (kind ? " " + kind : "");
    }

    async function refresh(forceShops = false) {
        if (loading) return;

        if (
            !settings.token ||
            !settings.token.startsWith("orc_")
        ) {
            setStatus("Oracle token required", "warn");

            document
                .getElementById("rtd05-settings")
                .classList
                .add("open");

            return;
        }

        loading = true;

        const board = document.getElementById("rtd05-board");

        board.innerHTML = `
<div class="rtd05-loading">
    Contacting Torn Oracle…
</div>
        `;

        try {
            const me = await validateOracle();

            setStatus(
                `ORACLE CONNECTED • ${me.name}`
            );

            await loadShops(forceShops);

            ensureWatchlist();
            renderWatchlistEditor();

            board.innerHTML = `
<div class="rtd05-loading">
    Reading selected country / item forecasts…
</div>
            `;

            await buildBoard();

            renderBoard();

        } catch (e) {
            console.error(
                "[Ray Departures v0.5]",
                e
            );

            setStatus(
                "ORACLE ERROR",
                "bad"
            );

            board.innerHTML = `
<div class="rtd05-empty">
    Could not read Oracle.
    <br><br>
    ${esc(e?.message || e)}
</div>
            `;
        } finally {
            loading = false;
        }
    }

    function renderBoard() {
        const board = document.getElementById("rtd05-board");

        const rows = [];

        rows.push(`
<div class="rtd08-board-head">
    <div>TO</div>
    <div style="text-align:center">BOARD</div>
    <div style="text-align:center">LAND</div>
    <div style="text-align:center">RESTOCK</div>
    <div style="text-align:right">REMARKS</div>
</div>
        `);

        for (let i = 0; i < settings.rows; i++) {
            const r = boardRows[i];

            if (!r) {
                rows.push(`
<div class="rtd05-placeholder">
    — no further departure —
</div>
                `);
                continue;
            }

            rows.push(`
<div class="rtd08-row" data-row="${i}">
    <div class="rtd08-row-main">

        <div class="rtd08-dest">
            <span class="rtd08-flag">${r.flag}</span>
            <span class="rtd08-country">${esc(r.country)}</span>
        </div>

        <div class="rtd08-time ${boardingState(r.departureAt) === "soon" ? "boarding-soon" : boardingState(r.departureAt) === "late" ? "boarding-late" : ""}">
            ${fmtTime(r.departureAt)}
        </div>

        <div class="rtd08-time">
            ${fmtTime(r.landAt)}
        </div>

        <div class="rtd08-time rtd08-restock">
            ${fmtTime(r.restockAt)}
        </div>

        <div class="rtd08-remark">
            <span class="rtd08-confidence">
                ${r.confidence == null ? "—" : r.confidence + "%"}
            </span>

            <button
                class="rtd05-alarm"
                data-row="${i}"
                aria-label="Toggle boarding reminder">
                🔔
            </button>
        </div>

    </div>

    <div class="rtd08-detail">

        <div class="rtd08-detail-grid">

            <div class="rtd08-detail-item">
                <b>Item</b><br>
                ${esc(r.itemName)}
            </div>

            <div class="rtd08-detail-item">
                <b>Price</b><br>
                $${Number(r.cost).toLocaleString()}
            </div>

            <div class="rtd08-detail-item">
                <b>Flight</b><br>
                ${r.flightMin} min
            </div>

            <div class="rtd08-detail-item">
                <b>Confidence</b><br>
                ${r.confidence == null ? "—" : r.confidence + "%"}
            </div>

        </div>

        <div class="rtd08-countdown">
            ${boardingState(r.departureAt) === "late"
                ? "Boarding passed " + remaining(r.departureAt)
                : "Boarding in " + remaining(r.departureAt)}
        </div>

    </div>
</div>
            `);
        }

        board.innerHTML = rows.join("");

        board
            .querySelectorAll(".rtd08-row-main")
            .forEach(main => {
                main.onclick = event => {
                    if (
                        event.target.closest(".rtd05-alarm")
                    ) {
                        return;
                    }

                    main
                        .closest(".rtd08-row")
                        .classList
                        .toggle("open");
                };
            });

        board
            .querySelectorAll(".rtd05-alarm")
            .forEach(button => {
                button.onclick = event => {
                    event.stopPropagation();

                    const row =
                        boardRows[
                            Number(
                                button.dataset.row
                            )
                        ];

                    if (row) {
                        armAlarm(
                            row,
                            button
                        );
                    }
                };
            });

        syncAlarmButtons();
    }

    function notificationIdFor(row) {
        const seed =
            Math.floor(row.departureAt / 60000) +
            String(row.code || "")
                .split("")
                .reduce((sum, ch) => sum + ch.charCodeAt(0), 0) +
            Number(row.forecastIndex || 0) * 97;

        return Math.abs(seed) % 10000;
    }

    function loadArmed() {
        try {
            return JSON.parse(localStorage.getItem(ARMED_KEY) || "{}");
        } catch {
            return {};
        }
    }

    function saveArmed(map) {
        localStorage.setItem(
            ARMED_KEY,
            JSON.stringify(map)
        );
    }

    async function pdaCall(handler, payload = {}) {
        if (
            !window.flutter_inappwebview ||
            typeof window.flutter_inappwebview.callHandler !== "function"
        ) {
            throw new Error("TornPDA native handler unavailable");
        }

        return await window.flutter_inappwebview.callHandler(
            handler,
            payload
        );
    }

    async function scheduleNativeNotification(row, alarmAt) {
        const id = notificationIdFor(row);

        const response = await pdaCall(
            "scheduleNotification",
            {
                title: `BOARDING • ${row.country}`,
                subtitle: `${row.itemName} • Departure in 1 minute`,
                id,
                timestamp: alarmAt,
                overwriteID: true,
                launchNativeToast: true,
                toastMessage: `Boarding reminder set for ${fmtTime(alarmAt)}`,
                toastColor: "green",
                toastDurationSeconds: 3,
                urlCallback: "https://www.torn.com/page.php?sid=travel"
            }
        );

        const armed = loadArmed();
        armed[id] = {
            country: row.country,
            item: row.itemName,
            alarmAt,
            departureAt: row.departureAt
        };
        saveArmed(armed);

        return response;
    }

    async function cancelNativeNotification(row) {
        const id = notificationIdFor(row);

        try {
            await pdaCall(
                "cancelNotification",
                { id }
            );
        } finally {
            const armed = loadArmed();
            delete armed[id];
            saveArmed(armed);
        }
    }

    async function isNotificationArmed(row) {
        const id = notificationIdFor(row);
        const armed = loadArmed();

        if (!armed[id]) {
            return false;
        }

        try {
            const response =
                await pdaCall(
                    "getNotification",
                    { id }
                );

            if (
                response?.status === "success" ||
                response?.data
            ) {
                return true;
            }
        } catch {}

        delete armed[id];
        saveArmed(armed);

        return false;
    }

    async function syncAlarmButtons() {
        const buttons =
            document.querySelectorAll(
                "#rtd05-board .rtd05-alarm"
            );

        for (const button of buttons) {
            const index =
                Number(button.dataset.row);

            const row =
                boardRows[index];

            if (!row) {
                continue;
            }

            const active =
                await isNotificationArmed(row);

            button.dataset.armed =
                active ? "1" : "0";

            button.textContent =
                active ? "✓" : "🔔";

            button.classList.toggle(
                "armed",
                active
            );
        }
    }

    async function armAlarm(row, button) {
        const alarmAt =
            row.departureAt -
            60_000;

        if (alarmAt <= Date.now()) {
            alert(
                `BOARDING • ${row.country}\nDepart now for ${row.itemName}`
            );
            return;
        }

        button.disabled = true;

        try {
            const currentlyArmed =
                button.dataset.armed === "1" ||
                await isNotificationArmed(row);

            if (currentlyArmed) {
                await cancelNativeNotification(row);

                button.dataset.armed = "0";
                button.textContent = "🔔";
                button.classList.remove("armed");

                return;
            }

            await scheduleNativeNotification(
                row,
                alarmAt
            );

            button.dataset.armed = "1";
            button.textContent = "✓";
            button.classList.add("armed");

        } catch (error) {
            console.error(
                "[Ray Departures] Notification toggle failed:",
                error
            );

            alert(
                "Could not change boarding reminder."
            );
        } finally {
            button.disabled = false;
        }
    }

    async function init() {
        if (
            !location.href.includes(
                "sid=travel"
            )
        ) return;

        createPanel();

        if (
            settings.token &&
            settings.token.startsWith("orc_")
        ) {
            await refresh(false);
        } else {
            document
                .getElementById("rtd05-settings")
                .classList
                .add("open");
        }

        setInterval(() => {
            if (boardRows.length) {
                renderBoard();
            }
        }, 60_000);
    }

    const observer =
        new MutationObserver(() => {
            if (!location.href.includes("sid=travel")) {
                return;
            }

            const panel =
                document.getElementById(ID);

            if (!panel) {
                init();
                return;
            }

            const oracle =
                findOracleAnchor();

            if (
                oracle &&
                oracle.parentElement &&
                panel.nextElementSibling !== oracle
            ) {
                oracle.parentElement.insertBefore(
                    panel,
                    oracle
                );
            }
        });

    observer.observe(
        document.documentElement,
        {
            childList: true,
            subtree: true
        }
    );

    init();

})();