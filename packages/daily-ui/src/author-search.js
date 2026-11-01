/** Match exact/prefix/substring/subsequence handles, ignoring case and a leading @; empty queries return all. */
export function matchAuthors(authors, query) {
  const needle = query.trim().replace(/^@/, '').toLowerCase();
  if (!needle) return [...authors];
  return authors
    .map((author) => {
      const handle = author.toLowerCase();
      let rank = 4;
      if (handle === needle) rank = 0;
      else if (handle.startsWith(needle)) rank = 1;
      else if (handle.includes(needle)) rank = 2;
      else {
        let index = 0;
        for (const character of handle) {
          if (character === needle[index]) index++;
          if (index === needle.length) {
            rank = 3;
            break;
          }
        }
      }
      return { author, rank };
    })
    .filter(({ rank }) => rank < 4)
    .sort((a, b) => a.rank - b.rank)
    .map(({ author }) => author);
}
