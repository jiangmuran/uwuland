# UWULAND 引擎核心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 TypeScript 从零实现 UWULAND 新引擎的核心逻辑层(词法分析/解析/状态/存档/解释器),完全不依赖浏览器 DOM,可脱离 UI 独立跑通并通过 Vitest 单元测试。

**Architecture:** 六个职责单一的模块——`expressions.ts`(条件/数值表达式的词法分析+递归下降解析+求值)、`ui-port.ts`(引擎与未来 UI 层之间的契约接口)、`parser.ts`(脚本文本→AST,处理 `!if/!elif/!else/!endif` 嵌套)、`state.ts`(`GameState`:变量/背包/章节入口快照)、`save.ts`(localStorage 序列化)、`interpreter.ts`(walks AST,驱动 `GameState` 和 `UIPort`,处理存档续读的重放逻辑)。全部代码位于 `src/engine/`,不 import 任何 DOM API,方便测试。

**Tech Stack:** TypeScript 5, Vite(仅用于承载 Vitest 配置,本计划不涉及打包/HTML), Vitest。

## Global Constraints

- 技术栈固定为 TypeScript + Vite 静态产物,不引入 React/Vue 等前端框架。
- 不做云存档/账号系统,纯前端 `localStorage`。
- 旧版(v1.30 及更早)存档允许在新引擎下作废,不做迁移;加载失败时按"无存档"处理,不抛错崩溃。
- 新增 DSL 指令必须向后兼容现有 `!pause/!load/!exit/!pick/!head/!clear/!wait` 写法和 `*`(small)/`^`(big)/`&`(italic) 文本标记。
- 本计划**不修改**现有 `game-engine.js`/`ee-main.js`/`drama-init.js`/`index.html`/`style.css`——线上游戏在后续"渲染层"计划接入新引擎前必须保持可用。

## 本计划在整体重构中的位置

这是 5 份顺序计划中的第 1 份(spec: `docs/superpowers/specs/2026-07-05-uwuland-engine-rewrite-design.md`)。完成标志:`npm test` 全绿,且 Task 6 的集成测试证明"解析脚本→执行→变量/背包变化→存档→重新加载续读"整条链路是正确的。后续计划(桌面渲染层、移动端布局、谜题框架、内容强化)都会 import 本计划产出的模块。

---

### Task 1: 项目脚手架 + 表达式引擎(`expressions.ts`)

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `.gitignore`
- Create: `src/engine/expressions.ts`
- Test: `src/engine/expressions.test.ts`

**Interfaces:**
- Produces: `parseCondition(source: string): Expression`、`parseNumExpr(source: string): NumExpr`、`evaluateExpression(expr: Expression, ctx: ExprContext): boolean`、`evaluateNumExpr(expr: NumExpr, ctx: ExprContext): number`、`ExpressionError`、`interface ExprContext { getVar(name: string): number; hasItem(name: string): boolean }`——这是后续所有任务(parser/state/interpreter)都会用到的表达式子系统。

- [ ] **Step 1: 初始化 npm 项目**

创建 `package.json`:

```json
{
  "name": "uwuland",
  "private": true,
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: 安装依赖**

Run: `npm install -D typescript vite vitest`

Expected: `node_modules/` 生成,`package.json` 的 `devDependencies` 里出现 `typescript`/`vite`/`vitest`。

- [ ] **Step 3: 写 `.gitignore`**

```
node_modules/
dist/
```

- [ ] **Step 4: 写 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src"]
}
```

- [ ] **Step 5: 写 `vite.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 6: 写失败测试 `src/engine/expressions.test.ts`**

```ts
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
```

- [ ] **Step 7: 跑测试,确认失败**

Run: `npx vitest run src/engine/expressions.test.ts`
Expected: FAIL,报错找不到模块 `./expressions`。

- [ ] **Step 8: 实现 `src/engine/expressions.ts`**

```ts
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
```

- [ ] **Step 9: 跑测试,确认通过**

Run: `npx vitest run src/engine/expressions.test.ts`
Expected: PASS,9 个测试全绿。

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts .gitignore src/engine/expressions.ts src/engine/expressions.test.ts
git commit -m "feat: scaffold TS/Vite project, add expression engine"
```

---

### Task 2: 脚本解析器(`parser.ts`)

**Files:**
- Create: `src/engine/ui-port.ts`
- Create: `src/engine/parser.ts`
- Test: `src/engine/parser.test.ts`

**Interfaces:**
- Consumes: `parseCondition`, `parseNumExpr`, `Expression`, `NumExpr` from `./expressions`(Task 1)。
- Produces: `TextStyle`、`UIPort`(接口,供 Task 5 及后续 UI 层实现)、`ScriptNode`(判别联合类型)、`IfBranch`、`ScriptParseError`、`parseScript(text: string): ScriptNode[]`——`ScriptNode` 的每个 kind 是后续 `interpreter.ts` 必须处理的完整列表。

- [ ] **Step 1: 写 `src/engine/ui-port.ts`**

```ts
export type TextStyle = 'normal' | 'small' | 'big' | 'italic';

export interface UIPort {
  showText(text: string, style: TextStyle): Promise<void>;
  showChoices(options: string[]): Promise<number>;
  setHead(value: string): void;
  clearText(): void;
  wait(ms: number): Promise<void>;
  pause(): Promise<void>;
  runPuzzle(name: string): Promise<Record<string, number | boolean>>;
}
```

- [ ] **Step 2: 写失败测试 `src/engine/parser.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { parseScript, ScriptParseError } from './parser';

describe('parseScript: 文本行与标记', () => {
  it('parses a plain text line', () => {
    const nodes = parseScript('hello');
    expect(nodes).toEqual([{ kind: 'text', text: 'hello', style: 'normal' }]);
  });

  it('parses *^& style markers', () => {
    expect(parseScript('*small')[0]).toEqual({ kind: 'text', text: 'small', style: 'small' });
    expect(parseScript('^big')[0]).toEqual({ kind: 'text', text: 'big', style: 'big' });
    expect(parseScript('&italic')[0]).toEqual({ kind: 'text', text: 'italic', style: 'italic' });
  });

  it('unescapes a leading \\! as literal text', () => {
    expect(parseScript('\\!not a command')[0]).toEqual({ kind: 'text', text: '!not a command', style: 'normal' });
  });
});

describe('parseScript: 简单指令', () => {
  it('parses !pause / !exit / !clear', () => {
    expect(parseScript('!pause')[0]).toEqual({ kind: 'pause' });
    expect(parseScript('!exit')[0]).toEqual({ kind: 'exit' });
    expect(parseScript('!clear')[0]).toEqual({ kind: 'clear' });
  });

  it('parses !load and !head with args', () => {
    expect(parseScript('!load 二、灰色的屋')[0]).toEqual({ kind: 'load', target: '二、灰色的屋' });
    expect(parseScript('!head #4f0')[0]).toEqual({ kind: 'head', value: '#4f0' });
  });

  it('parses !wait with a numeric arg, rejects non-numeric', () => {
    expect(parseScript('!wait 500')[0]).toEqual({ kind: 'wait', ms: 500 });
    expect(() => parseScript('!wait soon')).toThrow(ScriptParseError);
  });

  it('rejects unknown commands', () => {
    expect(() => parseScript('!frobnicate')).toThrow(ScriptParseError);
  });
});

describe('parseScript: !set / !stat / !flag / !item / !puzzle', () => {
  it('parses !set with a numeric expression', () => {
    const node = parseScript('!set total=affinity_bird+1')[0];
    expect(node.kind).toBe('set');
    if (node.kind === 'set') {
      expect(node.name).toBe('total');
      expect(node.expr).toEqual({ kind: 'add', left: { kind: 'var', name: 'affinity_bird' }, right: { kind: 'num', value: 1 } });
    }
  });

  it('parses !stat +/-/=', () => {
    expect(parseScript('!stat affinity_bird +1')[0]).toEqual({ kind: 'stat', name: 'affinity_bird', op: '+', amount: 1 });
    expect(parseScript('!stat affinity_bird -2')[0]).toEqual({ kind: 'stat', name: 'affinity_bird', op: '-', amount: 2 });
    expect(parseScript('!stat affinity_bird =0')[0]).toEqual({ kind: 'stat', name: 'affinity_bird', op: '=', amount: 0 });
  });

  it('parses !flag / !unflag', () => {
    expect(parseScript('!flag met_bird')[0]).toEqual({ kind: 'flag', name: 'met_bird' });
    expect(parseScript('!unflag met_bird')[0]).toEqual({ kind: 'unflag', name: 'met_bird' });
  });

  it('parses !item add / remove', () => {
    expect(parseScript('!item add key')[0]).toEqual({ kind: 'itemAdd', name: 'key' });
    expect(parseScript('!item remove key')[0]).toEqual({ kind: 'itemRemove', name: 'key' });
  });

  it('parses !puzzle', () => {
    expect(parseScript('!puzzle base64decode')[0]).toEqual({ kind: 'puzzle', name: 'base64decode' });
  });
});

describe('parseScript: !pick', () => {
  it('parses a single-option pick with no condition (backward compatible)', () => {
    const node = parseScript('!pick 进入下一节 二、灰色的屋')[0];
    expect(node).toEqual({
      kind: 'pick',
      options: ['进入下一节'],
      targets: ['二、灰色的屋'],
      conditions: [null],
    });
  });

  it('parses a multi-option pick with :: conditions', () => {
    const node = parseScript('!pick 开门|绕路 目标A|目标B :: has key|true')[0];
    expect(node.kind).toBe('pick');
    if (node.kind === 'pick') {
      expect(node.options).toEqual(['开门', '绕路']);
      expect(node.targets).toEqual(['目标A', '目标B']);
      expect(node.conditions[0]).toEqual({ kind: 'has', item: 'key' });
      expect(node.conditions[1]).toBeNull();
    }
  });

  it('rejects mismatched option/target counts', () => {
    expect(() => parseScript('!pick a|b 目标A')).toThrow(ScriptParseError);
  });

  it('does not split a condition on the || operator itself', () => {
    const node = parseScript('!pick a|b 目标A|目标B :: has key || has flashlight|true')[0];
    expect(node.kind).toBe('pick');
    if (node.kind === 'pick') {
      expect(node.conditions[0]).toEqual({
        kind: 'or',
        left: { kind: 'has', item: 'key' },
        right: { kind: 'has', item: 'flashlight' },
      });
      expect(node.conditions[1]).toBeNull();
    }
  });
});

describe('parseScript: !if/!elif/!else/!endif', () => {
  it('parses a simple if/else', () => {
    const nodes = parseScript(['!if affinity_bird>=2', 'good', '!else', 'bad', '!endif'].join('\n'));
    expect(nodes).toHaveLength(1);
    const node = nodes[0];
    expect(node.kind).toBe('if');
    if (node.kind === 'if') {
      expect(node.branches).toHaveLength(1);
      expect(node.branches[0].body).toEqual([{ kind: 'text', text: 'good', style: 'normal' }]);
      expect(node.elseBody).toEqual([{ kind: 'text', text: 'bad', style: 'normal' }]);
    }
  });

  it('parses if/elif/elif/else', () => {
    const nodes = parseScript(
      ['!if a>=3', 'high', '!elif a>=1', 'mid', '!else', 'low', '!endif'].join('\n'),
    );
    const node = nodes[0];
    if (node.kind === 'if') {
      expect(node.branches).toHaveLength(2);
      expect(node.branches[1].body).toEqual([{ kind: 'text', text: 'mid', style: 'normal' }]);
      expect(node.elseBody).toEqual([{ kind: 'text', text: 'low', style: 'normal' }]);
    }
  });

  it('parses nested if blocks', () => {
    const nodes = parseScript(
      ['!if a', 'outer', '!if b', 'inner', '!endif', '!endif'].join('\n'),
    );
    const outer = nodes[0];
    expect(outer.kind).toBe('if');
    if (outer.kind === 'if') {
      expect(outer.branches[0].body).toHaveLength(2);
      expect(outer.branches[0].body[1].kind).toBe('if');
    }
  });

  it('parses text/commands after an if block resumes at the top level', () => {
    const nodes = parseScript(['!if a', 'x', '!endif', 'after'].join('\n'));
    expect(nodes).toHaveLength(2);
    expect(nodes[1]).toEqual({ kind: 'text', text: 'after', style: 'normal' });
  });

  it('throws when !endif is missing', () => {
    expect(() => parseScript(['!if a', 'x'].join('\n'))).toThrow(ScriptParseError);
  });
});
```

- [ ] **Step 3: 跑测试,确认失败**

Run: `npx vitest run src/engine/parser.test.ts`
Expected: FAIL,找不到模块 `./parser`。

- [ ] **Step 4: 实现 `src/engine/parser.ts`**

```ts
import { parseCondition, parseNumExpr, type Expression, type NumExpr } from './expressions';
import type { TextStyle } from './ui-port';

export class ScriptParseError extends Error {
  constructor(message: string, line: number) {
    super(`第 ${line + 1} 行:${message}`);
  }
}

export interface IfBranch {
  condition: Expression;
  body: ScriptNode[];
}

export type ScriptNode =
  | { kind: 'text'; text: string; style: TextStyle }
  | { kind: 'pause' }
  | { kind: 'load'; target: string }
  | { kind: 'exit' }
  | { kind: 'pick'; options: string[]; targets: string[]; conditions: (Expression | null)[] }
  | { kind: 'head'; value: string }
  | { kind: 'clear' }
  | { kind: 'wait'; ms: number }
  | { kind: 'set'; name: string; expr: NumExpr }
  | { kind: 'stat'; name: string; op: '+' | '-' | '='; amount: number }
  | { kind: 'flag'; name: string }
  | { kind: 'unflag'; name: string }
  | { kind: 'itemAdd'; name: string }
  | { kind: 'itemRemove'; name: string }
  | { kind: 'puzzle'; name: string }
  | { kind: 'if'; branches: IfBranch[]; elseBody: ScriptNode[] | null };

export function parseScript(text: string): ScriptNode[] {
  const lines = text.split('\n').map(stripCR);
  const { nodes, nextIndex } = parseBlock(lines, 0, new Set());
  if (nextIndex < lines.length) {
    throw new ScriptParseError(`多余的 "${lines[nextIndex]}"`, nextIndex);
  }
  return nodes;
}

function stripCR(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}

interface BlockResult {
  nodes: ScriptNode[];
  nextIndex: number;
}

function commandWord(line: string): string {
  return line.startsWith('!') ? line.slice(1).split(' ')[0].toLowerCase() : '';
}

function parseBlock(lines: string[], start: number, stopWords: Set<string>): BlockResult {
  const nodes: ScriptNode[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    const word = commandWord(line);
    if (line.startsWith('!') && stopWords.has(word)) {
      return { nodes, nextIndex: i };
    }
    if (word === 'if') {
      const result = parseIfBlock(lines, i);
      nodes.push(result.node);
      i = result.nextIndex;
      continue;
    }
    nodes.push(parseLine(line, i));
    i++;
  }
  return { nodes, nextIndex: i };
}

function parseIfBlock(lines: string[], start: number): { node: ScriptNode; nextIndex: number } {
  const branches: IfBranch[] = [];
  let elseBody: ScriptNode[] | null = null;
  let condText = lines[start].slice('!if '.length).trim();
  let i = start + 1;

  for (;;) {
    const { nodes, nextIndex } = parseBlock(lines, i, new Set(['elif', 'else', 'endif']));
    branches.push({ condition: parseCondition(condText), body: nodes });
    i = nextIndex;
    if (i >= lines.length) throw new ScriptParseError('缺少 !endif', start);
    const word = commandWord(lines[i]);
    if (word === 'elif') {
      condText = lines[i].slice('!elif '.length).trim();
      i++;
      continue;
    }
    if (word === 'else') {
      i++;
      const elseResult = parseBlock(lines, i, new Set(['endif']));
      elseBody = elseResult.nodes;
      i = elseResult.nextIndex;
    }
    i++; // consume !endif
    break;
  }

  return { node: { kind: 'if', branches, elseBody }, nextIndex: i };
}

const STYLE_MARKERS: Record<string, TextStyle> = { '*': 'small', '^': 'big', '&': 'italic' };

function parseTextLine(text: string): ScriptNode {
  for (const marker of Object.keys(STYLE_MARKERS)) {
    if (text.startsWith(marker)) {
      return { kind: 'text', text: text.slice(1), style: STYLE_MARKERS[marker] };
    }
  }
  return { kind: 'text', text, style: 'normal' };
}

function parseLine(line: string, lineNo: number): ScriptNode {
  if (line.startsWith('\\!')) return parseTextLine(line.slice(1));
  if (!line.startsWith('!')) return parseTextLine(line);

  const commandText = line.slice(1);
  const spaceIdx = commandText.indexOf(' ');
  const command = (spaceIdx === -1 ? commandText : commandText.slice(0, spaceIdx)).toLowerCase();
  const args = spaceIdx === -1 ? '' : commandText.slice(spaceIdx + 1);

  switch (command) {
    case 'pause': return { kind: 'pause' };
    case 'load': return { kind: 'load', target: args };
    case 'exit': return { kind: 'exit' };
    case 'head': return { kind: 'head', value: args };
    case 'clear': return { kind: 'clear' };
    case 'wait': {
      const ms = Number(args);
      if (Number.isNaN(ms)) throw new ScriptParseError(`!wait 的参数必须是数字,实际是 "${args}"`, lineNo);
      return { kind: 'wait', ms };
    }
    case 'pick': return parsePick(args, lineNo);
    case 'set': return parseSet(args, lineNo);
    case 'stat': return parseStat(args, lineNo);
    case 'flag': return { kind: 'flag', name: args };
    case 'unflag': return { kind: 'unflag', name: args };
    case 'item': return parseItem(args, lineNo);
    case 'puzzle': return { kind: 'puzzle', name: args };
    default:
      throw new ScriptParseError(`未知指令 "!${command}"`, lineNo);
  }
}

function parsePick(args: string, lineNo: number): ScriptNode {
  // 不能简单 args.split(' '):"::" 之后的条件表达式自己可能带空格(如 "has key",
  // 或 "affinity_bird >= 2 && has key"),所以只切前两段(选项/目标),
  // 剩下的整段原样交给 parseCondition。
  const trimmed = args.trim();
  const firstSpace = trimmed.indexOf(' ');
  if (firstSpace === -1) {
    throw new ScriptParseError(`!pick 至少需要"选项 目标"两部分,实际是 "${args}"`, lineNo);
  }
  const optionsPart = trimmed.slice(0, firstSpace);
  const rest = trimmed.slice(firstSpace + 1).trimStart();

  const secondSpace = rest.indexOf(' ');
  const targetsPart = secondSpace === -1 ? rest : rest.slice(0, secondSpace);
  const remainder = secondSpace === -1 ? '' : rest.slice(secondSpace + 1).trim();

  const options = optionsPart.split('|');
  const targets = targetsPart.split('|');
  if (targets.length !== options.length) {
    throw new ScriptParseError(`!pick 的选项数(${options.length})和目标数(${targets.length})不一致`, lineNo);
  }

  let condStrings: string[] = [];
  if (remainder) {
    if (!remainder.startsWith('::')) {
      throw new ScriptParseError(`!pick 的第三部分必须以 "::" 开头,实际是 "${remainder}"`, lineNo);
    }
    // 用 lookaround 而不是普通 split('|'):条件表达式自己可能含 "||"(布尔 or),
    // 这里只在"单个、不属于 ||"的 | 上切分,不能拆散条件表达式内部的 ||。
    condStrings = remainder.slice(2).trim().split(/(?<!\|)\|(?!\|)/);
  }

  const conditions = options.map((_, idx) => {
    const condStr = condStrings[idx]?.trim();
    if (!condStr || condStr === 'true') return null;
    return parseCondition(condStr);
  });
  return { kind: 'pick', options, targets, conditions };
}

function parseSet(args: string, lineNo: number): ScriptNode {
  const eqIdx = args.indexOf('=');
  if (eqIdx === -1) throw new ScriptParseError(`!set 需要写成 name=expr,实际是 "${args}"`, lineNo);
  const name = args.slice(0, eqIdx).trim();
  const exprText = args.slice(eqIdx + 1).trim();
  return { kind: 'set', name, expr: parseNumExpr(exprText) };
}

function parseStat(args: string, lineNo: number): ScriptNode {
  const match = /^(\S+)\s+([+\-=])(\d+(?:\.\d+)?)$/.exec(args.trim());
  if (!match) throw new ScriptParseError(`!stat 需要写成 "name +N" / "name -N" / "name =N",实际是 "${args}"`, lineNo);
  const [, name, op, amountStr] = match;
  return { kind: 'stat', name, op: op as '+' | '-' | '=', amount: Number(amountStr) };
}

function parseItem(args: string, lineNo: number): ScriptNode {
  const [action, name] = args.split(' ');
  if (action === 'add') return { kind: 'itemAdd', name };
  if (action === 'remove') return { kind: 'itemRemove', name };
  throw new ScriptParseError(`!item 需要写成 "add name" 或 "remove name",实际是 "${args}"`, lineNo);
}
```

- [ ] **Step 5: 跑测试,确认通过**

Run: `npx vitest run src/engine/parser.test.ts`
Expected: PASS,全部用例通过。

- [ ] **Step 6: Commit**

```bash
git add src/engine/ui-port.ts src/engine/parser.ts src/engine/parser.test.ts
git commit -m "feat: add script parser with !if/!set/!stat/!flag/!item/!puzzle support"
```

---

### Task 3: 游戏状态(`state.ts`)

**Files:**
- Create: `src/engine/state.ts`
- Test: `src/engine/state.test.ts`

**Interfaces:**
- Consumes: `ExprContext` from `./expressions`(Task 1)——`GameState` 实现这个接口,使它能直接传给 `evaluateExpression`/`evaluateNumExpr`。
- Produces: `class GameState`(实现 `ExprContext`)、`interface SaveData`——供 Task 4(`save.ts`)和 Task 5(`interpreter.ts`)使用。方法:`getVar`/`setVar`/`hasItem`/`addItem`/`removeItem`/`enterChapter`/`toSaveData`/`GameState.fromSaveData`(静态方法)。

**设计说明**:spec 里把"数值变量"和"布尔 flag"描述成两个独立的状态集合(`vars`/`flags`),这里在实现上把 flag 统一收进 `vars`(`!flag x` 等价于 `!set x=1`,`!unflag x` 等价于 `!set x=0`)——对外行为(条件判断、`!stat`/`!flag`/`!item` 指令、存档)完全符合 spec 描述,只是内部少一个 `Set<string>`,存档结构也更简单。

- [ ] **Step 1: 写失败测试 `src/engine/state.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { GameState } from './state';

describe('GameState: 变量与背包', () => {
  it('defaults unset vars to 0 and unset items to absent', () => {
    const state = new GameState();
    expect(state.getVar('affinity_bird')).toBe(0);
    expect(state.hasItem('key')).toBe(false);
  });

  it('sets and reads vars', () => {
    const state = new GameState();
    state.setVar('affinity_bird', 3);
    expect(state.getVar('affinity_bird')).toBe(3);
  });

  it('adds and removes items', () => {
    const state = new GameState();
    state.addItem('key');
    expect(state.hasItem('key')).toBe(true);
    state.removeItem('key');
    expect(state.hasItem('key')).toBe(false);
  });
});

describe('GameState: 章节入口快照', () => {
  it('enterChapter resets pauseIndex and captures an entry snapshot', () => {
    const state = new GameState();
    state.setVar('affinity_bird', 1);
    state.pauseIndex = 5;
    state.enterChapter('二、灰色的屋');
    expect(state.chapter).toBe('二、灰色的屋');
    expect(state.pauseIndex).toBe(0);

    // 章节入口之后对当前状态的修改,不应该影响"入口快照"
    state.setVar('affinity_bird', 99);
    const saved = state.toSaveData('2026-07-06 12:00:00');
    expect(saved.entryVars.affinity_bird).toBe(1);
  });
});

describe('GameState.fromSaveData / toSaveData 往返', () => {
  it('reconstructs a GameState at chapter-entry from saved data', () => {
    const original = new GameState();
    original.setVar('affinity_bird', 2);
    original.addItem('key');
    original.enterChapter('三、绿色的门');
    original.pauseIndex = 4;

    const saved = original.toSaveData('2026-07-06 12:00:00');
    expect(saved).toEqual({
      chapter: '三、绿色的门',
      pauseIndex: 4,
      entryVars: { affinity_bird: 2 },
      entryInventory: ['key'],
      time: '2026-07-06 12:00:00',
    });

    const restored = GameState.fromSaveData(saved);
    expect(restored.chapter).toBe('三、绿色的门');
    expect(restored.pauseIndex).toBe(0);
    expect(restored.getVar('affinity_bird')).toBe(2);
    expect(restored.hasItem('key')).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `npx vitest run src/engine/state.test.ts`
Expected: FAIL,找不到模块 `./state`。

- [ ] **Step 3: 实现 `src/engine/state.ts`**

```ts
import type { ExprContext } from './expressions';

export interface SaveData {
  chapter: string;
  pauseIndex: number;
  entryVars: Record<string, number>;
  entryInventory: string[];
  time: string;
}

export class GameState implements ExprContext {
  chapter = '';
  pauseIndex = 0;
  head = '#eee';
  private vars: Map<string, number>;
  private inventory: Set<string>;
  private entryVars: Map<string, number>;
  private entryInventory: Set<string>;

  constructor(init?: { vars?: Record<string, number>; inventory?: string[] }) {
    this.vars = new Map(Object.entries(init?.vars ?? {}));
    this.inventory = new Set(init?.inventory ?? []);
    this.entryVars = new Map(this.vars);
    this.entryInventory = new Set(this.inventory);
  }

  getVar(name: string): number {
    return this.vars.get(name) ?? 0;
  }

  setVar(name: string, value: number): void {
    this.vars.set(name, value);
  }

  hasItem(name: string): boolean {
    return this.inventory.has(name);
  }

  addItem(name: string): void {
    this.inventory.add(name);
  }

  removeItem(name: string): void {
    this.inventory.delete(name);
  }

  enterChapter(chapter: string): void {
    this.chapter = chapter;
    this.pauseIndex = 0;
    this.entryVars = new Map(this.vars);
    this.entryInventory = new Set(this.inventory);
  }

  toSaveData(time: string): SaveData {
    return {
      chapter: this.chapter,
      pauseIndex: this.pauseIndex,
      entryVars: Object.fromEntries(this.entryVars),
      entryInventory: [...this.entryInventory],
      time,
    };
  }

  static fromSaveData(data: SaveData): GameState {
    const state = new GameState({ vars: data.entryVars, inventory: data.entryInventory });
    state.chapter = data.chapter;
    return state;
  }
}
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run src/engine/state.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/engine/state.ts src/engine/state.test.ts
git commit -m "feat: add GameState with chapter-entry snapshots for resume"
```

---

### Task 4: 存档持久化(`save.ts`)

**Files:**
- Create: `src/engine/save.ts`
- Modify: `vite.config.ts`(补充 `test.environment: 'happy-dom'`,见 Step 3)
- Test: `src/engine/save.test.ts`

**Interfaces:**
- Consumes: `SaveData` from `./state`(Task 3)。
- Produces: `type SaveSlot = 'auto' | 'manual'`、`saveGame(slot: SaveSlot, data: SaveData): void`、`loadGame(slot: SaveSlot): SaveData | null`。

- [ ] **Step 1: 写失败测试 `src/engine/save.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { saveGame, loadGame } from './save';
import type { SaveData } from './state';

const sample: SaveData = {
  chapter: '一、白色的鸟',
  pauseIndex: 2,
  entryVars: { affinity_bird: 1 },
  entryInventory: ['key'],
  time: '2026-07-06 12:00:00',
};

describe('saveGame / loadGame', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when there is no save in the slot', () => {
    expect(loadGame('auto')).toBeNull();
  });

  it('round-trips a save through a slot', () => {
    saveGame('manual', sample);
    expect(loadGame('manual')).toEqual(sample);
    expect(loadGame('auto')).toBeNull();
  });

  it('treats malformed JSON as no save rather than throwing', () => {
    localStorage.setItem('uwuland-save-auto', '{not json');
    expect(loadGame('auto')).toBeNull();
  });

  it('treats a save missing required fields as no save (old-format saves)', () => {
    localStorage.setItem('uwuland-save-auto', JSON.stringify({ title: '一、白色的鸟', tag: '3' }));
    expect(loadGame('auto')).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `npx vitest run src/engine/save.test.ts`
Expected: FAIL,找不到模块 `./save`。此外由于 Vitest 默认(node 环境)没有 `localStorage`,还会报 `localStorage is not defined`。

- [ ] **Step 3: 给 `vite.config.ts` 加上 `happy-dom` 环境**

Run: `npm install -D happy-dom`

修改 `vite.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'happy-dom',
  },
});
```

- [ ] **Step 4: 实现 `src/engine/save.ts`**

```ts
import type { SaveData } from './state';

export type SaveSlot = 'auto' | 'manual';

function storageKey(slot: SaveSlot): string {
  return `uwuland-save-${slot}`;
}

export function saveGame(slot: SaveSlot, data: SaveData): void {
  localStorage.setItem(storageKey(slot), JSON.stringify(data));
}

export function loadGame(slot: SaveSlot): SaveData | null {
  const raw = localStorage.getItem(storageKey(slot));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValidSaveData(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isValidSaveData(value: unknown): value is SaveData {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.chapter === 'string' &&
    typeof v.pauseIndex === 'number' &&
    typeof v.entryVars === 'object' && v.entryVars !== null &&
    Array.isArray(v.entryInventory) &&
    typeof v.time === 'string'
  );
}
```

- [ ] **Step 5: 跑测试,确认通过**

Run: `npx vitest run src/engine/save.test.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.ts src/engine/save.ts src/engine/save.test.ts
git commit -m "feat: add localStorage save/load with graceful handling of old-format saves"
```

---

### Task 5: 解释器(`interpreter.ts`)

**Files:**
- Create: `src/engine/interpreter.ts`
- Test: `src/engine/interpreter.test.ts`

**Interfaces:**
- Consumes: `ScriptNode`/`IfBranch` from `./parser`(Task 2)、`UIPort` from `./ui-port`(Task 2)、`GameState` from `./state`(Task 3)、`evaluateExpression`/`evaluateNumExpr` from `./expressions`(Task 1)。
- Produces: `type ScriptResult = { type: 'exit' } | { type: 'jump'; target: string }`、`runScript(nodes: ScriptNode[], state: GameState, ui: UIPort): Promise<ScriptResult>`、`wrapForResume(ui: UIPort, resumeAtPauseCount: number): UIPort`——后续"渲染层"计划会实现真正的 `UIPort`,并把 `runScript`/`wrapForResume` 接入实际的章节加载循环。

- [ ] **Step 1: 写失败测试 `src/engine/interpreter.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { parseScript } from './parser';
import { GameState } from './state';
import { runScript, wrapForResume } from './interpreter';
import type { UIPort, TextStyle } from './ui-port';

class FakeUIPort implements UIPort {
  shown: { text: string; style: TextStyle }[] = [];
  heads: string[] = [];
  pauseCount = 0;
  cleared = 0;
  nextChoice = 0;
  puzzleResults: Record<string, Record<string, number | boolean>> = {};

  async showText(text: string, style: TextStyle): Promise<void> {
    this.shown.push({ text, style });
  }
  async showChoices(options: string[]): Promise<number> {
    void options;
    return this.nextChoice;
  }
  setHead(value: string): void {
    this.heads.push(value);
  }
  clearText(): void {
    this.cleared++;
  }
  async wait(): Promise<void> {}
  async pause(): Promise<void> {
    this.pauseCount++;
  }
  async runPuzzle(name: string): Promise<Record<string, number | boolean>> {
    return this.puzzleResults[name] ?? {};
  }
}

describe('runScript: 基本指令', () => {
  it('shows text lines in order and reports exit', async () => {
    const ui = new FakeUIPort();
    const state = new GameState();
    const result = await runScript(parseScript('line one\nline two'), state, ui);
    expect(ui.shown.map((s) => s.text)).toEqual(['line one', 'line two']);
    expect(result).toEqual({ type: 'exit' });
  });

  it('applies !head / !clear / !stat / !flag / !item', async () => {
    const ui = new FakeUIPort();
    const state = new GameState();
    await runScript(
      parseScript(['!head #4f0', '!clear', '!stat affinity_bird +2', '!flag met_bird', '!item add key'].join('\n')),
      state,
      ui,
    );
    expect(ui.heads).toEqual(['#4f0']);
    expect(ui.cleared).toBe(1);
    expect(state.getVar('affinity_bird')).toBe(2);
    expect(state.getVar('met_bird')).toBe(1);
    expect(state.hasItem('key')).toBe(true);
  });

  it('tracks pauseIndex across !pause commands', async () => {
    const ui = new FakeUIPort();
    const state = new GameState();
    await runScript(parseScript(['a', '!pause', 'b', '!pause', 'c'].join('\n')), state, ui);
    expect(ui.pauseCount).toBe(2);
    expect(state.pauseIndex).toBe(2); // 1-indexed 计数:两次 !pause 后依次变成 1、2
  });
});

describe('runScript: !if/!elif/!else', () => {
  it('executes only the matching branch, respecting pauseIndex across branches', async () => {
    const ui = new FakeUIPort();
    const state = new GameState();
    state.setVar('affinity_bird', 5);
    await runScript(
      parseScript(['!if affinity_bird>=3', 'high', '!pause', '!elif affinity_bird>=1', 'mid', '!else', 'low', '!endif', 'after'].join('\n')),
      state,
      ui,
    );
    expect(ui.shown.map((s) => s.text)).toEqual(['high', 'after']);
    expect(ui.pauseCount).toBe(1);
  });
});

describe('runScript: !pick 与条件门槛', () => {
  it('filters out options whose condition is false, and jumps to the chosen target', async () => {
    const ui = new FakeUIPort();
    ui.nextChoice = 0;
    const state = new GameState();
    const result = await runScript(
      parseScript('!pick 开门|绕路 目标A|目标B :: has key|true'),
      state,
      ui,
    );
    // 没有 key,所以只剩"绕路"一个选项传给 showChoices
    expect(result).toEqual({ type: 'jump', target: '目标B' });
  });

  it('offers the gated option once the condition becomes true', async () => {
    const ui = new FakeUIPort();
    ui.nextChoice = 0;
    const state = new GameState();
    state.addItem('key');
    const result = await runScript(
      parseScript('!pick 开门|绕路 目标A|目标B :: has key|true'),
      state,
      ui,
    );
    expect(result).toEqual({ type: 'jump', target: '目标A' });
  });
});

describe('runScript: !puzzle', () => {
  it('writes numeric/boolean puzzle results back into vars', async () => {
    const ui = new FakeUIPort();
    ui.puzzleResults.base64decode = { success: true, attempts: 2 };
    const state = new GameState();
    await runScript(parseScript('!puzzle base64decode'), state, ui);
    expect(state.getVar('success')).toBe(1);
    expect(state.getVar('attempts')).toBe(2);
  });
});

describe('runScript: !load / !exit', () => {
  it('!load returns a jump result', async () => {
    const ui = new FakeUIPort();
    const state = new GameState();
    const result = await runScript(parseScript('!load 二、灰色的屋'), state, ui);
    expect(result).toEqual({ type: 'jump', target: '二、灰色的屋' });
  });

  it('!exit returns an exit result and stops before later lines', async () => {
    const ui = new FakeUIPort();
    const state = new GameState();
    await runScript(parseScript(['before', '!exit', 'after'].join('\n')), state, ui);
    expect(ui.shown.map((s) => s.text)).toEqual(['before']);
  });
});

describe('wrapForResume', () => {
  it('suppresses showText/wait and auto-resolves pause() until the target pause count, then behaves normally', async () => {
    const real = new FakeUIPort();
    const wrapped = wrapForResume(real, 2);

    await wrapped.showText('skipped', 'normal');
    await wrapped.pause(); // seen=1, still skipping
    await wrapped.showText('also skipped', 'normal');
    await wrapped.pause(); // seen=2, matches target -> blocks for real
    await wrapped.showText('shown', 'normal');

    expect(real.shown.map((s) => s.text)).toEqual(['shown']);
    expect(real.pauseCount).toBe(1); // 只有到达目标暂停点那一次真正调用了 real.pause()
  });

  it('with resumeAtPauseCount 0, behaves exactly like the real port', async () => {
    const real = new FakeUIPort();
    const wrapped = wrapForResume(real, 0);
    await wrapped.showText('hello', 'normal');
    await wrapped.pause();
    expect(real.shown.map((s) => s.text)).toEqual(['hello']);
    expect(real.pauseCount).toBe(1);
  });
});
```

注:测试里用到 `vi` 是为了保持与项目其它测试文件一致的 import 习惯,这个文件本身没有用到 mock,可以在实现后如果 lint 报"未使用的 import"就把这行删掉。

- [ ] **Step 2: 跑测试,确认失败**

Run: `npx vitest run src/engine/interpreter.test.ts`
Expected: FAIL,找不到模块 `./interpreter`。

- [ ] **Step 3: 实现 `src/engine/interpreter.ts`**

```ts
import { evaluateExpression, evaluateNumExpr } from './expressions';
import type { ScriptNode } from './parser';
import type { GameState } from './state';
import type { UIPort } from './ui-port';

export type ScriptResult = { type: 'exit' } | { type: 'jump'; target: string };

interface RunContext {
  state: GameState;
  ui: UIPort;
}

export async function runScript(nodes: ScriptNode[], state: GameState, ui: UIPort): Promise<ScriptResult> {
  const result = await runNodes(nodes, { state, ui });
  return result ?? { type: 'exit' };
}

async function runNodes(nodes: ScriptNode[], ctx: RunContext): Promise<ScriptResult | null> {
  for (const node of nodes) {
    const result = await execNode(node, ctx);
    if (result) return result;
  }
  return null;
}

async function execNode(node: ScriptNode, ctx: RunContext): Promise<ScriptResult | null> {
  const { state, ui } = ctx;
  switch (node.kind) {
    case 'text':
      await ui.showText(node.text, node.style);
      return null;
    case 'pause':
      // 必须先增加 pauseIndex 再调用 ui.pause():后续渲染层的具体 UIPort 实现
      // 会在 pause() 内部读 state.pauseIndex 来自动存档,顺序反了会存到旧值。
      state.pauseIndex += 1;
      await ui.pause();
      return null;
    case 'head':
      state.head = node.value;
      ui.setHead(node.value);
      return null;
    case 'clear':
      ui.clearText();
      return null;
    case 'wait':
      await ui.wait(node.ms);
      return null;
    case 'set':
      state.setVar(node.name, evaluateNumExpr(node.expr, state));
      return null;
    case 'stat': {
      const current = state.getVar(node.name);
      const next = node.op === '=' ? node.amount : node.op === '+' ? current + node.amount : current - node.amount;
      state.setVar(node.name, next);
      return null;
    }
    case 'flag':
      state.setVar(node.name, 1);
      return null;
    case 'unflag':
      state.setVar(node.name, 0);
      return null;
    case 'itemAdd':
      state.addItem(node.name);
      return null;
    case 'itemRemove':
      state.removeItem(node.name);
      return null;
    case 'puzzle': {
      const result = await ui.runPuzzle(node.name);
      for (const [key, value] of Object.entries(result)) {
        state.setVar(key, typeof value === 'boolean' ? (value ? 1 : 0) : value);
      }
      return null;
    }
    case 'exit':
      return { type: 'exit' };
    case 'load':
      return { type: 'jump', target: node.target };
    case 'pick': {
      const available = node.options
        .map((label, idx) => ({ label, idx }))
        .filter(({ idx }) => {
          const condition = node.conditions[idx];
          return !condition || evaluateExpression(condition, state);
        });
      const chosen = await ui.showChoices(available.map((o) => o.label));
      const target = node.targets[available[chosen].idx];
      return { type: 'jump', target };
    }
    case 'if': {
      for (const branch of node.branches) {
        if (evaluateExpression(branch.condition, state)) {
          return runNodes(branch.body, ctx);
        }
      }
      if (node.elseBody) return runNodes(node.elseBody, ctx);
      return null;
    }
  }
}

export function wrapForResume(ui: UIPort, resumeAtPauseCount: number): UIPort {
  let seen = 0;
  const skipping = () => resumeAtPauseCount > 0 && seen < resumeAtPauseCount;
  return {
    showText: (text, style) => (skipping() ? Promise.resolve() : ui.showText(text, style)),
    showChoices: (options) => ui.showChoices(options),
    setHead: (value) => ui.setHead(value),
    clearText: () => ui.clearText(),
    wait: (ms) => (skipping() ? Promise.resolve() : ui.wait(ms)),
    pause: async () => {
      seen += 1;
      if (skipping()) return;
      await ui.pause();
    },
    runPuzzle: (name) => ui.runPuzzle(name),
  };
}
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run src/engine/interpreter.test.ts`
Expected: PASS。如果报"未使用的 import `vi`"(因为 `noUnusedLocals`),把测试文件顶部 `import { describe, it, expect, vi } from 'vitest';` 改成 `import { describe, it, expect } from 'vitest';`。

- [ ] **Step 5: Commit**

```bash
git add src/engine/interpreter.ts src/engine/interpreter.test.ts
git commit -m "feat: add interpreter with conditional branching, pick gating, and resume support"
```

---

### Task 6: 端到端集成测试

**Files:**
- Test: `src/engine/integration.test.ts`

**Interfaces:**
- Consumes: 全部 Task 1-5 的公开导出(`parseScript`、`GameState`、`runScript`、`wrapForResume`、`saveGame`/`loadGame`)。本任务不新增任何生产代码,只验证它们组合在一起时行为正确。

- [ ] **Step 1: 写集成测试 `src/engine/integration.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { parseScript } from './parser';
import { GameState } from './state';
import { runScript, wrapForResume } from './interpreter';
import { saveGame, loadGame } from './save';
import type { UIPort, TextStyle } from './ui-port';

const CHAPTER_SCRIPT = [
  '!head #4f0',
  '你好',
  '!stat affinity +1',
  '!if affinity>=1',
  '好感度提升了',
  '!else',
  '没有变化',
  '!endif',
  '!item add key',
  '!pause',
  '继续之前的对话',
  '!pause',
  '!pick 开门|绕路 目标A|目标B :: has key|true',
].join('\n');

class RecordingUIPort implements UIPort {
  shown: { text: string; style: TextStyle }[] = [];
  pausesSeen = 0;
  async showText(text: string, style: TextStyle): Promise<void> { this.shown.push({ text, style }); }
  async showChoices(): Promise<number> { return 0; }
  setHead(): void {}
  clearText(): void {}
  async wait(): Promise<void> {}
  async pause(): Promise<void> { this.pausesSeen++; }
  async runPuzzle(): Promise<Record<string, number | boolean>> { return {}; }
}

describe('集成:解析 -> 执行 -> 存档 -> 续读', () => {
  beforeEach(() => localStorage.clear());

  it('runs a full chapter, mutating state and choosing a gated pick option', async () => {
    const ui = new RecordingUIPort();
    const state = new GameState();
    state.enterChapter('测试章节');

    const result = await runScript(parseScript(CHAPTER_SCRIPT), state, ui);

    expect(ui.shown.map((s) => s.text)).toEqual(['你好', '好感度提升了', '继续之前的对话']);
    expect(state.getVar('affinity')).toBe(1);
    expect(state.hasItem('key')).toBe(true);
    // 有 key,所以"开门"选项(索引0)可用,RecordingUIPort 总是选第0个
    expect(result).toEqual({ type: 'jump', target: '目标A' });
  });

  it('save mid-chapter, reload, and resume replays state correctly without double-applying mutations', async () => {
    // 第一遍:跑到第一个 !pause 就"存档"(模拟点击存档按钮)
    const ui1 = new RecordingUIPort();
    const state1 = new GameState();
    state1.enterChapter('测试章节');
    const nodes = parseScript(CHAPTER_SCRIPT);

    // 手动只跑到第一次 pause:用一个在第1次 pause 后抛特殊信号来"提前终止"的 UIPort
    class StopAfterFirstPause extends RecordingUIPort {
      async pause(): Promise<void> {
        await super.pause();
        if (this.pausesSeen === 1) throw new Error('__STOP__');
      }
    }
    const stopper = new StopAfterFirstPause();
    await expect(runScript(nodes, state1, stopper)).rejects.toThrow('__STOP__');

    expect(state1.getVar('affinity')).toBe(1);
    expect(state1.hasItem('key')).toBe(true);
    expect(state1.pauseIndex).toBe(1); // 第一次 !pause,pauseIndex 从 0 变成 1

    saveGame('auto', state1.toSaveData('2026-07-06 12:00:00'));

    // 第二遍:全新的 GameState,从存档恢复并续读
    const saved = loadGame('auto');
    expect(saved).not.toBeNull();
    const state2 = GameState.fromSaveData(saved!);
    const ui2 = new RecordingUIPort();
    const resumeUi = wrapForResume(ui2, saved!.pauseIndex);

    const result = await runScript(parseScript(CHAPTER_SCRIPT), state2, resumeUi);

    // 续读时不应该重复触发"好感度提升了"这行文本(它在第一次 pause 之前)
    expect(ui2.shown.map((s) => s.text)).toEqual(['继续之前的对话']);
    // 但状态应该和"一路正常玩下来"完全一致,而不是被重复叠加
    expect(state2.getVar('affinity')).toBe(1);
    expect(state2.hasItem('key')).toBe(true);
    expect(result).toEqual({ type: 'jump', target: '目标A' });
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `npx vitest run src/engine/integration.test.ts`
Expected: 第一个 `it` 应该已经能过(所有依赖都已实现);第二个 `it` 是这份计划里第一次真正验证"存档中途 + 续读"整条链路,如果失败,报错信息会指出是重复叠加了 `affinity`(变成2而不是1)还是 `!pause` 计数/跳过逻辑有偏差——对照 Task 5 的 `wrapForResume` 实现检查。

- [ ] **Step 3: 如有失败,修正后重新运行,确认全部通过**

Run: `npx vitest run src/engine/integration.test.ts`
Expected: PASS。

- [ ] **Step 4: 跑全部测试套件,确认没有破坏之前的任务**

Run: `npm test`
Expected: 所有测试文件全部 PASS(expressions/parser/state/save/interpreter/integration)。

- [ ] **Step 5: Commit**

```bash
git add src/engine/integration.test.ts
git commit -m "test: add end-to-end integration coverage for save/resume replay"
```

---

## 完成后

`src/engine/` 此时是一个完整、可测试、不依赖 DOM 的引擎核心。下一份计划("桌面渲染层")会:实现真正的 `UIPort`(用 DOM 显示文字/选项/头像,接入现有 `style.css` 的视觉设计)、写一个 `main.ts` 驱动"加载章节 → `runScript` → 处理 jump/exit → 加载下一章节"的循环、把 4 章剧情内容从 `drama-init.js` 迁移成 `src/content/*.script` 纯文本文件。这些都需要等本计划实际跑通、确认上述接口没有在实现过程中被迫调整后再动笔。
