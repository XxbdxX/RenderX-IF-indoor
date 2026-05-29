
import React, { useState, useEffect, useRef } from 'react';
import { ApiProvider, RenderStyle, TimeOfDay, GenerationRequest, ImageResolution, GenerationMode, ModelVersion, ThinkingMode } from '../types';
import { MAX_CONCURRENT_REQUESTS, STYLE_ICONS, TIME_ICONS, STYLE_LABELS, TIME_LABELS } from '../constants';
import { IMAGE_2_DEFAULT_MODEL } from '../services/apiConfig';

interface ControlPanelProps {
  request: GenerationRequest;
  setRequest: React.Dispatch<React.SetStateAction<GenerationRequest>>;
  onGenerate: () => void;
  // Queue Props
  activeStandardRequests: number;
  activeHeavyRequests: number;
  hasApiAccess: boolean;
  apiProvider: ApiProvider;
  imageModel?: string;
}

interface SavedPrompt {
    id: string;
    name: string;
    text: string;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  request,
  setRequest,
  onGenerate,
  activeStandardRequests,
  activeHeavyRequests,
  hasApiAccess,
  apiProvider,
  imageModel
}) => {
  const { mode } = request;
  const isImage2Provider = apiProvider === ApiProvider.IMAGE_2;
  
  // Prompt Cache Ref
  const promptCache = useRef<Record<GenerationMode, string>>({
      [GenerationMode.MANUAL]: '',
      [GenerationMode.AUTO]: '',
      [GenerationMode.FREE]: ''
  });

  // Saved Prompts State
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [showSavedList, setShowSavedList] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newPromptName, setNewPromptName] = useState('');
  const [isRenderSettingsOpen, setIsRenderSettingsOpen] = useState(false);

  useEffect(() => {
      const saved = localStorage.getItem('renderx_saved_prompts');
      if (saved) {
          try {
              setSavedPrompts(JSON.parse(saved));
          } catch (e) {
              console.error("Failed to load saved prompts", e);
          }
      }
  }, []);

  const savePrompt = () => {
      if (!request.prompt.trim()) return;
      setIsSaving(true);
      setNewPromptName('');
  };

  const confirmSavePrompt = () => {
      if (!newPromptName.trim()) return;
      const newItem: SavedPrompt = {
          id: Date.now().toString(),
          name: newPromptName,
          text: request.prompt
      };
      const updated = [newItem, ...savedPrompts];
      setSavedPrompts(updated);
      localStorage.setItem('renderx_saved_prompts', JSON.stringify(updated));
      setIsSaving(false);
  };

  const loadPrompt = (text: string) => {
      updateRequest('prompt', text);
      setShowSavedList(false);
  };

  const deletePrompt = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      const updated = savedPrompts.filter(p => p.id !== id);
      setSavedPrompts(updated);
      localStorage.setItem('renderx_saved_prompts', JSON.stringify(updated));
  };

  const updateRequest = (field: keyof GenerationRequest, value: any) => {
    setRequest((prev) => ({ ...prev, [field]: value }));
  };

  const handleModeChange = (newMode: GenerationMode) => {
      promptCache.current[mode] = request.prompt;
      updateRequest('mode', newMode);
      updateRequest('prompt', promptCache.current[newMode] || '');
      updateRequest('isAuto', newMode === GenerationMode.AUTO);
  };

  const handleModelVersionChange = (nextModel: ModelVersion) => {
      setRequest((prev) => ({
          ...prev,
          modelVersion: nextModel,
          thinkingMode: nextModel === ModelVersion.PRO ? ThinkingMode.DEEP : (prev.thinkingMode || ThinkingMode.DEFAULT),
      }));
  };

  const totalActiveRequests = activeStandardRequests + activeHeavyRequests;
  const isQueueBlocked = totalActiveRequests >= MAX_CONCURRENT_REQUESTS;

  const getButtonText = () => {
      if (isQueueBlocked) return `列队已满 (${MAX_CONCURRENT_REQUESTS}/${MAX_CONCURRENT_REQUESTS})`;
      if (totalActiveRequests > 0) return `加入列队 (${totalActiveRequests}/${MAX_CONCURRENT_REQUESTS})`;
      return "生成效果图";
  };

  const aspectRatioSummary = request.aspectRatio === 'original'
    ? '原图'
    : request.aspectRatio === 'free'
      ? '自由'
      : request.aspectRatio;

  const thinkingSummary = request.modelVersion === ModelVersion.PRO
    ? '深度'
    : request.thinkingMode === ThinkingMode.FAST
      ? '快速'
      : request.thinkingMode === ThinkingMode.DEEP
        ? '深入'
        : '默认';

  const renderModelSummary = isImage2Provider
    ? (imageModel || IMAGE_2_DEFAULT_MODEL)
    : request.modelVersion === ModelVersion.PRO ? 'PRO' : 'N2';
  const renderSettingsSummary = isImage2Provider
    ? `${renderModelSummary} · ${request.resolution} · ${aspectRatioSummary}`
    : `${renderModelSummary} · ${request.resolution} · ${aspectRatioSummary} · ${thinkingSummary}`;

  return (
    <div className={`flex flex-col h-full p-6 md:p-8 rounded-[24px] shadow-paper border transition-all duration-500 relative ${
        mode === GenerationMode.AUTO ? 'bg-orange-50/30 border-orange-200' : 
        mode === GenerationMode.FREE ? 'bg-blue-50/30 border-blue-200' :
        'bg-white/80 border-schiele-border/50'
    }`}>
      
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-schiele-ink">参数配置</h2>
        {mode === GenerationMode.AUTO && <i className="fas fa-magic text-schiele-rust animate-pulse"></i>}
        {mode === GenerationMode.FREE && <i className="fas fa-comments text-blue-500 animate-bounce"></i>}
      </div>

      {mode !== GenerationMode.FREE && (
        <div className="flex gap-2 mb-4 animate-fade-in">
            <button 
                onClick={() => updateRequest('compositionLock', !request.compositionLock)} 
                className={`flex-1 rounded-xl py-2 px-3 flex items-center justify-between border transition-all duration-300 group ${
                    request.compositionLock 
                    ? 'bg-schiele-ink border-schiele-ink shadow-md' 
                    : 'bg-white border-schiele-border hover:border-schiele-rust'
                }`}
            >
                <div className="flex flex-col text-left">
                    <div className={`text-xs font-bold ${request.compositionLock ? 'text-white' : 'text-gray-500 group-hover:text-schiele-ink'}`}>
                        {request.compositionLock ? '构图锁定' : '视角优化'}
                    </div>
                    <div className={`text-[9px] ${request.compositionLock ? 'text-white/60' : 'text-gray-300 group-hover:text-schiele-rust'}`}>
                        {request.compositionLock ? '严格叠加' : 'AI 智能取景'}
                    </div>
                </div>
                <i className={`fas text-xs ${request.compositionLock ? 'fa-lock text-schiele-rust' : 'fa-camera text-schiele-rust/70'}`}></i>
            </button>

            <button 
                onClick={() => updateRequest('schemeLock', !request.schemeLock)} 
                className={`flex-1 rounded-xl py-2 px-3 flex items-center justify-between border transition-all duration-300 group ${
                    request.schemeLock 
                    ? 'bg-schiele-ink border-schiele-ink shadow-md' 
                    : 'bg-white border-schiele-border hover:border-schiele-rust'
                }`}
            >
                <div className="flex flex-col text-left">
                    <div className={`text-xs font-bold ${request.schemeLock ? 'text-white' : 'text-gray-500 group-hover:text-schiele-ink'}`}>
                        {request.schemeLock ? '方案锁定' : '方案补全'}
                    </div>
                    <div className={`text-[9px] ${request.schemeLock ? 'text-white/60' : 'text-gray-300 group-hover:text-schiele-rust'}`}>
                        {request.schemeLock ? '严控形体' : 'AI 优化细节'}
                    </div>
                </div>
                <i className={`fas text-xs ${request.schemeLock ? 'fa-lock text-schiele-rust' : 'fa-pencil-alt text-schiele-rust/70'}`}></i>
            </button>
        </div>
      )}

      <div className="bg-schiele-bg p-1.5 rounded-xl flex items-center mb-6 shadow-inner">
        <button 
            onClick={() => handleModeChange(GenerationMode.MANUAL)} 
            className={`flex-1 py-2.5 rounded-lg text-xs md:text-sm font-bold transition-all ${mode === GenerationMode.MANUAL ? 'bg-white text-schiele-ink shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
        >
            手动配置
        </button>
        <button 
            onClick={() => handleModeChange(GenerationMode.AUTO)} 
            className={`flex-1 py-2.5 rounded-lg text-xs md:text-sm font-bold transition-all flex items-center justify-center space-x-1 ${mode === GenerationMode.AUTO ? 'bg-gradient-to-r from-schiele-rust to-orange-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
        >
            <i className="fas fa-wand-magic-sparkles"></i>
            <span>AI 托管</span>
        </button>
        <button 
            onClick={() => handleModeChange(GenerationMode.FREE)} 
            className={`flex-1 py-2.5 rounded-lg text-xs md:text-sm font-bold transition-all flex items-center justify-center space-x-1 ${mode === GenerationMode.FREE ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
        >
            <i className="fas fa-comment-dots"></i>
            <span>自由对话</span>
        </button>
      </div>

      <div className="mb-4 rounded-2xl border border-schiele-border bg-white/75 shadow-sm overflow-hidden">
        <button
          type="button"
          aria-label={`${isRenderSettingsOpen ? '收起' : '展开'}渲染设置`}
          onClick={() => setIsRenderSettingsOpen((prev) => !prev)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-white transition-colors"
        >
          <span className="flex flex-col items-start text-left">
            <span className="text-[10px] font-bold text-schiele-secondary uppercase">渲染设置</span>
            <span className="text-sm font-bold text-schiele-ink">{renderSettingsSummary}</span>
          </span>
          <i className={`fas fa-chevron-${isRenderSettingsOpen ? 'up' : 'down'} text-xs text-schiele-secondary`}></i>
        </button>

        {isRenderSettingsOpen && (
          <div className="px-4 pb-4 space-y-4 border-t border-schiele-border/70 bg-white/80 animate-fade-in">
            <div className="pt-4">
              <div className="mb-2"><label className="text-xs font-bold text-schiele-secondary uppercase">模型选择</label></div>
              {isImage2Provider ? (
                <div className="rounded-xl border border-schiele-border bg-white px-3 py-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-schiele-ink">
                    <i className="fas fa-wand-magic-sparkles text-schiele-rust"></i>
                    <span>Image-2</span>
                  </div>
                  <div className="mt-1 text-[10px] font-mono text-schiele-secondary">{imageModel || IMAGE_2_DEFAULT_MODEL}</div>
                  <p className="mt-1 text-[10px] leading-4 text-gray-400">
                    当前 provider 使用 API 设置里的 Model 字段，NanoBanana 选项不会参与请求。
                  </p>
                </div>
              ) : (
                <div className="flex gap-2 p-1 bg-schiele-bg/50 rounded-xl border border-schiele-border">
                  <button
                    onClick={() => handleModelVersionChange(ModelVersion.PRO)}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                      request.modelVersion === ModelVersion.PRO
                        ? 'bg-white text-schiele-ink shadow-sm'
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    <i className={`fas fa-star self-start mt-0.5 ${request.modelVersion === ModelVersion.PRO ? 'text-yellow-500' : ''}`}></i>
                    <span className="flex flex-col items-start leading-tight text-left">
                      <span>NanoBanana PRO</span>
                      <span className={`text-[8px] font-mono ${request.modelVersion === ModelVersion.PRO ? 'text-schiele-secondary' : 'text-gray-300'}`}>gemini-3-pro-image-preview</span>
                    </span>
                  </button>
                  <button
                    onClick={() => handleModelVersionChange(ModelVersion.FLASH)}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                      request.modelVersion === ModelVersion.FLASH
                        ? 'bg-white text-schiele-ink shadow-sm'
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    <i className={`fas fa-bolt self-start mt-0.5 ${request.modelVersion === ModelVersion.FLASH ? 'text-blue-500' : ''}`}></i>
                    <span className="flex flex-col items-start leading-tight text-left">
                      <span>NanoBanana 2</span>
                      <span className={`text-[8px] font-mono ${request.modelVersion === ModelVersion.FLASH ? 'text-schiele-secondary' : 'text-gray-300'}`}>gemini-3.1-flash-image-preview</span>
                    </span>
                  </button>
                </div>
              )}
            </div>

            {!isImage2Provider && <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-bold text-schiele-secondary uppercase">思考强度</label>
                {request.modelVersion === ModelVersion.FLASH && <span className="text-[10px] text-gray-400">NanoBanana 2 可调</span>}
              </div>
              {request.modelVersion === ModelVersion.PRO ? (
                <div className="rounded-xl border border-schiele-border bg-schiele-bg/60 px-3 py-2 text-xs font-bold text-schiele-secondary">
                  PRO 固定高思考
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: ThinkingMode.DEFAULT, label: '默认' },
                    { value: ThinkingMode.FAST, label: '快速' },
                    { value: ThinkingMode.DEEP, label: '深入' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => updateRequest('thinkingMode', option.value)}
                      className={`rounded-xl border py-2 text-xs font-bold transition-all ${
                        (request.thinkingMode || ThinkingMode.DEFAULT) === option.value
                          ? 'border-schiele-ink bg-schiele-ink text-white'
                          : 'border-schiele-border bg-white text-gray-500 hover:border-gray-400'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>}

            <div>
              <div className="mb-2"><label className="text-xs font-bold text-schiele-secondary uppercase">分辨率</label></div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: ImageResolution.RES_1K, label: '1K', icon: 'fa-image' },
                  { value: ImageResolution.RES_2K, label: '2K', icon: 'fa-photo-video' },
                  { value: ImageResolution.RES_4K, label: '4K', icon: 'fa-expand' },
                ].map((resolution) => (
                  <button
                    key={resolution.value}
                    onClick={() => updateRequest('resolution', resolution.value)}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      request.resolution === resolution.value
                        ? 'border-schiele-ink bg-schiele-ink text-white'
                        : 'border-schiele-border bg-white text-gray-500 hover:border-gray-400'
                    }`}
                  >
                    <i className={`fas ${resolution.icon}`}></i>
                    <span>{resolution.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2"><label className="text-xs font-bold text-schiele-secondary uppercase">画布比例</label></div>
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2">
                  {[
                    { value: 'free', label: '自由比例' },
                    { value: 'original', label: '跟随原图' },
                    { value: '1:1', label: '1:1' }
                  ].map((ratio) => (
                    <button
                      key={ratio.value}
                      onClick={() => updateRequest('aspectRatio', ratio.value)}
                      className={`col-span-3 p-2 rounded-xl border text-center transition-all ${
                        request.aspectRatio === ratio.value
                          ? 'border-schiele-rust bg-orange-50 text-schiele-rust'
                          : 'border-schiele-border text-gray-400 hover:bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="text-[10px] font-bold">{ratio.label}</div>
                    </button>
                  ))}
                  <div className="col-span-3"></div>
                </div>
                <div className="grid grid-cols-12 gap-2">
                  {[
                    { value: '16:9', label: '16:9' },
                    { value: '9:16', label: '9:16' },
                    { value: '4:3', label: '4:3' },
                    { value: '3:4', label: '3:4' }
                  ].map((ratio) => (
                    <button
                      key={ratio.value}
                      onClick={() => updateRequest('aspectRatio', ratio.value)}
                      className={`col-span-3 p-2 rounded-xl border text-center transition-all ${
                        request.aspectRatio === ratio.value
                          ? 'border-schiele-rust bg-orange-50 text-schiele-rust'
                          : 'border-schiele-border text-gray-400 hover:bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="text-[10px] font-bold">{ratio.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 custom-scrollbar pr-2">
        {mode === GenerationMode.AUTO && (
            <div className="border border-dashed border-orange-300 bg-white/50 rounded-2xl p-6 text-center flex flex-col items-center justify-center mb-2 animate-fade-in">
                <div className="w-10 h-10 bg-gradient-to-br from-schiele-rust to-orange-400 rounded-full flex items-center justify-center mb-3 shadow-lg text-lg text-white">
                    <i className="fas fa-wand-magic-sparkles"></i>
                </div>
                <h3 className="font-bold text-schiele-ink mb-1 text-sm">AI 场景智能构建</h3>
                <p className="text-[10px] text-schiele-secondary leading-relaxed px-4">
                    AI 自动分析几何特征，智能匹配材质与光影。
                </p>
            </div>
        )}

        {mode === GenerationMode.FREE && (
             <div className="border border-dashed border-blue-300 bg-white/50 rounded-2xl p-6 text-center flex flex-col items-center justify-center mb-2 animate-fade-in">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-full flex items-center justify-center mb-3 shadow-lg text-lg text-white">
                    <i className="fas fa-robot"></i>
                </div>
                <h3 className="font-bold text-schiele-ink mb-1 text-sm">NanoBanana Pro 直连</h3>
                <p className="text-[10px] text-schiele-secondary leading-relaxed px-4">
                    跳过预设风格。像聊天一样直接告诉 AI 您想要什么。
                </p>
            </div>
        )}

        {mode === GenerationMode.MANUAL && (
            <div className="space-y-6 animate-fade-in">
                <div>
                    <div className="mb-2"><label className="text-xs font-bold text-schiele-secondary uppercase">表现风格</label></div>
                    <div className="grid grid-cols-2 gap-2">
                        {Object.values(RenderStyle)
                            .filter(s => s !== RenderStyle.COMMERCIAL && s !== RenderStyle.BIOPHILIC)
                            .map((s) => (
                            <button 
                                key={s} 
                                onClick={() => updateRequest('style', s)} 
                                className={`p-2.5 rounded-xl border text-left transition-all ${request.style === s ? 'border-schiele-rust bg-orange-50' : 'border-schiele-border hover:bg-white'}`}
                            >
                                <i className={`fas ${STYLE_ICONS[s]} text-base mb-1.5 ${request.style === s ? 'text-schiele-rust' : 'text-gray-400'}`}></i>
                                <div className="text-[10px] font-bold text-schiele-ink">{STYLE_LABELS[s]}</div>
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <div className="mb-2"><label className="text-xs font-bold text-schiele-secondary uppercase">光影氛围</label></div>
                    <div className="grid grid-cols-3 gap-2">
                        {Object.values(TimeOfDay).map((time) => (
                            <button 
                                key={time} 
                                onClick={() => updateRequest('timeOfDay', time)} 
                                className={`p-2 rounded-xl border text-center transition-all ${request.timeOfDay === time ? 'border-schiele-rust bg-orange-50 text-schiele-rust' : 'border-schiele-border text-gray-400 hover:bg-white'}`}
                            >
                                <i className={`fas ${TIME_ICONS[time]} mb-1`}></i>
                                <div className="text-[10px] font-medium truncate">{TIME_LABELS[time]}</div>
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <div className="mb-2"><label className="text-xs font-bold text-schiele-secondary uppercase">细节增强</label></div>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => updateRequest('commercialEnhancement', !request.commercialEnhancement)}
                            className={`flex-1 p-2.5 rounded-xl border text-left transition-all flex flex-col justify-center ${
                                request.commercialEnhancement 
                                ? 'border-schiele-rust bg-orange-50 text-schiele-rust' 
                                : 'border-schiele-border hover:bg-white text-gray-400'
                            }`}
                        >
                            <i className="fas fa-store-alt text-sm mb-1"></i>
                            <div className="text-[10px] font-bold">商业氛围增强</div>
                        </button>

                        <button 
                            onClick={() => updateRequest('landscapeEnhancement', !request.landscapeEnhancement)}
                            className={`flex-1 p-2.5 rounded-xl border text-left transition-all flex flex-col justify-center ${
                                request.landscapeEnhancement 
                                ? 'border-schiele-rust bg-green-50 text-green-600' 
                                : 'border-schiele-border hover:bg-white text-gray-400'
                            }`}
                        >
                            <i className="fas fa-tree text-sm mb-1"></i>
                            <div className="text-[10px] font-bold">景观绿化增强</div>
                        </button>
                    </div>
                </div>
            </div>
        )}

        <div className="relative">
            <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold text-schiele-secondary uppercase">
                    {mode === GenerationMode.FREE ? '对话指令 / 提示词' : '出图需求'}
                </label>
            </div>
            
            <div className="relative group">
                <textarea 
                    className="w-full glass-input p-4 pb-10 rounded-xl text-sm min-h-[120px] resize-none border-schiele-border focus:border-schiele-rust" 
                    placeholder={mode === GenerationMode.FREE ? "直接描述您的需求... (例如：把这个立面改成红砖材质，增加一些藤蔓植物)" : "输入具体材质或环境描述... 留空由 AI 自动分析。"} 
                    value={request.prompt} 
                    onChange={(e) => updateRequest('prompt', e.target.value)}
                ></textarea>

                <div className="absolute bottom-3 right-3 flex gap-2">
                     <div className="relative">
                        <button 
                            onClick={() => setShowSavedList(!showSavedList)}
                            className="bg-white/80 hover:bg-schiele-rust hover:text-white text-schiele-secondary p-1.5 rounded-lg shadow-sm border border-gray-200 transition-colors text-xs flex items-center gap-1"
                            title="调用常用指令"
                        >
                            <i className="fas fa-book"></i> <span className="text-[10px]">调用</span>
                        </button>
                        
                        {showSavedList && (
                            <div className="absolute bottom-full right-0 mb-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 p-2 z-50 animate-fade-in">
                                <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-2 px-2">我的指令库</h4>
                                {savedPrompts.length === 0 ? (
                                    <div className="text-center py-4 text-xs text-gray-400">暂无保存的指令</div>
                                ) : (
                                    <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1">
                                        {savedPrompts.map(p => (
                                            <div key={p.id} className="flex items-center justify-between group/item hover:bg-orange-50 rounded-lg p-2 cursor-pointer transition-colors" onClick={() => loadPrompt(p.text)}>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-xs font-bold text-schiele-ink truncate">{p.name}</div>
                                                    <div className="text-[10px] text-gray-400 truncate">{p.text}</div>
                                                </div>
                                                <button onClick={(e) => deletePrompt(e, p.id)} className="text-gray-300 hover:text-red-500 px-2 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                                    <i className="fas fa-trash-alt text-xs"></i>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                     </div>

                     {isSaving ? (
                         <div className="absolute bottom-full right-0 mb-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 p-3 z-50 animate-fade-in">
                             <div className="text-[10px] font-bold text-gray-400 uppercase mb-2">保存指令</div>
                             <input 
                                autoFocus
                                type="text" 
                                placeholder="输入指令名称..." 
                                className="w-full text-xs p-2.5 rounded-lg border border-gray-200 outline-none focus:border-schiele-rust mb-2 bg-white text-schiele-ink"
                                value={newPromptName}
                                onChange={(e) => setNewPromptName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && confirmSavePrompt()}
                             />
                             <div className="flex justify-end gap-2">
                                <button onClick={() => setIsSaving(false)} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 bg-gray-100 rounded-md">取消</button>
                                <button onClick={confirmSavePrompt} className="px-3 py-1.5 text-xs text-white bg-schiele-rust hover:bg-orange-700 rounded-md">保存</button>
                             </div>
                         </div>
                     ) : (
                        <button 
                            onClick={savePrompt}
                            className="bg-white/80 hover:bg-schiele-ink hover:text-white text-schiele-secondary p-1.5 rounded-lg shadow-sm border border-gray-200 transition-colors text-xs flex items-center gap-1"
                            title="保存当前指令"
                        >
                            <i className="fas fa-save"></i> <span className="text-[10px]">保存</span>
                        </button>
                     )}
                </div>
            </div>
            
        </div>
      </div>

      <div className="pt-6 mt-auto border-t border-schiele-border">
        <button 
            onClick={onGenerate} 
            disabled={isQueueBlocked || !hasApiAccess}
            className={`w-full py-4 rounded-2xl font-bold text-lg shadow-paper flex items-center justify-center space-x-3 transition-transform active:scale-[0.98] ${isQueueBlocked || !hasApiAccess ? 'bg-schiele-secondary text-white/80 cursor-not-allowed opacity-70' : 'bg-schiele-ink text-white hover:bg-black hover:shadow-paper-hover'}`}
        >
            {activeStandardRequests > 0 || activeHeavyRequests > 0 ? (
                 <i className="fas fa-circle-notch animate-spin"></i>
            ) : (
                 <i className="fas fa-layer-group"></i>
            )}
            <span>{getButtonText()}</span>
        </button>
        {!hasApiAccess && (
          <p className="text-[10px] text-amber-700 mt-2 text-center">
            请先通过右下角悬浮按钮配置 API 后再生成。
          </p>
        )}
      </div>

      {(showSavedList || isSaving) && (
          <div className="fixed inset-0 z-40" onClick={() => { setShowSavedList(false); setIsSaving(false); }}></div>
      )}
    </div>
  );
};
