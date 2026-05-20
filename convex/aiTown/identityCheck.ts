export function countIdentityTerms(
  statement: string,
  identity: { industry?: string; products?: string[]; competitors?: string[] },
): number {
  const lower = statement.toLowerCase();
  let count = 0;

  if (identity.industry && lower.includes(identity.industry.toLowerCase())) {
    count++;
  }

  if (identity.products) {
    for (let i = 0; i < identity.products.length; i++) {
      if (lower.includes(identity.products[i].toLowerCase())) {
        count++;
      }
    }
  }

  if (identity.competitors) {
    for (let i = 0; i < identity.competitors.length; i++) {
      if (lower.includes(identity.competitors[i].toLowerCase())) {
        count++;
      }
    }
  }

  return count;
}
