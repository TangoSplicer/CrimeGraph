import { describe, expect, it } from 'vitest';
import { normaliseObservationContext } from './observationContext';

describe('source and uncertainty observation context', () => {
  it('normalises a stated source, approximate coordinate, and uncertainty radius without creating a score', () => {
    const context = normaliseObservationContext({
      sourceBasis: 'source_report', locationPrecision: 'approximate', latitude: '51.501', longitude: '-0.142', uncertaintyRadiusMeters: '150', temporalPrecision: 'window', uncertaintyNote: 'Coordinates were provided by the reporting source.',
    });

    expect(context).toMatchObject({ sourceBasis: 'source_report', locationPrecision: 'approximate', latitude: 51.501, longitude: -0.142, uncertaintyRadiusMeters: 150, temporalPrecision: 'window' });
    expect('confidence' in context).toBe(false);
    expect('score' in context).toBe(false);
  });

  it('rejects a one-sided coordinate, false exactness, and impossible radius', () => {
    expect(() => normaliseObservationContext({ latitude: 51.5, locationPrecision: 'approximate' })).toThrow('both latitude and longitude');
    expect(() => normaliseObservationContext({ latitude: 51.5, longitude: -0.1, locationPrecision: 'exact', uncertaintyRadiusMeters: 26 })).toThrow('Exact location precision');
    expect(() => normaliseObservationContext({ uncertaintyRadiusMeters: -1 })).toThrow('between zero and one million');
  });
});
