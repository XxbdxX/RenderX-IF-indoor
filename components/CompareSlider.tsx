import React, { useState, useEffect, useRef, useCallback } from 'react';

interface CompareSliderProps {
  original: string;
  generated: string;
  className?: string;
}

export const CompareSlider: React.FC<CompareSliderProps> = ({ original, generated, className = "" }) => {
  const [isResizing, setIsResizing] = useState(false);
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset position when images change
  useEffect(() => {
    setPosition(50);
  }, [original, generated]);

  const handleMouseDown = () => setIsResizing(true);
  
  const handleMouseUp = useCallback(() => setIsResizing(false), []);
  
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = (x / rect.width) * 100;
    setPosition(percentage);
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  return (
    <div ref={containerRef} className={`relative w-full h-full overflow-hidden select-none group cursor-col-resize ${className}`} onMouseDown={handleMouseDown}>
      {/* Background: Generated Image (Full) */}
      <img src={generated} className="absolute top-0 left-0 w-full h-full object-contain pointer-events-none" alt="Generated" />
      
      {/* Foreground: Original Image (Clipped) */}
      <div 
        className="absolute top-0 left-0 w-full h-full border-r-[3px] border-white shadow-[0_0_10px_rgba(0,0,0,0.3)] bg-gray-100"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <img src={original} className="absolute top-0 left-0 w-full h-full object-contain pointer-events-none" alt="Original" />
      </div>

      {/* Slider Handle */}
      <div 
        className="absolute top-0 bottom-0 w-1 cursor-col-resize z-10"
        style={{ left: `${position}%` }}
      >
        <div className="absolute top-1/2 -translate-y-1/2 -left-4 w-8 h-8 bg-white text-schiele-ink rounded-full shadow-lg flex items-center justify-center border border-gray-200 transition-transform hover:scale-110">
            <i className="fas fa-arrows-alt-h text-xs"></i>
        </div>
      </div>
      
      {/* Labels */}
      <div className={`absolute bottom-4 left-4 bg-black/50 text-white text-[10px] px-2 py-1 rounded backdrop-blur-sm transition-opacity ${position < 10 ? 'opacity-0' : 'opacity-100'}`}>原图</div>
      <div className={`absolute bottom-4 right-4 bg-black/50 text-white text-[10px] px-2 py-1 rounded backdrop-blur-sm transition-opacity ${position > 90 ? 'opacity-0' : 'opacity-100'}`}>渲染</div>
    </div>
  );
};