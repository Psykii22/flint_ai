import React, { useState } from 'react';
import { Lock, Eye, EyeOff, Save, Plus, Trash2, Key, Info, HelpCircle } from 'lucide-react';

export default function VaultWorkspace() {
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({
    gemini: false,
    db: false,
  });

  const [localVault, setLocalVault] = useState([
    { key: 'GEMINI_API_KEY', value: '✔ INJECTED VIA PLATFORM SECRETS SECURELY', isSystem: true, id: 'gemini' },
    { key: 'DATABASE_URL', value: 'postgresql://sysadmin:8f92bdc49af0df@coral-us-east-1a-rds.db/telemetry', isSystem: true, id: 'db' },
    { key: 'PORT', value: '3000', isSystem: true, id: 'port' },
    { key: 'NODE_ENV', value: 'production', isSystem: true, id: 'env' },
  ]);

  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [vaultFeedback, setVaultFeedback] = useState<string | null>(null);

  const toggleShow = (id: string) => {
    setShowKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAddSecret = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey || !newValue) return;
    setLocalVault((prev) => [
      ...prev,
      { key: newKey.toUpperCase().trim(), value: newValue.trim(), isSystem: false, id: Math.random().toString() }
    ]);
    setVaultFeedback(`Successfully registered secret parameter: ${newKey.toUpperCase().trim()}`);
    setNewKey('');
    setNewValue('');
  };

  const handleDeleteSecret = (id: string) => {
    const item = localVault.find(i => i.id === id);
    setLocalVault((prev) => prev.filter((item) => item.id !== id));
    if (item) {
      setVaultFeedback(`Deleted secret parameter: ${item.key}`);
    }
  };

  return (
    <div className="ml-64 mt-12 mb-6 p-8 flex flex-col gap-6 h-[calc(100vh-72px)] overflow-y-auto font-sans text-white scrollbar-thin">
      
      {/* Title */}
      <div className="flex justify-between items-end border-b border-white/10 pb-5 shrink-0 animate-fade-in">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-serif italic text-white leading-tight">Coral Security Vault</h2>
          <p className="text-[10px] uppercase tracking-[0.25em] font-sans font-semibold text-white/40 mt-1.5">Secure storage panel for environment variables, database authorization strings, and OAuth configurations.</p>
        </div>
      </div>

      {/* Temporary feedback banner */}
      {vaultFeedback && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-[#c5a27a] text-xs font-mono rounded flex justify-between items-center animate-fade-in shrink-0">
          <span>{vaultFeedback}</span>
          <button onClick={() => setVaultFeedback(null)} className="text-[10px] hover:text-white font-bold uppercase tracking-widest">[Close]</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Core Secrets List */}
        <div className="md:col-span-2 bg-[#111112] border border-white/10 rounded p-5 flex flex-col shadow-xl">
          <h3 className="font-mono text-[10px] text-[#c5a27a] font-bold uppercase tracking-widest mb-5 flex items-center gap-2 border-b border-white/5 pb-3">
            <Lock size={12} className="text-[#c5a27a]" />
            Active Environment Variables
          </h3>

          <div className="space-y-3 flex-grow overflow-y-auto max-h-[400px] scrollbar-thin pr-1">
            {localVault.map((item) => {
              const isMaskedId = item.id === 'gemini' || item.id === 'db';
              const isVisible = showKeys[item.id] || !isMaskedId;

              return (
                <div key={item.id} className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between p-3.5 bg-black/15 hover:bg-white/[0.015] border border-white/5 rounded transition-all duration-150">
                  <div className="flex flex-col select-all min-w-0">
                    <span className="font-mono text-[10px] text-white/40 font-bold uppercase tracking-wider flex items-center gap-2">
                      <span className="truncate">{item.key}</span>
                      {item.isSystem && (
                        <span className="text-[8px] tracking-widest text-[#c5a27a] bg-[#c5a27a]/10 border border-[#c5a27a]/20 px-1.5 py-0.5 rounded font-sans uppercase">
                          System
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-xs text-white/80 tracking-wider mt-1.5 break-all select-all">
                      {isVisible ? item.value : '••••••••••••••••••••••••••••••••'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto shrink-0 pl-4 border-l border-white/5">
                    {isMaskedId && (
                      <button
                        onClick={() => toggleShow(item.id)}
                        className="p-1 px-2 border border-white/10 bg-transparent text-white/60 hover:text-white rounded hover:bg-white/5 transition-all cursor-pointer duration-150"
                        title="Toggle visibility"
                      >
                        {showKeys[item.id] ? <EyeOff size={11} /> : <Eye size={11} />}
                      </button>
                    )}
                    
                    {!item.isSystem ? (
                      <button
                        onClick={() => handleDeleteSecret(item.id)}
                        className="p-1 text-rose-400 hover:text-rose-300 hover:bg-white/5 border border-transparent hover:border-rose-500/20 rounded transition-all cursor-pointer duration-150"
                        title="Delete key-pair"
                      >
                        <Trash2 size={11} />
                      </button>
                    ) : (
                      <span className="text-[9px] uppercase tracking-widest text-white/20 font-mono select-none">ReadOnly</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Add custom variables sidebar card */}
        <div className="space-y-4">
          <div className="bg-[#111112] border border-white/10 rounded p-5 shadow-xl">
            <h3 className="font-mono text-[10px] text-[#c5a27a] font-bold uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-white/5 pb-3">
              <Plus size={12} className="text-[#c5a27a]" />
              Inject Parameter
            </h3>

            <form onSubmit={handleAddSecret} className="space-y-4 font-mono text-xs">
              <div>
                <label className="block text-white/40 tracking-widest uppercase text-[9px] mb-1.5">Variable Key:</label>
                <input
                  type="text"
                  required
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="AWS_ROLE_ARN"
                  className="w-full bg-black/20 border border-white/10 rounded p-2 text-white/90 focus:border-[#c5a27a] outline-none text-xs tracking-wider transition-all"
                />
              </div>

              <div>
                <label className="block text-white/40 tracking-widest uppercase text-[9px] mb-1.5">Secret Connection Value:</label>
                <input
                  type="text"
                  required
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="arn:aws:iam::123456:role/finops"
                  className="w-full bg-black/20 border border-white/10 rounded p-2 text-white/90 focus:border-[#c5a27a] outline-none text-xs tracking-wider transition-all"
                />
              </div>

              <button
                type="submit"
                className="w-full text-center py-2.5 bg-[#c5a27a] text-black font-semibold font-mono text-[10px] uppercase tracking-widest rounded hover:bg-[#b08e67] transition-all cursor-pointer duration-150 shadow-inner"
              >
                Inject Parameter
              </button>
            </form>
          </div>

          <div className="bg-[#111112] border border-white/5 rounded p-4 text-xs font-sans text-white/60 leading-relaxed flex items-start gap-2.5 italic">
            <Info size={14} className="text-[#c5a27a] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-[#c5a27a] uppercase tracking-widest text-[9px] block">Platform Disclosure:</span>
              <p className="text-[11px] leading-relaxed">Platform credentials and API keys are managed safely through AI Studio's settings view. Directly hardcoded variables are barred from browser logs to protect access records.</p>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
