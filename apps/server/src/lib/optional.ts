import type Sharp from 'sharp';

let sharpModule: Promise<typeof Sharp | null> | null = null;

/**
 * sharp is a native module. It is used only for placeholder colours and demo artwork, so where it
 * cannot load (the Android app) those features quietly step aside instead of failing.
 */
export function loadSharp(): Promise<typeof Sharp | null> {
  sharpModule ??= import('sharp').then((m) => m.default).catch(() => null);
  return sharpModule;
}
