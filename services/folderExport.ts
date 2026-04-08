import {
  GenerationMode,
  HistoryItem,
  ImageResolution,
  ModelVersion,
  RenderStyle,
} from '../types';

const EXPORT_DB_NAME = 'RenderXExportDB';
const EXPORT_STORE_NAME = 'settings';
const EXPORT_HANDLE_KEY = 'export-directory-handle';

interface ExportFileMeta {
  id: string;
  timestamp: number;
  mode: GenerationMode;
  resolution?: ImageResolution;
  modelVersion?: ModelVersion;
  style?: RenderStyle;
}

interface FolderHistoryRecord {
  schemaVersion: 1;
  id: string;
  timestamp: number;
  imageFileName: string;
  prompt: string;
  mode: GenerationMode;
  style: RenderStyle;
  isAuto?: boolean;
  resolution?: ImageResolution;
  modelVersion?: ModelVersion;
  timeOfDay?: HistoryItem['timeOfDay'];
  aspectRatio?: string;
  thinkingMode?: HistoryItem['thinkingMode'];
  compositionLock?: boolean;
  schemeLock?: boolean;
  referenceNote?: string;
  commercialEnhancement?: boolean;
  landscapeEnhancement?: boolean;
  modelId?: string;
}

type PermissionAwareDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>;
};

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
};

const sanitizeToken = (value: string): string => {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
};

const pad = (value: number): string => String(value).padStart(2, '0');

const openExportDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(EXPORT_DB_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(EXPORT_STORE_NAME)) {
        db.createObjectStore(EXPORT_STORE_NAME);
      }
    };
  });
};

export const isDirectoryPickerSupported = (): boolean => {
  return typeof window !== 'undefined' && typeof (window as DirectoryPickerWindow).showDirectoryPicker === 'function';
};

export const buildExportFileName = (meta: ExportFileMeta): string => {
  const date = new Date(meta.timestamp);
  const timestamp = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
  const mode = sanitizeToken(meta.mode);
  const resolution = meta.resolution ? sanitizeToken(meta.resolution) : 'img';
  const model = meta.modelVersion === ModelVersion.PRO ? 'pro' : meta.modelVersion === ModelVersion.FLASH ? 'n2' : 'std';
  const suffix = sanitizeToken(meta.id).slice(0, 8) || 'result';

  return `renderx-${timestamp}-${mode}-${resolution}-${model}-${suffix}.png`;
};

export const buildExportMetaFileName = (meta: ExportFileMeta): string => {
  return buildExportFileName(meta).replace(/\.png$/i, '.json');
};

const writeTextToDirectoryHandle = async (
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string,
  content: string,
): Promise<void> => {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(content);
    await writable.close();
  } catch (error) {
    if (typeof writable.abort === 'function') {
      await writable.abort();
    }
    throw error;
  }
};

const toFolderHistoryRecord = (item: HistoryItem, imageFileName: string): FolderHistoryRecord => ({
  schemaVersion: 1,
  id: item.id,
  timestamp: item.timestamp,
  imageFileName,
  prompt: item.prompt,
  mode: item.mode,
  style: item.style,
  isAuto: item.isAuto,
  resolution: item.resolution,
  modelVersion: item.modelVersion,
  timeOfDay: item.timeOfDay,
  aspectRatio: item.aspectRatio,
  thinkingMode: item.thinkingMode,
  compositionLock: item.compositionLock,
  schemeLock: item.schemeLock,
  referenceNote: item.referenceNote,
  commercialEnhancement: item.commercialEnhancement,
  landscapeEnhancement: item.landscapeEnhancement,
  modelId: item.modelId,
});

const toHistoryItemFromRecord = (record: FolderHistoryRecord, imageUrl: string, metaFileName: string): HistoryItem => ({
  id: record.id,
  timestamp: record.timestamp,
  imageUrl,
  style: record.style,
  prompt: record.prompt,
  mode: record.mode,
  isAuto: record.isAuto,
  resolution: record.resolution,
  modelVersion: record.modelVersion,
  timeOfDay: record.timeOfDay,
  aspectRatio: record.aspectRatio,
  thinkingMode: record.thinkingMode,
  compositionLock: record.compositionLock,
  schemeLock: record.schemeLock,
  referenceNote: record.referenceNote,
  commercialEnhancement: record.commercialEnhancement,
  landscapeEnhancement: record.landscapeEnhancement,
  imageFileName: record.imageFileName,
  metaFileName,
  modelId: record.modelId,
  storageSource: 'folder',
});

export const dataUrlToBlob = async (source: string): Promise<Blob> => {
  if (source.startsWith('data:')) {
    const [header, base64] = source.split(',');
    const mimeMatch = header.match(/data:(.*?);base64/);
    const mimeType = mimeMatch?.[1] || 'image/png';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: mimeType });
  }

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error('无法读取生成图片数据。');
  }
  return response.blob();
};

export const saveImageToDirectoryHandle = async (
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string,
  imageSource: string,
): Promise<void> => {
  const blob = await dataUrlToBlob(imageSource);
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    if (typeof writable.abort === 'function') {
      await writable.abort();
    }
    throw error;
  }
};

export const saveGeneratedImageToDirectory = async (
  directoryHandle: FileSystemDirectoryHandle,
  imageSource: string,
  meta: ExportFileMeta,
): Promise<string> => {
  const fileName = buildExportFileName(meta);
  await saveImageToDirectoryHandle(directoryHandle, fileName, imageSource);
  return fileName;
};

export const saveHistoryItemToDirectory = async (
  directoryHandle: FileSystemDirectoryHandle,
  item: HistoryItem,
): Promise<HistoryItem> => {
  const fileMeta: ExportFileMeta = {
    id: item.id,
    timestamp: item.timestamp,
    mode: item.mode,
    resolution: item.resolution,
    modelVersion: item.modelVersion,
    style: item.style,
  };
  const imageFileName = item.imageFileName || buildExportFileName(fileMeta);
  const metaFileName = item.metaFileName || buildExportMetaFileName(fileMeta);

  await saveImageToDirectoryHandle(directoryHandle, imageFileName, item.imageUrl);
  await writeTextToDirectoryHandle(directoryHandle, metaFileName, JSON.stringify(toFolderHistoryRecord(item, imageFileName), null, 2));

  return {
    ...item,
    imageFileName,
    metaFileName,
    storageSource: 'folder',
  };
};

export const loadHistoryFromDirectoryHandle = async (
  directoryHandle: FileSystemDirectoryHandle,
): Promise<HistoryItem[]> => {
  const loadedItems: HistoryItem[] = [];
  const directoryEntries = (directoryHandle as any).entries?.();
  if (!directoryEntries) {
    return loadedItems;
  }

  for await (const [entryName, entryHandle] of directoryEntries as AsyncIterable<[string, FileSystemFileHandle]>) {
    if (entryHandle.kind !== 'file' || !entryName.endsWith('.json')) {
      continue;
    }

    try {
      const metaFile = await entryHandle.getFile();
      const metaText = await metaFile.text();
      const record = JSON.parse(metaText) as FolderHistoryRecord;
      const imageFileHandle = await directoryHandle.getFileHandle(record.imageFileName);
      const imageFile = await imageFileHandle.getFile();
      const imageUrl = URL.createObjectURL(imageFile);
      loadedItems.push(toHistoryItemFromRecord(record, imageUrl, entryName));
    } catch {
      // Ignore malformed or orphaned entries and continue loading the rest.
    }
  }

  loadedItems.sort((a, b) => b.timestamp - a.timestamp);
  return loadedItems;
};

export const revokeFolderHistoryObjectUrls = (items: HistoryItem[]): void => {
  items.forEach((item) => {
    if (item.storageSource === 'folder' && item.imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(item.imageUrl);
    }
  });
};

export const migrateHistoryItemsToDirectory = async (
  directoryHandle: FileSystemDirectoryHandle,
  items: HistoryItem[],
): Promise<HistoryItem[]> => {
  for (const item of items) {
    await saveHistoryItemToDirectory(directoryHandle, item);
  }

  return loadHistoryFromDirectoryHandle(directoryHandle);
};

export const persistExportDirectoryHandle = async (directoryHandle: FileSystemDirectoryHandle): Promise<void> => {
  const db = await openExportDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(EXPORT_STORE_NAME, 'readwrite');
    const store = tx.objectStore(EXPORT_STORE_NAME);
    const request = store.put(directoryHandle, EXPORT_HANDLE_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const loadPersistedExportDirectoryHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
  try {
    const db = await openExportDb();
    return await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction(EXPORT_STORE_NAME, 'readonly');
      const store = tx.objectStore(EXPORT_STORE_NAME);
      const request = store.get(EXPORT_HANDLE_KEY);
      request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle) || null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
};

export const clearPersistedExportDirectoryHandle = async (): Promise<void> => {
  try {
    const db = await openExportDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(EXPORT_STORE_NAME, 'readwrite');
      const store = tx.objectStore(EXPORT_STORE_NAME);
      const request = store.delete(EXPORT_HANDLE_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Ignore cleanup failures.
  }
};

export const ensureExportDirectoryPermission = async (
  directoryHandle: FileSystemDirectoryHandle,
  requestWriteAccess: boolean,
): Promise<boolean> => {
  const permissionHandle = directoryHandle as PermissionAwareDirectoryHandle;
  const permissionDescriptor = { mode: 'readwrite' as const };

  if (typeof permissionHandle.queryPermission === 'function') {
    const state = await permissionHandle.queryPermission(permissionDescriptor);
    if (state === 'granted') {
      return true;
    }
    if (!requestWriteAccess) {
      return false;
    }
  }

  if (requestWriteAccess && typeof permissionHandle.requestPermission === 'function') {
    const requestState = await permissionHandle.requestPermission(permissionDescriptor);
    return requestState === 'granted';
  }

  return false;
};

export const pickExportDirectory = async (): Promise<FileSystemDirectoryHandle> => {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) {
    throw new Error('当前浏览器不支持目录选择。');
  }

  const directoryHandle = await picker({ mode: 'readwrite' });
  return directoryHandle;
};
