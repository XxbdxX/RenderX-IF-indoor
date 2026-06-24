import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateRendering } from './gemini';
import { GenerationMode, ImageResolution, ModelVersion, RenderStyle, TimeOfDay } from '../types';

const { generateContentMock, googleGenAiMock } = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
  googleGenAiMock: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: googleGenAiMock,
}));

describe('generateRendering provider setup', () => {
  const baseRequest = {
    imageBase64: 'aW1hZ2U=',
    imageMimeType: 'image/png',
    prompt: 'render this lobby',
    style: RenderStyle.PHOTOREALISTIC,
    timeOfDay: TimeOfDay.DAY,
    aspectRatio: '1:1',
    resolution: ImageResolution.RES_1K,
    modelVersion: ModelVersion.PRO,
    mode: GenerationMode.AUTO,
    compositionLock: false,
    schemeLock: true,
    referenceImages: [],
    thinkingMode: 'deep' as any,
  };

  beforeEach(() => {
    generateContentMock.mockReset();
    googleGenAiMock.mockReset();
    vi.restoreAllMocks();

    generateContentMock.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: { data: 'generated-image-data' },
              },
            ],
          },
        },
      ],
    });

    googleGenAiMock.mockImplementation(function mockGoogleGenAI() {
      return {
      models: {
        generateContent: generateContentMock,
      },
      };
    });
  });

  it('uses the flash image preview model when flash is selected', async () => {
    await generateRendering(
      {
        ...baseRequest,
        modelVersion: ModelVersion.FLASH,
      },
      {
        provider: 'google-ai-studio',
        apiKey: 'ai-studio-key',
      } as any,
    );

    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-3.1-flash-image-preview' }),
    );
  });

  it('passes a custom base URL when provider is yoro-gemini', async () => {
    await generateRendering(
      {
        ...baseRequest,
        modelVersion: ModelVersion.PRO,
      },
      {
        provider: 'yoro-gemini',
        apiKey: 'yoro-api-key',
        baseUrl: 'https://api.yoro.ren',
      } as any,
    );

    expect(googleGenAiMock).toHaveBeenCalledWith({
      apiKey: 'yoro-api-key',
      httpOptions: {
        baseUrl: 'https://api.yoro.ren',
      },
    });
  });

  it('does not fall back to flash when the pro model is overloaded', async () => {
    generateContentMock.mockReset();
    generateContentMock.mockRejectedValue({ message: '503 UNAVAILABLE' });

    await expect(
      generateRendering(
        {
          ...baseRequest,
          modelVersion: ModelVersion.PRO,
        },
        {
          provider: 'google-ai-studio',
          apiKey: 'ai-studio-key',
        } as any,
      ),
    ).rejects.toMatchObject({ message: '503 UNAVAILABLE' });

    expect(generateContentMock).toHaveBeenCalledTimes(4);
    expect(generateContentMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ model: 'gemini-3-pro-image-preview' }),
    );
    expect(generateContentMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-3.1-flash-image-preview' }),
    );
  }, 10000);

  it('sends labeled primary and reference image parts in a stable order', async () => {
    await generateRendering(
      {
        ...baseRequest,
        referenceImages: [
          { id: '1', mimeType: 'image/jpeg', base64: 'ref-image-1' },
          { id: '2', mimeType: 'image/png', base64: 'ref-image-b' },
        ],
        referenceNote: '图1看材质，图2看灯光',
      },
      {
        provider: 'google-ai-studio',
        apiKey: 'ai-studio-key',
      } as any,
    );

    const call = generateContentMock.mock.calls[0][0];
    expect(call.contents.parts.slice(0, 6)).toMatchObject([
      { text: expect.stringContaining('PRIMARY SOURCE IMAGE') },
      { inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' } },
      { text: expect.stringContaining('REFERENCE IMAGE 1') },
      { inlineData: { mimeType: 'image/jpeg', data: 'ref-image-1' } },
      { text: expect.stringContaining('REFERENCE IMAGE 2') },
      { inlineData: { mimeType: 'image/png', data: 'ref-image-b' } },
    ]);
    expect(call.contents.parts.at(-1)?.text).toContain('Transform the primary source image');
  });

  it('passes 4K output size for regular generation when selected', async () => {
    await generateRendering(
      {
        ...baseRequest,
        resolution: ImageResolution.RES_4K,
        modelVersion: ModelVersion.FLASH,
      },
      {
        provider: 'google-ai-studio',
        apiKey: 'ai-studio-key',
      } as any,
    );

    const call = generateContentMock.mock.calls[0][0];
    expect(call.config.imageConfig).toMatchObject({ imageSize: '4K', aspectRatio: '1:1' });
  });

  it('passes minimal thinking level when flash quick thinking is selected', async () => {
    await generateRendering(
      {
        ...baseRequest,
        modelVersion: ModelVersion.FLASH,
        thinkingMode: 'fast',
      } as any,
      {
        provider: 'google-ai-studio',
        apiKey: 'ai-studio-key',
      } as any,
    );

    const call = generateContentMock.mock.calls[0][0];
    expect(call.config.thinkingConfig).toMatchObject({ thinkingLevel: 'minimal' });
  });

  it('keeps free mode prompt free of rendering presets while retaining user instructions', async () => {
    await generateRendering(
      {
        ...baseRequest,
        mode: GenerationMode.FREE,
        prompt: 'Do not change the drawing style.',
        referenceImages: [{ id: '1', mimeType: 'image/png', base64: 'ref-image-1' }],
        referenceNote: '仅供参考',
      },
      {
        provider: 'google-ai-studio',
        apiKey: 'ai-studio-key',
      } as any,
    );

    const prompt = generateContentMock.mock.calls[0][0].contents.parts.at(-1)?.text;
    expect(prompt).toContain('Do not change the drawing style.');
    expect(prompt).toContain('Execute the user\'s request using the provided images and text only.');
    expect(prompt).toContain('Use these references only when they help satisfy the user\'s prompt.');
    expect(prompt).not.toContain('High-End Architectural Visualization');
    expect(prompt).not.toContain('V-Ray / Corona');
    expect(prompt).not.toContain('COMMERCIAL ACTIVATION');
    expect(prompt).not.toContain('High-End Architectural Rendering');
    expect(prompt).not.toContain('Transfer the *mood, material palette, and lighting*');
  });
});
