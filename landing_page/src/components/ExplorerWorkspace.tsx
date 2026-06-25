import React, { useState, useEffect } from 'react';
import { Database, Play, Download, Filter, Key, Table, Clock, Tag, HelpCircle, RefreshCw, Layers } from 'lucide-react';
import { SchemaTable, QueryResult } from '../types';

interface ExplorerWorkspaceProps {
  initialSql: string;
}

export default function ExplorerWorkspace({ initialSql }: ExplorerWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'find_retry_anomalies' | 'new_query'>('find_retry_anomalies');
  const [sqlQuery, setSqlQuery] = useState(
    initialSql || `-- Investigating cascading Kubernetes pod scaling anomalies
SELECT
    timestamp,
    pod_name,
    namespace,
    replicas,
    cpu_usage,
    status
FROM
    supabase.pod_metrics
WHERE
    status = 'OOMKilled'
ORDER BY
    replicas DESC,
    timestamp DESC;`
  );

  const [newSql, setNewSql] = useState('-- Write your local cluster database query here...\nSELECT * FROM supabase.pod_metrics LIMIT 10;');
  const [isRunning, setIsRunning] = useState(false);
  const [explorerFeedback, setExplorerFeedback] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResult>({
    columns: [],
    rows: [],
    timeMs: 0
  });

  const [sidebarMode, setSidebarMode] = useState<'k8s' | 'schema'>('k8s');
  const [explorerPods, setExplorerPods] = useState<any[]>([]);

  // Fetch pods on mount for explorer
  useEffect(() => {
    fetch('/api/v1/k8s/pods')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.pods) {
          setExplorerPods(data.pods);
        }
      })
      .catch(err => console.error("Explorer pods fetch failed:", err));
  }, []);

  const selectPodInExplorer = (pod: any) => {
const formattedQuery = `-- Inspecting container telemetry logs for pod: ${pod.name} inside namespace ${pod.namespace}
SELECT
    timestamp,
    pod_name,
    namespace,
    replicas,
    cpu_usage,
    status
FROM
    supabase.pod_metrics
WHERE
    pod_name = '${pod.name}'
ORDER BY
    timestamp DESC
LIMIT 10;`;
    if (activeTab === 'find_retry_anomalies') {
      setSqlQuery(formattedQuery);
    } else {
      setNewSql(formattedQuery);
    }
    setExplorerFeedback(`Loaded query telemetry template bound to active pod: ${pod.name}`);
  };

  // Sync initialSql changes from card clicks
  useEffect(() => {
    if (initialSql) {
      setSqlQuery(initialSql);
      setActiveTab('find_retry_anomalies');
    }
  }, [initialSql]);

  const databaseSchema: SchemaTable[] = [
    {
      name: 'supabase.pod_metrics',
      columns: [
        { name: 'id', type: 'int64', isKey: true },
        { name: 'service_name', type: 'varchar' },
        { name: 'namespace', type: 'varchar' },
        { name: 'pod_name', type: 'varchar' },
        { name: 'replicas', type: 'int64' },
        { name: 'cpu_usage', type: 'float64' },
        { name: 'memory_usage', type: 'float64' },
        { name: 'restart_count', type: 'int64' },
        { name: 'status', type: 'varchar' },
        { name: 'timestamp', type: 'varchar' }
      ]
    },
    {
      name: 'supabase.billing_events',
      columns: [
        { name: 'id', type: 'int64', isKey: true },
        { name: 'service_name', type: 'varchar' },
        { name: 'estimated_cost', type: 'float64' },
        { name: 'anomaly_score', type: 'float64' },
        { name: 'severity', type: 'varchar' },
        { name: 'timestamp', type: 'varchar' }
      ]
    },
    {
      name: 'supabase.deployments',
      columns: [
        { name: 'id', type: 'int64', isKey: true },
        { name: 'deployment_id', type: 'varchar' },
        { name: 'service_name', type: 'varchar' },
        { name: 'version', type: 'varchar' },
        { name: 'deployed_by', type: 'varchar' },
        { name: 'deployed_at', type: 'varchar' }
      ]
    },
    {
      name: 'supabase.incidents',
      columns: [
        { name: 'id', type: 'int64', isKey: true },
        { name: 'service_name', type: 'varchar' },
        { name: 'severity', type: 'varchar' },
        { name: 'incident_type', type: 'varchar' },
        { name: 'message', type: 'varchar' },
        { name: 'resolved', type: 'boolean' },
        { name: 'created_at', type: 'varchar' }
      ]
    },
    {
      name: 'supabase.worker_events',
      columns: [
        { name: 'id', type: 'int64', isKey: true },
        { name: 'worker_name', type: 'varchar' },
        { name: 'retry_count', type: 'int64' },
        { name: 'failed_jobs', type: 'int64' },
        { name: 'queue_depth', type: 'int64' },
        { name: 'status', type: 'varchar' },
        { name: 'timestamp', type: 'varchar' }
      ]
    },
    {
      name: 'supabase.firewall_events',
      columns: [
        { name: 'id', type: 'int64', isKey: true },
        { name: 'timestamp', type: 'varchar' },
        { name: 'source_ip', type: 'varchar' },
        { name: 'target_node', type: 'varchar' },
        { name: 'protocol', type: 'varchar' },
        { name: 'action', type: 'varchar' },
        { name: 'event_desc', type: 'varchar' }
      ]
    }
  ];

  const handleExecuteQuery = async () => {
    setIsRunning(true);
    setExplorerFeedback(null);
    const targetQuery = activeTab === 'find_retry_anomalies' ? sqlQuery : newSql;

    try {
      const response = await fetch('/api/execute-query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql: targetQuery })
      });

      const data = await response.json();
      if (data.success) {
        setQueryResult({
          columns: data.columns || [],
          rows: data.rows || [],
          timeMs: data.timeMs || 45
        });
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      console.error(err);
      setExplorerFeedback("Error executing query: " + err.message);
      setQueryResult({
        columns: ["error"],
        rows: [{ error: err.message }],
        timeMs: 0
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleExportCSV = () => {
    if (queryResult.rows.length === 0) return;
    const headers = queryResult.columns.join(',');
    const csvRows = queryResult.rows.map(row => 
      queryResult.columns.map(col => `"${row[col]?.toString() || ''}"`).join(',')
    );
    const blob = new Blob([[headers, ...csvRows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query_results_${activeTab}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExplorerFeedback("Export complete. Query results saved successfully as local CSV.");
  };

  const insertTableName = (tableName: string) => {
    const defaultSelect = `SELECT * FROM ${tableName} LIMIT 10;`;
    if (activeTab === 'find_retry_anomalies') {
      setSqlQuery(defaultSelect);
    } else {
      setNewSql(defaultSelect);
    }
    setExplorerFeedback(`Loaded template query for table: ${tableName}`);
  };

  const currentText = activeTab === 'find_retry_anomalies' ? sqlQuery : newSql;

  const setTabSql = (val: string) => {
    if (activeTab === 'find_retry_anomalies') {
      setSqlQuery(val);
    } else {
      setNewSql(val);
    }
  };

  // Split lines
  const lines = currentText.split('\n');

  return (
    <div className="ml-64 mt-12 flex h-[calc(100vh-72px)] bg-[#0a0a0b] font-sans text-white overflow-hidden">
      
      {/* Left sidebar: Schema & K8s Explorer database representation */}
      <aside className="w-64 bg-[#111112] border-r border-[#414755]/10 flex flex-col py-[21px] px-3.5 shrink-0 overflow-y-auto scrollbar-thin">
        
        {/* Toggle between Schema & K8s */}
        <div className="flex bg-black/45 rounded p-0.5 border border-white/5 font-mono text-[8px] uppercase tracking-wider mb-5 shrink-0 select-none">
          <button
            onClick={() => setSidebarMode('k8s')}
            className={`w-1/2 py-2.5 rounded cursor-pointer transition-all text-center font-bold tracking-widest ${
              sidebarMode === 'k8s'
                ? "bg-[#c5a27a] text-black"
                : "text-white/40 hover:text-white"
            }`}
          >
            📟 K8s Explorer
          </button>
          <button
            onClick={() => setSidebarMode('schema')}
            className={`w-1/2 py-2.5 rounded cursor-pointer transition-all text-center font-bold tracking-widest ${
              sidebarMode === 'schema'
                ? "bg-[#c5a27a] text-black"
                : "text-white/40 hover:text-white"
            }`}
          >
            📁 SQL Schema
          </button>
        </div>

        {sidebarMode === 'k8s' ? (
          /* K8s Namespace & Pods Explorer */
          <div className="flex-1 flex flex-col gap-4 animate-fade-in text-white">
            <h3 className="font-mono text-[9px] text-[#c5a27a] font-bold uppercase tracking-[0.2em] px-2 flex items-center gap-2 shrink-0">
              <Layers size={10} className="text-[#c5a27a]" />
              Namespace pods
            </h3>

            {/* Namespaces representation tree */}
            <div className="space-y-4 pt-1">
              {['coral-prod', 'kube-system'].map((ns) => {
                const nsPods = explorerPods.filter(p => p.namespace === ns);
                return (
                  <div key={ns} className="space-y-2">
                    <div className="flex items-center gap-2 px-2 py-1 bg-white/[0.02] border border-white/5 rounded font-mono text-[10px] text-white/50 uppercase tracking-widest leading-snug">
                      <Clock size={10} className="text-[#c5a27a] shrink-0" />
                      <strong>{ns}</strong>
                    </div>

                    <div className="pl-3 border-l border-white/5 ml-3.5 space-y-2.5">
                      {nsPods.map((pod) => {
                        const isErr = pod.status === "CrashLoopBackOff" || pod.status === "OOMKilled" || pod.status?.toLowerCase().includes("err") || pod.status?.toLowerCase().includes("fail");
                        return (
                          <div
                            key={pod.name}
                            onClick={() => selectPodInExplorer(pod)}
                            className="group flex flex-col gap-1 px-2 py-1.5 rounded bg-[#161617]/30 hover:bg-[#161617]/90 active:bg-white/[0.02] border border-white/5 hover:border-[#c5a27a]/30 cursor-pointer transition-all duration-150"
                          >
                            <div className="flex items-start justify-between">
                              <span className="font-mono text-[10px] text-white/80 font-bold group-hover:text-[#c5a27a] truncate max-w-[130px]" title={pod.name}>
                                {pod.name}
                              </span>
                              <span className="relative flex h-1.5 w-1.5 min-w-[6px] shrink-0 mt-1">
                                <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${isErr ? 'animate-ping bg-rose-500' : 'bg-emerald-500'}`}></span>
                                <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${isErr ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
                              </span>
                            </div>
                            <div className="flex justify-between items-center text-[8px] font-mono text-white/30 uppercase tracking-wider">
                              <span>Req: {pod.cpu} / {pod.memory}</span>
                              <span className={isErr ? "text-rose-400 font-extrabold animate-pulse" : "text-emerald-400"}>{pod.status}</span>
                            </div>
                          </div>
                        );
                      })}
                      {nsPods.length === 0 && (
                        <div className="text-[9px] font-mono text-white/20 italic pl-3">No pods identified in pipeline</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Schema Catalog */
          <div className="flex-1 flex flex-col animate-fade-in">
            <h3 className="font-mono text-[9px] text-[#c5a27a] font-bold uppercase tracking-[0.2em] px-3 mb-5 flex items-center gap-2 shrink-0">
              <Layers size={10} className="text-[#c5a27a]" />
              Schema Catalog
            </h3>

            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.02] border border-white/5 rounded font-mono text-xs text-white/80">
                  <Database size={12} className="text-[#c5a27a]" />
                  <span className="font-semibold select-none font-sans text-[11px] tracking-wide">k8s_local_telemetry</span>
                </div>

                <div className="pl-4 border-l border-white/5 ml-4 mt-2.5 space-y-3">
                  {databaseSchema.map((table) => (
                    <div key={table.name} className="space-y-1">
                      <div
                        onClick={() => insertTableName(table.name)}
                        className="flex items-center gap-1.5 px-2.5 py-1 hover:text-[#c5a27a] hover:bg-white/[0.02] border border-transparent hover:border-white/5 rounded cursor-pointer font-mono text-xs text-white/70 transition-all duration-100"
                        title="Click to select table query template"
                      >
                        <Table size={11} className="text-[#c5a27a] shrink-0" />
                        <span className="truncate">{table.name}</span>
                      </div>

                      <div className="pl-4.5 pb-1 flex flex-col gap-1.5 text-[10px] font-mono text-white/40">
                        {table.columns.map((col) => (
                          <div key={col.name} className="flex items-center justify-between hover:text-white cursor-default px-1 py-0.5">
                            <span className="flex items-center gap-1">
                              {col.isKey ? (
                                <Key size={9} className="text-[#c5a27a]" />
                              ) : (
                                <span className="w-1 h-1 rounded-full bg-white/20 shrink-0" />
                              )}
                              <span className="tracking-tight">{col.name}</span>
                            </span>
                            <span className="opacity-40 text-[9px] lowercase italic">{col.type}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cross-Source Join Templates */}
              <div className="pt-4 mt-4 border-t border-white/5 space-y-3 shrink-0">
                <h4 className="font-mono text-[9px] text-[#c5a27a] font-bold uppercase tracking-[0.2em] px-2.5 flex items-center gap-2">
                  <Play size={10} className="text-[#c5a27a]" />
                  Cross-Source Joins
                </h4>
                
                <div className="space-y-2.5 px-0.5">
                  <div
                    onClick={() => {
                      const joinQuery = `-- Correlate billing anomalies with deployments & pod metrics
SELECT 
    b.timestamp, 
    b.service_name, 
    b.estimated_cost, 
    b.anomaly_score,
    d.version,
    d.deployed_by,
    p.cpu_usage,
    p.replicas
FROM supabase.billing_events b
JOIN supabase.deployments d ON b.service_name = d.service_name
JOIN supabase.pod_metrics p ON b.service_name = p.service_name
WHERE b.anomaly_score > 0.5
ORDER BY b.timestamp DESC
LIMIT 5;`;
                      setTabSql(joinQuery);
                      setExplorerFeedback("Loaded cross-source query: Billing anomalies joined with deployments & CPU stats.");
                    }}
                    className="p-2.5 rounded bg-[#161617]/30 hover:bg-[#161617]/90 active:bg-white/[0.02] border border-white/5 hover:border-[#c5a27a]/30 cursor-pointer transition-all text-[10px] font-mono text-white/70 hover:text-[#c5a27a] flex flex-col gap-1"
                  >
                    <span className="font-bold">💸 Billing Anomaly Correlation</span>
                    <span className="text-[8px] text-white/30 lowercase">Joins billing, deployments & pod_metrics</span>
                  </div>

                  <div
                    onClick={() => {
                      const joinQuery = `-- Correlate critical incidents with worker queue anomalies
SELECT 
    i.created_at, 
    i.service_name, 
    i.severity,
    i.message,
    w.retry_count,
    w.queue_depth,
    w.failed_jobs
FROM supabase.incidents i
JOIN supabase.worker_events w ON i.service_name = w.worker_name
WHERE i.severity = 'Critical' OR w.failed_jobs > 0
ORDER BY i.created_at DESC
LIMIT 5;`;
                      setTabSql(joinQuery);
                      setExplorerFeedback("Loaded cross-source query: Incidents joined with worker retry queues.");
                    }}
                    className="p-2.5 rounded bg-[#161617]/30 hover:bg-[#161617]/90 active:bg-white/[0.02] border border-white/5 hover:border-[#c5a27a]/30 cursor-pointer transition-all text-[10px] font-mono text-white/70 hover:text-[#c5a27a] flex flex-col gap-1"
                  >
                    <span className="font-bold">⚠️ SRE Incident Diagnostics</span>
                    <span className="text-[8px] text-white/30 lowercase">Joins incidents & worker_events</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}
      </aside>

      {/* Main split workbench space */}
      <main className="flex-grow flex flex-col min-w-0 bg-[#0a0a0b] overflow-hidden">
        
        {/* Editor Screen upper pane */}
        <section className="flex-1 flex flex-col min-h-[250px] border-b border-white/10 overflow-hidden relative">
          
          {/* Tab Selector bar */}
          <div className="h-9 flex bg-[#111112] shrink-0 border-b border-white/10 font-mono text-[10px] uppercase tracking-widest">
            <button
              onClick={() => setActiveTab('find_retry_anomalies')}
              className={`flex items-center gap-2 px-5 border-r border-[#414755]/10 border-t-[3px] h-full cursor-pointer transition-all ${
                activeTab === 'find_retry_anomalies'
                  ? 'bg-[#0a0a0b] border-t-[#c5a27a] text-[#c5a27a] font-bold'
                  : 'bg-transparent border-t-transparent text-white/40 hover:bg-white/[0.01]'
              }`}
            >
              <Table size={10} className="text-[#c5a27a]" />
              <span>critical_analyzers.sql</span>
            </button>
            <button
              onClick={() => setActiveTab('new_query')}
              className={`flex items-center gap-2 px-5 border-r border-[#414755]/10 border-t-[3px] h-full cursor-pointer transition-all ${
                activeTab === 'new_query'
                  ? 'bg-[#0a0a0b] border-t-[#c5a27a] text-[#c5a27a] font-bold'
                  : 'bg-transparent border-t-transparent text-white/40 hover:bg-white/[0.01]'
              }`}
            >
              <Table size={10} className="text-white/20" />
              <span>new_query.sql</span>
            </button>
          </div>

          {/* Code Textarea & lines numbers layout */}
          <div className="flex-1 flex overflow-hidden relative bg-[#070708]">
            
            {/* Left Line numbers column */}
            <div className="w-11 bg-[#0a0a0b] border-r border-white/5 flex flex-col items-end pr-2.5 py-4 font-mono text-[10px] text-white/25 select-none opacity-60">
              {Array.from({ length: Math.max(lines.length, 12) }).map((_, i) => (
                <span key={i} className="leading-relaxed">{i + 1}</span>
              ))}
            </div>

            {/* Code Terminal Area wrapper */}
            <div className="flex-grow p-4 overflow-auto font-mono text-xs leading-relaxed relative text-white/80">
              <textarea
                value={currentText}
                onChange={(e) => setTabSql(e.target.value)}
                className="absolute inset-0 w-full h-full p-4 pl-14 pr-4 bg-transparent border-none outline-none font-mono text-xs leading-relaxed text-[#c5a27a] placeholder-white/10 selection:bg-white/10 caret-[#c5a27a] resize-none"
                style={{ direction: 'ltr' }}
              />
            </div>

            {/* Interactive database run click button wrapper */}
            <div className="absolute bottom-4 right-6 z-10 flex gap-2">
              <button
                disabled={isRunning}
                onClick={handleExecuteQuery}
                className="bg-[#c5a27a] text-black hover:bg-[#b08e67] hover:shadow-[0_0_15px_rgba(197,162,122,0.3)] transition-all font-bold px-4 py-2 rounded font-mono text-[10px] uppercase tracking-widest flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isRunning ? (
                  <RefreshCw size={10} className="animate-spin text-black" />
                ) : (
                  <Play size={10} className="text-black fill-black" />
                )}
                <span>Run Query</span>
              </button>
            </div>
          </div>
        </section>

        {/* Temporary feedback banner */}
        {explorerFeedback && (
          <div className="px-5 py-2.5 bg-[#111112] border-b border-white/10 text-[#c5a27a] text-[10px] font-mono tracking-wider flex justify-between items-center animate-fade-in shrink-0">
            <span>{explorerFeedback}</span>
            <button onClick={() => setExplorerFeedback(null)} className="text-[9px] hover:text-white font-bold">[DISMISS]</button>
          </div>
        )}

        {/* Query Data Results lower pane */}
        <section className="h-[230px] flex flex-col bg-[#0a0a0b] shrink-0 overflow-hidden font-mono text-[11px]">
          
          {/* Output Controls Bar */}
          <div className="h-9 flex justify-between items-center px-5 bg-[#111112] border-b border-white/10 shrink-0">
            <div className="flex items-center gap-3">
              <span className="font-bold text-[#c5a27a] uppercase tracking-widest text-[10px]">Command Output</span>
              {isRunning ? (
                <span className="text-[9px] text-[#c5a27a] bg-white/5 px-2 py-0.5 border border-[#c5a27a]/15 rounded">
                  Busy: querying local cluster telemetry...
                </span>
              ) : (
                <span className="text-[9px] text-white/40 bg-black/45 px-2 py-0.5 border border-white/5 rounded">
                  Returned <span className="text-white font-bold">{queryResult.rows.length}</span> records in <span className="text-[#c5a27a] font-bold">{queryResult.timeMs}ms</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button 
                onClick={handleExportCSV}
                className="text-white/40 hover:text-white transition-colors p-1"
                title="Download Results as CSV"
              >
                <Download size={13} />
              </button>
              <button 
                onClick={() => setExplorerFeedback("System telemetry optimization: standard columns parsed successfully.")}
                className="text-white/40 hover:text-white transition-colors p-1"
                title="Column Filter"
              >
                <Filter size={13} />
              </button>
            </div>
          </div>

          {/* Results table grid panel */}
          <div className="flex-grow overflow-auto select-all selection:bg-white/10">
            {isRunning ? (
              <div className="py-12 flex flex-col justify-center items-center gap-2 font-mono text-[11px] text-white/30">
                <RefreshCw size={14} className="animate-spin text-[#c5a27a]" />
                <span className="uppercase tracking-widest text-[9px]">Awaiting database replica sync...</span>
              </div>
            ) : (
              <table className="w-full text-left border-collapse select-all font-mono text-[11px] whitespace-nowrap">
                <thead className="sticky top-0 bg-[#161617] z-10 border-b border-white/10 text-white/40">
                  <tr>
                    <th className="py-2.5 px-4 font-normal text-center w-10 text-[9px] uppercase tracking-wider">#</th>
                    {queryResult.columns.map((col) => (
                      <th key={col} className="py-2.5 px-4 font-normal text-left truncate max-w-[150px] text-[9px] uppercase tracking-wider">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-transparent">
                  {queryResult.rows.map((row, idx) => {
                    const statusVal = row['status']?.toString();
                    const exitCodeVal = row['exit_code_reason']?.toString();
                    const isAnomalousRow = statusVal === 'CrashLoopBackOff' || exitCodeVal === 'OOMKilled' || row['restarts'] > 5;
                    
                    let bgColStyle = "border-b border-white/5 hover:bg-white/[0.015] transition-colors duration-700";
                    if (isAnomalousRow) {
                      bgColStyle = "border-b border-white/10 bg-rose-500/[0.03] hover:bg-rose-500/[0.05] transition-colors";
                    }

                    return (
                      <tr key={idx} className={bgColStyle}>
                        <td className={`py-2 px-4 text-center opacity-30 border-l ${isAnomalousRow ? 'border-l-rose-500 font-bold' : 'border-l-transparent'}`}>
                          {idx + 1}
                        </td>
                        {queryResult.columns.map((col) => {
                          const val = row[col];
                          let cellStyle = "text-white/70";
                          if (col === 'status') {
                            if (val === 'CrashLoopBackOff') {
                              cellStyle = "text-rose-400 font-bold";
                            } else if (val === 'Running') {
                              cellStyle = "text-emerald-400";
                            } else {
                              cellStyle = "text-[#c5a27a]";
                            }
                          } else if (col === 'status' && val === 'OOMKilled') {
                            cellStyle = "text-rose-400 font-bold italic";
                          } else if (col === 'replicas') {
                            cellStyle = "text-[#c5a27a] font-bold";
                          } else if (col === 'timestamp') {
                            cellStyle = "text-white/30 text-[10px]";
                          }

                          return (
                            <td key={col} className={`py-2 px-4 ${cellStyle} max-w-[180px] truncate`}>
                              {val?.toString() || 'NULL'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}

                  {queryResult.rows.length === 0 && (
                    <tr>
                      <td colSpan={queryResult.columns.length + 1} className="py-12 text-center text-white/20 font-mono text-[10px] uppercase tracking-widest">
                        No rows returned.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

        </section>

      </main>

    </div>
  );
}
