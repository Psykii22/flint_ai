import React from 'react';

interface FooterProps {
  latency?: number;
  cluster?: string;
  systemStatus?: string;
}

export default function Footer({ latency = 12, cluster = 'US-EAST-1', systemStatus = 'System Ready' }: FooterProps) {
  return (
    <footer className="fixed bottom-0 right-0 w-[calc(100%-16rem)] h-6 bg-[#0a0a0b] border-t border-white/10 flex items-center justify-between px-4 z-10 transition-all duration-200 font-mono text-[10px]">
      {/* Operating Status Indicator */}
      <div className="flex items-center gap-2">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-[#c5a27a] opacity-75"></span>
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#c5a27a]"></span>
        </span>
        <span className="text-white/40 tracking-wider">
          {systemStatus} | Latency: <span className="text-[#c5a27a] font-bold">{latency}ms</span> | Node: <span className="text-white/60">{cluster}</span>
        </span>
      </div>

      {/* Auxiliary Help Links */}
      <div className="flex gap-4">
        <span className="text-white/25 uppercase tracking-widest text-[9px]">
          [Internal Diagnostics Secured]
        </span>
      </div>
    </footer>
  );
}
