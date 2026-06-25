import React, { useState, useEffect } from 'react';
import { RefreshCw, Database, HardDrive, Cpu, AlertTriangle, Play, Sparkles, HelpCircle, ArrowRight, Activity } from 'lucide-react';
import { AnomalyCard } from '../types';

interface OverviewWorkspaceProps {
  onAnalyzeCard: (topic: string, defaultSql: string) => void;
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

export default function OverviewWorkspace({ onAnalyzeCard, searchFilter }: OverviewWorkspaceProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSimulated, setIsSimulated] = useState(false);
  const [activeAnalysisTopic, setActiveAnalysisTopic] = useState<'rds_replicas' | 's3_storage' | 'ec2_spot'>('rds_replicas');
  
  // Dynamic K8s pods and logs states
  const [pods, setPods] = useState<any[]>([]);
  const [selectedPod, setSelectedPod] = useState<any>(null);
  const [podLogs, setPodLogs] = useState<string>("");
  const [logsLoading, setLogsLoading] = useState<boolean>(false);
  const [terminalTab, setTerminalTab] = useState<'logs' | 'sql'>('logs');

  const [aiResponse, setAiResponse] = useState<{
    sql: string;
    explanation: string;
    insights: string[];
    loading: boolean;
  }>({
    sql: "",
    explanation: "Awaiting telemetry sync...",
    insights: [],
    loading: true
  });

  const fetchPodsData = async () => {
    try {
      const res = await fetch('/api/v1/k8s/pods');
      const data = await res.json();
      if (data.success && data.pods) {
        const sorted = sortPods(data.pods);
        setPods(sorted);
        
        // Sync simulationMode state from backend!
        if (data.simulationMode !== undefined) {
          setSimulationMode(data.simulationMode);
          setIsSimulated(data.simulationMode !== 'none');
        }

        // Maintain selection if exists, or select first pod
        if (sorted.length > 0) {
          setSelectedPod((prev: any) => {
            const found = sorted.find((p: any) => p.name === prev?.name);
            return found || sorted[0];
          });
        }
      }
    } catch (err) {
      console.error("Failed to fetch k8s pods:", err);
    }
  };

  // Query simulation status and poll pods data dynamically
  useEffect(() => {
    fetch('/api/simulation-state')
      .then(res => res.json())
      .then(data => {
        if (data.mode && data.mode !== 'none') {
          setIsSimulated(true);
          setSimulationMode(data.mode);
          
          let targetTopic: 'rds_replicas' | 's3_storage' | 'ec2_spot' = 'rds_replicas';
          if (data.mode === 'crypto') targetTopic = 'ec2_spot';
          else if (data.mode === 'zombie') targetTopic = 's3_storage';
          triggerAiInquest(targetTopic);
        } else {
          triggerAiInquest('rds_replicas');
        }
      })
      .catch(err => {
        console.error("Failed to fetch simulation status:", err);
        triggerAiInquest('rds_replicas');
      });
    
    fetchPodsData();
    
    // Setup real-time polling every 3 seconds for active pod stats
    const interval = setInterval(() => {
      fetchPodsData();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // Fetch pods on simulation change
  useEffect(() => {
    fetchPodsData();
  }, [isSimulated]);

  // Hook representing live pod streaming logs (real-time polling)
  useEffect(() => {
    if (!selectedPod) return;

    let isMounted = true;
    let timerId: any = null;

    const fetchLogs = async (showLoading: boolean) => {
      if (showLoading) setLogsLoading(true);
      
      try {
        const res = await fetch(`/api/v1/k8s/logs?pod_name=${selectedPod.name}&namespace=${selectedPod.namespace}`);
        const data = await res.json();
        
        if (isMounted) {
          if (data.success) {
            setPodLogs(data.logs);
          } else {
            setPodLogs(`[ERROR] Failed to fetch live stdout container stats for ${selectedPod.name}`);
          }
        }
      } catch (err) {
        console.error(err);
        if (isMounted) {
          setPodLogs(`[ERROR] Direct connection server timed out. Check k8s configuration.`);
        }
      } finally {
        if (isMounted && showLoading) {
          setLogsLoading(false);
        }
      }
    };

    // Initial fetch with spinner
    fetchLogs(true);

    // Poll every 2 seconds
    timerId = setInterval(() => {
      fetchLogs(false);
    }, 2000);

    return () => {
      isMounted = false;
      if (timerId) clearInterval(timerId);
    };
  }, [selectedPod]);

  // Compute stats metrics dynamically
  const runningPods = pods.filter(p => p.status === 'Running').length;
  const totalPods = pods.length;
  const crashPods = pods.filter(p => p.status === 'CrashLoopBackOff' || p.status === 'OOMKilled').length;
  const isAnomalous = crashPods > 0;
  
  let totalCpu = 0;
  pods.forEach(p => {
    totalCpu += parseInt((p.cpu || "0").toString().replace("m", "")) || 0;
  });
  // Dynamically aligned to match your actual Minikube 5000m capacity limit
  // This correctly anchors the baseline at the true 12% utilization!
  const cpuPercent = Math.min(99, Math.round((totalCpu / 5000) * 100)); 

  const cards: AnomalyCard[] = [
    {
      id: 'rds_replicas',
      title: 'HPA POD REPLICAS',
      percentage: `Ready: ${runningPods}/${totalPods}`,
      trend: isAnomalous ? 'up' : 'down',
      severity: isAnomalous ? 'critical' : 'normal',
      history: Array(8).fill(0).map((_, i) => isAnomalous ? 20 + i * 10 : 15 + Math.random() * 10),
      colorClass: 'border-l-red-500 hover:bg-red-500/5',
      badgeColorClass: 'bg-red-950 text-red-x400 border-red-500/30',
      icon: 'database'
    },
    {
      id: 'ec2_spot',
      title: 'K8S CPU UTILIZATION',
      percentage: `${cpuPercent}% CPU core`,
      trend: cpuPercent > 60 ? 'up' : 'down',
      severity: cpuPercent > 85 ? 'critical' : (cpuPercent > 60 ? 'warning' : 'normal'),
      history: Array(8).fill(0).map((_, i) => Math.max(0, cpuPercent - 30 + Math.random() * 30 + (i === 7 ? 15 : 0))),
      colorClass: 'border-l-sky-500 hover:bg-sky-500/5 border-l-[3px]',
      badgeColorClass: 'bg-sky-950 text-sky-400 border-sky-500/30',
      icon: 'memory'
    },
    {
      id: 's3_storage',
      title: 'K8S STORAGE (PVC CLAIM)',
      percentage: isAnomalous ? '88% Claim bounds' : '42% Claim Balanced',
      trend: 'up',
      severity: isAnomalous ? 'warning' : 'normal',
      history: Array(8).fill(0).map(() => isAnomalous ? 40 + Math.random() * 40 : 30 + Math.random() * 10),
      colorClass: 'border-l-amber-500 hover:bg-amber-500/5 border-l-[3px]',
      badgeColorClass: 'bg-amber-950 text-amber-400 border-amber-500/30',
      icon: 'harddrive'
    }
  ];

  const [simulationMode, setSimulationMode] = useState<string>('none');

  const handleSimulate = async (mode: string) => {
    if (mode === 'none') {
      setIsSimulated(false);
      setSimulationMode('none');
    }
    setIsSyncing(true);
    try {
      const response = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      const data = await response.json();
      if (data.success) {
        setIsSimulated(mode !== 'none');
        setSimulationMode(mode);
        
        // Reset selected pod to trigger auto-selection of the anomalous/miner pod in fetchPodsData
        setSelectedPod(null);
        await fetchPodsData();
        
        let targetTopic: 'rds_replicas' | 's3_storage' | 'ec2_spot' = 'rds_replicas';
        if (mode === 'crypto') targetTopic = 'ec2_spot';
        else if (mode === 'zombie') targetTopic = 's3_storage';
        triggerAiInquest(targetTopic);
      }
    } catch (err) {
      console.error("Simulation trigger failed:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncData = async () => {
    setIsSyncing(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    await fetchPodsData();
    setIsSyncing(false);
    triggerAiInquest(activeAnalysisTopic);
  };

  const triggerAiInquest = async (topicId: 'rds_replicas' | 's3_storage' | 'ec2_spot') => {
    setActiveAnalysisTopic(topicId);
    setAiResponse(prev => ({ ...prev, loading: true }));

    try {
      const response = await fetch('/api/investigate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic: topicId,
          context: `Kubernetes telemetry trace anomaly on index indicator ${topicId}. Namespace 'coral-prod' contains scheduling rate exclusions.`
        })
      });

      const data = await response.json();
      if (data.success) {
        setAiResponse({
          sql: data.sql,
          explanation: data.explanation,
          insights: data.insights || [],
          loading: false
        });
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      console.error(err);
      setAiResponse(prev => ({ ...prev, loading: false }));
    }
  };

  return (
    <div className="ml-64 mt-12 mb-6 p-8 flex flex-col gap-6 h-[calc(100vh-72px)] overflow-y-auto font-sans text-white">
      
      {/* Overview Page Title Section & Simulation triggers */}
      <div className="flex justify-between items-end border-b border-white/10 pb-6 shrink-0">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-serif italic text-white leading-tight">
            Local Dev Cluster Telemetry
            <span className="block text-[10px] uppercase tracking-[0.25em] font-sans font-semibold text-white/40 mt-2">
              K8s Namespace Diagnostics & Machine Learning Root-Cause Solver
            </span>
          </h2>
        </div>
        
        <div className="flex items-center gap-3">
          {/* SCENARIO SELECTOR */}
          <div className="flex items-center bg-[#161617] border border-white/20 rounded pl-2 pr-1 h-9">
            <Activity size={12} className={isSimulated ? "text-amber-500 animate-pulse mr-2" : "text-white/40 mr-2"} />
            <select 
              value={simulationMode}
              onChange={(e) => handleSimulate(e.target.value)}
              disabled={isSyncing}
              className="bg-transparent border-none text-[10px] font-mono uppercase tracking-widest text-white outline-none cursor-pointer pr-4"
            >
              <option value="none" className="bg-[#111112]">Normal Operation</option>
              <option value="backlog" className="bg-[#111112]">Queue Backlog (CrashLoopBackOff)</option>
              <option value="crypto" className="bg-[#111112]">Crypto Miner Break-in</option>
              <option value="pending" className="bg-[#111112]">Cloud Quota Reached (Pending)</option>
              <option value="imagepull" className="bg-[#111112]">Bad Docker Image (ImagePullBackOff)</option>
              <option value="zombie" className="bg-[#111112]">Wasted Cloud Spend (Zombie Pod)</option>
            </select>
          </div>

          {/* SYNC DATA BUTTON */}
          <button
            onClick={handleSyncData}
            disabled={isSyncing}
            className="h-9 px-5 bg-transparent hover:bg-white/[0.03] text-white font-mono text-[10px] uppercase tracking-widest rounded border border-white/20 hover:border-white/40 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 duration-150"
          >
            <RefreshCw size={11} className={`${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sync Telemetry</span>
          </button>
        </div>
      </div>

      {isSimulated && (
        <div className="bg-amber-950/20 border border-amber-500/30 text-amber-300 text-xs py-3 px-4 rounded flex items-center gap-2.5 font-mono">
          <AlertTriangle size={15} className="shrink-0" />
          <span>
            {simulationMode === 'backlog' && "Active Queue Backlog simulation running container replica spikes and worker-node limit constraints. Data synced."}
            {simulationMode === 'crypto' && "Active Crypto Miner intrusion simulation detecting unrecognized binary compute execution. Data synced."}
            {simulationMode === 'pending' && "Active Cloud Resource Quota simulation highlighting pending GPU instances. Data synced."}
            {simulationMode === 'imagepull' && "Active Bad Docker Image simulation capturing ImagePullBackOff auth failures. Data synced."}
            {simulationMode === 'zombie' && "Active FinOps Orphaned Resource simulation highlighting wasted legacy reporting compute. Data synced."}
          </span>
        </div>
      )}

      {/* Grid of 3 Anomaly Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 shrink-0">
        {cards
          .filter(c => c.title.toLowerCase().includes(searchFilter.toLowerCase()))
          .map((card) => (
            <div
              key={card.id}
              onClick={() => triggerAiInquest(card.id as any)}
              className={`bg-[#111112] border rounded p-5 relative group transition-all duration-200 cursor-pointer ${
                activeAnalysisTopic === card.id 
                  ? 'border-[#c5a27a] shadow-[0_0_20px_rgba(197,162,122,0.15)] bg-[#161617]' 
                  : 'border-white/10 hover:border-white/20 hover:bg-[#161617]/40'
              }`}
            >
              <div className="absolute top-0 left-0 w-full h-[2px] bg-transparent overflow-hidden rounded-t">
                {card.severity === 'critical' ? (
                  <div className="w-full h-full bg-rose-500 animate-pulse" />
                ) : card.severity === 'warning' ? (
                  <div className="w-full h-full bg-amber-500" />
                ) : (
                  <div className="w-full h-full bg-[#c5a27a]" />
                )}
              </div>

              {/* Header inside card */}
              <div className="flex justify-between items-start mb-5 mt-2">
                <div className="flex items-center gap-2.5">
                  {card.icon === 'database' ? (
                    <Database size={15} className={card.severity === 'critical' ? 'text-rose-400 animate-pulse' : 'text-[#c5a27a]'} />
                  ) : card.icon === 'storage' ? (
                    <HardDrive size={15} className="text-amber-400" />
                  ) : (
                    <Cpu size={15} className="text-stone-300" />
                  )}
                  <span className="font-mono text-[10px] text-white/90 font-bold tracking-[0.15em] uppercase">
                    {card.title}
                  </span>
                </div>
                
                <span className={`font-mono text-[9px] px-2 py-0.5 rounded border uppercase tracking-wider flex items-center gap-1 bg-[#0a0a0b] ${
                  card.severity === 'critical' 
                    ? 'text-rose-400 border-rose-500/20' 
                    : card.severity === 'warning' 
                      ? 'text-amber-400 border-amber-500/20' 
                      : 'text-stone-300 border-white/10'
                }`}>
                  <span>{card.trend === 'up' ? '▲' : '▼'}</span>
                  <span>{card.percentage}</span>
                </span>
              </div>

              {/* High Frequency Custom Mini Bar Chart representer */}
              <div className="h-10 w-full flex items-end gap-1 mb-5 opacity-80 bg-black/10 p-1 rounded">
                {card.history.map((val, idx) => {
                  const percentHeight = val;
                  let bgCol = "bg-white/5";
                  if (idx >= 4) {
                    bgCol = card.severity === 'critical' ? 'bg-rose-500' : card.severity === 'warning' ? 'bg-amber-500' : 'bg-[#c5a27a]';
                  }
                  return (
                    <div 
                      key={idx} 
                      style={{ height: `${percentHeight}%` }} 
                      className={`w-full transition-all duration-300 rounded-[1px] relative ${bgCol}`}
                    >
                      {idx === card.history.length - 1 && card.severity === 'critical' && (
                        <span className="absolute -top-1 left-1/2 w-1.5 h-1.5 bg-rose-400 rounded-full -translate-x-1/2 animate-ping" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Action boundary trigger line */}
              <div className="mt-3 pt-4 border-t border-white/5 flex justify-between items-center">
                <span className="text-[9px] text-white/30 font-mono uppercase tracking-wider">Click to investigate</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAnalyzeCard(card.id, aiResponse.sql);
                  }}
                  className="px-3 py-1 bg-white/[0.02] hover:bg-white/[0.06] border border-white/10 hover:border-white/30 text-[9px] font-mono rounded tracking-widest uppercase transition-all flex items-center gap-1.5"
                >
                  <Play size={8} />
                  <span>Examine</span>
                </button>
              </div>
            </div>
          ))}
      </div>

      {/* Live K8s Pods grid */}
      <div className="shrink-0 bg-[#111112]/50 border border-white/5 rounded-lg p-5 flex flex-col gap-4">
        <div className="flex justify-between items-center border-b border-white/5 pb-3">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-[#c5a27a]" />
            <h3 className="font-mono text-[10px] text-white/90 font-bold uppercase tracking-[0.15em]">
              Active Namespace Pods (Real-time dev cluster)
            </h3>
          </div>
          <span className="font-mono text-[9px] text-white/30 uppercase tracking-widest hidden sm:inline">
            Click any pod container to pipe logs into the Terminal Console
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3.5">
          {pods.map((pod) => {
            const isErr = pod.status === "CrashLoopBackOff" || pod.status === "OOMKilled" || pod.status?.toLowerCase().includes("err") || pod.status?.toLowerCase().includes("fail");
            const isSel = selectedPod && selectedPod.name === pod.name;
            return (
              <div
                key={pod.name}
                onClick={() => {
                  setSelectedPod(pod);
                  setTerminalTab('logs');
                }}
                className={`p-3.5 rounded border transition-all duration-150 cursor-pointer flex flex-col gap-2 bg-black/15 ${
                  isSel
                    ? "border-[#c5a27a] bg-[#c5a27a]/5 shadow-[0_0_15px_rgba(197,162,122,0.1)] font-medium"
                    : "border-white/5 hover:border-white/10 hover:bg-white/[0.01]"
                }`}
              >
                <div className="flex justify-between items-start select-none">
                  <span className="font-mono text-[8px] bg-white/[0.03] border border-white/5 py-0.5 px-1.5 rounded text-white/40 uppercase tracking-wider">
                    {pod.namespace}
                  </span>
                  
                  <span className="relative flex h-2 w-2 mt-1">
                    {isErr ? (
                      <>
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                      </>
                    ) : (
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    )}
                  </span>
                </div>

                <div className="font-mono text-xs font-bold text-white/95 truncate uppercase tracking-tight mt-1" title={pod.name}>
                  {pod.name}
                </div>

                <div className="flex justify-between items-center text-[9px] font-mono mt-1 pt-2 border-t border-white/5 text-white/40 uppercase tracking-wider">
                  <span>Req Status:</span>
                  <span className={isErr ? "text-rose-400 font-extrabold animate-pulse" : "text-emerald-400"}>
                    {pod.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1 text-[9px] font-mono text-white/30 pt-1">
                  <div>CPU: <strong className="text-white/60">{pod.cpu}</strong></div>
                  <div>Mem: <strong className="text-white/60">{pod.memory}</strong></div>
                </div>
              </div>
            );
          })}
          {pods.length === 0 && (
            <div className="col-span-full py-8 text-center text-white/30 font-mono text-xs uppercase tracking-widest">
              Connecting to Kubernetes cluster api...
            </div>
          )}
        </div>
      </div>

      {/* AI Investigator Console Pane */}
      <div className="flex-1 min-h-[300px] bg-[#111112] border border-white/10 rounded flex flex-col overflow-hidden shadow-xl">
        
        {/* Pane header with status light and tab triggers */}
        <div className="px-5 py-2.5 bg-[#161617] border-b border-white/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <span className="relative flex h-[7px] w-[7px]">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#c5a27a] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-[7px] w-[7px] bg-[#c5a27a]"></span>
            </span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#c5a27a] font-bold flex items-center gap-2">
              Investigator Workspace
            </span>

            {/* TAB CONTROLS */}
            <div className="flex bg-black/45 rounded p-0.5 border border-white/5 font-mono text-[9px] uppercase tracking-widest">
              <button
                onClick={() => setTerminalTab('logs')}
                className={`px-3 py-1.5 rounded cursor-pointer transition-all ${
                  terminalTab === 'logs'
                    ? "bg-[#c5a27a] text-black font-bold"
                    : "text-white/40 hover:text-white"
                }`}
              >
                📟 Live K8s Log Stream
              </button>
              <button
                onClick={() => setTerminalTab('sql')}
                className={`px-3 py-1.5 rounded cursor-pointer transition-all ${
                  terminalTab === 'sql'
                    ? "bg-[#c5a27a] text-black font-bold"
                    : "text-white/40 hover:text-white"
                }`}
              >
                🤖 Root-Cause SQL
              </button>
            </div>
          </div>

          <div className="font-mono text-[9px] text-white/30 flex items-center gap-3 tracking-wider uppercase">
            {selectedPod && (
              <span className="text-[#c5a27a] bg-white/[0.02] border border-white/10 px-2 py-0.5 rounded">
                Active: {selectedPod.namespace}/{selectedPod.name}
              </span>
            )}
            <span>⚡ kubectl live pipeline</span>
          </div>
        </div>

        {/* Content of investigator split */}
        <div className="flex-1 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-white/10 overflow-hidden">
          
          {terminalTab === 'logs' ? (
            /* Live Kubernetes Log stdout/stderr console terminal */
            <div className="flex-1 bg-black/35 p-5 overflow-y-auto font-mono text-[11px] relative flex flex-col min-h-[220px]">
              {logsLoading ? (
                <div className="absolute inset-0 bg-[#0a0a0b]/90 flex flex-col justify-center items-center gap-2.5 font-mono text-xs z-10 text-[#c5a27a]">
                  <RefreshCw size={15} className="animate-spin text-[#c5a27a]" />
                  <span className="uppercase tracking-widest text-[9px] opacity-70">Streaming live pod logs stdout...</span>
                </div>
              ) : null}

              <div className="flex justify-between items-center text-white/40 mb-3 border-b border-white/5 pb-2 text-[9px] uppercase tracking-wider">
                <span>kubectl logs {selectedPod?.name || "none"} -n {selectedPod?.namespace || "none"} --tail=150</span>
                <button 
                  onClick={() => {
                    if (selectedPod) {
                      setLogsLoading(true);
                      fetch(`/api/v1/k8s/logs?pod_name=${selectedPod.name}&namespace=${selectedPod.namespace}`)
                        .then(res => res.json())
                        .then(data => {
                          if (data.success) setPodLogs(data.logs);
                        })
                        .finally(() => setLogsLoading(false));
                    }
                  }}
                  className="text-[#c5a27a] hover:text-white flex items-center gap-1.5 cursor-pointer font-bold transition-colors"
                >
                  <RefreshCw size={9} />
                  <span>Retail Logs</span>
                </button>
              </div>

              <div className="flex-grow overflow-y-auto whitespace-pre-wrap leading-relaxed select-text font-mono text-[11px] text-white/80 pr-2">
                {podLogs ? (
                  podLogs.split('\n').map((line, lIdx) => {
                    let textStyle = "text-white/70";
                    if (line.includes("WARN") || line.includes("Warn")) textStyle = "text-amber-300";
                    else if (line.includes("CRIT") || line.includes("Fatal") || line.includes("Error") || line.includes("OutOfMemoryError")) textStyle = "text-rose-400 font-bold";
                    else if (line.includes("INFO")) textStyle = "text-white/50";
                    
                    return (
                      <div key={lIdx} className={`py-0.5 border-b border-white/[0.02] ${textStyle}`}>
                        {line}
                      </div>
                    );
                  })
                ) : (
                  <div className="py-12 text-center text-white/20 font-mono text-[10px] uppercase tracking-widest">
                    No logs recorded. Select an active pod from the cluster list.
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Output SQL Terminal panel (original behavior, wrapped nicely) */
            <div className="flex-1 bg-black/25 p-5 overflow-y-auto font-mono text-xs relative flex flex-col min-h-[220px]">
              {aiResponse.loading ? (
                <div className="absolute inset-0 bg-[#0a0a0b]/90 flex flex-col justify-center items-center gap-2.5 font-mono text-xs z-10 text-[#c5a27a]">
                  <RefreshCw size={15} className="animate-spin text-[#c5a27a]" />
                  <span className="uppercase tracking-widest text-[9px] opacity-70">Synthesizing SQL root-cause database inquiry...</span>
                </div>
              ) : null}

              <div className="flex justify-between items-center text-white/40 mb-3 border-b border-white/5 pb-2 text-[10px] uppercase tracking-wider">
                <span>root_cause_builder_output.sql</span>
                <button 
                  onClick={() => onAnalyzeCard(activeAnalysisTopic, aiResponse.sql)}
                  className="text-[#c5a27a] hover:text-white flex items-center gap-1.5 cursor-pointer font-bold transition-colors"
                >
                  <span>Edit in terminal</span>
                  <ArrowRight size={10} />
                </button>
              </div>

              <pre className="text-white/80 overflow-x-auto whitespace-pre-wrap leading-relaxed select-all selection:bg-white/10">
                {aiResponse.sql}
              </pre>
            </div>
          )}

          {/* AI Explanation and Action points side-box */}
          <div className="w-full md:w-[350px] bg-[#111112] p-5 flex flex-col gap-5 overflow-y-auto shrink-0">
            <div className="flex items-center gap-2.5 border-b border-white/5 pb-3">
              <span className="p-1 rounded bg-white/5 text-[#c5a27a]">
                <Sparkles size={12} />
              </span>
              <h3 className="text-[10px] uppercase tracking-[0.2em] font-mono text-[#c5a27a] font-bold">Inquest Diagnostic</h3>
            </div>

            <div className="space-y-5">
              <div>
                <h4 className="text-[9px] font-mono text-white/40 uppercase tracking-widest mb-1.5">Impact Analysis:</h4>
                <p className="text-xs text-white/80 leading-relaxed bg-black/25 p-3.5 border border-white/5 rounded font-sans italic">
                  "{aiResponse.explanation}"
                </p>
              </div>

              <div>
                <h4 className="text-[9px] font-mono text-white/40 uppercase tracking-widest mb-3">Key Insights & Remediations:</h4>
                <ul className="space-y-2.5 text-xs">
                  {aiResponse.insights.map((insight, idx) => (
                    <li key={idx} className="flex gap-2.5 items-start bg-black/15 p-3 rounded border border-white/5">
                      <span className="text-[#c5a27a] shrink-0 font-mono text-[10px] font-bold">0{idx + 1}.</span>
                      <span className="text-white/70 font-sans leading-relaxed">{insight}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-auto pt-4 border-t border-white/5">
              <button 
                onClick={() => onAnalyzeCard(activeAnalysisTopic, aiResponse.sql)}
                className="w-full py-3 bg-[#c5a27a] hover:bg-[#b08e67] text-black font-mono text-[10px] uppercase tracking-widest font-bold rounded transition-all duration-150 flex justify-center items-center gap-2 cursor-pointer shadow-lg hover:shadow-[0_4px_12px_rgba(197,162,122,0.2)]"
              >
                <span>Execute In Workspace</span>
                <Play size={9} className="fill-black text-black" />
              </button>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
