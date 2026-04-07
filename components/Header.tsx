import React from 'react';

interface HeaderProps {
    credits: number;
    onHistoryClick: () => void;
    hasApiKey: boolean;
}

export const Header: React.FC<HeaderProps> = ({ credits, onHistoryClick, hasApiKey }) => {
  return (
    <header className="fixed top-0 z-50 w-full bg-schiele-surface/90 backdrop-blur-md border-b border-schiele-border py-4 px-6 md:px-12 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight text-schiele-ink">
          Render<span className="text-schiele-rust">X</span> <span className="text-xs ml-1 text-schiele-secondary font-medium px-2 py-0.5 border border-schiele-border rounded-md">.VIP</span>
        </h1>
      </div>
      <div className="flex items-center gap-6">
        <div className={`hidden md:flex items-center gap-1 px-3 py-1 rounded-full border text-xs font-bold ${hasApiKey ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
          <i className={`fas ${hasApiKey ? 'fa-circle-check' : 'fa-key'}`}></i>
          <span>{hasApiKey ? 'API 已配置' : '未配置 API'}</span>
        </div>
        <button 
            onClick={onHistoryClick}
            className="text-sm font-bold uppercase tracking-widest text-schiele-secondary hover:text-schiele-ink cursor-pointer transition-colors flex items-center gap-2"
        >
            <i className="fas fa-history"></i>
            <span className="hidden md:inline">方案库</span>
        </button>
        <div className="flex items-center space-x-2 bg-white/50 px-4 py-1.5 rounded-full border border-schiele-border text-schiele-rust">
            <i className="fas fa-circle-dollar text-xl text-yellow-500"></i>
            <span className="text-lg font-bold text-schiele-ink ml-1">{credits}</span>
        </div>
      </div>
    </header>
  );
};
