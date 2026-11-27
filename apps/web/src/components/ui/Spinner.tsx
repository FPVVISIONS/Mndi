export function Spinner({ size = 28 }: { size?: number }) {
  return (
    <span
      role="progressbar"
      aria-label="Loading"
      className="inline-block rounded-full border-2 border-white/20 border-t-fg"
      style={{ width: size, height: size, animation: 'spin 0.8s linear infinite' }}
    />
  );
}
