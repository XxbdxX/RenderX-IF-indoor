import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerationMode, ImageResolution, ModelVersion, RenderStyle, TimeOfDay } from '../types';
import { buildExportFileName, loadHistoryFromDirectoryHandle, saveHistoryItemToDirectory, saveImageToDirectoryHandle } from './folderExport';

describe('folder export helpers', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:renderx-history');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds deterministic png filenames for generated images', () => {
    expect(
      buildExportFileName({
        id: 'abc12345',
        timestamp: Date.UTC(2026, 3, 7, 3, 8, 9),
        mode: GenerationMode.AUTO,
        resolution: ImageResolution.RES_2K,
        modelVersion: ModelVersion.PRO,
        style: RenderStyle.PHOTOREALISTIC,
      }),
    ).toBe('renderx-20260407-030809-auto-2k-pro-abc12345.png');
  });

  it('writes generated image data into the selected directory handle', async () => {
    const write = vi.fn();
    const close = vi.fn();
    const createWritable = vi.fn().mockResolvedValue({ write, close });
    const getFileHandle = vi.fn().mockResolvedValue({ createWritable });

    await saveImageToDirectoryHandle(
      { getFileHandle } as any,
      'renderx-test.png',
      'data:image/png;base64,AA==',
    );

    expect(getFileHandle).toHaveBeenCalledWith('renderx-test.png', { create: true });
    expect(write).toHaveBeenCalledWith(expect.any(Blob));
    expect(close).toHaveBeenCalled();
  });

  it('aborts the file writer when a write fails', async () => {
    const abort = vi.fn();
    const createWritable = vi.fn().mockResolvedValue({
      write: vi.fn().mockRejectedValue(new Error('write failed')),
      close: vi.fn(),
      abort,
    });
    const getFileHandle = vi.fn().mockResolvedValue({ createWritable });

    await expect(
      saveImageToDirectoryHandle(
        { getFileHandle } as any,
        'renderx-test.png',
        'data:image/png;base64,AA==',
      ),
    ).rejects.toThrow('write failed');

    expect(abort).toHaveBeenCalled();
  });

  it('writes image and json sidecar metadata for a history item', async () => {
    const imageWrite = vi.fn();
    const imageClose = vi.fn();
    const metaWrite = vi.fn();
    const metaClose = vi.fn();
    const getFileHandle = vi.fn().mockImplementation((fileName: string) => {
      return Promise.resolve({
        createWritable: vi.fn().mockResolvedValue(
          fileName.endsWith('.json')
            ? { write: metaWrite, close: metaClose }
            : { write: imageWrite, close: imageClose },
        ),
      });
    });

    const item = await saveHistoryItemToDirectory(
      { getFileHandle } as any,
      {
        id: 'history-1',
        timestamp: Date.UTC(2026, 3, 7, 3, 8, 9),
        imageUrl: 'data:image/png;base64,AA==',
        style: RenderStyle.PHOTOREALISTIC,
        prompt: 'warm lobby rendering',
        mode: GenerationMode.AUTO,
        isAuto: true,
        resolution: ImageResolution.RES_2K,
        modelVersion: ModelVersion.PRO,
        timeOfDay: TimeOfDay.DUSK,
      },
    );

    expect(item.imageFileName).toBe('renderx-20260407-030809-auto-2k-pro-history-.png');
    expect(item.metaFileName).toBe('renderx-20260407-030809-auto-2k-pro-history-.json');
    expect(metaWrite).toHaveBeenCalledWith(expect.stringContaining('"prompt": "warm lobby rendering"'));
    expect(metaWrite).toHaveBeenCalledWith(expect.stringContaining('"resolution": "2K"'));
    expect(imageClose).toHaveBeenCalled();
    expect(metaClose).toHaveBeenCalled();
  });

  it('loads folder history items from saved json sidecars', async () => {
    const metadata = {
      schemaVersion: 1,
      id: 'history-1',
      timestamp: Date.UTC(2026, 3, 7, 3, 8, 9),
      imageFileName: 'renderx-20260407-030809-auto-2k-pro-history-.png',
      prompt: 'warm lobby rendering',
      mode: GenerationMode.AUTO,
      style: RenderStyle.PHOTOREALISTIC,
      isAuto: true,
      resolution: ImageResolution.RES_2K,
      modelVersion: ModelVersion.PRO,
      timeOfDay: TimeOfDay.DUSK,
    };

    const entries = async function* () {
      yield [
        'renderx-20260407-030809-auto-2k-pro-history-.json',
        {
          kind: 'file',
          getFile: vi.fn().mockResolvedValue({
            text: vi.fn().mockResolvedValue(JSON.stringify(metadata)),
          }),
        },
      ] as const;
    };

    const historyItems = await loadHistoryFromDirectoryHandle({
      entries,
      getFileHandle: vi.fn().mockResolvedValue({
        getFile: vi.fn().mockResolvedValue(new Blob(['image'], { type: 'image/png' })),
      }),
    } as any);

    expect(historyItems).toHaveLength(1);
    expect(historyItems[0]).toMatchObject({
      id: 'history-1',
      prompt: 'warm lobby rendering',
      imageUrl: 'blob:renderx-history',
      resolution: ImageResolution.RES_2K,
      modelVersion: ModelVersion.PRO,
      storageSource: 'folder',
    });
  });

  it('skips malformed sidecar files and keeps valid history entries', async () => {
    const validMetadata = {
      schemaVersion: 1,
      id: 'history-2',
      timestamp: Date.UTC(2026, 3, 7, 3, 10, 9),
      imageFileName: 'renderx-20260407-031009-auto-2k-pro-history-.png',
      prompt: 'atrium rendering',
      mode: GenerationMode.AUTO,
      style: RenderStyle.COMMERCIAL,
    };

    const entries = async function* () {
      yield [
        'broken.json',
        {
          kind: 'file',
          getFile: vi.fn().mockResolvedValue({
            text: vi.fn().mockResolvedValue('{broken'),
          }),
        },
      ] as const;
      yield [
        'valid.json',
        {
          kind: 'file',
          getFile: vi.fn().mockResolvedValue({
            text: vi.fn().mockResolvedValue(JSON.stringify(validMetadata)),
          }),
        },
      ] as const;
    };

    const historyItems = await loadHistoryFromDirectoryHandle({
      entries,
      getFileHandle: vi.fn().mockResolvedValue({
        getFile: vi.fn().mockResolvedValue(new Blob(['image'], { type: 'image/png' })),
      }),
    } as any);

    expect(historyItems).toHaveLength(1);
    expect(historyItems[0].id).toBe('history-2');
  });
});
