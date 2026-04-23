/* ============================================================
   CPU Scheduler Simulator — script.js
   All 6 scheduling algorithms implemented in JavaScript
   (mirrors the C backend logic for browser-side simulation)
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
let processes = [];   // { pid, name, arrival, burst, priority }
let rowCount  = 0;

function makeProcess(pid, name, arrival, burst, priority) {
    return { pid, name, arrival: +arrival, burst: +burst, priority: +priority };
}

/* ─────────────────────────────────────────────
   PROCESS TABLE MANAGEMENT
───────────────────────────────────────────── */
function addRow(name='', arrival='', burst='', priority='1') {
    const tbody = document.querySelector('#process-table tbody');
    const idx   = rowCount++;
    const tr    = document.createElement('tr');
    tr.dataset.idx = idx;

    const [c1,c2] = PROC_COLORS[idx % PROC_COLORS.length];
    const pName   = name || `P${tbody.children.length + 1}`;

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

    /* Animate row in */
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
        const at = +tr.querySelector('.at-input').value;
        const bt = +tr.querySelector('.bt-input').value;
        const pr = +tr.querySelector('.pr-input').value;
        if (isNaN(at)||isNaN(bt)||isNaN(pr)||bt<1) { valid=false; return; }
        const dot   = tr.querySelector('.pid-dot');
        const color = dot ? dot.style.background : PROC_COLORS[i%PROC_COLORS.length][0];
        result.push({ pid:i, name:`P${i+1}`, arrival:at, burst:bt, priority:pr, color, colorIdx:i });
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
        return { ...p, completion:ct, turnaround:tat, waiting:wt, response:rt };
    }).filter(Boolean);
}

function computeSummary(metrics, timeline) {
    const n   = metrics.length;
    const tot = Math.max(...timeline.map(b => b.end));
    const busy= timeline.filter(b=>b.pid!==null).reduce((s,b)=>s+(b.end-b.start),0);
    return {
        avgWT  : (metrics.reduce((s,m)=>s+m.waiting,0)/n).toFixed(2),
        avgTAT : (metrics.reduce((s,m)=>s+m.turnaround,0)/n).toFixed(2),
        avgRT  : (metrics.reduce((s,m)=>s+m.response,0)/n).toFixed(2),
        cpuUtil: ((busy/tot)*100).toFixed(1),
        throughput: (n/tot).toFixed(4),
        totalTime: tot
    };
}

/* ─────────────────────────────────────────────
   ALGORITHM 1 : FCFS
───────────────────────────────────────────── */
function runFCFS(procs) {
    const p   = cloneProcs([...procs].sort((a,b)=>a.arrival-b.arrival||a.pid-b.pid));
    const tl  = [];
    let t = 0;
    for (const proc of p) {
        if (t < proc.arrival) { addBlock(tl, null, t, proc.arrival); t = proc.arrival; }
        addBlock(tl, proc.pid, t, t + proc.burst);
        t += proc.burst;
    }
    const m = computeMetrics(procs, tl);
    return { algorithm:'FCFS', timeline:tl, metrics:m, summary:computeSummary(m,tl) };
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
            const nxt = Math.min(...p.filter(x=>!done.has(x.pid)).map(x=>x.arrival));
            addBlock(tl, null, t, nxt); t = nxt; continue;
        }
        avail.sort((a,b)=>a.burst-b.burst||a.arrival-b.arrival||a.pid-b.pid);
        const cur = avail[0];
        addBlock(tl, cur.pid, t, t + cur.burst);
        t += cur.burst;
        done.add(cur.pid);
    }
    const m = computeMetrics(procs, tl);
    return { algorithm:'SJF Non-Preemptive', timeline:tl, metrics:m, summary:computeSummary(m,tl) };
}

/* ─────────────────────────────────────────────
   ALGORITHM 3 : SRTF
───────────────────────────────────────────── */
function runSRTF(procs) {
    const p  = cloneProcs(procs);
    const tl = [];
    let t = 0;
    let done = 0;
    while (done < p.length) {
        const avail = p.filter(x => x.arrival <= t && x.remaining > 0);
        if (!avail.length) {
            const nxt = Math.min(...p.filter(x=>x.remaining>0).map(x=>x.arrival));
            addBlock(tl, null, t, nxt); t = nxt; continue;
        }
        avail.sort((a,b)=>a.remaining-b.remaining||a.arrival-b.arrival||a.pid-b.pid);
        const cur = avail[0];
        const futureArrivals = p.filter(x=>x.arrival>t&&x.remaining>0).map(x=>x.arrival);
        let nxt = t + cur.remaining;
        for (const fa of futureArrivals) if (fa < nxt) nxt = fa;
        const run = nxt - t;
        addBlock(tl, cur.pid, t, nxt);
        cur.remaining -= run;
        t = nxt;
        if (cur.remaining === 0) done++;
    }
    const m = computeMetrics(procs, tl);
    return { algorithm:'SRTF (SJF Preemptive)', timeline:tl, metrics:m, summary:computeSummary(m,tl) };
}

/* ─────────────────────────────────────────────
   ALGORITHM 4 : Round Robin
───────────────────────────────────────────── */
function runRR(procs, quantum) {
    const p   = cloneProcs([...procs].sort((a,b)=>a.arrival-b.arrival||a.pid-b.pid));
    const tl  = [];
    const q   = [];
    const inQ = new Set();
    let t = 0, done = 0;

    p.forEach(proc => { if (proc.arrival <= t && !inQ.has(proc.pid)) { q.push(proc.pid); inQ.add(proc.pid); } });

    let safety = 0;
    while (done < p.length && safety++ < 100000) {
        if (!q.length) {
            const nxt = Math.min(...p.filter(x=>x.remaining>0).map(x=>x.arrival));
            if (!isFinite(nxt)) break;
            addBlock(tl, null, t, nxt);
            t = nxt;
            p.forEach(proc => { if (proc.arrival<=t && !inQ.has(proc.pid) && proc.remaining>0) { q.push(proc.pid); inQ.add(proc.pid); }});
            continue;
        }
        const curId = q.shift();
        inQ.delete(curId);
        const cur   = p.find(x=>x.pid===curId);
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
    return { algorithm:`Round Robin (q=${quantum})`, timeline:tl, metrics:m, summary:computeSummary(m,tl) };
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
        const avail = p.filter(x=>!done.has(x.pid) && x.arrival<=t);
        if (!avail.length) {
            const nxt = Math.min(...p.filter(x=>!done.has(x.pid)).map(x=>x.arrival));
            addBlock(tl,null,t,nxt); t=nxt; continue;
        }
        avail.sort((a,b)=>a.priority-b.priority||a.arrival-b.arrival||a.pid-b.pid);
        const cur = avail[0];
        addBlock(tl, cur.pid, t, t+cur.burst);
        t += cur.burst;
        done.add(cur.pid);
    }
    const m = computeMetrics(procs, tl);
    return { algorithm:'Priority Non-Preemptive', timeline:tl, metrics:m, summary:computeSummary(m,tl) };
}

/* ─────────────────────────────────────────────
   ALGORITHM 6 : Priority Preemptive
───────────────────────────────────────────── */
function runPriorityP(procs) {
    const p  = cloneProcs(procs);
    const tl = [];
    let t = 0, done = 0;
    while (done < p.length) {
        const avail = p.filter(x=>x.arrival<=t && x.remaining>0);
        if (!avail.length) {
            const nxt = Math.min(...p.filter(x=>x.remaining>0).map(x=>x.arrival));
            addBlock(tl,null,t,nxt); t=nxt; continue;
        }
        avail.sort((a,b)=>a.priority-b.priority||a.arrival-b.arrival||a.pid-b.pid);
        const cur = avail[0];
        const futureHigher = p.filter(x=>x.arrival>t&&x.remaining>0&&x.priority<cur.priority).map(x=>x.arrival);
        let nxt = t + cur.remaining;
        futureHigher.forEach(fa => { if(fa<nxt) nxt=fa; });
        const run = nxt - t;
        addBlock(tl, cur.pid, t, nxt);
        cur.remaining -= run;
        t = nxt;
        if (cur.remaining===0) done++;
    }
    const m = computeMetrics(procs, tl);
    return { algorithm:'Priority Preemptive', timeline:tl, metrics:m, summary:computeSummary(m,tl) };
}

/* ─────────────────────────────────────────────
   DISPATCH
───────────────────────────────────────────── */
function dispatch(procs, algo, quantum) {
    switch (algo) {
        case 'FCFS':     return runFCFS(procs);
        case 'SJF_NP':   return runSJF(procs);
        case 'SRTF':     return runSRTF(procs);
        case 'RR':       return runRR(procs, quantum);
        case 'PRI_NP':   return runPriorityNP(procs);
        case 'PRI_P':    return runPriorityP(procs);
        default:         return null;
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

    const totalTime = Math.max(...timeline.map(b=>b.end));
    const scale = Math.max(UNIT_PX, Math.min(56, Math.floor(800 / totalTime)));

    // Update badge
    const badge = document.getElementById('gantt-time-badge');
    if (badge) badge.textContent = `${totalTime} time units`;

    const colorMap = {};
    procs.forEach(p => { colorMap[p.pid] = PROC_COLORS[p.colorIdx % PROC_COLORS.length]; });

    const wrapper = document.createElement('div');
    wrapper.className = 'gantt-wrapper';

    // Track
    const track = document.createElement('div');
    track.className = 'gantt-track';

    for (const block of timeline) {
        const w   = (block.end - block.start) * scale;
        const div = document.createElement('div');
        div.className = 'gantt-block';
        div.style.width = `${w}px`;
        div.title = block.pid===null
            ? `IDLE [${block.start}–${block.end}]`
            : `P${block.pid+1} [${block.start}–${block.end}] (${block.end-block.start} units)`;

        if (block.pid === null) {
            div.classList.add('idle');
            div.textContent = (block.end - block.start) >= 1 ? 'IDLE' : '';
        } else {
            const [c1,c2] = colorMap[block.pid];
            div.style.background = `linear-gradient(160deg,${c1},${c2})`;
            div.style.color      = '#fff';
            const label = procs.find(p=>p.pid===block.pid)?.name || `P${block.pid+1}`;
            div.textContent = w > 24 ? label : '';
            div.style.animationDelay = `${block.start * 0.015}s`;
        }
        track.appendChild(div);
    }

    // Time labels
    const labelRow = document.createElement('div');
    labelRow.className = 'gantt-labels';
    labelRow.style.width = `${totalTime * scale + 12}px`;

    const labelSet = new Set([0, totalTime]);
    timeline.forEach(b => { labelSet.add(b.start); labelSet.add(b.end); });
    [...labelSet].sort((a,b)=>a-b).forEach(t => {
        const lbl = document.createElement('span');
        lbl.className = 'gantt-label';
        lbl.style.left = `${t * scale + 6}px`;
        lbl.textContent = t;
        labelRow.appendChild(lbl);
    });

    // Legend
    const legendRow = document.createElement('div');
    legendRow.className = 'legend-row';
    procs.forEach(p => {
        const [c1] = PROC_COLORS[p.colorIdx % PROC_COLORS.length];
        legendRow.innerHTML += `
            <div class="legend-item">
                <div class="legend-dot" style="background:${c1}"></div>
                ${p.name} (AT=${p.arrival}, BT=${p.burst})
            </div>`;
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

    const avgWT  = (metrics.reduce((s,m)=>s+m.waiting,0)/metrics.length).toFixed(2);
    const avgTAT = (metrics.reduce((s,m)=>s+m.turnaround,0)/metrics.length).toFixed(2);

    wrap.innerHTML = `
    <div class="metrics-table-wrap">
    <table class="metrics-table">
      <thead>
        <tr>
          <th>Process</th><th>Arrival</th><th>Burst</th><th>Priority</th>
          <th>Completion</th><th>Turnaround</th><th>Waiting</th><th>Response</th>
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

    const icons  = ['⏱', '↺', '⚡', '🖥', '◈', '⌛'];
    const cards = [
        { val: summary.avgWT,          label: 'Avg Wait Time',   icon: icons[0] },
        { val: summary.avgTAT,         label: 'Avg Turnaround',  icon: icons[1] },
        { val: summary.avgRT,          label: 'Avg Response',    icon: icons[2] },
        { val: summary.cpuUtil + '%',  label: 'CPU Utilization', icon: icons[3] },
        { val: summary.throughput,     label: 'Throughput',      icon: icons[4] },
        { val: summary.totalTime,      label: 'Total Time',      icon: icons[5] },
    ];

    const algoLabel = document.getElementById('algo-label');
    if (algoLabel) algoLabel.textContent = algoName;

    const resultTime = document.getElementById('result-time');
    if (resultTime) resultTime.textContent = new Date().toLocaleTimeString();

    wrap.innerHTML = `<div class="summary-grid">
        ${cards.map((c,i) => `
            <div class="stat-card" style="animation-delay:${i*0.07}s">
                <span class="stat-icon">${c.icon}</span>
                <div class="stat-value">${c.val}</div>
                <div class="stat-label">${c.label}</div>
            </div>`).join('')}
    </div>`;
}

function renderComparison(results) {
    const wrap = document.getElementById('compare-output');
    if (!results || !results.length) { wrap.innerHTML = ''; return; }

    const minWT  = Math.min(...results.map(r=>+r.summary.avgWT));
    const minTAT = Math.min(...results.map(r=>+r.summary.avgTAT));
    const maxCPU = Math.max(...results.map(r=>+r.summary.cpuUtil));

    // Sort by avgWT for ranking
    const ranked = [...results].sort((a,b) => +a.summary.avgWT - +b.summary.avgWT);
    const rankMap = {};
    ranked.forEach((r,i) => { rankMap[r.algorithm] = i + 1; });

    const medals = ['🥇', '🥈', '🥉'];

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
            const medal = rank <= 3 ? `<span class="rank-badge">${medals[rank-1]}</span>` : `<span style="display:inline-block;width:30px;text-align:center;color:var(--text-muted);font-size:11px">#${rank}</span>`;
            return `<tr class="${rankClass}">
              <td class="algo-name">${medal}${r.algorithm}</td>
              <td class="${+r.summary.avgWT===minWT?'best-val':''}">${r.summary.avgWT}</td>
              <td class="${+r.summary.avgTAT===minTAT?'best-val':''}">${r.summary.avgTAT}</td>
              <td class="${+r.summary.cpuUtil===maxCPU?'best-val':''}">${r.summary.cpuUtil}%</td>
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
    toast.className   = `toast ${type==='error'?'error':''} show`;
    setTimeout(() => toast.classList.remove('show'), 2800);
}

/* ─────────────────────────────────────────────
   MAIN SIMULATE
───────────────────────────────────────────── */
function simulate() {
    const procs  = collectProcesses();
    if (!procs || !procs.length) {
        showToast('Please add at least one valid process.', 'error');
        return;
    }

    const btn = document.getElementById('run-btn');
    btn.classList.add('btn-loading');

    setTimeout(() => {
        const algo    = document.querySelector('input[name="algo"]:checked')?.value || 'FCFS';
        const quantum = parseInt(document.getElementById('quantum').value) || 2;

        const result = dispatch(procs, algo, quantum);
        if (!result) {
            showToast('Unknown algorithm selected.', 'error');
            btn.classList.remove('btn-loading');
            return;
        }

        renderGantt(result.timeline, procs);
        renderMetrics(result.metrics, procs);
        renderSummary(result.summary, result.algorithm);

        document.getElementById('results-area').style.display = 'block';

        /* Re-observe any new reveal elements */
        document.querySelectorAll('.reveal:not(.visible)').forEach(el => {
            el.classList.add('visible');
        });

        document.getElementById('results-area').scrollIntoView({ behavior:'smooth', block:'start' });
        showToast(`✓ ${result.algorithm} simulation complete`);
        btn.classList.remove('btn-loading');
    }, 180);
}

function compareAll() {
    const procs  = collectProcesses();
    if (!procs || !procs.length) {
        showToast('Please add at least one valid process.', 'error');
        return;
    }

    const btn = document.getElementById('compare-btn');
    btn.style.opacity = '0.7';
    btn.style.pointerEvents = 'none';

    setTimeout(() => {
        const quantum = parseInt(document.getElementById('quantum').value) || 2;
        const results = [
            runFCFS(procs),
            runSJF(procs),
            runSRTF(procs),
            runRR(procs, quantum),
            runPriorityNP(procs),
            runPriorityP(procs),
        ];
        document.getElementById('compare-section').style.display = 'block';
        document.getElementById('compare-section').classList.add('visible');
        renderComparison(results);
        document.getElementById('compare-section').scrollIntoView({ behavior:'smooth' });
        showToast('✓ All 6 algorithms compared');

        btn.style.opacity = '';
        btn.style.pointerEvents = '';
    }, 200);
}

/* ─────────────────────────────────────────────
   INIT
───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    /* Load sample data on boot */
    loadSampleData();

    /* Add row button */
    document.getElementById('add-row-btn').addEventListener('click', () => addRow());

    /* Load sample button */
    document.getElementById('sample-btn').addEventListener('click', loadSampleData);

    /* Run simulation */
    document.getElementById('run-btn').addEventListener('click', simulate);

    /* Compare all */
    document.getElementById('compare-btn').addEventListener('click', compareAll);

    /* Quantum toggle */
    document.querySelectorAll('input[name="algo"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const qRow = document.getElementById('quantum-row');
            const isRR = radio.value === 'RR';
            qRow.style.opacity  = isRR ? '1' : '0.4';
            qRow.style.transform = isRR ? 'scale(1.01)' : '';
            document.getElementById('quantum').disabled = !isRR;
        });
    });

    /* Scroll reveal on initial panels */
    setTimeout(() => {
        document.querySelectorAll('.reveal').forEach((el, i) => {
            setTimeout(() => el.classList.add('visible'), i * 80);
        });
    }, 100);

    /* Initial empty state messages */
    document.getElementById('gantt-output').innerHTML    = emptyState('Run simulation to see Gantt chart');
    document.getElementById('metrics-output').innerHTML  = emptyState('Run simulation to see metrics');
});
