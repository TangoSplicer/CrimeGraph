import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('AddNodeScreen mobile deployment action', () => {
  it('keeps the deploy action outside the scrollable template content with safe-area clearance', async () => {
    const source = await readFile(resolve(__dirname, 'AddNodeScreen.tsx'), 'utf8');

    expect(source).toContain('<form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">');
    expect(source).toContain('className="flex-1 overflow-y-auto p-4 space-y-6 pb-6"');
    expect(source).toContain('shrink-0 border-t border-[#252a3a] bg-[#14171f]');
    expect(source).toContain('pb-[max(0.75rem,env(safe-area-inset-bottom))]');
    expect(source).toContain('type="submit"');
    expect(source).not.toContain('onClick={handleSubmit}');
  });

  it('surfaces a node-deployment failure inline instead of silently returning to the graph', async () => {
    const source = await readFile(resolve(__dirname, 'AddNodeScreen.tsx'), 'utf8');

    expect(source).toContain("setDeployMessage(error instanceof Error ? error.message : 'The node could not be deployed. No intelligence record was created.')");
    expect(source).toContain('role="alert"');
  });
});
