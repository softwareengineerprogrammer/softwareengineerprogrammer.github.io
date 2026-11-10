/* =====================================================================
   charts-mascot.js
   Chart.js Whisker Plugin, Statistical Aggregators & SVG Mascot Controller
   ===================================================================== */

let charts = {};
let latestSimSnapshot = null;

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
        { label: '1–3 present/court',  low: 1,  high: 3,  color: '#2563eb', pointStyle: 'circle' },
        { label: '4–7 present/court',  low: 4,  high: 7,  color: '#10b981', pointStyle: 'rectRounded' },
        { label: '8–10 present/court', low: 8,  high: 10, color: '#f59e0b', pointStyle: 'triangle' },
        { label: `11–${Math.max(14, maxDensity)} present/court`, low: 11, high: Math.max(14, maxDensity), color: '#ef4444', pointStyle: 'rectRot' }
    ];
    return base.filter(g => g.low <= maxDensity);
}

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
    headline.textContent = 'Inspect or Click a Point';
    sub.textContent = 'Hover any point to see player mood, or click a point to drill into its simulated days below!';

    mouth.setAttribute('d', 'M 41 62 Q 48 64 55 62');
    browL.setAttribute('d', 'M 33 45 Q 38 44 42 45');
    browR.setAttribute('d', 'M 54 45 Q 58 44 63 45');
    cheekL.setAttribute('opacity', '0.4');
    cheekR.setAttribute('opacity', '0.4');

    document.getElementById('inspWait').textContent = '—';
    document.getElementById('inspGames').textContent = '—';
    document.getElementById('inspPlay').textContent = '—';
    document.getElementById('inspTotalWait').textContent = '—';
}

function setMascotMood(waitMins, gamesPlayed, playMins, totalWaitMins, contextLabel) {
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

    document.getElementById('inspWait').textContent = `${waitMins.toFixed(1)} mins`;
    document.getElementById('inspGames').textContent = `${gamesPlayed.toFixed(1)}`;
    document.getElementById('inspPlay').textContent = playMins != null ? `${playMins.toFixed(0)} mins` : '—';
    document.getElementById('inspTotalWait').textContent = totalWaitMins != null ? `${totalWaitMins.toFixed(0)} mins` : '—';

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
        sub.textContent = `Waiting ${waitMins.toFixed(1)}m per game (${gamesPlayed.toFixed(1)} games total). Click point to inspect a day!`;

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
        sub.textContent = `Players average ${gamesPlayed.toFixed(1)} games. Click point to drill into an individual day!`;

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
        sub.textContent = `Playable (${gamesPlayed.toFixed(1)} games/visit), but queue is backing up. Click point to inspect!`;

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
        sub.textContent = `Great flow! ${gamesPlayed.toFixed(1)} games per visit. Click point to see the day's matches!`;

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
        sub.textContent = `Non-stop action — ${gamesPlayed.toFixed(1)} games per session! Click point to inspect a day.`;

        mouth.setAttribute('d', 'M 37 60 Q 48 72 59 60');
        browL.setAttribute('d', 'M 33 44 Q 38 40 42 44');
        browR.setAttribute('d', 'M 54 44 Q 58 40 63 44');
        cheekL.setAttribute('opacity', '0.8');
        cheekR.setAttribute('opacity', '0.8');
    }
}

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
            onClick: (event, activeElements) => {
                if (!activeElements || activeElements.length === 0 || !latestSimSnapshot) return;
                const xIdx = activeElements[0].index;
                const dsIdx = activeElements[0].datasetIndex;
                if (typeof selectDayFromChartClick === 'function') {
                    selectDayFromChartClick(dsIdx, xIdx);
                }
            },
            onHover: (event, activeElements, chart) => {
                if (!activeElements || activeElements.length === 0 || !latestSimSnapshot) return;
                const dataIndex = activeElements[0].index;
                const dsIndex = activeElements[0].datasetIndex;
                const s = latestSimSnapshot.seriesList[dsIndex] || latestSimSnapshot.seriesList[latestSimSnapshot.seriesList.length - 1];
                if (!s) return;

                const wVal = s.avgWPG[dataIndex];
                const gVal = s.avgGames[dataIndex];
                const tVal = s.avgTime[dataIndex];
                const twVal = s.avgWait[dataIndex];
                const xVal = chart.data.labels[dataIndex];

                if (wVal != null && gVal != null) {
                    const unit = latestSimSnapshot.config.simMode === 'fixed_courts' ? `${xVal} Present` : `${xVal} Courts`;
                    const tierPrefix = latestSimSnapshot.config.skillMode === 'breakdown'
                        ? `${s.meta.label.split(' ')[0]} @ `
                        : 'At ';
                    setMascotMood(wVal, gVal, tVal, twVal, `${tierPrefix}${unit}`);
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
                        title: (items) => {
                            if (!items.length || !latestSimSnapshot) return '';
                            const xVal = items[0].label;
                            return latestSimSnapshot.config.simMode === 'fixed_courts'
                                ? `${xVal} Players Present (Click to Inspect Day)`
                                : `${xVal} Courts (Click to Inspect Day)`;
                        },
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
                        text: 'Avg Players Present at Any Given Time',
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

function applyStdDisplayPreference(stdDisplayMode) {
    const showWhiskers = (stdDisplayMode === 'whiskers');
    const showSeparate = (stdDisplayMode === 'separate');

    const stdCards = document.querySelectorAll('.std-chart-card');
    stdCards.forEach(card => {
        card.classList.toggle('visible', showSeparate);
    });

    for (const key of ['waitPerGame', 'games', 'playTime', 'totalWait']) {
        if (charts[key]) {
            charts[key].options.plugins.whiskerErrorBars.enabled = showWhiskers;
            charts[key].resize();
            charts[key].update('none');
        }
    }

    if (showSeparate) {
        for (const key of ['stdWaitPerGame', 'stdGames', 'stdPlayTime', 'stdTotalWait']) {
            if (charts[key]) {
                charts[key].resize();
                charts[key].update('none');
            }
        }
    }
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

function renderAllCharts(xLabels, xAxisTitle, config, seriesList, stdDisplayMode) {
    const showWhiskers = (stdDisplayMode === 'whiskers');

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

    latestSimSnapshot = { config, xLabels, seriesList };
    setMascotNeutral();
    applyStdDisplayPreference(stdDisplayMode);
}
