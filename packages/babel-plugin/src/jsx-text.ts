import * as t from '@babel/types'

// JSX text as React's JSX transform reads it: whitespace touching a line break is
// dropped, the remaining lines are joined with one space, and tabs become
// spaces, so `{name} theme` followed by a newline and indentation yields
// " theme". Babel's React transform does this in `react.buildChildren`; calling
// the same function keeps the two from drifting apart. Text that cleans to
// nothing is no child at all.
export function jsxTextValue(text: t.JSXText): string {
  const [child] = t.react.buildChildren(t.jsxFragment(t.jsxOpeningFragment(), t.jsxClosingFragment(), [text]))
  return child && t.isStringLiteral(child) ? child.value : ''
}
