import { useId } from 'react';
import { CalendarClock, CalendarDays, Clock3, Hash, Type } from 'lucide-react';
import { placeholderValue, splitDateValue, validatePlaceholderValue, type PlaceholderTemplate, type PlaceholderValues } from '../../core/placeholders';
import { ParameterInput } from './ParameterInput';
import { DateParameterInput } from './DateParameterInput';

interface Props { template: PlaceholderTemplate; values: PlaceholderValues; onChange(name: string, value: string): void; onReset(): void }

export function PlaceholderInputs({ template, values, onChange, onReset }: Props) {
  const id = useId();
  if (!template.fields.length && !template.issues.length) return null;
  return <section className="placeholder-form" aria-label="代码参数">
    <div className="placeholder-heading"><span>代码参数</span><button type="button" onClick={onReset}>重置参数</button></div>
    <div className="placeholder-fields">
      {template.fields.map((field, index) => {
        const value = placeholderValue(field, values);
        const error = validatePlaceholderValue(field, value);
        const invalid = Boolean(error);
        const inputId = `${id}-${index}`;
        const hintId = `${inputId}-hint`;
        const parts = splitDateValue(value ?? '');
        const TypeIcon = field.type === 'text' ? Type : field.type === 'number' ? Hash : field.date && field.time ? CalendarClock : field.date ? CalendarDays : Clock3;
        const typeLabel = field.type === 'text' ? '文本' : field.type === 'number' ? '数字' : field.date && field.time ? '日期和时间' : field.date ? '日期' : '时间';
        const rule = field.type !== 'date' && field.pattern !== undefined ? `/${field.pattern}/` : '';
        const hintError = !value ? undefined : field.type === 'date'
          ? validatePlaceholderValue({ ...field, date: field.date && Boolean(parts.date), time: field.time && Boolean(parts.time) }, value)
          : error;
        const hint = field.issue || (hintError?.startsWith('输入不符合规则') ? '输入不符合规则' : hintError);
        const describedBy = hint ? hintId : undefined;
        return <div className="placeholder-field" key={field.name}>
          <label htmlFor={inputId}>
            <span className="placeholder-type" title={typeLabel} role="img" aria-label={typeLabel}><TypeIcon size={14} aria-hidden="true" /></span>
            <span className="placeholder-name">{field.name}</span>
            {rule && <span className="placeholder-rule">{rule}</span>}
          </label>
          {field.type === 'date' ? <DateParameterInput field={field} value={value} id={inputId} describedBy={describedBy} onChange={next => onChange(field.name, next)} /> : <ParameterInput defaultText={field.defaultValue} id={inputId} aria-label={field.name} type="text" inputMode={field.type === 'number' ? 'decimal' : undefined} value={value ?? ''} aria-invalid={invalid} aria-describedby={describedBy} placeholder={field.defaultValue === undefined ? '填写后替换代码' : undefined} onChange={event => onChange(field.name, event.target.value)} />}
          {hint && <div id={hintId} className={`placeholder-hint ${invalid ? 'is-invalid' : ''}`}>{hint}</div>}
        </div>;
      })}
    </div>
    {template.issues.length > 0 && <ul className="placeholder-diagnostics" aria-label="占位符格式提示">{template.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
  </section>;
}
