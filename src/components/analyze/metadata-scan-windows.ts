/** Generate only the windows that belong to the requested inclusive ranges. */
export function* metadataScanWindows(ranges: Iterable<{ start: number; end: number }>, pageSize: number) {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error("Invalid scan page size");
  for (const range of ranges) {
    for (let offset = range.start; offset <= range.end; offset += pageSize) {
      yield { offset, limit: Math.min(pageSize, range.end - offset + 1) };
    }
  }
}
