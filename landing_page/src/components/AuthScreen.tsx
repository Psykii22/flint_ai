import React, { useState } from 'react';
import { Folder, ChevronRight, Play, ArrowRight, Github, Chrome, ShieldAlert, Sparkles, Terminal, Activity, Keyboard } from 'lucide-react';

interface AuthScreenProps {
  onLoginSuccess: (email: string) => void;
}

export default function AuthScreen({ onLoginSuccess }: AuthScreenProps) {
  const [email, setEmail] = useState('sysadmin@flint.ai');
  const [token, setToken] = useState('0x6F92ADCE49BF013A');
  const [isConnecting, setIsConnecting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [logLogs, setLogLogs] = useState<string[]>([]);
  const [hintMessage, setHintMessage] = useState<string | null>(null);

  const handleRegenerate = (e: React.MouseEvent) => {
    e.preventDefault();
    const chars = 'ABCDEF0123456789';
    let result = '0x';
    for (let i = 0; i < 16; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setToken(result);
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setHintMessage("Please provide a valid workspace email.");
      return;
    }
    setIsConnecting(true);
    setLogLogs(["[SYS] Init system connection handshake..."]);
    await sleep(400);
    setLogLogs((prev) => [...prev, "[SYS] Connecting to secure local gateway kr8-local..."]);
    await sleep(400);
    setLogLogs((prev) => [...prev, "[SYS] Verifying credentials signature token..."]);
    await sleep(400);
    setLogLogs((prev) => [...prev, "[SYS] Connection verified. Booting Flint AI environment..."]);
    await sleep(300);
    onLoginSuccess(email);
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#0a0a0b] text-[#e5e5e5] font-sans pb-12 transition-all duration-300">
      
      {/* Top Header line with interactive Sign In button (Step 2) */}
      <header className="border-b border-white/10 w-full px-8 h-14 flex justify-between items-center bg-[#0a0a0b]/90 backdrop-blur z-50">
        <div className="text-sm font-serif italic text-white flex items-center gap-2.5">
          <Sparkles size={16} className="text-[#c5a27a]" />
          <span>Flint AI Secure Gateway</span>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Sign In Button / Top-Right Header trigger */}
          <button 
            onClick={() => {
              setShowModal(!showModal);
              setHintMessage("Step 2: Sign In active. Click Initialize Connection to bypass auth.");
            }} 
            className={`font-mono transition-all duration-200 text-[10px] uppercase tracking-widest rounded px-4 py-2 cursor-pointer font-bold ${
              showModal 
                ? 'bg-[#c5a27a] text-black border-transparent shadow-[0_0_12px_rgba(197,162,122,0.3)]' 
                : 'text-white border border-white/20 hover:border-white/40 hover:bg-white/[0.02]'
            }`}
          >
            {showModal ? "Close Panel" : "Sign In"}
          </button>
        </div>
      </header>

      {/* Main Connection Modal Area */}
      <main className="flex-grow flex items-center justify-center p-4">
        
        {!showModal ? (
          /* Elegant pre-auth placeholder screen prompting Sign In transition */
          <div className="text-center max-w-lg p-8 rounded-lg border border-white/5 bg-[#111112]/50 backdrop-blur transition-all duration-500 animate-fade-in flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded bg-white/[0.02] border border-white/10 flex items-center justify-center text-[#c5a27a] mb-2 animate-pulse">
              <Terminal size={22} />
            </div>
            <h2 className="text-2xl font-serif italic text-white">Handshake Connection Pending</h2>
            <p className="text-xs text-white/50 leading-relaxed font-sans max-w-md">
              To align your workspace dashboard and investigate active Kubernetes replica logs, please sign in via the secure portal entry.
            </p>
            <div className="mt-4">
              <button
                onClick={() => {
                  setShowModal(true);
                  setHintMessage("Use pre-filled credentials or bypass instantly via the main button.");
                }}
                className="px-5 py-2.5 bg-white/[0.04] hover:bg-[#c5a27a] hover:text-black hover:border-transparent font-mono text-[10px] uppercase tracking-widest rounded border border-white/10 transition-all flex items-center gap-2 cursor-pointer font-bold duration-200"
              >
                <span>Initiate Session</span>
                <ChevronRight size={11} />
              </button>
            </div>
          </div>
        ) : (
          /* Stateful Auth Slide down/fade in modal sheet */
          <div className="w-full max-w-md bg-[#111112] border border-[#c5a27a]/30 sm:border-white/10 rounded shadow-[0_25px_60px_rgba(0,0,0,0.9)] overflow-hidden transition-all duration-500 transform translate-y-0 opacity-100">
            
            {/* Editor-Style Tab Header */}
            <div className="bg-[#161617] border-b border-white/10 px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white/50 font-mono text-[10px] uppercase tracking-wider">
                <Folder size={12} className="text-[#c5a27a]" />
                <span>flint-terminal</span>
                <ChevronRight size={10} className="text-white/20" />
                <span className="text-white/70">session-init.yaml</span>
              </div>
              {/* Window control dots */}
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-rose-500/40"></div>
                <div className="w-2 h-2 rounded-full bg-amber-500/40"></div>
                <div className="w-2 h-2 rounded-full bg-emerald-500/40"></div>
              </div>
            </div>

            {/* Core Auth Form Block */}
            <div className="p-8">
              <div className="mb-6 text-center">
                <h1 className="text-2xl font-serif italic text-white mb-1.5">Gateway Handshake</h1>
                <p className="text-xs text-white/40 font-mono uppercase tracking-widest">Local cluster authentication protocol</p>
              </div>

              {hintMessage && (
                <div className="mb-4 p-3 bg-[#c5a27a]/10 border border-[#c5a27a]/20 text-[#c5a27a] text-[11px] font-mono rounded flex justify-between items-center animate-fade-in shrink-0">
                  <span className="leading-snug">{hintMessage}</span>
                  <button onClick={() => setHintMessage(null)} className="text-[9px] uppercase hover:text-white ml-2 shrink-0 font-bold">[Dismiss]</button>
                </div>
              )}

              {isConnecting ? (
                <div className="space-y-4 py-8 font-mono text-xs">
                  <div className="p-4 bg-black/40 border border-white/10 rounded space-y-2 text-[#c5a27a]">
                    {logLogs.map((log, idx) => (
                      <div key={idx} className="animate-fade-in">{log}</div>
                    ))}
                  </div>
                  <div className="flex items-center justify-center gap-2 text-white/30 animate-pulse text-[10px] uppercase tracking-widest">
                    <div className="w-1.4 h-3 bg-[#c5a27a]"></div>
                    <span>Establishing TLS Tunnel...</span>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleConnect} className="space-y-4">
                  <div>
                    <label className="block text-[9px] font-mono text-white/40 mb-1.5 uppercase tracking-widest">
                      Workspace Credentials (Email)
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded p-2.5 text-white focus:border-[#c5a27a] focus:ring-0 outline-none text-xs font-mono transition-colors"
                      placeholder="sysadmin@flint.ai"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1.5">
                      <label className="block text-[9px] font-mono text-white/40 uppercase tracking-widest">
                        Secret Access Token
                      </label>
                      <a
                        href="#regenerate"
                        onClick={handleRegenerate}
                        className="text-[9px] font-mono text-[#c5a27a] hover:text-white transition-colors uppercase tracking-widest"
                      >
                        Regenerate
                      </a>
                    </div>
                    <input
                      type="password"
                      required
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded p-2.5 text-white focus:border-[#c5a27a] focus:ring-0 outline-none text-xs font-mono tracking-widest transition-colors"
                      placeholder="••••••••••••••••"
                    />
                  </div>

                  {/* INITIALIZE CONNECTION (Step 2 Bypass Button) */}
                  <button
                    type="submit"
                    className="w-full bg-[#c5a27a] text-black hover:bg-[#b08e67] hover:shadow-[0_0_15px_rgba(197,162,122,0.3)] py-3 px-4 rounded font-mono text-[10px] uppercase tracking-widest transition-all mt-6 flex justify-center items-center gap-2 cursor-pointer font-bold duration-150"
                  >
                    <span>Initialize Connection</span>
                    <ArrowRight size={12} className="text-black" />
                  </button>
                </form>
              )}

              <div className="mt-8 relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-[#111112] px-3 font-mono text-[9px] text-white/30 uppercase tracking-widest">
                    Federated OAuth Entry
                  </span>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    setEmail('github-svc@flint.ai');
                    setToken('0xGITHUB2026INITED');
                    setIsConnecting(true);
                    setLogLogs(["[SYS] Routing GitHub OAuth handshake...", "[SYS] Connected successfully."]);
                    setTimeout(() => onLoginSuccess('github-svc@flint.ai'), 1100);
                  }}
                  className="w-full bg-transparent border border-white/10 text-white py-2.5 px-4 rounded font-mono text-[10px] uppercase tracking-widest hover:bg-white/[0.03] hover:border-white/20 transition-all flex justify-center items-center gap-2 cursor-pointer duration-150"
                >
                  <Github size={12} className="text-white/60" />
                  <span>Connect with GitHub</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEmail('nellammishra12@gmail.com');
                    setToken('0xGOOGLEAUTOAUTH007');
                    setIsConnecting(true);
                    setLogLogs(["[SYS] Routing Google session verification...", "[SYS] Authorized through Workspace."]);
                    setTimeout(() => onLoginSuccess('nellammishra12@gmail.com'), 1100);
                  }}
                  className="w-full bg-transparent border border-white/10 text-white py-2.5 px-4 rounded font-mono text-[10px] uppercase tracking-widest hover:bg-white/[0.03] hover:border-white/20 transition-all flex justify-center items-center gap-2 cursor-pointer duration-150"
                >
                  <Chrome size={12} className="text-[#c5a27a]" />
                  <span>Verify Google Workspace</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Transactional Auth Footer */}
      <footer className="text-center text-[9px] text-white/40 font-mono tracking-widest px-6 mt-6 uppercase">
        <div className="mb-2">© 2026 Flint AI. Engineered for k8s telemetry & cloud forensics.</div>
        <div className="flex justify-center gap-4 text-[9px]">
          <span>Cluster Node: kr8-local</span>
          <span>•</span>
          <a href="#privacy" className="hover:text-white transition-colors">Forensic Standards</a>
          <span>•</span>
          <a href="#terms" className="hover:text-white transition-colors">Access Agreement</a>
        </div>
      </footer>
    </div>
  );
}
