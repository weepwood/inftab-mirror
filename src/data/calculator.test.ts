import { describe, expect, it } from 'vitest'
import { evaluateExpression } from './calculator'

describe('evaluateExpression', () => {
  it.each([
    ['2 + 3 * 4', 14],
    ['(2 + 3) * 4', 20],
    ['-3 + +2', -1],
    ['12.5 / .5', 25],
    ['2 * -(3 + 4)', -14],
  ])('evaluates %s', (expression, expected) => {
    expect(evaluateExpression(expression)).toBe(expected)
  })

  it.each(['', '1 +', '(1 + 2', '2 / 0', '2 ** 3', 'alert(1)', '1e9', '9'.repeat(257)])(
    'rejects invalid or unsafe input %s', (expression) => {
      expect(() => evaluateExpression(expression)).toThrow()
    },
  )

  it('limits the input length before parsing', () => {
    expect(() => evaluateExpression('9'.repeat(257))).toThrow('太长')
  })
})
