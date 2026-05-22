import { create } from 'zustand';
import { MeshNetwork } from '../capacitor/mesh';
import { SyncEngine } from '../utils/syncEngine';
import { useCaseStore } from './caseStore';

interface PeerDevice {
  deviceId: string;
  name: string;
  rssi: number;
}

interface SyncState {
  isScanning: boolean;
  isHardwareReady: boolean;
  isSyncing: string | null;
  discoveredPeers: PeerDevice[];
  initializeMesh: () => Promise<void>;
  startDiscovery: () => Promise<void>;
  stopDiscovery: () => Promise<void>;
  initiateHandshake: (targetDeviceId: string) => Promise<void>;
}

export const useSyncStore = create<SyncState>((set) => ({
  isScanning: false,
  isHardwareReady: false,
  isSyncing: null,
  discoveredPeers: [],

  initializeMesh: async () => {
    const ready = await MeshNetwork.initializeHardware();
    set({ isHardwareReady: ready });
  },

  startDiscovery: async () => {
    set({ isScanning: true, discoveredPeers: [] });
    await MeshNetwork.startTacticalScan((device) => {
      set((state) => {
        const exists = state.discoveredPeers.find(p => p.deviceId === device.deviceId);
        if (exists) return state;
        return { discoveredPeers: [...state.discoveredPeers, device] };
      });
    });
  },

  stopDiscovery: async () => {
    await MeshNetwork.stopTacticalScan();
    set({ isScanning: false });
  },

  initiateHandshake: async (targetDeviceId: string) => {
    set({ isSyncing: targetDeviceId });
    try {
      const localLogs = useCaseStore.getState().auditLogs;
      const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
      
      console.log('Generating cryptographic delta...');
      const encryptedPayload = await SyncEngine.generateDeltaPayload(localLogs, twentyFourHoursAgo);
      
      if (!encryptedPayload) {
        console.log('No new intelligence to sync.');
        set({ isSyncing: null });
        return;
      }

      console.log('Transmitting over tactical mesh...');
      const success = await MeshNetwork.transmitEncryptedPayload(targetDeviceId, encryptedPayload);
      
      if (success) {
        console.log('Handshake and sync complete.');
      } else {
        console.error('Radio transmission failed.');
      }

    } catch (error) {
      console.error('Handshake sequence aborted:', error);
    } finally {
      set({ isSyncing: null });
    }
  }
}));
