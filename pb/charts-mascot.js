/* =====================================================================
   charts-mascot.js
   Chart.js Whisker Plugin, Share-Weighted Skill Curves &
   Custom Per-Series Animated Mascot Tooltip
   ===================================================================== */

let charts = {};
let latestSimSnapshot = null;
let tooltipEl = null;

const PPG_SERIES_META = {
    2: { label: '2 Players/Game (Singles)',  color: '#0ea5e9', solidColor: '#0ea5e9', pointStyle: 'circle', minPlayers: 2 },
    3: { label: '3 Players/Game (Canadian)', color: '#f59e0b', solidColor: '#f59e0b', pointStyle: 'triangle', minPlayers: 3 },
    4: { label: '4 Players/Game (Doubles)',  color: '#10b981', solidColor: '#10b981', pointStyle: 'rectRounded', minPlayers: 4 }
};

// No-op stub so any legacy calls in app.js remain harmless
function setMascotNeutral() {}

function hexToRgba(hex, alpha = 1) {
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
}

// Pronounced size + thickness + opacity scaling based on skill tier population share %
function buildSkillTierMeta(config) {
    const rawTiers = [
        { name: 'Beginner',     pct: config.pctBeginner,     hex: '#f59e0b', pointStyle: 'circle' },
        { name: 'Intermediate', pct: config.pctIntermediate, hex: '#0ea5e9', pointStyle: 'triangle' },
        { name: 'Advanced',     pct: config.pctAdvanced,     hex: '#10b981', pointStyle: 'rectRounded' },
        { name: 'Expert',       pct: config.pctExpert,       hex: '#8b5cf6', pointStyle: 'rectRot' }
    ];

    const maxPct = Math.max(1, ...rawTiers.map(t => t.pct));

    return rawTiers.map(t => {
        const rel = Math.max(0, t.pct) / maxPct;
        const weight = Math.pow(rel, 0.72);

        const alpha = Math.min(1.0, Math.max(0.28, 0.18 + 0.82 * weight));
        const borderWidth = Number((0.75 + 3.05 * weight).toFixed(2));
        const pointScale = Number((0.35 + 1.20 * weight).toFixed(2));

        return {
            label: `${t.name} (${t.pct}%)`,
            color: hexToRgba(t.hex, alpha),
            solidColor: t.hex,
            alpha,
            borderWidth,
            pointScale,
            order: Math.round((1 - rel) * 10),
            pointStyle: t.pointStyle
        };
    });
}

function buildDensityGroups(maxDensity) {
    const base = [
        { label: '1–3 present/court',  low: 1,  high: 3,  color: '#2563eb', solidColor: '#2563eb', pointStyle: 'circle' },
        { label: '4–7 present/court',  low: 4,  high: 7,  color: '#10b981', solidColor: '#10b981', pointStyle: 'rectRounded' },
        { label: '8–10 present/court', low: 8,  high: 10, color: '#f59e0b', solidColor: '#f59e0b', pointStyle: 'triangle' },
        { label: `11–${Math.max(14, maxDensity)} present/court`, low: 11, high: Math.max(14, maxDensity), color: '#ef4444', solidColor: '#ef4444', pointStyle: 'rectRot' }
    ];
    return base.filter(g => g.low <= maxDensity);
}

// Generate an inline 22x22 SVG pickleball mascot whose face & animation reflect (waitMins, gamesPlayed)
// and whose sweatband matches the series color (bandColor)
function createMiniMascotSvg(waitMins, gamesPlayed, bandColor = '#10b981') {
    let moodClass = 'mini-mood-ecstatic';
    let mouthPath = 'M 14 27 Q 20 33 26 27'; // Big happy grin
    let browL = 'M 12 18 Q 15 16 17 18';
    let browR = 'M 23 18 Q 25 16 28 18';
    let cheekOpacity = '0.75';
    let tearsSvg = '';

    const w = waitMins ?? 5;
    const g = gamesPlayed ?? 5;

    if (g <= 1.25 || w >= 35) {
        // Devastated / Crying (0-1 games or 35m+ wait)
        moodClass = 'mini-mood-crying';
        mouthPath = 'M 14 30 Q 20 23 26 30';
        browL = 'M 11 19 Q 14 17 17 16';
        browR = 'M 23 16 Q 26 17 29 19';
        cheekOpacity = '0.1';
        tearsSvg = `
      <circle class="mini-tear" cx="14.5" cy="24" r="1.6" fill="#38bdf8"/>
      <circle class="mini-tear" cx="25.5" cy="24" r="1.6" fill="#38bdf8"/>
    `;
    } else if (w >= 20 || g < 2.5) {
        // Sad frown
        moodClass = 'mini-mood-sad';
        mouthPath = 'M 15 29 Q 20 25 25 29';
        browL = 'M 12 19 Q 15 17.5 17 17';
        browR = 'M 23 17 Q 25 17.5 28 19';
        cheekOpacity = '0.2';
    } else if (w >= 11) {
        // Impatient flat mouth + furrowed brow
        moodClass = 'mini-mood-impatient';
        mouthPath = 'M 15 27.5 L 25 27';
        browL = 'M 12 16.5 L 17 18.5';
        browR = 'M 23 18.5 L 28 16.5';
        cheekOpacity = '0.35';
    } else if (w >= 5.5) {
        // Content smile
        moodClass = 'mini-mood-happy';
        mouthPath = 'M 14.5 26.5 Q 20 30.5 25.5 26.5';
        cheekOpacity = '0.55';
    }

    return `
    <svg class="${moodClass}" width="22" height="22" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;">
      <!-- Pickleball Head -->
      <circle cx="20" cy="21" r="15.5" fill="#a3e635" stroke="#4d7c0f" stroke-width="2"/>
      <!-- Wiffle Holes -->
      <circle cx="11" cy="14" r="1.3" fill="#65a30d" opacity="0.45"/>
      <circle cx="29" cy="14" r="1.3" fill="#65a30d" opacity="0.45"/>
      <!-- Series-Colored Sweatband -->
      <path d="M 5.5 15 Q 20 10.5 34.5 15 L 33.8 10.5 Q 20 6 6.2 10.5 Z" fill="${bandColor}" stroke="#0f172a" stroke-width="1"/>
      <!-- Cheeks -->
      <ellipse cx="11" cy="24" rx="2.4" ry="1.5" fill="#fb7185" opacity="${cheekOpacity}"/>
      <ellipse cx="29" cy="24" rx="2.4" ry="1.5" fill="#fb7185" opacity="${cheekOpacity}"/>
      <!-- Eyebrows -->
      <path d="${browL}" stroke="#0f172a" stroke-width="1.6" stroke-linecap="round" fill="none"/>
      <path d="${browR}" stroke="#0f172a" stroke-width="1.6" stroke-linecap="round" fill="none"/>
      <!-- Eyes -->
      <circle cx="14.5" cy="21" r="2.2" fill="#0f172a"/>
      <circle cx="25.5" cy="21" r="2.2" fill="#0f172a"/>
      <circle cx="13.8" cy="20.2" r="0.8" fill="#ffffff"/>
      <circle cx="24.8" cy="20.2" r="0.8" fill="#ffffff"/>
      ${tearsSvg}
      <!-- Mouth -->
      <path d="${mouthPath}" stroke="#0f172a" stroke-width="2" stroke-linecap="round" fill="none"/>
    </svg>
  `;
}

function ensureTooltipElement() {
    if (tooltipEl) return tooltipEl;
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'chart-mascot-tooltip';
    tooltipEl.style.opacity = '0';
    document.body.appendChild(tooltipEl);
    return tooltipEl;
}

// External Chart.js Tooltip Renderer with Per-Series Animated Mascots
function externalMascotTooltipHandler(context, isStdChart) {
    const { chart, tooltip } = context;
    const el = ensureTooltipElement();

    if (tooltip.opacity === 0 || !tooltip.dataPoints || tooltip.dataPoints.length === 0) {
        el.style.opacity = '0';
        return;
    }

    const xLabel = tooltip.dataPoints[0].label;
    const unitTitle = (latestSimSnapshot && latestSimSnapshot.config.simMode === 'fixed_courts')
        ? `${xLabel} Players Present`
        : `${xLabel} Courts`;

    let html = `
    <div class="cmt-title">
      <span>${unitTitle}</span>
      <span class="cmt-hint">Click to inspect day</span>
    </div>
  `;

    for (const dp of tooltip.dataPoints) {
        const val = dp.parsed.y;
        if (val == null) continue;

        const dsIndex = dp.datasetIndex;
        const dataIndex = dp.dataIndex;
        const ds = dp.dataset;
        const bandColor = ds.solidColor || '#10b981';

        // Look up this series' wait-per-game and games-played at dataIndex so the mascot's mood is accurate across all 8 charts
        let waitMins = 5;
        let gamesPlayed = 5;
        if (latestSimSnapshot && latestSimSnapshot.seriesList[dsIndex]) {
            const s = latestSimSnapshot.seriesList[dsIndex];
            waitMins = s.avgWPG[dataIndex] ?? 5;
            gamesPlayed = s.avgGames[dataIndex] ?? 5;
        }

        const mascotSvg = createMiniMascotSvg(waitMins, gamesPlayed, bandColor);
        const stdVal = (!isStdChart && ds.stdValues) ? ds.stdValues[dataIndex] : null;
        const stdHtml = stdVal != null ? `<span class="cmt-std">(±${stdVal.toFixed(2)})</span>` : '';

        html += `
      <div class="cmt-row">
        <div class="cmt-mascot-wrap">${mascotSvg}</div>
        <span class="cmt-label">${ds.label}:</span>
        <span class="cmt-val">${val.toFixed(2)}${stdHtml}</span>
      </div>
    `;
    }

    el.innerHTML = html;
    el.style.opacity = '1';

    const canvasRect = chart.canvas.getBoundingClientRect();
    const ttWidth = el.offsetWidth || 255;
    const ttHeight = el.offsetHeight || 130;

    let left = canvasRect.left + tooltip.caretX + 14;
    if (left + ttWidth > window.innerWidth - 12) {
        left = canvasRect.left + tooltip.caretX - ttWidth - 14;
    }
    let top = canvasRect.top + tooltip.caretY - ttHeight * 0.5;
    top = Math.max(10, Math.min(window.innerHeight - ttHeight - 10, top));

    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
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

            ctx.strokeStyle = ds.solidColor || ds.borderColor || '#334155';
            const seriesAlpha = ds.seriesAlpha ?? 0.9;
            ctx.lineWidth = Math.max(0.75, (ds.borderWidth || 2) * 0.5);
            ctx.globalAlpha = Math.max(0.15, seriesAlpha * 0.48);

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

function pickHoveredDatasetIndex(event, activeElements) {
    if (!latestSimSnapshot) return 0;
    const isBreakdown = latestSimSnapshot.config.skillMode === 'breakdown';
    const defaultIdx = isBreakdown ? 2 : (latestSimSnapshot.seriesList.length - 1);

    if (!event || event.y == null) return defaultIdx;

    let closestDsIdx = defaultIdx;
    let minPixelDist = 18;

    for (const el of activeElements) {
        if (el.element && typeof el.element.y === 'number') {
            const dist = Math.abs(event.y - el.element.y);
            if (dist < minPixelDist) {
                minPixelDist = dist;
                closestDsIdx = el.datasetIndex;
            }
        }
    }
    return closestDsIdx;
}

function createChart(canvasId, yLabel, isStdChart = false) {
    const canvasEl = document.getElementById(canvasId);
    const ctx = canvasEl.getContext('2d');

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
                const dsIdx = pickHoveredDatasetIndex(event, activeElements);
                if (typeof selectDayFromChartClick === 'function') {
                    selectDayFromChartClick(dsIdx, xIdx);
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
                    enabled: false, // Disable default canvas tooltip in favor of custom HTML mascot tooltip
                    external: (context) => externalMascotTooltipHandler(context, isStdChart)
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
    const baseRadius = xCount > 45 ? 2.2 : 3.5;
    const ptScale = meta.pointScale ?? 1.0;
    const ptRadius = Number((baseRadius * ptScale).toFixed(2));
    const lineWidth = meta.borderWidth ?? 2.2;

    return {
        label: meta.label,
        data: dataArr.map(v => (v == null || Number.isNaN(v) ? null : Number(v.toFixed(2)))),
        stdValues: stdArr ? stdArr.map(s => (s == null || Number.isNaN(s) ? null : Number(s.toFixed(2)))) : undefined,
        borderColor: meta.color,
        backgroundColor: meta.color,
        solidColor: meta.solidColor || meta.color,
        seriesAlpha: meta.alpha ?? 1.0,
        pointStyle: meta.pointStyle,
        pointRadius: ptRadius,
        pointHoverRadius: Math.max(4.5, ptRadius + 2.2),
        borderWidth: lineWidth,
        borderDash: isDashed ? [5, 4] : undefined,
        order: meta.order ?? 1,
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
    applyStdDisplayPreference(stdDisplayMode);
}
