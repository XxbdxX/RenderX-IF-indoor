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
    imageBase64: 'base64-image',
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

  it('uses Vertex AI client options when provider is vertex-ai', async () => {
    const result = await generateRendering(
      {
        ...baseRequest,
        modelVersion: ModelVersion.PRO,
      },
      {
        provider: 'vertex-ai',
        apiKey: 'vertex-api-key',
        vertexProject: 'if-renderx',
        vertexLocation: 'us-central1',
      } as any,
    );

    expect(googleGenAiMock).toHaveBeenCalledWith({
      vertexai: true,
      apiKey: 'vertex-api-key',
      project: 'if-renderx',
      location: 'us-central1',
    });
    expect(result.imageUrl).toBe('data:image/png;base64,generated-image-data');
    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-3-pro-image-preview' }),
    );
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

  it('sends labeled primary and reference image parts in a stable order', async () => {
    await generateRendering(
      {
        ...baseRequest,
        referenceImages: [
          { id: '1', mimeType: 'image/jpeg', base64: 'ref-image-1' },
          { id: '2', mimeType: 'image/png', base64: 'ref-image-2' },
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
      { inlineData: { mimeType: 'image/png', data: 'base64-image' } },
      { text: expect.stringContaining('REFERENCE IMAGE 1') },
      { inlineData: { mimeType: 'image/jpeg', data: 'ref-image-1' } },
      { text: expect.stringContaining('REFERENCE IMAGE 2') },
      { inlineData: { mimeType: 'image/png', data: 'ref-image-2' } },
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
});
