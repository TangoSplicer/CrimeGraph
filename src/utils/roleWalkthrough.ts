import { Preferences } from '@capacitor/preferences';
import type { User } from '../stores/authStore';

export interface WalkthroughStep {
  title: string;
  summary: string;
  action: string;
  boundary?: string;
}

const WALKTHROUGH_VERSION = 'v1';
const EVENT_NAME = 'crimegraph:open-role-walkthrough';

export const walkthroughPreferenceKey = (userId: string): string => `crimegraph_walkthrough_${WALKTHROUGH_VERSION}_${userId}`;

const closingStep = (): WalkthroughStep => ({
  title: 'Work within the security boundary',
  summary: 'CrimeGraph is offline first. It has no cloud dependency or telemetry, and intelligence findings remain explainable and analyst-controlled.',
  action: 'Use Settings to reopen this guide or end your session. Controls not granted to your role remain unavailable.',
  boundary: 'Tactical Mesh discovery only detects nearby local beacons. It does not transfer case content or authorize synchronization.',
});

export const getWalkthroughSteps = (user: User): WalkthroughStep[] => {
  if (user.role === 'admin') {
    return [
      {
        title: 'Commission and protect this device',
        summary: 'You are signed in to the administrative command deck. The local database is device-bound and access is protected by the master password.',
        action: 'Keep the master password in your approved credential process. Use the administrative sign-in path only when you need privileged controls.',
        boundary: 'Do not share the master password or use it as an operator PIN. High-risk actions require re-authentication.',
      },
      {
        title: 'Provision operational users',
        summary: 'Create a unique badge, display name, six-digit PIN, and least-privilege role for each person using this device.',
        action: 'Open Settings → Admin Command Deck to provision, disable, reinstate, reset, or adjust an operator account.',
        boundary: 'Field users can work only with locally assigned operations. They cannot create, import, or pull unassigned cases.',
      },
      {
        title: 'Check the audit trail and device state',
        summary: 'Privileged changes are recorded in the immutable local audit ledger. The device assurance and storage status panels show the local security posture.',
        action: 'Review the audit ledger after provisioning and before any controlled handover or disclosure.',
      },
      closingStep(),
    ];
  }

  if (user.role === 'field') {
    return [
      {
        title: 'Start with your assigned operation',
        summary: 'Field capture is restricted to operations that have been assigned and made available locally by an authorized analyst, supervisor, or administrator.',
        action: 'Open Operations, select an available case, then use Graph to record observations and evidence context.',
        boundary: 'You cannot create, import, or pull unassigned operations. Ask an authorized manager to prepare and assign the case first.',
      },
      {
        title: 'Record observations with their context',
        summary: 'Capture what you observed, the source basis, time and location precision, and any uncertainty. These details keep later analysis explainable.',
        action: 'Use the evidence and observation prompts in the graph workspace. State uncertainty rather than inferring facts.',
      },
      {
        title: 'Submit instead of silently changing intelligence',
        summary: 'Field submissions remain visible to reviewers. Returned items should be corrected with a clear response to the review note.',
        action: 'Check the status shown on your submitted records and complete assigned field tasks with an outcome or an unable-to-complete reason.',
      },
      closingStep(),
    ];
  }

  if (user.role === 'readonly') {
    return [
      {
        title: 'View permitted local intelligence',
        summary: 'Your account can inspect only the intelligence records made available on this device. Preserve the stated source, context, and uncertainty when briefing from them.',
        action: 'Open Operations, select an available case, then use Graph to inspect the relationship view and attached record context.',
        boundary: 'Your role cannot create, edit, import, export, review, pair devices, or alter system settings.',
      },
      {
        title: 'Escalate required changes',
        summary: 'If you identify a correction, new observation, export request, or access issue, give the relevant reference to an authorized analyst, supervisor, or administrator.',
        action: 'Do not attempt to work around unavailable controls or share screenshots, exports, or case material outside approved procedures.',
      },
      closingStep(),
    ];
  }

  if (user.role === 'supervisor') {
    return [
      {
        title: 'Begin in supervisory casework',
        summary: 'Select an existing operation or create/import one only when your authorization and the evidential basis are clear.',
        action: 'Open Operations, set the active case, then use Graph to capture intelligence relationships and source-aware notes.',
        boundary: 'Case scope, marking, and evidence provenance must remain explicit. Do not convert an analytical cue into a person-level risk score.',
      },
      {
        title: 'Use explainable analytical tools',
        summary: 'Graph findings, temporal corroboration, and spatial context identify documented relationships and uncertainty rather than opaque predictions.',
        action: 'Review each finding’s stated basis and preserve source, timing, precision, and analyst rationale before relying on it.',
      },
      {
        title: 'Review and task field work deliberately',
        summary: 'You can assign field users to approved operations, review their submitted records, and return a record only with a clear correction note.',
        action: 'Use Operations to assign field work and Review to approve or return pending submissions. Record decisions through the provided workflow.',
      },
      closingStep(),
    ];
  }

  return [
    {
      title: 'Begin in analyst casework',
      summary: 'Select an existing operation or create/import one only when your authorization and the evidential basis are clear.',
      action: 'Open Operations, set the active case, then use Graph to capture intelligence relationships and source-aware notes.',
      boundary: 'Case scope, marking, and evidence provenance must remain explicit. Do not convert an analytical cue into a person-level risk score.',
    },
    {
      title: 'Use explainable analytical tools',
      summary: 'Graph findings, temporal corroboration, and spatial context identify documented relationships and uncertainty rather than opaque predictions.',
      action: 'Review each finding’s stated basis and preserve source, timing, precision, and analyst rationale before relying on it.',
    },
    {
      title: 'Coordinate field work deliberately',
      summary: 'You can assign field users to approved operations and structured tasks, but supervisory review remains a separate control.',
      action: 'Use Operations to assign field work and coordinate pending-submission review with a supervisor. Do not treat a field submission as approved until it has been reviewed.',
    },
    closingStep(),
  ];
};

export async function hasCompletedWalkthrough(userId: string): Promise<boolean> {
  const key = walkthroughPreferenceKey(userId);
  try {
    return (await Preferences.get({ key })).value === 'complete';
  } catch {
    try { return window.localStorage.getItem(key) === 'complete'; } catch { return false; }
  }
}

export async function markWalkthroughComplete(userId: string): Promise<void> {
  const key = walkthroughPreferenceKey(userId);
  try {
    await Preferences.set({ key, value: 'complete' });
  } catch {
    try { window.localStorage.setItem(key, 'complete'); } catch { /* Completion preference is non-security-critical. */ }
  }
}

export const requestRoleWalkthrough = (): void => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT_NAME));
};

export const roleWalkthroughEventName = EVENT_NAME;
