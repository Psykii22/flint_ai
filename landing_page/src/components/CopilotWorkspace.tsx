import React, { useState, useEffect, useRef } from 'react';
import { Bot, User, Send, Play, Sparkles, Terminal, CheckCircle, AlertOctagon, HelpCircle, Layers, RefreshCw } from 'lucide-react';

interface Message {
  id: string;
  sender: 'user' | 'agent';
  text?: string;
  sql?: string;
  sqlExplanation?: string;
  queryRows?: any[];
  recoveryCommand?: string;
  remediationLabel?: string;
  loading?: boolean;
}

export default function CopilotWorkspace() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'agent',
      text: `### Welcome SRE! I am your Flint-powered SRE Co-Pilot. 

I can query all your Kubernetes telemetry logs, deployment records, incident histories, and cloud billing events dynamically using the **Flint SQL engine**, and propose direct recovery plans.

Ask me anything, or click one of the quick diagnostics below:`,
    }
  ]);
  const [inputVal, setInputVal] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [systemFeedback, setSystemFeedback] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isBusy) return;

    const userMsgId = Math.random().toString();
    const agentMsgId = Math.random().toString();

    // Append User message and temporary loading agent message
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, sender: 'user', text: textToSend },
      { id: agentMsgId, sender: 'agent', loading: true }
    ]);
    setInputVal('');
    setIsBusy(true);
    setSystemFeedback(null);

    try {
      const response = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: textToSend })
      });

      const data = await response.json();

      if (data.success) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === agentMsgId
              ? {
                  id: agentMsgId,
                  sender: 'agent',
                  text: data.answer,
                  sql: data.sql,
                  sqlExplanation: data.explanation,
                  queryRows: data.rows || [],
                  recoveryCommand: data.recoveryCommand,
                  remediationLabel: data.remediationLabel
                }
              : msg
          )
        );
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (err: any) {
      console.error(err);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === agentMsgId
            ? {
                id: agentMsgId,
                sender: 'agent',
                text: `❌ **Failed to retrieve analysis:** ${err.message || 'The SRE telemetry agent service timed out.'}`
              }
            : msg
        )
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleExecuteRecovery = async (command: string, label: string) => {
    setSystemFeedback(`Executing recovery action: "${command}"...`);
    try {
      const response = await fetch('/api/execute-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command })
      });
      const data = await response.json();
      if (data.success) {
        setSystemFeedback(`✅ Action [${label}] completed successfully. Nodes scaled and namespace synchronized.`);
      } else {
        throw new Error(data.error || 'Execution failed');
      }
    } catch (err: any) {
      console.error(err);
      setSystemFeedback(`❌ Failed to execute recovery: ${err.message || 'Server timeout'}`);
    }
  };

  const suggestions = [
    {
      label: '💸 Correlate recent deploys with billing anomalies',
      prompt: 'Show recent deployments that match billing anomalies or cost spikes.'
    },
    {
      label: '📟 Find pods with high restarts & OOM evictions',
      prompt: 'Inspect pod metrics for pods in CrashLoopBackOff or OOMKilled.'
    },
    {
      label: '⚠️ Check worker queue backlog & failed jobs',
      prompt: 'Query worker events to see if any queues are backed up or jobs failed.'
    }
  ];

  return (
    <div className="ml-64 mt-12 mb-6 p-8 flex flex-col gap-6 h-[calc(100vh-72px)] overflow-hidden font-sans text-white bg-[#0a0a0b]">
      
      {/* Title */}
      <div className="flex justify-between items-end border-b border-white/10 pb-5 shrink-0">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-serif italic text-white leading-tight flex items-center gap-2">
            SRE Co-Pilot Terminal
            <span className="p-1 rounded bg-[#c5a27a]/15 text-[#c5a27a] text-xs font-mono font-bold uppercase tracking-widest flex items-center gap-1">
              <Sparkles size={11} /> Autonomous
            </span>
          </h2>
          <p className="text-[10px] uppercase tracking-[0.25em] font-sans font-semibold text-white/40 mt-1.5">Conversational AI Agent executing Flint SQL queries dynamically for telemetry diagnostics.</p>
        </div>
      </div>

      {/* Temporary feedback banner */}
      {systemFeedback && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-[#c5a27a] text-xs font-mono rounded flex justify-between items-center animate-fade-in shrink-0">
          <span>{systemFeedback}</span>
          <button onClick={() => setSystemFeedback(null)} className="text-[10px] hover:text-white font-bold uppercase tracking-widest">[Close]</button>
        </div>
      )}

      {/* Chat pane layout */}
      <div className="flex-grow flex flex-col min-h-0 bg-[#111112]/40 border border-white/10 rounded-lg overflow-hidden relative shadow-xl">
        
        {/* Messages scroll box */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin select-text">
          {messages.map((msg) => {
            const isAgent = msg.sender === 'agent';
            return (
              <div key={msg.id} className={`flex gap-4 max-w-4xl ${isAgent ? 'mr-12' : 'ml-auto mr-0 flex-row-reverse text-right'}`}>
                {/* Avatar */}
                <div className={`w-8 h-8 rounded border flex items-center justify-center shrink-0 ${isAgent ? 'bg-[#c5a27a]/10 border-[#c5a27a]/30 text-[#c5a27a]' : 'bg-white/5 border-white/15 text-white'}`}>
                  {isAgent ? <Bot size={14} /> : <User size={14} />}
                </div>

                {/* Bubble content */}
                <div className="space-y-3.5 min-w-0">
                  <div className={`p-4 rounded-lg text-xs leading-relaxed border ${
                    isAgent 
                      ? 'bg-black/20 border-white/5 text-white/90' 
                      : 'bg-[#c5a27a]/10 border-[#c5a27a]/30 text-white/95 text-left'
                  }`}>
                    {msg.loading ? (
                      <div className="flex items-center gap-2 text-[#c5a27a] font-mono">
                        <RefreshCw size={12} className="animate-spin" />
                        <span className="uppercase tracking-widest text-[9px]">Co-Pilot is compiling Flint SRE queries...</span>
                      </div>
                    ) : (
                      <div className="prose prose-invert max-w-none break-words whitespace-pre-line">
                        {msg.text}
                      </div>
                    )}
                  </div>

                  {/* Render executed SQL if any */}
                  {isAgent && msg.sql && (
                    <div className="bg-[#070708] border border-white/5 rounded-md overflow-hidden font-mono text-[11px] max-w-full text-left">
                      <div className="bg-[#161617] px-4 py-2 border-b border-white/5 text-[9px] text-[#c5a27a] uppercase tracking-widest font-bold flex justify-between items-center">
                        <span>🔍 Compiled Flint SQL</span>
                        <span className="opacity-55 text-[8px] lowercase italic font-normal">{msg.sqlExplanation}</span>
                      </div>
                      <pre className="p-4 overflow-x-auto whitespace-pre-wrap select-all leading-relaxed text-white/70">
                        {msg.sql}
                      </pre>
                      
                      {/* Render Mini Table if rows returned */}
                      {msg.queryRows && msg.queryRows.length > 0 && (
                        <div className="border-t border-white/5 overflow-x-auto">
                          <table className="w-full text-left border-collapse text-[10px] whitespace-nowrap">
                            <thead className="bg-white/[0.02] text-white/40">
                              <tr>
                                {Object.keys(msg.queryRows[0]).map((col) => (
                                  <th key={col} className="py-2 px-3.5 border-b border-white/5 font-semibold text-[8px] uppercase tracking-wider">{col}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {msg.queryRows.slice(0, 3).map((row, idx) => (
                                <tr key={idx} className="hover:bg-white/[0.01]">
                                  {Object.values(row).map((val: any, vIdx) => (
                                    <td key={vIdx} className="py-1.5 px-3.5 border-b border-white/5 text-white/70 truncate max-w-[150px]">
                                      {val?.toString() || 'NULL'}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                              {msg.queryRows.length > 3 && (
                                <tr>
                                  <td colSpan={Object.keys(msg.queryRows[0]).length} className="py-2 px-3.5 text-center text-white/30 italic text-[9px]">
                                    ... and {msg.queryRows.length - 3} more records executed via Flint.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Render recovery action buttons */}
                  {isAgent && msg.recoveryCommand && (
                    <div className="flex gap-2 justify-start items-center animate-fade-in">
                      <button
                        onClick={() => handleExecuteRecovery(msg.recoveryCommand!, msg.remediationLabel!)}
                        className="bg-[#c5a27a] text-black hover:bg-[#b08e67] hover:shadow-[0_0_12px_rgba(197,162,122,0.25)] font-mono text-[9px] uppercase tracking-widest font-bold px-3 py-2 rounded flex items-center gap-1.5 cursor-pointer duration-150"
                      >
                        <Play size={10} className="fill-black text-black" />
                        <span>Run Recovery: {msg.remediationLabel}</span>
                      </button>
                      <span className="text-[9px] font-mono text-white/30 truncate max-w-[180px]" title={msg.recoveryCommand}>
                        ({msg.recoveryCommand})
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Suggestion Chips */}
        {messages.length === 1 && (
          <div className="px-6 pb-4 flex flex-wrap gap-2.5 shrink-0 z-10">
            {suggestions.map((sug, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(sug.prompt)}
                disabled={isBusy}
                className="px-3.5 py-2 rounded bg-[#161617]/40 hover:bg-[#161617]/90 active:bg-white/[0.02] border border-white/5 hover:border-[#c5a27a]/30 text-white/70 hover:text-[#c5a27a] text-[10px] font-mono tracking-wide text-left cursor-pointer transition-all duration-150"
              >
                {sug.label}
              </button>
            ))}
          </div>
        )}

        {/* Chat input box */}
        <div className="p-4 bg-[#161617]/80 border-t border-white/10 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(inputVal);
            }}
            className="flex gap-3"
          >
            <div className="flex-grow bg-black/35 border border-white/10 rounded flex items-center px-3.5 focus-within:border-[#c5a27a] transition-all">
              <Terminal size={12} className="text-[#c5a27a] mr-2.5 shrink-0" />
              <input
                type="text"
                disabled={isBusy}
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="Ask Co-Pilot about cluster status or billing anomalies..."
                className="w-full bg-transparent border-none outline-none py-3 text-xs text-white placeholder-white/20 font-mono tracking-wide"
              />
            </div>
            
            <button
              type="submit"
              disabled={isBusy || !inputVal.trim()}
              className="bg-[#c5a27a] text-black hover:bg-[#b08e67] disabled:opacity-30 disabled:pointer-events-none transition-all font-bold px-5 py-3 rounded flex items-center justify-center cursor-pointer shadow-lg"
            >
              <Send size={13} className="text-black" />
            </button>
          </form>
        </div>

      </div>

    </div>
  );
}
