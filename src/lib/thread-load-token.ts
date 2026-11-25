export type LoadToken = {
  next: () => number;
  isCurrent: (token: number) => boolean;
};

export function createLoadToken(): LoadToken {
  let current = 0;
  return {
    next() {
      current += 1;
      return current;
    },
    isCurrent(token: number) {
      return token === current;
    },
  };
}
