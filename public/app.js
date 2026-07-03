const joinPanel = document.querySelector("#joinPanel");
const tableScreen = document.querySelector("#tableScreen");
const nameInput = document.querySelector("#nameInput");
const roomInput = document.querySelector("#roomInput");
const createBtn = document.querySelector("#createBtn");
const joinBtn = document.querySelector("#joinBtn");
const buyInInput = document.querySelector("#buyInInput");
const seatInput = document.querySelector("#seatInput");
const notice = document.querySelector("#notice");
const copyCodeBtn = document.querySelector("#copyCodeBtn");
const phaseLabel = document.querySelector("#phaseLabel");
const voiceBtn = document.querySelector("#voiceBtn");
const muteBtn = document.querySelector("#muteBtn");
const soundBtn = document.querySelector("#soundBtn");
const awayBtn = document.querySelector("#awayBtn");
const pauseBtn = document.querySelector("#pauseBtn");
const showCardsBtn = document.querySelector("#showCardsBtn");
const muckCardsBtn = document.querySelector("#muckCardsBtn");
const winnerBanner = document.querySelector("#winnerBanner");
const handHintBanner = document.querySelector("#handHintBanner");
const startHandBtn = document.querySelector("#startHandBtn");
const menuBtn = document.querySelector("#menuBtn");
const optionsMenu = document.querySelector("#optionsMenu");
const potLabel = document.querySelector("#potLabel");
const roundPotLabel = document.querySelector("#roundPotLabel");
const boardCards = document.querySelector("#boardCards");
const seats = document.querySelector("#seats");
const turnLabel = document.querySelector("#turnLabel");
const timerLabel = document.querySelector("#timerLabel");
const raiseInput = document.querySelector("#raiseInput");
const messages = document.querySelector("#messages");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const handLog = document.querySelector("#handLog");
const voicePeers = document.querySelector("#voicePeers");
const audioMount = document.querySelector("#audioMount");
const chipsForm = document.querySelector("#chipsForm");
const chipsInput = document.querySelector("#chipsInput");
const chipRequests = document.querySelector("#chipRequests");
const statsPanel = document.querySelector("#statsPanel");
const ledgerPanel = document.querySelector("#ledgerPanel");
const leaveSeatBtn = document.querySelector("#leaveSeatBtn");
const rejoinBar = document.querySelector("#rejoinBar");
const rejoinSeatInput = document.querySelector("#rejoinSeatInput");
const rejoinSeatBtn = document.querySelector("#rejoinSeatBtn");

let socket;
let state;
let playerId;
let roomCode;
let timerInterval;
let localStream;
let reconnectAttempted = false;
let muted = false;
let away = false;
let soundEnabled = localStorage.getItem("pokerSound") !== "off";
let audioContext;
const peers = new Map();

const seatPositions = [
  ["50%", "97%"],
  ["21%", "89%"],
  ["4%", "67%"],
  ["4%", "35%"],
  ["21%", "10%"],
  ["50%", "3%"],
  ["79%", "10%"],
  ["96%", "35%"],
  ["96%", "67%"],
  ["79%", "89%"]
];

nameInput.value = localStorage.getItem("pokerName") || "";

createBtn.addEventListener("click", () => connect("createRoom"));
joinBtn.addEventListener("click", () => connect("joinRoom"));
copyCodeBtn.addEventListener("click", copyRoomCode);
startHandBtn.addEventListener("click", () => send("startHand"));
voiceBtn.addEventListener("click", startVoice);
muteBtn.addEventListener("click", toggleMute);
soundBtn.addEventListener("click", toggleSound);
awayBtn.addEventListener("click", toggleAway);
pauseBtn.addEventListener("click", togglePause);
showCardsBtn.addEventListener("click", () => send("showCards"));
muckCardsBtn.addEventListener("click", () => send("muckCards"));
leaveSeatBtn.addEventListener("click", () => {
  send("leaveSeat");
  optionsMenu.classList.add("hidden");
});
rejoinSeatBtn.addEventListener("click", () => {
  send("rejoinSeat", { seatNumber: Number(rejoinSeatInput.value) || undefined });
});

menuBtn.addEventListener("click", () => optionsMenu.classList.toggle("hidden"));
document.addEventListener("click", (event) => {
  if (optionsMenu.classList.contains("hidden")) return;
  if (optionsMenu.contains(event.target) || menuBtn.contains(event.target)) return;
  optionsMenu.classList.add("hidden");
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => {
    send("action", {
      action: button.dataset.action,
      amount: Number(raiseInput.value)
    });
  });
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  send("chat", { text: chatInput.value });
  chatInput.value = "";
});

chipsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  send("requestChips", { amount: Number(chipsInput.value) });
  playSound("chips");
});

chipRequests.addEventListener("click", (event) => {
  const button = event.target.closest("[data-request-id]");
  if (!button) return;
  send("approveChips", {
    requestId: button.dataset.requestId,
    amount: Number(button.dataset.amount)
  });
  playSound("chips");
});

function connect(type) {
  const name = nameInput.value.trim() || "Player";
  localStorage.setItem("pokerName", name);
  notice.textContent = "Connecting...";
  createBtn.disabled = true;
  joinBtn.disabled = true;
  socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`);

  socket.addEventListener("open", () => {
    const code = type === "createRoom" ? "" : roomInput.value.trim().toUpperCase();
    const savedSeat = code ? readSavedSeat(code) : null;
    const token = type === "joinRoom" && savedSeat?.name === name ? savedSeat.token : "";
    send(type, { name, code, token, buyIn: Number(buyInInput.value), seatNumber: Number(seatInput.value) });
  });

  socket.addEventListener("message", async (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "joined") {
      playerId = message.payload.playerId;
      roomCode = message.payload.roomCode;
      saveSeat(roomCode, nameInput.value.trim() || "Player", message.payload.token);
      setLastRoom(roomCode);
      sessionStorage.setItem("pokerAutoRejoin", "1");
      reconnectAttempted = false;
      joinPanel.classList.add("hidden");
      tableScreen.classList.remove("hidden");
      copyCodeBtn.textContent = roomCode;
      notice.textContent = "";
    }
    if (message.type === "state") render(message.payload);
    if (message.type === "chat") addMessage(message.payload.name, message.payload.text);
    if (message.type === "system") addMessage("Table", message.payload.message);
    if (message.type === "error") {
      notice.textContent = message.payload.message;
      if (reconnectAttempted) {
        reconnectAttempted = false;
        sessionStorage.removeItem("pokerAutoRejoin");
        if (message.payload.message === "Room not found.") {
          clearLastRoom();
          roomInput.value = "";
        }
      }
    }
    if (message.type === "voiceSignal") handleVoiceSignal(message.payload);
  });

  socket.addEventListener("close", () => {
    createBtn.disabled = false;
    joinBtn.disabled = false;
    addMessage("Table", "Connection closed.");
  });

  socket.addEventListener("error", () => {
    notice.textContent = "Could not connect to the table server.";
    createBtn.disabled = false;
    joinBtn.disabled = false;
  });
}

function send(type, payload = {}) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, payload }));
  }
}

function render(nextState) {
  const previous = state;
  state = nextState;
  phaseLabel.textContent = titleCase(state.phase);
  potLabel.textContent = `Total Pot ${state.pot}`;
  // Show individual side pot breakdown when more than one pot exists (i.e. someone is all-in).
  const sidePots = state.sidePots || [];
  if (sidePots.length > 1) {
    roundPotLabel.textContent = sidePots.map((p) => `${p.label}: ${p.amount}`).join(" · ");
  } else {
    roundPotLabel.textContent = `Current Round ${state.roundPot || 0}`;
  }
  renderBoard();
  renderSeats();
  renderControls();
  renderLog();
  renderVoicePeers();
  renderChipRequests();
  renderStats();
  renderLedger();
  renderRejoinBar();
  renderWinnerBanner(previous);
  renderHandHint();
  reactToStateChange(previous, state);
}

let winnerBannerTimeout = null;

function renderWinnerBanner(previous) {
  if (!winnerBanner) return;
  const isNewWin = state.lastWin && (!previous?.lastWin || previous.lastWin.at !== state.lastWin.at);
  if (isNewWin) {
    const win = state.lastWin;
    const names = win.winners.map((entry) => entry.name).join(", ");
    const handText = win.handName ? ` with ${titleCase(win.handName)}` : "";
    winnerBanner.textContent = win.winners.length > 1
      ? `${names} split the pot (${win.amount} each)${handText}`
      : `${names} wins ${win.amount}${handText}`;
    winnerBanner.classList.remove("hidden");
    clearTimeout(winnerBannerTimeout);
    winnerBannerTimeout = setTimeout(() => winnerBanner.classList.add("hidden"), 5000);
  }
  if (state.phase !== "showdown" && !state.lastWin) winnerBanner.classList.add("hidden");
}

function renderHandHint() {
  if (!handHintBanner) return;
  const me = state.players.find((player) => player.id === playerId);
  if (me && me.handHint) {
    handHintBanner.textContent = me.handHint;
    handHintBanner.classList.remove("hidden");
  } else {
    handHintBanner.classList.add("hidden");
  }
}

function renderSeats() {
  seats.innerHTML = "";

  // Find local player's seat number so we can rotate positions
  const me = state.players.find((p) => p.id === playerId);
  const mySeatNumber = me?.seatNumber || 1;
  // Offset so my seat maps to position index 0 (bottom-center)
  const offset = mySeatNumber - 1;

  for (let seatNumber = 1; seatNumber <= state.maxPlayers; seatNumber += 1) {
    const player = state.players.find((item) => item.seatNumber === seatNumber);
    const seat = document.createElement("article");
    seat.className = player
      ? `seat ${player.isTurn ? "turn" : ""} ${player.id === playerId ? "me" : ""} ${player.sittingOut ? "away" : ""} ${player.wonHand ? "winner" : ""}`
      : "seat seat-empty";
    const posIndex = (seatNumber - 1 - offset + state.maxPlayers) % state.maxPlayers;
    const position = seatPositions[posIndex];
    seat.style.left = position[0];
    seat.style.top = position[1];
    seat.style.transform = "translate(-50%, -50%)";

    if (!player) {
      seat.innerHTML = `<div class="seat-empty-dot"></div>`;
      seats.appendChild(seat);
      continue;
    }

    const status = player.sittingOut ? "Away" : player.stack === 0 ? "Broke" : player.folded ? "Folded" : player.allIn ? "All-in" : !player.connected ? "Offline" : "";
    const statusBadge = status ? `<span class="badge ${status === "Folded" || status === "Broke" ? "warn" : ""}">${status}</span>` : "";
    const betBadge = player.bet ? `<span class="badge bet">${player.bet}</span>` : "";
    const winBadge = player.wonHand ? '<span class="badge win">Winner</span>' : "";
    const hintBadge = player.id === playerId && player.handHint ? `<span class="badge hint">${escapeHtml(player.handHint)}</span>` : "";
    seat.innerHTML = `
      <div class="cards seat-cards"></div>
      ${player.dealer ? '<span class="dealer dealer-outside">D</span>' : ""}
      <div class="seat-pod">
        <div class="seat-avatar">${initials(player.name)}</div>
        <div class="seat-info">
          <span class="seat-name">${escapeHtml(player.name)}${player.isOwner ? " \u2605" : ""}</span>
          <span class="seat-stack">${player.stack}</span>
          ${winBadge || hintBadge || statusBadge || betBadge}
        </div>
      </div>
    `;
    renderCards(seat.querySelector(".seat-cards"), player.cards);
    seats.appendChild(seat);
  }
}

function renderBoard() {
  boardCards.innerHTML = "";
  for (let i = 0; i < 5; i += 1) {
    const card = state.board[i];
    const el = document.createElement("div");
    el.className = card ? `card ${isRed(card) ? "red" : ""}` : "card empty";
    el.textContent = card ? `${rankLabel(card.rank)}${suitSymbol(card.suit)}` : "";
    boardCards.appendChild(el);
  }
}

function renderCards(container, cards) {
  container.innerHTML = "";
  const placeholders = cards.length ? cards : [];
  placeholders.forEach((card) => {
    const el = document.createElement("div");
    el.className = `card ${!card ? "back" : isRed(card) ? "red" : ""}`;
    el.textContent = card ? `${rankLabel(card.rank)}${suitSymbol(card.suit)}` : "?";
    container.appendChild(el);
  });
}

function renderControls() {
  const me = state.players.find((player) => player.id === playerId);
  const current = state.players[state.turnIndex];
  const myTurn = current?.id === playerId;
  const pausedText = state.paused ? "Paused by owner" : "";
  const autoStartText = state.phase === "showdown" && state.autoStartDeadline ? "Next hand starting..." : "Hand complete";
  turnLabel.textContent = pausedText || (current ? `${current.name}'s turn` : state.phase === "waiting" ? "Waiting for players" : autoStartText);
  startHandBtn.disabled = state.paused;
  pauseBtn.classList.toggle("hidden", state.ownerId !== playerId);
  pauseBtn.textContent = state.paused ? "Resume" : "Pause";
  awayBtn.textContent = me?.sittingOut ? "Back" : "Away";
  awayBtn.disabled = !me || !me.seatNumber;
  const canDecideCards = state.phase === "showdown" && me?.cards?.some(Boolean) && !me?.cardsDecided;
  showCardsBtn.classList.toggle("hidden", !canDecideCards);
  muckCardsBtn.classList.toggle("hidden", !canDecideCards);
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.disabled = state.paused || me?.sittingOut || !myTurn || state.phase === "waiting" || state.phase === "showdown";
  });
  raiseInput.disabled = state.paused || me?.sittingOut || !myTurn;
  const callAmount = me ? Math.max(0, state.currentBet - me.bet) : 0;
  document.querySelector('[data-action="check"]').disabled = state.paused || me?.sittingOut || !myTurn || callAmount > 0 || state.phase === "waiting" || state.phase === "showdown";
  document.querySelector('[data-action="call"]').disabled = state.paused || me?.sittingOut || !myTurn || callAmount === 0 || state.phase === "waiting" || state.phase === "showdown";
  document.querySelector('[data-action="call"]').textContent = callAmount ? `Call ${callAmount}` : "Call";
  raiseInput.min = String(Math.max(state.currentBet + state.bigBlind, state.bigBlind));
  if (Number(raiseInput.value) < Number(raiseInput.min)) raiseInput.value = raiseInput.min;

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const deadline = state.turnDeadline || state.autoStartDeadline;
    if (!deadline) {
      timerLabel.textContent = "--";
      return;
    }
    const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    timerLabel.textContent = `${left}s`;
  }, 250);
}

function renderLog() {
  handLog.innerHTML = "";
  state.log.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    handLog.appendChild(li);
  });
}

let _lastChipRequestCount = 0;

function renderChipRequests() {
  const me = state.players.find((player) => player.id === playerId);
  const isOwner = state.ownerId === playerId;
  chipsForm.classList.toggle("hidden", !me || !me.seatNumber);
  chipRequests.innerHTML = "";

  const requests = state.chipRequests || [];

  // Show toast alert to owner when new requests arrive
  if (isOwner && requests.length > _lastChipRequestCount) {
    const newest = requests[requests.length - 1];
    if (newest) showChipRequestToast(newest);
  }
  _lastChipRequestCount = requests.length;

  if (!requests.length) {
    chipRequests.innerHTML = '<p class="muted-line">No chip requests.</p>';
    return;
  }

  requests.forEach((request) => {
    const row = document.createElement("div");
    row.className = "chip-request";
    row.innerHTML = `
      <span>${escapeHtml(request.name)} wants ${request.amount}</span>
      ${isOwner
        ? `<button data-request-id="${request.id}" data-amount="${request.amount}">Approve</button>`
        : '<span class="muted-line">Pending…</span>'}
    `;
    chipRequests.appendChild(row);
  });
}

let _chipToastTimeout = null;
function showChipRequestToast(request) {
  let toast = document.getElementById("chipToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "chipToast";
    toast.className = "chip-toast";
    document.body.appendChild(toast);
  }
  toast.innerHTML = `
    <strong>Chip Request</strong>
    <span>${escapeHtml(request.name)} wants ${request.amount} chips</span>
    <button data-request-id="${request.id}" data-amount="${request.amount}" class="chip-toast-approve">Approve</button>
    <button class="chip-toast-dismiss secondary">Dismiss</button>
  `;
  toast.classList.add("visible");

  toast.querySelector(".chip-toast-approve").addEventListener("click", () => {
    send("approveChips", { requestId: request.id, amount: request.amount });
    playSound("chips");
    toast.classList.remove("visible");
  });
  toast.querySelector(".chip-toast-dismiss").addEventListener("click", () => {
    toast.classList.remove("visible");
  });

  clearTimeout(_chipToastTimeout);
  _chipToastTimeout = setTimeout(() => toast.classList.remove("visible"), 15000);
}

function renderStats() {
  statsPanel.innerHTML = "";
  state.players.forEach((player) => {
    const stats = player.stats || {};
    const row = document.createElement("div");
    row.className = "stat-row";
    row.innerHTML = `
      <strong>${escapeHtml(player.name)}</strong>
      <span>Hands ${stats.hands || 0}</span>
      <span>Wins ${stats.wins || 0}</span>
      <span>Buy-in ${stats.buyIns || 0}</span>
      <span>Won ${stats.chipsWon || 0}</span>
    `;
    statsPanel.appendChild(row);
  });
}

function renderLedger() {
  ledgerPanel.innerHTML = "";
  const summary = state.ledgerSummary;
  if (!summary?.length) {
    ledgerPanel.innerHTML = '<p class="muted-line">No activity yet.</p>';
    return;
  }
  // Structured player ledger table
  const table = document.createElement("table");
  table.className = "ledger-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Player</th>
        <th>Buy-in</th>
        <th>Stack</th>
        <th>Net</th>
      </tr>
    </thead>
  `;
  const tbody = document.createElement("tbody");
  summary.forEach((row) => {
    const net = row.net;
    const netClass = net > 0 ? "net-pos" : net < 0 ? "net-neg" : "";
    const netPrefix = net > 0 ? "+" : "";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.name)}</td>
      <td>${row.totalBuyIn}</td>
      <td>${row.currentStack}</td>
      <td class="${netClass}">${netPrefix}${net}</td>
    `;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  ledgerPanel.appendChild(table);

  // Recent activity log below the table
  if (state.ledger?.length) {
    const logTitle = document.createElement("p");
    logTitle.className = "ledger-log-title";
    logTitle.textContent = "Activity";
    ledgerPanel.appendChild(logTitle);
    const ol = document.createElement("ol");
    ol.className = "ledger-log";
    state.ledger.slice(0, 20).forEach((entry) => {
      const li = document.createElement("li");
      li.textContent = entry.message;
      ol.appendChild(li);
    });
    ledgerPanel.appendChild(ol);
  }
}

function renderRejoinBar() {
  const me = state.players.find((player) => player.id === playerId);
  const seatless = Boolean(me) && !me.seatNumber;
  rejoinBar.classList.toggle("hidden", !seatless);
  leaveSeatBtn.disabled = !me || !me.seatNumber;

  if (!seatless) return;
  const taken = new Set(state.players.filter((player) => player.seatNumber).map((player) => player.seatNumber));
  const currentValue = rejoinSeatInput.value;
  rejoinSeatInput.innerHTML = '<option value="">Auto seat</option>';
  for (let seatNumber = 1; seatNumber <= state.maxPlayers; seatNumber += 1) {
    if (taken.has(seatNumber)) continue;
    const option = document.createElement("option");
    option.value = String(seatNumber);
    option.textContent = `Seat ${seatNumber}`;
    rejoinSeatInput.appendChild(option);
  }
  rejoinSeatInput.value = currentValue;
}

function addMessage(name, text) {
  const item = document.createElement("div");
  item.className = "message";
  item.innerHTML = `<strong>${escapeHtml(name)}</strong> ${escapeHtml(text)}`;
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
}

function reactToStateChange(previous, current) {
  if (!previous) {
    soundBtn.textContent = soundEnabled ? "Sound On" : "Sound Off";
    return;
  }
  if (previous.phase !== current.phase) playSound(current.phase === "showdown" ? "win" : "deal");
  if (previous.pot !== current.pot) playSound("chips");
  const previousTurn = previous.players[previous.turnIndex]?.id;
  const currentTurn = current.players[current.turnIndex]?.id;
  if (currentTurn === playerId && previousTurn !== currentTurn) playSound("turn");
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem("pokerSound", soundEnabled ? "on" : "off");
  soundBtn.textContent = soundEnabled ? "Sound On" : "Sound Off";
  if (soundEnabled) playSound("turn");
}

function toggleAway() {
  const me = state.players.find((player) => player.id === playerId);
  away = !me?.sittingOut;
  send("setAway", { away });
}

function togglePause() {
  send("pauseGame", { paused: !state.paused });
}

function initials(name) {
  return String(name).trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("") || "?";
}

function rankLabel(rank) {
  return rank === "T" ? "10" : rank;
}

function playSound(kind) {
  if (!soundEnabled) return;
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const tones = {
    deal: [440, 0.05],
    chips: [620, 0.06],
    turn: [780, 0.08],
    win: [880, 0.14]
  };
  const [frequency, duration] = tones[kind] || tones.deal;
  oscillator.frequency.value = frequency;
  oscillator.type = "sine";
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

// ─── Voice Chat ──────────────────────────────────────────────────────────────
//
// Architecture: Perfect Negotiation pattern (RFC 8829 §4.1.1).
// peers Map entries: { pc, makingOffer, ignoreOffer, iceCandidateQueue }
//
// Known failure modes handled here:
//   1. Offer collision    → polite peer rolls back; impolite peer ignores incoming offer
//   2. ICE before SDP     → candidates queued until remoteDescription is set
//   3. Autoplay blocked   → explicit audio.play() with user-gesture unlock fallback
//   4. Failed connection  → peer entry cleaned up so ensurePeer can retry
//   5. One-sided start    → receiving side creates peer via handleVoiceSignal even if
//                           they haven't clicked "Start Voice" yet (graceful no-op)
//   6. Non-HTTPS          → getUserMedia is blocked on non-localhost HTTP; we warn clearly
// ─────────────────────────────────────────────────────────────────────────────

function voiceLog(msg) {
  console.log(`[Voice] ${msg}`);
  addMessage("Voice", msg);
}

async function startVoice() {
  // getUserMedia requires HTTPS or localhost — warn early if neither
  const isSecure = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (!isSecure) {
    voiceLog("Voice requires HTTPS. Ask the host to serve over HTTPS, or test on localhost.");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    voiceLog("This browser does not support microphone access.");
    return;
  }
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    voiceLog("Microphone granted. Connecting to peers...");
  } catch (err) {
    voiceLog(`Microphone error: ${err.name}. Check browser permissions.`);
    return;
  }
  muted = false;
  muteBtn.disabled = false;
  voiceBtn.disabled = true;
  voiceBtn.textContent = "Voice On";
  send("setVoice", { muted });

  // Connect to every player who is currently in the room.
  // Both sides call ensurePeer — Perfect Negotiation handles the collision.
  state.players
    .filter((p) => p.id !== playerId && p.connected)
    .forEach((p) => ensurePeer(p.id));
}

function toggleMute() {
  muted = !muted;
  localStream?.getAudioTracks().forEach((t) => { t.enabled = !muted; });
  muteBtn.textContent = muted ? "Unmute" : "Mute";
  send("setVoice", { muted });
}

function renderVoicePeers() {
  voicePeers.innerHTML = "";
  state.players.filter((p) => p.id !== playerId).forEach((p) => {
    const entry = peers.get(p.id);
    const cs = entry?.pc.connectionState;
    const label = !localStream
      ? "—"
      : cs === "connected"
        ? "🟢 Live"
        : cs === "connecting" || cs === "new"
          ? "🟡 Connecting"
          : cs === "failed"
            ? "🔴 Failed"
            : p.connected
              ? "⚪ Waiting"
              : "Offline";

    const row = document.createElement("div");
    row.className = "voice-peer";
    row.innerHTML = `<span>${escapeHtml(p.name)}</span><span style="font-size:0.78rem">${label}</span>`;
    voicePeers.appendChild(row);

    if (localStream && p.connected && entry?.pc.connectionState === "failed") {
      voiceLog(`Retrying connection to ${p.name}…`);
      peers.delete(p.id);
      document.querySelector(`[data-audio="${p.id}"]`)?.remove();
    }
  });
}

function buildIceServers() {
  return [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
        "turns:openrelay.metered.ca:443"
      ],
      username: "openrelayproject",
      credential: "openrelayproject"
    },
    {
      urls: [
        "turn:numb.viagenie.ca:3478",
        "turn:numb.viagenie.ca:3478?transport=tcp"
      ],
      username: "webrtc@live.com",
      credential: "muazkh"
    }
  ];
}

// Run window.voiceDiag() in DevTools console after starting voice.
// Shows candidate types: host=local LAN, srflx=STUN public IP, relay=TURN relay.
// If you ONLY see host candidates, STUN/TURN are blocked by your network.
window.voiceDiag = function() {
  if (!peers.size) { console.log("No peers open yet — start voice first."); return; }
  peers.forEach((peer, id) => {
    const pc = peer.pc;
    console.group("Peer " + id);
    console.log("connectionState:", pc.connectionState);
    console.log("iceConnectionState:", pc.iceConnectionState);
    console.log("iceGatheringState:", pc.iceGatheringState);
    pc.getStats().then((stats) => {
      stats.forEach((r) => {
        if (r.type === "local-candidate")
          console.log("  local candidate:", r.candidateType, r.protocol, r.address + ":" + r.port);
        if (r.type === "candidate-pair" && r.nominated)
          console.log("  NOMINATED PAIR state=" + r.state, "bytesSent=" + r.bytesSent);
      });
    });
    console.groupEnd();
  });
};


function ensurePeer(targetId) {
  if (peers.has(targetId) || !localStream) return peers.get(targetId);

  // Polite peer = lexicographically smaller playerId.
  // The polite peer rolls back its offer when a collision occurs.
  const polite = playerId < targetId;
  voiceLog(`Opening peer connection to ${targetId} (${polite ? "polite" : "impolite"})`);

  const pc = new RTCPeerConnection({
    iceServers: buildIceServers()
  });

  const peer = { pc, makingOffer: false, ignoreOffer: false, iceCandidateQueue: [] };
  peers.set(targetId, peer);

  // Add local tracks — this triggers onnegotiationneeded on both sides
  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.onnegotiationneeded = async () => {
    voiceLog(`Negotiation needed with ${targetId}, signalingState=${pc.signalingState}`);
    try {
      peer.makingOffer = true;
      // setLocalDescription() with no args: browser auto-creates the right offer/answer type
      await pc.setLocalDescription();
      voiceLog(`Sending ${pc.localDescription.type} to ${targetId}`);
      send("voiceSignal", { targetId, signal: { description: pc.localDescription } });
    } catch (err) {
      console.error("[Voice] onnegotiationneeded error:", err);
    } finally {
      peer.makingOffer = false;
    }
  };

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      // Log candidate type: host=local, srflx=STUN, relay=TURN
      voiceLog(`ICE candidate [${candidate.type}] for ${targetId}`);
      send("voiceSignal", { targetId, signal: { candidate } });
    } else {
      voiceLog(`ICE gathering complete for ${targetId}`);
    }
  };

  pc.onicegatheringstatechange = () => {
    voiceLog(`ICE gathering: ${pc.iceGatheringState} (peer: ${targetId})`);
  };

  pc.oniceconnectionstatechange = () => {
    voiceLog(`ICE connection: ${pc.iceConnectionState} (peer: ${targetId})`);
  };

  pc.onconnectionstatechange = () => {
    voiceLog(`Connection state: ${pc.connectionState} (peer: ${targetId})`);
    if (pc.connectionState === "connected") {
      voiceLog(`✅ Audio connected with ${targetId}`);
    }
    if (pc.connectionState === "failed" || pc.connectionState === "closed") {
      peers.delete(targetId);
      document.querySelector(`[data-audio="${targetId}"]`)?.remove();
    }
  };

  pc.ontrack = ({ streams }) => {
    voiceLog(`Track received from ${targetId}`);
    const stream = streams[0];
    let audio = document.querySelector(`[data-audio="${targetId}"]`);
    if (!audio) {
      audio = document.createElement("audio");
      audio.dataset.audio = targetId;
      audioMount.appendChild(audio);
    }
    audio.srcObject = stream;
    // autoplay is often blocked by browser policy — force play() with a catch
    audio.play().catch(() => {
      // If autoplay is blocked, unlock on next user gesture anywhere on the page
      voiceLog("Autoplay blocked — click anywhere on the page to hear audio.");
      const unlock = () => { audio.play().catch(() => {}); document.removeEventListener("click", unlock); };
      document.addEventListener("click", unlock, { once: true });
    });
  };

  return peer;
}

async function handleVoiceSignal(payload) {
  const { fromId, signal } = payload;

  if (!localStream) {
    voiceLog(`Signal from ${fromId} received but voice not started yet.`);
    return;
  }

  const peer = ensurePeer(fromId);
  if (!peer) return;

  const pc = peer.pc;
  const polite = playerId < fromId;

  try {
    if (signal.description) {
      voiceLog(
        `DEBUG from=${fromId} polite=${polite} makingOffer=${peer.makingOffer} state=${pc.signalingState} type=${signal.description.type}`
      );

      const offerCollision =
        signal.description.type === "offer" &&
        (peer.makingOffer || pc.signalingState !== "stable");

      peer.ignoreOffer = !polite && offerCollision;

      if (peer.ignoreOffer) {
        voiceLog(`Collision — impolite peer ignoring offer from ${fromId}`);
        return;
      }

      if (offerCollision) {
        voiceLog(`Collision — polite peer rolling back offer to accept ${fromId}`);
        await pc.setLocalDescription({ type: "rollback" });
      }

      await pc.setRemoteDescription(signal.description);

      for (const c of peer.iceCandidateQueue) {
        await pc.addIceCandidate(c).catch((e) =>
          console.warn("[Voice] Queued ICE error", e)
        );
      }
      peer.iceCandidateQueue = [];

      if (signal.description.type === "offer") {
        await pc.setLocalDescription();
        voiceLog(`Sending answer to ${fromId}`);
        send("voiceSignal", {
          targetId: fromId,
          signal: { description: pc.localDescription },
        });
      }
    }

    if (signal.candidate) {
      if (pc.remoteDescription?.type) {
        await pc.addIceCandidate(signal.candidate).catch((e) => {
          console.warn("[Voice] ICE candidate error", e);
        });
      } else {
        peer.iceCandidateQueue.push(signal.candidate);
      }
    }
  } catch (err) {
    if (!peer.ignoreOffer) {
      console.error("[Voice] handleVoiceSignal error", err);
    }
  }
}

function copyRoomCode() {
  navigator.clipboard?.writeText(roomCode);
  addMessage("Table", `Room code copied: ${roomCode}`);
}

function getLastRoom() {
  return (localStorage.getItem("pokerLastRoom") || "").trim().toUpperCase();
}

function setLastRoom(code) {
  if (code) localStorage.setItem("pokerLastRoom", String(code).trim().toUpperCase());
}

function clearLastRoom() {
  localStorage.removeItem("pokerLastRoom");
}

function tryAutoReconnect() {
  if (sessionStorage.getItem("pokerAutoRejoin") !== "1") return;
  if (socket) return;
  const code = getLastRoom();
  const name = (localStorage.getItem("pokerName") || "").trim();
  const savedSeat = code ? readSavedSeat(code) : null;
  if (!code || !name || !savedSeat?.token || savedSeat?.name !== name) {
    sessionStorage.removeItem("pokerAutoRejoin");
    return;
  }
  reconnectAttempted = true;
  roomInput.value = code;
  connect("joinRoom");
}

window.addEventListener("beforeunload", () => {
  if (roomCode) sessionStorage.setItem("pokerAutoRejoin", "1");
});

window.addEventListener("load", () => {
  tryAutoReconnect();
});

function readSavedSeat(code) {
  try {
    return JSON.parse(localStorage.getItem(`pokerSeat:${code}`) || "null");
  } catch {
    return null;
  }
}

function saveSeat(code, name, token) {
  localStorage.setItem(`pokerSeat:${code}`, JSON.stringify({ name, token }));
}

function suitSymbol(suit) {
  return { S: "\u2660", H: "\u2665", D: "\u2666", C: "\u2663" }[suit] || suit;
}

function isRed(card) {
  return card.suit === "H" || card.suit === "D";
}

function titleCase(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}
