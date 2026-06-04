import React, { useState, useEffect, useCallback } from 'react';
import { GenerationMode, RenderStyle } from '../types';
import { STYLE_LABELS } from '../constants';
import { CompareSlider } from './CompareSlider';

interface OutputGalleryProps {
  results: any[];
  onUpscale: (result: any) => void;
  onUseAsInput: (result: any) => void;
}

export const OutputGallery: React.FC<OutputGalleryProps> = ({ results, onUpscale, onUseAsInput }) => {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  // Auto-select new items when results change (assuming index 0 is newest)
  useEffect(() => {
      setSelectedIndex(0);
  }, [results.length]);

  const getStyleDisplay = (result: any) => {
      if (result.mode === GenerationMode.FREE) return 'Free Mode';
      if (result.mode === GenerationMode.AUTO) return 'AI Auto';
      return STYLE_LABELS[result.style as RenderStyle] || result.style;
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === 'Escape') setLightboxIndex(null);
      if (e.key === 'ArrowLeft') {
          setLightboxIndex(prev => (prev !== null && prev < results.length - 1 ? prev + 1 : prev)); 
      }
      if (e.key === 'ArrowRight') {
          setLightboxIndex(prev => (prev !== null && prev > 0 ? prev - 1 : prev));
      }
  }, [lightboxIndex, results.length]);

  useEffect(() => {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (results.length === 0) return null;

  const currentResult = results[selectedIndex];

  return (
    <div className="w-full space-y-6 animate-slide-up">
        
        {/* MAIN STAGE */}
        {currentResult && (
            <div className="bg-white rounded-[24px] overflow-hidden shadow-paper border border-schiele-border">
                {currentResult.status === 'success' ? (
                    <div>
                        <div className="relative w-full overflow-hidden bg-gray-100 mx-auto group">
                              {/* Content */}
                              {currentResult.originalImageUrl ? (
                                <div className="w-full h-auto max-h-[70vh]" style={{ 
                                  aspectRatio: (() => {
                                    const ratio = currentResult.aspectRatio || '16:9';
                                    if (ratio.includes(':')) {
                                      const [w, h] = ratio.split(':').map(Number);
                                      if (w && h) {
                                        const r = w / h;
                                        if (r > 1.7) return '16/9';
                                        if (r > 1.4) return '4/3';
                                        if (r > 1.15) return '4/3';
                                        if (r > 0.85) return '1/1';
                                        if (r > 0.7) return '3/4';
                                        if (r > 0.55) return '9/16';
                                        return '9/16';
                                      }
                                    }
                                    return ratio.replace(':', '/');
                                  })()
                                }}>
                                    <CompareSlider original={currentResult.originalImageUrl} generated={currentResult.imageUrl} />
                                </div>
                              ) : (
                                <img 
                                    src={currentResult.imageUrl} 
                                    className="w-full h-auto object-contain max-h-[70vh] cursor-zoom-in bg-gray-50" 
                                    onClick={() => setLightboxIndex(selectedIndex)}
                                />
                            )}
                            
                            {/* Hover Hint for Fullscreen */}
                            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                    onClick={() => setLightboxIndex(selectedIndex)} 
                                    className="bg-black/50 hover:bg-black/70 text-white w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm"
                                >
                                    <i className="fas fa-expand"></i>
                                </button>
                            </div>
                        </div>

                        {/* ACTION BAR (Below Image) */}
                        <div className="bg-white p-5 border-t border-gray-100">
                             <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                                {/* Metadata */}
                                <div className="flex gap-2 flex-wrap items-center">
                                    <div className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
                                        currentResult.mode === GenerationMode.FREE ? 'bg-blue-50 text-blue-600 border-blue-100' : 
                                        currentResult.mode === GenerationMode.AUTO ? 'bg-orange-50 text-orange-600 border-orange-100' : 
                                        'bg-gray-100 text-gray-600 border-gray-200'
                                    }`}>
                                        {getStyleDisplay(currentResult)}
                                    </div>
                                    <div className="px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-md text-xs font-bold text-gray-600">
                                        {currentResult.resolution}
                                    </div>
                                    <span className="text-[10px] text-gray-400 font-mono">
                                        {new Date(currentResult.timestamp).toLocaleTimeString()}
                                    </span>
                                </div>
                                {/* Download */}
                                <a href={currentResult.imageUrl} download={`renderx-${currentResult.id}.png`} className="text-schiele-secondary hover:text-schiele-rust text-xs font-bold flex items-center gap-2 transition-colors">
                                    <i className="fas fa-download"></i> <span className="hidden sm:inline">下载原图</span>
                                </a>
                             </div>

                             {/* Action Buttons Row */}
                             <div className="flex gap-3">
                                <button 
                                    onClick={() => onUseAsInput(currentResult)}
                                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-schiele-ink py-3 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-2"
                                >
                                    <i className="fas fa-reply"></i> 作为底图
                                </button>
                                <button 
                                    onClick={() => onUpscale(currentResult)}
                                    className="flex-1 bg-schiele-ink hover:bg-black text-white py-3 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-2 shadow-lg"
                                >
                                    <i className="fas fa-wand-magic-sparkles text-schiele-rust"></i> 放大 4K
                                </button>
                             </div>

                             {currentResult.prompt && (
                                <div className="mt-4 pt-3 border-t border-gray-50">
                                    <p className="text-[10px] text-gray-400 font-mono line-clamp-2" title={currentResult.prompt}>
                                        {currentResult.prompt}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="h-[400px] flex flex-col items-center justify-center bg-gray-50/50">
                        <div className="w-16 h-16 border-4 border-schiele-rust border-t-transparent rounded-full animate-spin mb-6"></div>
                        <h3 className="text-xl font-bold text-schiele-ink mb-2">正在构建</h3>
                        <p className="text-sm text-schiele-secondary">计算全局光照与材质...</p>
                    </div>
                )}
            </div>
        )}

        {/* THUMBNAIL STRIP (Horizontal Scroll) */}
        {results.length > 1 && (
            <div className="flex gap-3 pt-4 border-t border-schiele-border/50 overflow-x-auto pb-2 custom-scrollbar">
                {results.map((result, index) => (
                    <div 
                        key={result.id} 
                        onClick={() => setSelectedIndex(index)}
                        className={`relative w-24 h-24 shrink-0 rounded-xl overflow-hidden cursor-pointer border-2 transition-all hover:scale-105 ${
                            selectedIndex === index 
                            ? 'border-schiele-rust ring-2 ring-schiele-rust/20 opacity-100' 
                            : 'border-transparent opacity-60 hover:opacity-100'
                        }`}
                    >
                        {result.status === 'success' ? (
                            <img src={result.imageUrl} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                                <i className="fas fa-circle-notch animate-spin text-gray-400"></i>
                            </div>
                        )}
                        {/* Index Badge */}
                         <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[8px] px-1 rounded backdrop-blur-sm">
                            #{results.length - index}
                        </div>
                    </div>
                ))}
            </div>
        )}

        {/* LIGHTBOX MODAL */}
        {lightboxIndex !== null && results[lightboxIndex] && (
            <div className="fixed inset-0 z-[2000] bg-black/95 backdrop-blur-md flex items-center justify-center animate-fade-in" onClick={() => setLightboxIndex(null)}>
                <img 
                    src={results[lightboxIndex].imageUrl} 
                    className="max-w-[95vw] max-h-[90vh] object-contain shadow-2xl rounded-sm select-none"
                    onClick={(e) => e.stopPropagation()} 
                />
                
                <button onClick={() => setLightboxIndex(null)} className="absolute top-6 right-6 text-white/50 hover:text-white text-4xl transition-colors"><i className="fas fa-times"></i></button>

                {results.length > 1 && (
                    <>
                        <button className="absolute left-6 top-1/2 -translate-y-1/2 text-white/30 hover:text-white text-5xl p-4" onClick={(e) => { e.stopPropagation(); setLightboxIndex(prev => (prev !== null && prev < results.length - 1 ? prev + 1 : prev)); }}><i className="fas fa-chevron-left"></i></button>
                        <button className="absolute right-6 top-1/2 -translate-y-1/2 text-white/30 hover:text-white text-5xl p-4" onClick={(e) => { e.stopPropagation(); setLightboxIndex(prev => (prev !== null && prev > 0 ? prev - 1 : prev)); }}><i className="fas fa-chevron-right"></i></button>
                    </>
                )}
            </div>
        )}
    </div>
  );
};
