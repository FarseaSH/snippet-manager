import { describe, expect, it } from 'vitest';
import { createProjectCompiler, previewOrigin, resolvePreviewPath, type PreviewFile } from '../src/features/snippets/html-project';

const file = (title: string, language: string, code: string): PreviewFile => ({ id: title, title, language, code });

describe('HTML 同组文件解析', () => {
  it('按引用文件的目录解析路径，保留查询和片段，支持中文文件名', () => {
    expect(resolvePreviewPath('../styles/./主样式.css?v=2#theme', 'pages/demo.html')).toEqual({ path: 'styles/主样式.css', suffix: '?v=2#theme' });
    expect(resolvePreviewPath('/assets/icon.svg#logo', 'pages/demo.html').path).toBe('assets/icon.svg');
    expect(resolvePreviewPath('./%E4%B8%BB.js', 'scripts/main.js').path).toBe('scripts/主.js');
    for (const path of ['../../outside.js', '%2e%2e/outside.js', './bad\\file.css', './%00.js']) expect(() => resolvePreviewPath(path, 'main.js')).toThrow();
  });

  it('CSS 递归 import 和 url 引用正确解析，字符串和注释保持原样', async () => {
    const compiler = await createProjectCompiler([
      file('css/main.css', 'css', '@import "./theme.css" layer(theme);\n/* url(./missing.svg) */\nx { content: "url(./missing.svg)"; background: url("../icon.svg#symbol"); }'),
      file('css/theme.css', 'css', ':root { --accent: orange; }'),
      file('icon.svg', 'xml', '<svg xmlns="http://www.w3.org/2000/svg"/>'),
    ]);
    await compiler.reference('./css/main.css', 'index.html', 'css');
    const css = compiler.resources[previewOrigin + 'css/main.css'].code;
    expect(css).toContain(`"${previewOrigin}css/theme.css" layer(theme)`);
    expect(css).toContain(`"${previewOrigin}icon.svg#symbol"`);
    expect(css).toContain('content: "url(./missing.svg)"');
    expect(css).toContain('/* url(./missing.svg) */');
    expect(compiler.resources[previewOrigin + 'icon.svg'].mime).toBe('image/svg+xml');
  });

  it('区分重复 CSS 引用和真实循环', async () => {
    const compiler = await createProjectCompiler([
      file('style.css', 'css', '@import "./theme.css"; @import url("./theme.css");'),
      file('theme.css', 'css', 'body { color: red; }'),
    ]);
    await expect(compiler.reference('./style.css', 'index.html')).resolves.toBe(previewOrigin + 'style.css');
    const cycle = await createProjectCompiler([file('a.css', 'css', '@import "./b.css";'), file('b.css', 'css', '@import "./a.css";')]);
    await expect(cycle.reference('./a.css', 'index.html')).rejects.toThrow('循环引用');
  });

  it('JS 解析静态导入、再导出、动态导入和循环模块，不改注释及普通字符串', async () => {
    const compiler = await createProjectCompiler([
      file('js/main.js', 'js', `import { count } from './utils.js';\nexport { count } from "./utils.js";\nconst later = import('./utils.js?v=2#module');\nconst text = "import './missing.js'"; // import './missing.js'`),
      file('js/utils.js', 'javascript', `import './main.js'; export const count = 1;`),
    ]);
    await compiler.reference('./js/main.js', 'index.html', 'js');
    const main = compiler.resources[previewOrigin + 'js/main.js'].code;
    expect(main).toContain(`from "${previewOrigin}js/utils.js"`);
    expect(main).toContain(`import("${previewOrigin}js/utils.js?v=2#module")`);
    expect(main).toContain(`"import './missing.js'"; // import './missing.js'`);
    expect(Object.keys(compiler.resources)).toContain(previewOrigin + 'js/utils.js?v=2');
    expect(Object.keys(compiler.resources)).toContain(previewOrigin + 'js/utils.js?v=2#module');
  });

  it('本地动态导入要求固定字符串；CDN、data URL、锚点与裸模块交给浏览器', async () => {
    const compiler = await createProjectCompiler([]);
    const original = 'import x from "https://cdn.example.test/x.js"; import y from "alias"; console.log(import.meta.url);';
    expect(await compiler.javascript(original, 'index.html')).toBe(original);
    await expect(compiler.javascript('import("./" + name)', 'main.js')).rejects.toThrow('固定字符串');
    for (const url of ['https://cdn.example.test/a.css', '//cdn.example.test/a.js', 'data:image/svg+xml,hi', '#symbol']) expect(await compiler.reference(url, 'index.html')).toBe(url);
  });

  it('缺失、重复、大小写及代码类型错误给出具体诊断', async () => {
    const compiler = await createProjectCompiler([
      file('theme.css', 'css', ''), file('./theme.css', 'css', ''), file('script.js', 'text', ''), file('Main.js', 'js', ''),
    ]);
    await expect(compiler.reference('./missing.css', 'index.html')).rejects.toThrow('找不到同组文件');
    await expect(compiler.reference('./theme.css', 'index.html')).rejects.toThrow('文件名重复');
    await expect(compiler.reference('./script.js', 'index.html', 'js')).rejects.toThrow('javascript');
    await expect(compiler.reference('./main.js', 'index.html')).rejects.toThrow('找不到同组文件');
  });
});
