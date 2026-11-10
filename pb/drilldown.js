/* =====================================================================
   drilldown.js
   Deterministic Single-Day Trace Simulator, Timeline Charts & Player Explorer
   ===================================================================== */

const SKILL_NAMES = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];
const SKILL_COLORS = ['#f59e0b', '#0ea5e9', '#10b981', '#8b5cf6'];

let dayTimelineChart = null;
let currentDayTrace = null;
let selectedPlayerId = null;

// Format minutes since facility open (e.g. 0 -> "8:00 AM", 95 -> "9:35 AM")
function formatClockTime(minsFromOpen) {
    const baseMinutes = 8 * 60 + Math.round(minsFromOpen); // Assume 8:00 AM open
    const hrs24 = Math.floor(baseMinutes / 60) % 24;
    const mins = baseMinutes % 60;
    const period = hrs24 >= 12 ? 'PM' : 'AM';
    const hrs12 = hrs24 % 12 === 0 ? 12 : hrs24 % 12;
    return `${hrs12}:${mins.toString().padStart(2, '0')} ${period}`;
}

// Identical Mulberry32 PRNG to sim-worker.js so Day #N matches the worker's simulation
function createSeededRng(seed) {
    let state = (seed >>> 0) || 1;
    let hasSpare = false;
    let spare = 0.0;

    function nextFloat() {
        let t = (state += 0x6D2B79F5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    function nextGauss(mean, std) {
        if (hasSpare) {
            hasSpare = false;
            return mean + std * spare;
        }
        let u, v, s;
        do {
            u = nextFloat() * 2.0 - 1.0;
            v = nextFloat() * 2.0 - 1.0;
            s = u * u + v * v;
        } while (s >= 1.0 || s === 0.0);
        const mul = Math.sqrt(-2.0 * Math.log(s) / s);
        spare = v * mul;
        hasSpare = true;
        return mean + std * (u * mul);
    }

    return { nextFloat, nextGauss };
}

function computeDaySeedMain(sIdx, xIdx, simIdx) {
    let h = (sIdx * 374761393 + xIdx * 668265263 + simIdx * 2147483647 + 0x9E3779B9) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
}

// Re-runs a single day with full event-by-event trace (players, games, courts, outcomes, minute-by-minute series)
function simulateDayDetailed(dayId, sIdx, xIdx, simIdx, targetSimultaneousTotal, courts, playersPerGame, config) {
    const seed = computeDaySeedMain(sIdx, xIdx, simIdx);
    const rng = createSeededRng(seed);

    const skillEnabled = (config.skillMode !== 'off');
    const meanStay = (config.minStay + config.maxStay) * 0.5;
    const dailyMean = targetSimultaneousTotal * (config.opMinutes / meanStay);
    const dailyStd = dailyMean * 0.1;

    const numPlayers = Math.max(playersPerGame, Math.trunc(rng.nextGauss(dailyMean, dailyStd)));
    const staySpan = Math.max(1, config.maxStay - config.minStay);
    const numQueues = skillEnabled ? 4 : 1;

    const players = [];
    const events = [];
    let seq = 0;

    function pushEvent(time, type, payload) {
        events.push({ time, seq: seq++, type, payload });
    }

    function popNextEvent() {
        if (events.length === 0) return null;
        let bestIdx = 0;
        for (let i = 1; i < events.length; i++) {
            const a = events[i], b = events[bestIdx];
            if (a.time < b.time || (a.time === b.time && a.seq < b.seq)) {
                bestIdx = i;
            }
        }
        const ev = events[bestIdx];
        events.splice(bestIdx, 1);
        return ev;
    }

    for (let i = 0; i < numPlayers; i++) {
        const arr = rng.nextFloat() * config.opMinutes;
        const dep = arr + config.minStay + rng.nextFloat() * staySpan;
        let sk = 2; // Default Advanced if Open Mix
        if (skillEnabled) {
            const r = rng.nextFloat();
            sk = r < config.cumProb0 ? 0 : (r < config.cumProb1 ? 1 : (r < config.cumProb2 ? 2 : 3));
        }

        players.push({
            id: i + 1,
            skill: sk,
            arrivalTime: arr,
            departureTime: dep,
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            totalPlayTime: 0,
            isPlaying: false,
            queueEnterTime: arr,
            matches: [],
            segments: [] // { type: 'wait'|'play', start, end, gameId, court }
        });

        pushEvent(arr, 'arrival', i);
        pushEvent(dep, 'departure', i);
    }

    const waitQueues = [[], [], [], []];
    const freeCourts = Array.from({ length: courts }, (_, c) => c + 1);
    const games = [];

    function chooseQueue(pIdx, currentTime) {
        if (!skillEnabled) return 0;
        const p = players[pIdx];
        const ownS = p.skill;
        const ownQ = waitQueues[ownS];

        let isLongWait = false;
        if (ownQ.length > 0) {
            const oldestWait = currentTime - players[ownQ[0]].queueEnterTime;
            if (oldestWait >= config.meanGame || ownQ.length >= playersPerGame * 2) {
                isLongWait = true;
            }
        }

        const mixProb = isLongWait ? config.longWaitMixProb : config.baseMixProb;
        if (mixProb > 0 && rng.nextFloat() < mixProb) {
            const lowS  = ownS > 0 ? ownS - 1 : -1;
            const highS = ownS < 3 ? ownS + 1 : -1;

            if (lowS !== -1 && highS !== -1) {
                const lowRem  = waitQueues[lowS].length % playersPerGame;
                const highRem = waitQueues[highS].length % playersPerGame;
                if (lowRem > highRem) return lowS;
                if (highRem > lowRem) return highS;
                return rng.nextFloat() < 0.5 ? lowS : highS;
            } else if (lowS !== -1) {
                return lowS;
            } else if (highS !== -1) {
                return highS;
            }
        }
        return ownS;
    }

    function removePlayerFromQueues(pIdx) {
        for (let q = 0; q < 4; q++) {
            const idx = waitQueues[q].indexOf(pIdx);
            if (idx !== -1) waitQueues[q].splice(idx, 1);
        }
    }

    function launchGame(qIdx, activeList, currentTime) {
        const courtNum = freeCourts.shift();
        const chosenPIndices = activeList.splice(0, playersPerGame);

        let gTime = rng.nextGauss(config.meanGame, config.stdGame);
        if (gTime < 5.0) gTime = 5.0;
        const finishTime = currentTime + gTime;

        const gameId = games.length + 1;
        const waitBeforeByPlayer = {};

        for (const pIdx of chosenPIndices) {
            const p = players[pIdx];
            removePlayerFromQueues(pIdx);
            const waited = Math.max(0, currentTime - p.queueEnterTime);
            waitBeforeByPlayer[p.id] = waited;
            if (waited > 0.05) {
                p.segments.push({ type: 'wait', start: p.queueEnterTime, end: currentTime });
            }
            p.segments.push({ type: 'play', start: currentTime, end: finishTime, gameId, court: courtNum });
            p.isPlaying = true;
            p.gamesPlayed += 1;
            p.totalPlayTime += gTime;
        }

        games.push({
            id: gameId,
            court: courtNum,
            queueTier: qIdx,
            startTime: currentTime,
            endTime: finishTime,
            duration: gTime,
            playerIndices: chosenPIndices,
            waitBeforeByPlayer
        });

        pushEvent(finishTime, 'game_finish', gameId - 1);
    }

    function tryStartGames(currentTime) {
        if (freeCourts.length === 0) return;

        const activeByQ = [[], [], [], []];
        for (let q = 0; q < numQueues; q++) {
            for (const pIdx of waitQueues[q]) {
                if ((players[pIdx].departureTime - currentTime) >= config.meanGame) {
                    activeByQ[q].push(pIdx);
                }
            }
        }

        while (freeCourts.length > 0) {
            let bestQ = -1;
            let earliestEnter = Infinity;

            for (let q = 0; q < numQueues; q++) {
                if (activeByQ[q].length >= playersPerGame) {
                    const headP = players[activeByQ[q][0]];
                    if (headP.queueEnterTime < earliestEnter) {
                        earliestEnter = headP.queueEnterTime;
                        bestQ = q;
                    }
                }
            }

            if (bestQ === -1) break;
            launchGame(bestQ, activeByQ[bestQ], currentTime);
        }

        if (skillEnabled && freeCourts.length > 0 && config.longWaitMixProb > 0) {
            for (let q = 0; q < 4 && freeCourts.length > 0; q++) {
                const needed = playersPerGame - activeByQ[q].length;
                if (activeByQ[q].length > 0 && needed > 0 && needed <= 2) {
                    for (let adj = Math.max(0, q - 1); adj <= Math.min(3, q + 1); adj++) {
                        if (adj === q || activeByQ[adj].length === 0) continue;
                        const candIdx = activeByQ[adj][0];
                        const waited = currentTime - players[candIdx].queueEnterTime;
                        if (waited >= config.meanGame && rng.nextFloat() < config.longWaitMixProb) {
                            activeByQ[adj].shift();
                            activeByQ[q].push(candIdx);
                            if (activeByQ[q].length >= playersPerGame) {
                                launchGame(q, activeByQ[q], currentTime);
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    while (events.length > 0) {
        const ev = popNextEvent();
        const currentTime = ev.time;

        if (ev.type === 'arrival') {
            const pIdx = ev.payload;
            const p = players[pIdx];
            if (currentTime < p.departureTime) {
                p.queueEnterTime = currentTime;
                const targetQ = chooseQueue(pIdx, currentTime);
                waitQueues[targetQ].push(pIdx);
                tryStartGames(currentTime);
            }
        } else if (ev.type === 'game_finish') {
            const g = games[ev.payload];
            freeCourts.push(g.court);
            freeCourts.sort((a, b) => a - b);

            for (const pIdx of g.playerIndices) {
                const p = players[pIdx];
                p.isPlaying = false;
                if (currentTime < p.departureTime) {
                    p.queueEnterTime = currentTime;
                    const targetQ = chooseQueue(pIdx, currentTime);
                    waitQueues[targetQ].push(pIdx);
                }
            }
            tryStartGames(currentTime);
        } else if (ev.type === 'departure') {
            const pIdx = ev.payload;
            const p = players[pIdx];
            if (!p.isPlaying) {
                removePlayerFromQueues(pIdx);
                if (currentTime > p.queueEnterTime + 0.05) {
                    p.segments.push({ type: 'wait', start: p.queueEnterTime, end: currentTime });
                }
            }
        }
    }

    // Generate realistic pickleball match pairings & scores (to 11, win by 2) using a separate deterministic RNG
    const scoreRng = createSeededRng(seed ^ 0xA5A5A5A5);

    for (const g of games) {
        const pObjs = g.playerIndices.map(idx => players[idx]);
        let team1 = [], team2 = [];

        if (pObjs.length === 4) {
            team1 = [pObjs[0], pObjs[1]];
            team2 = [pObjs[2], pObjs[3]];
        } else if (pObjs.length === 3) {
            // Canadian (2 vs 1 server/singles side)
            team1 = [pObjs[0]];
            team2 = [pObjs[1], pObjs[2]];
        } else {
            team1 = [pObjs[0]];
            team2 = [pObjs[1]];
        }

        const avgSkill1 = team1.reduce((acc, p) => acc + p.skill, 0) / team1.length;
        const avgSkill2 = team2.reduce((acc, p) => acc + p.skill, 0) / team2.length;
        const winProb1 = 1 / (1 + Math.exp(-(avgSkill1 - avgSkill2) * 1.1));
        const team1Won = scoreRng.nextFloat() < winProb1;

        const loserPts = Math.min(9, Math.max(2, Math.floor(scoreRng.nextFloat() * 10)));
        const score1 = team1Won ? 11 : loserPts;
        const score2 = team1Won ? loserPts : 11;

        g.team1 = team1.map(p => p.id);
        g.team2 = team2.map(p => p.id);
        g.score1 = score1;
        g.score2 = score2;
        g.team1Won = team1Won;

        // Record match entry on each participating player
        for (const p of team1) {
            if (team1Won) p.wins++; else p.losses++;
            p.matches.push({
                gameId: g.id,
                court: g.court,
                startTime: g.startTime,
                endTime: g.endTime,
                waitBefore: g.waitBeforeByPlayer[p.id] || 0,
                partners: team1.filter(x => x.id !== p.id).map(x => x.id),
                opponents: team2.map(x => x.id),
                won: team1Won,
                scoreStr: `${score1}–${score2}`
            });
        }

        for (const p of team2) {
            if (!team1Won) p.wins++; else p.losses++;
            p.matches.push({
                gameId: g.id,
                court: g.court,
                startTime: g.startTime,
                endTime: g.endTime,
                waitBefore: g.waitBeforeByPlayer[p.id] || 0,
                partners: team2.filter(x => x.id !== p.id).map(x => x.id),
                opponents: team1.map(x => x.id),
                won: !team1Won,
                scoreStr: `${score2}–${score1}`
            });
        }
    }

    // Compute minute-by-minute timeline series (every 5 minutes)
    const timeLabels = [];
    const playingSeries = [];
    const waitingSeries = [];
    let peakQueue = 0;
    let totalCourtMins = 0;

    for (const g of games) {
        totalCourtMins += g.duration;
    }

    for (let t = 0; t <= config.opMinutes; t += 5) {
        timeLabels.push(formatClockTime(t));
        let onCourt = 0;
        let inQueue = 0;

        for (const p of players) {
            if (t >= p.arrivalTime && t <= p.departureTime) {
                const playingNow = p.segments.some(seg => seg.type === 'play' && t >= seg.start && t < seg.end);
                if (playingNow) onCourt++;
                else inQueue++;
            }
        }
        if (inQueue > peakQueue) peakQueue = inQueue;
        playingSeries.push(onCourt);
        waitingSeries.push(inQueue);
    }

    const avgWaitPerGame = players.reduce((acc, p) => {
        const stay = p.departureTime - p.arrivalTime;
        const wait = Math.max(0, stay - p.totalPlayTime);
        return acc + wait / (p.gamesPlayed + 1);
    }, 0) / players.length;

    const courtUtilPct = Math.min(100, (totalCourtMins / (courts * config.opMinutes)) * 100);

    return {
        dayId,
        courts,
        targetSimultaneousTotal,
        playersPerGame,
        opMinutes: config.opMinutes,
        players,
        games,
        timeLabels,
        playingSeries,
        waitingSeries,
        peakQueue,
        avgWaitPerGame,
        courtUtilPct
    };
}

// Convert a 1-based Global Day ID (e.g. #545) into (sIdx, xIdx, simIdx) and render the full Day Explorer
function loadAndRenderDayById(requestedDayId, scrollIntoView = false) {
    if (!latestSimSnapshot || !latestSimSnapshot.taskMetaList) return;

    const { config, taskMetaList } = latestSimSnapshot;
    const simsPerTask = config.simsPerConfig;
    const totalDays = taskMetaList.length * simsPerTask;

    const clampedDayId = Math.min(totalDays, Math.max(1, Math.trunc(requestedDayId) || 1));
    document.getElementById('dayIdInput').value = clampedDayId;
    document.getElementById('dayRangeHint').textContent = `(of ${totalDays.toLocaleString()})`;

    const zeroBased = clampedDayId - 1;
    const taskIdx = Math.floor(zeroBased / simsPerTask);
    const simIdx = zeroBased % simsPerTask;
    const taskMeta = taskMetaList[taskIdx];

    currentDayTrace = simulateDayDetailed(
        clampedDayId,
        taskMeta.sIdx,
        taskMeta.xIdx,
        simIdx,
        taskMeta.targetSimultaneousTotal,
        taskMeta.courts,
        taskMeta.playersPerGame,
        config
    );

    renderDayExplorer(currentDayTrace);

    if (scrollIntoView) {
        document.getElementById('drilldownSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Triggered when a user clicks a point on any of the main charts
function selectDayFromChartClick(dsIdx, xIdx) {
    if (!latestSimSnapshot || !latestSimSnapshot.taskMetaList) return;
    const { config, taskMetaList } = latestSimSnapshot;

    const targetSIdx = (config.skillMode === 'breakdown' && config.simMode === 'fixed_courts') ? 0 : dsIdx;
    const matchTaskIdx = taskMetaList.findIndex(t => t.xIdx === xIdx && (t.sIdx === targetSIdx || t.sIdx === 0));

    if (matchTaskIdx !== -1) {
        const dayId = matchTaskIdx * config.simsPerConfig + 1;
        loadAndRenderDayById(dayId, true);
    }
}

function renderDayExplorer(trace) {
    document.getElementById('ddScenarioLabel').textContent = `${trace.courts} Courts · ~${trace.targetSimultaneousTotal} Present (${trace.playersPerGame}P/Game)`;
    document.getElementById('ddTotalPlayers').textContent = `${trace.players.length} Players`;
    document.getElementById('ddTotalGames').textContent = `${trace.games.length} Games`;
    document.getElementById('ddAvgWait').textContent = `${trace.avgWaitPerGame.toFixed(1)} mins`;
    document.getElementById('ddPeakQueue').textContent = `${trace.peakQueue} Waiting`;
    document.getElementById('ddCourtUtil').textContent = `${trace.courtUtilPct.toFixed(1)}%`;

    document.getElementById('tabBtnPlayers').textContent = `Players (${trace.players.length})`;
    document.getElementById('tabBtnGames').textContent = `Games Log (${trace.games.length})`;

    renderDayTimelineChart(trace);
    renderCourtGantt(trace);
    renderPlayersTable();
    renderGamesTable(trace);

    if (trace.players.length > 0) {
        inspectPlayer(trace.players[0].id);
    }
}

function renderDayTimelineChart(trace) {
    const ctx = document.getElementById('chartDayTimeline').getContext('2d');
    if (dayTimelineChart) {
        dayTimelineChart.destroy();
    }

    dayTimelineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trace.timeLabels,
            datasets: [
                {
                    label: 'Active on Court',
                    data: trace.playingSeries,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.16)',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.2,
                    fill: true
                },
                {
                    label: 'Waiting in Queue',
                    data: trace.waitingSeries,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.16)',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.2,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 150 },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                whiskerErrorBars: { enabled: false },
                legend: {
                    position: 'top',
                    align: 'end',
                    labels: { boxWidth: 10, font: { size: 11, weight: '600' } }
                }
            },
            scales: {
                x: {
                    grid: { color: '#f1f5f9' },
                    ticks: { maxTicksLimit: 10, font: { size: 10 } }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: '#f1f5f9' },
                    title: { display: true, text: 'Players', font: { size: 11, weight: '600' } }
                }
            }
        }
    });
}

function renderCourtGantt(trace) {
    const wrap = document.getElementById('courtGanttWrap');
    wrap.innerHTML = '';

    const byCourt = Array.from({ length: trace.courts }, () => []);
    for (const g of trace.games) {
        if (byCourt[g.court - 1]) byCourt[g.court - 1].push(g);
    }

    for (let c = 0; c < trace.courts; c++) {
        const row = document.createElement('div');
        row.className = 'gantt-row';

        const label = document.createElement('div');
        label.className = 'gantt-court-label';
        label.textContent = `Court ${c + 1}`;

        const track = document.createElement('div');
        track.className = 'gantt-track';

        for (const g of byCourt[c]) {
            const leftPct = Math.max(0, (g.startTime / trace.opMinutes) * 100);
            const widthPct = Math.min(100 - leftPct, ((g.endTime - g.startTime) / trace.opMinutes) * 100);

            const block = document.createElement('div');
            block.className = 'gantt-block';
            block.style.left = `${leftPct.toFixed(2)}%`;
            block.style.width = `${Math.max(0.4, widthPct).toFixed(2)}%`;
            block.style.backgroundColor = SKILL_COLORS[g.queueTier] || '#10b981';

            const pList = g.playerIndices.map(idx => `P#${idx + 1}`).join(', ');
            block.title = `Game #${g.id} (Court ${g.court})\n${formatClockTime(g.startTime)} – ${formatClockTime(g.endTime)} (${g.duration.toFixed(0)}m)\nPlayers: ${pList}\nScore: ${g.score1}–${g.score2}`;

            block.addEventListener('click', () => {
                const firstPid = trace.players[g.playerIndices[0]].id;
                inspectPlayer(firstPid);
            });

            track.appendChild(block);
        }

        row.appendChild(label);
        row.appendChild(track);
        wrap.appendChild(row);
    }
}

function renderPlayersTable() {
    if (!currentDayTrace) return;
    const tbody = document.getElementById('ddPlayersTbody');
    const skillFilter = document.getElementById('ddSkillFilter').value;
    const searchVal = document.getElementById('ddSearchInput').value.trim().toLowerCase();

    tbody.innerHTML = '';

    const filtered = currentDayTrace.players.filter(p => {
        if (skillFilter !== 'all' && String(p.skill) !== skillFilter) return false;
        if (searchVal && !(`p#${p.id}`.includes(searchVal) || String(p.id).includes(searchVal))) return false;
        return true;
    });

    for (const p of filtered) {
        const stayMins = p.departureTime - p.arrivalTime;
        const waitMins = Math.max(0, stayMins - p.totalPlayTime);
        const waitPerGame = waitMins / (p.gamesPlayed + 1);

        const tr = document.createElement('tr');
        if (p.id === selectedPlayerId) tr.classList.add('selected-row');

        tr.innerHTML = `
      <td><strong>P#${p.id}</strong></td>
      <td><span class="skill-pill skill-${p.skill}">${SKILL_NAMES[p.skill]}</span></td>
      <td>${formatClockTime(p.arrivalTime)} – ${formatClockTime(p.departureTime)} (${stayMins.toFixed(0)}m)</td>
      <td><strong>${p.gamesPlayed}</strong></td>
      <td>${p.wins}W–${p.losses}L</td>
      <td>${p.totalPlayTime.toFixed(0)}m / ${waitMins.toFixed(0)}m</td>
      <td>${waitPerGame.toFixed(1)}m</td>
    `;

        tr.addEventListener('click', () => inspectPlayer(p.id));
        tbody.appendChild(tr);
    }
}

function renderGamesTable(trace) {
    const tbody = document.getElementById('ddGamesTbody');
    tbody.innerHTML = '';

    const formatChips = (ids) => ids.map(id => {
        const p = trace.players[id - 1];
        return `<span class="player-chip" data-pid="${id}" title="${SKILL_NAMES[p.skill]}">P#${id}</span>`;
    }).join('');

    for (const g of trace.games) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td><strong>#${g.id}</strong></td>
      <td>Court ${g.court}</td>
      <td>${formatClockTime(g.startTime)} (${g.duration.toFixed(0)}m)</td>
      <td>${formatChips(g.team1)}</td>
      <td><strong>${g.score1} – ${g.score2}</strong></td>
      <td>${formatChips(g.team2)}</td>
    `;

        tr.querySelectorAll('.player-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                e.stopPropagation();
                inspectPlayer(parseInt(chip.getAttribute('data-pid'), 10));
            });
        });

        tbody.appendChild(tr);
    }
}

function inspectPlayer(playerId) {
    if (!currentDayTrace) return;
    const p = currentDayTrace.players.find(item => item.id === playerId);
    if (!p) return;

    selectedPlayerId = p.id;

    // Highlight selected row in Players table
    document.querySelectorAll('#ddPlayersTbody tr').forEach(tr => {
        const firstCell = tr.querySelector('td');
        tr.classList.toggle('selected-row', firstCell && firstCell.textContent === `P#${p.id}`);
    });

    const stayMins = p.departureTime - p.arrivalTime;
    const waitMins = Math.max(0, stayMins - p.totalPlayTime);
    const waitPerGame = waitMins / (p.gamesPlayed + 1);
    const playSharePct = stayMins > 0 ? Math.round((p.totalPlayTime / stayMins) * 100) : 0;

    const badge = document.getElementById('piSkillBadge');
    badge.className = `skill-pill skill-${p.skill}`;
    badge.textContent = SKILL_NAMES[p.skill];

    document.getElementById('piTitle').textContent = `Player #${p.id} (Day #${currentDayTrace.dayId})`;
    document.getElementById('piSubtitle').textContent = `Stayed ${stayMins.toFixed(0)} mins (${formatClockTime(p.arrivalTime)} to ${formatClockTime(p.departureTime)}) · Played ${p.gamesPlayed} games`;

    document.getElementById('piRecord').textContent = `${p.wins}W – ${p.losses}L`;
    document.getElementById('piPlayShare').textContent = `${playSharePct}% (${p.totalPlayTime.toFixed(0)}m)`;
    document.getElementById('piAvgWait').textContent = `${waitPerGame.toFixed(1)}m / game`;

    document.getElementById('piArrLabel').textContent = `Arrived ${formatClockTime(p.arrivalTime)}`;
    document.getElementById('piDepLabel').textContent = `Departed ${formatClockTime(p.departureTime)}`;

    // Render Player Stay Visual Timeline Bar
    const bar = document.getElementById('piTimelineBar');
    bar.innerHTML = '';

    for (const seg of p.segments) {
        const leftPct = Math.max(0, ((seg.start - p.arrivalTime) / stayMins) * 100);
        const widthPct = Math.min(100 - leftPct, ((seg.end - seg.start) / stayMins) * 100);

        const div = document.createElement('div');
        div.className = `pi-seg ${seg.type}`;
        div.style.left = `${leftPct.toFixed(2)}%`;
        div.style.width = `${Math.max(0.8, widthPct).toFixed(2)}%`;
        div.title = seg.type === 'play'
            ? `Playing Game #${seg.gameId} on Court ${seg.court} (${formatClockTime(seg.start)} – ${formatClockTime(seg.end)}, ${(seg.end - seg.start).toFixed(1)}m)`
            : `Waiting in Queue (${formatClockTime(seg.start)} – ${formatClockTime(seg.end)}, ${(seg.end - seg.start).toFixed(1)}m)`;

        bar.appendChild(div);
    }

    // Render Player's Individual Match History
    const tbody = document.getElementById('piMatchesTbody');
    tbody.innerHTML = '';

    if (p.matches.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#64748b;padding:18px;">No games played during this visit (waited ${waitMins.toFixed(0)} mins).</td></tr>`;
        return;
    }

    const renderPartnerChips = (ids) => {
        if (!ids || ids.length === 0) return '<span style="color:#94a3b8;">None (Solo)</span>';
        return ids.map(id => {
            const mate = currentDayTrace.players[id - 1];
            return `<span class="player-chip" data-pid="${id}" title="${SKILL_NAMES[mate.skill]}">P#${id} (${SKILL_NAMES[mate.skill][0]})</span>`;
        }).join('');
    };

    for (const m of p.matches) {
        const tr = document.createElement('tr');
        const outcomeBadge = m.won
            ? `<span class="outcome-win">W ${m.scoreStr}</span>`
            : `<span class="outcome-loss">L ${m.scoreStr}</span>`;

        tr.innerHTML = `
      <td><strong>#${m.gameId}</strong></td>
      <td>${formatClockTime(m.startTime)} · Ct ${m.court}</td>
      <td>${m.waitBefore.toFixed(1)}m</td>
      <td>${renderPartnerChips(m.partners)}</td>
      <td>${renderPartnerChips(m.opponents)}</td>
      <td>${outcomeBadge}</td>
    `;

        tr.querySelectorAll('.player-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                e.stopPropagation();
                inspectPlayer(parseInt(chip.getAttribute('data-pid'), 10));
            });
        });

        tbody.appendChild(tr);
    }
}

function initDrilldownControls() {
    document.getElementById('loadDayBtn').addEventListener('click', () => {
        const val = parseInt(document.getElementById('dayIdInput').value, 10) || 1;
        loadAndRenderDayById(val, false);
    });

    document.getElementById('dayIdInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const val = parseInt(document.getElementById('dayIdInput').value, 10) || 1;
            loadAndRenderDayById(val, false);
        }
    });

    document.getElementById('prevDayBtn').addEventListener('click', () => {
        const cur = parseInt(document.getElementById('dayIdInput').value, 10) || 2;
        loadAndRenderDayById(Math.max(1, cur - 1), false);
    });

    document.getElementById('nextDayBtn').addEventListener('click', () => {
        const cur = parseInt(document.getElementById('dayIdInput').value, 10) || 1;
        loadAndRenderDayById(cur + 1, false);
    });

    document.getElementById('randomDayBtn').addEventListener('click', () => {
        if (!latestSimSnapshot || !latestSimSnapshot.taskMetaList) return;
        const totalDays = latestSimSnapshot.taskMetaList.length * latestSimSnapshot.config.simsPerConfig;
        const randDay = Math.floor(Math.random() * totalDays) + 1;
        loadAndRenderDayById(randDay, false);
    });

    document.getElementById('ddSkillFilter').addEventListener('change', renderPlayersTable);
    document.getElementById('ddSearchInput').addEventListener('input', renderPlayersTable);

    // Switch between Players Table and Games Log Tab
    const tabBtns = document.querySelectorAll('#ddTabSegmented button');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const isPlayers = btn.getAttribute('data-tab') === 'players';
            document.getElementById('ddPlayersTableWrap').classList.toggle('hidden', !isPlayers);
            document.getElementById('playerFiltersBar').classList.toggle('hidden', !isPlayers);
            document.getElementById('ddGamesTableWrap').classList.toggle('hidden', isPlayers);
        });
    });
}
