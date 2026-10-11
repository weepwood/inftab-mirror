/** Evaluate basic arithmetic without executing user supplied JavaScript. */
export function evaluateExpression(expression: string): number {
  if (expression.length > 256) throw new Error('表达式太长。')
  let index = 0

  function skipSpaces() {
    while (/\s/.test(expression[index] ?? '') && index < expression.length) index += 1
  }

  function consume(character: string) {
    skipSpaces()
    if (expression[index] !== character) return false
    index += 1
    return true
  }

  function finite(value: number): number {
    if (!Number.isFinite(value)) throw new Error('计算结果超出范围。')
    return value
  }

  function primary(): number {
    skipSpaces()
    if (consume('(')) {
      const value = sum()
      if (!consume(')')) throw new Error('括号不匹配。')
      return value
    }
    const start = index
    let digits = 0
    while (/\d/.test(expression[index] ?? '') && index < expression.length) { index += 1; digits += 1 }
    if (expression[index] === '.') {
      index += 1
      while (/\d/.test(expression[index] ?? '') && index < expression.length) { index += 1; digits += 1 }
    }
    if (!digits) throw new Error('请输入有效的数字和运算符。')
    return finite(Number(expression.slice(start, index)))
  }

  function unary(): number {
    if (consume('+')) return unary()
    if (consume('-')) return finite(-unary())
    return primary()
  }

  function product(): number {
    let value = unary()
    while (true) {
      if (consume('*')) value = finite(value * unary())
      else if (consume('/')) {
        const divisor = unary()
        if (divisor === 0) throw new Error('不能除以零。')
        value = finite(value / divisor)
      } else return value
    }
  }

  function sum(): number {
    let value = product()
    while (true) {
      if (consume('+')) value = finite(value + product())
      else if (consume('-')) value = finite(value - product())
      else return value
    }
  }

  const value = sum()
  skipSpaces()
  if (index !== expression.length) throw new Error('表达式中包含不支持的内容。')
  return value
}
