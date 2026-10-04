import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LanguageIcon } from '../src/features/snippets/LanguageIcon';

const render = (language: string) => renderToStaticMarkup(createElement(LanguageIcon, { language }));

describe('代码语言 Logo', () => {
  it('常用别名与大小写对应同一语言 Logo', () => {
    expect(render(' py ')).toBe(render('PYTHON'));
    expect(render('js')).toBe(render('javascript'));
    expect(render('tsx')).toBe(render('typescript'));
    expect(render('sh')).toBe(render('bash'));
    expect(render('batch')).toBe(render('bat'));
    expect(render('cmd')).toBe(render('bat'));
    expect(render('c++')).toBe(render('cpp'));
  });
  it('缺失、未知类型与对象属性名使用通用图标', () => {
    for (const language of ['', 'text', 'unknown-custom-language', '__proto__', 'constructor']) {
      expect(render(language)).toContain('data-language-icon="fallback"');
    }
  });
  it('Logo 是装饰图标，不改变 Tab 名称的可访问性', () => {
    expect(render('python')).toContain('aria-hidden="true"');
    expect(render('python')).toContain('data-language-icon="python"');
    expect(render('bash')).toContain('data-language-icon="bash-prompt"');
    expect(render('bash')).toContain('stroke="currentColor"');
  });
});
