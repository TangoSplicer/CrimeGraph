import { Capacitor } from '@capacitor/core';
import { getDatabaseRuntimeStatus, getDb } from '../capacitor/db';
import { getDeviceAssurance, type DeviceAssurance } from '../capacitor/deviceIdentity';
import { verifyAuditChain, type AuditVerificationResult } from './auditLedger';

export type StorageHealth = 'healthy' | 'warning' | 'critical' | 'unavailable';

export interface DeviceAssuranceSnapshot {
  platform: 'android-native' | 'browser-preview';
  generatedAt: string;
  appVersion: string;
  appVersionCode: number | null;
  androidVersion: string | null;
  sdkInt: number | null;
  encryptedDatabase: boolean;
  storageSecretAvailable: boolean | null;
  identityKeyPresent: boolean | null;
  identityKeySecurityLevel: DeviceAssurance['identityKeySecurityLevel'] | 'unavailable-in-preview';
  storageWrapKeySecurityLevel: DeviceAssurance['storageWrapKeySecurityLevel'] | 'unavailable-in-preview';
  backupExcluded: boolean | null;
  biometricReadiness: DeviceAssurance['biometricReadiness'] | 'unavailable-in-preview';
  availableStorageBytes: number | null;
  storageHealth: StorageHealth;
  protectedMediaCount: number;
  lastDatabaseOpenedAt: string | null;
  auditChain: AuditVerificationResult;
}

const storageHealthFromBytes = (availableBytes: number | null): StorageHealth => {
  if (availableBytes === null) return 'unavailable';
  if (availableBytes < 128 * 1024 * 1024) return 'critical';
  if (availableBytes < 512 * 1024 * 1024) return 'warning';
  return 'healthy';
};

const valueOf = (rows: any[], key: string): string | null => {
  const entry = rows.find((row) => row.key === key);
  return entry?.value ? String(entry.value) : null;
};

const countFromQuery = (row: any): number => {
  const candidate = row?.protected_media_count;
  const parsed = Number(candidate);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
};

export const collectDeviceAssurance = async (): Promise<DeviceAssuranceSnapshot> => {
  const db = await getDb();
  const [metadataResult, protectedMediaResult, auditResult] = await Promise.all([
    db.query('SELECT key, value, updated_at FROM storage_metadata WHERE key IN (?, ?)', ['storage_encryption', 'last_database_opened_at']),
    db.query("SELECT COUNT(*) AS protected_media_count FROM evidence_provenance WHERE attachment_uri LIKE ?", ['%.cgm']),
    db.query('SELECT id, timestamp, user_id, action, target_id, details, previous_hash, entry_hash FROM audit_logs ORDER BY timestamp ASC, id ASC'),
  ]);
  const metadata = metadataResult.values || [];
  const auditChain = await verifyAuditChain(auditResult.values || []);
  const runtime = getDatabaseRuntimeStatus();
  const encryptedDatabase = valueOf(metadata, 'storage_encryption') === 'device-bound-native';
  const lastDatabaseOpenedAt = valueOf(metadata, 'last_database_opened_at') || runtime.lastOpenedAt;
  const protectedMediaCount = countFromQuery(protectedMediaResult.values?.[0]);

  if (!Capacitor.isNativePlatform()) {
    return {
      platform: 'browser-preview', generatedAt: new Date().toISOString(), appVersion: 'Browser preview', appVersionCode: null, androidVersion: null, sdkInt: null,
      encryptedDatabase, storageSecretAvailable: null, identityKeyPresent: null, identityKeySecurityLevel: 'unavailable-in-preview', storageWrapKeySecurityLevel: 'unavailable-in-preview',
      backupExcluded: null, biometricReadiness: 'unavailable-in-preview', availableStorageBytes: null, storageHealth: 'unavailable', protectedMediaCount, lastDatabaseOpenedAt, auditChain,
    };
  }

  const native = await getDeviceAssurance();
  return {
    platform: 'android-native', generatedAt: new Date().toISOString(), appVersion: native.appVersion, appVersionCode: native.appVersionCode, androidVersion: native.androidVersion, sdkInt: native.sdkInt,
    encryptedDatabase, storageSecretAvailable: native.storageSecretPresent, identityKeyPresent: native.identityKeyPresent,
    identityKeySecurityLevel: native.identityKeySecurityLevel, storageWrapKeySecurityLevel: native.storageWrapKeySecurityLevel, backupExcluded: native.backupExcluded,
    biometricReadiness: native.biometricReadiness, availableStorageBytes: native.availableStorageBytes, storageHealth: storageHealthFromBytes(native.availableStorageBytes),
    protectedMediaCount, lastDatabaseOpenedAt, auditChain,
  };
};

export const formatBytes = (value: number | null): string => {
  if (value === null) return 'Not available in browser preview';
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 * 1024 ? 0 : 1)} GB`;
};
