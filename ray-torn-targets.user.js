// ==UserScript==
// @name         Ray's Torn Targets
// @namespace    ray.torn.targets
// @version      0.1.4
// @description  Personal unlimited TornPDA target list with notes, tags and quick actions
// @match        https://www.torn.com/*
// @updateURL    https://raw.githubusercontent.com/PatchPilotGer/ray-torn-scripts/main/ray-torn-targets.user.js
// @downloadURL  https://raw.githubusercontent.com/PatchPilotGer/ray-torn-scripts/main/ray-torn-targets.user.js
// @run-at       document-end
// ==/UserScript==

(async function () {
    "use strict";

    if (window.top !== window.self) return;

    const ROOT_ID = "ray-targets-root";
    const PROFILE_BTN_ID = "ray-targets-profile-btn";
    const STORAGE_KEY = "targets";
    const FALLBACK_KEY = "ray_torn_targets_v01";
    const COLLAPSE_KEY = "ray_torn_targets_collapsed";

    let targets = [];
    let modalTarget = null;

    const TAGS = [
        "Buy-Mugger",
        "Weak Target",
        "Revenge",
        "Mission",
        "Other"
    ];

    const css = `
#${ROOT_ID}, #ray-targets-modal, #ray-targets-profile-btn-wrap {
    font-family: Arial, Helvetica, sans-serif;
}

#${ROOT_ID}{
    width:100%;
    margin:10px 0;
    border:1px solid #37434a;
    border-radius:6px;
    overflow:hidden;
    background:#0d1317;
    color:#e7ecee;
}

.rt-head{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:8px;
    padding:10px 12px;
    background:#151d22;
    border-bottom:4px solid #d4a72c;
    cursor:pointer;
    user-select:none;
}

.rt-head-right{
    display:flex;
    align-items:center;
    gap:8px;
}

.rt-collapse{
    width:30px;
    height:30px;
    border:1px solid #5b6870;
    border-radius:4px;
    background:#10171b;
    color:#f2c24d;
    font-size:16px;
    font-weight:800;
}

#${ROOT_ID}.collapsed .rt-body{
    display:none;
}

.rt-title{
    font-size:17px;
    font-weight:800;
    color:#f2c24d;
    letter-spacing:.8px;
}

.rt-count{
    font-size:10px;
    color:#93a0a6;
}

.rt-tools{
    display:grid;
    grid-template-columns:1fr 130px;
    gap:7px;
    padding:9px 10px;
    background:#0b1013;
    border-bottom:1px solid #2b3439;
}

.rt-tools input,
.rt-tools select{
    min-width:0;
    min-height:38px;
    border:1px solid #45545d;
    border-radius:4px;
    background:#090e11;
    color:#edf1f2;
    padding:7px 9px;
    font-size:12px;
}

.rt-table-head,
.rt-row-main{
    display:grid;
    grid-template-columns:minmax(0,1.2fr) 44px .72fr minmax(0,1.5fr) 76px;
    gap:6px;
    align-items:center;
}

.rt-table-head{
    padding:7px 10px;
    background:#d4a72c;
    color:#151515;
    font-size:8px;
    font-weight:800;
    text-transform:uppercase;
}

.rt-row{
    border-top:1px solid #293238;
    background:#11181c;
}

.rt-row:nth-child(even){
    background:#151d21;
}

.rt-row.buy-mugger{
    box-shadow:inset 4px 0 0 #b82727;
}

.rt-row-main{
    padding:9px 10px;
    min-height:48px;
    cursor:pointer;
}

.rt-name{
    min-width:0;
    font-size:11px;
    font-weight:800;
    color:#f2d26e;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
}

.rt-id{
    display:block;
    margin-top:2px;
    color:#77858b;
    font-size:8px;
    font-weight:500;
}

.rt-level{
    font-size:10px;
    font-weight:800;
    color:#d7dde0;
    text-align:center;
}

.rt-tag{
    font-size:9px;
    color:#8fe0a9;
    font-weight:700;
}

.rt-note{
    min-width:0;
    color:#c7d0d3;
    font-size:10px;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
}

.rt-actions{
    display:flex;
    justify-content:flex-end;
    gap:4px;
}

.rt-action{
    width:34px;
    height:30px;
    border:1px solid #46545b;
    border-radius:3px;
    background:#1b252a;
    color:#eef2f3;
    font-size:13px;
}

.rt-action.attack{
    border-color:#864c27;
    background:#2d1b10;
    color:#ffb168;
}

.rt-detail{
    display:none;
    padding:8px 10px 10px;
    background:#0a0f12;
    border-top:1px solid #283137;
    font-size:10px;
    color:#b7c1c5;
}

.rt-row.open .rt-detail{
    display:block;
}

.rt-detail-actions{
    display:flex;
    flex-wrap:wrap;
    gap:6px;
    margin-top:8px;
}

.rt-btn{
    min-height:34px;
    padding:7px 10px;
    border-radius:4px;
    border:1px solid #46545b;
    background:#172126;
    color:#eef2f3;
    font-size:10px;
    font-weight:700;
}

.rt-btn.danger{
    border-color:#763d43;
    background:#2a1518;
    color:#ff929a;
}

.rt-empty{
    padding:20px 12px;
    text-align:center;
    color:#7f8b90;
    font-size:10px;
}

#${PROFILE_BTN_ID}{
    width:100%;
    min-height:42px;
    margin:8px 0;
    border:1px solid #82671d;
    border-radius:5px;
    background:#2b240f;
    color:#ffd35d;
    font-weight:800;
    font-size:12px;
}

#${PROFILE_BTN_ID}.saved{
    border-color:#447b59;
    background:#12251a;
    color:#76d99b;
}

#ray-targets-modal{
    position:fixed;
    inset:0;
    z-index:999999;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:16px;
    background:rgba(0,0,0,.72);
}

#ray-targets-modal.hidden{
    display:none;
}

.rt-modal-card{
    width:min(440px,100%);
    border:1px solid #49565d;
    border-radius:7px;
    overflow:hidden;
    background:#0d1418;
    color:#edf2f3;
    box-shadow:0 12px 30px rgba(0,0,0,.45);
}

.rt-modal-title{
    padding:12px 14px;
    background:#172027;
    border-bottom:3px solid #d4a72c;
    color:#f1c64d;
    font-size:15px;
    font-weight:800;
}

.rt-modal-body{
    padding:12px 14px;
}

.rt-field{
    margin-bottom:10px;
}

.rt-field label{
    display:block;
    margin-bottom:5px;
    color:#86949a;
    font-size:8px;
    font-weight:800;
    letter-spacing:.8px;
}

.rt-field input,
.rt-field select,
.rt-field textarea{
    width:100%;
    border:1px solid #45545d;
    border-radius:4px;
    background:#080d10;
    color:#edf1f2;
    padding:8px 9px;
    font-size:13px;
}

.rt-field textarea{
    min-height:90px;
    resize:vertical;
}

.rt-modal-actions{
    display:flex;
    justify-content:flex-end;
    gap:7px;
}

@media(max-width:480px){
    .rt-tools{
        grid-template-columns:1fr 110px;
    }

    .rt-table-head,
    .rt-row-main{
        grid-template-columns:minmax(0,1.05fr) 40px .62fr minmax(0,1.05fr) 70px;
        gap:4px;
    }

    .rt-note{font-size:9px}
    .rt-name{font-size:10px}
}
    `;

    function installCss() {
        if (document.getElementById("ray-targets-style")) return;
        const style = document.createElement("style");
        style.id = "ray-targets-style";
        style.textContent = css;
        document.head.appendChild(style);
    }

    function fallbackLoad() {
        try {
            return JSON.parse(localStorage.getItem(FALLBACK_KEY) || "[]");
        } catch {
            return [];
        }
    }

    async function loadTargets() {
        try {
            if (typeof PDA_storage !== "undefined") {
                const value = await PDA_storage.get(STORAGE_KEY, []);
                targets = Array.isArray(value) ? value : [];
                return;
            }
        } catch (e) {
            console.warn("[Ray Targets] PDA_storage read failed", e);
        }

        targets = fallbackLoad();
    }

    async function saveTargets() {
        try {
            if (typeof PDA_storage !== "undefined") {
                await PDA_storage.set(STORAGE_KEY, targets);
                return;
            }
        } catch (e) {
            console.warn("[Ray Targets] PDA_storage write failed", e);
        }

        localStorage.setItem(FALLBACK_KEY, JSON.stringify(targets));
    }

    function esc(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
    }

    function normalizeName(name, id) {
        const cleaned = String(name || "")
            .replace(/\s*\[[0-9]+\]\s*$/, "")
            .replace(/\s+-\s+Torn.*$/i, "")
            .trim();

        return cleaned || ("Player " + id);
    }

    function getProfileId() {
        const url = new URL(location.href);
        const id = url.searchParams.get("XID");
        return id && /^\d+$/.test(id) ? id : null;
    }

    function getProfileName(id) {
        const selectors = [
            "[class*='profile'] h1",
            "[class*='profile'] h2",
            "[class*='profile'] h3",
            "[class*='profile'] h4",
            "[class*='profile'] [class*='name']",
            "[class*='user'] [class*='name']",
            "[class*='title']"
        ];

        const bad = /^(text based rpg|torn|profile|user information|actions)$/i;

        for (const selector of selectors) {
            for (const el of document.querySelectorAll(selector)) {
                const text = normalizeName((el.textContent || "").trim(), id);
                if (!text || bad.test(text)) continue;

                // Torn profile headers often include "Name's Profile"
                const profileMatch = text.match(/^(.+?)(?:'s|’s)\s+Profile$/i);
                if (profileMatch?.[1]) {
                    return normalizeName(profileMatch[1], id);
                }

                if (text.length <= 40) {
                    return text;
                }
            }
        }

        // Fallback: visible heading in the page content, e.g. "Bexovoris' Profile"
        for (const el of document.querySelectorAll("h1,h2,h3,h4")) {
            const raw = (el.textContent || "").trim();
            const match = raw.match(/^(.+?)(?:'s|’s)\s+Profile$/i);
            if (match?.[1]) return normalizeName(match[1], id);
        }

        return "Player " + id;
    }


    function getProfileLevel() {
        const textCandidates = Array.from(document.querySelectorAll("body *"))
            .filter(el => {
                const txt = (el.textContent || "").trim();
                return /^Level\s*\d+$/i.test(txt) || /^\d+$/.test(txt);
            });

        // Prefer an element whose parent/nearby text contains "Level"
        for (const el of textCandidates) {
            const own = (el.textContent || "").trim();
            const parentText = (el.parentElement?.textContent || "").trim();

            const direct = parentText.match(/Level\s*(\d+)/i);
            if (direct) return direct[1];

            if (/^\d+$/.test(own)) {
                const prev = el.previousElementSibling?.textContent?.trim() || "";
                if (/^Level$/i.test(prev)) return own;
            }
        }

        // Fallback: search visible profile text for "Level <number>"
        const bodyText = document.body?.innerText || "";
        const match = bodyText.match(/\bLevel\s*(\d{1,3})\b/i);
        return match ? match[1] : "";
    }

    function isTargetsPage() {
        const href = location.href.toLowerCase();

        if (
            href.includes("sid=targets") ||
            href.includes("targets.php") ||
            href.includes("targetlist") ||
            href.includes("targets-list")
        ) {
            return true;
        }

        return Array.from(document.querySelectorAll("h1,h2,h3,h4,[class*='title']"))
            .some(el => /^(targets?|targets list)$/i.test((el.textContent || "").trim()));
    }

    function isProfilePage() {
        return location.pathname.includes("profiles.php") && !!getProfileId();
    }

    function profileUrl(id) {
        return "https://www.torn.com/profiles.php?XID=" + encodeURIComponent(id);
    }

    function attackUrl(id) {
        return "https://www.torn.com/loader.php?sid=attack&user2ID=" + encodeURIComponent(id);
    }

    function findTarget(id) {
        return targets.find(t => String(t.id) === String(id));
    }

    async function upsertTarget(target) {
        const idx = targets.findIndex(t => String(t.id) === String(target.id));

        if (idx >= 0) {
            targets[idx] = {
                ...targets[idx],
                ...target,
                updatedAt: Date.now()
            };
        } else {
            targets.unshift({
                ...target,
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
        }

        await saveTargets();
        renderTargetsPanel();
        renderProfileButton();
    }

    async function removeTarget(id) {
        targets = targets.filter(t => String(t.id) !== String(id));
        await saveTargets();
        renderTargetsPanel();
        renderProfileButton();
    }

    function ensureModal() {
        if (document.getElementById("ray-targets-modal")) return;

        const modal = document.createElement("div");
        modal.id = "ray-targets-modal";
        modal.className = "hidden";

        modal.innerHTML = `
<div class="rt-modal-card">
    <div class="rt-modal-title">🎯 Ray Targets</div>

    <div class="rt-modal-body">
        <div class="rt-field">
            <label>PLAYER</label>
            <input id="rt-modal-player" type="text" disabled>
        </div>

        <div class="rt-field">
            <label>TAG</label>
            <select id="rt-modal-tag">
                ${TAGS.map(tag => `<option value="${esc(tag)}">${esc(tag)}</option>`).join("")}
            </select>
        </div>

        <div class="rt-field">
            <label>NOTIZ</label>
            <textarea id="rt-modal-note" placeholder="Warum ist der Spieler auf der Liste?"></textarea>
        </div>

        <div class="rt-modal-actions">
            <button class="rt-btn" id="rt-modal-cancel">Abbrechen</button>
            <button class="rt-btn" id="rt-modal-save">Speichern</button>
        </div>
    </div>
</div>
        `;

        document.body.appendChild(modal);

        modal.onclick = event => {
            if (event.target === modal) {
                modal.classList.add("hidden");
            }
        };

        document.getElementById("rt-modal-cancel").onclick = () => {
            modal.classList.add("hidden");
        };

        document.getElementById("rt-modal-save").onclick = async () => {
            if (!modalTarget) return;

            const tag = document.getElementById("rt-modal-tag").value;
            const note = document.getElementById("rt-modal-note").value.trim();

            await upsertTarget({
                ...modalTarget,
                tag,
                note
            });

            modal.classList.add("hidden");
        };
    }

    function openTargetModal(target) {
        ensureModal();

        modalTarget = { ...target };

        document.getElementById("rt-modal-player").value =
            `${target.name} [${target.id}]${target.level ? " • Level " + target.level : ""}`;

        document.getElementById("rt-modal-tag").value =
            target.tag && TAGS.includes(target.tag)
                ? target.tag
                : "Other";

        document.getElementById("rt-modal-note").value =
            target.note || "";

        document.getElementById("ray-targets-modal")
            .classList.remove("hidden");
    }

    function findProfileButtonHost() {
        const candidates = [
            document.querySelector("[class*='profile-wrapper']"),
            document.querySelector("[class*='profileWrap']"),
            document.querySelector("#mainContainer"),
            document.querySelector("main")
        ].filter(Boolean);

        return candidates[0] || document.body;
    }

    function renderProfileButton() {
        const existing = document.getElementById(PROFILE_BTN_ID);
        if (!isProfilePage()) {
            existing?.remove();
            return;
        }

        const id = getProfileId();
        if (!id) return;

        const current = findTarget(id);

        let btn = existing;

        if (!btn) {
            btn = document.createElement("button");
            btn.id = PROFILE_BTN_ID;

            const host = findProfileButtonHost();
            host.prepend(btn);
        }

        const wantedSaved = !!current;
        const wantedText = current
            ? "✓ In Ray Targets – Notiz bearbeiten"
            : "🎯 Zu Ray Targets hinzufügen";

        if (btn.classList.contains("saved") !== wantedSaved) {
            btn.classList.toggle("saved", wantedSaved);
        }
        if (btn.textContent !== wantedText) {
            btn.textContent = wantedText;
        }

        btn.onclick = () => {
            openTargetModal({
                id,
                name: current?.name || getProfileName(id),
                level: getProfileLevel() || current?.level || "",
                tag: current?.tag || "Other",
                note: current?.note || ""
            });
        };
    }

    function targetsPanelHost() {
        const heading = Array.from(
            document.querySelectorAll("h1,h2,h3,h4,[class*='title']")
        ).find(el => /^(targets?|targets list)$/i.test((el.textContent || "").trim()));

        if (heading) {
            let section = heading.parentElement;
            for (let i = 0; i < 4 && section; i++, section = section.parentElement) {
                if (
                    section.querySelector &&
                    section.querySelector("table, [class*='target'], [class*='list']")
                ) {
                    return { mode: "before", node: section };
                }
            }

            return { mode: "after", node: heading };
        }

        return {
            mode: "prepend",
            node:
                document.querySelector("#mainContainer") ||
                document.querySelector("main") ||
                document.body
        };
    }

    function filteredTargets() {
        const root = document.getElementById(ROOT_ID);
        if (!root) return targets;

        const search = (
            root.querySelector("#rt-search")?.value || ""
        ).trim().toLowerCase();

        const tag = root.querySelector("#rt-filter-tag")?.value || "ALL";

        return targets.filter(target => {
            const matchesSearch =
                !search ||
                target.name.toLowerCase().includes(search) ||
                String(target.id).includes(search) ||
                String(target.note || "").toLowerCase().includes(search);

            const matchesTag =
                tag === "ALL" ||
                target.tag === tag;

            return matchesSearch && matchesTag;
        });
    }

    function renderRows() {
        const holder = document.getElementById("rt-list");
        const count = document.getElementById("rt-count");
        if (!holder || !count) return;

        const list = filteredTargets();
        count.textContent = `${targets.length} gespeichert • ${list.length} angezeigt`;

        if (!list.length) {
            holder.innerHTML =
                '<div class="rt-empty">Noch keine passenden Ray Targets.</div>';
            return;
        }

        holder.innerHTML = list.map(target => `
<div class="rt-row ${target.tag === "Buy-Mugger" ? "buy-mugger" : ""}" data-id="${esc(target.id)}">
    <div class="rt-row-main">
        <div class="rt-name">
            ${esc(target.name)}
            <span class="rt-id">[${esc(target.id)}]</span>
        </div>

        <div class="rt-level">
            ${esc(target.level || "—")}
        </div>

        <div class="rt-tag">
            ${esc(target.tag || "Other")}
        </div>

        <div class="rt-note">
            ${esc(target.note || "—")}
        </div>

        <div class="rt-actions">
            <button class="rt-action attack" data-action="attack" title="Attack">⚔️</button>
            <button class="rt-action" data-action="profile" title="Profile">👤</button>
        </div>
    </div>

    <div class="rt-detail">
        <div><b>Level:</b> ${esc(target.level || "—")}</div>
        <div style="margin-top:5px"><b>Notiz:</b> ${esc(target.note || "—")}</div>
        <div style="margin-top:5px"><b>Tag:</b> ${esc(target.tag || "Other")}</div>

        <div class="rt-detail-actions">
            <button class="rt-btn" data-action="edit">Bearbeiten</button>
            <button class="rt-btn" data-action="profile">Profil</button>
            <button class="rt-btn" data-action="attack">Attack</button>
            <button class="rt-btn danger" data-action="remove">Entfernen</button>
        </div>
    </div>
</div>
        `).join("");

        holder.querySelectorAll(".rt-row").forEach(row => {
            const id = row.dataset.id;
            const target = findTarget(id);
            if (!target) return;

            row.querySelector(".rt-row-main").onclick = event => {
                if (event.target.closest("button")) return;
                row.classList.toggle("open");
            };

            row.querySelectorAll("[data-action]").forEach(btn => {
                btn.onclick = async event => {
                    event.stopPropagation();
                    const action = btn.dataset.action;

                    if (action === "attack") {
                        location.href = attackUrl(id);
                    } else if (action === "profile") {
                        location.href = profileUrl(id);
                    } else if (action === "edit") {
                        openTargetModal(target);
                    } else if (action === "remove") {
                        if (confirm(`${target.name} aus Ray Targets entfernen?`)) {
                            await removeTarget(id);
                        }
                    }
                };
            });
        });
    }

    function renderTargetsPanel() {
        const existing = document.getElementById(ROOT_ID);

        if (!isTargetsPage()) {
            existing?.remove();
            return;
        }

        let root = existing;

        if (!root) {
            root = document.createElement("section");
            root.id = ROOT_ID;
            root.innerHTML = `
<div class="rt-head" id="rt-collapse-head">
    <div>
        <div class="rt-title">🎯 RAY TARGETS</div>
        <div class="rt-count" id="rt-count"></div>
    </div>

    <div class="rt-head-right">
        <button class="rt-collapse" id="rt-collapse-btn" type="button">−</button>
    </div>
</div>

<div class="rt-body">
    <div class="rt-tools">
        <input id="rt-search" type="search" placeholder="Name, ID oder Notiz suchen…">

        <select id="rt-filter-tag">
            <option value="ALL">Alle Tags</option>
            ${TAGS.map(tag => `<option value="${esc(tag)}">${esc(tag)}</option>`).join("")}
        </select>
    </div>

    <div class="rt-table-head">
        <div>PLAYER</div>
        <div>LVL</div>
        <div>TAG</div>
        <div>NOTIZ</div>
        <div></div>
    </div>

    <div id="rt-list"></div>
</div>
            `;

            const targetHost = targetsPanelHost();

            if (targetHost.mode === "before") {
                targetHost.node.parentNode.insertBefore(root, targetHost.node);
            } else if (targetHost.mode === "after") {
                targetHost.node.insertAdjacentElement("afterend", root);
            } else {
                targetHost.node.prepend(root);
            }

            const collapsed = localStorage.getItem(COLLAPSE_KEY) === "1";
            root.classList.toggle("collapsed", collapsed);
            root.querySelector("#rt-collapse-btn").textContent = collapsed ? "+" : "−";

            root.querySelector("#rt-collapse-head").onclick = event => {
                if (event.target.closest("input,select")) return;
                const next = !root.classList.contains("collapsed");
                root.classList.toggle("collapsed", next);
                root.querySelector("#rt-collapse-btn").textContent = next ? "+" : "−";
                localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
            };

            root.querySelector("#rt-search").oninput = renderRows;
            root.querySelector("#rt-filter-tag").onchange = renderRows;
        }

        renderRows();
    }

    function routeRender() {
        renderProfileButton();
        renderTargetsPanel();
    }

    installCss();
    ensureModal();
    await loadTargets();
    routeRender();

    let lastUrl = location.href;
    let renderTimer = null;

    function scheduleRouteRender() {
        if (renderTimer) clearTimeout(renderTimer);
        renderTimer = setTimeout(() => {
            renderTimer = null;
            routeRender();
        }, 250);
    }

    const observer = new MutationObserver(() => {
        const urlChanged = location.href !== lastUrl;
        if (urlChanged) {
            lastUrl = location.href;
            scheduleRouteRender();
            return;
        }

        // Torn loads profile/target content dynamically. Only repair our UI
        // if Torn replaced it; do not rerender in response to our own DOM changes.
        if (isProfilePage() && !document.getElementById(PROFILE_BTN_ID)) {
            scheduleRouteRender();
        } else if (isTargetsPage() && !document.getElementById(ROOT_ID)) {
            scheduleRouteRender();
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    window.addEventListener("popstate", scheduleRouteRender);
})();