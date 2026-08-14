import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '../../stores/authStore';
import { BottomTabBar } from './BottomTabBar';

beforeEach(() => {
  useAuthStore.setState({
    currentUser: { id: 'admin_001', badge: 'ADMIN', name: 'Master Admin', role: 'admin' },
  });
});

describe('BottomTabBar', () => {
  it('renders the always-visible primary destinations', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/']}>
        <BottomTabBar />
      </MemoryRouter>,
    );

    expect(markup).toContain('HOME');
    expect(markup).toContain('GRAPH');
    expect(markup).toContain('SETTINGS');
  });

  it('uses equal-share flex sizing rather than full-width non-shrinking buttons', async () => {
    const source = await readFile(resolve(__dirname, 'BottomTabBar.tsx'), 'utf8');

    expect(source).toContain('flex flex-1 min-w-0 flex-col');
    expect(source).not.toContain('w-full h-16 shrink-0');
  });
});
