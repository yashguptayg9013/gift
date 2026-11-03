/**
 * Safe arithmetic formula engine used for configurable BOM quantities.
 *
 * Grammar (recursive descent, no eval):
 *   expr    := term (('+' | '-') term)*
 *   term    := power (('*' | '/' | '%') power)*
 *   power   := unary ('^' power)?          (right associative)
 *   unary   := ('-' | '+') unary | primary
 *   primary := number | identifier | identifier '(' args ')' | '(' expr ')'
 *
 * Identifiers are [a-zA-Z_][a-zA-Z0-9_]* and resolve to variables supplied at
 * evaluation time (e.g. SKU attributes such as length_mm, width_mm and the order qty).
 */

export class FormulaError extends Error {
  constructor(
    message: string,
    public readonly position?: number,
  ) {
    super(message);
    this.name = 'FormulaError';
  }
}

type Token =
  | { kind: 'num'; value: number; pos: number }
  | { kind: 'id'; value: string; pos: number }
  | { kind: 'op'; value: string; pos: number }
  | { kind: 'eof'; pos: number };

export type FormulaNode =
  | { type: 'num'; value: number }
  | { type: 'var'; name: string }
  | { type: 'unary'; op: '-' | '+'; arg: FormulaNode }
  | { type: 'bin'; op: string; left: FormulaNode; right: FormulaNode }
  | { type: 'call'; fn: string; args: FormulaNode[] };

const FUNCTIONS: Record<string, { min: number; max: number; fn: (...a: number[]) => number }> = {
  min: { min: 1, max: 20, fn: Math.min },
  max: { min: 1, max: 20, fn: Math.max },
  ceil: { min: 1, max: 1, fn: Math.ceil },
  floor: { min: 1, max: 1, fn: Math.floor },
  abs: { min: 1, max: 1, fn: Math.abs },
  sqrt: { min: 1, max: 1, fn: Math.sqrt },
  round: {
    min: 1,
    max: 2,
    fn: (v: number, d = 0) => {
      const f = 10 ** d;
      return Math.round(v * f) / f;
    },
  },
};

export const FORMULA_FUNCTIONS = Object.keys(FUNCTIONS);
const MAX_LENGTH = 500;

function tokenize(src: string): Token[] {
  if (src.length > MAX_LENGTH) throw new FormulaError(`Formula is longer than ${MAX_LENGTH} characters`);
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n') {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const start = i;
      while (i < src.length && /[0-9.]/.test(src[i])) i++;
      if (i < src.length && /[eE]/.test(src[i])) {
        i++;
        if (/[+-]/.test(src[i] ?? '')) i++;
        while (i < src.length && /[0-9]/.test(src[i])) i++;
      }
      const text = src.slice(start, i);
      const value = Number(text);
      if (!Number.isFinite(value) || (text.match(/\./g) ?? []).length > 1) {
        throw new FormulaError(`Invalid number "${text}"`, start);
      }
      tokens.push({ kind: 'num', value, pos: start });
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      const start = i;
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) i++;
      tokens.push({ kind: 'id', value: src.slice(start, i), pos: start });
      continue;
    }
    if ('+-*/%^(),'.includes(c)) {
      tokens.push({ kind: 'op', value: c, pos: i });
      i++;
      continue;
    }
    throw new FormulaError(`Unexpected character "${c}"`, i);
  }
  tokens.push({ kind: 'eof', pos: src.length });
  return tokens;
}

export function parseFormula(src: string): FormulaNode {
  const tokens = tokenize(src);
  let p = 0;
  let depth = 0;
  const peek = () => tokens[p];
  const isOp = (v: string) => {
    const t = tokens[p];
    return t.kind === 'op' && t.value === v;
  };
  const expectOp = (v: string) => {
    if (!isOp(v)) throw new FormulaError(`Expected "${v}"`, peek().pos);
    p++;
  };

  function expr(): FormulaNode {
    if (++depth > 100) throw new FormulaError('Formula is nested too deeply');
    let node = term();
    while (isOp('+') || isOp('-')) {
      const op = (tokens[p++] as { value: string }).value;
      node = { type: 'bin', op, left: node, right: term() };
    }
    depth--;
    return node;
  }
  function term(): FormulaNode {
    let node = power();
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = (tokens[p++] as { value: string }).value;
      node = { type: 'bin', op, left: node, right: power() };
    }
    return node;
  }
  function power(): FormulaNode {
    const base = unary();
    if (isOp('^')) {
      p++;
      return { type: 'bin', op: '^', left: base, right: power() };
    }
    return base;
  }
  function unary(): FormulaNode {
    if (isOp('-') || isOp('+')) {
      const op = (tokens[p++] as { value: string }).value as '-' | '+';
      return { type: 'unary', op, arg: unary() };
    }
    return primary();
  }
  function primary(): FormulaNode {
    const t = peek();
    if (t.kind === 'num') {
      p++;
      return { type: 'num', value: t.value };
    }
    if (t.kind === 'id') {
      p++;
      if (isOp('(')) {
        p++;
        const fnName = t.value.toLowerCase();
        const def = FUNCTIONS[fnName];
        if (!def) throw new FormulaError(`Unknown function "${t.value}"`, t.pos);
        const args: FormulaNode[] = [];
        if (!isOp(')')) {
          args.push(expr());
          while (isOp(',')) {
            p++;
            args.push(expr());
          }
        }
        expectOp(')');
        if (args.length < def.min || args.length > def.max) {
          throw new FormulaError(`Function "${fnName}" takes ${def.min}–${def.max} arguments`, t.pos);
        }
        return { type: 'call', fn: fnName, args };
      }
      return { type: 'var', name: t.value };
    }
    if (t.kind === 'op' && t.value === '(') {
      p++;
      const inner = expr();
      expectOp(')');
      return inner;
    }
    throw new FormulaError(t.kind === 'eof' ? 'Unexpected end of formula' : `Unexpected "${(t as { value: string }).value}"`, t.pos);
  }

  if (peek().kind === 'eof') throw new FormulaError('Formula is empty');
  const ast = expr();
  if (peek().kind !== 'eof') throw new FormulaError('Unexpected trailing input', peek().pos);
  return ast;
}

export function formulaVariables(src: string | FormulaNode): string[] {
  const ast = typeof src === 'string' ? parseFormula(src) : src;
  const out = new Set<string>();
  const walk = (n: FormulaNode) => {
    switch (n.type) {
      case 'var':
        out.add(n.name);
        break;
      case 'unary':
        walk(n.arg);
        break;
      case 'bin':
        walk(n.left);
        walk(n.right);
        break;
      case 'call':
        n.args.forEach(walk);
        break;
    }
  };
  walk(ast);
  return [...out];
}

export function evaluateFormula(src: string | FormulaNode, vars: Record<string, number>): number {
  const ast = typeof src === 'string' ? parseFormula(src) : src;
  const ev = (n: FormulaNode): number => {
    switch (n.type) {
      case 'num':
        return n.value;
      case 'var': {
        if (!Object.prototype.hasOwnProperty.call(vars, n.name)) {
          throw new FormulaError(`Unknown variable "${n.name}"`);
        }
        const v = Number(vars[n.name]);
        if (!Number.isFinite(v)) throw new FormulaError(`Variable "${n.name}" is not a number`);
        return v;
      }
      case 'unary':
        return n.op === '-' ? -ev(n.arg) : ev(n.arg);
      case 'call':
        return FUNCTIONS[n.fn].fn(...n.args.map(ev));
      case 'bin': {
        const l = ev(n.left);
        const r = ev(n.right);
        switch (n.op) {
          case '+':
            return l + r;
          case '-':
            return l - r;
          case '*':
            return l * r;
          case '/':
            if (r === 0) throw new FormulaError('Division by zero');
            return l / r;
          case '%':
            if (r === 0) throw new FormulaError('Division by zero');
            return l % r;
          case '^':
            return l ** r;
        }
      }
    }
    throw new FormulaError('Invalid formula node');
  };
  const result = ev(ast);
  if (!Number.isFinite(result)) throw new FormulaError('Formula result is not a finite number');
  return result;
}

/** Validate a formula against an allowed variable list. Returns null when valid. */
export function validateFormula(src: string, allowedVariables: string[]): string | null {
  try {
    const vars = formulaVariables(src);
    const unknown = vars.filter((v) => !allowedVariables.includes(v));
    if (unknown.length) return `Unknown variable(s): ${unknown.join(', ')}`;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
