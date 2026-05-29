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

  it('posts Image-2 requests to the configured OpenAI-compatible images edits endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({
        data: [{ b64_json: 'image-2-data' }],
      })),
    } as any);

    const result = await generateRendering(
      {
        ...baseRequest,
        modelVersion: ModelVersion.FLASH,
        referenceImages: [{ id: '1', mimeType: 'image/png', base64: 'cmVmLWltYWdl' }],
      },
      {
        provider: 'image-2',
        apiKey: 'relay-api-key',
        baseUrl: 'https://relay.example.com/v1',
      } as any,
    );

    expect(result).toEqual({
      imageUrl: 'data:image/png;base64,image-2-data',
      modelUsed: 'gpt-image-2',
    });
    expect(googleGenAiMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://relay.example.com/v1/images/edits',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer relay-api-key',
        },
        body: expect.any(FormData),
      }),
    );

    const body = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(body.get('model')).toBe('gpt-image-2');
    expect(body.get('size')).toBe('1024x1024');
    expect(body.getAll('image')).toHaveLength(2);
  });

  it('posts Image-2 text-only requests as JSON for free mode generations', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({
        data: [{ b64_json: 'text-image-data' }],
      })),
    } as any);

    const result = await generateRendering(
      {
        ...baseRequest,
        imageBase64: '',
        imageMimeType: '',
        prompt: 'a quiet gallery interior',
        mode: GenerationMode.FREE,
        aspectRatio: 'free',
      },
      {
        provider: 'image-2',
        apiKey: 'relay-api-key',
        baseUrl: 'https://relay.example.com/v1',
      } as any,
    );

    expect(result).toEqual({
      imageUrl: 'data:image/png;base64,text-image-data',
      modelUsed: 'gpt-image-2',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://relay.example.com/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer relay-api-key',
        },
        body: expect.any(String),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toMatchObject({
      model: 'gpt-image-2',
      prompt: expect.stringContaining('a quiet gallery interior'),
      size: 'auto',
    });
  });

  it('reads Image-2 image data from output result responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi.fn().mockResolvedValue(JSON.stringify({
        output: [
          {
            type: 'image_generation_call',
            result: 'output-result-image-data',
          },
        ],
      })),
    } as any);

    const result = await generateRendering(
      {
        ...baseRequest,
        imageBase64: '',
        imageMimeType: '',
        prompt: 'a quiet gallery interior',
        mode: GenerationMode.FREE,
        aspectRatio: 'free',
      },
      {
        provider: 'image-2',
        apiKey: 'relay-api-key',
        baseUrl: 'https://relay.example.com/v1',
      } as any,
    );

    expect(result.imageUrl).toBe('data:image/png;base64,output-result-image-data');
  });

  it('surfaces Image-2 errors even when the relay returns status 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi.fn().mockResolvedValue(JSON.stringify({
        error: {
          message: 'model gpt-image-2 is not enabled',
        },
      })),
    } as any);

    await expect(generateRendering(
      {
        ...baseRequest,
        prompt: 'render this lobby',
      },
      {
        provider: 'image-2',
        apiKey: 'relay-api-key',
        baseUrl: 'https://relay.example.com/v1',
      } as any,
    )).rejects.toThrow('model gpt-image-2 is not enabled');
  });

  it('shows a specific message for Vercel Image-2 proxy timeouts', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 504,
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: vi.fn().mockResolvedValue('FUNCTION_INVOCATION_TIMEOUT'),
    } as any);

    await expect(generateRendering(
      {
        ...baseRequest,
        prompt: 'render this lobby',
      },
      {
        provider: 'image-2',
        apiKey: 'relay-api-key',
        baseUrl: 'https://relay.example.com/v1',
      } as any,
    )).rejects.toThrow('Image-2 请求超时');
  });

  it('shows a specific message when direct Image-2 relay requests are disconnected', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(generateRendering(
      {
        ...baseRequest,
        prompt: 'render this lobby',
      },
      {
        provider: 'image-2',
        apiKey: 'relay-api-key',
        baseUrl: 'https://relay.example.com/v1',
      } as any,
    )).rejects.toThrow('Image-2 中转站连接失败');
  });

  it('reads direct image responses from Image-2 relays', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      new Uint8Array([1, 2, 3]),
      {
        status: 200,
        headers: { 'content-type': 'image/png' },
      },
    ) as any);

    const result = await generateRendering(
      {
        ...baseRequest,
        imageBase64: '',
        imageMimeType: '',
        prompt: 'a quiet gallery interior',
        mode: GenerationMode.FREE,
        aspectRatio: 'free',
      },
      {
        provider: 'image-2',
        apiKey: 'relay-api-key',
        baseUrl: 'https://relay.example.com/v1',
      } as any,
    );

    expect(result.imageUrl).toBe('data:image/png;base64,AQID');
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
      { inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' } },
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
