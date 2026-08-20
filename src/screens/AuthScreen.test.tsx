import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('AuthScreen biometric opt-in boundary', () => {
  it('does not import or invoke the biometric SDK during ordinary unauthenticated sign-in', async () => {
    const source = await readFile(resolve(__dirname, 'AuthScreen.tsx'), 'utf8');

    expect(source).not.toContain('@aparajita/capacitor-biometric-auth');
    expect(source).not.toContain('BiometricAuth.authenticate');
    expect(source).not.toContain('biometricLogin');
    expect(source).toContain("placeholder=\"6-DIGIT PIN\"");
  });
});
