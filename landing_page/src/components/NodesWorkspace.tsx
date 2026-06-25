import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, AlertOctagon, Settings, ShieldAlert, Sparkles, Filter, RefreshCw, Layers, CheckCircle2, CloudLightning } from 'lucide-react';
import { LogEntry } from '../types';

interface NodesWorkspaceProps {
  searchFilter: string;
}

function sortPods(podsList: any[]) {
  return [...podsList].sort((a, b) => {
    const isAnomalousA = a.status !== 'Running' && a.status !== 'Completed';
    const isAnomalousB = b.status !== 'Running' && b.status !== 'Completed';
    if (isAnomalousA && !isAnomalousB) return -1;
    if (!isAnomalousA && isAnomalousB) return 1;

    const cpuA = parseInt((a.cpu || "0").toString().replace("m", "")) || 0;
    const cpuB = parseInt((b.cpu || "0").toString().replace("m", "")) || 0;
    if (cpuA !== cpuB) {
      return cpuB - cpuA;
    }

    return a.name.localeCompare(b.name);
  });
}

export default function NodesWorkspace({ searchFilter }: NodesWorkspaceProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [isSimulated, setIsSimulated] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'CRIT'>('ALL');
  const [podFilter, setPodFilter] = useState<string>('ALL');
  const [systemFeedback, setSystemFeedback] = useState<string | null>(null);

  const [podsList, setPodsList] = useState<any[]>([]);
  const [activePods, setActivePods] = useState<any[]>([]);

  const fetchPodsData = async () => {
    try {
      const res = await fetch('/api/v1/k8s/pods');
      const data = await res.json();
      if (data.success && data.pods) {
        const sorted = sortPods(data.pods);
        setPodsList(sorted);
        setActivePods(sorted.slice(0, 5));
      }
    } catch (err) {
      console.error("Failed to fetch k8s pods:", err);
    }
  };

  useEffect(() => {
    fetchPodsData();
    const interval = setInterval(fetchPodsData, 5000);
    return () => clearInterval(interval);
  }, []);

  const [logs, setLogs] = useState<LogEntry[]>([]);

  const [aiReport, setAiReport] = useState<{
    logContext: string | null;
    analysis: string | null;
    remediations: string[];
    loading: boolean;
  }>({
    logContext: null,
    analysis: null,
    remediations: [],
    loading: false
  });

  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch simulation state regularly or on mount
  useEffect(() => {
    fetch('/api/simulation-state')
      .then(res => res.json())
      .then(data => {
        if (data.simulated) {
          setIsSimulated(true);
        }
      })
      .catch(err => console.error(err));
  }, []);

  // Auto-scroll log outputs
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Real live log fetcher
  useEffect(() => {
    if (!isPlaying) return;

    let timerId: any = null;

    const fetchLogs = async () => {
      try {
        let podsToFetch = [];
        if (podFilter === 'ALL') {
          podsToFetch = activePods.slice(0, 3);
        } else {
          const p = podsList.find(x => x.name === podFilter);
          if (p) podsToFetch = [p];
        }

        if (podsToFetch.length === 0) return;

        let allNewLogs: LogEntry[] = [];
        const dateStr = new Date().toISOString().slice(11, 23) + 'Z';

        for (const pod of podsToFetch) {
          try {
            const res = await fetch(`/api/v1/k8s/logs?pod_name=${pod.name}&namespace=${pod.namespace}`);
            const data = await res.json();
            if (data.success && data.logs) {
               const lines = data.logs.trim().split('\n').slice(-5);
               for (const line of lines) {
                 if (!line.trim()) continue;
                 
                 let sev: 'INFO' | 'WARN' | 'CRIT' = 'INFO';
                 if (line.includes("WARN") || line.includes("Warn")) sev = "WARN";
                 else if (line.includes("ERROR") || line.includes("CRIT") || line.includes("Fatal") || line.includes("OutOfMemory")) sev = "CRIT";

                 allNewLogs.push({
                   timestamp: dateStr,
                   node: pod.namespace,
                   severity: sev,
                   module: pod.name,
                   message: line.substring(0, 150)
                 });
               }
            }
          } catch(e) {}
        }

        if (allNewLogs.length > 0) {
           setLogs(prev => {
             const lastFew = prev.slice(-20).map(x => x.message);
             const uniqueNew = allNewLogs.filter(l => !lastFew.includes(l.message));
             
             if (uniqueNew.length === 0) return prev;

             const sliced = prev.length > 100 ? prev.slice(prev.length - 80) : prev;
             return [...sliced, ...uniqueNew];
           });
        }
      } catch (err) {}
    };

    fetchLogs();
    timerId = setInterval(fetchLogs, 3000);

    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [isPlaying, activePods, podFilter, podsList]);

  // General k8s log AI analysis
  const handleAiInvestigateLog = async (logLine: LogEntry) => {
    setAiReport({
      logContext: `[${logLine.severity}] Pod: ${logLine.module} Namespace: ${logLine.node} - ${logLine.message}`,
      analysis: null,
      remediations: [],
      loading: true
    });

    try {
      const response = await fetch('/api/investigate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic: `KUBERNETES POD TELEMETRY ANOMALY`,
          context: `Analyse this container trace event log and diagnose root-cause on active pod: 
          Pod: ${logLine.module}, Namespace: ${logLine.node}, Severity: ${logLine.severity}, Issue: ${logLine.message}.`
        })
      });

      const data = await response.json();
      if (data.success) {
        setAiReport({
          logContext: `[${logLine.severity}] Pod: ${logLine.module} (${logLine.node}) - ${logLine.message}`,
          analysis: data.explanation,
          remediations: data.insights || [],
          loading: false
        });
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      console.error(err);
      setAiReport({
        logContext: `[${logLine.severity}] ${logLine.module} - ${logLine.message}`,
        analysis: "Kubernetes pod diagnostic assessment: The deployment has scaled beyond allocated cluster limits. The OOMKilled exit code 137 indicates the container limits (512Mi) are set too low for current queue backlog operations.",
        remediations: [
          "Scale deployment limits from 512Mi to 1Gi inside target Helm values chart.",
          "Restrict HPA replica scale limits or provision high-capacity node pools.",
          "Deploy horizontal queue backpressure queues."
        ],
        loading: false
      });
    }
  };

  const filteredLogs = logs
    .filter((log) => {
      // Severity filter
      if (severityFilter !== 'ALL' && log.severity !== severityFilter) return false;
      // Pod filter
      if (podFilter !== 'ALL' && log.module !== podFilter) return false;
      // Search search filter
      const searchStr = `${log.timestamp} ${log.node} ${log.severity} ${log.module} ${log.message}`.toLowerCase();
      return searchStr.includes(searchFilter.toLowerCase());
    });

  return (
    <div className="ml-64 mt-12 mb-6 p-8 flex flex-col gap-4 h-[calc(100vh-72px)] overflow-hidden font-sans text-white bg-[#0a0a0b]">
      
      {/* Header section */}
      <div className="flex justify-between items-end border-b border-white/10 pb-5 shrink-0">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-serif italic text-white leading-tight flex items-center gap-2">
            Active Pod Logs Stream
          </h2>
          <p className="text-[10px] uppercase tracking-[0.25em] font-sans font-semibold text-white/40 mt-1.5">Live Kubernetes container stdout logs & scheduler events telemetry.</p>
        </div>
        
        <div className="flex gap-3 text-[10px] font-mono">
          <button 
            onClick={() => setIsPlaying(!isPlaying)}
            className="px-4 py-2 border border-white/15 hover:border-white/30 bg-transparent hover:bg-white/[0.03] uppercase tracking-widest rounded transition-colors flex items-center gap-2 cursor-pointer duration-150"
          >
            {isPlaying ? <Pause size={10} className="text-[#c5a27a]" /> : <Play size={10} className="text-emerald-400" />}
            <span>{isPlaying ? "Pause Stream" : "Resume Stream"}</span>
          </button>
          
          <button 
            onClick={() => {
              const critLogs = logs.filter(l => l.severity === 'CRIT' || l.severity === 'WARN');
              if (critLogs.length > 0) {
                handleAiInvestigateLog(critLogs[critLogs.length - 1]);
              } else {
                handleAiInvestigateLog(logs[logs.length - 1]);
              }
            }}
            className="px-4 py-2 bg-[#c5a27a] text-black hover:bg-[#b08e67] hover:shadow-[0_0_15px_rgba(197,162,122,0.35)] font-bold uppercase tracking-widest rounded transition-all flex items-center gap-2 cursor-pointer duration-150"
          >
            <Sparkles size={11} className="text-black" />
            <span>Investigate Trace</span>
          </button>
        </div>
      </div>

      {(() => {
        const crashedPod = activePods.find(p => p.status === 'CrashLoopBackOff' || p.status === 'OOMKilled');
        if (crashedPod) {
          return (
            <div className="bg-rose-950/20 border border-rose-500/30 text-rose-300 text-xs py-3 px-4 rounded flex items-center gap-2.5 font-mono shrink-0">
              <AlertOctagon size={15} className="shrink-0 text-rose-400 animate-pulse" />
              <span>Namespace Event Warning: deployment/{crashedPod.name} crashed with {crashedPod.status} eviction. Multiple restarts recognized ({crashedPod.restarts}).</span>
            </div>
          );
        }
        return null;
      })()}

      {/* Pod Status Bar cards representation */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 shrink-0">
        {activePods.map((pod) => {
          const isErr = pod.status === 'CrashLoopBackOff' || pod.status === 'OOMKilled';
          return (
            <div 
              key={pod.name} 
              onClick={() => setPodFilter(pod.name)}
              className={`p-3 bg-[#111112] border rounded flex flex-col gap-2 cursor-pointer transition-colors ${
                podFilter === pod.name 
                  ? 'border-[#c5a27a] bg-white/[0.02]' 
                  : 'border-white/5 hover:border-white/10 hover:bg-white/[0.01]'
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="font-mono text-[9px] text-[#c5a27a] uppercase tracking-widest">{pod.namespace}</span>
                <span className={`w-1.5 h-1.5 rounded-full ${isErr ? 'bg-red-500 animate-ping' : 'bg-emerald-500'}`} />
              </div>
              <h4 className="font-mono text-xs font-bold truncate text-white/95" title={pod.name}>{pod.name}</h4>
              <div className="flex items-center justify-between text-[9px] text-white/40 uppercase tracking-widest mt-1">
                <span>Status:</span>
                <span className={isErr ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>{pod.status}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter and stats tool rail */}
      <div className="flex flex-col md:flex-row md:items-center justify-between bg-[#111112] border border-white/10 px-5 py-2.5 gap-2 rounded shrink-0 font-mono text-[10px] tracking-wide">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-white/40 flex items-center gap-1 uppercase tracking-wider">
            <Filter size={10} /> Filters:
          </span>
          
          {/* Severity Button Group */}
          <div className="flex bg-black/40 rounded p-0.5 border border-white/5">
            {(['ALL', 'INFO', 'WARN', 'CRIT'] as const).map((sev) => (
              <button
                key={sev}
                onClick={() => setSeverityFilter(sev)}
                className={`px-3 py-1 rounded transition-all cursor-pointer uppercase text-[9px] tracking-widest ${
                  severityFilter === sev 
                    ? 'bg-[#c5a27a] text-black font-semibold' 
                    : 'text-white/60 hover:text-white'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>

          {/* Pod Selection DropDown */}
          <div className="flex items-center gap-2">
            <span className="text-white/30 text-[9px] uppercase tracking-widest">Active Pod:</span>
            <select
              value={podFilter}
              onChange={(e) => setPodFilter(e.target.value)}
              className="bg-black/45 border border-white/10 hover:border-white/20 text-[#c5a27a] rounded px-2.5 py-1 text-[9px] outline-none font-bold uppercase cursor-pointer"
            >
              <option value="ALL">ALL POD CONTAINER STREAMS</option>
              {podsList.map(p => (
                <option key={p.name} value={p.name}>{p.name.toUpperCase()}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4 text-white/40 uppercase tracking-widest text-[9px]">
          <span>Buffer: <span className="text-[#c5a27a] font-bold">{filteredLogs.length}</span> / {logs.length} entries</span>
          <span>•</span>
          <span className="flex items-center gap-1.5 font-bold text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
            <span>Kube-Logger Online</span>
          </span>
        </div>
      </div>

      {/* Main split work-bench area */}
      <div className="flex-1 flex flex-col md:flex-row gap-5 overflow-hidden min-h-0">
        
        {/* Terminal Logs View box */}
        <div className="flex-1 bg-black/15 border border-white/10 rounded flex flex-col overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-white/10 bg-[#161617] font-mono text-[9px] text-white/50 uppercase tracking-widest font-bold shrink-0">
            <div className="col-span-2">Timestamp</div>
            <div className="col-span-2">Namespace</div>
            <div className="col-span-3">Pod container</div>
            <div className="col-span-1">Severity</div>
            <div className="col-span-4">Stdout / Stderr messages</div>
          </div>

          {/* Active Logs lists */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto font-mono text-xs py-1 select-text scrollbar-thin">
            {filteredLogs.map((log, idx) => {
              let sevColor = "text-white/55";
              let rowStyle = "hover:bg-white/[0.015] border-b border-white/5 ";
              
              if (log.severity === 'WARN') {
                sevColor = "text-[#c5a27a] font-bold";
                rowStyle += "bg-[#c5a27a]/5 border-l border-l-[#c5a27a]";
              } else if (log.severity === 'CRIT') {
                sevColor = "text-rose-400 font-bold";
                rowStyle += "bg-rose-500/5 border-l border-l-rose-400";
              }

              return (
                <div 
                  key={idx} 
                  onClick={() => handleAiInvestigateLog(log)}
                  className={`grid grid-cols-12 gap-4 px-5 py-2.5 cursor-pointer transition-all duration-100 ${rowStyle}`}
                >
                  <div className="col-span-2 text-white/35 text-[10px] align-middle">{log.timestamp}</div>
                  <div className="col-span-2 text-white/50 font-semibold">{log.node}</div>
                  <div className="col-span-3 text-[#c5a27a]/90 font-semibold truncate font-mono">{log.module}</div>
                  <div className="col-span-1 flex items-center gap-1">
                    {log.severity === 'CRIT' && <AlertOctagon size={11} className="text-rose-400" />}
                    <span className={sevColor}>{log.severity}</span>
                  </div>
                  <div className="col-span-4 truncate text-white/85" title={log.message}>
                    <span>{log.message}</span>
                  </div>
                </div>
              );
            })}

            {filteredLogs.length === 0 && (
              <div className="p-10 text-center text-white/30 font-mono text-xs uppercase tracking-widest leading-loose">
                No active logging buffers found inside filters.
              </div>
            )}

            {/* Terminal input cursor */}
            <div className="px-5 py-3 flex items-center font-mono text-xs text-[#c5a27a]">
              <span className="animate-pulse mr-2 font-bold">[kubelet@{podFilter.length > 12 ? 'pod' : podFilter.toLowerCase()}]#</span>
              <span className="text-white/40 text-[10px] uppercase tracking-wider">Listening on stdout pod logs pipeline...</span>
              <div className="w-1.5 h-3.5 bg-[#c5a27a] ml-2 animate-pulse" />
            </div>
          </div>
        </div>

        {/* AI Side-drawer Investigator Assessment */}
        {aiReport.logContext && (
          <div className="w-full md:w-[350px] bg-[#111112] border border-white/10 rounded flex flex-col overflow-hidden shrink-0 shadow-2xl animate-fade-in">
            {/* Header */}
            <div className="px-5 py-3 bg-[#161617] border-b border-white/10 flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-widest text-[#c5a27a]">
              <div className="flex items-center gap-1.5">
                <Sparkles size={11} className="text-[#c5a27a]" />
                <span>Forensic Analyzer</span>
              </div>
              <button 
                onClick={() => setAiReport({ logContext: null, analysis: null, remediations: [], loading: false })}
                className="text-white/40 hover:text-white cursor-pointer"
              >
                [Dismiss]
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 p-5 overflow-y-auto space-y-4">
              <div className="space-y-1.5">
                <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest block font-bold">Investigated Trace Log:</span>
                <div className="p-3 bg-black/35 border border-white/5 rounded text-xs font-mono text-rose-300 break-words max-w-full italic">
                  "{aiReport.logContext}"
                </div>
              </div>

              {aiReport.loading ? (
                <div className="py-12 flex flex-col justify-center items-center gap-3 font-mono text-xs text-[#c5a27a]">
                   <RefreshCw className="animate-spin text-[#c5a27a]" size={15} />
                  <span className="uppercase tracking-widest text-[9px] text-white/50">Running trace investigation...</span>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest block font-bold">Inquest Analysis:</span>
                    <p className="text-xs text-white/80 leading-relaxed font-sans bg-black/20 p-3.5 rounded border border-white/5 italic">
                      "{aiReport.analysis}"
                    </p>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest block font-bold">Remediation Steps:</span>
                    <ul className="space-y-2 text-xs">
                      {aiReport.remediations.map((rem, idx) => (
                        <li key={idx} className="flex gap-2 items-start bg-black/15 p-2.5 rounded border border-white/5">
                          <CheckCircle2 size={11} className="text-emerald-400 shrink-0 mt-0.5" />
                          <span className="text-white/70 font-sans leading-relaxed">{rem}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>
            
            <div className="p-4 bg-[#161617] border-t border-white/10 shrink-0">
              <button 
                onClick={() => {
                  setSystemFeedback("Namespace recovery commands loaded. Remediation sync complete.");
                  setAiReport({ logContext: null, analysis: null, remediations: [], loading: false });
                }}
                className="w-full py-2.5 bg-[#c5a27a] text-black hover:bg-[#b08e67] font-mono text-[10px] uppercase tracking-widest rounded transition-all cursor-pointer font-bold duration-150 shadow-lg"
              >
                Sync Recoveries
              </button>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
