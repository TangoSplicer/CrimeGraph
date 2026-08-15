export const USER_ROLES = ['admin', 'supervisor', 'analyst', 'field', 'readonly'] as const;

export type UserRole = typeof USER_ROLES[number];
export type Permission =
  | 'case:create'
  | 'case:archive'
  | 'case:restore'
  | 'case:import'
  | 'case:export'
  | 'case:assign'
  | 'case:mark'
  | 'intelligence:create'
  | 'intelligence:update'
  | 'intelligence:delete'
  | 'intelligence:review'
  | 'intelligence:resubmit'
  | 'field:task:complete'
  | 'audit:view'
  | 'operator:provision'
  | 'pairing:manage'
  | 'system:wipe';

const POLICY: Record<UserRole, readonly Permission[]> = {
  admin: [
    'case:create', 'case:archive', 'case:restore', 'case:import', 'case:export', 'case:assign', 'case:mark',
    'intelligence:create', 'intelligence:update', 'intelligence:delete', 'intelligence:review', 'field:task:complete', 'audit:view',
    'operator:provision', 'pairing:manage', 'system:wipe',
  ],
  supervisor: [
    'case:create', 'case:archive', 'case:restore', 'case:import', 'case:export', 'case:assign', 'case:mark',
    'intelligence:create', 'intelligence:update', 'intelligence:delete', 'intelligence:review', 'field:task:complete', 'audit:view',
    'pairing:manage',
  ],
  analyst: [
    'case:create', 'case:import', 'case:export', 'case:assign', 'case:mark',
    'intelligence:create', 'intelligence:update', 'intelligence:delete',
  ],
  field: ['intelligence:create', 'intelligence:resubmit', 'field:task:complete'],
  readonly: [],
};

export const isUserRole = (value: unknown): value is UserRole =>
  typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);

export const can = (role: UserRole | null | undefined, permission: Permission): boolean =>
  Boolean(role && POLICY[role].includes(permission));

export const assertPermission = (role: UserRole | null | undefined, permission: Permission): void => {
  if (!can(role, permission)) {
    throw new Error(`Your assigned role is not permitted to perform this action (${permission}).`);
  }
};
