/** A dot that beats while some protocol of the project is going on. */
export function RunningDot({ count }: { count: number }) {
  const text = `${count} ${count === 1 ? "protocol" : "protocols"} running`;
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0" title={text} aria-label={text} role="img">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60 motion-reduce:animate-none" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
    </span>
  );
}
