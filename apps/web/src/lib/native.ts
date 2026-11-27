/** Methods the Android app exposes to the page. Absent in a normal browser. */
interface NativeBridge {
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
