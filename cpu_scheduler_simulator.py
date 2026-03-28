"""
╔══════════════════════════════════════════════════════════════════╗
║         INTELLIGENT CPU SCHEDULER SIMULATOR  v2.0               ║
║         Complete All-in-One Application                          ║
║                                                                  ║
║  Algorithms : FCFS, SJF (Non-Preemptive & SRTF),                ║
║               Round Robin, Priority (Non-Preemptive & Preemptive)║
║  NEW v2.0   : Step Animation (Play/Pause/Step/Speed/Scrub),      ║
║               Live Ready Queue Panel, Moving time cursor         ║
║  Features   : Process input table, Gantt chart, metrics table,   ║
║               algorithm comparison, export to CSV                ║
║                                                                  ║
║  Run        : python cpu_scheduler_simulator.py                  ║
║  Requires   : Python 3.8+  |  tkinter (built-in)                 ║
║               matplotlib   → pip install matplotlib              ║
╚══════════════════════════════════════════════════════════════════╝
"""

import tkinter as tk
from tkinter import ttk, messagebox, filedialog
import copy, csv

try:
    import matplotlib
    matplotlib.use("TkAgg")
    import matplotlib.pyplot as plt
    import matplotlib.patches as mpatches
    from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
    MATPLOTLIB_OK = True
except ImportError:
    MATPLOTLIB_OK = False


# ══════════════════════════════════════════════════════════════════
#  MODULE 1 ── SCHEDULING ALGORITHMS
# ══════════════════════════════════════════════════════════════════

class Process:
    def __init__(self, pid, arrival_time, burst_time, priority=1):
        self.pid            = pid
        self.arrival_time   = int(arrival_time)
        self.burst_time     = int(burst_time)
        self.priority       = int(priority)
        self.remaining_time = int(burst_time)

    def reset(self):
        self.remaining_time = self.burst_time

    def clone(self):
        p = Process(self.pid, self.arrival_time, self.burst_time, self.priority)
        p.remaining_time = self.remaining_time
        return p


def _prepare(processes):
    clones = [p.clone() for p in processes]
    for p in clones:
        p.reset()
    return clones


def _add_block(timeline, pid, start, end):
    if timeline and timeline[-1]["pid"] == pid:
        timeline[-1]["end"] = end
    else:
        timeline.append({"pid": pid, "start": start, "end": end})


def compute_metrics(processes, timeline):
    metrics = []
    for p in processes:
        blocks = [b for b in timeline if b["pid"] == p.pid]
        if not blocks:
            continue
        ct   = max(b["end"]   for b in blocks)
        rt   = min(b["start"] for b in blocks)
        tat  = ct - p.arrival_time
        wt   = tat - p.burst_time
        resp = rt  - p.arrival_time
        metrics.append({
            "pid": p.pid, "arrival_time": p.arrival_time,
            "burst_time": p.burst_time, "priority": p.priority,
            "completion_time": ct, "turnaround_time": tat,
            "waiting_time": wt, "response_time": resp,
        })
    return metrics


def compute_summary(metrics, timeline):
    if not metrics:
        return {}
    n          = len(metrics)
    total_time = max(b["end"] for b in timeline)
    busy_time  = sum(b["end"] - b["start"] for b in timeline if b["pid"] != "IDLE")
    return {
        "avg_waiting_time"    : round(sum(m["waiting_time"]    for m in metrics) / n, 2),
        "avg_turnaround_time" : round(sum(m["turnaround_time"] for m in metrics) / n, 2),
        "avg_response_time"   : round(sum(m["response_time"]   for m in metrics) / n, 2),
        "cpu_utilization"     : round(busy_time / total_time * 100, 2) if total_time else 0,
        "throughput"          : round(n / total_time, 4) if total_time else 0,
        "total_time"          : total_time,
    }


def build_tick_snapshots(processes, timeline):
    """
    Build one snapshot dict per integer time tick.
    Each snapshot contains:
      t           – current time
      running     – PID on CPU (or "IDLE")
      ready_queue – list of PIDs waiting
      completed   – list of PIDs finished so far
    """
    if not timeline:
        return []
    total_time = max(b["end"] for b in timeline)

    # Map each tick to the running PID
    running_at = {}
    for b in timeline:
        for t in range(b["start"], b["end"]):
            running_at[t] = b["pid"]

    # Completion time per PID
    completion = {}
    for b in timeline:
        if b["pid"] != "IDLE":
            completion[b["pid"]] = max(completion.get(b["pid"], 0), b["end"])

    snapshots = []
    for t in range(total_time + 1):
        running = running_at.get(t, "IDLE")
        arrived = [p for p in processes if p.arrival_time <= t]
        done    = [p.pid for p in arrived
                   if completion.get(p.pid, -1) != -1
                   and t >= completion[p.pid]]
        ready   = [p.pid for p in arrived
                   if p.pid != running and p.pid not in done]
        snapshots.append({
            "t"           : t,
            "running"     : running,
            "ready_queue" : ready,
            "completed"   : done,
        })
    return snapshots


# ── FCFS ──────────────────────────────────────────────────────────
def fcfs(processes):
    procs = sorted(_prepare(processes), key=lambda p: (p.arrival_time, p.pid))
    timeline, t = [], 0
    for p in procs:
        if t < p.arrival_time:
            _add_block(timeline, "IDLE", t, p.arrival_time)
            t = p.arrival_time
        _add_block(timeline, p.pid, t, t + p.burst_time)
        t += p.burst_time
    m = compute_metrics(processes, timeline)
    return {"algorithm": "FCFS", "timeline": timeline,
            "metrics": m, "summary": compute_summary(m, timeline)}


# ── SJF ───────────────────────────────────────────────────────────
def sjf(processes, preemptive=False):
    procs, timeline, t = _prepare(processes), [], 0
    remaining = procs[:]
    if not preemptive:
        while remaining:
            arrived = [p for p in remaining if p.arrival_time <= t]
            if not arrived:
                nxt = min(p.arrival_time for p in remaining)
                _add_block(timeline, "IDLE", t, nxt); t = nxt; continue
            ch = min(arrived, key=lambda p: (p.burst_time, p.arrival_time, p.pid))
            remaining.remove(ch)
            _add_block(timeline, ch.pid, t, t + ch.burst_time)
            t += ch.burst_time
    else:
        while remaining:
            arrived = [p for p in remaining if p.arrival_time <= t]
            if not arrived:
                nxt = min(p.arrival_time for p in remaining)
                _add_block(timeline, "IDLE", t, nxt); t = nxt; continue
            ch  = min(arrived, key=lambda p: (p.remaining_time, p.arrival_time, p.pid))
            fut = [p.arrival_time for p in remaining if p.arrival_time > t]
            nxt = min([t + ch.remaining_time] + ([min(fut)] if fut else []))
            run = nxt - t
            _add_block(timeline, ch.pid, t, nxt)
            ch.remaining_time -= run; t = nxt
            if ch.remaining_time == 0:
                remaining.remove(ch)
    label = "SJF Preemptive (SRTF)" if preemptive else "SJF Non-Preemptive"
    m = compute_metrics(processes, timeline)
    return {"algorithm": label, "timeline": timeline,
            "metrics": m, "summary": compute_summary(m, timeline)}


# ── Round Robin ───────────────────────────────────────────────────
def round_robin(processes, quantum=2):
    procs     = sorted(_prepare(processes), key=lambda p: (p.arrival_time, p.pid))
    timeline, t, ready, visited = [], 0, [], set()
    remaining = procs[:]
    for p in remaining:
        if p.arrival_time <= t:
            ready.append(p); visited.add(p.pid)
    while ready or remaining:
        if not ready:
            unvisited = [p for p in remaining if p.pid not in visited]
            if not unvisited: break
            nxt = min(p.arrival_time for p in unvisited)
            _add_block(timeline, "IDLE", t, nxt); t = nxt
            for p in remaining:
                if p.arrival_time <= t and p.pid not in visited:
                    ready.append(p); visited.add(p.pid)
            continue
        cur = ready.pop(0)
        run = min(quantum, cur.remaining_time)
        _add_block(timeline, cur.pid, t, t + run)
        cur.remaining_time -= run; t += run
        for p in remaining:
            if p.arrival_time <= t and p.pid not in visited:
                ready.append(p); visited.add(p.pid)
        if cur.remaining_time > 0:
            ready.append(cur)
        else:
            remaining.remove(cur)
    m = compute_metrics(processes, timeline)
    return {"algorithm": f"Round Robin (q={quantum})", "timeline": timeline,
            "metrics": m, "summary": compute_summary(m, timeline)}


# ── Priority ──────────────────────────────────────────────────────
def priority_scheduling(processes, preemptive=False):
    procs, timeline, t = _prepare(processes), [], 0
    remaining = procs[:]
    if not preemptive:
        while remaining:
            arrived = [p for p in remaining if p.arrival_time <= t]
            if not arrived:
                nxt = min(p.arrival_time for p in remaining)
                _add_block(timeline, "IDLE", t, nxt); t = nxt; continue
            ch = min(arrived, key=lambda p: (p.priority, p.arrival_time, p.pid))
            remaining.remove(ch)
            _add_block(timeline, ch.pid, t, t + ch.burst_time)
            t += ch.burst_time
    else:
        while remaining:
            arrived = [p for p in remaining if p.arrival_time <= t]
            if not arrived:
                nxt = min(p.arrival_time for p in remaining)
                _add_block(timeline, "IDLE", t, nxt); t = nxt; continue
            ch  = min(arrived, key=lambda p: (p.priority, p.arrival_time, p.pid))
            fut = [p.arrival_time for p in remaining if p.arrival_time > t]
            nxt = min([t + ch.remaining_time] + ([min(fut)] if fut else []))
            run = nxt - t
            _add_block(timeline, ch.pid, t, nxt)
            ch.remaining_time -= run; t = nxt
            if ch.remaining_time == 0:
                remaining.remove(ch)
    label = "Priority Preemptive" if preemptive else "Priority Non-Preemptive"
    m = compute_metrics(processes, timeline)
    return {"algorithm": label, "timeline": timeline,
            "metrics": m, "summary": compute_summary(m, timeline)}


