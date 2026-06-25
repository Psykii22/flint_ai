import React from 'react';
import { Shield, SearchCode, Lock, Terminal, Activity, MessageSquare } from 'lucide-react';
import { ActiveScreen } from '../types';

interface SidebarProps {
  activeScreen: ActiveScreen;
  setScreen: (screen: ActiveScreen) => void;
  isAuthenticated: boolean;
  onLogout?: () => void;
}

export default function Sidebar({ activeScreen, setScreen, isAuthenticated, onLogout }: SidebarProps) {
  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-[#111112] border-r border-white/10 flex flex-col py-6 z-20 font-sans">
      {/* Brand Header */}
      <div className="px-6 mb-10 flex items-center gap-3">
        <div className="w-9 h-9 rounded border border-white/20 flex items-center justify-center shrink-0 hover:bg-white hover:text-black transition-colors duration-150">
          <Terminal size={15} className="current-color" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white tracking-[0.2em] uppercase">
            Flint<span className="font-thin text-white/40">AI</span>
          </h1>
          <p className="text-[9px] font-mono text-white/30 tracking-[0.2em] uppercase mt-1">v2.4.0</p>
        </div>
      </div>

      {/* Main Navigation Menu */}
      <nav className="flex-1 flex flex-col gap-2 px-4">
        {/* Nodes Tab */}
        <button
          onClick={() => isAuthenticated && setScreen('nodes')}
          disabled={!isAuthenticated}
          className={`flex items-center gap-3 px-4 py-3 border border-transparent rounded transition-all duration-150 text-left cursor-pointer w-full group ${
            !isAuthenticated ? 'opacity-30 cursor-not-allowed' : ''
          } ${
            activeScreen === 'nodes'
              ? 'bg-white/[0.02] text-[#c5a27a] border-white/10 border-l-[#c5a27a] border-l-2 font-bold'
              : 'text-white/60 hover:bg-white/[0.015] hover:text-white'
          }`}
        >
          <Activity size={15} className={activeScreen === 'nodes' ? 'text-[#c5a27a]' : 'text-white/40 group-hover:text-white transition-colors'} />
          <span className="text-[10px] uppercase tracking-[0.25em] font-semibold">Nodes Stream</span>
        </button>

        {/* Co-Pilot Tab */}
        <button
          onClick={() => isAuthenticated && setScreen('copilot')}
          disabled={!isAuthenticated}
          className={`flex items-center gap-3 px-4 py-3 border border-transparent rounded transition-all duration-150 text-left cursor-pointer w-full group ${
            !isAuthenticated ? 'opacity-30 cursor-not-allowed' : ''
          } ${
            activeScreen === 'copilot'
              ? 'bg-white/[0.02] text-[#c5a27a] border-white/10 border-l-[#c5a27a] border-l-2 font-bold'
              : 'text-white/60 hover:bg-white/[0.015] hover:text-white'
          }`}
        >
          <MessageSquare size={15} className={activeScreen === 'copilot' ? 'text-[#c5a27a]' : 'text-white/40 group-hover:text-white transition-colors'} />
          <span className="text-[10px] uppercase tracking-[0.25em] font-semibold">SRE Co-Pilot</span>
        </button>



        {/* Investigate tab (split to overview or explorer) */}
        <button
          onClick={() => isAuthenticated && setScreen('overview')}
          disabled={!isAuthenticated}
          className={`flex items-center gap-3 px-4 py-3 border border-transparent rounded transition-all duration-150 text-left cursor-pointer w-full group ${
            !isAuthenticated ? 'opacity-30 cursor-not-allowed' : ''
          } ${
            activeScreen === 'overview' || activeScreen === 'explorer'
              ? 'bg-white/[0.02] text-[#c5a27a] border-white/10 border-l-[#c5a27a] border-l-2 font-bold'
              : 'text-white/60 hover:bg-white/[0.015] hover:text-white'
          }`}
        >
          <SearchCode size={15} className={activeScreen === 'overview' || activeScreen === 'explorer' ? 'text-[#c5a27a]' : 'text-white/40 group-hover:text-white transition-colors'} />
          <span className="text-[10px] uppercase tracking-[0.25em] font-bold">Investigate SQL</span>
        </button>

        {/* Vault tab */}
        <button
          onClick={() => isAuthenticated && setScreen('vault')}
          disabled={!isAuthenticated}
          className={`flex items-center gap-3 px-4 py-3 border border-transparent rounded transition-all duration-150 text-left cursor-pointer w-full group ${
            !isAuthenticated ? 'opacity-30 cursor-not-allowed' : ''
          } ${
            activeScreen === 'vault'
              ? 'bg-white/[0.02] text-[#c5a27a] border-white/10 border-l-[#c5a27a] border-l-2 font-bold'
              : 'text-white/60 hover:bg-white/[0.015] hover:text-white'
          }`}
        >
          <Lock size={15} className={activeScreen === 'vault' ? 'text-[#c5a27a]' : 'text-white/40 group-hover:text-white transition-colors'} />
          <span className="text-[10px] uppercase tracking-[0.25em] font-semibold">Vault (Secrets)</span>
        </button>
      </nav>

      {/* Connection & AI scanner Status indicator */}
      {isAuthenticated && (
        <div className="mt-auto px-5 pt-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-3 py-2 bg-white/[0.02] border border-white/5 rounded">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#c5a27a] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#c5a27a]"></span>
            </span>
            <span className="text-[9px] font-mono uppercase tracking-widest text-[#c5a27a] font-bold truncate">
              AI: active
            </span>
          </div>
          
          <button 
            onClick={onLogout}
            className="w-full mt-4 text-center px-2 py-1.5 text-[9px] font-mono text-white/40 hover:text-white bg-transparent border border-white/10 hover:border-white/30 rounded transition-colors uppercase tracking-widest duration-150"
          >
            [Disconnect]
          </button>
        </div>
      )}
    </aside>
  );
}
