import { describe, expect, it } from 'vitest';
import { evaluateFormula, formulaVariables, FormulaError, validateFormula } from './formula';

describe('formula engine', () => {
  it('respects precedence and associativity', () => {
    expect(evaluateFormula('1 + 2 * 3', {})).toBe(7);
    expect(evaluateFormula('(1 + 2) * 3', {})).toBe(9);
    expect(evaluateFormula('2 ^ 3 ^ 2', {})).toBe(512);
    expect(evaluateFormula('-2 ^ 2', {})).toBe(4);
    expect(evaluateFormula('10 / 4', {})).toBe(2.5);
    expect(evaluateFormula('7 % 3', {})).toBe(1);
  });

  it('evaluates variables and functions', () => {
    const area = evaluateFormula('(length_mm + 20) * (width_mm + 20) / 1000000', {
      length_mm: 210,
      width_mm: 148,
    });
    expect(area).toBeCloseTo(0.03864, 6);
    expect(evaluateFormula('ceil(qty / 12)', { qty: 25 })).toBe(3);
    expect(evaluateFormula('max(1, min(5, 3))', {})).toBe(3);
    expect(evaluateFormula('round(1.23456, 2)', {})).toBe(1.23);
  });

  it('lists variables', () => {
    expect(formulaVariables('a * b + ceil(c) + a').sort()).toEqual(['a', 'b', 'c']);
  });

  it('rejects unsafe or invalid input', () => {
    expect(() => evaluateFormula('process.exit(1)', {})).toThrow(FormulaError);
    expect(() => evaluateFormula('constructor', {})).toThrow(/Unknown variable/);
    expect(() => evaluateFormula('1 +', {})).toThrow(FormulaError);
    expect(() => evaluateFormula('1 / 0', {})).toThrow(/Division by zero/);
    expect(() => evaluateFormula('foo(1)', {})).toThrow(/Unknown function/);
    expect(() => evaluateFormula('1;2', {})).toThrow(/Unexpected character/);
    expect(() => evaluateFormula('', {})).toThrow(/empty/);
    expect(() => evaluateFormula('x', { x: Number.NaN })).toThrow(FormulaError);
  });

  it('does not resolve prototype properties as variables', () => {
    expect(() => evaluateFormula('toString', {})).toThrow(/Unknown variable/);
  });

  it('validates against allowed variables', () => {
    expect(validateFormula('length_mm * 2', ['length_mm'])).toBeNull();
    expect(validateFormula('depth * 2', ['length_mm'])).toMatch(/depth/);
    expect(validateFormula('2 +', [])).toMatch(/end of formula/);
  });
});
