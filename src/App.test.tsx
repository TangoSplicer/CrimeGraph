import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  state: {
    currentUser: null as { id: string; badge: string; name: string; role: 'analyst'; biometricEnabled: boolean } | null,
    isAppReady: false,
    intentionalBackground: false,
    initializeAuth: vi.fn(),
    logout: vi.fn(),
    setIntentionalBackground: vi.fn(),
  },
}));

vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn(async () => ({ remove: vi.fn() })) },
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, BrowserRouter: actual.MemoryRouter };
});

vi.mock('./stores/authStore', () => ({
  useAuthStore: <T,>(selector?: (state: typeof auth.state) => T): T | typeof auth.state => selector ? selector(auth.state) : auth.state,
}));
vi.mock('./screens/AuthScreen', () => ({ AuthScreen: () => <main>AUTHENTICATION BOUNDARY</main> }));
vi.mock('./screens/DashboardScreen', () => ({ DashboardScreen: () => <main>OPERATIONS DASHBOARD</main> }));
vi.mock('./screens/GraphWorkspaceScreen', () => ({ GraphWorkspaceScreen: () => <main>GRAPH WORKSPACE</main> }));
vi.mock('./screens/AddNodeScreen', () => ({ AddNodeScreen: () => <main>ADD INTELLIGENCE</main> }));
vi.mock('./screens/SettingsScreen', () => ({ SettingsScreen: () => <main>SYSTEM SETTINGS</main> }));
vi.mock('./screens/SupervisorReviewScreen', () => ({ SupervisorReviewScreen: () => <main>SUPERVISOR REVIEW</main> }));
vi.mock('./components/RoleWalkthrough', () => ({ RoleWalkthrough: () => null }));

import { App } from './App';

beforeEach(() => {
  auth.state = {
    currentUser: null,
    isAppReady: false,
    intentionalBackground: false,
    initializeAuth: vi.fn(),
    logout: vi.fn(),
    setIntentionalBackground: vi.fn(),
  };
});

describe('application shell smoke coverage', () => {
  it('renders the safe startup state before local authentication initialization completes', () => {
    expect(renderToStaticMarkup(<App />)).toContain('INITIALISING HARDWARE');
  });

  it('renders the unauthenticated boundary after initialization', () => {
    auth.state.isAppReady = true;
    expect(renderToStaticMarkup(<App />)).toContain('AUTHENTICATION BOUNDARY');
  });

  it('renders the authenticated operations route after initialization', () => {
    auth.state.isAppReady = true;
    auth.state.currentUser = { id: 'analyst-1', badge: 'ANL-001', name: 'Analyst One', role: 'analyst', biometricEnabled: false };
    expect(renderToStaticMarkup(<App />)).toContain('OPERATIONS DASHBOARD');
  });
});
