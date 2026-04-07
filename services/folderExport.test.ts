import { describe, expect, it, vi } from 'vitest';
import { GenerationMode, ImageResolution, ModelVersion, RenderStyle } from '../types';
import { buildExportFileName, saveImageToDirectoryHandle } from './folderExport';

describe('folder export helpers', () => {
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
});
