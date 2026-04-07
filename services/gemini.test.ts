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
  });
});
