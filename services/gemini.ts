
import { GoogleGenAI } from "@google/genai";
import {
  ApiProvider,
  ApiProviderConfig,
  GenerationMode,
  GenerationRequest,
  GenerationResult,
  ModelVersion,
  RenderStyle,
  ThinkingMode,
  TimeOfDay,
} from "../types";
import { IMAGE_2_DEFAULT_MODEL, getMissingApiConfigMessage } from './apiConfig';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isOverloaded503 = (error: any): boolean => {
  const code = error?.error?.code ?? error?.code;
  const status = error?.error?.status ?? error?.status;
  const message = String(error?.error?.message ?? error?.message ?? error ?? '');
  return (
    code === 503 ||
    status === 'UNAVAILABLE' ||
    message.includes('503') ||
    message.toLowerCase().includes('high demand') ||
    message.toUpperCase().includes('UNAVAILABLE')
  );
};

const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
};

const getFileExtension = (mimeType: string): string => {
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('webp')) return 'webp';
  return 'png';
};

const IMAGE_2_MAX_PROXY_IMAGE_BYTES = 2.5 * 1024 * 1024;
const IMAGE_2_COMPRESSION_DIMENSIONS = [2048, 1600, 1280];
const IMAGE_2_COMPRESSION_QUALITIES = [0.86, 0.78, 0.7];

const estimateBase64ByteLength = (base64: string): number => {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
};

const loadImageElement = (dataUrl: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Unable to read Image-2 source image.'));
  image.src = dataUrl;
});

const canvasToBlob = (canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob | null> => {
  return new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));
};

const blobToBase64Data = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result || '');
    const match = result.match(/^data:.+;base64,(.+)$/);
    if (match) {
      resolve(match[1]);
      return;
    }
    reject(new Error('Unable to encode compressed Image-2 source image.'));
  };
  reader.onerror = () => reject(new Error('Unable to encode compressed Image-2 source image.'));
  reader.readAsDataURL(blob);
});

const compressImageForImage2Proxy = async (
  base64: string,
  mimeType: string,
): Promise<{ base64: string; mimeType: string }> => {
  if (estimateBase64ByteLength(base64) <= IMAGE_2_MAX_PROXY_IMAGE_BYTES) {
    return { base64, mimeType };
  }

  try {
    const image = await loadImageElement(`data:${mimeType};base64,${base64}`);
    let bestBlob: Blob | null = null;

    for (const maxDimension of IMAGE_2_COMPRESSION_DIMENSIONS) {
      const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) continue;
      context.drawImage(image, 0, 0, width, height);

      for (const quality of IMAGE_2_COMPRESSION_QUALITIES) {
        const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
        if (!blob) continue;
        bestBlob = !bestBlob || blob.size < bestBlob.size ? blob : bestBlob;
        if (blob.size <= IMAGE_2_MAX_PROXY_IMAGE_BYTES) {
          return { base64: await blobToBase64Data(blob), mimeType: 'image/jpeg' };
        }
      }
    }

    if (bestBlob) {
      return { base64: await blobToBase64Data(bestBlob), mimeType: 'image/jpeg' };
    }
  } catch {
    return { base64, mimeType };
  }

  return { base64, mimeType };
};

const buildOpenAiImageSize = (request: GenerationRequest): string => {
  if (!request.aspectRatio || request.aspectRatio === 'free' || request.aspectRatio === 'original') {
    return 'auto';
  }
  if (request.aspectRatio === '16:9' || request.aspectRatio === '4:3') {
    return '1536x1024';
  }
  if (request.aspectRatio === '9:16' || request.aspectRatio === '3:4') {
    return '1024x1536';
  }
  return '1024x1024';
};

const stripTrailingSlashes = (value: string): string => value.replace(/\/+$/, '');

const getImage2EditEndpoint = (baseUrl: string): string => {
  const normalizedBaseUrl = stripTrailingSlashes(baseUrl.trim());
  return normalizedBaseUrl.endsWith('/images/edits')
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/images/edits`;
};

const getImage2GenerationEndpoint = (baseUrl: string): string => {
  const normalizedBaseUrl = stripTrailingSlashes(baseUrl.trim());
  if (normalizedBaseUrl.endsWith('/images/generations')) return normalizedBaseUrl;
  if (normalizedBaseUrl.endsWith('/images/edits')) {
    return normalizedBaseUrl.replace(/\/images\/edits$/, '/images/generations');
  }
  return `${normalizedBaseUrl}/images/generations`;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
};

const isImageUrl = (value: string): boolean => {
  return value.startsWith('data:image/') || /^https?:\/\//i.test(value);
};

const findOpenAiImageValue = (value: any): { base64?: string; url?: string } | null => {
  if (!value) return null;

  if (typeof value === 'string') {
    if (isImageUrl(value)) return { url: value };
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findOpenAiImageValue(item);
      if (result) return result;
    }
    return null;
  }

  if (typeof value !== 'object') return null;

  const directBase64 =
    value.b64_json ||
    value.base64 ||
    value.image_base64 ||
    value.imageBase64 ||
    (typeof value.image === 'string' && !isImageUrl(value.image) ? value.image : '') ||
    (typeof value.result === 'string' && !isImageUrl(value.result) ? value.result : '');
  if (directBase64) return { base64: directBase64 };

  const directUrl =
    value.url ||
    value.image_url ||
    value.imageUrl ||
    (typeof value.image === 'string' && isImageUrl(value.image) ? value.image : '') ||
    (typeof value.result === 'string' && isImageUrl(value.result) ? value.result : '');
  if (directUrl) {
    if (typeof directUrl === 'string') return { url: directUrl };
    const nestedUrl = findOpenAiImageValue(directUrl);
    if (nestedUrl) return nestedUrl;
  }

  const knownContainers = [
    value.data,
    value.images,
    value.output,
    value.content,
    value.message?.content,
    value.choices,
  ];
  for (const container of knownContainers) {
    const result = findOpenAiImageValue(container);
    if (result) return result;
  }

  return null;
};

const summarizePayload = (payload: any, fallbackText: string): string => {
  const source = payload ? JSON.stringify(payload) : fallbackText;
  return source.length > 500 ? `${source.slice(0, 500)}...` : source;
};

const normalizeOpenAiImageResponse = async (response: Response): Promise<GenerationResult> => {
  const contentType = response.headers?.get?.('content-type') || '';

  if (response.ok && contentType.toLowerCase().startsWith('image/')) {
    const base64Image = arrayBufferToBase64(await response.arrayBuffer());
    return { imageUrl: `data:${contentType.split(';')[0]};base64,${base64Image}` };
  }

  const responseText = await response.text();
  let payload: any = null;

  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (response.status === 504 || responseText.includes('FUNCTION_INVOCATION_TIMEOUT')) {
      throw new Error('Image-2 请求超时：中转站生成时间超过 Vercel 函数等待上限。请先用自由比例/1K 或无参考图重试，或稍后再试。');
    }

    const message =
      payload?.error?.message ||
      (typeof payload?.error === 'string' ? payload.error : '') ||
      payload?.message ||
      responseText ||
      `Image-2 request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (payload?.error) {
    const message =
      payload.error?.message ||
      (typeof payload.error === 'string' ? payload.error : '') ||
      payload.message ||
      'Image-2 request failed.';
    throw new Error(message);
  }

  const imageValue = findOpenAiImageValue(payload);
  const base64Image = imageValue?.base64;
  const imageUrl = imageValue?.url;

  if (base64Image) {
    return { imageUrl: `data:image/png;base64,${base64Image}` };
  }
  if (imageUrl) {
    return { imageUrl };
  }

  throw new Error(`Image-2 returned no image data. Response: ${summarizePayload(payload, responseText)}`);
};

const generateImage2Rendering = async (
  request: GenerationRequest,
  apiConfig: ApiProviderConfig,
  prompt: string,
): Promise<GenerationResult> => {
  const apiKey = apiConfig.apiKey.trim();
  const baseUrl = apiConfig.baseUrl?.trim();
  if (!apiKey || !baseUrl) {
    throw new Error(getMissingApiConfigMessage(apiConfig.provider));
  }

  const formData = new FormData();
  const model = apiConfig.imageModel?.trim() || IMAGE_2_DEFAULT_MODEL;
  const size = buildOpenAiImageSize(request);
  const hasSourceImage = Boolean(request.imageBase64 && request.imageMimeType);

  if (!hasSourceImage) {
    const response = await fetch(getImage2GenerationEndpoint(baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, prompt, size }),
    });
    const result = await normalizeOpenAiImageResponse(response);
    return { ...result, modelUsed: model };
  }

  formData.append('model', model);
  formData.append('prompt', prompt);
  formData.append('size', size);
  const primaryImage = await compressImageForImage2Proxy(request.imageBase64, request.imageMimeType);
  formData.append(
    'image',
    base64ToBlob(primaryImage.base64, primaryImage.mimeType),
    `primary.${getFileExtension(primaryImage.mimeType)}`,
  );

  for (const ref of request.referenceImages || []) {
    const referenceImage = await compressImageForImage2Proxy(ref.base64, ref.mimeType);
    formData.append(
      'image',
      base64ToBlob(referenceImage.base64, referenceImage.mimeType),
      `reference-${ref.id}.${getFileExtension(referenceImage.mimeType)}`,
    );
  }

  const response = await fetch(getImage2EditEndpoint(baseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });
  const result = await normalizeOpenAiImageResponse(response);
  return { ...result, modelUsed: model };
};

export const generateRendering = async (request: GenerationRequest, apiConfig: ApiProviderConfig): Promise<GenerationResult> => {
  const apiKey = apiConfig.apiKey.trim();
  if (!apiKey) {
    throw new Error(getMissingApiConfigMessage(apiConfig.provider));
  }

  const isFreeMode = request.mode === GenerationMode.FREE;

  // 1. Base Role & Quality Assurance (Global)
  const baseSystemInstruction = `
    [ROLE]
    You are a Lead 3D Artist at a world-class Architectural Visualization studio (similar to SAN, Mir, or The Boundary).
    
    [QUALITY STANDARDS - "THE RENDER LOOK"]
    - Output Style: High-End Architectural Visualization (CGI), NOT casual photography.
    - Aesthetic: Idealized reality. Perfect composition, curated lighting, artistic color grading.
    - Technical: V-Ray / Corona Renderer quality. Crisp details, perfect global illumination, high-quality PBR materials.
    - Atmosphere: Emotional, atmospheric, and commercially persuasive.
    - Geometry: STRICTLY PRESERVE the main architectural geometry and design intent.
  `;

  let modeInstruction = "";
  let styleInstruction = "";
  
  // 2. Mode-Specific Logic
  if (request.isUpscale) {
      modeInstruction = `
        [TASK: UPSCALE & RESTORATION]
        - GOAL: Increase resolution to 4K with extremely subtle enhancement.
        - PRIORITY: The output must look almost identical to the input at a glance.
        - ENHANCE: Only apply mild edge cleanup, mild anti-artifact restoration, and very light clarity recovery.
        - CONSTRAINT: Do NOT redesign, add, remove, or move architectural elements. Do NOT crop or change viewpoint.
        - CONSTRAINT: Avoid painterly reinterpretation, texture invention, relighting, recoloring, or stylistic changes.
        - CONSTRAINT: If enhancement would noticeably alter the drawing, prefer leaving the original appearance unchanged.
      `;
  } else if (request.mode === GenerationMode.FREE) {
      modeInstruction = `
        [TASK: DIRECT INSTRUCTION]
        - GOAL: Execute the user's prompt exactly.
        - RULE: Do not add any style, rendering, lighting, material, atmosphere, composition, or commercial assumptions unless the user explicitly asks for them.
        - RULE: Use the provided images only as user input context. Do not reinterpret them toward any default visual target.
        - PRIORITY: The user's prompt is the only instruction source.
      `;
      styleInstruction = '';
  } else if (request.mode === GenerationMode.AUTO) {
      modeInstruction = `
        [TASK: AI ART DIRECTION (AUTO)]
        - GOAL: Create a "Masterpiece" Marketing Rendering.
        - AESTHETIC: High-End CGI (Computer Generated Imagery). Clean, sharp, and perfectly lit.
        - ANALYSIS: Analyze the input geometry. Identify the building type (Office, Retail, Cultural, Residential) and apply the most commercially viable atmosphere.
        - COMPOSITION: The architecture is the HERO. Use professional architectural lens shifts (2-point perspective) where possible.
        - ATMOSPHERE: "The Golden Hour" or "Blue Hour" with warm interior lights. Make it look expensive.
      `;
  } else {
      modeInstruction = `
        [TASK: MANUAL CONFIGURATION]
        - GOAL: Execute specific style and lighting parameters while maintaining professional rendering quality.
      `;
      
      let s = "";
      switch (request.style) {
        case RenderStyle.PHOTOREALISTIC: s = "Style: Hyper-Realistic CGI. Sharp focus, high detail, V-Ray style."; break;
        case RenderStyle.COMMERCIAL: s = "Style: Commercial Real Estate Rendering. Vibrant, bustling, blue skies, high saturation."; break;
        case RenderStyle.MINIMALIST: s = "Style: Minimalist ArchViz. Desaturated, clean lines, soft diffused light, museum quality."; break;
        case RenderStyle.WATERCOLOR: s = "Style: Digital Watercolor Visualization. Artistic, paper texture overlay, soft edges, conceptual."; break;
        case RenderStyle.SCANDINAVIAN: s = "Style: Nordic ArchViz. Soft northern light, pale woods, fog, organic connection to nature. [CONSTRAINT]: Do NOT add trees/greenery to high-rise rooftops if not present in input."; break;
        case RenderStyle.BIOPHILIC: s = "Style: Biophilic Design. Lush vertical greenery, sustainable atmosphere, dappled sunlight."; break;
        default: s = "Style: Professional Architectural Visualization.";
      }
      
      let t = "";
      switch (request.timeOfDay) {
        case TimeOfDay.MORNING: t = "Time: Early Morning. Cool crisp air, long soft shadows, volumetric fog."; break;
        case TimeOfDay.DAY: t = "Time: Mid-Day. Bright, high-contrast, clear blue sky, sharp shadows."; break;
        case TimeOfDay.OVERCAST: t = "Time: Overcast. Diffused soft light, even exposure, no harsh shadows (good for material clarity)."; break;
        case TimeOfDay.LATE_AFTERNOON: t = "Time: Golden Hour. Warm directional sunlight, cinematic rim lighting."; break;
        case TimeOfDay.DUSK: t = "Time: Blue Hour. Interior lights ON (warm), exterior sky (deep blue), dramatic contrast."; break;
        case TimeOfDay.NIGHT: t = "Time: Night. Dark sky, focus on artificial architectural lighting and spill light."; break;
        default: t = "Time: Daytime.";
      }
      styleInstruction = `${s}\n${t}`;

      if (request.commercialEnhancement) {
          styleInstruction += `\n[ENHANCEMENT: COMMERCIAL ATMOSPHERE]
          - STYLE: Vibrant, bustling commercial real estate rendering.
          - ATMOSPHERE: High saturation, blue skies, busy street life.
          - ACTIVITY: Add shopping bags, people interacting, cafe seating to show a thriving commercial environment.`;
      }
      if (request.landscapeEnhancement) {
          styleInstruction += `\n[ENHANCEMENT: LANDSCAPE & GREENERY]
          - STYLE: Biophilic Design & Eco-Friendly.
          - VEGETATION: Add lush vertical greenery, roof gardens, and dense foreground plants.
          - NATURE: Integrate building with nature. Soften architectural edges with leaves/vines.`;
      }
  }

  // 3. Reference Images Logic
  let refInstruction = "";
  if (request.referenceImages && request.referenceImages.length > 0) {
      let refDetails = "";
      request.referenceImages.forEach(ref => {
        refDetails += `- Reference Image ID ${ref.id}: Use as source for Materials/Vibe.\n`;
      });
      const userRefNote = request.referenceNote ? `User Note on Refs: "${request.referenceNote}"` : "";

      refInstruction = isFreeMode
        ? `
          [REFERENCE GUIDANCE]
          The user has provided additional reference images.
          ${refDetails}
          ${userRefNote}
          - INSTRUCTION: Use these references only when they help satisfy the user's prompt. Do NOT replace the primary source image with any reference image.
        `
        : `
          [REFERENCE GUIDANCE]
          The user has provided reference images.
          ${refDetails}
          ${userRefNote}
          - INSTRUCTION: Transfer the *mood, material palette, and lighting* of the references to the input geometry. Do NOT copy the geometry of the references.
        `;
  }

  // 4. Locking Logic (Crucial for Architects - PS Overlay)
  let lockInstruction = "";
  if (!request.isUpscale && request.mode !== GenerationMode.FREE) {
      if (request.compositionLock) {
          lockInstruction += `
            [CONSTRAINT: COMPOSITION LOCKED - STRICT OVERLAY]
            - CRITICAL: The output MUST align perfectly with the Input Image 1 for Photoshop overlay.
            - CAMERA: DO NOT CHANGE camera angle, focal length, or perspective.
            - CROP: DO NOT CROP the image. The boundaries must match the input exactly.
            - SCALING: Maintain the exact subject scale.
          `;
      } else {
          lockInstruction += `
            [CONSTRAINT: COMPOSITION UNLOCKED - ACTIVE OPTIMIZATION]
            - ACTION: You are the photographer. Improve the view.
            - IMPROVE: If the input has too much empty sky or ground, ZOOM IN to fill the frame with architecture.
            - PERSPECTIVE: Fix awkward angles. Use 2-point perspective logic (vertical lines should be vertical).
            - FRAMING: Ensure the building feels grand and dominant.
          `;
      }
      
      if (request.schemeLock) {
          lockInstruction += `
            [CONSTRAINT: SCHEME FROZEN - STRICT TRACING]
            - RULE: You are a TEXTURE ENGINE, not a designer.
            - GEOMETRY: STRICTLY FROZEN. Do not add, remove, or modify any structural elements.
            - WINDOWS/MULLIONS: Keep exact divisions as shown in input.
            - ROOF/SILHOUETTE: Must match the input sketch exactly.
            - PROHIBITED: Do NOT add balconies, overhangs, or extra floors that are not drawn.
            - ALLOWED: Only apply realistic materials (glass, concrete, metal) to the EXISTING forms.
          `;
      } else {
          lockInstruction += `
            [CONSTRAINT: SCHEME OPTIMIZATION & COMPLETION]
            - ACTION: Act as a Senior Design Architect.
            - COMPLETION: If the input sketch is unfinished, loose, or vague, ACTIVELY FINISH IT. Add necessary details (railings, mullions, frames) that are missing.
            - CORRECTION: If the input has awkward proportions or bad geometry, FIX IT. Make it look professional and structurally sound.
            - ENHANCEMENT: Add depth to facades. Create high-quality curtain walls, louvers, or cladding systems where the sketch is blank.
          `;
      }
  }

  // 5. Commercial Activation Logic
  const commercialLogic = `
    [COMMERCIAL ACTIVATION]
    - GROUND FLOOR: Maximize transparency. Show interior activity, retail displays, and warm lighting spilling out.
    - ENTRANCES: Make main entrances inviting and bright.
    - TERRACES/ROOFTOPS: If visible, populate with greenery, furniture, and people suggestions to show scale and life.
    - GLASS: Glass must not be opaque. It should show reflections of the environment AND hints of the interior.
  `;

  // 6. User Prompt Handling
  const userPrompt = request.prompt ? `[USER REQUEST]: "${request.prompt}"` : "";

  // 7. Final Assembly
  const finalPrompt = isFreeMode
    ? `
      ${modeInstruction}

      ${refInstruction}

      ${userPrompt}

      [EXECUTION STEP]
      Execute the user's request using the provided images and text only.
    `
    : `
      ${baseSystemInstruction}
      
      ${modeInstruction}
      
      ${styleInstruction}
      
      ${lockInstruction}

      ${commercialLogic}
      
      ${refInstruction}
      
      ${userPrompt}
      
      [EXECUTION STEP]
      Transform the primary source image (the sketch/model/base design) into the final High-End Architectural Rendering.
    `;

  try {
    const parts: any[] = [
      {
        text: `
          [PRIMARY SOURCE IMAGE]
          - This is the main architectural source image.
          - Preserve its geometry, composition, and design intent unless the task explicitly allows optimization.
          - Do NOT replace this image with any reference image.
        `,
      },
      { inlineData: { mimeType: request.imageMimeType, data: request.imageBase64 } },
    ];

    if (request.referenceImages) {
        request.referenceImages.forEach(ref => {
            parts.push({
              text: `
                [REFERENCE IMAGE ${ref.id}]
                - This image is for mood, material palette, lighting, and atmosphere reference only.
                - Never use it as the base geometry or composition source.
              `,
            });
            parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.base64 } });
        });
    }
    
    parts.push({ text: finalPrompt });

    // Determine Model
    const proModelId = 'gemini-3-pro-image-preview';
    const flashModelId = 'gemini-3.1-flash-image-preview';
    const preferredModelId = request.modelVersion === ModelVersion.PRO ? proModelId : flashModelId;

    if (apiConfig.provider === ApiProvider.IMAGE_2) {
      return await generateImage2Rendering(request, apiConfig, finalPrompt);
    }

    const ai = new GoogleGenAI({
      apiKey,
      ...(apiConfig.provider === ApiProvider.YORO_GEMINI && apiConfig.baseUrl?.trim()
        ? {
            httpOptions: {
              baseUrl: apiConfig.baseUrl.trim(),
            },
          }
        : {}),
    });
    
    // Prepare Config
    const imageConfig: any = {};
    
    if (request.aspectRatio && request.aspectRatio !== 'free') {
        imageConfig.aspectRatio = request.aspectRatio;
    }

    // imageSize is supported for both gemini-3-pro-image-preview and gemini-3.1-flash-image-preview
    imageConfig.imageSize = request.isUpscale ? "4K" : request.resolution;

    const requestConfig: any = {
      imageConfig: imageConfig,
    };

    if (request.modelVersion === ModelVersion.FLASH) {
      if (request.thinkingMode === ThinkingMode.FAST) {
        requestConfig.thinkingConfig = { thinkingLevel: 'minimal' };
      } else if (request.thinkingMode === ThinkingMode.DEEP) {
        requestConfig.thinkingConfig = { thinkingLevel: 'high' };
      }
    }

    const generateOnce = async (model: string) => {
      return ai.models.generateContent({
        model,
        contents: { parts },
        config: requestConfig,
      });
    };

    const generateWithRetry = async (model: string) => {
      const retryDelaysMs = [600, 1600, 3200];
      let lastErr: any;
      for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
        try {
          return await generateOnce(model);
        } catch (err: any) {
          lastErr = err;
          if (!isOverloaded503(err) || attempt === retryDelaysMs.length) break;
          await sleep(retryDelaysMs[attempt]);
        }
      }
      throw lastErr;
    };

    const response: any = await generateWithRetry(preferredModelId);
    const modelUsed = preferredModelId;

    let generatedImageUrl = "";
    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          generatedImageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }
    }
    
    if (!generatedImageUrl) throw new Error("Model returned no image data.");
    return { imageUrl: generatedImageUrl, modelUsed };

  } catch (error) {
    console.error("GenAI Error:", error);
    throw error;
  }
};
