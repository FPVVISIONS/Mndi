/** Methods the Android app exposes to the page. Absent in a normal browser. */
interface NativeBridge {
  /** The lighter look (no blur effects) for slow screens. */
  isLite?(): boolean;
  setLite?(on: boolean): void;
  /** Opens Telegram's developer page once so the app can pick up its own Telegram keys. */
  setupKeys?(): void;
  /** Plays a library file in the app's built-in player (MKV, surround audio, fast seeking). */
  playNative?(
    url: string,
    title: string,
    startSeconds: number,
    fileId: number,
    profileId: number,
  ): void;
  /** Hands a stream URL to another installed video player (VLC, MX Player...). */
  openExternal(url: string, title: string): void;
}

export function native(): NativeBridge | null {
  return (window as unknown as { MarqueeNative?: NativeBridge }).MarqueeNative ?? null;
}

/** Open a library file in another app on the device. Returns false when not running in the app. */
export function openInExternalPlayer(fileId: number, title: string): boolean {
  const bridge = native();
  if (!bridge) return false;
  bridge.openExternal(`${window.location.origin}/api/stream/${fileId}`, title);
  return true;
}

/** Play in the app's native player. Returns false when it is not available (a normal browser). */
export function playInNativePlayer(
  fileId: number,
  title: string,
  startSeconds: number,
  profileId: number,
): boolean {
  const bridge = native();
  if (!bridge?.playNative) return false;
  bridge.playNative(
    `${window.location.origin}/api/stream/${fileId}`,
    title,
    startSeconds,
    fileId,
    profileId,
  );
  return true;
}
