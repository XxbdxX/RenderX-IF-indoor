import React, { useEffect, useRef } from 'react';
import { ApiProvider, ApiProviderConfig } from '../types';
import { getProviderLabel, hasConfiguredApi } from '../services/apiConfig';

interface ApiSettingsFabProps {
  savedConfig: ApiProviderConfig;
  draftConfig: ApiProviderConfig;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onDraftChange: (nextConfig: ApiProviderConfig) => void;
  onSave: () => void;
  onClear: () => void;
}

export const ApiSettingsFab: React.FC<ApiSettingsFabProps> = ({
  savedConfig,
  draftConfig,
  isOpen,
  onOpen,
  onClose,
  onDraftChange,
  onSave,
  onClear,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isConfigured = hasConfiguredApi(savedConfig);
  const providerLabel = getProviderLabel(savedConfig.provider);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const updateDraft = (partial: Partial<ApiProviderConfig>) => {
    onDraftChange({ ...draftConfig, ...partial });
  };

  return (
    <div ref={containerRef} className="fixed bottom-6 right-6 z-[1600] flex flex-col items-end gap-3">
      {isOpen && (
        <div
          role="dialog"
          aria-label="API 设置面板"
          className="w-[min(92vw,360px)] rounded-[28px] border border-schiele-border bg-white/95 p-5 shadow-[0_24px_80px_rgba(26,24,22,0.18)] backdrop-blur-xl"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-schiele-secondary">Provider Access</p>
              <h3 className="mt-2 text-xl font-bold text-schiele-ink">API 设置</h3>
              <p className="mt-1 text-xs leading-5 text-schiele-secondary">
                配置只保存在当前浏览器，本页不再占用参数面板空间。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭 API 设置"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-schiele-border text-schiele-secondary transition-colors hover:border-schiele-rust hover:text-schiele-rust"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-schiele-bg/80 p-1.5">
            {[
              { value: ApiProvider.AI_STUDIO, label: 'AI Studio' },
              { value: ApiProvider.VERTEX_AI, label: 'Vertex AI' },
            ].map((option) => {
              const isActive = draftConfig.provider === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateDraft({
                    provider: option.value,
                    vertexLocation: option.value === ApiProvider.VERTEX_AI ? draftConfig.vertexLocation || '' : '',
                  })}
                  className={`rounded-2xl px-3 py-2.5 text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-white text-schiele-ink shadow-sm'
                      : 'text-schiele-secondary hover:text-schiele-ink'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.18em] text-schiele-secondary">
                {draftConfig.provider === ApiProvider.VERTEX_AI ? 'Vertex API Key' : 'AI Studio API Key'}
              </label>
              <input
                autoFocus
                type="password"
                value={draftConfig.apiKey}
                onChange={(event) => updateDraft({ apiKey: event.target.value })}
                placeholder={draftConfig.provider === ApiProvider.VERTEX_AI ? '粘贴 Vertex AI API Key' : '粘贴 AI Studio API Key'}
                className="w-full rounded-2xl border border-schiele-border bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-schiele-rust"
              />
            </div>

            {draftConfig.provider === ApiProvider.VERTEX_AI && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.18em] text-schiele-secondary">
                    Project ID
                  </label>
                  <input
                    type="text"
                    value={draftConfig.vertexProject || ''}
                    onChange={(event) => updateDraft({ vertexProject: event.target.value })}
                    placeholder="可选"
                    className="w-full rounded-2xl border border-schiele-border bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-schiele-rust"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.18em] text-schiele-secondary">
                    Location
                  </label>
                  <input
                    type="text"
                    value={draftConfig.vertexLocation || ''}
                    onChange={(event) => updateDraft({ vertexLocation: event.target.value })}
                    placeholder="global"
                    className="w-full rounded-2xl border border-schiele-border bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-schiele-rust"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 border-t border-schiele-border/70 pt-4">
            <button
              type="button"
              onClick={onClear}
              className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-500 transition-colors hover:border-red-200 hover:text-red-600"
            >
              清除
            </button>
            <button
              type="button"
              onClick={onSave}
              className="rounded-xl bg-schiele-ink px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-black"
            >
              保存设置
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        aria-label="打开 API 设置"
        onClick={isOpen ? onClose : onOpen}
        className={`group relative flex h-14 w-14 items-center justify-center rounded-full border shadow-[0_18px_40px_rgba(26,24,22,0.18)] transition-all hover:-translate-y-0.5 ${
          isConfigured
            ? 'border-schiele-border bg-white text-schiele-ink hover:border-schiele-rust hover:text-schiele-rust'
            : 'border-schiele-rust/40 bg-schiele-ink text-white hover:bg-black'
        }`}
      >
        <span
          className={`absolute right-2 top-2 h-2.5 w-2.5 rounded-full border border-white ${
            isConfigured ? 'bg-green-500' : 'bg-amber-400'
          }`}
        ></span>
        <i className={`fas ${isConfigured ? 'fa-sliders' : 'fa-key'} text-lg`}></i>
        <span className="pointer-events-none absolute right-[calc(100%+12px)] top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-full bg-schiele-ink px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-white shadow-lg md:block md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
          {isConfigured ? providerLabel : '配置 API'}
        </span>
      </button>
    </div>
  );
};
