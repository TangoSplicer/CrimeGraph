declare global {
  interface Window {
    bluetoothle: any;
  }
}

const CRIMEGRAPH_SERVICE_UUID = '0000FF01-0000-1000-8000-00805F9B34FB';
const AUDIT_CHARACTERISTIC_UUID = '0000FF02-0000-1000-8000-00805F9B34FB';

export const MeshNetwork = {
  initializeHardware: async (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!window.bluetoothle) {
        alert("Radio drivers not loaded. Ensure app is compiled natively.");
        return resolve(false);
      }

      // Initialize Central (Scanner)
      window.bluetoothle.initialize((result: any) => {
        if (result.status === 'enabled') {
          
          // Initialize Peripheral (Broadcaster)
          window.bluetoothle.initializePeripheral((pResult: any) => {
            if (pResult.status === 'enabled') {
              
              // Define the Mesh Service
              window.bluetoothle.addService({
                service: CRIMEGRAPH_SERVICE_UUID,
                characteristics: [{
                  uuid: AUDIT_CHARACTERISTIC_UUID,
                  permissions: { read: true, write: true },
                  properties: { read: true, writeWithoutResponse: true, write: true }
                }]
              }, () => {
                
                // Begin Advertising Presence
                window.bluetoothle.startAdvertising({
                  services: [CRIMEGRAPH_SERVICE_UUID],
                  service: CRIMEGRAPH_SERVICE_UUID,
                  name: "CrimeGraph_Node"
                }, () => {
                  console.log("Hardware Initialized & Broadcasting Presence");
                  resolve(true);
                }, (err: any) => {
                  console.error("Advertising failed:", err);
                  resolve(false);
                });

              }, (err: any) => {
                console.error("Service creation failed:", err);
                resolve(false);
              });

            } else {
              resolve(false);
            }
          }, (error: any) => {
            console.error("Peripheral init failed:", error);
            resolve(false);
          }, { request: true });

        } else {
          resolve(false);
        }
      }, { request: true, statusReceiver: false });
    });
  },

  startTacticalScan: async (onDeviceDiscovered: (device: any) => void): Promise<void> => {
    if (!window.bluetoothle) return;
    
    window.bluetoothle.startScan({
      services: [CRIMEGRAPH_SERVICE_UUID]
    }, (result: any) => {
      if (result.status === 'scanResult') {
        onDeviceDiscovered({
          deviceId: result.address,
          name: result.name || 'Operator Node',
          rssi: result.rssi,
        });
      }
    }, (error: any) => {
      console.error('Scan Error:', error);
      alert(`Scan Error: ${error.message || 'Unable to access frequencies'}`);
    });
  },

  stopTacticalScan: async (): Promise<void> => {
    return new Promise((resolve) => {
      if (!window.bluetoothle) return resolve();
      window.bluetoothle.stopScan(() => resolve(), () => resolve());
    });
  },

  transmitEncryptedPayload: async (deviceId: string, encryptedBase64: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!window.bluetoothle) return resolve(false);

      // Connect to discovered peer
      window.bluetoothle.connect({ address: deviceId }, (result: any) => {
        if (result.status === 'connected') {
          
          window.bluetoothle.discover({ address: deviceId }, () => {
            // Transmit payload
            window.bluetoothle.write({
              address: deviceId,
              service: CRIMEGRAPH_SERVICE_UUID,
              characteristic: AUDIT_CHARACTERISTIC_UUID,
              value: encryptedBase64 // cordova-plugin-bluetoothle expects base64 strings natively
            }, () => {
              // Disconnect and wipe signature
              window.bluetoothle.disconnect({ address: deviceId }, () => resolve(true));
            }, () => {
              window.bluetoothle.disconnect({ address: deviceId }, () => resolve(false));
            });
          }, () => resolve(false));
          
        }
      }, () => resolve(false));
    });
  }
};
