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
