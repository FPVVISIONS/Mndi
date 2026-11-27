import type { AuthErrorCode } from '@marquee/shared';

interface RpcLike {
  errorMessage?: string;
  seconds?: number;
  message?: string;
  code?: number;
}

export function rpcName(err: unknown): string {
  const e = err as RpcLike;
  return (e?.errorMessage ?? e?.message ?? '').toString();
}

export function floodSeconds(err: unknown): number | null {
  const e = err as RpcLike;
  if (typeof e?.seconds === 'number' && /FLOOD/.test(rpcName(err) + (e.constructor?.name ?? '')))
    return e.seconds;
  const m = /FLOOD_WAIT_(\d+)|wait of (\d+) seconds/i.exec(rpcName(err));
  return m ? Number(m[1] ?? m[2]) : null;
}

export function isTransient(err: unknown): boolean {
  const msg = rpcName(err);
  return /TIMEOUT|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EPIPE|Not connected|Connection closed|CONNECTION|network|RPC_CALL_FAIL|RPC_MCGET_FAIL|Cannot send requests while disconnected|SERVER_ERROR|INTERDC/i.test(
    msg,
  );
}

export function isSessionDead(err: unknown): boolean {
  return /AUTH_KEY_UNREGISTERED|AUTH_KEY_INVALID|SESSION_REVOKED|SESSION_EXPIRED|USER_DEACTIVATED/.test(
    rpcName(err),
  );
}

export function isFileReferenceExpired(err: unknown): boolean {
  return /FILE_REFERENCE/.test(rpcName(err));
}

export function toAuthError(err: unknown): { code: AuthErrorCode; waitSeconds?: number } {
  const msg = rpcName(err);
  const wait = floodSeconds(err);
  if (wait !== null) return { code: 'flood', waitSeconds: wait };
  if (/NO_ACCOUNT/.test(msg)) return { code: 'no_account' };
  if (/PHONE_NUMBER_INVALID|PHONE_NUMBER_BANNED/.test(msg)) return { code: 'phone_invalid' };
  if (/PHONE_CODE_INVALID|PHONE_CODE_EMPTY/.test(msg)) return { code: 'code_invalid' };
  if (/PHONE_CODE_EXPIRED/.test(msg)) return { code: 'code_expired' };
  if (/PASSWORD_HASH_INVALID/.test(msg)) return { code: 'password_invalid' };
  if (/API_ID_INVALID|API_ID_PUBLISHED_FLOOD/.test(msg)) return { code: 'credentials_invalid' };
  if (isTransient(err)) return { code: 'network' };
  return { code: 'unknown' };
}
