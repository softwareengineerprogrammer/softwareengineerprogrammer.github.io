/* =====================================================================
   sim-worker.js
   Dedicated Web Worker: Zero-Allocation TypedArray Discrete-Event Engine
   ===================================================================== */

let maxP = 0;
let arrivalTime, departureTime, gamesPlayed, totalPlayTime, isPlaying;
let playerSkill, queueSkill, queuePos, queueEnterTime;

// 4 separate waiting queues (0: Beginner, 1: Intermediate, 2: Advanced, 3: Expert)
let waitQueues = [null, null, null, null];
let waitLens = new Int32Array(4);
let activeCounts = new Int32Array(4);
let activeOffsets = new Int32Array(4);
let activeByQueue = [null, null, null, null];

let maxE = 0;
let heapTime, heapSeq, heapType, heapPayload;
let heapSize = 0;

let maxG = 0;
let gameSlots;

function ensurePlayerCapacity(n) {
    if (n <= maxP) return;
    maxP = Math.max(n + 256, maxP * 2, 2048);
    arrivalTime    = new Float64Array(maxP);
    departureTime  = new Float64Array(maxP);
    gamesPlayed    = new Int32Array(maxP);
    totalPlayTime  = new Float64Array(maxP);
    isPlaying      = new Uint8Array(maxP);
    playerSkill    = new Uint8Array(maxP);
    queueSkill     = new Int8Array(maxP);
    queuePos       = new Int32Array(maxP);
    queueEnterTime = new Float64Array(maxP);

    for (let q = 0; q < 4; q++) {
        waitQueues[q]    = new Int32Array(maxP);
        activeByQueue[q] = new Int32Array(maxP);
    }
}

function ensureEventCapacity(n) {
    if (n <= maxE) return;
    maxE = Math.max(n + 512, maxE * 2, 8192);
    const newTime    = new Float64Array(maxE);
    const newSeq     = new Int32Array(maxE);
    const newType    = new Uint8Array(maxE);
    const newPayload = new Int32Array(maxE);
    if (heapTime) {
        newTime.set(heapTime);
        newSeq.set(heapSeq);
        newType.set(heapType);
        newPayload.set(heapPayload);
    }
    heapTime    = newTime;
    heapSeq     = newSeq;
    heapType    = newType;
    heapPayload = newPayload;
}

function ensureGameCapacity(totalSlotsNeeded) {
    if (totalSlotsNeeded <= maxG) return;
    maxG = Math.max(totalSlotsNeeded + 1024, maxG * 2, 8192);
    const next = new Int32Array(maxG);
    if (gameSlots) next.set(gameSlots);
    gameSlots = next;
}

function heapPush(time, seq, type, payload) {
    if (heapSize + 1 >= maxE) ensureEventCapacity(heapSize + 1);
    let i = heapSize++;
    while (i > 0) {
        const p = (i - 1) >> 1;
        const pt = heapTime[p];
        if (time < pt || (time === pt && seq < heapSeq[p])) {
            heapTime[i]    = pt;
            heapSeq[i]     = heapSeq[p];
            heapType[i]    = heapType[p];
            heapPayload[i] = heapPayload[p];
            i = p;
        } else {
            break;
        }
    }
    heapTime[i]    = time;
    heapSeq[i]     = seq;
    heapType[i]    = type;
    heapPayload[i] = payload;
}

let hasSpare = false;
let spare = 0.0;

function randGauss(mean, std) {
    if (hasSpare) {
        hasSpare = false;
        return mean + std * spare;
    }
    let u, v, s;
    do {
        u = Math.random() * 2.0 - 1.0;
        v = Math.random() * 2.0 - 1.0;
        s = u * u + v * v;
    } while (s >= 1.0 || s === 0.0);
    const mul = Math.sqrt(-2.0 * Math.log(s) / s);
    spare = v * mul;
    hasSpare = true;
    return mean + std * (u * mul);
}

function removeFromSkillQueueAt(q, qIdx) {
    const qArr = waitQueues[q];
    const pId = qArr[qIdx];
    queuePos[pId] = -1;
    queueSkill[pId] = -1;
    const newLen = --waitLens[q];
    for (let k = qIdx; k < newLen; k++) {
        const moved = qArr[k + 1];
        qArr[k] = moved;
        queuePos[moved] = k;
    }
}

function enqueuePlayer(pid, targetQ, currentTime) {
    const pos = waitLens[targetQ]++;
    waitQueues[targetQ][pos] = pid;
    queuePos[pid] = pos;
    queueSkill[pid] = targetQ;
    queueEnterTime[pid] = currentTime;
}

// Decide which stack a player joins (own skill tier vs +/- 1 adjacent tier)
function chooseTargetQueue(pid, currentTime, skillEnabled, playersPerGame, meanGame, baseMixProb, longWaitMixProb) {
    if (!skillEnabled) return 0;

    const ownS = playerSkill[pid];
    const ownLen = waitLens[ownS];

    let isLongWait = false;
    if (ownLen > 0) {
        const oldestWait = currentTime - queueEnterTime[waitQueues[ownS][0]];
        if (oldestWait >= meanGame || ownLen >= playersPerGame * 2) {
            isLongWait = true;
        }
    }

    const mixProb = isLongWait ? longWaitMixProb : baseMixProb;
    if (mixProb > 0 && Math.random() < mixProb) {
        const lowS  = ownS > 0 ? ownS - 1 : -1;
        const highS = ownS < 3 ? ownS + 1 : -1;

        if (lowS !== -1 && highS !== -1) {
            const lowRem  = waitLens[lowS] % playersPerGame;
            const highRem = waitLens[highS] % playersPerGame;
            if (lowRem > highRem) return lowS;
            if (highRem > lowRem) return highS;
            return Math.random() < 0.5 ? lowS : highS;
        } else if (lowS !== -1) {
            return lowS;
        } else if (highS !== -1) {
            return highS;
        }
    }

    return ownS;
}

// Event Types: 0 = arrival, 1 = game_finish, 2 = departure
function simulateDayFast(numCourts, numPlayers, config) {
    const {
        opMinutes,
        minStay,
        maxStay,
        meanGame,
        stdGame,
        playersPerGame,
        skillEnabled,
        cumProb0,
        cumProb1,
        cumProb2,
        baseMixProb,
        longWaitMixProb
    } = config;

    if (numPlayers <= 0) {
        return {
            meanGames: 0, meanTime: 0, meanWait: 0, meanWaitPerGame: 0,
            tierGames: [NaN, NaN, NaN, NaN],
            tierTime:  [NaN, NaN, NaN, NaN],
            tierWait:  [NaN, NaN, NaN, NaN],
            tierWPG:   [NaN, NaN, NaN, NaN]
        };
    }

    ensurePlayerCapacity(numPlayers);
    ensureEventCapacity(numPlayers * 3 + 64);

    heapSize = 0;
    let seq = 0;
    const staySpan = Math.max(1, maxStay - minStay);
    const numQueues = skillEnabled ? 4 : 1;

    for (let q = 0; q < 4; q++) waitLens[q] = 0;

    for (let i = 0; i < numPlayers; i++) {
        const arr = Math.random() * opMinutes;
        const dep = arr + minStay + Math.random() * staySpan;
        arrivalTime[i]    = arr;
        departureTime[i]  = dep;
        gamesPlayed[i]    = 0;
        totalPlayTime[i]  = 0.0;
        isPlaying[i]      = 0;
        queuePos[i]       = -1;
        queueSkill[i]     = -1;
        queueEnterTime[i] = arr;

        if (skillEnabled) {
            const r = Math.random();
            playerSkill[i] = r < cumProb0 ? 0 : (r < cumProb1 ? 1 : (r < cumProb2 ? 2 : 3));
        } else {
            playerSkill[i] = 0;
        }

        heapPush(arr, seq++, 0, i);
        heapPush(dep, seq++, 2, i);
    }

    let availableCourts = numCourts;
    let gameCount = 0;

    function startGameFromQueue(q, currentTime) {
        availableCourts--;
        const gIdx = gameCount++;
        const baseSlot = gIdx * playersPerGame;
        ensureGameCapacity(baseSlot + playersPerGame);

        let gTime = randGauss(meanGame, stdGame);
        if (gTime < 5.0) gTime = 5.0;
        const finishTime = currentTime + gTime;

        const qActive = activeByQueue[q];
        const off = activeOffsets[q];

        for (let m = 0; m < playersPerGame; m++) {
            const pid = qActive[off + m];
            gameSlots[baseSlot + m] = pid;
            isPlaying[pid] = 1;
            gamesPlayed[pid] += 1;
            totalPlayTime[pid] += gTime;

            const qIdx = queuePos[pid];
            if (qIdx !== -1) removeFromSkillQueueAt(q, qIdx);
        }

        activeOffsets[q] = off + playersPerGame;
        heapPush(finishTime, seq++, 1, baseSlot);
    }

    function tryStartGame(currentTime) {
        if (availableCourts <= 0) return;

        for (let q = 0; q < numQueues; q++) {
            let count = 0;
            const len = waitLens[q];
            const qArr = waitQueues[q];
            const actArr = activeByQueue[q];

            for (let idx = 0; idx < len; idx++) {
                const pid = qArr[idx];
                if ((departureTime[pid] - currentTime) >= meanGame) {
                    actArr[count++] = pid;
                }
            }
            activeCounts[q] = count;
            activeOffsets[q] = 0;
        }

        // 1. Primary pass: start games from any skill stack with >= playersPerGame (FIFO fairness across stacks)
        while (availableCourts > 0) {
            let bestQ = -1;
            let earliestEnter = Infinity;

            for (let q = 0; q < numQueues; q++) {
                if ((activeCounts[q] - activeOffsets[q]) >= playersPerGame) {
                    const headPid = activeByQueue[q][activeOffsets[q]];
                    const enterT = queueEnterTime[headPid];
                    if (enterT < earliestEnter) {
                        earliestEnter = enterT;
                        bestQ = q;
                    }
                }
            }

            if (bestQ === -1) break;
            startGameFromQueue(bestQ, currentTime);
        }

        // 2. Secondary pass (Skill-Stacking Long-Wait Relief)
        if (skillEnabled && availableCourts > 0 && longWaitMixProb > 0) {
            for (let q = 0; q < 4 && availableCourts > 0; q++) {
                const rem = activeCounts[q] - activeOffsets[q];
                const needed = playersPerGame - rem;
                if (rem > 0 && needed > 0 && needed <= 2) {
                    for (let adj = Math.max(0, q - 1); adj <= Math.min(3, q + 1); adj++) {
                        if (adj === q) continue;
                        const adjRem = activeCounts[adj] - activeOffsets[adj];
                        if (adjRem <= 0) continue;

                        const candidatePid = activeByQueue[adj][activeOffsets[adj]];
                        const waited = currentTime - queueEnterTime[candidatePid];
                        if (waited >= meanGame && Math.random() < longWaitMixProb) {
                            removeFromSkillQueueAt(adj, queuePos[candidatePid]);
                            enqueuePlayer(candidatePid, q, queueEnterTime[candidatePid]);
                            activeByQueue[q][activeCounts[q]++] = candidatePid;
                            activeOffsets[adj]++;
                            if ((activeCounts[q] - activeOffsets[q]) >= playersPerGame) {
                                startGameFromQueue(q, currentTime);
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    while (heapSize > 0) {
        const currentTime = heapTime[0];
        const eType       = heapType[0];
        const payload     = heapPayload[0];

        heapSize--;
        if (heapSize > 0) {
            const lastT = heapTime[heapSize];
            const lastS = heapSeq[heapSize];
            const lastY = heapType[heapSize];
            const lastP = heapPayload[heapSize];

            let i = 0;
            const half = heapSize >> 1;
            while (i < half) {
                let left = (i << 1) + 1;
                let right = left + 1;
                let best = left;

                if (right < heapSize) {
                    const rt = heapTime[right], lt = heapTime[left];
                    if (rt < lt || (rt === lt && heapSeq[right] < heapSeq[left])) {
                        best = right;
                    }
                }

                const bt = heapTime[best];
                if (bt < lastT || (bt === lastT && heapSeq[best] < lastS)) {
                    heapTime[i]    = bt;
                    heapSeq[i]     = heapSeq[best];
                    heapType[i]    = heapType[best];
                    heapPayload[i] = heapPayload[best];
                    i = best;
                } else {
                    break;
                }
            }
            heapTime[i]    = lastT;
            heapSeq[i]     = lastS;
            heapType[i]    = lastY;
            heapPayload[i] = lastP;
        }

        if (eType === 0) {
            const pid = payload;
            if (currentTime < departureTime[pid]) {
                const targetQ = chooseTargetQueue(pid, currentTime, skillEnabled, playersPerGame, meanGame, baseMixProb, longWaitMixProb);
                enqueuePlayer(pid, targetQ, currentTime);
                tryStartGame(currentTime);
            }
        } else if (eType === 1) {
            const baseSlot = payload;
            availableCourts++;
            for (let m = 0; m < playersPerGame; m++) {
                const pid = gameSlots[baseSlot + m];
                isPlaying[pid] = 0;
                if (currentTime < departureTime[pid]) {
                    const targetQ = chooseTargetQueue(pid, currentTime, skillEnabled, playersPerGame, meanGame, baseMixProb, longWaitMixProb);
                    enqueuePlayer(pid, targetQ, currentTime);
                }
            }
            tryStartGame(currentTime);
        } else {
            const pid = payload;
            if (isPlaying[pid] === 0) {
                const q = queueSkill[pid];
                const qIdx = queuePos[pid];
                if (q !== -1 && qIdx !== -1) {
                    removeFromSkillQueueAt(q, qIdx);
                }
            }
        }
    }

    let sumGames = 0, sumTime = 0.0, sumWait = 0.0, sumWaitPerGame = 0.0;
    const tCount = new Int32Array(4);
    const tGames = new Float64Array(4);
    const tTime  = new Float64Array(4);
    const tWait  = new Float64Array(4);
    const tWPG   = new Float64Array(4);

    for (let i = 0; i < numPlayers; i++) {
        const g = gamesPlayed[i];
        const playT = totalPlayTime[i];
        const stayT = departureTime[i] - arrivalTime[i];
        const waitT = Math.max(0.0, stayT - playT);
        const wpg   = waitT / (g + 1);

        sumGames += g;
        sumTime  += playT;
        sumWait  += waitT;
        sumWaitPerGame += wpg;

        const sk = playerSkill[i];
        tCount[sk]++;
        tGames[sk] += g;
        tTime[sk]  += playT;
        tWait[sk]  += waitT;
        tWPG[sk]   += wpg;
    }

    const tierGames = [NaN, NaN, NaN, NaN];
    const tierTime  = [NaN, NaN, NaN, NaN];
    const tierWait  = [NaN, NaN, NaN, NaN];
    const tierWPG   = [NaN, NaN, NaN, NaN];

    for (let sk = 0; sk < 4; sk++) {
        if (tCount[sk] > 0) {
            tierGames[sk] = tGames[sk] / tCount[sk];
            tierTime[sk]  = tTime[sk]  / tCount[sk];
            tierWait[sk]  = tWait[sk]  / tCount[sk];
            tierWPG[sk]   = tWPG[sk]   / tCount[sk];
        }
    }

    return {
        meanGames: sumGames / numPlayers,
        meanTime: sumTime / numPlayers,
        meanWait: sumWait / numPlayers,
        meanWaitPerGame: sumWaitPerGame / numPlayers,
        tierGames,
        tierTime,
        tierWait,
        tierWPG
    };
}

self.onmessage = function(e) {
    const {
        jobId,
        sIdx,
        xIdx,
        targetSimultaneousTotal,
        courts,
        simsPerConfig,
        opMinutes,
        minStay,
        maxStay,
        meanGame,
        stdGame,
        playersPerGame,
        skillMode,
        cumProb0,
        cumProb1,
        cumProb2,
        baseMixProb,
        longWaitMixProb
    } = e.data;

    const skillEnabled = (skillMode !== 'off');
    const isBreakdown = (skillMode === 'breakdown');

    const meanStay = (minStay + maxStay) * 0.5;
    const dailyMean = targetSimultaneousTotal * (opMinutes / meanStay);
    const dailyStd = dailyMean * 0.1;

    const simConfig = {
        opMinutes,
        minStay,
        maxStay,
        meanGame,
        stdGame,
        playersPerGame,
        skillEnabled,
        cumProb0,
        cumProb1,
        cumProb2,
        baseMixProb,
        longWaitMixProb
    };

    if (!isBreakdown) {
        const cGames       = new Float64Array(simsPerConfig);
        const cTime        = new Float64Array(simsPerConfig);
        const cWait        = new Float64Array(simsPerConfig);
        const cWaitPerGame = new Float64Array(simsPerConfig);

        for (let s = 0; s < simsPerConfig; s++) {
            const dailyPlayers = Math.max(playersPerGame, Math.trunc(randGauss(dailyMean, dailyStd)));
            const res = simulateDayFast(courts, dailyPlayers, simConfig);
            cGames[s]       = res.meanGames;
            cTime[s]        = res.meanTime;
            cWait[s]        = res.meanWait;
            cWaitPerGame[s] = res.meanWaitPerGame;
        }

        self.postMessage(
            {
                jobId,
                isBreakdown: false,
                sIdx,
                xIdx,
                cGamesBuffer: cGames.buffer,
                cTimeBuffer: cTime.buffer,
                cWaitBuffer: cWait.buffer,
                cWaitPerGameBuffer: cWaitPerGame.buffer
            },
            [cGames.buffer, cTime.buffer, cWait.buffer, cWaitPerGame.buffer]
        );
    } else {
        const cGames       = new Float64Array(4 * simsPerConfig);
        const cTime        = new Float64Array(4 * simsPerConfig);
        const cWait        = new Float64Array(4 * simsPerConfig);
        const cWaitPerGame = new Float64Array(4 * simsPerConfig);

        for (let s = 0; s < simsPerConfig; s++) {
            const dailyPlayers = Math.max(playersPerGame, Math.trunc(randGauss(dailyMean, dailyStd)));
            const res = simulateDayFast(courts, dailyPlayers, simConfig);
            for (let sk = 0; sk < 4; sk++) {
                const idx = sk * simsPerConfig + s;
                cGames[idx]       = res.tierGames[sk];
                cTime[idx]        = res.tierTime[sk];
                cWait[idx]        = res.tierWait[sk];
                cWaitPerGame[idx] = res.tierWPG[sk];
            }
        }

        self.postMessage(
            {
                jobId,
                isBreakdown: true,
                sIdx,
                xIdx,
                cGamesBuffer: cGames.buffer,
                cTimeBuffer: cTime.buffer,
                cWaitBuffer: cWait.buffer,
                cWaitPerGameBuffer: cWaitPerGame.buffer
            },
            [cGames.buffer, cTime.buffer, cWait.buffer, cWaitPerGame.buffer]
        );
    }
};
