export interface SeededRandom {
  next(): number;
  nextFloat(): number;
  nextInt(maxExclusive: number): number;
  nextRange(minInclusive: number, maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSeededRandom(seed: number): SeededRandom {
  const next = mulberry32(seed || 1);

  return {
    next: () => next(),
    nextFloat: () => next(),
    nextInt: (maxExclusive: number) => {
      if (maxExclusive <= 0) {
        return 0;
      }
      return Math.floor(next() * maxExclusive);
    },
    nextRange: (minInclusive: number, maxExclusive: number) => {
      if (maxExclusive <= minInclusive) {
        return minInclusive;
      }
      return minInclusive + Math.floor(next() * (maxExclusive - minInclusive));
    },
    pick: <T>(items: readonly T[]) => {
      if (items.length === 0) {
        throw new Error('Cannot pick from an empty array');
      }
      return items[Math.floor(next() * items.length)] as T;
    },
    shuffle: <T>(items: readonly T[]) => {
      const clone = [...items];
      for (let index = clone.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(next() * (index + 1));
        [clone[index], clone[swapIndex]] = [clone[swapIndex], clone[index]];
      }
      return clone;
    },
  };
}
