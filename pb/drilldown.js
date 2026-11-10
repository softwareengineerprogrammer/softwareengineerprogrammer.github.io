/* =====================================================================
   drilldown.js
   Complete Deterministic Single-Day Trace Simulator, Court Gantt +
   3D Isometric "Stacks" Visualizer & Individual Player/Match Explorer
   ===================================================================== */

const SKILL_NAMES = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];
const SKILL_COLORS = ['#f59e0b', '#0ea5e9', '#10b981', '#8b5cf6'];
// Handle clock orientations:
// 0 = Beginner (6:00 Down), 1 = Intermediate (3:00 Right), 2 = Advanced (12:00 Up), 3 = Expert (9:00 Left)
const SKILL_CLOCK_LABELS = ['6:00 ↓', '3:00 →', '12:00 ↑', '9:00 ←'];

let dayTimelineChart = null;
let currentDayTrace = null;
let selectedPlayerId = null;
let stackLoupeEl = null;

function formatClockTime(minsFromOpen) {
    const baseMinutes = 8 * 60 + Math.round(minsFromOpen);
    const hrs24 = Math.floor(baseMinutes / 60) % 24;
    const mins = baseMinutes % 60;
    const period = hrs24 >= 12 ? 'PM' : 'AM';
    const hrs12 = hrs24 % 12 === 0 ? 12 : hrs24 % 12;
    return `${hrs12}:${mins.toString().padStart(2, '0')} ${period}`;
}

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

// Build an ordered list of paddle stacks currently waiting
// Top stack (index 0) is 1st Up, index 1 is 2nd Up, etc.
function buildOrderedStacksSnapshot(waitQueues, players, playersPerGame, numQueues) {
    const stacks = [];

    for (let q = 0; q < numQueues; q++) {
        const qArr = waitQueues[q];
        for (let i = 0; i < qArr.length; i += playersPerGame) {
            const slice = qArr.slice(i, i + playersPerGame);
            const paddles = slice.map(pIdx => ({
                id: players[pIdx].id,
                skill: players[pIdx].skill,
                enterTime: players[pIdx].queueEnterTime
            }));
            stacks.push({
                queueTier: q,
                isFull: paddles.length === playersPerGame,
                headEnterTime: paddles[0].enterTime,
                paddles
            });
        }
    }

    stacks.sort((a, b) => {
        if (a.isFull !== b.isFull) return a.isFull ? -1 : 1;
        return a.headEnterTime - b.headEnterTime;
    });

    return stacks;
}

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
        let sk = 2;
        if (skillEnabled) {
            const r = rng.nextFloat();
            sk = r < config.cumProb0 ? 0 : (r < config.cumProb1 ? 1 : (r < config.cumProb2 ? 2 : 3));
        } else {
            const r = Math.abs(Math.sin(i * 999.91 + seed) * 10000);
            const frac = r - Math.floor(r);
            sk = frac < config.cumProb0 ? 0 : (frac < config.cumProb1 ? 1 : (frac < config.cumProb2 ? 2 : 3));
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
            segments: []
        });

        pushEvent(arr, 'arrival', i);
        pushEvent(dep, 'departure', i);
    }

    const waitQueues = [[], [], [], []];
    const freeCourts = Array.from({ length: courts }, (_, c) => c + 1);
    const games = [];
    const stackSnapshots = [];

    function recordStackUpdate(currentTime, reason) {
        if (currentTime > config.opMinutes) return;
        const stacks = buildOrderedStacksSnapshot(waitQueues, players, playersPerGame, numQueues);
        const prev = stackSnapshots[stackSnapshots.length - 1];
        if (prev && Math.abs(prev.time - currentTime) < 0.001) {
            prev.stacks = stacks;
            prev.reason = reason;
        } else {
            stackSnapshots.push({
                time: currentTime,
                reason,
                stacks
            });
        }
    }

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

    recordStackUpdate(0, 'Facility Open');

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
                recordStackUpdate(currentTime, `P#${p.id} Arrived`);
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
            recordStackUpdate(currentTime, `Game #${g.id} Finished`);
        } else if (ev.type === 'departure') {
            const pIdx = ev.payload;
            const p = players[pIdx];
            if (!p.isPlaying) {
                removePlayerFromQueues(pIdx);
                if (currentTime > p.queueEnterTime + 0.05) {
                    p.segments.push({ type: 'wait', start: p.queueEnterTime, end: currentTime });
                }
                recordStackUpdate(currentTime, `P#${p.id} Departed`);
            }
        }
    }

    for (let i = 0; i < stackSnapshots.length; i++) {
        const nextT = (i + 1 < stackSnapshots.length) ? stackSnapshots[i + 1].time : config.opMinutes;
        stackSnapshots[i].endTime = Math.max(stackSnapshots[i].time, Math.min(config.opMinutes, nextT));
    }

    const scoreRng = createSeededRng(seed ^ 0xA5A5A5A5);

    for (const g of games) {
        const pObjs = g.playerIndices.map(idx => players[idx]);
        let team1 = [], team2 = [];

        if (pObjs.length === 4) {
            team1 = [pObjs[0], pObjs[1]];
            team2 = [pObjs[2], pObjs[3]];
        } else if (pObjs.length === 3) {
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
        stackSnapshots,
        timeLabels,
        playingSeries,
        waitingSeries,
        peakQueue,
        avgWaitPerGame,
        courtUtilPct
    };
}

// Draw a single paddle layer inside an isometric stack on the 2D Canvas
function drawMicroPaddleLayerCanvas(ctx, cx, cy, skill, radius) {
    const color = SKILL_COLORS[skill] || '#10b981';

    let hx = 0, hy = 0;
    const hLen = radius * 1.95;
    if (skill === 0) {
        hy = hLen;  // 6:00 Down
    } else if (skill === 1) {
        hx = hLen;  // 3:00 Right
    } else if (skill === 2) {
        hy = -hLen; // 12:00 Up
    } else {
        hx = -hLen; // 9:00 Left
    }

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = Math.max(1.3, radius * 0.62);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + hx, cy + hy);
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1.08, 0.88);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

// Draw an entire stack of 1..playersPerGame paddles piled directly on top of each other
// with a ~1.5px-2.2px isometric step (up-and-right) per paddle to show stack height/depth
function drawIsometricPaddlePileCanvas(ctx, centerX, centerY, paddles, playersPerGame, colW, rowH) {
    const radius = Math.min(4.2, Math.max(1.9, Math.min(colW * 0.28, rowH * 0.22)));
    const stepX = Math.min(2.2, Math.max(0.9, (colW - radius * 2.4) / Math.max(1, playersPerGame)));
    const stepY = -Math.min(2.0, Math.max(1.0, (rowH - radius * 2.4) / Math.max(1, playersPerGame + 1)));

    const midOffset = (playersPerGame - 1) * 0.5;
    const baseX = centerX - midOffset * stepX;
    const baseY = centerY - midOffset * stepY;

    ctx.save();
    ctx.translate(baseX - 0.5, baseY + 1.4);
    ctx.scale(1.12, 0.88);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.18)';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    for (let slot = 0; slot < paddles.length; slot++) {
        const px = baseX + slot * stepX;
        const py = baseY + slot * stepY;
        drawMicroPaddleLayerCanvas(ctx, px, py, paddles[slot].skill, radius);
    }

    if (paddles.length < playersPerGame && colW >= 5) {
        ctx.save();
        ctx.setLineDash([1.5, 1.5]);
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.65)';
        ctx.lineWidth = 0.8;
        for (let slot = paddles.length; slot < playersPerGame; slot++) {
            const px = baseX + slot * stepX;
            const py = baseY + slot * stepY;
            ctx.save();
            ctx.translate(px, py);
            ctx.scale(1.08, 0.88);
            ctx.beginPath();
            ctx.arc(0, 0, radius * 0.92, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        ctx.restore();
    }
}

function createOrientedPaddleSvg(skill, size = 18) {
    const color = SKILL_COLORS[skill] || '#10b981';
    const rotMap = [180, 90, 0, -90];
    const deg = rotMap[skill] ?? 0;

    return `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" style="overflow:visible;vertical-align:middle;">
      <g transform="rotate(${deg} 12 12)">
        <rect x="10.2" y="1" width="3.6" height="8" rx="1.5" fill="#f8fafc" stroke="#0f172a" stroke-width="1.5"/>
        <rect x="5.5" y="7.5" width="13" height="14" rx="5.5" fill="${color}" stroke="#0f172a" stroke-width="1.5"/>
      </g>
    </svg>
  `;
}

function createIsometricStackPileSvg(paddles, playersPerGame) {
    const stepX = 3.2;
    const stepY = -2.8;
    const baseX = 16;
    const baseY = 25;
    const rotMap = [180, 90, 0, -90];

    let layers = `<ellipse cx="${baseX}" cy="${baseY + 4}" rx="9" ry="6.5" fill="rgba(0,0,0,0.35)"/>`;

    for (let slot = 0; slot < playersPerGame; slot++) {
        const cx = baseX + slot * stepX;
        const cy = baseY + slot * stepY;

        if (slot < paddles.length) {
            const sk = paddles[slot].skill;
            const color = SKILL_COLORS[sk] || '#10b981';
            const deg = rotMap[sk] ?? 0;
            layers += `
        <g transform="translate(${cx}, ${cy})">
          <g transform="rotate(${deg})">
            <rect x="-1.8" y="-13" width="3.6" height="7.5" rx="1.4" fill="#f8fafc" stroke="#0f172a" stroke-width="1.3"/>
          </g>
          <ellipse cx="0" cy="0" rx="7.5" ry="6" fill="${color}" stroke="#0f172a" stroke-width="1.4"/>
        </g>
      `;
        } else {
            layers += `
        <g transform="translate(${cx}, ${cy})">
          <ellipse cx="0" cy="0" rx="7" ry="5.5" fill="none" stroke="#64748b" stroke-width="1.2" stroke-dasharray="2,2"/>
        </g>
      `;
        }
    }

    return `<svg width="42" height="38" viewBox="0 0 42 38" style="overflow:visible;flex-shrink:0;">${layers}</svg>`;
}

function ensureStackLoupeElement() {
    if (stackLoupeEl) return stackLoupeEl;
    stackLoupeEl = document.createElement('div');
    stackLoupeEl.className = 'stack-loupe-popover';
    document.body.appendChild(stackLoupeEl);
    return stackLoupeEl;
}

function renderPaddleStackCanvasRow(containerWrap, trace) {
    const divider = document.createElement('div');
    divider.className = 'gantt-Stack-divider';
    containerWrap.appendChild(divider);

    const row = document.createElement('div');
    row.className = 'gantt-stack-row';

    const label = document.createElement('div');
    label.className = 'gantt-stack-label';
    label.innerHTML = `Stacks<span>Top = 1st Up</span>`;

    const track = document.createElement('div');
    track.className = 'gantt-stack-track';

    const canvas = document.createElement('canvas');
    canvas.className = 'gantt-stack-canvas';
    track.appendChild(canvas);

    row.appendChild(label);
    row.appendChild(track);
    containerWrap.appendChild(row);

    const legend = document.createElement('div');
    legend.className = 'stack-legend-bar';
    legend.innerHTML = `
    <span style="font-weight:700;color:#0f172a;">Stacked Handles:</span>
    <span class="stack-legend-item">${createOrientedPaddleSvg(0, 15)} Beg (6:00 &darr;)</span>
    <span class="stack-legend-item">${createOrientedPaddleSvg(1, 15)} Int (3:00 &rarr;)</span>
    <span class="stack-legend-item">${createOrientedPaddleSvg(2, 15)} Adv (12:00 &uarr;)</span>
    <span class="stack-legend-item">${createOrientedPaddleSvg(3, 15)} Exp (9:00 &larr;)</span>
    <span style="margin-left:auto;color:#64748b;">3D pile offset = stack depth (1–4 paddles) · Hover to inspect</span>
  `;
    containerWrap.appendChild(legend);

    requestAnimationFrame(() => {
        const rect = track.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const width = Math.max(300, rect.width);
        const height = Math.max(88, rect.height);

        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const maxVisibleStackRows = 4;
        const rowHeight = height / maxVisibleStackRows;
        const ppg = trace.playersPerGame;

        ctx.strokeStyle = 'rgba(203, 213, 225, 0.55)';
        ctx.lineWidth = 1;
        for (let r = 1; r < maxVisibleStackRows; r++) {
            const y = Math.floor(r * rowHeight) + 0.5;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        const snapshots = trace.stackSnapshots;
        for (let i = 0; i < snapshots.length; i++) {
            const snap = snapshots[i];
            const dur = snap.endTime - snap.time;
            if (dur <= 0.02 || snap.stacks.length === 0) continue;

            const x0 = (snap.time / trace.opMinutes) * width;
            const x1 = (snap.endTime / trace.opMinutes) * width;
            const colW = Math.max(1.8, x1 - x0);

            ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
            ctx.lineWidth = 0.75;
            ctx.beginPath();
            ctx.moveTo(x0, 0);
            ctx.lineTo(x0, height);
            ctx.stroke();

            const numStacksToDraw = Math.min(maxVisibleStackRows, snap.stacks.length);

            for (let sIdx = 0; sIdx < numStacksToDraw; sIdx++) {
                const stack = snap.stacks[sIdx];
                const yTop = sIdx * rowHeight;
                const cx = x0 + colW * 0.5;
                const cy = yTop + rowHeight * 0.55;

                drawIsometricPaddlePileCanvas(ctx, cx, cy, stack.paddles, ppg, colW, rowHeight);
            }
        }
    });

    const loupe = ensureStackLoupeElement();

    track.addEventListener('mousemove', (e) => {
        const rect = track.getBoundingClientRect();
        const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const hoverTime = relX * trace.opMinutes;

        let snap = trace.stackSnapshots[0];
        for (let i = 0; i < trace.stackSnapshots.length; i++) {
            if (trace.stackSnapshots[i].time <= hoverTime) {
                snap = trace.stackSnapshots[i];
            } else {
                break;
            }
        }

        if (!snap) return;

        const totalWaitingPaddles = snap.stacks.reduce((acc, st) => acc + st.paddles.length, 0);
        let html = `
      <div class="stack-loupe-header">
        <span>Stacks @ ${formatClockTime(hoverTime)}</span>
        <span style="color:#38bdf8;">${totalWaitingPaddles} Paddles (${snap.stacks.length} Stacks)</span>
      </div>
    `;

        if (snap.stacks.length === 0) {
            html += `<div style="color:#94a3b8;padding:4px 0;">No stacks waiting — all players are on court!</div>`;
        } else {
            const rankLabels = ['1st Up', '2nd Up', '3rd Up', '4th Up', '5th Up', '6th Up'];
            const shownStacks = snap.stacks.slice(0, 5);

            for (let sIdx = 0; sIdx < shownStacks.length; sIdx++) {
                const st = shownStacks[sIdx];
                const rankName = rankLabels[sIdx] || `#${sIdx + 1} Up`;
                const pileSvg = createIsometricStackPileSvg(st.paddles, trace.playersPerGame);

                const memberTags = st.paddles.map(p =>
                    `<span style="display:inline-flex;align-items:center;gap:2px;background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:4px;font-size:0.65rem;">
            ${createOrientedPaddleSvg(p.skill, 12)} P#${p.id}
          </span>`
                ).join(' ');

                html += `
          <div class="stack-loupe-row">
            <div class="stack-loupe-rank">${rankName}<br><span style="font-size:0.62rem;color:${st.isFull ? '#4ade80' : '#fbbf24'};">${st.paddles.length}/${trace.playersPerGame} Paddles</span></div>
            ${pileSvg}
            <div style="display:flex;flex-wrap:wrap;gap:3px;flex:1;">${memberTags}</div>
          </div>
        `;
            }

            if (snap.stacks.length > 5) {
                html += `<div style="color:#94a3b8;font-size:0.68rem;padding-top:4px;text-align:center;">+ ${snap.stacks.length - 5} more stacks below</div>`;
            }
        }

        loupe.innerHTML = html;
        loupe.style.display = 'block';

        const popW = loupe.offsetWidth || 280;
        const popH = loupe.offsetHeight || 190;
        const leftPos = Math.min(window.innerWidth - popW - 16, Math.max(12, e.clientX + 14));
        const topPos = Math.max(12, e.clientY - popH - 12);

        loupe.style.left = `${leftPos}px`;
        loupe.style.top = `${topPos}px`;
    });

    track.addEventListener('mouseleave', () => {
        loupe.style.display = 'none';
    });

    track.addEventListener('click', (e) => {
        const rect = track.getBoundingClientRect();
        const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const hoverTime = relX * trace.opMinutes;

        let snap = trace.stackSnapshots[0];
        for (let i = 0; i < trace.stackSnapshots.length; i++) {
            if (trace.stackSnapshots[i].time <= hoverTime) snap = trace.stackSnapshots[i];
            else break;
        }

        if (snap && snap.stacks.length > 0 && snap.stacks[0].paddles.length > 0) {
            inspectPlayer(snap.stacks[0].paddles[0].id);
        }
    });
}

// Convert a 1-based Global Day ID (e.g. #545) into (sIdx, xIdx, simIdx) and render the full Day Explorer
// Includes a standalone fallback if clicked before latestSimSnapshot is populated
function loadAndRenderDayById(requestedDayId, scrollIntoView = false) {
    let config = latestSimSnapshot && latestSimSnapshot.config;
    let taskMetaList = latestSimSnapshot && latestSimSnapshot.taskMetaList;

    if (!config && typeof readAndValidateConfig === 'function') {
        config = readAndValidateConfig();
    }
    if (!config) return;

    if (!taskMetaList || taskMetaList.length === 0) {
        // Build a fallback task list from current config so Day #545 always works immediately
        const ppg = config.playersPerGame === 'all' ? 4 : config.playersPerGame;
        const minP = ppg;
        const maxP = Math.max(minP + 2, config.maxDensity || 80);
        taskMetaList = [];
        for (let xIdx = 0; xIdx <= maxP - minP; xIdx++) {
            taskMetaList.push({
                sIdx: 0,
                xIdx,
                targetSimultaneousTotal: minP + xIdx,
                courts: config.fixedCourts || 8,
                playersPerGame: ppg
            });
        }
    }

    const simsPerTask = config.simsPerConfig || 100;
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
                    label: 'Waiting in Stacks',
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

    const parentCard = wrap.closest('.dd-chart-card');
    if (parentCard) parentCard.classList.add('gantt-card-expanded');

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

    renderPaddleStackCanvasRow(wrap, trace);
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
      <td><span class="skill-pill skill-${p.skill}">${SKILL_NAMES[p.skill]} (${SKILL_CLOCK_LABELS[p.skill]})</span></td>
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
    badge.innerHTML = `${createOrientedPaddleSvg(p.skill, 14)} ${SKILL_NAMES[p.skill]} (${SKILL_CLOCK_LABELS[p.skill]})`;

    document.getElementById('piTitle').textContent = `Player #${p.id} (Day #${currentDayTrace.dayId})`;
    document.getElementById('piSubtitle').textContent = `Stayed ${stayMins.toFixed(0)} mins (${formatClockTime(p.arrivalTime)} to ${formatClockTime(p.departureTime)}) · Played ${p.gamesPlayed} games`;

    document.getElementById('piRecord').textContent = `${p.wins}W – ${p.losses}L`;
    document.getElementById('piPlayShare').textContent = `${playSharePct}% (${p.totalPlayTime.toFixed(0)}m)`;
    document.getElementById('piAvgWait').textContent = `${waitPerGame.toFixed(1)}m / game`;

    document.getElementById('piArrLabel').textContent = `Arrived ${formatClockTime(p.arrivalTime)}`;
    document.getElementById('piDepLabel').textContent = `Departed ${formatClockTime(p.departureTime)}`;

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
            : `Waiting in Stacks (${formatClockTime(seg.start)} – ${formatClockTime(seg.end)}, ${(seg.end - seg.start).toFixed(1)}m)`;

        bar.appendChild(div);
    }

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
            return `<span class="player-chip" data-pid="${id}" title="${SKILL_NAMES[mate.skill]} (${SKILL_CLOCK_LABELS[mate.skill]})">${createOrientedPaddleSvg(mate.skill, 12)} P#${id}</span>`;
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
        const totalDays = (latestSimSnapshot && latestSimSnapshot.taskMetaList)
            ? latestSimSnapshot.taskMetaList.length * latestSimSnapshot.config.simsPerConfig
            : 7700;
        const randDay = Math.floor(Math.random() * totalDays) + 1;
        loadAndRenderDayById(randDay, false);
    });

    document.getElementById('ddSkillFilter').addEventListener('change', renderPlayersTable);
    document.getElementById('ddSearchInput').addEventListener('input', renderPlayersTable);

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

    window.addEventListener('resize', () => {
        if (currentDayTrace) {
            renderCourtGantt(currentDayTrace);
        }
    });

    // Render Day #545 immediately on initialization so the Explorer is never empty
    setTimeout(() => {
        if (!currentDayTrace) {
            const initDay = parseInt(document.getElementById('dayIdInput').value, 10) || 545;
            loadAndRenderDayById(initDay, false);
        }
    }, 50);
}
