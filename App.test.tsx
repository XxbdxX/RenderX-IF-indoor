import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

    expect(await screen.findByText('V2.0.03')).toBeInTheDocument();
    expect(screen.queryByText('5000')).not.toBeInTheDocument();
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
});
