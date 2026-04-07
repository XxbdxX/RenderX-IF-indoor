
export enum RenderStyle {
  PHOTOREALISTIC = 'Photorealistic',
  MINIMALIST = 'Minimalist',
  COMMERCIAL = 'Commercial',
  WATERCOLOR = 'Watercolor',
  SCANDINAVIAN = 'Scandinavian',
  BIOPHILIC = 'Biophilic'
}

export enum TimeOfDay {
  MORNING = 'Morning',
  DAY = 'Day',
  OVERCAST = 'Overcast',
  LATE_AFTERNOON = 'LateAfternoon',
  DUSK = 'Dusk',
  NIGHT = 'Night'
}

export enum ImageResolution {
  RES_1K = '1K',
  RES_2K = '2K',
  RES_4K = '4K'
}

export enum ModelVersion {
  PRO = 'Pro',
  FLASH = 'Flash'
}

export enum GenerationMode {
  MANUAL = 'Manual',
  AUTO = 'Auto',
  FREE = 'Free'
}

export enum ApiProvider {
  AI_STUDIO = 'google-ai-studio',
  VERTEX_AI = 'vertex-ai'
}

export interface ApiProviderConfig {
  provider: ApiProvider;
  apiKey: string;
  vertexProject?: string;
  vertexLocation?: string;
}

export interface ReferenceImage {
  id: string; // "1", "2"
  base64: string;
  mimeType: string;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  imageUrl: string;
  style: RenderStyle;
  prompt: string;
  mode: GenerationMode;
  isAuto?: boolean;
  resolution?: ImageResolution;
  modelVersion?: ModelVersion;
  timeOfDay?: TimeOfDay;
  aspectRatio?: string;
  compositionLock?: boolean;
  schemeLock?: boolean;
  referenceNote?: string;
  commercialEnhancement?: boolean;
  landscapeEnhancement?: boolean;
  imageFileName?: string;
  metaFileName?: string;
  modelId?: string;
  storageSource?: 'indexeddb' | 'folder';
}

export interface GenerationRequest {
  imageBase64: string;
  imageMimeType: string;
  prompt: string;
  style: RenderStyle;
  timeOfDay: TimeOfDay;
  aspectRatio: string;
  resolution: ImageResolution;
  modelVersion: ModelVersion;
  mode: GenerationMode; 
  compositionLock: boolean;
  schemeLock: boolean;
  isUpscale?: boolean;
  referenceImages: ReferenceImage[];
  referenceNote?: string;
  isAuto?: boolean;
  // New Enhancements
  commercialEnhancement?: boolean;
  landscapeEnhancement?: boolean;
}

export interface GenerationResult {
  imageUrl: string;
  modelUsed?: string;
  didFallback?: boolean;
}
