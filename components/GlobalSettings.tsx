import React, { useRef, useState } from 'react';
import { GenerationRequest, ReferenceImage } from '../types';

interface GlobalSettingsProps {
    request: GenerationRequest;
    setRequest: React.Dispatch<React.SetStateAction<GenerationRequest>>;
}

export const GlobalSettings: React.FC<GlobalSettingsProps> = ({ request, setRequest }) => {
    const refFileInputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const updateRequest = (field: keyof GenerationRequest, value: any) => {
        setRequest((prev) => ({ ...prev, [field]: value }));
    };

    const handleFile = (file: File) => {
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const match = (ev.target?.result as string).match(/^data:(.+);base64,(.+)$/);
            if (match) {
                const currentRefs = request.referenceImages || [];
                if (currentRefs.length >= 2) return; 

                const newId = currentRefs.length === 0 ? "1" : "2"; 
                const newRef: ReferenceImage = {
                    id: newId,
                    mimeType: match[1],
                    base64: match[2]
                };
                updateRequest('referenceImages', [...currentRefs, newRef]);
            }
        };
        reader.readAsDataURL(file);
        if (refFileInputRef.current) refFileInputRef.current.value = '';
    };

    const handleRefUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) handleFile(e.target.files[0]);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
    };

    // Paste Handler
    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                if (file) handleFile(file);
                break; // Only take the first image
            }
        }
    };

    const removeRefImage = (id: string) => {
        const newRefs = request.referenceImages.filter(r => r.id !== id);
        const remapped = newRefs.map((r, idx) => ({ ...r, id: (idx + 1).toString() }));
        updateRequest('referenceImages', remapped);
    };

    return (
        <div 
            ref={containerRef}
            className="bg-white/80 border border-schiele-border rounded-[24px] px-6 py-5 shadow-paper focus:outline-none focus:ring-2 focus:ring-schiele-rust/20 transition-all"
            onPaste={handlePaste}
            tabIndex={0}
        >
            <h3 className="text-xs font-bold text-schiele-secondary uppercase tracking-wider mb-4 flex justify-between items-center">
                <span>全局设定</span>
                <span className="text-[10px] text-gray-400 normal-case bg-gray-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <i className="fas fa-paste text-xs"></i> 支持 Ctrl+V 粘贴
                </span>
            </h3>

            {/* Reference Area - Side by Side Layout */}
            <div className="flex gap-4 h-24">
                {/* Left: Image Slots (Fixed Width) */}
                <div className="flex gap-2">
                     {/* Existing Images */}
                     {request.referenceImages.map((ref) => (
                        <div key={ref.id} className="relative group w-20 h-24 rounded-xl overflow-hidden border border-schiele-border bg-gray-100 shrink-0">
                            <img src={`data:${ref.mimeType};base64,${ref.base64}`} className="w-full h-full object-cover" />
                            <div className="absolute top-1 left-1 bg-black/60 text-white text-[9px] font-bold px-1.5 rounded-sm backdrop-blur-sm">
                                #{ref.id}
                            </div>
                            <button 
                                onClick={() => removeRefImage(ref.id)}
                                className="absolute top-1 right-1 w-5 h-5 bg-red-500/90 text-white rounded-full flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-sm"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                    ))}

                    {/* Add Button (Drag & Drop & Click) */}
                    {request.referenceImages.length < 2 && (
                        <div 
                            onClick={() => refFileInputRef.current?.click()}
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={handleDrop}
                            className={`w-20 h-24 rounded-xl border border-dashed cursor-pointer flex flex-col items-center justify-center transition-all shrink-0 ${
                                isDragging 
                                ? 'border-schiele-rust bg-orange-50' 
                                : 'border-schiele-border hover:border-schiele-rust/50 hover:bg-gray-50'
                            }`}
                            title="点击上传或 Ctrl+V 粘贴"
                        >
                            <input type="file" ref={refFileInputRef} onChange={handleRefUpload} accept="image/*" className="hidden" />
                            <i className={`fas fa-plus mb-1 transition-colors ${isDragging ? 'text-schiele-rust' : 'text-gray-300'}`}></i>
                            <span className={`text-[9px] ${isDragging ? 'text-schiele-rust' : 'text-gray-400'}`}>
                                {isDragging ? '松开上传' : '参考图'}
                            </span>
                        </div>
                    )}
                </div>

                {/* Right: Text Input (Flex 1) */}
                <div className="flex-1 relative h-full">
                    <textarea 
                        value={request.referenceNote || ''} 
                        onChange={(e) => updateRequest('referenceNote', e.target.value)} 
                        placeholder="参考图说明... (例：图1材质，图2灯光)" 
                        className="w-full h-full bg-schiele-bg/30 border border-schiele-border rounded-xl p-3 text-xs resize-none focus:outline-none focus:border-schiele-rust focus:bg-white transition-all placeholder:text-gray-400" 
                    />
                    <i className="fas fa-pen absolute bottom-2 right-2 text-gray-300 text-xs pointer-events-none"></i>
                </div>
            </div>
        </div>
    );
};