# Safe-Area and System-Bar Audit

**Audit date:** 21 August 2026

**Scope:** Current `main` source tree, production web bundle, synchronized Android package, and minified Android release assembly.

**Status:** Source-level remediation complete; physical-device visual acceptance remains required.

## Objective

This audit examined all reachable application shells, persistent navigation, overlays, sheets, dialogs, creation forms, edit controls, and authentication/onboarding states for risk of being obscured by Android status, gesture, or navigation bars. The review treats Android insets as a layout boundary rather than relying on handset-specific fixed offsets.

## Control model

| Control | Implementation | Purpose |
|---|---|---|
| Viewport inset support | `viewport-fit=cover` in `index.html` | Enables dynamic `env(safe-area-inset-*)` values in the WebView. |
| Top/bottom primitives | `pt-safe`, `pb-safe`, `pb-safe-nav`, and `bottom-safe-nav` in `src/index.css` | Separates system-bar clearance from persistent-app-navigation clearance. |
| Overlay frame | `p-safe-modal` | Keeps modal frames clear of top and bottom device insets. |
| Modal card | `safe-modal-card` | Constrains a dialog to the dynamic viewport, provides its own scrolling, and reserves room after its final action. |
| Bottom sheet | `bottom-sheet-above-nav` | Raises graph sheets above the fixed primary tabs and device gesture area. |
| Action area | `pb-safe-action` | Preserves final-control clearance in scrollable sheets and panels. |

## Audited surfaces

| Surface | Audit result | Applied control |
|---|---|---|
| Bootstrap and authentication | Pass | Balanced `pt-safe` and `pb-safe` on initialization, commissioning, and sign-in states. |
| First-time walkthrough | Corrected | Uses `p-safe-modal` and `safe-modal-card` instead of a device-unsafe fixed height. |
| Persistent bottom navigation | Pass | Fixed navigation has device-bottom padding; full-screen routes reserve navigation height with `pb-safe-nav`. |
| Graph analysis and notes | Pass | Analysis retains close control and action clearance; notes drawer is bounded above navigation. |
| Graph bottom sheets and node editor | Corrected | Shared sheet is above primary tabs; the edit save/cancel bar is sticky and action-safe. |
| Graph workflow dialogs | Corrected | Playbook, lead register, briefing, saved-query, and dossier dialogs use safe modal frames/cards. |
| Dashboard dialogs | Corrected | Assignment, field-task, and operation-creation dialogs use the shared modal protections. |
| Node and operation creation | Corrected | Long forms scroll independently; primary controls are in pinned navigation-safe footers. |
| Settings, timeline, and supervisor review | Pass | Route roots reserve top/device and bottom/navigation insets; their content remains scrollable. |

## Regression safeguards

`src/screens/mobileLayoutSafety.test.ts` protects the following invariants:

1. Shared graph bottom sheets are elevated above the primary navigation and have an internal constrained scroll region.
2. Graph submenus and node-edit actions use safe modal/action primitives and retain an explicit analysis dismissal control.
3. Dashboard field and operation workflows use safe modal frames/cards.
4. Standalone operation and entity creation keep their primary actions outside scrollable content and above navigation.
5. Bootstrap, authentication, and onboarding are protected from both system bars.

## Validation evidence

| Validation | Result |
|---|---|
| Focused layout, app shell, authentication, and node-creation coverage | Passed: 14 tests across 5 files. |
| Full automated suite | Passed: 25 test files and 124 tests. |
| TypeScript validation | Passed. |
| Production Vite build | Passed. |
| Capacitor Android synchronization | Passed. |
| Minified Android release assembly | Passed with R8/resource shrinking. |

## Physical-device acceptance still required

Automated checks cannot prove WebView composition against every OEM’s gesture-navigation implementation. Before distribution, test the candidate build on at least one gesture-navigation device and one three-button-navigation device. Open each graph dialog, dashboard dialog, bottom sheet, and standalone creation route; scroll to the final action; then confirm it is fully visible and tappable above both the app tabs and the Android system UI. The node-editor **Save Changes** action is the first release-gating check.

> A source-level or build-level pass is not a substitute for physical-device acceptance. Any persistent overlap must be recorded with a screenshot, device model, Android release, navigation mode, and dialog title.

## Residual risks

The only remaining risk is device-specific rendering variance that cannot be observed in the sandbox. The shared controls reduce this risk by using dynamic viewport units and runtime inset variables rather than hard-coded handset dimensions. No known source-level overlap path remains after this audit.
