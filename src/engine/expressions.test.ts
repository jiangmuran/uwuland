import { describe, it, expect } from 'vitest';
import {
  parseCondition,
  parseNumExpr,
  evaluateExpression,
  evaluateNumExpr,
  ExpressionError,
  type ExprContext,
} from './expressions';

const ctx: ExprContext = {
  getVar: (name) => ({ affinity_bird: 3, low: 1 } as Record<string, number>)[name] ?? 0,
  hasItem: (name) => name === 'key',
};

describe('parseCondition + evaluateExpression', () => {
  it('evaluates simple comparisons', () => {
    expect(evaluateExpression(parseCondition('affinity_bird >= 2'), ctx)).toBe(true);
    expect(evaluateExpression(parseCondition('affinity_bird >= 5'), ctx)).toBe(false);
  });

  it('evaluates has-item checks', () => {
    expect(evaluateExpression(parseCondition('has key'), ctx)).toBe(true);
    expect(evaluateExpression(parseCondition('has flashlight'), ctx)).toBe(false);
  });

  it('combines with && and ||', () => {
    expect(evaluateExpression(parseCondition('affinity_bird>=2 && has key'), ctx)).toBe(true);
    expect(evaluateExpression(parseCondition('affinity_bird>=9 || has key'), ctx)).toBe(true);
    expect(evaluateExpression(parseCondition('affinity_bird>=9 || has flashlight'), ctx)).toBe(false);
  });

  it('gives && higher precedence than ||', () => {
    expect(evaluateExpression(parseCondition('low>5 || affinity_bird>=2 && has flashlight'), ctx)).toBe(false);
  });

  it('supports ! negation and parens', () => {
    expect(evaluateExpression(parseCondition('!(has flashlight)'), ctx)).toBe(true);
    expect(evaluateExpression(parseCondition('!has flashlight && has key'), ctx)).toBe(true);
  });

  it('treats a bare identifier as a truthy check', () => {
    expect(evaluateExpression(parseCondition('affinity_bird'), ctx)).toBe(true);
    expect(evaluateExpression(parseCondition('missing_flag'), ctx)).toBe(false);
  });

  it('throws ExpressionError on malformed input', () => {
    expect(() => parseCondition('affinity_bird >=')).toThrow(ExpressionError);
    expect(() => parseCondition('affinity_bird >= 2 extra')).toThrow(ExpressionError);
  });
});

describe('parseNumExpr + evaluateNumExpr', () => {
  it('evaluates arithmetic with correct precedence', () => {
    expect(evaluateNumExpr(parseNumExpr('1+2*3'), ctx)).toBe(7);
    expect(evaluateNumExpr(parseNumExpr('affinity_bird+1'), ctx)).toBe(4);
  });

  it('supports unary minus', () => {
    expect(evaluateNumExpr(parseNumExpr('-3+5'), ctx)).toBe(2);
    expect(evaluateNumExpr(parseNumExpr('5 - -3'), ctx)).toBe(8);
  });
});
