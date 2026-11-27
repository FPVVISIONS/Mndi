/** Lowercase, accent-insensitive form used for client-side filtering. */
export function titleKeyLite(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}
