export type TokenType =
  | 'NUMBER' | 'IDENT' | 'HAS'
  | 'AND' | 'OR' | 'NOT'
  | 'GTE' | 'LTE' | 'EQ' | 'NEQ' | 'GT' | 'LT'
  | 'PLUS' | 'MINUS' | 'STAR' | 'SLASH'
  | 'LPAREN' | 'RPAREN' | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
}

export class ExpressionError extends Error {
  constructor(message: string, source: string, position: number) {
    super(`${message}(位置 ${position}:\`${source}\`)`);
  }
}

const KEYWORDS: Record<string, TokenType> = { has: 'HAS' };

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '&' && input[i + 1] === '&') { tokens.push({ type: 'AND', value: '&&' }); i += 2; continue; }
    if (ch === '|' && input[i + 1] === '|') { tokens.push({ type: 'OR', value: '||' }); i += 2; continue; }
    if (ch === '>' && input[i + 1] === '=') { tokens.push({ type: 'GTE', value: '>=' }); i += 2; continue; }
    if (ch === '<' && input[i + 1] === '=') { tokens.push({ type: 'LTE', value: '<=' }); i += 2; continue; }
    if (ch === '=' && input[i + 1] === '=') { tokens.push({ type: 'EQ', value: '==' }); i += 2; continue; }
    if (ch === '!' && input[i + 1] === '=') { tokens.push({ type: 'NEQ', value: '!=' }); i += 2; continue; }
    if (ch === '>') { tokens.push({ type: 'GT', value: '>' }); i++; continue; }
    if (ch === '<') { tokens.push({ type: 'LT', value: '<' }); i++; continue; }
    if (ch === '!') { tokens.push({ type: 'NOT', value: '!' }); i++; continue; }
    if (ch === '+') { tokens.push({ type: 'PLUS', value: '+' }); i++; continue; }
    if (ch === '-') { tokens.push({ type: 'MINUS', value: '-' }); i++; continue; }
    if (ch === '*') { tokens.push({ type: 'STAR', value: '*' }); i++; continue; }
    if (ch === '/') { tokens.push({ type: 'SLASH', value: '/' }); i++; continue; }
    if (ch === '(') { tokens.push({ type: 'LPAREN', value: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'RPAREN', value: ')' }); i++; continue; }
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input[j])) j++;
      tokens.push({ type: 'NUMBER', value: input.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_一-龥]/.test(ch)) {
      let j = i;
      while (j < input.length && /[A-Za-z0-9_一-龥]/.test(input[j])) j++;
      const word = input.slice(i, j);
      tokens.push({ type: KEYWORDS[word] ?? 'IDENT', value: word });
      i = j;
      continue;
    }
    throw new ExpressionError(`意外的字符 "${ch}"`, input, i);
  }
  tokens.push({ type: 'EOF', value: '' });
  return tokens;
}

export type CompOp = '>=' | '<=' | '==' | '!=' | '>' | '<';

export type Expression =
  | { kind: 'or'; left: Expression; right: Expression }
  | { kind: 'and'; left: Expression; right: Expression }
  | { kind: 'not'; operand: Expression }
  | { kind: 'has'; item: string }
  | { kind: 'compare'; op: CompOp; left: NumExpr; right: NumExpr }
  | { kind: 'truthy'; operand: NumExpr };

export type NumExpr =
  | { kind: 'num'; value: number }
  | { kind: 'var'; name: string }
  | { kind: 'neg'; operand: NumExpr }
  | { kind: 'add'; left: NumExpr; right: NumExpr }
  | { kind: 'sub'; left: NumExpr; right: NumExpr }
  | { kind: 'mul'; left: NumExpr; right: NumExpr }
  | { kind: 'div'; left: NumExpr; right: NumExpr };

class TokenStream {
  private pos = 0;
  constructor(private tokens: Token[], private source: string) {}
  peek(): Token { return this.tokens[this.pos]; }
  next(): Token { return this.tokens[this.pos++]; }
  expect(type: TokenType): Token {
    const tok = this.next();
    if (tok.type !== type) this.error(`期望 ${type},实际是 "${tok.value || tok.type}"`);
    return tok;
  }
  error(message: string): never {
    throw new ExpressionError(message, this.source, this.pos);
  }
}

export function parseCondition(source: string): Expression {
  const stream = new TokenStream(tokenize(source), source);
  const expr = parseBoolOr(stream);
  stream.expect('EOF');
  return expr;
}

export function parseNumExpr(source: string): NumExpr {
  const stream = new TokenStream(tokenize(source), source);
  const expr = parseNumAdd(stream);
  stream.expect('EOF');
  return expr;
}

function parseBoolOr(s: TokenStream): Expression {
  let left = parseBoolAnd(s);
  while (s.peek().type === 'OR') {
    s.next();
    left = { kind: 'or', left, right: parseBoolAnd(s) };
  }
  return left;
}

function parseBoolAnd(s: TokenStream): Expression {
  let left = parseBoolUnary(s);
  while (s.peek().type === 'AND') {
    s.next();
    left = { kind: 'and', left, right: parseBoolUnary(s) };
  }
  return left;
}

function parseBoolUnary(s: TokenStream): Expression {
  if (s.peek().type === 'NOT') {
    s.next();
    return { kind: 'not', operand: parseBoolUnary(s) };
  }
  return parseBoolPrimary(s);
}

const COMPARE_OPS: Partial<Record<TokenType, CompOp>> = {
  GTE: '>=', LTE: '<=', EQ: '==', NEQ: '!=', GT: '>', LT: '<',
};

function parseBoolPrimary(s: TokenStream): Expression {
  if (s.peek().type === 'HAS') {
    s.next();
    const item = s.expect('IDENT').value;
    return { kind: 'has', item };
  }
  if (s.peek().type === 'LPAREN') {
    s.next();
    const inner = parseBoolOr(s);
    s.expect('RPAREN');
    return inner;
  }
  const left = parseNumAdd(s);
  const op = COMPARE_OPS[s.peek().type];
  if (op) {
    s.next();
    const right = parseNumAdd(s);
    return { kind: 'compare', op, left, right };
  }
  return { kind: 'truthy', operand: left };
}

function parseNumAdd(s: TokenStream): NumExpr {
  let left = parseNumMul(s);
  while (s.peek().type === 'PLUS' || s.peek().type === 'MINUS') {
    const op = s.next().type;
    const right = parseNumMul(s);
    left = { kind: op === 'PLUS' ? 'add' : 'sub', left, right };
  }
  return left;
}

function parseNumMul(s: TokenStream): NumExpr {
  let left = parseNumUnary(s);
  while (s.peek().type === 'STAR' || s.peek().type === 'SLASH') {
    const op = s.next().type;
    const right = parseNumUnary(s);
    left = { kind: op === 'STAR' ? 'mul' : 'div', left, right };
  }
  return left;
}

function parseNumUnary(s: TokenStream): NumExpr {
  if (s.peek().type === 'MINUS') {
    s.next();
    return { kind: 'neg', operand: parseNumUnary(s) };
  }
  return parseNumFactor(s);
}

function parseNumFactor(s: TokenStream): NumExpr {
  const tok = s.peek();
  if (tok.type === 'NUMBER') { s.next(); return { kind: 'num', value: Number(tok.value) }; }
  if (tok.type === 'IDENT') { s.next(); return { kind: 'var', name: tok.value }; }
  s.error(`期望数字或变量名,实际是 "${tok.value || tok.type}"`);
}

export interface ExprContext {
  getVar(name: string): number;
  hasItem(name: string): boolean;
}

export function evaluateExpression(expr: Expression, ctx: ExprContext): boolean {
  switch (expr.kind) {
    case 'or': return evaluateExpression(expr.left, ctx) || evaluateExpression(expr.right, ctx);
    case 'and': return evaluateExpression(expr.left, ctx) && evaluateExpression(expr.right, ctx);
    case 'not': return !evaluateExpression(expr.operand, ctx);
    case 'has': return ctx.hasItem(expr.item);
    case 'truthy': return evaluateNumExpr(expr.operand, ctx) !== 0;
    case 'compare': {
      const l = evaluateNumExpr(expr.left, ctx);
      const r = evaluateNumExpr(expr.right, ctx);
      switch (expr.op) {
        case '>=': return l >= r;
        case '<=': return l <= r;
        case '==': return l === r;
        case '!=': return l !== r;
        case '>': return l > r;
        case '<': return l < r;
      }
    }
  }
}

export function evaluateNumExpr(expr: NumExpr, ctx: ExprContext): number {
  switch (expr.kind) {
    case 'num': return expr.value;
    case 'var': return ctx.getVar(expr.name);
    case 'neg': return -evaluateNumExpr(expr.operand, ctx);
    case 'add': return evaluateNumExpr(expr.left, ctx) + evaluateNumExpr(expr.right, ctx);
    case 'sub': return evaluateNumExpr(expr.left, ctx) - evaluateNumExpr(expr.right, ctx);
    case 'mul': return evaluateNumExpr(expr.left, ctx) * evaluateNumExpr(expr.right, ctx);
    case 'div': return evaluateNumExpr(expr.left, ctx) / evaluateNumExpr(expr.right, ctx);
  }
}
