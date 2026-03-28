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


