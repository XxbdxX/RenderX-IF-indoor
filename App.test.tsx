import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { getHistoryFromDb } from './services/historyDb';

vi.mock('./services/historyDb', () => ({
  getHistoryFromDb: vi.fn().mockResolvedValue([]),
  saveHistoryItemToDb: vi.fn(),
}));

vi.mock('./services/gemini', () => ({
  generateRendering: vi.fn(),
}));

describe('App API settings entry', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a floating API settings trigger', async () => {
    render(<App />);

    expect(await screen.findByRole('button', { name: '打开 API 设置' })).toBeInTheDocument();
  });

  it('auto-opens the API settings panel when no saved config exists', async () => {
    render(<App />);

    expect(await screen.findByRole('dialog', { name: 'API 设置面板' })).toBeInTheDocument();
  });

  it('shows the current version and no longer renders a credit balance', async () => {
    render(<App />);

    expect(await screen.findByText('V2.0.04')).toBeInTheDocument();
    expect(screen.queryByText('5000')).not.toBeInTheDocument();
  });

  it('removes the old hero marketing sentence', async () => {
    render(<App />);

    expect(screen.queryByText('为职业建筑师打造。内嵌 NanoBanana Pro 引擎，将 AI 能力内嵌实战工作流。')).not.toBeInTheDocument();
  });

  it('closes the history drawer when clicking the backdrop', async () => {
    vi.mocked(getHistoryFromDb).mockResolvedValueOnce([
      {
        id: 'history-1',
        timestamp: Date.now(),
        imageUrl: 'data:image/png;base64,AAAA',
        style: 'Photorealistic',
        prompt: 'history item',
        mode: 'Manual',
      } as any,
    ]);
    localStorage.setItem('renderx_api_config', JSON.stringify({ provider: 'google-ai-studio', apiKey: 'demo-key' }));
    const user = userEvent.setup();

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /方案库/i }));
    expect(await screen.findByText('方案画廊')).toBeInTheDocument();

    await user.click(screen.getByTestId('history-backdrop'));
    expect(screen.queryByText('方案画廊')).not.toBeInTheDocument();
  });

  it('shows model and preserved render parameters in history cards', async () => {
    vi.mocked(getHistoryFromDb).mockResolvedValueOnce([
      {
        id: 'history-2',
        timestamp: Date.now(),
        imageUrl: 'data:image/png;base64,AAAA',
        style: 'Photorealistic',
        prompt: 'history item with params',
        mode: 'Auto',
        isAuto: true,
        resolution: '2K',
        modelVersion: 'Pro',
        modelId: 'gemini-3-pro-image-preview',
        aspectRatio: '16:9',
        thinkingMode: 'deep',
        timeOfDay: 'Dusk',
        compositionLock: true,
        schemeLock: false,
        commercialEnhancement: true,
      } as any,
    ]);
    localStorage.setItem('renderx_api_config', JSON.stringify({ provider: 'google-ai-studio', apiKey: 'demo-key' }));
    const user = userEvent.setup();

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /方案库/i }));

    expect(await screen.findByText('NanoBanana PRO')).toBeInTheDocument();
    expect(screen.getByText('2K')).toBeInTheDocument();
    expect(screen.getByText('16:9')).toBeInTheDocument();
    expect(screen.getByText('高思考')).toBeInTheDocument();
    expect(screen.getByText('黄昏')).toBeInTheDocument();
    expect(screen.getByText('构图锁定')).toBeInTheDocument();
    expect(screen.getByText('商业增强')).toBeInTheDocument();
    expect(screen.getByText('gemini-3-pro-image-preview')).toBeInTheDocument();
  });

  it('auto-hides success messages after five seconds', async () => {
    vi.useFakeTimers();

    render(<App />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.change(screen.getByPlaceholderText('粘贴 AI Studio API Key'), { target: { value: 'demo-key' } });
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }));

    expect(screen.getByText('AI Studio API 已保存到本地浏览器')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByText('AI Studio API 已保存到本地浏览器')).not.toBeInTheDocument();
  });
});
