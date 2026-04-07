import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ControlPanel } from './ControlPanel';
import { GenerationMode, ImageResolution, ModelVersion, RenderStyle, TimeOfDay } from '../types';

describe('ControlPanel API settings layout', () => {
  it('does not render an inline API settings block anymore', () => {
    render(
      <ControlPanel
        request={{
          imageBase64: '',
          imageMimeType: 'image/png',
          prompt: '',
          style: RenderStyle.PHOTOREALISTIC,
          timeOfDay: TimeOfDay.DAY,
          aspectRatio: '1:1',
          resolution: ImageResolution.RES_1K,
          modelVersion: ModelVersion.PRO,
          mode: GenerationMode.AUTO,
          compositionLock: false,
          schemeLock: true,
          referenceImages: [],
        }}
        setRequest={vi.fn()}
        onGenerate={vi.fn()}
        activeStandardRequests={0}
        activeHeavyRequests={0}
        hasApiAccess={true}
      />,
    );

    expect(screen.queryByText('Gemini API Key')).not.toBeInTheDocument();
  });

  it('does not show resolution coin costs anymore', () => {
    const { container } = render(
      <ControlPanel
        request={{
          imageBase64: '',
          imageMimeType: 'image/png',
          prompt: '',
          style: RenderStyle.PHOTOREALISTIC,
          timeOfDay: TimeOfDay.DAY,
          aspectRatio: '1:1',
          resolution: ImageResolution.RES_1K,
          modelVersion: ModelVersion.PRO,
          mode: GenerationMode.AUTO,
          compositionLock: false,
          schemeLock: true,
          referenceImages: [],
        }}
        setRequest={vi.fn()}
        onGenerate={vi.fn()}
        activeStandardRequests={0}
        activeHeavyRequests={0}
        hasApiAccess={true}
      />,
    );

    expect(container.querySelector('.fa-coins')).toBeNull();
  });

  it('shows the updated model labels and ids', () => {
    render(
      <ControlPanel
        request={{
          imageBase64: '',
          imageMimeType: 'image/png',
          prompt: '',
          style: RenderStyle.PHOTOREALISTIC,
          timeOfDay: TimeOfDay.DAY,
          aspectRatio: '1:1',
          resolution: ImageResolution.RES_1K,
          modelVersion: ModelVersion.PRO,
          mode: GenerationMode.AUTO,
          compositionLock: false,
          schemeLock: true,
          referenceImages: [],
        }}
        setRequest={vi.fn()}
        onGenerate={vi.fn()}
        activeStandardRequests={0}
        activeHeavyRequests={0}
        hasApiAccess={true}
      />,
    );

    expect(screen.getByText('NanoBanana PRO')).toBeInTheDocument();
    expect(screen.getByText('NanoBanana 2')).toBeInTheDocument();
    expect(screen.getByText('gemini-3-pro-image-preview')).toBeInTheDocument();
    expect(screen.getByText('gemini-3.1-flash-image-preview')).toBeInTheDocument();
  });
});
