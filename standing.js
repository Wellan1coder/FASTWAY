//Clean ce bloc, optimise-le et règle les bugs sans toucher au reste du fichier.
// always put big css line in the dedicated folder and not in the js itshelf
const serieA = document.getElementById("serie-a");
const serieB = document.getElementById("serie-b");
const title = document.querySelector(".top-line h1");
const btnA = document.querySelector("#btn-a");
const btnB = document.querySelector("#btn-b");

btnA.addEventListener("click", () => {
  title.textContent = "FASTWAY A serie standing";
  serieA.classList.remove("hidden");
  serieB.classList.add("hidden");
  btnA.classList.add("active");
  btnB.classList.remove("active");
});

btnB.addEventListener("click", () => {
  title.textContent = "FASTWAY B serie standing";
  serieA.classList.add("hidden");
  serieB.classList.remove("hidden");
  btnB.classList.add("active");
  btnA.classList.remove("active");
});

window.onload = function () {
  btnA.click();
};
 
// Variable globale pour suivre le score des séries finales (BO5 / BO7)
let finalSeriesScores = {
    A: { wins: {} },
    B: { wins: {} },
    FASTWAY_FINAL: { wins: {} }
};

/* ---------- VARIABLES ET CONSTANTES GLOBALES ---------- */
let qualifA_done = false;
let qualifB_done = false;
let raceA_done = false;
let raceB_done = false;
let raceCount = 0;

let gamePhase = "QUALIF"; 
let MAX_RACES = 4;      

// CORRECTION : On initialise les variables de playoffs tout en haut pour éviter le crash !
let playoffData = null;
let playoffState = null;

// Index des colonnes dans le tableau principal
let COL_WIN = 4;        
let COL_CH_WIN = 5;     
let COL_BEST_TIME = 6;  
let COL_WIN_PERCENT = 7;
let COL_TOTAL = 8;      
let COL_LAST_TIME = 9;  

/* États séparés par série */
let raceStates = {
  A: {
    racePaused: false,
    raceRound: 1,
    raceQueue: [],
    raceWinners: [],
    currentDuels: [],
    raceFinished: false,
    bestTimes: {},
    carStats: {} 
  },
  B: {
    racePaused: false,
    raceRound: 1,
    raceQueue: [],
    raceWinners: [],
    currentDuels: [],
    raceFinished: false,
    bestTimes: {},
    carStats: {} 
  }
};

let raceSerieVisible = "A"; 
let RACE_STATE_KEY = "fastway_race_state_v2";
 

/* ----------script start calif ---------- */
/* ---------- données / état ---------- */
let qualifState = {
  serie: "A",              // "A" ou "B"
  inProgress: false,
  remainingCarsA: [],
  remainingCarsB: [],
  finishedA: false,
  finishedB: false,
  carTimes: {},
};

// Clés pour gérer l'alternance Qualif <-> Course
const PHASE_KEY_PREFIX = "fastway_phase_"; // ex: fastway_phase_A

let carTimes = {};
let qualifDone = false;
const oldSavedTimes = localStorage.getItem("fastwayCarTimes");
if (oldSavedTimes) {
  try { carTimes = JSON.parse(oldSavedTimes); } catch(e) { carTimes = {}; }
}

const qualifhistory = [];
let remainingCarsA = [];
let remainingCarsB = [];

const startCalifBtn = document.querySelector(".start-calif");
const undoQualifBtn = document.getElementById("undoLastQualifBtn");
const QUALIF_STATE_KEY = "fastway_qualif_state_v2";

// États pour les boutons d'annulation
let lastQualifAction = null;
let lastDuelAction = null;

let finishedA = false;
let finishedB = false;

// index colonne "Point Calif"
const COL_POINT_CALIF = 3;

/* ---------- utilitaires ---------- */
window.addEventListener("beforeunload", (event) => {
  const state = typeof getCurrentState === 'function' ? getCurrentState() : {};
  const isActive =
    state.qualifyingInProgress ||
    state.duelInProgress ||
    state.raceInProgress ||
    state.califInProgress;

  if (isActive) {
    event.preventDefault();
    event.returnValue = "Attention ! Vous risquez de perdre votre progression actuelle.";
  }
});



/* ---------- FONCTIONS DE MODALES FASTWAY (CLEAN) ---------- */
function showFastwayAlert(message, title = "ATTENTION", onClose = null) {
    document.querySelectorAll(".fastway-modal-overlay").forEach(m => m.remove());

    const modal = document.createElement("div");
    modal.className = "fastway-modal-overlay"; 
    modal.innerHTML = `
        <div class="fastway-modal-wrapper">
            <div class="fastway-modal-content">
                <h2 class="fastway-modal-title">${title}</h2>
                <div class="fastway-modal-text">${message.replace(/\n/g, '<br>')}</div>
                <div style="margin-top: 10px;">
                    <button id="alertCloseBtn" class="fastway-btn-primary">D'ACCORD</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const btn = modal.querySelector("#alertCloseBtn");
    btn.focus();
    requestAnimationFrame(() => modal.classList.add('active'));

    const closeModal = () => {
        modal.classList.remove('active');
        setTimeout(() => {
            modal.remove();
            if (onClose) onClose(); // <-- L'ajout magique est ici !
        }, 200);
    };

    btn.onclick = closeModal;
    modal.onclick = (e) => { if(e.target === modal) closeModal(); };
}

/* ---------- FONCTION MAGIC INPUT (GAUCHE À DROITE + DNF FIX) ---------- */
function setupMagicInput(inputEl) {
    inputEl.style.caretColor = "transparent"; // Cache le curseur
    inputEl.value = "00.000";
    let currentDigits = "";

    inputEl.addEventListener("keydown", (e) => {
        const key = e.key.toLowerCase();
        
        // On laisse passer les touches de navigation normales
        if (key === "enter" || key === "tab" || key === "escape") return;
        
        // On bloque l'écriture standard pour prendre le contrôle
        e.preventDefault();

        if (key >= "0" && key <= "9") {
            if (inputEl.value === "DNF") currentDigits = ""; 
            if (currentDigits.length < 5) currentDigits += key;
        } else if (key === "backspace") {
            if (inputEl.value === "DNF") {
                inputEl.value = "00.000"; // On force l'affichage à se réinitialiser
                currentDigits = "";
                return; // On arrête là pour ne pas bloquer le reste
            } else {
                currentDigits = currentDigits.slice(0, -1);
            }
        } else if (key === "d" || key === "n" || key === "f") {
        }

        if (inputEl.value === "DNF" && currentDigits === "") return;

        // Magie : on remplit avec des zéros à la FIN (padEnd) au lieu du début
        let padded = currentDigits.padEnd(5, "0");
        inputEl.value = `${padded.substring(0,2)}.${padded.substring(2)}`;
    });
}

/* ---------- MODAL SAISIE TEMPS ---------- */
function showModalForTime({ carName, onConfirm }) {
    document.querySelectorAll(".fastway-modal-overlay").forEach(m => m.remove());
    const modal = document.createElement("div");
    modal.className = "fastway-modal-overlay"; 
    modal.innerHTML = `
        <div class="fastway-modal-wrapper" id="timeWrapper">
            <div class="fastway-modal-content">
                <h2 class="fastway-modal-title gradient">${carName}</h2>
                <div class="input-wrapper">
                    <input type="text" id="timeInput" class="fastway-time-input" autocomplete="off" />
                </div>
                <div id="msgZone" style="min-height: 18px; font-size: 12px; font-weight: 500; margin-top:5px;"></div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const timeInput = modal.querySelector("#timeInput");
    const msgZone = modal.querySelector("#msgZone");
    const wrapper = modal.querySelector("#timeWrapper");

    setupMagicInput(timeInput); // Activation de la magie

    requestAnimationFrame(() => modal.classList.add('active'));
    timeInput.focus();

    const closeModal = () => {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 200);
    };

    const handleSubmit = () => {
        const rawTime = timeInput.value.trim();
        if (rawTime === "00.000" || rawTime === "") {
            closeModal(); if (onConfirm) onConfirm(null); return;
        }
        
        if (!(/^\d{1,2}[.,]\d{3}$/.test(rawTime) || /^dnf$/i.test(rawTime))) {
            msgZone.textContent = "Format invalide (ex: 12.345)";
            msgZone.classList.add('msg-error'); // Utilise le CSS
            wrapper.classList.remove('shake');
            void wrapper.offsetWidth; 
            wrapper.classList.add('shake');
            return; 
        }
        
        const time = rawTime.replace(',', '.');
        closeModal();
        if (onConfirm) onConfirm(time);
    };

    timeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") handleSubmit(); });
    modal.addEventListener("click", e => { if (e.target === modal) { closeModal(); if (onConfirm) onConfirm(null); } });
}




function saveQualifState() {
  try {
    qualifState.remainingCarsA = remainingCarsA;
    qualifState.remainingCarsB = remainingCarsB;
    qualifState.finishedA = finishedA;
    qualifState.finishedB = finishedB;
    qualifState.carTimes = carTimes;
    localStorage.setItem(QUALIF_STATE_KEY, JSON.stringify(qualifState));
  } catch (e) {
    console.warn("Erreur de sauvegarde qualification:", e);
  }
}

function loadQualifState() {
  try {
    const raw = localStorage.getItem(QUALIF_STATE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    qualifState = { ...qualifState, ...s };
    remainingCarsA = s.remainingCarsA || [];
    remainingCarsB = s.remainingCarsB || [];
    finishedA = s.finishedA || false;
    finishedB = s.finishedB || false;
    carTimes = s.carTimes || {};
  } catch (e) {
    console.warn("Erreur de chargement qualification:", e);
  }
}

function saveAllData() {
  const rows = Array.from(document.querySelectorAll(".column-row"));
  const arr = rows.map(row => ({
    name: row.children[2]?.textContent.trim() || "",
    points: row.children[COL_POINT_CALIF]?.textContent || "0",
    wins: row.children[4]?.textContent || "0",
    chWins: row.children[5]?.textContent || "0",
    bestTime: row.children[6]?.textContent || ""
  }));

  const meta = { carTimes: {}, carPoints: {} };
  for (const row of rows) {
    const name = row.children[2]?.textContent.trim();
    if (!name) continue;
    const lt = row.querySelector(".last-time");
    if (lt && lt.textContent) meta.carTimes[name] = lt.textContent;
    meta.carPoints[name] = parseInt(row.children[COL_POINT_CALIF]?.textContent || "0", 10) || 0;
  }

  localStorage.setItem("fastwayAllData", JSON.stringify(arr));
  localStorage.setItem("fastwayAllMeta", JSON.stringify(meta));
  localStorage.setItem("fastwayCarTimes", JSON.stringify(carTimes));
}

function loadAllData() {
  const rawMeta = localStorage.getItem("fastwayAllMeta");
  if (rawMeta) {
    try {
      const meta = JSON.parse(rawMeta);
      for (const row of Array.from(document.querySelectorAll(".column-row"))) {
        const name = row.children[2]?.textContent.trim();
        if (!name) continue;
        if (meta.carTimes && meta.carTimes[name]) {
          let lt = row.querySelector(".last-time");
          if (!lt) {
            lt = document.createElement("div");
            lt.classList.add("last-time");
            lt.style.display = "none";
            row.appendChild(lt);
          }
          lt.textContent = meta.carTimes[name];
        }
        if (meta.carPoints && typeof meta.carPoints[name] !== "undefined") {
          if (row.children[COL_POINT_CALIF]) row.children[COL_POINT_CALIF].textContent = String(meta.carPoints[name]);
        }
      }
    } catch (e) { console.warn("fastwayAllMeta invalide :", e); }
  }

  const rawArr = localStorage.getItem("fastwayAllData");
  if (rawArr) {
    try {
      const arr = JSON.parse(rawArr);
      if (Array.isArray(arr)) {
        for (const row of Array.from(document.querySelectorAll(".column-row"))) {
          const name = row.children[2]?.textContent.trim();
          if (!name) continue;
          const saved = arr.find(r => r.name === name);
          if (saved) {
            if (row.children[COL_POINT_CALIF]) row.children[COL_POINT_CALIF].textContent = saved.points || "0";
            if (row.children[4]) row.children[4].textContent = saved.wins || "0";
            if (row.children[5]) row.children[5].textContent = saved.chWins || "0";
            if (row.children[6]) row.children[6].textContent = saved.bestTime || "";
          }
        }
      }
    } catch (e) { console.warn("fastwayAllData invalide :", e); }
  }

  const rawCarTimes = localStorage.getItem("fastwayCarTimes");
  if (rawCarTimes) {
    try {
      const ct = JSON.parse(rawCarTimes);
      for (const row of Array.from(document.querySelectorAll(".column-row"))) {
        const name = row.children[2]?.textContent.trim();
        if (!name) continue;
        if (ct[name] && row.children[6]) row.children[6].textContent = ct[name];
      }
      carTimes = Object.assign({}, carTimes, JSON.parse(rawCarTimes));
    } catch (e) { /* ignore */ }
  }
}

function restoreTotalPoints() {
  const rows = Array.from(document.querySelectorAll(".column-row"));
  for (const row of rows) {
    const pointsText = (row.children[COL_POINT_CALIF] && row.children[COL_POINT_CALIF].textContent) ? row.children[COL_POINT_CALIF].textContent.trim() : "0";
    const points = parseInt(pointsText.replace(/\D/g, ''), 10) || 0;
    if (row.children[COL_POINT_CALIF]) row.children[COL_POINT_CALIF].textContent = String(points);

    const wins = parseInt((row.children[4] && row.children[4].textContent) || "0", 10) || 0;
    const total = (wins * 10) + points;
    if (row.children[8]) row.children[8].textContent = String(total);
  }
}

function timeToNumber(timeStr) {
  if (!timeStr || /^dnf$/i.test(timeStr)) return Infinity;
  return parseFloat(timeStr.replace(",", "."));
}

function shuffle(array) {
  let m = array.length, t, i;
  while (m) {
    i = Math.floor(Math.random() * m--);
    t = array[m];
    array[m] = array[i];
    array[i] = t;
  }
  return array;
}

function normalizeTime(rawTime) {
  if (!rawTime) return "";
  let t = rawTime.trim().replace(",", ".");
  if (/^dnf$/i.test(t)) return "DNF";
  if (/^\d{2}\.\d{3}$/.test(t) && t.startsWith("0")) t = t.substring(1);
  return t;
}

const savedAllDataRaw = (() => {
  try {
    return JSON.parse(localStorage.getItem("fastwayAllData"));
  } catch (e) {
    return null;
  }
})();

// ... existing code ...

const savedAllData = Array.isArray(savedAllDataRaw)
  ? savedAllDataRaw
  : (savedAllDataRaw && typeof savedAllDataRaw === "object"
     ? Object.values(savedAllDataRaw)
     : []);


/* ---------- initialisation ---------- */
window.addEventListener("DOMContentLoaded", () => {
    loadQualifState();
    loadAllData();

    const allRows = Array.from(document.querySelectorAll(".column-row"));

    // Ensure all rows have the '.last-time' div if it doesn't exist.
    // loadAllData also creates this, but this ensures it for all rows consistently
    for (const row of allRows) {
        if (!row.querySelector(".last-time")) {
            const d = document.createElement("div");
            d.className = "last-time";
            d.style.display = "none";
            row.appendChild(d);
        }
    }

    // Apply loaded carTimes to the Best Time column
    for (const row of allRows) {
        const carName = row.children[2]?.textContent.trim();
        if (carTimes[carName] && row.children[COL_BEST_TIME]) {
            row.children[COL_BEST_TIME].textContent = carTimes[carName];
        }
    }

    // Resume qualification state if in progress
    if (qualifState.inProgress) {
        const serieVisible = qualifState.serie;
        const remaining = serieVisible === "A" ? remainingCarsA : remainingCarsB;
        if (remaining.length > 0) {
            console.log(`Reprise qualification série ${serieVisible} (${remaining.length} voitures restantes)`);
        }
    }

    // Initialize benchmark data if not present
    if (!localStorage.getItem("fastway_benchmark_A")) saveRankBenchmark('A');
    if (!localStorage.getItem("fastway_benchmark_B")) saveRankBenchmark('B');

    restoreTotalPoints();
    updateMainTable();
    refreshAllWinPercentagesFromState();

    // Reprise automatique d'une course interrompue (ex: refresh en plein duel).
    loadRaceState();
    raceSerieVisible = !serieA.classList.contains('hidden') ? 'A' : 'B';
    const raceState = getCurrentState();
    if (
      raceState &&
      !raceState.raceFinished &&
      !raceState.racePaused &&
      (
        (Array.isArray(raceState.currentDuels) && raceState.currentDuels.length > 0) ||
        (Array.isArray(raceState.raceQueue) && raceState.raceQueue.length > 0) ||
        (Array.isArray(raceState.raceWinners) && raceState.raceWinners.length > 0)
      )
    ) {
      setTimeout(() => startRound(), 120);
    }
});


/* ---------- tableau standing ---------- */
function updateMainTable(skipWinPct = true) {
  try {
    const rows = Array.from(document.querySelectorAll(".column-row"));

    let savedAllData = [];
    try {
      const raw = JSON.parse(localStorage.getItem("fastwayAllData") || "[]");
      savedAllData = Array.isArray(raw) ? raw : (raw && typeof raw === "object" ? Object.values(raw) : []);
    } catch (e) { savedAllData = []; }

    // Mise à jour des données brutes (Points, Wins, etc.)
    rows.forEach((row) => {
      const getText = (i) => (row.children[i] && row.children[i].textContent) ? row.children[i].textContent.trim() : "";
      const points = parseInt(getText(COL_POINT_CALIF).replace(/\D/g,'')) || 0;
      const wins = parseInt(getText(4)) || 0;

      let lossCell = row.querySelector(".loss");
      if (!lossCell) {
        lossCell = document.createElement("div");
        lossCell.className = "loss";
        lossCell.style.display = "none";
        row.appendChild(lossCell);
      }
      const carName = getText(2);
      const savedRow = savedAllData.find(r => r.name === carName) || {};
      let losses = parseInt(lossCell.textContent) || parseInt(savedRow.losses) || 0;
      if (!Number.isFinite(losses)) losses = 0;
      lossCell.textContent = String(losses);

      if (!skipWinPct && row.children[7]) {
        const totalRaces = wins + losses;
        let winPctText = "--";
        if (totalRaces > 0) {
          const winPct = (wins / totalRaces) * 100;
          winPctText = Number.isFinite(winPct) ? winPct.toFixed(2).replace(/\.?0+$/,'') + "%" : "--";
        }
        row.children[7].textContent = winPctText;
      }

      const total = (wins * 10) + points;
      if (row.children[8]) row.children[8].textContent = String(total);
    });

    // Fonction de tri et d'affichage du DELTA
    const sortSeries = (container, serieName) => {
      if (!container) return;
      const rowsArr = Array.from(container.querySelectorAll(".column-row"));
      rowsArr.forEach((r, i) => { if (!r.dataset.rankId) r.dataset.rankId = i; });

      // 1. TRI
      rowsArr.sort((a,b) => {
        const totalA = parseInt((a.children[8]?.textContent) || "0", 10);
        const totalB = parseInt((b.children[8]?.textContent) || "0", 10);
        if (totalB !== totalA) return totalB - totalA;
        return (parseInt(a.dataset.rankId) || 0) - (parseInt(b.dataset.rankId) || 0);
      });

      // 2. Chargement du Benchmark (Ancien classement)
      const benchmarkRaw = localStorage.getItem(`fastway_benchmark_${serieName}`);
      const benchmark = benchmarkRaw ? JSON.parse(benchmarkRaw) : {};

      // 3. Affichage Rank + Delta
      rowsArr.forEach((r, i) => {
        const newRank = i + 1;
        const carName = r.children[2]?.textContent.trim();
        const oldRank = benchmark[carName]; // Peut être undefined si nouvelle voiture

        let deltaHTML = "";
        
        if (oldRank) {
            const diff = oldRank - newRank; // Ex: Était 5, Maint 2 => 5-2 = +3 (Gain)
            
            if (diff > 0) {
                // Gain de place (Vert)
                deltaHTML = `<span class="delta-indicator delta-up">▲ +${diff}</span>`;
            } else if (diff < 0) {
                // Perte de place (Rouge)
                deltaHTML = `<span class="delta-indicator delta-down">▼ ${diff}</span>`;
            } else {
                // Pas de changement (Vide ou tiret)
                deltaHTML = `<span class="delta-indicator delta-neutral"></span>`;
            }
        } else {
             // Pas d'historique
             deltaHTML = `<span class="delta-indicator delta-neutral"></span>`;
        }

        // Injection dans la première colonne (Pos)
        if (r.children[0]) {
            r.children[0].innerHTML = `
                <div class="pos-cell-content">
                    ${deltaHTML}
                    <span class="rank-number">${newRank}</span>
                </div>
            `;
        }
        
        container.appendChild(r);
      });
    };

    // Tri des séries
    sortSeries(serieA, 'A');
    sortSeries(serieB, 'B');

    saveAllData();
  } catch (e) {
    console.error("Erreur dans updateMainTable :", e);
  }
}

/* ---------- ATTRIBUTION POINTS (DYNAMIQUE) & MODAL RECAP ---------- */
function assignQualifPointsForSeries(serieElement) {
  if (!serieElement) return;

  // 1. Filtrer les éliminés et trier par temps
  const results = Array.from(serieElement.querySelectorAll(".column-row"))
    .filter(row => !row.classList.contains("eliminated-visual")) 
    .map(row => {
      const name = row.children[2]?.textContent.trim();
      let lastTimeCell = row.querySelector(".last-time");
      if (!lastTimeCell) {
        lastTimeCell = document.createElement("div");
        lastTimeCell.className = "last-time";
        lastTimeCell.style.display = "none";
        row.appendChild(lastTimeCell);
      }
      const timeStr = (lastTimeCell.textContent || "").trim();
      const timeNum = timeToNumber(timeStr);
      return { row, name, timeStr, timeNum };
    })
    .sort((a, b) => a.timeNum - b.timeNum);

  // 2. Logique des points dynamiques
  const validCarsCount = results.length;
  const maxPoints = Math.min(10, validCarsCount); // Le max de point est 10, ou le nb de voitures si < 10
  const isBestOfSeries = playoffState.active && playoffState.currentRoundIndex >= (PLAYOFF_STRUCTURE.length - 1);

  let currentPos = 1;
  for (let i = 0; i < results.length; ) {
    let j = i + 1;
    while (j < results.length && results[j].timeNum === results[i].timeNum) j++;
    const groupCount = j - i;
    
    // Les points sont donnés aux 10 premiers NON-ÉLIMINÉS
    const pts = currentPos <= 10 ? (11 - currentPos) : 0;

    // --- LA BOUCLE CORRIGÉE ET SÉCURISÉE ---
    for (let k = i; k < j; k++) {
      if (results[k].row && results[k].row.children[COL_POINT_CALIF]) {
        // 1. On récupère les points précédents
        const previous = parseInt(results[k].row.children[COL_POINT_CALIF].textContent, 10) || 0;
        
        // 2. On additionne les nouveaux points de qualif
        results[k].row.children[COL_POINT_CALIF].textContent = previous + pts;
        
        // 3. NOUVEAU : Sauvegarde des points reçus dans le DOM pour pouvoir l'annuler au besoin
        results[k].row.setAttribute('data-last-earned', pts);
      }
      
      // Ces deux lignes doivent bien rester DEDANS la boucle 'k'
      results[k].displayPos = currentPos;
      results[k].qualifPts = pts;
    }

    currentPos += groupCount;
    i = j;
  }

  saveAllData();
  const serieName = (serieElement === serieA) ? 'A' : 'B';
  saveRankBenchmark(serieName);

  if (serieName === 'A') {
      qualifA_done = true; finishedA = true; localStorage.setItem("finishedA", "true"); 
  } else {
      qualifB_done = true; finishedB = true; localStorage.setItem("finishedB", "true");
  }
  
  // 3. SEEDING POUR LA COURSE (Garantit 1er vs Dernier)
  const state = raceStates[serieName];
  state.raceQueue = results.map(r => r.name); // Sauvegarde l'ordre du plus rapide au plus lent
  saveRaceState();

  // 4. Modal Récapitulatif
  document.querySelectorAll(".fastway-modal-overlay").forEach(m => m.remove());
  const modal = document.createElement("div");
  modal.className = "fastway-modal-overlay";

  let rowsHTML = "";
  for (const r of results) {
    let posColor = "#0077ff";
    if (r.displayPos === 1) posColor = "#FFD700";
    else if (r.displayPos === 2) posColor = "#C0C0C0";
    else if (r.displayPos === 3) posColor = "#CD7F32";
    
    // Si temps infini, on affiche DNF
    const displayTime = r.timeNum === Infinity ? "DNF" : (r.timeStr || "-");
    const displayPts = isBestOfSeries ? "-" : `+${r.qualifPts}`;

    rowsHTML += `
      <tr>
        <td style="font-weight:800;color:${posColor};font-size:16px;">${r.displayPos}</td>
        <td style="text-align:left;font-weight:500;">${r.name}</td>
        <td style="text-align:right;font-family:'Courier New',monospace;color:#ccc;">${displayTime}</td>
        <td style="font-weight:bold;color:#00ffea;">${displayPts}</td>
      </tr>`;
  }

  modal.innerHTML = `
    <div class="recap-wrapper">
        <div class="recap-content">
            <div style="text-align:center;margin-bottom:15px;">
                <h2 class="recap-title">${isBestOfSeries ? "GRILLE DE DÉPART (BO5)" : "RÉSULTATS QUALIF"}</h2>
                <p style="margin:5px 0 0;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:2px;">Série validée</p>
            </div>
            <div class="recap-table-container">
                <table class="recap-table-fastway">
                    <thead><tr><th>Pos</th><th style="text-align:left;">Pilote</th><th style="text-align:right;">Temps</th><th>Pts</th></tr></thead>
                    <tbody>${rowsHTML}</tbody>
                </table>
            </div>
            <div style="margin-top:20px;text-align:center;">
                <button id="closeRecapBtn" class="recap-close-btn">FERMER</button>
            </div>
        </div>
    </div>
  `;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('active'));

  modal.querySelector("#closeRecapBtn").addEventListener("click", () => {
    modal.classList.remove('active');
    setTimeout(() => modal.remove(), 300);
  });
}
  
/* ---------- flow qualification (AVEC GESTION DE PHASE) ---------- */
startCalifBtn.addEventListener("click", () => {
  qualifState.inProgress = true;
  qualifState.serie = !serieA.classList.contains("hidden") ? "A" : "B";
  saveQualifState();

  const serieVisible = !serieA.classList.contains("hidden") ? "A" : "B";
  
  // 1. VERIFICATION DE LA PHASE (QUALIF vs RACE)
  // On lit la phase actuelle ("QUALIF" ou "RACE"). Par défaut, c'est "QUALIF".
  const currentPhase = localStorage.getItem(PHASE_KEY_PREFIX + serieVisible) || "QUALIF";

  if (currentPhase === "RACE") {
      showFastwayAlert(`La qualification est terminée pour la série ${serieVisible}.<br>Vous devez terminer la <b>COURSE</b> avant de relancer une qualif.`);
      return;
  }

  // 2. RESET AUTOMATIQUE (Si on est en phase QUALIF mais que l'ancienne est marquée "finished")
  if (serieVisible === "A" && finishedA && currentPhase === "QUALIF") {
      // C'est une NOUVELLE qualif après une course : on reset le flag
      finishedA = false; 
      localStorage.setItem("finishedA", "false");
      // remainingCarsA sera vidé/re rempli par la logique ci-dessous
  }
  if (serieVisible === "B" && finishedB && currentPhase === "QUALIF") {
      finishedB = false;
      localStorage.setItem("finishedB", "false");
  }

  const serieElement = serieVisible === "A" ? serieA : serieB;
  // On ne prend que ceux qui n'ont PAS la classe 'eliminated-visual'
const carNames = Array.from(serieElement.querySelectorAll(".column-row"))
                       .filter(r => !r.classList.contains("eliminated-visual")) 
                       .map(r => r.children[2]?.textContent.trim())
                       .filter(n => n);

  // Initialisation de la liste si vide (Ceci gère le reset des voitures)
  if (serieVisible === "A" && remainingCarsA.length === 0) remainingCarsA = shuffle(carNames.slice());
  if (serieVisible === "B" && remainingCarsB.length === 0) remainingCarsB = shuffle(carNames.slice());

  const remaining = serieVisible === "A" ? remainingCarsA : remainingCarsB;

  // Si plus de voitures, on termine
  if (remaining.length === 0) {
    assignQualifPointsForSeries(serieElement);
    
    // 3. PASSAGE EN PHASE COURSE
    // On verrouille la qualif pour cette série
    localStorage.setItem(PHASE_KEY_PREFIX + serieVisible, "RACE");

    if (serieVisible === "A") {
      finishedA = true;
      if(typeof endQualif === 'function') endQualif("A");
    } else {
      finishedB = true;
      if(typeof endQualif === 'function') endQualif("B");
    }
    return;
  }

  const currentCar = remaining[0];

  // Appel du Modal
  showModalForTime({
    carName: currentCar,
    onConfirm: (time) => {
      if (time === null) {
          return; 
      }

      // Sauvegarde de l'état précédent pour permettre l'UNDO
      const row = findRowByName(currentCar);
      let prevTime = null;
      let prevBest = null;
      if (row) {
        const lastTimeCell = row.querySelector(".last-time");
        if (lastTimeCell) prevTime = lastTimeCell.textContent || null;

        const bestTimeCell = row.children[6];
        if (bestTimeCell) prevBest = bestTimeCell.textContent || null;
      }
      lastQualifAction = {
        name: currentCar,
        prevTime,
        prevBest,
        serie: serieVisible
      };
      // NOUVEAU : On sauvegarde l'action dans le navigateur pour qu'elle survive au Refresh (F5)
      localStorage.setItem("fastway_last_qualif", JSON.stringify(lastQualifAction));

      enregistrerLastTime(currentCar, time);
      majBestTime(currentCar, time);

      if (serieVisible === "A") {
        remainingCarsA = remainingCarsA.slice(1);
        localStorage.setItem("remainingCarsA", JSON.stringify(remainingCarsA));
      } else {
        remainingCarsB = remainingCarsB.slice(1);
        localStorage.setItem("remainingCarsB", JSON.stringify(remainingCarsB));
      }

      saveAllData();
      localStorage.setItem("finishedA", finishedA);
      localStorage.setItem("finishedB", finishedB);

      // Vérifier s'il reste des voitures
      const newRemaining = (serieVisible === "A") ? remainingCarsA : remainingCarsB;
      if (newRemaining.length === 0) {
        assignQualifPointsForSeries(serieElement);

        // --- VERROUILLAGE FIN DE QUALIF ---
        localStorage.setItem(PHASE_KEY_PREFIX + serieVisible, "RACE");

        if (serieVisible === "A") {
          finishedA = true; localStorage.setItem("finishedA", "true");
        } else {
          finishedB = true; localStorage.setItem("finishedB", "true");
        }
        updateMainTable();
        return;
      }

      setTimeout(() => startCalifBtn.click(), 250);
    },
    onSkip: () => {}
  });
});

/* ---------- helper modal simple ---------- */
function showModalForSimpleMessage(message) {
    // On appelle directement notre alerte stylée avec le message
    showFastwayAlert(message, "FASTWAY INFO");
}

/* ---------- fonctions utilitaires pour temps ---------- */
function enregistrerLastTime(carName, rawTime) {
  if (rawTime === null) return; 
  const time = normalizeTime(rawTime);
  const allRows = Array.from(document.querySelectorAll(".column-row"));
  for (const row of allRows) {
    const nameCell = row.children[2];
    if (nameCell && nameCell.textContent.trim() === carName) {
      let lastTimeCell = row.querySelector(".last-time");
      if (!lastTimeCell) {
        lastTimeCell = document.createElement("div");
        lastTimeCell.className = "last-time";
        lastTimeCell.style.display = "none";
        row.appendChild(lastTimeCell);
      }
      lastTimeCell.textContent = time || "DNF"; 
      carTimes[carName] = time || "DNF";        
      break;
    }
  }
}

function majBestTime(carName, time) {
  if (time === null) return;
  const allRows = Array.from(document.querySelectorAll(".column-row"));
  for (const row of allRows) {
    const nameCell = row.children[2];
    if (nameCell && nameCell.textContent.trim() === carName) {
      const bestTimeCell = row.children[6];
      const currentBest = (bestTimeCell && bestTimeCell.textContent) ? bestTimeCell.textContent.trim() : "";
      const currentBestNum = (currentBest === "" || /^dnf$/i.test(currentBest)) ? Infinity : parseFloat(currentBest.replace(",", "."));
      const newTimeNum = (/^dnf$/i.test(time)) ? Infinity : parseFloat(time.replace(",", "."));
      if (newTimeNum < currentBestNum || currentBest === "") {
        bestTimeCell.textContent = time || "DNF";
      }
      break;
    }
  }
}


// 1. UNDO LAST QUALIF (RÉPARÉ - FULL REWIND POINTS & BEST TIME)
if (undoQualifBtn) {
    undoQualifBtn.addEventListener("click", () => {
        const rawQualif = localStorage.getItem("fastway_last_qualif");
        const action = lastQualifAction || (rawQualif ? JSON.parse(rawQualif) : null);

        if (!action) {
            showFastwayAlert("Aucune qualification à annuler.", "INFO");
            return;
        }

        const { name, prevTime, prevBest, serie } = action;
        const row = findRowByName(name);
        const containerId = (serie === 'A') ? 'serie-a' : 'serie-b';
        const container = document.getElementById(containerId);

        if (row) {
            // 1. Restauration des anciens temps
            row.querySelector('.last-time').textContent = prevTime || "";
            const bestCell = row.querySelector('.best-time');
            const targetBestCell = bestCell || row.children[COL_BEST_TIME];
            if (targetBestCell) targetBestCell.textContent = prevBest || "";

            const state = (serie === 'B') ? raceStates.B : raceStates.A;
            if (prevBest) {
                state.bestTimes[name] = prevBest;
            } else {
                delete state.bestTimes[name];
            }

            // 2. Vérifier si on doit faire un FULL REWIND des points
            const wasFinished = (serie === 'A') ? finishedA : finishedB;

            if (wasFinished) {
                const allRows = container.querySelectorAll('.column-row');
                allRows.forEach(r => {
                    const earned = parseInt(r.getAttribute('data-last-earned') || '0', 10);
                    const pointCalifCell = r.children[COL_POINT_CALIF];
                    if (pointCalifCell) {
                        const currentPoints = parseInt(pointCalifCell.textContent || '0', 10);
                        pointCalifCell.textContent = Math.max(0, currentPoints - earned).toString();
                    }
                    r.removeAttribute('data-last-earned');
                });
            }

            // 3. On remet la voiture dans la liste et réinitialise l'état de la série
            const remainingCars = (serie === 'A') ? remainingCarsA : remainingCarsB;
            const finishedVarName = (serie === 'A') ? 'finishedA' : 'finishedB';
            const phaseVarName = (serie === 'A') ? 'fastway_phase_A' : 'fastway_phase_B';

            if (!remainingCars.includes(name)) {
                remainingCars.unshift(name);
            }
            if (serie === 'A') {
                finishedA = false;
            } else {
                finishedB = false;
            }
            localStorage.setItem(finishedVarName, "false");
            localStorage.setItem(phaseVarName, "QUALIF");
        }

        lastQualifAction = null;
        localStorage.removeItem("fastway_last_qualif");

        saveQualifState();
        saveRaceState();
        saveAllData();
        updateMainTable();

        showFastwayAlert(`La qualification de ${name} a été annulée.\nVous pouvez relancer START CALIF.`, "SUCCÈS");
    });
}

    // 2. UNDO LAST DUEL
    const undoLastDuelBtn = document.getElementById("undoLastDuelBtn");
    if (undoLastDuelBtn) {
        undoLastDuelBtn.addEventListener("click", () => {
            if (!lastDuelAction) {
                showFastwayAlert("Aucun duel récent à annuler.", "IMPOSSIBLE");
                return;
            }

            const { winner, loser, serie, prevBestWinner, prevBestLoser } = lastDuelAction;

            // On vérifie si la série affichée correspond à celle du duel
            if (serie !== raceSerieVisible) {
                showFastwayAlert("Changez de série pour annuler ce duel.", "MAUVAISE SÉRIE");
                return;
            }

            if (!confirm(`Annuler le duel : ${winner} vs ${loser} ?`)) return;

            const state = getCurrentState();

            // Restaurer les Best Times
            state.bestTimes[winner] = prevBestWinner;
            state.bestTimes[loser] = prevBestLoser;

            // Retirer Victoire et Défaite
            if (state.carStats[winner]) {
                state.carStats[winner].wins = Math.max(0, (state.carStats[winner].wins || 0) - 1);
            }
            if (state.carStats[loser]) {
                state.carStats[loser].losses = Math.max(0, (state.carStats[loser].losses || 0) - 1);
            }

            // Retirer le gagnant de la liste de progression
            const winnerIdx = state.raceWinners.indexOf(winner);
            if (winnerIdx > -1) {
                state.raceWinners.splice(winnerIdx, 1);
            }

            // Remettre le duel en haut de la file d'attente
            state.currentDuels.unshift([winner, loser]);

            lastDuelAction = null;
            saveRaceState();

            if (typeof applySavedBestTimes === 'function') applySavedBestTimes();
            updateMainTable();

            showFastwayAlert("Duel annulé et statistiques rétablies.", "ANNULATION");
        });
    }



/* ---------- UTILITAIRES ---------- */
function incrementLossColumn(name) {
    const row = findRowByName(name);
    if (!row) return;

    // Mise à jour État (LocalStorage)
    const seriesKey = serieB.contains(row) ? 'B' : 'A';
    const state = raceStates[seriesKey];
    
    if (!state.carStats[name]) state.carStats[name] = { wins: 0, losses: 0 };
    state.carStats[name].losses = (state.carStats[name].losses || 0) + 1;
    
    // Mise à jour Visuelle (Colonne cachée .loss)
    let lossCell = row.querySelector(".loss");
    if (lossCell) {
        lossCell.textContent = state.carStats[name].losses;
    }

    // Recalcul du pourcentage immédiatement
    updateWinPercentage(row, state);
    saveRaceState();
}

/* ---------- CONFIGURATION PLAYOFFS ---------- */
MAX_RACES = 1; // Saison régulière (modifiable pour test)

// Structure des rounds
const PLAYOFF_STRUCTURE = [
    { name: "ROUND 1", races: 3, targetCount: 10 }, // On commence à 14, on finit à 10
    { name: "ROUND 2", races: 3, targetCount: 6 },  // On commence à 10, on finit à 6
    { name: "ROUND 3", races: 2, targetCount: 2 },  // On commence à 6, on finit à 2
    { name: "DIVISION FINAL", races: 5, targetCount: 1 } // Best of 5 (Duel)
];

// État global des playoffs
playoffState = {
    active: false,
    currentRoundIndex: 0, // 0 = Round 1, 1 = Round 2...
    currentRaceInRound: 0,
    isFinal: false // Pour le FASTWAY FINAL (A vs B)
};

// ... existing code ...

/* ---------- EXÉCUTION DU TIEBREAKER (DUEL INSTANTANÉ) ---------- */
function executeTiebreaker(tieData, serieKey, onComplete) {
    if (tieData.status === "REQUIRE_TIEBREAKER_DUEL") {
        const car1 = tieData.cars[0];
        const car2 = tieData.cars[1];

        // On lance le duel instantané
        showDuelModal(car1, car2, `TIEBREAKER - SÉRIE ${serieKey}`, (winner) => {
            
            // Le duel est fini, on donne +1 point au gagnant pour briser l'égalité !
            const winnerRow = findRowByName(winner);
            if (winnerRow) {
                const ptsCell = winnerRow.children[COL_POINT_CALIF];
                if (ptsCell) {
                    ptsCell.textContent = (parseInt(ptsCell.textContent, 10) || 0) + 1;
                }
                saveAllData(); 
                if (typeof updateMainTable === 'function') updateMainTable(); 
            }
            
            showFastwayAlert(`Le bris d'égalité est remporté par ${winner} ! La voiture passe au round suivant.`, "RÉSOLUTION", () => {
                onComplete(); // Relance la progression
            });
        });
    } else {
        // Sécurité si on a une égalité à 3+ voitures (mini-championnat manuel)
        showFastwayAlert(`Bris d'égalité multiple (${tieData.cars.length} voitures). Veuillez faire les courses manuellement, ajouter 1 point au gagnant dans le tableau, puis relancer.`, "ACTION REQUISE", () => {
            onComplete();
        });
    }
}

function handlePlayoffProgression() {
    // If we are in the global final (FASTWAY FINAL - BO7)
    if (playoffState.isFinal) {
        showFastwayAlert("FASTWAY FINAL UPDATE: Logique Best of 7 en cours...", "FINAL");
        // It's assumed that a separate function like updateFastwayFinal() handles BO7 progression.
        // If not, this 'return' would effectively halt playoff progression once in the final.
        return;
    }

    const currentStructure = PLAYOFF_STRUCTURE[playoffState.currentRoundIndex];
    if (!currentStructure) {
        console.error("Error: currentStructure is undefined. Playoff state might be invalid or out of bounds.");
        // This could happen if playoffState.currentRoundIndex exceeds PLAYOFF_STRUCTURE.length unexpectedly.
        return;
    }

    // Increment race count for the current round. This happens for every completed race.
    playoffState.currentRaceInRound++;

    // Check if the current round has more races remaining
    if (playoffState.currentRaceInRound < currentStructure.races) {
        // Round continues normally - a race within the round just finished
        showFastwayAlert(
            `${currentStructure.name}<br>Course ${playoffState.currentRaceInRound} / ${currentStructure.races} terminée.`,
            "PLAYOFF PROGRESS"
        );
        resetForNextRace(); // Prepare for the next race in the current round
        saveRaceState(); // Save the updated race count
        return;
    }

    // --- END OF ROUND LOGIC: CUTOFF, TIEBREAKER RESOLUTION, AND ROUND ADVANCEMENT ---
    // This section is encapsulated in resolveRound to allow re-execution after tiebreakers.
    const resolveRound = () => {
        const processSeriesCut = (serieKey, keepCount) => {
            // Get the list of cars that were qualified *before* this round started
            const previouslyQualifiedList = (serieKey === 'A') ? playoffData.A.qualified : playoffData.B.qualified;
            const container = (serieKey === 'A') ? document.getElementById('serie-a') : document.getElementById('serie-b');
            const rows = Array.from(container.querySelectorAll('.column-row'));

            // Filter contenders to only include those still "in play" from the previous round's qualification
            let contenders = rows.filter(r => {
                const name = r.children[2].textContent.trim(); // Assuming car name is in children[2]
                return previouslyQualifiedList.includes(name);
            }).map(r => {
                const name = r.children[2].textContent.trim();
                const pts = parseInt(r.children[COL_POINT_CALIF]?.textContent || "0", 10) || 0;
                // Assuming wins are in children[4]. If there's a specific class like '.wins', it would be more robust.
                const wins = parseInt(r.children[4]?.textContent || "0", 10) || 0;
                const total = (wins * 10) + pts; // Apply the existing weighting logic
                return { name, points: total, row: r };
            });

            // Use the "magic" function to check for ties and get qualified cars based on current scores
            const cutResult = getQualifiedCarsWithTiebreaker(contenders, keepCount);
            return { serieKey, result: cutResult, contenders }; // Return serieKey and contenders for easier processing
        };

        let resultA = processSeriesCut('A', currentStructure.targetCount);
        let resultB = processSeriesCut('B', currentStructure.targetCount);

        // Collect all detected tiebreakers
        const tiebreakersToRun = [];
        if (resultA.result.status === "TIEBREAKER") tiebreakersToRun.push({ data: resultA.result, serieKey: 'A' });
        if (resultB.result.status === "TIEBREAKER") tiebreakersToRun.push({ data: resultB.result, serieKey: 'B' });

        if (tiebreakersToRun.length > 0) {
            // Tiebreakers detected! Display a consolidated alert.
            let msg = "ÉGALITÉ CRITIQUE SUR LA LIGNE DE COUPURE DÉTECTÉE !<br><br>";
            tiebreakersToRun.forEach(tb => {
                msg += `Série ${tb.serieKey} : ${tb.data.cars.join(' vs ')}<br>`;
            });
            msg += "<br>Fermez ce message pour lancer le duel(s) de départage !";

            showFastwayAlert(msg, "🚨 TIEBREAKER REQUIS 🚨", () => {
                // Function to run tiebreakers sequentially
                const runNextTiebreaker = (index) => {
                    if (index < tiebreakersToRun.length) {
                        const currentTiebreaker = tiebreakersToRun[index];
                        executeTiebreaker(currentTiebreaker.data, currentTiebreaker.serieKey, () => {
                            runNextTiebreaker(index + 1); // Proceed to the next tiebreaker in the queue
                        });
                    } else {
                        // All tiebreakers for this round are resolved.
                        // Re-run the entire round resolution logic to apply cuts based on updated points.
                        resolveRound();
                    }
                };
                runNextTiebreaker(0); // Start with the first tiebreaker
            });
            return; // Exit current execution; the callback chain will eventually call resolveRound again.
        }

        // If we reach here, either no tiebreakers were detected or all have been resolved.
        // Proceed to apply visual eliminations and update qualified lists based on final scores.

        // Re-process cuts to ensure `qualified` lists are definitive after any potential point changes from tiebreakers.
        // This is important because `executeTiebreaker` modifies points in the DOM.
        resultA = processSeriesCut('A', currentStructure.targetCount); // Recalculate
        resultB = processSeriesCut('B', currentStructure.targetCount); // Recalculate

        // Apply visual eliminations and update the global qualified lists for the next round
        [resultA, resultB].forEach(({ serieKey, result, contenders }) => {
            const qualifiedNames = result.qualified;
            contenders.forEach(c => {
                if (!qualifiedNames.includes(c.name)) {
                    // Car is eliminated
                    c.row.classList.add("eliminated-visual");
                    c.row.classList.remove("playoff-qualified"); // Remove if they were previously qualified
                } else {
                    // Car is qualified for the next round, ensure visual state
                    c.row.classList.add("playoff-qualified");
                }
            });
            // Update the global playoffData for the next round
            if (serieKey === 'A') playoffData.A.qualified = qualifiedNames;
            else playoffData.B.qualified = qualifiedNames;
        });

        // Advance to the next playoff round
        playoffState.currentRoundIndex++;
        playoffState.currentRaceInRound = 0; // Reset race count for the new round

        // Check if playoffs are fully complete or moving to the Fastway Final
        if (playoffState.currentRoundIndex >= PLAYOFF_STRUCTURE.length) {
            setupFastwayFinal(); // Function to set up the global final (Best of 7)
        } else {
            const nextStructure = PLAYOFF_STRUCTURE[playoffState.currentRoundIndex];
            
            // Special announcement for Division Final (Best of 5)
            if (nextStructure.name === "DIVISION FINAL") {
                showFastwayAlert(
                    `Round terminé ! Des voitures ont été éliminées.<br>Place à la <b>${nextStructure.name}</b> !<br>Il ne reste que 2 voitures par série. Le premier à 3 victoires (Best of 5) passe en FASTWAY FINAL !`,
                    "🏆 DIVISION FINAL 🏆"
                );
            } else {
                // General announcement for other rounds
                showFastwayAlert(
                    `Round terminé ! Des voitures ont été éliminées.<br>Début du <b>${nextStructure.name}</b>.<br>Nombre de courses : ${nextStructure.races}`,
                    "PLAYOFF UPDATE"
                );
            }
            resetForNextRace(); // Reset for the first race of the new round
        }
        saveRaceState(); // Save the playoff state after round advancement
    };

    // Initiate the round resolution logic when all races for the current round are complete.
    resolveRound();
}

/* ---------- CRÉATION DE LA GRANDE FINALE ULTIME (BO7) ---------- */
function setupFastwayFinal() {
    // On trouve le champion de la série A (celui qui a 3 victoires en finale de division)
    let winnerA = finalSeriesScores?.A?.wins ? Object.keys(finalSeriesScores.A.wins).find(k => finalSeriesScores.A.wins[k] >= 3) : undefined;
    // On trouve le champion de la série B
    let winnerB = finalSeriesScores?.B?.wins ? Object.keys(finalSeriesScores.B.wins).find(k => finalSeriesScores.B.wins[k] >= 3) : undefined;

    if (!winnerA || !winnerB) {
        // Sécurité si les données manquaient : on prend les meilleures voitures restantes
        winnerA = playoffData?.A?.qualified?.[0] || "Champion A";
        winnerB = playoffData?.B?.qualified?.[0] || "Champion B";
    }

    // On configure l'état pour la finale globale
    playoffState.isFinal = true;
    playoffState.active = true;
    playoffState.currentMatches = [
        { car1: winnerA, car2: winnerB, serie: 'FINAL', done: false, winner: null }
    ];
    playoffState.matchIndex = 0;

    showFastwayAlert(
        `Mesdames et messieurs... Nous y sommes !<br><br>Le champion de la Série A (<b>${winnerA}</b>) affronte le champion de la Série B (<b>${winnerB}</b>) pour la finale de la <b>FASTWAY Cup</b> !<br><br>Série ultime au meilleur des 7 courses (BO7). Que le meilleur gagne !`,
        "🏎️ THE FASTWAY FINAL 🏎️",
        () => {
            startNextDuel(); // Lance le premier affrontement du BO7 !
        }
    );
    saveRaceState();
}

/* ---------- GESTION DELTA POSITIONS ---------- */
function saveRankBenchmark(serie) {
    // 1. On récupère toutes les lignes TRIÉES de la série
    const container = (serie === 'A') ? serieA : serieB;
    const rows = Array.from(container.querySelectorAll(".column-row"));

    // 2. On crée une map : "NomVoiture" => Rang (Index + 1)
    const rankMap = {};
    rows.forEach((row, index) => {
        const name = row.children[2]?.textContent.trim();
        if (name) {
            rankMap[name] = index + 1;
        }
    });

    // 3. On sauvegarde dans localStorage
    localStorage.setItem(`fastway_benchmark_${serie}`, JSON.stringify(rankMap));
}

function updateRaceCounterUI() {

    // Récupération sécurisée du compteur (inchangée)
    let currentCount = 0;
    if (typeof raceCount !== 'undefined') {
        currentCount = raceCount;
    } else {
        try {
            const raw = localStorage.getItem(RACE_STATE_KEY);
            const saved = JSON.parse(raw || '{}');
            currentCount = saved.raceCount || 0;
        } catch(e) {}
    }

    let counterEl = document.getElementById('race-counter');
    const buttonsContainer = document.querySelector('.race-buttons');

    // 1. Création et Positionnement (inchangé)
    if (!counterEl && buttonsContainer) {
        counterEl = document.createElement('div');
        counterEl.id = 'race-counter';

        buttonsContainer.style.position = 'relative';

        Object.assign(counterEl.style, {
            position: 'absolute',
            top: '-15px',
            right: '-213px',
            width: 'auto',
            whiteSpace: 'nowrap',
            fontSize: '15px',
            fontFamily: "'Poppins', sans-serif",
            fontWeight: '800',
            letterSpacing: '1.2px',
            pointerEvents: 'none',
            textTransform: 'uppercase',
            textAlign: 'right'
        });

        buttonsContainer.appendChild(counterEl);
    }

    // --- LOGIQUE DE MISE À JOUR DU COMPTEUR ---
    let currentRace = currentCount; // Par défaut : Saison régulière
    let maxRaces = MAX_RACES;      // Par défaut : MAX_RACES
    let raceLabelText = 'RACES';   // Par défaut : RACES

    if (playoffState?.active) { // Utilisation de l'opérateur de chaînage optionnel pour un accès plus sûr
        // En mode Playoff
        const currentStructure = PLAYOFF_STRUCTURE[playoffState.currentRoundIndex];

        // Le compteur affiche la course qui va être jouée (courses terminées + 1)
        // Attention : Si le round est fini, on garde le max pour le round complété
        currentRace = Math.min(playoffState.currentRaceInRound + 1, currentStructure.races);

        // Le maximum de courses est le total pour ce round
        maxRaces = currentStructure.races;

        // Le libellé affiche le nom du Round (ex: ROUND 1)
        raceLabelText = currentStructure.name;

        // Gestion de la finale (optionnel, si la variable est bien définie)
        if (playoffState.isFinal) {
             maxRaces = 7; // Best of 7
             raceLabelText = "FASTWAY FINAL";
        }
    }


    // 2. Mise à jour du texte
    if (counterEl) {
        // J'utilise le format: RACES 1 / 14 (ou ROUND 1 1 / 3)
        counterEl.innerHTML = `
            <span style="color:#000; font-size:15px; margin-right:5px;">${raceLabelText}</span>
            <span style="color:#000; font-size:16px;">${currentRace}</span>
            <span style="color:#000; margin:0 1px; font-size:16px;">/</span>
            <span style="color:#000; font-size:16px;">${maxRaces}</span>
        `;
    }
}
   
function applySavedBestTimes() {
    ['A','B'].forEach(seriesKey => {
        const state = raceStates[seriesKey];
        if (!state || !state.bestTimes) return;

        Object.entries(state.bestTimes).forEach(([name, time]) => {
            const row = findRowByName(name);
            if (!row) return;

            // Vérifier à quelle série appartient la row
            const rowSeries = serieB.contains(row) ? 'B' : 'A';
            if (rowSeries !== seriesKey) return; // skip si mauvais tableau

            const bestEl = row.querySelector(".best-time");
            if (bestEl) bestEl.textContent = time;
            else if (typeof COL_BEST_TIME !== "undefined" && row.children[COL_BEST_TIME]) {
                row.children[COL_BEST_TIME].textContent = time;
            }
        });
    });
}

function endQualif(serie) {
    if (serie === 'A') {
        finishedA = true;
        qualifA_done = true;
    } else if (serie === 'B') { // Use else if for minor optimization
        finishedB = true;
        qualifB_done = true;
    }
    saveRaceState();
}

function canStartRace() {
    if (!qualifA_done || !qualifB_done) {
        alert("Les deux qualifications (A et B) doivent être terminées avant de commencer la course !");
        return false;
    }
    return true;
}

function endRace(serie) {
    // 1. Marquer la série comme finie et l'état de la course pour cette série
    if (serie === 'A') { 
        raceA_done = true; 
        finishedA = true; 
        if (raceStates.A) raceStates.A.raceFinished = true;
    } else if (serie === 'B') { 
        raceB_done = true; 
        finishedB = true; 
        if (raceStates.B) raceStates.B.raceFinished = true;
    }
    
    // 2. Attendre que A et B soient finis
    if (raceA_done && raceB_done) {
        // S'assurer que les deux séries sont marquées comme terminées si les deux courses sont finies
        if (raceStates.A) raceStates.A.raceFinished = true;
        if (raceStates.B) raceStates.B.raceFinished = true;

        // --- CAS 1 : SAISON RÉGULIÈRE ---
        if (!playoffState.active) {
            raceCount++; 
            if (raceCount >= MAX_RACES) {
                 setTimeout(() => {
                    calculatePlayoffFieldAndStartRound1(); 
                 }, 2000); 
            } else {
                // Reset pour prochaine course régulière
                resetForNextRace();
                showFastwayAlert(`Race ${raceCount}/${MAX_RACES} terminée.`, "NEXT RACE");
            }
        } 
        // --- CAS 2 : PLAYOFFS ---
        else {
            handlePlayoffProgression();
        }
    }
    
    saveRaceState(); 
    if (typeof updateRaceUI === 'function') updateRaceUI();
}

// Fonction utilitaire pour reset les flags
function resetForNextRace() {
    raceA_done = false; raceB_done = false;
    qualifA_done = false; qualifB_done = false;
    finishedA = false; finishedB = false;
    
    if (raceStates.A) { 
        raceStates.A.raceFinished = false; 
        raceStates.A.raceQueue = []; 
        raceStates.A.raceWinners = []; 
        raceStates.A.currentDuels = []; 
    }
    if (raceStates.B) { 
        raceStates.B.raceFinished = false; 
        raceStates.B.raceQueue = []; 
        raceStates.B.raceWinners = []; 
        raceStates.B.currentDuels = []; 
    }
    
    localStorage.setItem("fastway_phase_A", "QUALIF");
    localStorage.setItem("fastway_phase_B", "QUALIF");
    localStorage.setItem("finishedA", "false"); 
    localStorage.setItem("finishedB", "false"); 
}

function getCurrentState() {
    return raceStates[raceSerieVisible];
}

gamePhase = "REGULAR_SEASON"; // "REGULAR_SEASON", "TIE_BREAKER", "PLAYOFF_R1", etc.
playoffData = {
    A: { qualified: [], eliminationCount: 0 },
    B: { qualified: [], eliminationCount: 0 }
};


// Helper to get and sort car data for a given series
function _getSortedCarData(seriesKey) {
    const container = (seriesKey === 'A') ? 
        document.getElementById('serie-a') : 
        document.getElementById('serie-b');
    const rows = Array.from(container.querySelectorAll('.column-row'));

    let cars = rows.map(row => {
        const name = row.children[2].textContent.trim();
        const pts = parseInt(row.children[COL_POINT_CALIF]?.textContent || "0", 10) || 0;
        const wins = parseInt(row.children[4]?.textContent || "0", 10) || 0;
        const chWins = parseInt(row.children[5]?.textContent || "0", 10) || 0;
        const total = (wins * 10) + pts;
        return { name, chWins, total, row }; // Include row reference
    });

    cars.sort((a, b) => {
        if (b.chWins !== a.chWins) return b.chWins - a.chWins;
        return b.total - a.total;
    });

    return cars;
}

/* ---------- LOGIQUE DE SÉLECTION PLAYOFFS ---------- */
function getQualifiedPlayoffCars(seriesKey) {
    const cars = _getSortedCarData(seriesKey); // Use the helper
    const CUTOFF = 14;
    
    // Vérification de l'égalité à la frontière (entre le 14ème et le 15ème)
    if (cars.length > CUTOFF) {
        const car14 = cars[CUTOFF - 1]; // Le dernier qualifié potentiel
        const car15 = cars[CUTOFF];     // Le premier éliminé potentiel

        if (car14.chWins === car15.chWins && car14.total === car15.total) {
            return {
                status: "TIE",
                contenders: [car14.name, car15.name],
                qualifiedList: null
            };
        }
    }

    // Pas d'égalité, on prend les 14 premiers
    const qualifiedNames = cars.slice(0, CUTOFF).map(c => c.name);
    return {
        status: "OK",
        contenders: [],
        qualifiedList: qualifiedNames
    };
}

function updateTableVisibilityForPlayoffs(seriesKey, qualifiedNames) {
    const container = (seriesKey === 'A') ? 
        document.getElementById('serie-a') : 
        document.getElementById('serie-b');
        
    const rows = Array.from(container.querySelectorAll('.column-row'));
    let rank = 1;

    rows.forEach(row => {
        const name = row.children[2].textContent.trim();
        if (qualifiedNames.includes(name)) {
            row.style.display = "flex"; // Afficher
            row.classList.add("playoff-qualified");
            row.classList.remove("eliminated-visual"); // Ensure it's not grayed out if previously eliminated
            
            // Update rank for qualified cars
            if (row.children[0]) {
                const rankSpan = row.querySelector('.rank-number');
                if (rankSpan) rankSpan.textContent = rank;
                else row.children[0].textContent = rank;
            }
            rank++;
        } else {
            row.style.display = "none"; // Masquer les éliminés
            row.classList.remove("playoff-qualified");
            row.classList.add("eliminated-visual"); 
        }
    });
}

function calculatePlayoffFieldAndStartRound1() {
    console.log("DÉBUT CALCUL PLAYOFFS (Version Officielle)...");
    
    // Fonction de tri et sélection (interne)
    const processSeries = (serieKey) => {
        const cars = _getSortedCarData(serieKey); // Use the helper
        
        // 3. Gestion du CUT à 14
        const CUTOFF = 14;
        
        // Vérification égalité (Tie-Breaker simple pour l'instant)
        if (cars.length > CUTOFF) {
            const car14 = cars[CUTOFF - 1];
            const car15 = cars[CUTOFF];
            
            // Si égalité stricte sur le cut
            if (car14.chWins === car15.chWins && car14.total === car15.total) {
                // NOTE : Pour respecter ton "tournoi", il faudrait ici une logique complexe.
                // Pour l'instant, on avertit l'utilisateur.
                showFastwayAlert(
                    `ÉGALITÉ CRITIQUE SÉRIE ${serieKey} !<br>Voitures: ${car14.name} vs ${car15.name}<br>Veuillez faire un duel manuel pour les départager avant de continuer.`, 
                    "TIE BREAKER REQUIS"
                );
                return null; // On bloque
            }
        }

        const qualifiedNames = cars.slice(0, CUTOFF).map(c => c.name);
        
        // 4. Application visuelle (GRIS PÂLE)
        cars.forEach(c => {
            if (qualifiedNames.includes(c.name)) {
                c.row.classList.remove("eliminated-visual");
                c.row.classList.add("playoff-qualified");
                c.row.style.display = "flex"; // Ensure qualified cars are visible
            } else {
                c.row.classList.add("eliminated-visual"); // Gris au lieu de caché
                c.row.classList.remove("playoff-qualified");
                c.row.style.display = "flex"; // Ensure eliminated cars are also visible (grayed out)
            }
        });

        return qualifiedNames;
    };

    const qualifA = processSeries('A');
    if (!qualifA) return; // Bloqué par tie-break
    
    const qualifB = processSeries('B');
    if (!qualifB) return; // Bloqué par tie-break

    // Mise à jour des données globales
    playoffData.A.qualified = qualifA;
    playoffData.B.qualified = qualifB;

    // --- RESET DES STATS POUR LES PLAYOFFS (Sauf Best Time) ---
    ['A', 'B'].forEach(serieKey => {
        const state = raceStates[serieKey];
        const container = (serieKey === 'A') ? document.getElementById('serie-a') : document.getElementById('serie-b');
        const rows = Array.from(container.querySelectorAll('.column-row'));

        rows.forEach(row => {
            const name = row.children[2].textContent.trim();
            if (!name) return;

            // Reset l'état en mémoire
            if (state.carStats && state.carStats[name]) {
                state.carStats[name].wins = 0;
                state.carStats[name].losses = 0;
                state.carStats[name].champWins = 0; // Remis à 0 pour le tournoi final
            }

            // Reset le DOM (Points Qualif, Wins, CH Wins, Losses)
            const ptsCalifCell = row.children[COL_POINT_CALIF];
            if (ptsCalifCell) ptsCalifCell.textContent = "0";
            
            const winsCell = row.children[4];
            if (winsCell) winsCell.textContent = "0";
            
            const chWinsCell = row.children[5];
            if (chWinsCell) chWinsCell.textContent = "0";
            
            let lossCell = row.querySelector('.loss');
            if (lossCell) lossCell.textContent = "0";
            
            updateWinPercentage(row, state);
        });
    });
    
    gamePhase = "PLAYOFF_R1";
    playoffState.active = true;
    playoffState.currentRoundIndex = 0; // Round 1
    playoffState.currentRaceInRound = 0;
    
    resetForNextRace();
    saveRaceState();

    showFastwayAlert(
        "Season just ended! All regular races are complete.<br>Time to calculate the final standings and set the grid for next weekend's Playoffs start!",
        "SEASON ENDED"
    );
}


/* ---------- LOGIQUE SAUVEGARDE ---------- */
// Remplace ton ancienne fonction saveRaceState par celle-ci :
function saveRaceState() {
    const state = { 
        finishedA, 
        finishedB,
        qualifA_done,
        qualifB_done, 
        raceA_done,
        raceB_done,   
        raceCount,    
        raceStates,
        gamePhase,
        playoffData,
        playoffState // <-- AJOUT : On sauvegarde l'état complet des playoffs
    };
    localStorage.setItem(RACE_STATE_KEY, JSON.stringify(state));
}

// Ajoute cette fonction juste en dessous de saveRaceState() :

/**
 * Fonction pour restaurer l'apparence des voitures (grisées ou normales)
 * en fonction des données des playoffs sauvegardées.
 */
function restorePlayoffVisuals() {
    // On ne fait rien si les playoffs n'ont pas commencé ou si playoffState est null/undefined
    if (!playoffState?.active) return; // Use optional chaining for safety

    // On parcourt les deux séries A et B
    ['A', 'B'].forEach(serieKey => {
        const container = (serieKey === 'A') ? document.getElementById('serie-a') : document.getElementById('serie-b');
        if (!container) return; // Ensure container exists

        const rows = Array.from(container.querySelectorAll('.column-row'));
        // On récupère la liste des qualifiés sauvegardée. Fallback to empty array if not found.
        const qualifiedList = playoffData[serieKey]?.qualified || []; // Use optional chaining for safety

        rows.forEach(row => {
            // Use optional chaining for safer access to textContent
            const name = row.children[2]?.textContent?.trim(); 
            if (!name) return; // Skip if name is not found

            // Si la voiture est dans la liste des qualifiés, on la met normale
            if (qualifiedList.includes(name)) {
                row.classList.remove("eliminated-visual");
                row.classList.add("playoff-qualified");
            } else {
                // Sinon, elle est éliminée, on la grise
                row.classList.add("eliminated-visual");
                row.classList.remove("playoff-qualified");
            }
        });
    });
}

// Remplace ton ancienne fonction loadRaceState par celle-ci :
function loadRaceState() {
    try {
        const raw = localStorage.getItem(RACE_STATE_KEY);
        if (!raw) return;
        const s = JSON.parse(raw);

        // 1. Chargement et Auto-Réparation des Qualifications
        // Ensure boolean assignment for finishedA/B, qualifA_done/B_done
        finishedA = !!s.finishedA;
        finishedB = !!s.finishedB;
        
        qualifA_done = !!s.qualifA_done || finishedA; 
        qualifB_done = !!s.qualifB_done || finishedB;

        // 2. Chargement et Auto-Réparation des Courses
        raceA_done = !!s.raceA_done;
        raceB_done = !!s.raceB_done;

        // CHARGEMENT DU COMPTEUR
        // Check for undefined to allow 0 to be a valid value for raceCount
        if (typeof s.raceCount !== 'undefined') {
            raceCount = s.raceCount;
        } else {
            raceCount = 0;
        }

        // Assign only if s.raceStates exists, otherwise keep current raceStates
        if (s.raceStates) raceStates = s.raceStates; 
        
        // --- AJOUTS IMPORTANTS POUR LES PLAYOFFS ---
        if (s.gamePhase) gamePhase = s.gamePhase;
        if (s.playoffData) playoffData = s.playoffData;
        if (s.playoffState) playoffState = s.playoffState;
        // ------------------------------------------

        // Réappliquer les stats sauvegardées sur le tableau
        ['A', 'B'].forEach(seriesKey => {
            const state = raceStates[seriesKey];
            if (!state || !state.carStats) return;

            Object.entries(state.carStats).forEach(([name, stats]) => {
                const row = findRowByName(name);
                if (!row) return;
                
                // Helper to update a stat
                const updateStat = (selector, colIndex, value) => {
                    if (value === undefined) return;
                    // Prioritize selector, fallback to colIndex if provided and exists
                    const element = row.querySelector(selector) || (typeof colIndex !== 'undefined' && row.children[colIndex] ? row.children[colIndex] : null);
                    if (element) {
                        element.textContent = value;
                    }
                };

                updateStat('.win', typeof COL_WIN !== 'undefined' ? COL_WIN : undefined, stats.wins);
                updateStat('.loss', undefined, stats.losses); // No COL_LOSS defined in original, assuming only class selector
                updateStat('.ch-win', typeof COL_CH_WIN !== 'undefined' ? COL_CH_WIN : undefined, stats.champWins);
                updateStat('.best-time', typeof COL_BEST_TIME !== 'undefined' ? COL_BEST_TIME : undefined, stats.bestTime);
                
                updateWinPercentage(row, state);
            });
        });
        refreshAllWinPercentagesFromState();
        
        // --- NOUVEAU : Restaure les couleurs des voitures éliminées ---
        restorePlayoffVisuals();

    } catch (e) {
        console.warn("Impossible de charger l'état de la course:", e);
    }
    
    // Appel pour mettre à jour l'affichage du compteur après le chargement
    if (typeof updateRaceCounterUI === 'function') {
        updateRaceCounterUI();
    }
}

function getSerieRows() {
    // Ensure serieA and serieB are defined, defensive check
    const targetSerie = raceSerieVisible === "A" ? serieA : serieB;
    return targetSerie ? Array.from(targetSerie.querySelectorAll(".column-row")) : [];
}

function getAllSerieRows() {
    // Defensive checks for serieA and serieB existence
    const serieARows = serieA ? Array.from(serieA.querySelectorAll('.column-row')) : [];
    const serieBRows = serieB ? Array.from(serieB.querySelectorAll('.column-row')) : [];
    return [...serieARows, ...serieBRows];
}

function isQualifDone() {
    return raceSerieVisible === "A" ? qualifA_done : qualifB_done;
}

function findRowByName(name) {
    if (!name) return null;
    // Trim the name once before searching to avoid re-trimming in loop
    const trimmedName = name.trim(); 
    return getAllSerieRows().find(r => (r.children[2]?.textContent || '').trim() === trimmedName) || null;
}

/* Convertit "00.000" ou "dnf" en nombre (ms) */
function safeTimeToNumber(t) {
    if (typeof timeToNumber === "function") return timeToNumber(t);
    if (!t) return Infinity;

    const s = ('' + t).trim().toLowerCase();
    if (s === 'dnf' || s === 'dnq' || s === '-') return Infinity;

    // Use a more robust regex for splitting to handle potential multiple colons or unexpected formats
    // Example: "1:23.456" or "45.678"
    const parts = s.split(":").map(p => parseFloat(p.replace(",", ".")));
    
    // Handle cases where parts might be NaN if parsing failed (e.g., "abc")
    if (parts.some(isNaN)) return Infinity; 

    if (parts.length === 1) return Math.round(parts[0] * 1000);
    if (parts.length === 2) return Math.round((parseFloat(parts[0]) * 60 + parseFloat(parts[1])) * 1000);
    // If more than 2 parts or unexpected format, treat as invalid
    return Infinity;
}


/* ---------- TRI STRICT (Pas de hasard) ---------- */
function getLastTimesAndSort() {
    // MODIFICATION ICI : On filtre les lignes de la série pour exclure les éliminés
    const rows = getSerieRows().filter(row => !row.classList.contains("eliminated-visual"));
    
    // 1. On capture l'ordre VISUEL actuel (l'index) pour départager les égalités parfaites
    const cars = rows.map((row, index) => {
        const name = (row.children[2]?.textContent || '').trim();
        let lastTime = row.querySelector(".last-time")?.textContent?.trim() || (row.children[COL_LAST_TIME]?.textContent?.trim() || 'dnf');
        let points = parseInt(row.children[COL_POINT_CALIF]?.textContent || "0", 10) || 0;
        return { row, name, lastTime, points, originalIndex: index };
    }).filter(c => c.name);

    cars.sort((a, b) => {
        const tA = safeTimeToNumber(a.lastTime);
        const tB = safeTimeToNumber(b.lastTime);
        
        // 1. Le Temps (Le plus petit gagne)
        if (tA !== tB) return tA - tB;
        
        // 2. Les Points (Le plus grand gagne)
        if (a.points !== b.points) return b.points - a.points;
        
        // 3. La Position Actuelle (Celui qui était déjà en haut reste en haut)
        return a.originalIndex - b.originalIndex;
    });

    return cars;
}

/* Met à jour une ligne quand on modifie des temps/wins */
function updateRowTimeAndMaybeBest(row, manualTimeStr) {
    if (!row) return;
    const name = row.children[2]?.textContent.trim();

    // Déterminer série
    const seriesKey = serieB.contains(row) ? 'B' : 'A';
    const state = raceStates[seriesKey];

    const lastEl = row.querySelector(".last-time");
    const bestEl = row.querySelector(".best-time");
    const oldBest = bestEl ? bestEl.textContent.trim() : (row.children[COL_BEST_TIME]?.textContent?.trim() || "");

    if (lastEl) lastEl.textContent = manualTimeStr;
    else if (typeof COL_LAST_TIME !== "undefined" && row.children[COL_LAST_TIME]) {
        row.children[COL_LAST_TIME].textContent = manualTimeStr;
    }

    const oldBestNum = safeTimeToNumber(oldBest);
    const newNum = safeTimeToNumber(manualTimeStr);
    if (newNum < oldBestNum) {
        if (bestEl) bestEl.textContent = manualTimeStr;
        else if (typeof COL_BEST_TIME !== "undefined" && row.children[COL_BEST_TIME]) {
            row.children[COL_BEST_TIME].textContent = manualTimeStr;
        }

        // Sauvegarde dans le bon état
        state.bestTimes[name] = manualTimeStr;
        saveRaceState();
    }
}

/* ---------- WIN COLUMNS ---------- */
function incrementWinColumns(row, delta = 1) {
    if (!row) return;
    // Mettre à jour DOM si présent
    if (typeof COL_WIN !== 'undefined') {
        const el = row.children[COL_WIN];
        const cur = parseInt(el.textContent || '0', 10) || 0;
        el.textContent = cur + delta;
    } else {
        const winEl = row.querySelector('.win');
        if (winEl) {
            const cur = parseInt(winEl.textContent || '0', 10) || 0;
            winEl.textContent = cur + delta;
        }
    }

    // Mettre à jour l'état sauvegardé (source de vérité)
    const name = (row.children[2]?.textContent || '').trim();
    if (!name) return;
    const state = getCurrentState();
    if (!state.carStats) state.carStats = {};
    if (!state.carStats[name]) state.carStats[name] = { wins: 0, losses: 0 };

    state.carStats[name].wins = parseInt(state.carStats[name].wins || 0, 10) + delta;
    saveRaceState();
}

function updateWinPercentage(row, seriesState) {
    const name = (row.children[2]?.textContent || '').trim();
    if (!name || !seriesState.carStats || !seriesState.carStats[name]) return;

    const stats = seriesState.carStats[name];
    const total = stats.wins + stats.losses;
    
    // CORRECTION : Utilisation des bonnes constantes (COL_WIN et COL_WIN_PERCENT)
    const winCell = row.querySelector('.stat-wins') || (typeof COL_WIN !== 'undefined' ? row.children[COL_WIN] : null);
    const lossCell = row.querySelector('.loss'); // Pas de constante pour loss, c'est une div cachée
    const pctCell = row.querySelector('.win-pct') || (typeof COL_WIN_PERCENT !== 'undefined' ? row.children[COL_WIN_PERCENT] : null);

    if (winCell) winCell.textContent = stats.wins;
    if (lossCell) lossCell.textContent = stats.losses;
    
    if (pctCell) {
        if (total === 0) {
            pctCell.textContent = "0.0%";
        } else {
            pctCell.textContent = ((stats.wins / total) * 100).toFixed(1) + "%";
        }
    }
}

function refreshAllWinPercentagesFromState() {
    const rows = getAllSerieRows();
    rows.forEach(row => {
        const name = (row.children[2]?.textContent || '').trim();
        if (!name) return;

        const seriesKey = (serieB && serieB.contains(row)) ? 'B' : 'A';
        const state = raceStates[seriesKey] || (raceStates[seriesKey] = { carStats: {}, bestTimes: {} });
        if (!state.carStats) state.carStats = {};

        if (!state.carStats[name]) {
            const domWins = parseInt((row.children[COL_WIN]?.textContent || '0'), 10) || 0;
            state.carStats[name] = { wins: domWins, losses: 0 };
        }

        let lossCell = row.querySelector('.loss');
        if (!lossCell) {
            lossCell = document.createElement('div');
            lossCell.className = 'loss';
            lossCell.style.display = 'none';
            row.appendChild(lossCell);
        }
        lossCell.textContent = String(parseInt(state.carStats[name].losses || 0, 10) || 0);

        updateWinPercentage(row, state);
    });
}

function incrementChampWinColumn(row) {
    if (!row) return;

    const name = (row.children[2]?.textContent || '').trim();
    if (!name) return;

    // Déterminer la série (A ou B)
    const seriesKey = serieB.contains(row) ? 'B' : 'A';
    const state = raceStates[seriesKey];

    if (!state.carStats) state.carStats = {};
    if (!state.carStats[name]) state.carStats[name] = { wins: 0, losses: 0, champWins: 0 };

    // Incrémentation du compteur en mémoire
    state.carStats[name].champWins = (state.carStats[name].champWins || 0) + 1;

    // Mettre à jour le DOM
    if (typeof COL_CH_WIN !== 'undefined') {
        const el = row.children[COL_CH_WIN];
        el.textContent = state.carStats[name].champWins;
    } else {
        const chEl = row.querySelector('.ch-win');
        if (chEl) chEl.textContent = state.carStats[name].champWins;
    }

    // Sauvegarde dans le localStorage
    saveRaceState();
}

/* ---------- START / FLOW RACE (CORRIGÉ AVEC AUTO-RÉPARATION) ---------- */
const startRaceBtn = document.getElementById('startRaceBtn');
// On charge l'état au démarrage
loadRaceState();

startRaceBtn.addEventListener('click', () => {
    raceSerieVisible = !serieA.classList.contains('hidden') ? 'A' : 'B';
    const state = getCurrentState();

    // --- 1. AUTO-RÉPARATION (FIX DU BUG) ---
    // Si la Phase est "RACE" mais que le flag "finished" est faux (bug de synchro), on le force à TRUE.
    const phaseA = localStorage.getItem("fastway_phase_A");
    if (phaseA === "RACE" && localStorage.getItem("finishedA") !== "true") {
        console.log("Auto-repair: Phase A is RACE, forcing finishedA to true.");
        localStorage.setItem("finishedA", "true");
        finishedA = true; // Mise à jour variable locale
    }

    const phaseB = localStorage.getItem("fastway_phase_B");
    if (phaseB === "RACE" && localStorage.getItem("finishedB") !== "true") {
        console.log("Auto-repair: Phase B is RACE, forcing finishedB to true.");
        localStorage.setItem("finishedB", "true");
        finishedB = true; // Mise à jour variable locale
    }
    // ---------------------------------------

    // 2. Lecture de l'état qualif (Maintenant corrigé par l'étape 1)
    const isQualifADone = localStorage.getItem("finishedA") === "true";
    const isQualifBDone = localStorage.getItem("finishedB") === "true";

    // 3. Vérification stricte A et B
    if (!isQualifADone || !isQualifBDone) {
        let msg = "Impossible de lancer la course :<br><br>";
        if (!isQualifADone) msg += "<span style='color:#ff4444'>✖</span> La Qualification SÉRIE A n'est pas terminée.<br>";
        if (!isQualifBDone) msg += "<span style='color:#ff4444'>✖</span> La Qualification SÉRIE B n'est pas terminée.<br>";
        
        msg += "<br>Veuillez terminer toutes les qualifications.";
        // On utilise ta fonction showFastwayAlert si elle existe, sinon alert classique pour pas planter
        if (typeof showFastwayAlert === "function") {
            showFastwayAlert(msg, "QUALIFICATIONS REQUISES");
        } else {
            alert(msg.replace(/<br>/g, "\n").replace(/<[^>]*>/g, ""));
        }
        return;
    }

    // 4. Vérification Phase (Double sécurité)
    const currentPhase = localStorage.getItem("fastway_phase_" + raceSerieVisible);
    if (currentPhase && currentPhase !== "RACE") {
        const warningMsg = `La série ${raceSerieVisible} est encore en phase 'QUALIFICATION'.<br>Si vous venez de finir les qualifs, assurez-vous que la validation s'est bien faite.`;
        if (typeof showFastwayAlert === "function") showFastwayAlert(warningMsg, "MAUVAISE PHASE");
        else alert(warningMsg.replace(/<br>/g, "\n"));
        return;
    }

    // 5. Vérifications internes
    if (state.raceFinished) {
        const endMsg = 'La course est déjà terminée pour cette série.<br>Attendez la fin de l\'autre série pour relancer le cycle.';
        if (typeof showFastwayAlert === "function") showFastwayAlert(endMsg, "COURSE TERMINÉE");
        else alert(endMsg.replace(/<br>/g, "\n"));
        return;
    }

    // 6. Lancement
    if (state.racePaused && (state.currentDuels.length > 0 || state.raceQueue.length > 0 || state.raceWinners.length > 0)) {
        state.racePaused = false;
        saveRaceState();
        startRound();
        return;
    }

    if (state.raceQueue.length === 0 && state.currentDuels.length === 0 && state.raceWinners.length === 0) {
        const sortedCars = getLastTimesAndSort();
        state.raceQueue = sortedCars.map(c => c.name);
    }

    state.racePaused = false;
    saveRaceState();
    startRound();
});

/* ---------- REMPLACEMENT 1 : startRound ---------- */
function startRound() {
    const state = getCurrentState();

    // --- CAS 1 : PLAYOFFS ---
    if (playoffState && playoffState.active) {
        const currentStructure = PLAYOFF_STRUCTURE[playoffState.currentRoundIndex];
        const roundName = currentStructure.name;

        const serieAElement = document.getElementById("serie-a");
        const serieBElement = document.getElementById("serie-b");

        // Assigner les points et générer les files d'attente
        assignQualifPointsForSeries(serieAElement);
        assignQualifPointsForSeries(serieBElement);

        // Récupérer l'ordre depuis l'état (correction du bug d'undefined)
        const orderA = raceStates.A.raceQueue || [];
        const orderB = raceStates.B.raceQueue || [];

        const activeA = orderA.filter(name => playoffData.A.qualified.includes(name));
        const activeB = orderB.filter(name => playoffData.B.qualified.includes(name));

        playoffState.currentMatches = [];

        if (roundName.includes("ROUND 2")) {
            const matchesA = generateRoundRobinMatches(activeA).map(m => ({ ...m, serie: 'A', done: false, winner: null }));
            const matchesB = generateRoundRobinMatches(activeB).map(m => ({ ...m, serie: 'B', done: false, winner: null }));
            playoffState.currentMatches = [...matchesA, ...matchesB];
            showFastwayAlert(`Qualifications enregistrées !<br>Début du <b>${roundName}</b> en mode Round Robin.`, "WEEK-END CHAMPIONNAT");
        } else if (roundName === "DIVISION FINAL") {
            if (activeA.length >= 2) playoffState.currentMatches.push({ car1: activeA[0], car2: activeA[1], serie: 'A', done: false, winner: null });
            if (activeB.length >= 2) playoffState.currentMatches.push({ car1: activeB[0], car2: activeB[1], serie: 'B', done: false, winner: null });
            showFastwayAlert(`Qualifications enregistrées !<br>Début des <b>FINALES DE DIVISION (BO5)</b>.`, "🏆 FINALES 🏆");
        } else {
            const generateStandardPairs = (list, serieKey) => {
                let pairs = [];
                let left = 0, right = list.length - 1;
                while (left < right) {
                    pairs.push({ car1: list[left], car2: list[right], serie: serieKey, done: false, winner: null });
                    left++; right--;
                }
                return pairs;
            };
            playoffState.currentMatches = [
                ...generateStandardPairs(activeA, 'A'),
                ...generateStandardPairs(activeB, 'B')
            ];
            showFastwayAlert(`Qualifications enregistrées !<br>Matchs générés selon le Seeding du ${roundName}.`, "DUELS PRÊTS");
        }

        playoffState.matchIndex = 0;
        saveRaceState();
        startNextDuel();
        return;
    }

    // --- CAS 2 : SAISON RÉGULIÈRE ---
    if (state.raceQueue.length > 0 && state.currentDuels.length === 0) {
        // Seeding : Le plus rapide (1er) affronte le plus lent (Dernier)
        while (state.raceQueue.length >= 2) {
            const car1 = state.raceQueue.shift(); 
            const car2 = state.raceQueue.pop();   
            state.currentDuels.push([car1, car2]);
        }
        
        // S'il reste une voiture seule (nombre de participants impair)
        if (state.raceQueue.length === 1) {
            const autoWin = state.raceQueue.shift();
            state.raceWinners.push(autoWin);
        }
        saveRaceState();
    }

    startNextDuel();
}


function getRoundLabelFromEntrants(entrantsCount, roundNumber) {
    if (entrantsCount <= 2) return "FINAL";
    if (entrantsCount <= 4) return "SEMI FINAL";
    if (entrantsCount <= 8) return "QUARTER FINAL";
    return `ROUND ${roundNumber}`;
}

function getRoundDisplayNames(state) {
    if (playoffState.active) {
        const currentStructure = PLAYOFF_STRUCTURE[playoffState.currentRoundIndex];
        const currentRoundName = currentStructure ? currentStructure.name : `ROUND ${state.raceRound || 1}`;
        const nextRoundName = (playoffState.currentRoundIndex + 1 < PLAYOFF_STRUCTURE.length)
            ? PLAYOFF_STRUCTURE[playoffState.currentRoundIndex + 1].name
            : "FASTWAY FINAL";
        return { currentRoundName, nextRoundName };
    }

    let entrantsCount = parseInt(state.roundStartCount || 0, 10) || 0;
    if (!entrantsCount) {
        if (state.raceQueue.length > 0) entrantsCount = state.raceQueue.length;
        else if (state.currentDuels.length > 0) entrantsCount = state.currentDuels.length * 2;
    }
    if (!entrantsCount) entrantsCount = 2;

    const roundNumber = parseInt(state.raceRound || 1, 10) || 1;
    const currentRoundName = getRoundLabelFromEntrants(entrantsCount, roundNumber);
    const nextEntrants = Math.max(1, Math.ceil(entrantsCount / 2));
    const nextRoundName = getRoundLabelFromEntrants(nextEntrants, roundNumber + 1);
    return { currentRoundName, nextRoundName };
}


function startNextDuel() {
    if (!playoffState.active || !playoffState.currentMatches || playoffState.currentMatches.length === 0) return;

    // Si tous les matchs prévus sont faits
    if (playoffState.matchIndex >= playoffState.currentMatches.length) {
        // Sécurité pour la Finale de Division BO5 : Vérifier si quelqu'un a gagné 3 fois
        const currentStructure = PLAYOFF_STRUCTURE[playoffState.currentRoundIndex];
        if (currentStructure && currentStructure.name === "DIVISION FINAL") {
            
            let serieAWinner = Object.keys(finalSeriesScores.A.wins).find(k => finalSeriesScores.A.wins[k] >= 3);
            let serieBWinner = Object.keys(finalSeriesScores.B.wins).find(k => finalSeriesScores.B.wins[k] >= 3);
            
            // Si les deux séries n'ont pas encore de vainqueur absolu à 3 victoires, on recrée un match
            if (!serieAWinner || !serieBWinner) {
                // On réinitialise l'index pour rejouer le match final
                playoffState.matchIndex = 0;
                showFastwayAlert("La bataille continue ! Prochaine course de la Finale de Division (BO5)...", "BO5 MATCH");
                startNextDuel();
                return;
            }
        }
        
        // Si tout est vraiment terminé pour ce round, on progresse
        handlePlayoffProgression();
        return;
    }

    const match = playoffState.currentMatches[playoffState.matchIndex];
    
    // Déterminer le titre du modal et inclure le score actuel pour le BO5 / BO7
    const currentStructure = PLAYOFF_STRUCTURE[playoffState.currentRoundIndex];
    let modalTitle = `DUEL PLAYOFF - SÉRIE ${match.serie}`;
    
    if (currentStructure && currentStructure.name === "DIVISION FINAL") {
        const score1 = finalSeriesScores[match.serie].wins[match.car1] || 0;
        const score2 = finalSeriesScores[match.serie].wins[match.car2] || 0;
        modalTitle = `FINALE DE DIVISION (BO5) - SCORE : [ ${score1} - ${score2} ]`;
    } else if (playoffState.isFinal) {
        const score1 = finalSeriesScores.FASTWAY_FINAL.wins[match.car1] || 0;
        const score2 = finalSeriesScores.FASTWAY_FINAL.wins[match.car2] || 0;
        modalTitle = `FASTWAY FINAL (BO7) - SCORE : [ ${score1} - ${score2} ]`;
    }

    // Ouvrir le modal de duel avec les deux voitures
    showDuelModal(match.car1, match.car2, modalTitle, (winner) => {
        match.done = true;
        match.winner = winner;

        // 1. Accorder les récompenses au tableau des scores
        const winnerRow = findRowByName(winner);
        if (winnerRow) {
            // +10 points pour une victoire en duel
            const ptsCell = winnerRow.children[COL_POINT_CALIF];
            if (ptsCell) ptsCell.textContent = (parseInt(ptsCell.textContent, 10) || 0) + 10;
            
            // +1 au compteur de Wins de la voiture
            const winCell = winnerRow.children[4]; // index de la colonne wins
            if (winCell) winCell.textContent = (parseInt(winCell.textContent, 10) || 0) + 1;
        }

        // 2. Enregistrer le score spécifique de la série Best Of
        if (currentStructure && currentStructure.name === "DIVISION FINAL") {
            if (!finalSeriesScores[match.serie].wins[winner]) finalSeriesScores[match.serie].wins[winner] = 0;
            finalSeriesScores[match.serie].wins[winner]++;
            
            const currentWins = finalSeriesScores[match.serie].wins[winner];
            if (currentWins >= 3) {
                showFastwayAlert(`🏆 EXTRAORDINAIRE ! ${winner} remporte la Finale de la Série ${match.serie} ! 🏆`, "CHAMPION DE SÉRIE");
            }
        } else if (playoffState.isFinal) {
            if (!finalSeriesScores.FASTWAY_FINAL.wins[winner]) finalSeriesScores.FASTWAY_FINAL.wins[winner] = 0;
            finalSeriesScores.FASTWAY_FINAL.wins[winner]++;
            
            const currentWins = finalSeriesScores.FASTWAY_FINAL.wins[winner];
            if (currentWins >= 4) {
                showFastwayAlert(`🏎️👑 HISTORIQUE ! ${winner} remporte la finale ultime et devient le grand champion de la FASTWAY CUP !!! 👑🏎️`, "🏆 COUPE STANLEY DE LA COURSE 🏆");
                // Fin absolue de la saison !
                return;
            }
        }

        // Mettre à jour l'affichage général
        saveRaceState();
        if (typeof updateMainTable === 'function') updateMainTable();

        // Passer au match suivant du calendrier
        playoffState.matchIndex++;
        startNextDuel();
    });
}


/* ---------- SYSTÈME UNIVERSEL DE COUPURE SÉCURISÉE (ANTI-BUG) ---------- */
function getQualifiedCarsWithTiebreaker(carsListData, slotsNeeded) {
    // 1. Tri de base par les points du round actuel (descendant)
    let sorted = [...carsListData].sort((a, b) => b.points - a.points);
    
    // Si on a moins ou autant de voitures que de places, tout le monde passe!
    if (sorted.length <= slotsNeeded) {
        return { status: "READY", qualified: sorted.map(c => c.name) };
    }

    // 2. Vérification de la ligne de coupure (le dernier qualifié vs le premier éliminé)
    const lastQualIndex = slotsNeeded - 1;
    const firstElimIndex = slotsNeeded;
    
    const cutoffPoints = sorted[lastQualIndex].points;
    const firstElimPoints = sorted[firstElimIndex].points;

    // S'il n'y a pas d'égalité stricte sur la ligne de coupure, c'est parfait, on passe !
    if (cutoffPoints !== firstElimPoints) {
        return { 
            status: "READY", 
            qualified: sorted.slice(0, slotsNeeded).map(c => c.name) 
        };
    }

    // 3. S'il y a égalité, on isole TOUTES les voitures qui ont ce nombre exact de points
    const allTiedCars = sorted.filter(c => c.points === cutoffPoints);
    
    // On trouve combien de voitures sont déjà safe (qui ont strictement plus de points)
    const safeCars = sorted.filter(c => c.points > cutoffPoints).map(c => c.name);
    const remainingSlots = slotsNeeded - safeCars.length;

    // Détermination de la règle automatique selon ce que tu m'as dit :
    if (allTiedCars.length === 2) {
        // Ex: 2 voitures pour 1 place -> Duel direct
        return {
            status: "REQUIRE_TIEBREAKER_DUEL",
            cars: allTiedCars.map(c => c.name),
            slots: remainingSlots,
            safeCars: safeCars
        };
    } else {
        // Ex: 3 voitures ou plus -> Round Robin (Chacun s'affronte 1 fois)
        // Si le but est d'éliminer le pire (ex: 3 voitures pour 2 places restantes)
        const mode = (remainingSlots === allTiedCars.length - 1) ? "ELIMINATE_WORST" : "FIND_BEST";
        return {
            status: "REQUIRE_TIEBREAKER_ROUND_ROBIN",
            cars: allTiedCars.map(c => c.name),
            slots: remainingSlots,
            safeCars: safeCars,
            mode: mode
        };
    }
}


/* ---------- MODAL DE FIN DE ROUND (RÉPARÉ) ---------- */
function showRoundModal(title, subtitle, onComplete) {
    document.querySelectorAll(".fastway-modal-overlay").forEach(m => m.remove());
    const modal = document.createElement("div");
    modal.className = "fastway-modal-overlay"; 
    modal.innerHTML = `
        <div class="fastway-modal-wrapper">
            <div class="fastway-modal-content">
                <h2 class="fastway-modal-title" style="color:#00e7ff;">${title}</h2>
                <div class="fastway-modal-text" style="font-size:18px; margin-top:10px; font-weight:bold;">${subtitle}</div>
                <div style="margin-top: 20px;">
                    <button id="roundNextBtn" class="fastway-btn-primary">CONTINUER</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    const btn = modal.querySelector("#roundNextBtn");
    btn.focus();
    requestAnimationFrame(() => modal.classList.add('active'));

    btn.onclick = () => {
        modal.classList.remove('active');
        setTimeout(() => { modal.remove(); if(onComplete) onComplete(); }, 200);
    };
}

/* ---------- CHAMPION Modal FASTWAY (CLEAN) ---------- */
function handleChampion(name) {
    const state = getCurrentState();
    state.raceFinished = true;
    saveRaceState();

    const row = findRowByName(name);
    if (row) incrementChampWinColumn(row);

    document.querySelectorAll('.fastway-modal-overlay').forEach(m => m.remove());
    const modal = document.createElement('div');
    modal.className = "fastway-modal-overlay";
    
    modal.innerHTML = `
        <div class="champion-wrapper">
            <div class="champion-content">
                <span class="flag-icon">🏁</span>
                <h2 class="race-win-title">VICTOIRE DE LA COURSE ${raceSerieVisible}</h2>
                <p class="champ-name">${name}</p>
                <p style="margin-bottom: 30px; font-size: 16px; color: #ccc;">Le vainqueur du week-end !</p>
                <button id="champClose" class="champ-close-btn">FERMER</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('active'));

    const handleClose = () => {
        modal.classList.remove('active');
        setTimeout(() => {
            modal.remove();
            saveRaceState();
            if (typeof updateMainTable === 'function') updateMainTable();
            endRace(raceSerieVisible); 
        }, 400); 
    };

    modal.querySelector('#champClose').onclick = handleClose;
}

/* ---------- normalizeTime (strict) ---------- */
function normalizeTime(rawTime) {
    if (!rawTime) return "";
    let t = String(rawTime).trim().replace(",", ".");

    // Si format 2 chiffres + . + 3 chiffres et commence par 0, enlever le 0 de tête
    if (/^\d{2}\.\d{3}$/.test(t) && t.startsWith("0")) {
        t = t.substring(1);
    }

    // N'accepte que 1 ou 2 chiffres avant la virgule + 3 chiffres après la virgule
    if (!/^\d{1,2}\.\d{3}$/.test(t)) return "";
    return t;
}

/* ---------- MODAL DE DUEL (SANS BOUTON ANNULER) ---------- */
function showDuelModal(car1, car2, fixedRoundName, onWinnerSelected) {
    document.querySelectorAll(".fastway-modal-overlay").forEach(m => m.remove());

    const modal = document.createElement("div");
    modal.className = "fastway-modal-overlay"; 
    modal.innerHTML = `
        <div class="duel-wrapper">
            <div class="duel-content">
                <h2 class="fastway-modal-title">DUEL</h2>
                <p id="roundNameDisplay" style="margin:0 0 20px; font-weight:700; font-size:18px; text-transform:uppercase;">${fixedRoundName}</p>

                <div class="car-btn-container">
                    <div style="flex:1; position:relative;">
                        <button id="btn1" class="car-btn red">${car1}</button>
                        <button id="light1" class="lightning-btn">⚡</button>
                        <div id="man1" class="manual-input-zone">
                           <input id="t1" class="fastway-time-input" style="border-color:#ff003c">
                        </div>
                    </div>
                    <div style="font-weight:900; font-size:22px; color:#ddd; padding-top: 15px;">VS</div>
                    <div style="flex:1; position:relative;">
                        <button id="btn2" class="car-btn blue">${car2}</button>
                        <button id="light2" class="lightning-btn">⚡</button>
                        <div id="man2" class="manual-input-zone">
                           <input id="t2" class="fastway-time-input" style="border-color:#0077ff">
                        </div>
                    </div>
                </div>
                <div id="duelMsgZone" style="color:#ff4444; font-size:14px; min-height:20px; margin-top:10px;"></div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const roundEl = modal.querySelector('#roundNameDisplay');
    const input1 = modal.querySelector('#t1'), input2 = modal.querySelector('#t2');
    const msgZone = modal.querySelector('#duelMsgZone');

    setupMagicInput(input1);
    setupMagicInput(input2);

    const rt = fixedRoundName.toLowerCase();
    if (rt.includes('demi') || rt.includes('quart') || rt.includes('semi')) {
        roundEl.style.color = '#00E5FF';
    } else if (rt.includes('final')) {
        roundEl.style.color = '#FF003C';
        roundEl.style.textShadow = '0 0 15px rgba(255,0,60,0.5)';
    } else {
        roundEl.style.color = '#FFD700';
    }

    requestAnimationFrame(() => modal.classList.add('active'));

    [1, 2].forEach(id => {
        modal.querySelector(`#light${id}`).onclick = () => {
            const zone = modal.querySelector(`#man${id}`);
            zone.classList.toggle('open');
            if(zone.classList.contains('open')) setTimeout(() => zone.querySelector('input').focus(), 100);
        };
    });

    const closeDuel = () => {
        modal.classList.remove('active'); setTimeout(() => modal.remove(), 200);
    };

    const pickWinner = (name) => {
        const val1 = input1.value.trim() === "00.000" ? "" : input1.value.trim();
        const val2 = input2.value.trim() === "00.000" ? "" : input2.value.trim();
        const norm1 = val1 ? normalizeTime(val1) : "", norm2 = val2 ? normalizeTime(val2) : "";

        if ((val1 && !norm1) || (val2 && !norm2)) {
            msgZone.textContent = "Erreur : Format de temps invalide (ex: 12.345)";
            return; 
        }

        const loser = (name === car1) ? car2 : car1;
        const state = getCurrentState();
        lastDuelAction = { 
            winner: name, loser: loser, serie: raceSerieVisible,
            prevBestWinner: state.bestTimes[name] || null,
            prevBestLoser: state.bestTimes[loser] || null 
        };

        if (norm1) { const r = findRowByName(car1); if(r) updateRowTimeAndMaybeBest(r, norm1); }
        if (norm2) { const r = findRowByName(car2); if(r) updateRowTimeAndMaybeBest(r, norm2); }
        incrementLossColumn(loser);
        if(typeof updateMainTable === 'function') updateMainTable();
        saveRaceState();

        closeDuel();
        setTimeout(() => onWinnerSelected(name, {[car1]: norm1||null, [car2]: norm2||null}), 200);
    };

    modal.querySelector('#btn1').onclick = () => pickWinner(car1);
    modal.querySelector('#btn2').onclick = () => pickWinner(car2);
    
    // Fermeture en cliquant à côté
    modal.addEventListener("click", e => { 
        if (e.target === modal) { 
            getCurrentState().racePaused = true; 
            saveRaceState(); 
            closeDuel(); 
        } 
    });
}


/* ---------- Nettoyage / nouvelle série ---------- */
function resetRaceState() {
    const state = getCurrentState();
    state.racePaused = false;
    state.raceRound = 1;
    state.raceQueue = [];
    state.raceWinners = [];
    state.currentDuels = [];
    state.raceFinished = false;
    saveRaceState();
    if (typeof updateMainTable === 'function') updateMainTable();
}

window.addEventListener("load", () => {
    loadRaceState();

    function syncStateFromDom() {
        const allRows = getAllSerieRows();

        allRows.forEach(row => {
            const name = (row.children[2]?.textContent || '').trim();
            if (!name) return;

            // Determine de quelle serie provient la row (A ou B)
            let seriesKey = 'A';
            if (serieB && serieB.contains(row)) seriesKey = 'B';
            else if (serieA && serieA.contains(row)) seriesKey = 'A';

            const seriesState = raceStates[seriesKey] || (raceStates[seriesKey] = { carStats: {}, bestTimes: {} });
            if (!seriesState.carStats) seriesState.carStats = {};

            // DOM = fallback uniquement si l'etat n'a pas encore de valeur.
            let winFromDom = 0;
            if (typeof COL_WIN !== 'undefined' && row.children[COL_WIN]) {
                winFromDom = parseInt(row.children[COL_WIN].textContent || '0', 10) || 0;
            } else {
                const winEl = row.querySelector('.win');
                if (winEl) winFromDom = parseInt(winEl.textContent || '0', 10) || 0;
            }

            const existingStats = seriesState.carStats[name];
            const winFromState = existingStats ? parseInt(existingStats.wins || 0, 10) : NaN;
            const lossFromState = existingStats ? parseInt(existingStats.losses || 0, 10) : NaN;

            const resolvedWins = Number.isFinite(winFromState) ? winFromState : winFromDom;
            const resolvedLosses = Number.isFinite(lossFromState) ? lossFromState : 0;

            seriesState.carStats[name] = { wins: resolvedWins, losses: resolvedLosses };

            // Reappliquer visuellement les stats sauvegardees.
            if (typeof COL_WIN !== 'undefined' && row.children[COL_WIN]) {
                row.children[COL_WIN].textContent = resolvedWins;
            } else {
                const winEl = row.querySelector('.win');
                if (winEl) winEl.textContent = resolvedWins;
            }

            let lossCell = row.querySelector('.loss');
            if (!lossCell) {
                lossCell = document.createElement('div');
                lossCell.className = 'loss';
                lossCell.style.display = 'none';
                row.appendChild(lossCell);
            }
            lossCell.textContent = resolvedLosses;

            updateWinPercentage(row, seriesState);
        });

        saveRaceState();
    }

    // Appelle la sync après le chargement de la page
    syncStateFromDom();


    setTimeout(() => {
        Object.entries(getCurrentState().bestTimes).forEach(([name, time]) => {
            // Debug only
        });
    }, 500);

    // Vérifie quelle série est visible (A ou B)
    raceSerieVisible = !serieA.classList.contains('hidden') ? 'A' : 'B';

    // Applique les meilleurs temps sauvegardés après un léger délai
    setTimeout(() => {
        applySavedBestTimes();
    }, 100);

    setTimeout(() => {
        const allRows = getAllSerieRows(); // toutes les lignes A + B
        allRows.forEach(row => {
            const name = (row.children[2]?.textContent || '').trim();
            if (!name) return;

            // déterminer série
            let seriesKey = 'A';
            if (serieB && serieB.contains(row)) seriesKey = 'B';
            else if (serieA && serieA.contains(row)) seriesKey = 'A';

            if (!raceStates[seriesKey].carStats) raceStates[seriesKey].carStats = {};
            if (!raceStates[seriesKey].carStats[name]) raceStates[seriesKey].carStats[name] = { wins: 0, losses: 0 };

            updateWinPercentage(row, raceStates[seriesKey]);
        });
    }, 300);

});


/* Exports pour debug */
window.fastwayRace = {
    startRound,
    startNextDuel,
    resetRaceState,
    saveRaceState,
    loadRaceState
};

/* ---------- SIMULATEUR DE TEMPS DE QUALIF POUR TESTS ---------- */
window.addEventListener("keydown", (e) => {
    // On vérifie si la touche pressée est 's' ou 'S'
    if (e.key.toLowerCase() === 's') {
        // On cherche si l'input de la modale de temps est présent à l'écran
        const timeInput = document.getElementById("timeInput");
        
        if (timeInput) {
            // Empêche d'écrire la lettre 's' dans le champ de texte
            e.preventDefault(); 
            
            // Génère un nombre aléatoire entre 9.500 et 15.000
            const randomTime = (Math.random() * (15.000 - 9.500) + 9.500).toFixed(3);
            
            // Injecte le temps généré dans l'input
            timeInput.value = randomTime;
            
            // Simule l'appui sur "Entrée" pour déclencher la fonction handleSubmit() de ton code
            const enterEvent = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
            timeInput.dispatchEvent(enterEvent);
        }
    }
});

/* ---------- UTILITAIRES UNIVERSELS FASTWAY (ANTI-BUG) ---------- */

// Générateur automatique de calendrier Round Robin (Chacun son tour)
function generateRoundRobinMatches(carsList) {
    let list = [...carsList];
    if (list.length % 2 !== 0) list.push(null); // Sécurité si impair
    
    let roundsCount = list.length - 1;
    let half = list.length / 2;
    let pairs = [];

    for (let r = 0; r < roundsCount; r++) {
        for (let i = 0; i < half; i++) {
            const car1 = list[i];
            const car2 = list[list.length - 1 - i];
            if (car1 && car2) {
                pairs.push({ car1, car2 });
            }
        }
        // Rotation de la liste (le premier reste fixe)
        list.splice(1, 0, list.pop());
    }
    return pairs;
}

// Détecteur universel de bris d'égalité (Tiebreaker)
function getQualifiedCarsWithTiebreaker(contenders, slotsNeeded) {
    // Tri par points (descendant)
    let sorted = [...contenders].sort((a, b) => b.points - a.points);
    
    if (sorted.length <= slotsNeeded) {
        return { status: "READY", qualified: sorted.map(c => c.name) };
    }

    const lastQualIndex = slotsNeeded - 1;
    const firstElimIndex = slotsNeeded;
    
    const cutoffPoints = sorted[lastQualIndex].points;
    const firstElimPoints = sorted[firstElimIndex].points;

    // S'il n'y a pas d'égalité sur la ligne de coupure
    if (cutoffPoints !== firstElimPoints) {
        return { status: "READY", qualified: sorted.slice(0, slotsNeeded).map(c => c.name) };
    }

    // Si égalité détectée, on isole le groupe concerné
    const allTiedCars = sorted.filter(c => c.points === cutoffPoints);
    const safeCars = sorted.filter(c => c.points > cutoffPoints).map(c => c.name);
    const remainingSlots = slotsNeeded - safeCars.length;

    if (allTiedCars.length === 2) {
        return {
            status: "REQUIRE_TIEBREAKER_DUEL",
            cars: allTiedCars.map(c => c.name),
            slots: remainingSlots,
            safeCars: safeCars
        };
    } else {
        const mode = (remainingSlots === allTiedCars.length - 1) ? "ELIMINATE_WORST" : "FIND_BEST";
        return {
            status: "REQUIRE_TIEBREAKER_ROUND_ROBIN",
            cars: allTiedCars.map(c => c.name),
            slots: remainingSlots,
            safeCars: safeCars,
            mode: mode
        };
    }
}
// Ajout des classes sur les cellules principales pour fiabiliser les sélecteurs (.win, .best-time, etc.)
document.querySelectorAll(".column-row").forEach(row => {
  if (row.children[COL_POINT_CALIF]) row.children[COL_POINT_CALIF].classList.add("points");
  if (row.children[COL_WIN]) row.children[COL_WIN].classList.add("win");
  if (row.children[COL_CH_WIN]) row.children[COL_CH_WIN].classList.add("ch-win");
  if (row.children[COL_BEST_TIME]) row.children[COL_BEST_TIME].classList.add("best-time");
  if (row.children[COL_WIN_PERCENT]) row.children[COL_WIN_PERCENT].classList.add("win-percent");
  if (row.children[COL_TOTAL]) row.children[COL_TOTAL].classList.add("total");
});