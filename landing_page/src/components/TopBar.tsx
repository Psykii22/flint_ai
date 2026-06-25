import React from 'react';
import { FolderOpen, Radio, Terminal, Settings, Search, CircleCheck } from 'lucide-react';
import { ActiveScreen } from '../types';

interface TopBarProps {
  activeScreen: ActiveScreen;
  searchFilter: string;
  setSearchFilter: (val: string) => void;
  isAuthenticated: boolean;
}

export default function TopBar({ activeScreen, searchFilter, setSearchFilter, isAuthenticated }: TopBarProps) {
  // Translate screen identifier to nice path
  const getPath = () => {
    switch (activeScreen) {
      case 'auth':
        return 'flint-auth ~ /workspace/authenticate';
      case 'overview':
        return 'flint-term ~ /workspace/investigation/overview';
      case 'nodes':
        return 'flint-term ~ /workspace/investigation/strm';
      case 'shield':
        return 'flint-term ~ /workspace/investigation/shield-firewall';
      case 'explorer':
        return 'flint-term ~ /workspace/investigation/sql';
      case 'vault':
        return 'flint-term ~ /workspace/investigation/vault';
      default:
        return 'flint-term ~ /workspace/investigation';
    }
  };

  return (
    <header className="fixed top-0 right-0 w-[calc(100%-16rem)] h-12 bg-[#0a0a0b] border-b border-white/10 flex items-center justify-between px-6 z-10 transition-all duration-200 font-mono">
      <div className="text-[11px] text-white/50 flex items-center gap-2 tracking-wide">
        <FolderOpen size={13} className="text-[#c5a27a]" />
        <span>{getPath()}</span>
      </div>

      <div className="flex items-center gap-4 animate-fade-in">
        {/* Dynamic Search viewable primarily on Data Explorer tab */}
        {isAuthenticated && (activeScreen === 'explorer' || activeScreen === 'nodes') && (
          <div className="relative flex items-center">
            <Search size={13} className="absolute left-2.5 text-white/40" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="bg-white/[0.02] border border-white/10 text-white text-[11px] rounded py-1 pl-8 pr-3 w-48 focus:outline-none focus:border-[#c5a27a] placeholder-white/20 transition-all duration-150 tracking-wider"
              placeholder={activeScreen === 'explorer' ? "Filter sql buffer..." : "Filter active streams..."}
            />
          </div>
        )}

        <div className="flex items-center gap-1.5">
          {/* Diagnostic Indicators */}
          <button 
            title="Sensors Status: Online" 
            className="p-1.5 text-white/40 hover:text-white hover:bg-white/[0.03] rounded transition-all duration-150 cursor-pointer border border-transparent hover:border-white/5"
          >
            <Radio size={13} className="text-emerald-500" />
          </button>
          
          <button 
            title="Terminal Engine" 
            className="p-1.5 text-white/40 hover:text-white hover:bg-white/[0.03] rounded transition-all duration-150 cursor-pointer border border-transparent hover:border-white/5"
          >
            <Terminal size={13} />
          </button>
          
          <button 
            title="Settings Preferences" 
            className="p-1.5 text-white/40 hover:text-white hover:bg-white/[0.03] rounded transition-all duration-150 cursor-pointer border border-transparent hover:border-white/5"
          >
            <Settings size={13} />
          </button>
        </div>
      </div>
    </header>
  );
}
