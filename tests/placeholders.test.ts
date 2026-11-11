import { describe, expect, it } from 'vitest';
import { formatDateValue, parsePlaceholders, replacePlaceholders, validatePlaceholderValue } from '../src/core/placeholders';
import { parseSnippet } from '../scripts/content/parse';
import { renderMarkdownPreview } from '../src/core/code-rendering';
import type { Diagnostic } from '../src/core/types';

const render = (code: string, values: Record<string, string> = {}) => replacePlaceholders(code, parsePlaceholders(code), values);

describe('占位符语法与替换', () => {
  it('支持省略类型、默认值以及中文名称，并保留未填写的占位符', () => {
    expect(render('@host@ @host:text@ @名称::demo@ @port:number:8080@')).toBe('@host@ @host:text@ demo 8080');
    expect(render('@name@ @name@', { name: '' })).toBe(' ');
    expect(parsePlaceholders('name@example.com @decorator\ncall()').fields).toEqual([]);
  });
  it('同名变量生成一个字段并同步替换，后出现的默认值也能生效', () => {
    const code = '@name@ @name::hello@';
    expect(parsePlaceholders(code).fields).toHaveLength(1);
    expect(render(code)).toBe('hello hello');
    expect(render(code, { name: 'world' })).toBe('world world');
  });
  it('正则可以包含冒号、@、转义斜杠和字符类中的斜杠', () => {
    const code = String.raw`@email:text/^[^@]+@[^@]+$/:user\@example.com@ @path:text/^(?:a:b|https:\/\/site)$/@ @slash:text/^[/:]+$/:/@`;
    const template = parsePlaceholders(code);
    expect(template.issues).toEqual([]);
    expect(replacePlaceholders(code, template, { path: 'https://site' })).toBe('user@example.com https://site /');
    expect(render('@value:/^[a-z]+$/:demo@')).toBe('demo');
  });
  it('默认值包含冒号、Windows 路径、字面量 @，替换值不递归解析或解释 $', () => {
    expect(render('@url::https://example.com:8080/a@ @path::C:\\temp\\a@ @email::a\\@b.com@')).toBe('https://example.com:8080/a C:\\temp\\a a@b.com');
    expect(render('C:\\@folder::reports@')).toBe('C:\\reports');
    expect(render('@x@ @x@', { x: '$& @other::x@ <script>' })).toBe('$& @other::x@ <script> $& @other::x@ <script>');
  });
  it('数字保留输入文本，只接受有限的数字并执行完整正则匹配', () => {
    expect(render('@x:number@', { x: '-001.50' })).toBe('-001.50');
    for (const x of ['', '1e3', 'NaN', 'Infinity', '12abc']) expect(render('@x:number@', { x })).toBe('@x:number@');
    expect(render('@x:text/[a-z]+/@', { x: 'abc\n' })).toBe('@x:text/[a-z]+/@');
    expect(render('@x:number/^[0-9]{1,5}$/:8080@', { x: '123456' })).toBe('@x:number/^[0-9]{1,5}$/:8080@');
  });
  it('保留错误语法并输出诊断，后续正常占位符仍能替换', () => {
    const code = '@bad:unknown:x@ @regex:text/[/@ @date:date(YYYY-QQ):2026-11-10@ @no:date/foo/@ @valid::yes@';
    const template = parsePlaceholders(code);
    expect(template.issues).toHaveLength(4);
    expect(replacePlaceholders(code, template)).toContain('@bad:unknown:x@');
    expect(replacePlaceholders(code, template)).toContain('@no:date/foo/@');
    expect(replacePlaceholders(code, template)).toMatch(/ yes$/);
  });
  it('同名变量类型、正则或默认值冲突时全部保留原文', () => {
    for (const code of ['@x:text:a@ @x:number:1@', '@x::a@ @x::b@', '@x:text/a/:a@ @x:text/b/:a@']) {
      const template = parsePlaceholders(code);
      expect(template.issues.some(issue => issue.includes('不一致'))).toBe(true);
      expect(replacePlaceholders(code, template, { x: 'a' })).toBe(code);
    }
  });
  it('危险的对象属性名也作为普通变量处理', () => {
    const code = '@__proto__::safe@ @constructor::value@';
    expect(render(code)).toBe('safe value');
    expect(render(code, JSON.parse('{"__proto__":"updated"}'))).toBe('updated value');
  });
  it('保留代码原有 CRLF、缩进和空行', () => {
    const code = 'if True:\r\n    print("@x::hello@")\r\n\r\n';
    expect(render(code)).toBe('if True:\r\n    print("hello")\r\n\r\n');
  });
});

describe('日期和时间参数', () => {
  it('支持日期时间格式，区分月份和分钟，不做时区转换', () => {
    expect(formatDateValue('2026-01-02T03:04:05', 'YYYY/YY MM/M DD/D HH/H mm/m ss/s')).toBe('2026/26 01/1 02/2 03/3 04/4 05/5');
    expect(formatDateValue('2026-11-10T14:30', 'YYYY-MM-DD[T]HH:mm:ss')).toBe('2026-11-10T14:30:00');
    expect(render('@day:date:2026-11-10@')).toBe('2026-11-10');
  });
  it('同名日期的不同格式共用字段，合并日期、时间和秒的需求', () => {
    const code = '@start:date(YYYYMMDD_HHmm):2026-11-10T14:30:25@ @start:date(YYYY年M月D日 HH:mm:ss):2026-11-10T14:30:25@';
    const template = parsePlaceholders(code);
    expect(template.fields).toHaveLength(1);
    expect(template.fields[0]).toMatchObject({ date: true, time: true, seconds: true });
    expect(template.issues).toEqual([]);
    expect(replacePlaceholders(code, template)).toBe('20261110_1430 2026年11月10日 14:30:25');
  });
  it('仅时间格式不要求日期，日期和日期时间输入可省略秒', () => {
    const template = parsePlaceholders('@clock:date(HH:mm:ss):14:30@');
    expect(template.fields[0]).toMatchObject({ date: false, time: true, seconds: true });
    expect(replacePlaceholders('@clock:date(HH:mm:ss):14:30@', template)).toBe('14:30:00');
    expect(render('@d:date(YYYYMMDD):2026-11-10T14:30@')).toBe('20261110');
  });
  it('检查闰年、真实日期、24 小时时间和输入完整性', () => {
    expect(render('@d:date:2024-02-29@')).toBe('2024-02-29');
    for (const value of ['2026-02-29', '2026-04-31', '0000-01-01', '2026-13-01']) {
      const code = `@d:date:${value}@`;
      expect(render(code)).toBe(code);
      expect(parsePlaceholders(code).issues).toHaveLength(1);
    }
    const code = '@d:date(YYYY-MM-DD HH:mm:ss)@';
    for (const d of ['2026-11-10', 'T14:30', '2026-11-10T24:00', '2026-11-10T14:60', '2026-11-10T14:30:60']) expect(render(code, { d })).toBe(code);
    expect(render(code, { d: '2026-11-10T00:00:00' })).toBe('2026-11-10 00:00:00');
  });
  it('日期默认值等价时不误报冲突，无默认值时不自动填今天', () => {
    const code = '@d:date(YYYY):2026-11-10T14:30@ @d:date(HH:mm:ss):2026-11-10 14:30:00@';
    expect(parsePlaceholders(code).issues).toEqual([]);
    expect(render(code)).toBe('2026 14:30:00');
    const template = parsePlaceholders('@d:date@');
    expect(validatePlaceholderValue(template.fields[0], undefined)).toBeTruthy();
    expect(render('@d:date@')).toBe('@d:date@');
  });
  it('日期时间尾部有多余文本或分隔符时拒绝替换', () => {
    const code = '@d:date(YYYY-MM-DD HH:mm)@';
    for (const d of ['2026-11-10T14:30 extra', '2026-11-10 14:30 extra', '2026-11-10T14:30T00']) {
      expect(render(code, { d })).toBe(code);
    }
  });
});

describe('内容生成与动态预览', () => {
  it('占位符只诊断代码，原始文件和描述保持原文', async () => {
    const raw = '---\nsnippet_name: Parameters\nsnippet_tags: []\n---\n\n@ignored:unknown@\n\n# Example\n\n```text\n@bad:unknown@ @name::hello@\n```';
    const diagnostics: Diagnostic[] = [];
    const snippet = await parseSnippet(raw, 'parameters.md', diagnostics);
    expect(snippet.raw).toBe(raw);
    expect(snippet.descriptionHtml).toContain('@ignored:unknown@');
    expect(snippet.subSnippets[0].code).toBe('@bad:unknown@ @name::hello@');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain('bad');
  });
  it('Markdown 预览重新安全渲染并使用替换后的内嵌代码复制内容', async () => {
    const template = '# @name::Hello@\n\n```text\n@name::Hello@\n```';
    const code = render(template, { name: '<script>alert(1)</script>' });
    const preview = await renderMarkdownPreview(code);
    expect(preview.html).not.toContain('<script>');
    expect(preview.html).toContain('alert(1)');
    expect(preview.codeBlocks[0].code).toBe('<script>alert(1)</script>');
  });
});
