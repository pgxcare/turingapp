export const WRITE_ENABLED_DEMO_ROLES = ['Admin', 'ClinicalOps', 'QualityRisk'] as const;

export function isWriteEnabledDemoRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return (WRITE_ENABLED_DEMO_ROLES as readonly string[]).includes(role);
}

export function writeEnabledDemoRoleLabel(): string {
  return WRITE_ENABLED_DEMO_ROLES.join(' / ');
}
