import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

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

    expect(await screen.findByText('V2.0.02')).toBeInTheDocument();
    expect(screen.queryByText('5000')).not.toBeInTheDocument();
  });
});
