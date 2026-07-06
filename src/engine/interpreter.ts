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
      if (available.length === 0) {
        // 内容作者错误:这个 !pick 的每个选项条件都为 false,过滤后没有任何选项可展示。
        // 若不拦截,下面 available[chosen] 会是 undefined,抛出令人费解的 TypeError。
        throw new Error(
          `!pick 没有任何可用选项:所有选项的条件都为 false(选项:${node.options.join(' | ')})。` +
            `请为该 !pick 增加一个无条件或条件恒为 true 的兜底选项。`,
        );
      }
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
