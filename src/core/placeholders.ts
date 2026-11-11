export type PlaceholderType = 'text' | 'number' | 'date';
export interface PlaceholderOccurrence {
  start: number; end: number; raw: string; name: string; type: PlaceholderType;
  format?: string; pattern?: string; defaultValue?: string;
}
export interface PlaceholderField {
  name: string; type: PlaceholderType; defaultValue?: string; pattern?: string;
  date: boolean; time: boolean; seconds: boolean; issue?: string;
}
export interface PlaceholderTemplate { occurrences: PlaceholderOccurrence[]; fields: PlaceholderField[]; issues: string[] }
export type PlaceholderValues = Record<string, string>;
const dateTokens = /YYYY|YY|MM|DD|HH|mm|ss|M|D|H|m|s/g;
const defaultFormat = 'YYYY-MM-DD';

function formatParts(format: string): { value: string; token: boolean }[] {
  const parts: { value: string; token: boolean }[] = [];
  for (let position = 0; position < format.length;) {
    if (format[position] === '[') {
      const end = format.indexOf(']', position + 1);
      if (end < 0) throw new Error('日期格式中的字面量缺少 ]');
      parts.push({ value: format.slice(position + 1, end), token: false });
      position = end + 1;
      continue;
    }
    dateTokens.lastIndex = position;
    const match = dateTokens.exec(format);
    if (match?.index === position) {
      parts.push({ value: match[0], token: true });
      position += match[0].length;
    } else {
      if (/[A-Za-z]/.test(format[position])) throw new Error(`不支持的日期格式标记：${format[position]}`);
      parts.push({ value: format[position++], token: false });
    }
  }
  if (!parts.some(part => part.token)) throw new Error('日期格式至少需要一个日期或时间标记');
  return parts;
}

export function dateRequirements(format = defaultFormat) {
  const tokens = formatParts(format).filter(part => part.token).map(part => part.value);
  return { date: tokens.some(token => /^[YMD]/.test(token)), time: tokens.some(token => /^[Hms]/.test(token)), seconds: tokens.some(token => token[0] === 's') };
}

export function splitDateValue(value: string) {
  const separator = value.search(/[T ]/);
  if (separator >= 0) return { date: value.slice(0, separator), time: value.slice(separator + 1) };
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? { date: value, time: '' } : { date: '', time: value };
}

function validDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

function validTime(value: string) {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  return Boolean(match && Number(match[1]) < 24 && Number(match[2]) < 60 && Number(match[3] ?? 0) < 60);
}

export function validatePlaceholderValue(field: PlaceholderField, value: string | undefined): string | undefined {
  if (field.issue) return field.issue;
  if (value === undefined) return '填写后替换代码中的占位符';
  if (field.type === 'number' && (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || !Number.isFinite(Number(value)))) return '请输入有效数字，支持负数和小数';
  if (field.type === 'date') {
    const parts = splitDateValue(value);
    if (field.date && !validDate(parts.date)) return '请选择有效日期';
    if (field.time && !validTime(parts.time)) return field.seconds ? '请输入有效时间（时:分:秒）' : '请输入有效时间（时:分）';
    if (parts.date && !validDate(parts.date) || parts.time && !validTime(parts.time)) return '日期或时间无效';
  }
  if (field.pattern !== undefined) {
    const match = new RegExp(`^(?:${field.pattern})$`).exec(value);
    if (!match || match[0].length !== value.length) return `输入不符合规则 /${field.pattern}/`;
  }
}

export function formatDateValue(value: string, format = defaultFormat): string {
  const { date, time } = splitDateValue(value);
  const [year = '', month = '', day = ''] = date.split('-');
  const [hour = '', minute = '', second = '00'] = time.split(':');
  const values: Record<string, string> = {
    YYYY: year, YY: year.slice(-2), MM: month, M: String(Number(month)), DD: day, D: String(Number(day)),
    HH: hour, H: String(Number(hour)), mm: minute, m: String(Number(minute)), ss: second, s: String(Number(second)),
  };
  return formatParts(format).map(part => part.token ? values[part.value] : part.value).join('');
}

function declaration(code: string, start: number): { occurrence?: PlaceholderOccurrence; issue?: string; end: number } | undefined {
  const nameMatch = /^@([\p{L}_][\p{L}\p{N}_-]*)/u.exec(code.slice(start));
  if (!nameMatch) return;
  const name = nameMatch[1];
  let position = start + nameMatch[0].length;
  if (![':', '@'].includes(code[position])) return;
  const fail = (message: string) => {
    const end = code.indexOf('@', start + nameMatch[0].length);
    return { issue: `占位符“${name}”：${message}`, end: end < 0 ? code.length : end + 1 };
  };
  let type: PlaceholderType = 'text';
  let format: string | undefined;
  let pattern: string | undefined;
  let defaultValue: string | undefined;
  if (code[position] === ':') {
    position++;
    const typeMatch = /^[a-z]+/i.exec(code.slice(position));
    if (typeMatch) {
      if (!['text', 'number', 'date'].includes(typeMatch[0])) return fail(`不支持的类型 ${typeMatch[0]}`);
      type = typeMatch[0] as PlaceholderType;
      position += typeMatch[0].length;
    }
    if (code[position] === '(') {
      if (type !== 'date') return fail('只有 date 可以指定输出格式');
      let depth = 1;
      const formatStart = ++position;
      while (position < code.length && depth) {
        if (code[position] === '(') depth++;
        if (code[position] === ')') depth--;
        if (depth) position++;
      }
      if (depth) return fail('日期格式缺少右括号');
      format = code.slice(formatStart, position++);
      try { dateRequirements(format); } catch (error) { return fail((error as Error).message); }
    }
    if (code[position] === '/') {
      const patternStart = ++position;
      let inClass = false;
      while (position < code.length) {
        if (code[position] === '\\') { position += 2; continue; }
        if (code[position] === '[') inClass = true;
        if (code[position] === ']') inClass = false;
        if (code[position] === '/' && !inClass) break;
        position++;
      }
      if (position >= code.length) return fail('正则表达式缺少结束 /');
      pattern = code.slice(patternStart, position++);
      if (type === 'date') return fail('date 不支持正则表达式，请使用日期格式');
      try { new RegExp(`^(?:${pattern})$`); } catch { return fail('正则表达式无效'); }
    }
    if (code[position] === ':') {
      position++;
      defaultValue = '';
      while (position < code.length && code[position] !== '@') {
        if (code[position] === '\\' && code[position + 1] === '@') { defaultValue += '@'; position += 2; }
        else defaultValue += code[position++];
      }
    }
  }
  if (code[position] !== '@') return fail('语法无效或缺少结束 @');
  const end = position + 1;
  return { end, occurrence: { start, end, raw: code.slice(start, end), name, type, format, pattern, defaultValue } };
}

function normalizedDefault(type: PlaceholderType, value: string) {
  if (type !== 'date') return value;
  const { date, time } = splitDateValue(value);
  return date + (time ? `T${time.length === 5 ? time + ':00' : time}` : '');
}

export function parsePlaceholders(code: string): PlaceholderTemplate {
  const occurrences: PlaceholderOccurrence[] = [];
  const issues: string[] = [];
  const fields = new Map<string, PlaceholderField>();
  for (let position = 0; position < code.length;) {
    if (code[position] !== '@') { position++; continue; }
    const parsed = declaration(code, position);
    if (!parsed) { position++; continue; }
    position = parsed.end;
    if (parsed.issue) { issues.push(parsed.issue); continue; }
    const occurrence = parsed.occurrence!;
    occurrences.push(occurrence);
    const existing = fields.get(occurrence.name);
    const requirements = occurrence.type === 'date' ? dateRequirements(occurrence.format) : { date: false, time: false, seconds: false };
    if (!existing) {
      fields.set(occurrence.name, { name: occurrence.name, type: occurrence.type, defaultValue: occurrence.defaultValue, pattern: occurrence.pattern, ...requirements });
    } else {
      if (existing.type !== occurrence.type || existing.pattern !== occurrence.pattern || existing.defaultValue !== undefined && occurrence.defaultValue !== undefined && normalizedDefault(existing.type, existing.defaultValue) !== normalizedDefault(occurrence.type, occurrence.defaultValue)) existing.issue = `同名变量“${occurrence.name}”的类型、正则或默认值不一致`;
      existing.defaultValue ??= occurrence.defaultValue;
      existing.date ||= requirements.date;
      existing.time ||= requirements.time;
      existing.seconds ||= requirements.seconds;
    }
  }
  for (const field of fields.values()) {
    if (field.issue) issues.push(field.issue);
    else if (field.defaultValue !== undefined) {
      const error = validatePlaceholderValue(field, field.defaultValue);
      if (error) issues.push(`占位符“${field.name}”的默认值无效：${error}`);
    }
  }
  return { occurrences, fields: [...fields.values()], issues: [...new Set(issues)] };
}

export function placeholderValue(field: PlaceholderField, values: PlaceholderValues): string | undefined {
  return Object.hasOwn(values, field.name) ? values[field.name] : field.defaultValue;
}

export function replacePlaceholders(code: string, template: PlaceholderTemplate, values: PlaceholderValues = {}): string {
  const fields = new Map(template.fields.map(field => [field.name, field]));
  const output: string[] = [];
  let position = 0;
  for (const occurrence of template.occurrences) {
    const field = fields.get(occurrence.name)!;
    const value = placeholderValue(field, values);
    output.push(code.slice(position, occurrence.start));
    output.push(validatePlaceholderValue(field, value) ? occurrence.raw : field.type === 'date' ? formatDateValue(value!, occurrence.format) : value!);
    position = occurrence.end;
  }
  output.push(code.slice(position));
  return output.join('');
}
