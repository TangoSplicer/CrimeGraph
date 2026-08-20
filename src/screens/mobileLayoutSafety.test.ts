import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) => readFile(resolve(__dirname, relativePath), 'utf8');

describe('mobile system-UI overlap safeguards', () => {
  it('keeps shared graph bottom sheets above primary navigation with a constrained internal scroll area', async () => {
    const source = await readFile(resolve(__dirname, '../components/shared/BottomSheet.tsx'), 'utf8');

    expect(source).toContain('bottom-sheet-above-nav');
    expect(source).toContain('z-[60]');
    expect(source).toContain('min-h-0 flex-1 overflow-y-auto');
    expect(source).toContain('pb-safe-action');
  });

  it('uses safe modal cards for graph submenus and a safe edit action bar', async () => {
    const source = await readSource('GraphWorkspaceScreen.tsx');

    expect((source.match(/safe-modal-card/g) || []).length).toBeGreaterThanOrEqual(4);
    expect(source).toContain('aria-label="Close analysis"');
    expect(source).toContain('sticky bottom-0');
    expect(source).toContain('pb-safe-action');
  });

  it('uses safe modal frames for dashboard field and operation workflows', async () => {
    const source = await readSource('DashboardScreen.tsx');

    expect((source.match(/p-safe-modal/g) || []).length).toBeGreaterThanOrEqual(3);
    expect((source.match(/safe-modal-card/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('keeps standalone operation and entity creation actions outside scroll content and above navigation', async () => {
    const [caseSource, entitySource] = await Promise.all([
      readSource('CreateCaseScreen.tsx'),
      readSource('AddEntityScreen.tsx'),
    ]);

    for (const source of [caseSource, entitySource]) {
      expect(source).toContain('h-screen');
      expect(source).toContain('pb-safe-nav');
      expect(source).toContain('overflow-y-auto p-4 pb-36');
      expect(source).toContain('shrink-0 border-t');
      expect(source).toContain('min-h-14 w-full');
    }
  });
});
