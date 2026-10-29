// ==UserScript==
// @name         Ray's Torn Departures
// @namespace    ray.torn.departures
// @version      0.7.0
// @description  Mobile airport-style Oracle restock departure board for TornPDA
// @match        https://www.torn.com/page.php?sid=travel*
// @updateURL    https://raw.githubusercontent.com/PatchPilotGer/ray-torn-scripts/main/ray-torn-departures.user.js
// @downloadURL  https://raw.githubusercontent.com/PatchPilotGer/ray-torn-scripts/main/ray-torn-departures.user.js
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

            if (departureAt <= now) {
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
        const entries = itemCountries(settings.item);
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
        const diff = Math.max(0, ms - Date.now());

        const mins = Math.floor(diff / 60000);
        const h = Math.floor(mins / 60);
        const m = mins % 60;

        return h ? `${h}h ${m}m` : `${m}m`;
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
    margin:12px auto;
    background:#080d10;
    border:1px solid #34424a;
    border-radius:8px;
    overflow:hidden;
    color:#e6ae38;
    font-family:"Courier New",monospace
}

#${ID} *{
    box-sizing:border-box
}

.rtd05-head{
    display:flex;
    justify-content:space-between;
    align-items:center;
    gap:10px;
    padding:16px 18px;
    border-bottom:4px solid #dda931
}

.rtd05-title{
    font-size:18px;
    font-weight:bold;
    letter-spacing:3px
}

.rtd05-actions{
    display:flex;
    gap:8px
}

.rtd05-icon{
    width:46px;
    height:46px;
    border:1px solid #485963;
    border-radius:6px;
    background:#11191e;
    color:#e5ebee;
    font-size:18px
}

.rtd05-status{
    padding:8px 14px;
    color:#65c98e;
    font-size:9px;
    letter-spacing:1.4px;
    border-bottom:1px solid #273238
}

.rtd05-status.warn{
    color:#e2aa4a
}

.rtd05-status.bad{
    color:#df746b
}

.rtd05-settings{
    display:none;
    padding:14px;
    border-bottom:1px solid #303b40
}

.rtd05-settings.open{
    display:block
}

.rtd05-field{
    margin-bottom:12px
}

.rtd05-field:last-child{
    margin-bottom:0
}

.rtd05-field label{
    display:block;
    margin-bottom:6px;
    color:#77848b;
    font-size:9px;
    letter-spacing:2px
}

.rtd05-field input,
.rtd05-field select{
    width:100%;
    min-height:48px;
    border:1px solid #45545d;
    border-radius:5px;
    background:#080d10;
    color:#edf1f2;
    padding:10px 12px;
    font-size:15px
}

.rtd05-save{
    width:100%;
    min-height:46px;
    margin-top:8px;
    border:1px solid #987122;
    border-radius:5px;
    background:#312713;
    color:#ffd263;
    font-weight:bold;
    font-size:13px
}

.rtd05-board{
    padding:0
}

.rtd05-row{
    padding:12px 14px;
    border-top:1px solid #232e33;
    background:#0a1013
}

.rtd05-row:first-child{
    border-top:none
}

.rtd05-row:nth-child(even){
    background:#0c1317
}

.rtd05-row-top{
    display:flex;
    justify-content:space-between;
    gap:10px;
    align-items:flex-start
}

.rtd05-destination{
    min-width:0
}

.rtd05-country{
    color:#efbb49;
    font-size:15px;
    font-weight:bold;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis
}

.rtd05-item{
    margin-top:2px;
    color:#d8e0e3;
    font-size:11px
}

.rtd05-price{
    color:#758188;
    font-size:9px
}

.rtd05-confidence{
    flex:0 0 auto;
    min-width:54px;
    text-align:center;
    padding:5px 7px;
    border-radius:4px;
    font-size:10px;
    font-weight:bold;
    border:1px solid #3a454b;
    color:#8b989e;
    background:#11181c
}

.rtd05-confidence.good{
    color:#72dda0;
    border-color:#3f7c58;
    background:#12241a
}

.rtd05-confidence.mid{
    color:#edc05d;
    border-color:#816722;
    background:#2b2413
}

.rtd05-confidence.low{
    color:#e37c73;
    border-color:#7c403c;
    background:#2a1515
}

.rtd05-times{
    display:grid;
    grid-template-columns:1fr auto 1fr auto 1fr;
    gap:5px;
    align-items:center;
    margin-top:11px
}

.rtd05-timebox{
    min-width:0
}

.rtd05-time-label{
    display:block;
    color:#637178;
    font-size:7px;
    letter-spacing:1px;
    margin-bottom:2px
}

.rtd05-time{
    color:#f4ead1;
    font-size:15px;
    font-weight:bold
}

.rtd05-arrow{
    color:#626f75;
    font-size:12px
}

.rtd05-row-bottom{
    display:flex;
    justify-content:space-between;
    align-items:center;
    gap:10px;
    margin-top:10px
}

.rtd05-countdown{
    color:#7e8b91;
    font-size:9px
}

.rtd05-alarm{
    flex:0 0 auto;
    min-width:42px;
    min-height:34px;
    background:#302713;
    color:#ffd363;
    border:1px solid #8a6b25;
    border-radius:4px;
    padding:6px 9px;
    font-size:14px;
    font-weight:bold
}

.rtd05-alarm.armed{
    background:#12261b;
    border-color:#3f8059;
    color:#73d99a
}

.rtd05-placeholder{
    padding:14px;
    border-top:1px solid #232e33;
    color:#39464c;
    font-size:10px;
    text-align:center
}

.rtd05-loading,
.rtd05-empty{
    padding:28px 18px;
    text-align:center;
    color:#879399;
    line-height:1.7;
    font-size:11px
}

.rtd05-foot{
    display:flex;
    justify-content:space-between;
    gap:10px;
    padding:8px 12px;
    color:#68757b;
    border-top:1px solid #283339;
    font-size:8px
}

@media(max-width:420px){

    .rtd05-head{
        padding:14px 12px
    }

    .rtd05-title{
        font-size:16px;
        letter-spacing:2px
    }

    .rtd05-icon{
        width:42px;
        height:42px
    }

    .rtd05-row{
        padding:11px 12px
    }

    .rtd05-country{
        font-size:14px
    }

    .rtd05-time{
        font-size:14px
    }

    .rtd05-confidence{
        min-width:50px;
        font-size:9px
    }
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
        <label>ITEM</label>

        <select id="rtd05-item">
            <option>Xanax</option>
        </select>
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

        syncForm();
    }

    function syncForm() {
        document.getElementById("rtd05-token").value =
            settings.token || "";

        document.getElementById("rtd05-travel").value =
            settings.travel;

        document.getElementById("rtd05-buffer").value =
            settings.buffer;

        const item = document.getElementById("rtd05-item");

        if (
            [...item.options].some(o => o.value === settings.item)
        ) {
            item.value = settings.item;
        }
    }

    function populateItems() {
        const items = allItems();
        const select = document.getElementById("rtd05-item");

        select.innerHTML = items
            .map(
                name =>
                    `<option value="${esc(name)}">${esc(name)}</option>`
            )
            .join("");

        if (
            !items.some(
                n =>
                    n.toLowerCase() ===
                    settings.item.toLowerCase()
            )
        ) {
            settings.item =
                items.includes("Xanax")
                    ? "Xanax"
                    : items[0];

            saveSettings();
        }

        select.value = settings.item;
    }

    async function saveFromForm() {
        settings.token =
            document
                .getElementById("rtd05-token")
                .value
                .trim();

        settings.item =
            document
                .getElementById("rtd05-item")
                .value || "Xanax";

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

            populateItems();

            const dropdown =
                document.getElementById("rtd05-item");

            if (
                dropdown &&
                dropdown.value
            ) {
                settings.item = dropdown.value;
                saveSettings();
            }

            board.innerHTML = `
<div class="rtd05-loading">
    Reading forecasts for ${esc(settings.item)}…
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

            const confClass =
                confidenceClass(r.confidence);

            rows.push(`
<div class="rtd05-row">

    <div class="rtd05-row-top">

        <div class="rtd05-destination">

            <div class="rtd05-country">
                ${r.flag} ${esc(r.country)}
            </div>

            <div class="rtd05-item">
                ${esc(r.itemName)}
                <span class="rtd05-price">
                    • $${Number(r.cost).toLocaleString()}
                </span>
            </div>

        </div>

        <div class="rtd05-confidence ${confClass}">
            ${r.confidence == null
                ? "—"
                : r.confidence + "%"
            }
        </div>

    </div>

    <div class="rtd05-times">

        <div class="rtd05-timebox">
            <span class="rtd05-time-label">
                DEPART
            </span>
            <span class="rtd05-time">
                ${fmtTime(r.departureAt)}
            </span>
        </div>

        <div class="rtd05-arrow">
            →
        </div>

        <div class="rtd05-timebox">
            <span class="rtd05-time-label">
                LAND
            </span>
            <span class="rtd05-time">
                ${fmtTime(r.landAt)}
            </span>
        </div>

        <div class="rtd05-arrow">
            →
        </div>

        <div class="rtd05-timebox">
            <span class="rtd05-time-label">
                RESTOCK
            </span>
            <span class="rtd05-time">
                ${fmtTime(r.restockAt)}
            </span>
        </div>

    </div>

    <div class="rtd05-row-bottom">

        <div class="rtd05-countdown">
            Boarding in ${remaining(r.departureAt)}
            • ${r.flightMin} min flight
        </div>

        <button
            class="rtd05-alarm"
            data-row="${i}">
            🔔
        </button>

    </div>

</div>
            `);
        }

        board.innerHTML = rows.join("");

        board
            .querySelectorAll(".rtd05-alarm")
            .forEach(button => {
                button.onclick = () => {
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
            if (
                location.href.includes("sid=travel") &&
                !document.getElementById(ID)
            ) {
                init();
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