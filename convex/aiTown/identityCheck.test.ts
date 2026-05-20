import { describe, test, expect } from '@jest/globals';
import { countIdentityTerms } from './identityCheck';

// UT-IC-01: covers FR12 evaluation metric (identity-consistency logging)
// asserts the counter finds industry + products + competitors in a statement

describe('countIdentityTerms', () => {
  test('test_counts_identity_terms_in_statement', () => {
    const identity = {
      industry: 'Tech',
      products: ['iPhone', 'iPad'],
      competitors: ['Samsung'],
    };
    // statement mentions industry + 1 product + 1 competitor => 3
    expect(
      countIdentityTerms('Our iPhone competes with Samsung in the tech sector.', identity),
    ).toBe(3);
    // unrelated statement => 0
    expect(countIdentityTerms('The weather is nice today.', identity)).toBe(0);
  });
});
