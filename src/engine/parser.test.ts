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
