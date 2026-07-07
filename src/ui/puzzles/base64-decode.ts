import type { PuzzleContext } from './types';

const HINT_AFTER_ATTEMPTS = 3;

export function mountBase64Decode({ container, param, resolve }: PuzzleContext): void {
  let correctAnswer: string;
  try {
    correctAnswer = atob(param);
  } catch {
    container.innerHTML = '';
    const error = document.createElement('p');
    error.textContent = `谜题配置错误:"${param}" 不是合法的 Base64`;
    container.appendChild(error);
    return;
  }

  container.innerHTML = '';

  const prompt = document.createElement('p');
  prompt.textContent = `密文:${param}`;
  container.appendChild(prompt);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'puzzle-input';
  input.placeholder = '解密后的内容是……';
  container.appendChild(input);
  container.appendChild(document.createElement('br'));

  const submit = document.createElement('button');
  submit.textContent = '提交';
  container.appendChild(submit);

  const feedback = document.createElement('p');
  feedback.className = 'puzzle-feedback';
  container.appendChild(feedback);

  let attempts = 0;

  function trySubmit(): void {
    attempts++;
    if (input.value.trim() === correctAnswer) {
      feedback.textContent = '解密成功！';
      submit.disabled = true;
      input.disabled = true;
      setTimeout(() => resolve({ success: true, attempts }), 500);
      return;
    }
    feedback.textContent =
      attempts >= HINT_AFTER_ATTEMPTS
        ? '还不对……提示:这是标准 Base64 编码,试试网上的在线解码工具。'
        : `不对哦,再想想?(第 ${attempts} 次尝试)`;
  }

  submit.onclick = trySubmit;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      trySubmit();
    }
  });
}
