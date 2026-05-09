/* ═══════════════════════════════════════════
   データ定義
═══════════════════════════════════════════ */
const generateStepValues = () => {
    const v = ["1"];
    for (let i = 5; i <= 30; i += 5) v.push(i.toString());
    v.push("50", "99");
    return v;
};
const generatePPValues = () => {
    const v = [];
    for (let i = 1; i <= 10; i++) v.push(i.toString());
    for (let i = 20; i <= 50; i += 10) v.push(i.toString());
    v.push("99");
    return v;
};
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => (a + i).toString());

const DEFAULT_CONFIG = [
    { id: "match",             name: "対戦形式",       items: ["BO1", "2デッキBO1", "BO3", "BO5"] },
    { id: "hp",                name: "初期体力",       items: generateStepValues() },
    { id: "max_pp",            name: "PP最大値",       items: generatePPValues() },
    { id: "initial_pp",        name: "初期PP",         items: generatePPValues() },
    { id: "pp_gain",           name: "毎ターン増加PP", items: range(1, 10) },
    { id: "ep",                name: "EP数",           items: range(0, 4) },
    { id: "sep",               name: "SEP数",          items: range(0, 4) },
    { id: "draw_count",        name: "開始ドロー数",   items: ["1", "2", "3", "4", "5"] },
    { id: "evolve_turn",       name: "進化可能ターン", items: range(1, 10) },
    { id: "super_evolve_turn", name: "超進化ターン",   items: range(1, 10) },
    { id: "rarity",            name: "禁止レア",       items: ["なし", "ブロンズ", "シルバー", "ゴールド", "レジェンド"] },
    { id: "leader",            name: "禁止クラス",     items: ["なし", "エルフ", "ロイヤル", "ウィッチ", "ドラゴン", "ナイトメア", "ビショップ", "ネメシス"] },
];
const DEFAULT_INITIAL = {
    hp: "20", max_pp: "10", initial_pp: "1", pp_gain: "1",
    draw_count: "1", ep: "2", sep: "2", evolve_turn: "4", super_evolve_turn: "6"
};
const DEFAULT_TOKKAN_PACKS = [
    "伝説の幕開け", "インフィニティ・エボルヴ", "絶傑の継承者",
    "蒼空の六竜", "花酔遊戯", "アポカリプス・パクト", "神殺しアナテマ"
];

/* ═══════════════════════════════════════════
   状態
   rows: { id, name, items, currentIndex, locked, weights }
   weights: items と同長の数値配列（1〜5、デフォルト1）
═══════════════════════════════════════════ */
let rows = [];
let tokkanPacks = [...DEFAULT_TOKKAN_PACKS];
let isSpinning = false;
let selectedPacks = [];

/* 履歴・プリセット */
let history = [];       // [{ time, text }] 最大5件
let presets = [];       // [{ name, snapshot }]  snapshot = rows の currentIndex を保存

const MAX_HISTORY = 5;

/* ── localStorage ── */
const SK = {
    rows:    "lobby_rows_v3",
    packs:   "lobby_packs_v3",
    history: "lobby_history_v3",
    presets: "lobby_presets_v3",
};

function save() {
    localStorage.setItem(SK.rows,    JSON.stringify(rows.map(r => ({ ...r }))));
    localStorage.setItem(SK.packs,   JSON.stringify(tokkanPacks));
    localStorage.setItem(SK.history, JSON.stringify(history));
    localStorage.setItem(SK.presets, JSON.stringify(presets));
}

function load() {
    try {
        const r = localStorage.getItem(SK.rows);
        const p = localStorage.getItem(SK.packs);
        const h = localStorage.getItem(SK.history);
        const pr = localStorage.getItem(SK.presets);
        if (r)  rows        = JSON.parse(r);
        if (p)  tokkanPacks = JSON.parse(p);
        if (h)  history     = JSON.parse(h);
        if (pr) presets     = JSON.parse(pr);
    } catch { /* 無視 */ }
}

/* ── デフォルト行を組み立て ── */
function buildDefaultRows() {
    rows = DEFAULT_CONFIG.map(conf => {
        const defVal = DEFAULT_INITIAL[conf.id];
        const idx    = defVal !== undefined ? conf.items.indexOf(defVal) : 0;
        return {
            ...conf,
            currentIndex: idx !== -1 ? idx : 0,
            locked: false,
            weights: conf.items.map(() => 1),
        };
    });
}

/* ── 重みが不足している場合の補完 ── */
function normalizeWeights() {
    rows.forEach(r => {
        if (!r.weights || r.weights.length !== r.items.length) {
            r.weights = r.items.map(() => 1);
        }
    });
}

/* ═══════════════════════════════════════════
   重み付き抽選
═══════════════════════════════════════════ */
function weightedRandom(row, excludeIndices = []) {
    const pool = [];
    row.items.forEach((_, i) => {
        if (excludeIndices.includes(i)) return;
        const w = row.weights[i] || 1;
        for (let j = 0; j < w; j++) pool.push(i);
    });
    if (!pool.length) return Math.floor(Math.random() * row.items.length);
    return pool[Math.floor(Math.random() * pool.length)];
}

/* ═══════════════════════════════════════════
   タブ切り替え
═══════════════════════════════════════════ */
function switchTab(mode) {
    ["slot", "tokkan", "config"].forEach(m => {
        document.getElementById(`${m}-container`).style.display = m === mode ? "block" : "none";
        const btn = document.getElementById(`tab-${m}`);
        btn.classList.toggle("active", m === mode);
        if (m === "tokkan") btn.classList.toggle("tokkan-tab", m === mode);
    });
    if (mode === "config") renderConfigEditor();
    if (mode === "slot")   { renderSlot(); renderHistory(); renderPresets(); }
    if (mode === "tokkan") renderTokkanInitial();
}

/* ═══════════════════════════════════════════
   ルール抽選タブ
═══════════════════════════════════════════ */
function renderSlot(finished = false) {
    const app = document.getElementById("app");
    app.innerHTML = "";
    rows.forEach((row, idx) => {
        const done = finished && !row.locked || (finished && row.locked);
        /* スロット行 */
        const rowEl = document.createElement("div");
        rowEl.className = `slot-row${done ? " done" : ""}`;
        rowEl.id = `row-${idx}`;
        rowEl.innerHTML = `
            <div class="slot-label">${row.name}</div>
            <div class="slot-viewport" onclick="manualSelect(${idx})">
                <span class="slot-value" id="val-${idx}"
                    style="color:${done ? "var(--green)" : "var(--text)"}"
                >${row.items[row.currentIndex]}</span>
            </div>
            <button class="slot-btn ${row.locked ? "locked" : ""}" onclick="toggleLock(${idx})" title="固定">
                ${row.locked ? "🔒" : "🔓"}
            </button>
            <button class="slot-btn weight-btn ${isWeightCustom(row) ? "weight-open" : ""}"
                onclick="toggleWeight(${idx})" title="重み付け">⚖</button>
            <button class="slot-btn del" onclick="deleteRow(${idx})" title="削除">✕</button>
        `;
        app.appendChild(rowEl);

        /* 重みパネル */
        const panel = document.createElement("div");
        panel.className = "weight-panel";
        panel.id = `weight-panel-${idx}`;
        panel.innerHTML = `
            <div class="weight-panel-title">各値の出やすさ（1〜5）</div>
            <div class="weight-items">
                ${row.items.map((item, wi) => `
                    <div class="weight-item">
                        <span class="weight-item-name">${item}</span>
                        <input type="range" min="1" max="5" step="1"
                            value="${row.weights[wi] || 1}"
                            oninput="updateWeight(${idx}, ${wi}, this.value, this.nextElementSibling)">
                        <span class="weight-num">${row.weights[wi] || 1}</span>
                    </div>`).join("")}
            </div>
        `;
        app.appendChild(panel);
    });
}

function isWeightCustom(row) {
    return row.weights && row.weights.some(w => w !== 1);
}

function toggleWeight(idx) {
    const panel = document.getElementById(`weight-panel-${idx}`);
    const btn   = document.querySelector(`#row-${idx} .weight-btn`);
    panel.classList.toggle("open");
    btn.classList.toggle("weight-open", panel.classList.contains("open"));
}

function updateWeight(rowIdx, itemIdx, val, numEl) {
    rows[rowIdx].weights[itemIdx] = parseInt(val);
    numEl.textContent = val;
    /* ボタン色を更新 */
    const btn = document.querySelector(`#row-${rowIdx} .weight-btn`);
    if (btn) btn.classList.toggle("weight-open", isWeightCustom(rows[rowIdx]));
    save();
}

function manualSelect(idx) {
    if (isSpinning) return;
    rows[idx].currentIndex = (rows[idx].currentIndex + 1) % rows[idx].items.length;
    save();
    renderSlot();
}

function toggleLock(idx) {
    if (isSpinning) return;
    rows[idx].locked = !rows[idx].locked;
    save();
    renderSlot();
}

function deleteRow(idx) {
    if (isSpinning) return;
    rows.splice(idx, 1);
    save();
    renderSlot();
}

function resetToDefault() {
    if (isSpinning) return;
    buildDefaultRows();
    save();
    document.getElementById("result-wrapper-slot").style.display = "none";
    renderSlot();
}

/* ── 値取得ヘルパー ── */
function getRowVal(id) {
    const r = rows.find(r => r.id === id);
    return r ? parseInt(r.items[r.currentIndex]) : null;
}

/* ── スピン ── */
async function startSpin() {
    if (isSpinning) return;
    isSpinning = true;
    document.getElementById("main-btn").disabled = true;
    document.getElementById("result-wrapper-slot").style.display = "none";

    /* 依存関係考慮して決定 */
    rows.forEach(row => {
        if (row.locked) return;
        if (row.id === "initial_pp") {
            const maxPP = getRowVal("max_pp");
            const valid = maxPP !== null
                ? row.items.map((v, i) => ({ v: parseInt(v), i })).filter(x => x.v <= maxPP).map(x => x.i)
                : null;
            row.currentIndex = valid && valid.length
                ? (weightedRandom({ items: valid.map(i => row.items[i]), weights: valid.map(i => row.weights[i]) }) !== undefined
                    ? valid[weightedRandom({ items: valid.map(i => row.items[i]), weights: valid.map(i => row.weights[i]) })]
                    : valid[Math.floor(Math.random() * valid.length)])
                : weightedRandom(row);
        } else if (row.id === "pp_gain") {
            const maxPP  = getRowVal("max_pp");
            const initPP = getRowVal("initial_pp");
            if (maxPP !== null && initPP !== null) {
                const limit = Math.max(0, maxPP - initPP);
                const valid = row.items.map((v, i) => ({ v: parseInt(v), i })).filter(x => x.v <= limit).map(x => x.i);
                row.currentIndex = valid.length ? valid[Math.floor(Math.random() * valid.length)] : 0;
            } else {
                row.currentIndex = weightedRandom(row);
            }
        } else {
            row.currentIndex = weightedRandom(row);
        }
    });

    /* アニメーション */
    const promises = [];
    for (let i = 0; i < rows.length; i++) {
        const rowEl = document.getElementById(`row-${i}`);
        const valEl = document.getElementById(`val-${i}`);
        if (rows[i].locked) {
            rowEl.classList.add("done");
            valEl.style.color = "var(--green)";
            continue;
        }
        rowEl.classList.add("active");
        rowEl.classList.remove("done");
        valEl.style.color = "var(--text)";
        promises.push(animateSlot(i));
        await new Promise(r => setTimeout(r, 90));
    }
    await Promise.all(promises);

    save();
    addHistory();
    showSlotResult();
    renderHistory();
    isSpinning = false;
    document.getElementById("main-btn").disabled = false;
}

function animateSlot(idx, isTokkan = false) {
    return new Promise(resolve => {
        const valEl   = document.getElementById(isTokkan ? `tokkan-val-${idx}` : `val-${idx}`);
        const rowEl   = document.getElementById(isTokkan ? `tokkan-row-${idx}` : `row-${idx}`);
        const pool    = isTokkan ? tokkanPacks : rows[idx].items;
        const finalVal = isTokkan ? selectedPacks[idx] : rows[idx].items[rows[idx].currentIndex];
        const duration = 15 + idx * 2;
        let count = 0;
        const iv = setInterval(() => {
            valEl.textContent = pool[Math.floor(Math.random() * pool.length)];
            count++;
            if (count > duration) {
                clearInterval(iv);
                valEl.textContent = finalVal;
                valEl.style.color = "var(--green)";
                rowEl.classList.remove("active");
                rowEl.classList.add("done");
                resolve();
            }
        }, 60);
    });
}

function showSlotResult() {
    const text = buildResultText();
    document.getElementById("result-text-slot").textContent = text;
    document.getElementById("result-wrapper-slot").style.display = "block";
}

function buildResultText() {
    const results = rows
        .filter(r => r.items[r.currentIndex] !== "なし")
        .map(r => `${r.name}：${r.items[r.currentIndex]}`);
    return "【ルール抽選結果】\n" + results.join(" / ");
}

/* ═══════════════════════════════════════════
   履歴
═══════════════════════════════════════════ */
function addHistory() {
    const now = new Date();
    const time = `${now.getMonth()+1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2,"0")}`;
    history.unshift({ time, text: buildResultText() });
    if (history.length > MAX_HISTORY) history.pop();
    save();
}

function renderHistory() {
    const list = document.getElementById("history-list");
    if (!list) return;
    if (!history.length) {
        list.innerHTML = `<div style="font-size:0.76rem;color:var(--muted);padding:6px 0;">まだ履歴がありません</div>`;
        return;
    }
    list.innerHTML = history.map((h, i) => `
        <div class="history-item" onclick="restoreHistory(${i})">
            <div class="history-time">${h.time}</div>
            <div class="history-body">${h.text.replace("【ルール抽選結果】\n","")}</div>
        </div>`).join("");
}

function restoreHistory(idx) {
    /* 結果テキストを結果エリアに表示するだけ（スロット状態は変えない） */
    document.getElementById("result-text-slot").textContent = history[idx].text;
    document.getElementById("result-wrapper-slot").style.display = "block";
}

function clearHistory() {
    history = [];
    save();
    renderHistory();
}

/* ═══════════════════════════════════════════
   プリセット
═══════════════════════════════════════════ */
function savePreset() {
    const name = document.getElementById("preset-name-input").value.trim();
    if (!name) return;
    const snapshot = rows.map(r => ({ id: r.id, currentIndex: r.currentIndex }));
    presets.push({ name, snapshot });
    document.getElementById("preset-name-input").value = "";
    save();
    renderPresets();
}

function loadPreset(idx) {
    const { snapshot } = presets[idx];
    snapshot.forEach(s => {
        const r = rows.find(r => r.id === s.id);
        if (r) r.currentIndex = Math.min(s.currentIndex, r.items.length - 1);
    });
    save();
    renderSlot();
    document.getElementById("result-wrapper-slot").style.display = "none";
}

function deletePreset(idx, e) {
    e.stopPropagation();
    presets.splice(idx, 1);
    save();
    renderPresets();
}

function renderPresets() {
    const list = document.getElementById("preset-list");
    if (!list) return;
    if (!presets.length) {
        list.innerHTML = `<div style="font-size:0.76rem;color:var(--muted);padding:6px 0;">保存済みプリセットはありません</div>`;
        return;
    }
    list.innerHTML = presets.map((p, i) => `
        <div class="preset-item" onclick="loadPreset(${i})">
            <span>${p.name}</span>
            <button class="preset-del" onclick="deletePreset(${i}, event)">✕</button>
        </div>`).join("");
}

/* ═══════════════════════════════════════════
   突貫バースタブ
═══════════════════════════════════════════ */
function renderTokkanInitial() {
    const app   = document.getElementById("tokkan-app");
    let count   = parseInt(document.getElementById("tokkan-pack-num").value) || 4;
    count = Math.min(count, tokkanPacks.length);
    app.innerHTML = "";
    for (let i = 0; i < count; i++) {
        app.innerHTML += `
            <div class="slot-row no-btns" id="tokkan-row-${i}">
                <div class="slot-label">パック ${i+1}</div>
                <div class="slot-viewport">
                    <span class="slot-value" id="tokkan-val-${i}" style="color:var(--muted)">待機中</span>
                </div>
            </div>`;
    }
}

async function startTokkanSpin() {
    if (isSpinning) return;
    let count = parseInt(document.getElementById("tokkan-pack-num").value);
    if (!count || count < 1) return;
    count = Math.min(count, tokkanPacks.length);

    renderTokkanInitial();
    document.getElementById("result-wrapper-tokkan").style.display = "none";
    document.getElementById("tokkan-main-btn").disabled = true;
    isSpinning = true;

    selectedPacks = [...tokkanPacks].sort(() => Math.random() - 0.5).slice(0, count);

    const promises = [];
    for (let i = 0; i < count; i++) {
        document.getElementById(`tokkan-row-${i}`).classList.add("active");
        document.getElementById(`tokkan-val-${i}`).style.color = "var(--text)";
        promises.push(animateSlot(i, true));
        await new Promise(r => setTimeout(r, 150));
    }
    await Promise.all(promises);

    document.getElementById("tokkan-result-text").textContent =
        "【突貫バース：採用パック】\n" + selectedPacks.join(" / ");
    document.getElementById("result-wrapper-tokkan").style.display = "block";
    isSpinning = false;
    document.getElementById("tokkan-main-btn").disabled = false;
}

/* ═══════════════════════════════════════════
   設定タブ
═══════════════════════════════════════════ */
function renderConfigEditor() {
    document.getElementById("config-editor").innerHTML = rows.map((row, idx) => `
        <div class="config-item">
            <label>${row.name}</label>
            <input type="text" id="cfg-${idx}" value="${row.items.join("、")}">
            <button class="del-row-btn" onclick="deleteConfigRow(${idx})">✕</button>
        </div>`).join("");
    document.getElementById("tokkan-list-editor").value = tokkanPacks.join("、");
}

function deleteConfigRow(idx) {
    rows.splice(idx, 1);
    renderConfigEditor();
}

function addNewRow() {
    const name = document.getElementById("new-row-name").value.trim();
    if (!name) return;
    rows.push({ id: "custom-" + Date.now(), name, items: ["なし", "あり"], currentIndex: 0, locked: false, weights: [1, 1] });
    document.getElementById("new-row-name").value = "";
    renderConfigEditor();
}

function saveConfig() {
    rows.forEach((row, idx) => {
        const el = document.getElementById(`cfg-${idx}`);
        if (!el) return;
        row.items = el.value.split(/[、,]/).map(s => s.trim()).filter(Boolean);
        row.currentIndex = Math.min(row.currentIndex, row.items.length - 1);
        /* weights を items 長に合わせて調整 */
        while (row.weights.length < row.items.length) row.weights.push(1);
        row.weights = row.weights.slice(0, row.items.length);
    });
    tokkanPacks = document.getElementById("tokkan-list-editor").value
        .split(/[、,]/).map(s => s.trim()).filter(Boolean);
    save();
    switchTab("slot");
}

/* ═══════════════════════════════════════════
   コピー
═══════════════════════════════════════════ */
function copyToClipboard(elementId, btn) {
    navigator.clipboard.writeText(document.getElementById(elementId).textContent).then(() => {
        const orig = btn.textContent;
        btn.textContent = "✅ コピー完了！";
        setTimeout(() => btn.textContent = orig, 2000);
    });
}

/* ═══════════════════════════════════════════
   初期化
═══════════════════════════════════════════ */
function init() {
    buildDefaultRows();
    load();
    if (!rows.length) buildDefaultRows();
    normalizeWeights();
    renderSlot();
    renderTokkanInitial();
    renderHistory();
    renderPresets();
}

init();
