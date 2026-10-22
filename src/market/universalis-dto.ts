// One sale on the market board, as Universalis recorded it.
interface Sale {
  // When it sold (s since the epoch).
  at: number;
  // Gil per unit.
  price: number;
  quantity: number;
  hq: boolean;
}

export {Sale};
