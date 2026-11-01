/** Match case-insensitive handles by exact, prefix, substring, then ordered subsequence; empty input returns all. */
export function matchAuthors(authors: readonly string[], query: string): string[];
