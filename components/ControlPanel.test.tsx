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
  aspectRatio: 'original',
  resolution: ImageResolution.RES_2K,
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
      apiConfigs={{
        [ApiProvider.AI_STUDIO]: {
          provider: ApiProvider.AI_STUDIO,
          apiKey: 'banana-key',
        } as any,
        [ApiProvider.IMAGE_2]: {
          provider: ApiProvider.IMAGE_2,
          apiKey: 'image-key',
          baseUrl: 'https://relay.example.com/v1',
          imageModel: 'gpt-image-2',
        } as any,
      }}
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
    expect(screen.getByRole('button', { name: '切换渲染通道' })).toHaveTextContent('NanoBanana');
    expect(screen.getByText('PRO · 2K · 原图 · 深度')).toBeInTheDocument();
    expect(screen.queryByText('NanoBanana PRO')).not.toBeInTheDocument();
  });

  it('calls the provider toggle from the render settings header', () => {
    const onToggleImageProvider = vi.fn();

    render(
      <ControlPanel
        request={createRequest() as any}
        setRequest={vi.fn()}
        onGenerate={vi.fn()}
        activeStandardRequests={0}
        activeHeavyRequests={0}
        hasApiAccess={true}
        apiProvider={ApiProvider.AI_STUDIO}
        apiConfigs={{
          [ApiProvider.AI_STUDIO]: {
            provider: ApiProvider.AI_STUDIO,
            apiKey: 'banana-key',
          } as any,
          [ApiProvider.IMAGE_2]: {
            provider: ApiProvider.IMAGE_2,
            apiKey: 'image-key',
            baseUrl: 'https://relay.example.com/v1',
            imageModel: 'gpt-image-2',
          } as any,
        }}
        onToggleImageProvider={onToggleImageProvider}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '切换渲染通道' }));

    expect(onToggleImageProvider).toHaveBeenCalledTimes(1);
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
        imageModel="gpt-image-2"
        apiConfigs={{
          [ApiProvider.AI_STUDIO]: {
            provider: ApiProvider.AI_STUDIO,
            apiKey: 'banana-key',
          } as any,
          [ApiProvider.IMAGE_2]: {
            provider: ApiProvider.IMAGE_2,
            apiKey: 'image-key',
            baseUrl: 'https://relay.example.com/v1',
            imageModel: 'gpt-image-2',
          } as any,
        }}
      />,
    );

    expect(screen.getByRole('button', { name: '切换渲染通道' })).toHaveTextContent('Image-2');
    expect(screen.getByText('gpt-image-2 · 2K · 原图')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '展开渲染设置' }));

    expect(screen.getAllByText('Image-2').length).toBeGreaterThan(0);
    expect(screen.getByText('当前 provider 使用 API 设置里的 Model 字段，NanoBanana 选项不会参与请求。')).toBeInTheDocument();
    expect(screen.queryByText('NanoBanana PRO')).not.toBeInTheDocument();
    expect(screen.queryByText('NanoBanana 2')).not.toBeInTheDocument();
  });
});
