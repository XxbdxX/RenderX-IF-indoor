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
});
