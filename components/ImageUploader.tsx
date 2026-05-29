import React, { useState, useRef } from 'react';

interface ImageUploaderProps {
  onImageSelected: (base64: string, mime: string, url: string, ratio: string) => void;
  onError: (msg: string) => void;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageSelected, onError }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      onError('请上传 JPG 或 PNG 图片格式');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      onError('图片大小不能超过 20MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const match = result.match(/^data:(.+);base64,(.+)$/);
      
      if (match) {
        // Create an image object to get dimensions and calculate ratio
        const img = new Image();
        img.onload = () => {
             const w = img.width;
             const h = img.height;
             
             const ratio = `${w}:${h}`;
             
             onImageSelected(match[2], match[1], result, ratio);
        };
        img.src = result;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div
      className={`relative w-[min(86%,520px)] min-h-[260px] flex flex-col items-center justify-center rounded-[16px] border-2 border-dashed transition-all duration-300 cursor-pointer overflow-hidden bg-white/50 ${
        isDragging ? 'border-schiele-rust bg-orange-50/50 scale-[0.99]' : 'border-schiele-border hover:border-schiele-rust/50 hover:bg-white'
      }`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
      />
      
      <div className="flex flex-col items-center space-y-3 p-5 text-center">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isDragging ? 'bg-schiele-rust text-white' : 'bg-schiele-bg text-schiele-secondary'}`}>
            <i className="fas fa-cloud-upload-alt text-2xl"></i>
        </div>
        <div>
            <h3 className="text-lg font-bold text-schiele-ink mb-2">上传设计方案</h3>
            <p className="text-sm text-schiele-secondary">点击或拖拽线稿/截图</p>
            <p className="text-xs text-schiele-secondary/60 mt-1">JPG/PNG (支持 AI 增强 4K 放大)</p>
        </div>
      </div>
    </div>
  );
};
