import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ControlPanel } from './ControlPanel';
import { ApiProvider, GenerationMode, ImageResolution, ModelVersion, RenderStyle, TimeOfDay } from '../types';

const createRequest = (overrides: Record<string, unknown> = {}) => ({
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
  thinkingMode: 'deep',
  ...overrides,
});

const StatefulPanel = () => {
  const [request, setRequest] = useState(createRequest() as any);

  return (
    <ControlPanel
      request={request}
      setRequest={setRequest}
      onGenerate={vi.fn()}
      activeStandardRequests={0}
      activeHeavyRequests={0}
      hasApiAccess={true}
      apiProvider={ApiProvider.AI_STUDIO}
    />
  );
};

describe('ControlPanel generation settings layout', () => {
  it('does not render an inline API settings block anymore', () => {
    render(
      <ControlPanel
        request={createRequest() as any}
        setRequest={vi.fn()}
        onGenerate={vi.fn()}
        activeStandardRequests={0}
        activeHeavyRequests={0}
        hasApiAccess={true}
        apiProvider={ApiProvider.AI_STUDIO}
      />,
    );

    expect(screen.queryByText('Gemini API Key')).not.toBeInTheDocument();
  });

  it('keeps model, resolution, and aspect ratio inside a collapsed settings row', () => {
    render(<StatefulPanel />);

    expect(screen.getByRole('button', { name: '展开渲染设置' })).toBeInTheDocument();
    expect(screen.getByText('PRO · 1K · 1:1 · 深度')).toBeInTheDocument();
    expect(screen.queryByText('NanoBanana PRO')).not.toBeInTheDocument();
  });

  it('shows model, resolution, aspect ratio, and 4K when settings are expanded', () => {
    render(<StatefulPanel />);

    fireEvent.click(screen.getByRole('button', { name: '展开渲染设置' }));

    expect(screen.getByText('NanoBanana PRO')).toBeInTheDocument();
    expect(screen.getByText('NanoBanana 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '4K' })).toBeInTheDocument();
    expect(screen.getByText('16:9')).toBeInTheDocument();
  });

  it('shows fixed deep thinking for PRO and switchable thinking modes for NanoBanana 2', () => {
    render(<StatefulPanel />);

    fireEvent.click(screen.getByRole('button', { name: '展开渲染设置' }));
    expect(screen.getByText('PRO 固定高思考')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /NanoBanana 2/i }));

    expect(screen.getByRole('button', { name: '默认' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '快速' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '深入' })).toBeInTheDocument();
  });

  it('shows the active Image-2 model instead of NanoBanana choices for Image-2 provider', () => {
    render(
      <ControlPanel
        request={createRequest() as any}
        setRequest={vi.fn()}
        onGenerate={vi.fn()}
        activeStandardRequests={0}
        activeHeavyRequests={0}
        hasApiAccess={true}
        apiProvider={ApiProvider.IMAGE_2}
        imageModel="image-2"
      />,
    );

    expect(screen.getByText('image-2 · 1K · 1:1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '展开渲染设置' }));

    expect(screen.getByText('Image-2')).toBeInTheDocument();
    expect(screen.getByText('当前 provider 使用 API 设置里的 Model 字段，NanoBanana 选项不会参与请求。')).toBeInTheDocument();
    expect(screen.queryByText('NanoBanana PRO')).not.toBeInTheDocument();
    expect(screen.queryByText('NanoBanana 2')).not.toBeInTheDocument();
  });
});
