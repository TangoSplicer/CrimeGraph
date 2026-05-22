import { BleClient, textToDataView } from '@capacitor-community/bluetooth-le';

const CRIMEGRAPH_SERVICE_UUID = '0000FF01-0000-1000-8000-00805F9B34FB';
const AUDIT_CHARACTERISTIC_UUID = '0000FF02-0000-1000-8000-00805F9B34FB';

export const MeshNetwork = {
  initializeHardware: async (): Promise<boolean> => {
    try {
      await BleClient.initialize({ androidNeverForLocation: true });
      return true;
    } catch (error) {
      console.error('BLE Initialization failed:', error);
      return false;
    }
  },

  startTacticalScan: async (onDeviceDiscovered: (device: any) => void): Promise<void> => {
    try {
      await BleClient.requestLEScan(
        { services: [CRIMEGRAPH_SERVICE_UUID] },
        (result) => {
          onDeviceDiscovered({
            deviceId: result.device.deviceId,
            name: result.device.name || 'Unknown Device',
            rssi: result.rssi,
          });
        }
      );
    } catch (error) {
      console.error('Failed to initiate scan:', error);
    }
  },

  stopTacticalScan: async (): Promise<void> => {
    try {
      await BleClient.stopLEScan();
    } catch (error) {}
  },

  /**
   * Connects to a peer device and writes the encrypted delta payload.
   */
  transmitEncryptedPayload: async (deviceId: string, encryptedBase64: string): Promise<boolean> => {
    try {
      await BleClient.connect(deviceId);
      
      // In production, payloads exceeding MTU size (approx 512 bytes) must be chunked here.
      // We are writing the text wrapper for the initial handshake.
      await BleClient.write(
        deviceId,
        CRIMEGRAPH_SERVICE_UUID,
        AUDIT_CHARACTERISTIC_UUID,
        textToDataView(encryptedBase64)
      );

      await BleClient.disconnect(deviceId);
      console.log('Encrypted package securely transmitted and connection severed.');
      return true;
    } catch (error) {
      console.error('Failed to transmit payload:', error);
      try { await BleClient.disconnect(deviceId); } catch (e) {}
      return false;
    }
  }
};
