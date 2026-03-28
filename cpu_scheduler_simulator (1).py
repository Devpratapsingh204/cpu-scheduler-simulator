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


def validate_processes(processes):
    if not processes:
        return "Please add at least one process."
    pids = [p.pid for p in processes]
    if len(pids) != len(set(pids)):
        return "Duplicate Process IDs found."
    for p in processes:
        if p.burst_time  <= 0: return f"{p.pid}: Burst time must be > 0."
        if p.arrival_time < 0: return f"{p.pid}: Arrival time cannot be negative."
        if p.priority    < 1:  return f"{p.pid}: Priority must be >= 1."
    return None


# ══════════════════════════════════════════════════════════════════
#  STYLE CONSTANTS
# ══════════════════════════════════════════════════════════════════

COLORS = {
    "bg"        : "#0f1117",
    "sidebar"   : "#1a1d27",
    "card"      : "#1e2130",
    "accent"    : "#4f8ef7",
    "accent2"   : "#7c5cbf",
    "success"   : "#3ecf8e",
    "warning"   : "#f5a623",
    "danger"    : "#e05c5c",
    "text"      : "#e8eaf0",
    "subtext"   : "#7b8199",
    "border"    : "#2d3148",
    "idle"      : "#3a3f55",
    "row_even"  : "#1e2130",
    "row_odd"   : "#242840",
    "header_bg" : "#151825",
    "rq_run"    : "#3ecf8e",
    "rq_wait"   : "#4f8ef7",
    "rq_done"   : "#4a5068",
}

PROCESS_COLORS = [
    "#4f8ef7","#3ecf8e","#f5a623","#e05c5c","#7c5cbf",
    "#00bcd4","#ff7043","#ab47bc","#26a69a","#ec407a",
    "#66bb6a","#ffa726","#42a5f5","#ef5350","#8d6e63",
]

FONT_MAIN  = ("Segoe UI", 10)
FONT_BOLD  = ("Segoe UI", 10, "bold")
FONT_TITLE = ("Segoe UI", 14, "bold")
FONT_H2    = ("Segoe UI", 11, "bold")
FONT_MONO  = ("Consolas", 9)
FONT_SMALL = ("Consolas", 8)


# ══════════════════════════════════════════════════════════════════
#  ANIMATION ENGINE
# ══════════════════════════════════════════════════════════════════

class AnimationEngine:
    """Controls tick-by-tick playback state."""
    SPEEDS = {"0.5x": 1200, "1x": 600, "1.5x": 350, "2x": 180, "3x": 80}

    def __init__(self, on_tick, on_finish):
        self.on_tick     = on_tick
        self.on_finish   = on_finish
        self.snapshots   = []
        self.total_ticks = 0
        self.current     = 0
        self.playing     = False
        self.speed_key   = "1x"
        self._job        = None
        self._root       = None

    def load(self, snapshots):
        self.stop()
        self.snapshots   = snapshots
        self.total_ticks = len(snapshots)
        self.current     = 0

    def play(self, root):
        if self.playing or self.current >= self.total_ticks:
            return
        self.playing = True
        self._root   = root
        self._advance(root)

    def pause(self):
        self.playing = False
        if self._job and self._root:
            self._root.after_cancel(self._job)
            self._job = None

    def stop(self):
        self.pause()
        self.current = 0

    def step_forward(self):
        if self.current < self.total_ticks - 1:
            self.current += 1
            self.on_tick(self.current)

    def step_backward(self):
        if self.current > 0:
            self.current -= 1
            self.on_tick(self.current)

    def jump_to(self, tick):
        self.current = max(0, min(int(tick), self.total_ticks - 1))
        self.on_tick(self.current)

    def _advance(self, root):
        if not self.playing:
            return
        if self.current >= self.total_ticks:
            self.playing = False
            self.on_finish()
            return
        self.on_tick(self.current)
        self.current += 1
        delay      = self.SPEEDS.get(self.speed_key, 600)
        self._job  = root.after(delay, lambda: self._advance(root))


# ══════════════════════════════════════════════════════════════════
#  MAIN APPLICATION
# ══════════════════════════════════════════════════════════════════

class CPUSchedulerApp(tk.Tk):

    def __init__(self):
        super().__init__()
        self.title("Intelligent CPU Scheduler Simulator  v2.0")
        self.geometry("1400x880")
        self.minsize(1200, 740)
        self.configure(bg=COLORS["bg"])

        self.processes        = []
        self.last_result      = None
        self._color_map       = {}
        self._timeline_data   = []
        self._total_time      = 0
        self._gantt_fig       = None
        self._gantt_canvas_w  = None
        self._anim_ax         = None
        self.quantum_var      = tk.IntVar(value=2)
        self.algo_var         = tk.StringVar(value="FCFS")
        self.speed_var        = tk.StringVar(value="1x")
        self.row_count        = 0
        self.process_rows     = []

        self.engine = AnimationEngine(
            on_tick   = self._on_tick,
            on_finish = self._on_anim_finish,
        )

        self._build_ui()
        self._load_sample_data()

    # ══════════════════════════════════════════════════════════════
    #  UI CONSTRUCTION
    # ══════════════════════════════════════════════════════════════

    def _build_ui(self):
        self._build_topbar()
        main = tk.Frame(self, bg=COLORS["bg"])
        main.pack(fill="both", expand=True, padx=10, pady=(0, 8))
        main.columnconfigure(1, weight=1)
        main.rowconfigure(0, weight=1)
        self._build_sidebar(main)
        self._build_right_panel(main)

    # ── Top bar ───────────────────────────────────────────────────
    def _build_topbar(self):
        bar = tk.Frame(self, bg=COLORS["sidebar"], height=52)
        bar.pack(fill="x")
        bar.pack_propagate(False)
        tk.Label(bar, text="⚙  CPU Scheduler Simulator",
                 font=("Segoe UI", 13, "bold"),
                 bg=COLORS["sidebar"], fg=COLORS["accent"]).pack(side="left", padx=18)
        tk.Label(bar, text="v2.0  —  Step Animation  +  Live Ready Queue",
                 font=("Segoe UI", 9),
                 bg=COLORS["sidebar"], fg=COLORS["subtext"]).pack(side="left", padx=6)
        tk.Button(bar, text="📊  Compare All",
                  font=FONT_BOLD, bg=COLORS["accent2"], fg="white",
                  relief="flat", padx=12, pady=5, cursor="hand2",
                  command=self._compare_all).pack(side="right", padx=8, pady=8)
        tk.Button(bar, text="💾  Export CSV",
                  font=FONT_BOLD, bg=COLORS["success"], fg="white",
                  relief="flat", padx=12, pady=5, cursor="hand2",
                  command=self._export_csv).pack(side="right", padx=(0, 4), pady=8)

    # ── Sidebar ───────────────────────────────────────────────────
    def _build_sidebar(self, parent):
        side = tk.Frame(parent, bg=COLORS["sidebar"], width=310)
        side.grid(row=0, column=0, sticky="nsew", padx=(0, 8))
        side.pack_propagate(False)

        self._section(side, "① Select Algorithm")
        for label, val in [
            ("First Come First Serve (FCFS)",          "FCFS"),
            ("Shortest Job First — Non-Preemptive",    "SJF_NP"),
            ("Shortest Job First — Preemptive (SRTF)", "SJF_P"),
            ("Round Robin",                            "RR"),
            ("Priority — Non-Preemptive",              "PRI_NP"),
            ("Priority — Preemptive",                  "PRI_P"),
        ]:
            tk.Radiobutton(side, text=label, variable=self.algo_var, value=val,
                           font=FONT_MAIN, bg=COLORS["sidebar"], fg=COLORS["text"],
                           selectcolor=COLORS["bg"],
                           activebackground=COLORS["sidebar"],
                           activeforeground=COLORS["accent"],
                           cursor="hand2",
                           command=self._on_algo_change).pack(anchor="w", padx=18, pady=2)

        self._divider(side)
        qf = tk.Frame(side, bg=COLORS["sidebar"])
        qf.pack(fill="x", padx=18, pady=4)
        tk.Label(qf, text="Time Quantum (RR):", font=FONT_BOLD,
                 bg=COLORS["sidebar"], fg=COLORS["text"]).pack(side="left")
        self.quantum_spin = tk.Spinbox(
            qf, from_=1, to=99, textvariable=self.quantum_var, width=4,
            font=FONT_MONO, bg=COLORS["card"], fg=COLORS["accent"],
            buttonbackground=COLORS["border"], relief="flat", state="disabled")
        self.quantum_spin.pack(side="right")

        self._divider(side)
        self._section(side, "② Add Processes")

        hdr = tk.Frame(side, bg=COLORS["header_bg"])
        hdr.pack(fill="x", padx=10, pady=(0, 2))
        for col, w in [("PID", 6), ("Arrival", 7), ("Burst", 6), ("Priority", 8)]:
            tk.Label(hdr, text=col, font=FONT_BOLD, width=w,
                     bg=COLORS["header_bg"], fg=COLORS["subtext"],
                     anchor="center").pack(side="left", padx=2)
        tk.Label(hdr, text="", width=3, bg=COLORS["header_bg"]).pack(side="left")

        outer = tk.Frame(side, bg=COLORS["sidebar"])
        outer.pack(fill="x", padx=10)
        canvas = tk.Canvas(outer, bg=COLORS["sidebar"], highlightthickness=0, height=190)
        scroll = ttk.Scrollbar(outer, orient="vertical", command=canvas.yview)
        canvas.configure(yscrollcommand=scroll.set)
        scroll.pack(side="right", fill="y")
        canvas.pack(side="left", fill="both", expand=True)
        self.row_frame = tk.Frame(canvas, bg=COLORS["sidebar"])
        self._cw = canvas.create_window((0, 0), window=self.row_frame, anchor="nw")
        self.row_frame.bind("<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.bind("<Configure>",
            lambda e: canvas.itemconfig(self._cw, width=e.width))
        self._scroll_canvas = canvas

        bf = tk.Frame(side, bg=COLORS["sidebar"])
        bf.pack(fill="x", padx=10, pady=6)
        tk.Button(bf, text="+ Add Row", font=FONT_BOLD, bg=COLORS["accent"],
                  fg="white", relief="flat", padx=10, pady=5, cursor="hand2",
                  command=self._add_row).pack(side="left", padx=(0, 6))
        tk.Button(bf, text="x Clear All", font=FONT_BOLD, bg=COLORS["danger"],
                  fg="white", relief="flat", padx=10, pady=5, cursor="hand2",
                  command=self._clear_rows).pack(side="left")

        self._divider(side)
        tk.Button(side, text="RUN SIMULATION",
                  font=("Segoe UI", 11, "bold"), bg=COLORS["success"], fg="white",
                  relief="flat", padx=12, pady=10, cursor="hand2",
                  command=self._run_simulation).pack(fill="x", padx=18, pady=(4, 14))

    # ── Right panel (tabs) ────────────────────────────────────────
    def _build_right_panel(self, parent):
        right = tk.Frame(parent, bg=COLORS["bg"])
        right.grid(row=0, column=1, sticky="nsew")
        right.rowconfigure(0, weight=1)
        right.columnconfigure(0, weight=1)

        style = ttk.Style()
        style.theme_use("clam")
        style.configure("C.TNotebook", background=COLORS["bg"], borderwidth=0)
        style.configure("C.TNotebook.Tab", background=COLORS["card"],
                        foreground=COLORS["subtext"], padding=[14, 8], font=FONT_BOLD)
        style.map("C.TNotebook.Tab",
                  background=[("selected", COLORS["accent"])],
                  foreground=[("selected", "white")])

        nb = ttk.Notebook(right, style="C.TNotebook")
        nb.pack(fill="both", expand=True)

        self.tab_gantt   = tk.Frame(nb, bg=COLORS["bg"])
        self.tab_metrics = tk.Frame(nb, bg=COLORS["bg"])
        self.tab_summary = tk.Frame(nb, bg=COLORS["bg"])
        self.tab_compare = tk.Frame(nb, bg=COLORS["bg"])

        nb.add(self.tab_gantt,   text="  Gantt + Animation  ")
        nb.add(self.tab_metrics, text="  Metrics Table  ")
        nb.add(self.tab_summary, text="  Summary  ")
        nb.add(self.tab_compare, text="  Compare All  ")

        self._build_gantt_tab()
        self._build_metrics_tab()
        self._build_summary_tab()
        self._build_compare_tab()

    # ══════════════════════════════════════════════════════════════
    #  GANTT + ANIMATION TAB
    # ══════════════════════════════════════════════════════════════

    def _build_gantt_tab(self):
        # ── Top row: chart area + ready queue panel ───────────────
        top = tk.Frame(self.tab_gantt, bg=COLORS["bg"])
        top.pack(fill="both", expand=True)
        top.columnconfigure(0, weight=1)
        top.columnconfigure(1, minsize=230)
        top.rowconfigure(0, weight=1)

        # Left — Gantt canvas
        self.gantt_area = tk.Frame(top, bg=COLORS["bg"])
        self.gantt_area.grid(row=0, column=0, sticky="nsew", padx=(8, 4), pady=8)
        self._gantt_placeholder = tk.Label(
            self.gantt_area,
            text="Run a simulation, then press Play to animate the Gantt chart.",
            font=FONT_MAIN, bg=COLORS["bg"], fg=COLORS["subtext"])
        self._gantt_placeholder.pack(expand=True)

        # Right — Ready Queue Panel
        rqp = tk.Frame(top, bg=COLORS["sidebar"],
                       highlightbackground=COLORS["border"], highlightthickness=1)
        rqp.grid(row=0, column=1, sticky="nsew", padx=(0, 8), pady=8)

        tk.Label(rqp, text="Ready Queue",
                 font=FONT_BOLD, bg=COLORS["sidebar"],
                 fg=COLORS["accent"]).pack(pady=(12, 2))
        self._divider(rqp)

        # Time display
        tf = tk.Frame(rqp, bg=COLORS["sidebar"])
        tf.pack(fill="x", padx=12, pady=(4, 2))
        tk.Label(tf, text="Time:", font=FONT_BOLD,
                 bg=COLORS["sidebar"], fg=COLORS["subtext"]).pack(side="left")
        self.rq_time_var = tk.StringVar(value="—")
        tk.Label(tf, textvariable=self.rq_time_var,
                 font=("Consolas", 13, "bold"),
                 bg=COLORS["sidebar"], fg=COLORS["warning"]).pack(side="right")

        # CPU now
        tk.Label(rqp, text="CPU running:",
                 font=FONT_BOLD, bg=COLORS["sidebar"],
                 fg=COLORS["subtext"]).pack(anchor="w", padx=14, pady=(6, 0))
        self.rq_cpu_var = tk.StringVar(value="—")
        self.rq_cpu_lbl = tk.Label(rqp, textvariable=self.rq_cpu_var,
                                   font=("Segoe UI", 16, "bold"),
                                   bg=COLORS["sidebar"], fg=COLORS["rq_run"])
        self.rq_cpu_lbl.pack(pady=(2, 8))

        self._divider(rqp)

        # Waiting
        tk.Label(rqp, text="Waiting (ready queue):",
                 font=FONT_BOLD, bg=COLORS["sidebar"],
                 fg=COLORS["subtext"]).pack(anchor="w", padx=14, pady=(4, 2))
        self.rq_wait_frame = tk.Frame(rqp, bg=COLORS["sidebar"])
        self.rq_wait_frame.pack(fill="x", padx=12)

        self._divider(rqp)

        # Completed
        tk.Label(rqp, text="Completed:",
                 font=FONT_BOLD, bg=COLORS["sidebar"],
                 fg=COLORS["subtext"]).pack(anchor="w", padx=14, pady=(4, 2))
        self.rq_done_frame = tk.Frame(rqp, bg=COLORS["sidebar"])
        self.rq_done_frame.pack(fill="x", padx=12)

        self._divider(rqp)

        self.rq_progress_var = tk.StringVar(value="")
        tk.Label(rqp, textvariable=self.rq_progress_var,
                 font=FONT_SMALL, bg=COLORS["sidebar"],
                 fg=COLORS["subtext"], wraplength=200).pack(padx=10, pady=6)

        # ── Playback controls bar ─────────────────────────────────
        ctrl = tk.Frame(self.tab_gantt, bg=COLORS["card"],
                        highlightbackground=COLORS["border"],
                        highlightthickness=1, height=56)
        ctrl.pack(fill="x", padx=8, pady=(0, 8))
        ctrl.pack_propagate(False)

        # Step back
        tk.Button(ctrl, text="<<", font=FONT_BOLD,
                  bg=COLORS["card"], fg=COLORS["text"],
                  relief="flat", padx=10, cursor="hand2",
                  command=self._step_back).pack(side="left", padx=(14, 2), pady=10)

        # Play / Pause
        self.play_var = tk.StringVar(value="  Play  ")
        self.btn_play = tk.Button(ctrl, textvariable=self.play_var,
                                  font=("Segoe UI", 10, "bold"),
                                  bg=COLORS["success"], fg="white",
                                  relief="flat", padx=14, cursor="hand2",
                                  command=self._toggle_play)
        self.btn_play.pack(side="left", padx=4, pady=10)

        # Step forward
        tk.Button(ctrl, text=">>", font=FONT_BOLD,
                  bg=COLORS["card"], fg=COLORS["text"],
                  relief="flat", padx=10, cursor="hand2",
                  command=self._step_fwd).pack(side="left", padx=2, pady=10)

        # Reset
        tk.Button(ctrl, text="Reset", font=FONT_BOLD,
                  bg=COLORS["danger"], fg="white",
                  relief="flat", padx=10, cursor="hand2",
                  command=self._reset_anim).pack(side="left", padx=(10, 4), pady=10)

        # Speed
        tk.Label(ctrl, text="Speed:", font=FONT_BOLD,
                 bg=COLORS["card"], fg=COLORS["subtext"]).pack(side="left", padx=(18, 4))
        for sp in ["0.5x", "1x", "1.5x", "2x", "3x"]:
            tk.Radiobutton(ctrl, text=sp, variable=self.speed_var, value=sp,
                           font=FONT_SMALL, bg=COLORS["card"], fg=COLORS["text"],
                           selectcolor=COLORS["bg"],
                           activebackground=COLORS["card"],
                           cursor="hand2",
                           command=self._on_speed_change).pack(side="left", padx=3)

        # Scrubber
        self.scrubber_var = tk.IntVar(value=0)
        self.scrubber = tk.Scale(ctrl, variable=self.scrubber_var,
                                 from_=0, to=100, orient="horizontal",
                                 bg=COLORS["card"], fg=COLORS["subtext"],
                                 troughcolor=COLORS["border"],
                                 highlightthickness=0, showvalue=False,
                                 command=self._on_scrub)
        self.scrubber.pack(side="left", fill="x", expand=True, padx=(14, 8))

        # Tick label
        self.tick_lbl = tk.Label(ctrl, text="t = 0", font=FONT_MONO,
                                 bg=COLORS["card"], fg=COLORS["warning"], width=8)
        self.tick_lbl.pack(side="left", padx=(0, 12))

    # ══════════════════════════════════════════════════════════════
    #  READY QUEUE PANEL UPDATE
    # ══════════════════════════════════════════════════════════════

    def _update_ready_queue(self, snap):
        self.rq_time_var.set(f"t = {snap['t']}")

        running = snap["running"]
        color   = (self._color_map.get(running, COLORS["rq_run"])
                   if running != "IDLE" else COLORS["idle"])
        self.rq_cpu_var.set(running)
        self.rq_cpu_lbl.config(fg=color)

        # Waiting
        for w in self.rq_wait_frame.winfo_children():
            w.destroy()
        rq = snap["ready_queue"]
        if rq:
            for i, pid in enumerate(rq):
                c   = self._color_map.get(pid, COLORS["rq_wait"])
                row = tk.Frame(self.rq_wait_frame, bg=COLORS["sidebar"])
                row.pack(fill="x", pady=1)
                tk.Label(row, text=f"[{i}]", font=FONT_SMALL,
                         bg=COLORS["sidebar"], fg=COLORS["subtext"],
                         width=3).pack(side="left")
                tk.Label(row, text=f"  {pid}",
                         font=("Segoe UI", 12, "bold"),
                         bg=COLORS["sidebar"], fg=c).pack(side="left")
        else:
            tk.Label(self.rq_wait_frame, text="(empty)",
                     font=FONT_SMALL, bg=COLORS["sidebar"],
                     fg=COLORS["subtext"]).pack(anchor="w")

        # Completed
        for w in self.rq_done_frame.winfo_children():
            w.destroy()
        done = snap["completed"]
        if done:
            for pid in done:
                tk.Label(self.rq_done_frame, text=f"  {pid}",
                         font=FONT_SMALL, bg=COLORS["sidebar"],
                         fg=COLORS["rq_done"]).pack(anchor="w")
        else:
            tk.Label(self.rq_done_frame, text="(none yet)",
                     font=FONT_SMALL, bg=COLORS["sidebar"],
                     fg=COLORS["subtext"]).pack(anchor="w")

        total = self.engine.total_ticks
        pct   = int(snap["t"] / max(total - 1, 1) * 100)
        self.rq_progress_var.set(f"Tick {snap['t']} / {total - 1}  ({pct}%)")

    # ══════════════════════════════════════════════════════════════
    #  GANTT DRAWING
    # ══════════════════════════════════════════════════════════════

    def _setup_gantt_figure(self, timeline):
        """Initialise the figure with ghost bars for all blocks."""
        if self._gantt_canvas_w:
            self._gantt_canvas_w.get_tk_widget().destroy()
            self._gantt_canvas_w = None
        self._gantt_placeholder.pack_forget()

        total_time = max(b["end"] for b in timeline)
        fig_w      = max(9, total_time * 0.42)
        fig, ax    = plt.subplots(figsize=(fig_w, 3.4))
        fig.patch.set_facecolor(COLORS["bg"])
        ax.set_facecolor(COLORS["bg"])
        ax.set_xlim(0, total_time)
        ax.set_ylim(0, 1)
        ax.set_xlabel("Time Units", color=COLORS["subtext"], fontsize=9)
        ax.set_yticks([])
        ax.tick_params(axis="x", colors=COLORS["subtext"], labelsize=8)
        for spine in ax.spines.values():
            spine.set_edgecolor(COLORS["border"])

        # Build colour map
        pids = list(dict.fromkeys(b["pid"] for b in timeline if b["pid"] != "IDLE"))
        self._color_map = {pid: PROCESS_COLORS[i % len(PROCESS_COLORS)]
                           for i, pid in enumerate(pids)}
        self._color_map["IDLE"] = COLORS["idle"]

        # Draw ghost (all blocks dimmed)
        for b in timeline:
            ax.barh(0.3, b["end"] - b["start"], left=b["start"], height=0.4,
                    color=self._color_map.get(b["pid"], "#555"),
                    edgecolor=COLORS["border"], linewidth=0.5, alpha=0.12)

        # Legend
        patches = [mpatches.Patch(color=self._color_map[p], label=p) for p in pids]
        patches.append(mpatches.Patch(color=COLORS["idle"], label="IDLE"))
        ax.legend(handles=patches, loc="upper right",
                  facecolor=COLORS["card"], edgecolor=COLORS["border"],
                  labelcolor=COLORS["text"], fontsize=8, framealpha=0.9)

        self._anim_ax       = ax
        self._gantt_fig     = fig
        self._timeline_data = timeline
        self._total_time    = total_time

        fig.tight_layout(pad=1.2)
        canvas = FigureCanvasTkAgg(fig, master=self.gantt_area)
        canvas.draw()
        canvas.get_tk_widget().pack(fill="both", expand=True)
        self._gantt_canvas_w = canvas

    def _redraw_gantt_at_tick(self, tick_index):
        """Repaint Gantt showing progress up to current_t."""
        if not self._anim_ax or not self._gantt_fig:
            return

        snap      = self.engine.snapshots[tick_index]
        current_t = snap["t"]
        ax        = self._anim_ax
        timeline  = self._timeline_data

        ax.clear()
        ax.set_facecolor(COLORS["bg"])
        ax.set_xlim(0, self._total_time)
        ax.set_ylim(0, 1)
        ax.set_xlabel("Time Units", color=COLORS["subtext"], fontsize=9)
        ax.set_yticks([])
        ax.tick_params(axis="x", colors=COLORS["subtext"], labelsize=8)
        for spine in ax.spines.values():
            spine.set_edgecolor(COLORS["border"])

        # Ghost layer
        for b in timeline:
            ax.barh(0.3, b["end"] - b["start"], left=b["start"], height=0.4,
                    color=self._color_map.get(b["pid"], "#555"),
                    edgecolor=COLORS["border"], linewidth=0.5, alpha=0.12)

        # Lit blocks
        for b in timeline:
            s, e, pid = b["start"], b["end"], b["pid"]
            c = self._color_map.get(pid, "#555")
            if e <= current_t:
                # Fully completed
                ax.barh(0.3, e - s, left=s, height=0.4,
                        color=c, edgecolor=COLORS["border"], linewidth=0.6)
                if e - s >= max(self._total_time * 0.04, 1):
                    ax.text((s + e) / 2, 0.3, pid,
                            ha="center", va="center",
                            fontsize=8, fontweight="bold", color="white", zorder=5)
                ax.text(s, 0.04, str(s),
                        ha="center", va="bottom", fontsize=7, color=COLORS["subtext"])
            elif s < current_t:
                # Partially running
                partial = current_t - s
                ax.barh(0.3, partial, left=s, height=0.4,
                        color=c, edgecolor=COLORS["border"], linewidth=0.6)
                if partial >= max(self._total_time * 0.03, 0.5):
                    ax.text(s + partial / 2, 0.3, pid,
                            ha="center", va="center",
                            fontsize=8, fontweight="bold", color="white", zorder=5)
                ax.text(s, 0.04, str(s),
                        ha="center", va="bottom", fontsize=7, color=COLORS["subtext"])

        # End tick
        if current_t >= self._total_time:
            ax.text(self._total_time, 0.04, str(self._total_time),
                    ha="center", va="bottom", fontsize=7, color=COLORS["subtext"])

        # Moving time cursor
        ax.axvline(x=current_t, color="#ffffff", linewidth=1.8,
                   alpha=0.85, zorder=10, linestyle="--")
        offset = self._total_time * 0.006
        ax.text(current_t + offset, 0.90,
                f"t={current_t}", color=COLORS["warning"],
                fontsize=8, va="top", zorder=11,
                bbox=dict(boxstyle="round,pad=0.25",
                          facecolor=COLORS["card"],
                          edgecolor=COLORS["warning"],
                          linewidth=0.8))

        # Legend
        pids    = list(dict.fromkeys(b["pid"] for b in timeline if b["pid"] != "IDLE"))
        patches = [mpatches.Patch(color=self._color_map[p], label=p) for p in pids]
        patches.append(mpatches.Patch(color=COLORS["idle"], label="IDLE"))
        ax.legend(handles=patches, loc="upper right",
                  facecolor=COLORS["card"], edgecolor=COLORS["border"],
                  labelcolor=COLORS["text"], fontsize=8, framealpha=0.9)

        ax.set_title(f"Gantt Chart  —  {self.last_result['algorithm']}",
                     color=COLORS["text"], fontsize=10, fontweight="bold", pad=8)
        self._gantt_fig.tight_layout(pad=1.2)
        self._gantt_canvas_w.draw_idle()

    # ══════════════════════════════════════════════════════════════
    #  ANIMATION CALLBACKS
    # ══════════════════════════════════════════════════════════════

    def _on_tick(self, tick_index):
        if not self.engine.snapshots:
            return
        snap = self.engine.snapshots[tick_index]
        self._redraw_gantt_at_tick(tick_index)
        self._update_ready_queue(snap)
        self.scrubber_var.set(tick_index)
        self.tick_lbl.config(text=f"t = {snap['t']}")

    def _on_anim_finish(self):
        self.play_var.set("  Play  ")
        self.btn_play.config(bg=COLORS["success"])

    def _toggle_play(self):
        if self.engine.playing:
            self.engine.pause()
            self.play_var.set("  Play  ")
            self.btn_play.config(bg=COLORS["success"])
        else:
            if self.engine.current >= self.engine.total_ticks:
                self.engine.current = 0
            self.play_var.set(" Pause ")
            self.btn_play.config(bg=COLORS["warning"])
            self.engine.play(self)

    def _step_fwd(self):
        self.engine.pause()
        self.play_var.set("  Play  ")
        self.btn_play.config(bg=COLORS["success"])
        self.engine.step_forward()

    def _step_back(self):
        self.engine.pause()
        self.play_var.set("  Play  ")
        self.btn_play.config(bg=COLORS["success"])
        self.engine.step_backward()

    def _reset_anim(self):
        self.engine.stop()
        self.play_var.set("  Play  ")
        self.btn_play.config(bg=COLORS["success"])
        if self.last_result:
            self.engine.jump_to(0)

    def _on_scrub(self, val):
        self.engine.pause()
        self.play_var.set("  Play  ")
        self.btn_play.config(bg=COLORS["success"])
        try:
            self.engine.jump_to(int(float(val)))
        except Exception:
            pass

    def _on_speed_change(self):
        self.engine.speed_key = self.speed_var.get()

    # ══════════════════════════════════════════════════════════════
    #  METRICS TAB
    # ══════════════════════════════════════════════════════════════

    def _build_metrics_tab(self):
        cols = ("PID", "Arrival", "Burst", "Priority",
                "Completion", "Turnaround", "Waiting", "Response")
        self.metrics_tree = self._make_treeview(self.tab_metrics, cols)

    def _update_metrics(self, metrics):
        self.metrics_tree.delete(*self.metrics_tree.get_children())
        for i, m in enumerate(metrics):
            tag = "even" if i % 2 == 0 else "odd"
            self.metrics_tree.insert("", "end", tag=tag, values=(
                m["pid"], m["arrival_time"], m["burst_time"], m["priority"],
                m["completion_time"], m["turnaround_time"],
                m["waiting_time"], m["response_time"],
            ))

    # ══════════════════════════════════════════════════════════════
    #  SUMMARY TAB
    # ══════════════════════════════════════════════════════════════

    def _build_summary_tab(self):
        self.summary_frame = tk.Frame(self.tab_summary, bg=COLORS["bg"])
        self.summary_frame.pack(fill="both", expand=True, padx=20, pady=20)
        tk.Label(self.summary_frame, text="Run a simulation to see the summary.",
                 font=FONT_MAIN, bg=COLORS["bg"], fg=COLORS["subtext"]).pack(expand=True)

    def _update_summary(self, result):
        for w in self.summary_frame.winfo_children():
            w.destroy()
        s = result["summary"]
        tk.Label(self.summary_frame, text=f"Algorithm: {result['algorithm']}",
                 font=FONT_TITLE, bg=COLORS["bg"], fg=COLORS["accent"]).pack(pady=(10, 20))
        cards = [
            ("Avg Waiting Time",    f"{s['avg_waiting_time']} units",    COLORS["warning"]),
            ("Avg Turnaround Time", f"{s['avg_turnaround_time']} units",  COLORS["accent"]),
            ("Avg Response Time",   f"{s['avg_response_time']} units",   COLORS["accent2"]),
            ("CPU Utilization",     f"{s['cpu_utilization']}%",           COLORS["success"]),
            ("Throughput",          f"{s['throughput']} proc/unit",       COLORS["success"]),
            ("Total Time",          f"{s['total_time']} units",           COLORS["subtext"]),
        ]
        grid = tk.Frame(self.summary_frame, bg=COLORS["bg"])
        grid.pack()
        for i, (label, value, color) in enumerate(cards):
            card = tk.Frame(grid, bg=COLORS["card"],
                            highlightbackground=color, highlightthickness=1)
            card.grid(row=i // 3, column=i % 3, padx=10, pady=10,
                      ipadx=20, ipady=14, sticky="nsew")
            tk.Label(card, text=label, font=FONT_MAIN,
                     bg=COLORS["card"], fg=COLORS["subtext"]).pack()
            tk.Label(card, text=value, font=("Segoe UI", 16, "bold"),
                     bg=COLORS["card"], fg=color).pack(pady=(4, 0))

    # ══════════════════════════════════════════════════════════════
    #  COMPARE TAB
    # ══════════════════════════════════════════════════════════════

    def _build_compare_tab(self):
        self.compare_inner = tk.Frame(self.tab_compare, bg=COLORS["bg"])
        self.compare_inner.pack(fill="both", expand=True)
        tk.Label(self.compare_inner,
                 text='Click "Compare All" in the toolbar to run all algorithms.',
                 font=FONT_MAIN, bg=COLORS["bg"], fg=COLORS["subtext"]).pack(expand=True)

    def _draw_comparison(self, results):
        for w in self.compare_inner.winfo_children():
            w.destroy()
        labels = [r["algorithm"] for r in results]
        awt    = [r["summary"]["avg_waiting_time"]    for r in results]
        att    = [r["summary"]["avg_turnaround_time"] for r in results]
        cpu    = [r["summary"]["cpu_utilization"]     for r in results]

        fig, axes = plt.subplots(1, 3, figsize=(13, 4.5))
        fig.patch.set_facecolor(COLORS["bg"])
        short = [l.replace("Non-Preemptive", "NP").replace("Preemptive", "P")
                  .replace("Round Robin", "RR").replace("Priority", "Pri")
                 for l in labels]

        for ax, values, title, color in [
            (axes[0], awt, "Avg Waiting Time (units)",    COLORS["warning"]),
            (axes[1], att, "Avg Turnaround Time (units)", COLORS["accent"]),
            (axes[2], cpu, "CPU Utilization (%)",         COLORS["success"]),
        ]:
            ax.set_facecolor(COLORS["card"])
            bars = ax.bar(short, values, color=color, alpha=0.85,
                          edgecolor=COLORS["border"])
            for bar, val in zip(bars, values):
                ax.text(bar.get_x() + bar.get_width() / 2,
                        bar.get_height() + max(values) * 0.02, str(val),
                        ha="center", va="bottom", fontsize=8,
                        color=COLORS["text"], fontweight="bold")
            ax.set_title(title, color=COLORS["text"], fontsize=9, fontweight="bold")
            ax.tick_params(axis="x", colors=COLORS["subtext"], labelsize=7, rotation=15)
            ax.tick_params(axis="y", colors=COLORS["subtext"], labelsize=8)
            for spine in ax.spines.values():
                spine.set_edgecolor(COLORS["border"])
            ax.set_ylim(0, max(values) * 1.2 if max(values) > 0 else 1)

        best_idx = awt.index(min(awt))
        list(axes[0].get_children())[best_idx].set_edgecolor(COLORS["success"])
        list(axes[0].get_children())[best_idx].set_linewidth(2.5)

        tk.Label(self.compare_inner, text="Algorithm Comparison — Same Workload",
                 font=FONT_TITLE, bg=COLORS["bg"], fg=COLORS["accent"]).pack(pady=(10, 0))
        tk.Label(self.compare_inner,
                 text=f"Best: {results[best_idx]['algorithm']}  (lowest avg waiting time)",
                 font=FONT_BOLD, bg=COLORS["bg"], fg=COLORS["success"]).pack(pady=(2, 6))

        fig.tight_layout(pad=2)
        canvas = FigureCanvasTkAgg(fig, master=self.compare_inner)
        canvas.draw()
        canvas.get_tk_widget().pack(fill="both", expand=True, padx=10, pady=(0, 10))
        plt.close(fig)

        cols = ("Algorithm", "Avg WT", "Avg TAT", "Avg RT", "CPU Util%", "Throughput")
        tree = self._make_treeview(self.compare_inner, cols, height=len(results))
        for i, r in enumerate(results):
            s   = r["summary"]
            tag = "even" if i % 2 == 0 else "odd"
            tree.insert("", "end", tag=tag, values=(
                r["algorithm"], s["avg_waiting_time"],
                s["avg_turnaround_time"], s["avg_response_time"],
                f"{s['cpu_utilization']}%", s["throughput"],
            ))

    # ══════════════════════════════════════════════════════════════
    #  PROCESS ROW MANAGEMENT
    # ══════════════════════════════════════════════════════════════

    def _add_row(self, pid="", at="0", bt="", pri="1"):
        self.row_count += 1
        default_pid = pid or f"P{self.row_count}"
        pid_v = tk.StringVar(value=default_pid)
        at_v  = tk.StringVar(value=at)
        bt_v  = tk.StringVar(value=bt)
        pri_v = tk.StringVar(value=pri)
        row   = tk.Frame(self.row_frame,
                         bg=COLORS["row_even"] if self.row_count % 2 == 0
                         else COLORS["row_odd"])
        row.pack(fill="x", pady=1)
        for var, w, fg in [(pid_v,6,COLORS["accent"]),(at_v,7,COLORS["text"]),
                            (bt_v,6,COLORS["text"]),(pri_v,8,COLORS["warning"])]:
            tk.Entry(row, textvariable=var, width=w, font=FONT_MONO,
                     bg=COLORS["card"], fg=fg, insertbackground=fg,
                     relief="flat", justify="center").pack(side="left", padx=3, pady=4)
        tk.Button(row, text="x", font=("Segoe UI", 8),
                  bg=COLORS["danger"], fg="white", relief="flat", padx=4,
                  cursor="hand2",
                  command=lambda r=row, rv=(pid_v,at_v,bt_v,pri_v):
                      self._delete_row(r, rv)).pack(side="left", padx=2)
        self.process_rows.append((pid_v, at_v, bt_v, pri_v))
        self._scroll_canvas.update_idletasks()
        self._scroll_canvas.yview_moveto(1)

    def _delete_row(self, rw, rv):
        if rv in self.process_rows:
            self.process_rows.remove(rv)
        rw.destroy()

    def _clear_rows(self):
        for c in self.row_frame.winfo_children():
            c.destroy()
        self.process_rows.clear()
        self.row_count = 0

    def _load_sample_data(self):
        for args in [("P1","0","8","3"),("P2","1","4","1"),
                     ("P3","2","9","4"),("P4","3","5","2")]:
            self._add_row(*args)

    # ══════════════════════════════════════════════════════════════
    #  HELPERS
    # ══════════════════════════════════════════════════════════════

    def _section(self, parent, text):
        tk.Label(parent, text=text, font=FONT_H2,
                 bg=COLORS["sidebar"], fg=COLORS["accent"]).pack(
                     anchor="w", padx=14, pady=(12, 4))

    def _divider(self, parent):
        tk.Frame(parent, bg=COLORS["border"], height=1).pack(
            fill="x", padx=10, pady=6)

    def _make_treeview(self, parent, cols, height=8):
        style = ttk.Style()
        style.configure("Dark.Treeview", background=COLORS["card"],
                        foreground=COLORS["text"], fieldbackground=COLORS["card"],
                        rowheight=26, font=FONT_MONO)
        style.configure("Dark.Treeview.Heading", background=COLORS["header_bg"],
                        foreground=COLORS["subtext"], font=FONT_BOLD, relief="flat")
        style.map("Dark.Treeview",
                  background=[("selected", COLORS["accent"])],
                  foreground=[("selected", "white")])
        frame = tk.Frame(parent, bg=COLORS["bg"])
        frame.pack(fill="both", expand=True, padx=10, pady=10)
        vsb  = ttk.Scrollbar(frame, orient="vertical")
        hsb  = ttk.Scrollbar(frame, orient="horizontal")
        tree = ttk.Treeview(frame, columns=cols, show="headings",
                            style="Dark.Treeview", height=height,
                            yscrollcommand=vsb.set, xscrollcommand=hsb.set)
        vsb.config(command=tree.yview)
        hsb.config(command=tree.xview)
        vsb.pack(side="right", fill="y")
        hsb.pack(side="bottom", fill="x")
        tree.pack(fill="both", expand=True)
        for col in cols:
            tree.heading(col, text=col)
            tree.column(col, anchor="center", width=max(80, len(col) * 9))
        tree.tag_configure("even", background=COLORS["row_even"])
        tree.tag_configure("odd",  background=COLORS["row_odd"])
        return tree

    def _on_algo_change(self):
        state = "normal" if self.algo_var.get() == "RR" else "disabled"
        self.quantum_spin.config(state=state)

    # ══════════════════════════════════════════════════════════════
    #  CORE ACTIONS
    # ══════════════════════════════════════════════════════════════

    def _collect_processes(self):
        processes = []
        for pid_v, at_v, bt_v, pri_v in self.process_rows:
            pid = pid_v.get().strip()
            if not pid:
                continue
            try:
                processes.append(Process(pid, int(at_v.get()),
                                         int(bt_v.get()), int(pri_v.get())))
            except ValueError:
                messagebox.showerror("Invalid Input",
                    f"Process '{pid}': All fields must be integers.")
                return None
        return processes

    def _run_simulation(self):
        processes = self._collect_processes()
        if processes is None:
            return
        err = validate_processes(processes)
        if err:
            messagebox.showerror("Validation Error", err)
            return

        algo = self.algo_var.get()
        try:
            if   algo == "FCFS"  : result = fcfs(processes)
            elif algo == "SJF_NP": result = sjf(processes, preemptive=False)
            elif algo == "SJF_P" : result = sjf(processes, preemptive=True)
            elif algo == "RR"    : result = round_robin(processes, self.quantum_var.get())
            elif algo == "PRI_NP": result = priority_scheduling(processes, preemptive=False)
            elif algo == "PRI_P" : result = priority_scheduling(processes, preemptive=True)
            else:
                messagebox.showerror("Error", "Unknown algorithm."); return
        except Exception as ex:
            messagebox.showerror("Simulation Error", str(ex)); return

        self.last_result = result
        self.processes   = processes

        if not MATPLOTLIB_OK:
            messagebox.showwarning("matplotlib missing",
                "Install it with:  pip install matplotlib")
        else:
            snapshots = build_tick_snapshots(processes, result["timeline"])
            self.engine.load(snapshots)
            self.scrubber.config(from_=0, to=max(len(snapshots) - 1, 1))
            self.scrubber_var.set(0)
            self.tick_lbl.config(text="t = 0")
            self._setup_gantt_figure(result["timeline"])
            if snapshots:
                self._on_tick(0)

        self._update_metrics(result["metrics"])
        self._update_summary(result)

    def _compare_all(self):
        processes = self._collect_processes()
        if processes is None:
            return
        err = validate_processes(processes)
        if err:
            messagebox.showerror("Validation Error", err); return
        if not MATPLOTLIB_OK:
            messagebox.showwarning("matplotlib missing",
                "pip install matplotlib"); return
        q = self.quantum_var.get()
        results = [
            fcfs(processes),
            sjf(processes, preemptive=False),
            sjf(processes, preemptive=True),
            round_robin(processes, q),
            priority_scheduling(processes, preemptive=False),
            priority_scheduling(processes, preemptive=True),
        ]
        self._draw_comparison(results)

    def _export_csv(self):
        if not self.last_result:
            messagebox.showinfo("No Data", "Run a simulation first.")
            return
        path = filedialog.asksaveasfilename(
            defaultextension=".csv",
            filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
            title="Save Metrics as CSV")
        if not path:
            return
        metrics = self.last_result["metrics"]
        summary = self.last_result["summary"]
        with open(path, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["CPU Scheduler Simulator — Export"])
            w.writerow(["Algorithm", self.last_result["algorithm"]])
            w.writerow([])
            w.writerow(["PID", "Arrival", "Burst", "Priority",
                         "Completion", "Turnaround", "Waiting", "Response"])
            for m in metrics:
                w.writerow([m["pid"], m["arrival_time"], m["burst_time"],
                             m["priority"], m["completion_time"],
                             m["turnaround_time"], m["waiting_time"],
                             m["response_time"]])
            w.writerow([])
            w.writerow(["Summary"])
            for k, v in summary.items():
                w.writerow([k.replace("_", " ").title(), v])
        messagebox.showinfo("Exported", f"Saved to:\n{path}")


# ══════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    if not MATPLOTLIB_OK:
        print("Warning: matplotlib not found.")
        print("Install it with:  pip install matplotlib\n")
    app = CPUSchedulerApp()
    app.mainloop()
