import { beforeEach, describe, expect, it, vi } from 'vitest';

const preferences = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock('@capacitor/preferences', () => ({ Preferences: preferences }));

import {
  getWalkthroughSteps,
  hasCompletedWalkthrough,
  markWalkthroughComplete,
  requestRoleWalkthrough,
  roleWalkthroughEventName,
  walkthroughPreferenceKey,
} from './roleWalkthrough';

const user = (role: 'admin' | 'supervisor' | 'analyst' | 'field' | 'readonly') => ({ id: `${role}-1`, badge: `${role.toUpperCase()}-1`, name: `${role} user`, role });

describe('role-specific first-time walkthrough', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });
  });

  it('gives administrators commissioning and least-privilege provisioning guidance', () => {
    const steps = getWalkthroughSteps(user('admin'));
    expect(steps.map((step) => step.title)).toContain('Commission and protect this device');
    expect(steps.some((step) => step.boundary?.includes('Field users can work only with locally assigned operations'))).toBe(true);
  });

  it('keeps field guidance constrained to assigned operations and submitted observations', () => {
    const steps = getWalkthroughSteps(user('field'));
    expect(steps[0].boundary).toContain('cannot create, import, or pull unassigned operations');
    expect(steps.some((step) => step.title === 'Submit instead of silently changing intelligence')).toBe(true);
  });

  it('provides explainable analyst and supervisory workflow guidance without risk scoring', () => {
    for (const role of ['analyst', 'supervisor'] as const) {
      const text = getWalkthroughSteps(user(role)).flatMap((step) => [step.summary, step.action, step.boundary ?? '']).join(' ');
      expect(text).toContain('explainable');
      expect(text).toContain('person-level risk score');
    }
    expect(getWalkthroughSteps(user('analyst')).flatMap((step) => [step.summary, step.action]).join(' ')).toContain('coordinate pending-submission review with a supervisor');
  });

  it('gives read-only operators inspection and escalation guidance rather than analyst capabilities', () => {
    const text = getWalkthroughSteps(user('readonly')).flatMap((step) => [step.title, step.summary, step.action, step.boundary ?? '']).join(' ');
    expect(text).toContain('View permitted local intelligence');
    expect(text).toContain('cannot create, edit, import, export, review, pair devices, or alter system settings');
    expect(text).not.toContain('Begin in analyst casework');
  });

  it('persists guide completion locally per user and never shares it across profiles', async () => {
    preferences.set.mockResolvedValue(undefined);
    preferences.get.mockImplementation(async ({ key }: { key: string }) => ({ value: key === walkthroughPreferenceKey('admin-1') ? 'complete' : null }));
    await markWalkthroughComplete('admin-1');
    await expect(hasCompletedWalkthrough('admin-1')).resolves.toBe(true);
    await expect(hasCompletedWalkthrough('field-1')).resolves.toBe(false);
    expect(preferences.set).toHaveBeenCalledWith({ key: walkthroughPreferenceKey('admin-1'), value: 'complete' });
  });

  it('uses local storage only as a non-security-critical fallback and emits an explicit reopen event', async () => {
    preferences.get.mockRejectedValue(new Error('bridge unavailable'));
    preferences.set.mockRejectedValue(new Error('bridge unavailable'));
    await markWalkthroughComplete('field-1');
    await expect(hasCompletedWalkthrough('field-1')).resolves.toBe(true);

    const dispatchEvent = vi.fn();
    Object.defineProperty(globalThis, 'CustomEvent', { value: function CustomEvent(type: string) { return { type }; }, configurable: true });
    Object.defineProperty(globalThis, 'window', { value: { localStorage: globalThis.localStorage, dispatchEvent }, configurable: true });
    requestRoleWalkthrough();
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: roleWalkthroughEventName }));
  });
});
