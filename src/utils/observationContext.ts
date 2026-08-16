export const OBSERVATION_SOURCE_BASES = ['direct_observation', 'source_report', 'system_record', 'analyst_assessment'] as const;
export const OBSERVATION_LOCATION_PRECISIONS = ['exact', 'approximate', 'area', 'unknown'] as const;
export const OBSERVATION_TEMPORAL_PRECISIONS = ['exact', 'approximate', 'window', 'unknown'] as const;

export type ObservationSourceBasis = typeof OBSERVATION_SOURCE_BASES[number];
export type ObservationLocationPrecision = typeof OBSERVATION_LOCATION_PRECISIONS[number];
export type ObservationTemporalPrecision = typeof OBSERVATION_TEMPORAL_PRECISIONS[number];

export interface ObservationContextInput {
  sourceBasis?: ObservationSourceBasis;
  locationPrecision?: ObservationLocationPrecision;
  latitude?: number | string | null;
  longitude?: number | string | null;
  uncertaintyRadiusMeters?: number | string | null;
  temporalPrecision?: ObservationTemporalPrecision;
  uncertaintyNote?: string;
}

export interface ObservationContext extends Required<Omit<ObservationContextInput, 'latitude' | 'longitude' | 'uncertaintyRadiusMeters'>> {
  id: string;
  caseId: string;
  nodeId: string;
  latitude: number | null;
  longitude: number | null;
  uncertaintyRadiusMeters: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const inSet = <T extends readonly string[]>(value: unknown, set: T, fallback: T[number]): T[number] =>
  typeof value === 'string' && set.includes(value) ? value as T[number] : fallback;

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error('Observation coordinates and uncertainty radius must be numeric.');
  return parsed;
};

export const normaliseObservationContext = (input: ObservationContextInput = {}): Required<ObservationContextInput> => {
  const latitude = numberOrNull(input.latitude);
  const longitude = numberOrNull(input.longitude);
  const uncertaintyRadiusMeters = numberOrNull(input.uncertaintyRadiusMeters);
  if ((latitude === null) !== (longitude === null)) throw new Error('Observation coordinates require both latitude and longitude.');
  if (latitude !== null && (latitude < -90 || latitude > 90)) throw new Error('Observation latitude must be between -90 and 90.');
  if (longitude !== null && (longitude < -180 || longitude > 180)) throw new Error('Observation longitude must be between -180 and 180.');
  if (uncertaintyRadiusMeters !== null && (uncertaintyRadiusMeters < 0 || uncertaintyRadiusMeters > 1000000)) throw new Error('Observation uncertainty radius must be between zero and one million metres.');
  const locationPrecision = inSet(input.locationPrecision, OBSERVATION_LOCATION_PRECISIONS, 'unknown');
  if (latitude !== null && locationPrecision === 'unknown') throw new Error('Mapped observations require a stated location precision.');
  if (locationPrecision === 'exact' && latitude !== null && uncertaintyRadiusMeters !== null && uncertaintyRadiusMeters > 25) throw new Error('Exact location precision cannot be combined with an uncertainty radius above 25 metres.');
  return {
    sourceBasis: inSet(input.sourceBasis, OBSERVATION_SOURCE_BASES, 'direct_observation'),
    locationPrecision,
    latitude,
    longitude,
    uncertaintyRadiusMeters,
    temporalPrecision: inSet(input.temporalPrecision, OBSERVATION_TEMPORAL_PRECISIONS, 'unknown'),
    uncertaintyNote: typeof input.uncertaintyNote === 'string' ? input.uncertaintyNote.trim().slice(0, 1200) : '',
  };
};
