export function isAdminEmail(email?: string | null) {
  const target = process.env.ADMIN_REPORT_EMAIL?.trim().toLowerCase();
  return !!email && !!target && email.trim().toLowerCase() === target;
}
