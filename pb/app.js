/* =====================================================================
   WORKER SOURCE STRING (Zero-Allocation TypedArray Engine + Skill Stacks)
   ===================================================================== */
const WORKER_SOURCE = `
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

    // Check if own skill queue is experiencing an unusually long wait
    // (either stalled with < playersPerGame waiting > meanGame, or backed up >= 2 full games deep)
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
        // Prefer the adjacent queue that is closest to forming a game (1..playersPerGame-1 waiting)
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

      // 1. Primary pass: start games from any skill stack with >= playersPerGame
      // Prioritize whichever ready stack's head player has been waiting the longest (FIFO court fairness)
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

      // 2. Secondary pass (Skill-Stacking Long-Wait Relief):
      // If courts are still idle and a stack is 1-2 players short, check if adjacent (+/-1) stacks have
      // players who have already waited >= meanGame and are willing to slide over at longWaitMixProb
      if (skillEnabled && availableCourts > 0 && longWaitMixProb > 0) {
        for (let q = 0; q < 4 && availableCourts > 0; q++) {
          const rem = activeCounts[q] - activeOffsets[q];
          const needed = playersPerGame - rem;
          if (rem > 0 && needed > 0 && needed <= 2) {
            // Check adjacent queues q-1 and q+1 for long-waiting players
            for (let adj = Math.max(0, q - 1); adj <= Math.min(3, q + 1); adj++) {
              if (adj === q) continue;
              const adjRem = activeCounts[adj] - activeOffsets[adj];
              if (adjRem <= 0) continue;

              const candidatePid = activeByQueue[adj][activeOffsets[adj]];
              const waited = currentTime - queueEnterTime[candidatePid];
              if (waited >= meanGame && Math.random() < longWaitMixProb) {
                // Move candidatePid from adj queue into q queue
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
      // Breakdown mode: return 4*simsPerConfig buffers for Beginner(0), Intermediate(1), Advanced(2), Expert(3)
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
`;

/* =====================================================================
   MAIN THREAD UI, MASCOT & CHART CONTROLLER
   ===================================================================== */
const detectedCores = navigator.hardwareConcurrency || 4;
const defaultThreads = Math.min(12, Math.max(2, detectedCores));

const uiState = {
    simMode: 'fixed_courts',
    skillMode: 'off',       // 'off' | 'overall' | 'breakdown'
    playersPerGame: '4',
    stdDisplay: 'whiskers'
};

let workerPool = [];
let workerBlobUrl = null;
let currentJobId = 0;
let isRunning = false;
let charts = {};
let latestSimSnapshot = null;

// --- Reset Mascot & Selected KPI Card to Default Neutral State ---
function setMascotNeutral() {
    const card = document.getElementById('mascotCard');
    const badge = document.getElementById('mascotBadge');
    const headline = document.getElementById('mascotHeadline');
    const sub = document.getElementById('mascotSub');
    const mouth = document.getElementById('mascotMouth');
    const browL = document.getElementById('browLeft');
    const browR = document.getElementById('browRight');
    const cheekL = document.getElementById('cheekLeft');
    const cheekR = document.getElementById('cheekRight');

    card.classList.remove('mood-ecstatic', 'mood-happy', 'mood-impatient', 'mood-sad', 'mood-crying');
    card.classList.add('mood-neutral');
    card.style.borderColor = '#e2e8f0';
    card.style.backgroundColor = '#ffffff';

    badge.style.background = '#f1f5f9';
    badge.style.color = '#475569';
    badge.textContent = 'Player Reaction';
    headline.textContent = 'Inspect a Datapoint';
    sub.textContent = 'Hover or tap any point on the charts to see the wait time and player mood.';

    mouth.setAttribute('d', 'M 41 62 Q 48 64 55 62');
    browL.setAttribute('d', 'M 33 45 Q 38 44 42 45');
    browR.setAttribute('d', 'M 54 45 Q 58 44 63 45');
    cheekL.setAttribute('opacity', '0.4');
    cheekR.setAttribute('opacity', '0.4');

    document.getElementById('kpiSelectedTitle').textContent = 'Selected Point Wait';
    document.getElementById('kpiSelectedValue').textContent = 'Select a point';
    document.getElementById('kpiSelectedSub').textContent = 'Hover any chart curve to inspect';
}

// --- Animated SVG Mascot Mood Controller (Triggered on Datapoint Hover/Click) ---
function setMascotMood(waitMins, gamesPlayed, contextLabel) {
    const card = document.getElementById('mascotCard');
    const badge = document.getElementById('mascotBadge');
    const headline = document.getElementById('mascotHeadline');
    const sub = document.getElementById('mascotSub');
    const mouth = document.getElementById('mascotMouth');
    const browL = document.getElementById('browLeft');
    const browR = document.getElementById('browRight');
    const cheekL = document.getElementById('cheekLeft');
    const cheekR = document.getElementById('cheekRight');

    card.classList.remove('mood-neutral', 'mood-ecstatic', 'mood-happy', 'mood-impatient', 'mood-sad', 'mood-crying');

    document.getElementById('kpiSelectedTitle').textContent = contextLabel || 'Selected Point';
    document.getElementById('kpiSelectedValue').textContent = `${waitMins.toFixed(1)}m wait / game`;
    document.getElementById('kpiSelectedSub').textContent = `${gamesPlayed.toFixed(1)} avg games played per visit`;

    if (gamesPlayed <= 1.25 || waitMins >= 35) {
        card.classList.add('mood-crying');
        card.style.borderColor = '#fca5a5';
        card.style.backgroundColor = '#fff1f2';
        badge.style.background = '#fee2e2';
        badge.style.color = '#b91c1c';
        badge.textContent = `${contextLabel} · Heartbroken`;
        headline.textContent = gamesPlayed <= 1.25
            ? `Only ${gamesPlayed.toFixed(1)} Game Played!`
            : `${waitMins.toFixed(0)}m Wait Per Game!`;
        sub.textContent = `Waiting ${waitMins.toFixed(1)}m per game (${gamesPlayed.toFixed(1)} games total). Need more players or courts!`;

        mouth.setAttribute('d', 'M 39 67 Q 48 56 57 67');
        browL.setAttribute('d', 'M 32 47 Q 37 44 42 42');
        browR.setAttribute('d', 'M 54 42 Q 59 44 64 47');
        cheekL.setAttribute('opacity', '0.15');
        cheekR.setAttribute('opacity', '0.15');
    } else if (waitMins >= 20 || gamesPlayed < 2.5) {
        card.classList.add('mood-sad');
        card.style.borderColor = '#fdba74';
        card.style.backgroundColor = '#fff7ed';
        badge.style.background = '#ffedd5';
        badge.style.color = '#c2410c';
        badge.textContent = `${contextLabel} · Bummed Out`;
        headline.textContent = `Long ${waitMins.toFixed(1)}m Queue Wait`;
        sub.textContent = `Players average ${gamesPlayed.toFixed(1)} games and spend a lot of time staring at the paddle rack.`;

        mouth.setAttribute('d', 'M 40 65 Q 48 59 56 65');
        browL.setAttribute('d', 'M 33 46 Q 38 44 42 43');
        browR.setAttribute('d', 'M 54 43 Q 58 44 63 46');
        cheekL.setAttribute('opacity', '0.25');
        cheekR.setAttribute('opacity', '0.25');
    } else if (waitMins >= 11) {
        card.classList.add('mood-impatient');
        card.style.borderColor = '#fde047';
        card.style.backgroundColor = '#fefce8';
        badge.style.background = '#fef9c3';
        badge.style.color = '#a16207';
        badge.textContent = `${contextLabel} · Restless`;
        headline.textContent = `${waitMins.toFixed(1)}m Wait Between Games`;
        sub.textContent = `Playable (${gamesPlayed.toFixed(1)} games/visit), but the paddle queue is backing up.`;

        mouth.setAttribute('d', 'M 40 63 L 56 62');
        browL.setAttribute('d', 'M 33 43 L 42 46');
        browR.setAttribute('d', 'M 54 46 L 63 43');
        cheekL.setAttribute('opacity', '0.35');
        cheekR.setAttribute('opacity', '0.35');
    } else if (waitMins >= 5.5) {
        card.classList.add('mood-happy');
        card.style.borderColor = '#bbf7d0';
        card.style.backgroundColor = '#ffffff';
        badge.style.background = '#dcfce7';
        badge.style.color = '#15803d';
        badge.textContent = `${contextLabel} · Happy Rotation`;
        headline.textContent = `Smooth ${waitMins.toFixed(1)}m Breather`;
        sub.textContent = `Great flow! ${gamesPlayed.toFixed(1)} games per visit with just enough time for water.`;

        mouth.setAttribute('d', 'M 39 61 Q 48 68 57 61');
        browL.setAttribute('d', 'M 33 45 Q 38 42 42 45');
        browR.setAttribute('d', 'M 54 45 Q 58 42 63 45');
        cheekL.setAttribute('opacity', '0.6');
        cheekR.setAttribute('opacity', '0.6');
    } else {
        card.classList.add('mood-ecstatic');
        card.style.borderColor = '#86efac';
        card.style.backgroundColor = '#f0fdf4';
        badge.style.background = '#dcfce7';
        badge.style.color = '#15803d';
        badge.textContent = `${contextLabel} · Court Heaven!`;
        headline.textContent = `Instant Play (${waitMins.toFixed(1)}m Wait)!`;
        sub.textContent = `Non-stop action — ${gamesPlayed.toFixed(1)} games per session with open courts ready!`;

        mouth.setAttribute('d', 'M 37 60 Q 48 72 59 60');
        browL.setAttribute('d', 'M 33 44 Q 38 40 42 44');
        browR.setAttribute('d', 'M 54 44 Q 58 40 63 44');
        cheekL.setAttribute('opacity', '0.8');
        cheekR.setAttribute('opacity', '0.8');
    }
}

// Subtle Vertical +/- 1 Std Dev Whisker Plugin
const whiskerPlugin = {
    id: 'whiskerErrorBars',
    afterDatasetsDraw(chart, args, pluginOptions) {
        if (!pluginOptions || !pluginOptions.enabled) return;

        const { ctx, chartArea, scales: { y } } = chart;
        if (!y || !chartArea) return;

        ctx.save();
        ctx.beginPath();
        ctx.rect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top);
        ctx.clip();

        const datasets = chart.data.datasets;
        const capHalfWidth = 3;

        for (let dIdx = 0; dIdx < datasets.length; dIdx++) {
            if (!chart.isDatasetVisible(dIdx)) continue;
            const ds = datasets[dIdx];
            if (!ds.stdValues || ds.stdValues.length === 0) continue;

            const meta = chart.getDatasetMeta(dIdx);
            const totalPts = meta.data.length;
            const stride = totalPts > 60 ? 3 : (totalPts > 30 ? 2 : 1);

            ctx.strokeStyle = ds.borderColor || '#334155';
            ctx.lineWidth = 1.15;
            ctx.globalAlpha = 0.45;

            for (let i = 0; i < totalPts; i += stride) {
                const pt = meta.data[i];
                if (!pt || pt.skip) continue;

                const meanVal = ds.data[i];
                const stdVal = ds.stdValues[i];
                if (meanVal == null || stdVal == null || stdVal <= 0) continue;

                const xPos = pt.x;
                const yTop = y.getPixelForValue(meanVal + stdVal);
                const yBot = y.getPixelForValue(Math.max(0, meanVal - stdVal));

                ctx.beginPath();
                ctx.moveTo(xPos, yTop);
                ctx.lineTo(xPos, yBot);
                ctx.moveTo(xPos - capHalfWidth, yTop);
                ctx.lineTo(xPos + capHalfWidth, yTop);
                ctx.moveTo(xPos - capHalfWidth, yBot);
                ctx.lineTo(xPos + capHalfWidth, yBot);
                ctx.stroke();
            }
        }
        ctx.restore();
    }
};

Chart.register(whiskerPlugin);

const PPG_SERIES_META = {
    2: { label: '2 Players/Game (Singles)',  color: '#0ea5e9', pointStyle: 'circle', minPlayers: 2 },
    3: { label: '3 Players/Game (Canadian)', color: '#f59e0b', pointStyle: 'triangle', minPlayers: 3 },
    4: { label: '4 Players/Game (Doubles)',  color: '#10b981', pointStyle: 'rectRounded', minPlayers: 4 }
};

function buildSkillTierMeta(config) {
    return [
        { label: `Beginner (${config.pctBeginner}%)`,         color: '#f59e0b', pointStyle: 'circle' },
        { label: `Intermediate (${config.pctIntermediate}%)`, color: '#0ea5e9', pointStyle: 'triangle' },
        { label: `Advanced (${config.pctAdvanced}%)`,         color: '#10b981', pointStyle: 'rectRounded' },
        { label: `Expert (${config.pctExpert}%)`,             color: '#8b5cf6', pointStyle: 'rectRot' }
    ];
}

function buildDensityGroups(maxDensity) {
    const base = [
        { label: '1–3 players/court',  low: 1,  high: 3,  color: '#2563eb', pointStyle: 'circle' },
        { label: '4–7 players/court',  low: 4,  high: 7,  color: '#10b981', pointStyle: 'rectRounded' },
        { label: '8–10 players/court', low: 8,  high: 10, color: '#f59e0b', pointStyle: 'triangle' },
        { label: `11–${Math.max(14, maxDensity)} players/court`, low: 11, high: Math.max(14, maxDensity), color: '#ef4444', pointStyle: 'rectRot' }
    ];
    return base.filter(g => g.low <= maxDensity);
}

function computeMeanAndStd(arrays) {
    let count = 0;
    let sum = 0;
    for (let a = 0; a < arrays.length; a++) {
        const arr = arrays[a];
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
            const v = arr[i];
            if (!Number.isNaN(v)) {
                sum += v;
                count++;
            }
        }
    }
    if (count === 0) return { mean: null, std: null };
    const mean = sum / count;

    let sumSq = 0;
    for (let a = 0; a < arrays.length; a++) {
        const arr = arrays[a];
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
            const v = arr[i];
            if (!Number.isNaN(v)) {
                const diff = v - mean;
                sumSq += diff * diff;
            }
        }
    }
    return { mean, std: Math.sqrt(sumSq / count) };
}

function createChart(canvasId, yLabel, isStdChart = false) {
    const canvasEl = document.getElementById(canvasId);
    const ctx = canvasEl.getContext('2d');

    canvasEl.addEventListener('mouseleave', () => {
        setMascotNeutral();
    });

    return new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 180 },
            interaction: { mode: 'index', intersect: false },
            onHover: (event, activeElements, chart) => {
                if (!activeElements || activeElements.length === 0 || !latestSimSnapshot) return;
                const dataIndex = activeElements[0].index;
                const dsIndex = activeElements[0].datasetIndex;
                const s = latestSimSnapshot.seriesList[dsIndex] || latestSimSnapshot.seriesList[latestSimSnapshot.seriesList.length - 1];
                if (!s) return;

                const wVal = s.avgWPG[dataIndex];
                const gVal = s.avgGames[dataIndex];
                const xVal = chart.data.labels[dataIndex];
                if (wVal != null && gVal != null) {
                    const unit = latestSimSnapshot.config.simMode === 'fixed_courts' ? `${xVal} Players` : `${xVal} Courts`;
                    const tierPrefix = latestSimSnapshot.config.skillMode === 'breakdown'
                        ? `${s.meta.label.split(' ')[0]} @ `
                        : 'At ';
                    setMascotMood(wVal, gVal, `${tierPrefix}${unit}`);
                }
            },
            plugins: {
                whiskerErrorBars: { enabled: !isStdChart },
                title: { display: false },
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        boxWidth: 12,
                        boxHeight: 12,
                        usePointStyle: true,
                        font: { family: "'Inter', sans-serif", size: 11, weight: '600' },
                        color: '#475569'
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.92)',
                    titleFont: { family: "'Inter', sans-serif", size: 12, weight: '700' },
                    bodyFont: { family: "'Inter', sans-serif", size: 12 },
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: (context) => {
                            const val = context.parsed.y;
                            if (val == null) return null;
                            if (!isStdChart && context.dataset.stdValues) {
                                const s = context.dataset.stdValues[context.dataIndex] ?? 0;
                                return ` ${context.dataset.label}: ${val.toFixed(2)} (±${s.toFixed(2)})`;
                            }
                            return ` ${context.dataset.label}: ${val.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: '#f1f5f9' },
                    ticks: { font: { family: "'Inter', sans-serif", size: 11 }, color: '#64748b' },
                    title: {
                        display: true,
                        text: 'Simultaneous Players',
                        font: { family: "'Inter', sans-serif", size: 11, weight: '600' },
                        color: '#475569'
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: '#f1f5f9' },
                    ticks: { font: { family: "'Inter', sans-serif", size: 11 }, color: '#64748b' },
                    title: {
                        display: true,
                        text: yLabel,
                        font: { family: "'Inter', sans-serif", size: 11, weight: '600' },
                        color: '#475569'
                    }
                }
            }
        }
    });
}

function initCharts() {
    charts.waitPerGame = createChart('chartWaitPerGame', 'Minutes Waiting / Game', false);
    charts.games       = createChart('chartGames', 'Games Played', false);
    charts.playTime    = createChart('chartPlayTime', 'Minutes Playing', false);
    charts.totalWait   = createChart('chartTotalWait', 'Total Minutes Waiting', false);

    charts.stdWaitPerGame = createChart('chartStdWaitPerGame', 'Std Dev (Minutes)', true);
    charts.stdGames       = createChart('chartStdGames', 'Std Dev (Games)', true);
    charts.stdPlayTime    = createChart('chartStdPlayTime', 'Std Dev (Minutes)', true);
    charts.stdTotalWait   = createChart('chartStdTotalWait', 'Std Dev (Minutes)', true);
}

function applyStdDisplayPreference() {
    const stdSection = document.getElementById('stdSection');
    const showWhiskers = (uiState.stdDisplay === 'whiskers');

    stdSection.style.display = (uiState.stdDisplay === 'separate') ? 'block' : 'none';

    for (const key of ['waitPerGame', 'games', 'playTime', 'totalWait']) {
        if (charts[key]) {
            charts[key].options.plugins.whiskerErrorBars.enabled = showWhiskers;
            charts[key].update('none');
        }
    }

    if (uiState.stdDisplay === 'separate') {
        for (const key of ['stdWaitPerGame', 'stdGames', 'stdPlayTime', 'stdTotalWait']) {
            if (charts[key]) {
                charts[key].resize();
                charts[key].update('none');
            }
        }
    }
}

function syncModeUI() {
    const fixedBlock = document.getElementById('fixedCourtsBlock');
    const maxCourtsBlock = document.getElementById('maxCourtsBlock');
    const maxDensityTitle = document.getElementById('maxDensityTitle');
    const maxDensityInput = document.getElementById('maxDensity');
    const maxDensityRange = document.getElementById('maxDensityRange');
    const maxDensityBadge = document.getElementById('maxDensityBadge');
    const ppgAllBtn = document.getElementById('ppgAllBtn');

    if (uiState.simMode === 'fixed_courts') {
        fixedBlock.classList.remove('hidden');
        maxCourtsBlock.classList.add('hidden');
        maxDensityTitle.textContent = 'Max Players';
        maxDensityRange.min = 8;
        maxDensityRange.max = 160;
        if (parseInt(maxDensityInput.value, 10) <= 24) {
            maxDensityInput.value = 80;
            maxDensityRange.value = 80;
        }
        maxDensityBadge.textContent = `${maxDensityInput.value} Players`;
    } else {
        fixedBlock.classList.add('hidden');
        maxCourtsBlock.classList.remove('hidden');
        maxDensityTitle.textContent = 'Max Players / Court';
        maxDensityRange.min = 4;
        maxDensityRange.max = 24;
        if (parseInt(maxDensityInput.value, 10) > 24) {
            maxDensityInput.value = 14;
            maxDensityRange.value = 14;
        }
        maxDensityBadge.textContent = `${maxDensityInput.value} / Court`;
    }

    // When plotting 4 separate Skill Tier curves, disable "Compare All (2,3,4)" so charts don't show 12 overlapping lines
    if (uiState.skillMode === 'breakdown') {
        ppgAllBtn.disabled = true;
        if (uiState.playersPerGame === 'all') {
            uiState.playersPerGame = '4';
            const ppgBtns = document.querySelectorAll('#ppgSegmented button');
            ppgBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-val') === '4'));
        }
    } else {
        ppgAllBtn.disabled = false;
    }
}

function ensureWorkerPool(targetSize) {
    if (!workerBlobUrl) {
        const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
        workerBlobUrl = URL.createObjectURL(blob);
    }
    while (workerPool.length > targetSize) {
        workerPool.pop().terminate();
    }
    while (workerPool.length < targetSize) {
        workerPool.push(new Worker(workerBlobUrl));
    }
}

function stopSimulation() {
    if (!isRunning) return;
    currentJobId++;
    for (const w of workerPool) w.terminate();
    workerPool = [];
    isRunning = false;
    document.getElementById('runBtn').disabled = false;
    document.getElementById('cancelBtn').style.display = 'none';
    document.getElementById('statusText').textContent = 'Simulation stopped.';
}

function makeDataset(meta, dataArr, stdArr, isDashed = false, xCount = 25) {
    const ptRadius = xCount > 45 ? 1.8 : 3.2;
    return {
        label: meta.label,
        data: dataArr.map(v => (v == null || Number.isNaN(v) ? null : Number(v.toFixed(2)))),
        stdValues: stdArr ? stdArr.map(s => (s == null || Number.isNaN(s) ? null : Number(s.toFixed(2)))) : undefined,
        borderColor: meta.color,
        backgroundColor: meta.color,
        pointStyle: meta.pointStyle,
        pointRadius: ptRadius,
        pointHoverRadius: 5,
        borderWidth: 2.2,
        borderDash: isDashed ? [5, 4] : undefined,
        tension: 0.18,
        spanGaps: true,
        fill: false
    };
}

function updateKPICardsAndMascot(config, xLabels, seriesList) {
    const primaryPPG = config.playersPerGame === 'all' ? 4 : config.playersPerGame;

    if (config.simMode === 'fixed_courts') {
        const fullCapPlayers = config.fixedCourts * primaryPPG;
        document.getElementById('kpiCapacity').textContent = `${fullCapPlayers} Players`;
        document.getElementById('kpiCapacitySub').textContent = `${config.fixedCourts} courts × ${primaryPPG} players/game`;
    } else {
        document.getElementById('kpiCapacity').textContent = `1–${config.maxCourts} Courts`;
        document.getElementById('kpiCapacitySub').textContent = `Up to ${config.maxDensity} players/court tested`;
    }

    // Update 3rd KPI Card with Stacking Mode info
    const thirdTitle = document.getElementById('kpiThirdTitle');
    const thirdVal = document.getElementById('kpiThirdValue');
    const thirdSub = document.getElementById('kpiThirdSub');

    if (config.skillMode === 'off') {
        thirdTitle.textContent = 'Stacking Mode';
        thirdVal.textContent = 'Open Mix';
        thirdSub.textContent = 'All players stack together regardless of skill';
    } else {
        thirdTitle.textContent = 'Skill Stacking (4 Tiers)';
        thirdVal.textContent = `${config.pctBeginner}/${config.pctIntermediate}/${config.pctAdvanced}/${config.pctExpert}%`;
        thirdSub.textContent = `±1 level mix: ${config.baseMixPct}% base, ${config.longWaitMixPct}% long wait`;
    }

    latestSimSnapshot = { config, xLabels, seriesList };
    setMascotNeutral();
}

function renderAllCharts(xLabels, xAxisTitle, config, seriesList) {
    const showWhiskers = (uiState.stdDisplay === 'whiskers');

    const waitPerGameDS = [], gamesDS = [], playTimeDS = [], totalWaitDS = [];
    const stdWaitPerGameDS = [], stdGamesDS = [], stdPlayTimeDS = [], stdTotalWaitDS = [];

    for (const s of seriesList) {
        waitPerGameDS.push(makeDataset(s.meta, s.avgWPG, s.stdWPG, false, xLabels.length));
        gamesDS.push(makeDataset(s.meta, s.avgGames, s.stdGames, false, xLabels.length));
        playTimeDS.push(makeDataset(s.meta, s.avgTime, s.stdTime, false, xLabels.length));
        totalWaitDS.push(makeDataset(s.meta, s.avgWait, s.stdWait, false, xLabels.length));

        stdWaitPerGameDS.push(makeDataset(s.meta, s.stdWPG, null, true, xLabels.length));
        stdGamesDS.push(makeDataset(s.meta, s.stdGames, null, true, xLabels.length));
        stdPlayTimeDS.push(makeDataset(s.meta, s.stdTime, null, true, xLabels.length));
        stdTotalWaitDS.push(makeDataset(s.meta, s.stdWait, null, true, xLabels.length));
    }

    const pairs = [
        { chart: charts.waitPerGame,    ds: waitPerGameDS,    isStd: false },
        { chart: charts.games,          ds: gamesDS,          isStd: false },
        { chart: charts.playTime,       ds: playTimeDS,       isStd: false },
        { chart: charts.totalWait,      ds: totalWaitDS,      isStd: false },
        { chart: charts.stdWaitPerGame, ds: stdWaitPerGameDS, isStd: true },
        { chart: charts.stdGames,       ds: stdGamesDS,       isStd: true },
        { chart: charts.stdPlayTime,    ds: stdPlayTimeDS,    isStd: true },
        { chart: charts.stdTotalWait,   ds: stdTotalWaitDS,   isStd: true }
    ];

    for (const item of pairs) {
        item.chart.options.scales.x.title.text = xAxisTitle;
        if (!item.isStd) {
            item.chart.options.plugins.whiskerErrorBars.enabled = showWhiskers;
        }
        item.chart.data = { labels: xLabels, datasets: item.ds };
        item.chart.update();
    }

    updateKPICardsAndMascot(config, xLabels, seriesList);
    applyStdDisplayPreference();
}

function readAndValidateConfig() {
    const meanGame = Math.max(5, parseFloat(document.getElementById('meanGame').value) || 15);
    let minStay = Math.max(10, parseFloat(document.getElementById('minStay').value) || 30);
    let maxStay = Math.max(20, parseFloat(document.getElementById('maxStay').value) || 240);

    if (minStay < meanGame + 5) {
        minStay = meanGame + 15;
        document.getElementById('minStay').value = minStay;
    }
    if (maxStay <= minStay) {
        maxStay = minStay + 120;
        document.getElementById('maxStay').value = maxStay;
    }

    // Skill distribution normalization
    let pBeg = Math.max(0, parseFloat(document.getElementById('pctBeginner').value) ?? 5);
    let pInt = Math.max(0, parseFloat(document.getElementById('pctIntermediate').value) ?? 25);
    let pAdv = Math.max(0, parseFloat(document.getElementById('pctAdvanced').value) ?? 50);
    let pExp = Math.max(0, parseFloat(document.getElementById('pctExpert').value) ?? 20);
    let totalPct = pBeg + pInt + pAdv + pExp;
    if (totalPct <= 0) {
        pBeg = 5; pInt = 25; pAdv = 50; pExp = 20;
        totalPct = 100;
    }

    const cumProb0 = pBeg / totalPct;
    const cumProb1 = (pBeg + pInt) / totalPct;
    const cumProb2 = (pBeg + pInt + pAdv) / totalPct;

    const baseMixPct = Math.min(100, Math.max(0, parseFloat(document.getElementById('baseMixPct').value) ?? 5));
    const longWaitMixPct = Math.min(100, Math.max(0, parseFloat(document.getElementById('longWaitMixPct').value) ?? 10));

    return {
        simMode: uiState.simMode,
        skillMode: uiState.skillMode,
        fixedCourts: Math.max(1, parseInt(document.getElementById('fixedCourts').value, 10) || 8),
        maxCourts: Math.max(2, parseInt(document.getElementById('maxCourts').value, 10) || 26),
        maxDensity: Math.max(4, parseInt(document.getElementById('maxDensity').value, 10) || (uiState.simMode === 'fixed_courts' ? 80 : 14)),
        simsPerConfig: Math.max(5, parseInt(document.getElementById('simsPerConfig').value, 10) || 100),
        opMinutes: Math.max(60, parseFloat(document.getElementById('opMinutes').value) || 720),
        minStay,
        maxStay,
        meanGame,
        stdGame: Math.max(0, parseFloat(document.getElementById('stdGame').value) || 5),
        playersPerGame: uiState.playersPerGame === 'all' ? 'all' : Math.min(4, Math.max(2, parseInt(uiState.playersPerGame, 10) || 4)),
        workerCount: Math.min(32, Math.max(1, parseInt(document.getElementById('workerCount').value, 10) || defaultThreads)),
        pctBeginner: Math.round((pBeg / totalPct) * 100),
        pctIntermediate: Math.round((pInt / totalPct) * 100),
        pctAdvanced: Math.round((pAdv / totalPct) * 100),
        pctExpert: Math.round((pExp / totalPct) * 100),
        cumProb0,
        cumProb1,
        cumProb2,
        baseMixPct,
        longWaitMixPct,
        baseMixProb: baseMixPct / 100,
        longWaitMixProb: longWaitMixPct / 100
    };
}

function runMonteCarlo() {
    if (isRunning) stopSimulation();
    isRunning = true;
    const jobId = ++currentJobId;

    const runBtn = document.getElementById('runBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const progressBar = document.getElementById('progressBar');
    const statusText = document.getElementById('statusText');
    const perfText = document.getElementById('perfText');

    runBtn.disabled = true;
    cancelBtn.style.display = 'inline-block';
    progressBar.style.width = '0%';
    perfText.textContent = '';

    const config = readAndValidateConfig();
    ensureWorkerPool(config.workerCount);

    const isBreakdown = (config.skillMode === 'breakdown');
    const tasks = [];
    let sCount = 0;
    let xCount = 0;
    let minPlayersStart = 1;
    let ppgList = [];

    if (config.simMode === 'fixed_courts') {
        ppgList = config.playersPerGame === 'all' ? [2, 3, 4] : [config.playersPerGame];
        minPlayersStart = Math.min(...ppgList);
        const maxPlayersEnd = Math.max(minPlayersStart + 2, config.maxDensity);
        sCount = isBreakdown ? 1 : ppgList.length;
        xCount = maxPlayersEnd - minPlayersStart + 1;

        for (let xIdx = xCount - 1; xIdx >= 0; xIdx--) {
            const totalSimulPlayers = minPlayersStart + xIdx;
            for (let sIdx = 0; sIdx < sCount; sIdx++) {
                tasks.push({
                    jobId,
                    sIdx,
                    xIdx,
                    targetSimultaneousTotal: totalSimulPlayers,
                    courts: config.fixedCourts,
                    simsPerConfig: config.simsPerConfig,
                    opMinutes: config.opMinutes,
                    minStay: config.minStay,
                    maxStay: config.maxStay,
                    meanGame: config.meanGame,
                    stdGame: config.stdGame,
                    playersPerGame: ppgList[sIdx],
                    skillMode: config.skillMode,
                    cumProb0: config.cumProb0,
                    cumProb1: config.cumProb1,
                    cumProb2: config.cumProb2,
                    baseMixProb: config.baseMixProb,
                    longWaitMixProb: config.longWaitMixProb
                });
            }
        }
    } else {
        const effectivePPG = config.playersPerGame === 'all' ? 4 : config.playersPerGame;
        sCount = config.maxDensity;
        xCount = config.maxCourts;

        for (let sIdx = sCount - 1; sIdx >= 0; sIdx--) {
            const pSimulPerCourt = sIdx + 1;
            for (let xIdx = xCount - 1; xIdx >= 0; xIdx--) {
                const courts = xIdx + 1;
                tasks.push({
                    jobId,
                    sIdx,
                    xIdx,
                    targetSimultaneousTotal: pSimulPerCourt * courts,
                    courts,
                    simsPerConfig: config.simsPerConfig,
                    opMinutes: config.opMinutes,
                    minStay: config.minStay,
                    maxStay: config.maxStay,
                    meanGame: config.meanGame,
                    stdGame: config.stdGame,
                    playersPerGame: effectivePPG,
                    skillMode: config.skillMode,
                    cumProb0: config.cumProb0,
                    cumProb1: config.cumProb1,
                    cumProb2: config.cumProb2,
                    baseMixProb: config.baseMixProb,
                    longWaitMixProb: config.longWaitMixProb
                });
            }
        }
    }

    // Storage grids: if isBreakdown is true, we store [4][sCount][xCount]
    const gamesGrid       = isBreakdown ? Array.from({ length: 4 }, () => Array.from({ length: sCount }, () => new Array(xCount))) : Array.from({ length: sCount }, () => new Array(xCount));
    const timeGrid        = isBreakdown ? Array.from({ length: 4 }, () => Array.from({ length: sCount }, () => new Array(xCount))) : Array.from({ length: sCount }, () => new Array(xCount));
    const waitGrid        = isBreakdown ? Array.from({ length: 4 }, () => Array.from({ length: sCount }, () => new Array(xCount))) : Array.from({ length: sCount }, () => new Array(xCount));
    const waitPerGameGrid = isBreakdown ? Array.from({ length: 4 }, () => Array.from({ length: sCount }, () => new Array(xCount))) : Array.from({ length: sCount }, () => new Array(xCount));

    const totalTasks = tasks.length;
    let nextTaskIdx = 0;
    let completedTasks = 0;
    const startTime = performance.now();

    function finalizeSimulation() {
        const seriesList = [];
        let xLabels = [];
        let xAxisTitle = '';

        if (config.simMode === 'fixed_courts') {
            xLabels = Array.from({ length: xCount }, (_, idx) => minPlayersStart + idx);
            xAxisTitle = `Simultaneous Players at Facility (${config.fixedCourts} Courts)`;

            if (isBreakdown) {
                const tierMetas = buildSkillTierMeta(config);
                const effectivePPG = ppgList[0];

                for (let sk = 0; sk < 4; sk++) {
                    const avgGames = [], stdGames = [];
                    const avgTime  = [], stdTime  = [];
                    const avgWait  = [], stdWait  = [];
                    const avgWPG   = [], stdWPG   = [];

                    for (let xIdx = 0; xIdx < xCount; xIdx++) {
                        const playerCountAtX = xLabels[xIdx];
                        if (playerCountAtX < effectivePPG) {
                            avgGames.push(null); stdGames.push(null);
                            avgTime.push(null);  stdTime.push(null);
                            avgWait.push(null);  stdWait.push(null);
                            avgWPG.push(null);   stdWPG.push(null);
                            continue;
                        }

                        const gStats   = computeMeanAndStd([gamesGrid[sk][0][xIdx]]);
                        const tStats   = computeMeanAndStd([timeGrid[sk][0][xIdx]]);
                        const wStats   = computeMeanAndStd([waitGrid[sk][0][xIdx]]);
                        const wpgStats = computeMeanAndStd([waitPerGameGrid[sk][0][xIdx]]);

                        avgGames.push(gStats.mean); stdGames.push(gStats.std);
                        avgTime.push(tStats.mean);  stdTime.push(tStats.std);
                        avgWait.push(wStats.mean);  stdWait.push(wStats.std);
                        avgWPG.push(wpgStats.mean); stdWPG.push(wpgStats.std);
                    }

                    seriesList.push({
                        meta: tierMetas[sk],
                        avgGames, stdGames,
                        avgTime,  stdTime,
                        avgWait,  stdWait,
                        avgWPG,   stdWPG
                    });
                }
            } else {
                for (let sIdx = 0; sIdx < sCount; sIdx++) {
                    const ppg = ppgList[sIdx];
                    const avgGames = [], stdGames = [];
                    const avgTime  = [], stdTime  = [];
                    const avgWait  = [], stdWait  = [];
                    const avgWPG   = [], stdWPG   = [];

                    for (let xIdx = 0; xIdx < xCount; xIdx++) {
                        const playerCountAtX = xLabels[xIdx];
                        if (playerCountAtX < ppg) {
                            avgGames.push(null); stdGames.push(null);
                            avgTime.push(null);  stdTime.push(null);
                            avgWait.push(null);  stdWait.push(null);
                            avgWPG.push(null);   stdWPG.push(null);
                            continue;
                        }

                        const gStats   = computeMeanAndStd([gamesGrid[sIdx][xIdx]]);
                        const tStats   = computeMeanAndStd([timeGrid[sIdx][xIdx]]);
                        const wStats   = computeMeanAndStd([waitGrid[sIdx][xIdx]]);
                        const wpgStats = computeMeanAndStd([waitPerGameGrid[sIdx][xIdx]]);

                        avgGames.push(gStats.mean); stdGames.push(gStats.std);
                        avgTime.push(tStats.mean);  stdTime.push(tStats.std);
                        avgWait.push(wStats.mean);  stdWait.push(wStats.std);
                        avgWPG.push(wpgStats.mean); stdWPG.push(wpgStats.std);
                    }

                    seriesList.push({
                        meta: PPG_SERIES_META[ppg],
                        avgGames, stdGames,
                        avgTime,  stdTime,
                        avgWait,  stdWait,
                        avgWPG,   stdWPG
                    });
                }
            }
        } else {
            xLabels = Array.from({ length: xCount }, (_, idx) => idx + 1);
            xAxisTitle = 'Number of Courts';
            const effectivePPG = config.playersPerGame === 'all' ? 4 : config.playersPerGame;

            if (isBreakdown) {
                const tierMetas = buildSkillTierMeta(config);
                for (let sk = 0; sk < 4; sk++) {
                    const avgGames = [], stdGames = [];
                    const avgTime  = [], stdTime  = [];
                    const avgWait  = [], stdWait  = [];
                    const avgWPG   = [], stdWPG   = [];

                    for (let xIdx = 0; xIdx < xCount; xIdx++) {
                        const courtsAtX = xLabels[xIdx];
                        const gamesSlice = [], timeSlice = [], waitSlice = [], wpgSlice = [];

                        for (let sIdx = 0; sIdx < sCount; sIdx++) {
                            const densityVal = sIdx + 1;
                            if (densityVal * courtsAtX >= effectivePPG) {
                                gamesSlice.push(gamesGrid[sk][sIdx][xIdx]);
                                timeSlice.push(timeGrid[sk][sIdx][xIdx]);
                                waitSlice.push(waitGrid[sk][sIdx][xIdx]);
                                wpgSlice.push(waitPerGameGrid[sk][sIdx][xIdx]);
                            }
                        }

                        const gStats   = computeMeanAndStd(gamesSlice);
                        const tStats   = computeMeanAndStd(timeSlice);
                        const wStats   = computeMeanAndStd(waitSlice);
                        const wpgStats = computeMeanAndStd(wpgSlice);

                        avgGames.push(gStats.mean); stdGames.push(gStats.std);
                        avgTime.push(tStats.mean);  stdTime.push(tStats.std);
                        avgWait.push(wStats.mean);  stdWait.push(wStats.std);
                        avgWPG.push(wpgStats.mean); stdWPG.push(wpgStats.std);
                    }

                    seriesList.push({
                        meta: tierMetas[sk],
                        avgGames, stdGames,
                        avgTime,  stdTime,
                        avgWait,  stdWait,
                        avgWPG,   stdWPG
                    });
                }
            } else {
                const groups = buildDensityGroups(config.maxDensity);
                for (const group of groups) {
                    const avgGames = [], stdGames = [];
                    const avgTime  = [], stdTime  = [];
                    const avgWait  = [], stdWait  = [];
                    const avgWPG   = [], stdWPG   = [];

                    for (let xIdx = 0; xIdx < xCount; xIdx++) {
                        const courtsAtX = xLabels[xIdx];
                        const gamesSlice = [], timeSlice = [], waitSlice = [], wpgSlice = [];

                        for (let sIdx = 0; sIdx < sCount; sIdx++) {
                            const densityVal = sIdx + 1;
                            const totalSimul = densityVal * courtsAtX;
                            if (densityVal >= group.low && densityVal <= group.high && totalSimul >= effectivePPG) {
                                gamesSlice.push(gamesGrid[sIdx][xIdx]);
                                timeSlice.push(timeGrid[sIdx][xIdx]);
                                waitSlice.push(waitGrid[sIdx][xIdx]);
                                wpgSlice.push(waitPerGameGrid[sIdx][xIdx]);
                            }
                        }

                        const gStats   = computeMeanAndStd(gamesSlice);
                        const tStats   = computeMeanAndStd(timeSlice);
                        const wStats   = computeMeanAndStd(waitSlice);
                        const wpgStats = computeMeanAndStd(wpgSlice);

                        avgGames.push(gStats.mean); stdGames.push(gStats.std);
                        avgTime.push(tStats.mean);  stdTime.push(tStats.std);
                        avgWait.push(wStats.mean);  stdWait.push(wStats.std);
                        avgWPG.push(wpgStats.mean); stdWPG.push(wpgStats.std);
                    }

                    seriesList.push({
                        meta: group,
                        avgGames, stdGames,
                        avgTime,  stdTime,
                        avgWait,  stdWait,
                        avgWPG,   stdWPG
                    });
                }
            }
        }

        renderAllCharts(xLabels, xAxisTitle, config, seriesList);

        const elapsedMs = performance.now() - startTime;
        const totalSimulatedDays = (totalTasks * config.simsPerConfig).toLocaleString();
        statusText.textContent = `${totalSimulatedDays} simulated days complete`;
        perfText.textContent = `${(elapsedMs / 1000).toFixed(2)}s`;
        runBtn.disabled = false;
        cancelBtn.style.display = 'none';
        isRunning = false;
    }

    function dispatchNext(worker) {
        if (nextTaskIdx < totalTasks) {
            worker.postMessage(tasks[nextTaskIdx++]);
        }
    }

    workerPool.forEach(worker => {
        worker.onmessage = function(e) {
            const res = e.data;
            if (res.jobId !== currentJobId) return;

            const gFull   = new Float64Array(res.cGamesBuffer);
            const tFull   = new Float64Array(res.cTimeBuffer);
            const wFull   = new Float64Array(res.cWaitBuffer);
            const wpgFull = new Float64Array(res.cWaitPerGameBuffer);

            if (res.isBreakdown) {
                const sims = config.simsPerConfig;
                for (let sk = 0; sk < 4; sk++) {
                    const start = sk * sims;
                    const end   = start + sims;
                    gamesGrid[sk][res.sIdx][res.xIdx]       = gFull.subarray(start, end);
                    timeGrid[sk][res.sIdx][res.xIdx]        = tFull.subarray(start, end);
                    waitGrid[sk][res.sIdx][res.xIdx]        = wFull.subarray(start, end);
                    waitPerGameGrid[sk][res.sIdx][res.xIdx] = wpgFull.subarray(start, end);
                }
            } else {
                gamesGrid[res.sIdx][res.xIdx]       = gFull;
                timeGrid[res.sIdx][res.xIdx]        = tFull;
                waitGrid[res.sIdx][res.xIdx]        = wFull;
                waitPerGameGrid[res.sIdx][res.xIdx] = wpgFull;
            }

            completedTasks++;
            if (completedTasks % 5 === 0 || completedTasks === totalTasks) {
                const pct = Math.round((completedTasks / totalTasks) * 100);
                progressBar.style.width = `${pct}%`;
                statusText.textContent = `Simulating ${completedTasks}/${totalTasks} scenarios (${pct}%)...`;
            }

            if (completedTasks === totalTasks) {
                finalizeSimulation();
            } else {
                dispatchNext(worker);
            }
        };

        dispatchNext(worker);
    });
}

function bindClickableGroup(containerId, selector, stateKey, onChange) {
    const container = document.getElementById(containerId);
    const items = container.querySelectorAll(selector);
    items.forEach(item => {
        item.addEventListener('click', () => {
            if (item.disabled) return;
            items.forEach(b => b.classList.remove('active'));
            item.classList.add('active');
            uiState[stateKey] = item.getAttribute('data-val');
            onChange(uiState[stateKey]);
        });
    });
}

function bindHybridRange(rangeId, numId, badgeId, unitSuffix) {
    const rangeEl = document.getElementById(rangeId);
    const numEl = document.getElementById(numId);
    const badgeEl = document.getElementById(badgeId);

    function sync(val, triggerRun) {
        rangeEl.value = val;
        numEl.value = val;
        if (badgeEl) {
            const suffix = typeof unitSuffix === 'function' ? unitSuffix() : unitSuffix;
            badgeEl.textContent = `${val} ${suffix}`;
        }
        if (triggerRun) runMonteCarlo();
    }

    rangeEl.addEventListener('input', () => sync(rangeEl.value, false));
    rangeEl.addEventListener('change', () => sync(rangeEl.value, true));
    numEl.addEventListener('change', () => sync(numEl.value, true));
}

function resetDefaults() {
    document.getElementById('opMinutes').value = 720;
    document.getElementById('minStay').value = 30;
    document.getElementById('maxStay').value = 240;
    document.getElementById('meanGame').value = 15;
    document.getElementById('stdGame').value = 5;
    document.getElementById('simsPerConfig').value = 100;
    document.getElementById('workerCount').value = defaultThreads;
    document.getElementById('pctBeginner').value = 5;
    document.getElementById('pctIntermediate').value = 25;
    document.getElementById('pctAdvanced').value = 50;
    document.getElementById('pctExpert').value = 20;
    document.getElementById('baseMixPct').value = 5;
    document.getElementById('longWaitMixPct').value = 10;
    runMonteCarlo();
}

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('minStay').value = 30;
    document.getElementById('maxStay').value = 240;
    document.getElementById('meanGame').value = 15;
    document.getElementById('stdGame').value = 5;
    document.getElementById('opMinutes').value = 720;
    document.getElementById('simsPerConfig').value = 100;
    document.getElementById('workerCount').value = defaultThreads;
    document.getElementById('pctBeginner').value = 5;
    document.getElementById('pctIntermediate').value = 25;
    document.getElementById('pctAdvanced').value = 50;
    document.getElementById('pctExpert').value = 20;
    document.getElementById('baseMixPct').value = 5;
    document.getElementById('longWaitMixPct').value = 10;

    initCharts();
    syncModeUI();
    setMascotNeutral();

    bindClickableGroup('modeCards', '.mode-card', 'simMode', () => {
        syncModeUI();
        runMonteCarlo();
    });

    bindClickableGroup('skillSegmented', 'button', 'skillMode', () => {
        syncModeUI();
        runMonteCarlo();
    });

    bindClickableGroup('ppgSegmented', 'button', 'playersPerGame', () => {
        runMonteCarlo();
    });

    bindClickableGroup('stdSegmented', 'button', 'stdDisplay', () => {
        applyStdDisplayPreference();
    });

    bindHybridRange('fixedCourtsRange', 'fixedCourts', 'fixedCourtsBadge', 'Courts');
    bindHybridRange('maxCourtsRange', 'maxCourts', 'maxCourtsBadge', 'Courts');
    bindHybridRange('maxDensityRange', 'maxDensity', 'maxDensityBadge', () =>
        uiState.simMode === 'fixed_courts' ? 'Players' : '/ Court'
    );

    const advDrawer = document.getElementById('advDrawer');
    const advBtnText = document.getElementById('advBtnText');
    document.getElementById('toggleAdvBtn').addEventListener('click', () => {
        const isOpen = advDrawer.classList.toggle('open');
        advBtnText.innerHTML = isOpen ? 'Hide Advanced &#9652;' : 'Advanced Parameters &#9662;';
    });

    document.getElementById('resetDefaultsBtn').addEventListener('click', resetDefaults);
    document.getElementById('runBtn').addEventListener('click', runMonteCarlo);
    document.getElementById('cancelBtn').addEventListener('click', stopSimulation);

    runMonteCarlo();
});
