
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
import { getMissingApiConfigMessage } from './apiConfig';

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
