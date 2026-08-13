import { create } from 'zustand';
import { MeshNetwork } from '../capacitor/mesh';
import { SyncEngine } from '../utils/syncEngine';

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
  transferStatus: string | null;
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
  transferStatus: null,

  initializeMesh: async () => {
    const ready = await MeshNetwork.initializeHardware();
    set({ isHardwareReady: ready, transferStatus: ready ? 'Discovery ready. Intelligence transfer remains locked pending secure mesh provisioning.' : 'Radio hardware could not be initialised.' });
  },

  startDiscovery: async () => {
    set({ isScanning: true, discoveredPeers: [], transferStatus: 'Scanning for nearby radio devices. No intelligence is transferred.' });
    try {
      await MeshNetwork.startTacticalScan((device) => {
        set((state) => {
          if (state.discoveredPeers.some((peer) => peer.deviceId === device.deviceId)) return state;
          return { discoveredPeers: [...state.discoveredPeers, device] };
        });
      });
    } catch (error) {
      set({ isScanning: false, transferStatus: 'Radio scan could not be started.' });
      throw error;
    }
  },

  stopDiscovery: async () => {
    await MeshNetwork.stopTacticalScan();
    set({ isScanning: false, transferStatus: 'Discovery stopped. No intelligence was transferred.' });
  },

  initiateHandshake: async (targetDeviceId: string) => {
    set({ isSyncing: targetDeviceId });
    try {
      await SyncEngine.generateDeltaPayload([], 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Secure mesh transfer is unavailable.';
      set({ transferStatus: message });
      throw error;
    } finally {
      set({ isSyncing: null });
    }
  },
}));
