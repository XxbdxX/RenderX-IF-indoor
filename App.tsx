
import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Header } from './components/Header';
import { ApiSettingsFab } from './components/ApiSettingsFab';
import { ControlPanel } from './components/ControlPanel';
import { OutputGallery } from './components/OutputGallery';
import { ImageUploader } from './components/ImageUploader';
import { GlobalSettings } from './components/GlobalSettings';
import { generateRendering } from './services/gemini';
import { saveHistoryItemToDb, getHistoryFromDb } from './services/historyDb';
import {
  clearPersistedExportDirectoryHandle,
  ensureExportDirectoryPermission,
  isDirectoryPickerSupported,
  loadHistoryFromDirectoryHandle,
  loadPersistedExportDirectoryHandle,
  migrateHistoryItemsToDirectory,
  pickExportDirectory,
  persistExportDirectoryHandle,
  revokeFolderHistoryObjectUrls,
  saveHistoryItemToDirectory,
} from './services/folderExport';
import {
  clearStoredApiConfig,
  createEmptyApiConfig,
  getMissingApiConfigMessage,
  getProviderLabel,
  hasConfiguredApi,
  loadStoredApiConfig,
  normalizeApiConfig,
  saveApiConfig,
} from './services/apiConfig';
import { APP_VERSION, MAX_CONCURRENT_REQUESTS, STYLE_LABELS, TIME_LABELS } from './constants';
import { 
    ApiProviderConfig,
    RenderStyle, 
    TimeOfDay, 
    ImageResolution, 
    GenerationRequest, 
    HistoryItem,
    GenerationMode,
    ModelVersion,
    ThinkingMode,
} from './types';
const UPSCALE_DETAIL_STRENGTH = 0.5;
const UPSCALE_EDGE_SHARPEN_STRENGTH = 0.78;

function App() {
  // --- App State ---
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  
  // Queue State
  const [activeStandardRequests, setActiveStandardRequests] = useState<number>(0); // 1K, 2K
  const [activeHeavyRequests, setActiveHeavyRequests] = useState<number>(0); // 4K

  const [sessionResults, setSessionResults] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [apiConfig, setApiConfig] = useState<ApiProviderConfig>(() => createEmptyApiConfig());
  const [apiConfigDraft, setApiConfigDraft] = useState<ApiProviderConfig>(() => createEmptyApiConfig());
  const [isApiSettingsOpen, setIsApiSettingsOpen] = useState(false);
  const [exportDirectoryHandle, setExportDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [exportDirectoryName, setExportDirectoryName] = useState<string | null>(null);

  // Request State
  const [sourceImageBase64, setSourceImageBase64] = useState<string | null>(null);
  const [sourceImageMime, setSourceImageMime] = useState<string>('');
  const [sourceAspectRatio, setSourceAspectRatio] = useState<string>('');

  const normalizeAspectRatio = (ratio: string): string => {
    if (!ratio.includes(':')) return ratio;

    const [rawW, rawH] = ratio.split(':').map(Number);
    if (!rawW || !rawH || !Number.isFinite(rawW) || !Number.isFinite(rawH)) return ratio;

    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(Math.round(Math.abs(rawW)), Math.round(Math.abs(rawH)));
    if (!divisor) return ratio;

    return `${Math.round(rawW / divisor)}:${Math.round(rawH / divisor)}`;
  };

  const cropImageToAspectRatio = async (imageUrl: string, ratio: string): Promise<string> => {
    if (!ratio.includes(':')) return imageUrl;

    const [ratioW, ratioH] = ratio.split(':').map(Number);
    if (!ratioW || !ratioH) return imageUrl;

    const targetRatio = ratioW / ratioH;

    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const srcW = img.width;
        const srcH = img.height;
        const srcRatio = srcW / srcH;

        if (!Number.isFinite(srcRatio) || Math.abs(srcRatio - targetRatio) < 0.0001) {
          resolve(imageUrl);
          return;
        }

        let cropX = 0;
        let cropY = 0;
        let cropW = srcW;
        let cropH = srcH;

        if (srcRatio > targetRatio) {
          cropW = Math.round(srcH * targetRatio);
          cropX = Math.floor((srcW - cropW) / 2);
        } else {
          cropH = Math.round(srcW / targetRatio);
          cropY = Math.floor((srcH - cropH) / 2);
        }

        const canvas = document.createElement('canvas');
        canvas.width = cropW;
        canvas.height = cropH;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(imageUrl);
          return;
        }

        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        resolve(canvas.toDataURL('image/png'));
      };

      img.onerror = () => resolve(imageUrl);
      img.src = imageUrl;
    });
  };

  const loadImage = (imageUrl: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = imageUrl;
    });
  };

  const resizeImageToLongSide = async (imageUrl: string, targetLongSide: number): Promise<{ imageUrl: string; aspectRatio: string }> => {
    const img = await loadImage(imageUrl);
    const aspectRatio = normalizeAspectRatio(`${img.width}:${img.height}`);
    const longestSide = Math.max(img.width, img.height);

    if (!Number.isFinite(longestSide) || longestSide <= 0) {
      throw new Error('无法读取图片尺寸。');
    }

    const scale = targetLongSide / longestSide;
    const targetWidth = Math.max(1, Math.round(img.width * scale));
    const targetHeight = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法创建缩放画布。');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    return { imageUrl: canvas.toDataURL('image/png'), aspectRatio };
  };

  const blendHighFrequencyDetail = async (baseImageUrl: string, detailImageUrl: string, detailStrength: number): Promise<string> => {
    const [baseImg, detailImg] = await Promise.all([loadImage(baseImageUrl), loadImage(detailImageUrl)]);

    const baseDetailCanvas = document.createElement('canvas');
    baseDetailCanvas.width = baseImg.width;
    baseDetailCanvas.height = baseImg.height;
    const baseDetailCtx = baseDetailCanvas.getContext('2d');
    if (!baseDetailCtx) {
      throw new Error('无法创建原图细节画布。');
    }
    baseDetailCtx.drawImage(baseImg, 0, 0, baseImg.width, baseImg.height);

    const baseBlurCanvas = document.createElement('canvas');
    baseBlurCanvas.width = baseImg.width;
    baseBlurCanvas.height = baseImg.height;
    const baseBlurCtx = baseBlurCanvas.getContext('2d');
    if (!baseBlurCtx) {
      throw new Error('无法创建原图模糊画布。');
    }
    baseBlurCtx.filter = 'blur(1.1px)';
    baseBlurCtx.drawImage(baseImg, 0, 0, baseImg.width, baseImg.height);
    baseBlurCtx.filter = 'none';

    const detailCanvas = document.createElement('canvas');
    detailCanvas.width = baseImg.width;
    detailCanvas.height = baseImg.height;

    const detailCtx = detailCanvas.getContext('2d');
    if (!detailCtx) {
      throw new Error('无法创建细节画布。');
    }

    detailCtx.drawImage(detailImg, 0, 0, baseImg.width, baseImg.height);

    const blurCanvas = document.createElement('canvas');
    blurCanvas.width = baseImg.width;
    blurCanvas.height = baseImg.height;

    const blurCtx = blurCanvas.getContext('2d');
    if (!blurCtx) {
      throw new Error('无法创建模糊画布。');
    }

    blurCtx.filter = 'blur(1.1px)';
    blurCtx.drawImage(detailImg, 0, 0, baseImg.width, baseImg.height);
    blurCtx.filter = 'none';

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = baseImg.width;
    outputCanvas.height = baseImg.height;

    const outputCtx = outputCanvas.getContext('2d');
    if (!outputCtx) {
      throw new Error('无法创建融合画布。');
    }

    outputCtx.drawImage(baseImg, 0, 0, baseImg.width, baseImg.height);

    const baseImageData = outputCtx.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
    const baseDetailImageData = baseDetailCtx.getImageData(0, 0, baseDetailCanvas.width, baseDetailCanvas.height);
    const baseBlurImageData = baseBlurCtx.getImageData(0, 0, baseBlurCanvas.width, baseBlurCanvas.height);
    const detailImageData = detailCtx.getImageData(0, 0, detailCanvas.width, detailCanvas.height);
    const blurImageData = blurCtx.getImageData(0, 0, blurCanvas.width, blurCanvas.height);

    const basePixels = baseImageData.data;
    const baseDetailPixels = baseDetailImageData.data;
    const baseBlurPixels = baseBlurImageData.data;
    const detailPixels = detailImageData.data;
    const blurPixels = blurImageData.data;

    const getBaseLuma = (pixelIndex: number) => (
      basePixels[pixelIndex] * 0.299 +
      basePixels[pixelIndex + 1] * 0.587 +
      basePixels[pixelIndex + 2] * 0.114
    );

    const width = outputCanvas.width;
    const height = outputCanvas.height;

    for (let index = 0; index < basePixels.length; index += 4) {
      const pixelNumber = index / 4;
      const x = pixelNumber % width;
      const y = Math.floor(pixelNumber / width);
      const baseDetailRed = baseDetailPixels[index] - baseBlurPixels[index];
      const baseDetailGreen = baseDetailPixels[index + 1] - baseBlurPixels[index + 1];
      const baseDetailBlue = baseDetailPixels[index + 2] - baseBlurPixels[index + 2];
      const detailRed = detailPixels[index] - blurPixels[index];
      const detailGreen = detailPixels[index + 1] - blurPixels[index + 1];
      const detailBlue = detailPixels[index + 2] - blurPixels[index + 2];
      const energy = (Math.abs(detailRed) + Math.abs(detailGreen) + Math.abs(detailBlue)) / 3;
      const baseLuma = getBaseLuma(index);
      const baseDetailLuma = baseDetailRed * 0.299 + baseDetailGreen * 0.587 + baseDetailBlue * 0.114;
      const detailLuma = detailRed * 0.299 + detailGreen * 0.587 + detailBlue * 0.114;

      const leftIndex = x > 0 ? index - 4 : index;
      const rightIndex = x < width - 1 ? index + 4 : index;
      const upIndex = y > 0 ? index - width * 4 : index;
      const downIndex = y < height - 1 ? index + width * 4 : index;
      const edgeStrength = Math.max(
        Math.abs(baseLuma - getBaseLuma(leftIndex)),
        Math.abs(baseLuma - getBaseLuma(rightIndex)),
        Math.abs(baseLuma - getBaseLuma(upIndex)),
        Math.abs(baseLuma - getBaseLuma(downIndex))
      );

      const isProtectedWhiteArea = baseLuma > 245 && edgeStrength < 18;
      const sameEdgeDirection = baseDetailLuma === 0 ? false : Math.sign(baseDetailLuma) === Math.sign(detailLuma);
      const detailGain = Math.abs(detailLuma) - Math.abs(baseDetailLuma);

      if (energy < 10 || isProtectedWhiteArea || edgeStrength < 6 || !sameEdgeDirection || detailGain <= 0.5) {
        continue;
      }

      const blendFactor = Math.min(1, detailGain / 24) * detailStrength;

      basePixels[index] = Math.max(0, Math.min(255, basePixels[index] + (detailRed - baseDetailRed) * blendFactor));
      basePixels[index + 1] = Math.max(0, Math.min(255, basePixels[index + 1] + (detailGreen - baseDetailGreen) * blendFactor));
      basePixels[index + 2] = Math.max(0, Math.min(255, basePixels[index + 2] + (detailBlue - baseDetailBlue) * blendFactor));
    }

    outputCtx.putImageData(baseImageData, 0, 0);

    return outputCanvas.toDataURL('image/png');
  };

  const sharpenExistingEdges = async (imageUrl: string, sharpenStrength: number): Promise<string> => {
    const img = await loadImage(imageUrl);

    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = img.width;
    baseCanvas.height = img.height;
    const baseCtx = baseCanvas.getContext('2d');
    if (!baseCtx) {
      throw new Error('无法创建锐化画布。');
    }
    baseCtx.drawImage(img, 0, 0, img.width, img.height);

    const blurCanvas = document.createElement('canvas');
    blurCanvas.width = img.width;
    blurCanvas.height = img.height;
    const blurCtx = blurCanvas.getContext('2d');
    if (!blurCtx) {
      throw new Error('无法创建锐化模糊画布。');
    }
    blurCtx.filter = 'blur(0.45px)';
    blurCtx.drawImage(img, 0, 0, img.width, img.height);
    blurCtx.filter = 'none';

    const imageData = baseCtx.getImageData(0, 0, img.width, img.height);
    const blurData = blurCtx.getImageData(0, 0, img.width, img.height);
    const pixels = imageData.data;
    const blurPixels = blurData.data;
    const width = img.width;
    const height = img.height;

    const getLuma = (pixelIndex: number) => (
      pixels[pixelIndex] * 0.299 +
      pixels[pixelIndex + 1] * 0.587 +
      pixels[pixelIndex + 2] * 0.114
    );

    for (let index = 0; index < pixels.length; index += 4) {
      const pixelNumber = index / 4;
      const x = pixelNumber % width;
      const y = Math.floor(pixelNumber / width);
      const luma = getLuma(index);

      const leftIndex = x > 0 ? index - 4 : index;
      const rightIndex = x < width - 1 ? index + 4 : index;
      const upIndex = y > 0 ? index - width * 4 : index;
      const downIndex = y < height - 1 ? index + width * 4 : index;
      const edgeStrength = Math.max(
        Math.abs(luma - getLuma(leftIndex)),
        Math.abs(luma - getLuma(rightIndex)),
        Math.abs(luma - getLuma(upIndex)),
        Math.abs(luma - getLuma(downIndex))
      );

      if (edgeStrength < 5 || luma > 248) {
        continue;
      }

      const redDelta = pixels[index] - blurPixels[index];
      const greenDelta = pixels[index + 1] - blurPixels[index + 1];
      const blueDelta = pixels[index + 2] - blurPixels[index + 2];

      pixels[index] = Math.max(0, Math.min(255, pixels[index] + redDelta * sharpenStrength));
      pixels[index + 1] = Math.max(0, Math.min(255, pixels[index + 1] + greenDelta * sharpenStrength));
      pixels[index + 2] = Math.max(0, Math.min(255, pixels[index + 2] + blueDelta * sharpenStrength));
    }

    baseCtx.putImageData(imageData, 0, 0);
    return baseCanvas.toDataURL('image/png');
  };

  const toLuma = (data: Uint8ClampedArray): Float32Array => {
    const luma = new Float32Array(data.length / 4);
    for (let sourceIndex = 0, targetIndex = 0; sourceIndex < data.length; sourceIndex += 4, targetIndex += 1) {
      luma[targetIndex] = data[sourceIndex] * 0.299 + data[sourceIndex + 1] * 0.587 + data[sourceIndex + 2] * 0.114;
    }
    return luma;
  };

  const toEdge = (luma: Float32Array, width: number, height: number): Float32Array => {
    const edge = new Float32Array(width * height);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const idx = y * width + x;
        const gx = Math.abs(luma[idx + 1] - luma[idx - 1]);
        const gy = Math.abs(luma[idx + width] - luma[idx - width]);
        edge[idx] = gx + gy;
      }
    }
    return edge;
  };

  const alignImageToSourceByTranslation = async (generatedUrl: string, sourceUrl: string): Promise<string> => {
    try {
      const [generatedImg, sourceImg] = await Promise.all([loadImage(generatedUrl), loadImage(sourceUrl)]);

      const compareLongSide = 320;
      const scale = compareLongSide / Math.max(sourceImg.width, sourceImg.height);
      const compareWidth = Math.max(64, Math.round(sourceImg.width * scale));
      const compareHeight = Math.max(64, Math.round(sourceImg.height * scale));

      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = compareWidth;
      sourceCanvas.height = compareHeight;
      const sourceCtx = sourceCanvas.getContext('2d');

      const generatedCanvas = document.createElement('canvas');
      generatedCanvas.width = compareWidth;
      generatedCanvas.height = compareHeight;
      const generatedCtx = generatedCanvas.getContext('2d');

      if (!sourceCtx || !generatedCtx) return generatedUrl;

      sourceCtx.drawImage(sourceImg, 0, 0, compareWidth, compareHeight);
      generatedCtx.drawImage(generatedImg, 0, 0, compareWidth, compareHeight);

      const sourceEdge = toEdge(toLuma(sourceCtx.getImageData(0, 0, compareWidth, compareHeight).data), compareWidth, compareHeight);
      const generatedEdge = toEdge(toLuma(generatedCtx.getImageData(0, 0, compareWidth, compareHeight).data), compareWidth, compareHeight);

      const maxOffset = 16;
      const stride = 2;
      let bestDx = 0;
      let bestDy = 0;
      let bestScore = Number.POSITIVE_INFINITY;

      for (let dy = -maxOffset; dy <= maxOffset; dy += 1) {
        for (let dx = -maxOffset; dx <= maxOffset; dx += 1) {
          const xStart = Math.max(1, 1 - dx);
          const xEnd = Math.min(compareWidth - 1, compareWidth - 1 - dx);
          const yStart = Math.max(1, 1 - dy);
          const yEnd = Math.min(compareHeight - 1, compareHeight - 1 - dy);

          if (xEnd <= xStart || yEnd <= yStart) continue;

          let diffSum = 0;
          let sampleCount = 0;

          for (let y = yStart; y < yEnd; y += stride) {
            const row = y * compareWidth;
            const shiftedRow = (y + dy) * compareWidth;
            for (let x = xStart; x < xEnd; x += stride) {
              const sourceIndex = row + x;
              const generatedIndex = shiftedRow + (x + dx);
              diffSum += Math.abs(sourceEdge[sourceIndex] - generatedEdge[generatedIndex]);
              sampleCount += 1;
            }
          }

          if (sampleCount === 0) continue;

          const score = diffSum / sampleCount;
          if (score < bestScore) {
            bestScore = score;
            bestDx = dx;
            bestDy = dy;
          }
        }
      }

      const shiftX = Math.round(bestDx * (generatedImg.width / compareWidth));
      const shiftY = Math.round(bestDy * (generatedImg.height / compareHeight));

      if (Math.abs(shiftX) < 1 && Math.abs(shiftY) < 1) {
        return generatedUrl;
      }

      const outCanvas = document.createElement('canvas');
      outCanvas.width = generatedImg.width;
      outCanvas.height = generatedImg.height;
      const outCtx = outCanvas.getContext('2d');
      if (!outCtx) return generatedUrl;

      outCtx.drawImage(generatedImg, shiftX, shiftY, generatedImg.width, generatedImg.height);

      return outCanvas.toDataURL('image/png');
    } catch {
      return generatedUrl;
    }
  };
  
  // INITIAL STATE CONFIGURATION
  const [request, setRequest] = useState<GenerationRequest>({
      imageBase64: '',
      imageMimeType: '',
      prompt: '',
      style: RenderStyle.SCANDINAVIAN, 
      timeOfDay: TimeOfDay.LATE_AFTERNOON,
      aspectRatio: 'original',
      resolution: ImageResolution.RES_2K,
      modelVersion: ModelVersion.PRO,
      mode: GenerationMode.AUTO, 
      isAuto: true, 
      compositionLock: false, 
      schemeLock: true,     
      referenceImages: [],
      referenceNote: '',
      commercialEnhancement: false,
      landscapeEnhancement: false,
      thinkingMode: ThinkingMode.DEEP,
   });

  const resultSectionRef = useRef<HTMLDivElement>(null);
  const mainInputRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HistoryItem[]>([]);
  const hasApiAccess = hasConfiguredApi(apiConfig);
  const supportsFolderExport = isDirectoryPickerSupported();

  const replaceHistory = (nextHistory: HistoryItem[]) => {
    const nextImageUrls = new Set(nextHistory.map((item) => item.imageUrl));
    revokeFolderHistoryObjectUrls(historyRef.current.filter((item) => !nextImageUrls.has(item.imageUrl)));
    historyRef.current = nextHistory;
    setHistory(nextHistory);
  };

  const getHistoryModeLabel = (item: HistoryItem): string => {
    if (item.mode === GenerationMode.FREE) return 'Free Mode';
    if (item.isAuto) return 'AI Auto';
    return STYLE_LABELS[item.style] || item.style;
  };

  const getHistoryModelLabel = (item: HistoryItem): string => {
    if (item.modelVersion === ModelVersion.PRO) return 'NanoBanana PRO';
    if (item.modelVersion === ModelVersion.FLASH) return 'NanoBanana 2';
    return '未记录模型';
  };

  const getHistoryThinkingLabel = (item: HistoryItem): string | null => {
    if (item.modelVersion === ModelVersion.PRO) return '高思考';
    if (item.thinkingMode === ThinkingMode.FAST) return '快速';
    if (item.thinkingMode === ThinkingMode.DEEP) return '深入';
    if (item.thinkingMode === ThinkingMode.DEFAULT) return '默认';
    return null;
  };

  const getHistoryTags = (item: HistoryItem): string[] => {
    const tags = [
      item.resolution,
      item.aspectRatio,
      getHistoryThinkingLabel(item),
      item.timeOfDay ? TIME_LABELS[item.timeOfDay] : null,
      item.compositionLock ? '构图锁定' : null,
      item.schemeLock ? '方案锁定' : null,
      item.commercialEnhancement ? '商业增强' : null,
      item.landscapeEnhancement ? '景观增强' : null,
    ].filter((value): value is string => Boolean(value));

    return tags;
  };

  // --- Effects ---
  useEffect(() => {
    const init = async () => {
        const storedApiConfig = loadStoredApiConfig();
        setApiConfig(storedApiConfig);
        setApiConfigDraft(storedApiConfig);
        setIsApiSettingsOpen(!hasConfiguredApi(storedApiConfig));

        const storedExportDirectory = await loadPersistedExportDirectoryHandle();
        if (storedExportDirectory && await ensureExportDirectoryPermission(storedExportDirectory, false)) {
          try {
            const folderHistory = await loadHistoryFromDirectoryHandle(storedExportDirectory);
            setExportDirectoryHandle(storedExportDirectory);
            setExportDirectoryName(storedExportDirectory.name);
            replaceHistory(folderHistory);
            return;
          } catch {
            await clearPersistedExportDirectoryHandle();
          }
        }
        
        const items = await getHistoryFromDb();
        replaceHistory(items);
    };
    init();

    return () => {
      revokeFolderHistoryObjectUrls(historyRef.current);
    };
  }, []);

  useEffect(() => {
    if (!successMsg) {
      return;
    }

    const timeoutId = window.setTimeout(() => setSuccessMsg(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [successMsg]);

  const openApiSettings = () => {
    setApiConfigDraft(apiConfig);
    setIsApiSettingsOpen(true);
  };

  const closeApiSettings = () => {
    setApiConfigDraft(apiConfig);
    setIsApiSettingsOpen(false);
  };

  const handleApiConfigDraftChange = (nextConfig: ApiProviderConfig) => {
    setApiConfigDraft(normalizeApiConfig(nextConfig));
  };

  const handleClearApiConfig = () => {
    const clearedConfig = createEmptyApiConfig(apiConfigDraft.provider);
    setApiConfig(clearedConfig);
    setApiConfigDraft(clearedConfig);
    clearStoredApiConfig();
    setIsApiSettingsOpen(true);
    setError(null);
    setSuccessMsg('本地 API 配置已清除');
  };

  const handleSaveApiConfig = () => {
    const normalizedConfig = normalizeApiConfig(apiConfigDraft);
    if (!hasConfiguredApi(normalizedConfig)) {
      setError(getMissingApiConfigMessage(normalizedConfig.provider));
      return;
    }

    const savedConfig = saveApiConfig(normalizedConfig);
    setApiConfig(savedConfig);
    setApiConfigDraft(savedConfig);
    setIsApiSettingsOpen(false);
    setError(null);
    setSuccessMsg(`${getProviderLabel(savedConfig.provider)} API 已保存到本地浏览器`);
  };

  const handleChooseExportFolder = async () => {
    if (!supportsFolderExport) {
      setError('当前浏览器不支持直接选择导出文件夹，请使用 Chromium 浏览器。');
      return;
    }

    try {
      const directoryHandle = await pickExportDirectory();
      const migratedHistory = await migrateHistoryItemsToDirectory(directoryHandle, historyRef.current);
      try {
        await persistExportDirectoryHandle(directoryHandle);
      } catch {
        // Keep the directory for the current session even if persistence fails.
      }
      setExportDirectoryHandle(directoryHandle);
      setExportDirectoryName(directoryHandle.name);
      replaceHistory(migratedHistory);
      setError(null);
      setSuccessMsg(`后续生成图与参数已保存到文件夹：${directoryHandle.name}`);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return;
      }
      setError('选择导出文件夹失败，请重试。');
    }
  };

  const handleImageSelected = (b64: string, mime: string, url: string, ratio: string) => {
      const normalizedRatio = normalizeAspectRatio(ratio);
      setSourceImageBase64(b64);
      setSourceImageMime(mime);
      setSourceAspectRatio(normalizedRatio);
      setRequest(prev => ({
          ...prev,
          imageBase64: b64,
          imageMimeType: mime
      }));
  };

  const clearSourceImage = () => {
      setSourceImageBase64(null);
      setSourceImageMime('');
      setSourceAspectRatio('');
  };

  const convertUrlToDataUrl = async (imageUrl: string): Promise<string> => {
      const response = await fetch(imageUrl);
      if (!response.ok) {
          throw new Error('无法读取历史图片数据。');
      }
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
      });
  };

  const handleUseResultAsInput = async (result: any) => {
      try {
          if (!result.imageUrl) {
              return;
          }

          const dataUrl = result.imageUrl.startsWith('data:') ? result.imageUrl : await convertUrlToDataUrl(result.imageUrl);
          const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
          if (!match) {
              setError('无法读取历史图片数据。');
              return;
          }

          const img = new Image();
          img.onload = () => {
              const w = img.width;
              const h = img.height;
              const ratio = `${w}:${h}`;
              
              handleImageSelected(match[2], match[1], dataUrl, ratio);
              setSuccessMsg("已将结果设为底图");
              mainInputRef.current?.scrollIntoView({ behavior: 'smooth' });
          };
          img.src = dataUrl;
      } catch {
          setError('无法读取历史图片数据。');
      }
  };

  const processDroppedFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
        setError('请上传 JPG 或 PNG 图片格式');
        return;
    }
    if (file.size > 20 * 1024 * 1024) {
        setError('图片大小不能超过 20MB');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const result = e.target?.result as string;
        const match = result.match(/^data:(.+);base64,(.+)$/);
        
        if (match) {
            const img = new Image();
            img.onload = () => {
                const w = img.width;
                const h = img.height;
                const ratio = `${w}:${h}`;
                
                handleImageSelected(match[2], match[1], result, ratio);
                setSuccessMsg("底图已替换");
            };
            img.src = result;
        }
    };
    reader.readAsDataURL(file);
  };

  const handleContainerDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);
      if (e.dataTransfer.files?.[0]) {
          processDroppedFile(e.dataTransfer.files[0]);
      }
  };

  const isHeavyTask = (res: ImageResolution) => res === ImageResolution.RES_4K;

  const canGenerate = (_resolution: ImageResolution = request.resolution): boolean => {
      const totalActiveRequests = activeStandardRequests + activeHeavyRequests;
      return totalActiveRequests < MAX_CONCURRENT_REQUESTS;
  };

  const handleGenerate = async (
    isUpscaleOnly: boolean = false,
    overrideSourceBase64?: string,
    overrideSourceMime?: string,
    overrideOriginalUrl?: string,
    overrideAspectRatio?: string
  ) => {
    const effectiveSourceBase64 = overrideSourceBase64 || sourceImageBase64;
    const effectiveSourceMime = overrideSourceMime || sourceImageMime || 'image/png';
    
    if (!effectiveSourceBase64) { setError("请先上传底图"); return; }
    if (!hasApiAccess) {
      setIsApiSettingsOpen(true);
      setError(getMissingApiConfigMessage(apiConfig.provider));
      return;
    }
    
    const requestResolution = isUpscaleOnly ? ImageResolution.RES_4K : request.resolution;

    if (!canGenerate(requestResolution)) {
        setError(`列队已满。当前最多同时渲染 ${MAX_CONCURRENT_REQUESTS} 张。`);
        return;
    }

    let effectiveAspectRatio = request.aspectRatio;
    let enforceOriginalAspect = false;
    if (effectiveAspectRatio === 'original') {
        if (!sourceImageBase64 || !sourceAspectRatio) {
            setError("请先上传底图才能使用跟随原图");
            return;
        }
        enforceOriginalAspect = true;
        effectiveAspectRatio = 'free';
    }

    const tempId = uuidv4();
    const finalPrompt = isUpscaleOnly ? 'AI_UPSCALE_4K' : request.prompt;
    const isHeavy = isHeavyTask(requestResolution);

    // Save Original Image for comparison
    const originalUrl = overrideOriginalUrl || `data:${effectiveSourceMime};base64,${effectiveSourceBase64}`;

    const placeholderItem = {
        id: tempId,
        status: 'loading',
        prompt: finalPrompt,
        style: request.style,
        resolution: requestResolution,
        modelVersion: isUpscaleOnly ? ModelVersion.PRO : request.modelVersion,
        timestamp: Date.now(),
        mode: request.mode,
        isAuto: isUpscaleOnly ? false : request.mode === GenerationMode.AUTO,
        originalImageUrl: originalUrl, 
        aspectRatio: overrideAspectRatio || sourceAspectRatio || effectiveAspectRatio
    };

    setSessionResults(prev => [placeholderItem, ...prev]);
    
    // Update Queue Counters
    if (isHeavy) setActiveHeavyRequests(prev => prev + 1);
    else setActiveStandardRequests(prev => prev + 1);

    setError(null);
    setSuccessMsg(null);

    setTimeout(() => resultSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

    try {
        const result = await generateRendering({
            ...request,
            imageBase64: effectiveSourceBase64,
            imageMimeType: effectiveSourceMime,
            prompt: finalPrompt,
            resolution: requestResolution,
            modelVersion: isUpscaleOnly ? ModelVersion.PRO : request.modelVersion,
            compositionLock: isUpscaleOnly ? true : (request.compositionLock || enforceOriginalAspect),
            schemeLock: isUpscaleOnly ? true : (request.schemeLock || enforceOriginalAspect),
            isUpscale: isUpscaleOnly,
            aspectRatio: isUpscaleOnly ? 'free' : effectiveAspectRatio
        }, apiConfig);

        const processedImageUrl = (enforceOriginalAspect || isUpscaleOnly)
          ? await cropImageToAspectRatio(
              await alignImageToSourceByTranslation(result.imageUrl, originalUrl),
              overrideAspectRatio || sourceAspectRatio
            )
          : result.imageUrl;

        const finalImageUrl = isUpscaleOnly
          ? await (async () => {
              const base4K = await resizeImageToLongSide(originalUrl, 3840);
              const blendedImage = await blendHighFrequencyDetail(base4K.imageUrl, processedImageUrl, UPSCALE_DETAIL_STRENGTH);
              return sharpenExistingEdges(blendedImage, UPSCALE_EDGE_SHARPEN_STRENGTH);
            })()
          : processedImageUrl;

        setSessionResults(prev => prev.map(item => item.id === tempId ? { ...item, status: 'success', imageUrl: finalImageUrl } : item));

        const newHistoryItem: HistoryItem = {
            id: tempId,
            timestamp: Date.now(),
            imageUrl: finalImageUrl,
            style: request.style,
            prompt: finalPrompt,
            mode: request.mode,
            isAuto: request.mode === GenerationMode.AUTO,
            resolution: requestResolution,
            modelVersion: isUpscaleOnly ? ModelVersion.PRO : request.modelVersion,
            timeOfDay: request.timeOfDay,
            aspectRatio: overrideAspectRatio || sourceAspectRatio || effectiveAspectRatio,
            compositionLock: isUpscaleOnly ? true : (request.compositionLock || enforceOriginalAspect),
            schemeLock: isUpscaleOnly ? true : (request.schemeLock || enforceOriginalAspect),
            referenceNote: request.referenceNote,
            commercialEnhancement: request.commercialEnhancement,
            landscapeEnhancement: request.landscapeEnhancement,
            thinkingMode: request.thinkingMode,
            modelId: result.modelUsed,
            storageSource: exportDirectoryHandle ? 'folder' : 'indexeddb',
        };

        let savedFileName: string | null = null;
        let savedMetaFileName: string | null = null;
        if (exportDirectoryHandle) {
          try {
            const savedHistoryItem = await saveHistoryItemToDirectory(exportDirectoryHandle, newHistoryItem);
            savedFileName = savedHistoryItem.imageFileName || null;
            savedMetaFileName = savedHistoryItem.metaFileName || null;
            newHistoryItem.imageFileName = savedHistoryItem.imageFileName;
            newHistoryItem.metaFileName = savedHistoryItem.metaFileName;
          } catch (saveError) {
            const stillAuthorized = await ensureExportDirectoryPermission(exportDirectoryHandle, false);
            if (!stillAuthorized) {
              setExportDirectoryHandle(null);
              setExportDirectoryName(null);
              await clearPersistedExportDirectoryHandle();
            }
            setError('渲染已完成，但自动保存到文件夹失败，请重新选择导出目录。');
          }
        }

        replaceHistory([newHistoryItem, ...historyRef.current].slice(0, 50));
        await saveHistoryItemToDb(newHistoryItem);

        const saveSuffix = savedFileName ? ` 已自动保存到导出文件夹${savedMetaFileName ? '并写入参数记录' : ''}。` : '';
        if (isUpscaleOnly) {
          setSuccessMsg(`✨ 4K 增强完成，图纸清晰度已提升。${saveSuffix}`.trim());
        } else {
          setSuccessMsg(`✨ 渲染完成！${savedFileName ? '已自动保存到导出文件夹。' : '请及时下载。'}`);
        }

    } catch (err: any) {
        setSessionResults(prev => prev.filter(item => item.id !== tempId)); 
        const rawMsg = String(err?.error?.message ?? err?.message ?? err ?? "");
        let msg = rawMsg || "生成失败，请稍后重试。";
        if (msg.includes("403") || msg.includes("Permission") || msg.includes("permission")) {
            msg = `API 权限不足。请检查 ${getProviderLabel(apiConfig.provider)} 的 Key 或项目权限是否有效。`;
        } else if (msg.includes("503") || msg.includes("UNAVAILABLE") || msg.toLowerCase().includes("high demand")) {
            msg = "当前模型高负载（503 UNAVAILABLE）。建议切换到 NanoBanana 2，或稍后再试。";
        }
        setError(msg);
    } finally {
        if (isHeavy) setActiveHeavyRequests(prev => prev - 1);
        else setActiveStandardRequests(prev => prev - 1);
    }
  };

  const handleResultUpscale = async (resultItem: any) => {
      if (resultItem.imageUrl && resultItem.imageUrl.startsWith('data:')) {
          const match = resultItem.imageUrl.match(/^data:(.+);base64,(.+)$/);
          if (!match) {
            setError("无法获取原图数据进行放大。");
            return;
          }

          await handleGenerate(true, match[2], match[1], resultItem.imageUrl, resultItem.aspectRatio);
      } else {
          setError("无法获取原图数据进行放大。");
      }
  };

  return (
    <div className="min-h-screen bg-schiele-bg text-schiele-text font-sans selection:bg-schiele-rust selection:text-white pb-24">
      <Header 
        onHistoryClick={() => setShowHistoryModal(!showHistoryModal)}
        hasApiKey={hasApiAccess}
        onChooseExportFolder={() => { void handleChooseExportFolder(); }}
        exportFolderName={exportDirectoryName}
        isFolderExportSupported={supportsFolderExport}
      />

      {error && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-red-600/90 backdrop-blur text-white px-6 py-4 rounded-xl z-[100] shadow-lg animate-fade-in flex items-center gap-4">
            <i className="fas fa-exclamation-triangle"></i>
            <span>{error}</span>
            <button onClick={() => setError(null)} className="hover:text-red-200"><i className="fas fa-times"></i></button>
        </div>
      )}
      
      {successMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-schiele-ink/95 backdrop-blur text-white px-6 py-4 rounded-xl z-[100] shadow-lg animate-fade-in flex items-center gap-4 border border-schiele-rust/30">
            <i className="fas fa-check-circle text-green-500 text-xl"></i>
            <span>{successMsg}</span>
            <button onClick={() => setSuccessMsg(null)} className="text-white/70 hover:text-white transition-colors">
                <i className="fas fa-times"></i>
            </button>
        </div>
      )}
      
      <section className="pt-24 pb-6 px-6 text-center max-w-4xl mx-auto animate-fade-in">
         <div className="relative inline-block">
             <h1 className="text-4xl md:text-5xl font-bold text-schiele-ink mb-2 tracking-tight">Render<span className="text-schiele-rust">X</span>.VIP</h1>
         </div>
       </section>

      <main className="max-w-[1600px] mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          <div className="lg:col-span-7 flex flex-col space-y-6" ref={mainInputRef}>
            <div 
                className={`relative min-h-[500px] bg-white rounded-[24px] shadow-paper overflow-hidden transition-all duration-300 ${isDraggingOver ? 'ring-4 ring-schiele-rust scale-[0.99] bg-orange-50' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                onDragLeave={() => setIsDraggingOver(false)}
                onDrop={handleContainerDrop}
            >
                {sourceImageBase64 ? (
                    <>
                        <img src={`data:${sourceImageMime};base64,${sourceImageBase64}`} className="w-full h-full object-contain max-h-[70vh] bg-schiele-bg/30 pointer-events-none" />
                        <div className="absolute top-4 right-4 z-20">
                            <button onClick={clearSourceImage} className="bg-white/90 text-red-500 px-3 py-1.5 rounded-xl text-xs font-bold shadow-sm border border-gray-100 hover:bg-white hover:text-red-600 transition-colors">
                                <i className="fas fa-trash-alt mr-2"></i>清除
                            </button>
                        </div>
                        <div className="absolute bottom-4 right-4 z-20">
                             <button 
                                onClick={(e) => { e.stopPropagation(); void handleGenerate(true); }} 
                                disabled={!sourceImageBase64 || !hasApiAccess}
                                className={`bg-schiele-ink hover:bg-black text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-lg flex items-center space-x-2 transition-transform hover:scale-105 active:scale-95 ${!sourceImageBase64 || !hasApiAccess ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                 <i className="fas fa-wand-magic-sparkles text-schiele-rust"></i>
                                <span>原图转 4K</span>
                              </button>
                        </div>
                        
                        {isDraggingOver && (
                            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-30 flex items-center justify-center">
                                <div className="text-schiele-rust font-bold text-xl flex flex-col items-center">
                                    <i className="fas fa-exchange-alt mb-2 text-4xl"></i>
                                    <span>松开替换图片</span>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="absolute inset-0 p-4">
                        <ImageUploader onImageSelected={handleImageSelected} onError={setError} />
                    </div>
                )}
            </div>

            <div className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
                <GlobalSettings request={request} setRequest={setRequest} />
            </div>

          </div>

          <div className="lg:col-span-5 sticky top-24">
            <ControlPanel 
                request={request}
                setRequest={setRequest}
                onGenerate={() => {
                  void handleGenerate();
                }}
                activeStandardRequests={activeStandardRequests}
                activeHeavyRequests={activeHeavyRequests}
                hasApiAccess={hasApiAccess}
                apiProvider={apiConfig.provider}
                imageModel={apiConfig.imageModel}
            />
          </div>
        </div>

        <section ref={resultSectionRef} className="mt-16 border-t border-schiele-border pt-12 pb-24">
            <div className="flex items-center justify-center mb-12">
                <h2 className="text-2xl font-bold text-schiele-ink">渲染结果</h2>
            </div>
            <div className="max-w-4xl mx-auto">
                 <OutputGallery 
                     results={sessionResults} 
                     onUpscale={handleResultUpscale} 
                     onUseAsInput={handleUseResultAsInput}
                  />
            </div>
        </section>

      </main>

      {showHistoryModal && (
        <div data-testid="history-backdrop" className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex justify-end" onClick={() => setShowHistoryModal(false)}>
            <div className="w-full max-w-md bg-white h-full shadow-2xl overflow-y-auto animate-fade-in p-6" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-between mb-8">
                    <h2 className="text-xl font-bold text-schiele-ink">方案画廊</h2>
                    <button onClick={() => setShowHistoryModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
                        <i className="fas fa-times"></i>
                    </button>
                </div>
                {history.length === 0 ? (
                    <div className="text-center text-gray-400 py-20 flex flex-col items-center">
                        <i className="fas fa-layer-group text-3xl mb-4 opacity-30"></i>
                        <p>暂无记录</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {history.map(item => (
                            <div key={item.id} className="border border-schiele-border rounded-xl overflow-hidden group hover:shadow-paper transition-shadow">
                                <img src={item.imageUrl} className="w-full h-48 object-cover" />
                                <div className="p-3 bg-gray-50 flex justify-between gap-3 items-start">
                                    <div className="min-w-0 flex-1 flex flex-col gap-2">
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[11px] font-bold text-gray-500 truncate">
                                                {getHistoryModeLabel(item)}
                                            </span>
                                            <span className="text-sm font-bold text-schiele-ink truncate">
                                                {getHistoryModelLabel(item)}
                                            </span>
                                            {item.modelId && (
                                                <span className="text-[10px] text-gray-400 truncate">{item.modelId}</span>
                                            )}
                                            <span className="text-[10px] text-gray-400">{new Date(item.timestamp).toLocaleTimeString()}</span>
                                        </div>
                                        {getHistoryTags(item).length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {getHistoryTags(item).map((tag) => (
                                                    <span key={`${item.id}-${tag}`} className="px-2 py-1 rounded-full bg-white border border-gray-200 text-[10px] font-bold text-gray-600">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => { setShowHistoryModal(false); handleUseResultAsInput(item); }} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg border border-gray-200 text-schiele-ink hover:text-white hover:bg-schiele-ink transition-colors" title="使用此底图">
                                            <i className="fas fa-reply text-xs"></i>
                                        </button>
                                        <a href={item.imageUrl} download={`renderx-history-${item.id}.png`} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg border border-gray-200 text-schiele-rust hover:text-white hover:bg-schiele-rust transition-colors">
                                            <i className="fas fa-download text-xs"></i>
                                        </a>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
      )}

      <ApiSettingsFab
        savedConfig={apiConfig}
        draftConfig={apiConfigDraft}
        isOpen={isApiSettingsOpen}
        onOpen={openApiSettings}
        onClose={closeApiSettings}
        onDraftChange={handleApiConfigDraftChange}
        onSave={handleSaveApiConfig}
        onClear={handleClearApiConfig}
      />

      <div className="fixed bottom-7 right-24 text-[10px] tracking-[0.18em] text-gray-400/70 select-none pointer-events-none">{APP_VERSION}</div>

    </div>
  );
}

export default App;
