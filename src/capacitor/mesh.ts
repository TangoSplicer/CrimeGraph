declare global {
  interface Window {
    bluetoothle?: any;
  }
}

const CRIMEGRAPH_SERVICE_UUID = '0000FF01-0000-1000-8000-00805F9B34FB';
const AUDIT_CHARACTERISTIC_UUID = '0000FF02-0000-1000-8000-00805F9B34FB';
const OPERATION_TIMEOUT_MS = 15000;

const getAdapter = (): any | null => typeof window !== 'undefined' && window.bluetoothle ? window.bluetoothle : null;
const describeNativeError = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>;
    const message = typeof value.message === 'string' ? value.message : typeof value.error === 'string' ? value.error : '';
    if (message.trim()) return message.trim();
  }
  return fallback;
};

export const MeshNetwork = {
  /**
   * Starts the local BLE presence service. It exposes only a CrimeGraph service
   * identifier and a generic alias; no case, operator, or evidence content is advertised.
   */
  initializeHardware: async (): Promise<void> => {
    const adapter = getAdapter();
    if (!adapter) throw new Error('Tactical Mesh is unavailable because the Bluetooth LE bridge is not loaded. Install the current Android build.');

    return new Promise((resolve, reject) => {
      let settled = false;
      const succeed = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve();
      };
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(new Error(message));
      };
      const timeout = window.setTimeout(() => fail('Tactical Mesh initialization timed out after 15 seconds. Enable Bluetooth, grant Nearby devices permission, then retry.'), OPERATION_TIMEOUT_MS);

      try {
        adapter.initialize((result: any) => {
          if (result?.status !== 'enabled') return fail(`Bluetooth radio is not ready (${String(result?.status || 'unknown state')}). Enable Bluetooth and grant Nearby devices permission.`);
          try {
            adapter.initializePeripheral((peripheralResult: any) => {
              if (peripheralResult?.status !== 'enabled') return fail(`Bluetooth advertising is unavailable (${String(peripheralResult?.status || 'unknown state')}). Confirm Bluetooth permissions and retry.`);
              adapter.addService(() => {
                adapter.startAdvertising(succeed, (error: unknown) => {
                  fail(`Tactical Mesh advertising could not start: ${describeNativeError(error, 'radio access was denied')}.`);
                }, {
                  services: [CRIMEGRAPH_SERVICE_UUID],
                  service: CRIMEGRAPH_SERVICE_UUID,
                  name: 'CrimeGraph_Node',
                });
              }, (error: unknown) => {
                fail(`Tactical Mesh service setup failed: ${describeNativeError(error, 'the BLE service could not be created')}.`);
              }, {
                service: CRIMEGRAPH_SERVICE_UUID,
                characteristics: [{ uuid: AUDIT_CHARACTERISTIC_UUID, permissions: { read: true }, properties: { read: true } }],
              });
            }, (error: unknown) => {
              fail(`Tactical Mesh advertising initialization failed: ${describeNativeError(error, 'radio access was denied')}.`);
            }, { request: true });
          } catch (error) {
            fail(`Tactical Mesh advertising initialization failed: ${describeNativeError(error, 'unexpected Bluetooth bridge error')}.`);
          }
        }, { request: true, statusReceiver: false });
      } catch (error) {
        fail(`Tactical Mesh BLE bridge invocation failed: ${describeNativeError(error, 'unexpected bridge error')}.`);
      }
    });
  },

  /**
   * Starts BLE scanning for the CrimeGraph service UUID only. The callback receives
   * peer beacons, not case material, pairing data, or synchronization deltas.
   */
  startTacticalScan: async (onDeviceDiscovered: (device: { deviceId: string; name: string; rssi: number }) => void): Promise<void> => {
    const adapter = getAdapter();
    if (!adapter) throw new Error('Tactical Mesh discovery is unavailable because the Bluetooth LE bridge is not loaded. Install the current Android build.');

    return new Promise((resolve, reject) => {
      let started = false;
      const timeout = window.setTimeout(() => {
        if (!started) reject(new Error('Tactical Mesh discovery did not start before the timeout. Enable Bluetooth, grant Nearby devices permission, then retry.'));
      }, OPERATION_TIMEOUT_MS);
      const startSucceeded = () => {
        if (started) return;
        started = true;
        clearTimeout(timeout);
        resolve();
      };

      try {
        adapter.startScan((result: any) => {
          if (result?.status === 'scanStarted') return startSucceeded();
          if (result?.status === 'scanResult' && result.address) {
            startSucceeded();
            onDeviceDiscovered({ deviceId: String(result.address), name: String(result.name || 'Operator Node'), rssi: Number(result.rssi || 0) });
          }
          if (result?.status === 'scanStopped') clearTimeout(timeout);
        }, (error: unknown) => {
          clearTimeout(timeout);
          reject(new Error(`Tactical Mesh discovery failed: ${describeNativeError(error, 'radio access was denied')}.`));
        }, { services: [CRIMEGRAPH_SERVICE_UUID] });
      } catch (error) {
        clearTimeout(timeout);
        reject(new Error(`Tactical Mesh discovery could not start: ${describeNativeError(error, 'unexpected Bluetooth bridge error')}.`));
      }
    });
  },

  stopTacticalScan: async (): Promise<void> => {
    const adapter = getAdapter();
    if (!adapter) return;
    await new Promise<void>((resolve) => {
      try {
        adapter.stopScan(() => resolve(), () => resolve());
      } catch {
        resolve();
      }
    });
  },

  transmitEncryptedPayload: async (_deviceId: string, _encryptedBase64: string): Promise<boolean> => {
    // Discovery is deliberately transport-only. Case content remains unavailable
    // until the separately reviewed authenticated session protocol is complete.
    console.warn('CrimeGraph mesh transfer is disabled pending a secure collaboration protocol.');
    return false;
  },
};
