/* ============================================================
   CPU Scheduler Simulator — script.js  (FIXED v2.1)
   All 6 scheduling algorithms implemented in JavaScript
   ============================================================ */

'use strict';

/* ── Process Colors ── */
const PROC_COLORS = [
    ['#4f8ef7','#2d6ef0'],['#00e5a0','#00b87a'],['#b06bff','#8b44e0'],
    ['#ffb347','#e08a1b'],['#ff4f6e','#d4304e'],['#00d4ff','#0099cc'],
    ['#90e040','#68b010'],['#ff6b9d','#e04070'],['#7c6af7','#5b45e8'],
    ['#f472b6','#c0206a'],['#20d0c0','#0fa090'],['#fb8c3a','#d46010']
];

/* ─────────────────────────────────────────────
   DATA MODEL
───────────────────────────────────────────── */
let rowCount = 0;

/* ─────────────────────────────────────────────
   PROCESS TABLE MANAGEMENT
───────────────────────────────────────────── */
function addRow(name='', arrival='', burst='', priority='1') {
    const tbody = document.querySelector('#process-table tbody');
    const idx   = rowCount++;
    const tr    = document.createElement('tr');
    tr.dataset.idx = idx;

    const [c1] = PROC_COLORS[idx % PROC_COLORS.length];
    const pName = name || `P${tbody.children.length + 1}`;

    tr.innerHTML = `
        <td><span class="pid-badge pid-cell">
            <span class="pid-dot" style="background:${c1};box-shadow:0 0 6px ${c1}66"></span>
            ${pName}
        </span></td>
        <td><input type="number" value="${arrival}" min="0" placeholder="0" class="at-input"></td>
        <td><input type="number" value="${burst}"   min="1" placeholder="1" class="bt-input"></td>
        <td><input type="number" value="${priority}" min="1" placeholder="1" class="pr-input"></td>
        <td><button class="btn btn-danger btn-sm del-btn" title="Remove process">✕</button></td>
    `;
    tr.querySelector('.del-btn').addEventListener('click', () => {
        tr.style.opacity = '0';
        tr.style.transform = 'translateX(-10px)';
        tr.style.transition = 'all 0.2s ease';
        setTimeout(() => { tr.remove(); updateProcessCount(); }, 200);
    });

    tr.style.opacity = '0';
    tr.style.transform = 'translateY(-6px)';
    tbody.appendChild(tr);
    requestAnimationFrame(() => {
        tr.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
        tr.style.opacity = '1';
        tr.style.transform = 'translateY(0)';
    });

    updateProcessCount();
}

function loadSampleData() {
    document.querySelector('#process-table tbody').innerHTML = '';
    rowCount = 0;
    const sample = [
        ['P1', 0, 8, 3],
        ['P2', 1, 4, 1],
        ['P3', 2, 9, 4],
        ['P4', 3, 5, 2],
        ['P5', 4, 6, 3],
    ];
    sample.forEach(([n,a,b,p]) => addRow(n, a, b, p));
    showToast('✓ Sample data loaded');
}

function updateProcessCount() {
    const count = document.querySelectorAll('#process-table tbody tr').length;
    const badge = document.getElementById('process-count-badge');
    if (badge) badge.textContent = `${count} process${count !== 1 ? 'es' : ''}`;
}

function collectProcesses() {
    const rows = document.querySelectorAll('#process-table tbody tr');
    if (!rows.length) return null;
    const result = [];
    let valid = true;
    rows.forEach((tr, i) => {
        const at = parseFloat(tr.querySelector('.at-input').value);
        const bt = parseFloat(tr.querySelector('.bt-input').value);
        const pr = parseFloat(tr.querySelector('.pr-input').value);
        if (isNaN(at) || isNaN(bt) || isNaN(pr) || bt < 1) { valid = false; return; }
        const dot   = tr.querySelector('.pid-dot');
        const color = dot ? dot.style.background : PROC_COLORS[i % PROC_COLORS.length][0];
        result.push({ pid: i, name: `P${i+1}`, arrival: at, burst: bt, priority: pr, color, colorIdx: i });
    });
    return valid ? result : null;
}

/* ─────────────────────────────────────────────
   ALGORITHM HELPERS
───────────────────────────────────────────── */
function cloneProcs(procs) {
    return procs.map(p => ({ ...p, remaining: p.burst }));
}

function addBlock(timeline, pid, start, end) {
    if (timeline.length && timeline[timeline.length-1].pid === pid) {
        timeline[timeline.length-1].end = end;
    } else {
        timeline.push({ pid, start, end });
    }
}

function computeMetrics(procs, timeline) {
    return procs.map(p => {
        const blocks = timeline.filter(b => b.pid === p.pid);
        if (!blocks.length) return null;
        const ct  = Math.max(...blocks.map(b => b.end));
        const fs  = Math.min(...blocks.map(b => b.start));
        const tat = ct - p.arrival;
        const wt  = tat - p.burst;
        const rt  = fs  - p.arrival;
        return { ...p, completion: ct, turnaround: tat, waiting: wt, response: rt };
    }).filter(Boolean);
}

function computeSummary(metrics, timeline) {
    const n    = metrics.length;
    const tot  = Math.max(...timeline.map(b => b.end));
    const busy = timeline.filter(b => b.pid !== null).reduce((s, b) => s + (b.end - b.start), 0);
    return {
        avgWT      : (metrics.reduce((s,m) => s + m.waiting, 0) / n).toFixed(2),
        avgTAT     : (metrics.reduce((s,m) => s + m.turnaround, 0) / n).toFixed(2),
        avgRT      : (metrics.reduce((s,m) => s + m.response, 0) / n).toFixed(2),
        cpuUtil    : ((busy / tot) * 100).toFixed(1),
        throughput : (n / tot).toFixed(4),
        totalTime  : tot
    };
}

/* ─────────────────────────────────────────────
   ALGORITHM 1 : FCFS
───────────────────────────────────────────── */
function runFCFS(procs) {
    const p  = cloneProcs([...procs].sort((a,b) => a.arrival - b.arrival || a.pid - b.pid));
    const tl = [];
    let t = 0;
    for (const proc of p) {
        if (t < proc.arrival) { addBlock(tl, null, t, proc.arrival); t = proc.arrival; }
        addBlock(tl, proc.pid, t, t + proc.burst);
        t += proc.burst;
    }
    const m = computeMetrics(procs, tl);
    return { algorithm: 'FCFS', timeline: tl, metrics: m, summary: computeSummary(m, tl) };
}

/* ─────────────────────────────────────────────
   ALGORITHM 2 : SJF Non-Preemptive
───────────────────────────────────────────── */
function runSJF(procs) {
    const p    = cloneProcs(procs);
    const done = new Set();
    const tl   = [];
    let t = 0;
    while (done.size < p.length) {
        const avail = p.filter(x => !done.has(x.pid) && x.arrival <= t);
        if (!avail.length) {
            const nxt = Math.min(...p.filter(x => !done.has(x.pid)).map(x => x.arrival));
            addBlock(tl, null, t, nxt); t = nxt; continue;
        }
        avail.sort((a,b) => a.burst - b.burst || a.arrival - b.arrival || a.pid - b.pid);
        const cur = avail[0];
        addBlock(tl, cur.pid, t, t + cur.burst);
        t += cur.burst;
        done.add(cur.pid);
    }
    const m = computeMetrics(procs, tl);
    return { algorithm: 'SJF Non-Preemptive', timeline: tl, metrics: m, summary: computeSummary(m, tl) };
}

/* ─────────────────────────────────────────────
   ALGORITHM 3 : SRTF
───────────────────────────────────────────── */
function runSRTF(procs) {
    const p  = cloneProcs(procs);
    const tl = [];
    let t = 0, done = 0;
    while (done < p.length) {
        const avail = p.filter(x => x.arrival <= t && x.remaining > 0);
        if (!avail.length) {
            const nxt = Math.min(...p.filter(x => x.remaining > 0).map(x => x.arrival));
            addBlock(tl, null, t, nxt); t = nxt; continue;
        }
        avail.sort((a,b) => a.remaining - b.remaining || a.arrival - b.arrival || a.pid - b.pid);
        const cur = avail[0];
        const futureArrivals = p.filter(x => x.arrival > t && x.remaining > 0).map(x => x.arrival);
        let nxt = t + cur.remaining;
        futureArrivals.forEach(fa => { if (fa < nxt) nxt = fa; });
        const run = nxt - t;
        addBlock(tl, cur.pid, t, nxt);
        cur.remaining -= run;
        t = nxt;
        if (cur.remaining === 0) done++;
    }
    const m = computeMetrics(procs, tl);
    return { algorithm: 'SRTF (SJF Preemptive)', timeline: tl, metrics: m, summary: computeSummary(m, tl) };
}

/* ─────────────────────────────────────────────
   ALGORITHM 4 : Round Robin
───────────────────────────────────────────── */
function runRR(procs, quantum) {
    const p   = cloneProcs([...procs].sort((a,b) => a.arrival - b.arrival || a.pid - b.pid));
    const tl  = [];
    const q   = [];
    const inQ = new Set();
    let t = 0, done = 0;

    p.forEach(proc => {
        if (proc.arrival <= t && !inQ.has(proc.pid)) { q.push(proc.pid); inQ.add(proc.pid); }
    });

    let safety = 0;
    while (done < p.length && safety++ < 100000) {
        if (!q.length) {
            const nxt = Math.min(...p.filter(x => x.remaining > 0).map(x => x.arrival));
            if (!isFinite(nxt)) break;
            addBlock(tl, null, t, nxt);
            t = nxt;
            p.forEach(proc => {
                if (proc.arrival <= t && !inQ.has(proc.pid) && proc.remaining > 0) {
                    q.push(proc.pid); inQ.add(proc.pid);
                }
            });
            continue;
        }
        const curId = q.shift();
        inQ.delete(curId);
        const cur   = p.find(x => x.pid === curId);
        const run   = Math.min(cur.remaining, quantum);
        const end_t = t + run;
        addBlock(tl, curId, t, end_t);
        cur.remaining -= run;
        t = end_t;
        const newArrivals = p.filter(x => x.arrival <= t && !inQ.has(x.pid) && x.remaining > 0 && x.pid !== curId);
        newArrivals.forEach(x => { q.push(x.pid); inQ.add(x.pid); });
        if (cur.remaining === 0) { done++; }
        else { q.push(curId); inQ.add(curId); }
    }
    const m = computeMetrics(procs, tl);
    return { algorithm: `Round Robin (q=${quantum})`, timeline: tl, metrics: m, summary: computeSummary(m, tl) };
}

/* ─────────────────────────────────────────────
   ALGORITHM 5 : Priority Non-Preemptive
───────────────────────────────────────────── */
function runPriorityNP(procs) {
    const p    = cloneProcs(procs);
    const done = new Set();
    const tl   = [];
    let t = 0;
    while (done.size < p.length) {
        const avail = p.filter(x => !done.has(x.pid) && x.arrival <= t);
        if (!avail.length) {
            const nxt = Math.min(...p.filter(x => !done.has(x.pid)).map(x => x.arrival));
            addBlock(tl, null, t, nxt); t = nxt; continue;
        }
        avail.sort((a,b) => a.priority - b.priority || a.arrival - b.arrival || a.pid - b.pid);
        const cur = avail[0];
        addBlock(tl, cur.pid, t, t + cur.burst);
        t += cur.burst;
        done.add(cur.pid);
    }
    const m = computeMetrics(procs, tl);
    return { algorithm: 'Priority Non-Preemptive', timeline: tl, metrics: m, summary: computeSummary(m, tl) };
}

/* ─────────────────────────────────────────────
   ALGORITHM 6 : Priority Preemptive
───────────────────────────────────────────── */
function runPriorityP(procs) {
    const p  = cloneProcs(procs);
    const tl = [];
    let t = 0, done = 0;
    while (done < p.length) {
        const avail = p.filter(x => x.arrival <= t && x.remaining > 0);
        if (!avail.length) {
            const nxt = Math.min(...p.filter(x => x.remaining > 0).map(x => x.arrival));
            addBlock(tl, null, t, nxt); t = nxt; continue;
        }
        avail.sort((a,b) => a.priority - b.priority || a.arrival - b.arrival || a.pid - b.pid);
        const cur = avail[0];
        const futureHigher = p.filter(x => x.arrival > t && x.remaining > 0 && x.priority < cur.priority).map(x => x.arrival);
        let nxt = t + cur.remaining;
        futureHigher.forEach(fa => { if (fa < nxt) nxt = fa; });
        const run = nxt - t;
        addBlock(tl, cur.pid, t, nxt);
        cur.remaining -= run;
        t = nxt;
        if (cur.remaining === 0) done++;
    }
    const m = computeMetrics(procs, tl);
    return { algorithm: 'Priority Preemptive', timeline: tl, metrics: m, summary: computeSummary(m, tl) };
}

/* ─────────────────────────────────────────────
   DISPATCH
───────────────────────────────────────────── */
function dispatch(procs, algo, quantum) {
    switch (algo) {
        case 'FCFS':   return runFCFS(procs);
        case 'SJF_NP': return runSJF(procs);
        case 'SRTF':   return runSRTF(procs);
        case 'RR':     return runRR(procs, quantum);
        case 'PRI_NP': return runPriorityNP(procs);
        case 'PRI_P':  return runPriorityP(procs);
        default:       return null;
    }
}

/* ─────────────────────────────────────────────
   RENDERING
───────────────────────────────────────────── */
const UNIT_PX = 28;

function renderGantt(timeline, procs) {
    const container = document.getElementById('gantt-output');
    container.innerHTML = '';
    if (!timeline || !timeline.length) {
        container.innerHTML = emptyState('No timeline data');
        return;
    }

    const totalTime = Math.max(...timeline.map(b => b.end));
    const scale = Math.max(UNIT_PX, Math.min(56, Math.floor(800 / totalTime)));

    const badge = document.getElementById('gantt-time-badge');
    if (badge) badge.textContent = `${totalTime} time units`;

    const colorMap = {};
    procs.forEach(p => { colorMap[p.pid] = PROC_COLORS[p.colorIdx % PROC_COLORS.length]; });

    const wrapper = document.createElement('div');
    wrapper.className = 'gantt-wrapper';

    const track = document.createElement('div');
    track.className = 'gantt-track';

    for (const block of timeline) {
        const w   = (block.end - block.start) * scale;
        const div = document.createElement('div');
        div.className = 'gantt-block';
        div.style.width = `${w}px`;
        div.title = block.pid === null
            ? `IDLE [${block.start}–${block.end}]`
            : `P${block.pid+1} [${block.start}–${block.end}] (${block.end - block.start} units)`;

        if (block.pid === null) {
            div.classList.add('idle');
            div.textContent = (block.end - block.start) >= 1 ? 'IDLE' : '';
        } else {
            const [c1, c2] = colorMap[block.pid];
            div.style.background = `linear-gradient(160deg,${c1},${c2})`;
            div.style.color = '#fff';
            const label = procs.find(p => p.pid === block.pid)?.name || `P${block.pid+1}`;
            div.textContent = w > 24 ? label : '';
            div.style.animationDelay = `${block.start * 0.015}s`;
        }
        track.appendChild(div);
    }

    const labelRow = document.createElement('div');
    labelRow.className = 'gantt-labels';
    labelRow.style.width = `${totalTime * scale + 12}px`;

    const labelSet = new Set([0, totalTime]);
    timeline.forEach(b => { labelSet.add(b.start); labelSet.add(b.end); });
    [...labelSet].sort((a,b) => a-b).forEach(t => {
        const lbl = document.createElement('span');
        lbl.className = 'gantt-label';
        lbl.style.left = `${t * scale + 6}px`;
        lbl.textContent = t;
        labelRow.appendChild(lbl);
    });

    const legendRow = document.createElement('div');
    legendRow.className = 'legend-row';
    procs.forEach(p => {
        const [c1] = PROC_COLORS[p.colorIdx % PROC_COLORS.length];
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `<div class="legend-dot" style="background:${c1}"></div>${p.name} (AT=${p.arrival}, BT=${p.burst})`;
        legendRow.appendChild(item);
    });

    wrapper.appendChild(track);
    wrapper.appendChild(labelRow);
    wrapper.appendChild(legendRow);
    container.appendChild(wrapper);
}

function renderMetrics(metrics, procs) {
    const wrap = document.getElementById('metrics-output');
    if (!metrics || !metrics.length) {
        wrap.innerHTML = emptyState('Run simulation to see metrics');
        return;
    }
    const colorMap = {};
    procs.forEach(p => { colorMap[p.pid] = PROC_COLORS[p.colorIdx % PROC_COLORS.length]; });

    const avgWT  = (metrics.reduce((s,m) => s + m.waiting, 0) / metrics.length).toFixed(2);
    const avgTAT = (metrics.reduce((s,m) => s + m.turnaround, 0) / metrics.length).toFixed(2);

    // tip attribute names for tooltip system
    const tipNames = ['', 'Arrival', 'Burst', 'Priority', 'Completion', 'Turnaround Time', 'Waiting Time', 'Response Time'];

    wrap.innerHTML = `
    <div class="metrics-table-wrap">
    <table class="metrics-table">
      <thead>
        <tr>
          <th>Process</th>
          ${tipNames.slice(1).map(t => `<th${t ? ` data-tip="${t}"` : ''}>${t || ''}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${metrics.map(m => {
            const [c1] = colorMap[m.pid] || ['#4f8ef7','#2d6ef0'];
            return `<tr>
              <td><span class="pid-badge">
                <span class="pid-dot" style="background:${c1};box-shadow:0 0 5px ${c1}88"></span>
                <strong>${m.name}</strong>
              </span></td>
              <td>${m.arrival}</td>
              <td>${m.burst}</td>
              <td>${m.priority}</td>
              <td><strong style="color:var(--text-primary)">${m.completion}</strong></td>
              <td>${m.turnaround}</td>
              <td style="color:var(--amber);font-weight:600">${m.waiting}</td>
              <td>${m.response}</td>
            </tr>`;
        }).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5" style="text-align:right;font-size:10px;letter-spacing:1px">AVERAGES →</td>
          <td class="avg-val">${avgTAT}</td>
          <td class="avg-val">${avgWT}</td>
          <td style="color:var(--text-muted)">—</td>
        </tr>
      </tfoot>
    </table>
    </div>`;
}

function renderSummary(summary, algoName) {
    const wrap = document.getElementById('summary-output');
    if (!summary) { wrap.innerHTML = ''; return; }

    const algoLabel = document.getElementById('algo-label');
    if (algoLabel) algoLabel.textContent = algoName;

    const resultTime = document.getElementById('result-time');
    if (resultTime) resultTime.textContent = new Date().toLocaleTimeString();

    const cards = [
        { val: summary.avgWT,           label: 'Avg Wait Time',   icon: '⏱' },
        { val: summary.avgTAT,          label: 'Avg Turnaround',  icon: '↺' },
        { val: summary.avgRT,           label: 'Avg Response',    icon: '⚡' },
        { val: summary.cpuUtil + '%',   label: 'CPU Utilization', icon: '🖥' },
        { val: summary.throughput,      label: 'Throughput',      icon: '◈' },
        { val: summary.totalTime,       label: 'Total Time',      icon: '⌛' },
    ];

    wrap.innerHTML = `<div class="summary-grid">
        ${cards.map((c,i) => `
            <div class="stat-card" style="animation-delay:${i*0.07}s">
                <span class="stat-icon">${c.icon}</span>
                <div class="stat-value">${c.val}</div>
                <div class="stat-label">${c.label}</div>
            </div>`).join('')}
    </div>`;

    // Count-up animation
    requestAnimationFrame(() => {
        document.querySelectorAll('.stat-value').forEach(el => {
            const raw = el.textContent.replace('%','').trim();
            const num = parseFloat(raw);
            if (!isNaN(num)) {
                const hasPct  = el.textContent.includes('%');
                const decimals = raw.includes('.') ? (raw.split('.')[1] || '').length : 0;
                const suffix  = hasPct ? '%' : '';
                animateCountUp(el, raw, decimals, suffix);
            }
        });
    });
}

function renderComparison(results) {
    const wrap = document.getElementById('compare-output');
    if (!results || !results.length) { wrap.innerHTML = ''; return; }

    const minWT  = Math.min(...results.map(r => +r.summary.avgWT));
    const minTAT = Math.min(...results.map(r => +r.summary.avgTAT));
    const maxCPU = Math.max(...results.map(r => +r.summary.cpuUtil));

    const ranked = [...results].sort((a,b) => +a.summary.avgWT - +b.summary.avgWT);
    const rankMap = {};
    ranked.forEach((r,i) => { rankMap[r.algorithm] = i + 1; });

    const medals = ['🥇','🥈','🥉'];

    wrap.innerHTML = `
    <table class="comparison-table">
      <thead>
        <tr>
          <th style="text-align:left">Algorithm</th>
          <th>Avg WT</th><th>Avg TAT</th><th>CPU Util</th><th>Throughput</th>
        </tr>
      </thead>
      <tbody>
        ${results.map(r => {
            const rank = rankMap[r.algorithm];
            const rankClass = rank <= 3 ? `rank-${rank}` : '';
            const medal = rank <= 3
                ? `<span class="rank-badge">${medals[rank-1]}</span>`
                : `<span style="display:inline-block;width:30px;text-align:center;color:var(--text-muted);font-size:11px">#${rank}</span>`;
            return `<tr class="${rankClass}">
              <td class="algo-name">${medal}${r.algorithm}</td>
              <td class="${+r.summary.avgWT === minWT ? 'best-val' : ''}">${r.summary.avgWT}</td>
              <td class="${+r.summary.avgTAT === minTAT ? 'best-val' : ''}">${r.summary.avgTAT}</td>
              <td class="${+r.summary.cpuUtil === maxCPU ? 'best-val' : ''}">${r.summary.cpuUtil}%</td>
              <td>${r.summary.throughput}</td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div class="compare-legend">
      ★ = best value in column &nbsp;·&nbsp; 🥇 Ranked by Avg Waiting Time &nbsp;·&nbsp; Lower WT/TAT = Better &nbsp;·&nbsp; Higher CPU util = Better
    </div>`;
}

function emptyState(msg) {
    return `<div class="empty-state">
        <div class="empty-icon">⚙️</div>
        <p>${msg}</p>
    </div>`;
}

/* ─────────────────────────────────────────────
   TOAST
───────────────────────────────────────────── */
function showToast(msg, type='ok') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast ${type === 'error' ? 'error' : ''} show`;
    setTimeout(() => toast.classList.remove('show'), 2800);
}

/* ─────────────────────────────────────────────
   LIVE STATUS BADGE
───────────────────────────────────────────── */
function setStatus(state) {
    const badge = document.getElementById('live-badge');
    const text  = document.getElementById('badge-text');
    if (!badge || !text) return;
    badge.dataset.status = state;
    const labels = {
        idle:      'Awaiting Input',
        running:   'Processing...',
        done:      'Simulation Complete',
        comparing: 'Comparing Algorithms...'
    };
    text.textContent = labels[state] || state;
}

/* ─────────────────────────────────────────────
   RUN BUTTON LOADER
───────────────────────────────────────────── */
function setBtnLoading(loading) {
    const btn = document.getElementById('run-btn');
    if (!btn) return;
    if (loading) {
        btn.classList.add('loading');
        btn.disabled = true;
        btn.style.cursor = 'not-allowed';
    } else {
        btn.classList.remove('loading');
        btn.disabled = false;
        btn.style.cursor = '';
    }
}

/* ─────────────────────────────────────────────
   DARK / LIGHT MODE TOGGLE
───────────────────────────────────────────── */
function initTheme() {
    let saved = 'dark';
    try { saved = localStorage.getItem('cpu_sim_theme') || 'dark'; } catch(e) {}
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon(saved);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next    = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('cpu_sim_theme', next); } catch(e) {}
    updateThemeIcon(next);
    showToast(next === 'dark' ? '🌙 Dark mode activated' : '☀ Light mode activated');
}

function updateThemeIcon(theme) {
    const icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = theme === 'dark' ? '☀' : '🌙';
}

/* ─────────────────────────────────────────────
   COUNT-UP ANIMATION
───────────────────────────────────────────── */
function animateCountUp(el, target, decimals = 2, suffix = '') {
    const duration = 700;
    const start    = performance.now();
    const to       = parseFloat(target);

    function step(now) {
        const elapsed  = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const ease     = 1 - Math.pow(1 - progress, 3);
        const current  = to * ease;
        el.textContent = current.toFixed(decimals) + suffix;
        if (progress < 1) requestAnimationFrame(step);
        else el.textContent = target + suffix;
    }
    el.classList.add('counting');
    setTimeout(() => el.classList.remove('counting'), 400);
    requestAnimationFrame(step);
}

/* ─────────────────────────────────────────────
   METRIC TOOLTIPS
───────────────────────────────────────────── */
const METRIC_TIPS = {
    'Waiting Time':    { title: 'Waiting Time',    desc: 'Total time the process spent in the ready queue waiting for CPU allocation.' },
    'Turnaround Time': { title: 'Turnaround Time', desc: 'Total time from arrival to completion: Turnaround = Completion − Arrival.' },
    'Response Time':   { title: 'Response Time',   desc: 'Time from arrival until the process first gets CPU access. Critical for interactive systems.' },
    'Completion':      { title: 'Completion Time', desc: 'The absolute time when the process finished execution.' },
    'Burst':           { title: 'Burst Time',      desc: 'The total CPU time required by the process to complete execution.' },
    'Arrival':         { title: 'Arrival Time',    desc: 'The time at which the process enters the ready queue.' },
    'Priority':        { title: 'Priority',        desc: 'Lower number = Higher priority. Used by Priority scheduling algorithms.' },
};

function setupMetricTooltips() {
    const tooltip = document.getElementById('metric-tooltip');
    if (!tooltip) return;

    document.addEventListener('mouseover', e => {
        const th = e.target.closest('th[data-tip]');
        if (!th) { tooltip.style.display = 'none'; return; }
        const tip = METRIC_TIPS[th.dataset.tip];
        if (!tip) return;
        tooltip.innerHTML = `<strong>${tip.title}</strong>${tip.desc}`;
        tooltip.style.display = 'block';
    });

    document.addEventListener('mousemove', e => {
        if (tooltip.style.display === 'none') return;
        tooltip.style.left = (e.clientX + 14) + 'px';
        tooltip.style.top  = (e.clientY - 10) + 'px';
    });

    document.addEventListener('mouseout', e => {
        if (!e.target.closest('th[data-tip]')) return;
        tooltip.style.display = 'none';
    });
}

/* ─────────────────────────────────────────────
   SMART PERFORMANCE INSIGHTS
───────────────────────────────────────────── */
function renderInsights(allResults, currentResult) {
    const panel = document.getElementById('insights-panel');
    const wrap  = document.getElementById('insights-output');
    if (!panel || !wrap || !allResults || !allResults.length) return;

    panel.style.display = 'block';
    panel.classList.add('visible');

    const best    = allResults.reduce((a,b) => +a.summary.avgWT < +b.summary.avgWT ? a : b);
    const fastest = allResults.reduce((a,b) => +a.summary.totalTime < +b.summary.totalTime ? a : b);
    const maxCPU  = allResults.reduce((a,b) => +a.summary.cpuUtil > +b.summary.cpuUtil ? a : b);

    const avgBurst   = currentResult.metrics.reduce((s,m) => s + m.burst, 0) / currentResult.metrics.length;
    const hasPriority = currentResult.metrics.some(m => m.priority !== currentResult.metrics[0].priority);
    const procCount  = currentResult.metrics.length;

    let recommendAlgo = '', recommendReason = '';
    if (hasPriority && procCount <= 8) {
        recommendAlgo   = 'Priority Preemptive';
        recommendReason = 'Your processes have varied priorities. Priority Preemptive ensures critical tasks are handled first with real-time responsiveness.';
    } else if (avgBurst <= 5) {
        recommendAlgo   = 'SRTF (Preemptive SJF)';
        recommendReason = 'Short burst times detected. SRTF minimizes average waiting time by always running the shortest remaining task.';
    } else if (procCount >= 6) {
        recommendAlgo   = 'Round Robin';
        recommendReason = 'High process count detected. Round Robin ensures fair CPU sharing and good response times for all processes.';
    } else {
        recommendAlgo   = 'SJF Non-Preemptive';
        recommendReason = 'Moderate workload detected. SJF minimizes average waiting time without context-switch overhead.';
    }

    const insights = [
        { icon: '🏆', label: 'Best Overall Algorithm', value: best.algorithm,         sub: `Lowest avg wait: ${best.summary.avgWT} units`,   winner: true,  color: 'var(--gold)' },
        { icon: '⚡', label: 'Fastest Completion',     value: fastest.algorithm,      sub: `Total time: ${fastest.summary.totalTime} units`,  color: 'var(--amber)' },
        { icon: '💻', label: 'Best for Interactive',   value: 'Round Robin',          sub: 'Fair time-slicing · Low response time',           color: 'var(--cyan)' },
        { icon: '📦', label: 'Best for Batch',         value: 'SJF / SRTF',          sub: 'Minimizes avg waiting · High throughput',          color: 'var(--green)' },
        { icon: '🎯', label: 'Best Priority Handling', value: 'Priority Preemptive',  sub: 'Urgent tasks get CPU first',                      color: 'var(--purple)' },
        { icon: '📊', label: 'Highest CPU Utilization',value: maxCPU.algorithm,       sub: `Utilization: ${maxCPU.summary.cpuUtil}%`,         color: 'var(--accent-bright)' },
    ];

    wrap.innerHTML = `
        <div class="insights-grid">
            ${insights.map((ins, i) => `
                <div class="insight-card ${ins.winner ? 'winner' : ''}" style="animation-delay:${i * 0.08}s">
                    ${ins.winner ? '<span class="insight-winner-crown">👑</span>' : ''}
                    <span class="insight-card-icon">${ins.icon}</span>
                    <div class="insight-card-label">${ins.label}</div>
                    <div class="insight-card-value" style="color:${ins.winner ? 'var(--gold)' : ins.color}">${ins.value}</div>
                    <div class="insight-card-sub">${ins.sub}</div>
                </div>
            `).join('')}
        </div>
        <div class="insights-recommend" style="animation-delay:0.5s">
            <div class="insights-recommend-icon">🧠</div>
            <div class="insights-recommend-body">
                <h4>Recommended for Your Data</h4>
                <p><strong style="color:var(--accent-bright)">${recommendAlgo}</strong> — ${recommendReason}</p>
            </div>
        </div>`;
}

/* ─────────────────────────────────────────────
   SIMULATION HISTORY
───────────────────────────────────────────── */
let simHistory = [];

function loadHistory() {
    try { simHistory = JSON.parse(localStorage.getItem('cpu_sim_history_v2') || '[]'); }
    catch(e) { simHistory = []; }
    renderHistory();
}

function saveToHistory(algo, summary) {
    simHistory.unshift({
        algo,
        avgWT:   summary.avgWT,
        cpuUtil: summary.cpuUtil,
        time:    new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }),
        date:    new Date().toLocaleDateString([], { month:'short', day:'numeric' })
    });
    if (simHistory.length > 5) simHistory.pop();
    try { localStorage.setItem('cpu_sim_history_v2', JSON.stringify(simHistory)); } catch(e) {}
    renderHistory();
}

function getAlgoColor(algo) {
    const map = {
        'fcfs': '#4f8ef7', 'sjf': '#00e5a0', 'srtf': '#b06bff',
        'round': '#ffb347', 'priority non': '#ff4f6e', 'priority preemptive': '#00d4ff'
    };
    const lower = algo.toLowerCase();
    for (const [key, col] of Object.entries(map)) {
        if (lower.startsWith(key)) return col;
    }
    return '#4f8ef7';
}

function renderHistory() {
    const list  = document.getElementById('history-list');
    const count = document.getElementById('history-count');
    if (!list) return;
    if (count) count.textContent = `${simHistory.length} run${simHistory.length !== 1 ? 's' : ''}`;
    if (!simHistory.length) {
        list.innerHTML = '<div class="history-empty">No simulations yet.<br>Run one to see history.</div>';
        return;
    }
    list.innerHTML = simHistory.map((h, i) => {
        const col = getAlgoColor(h.algo);
        return `<div class="history-item" style="animation-delay:${i*0.06}s">
            <div class="history-algo-dot" style="background:${col};box-shadow:0 0 6px ${col}66"></div>
            <div class="history-body">
                <div class="history-algo-name">${h.algo}</div>
                <div class="history-meta">
                    <span>WT: <span class="hmwt">${h.avgWT}</span></span>
                    <span>CPU: <span class="hmcpu">${h.cpuUtil}%</span></span>
                </div>
            </div>
            <div class="history-time">${h.time}<br>${h.date}</div>
        </div>`;
    }).join('');
}

/* ─────────────────────────────────────────────
   EXPORT / DOWNLOAD REPORT  (FIXED)
───────────────────────────────────────────── */
function exportReport() {
    if (!window._lastResult) {
        showToast('Run a simulation first!', 'error');
        return;
    }

    const result  = window._lastResult;
    const procs   = window._lastProcs || [];
    const now     = new Date();
    const dateStr = now.toLocaleDateString([], { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    const timeStr = now.toLocaleTimeString();

    // Build a standalone printable HTML document and open it in a new window
    const metricsRows = (result.metrics || []).map(m =>
        `<tr>
            <td>${m.name}</td>
            <td>${m.arrival}</td>
            <td>${m.burst}</td>
            <td>${m.priority}</td>
            <td>${m.completion}</td>
            <td>${m.turnaround}</td>
            <td>${m.waiting}</td>
            <td>${m.response}</td>
        </tr>`
    ).join('');

    const s = result.summary;
    const reportHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>CPU Scheduler Report — ${result.algorithm}</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 900px; margin: 40px auto; color: #111; }
  h1   { font-size: 22px; border-bottom: 2px solid #333; padding-bottom: 10px; }
  h2   { font-size: 15px; margin-top: 28px; color: #444; }
  p    { font-size: 13px; color: #555; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
  th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: center; }
  th { background: #f0f0f0; font-weight: bold; }
  tr:nth-child(even) { background: #fafafa; }
  .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 14px; }
  .stat { background: #f5f7ff; border: 1px solid #dde; border-radius: 8px; padding: 14px; text-align: center; }
  .stat .val { font-size: 22px; font-weight: 800; color: #2563eb; }
  .stat .lbl { font-size: 11px; color: #666; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px; }
  .footer-note { font-size: 11px; color: #aaa; margin-top: 32px; border-top: 1px solid #eee; padding-top: 10px; }
  @media print { button { display: none; } }
</style>
</head>
<body>
<h1>CPU Scheduler Simulator — Simulation Report</h1>
<p><strong>Algorithm:</strong> ${result.algorithm}</p>
<p><strong>Generated:</strong> ${dateStr} at ${timeStr}</p>
<p><strong>Processes:</strong> ${(result.metrics || []).length}</p>

<h2>Summary Statistics</h2>
<div class="summary-grid">
  <div class="stat"><div class="val">${s.avgWT}</div><div class="lbl">Avg Wait Time</div></div>
  <div class="stat"><div class="val">${s.avgTAT}</div><div class="lbl">Avg Turnaround</div></div>
  <div class="stat"><div class="val">${s.avgRT}</div><div class="lbl">Avg Response</div></div>
  <div class="stat"><div class="val">${s.cpuUtil}%</div><div class="lbl">CPU Utilization</div></div>
  <div class="stat"><div class="val">${s.throughput}</div><div class="lbl">Throughput</div></div>
  <div class="stat"><div class="val">${s.totalTime}</div><div class="lbl">Total Time</div></div>
</div>

<h2>Process Metrics</h2>
<table>
  <thead>
    <tr>
      <th>Process</th><th>Arrival</th><th>Burst</th><th>Priority</th>
      <th>Completion</th><th>Turnaround</th><th>Waiting</th><th>Response</th>
    </tr>
  </thead>
  <tbody>${metricsRows}</tbody>
</table>

<div class="footer-note">
  CPU Scheduler Simulator v2.1 &nbsp;·&nbsp; Operating Systems Lab &nbsp;·&nbsp; All logic runs client-side
</div>
<br>
<button onclick="window.print()" style="padding:10px 24px;font-size:14px;cursor:pointer;background:#2563eb;color:#fff;border:none;border-radius:6px">
  🖨 Print / Save as PDF
</button>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(reportHTML);
        win.document.close();
        showToast('📄 Report opened — use Print to save as PDF');
    } else {
        showToast('Pop-up blocked. Please allow pop-ups and try again.', 'error');
    }
}

/* ─────────────────────────────────────────────
   MAIN SIMULATE  (single, clean implementation)
───────────────────────────────────────────── */
function simulate() {
    const procs = collectProcesses();
    if (!procs || !procs.length) {
        showToast('Please add at least one valid process.', 'error');
        return;
    }

    setStatus('running');
    setBtnLoading(true);

    const cmpBtn = document.getElementById('compare-btn');
    if (cmpBtn) { cmpBtn.disabled = true; cmpBtn.style.opacity = '0.6'; }

    setTimeout(() => {
        const algo    = document.querySelector('input[name="algo"]:checked')?.value || 'FCFS';
        const quantum = parseInt(document.getElementById('quantum').value) || 2;

        const result = dispatch(procs, algo, quantum);
        if (!result) {
            showToast('Unknown algorithm selected.', 'error');
            setStatus('idle');
            setBtnLoading(false);
            if (cmpBtn) { cmpBtn.disabled = false; cmpBtn.style.opacity = ''; }
            return;
        }

        renderGantt(result.timeline, procs);
        renderMetrics(result.metrics, procs);
        renderSummary(result.summary, result.algorithm);

        // Run all algorithms for insights
        const allResults = [
            runFCFS(procs), runSJF(procs), runSRTF(procs),
            runRR(procs, quantum), runPriorityNP(procs), runPriorityP(procs)
        ];
        renderInsights(allResults, result);

        // Save for history and export
        saveToHistory(result.algorithm, result.summary);
        window._lastResult = result;
        window._lastProcs  = procs;

        document.getElementById('results-area').style.display = 'block';
        document.querySelectorAll('.reveal:not(.visible)').forEach(el => el.classList.add('visible'));
        document.getElementById('results-area').scrollIntoView({ behavior: 'smooth', block: 'start' });
        showToast(`✓ ${result.algorithm} simulation complete`);

        setStatus('done');
        setBtnLoading(false);
        if (cmpBtn) { cmpBtn.disabled = false; cmpBtn.style.opacity = ''; }
    }, 220);
}

/* ─────────────────────────────────────────────
   COMPARE ALL
───────────────────────────────────────────── */
function compareAll() {
    const procs = collectProcesses();
    if (!procs || !procs.length) {
        showToast('Please add at least one valid process.', 'error');
        return;
    }

    setStatus('comparing');
    const btn = document.getElementById('compare-btn');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.7'; }

    setTimeout(() => {
        const quantum = parseInt(document.getElementById('quantum').value) || 2;
        const results = [
            runFCFS(procs), runSJF(procs), runSRTF(procs),
            runRR(procs, quantum), runPriorityNP(procs), runPriorityP(procs)
        ];

        const section = document.getElementById('compare-section');
        section.style.display = 'block';
        section.classList.add('visible');
        renderComparison(results);
        section.scrollIntoView({ behavior: 'smooth' });
        showToast('✓ All 6 algorithms compared');
        setStatus('done');

        if (btn) { btn.disabled = false; btn.style.opacity = ''; }
    }, 200);
}

/* ─────────────────────────────────────────────
   DOM READY — single, clean init
───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    // Load sample data on startup
    loadSampleData();

    // Process table buttons
    document.getElementById('add-row-btn').addEventListener('click', () => addRow());
    document.getElementById('sample-btn').addEventListener('click', loadSampleData);

    // Main action buttons
    document.getElementById('run-btn').addEventListener('click', simulate);
    document.getElementById('compare-btn').addEventListener('click', compareAll);

    // Export button — FIXED: calls exportReport() with no args; uses window._lastResult internally
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) exportBtn.addEventListener('click', exportReport);

    // Theme toggle
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
    initTheme();

    // Quantum row toggle
    document.querySelectorAll('input[name="algo"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const qRow = document.getElementById('quantum-row');
            const isRR = radio.value === 'RR';
            qRow.style.opacity   = isRR ? '1' : '0.4';
            qRow.style.transform = isRR ? 'scale(1.01)' : '';
            document.getElementById('quantum').disabled = !isRR;
        });
    });

    // Metric tooltips
    setupMetricTooltips();

    // Load history
    loadHistory();

    // Status
    setStatus('idle');

    // Initial empty states
    document.getElementById('gantt-output').innerHTML   = emptyState('Run simulation to see Gantt chart');
    document.getElementById('metrics-output').innerHTML = emptyState('Run simulation to see metrics');

    // Scroll-reveal all panels with stagger
    setTimeout(() => {
        document.querySelectorAll('.reveal').forEach((el, i) => {
            setTimeout(() => el.classList.add('visible'), i * 80);
        });
    }, 100);
});
