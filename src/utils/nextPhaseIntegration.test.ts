import { describe, it, expect } from 'vitest';
import { computeTemporalCorroboration } from './temporalCorroboration';
import { setLocale, getLocale, t } from './localization';

describe('Next-Phase Features Integration Tests', () => {
  it('computes temporal corroboration and overlapping clusters correctly', () => {
    const nodes = [
      { id: 'n1', label: 'Suspect Sighted', type: 'event', occurred_at: '2026-08-16T10:00:00Z', precision: 'exact' },
      { id: 'n2', label: 'Vehicle Parking', type: 'event', occurred_at: '2026-08-16T10:10:00Z', precision: 'exact' },
      { id: 'n3', label: 'Bank Withdrawal', type: 'event', occurred_at: '2026-08-16T15:00:00Z', precision: 'approximate' },
    ];

    const result = computeTemporalCorroboration(nodes);
    expect(result.spans.length).toBe(3);
    expect(result.overlappingClusters.length).toBeGreaterThan(0);
    expect(result.overlappingClusters[0].count).toBe(2);
  });

  it('handles offline localization strings correctly', () => {
    setLocale('es');
    expect(getLocale()).toBe('es');
    expect(t('appTitle')).toBe('CrimeGraph');
    expect(t('workspace')).toBe('Espacio de Trabajo de Grafos');

    setLocale('fr');
    expect(t('dossier')).toBe('Dossier Médico-Légal');

    setLocale('de');
    expect(t('sync')).toBe('P2P-Synchronisation');

    setLocale('en');
    expect(t('workspace')).toBe('Graph Workspace');
  });
});
