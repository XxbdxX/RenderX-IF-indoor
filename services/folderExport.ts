import { GenerationMode, ImageResolution, ModelVersion, RenderStyle } from '../types';

const EXPORT_DB_NAME = 'RenderXExportDB';
const EXPORT_STORE_NAME = 'settings';
const EXPORT_HANDLE_KEY = 'export-directory-handle';

interface ExportFileMeta {
  id: string;
  timestamp: number;
  mode: GenerationMode;
  resolution: ImageResolution;
  modelVersion: ModelVersion;
  style?: RenderStyle;
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
  const resolution = sanitizeToken(meta.resolution);
  const model = meta.modelVersion === ModelVersion.PRO ? 'pro' : 'n2';
  const suffix = sanitizeToken(meta.id).slice(0, 8) || 'result';

  return `renderx-${timestamp}-${mode}-${resolution}-${model}-${suffix}.png`;
};

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
  try {
    await persistExportDirectoryHandle(directoryHandle);
  } catch {
    // Keep the directory handle for the current session even if persistence fails.
  }
  return directoryHandle;
};
