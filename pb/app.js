/* =====================================================================
   app.js
   Main Application Controller: UI State, Input Validation & Worker Pool
   ===================================================================== */

const detectedCores = navigator.hardwareConcurrency || 4;
const defaultThreads = Math.min(12, Math.max(2, detectedCores));

const uiState = {
    simMode: 'fixed_courts',
    skillMode: 'breakdown', // Default: 'By Skill Tier' ('off' | 'overall' | 'breakdown')
    playersPerGame: '4',
    stdDisplay: 'whiskers'
};

let workerPool = [];
let currentJobId = 0;
let isRunning = false;

function updateCourtsBadgeText() {
    const courts = parseInt(document.getElementById('fixedCourts').value, 10) || 8;
    const ppg = uiState.playersPerGame === 'all' ? 4 : (parseInt(uiState.playersPerGame, 10) || 4);
    const activeCap = courts * ppg;
    document.getElementById('fixedCourtsBadge').textContent = `${activeCap} max active players`;
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
        maxDensityTitle.textContent = 'Max Crowd Size';
        maxDensityRange.min = 8;
        maxDensityRange.max = 160;
        if (parseInt(maxDensityInput.value, 10) <= 24) {
            maxDensityInput.value = 80;
            maxDensityRange.value = 80;
        }
        maxDensityBadge.textContent = `${maxDensityInput.value} Present`;
    } else {
        fixedBlock.classList.add('hidden');
        maxCourtsBlock.classList.remove('hidden');
        maxDensityTitle.textContent = 'Crowd / Court';
        maxDensityRange.min = 4;
        maxDensityRange.max = 24;
        if (parseInt(maxDensityInput.value, 10) > 24) {
            maxDensityInput.value = 14;
            maxDensityRange.value = 14;
        }
        maxDensityBadge.textContent = `${maxDensityInput.value} / Court`;
    }

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

    updateCourtsBadgeText();
}

function ensureWorkerPool(targetSize) {
    while (workerPool.length > targetSize) {
        workerPool.pop().terminate();
    }
    while (workerPool.length < targetSize) {
        workerPool.push(new Worker('sim-worker.js'));
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
            xAxisTitle = `Avg Players Present at Any Given Time (${config.fixedCourts} Courts)`;

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

        updateCourtsBadgeText();
        renderAllCharts(xLabels, xAxisTitle, config, seriesList, uiState.stdDisplay);

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

function bindHybridRange(rangeId, numId, badgeId, formatBadgeFn) {
    const rangeEl = document.getElementById(rangeId);
    const numEl = document.getElementById(numId);
    const badgeEl = document.getElementById(badgeId);

    function sync(val, triggerRun) {
        rangeEl.value = val;
        numEl.value = val;
        if (badgeEl && formatBadgeFn) {
            badgeEl.textContent = formatBadgeFn(val);
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
        updateCourtsBadgeText();
        runMonteCarlo();
    });

    bindClickableGroup('stdSegmented', 'button', 'stdDisplay', () => {
        applyStdDisplayPreference(uiState.stdDisplay);
    });

    bindHybridRange('fixedCourtsRange', 'fixedCourts', 'fixedCourtsBadge', (val) => {
        const ppg = uiState.playersPerGame === 'all' ? 4 : (parseInt(uiState.playersPerGame, 10) || 4);
        return `${val * ppg} max active players`;
    });

    bindHybridRange('maxCourtsRange', 'maxCourts', 'maxCourtsBadge', (val) => `${val} Courts`);

    bindHybridRange('maxDensityRange', 'maxDensity', 'maxDensityBadge', (val) =>
        uiState.simMode === 'fixed_courts' ? `${val} Present` : `${val} / Court`
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
