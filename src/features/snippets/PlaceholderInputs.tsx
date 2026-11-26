import { lazy, Suspense, useId, useState } from 'react';
import { CalendarClock, CalendarDays, Clock3, Hash, RotateCcw, Type } from 'snippet-manager/icons/ui';
import { placeholderHelp, placeholderValue, splitDateValue, validatePlaceholderValue, type PlaceholderTemplate, type PlaceholderValues } from '../../core/placeholders';
import { ParameterInput } from './ParameterInput';
import { PlaceholderRule } from './PlaceholderRule';

const DateParameterInput = lazy(() => import('./DateParameterInput').then(module => ({ default: module.DateParameterInput })));

interface Props { template: PlaceholderTemplate; values: PlaceholderValues; onChange(name: string, value: string): void; onReset(): void }

export function PlaceholderInputs({ template, values, onChange, onReset }: Props) {
  const id = useId();
  const [resetCount, setResetCount] = useState(0);
  if (!template.fields.length && !template.issues.length) return null;
  return <section className="placeholder-form" aria-label="代码参数">
    <div className="placeholder-heading"><span>代码参数</span><button type="button" className="placeholder-reset" title="重置参数" aria-label="重置参数" onClick={() => { onReset(); setResetCount(count => count + 1); }}>
      <RotateCcw key={resetCount} size={15} aria-hidden="true" className={resetCount ? 'is-resetting' : undefined} />
    </button></div>
    <div className="placeholder-fields">
      {template.fields.map((field, index) => {
        const value = placeholderValue(field, values);
        const inputValue = Object.hasOwn(values, field.name) ? values[field.name] : '';
        const help = placeholderHelp(field.hint);
        const error = validatePlaceholderValue(field, value);
        const invalid = Boolean(error);
        const inputId = `${id}-${index}`;
        const hintId = `${inputId}-hint`;
        const helpId = `${inputId}-help`;
        const parts = splitDateValue(value ?? '');
        const TypeIcon = field.type === 'text' ? Type : field.type === 'number' ? Hash : field.date && field.time ? CalendarClock : field.date ? CalendarDays : Clock3;
        const typeLabel = field.type === 'text' ? '文本' : field.type === 'number' ? '数字' : field.date && field.time ? '日期和时间' : field.date ? '日期' : '时间';
        const hintError = !value ? undefined : field.type === 'date'
          ? validatePlaceholderValue({ ...field, date: field.date && Boolean(parts.date), time: field.time && Boolean(parts.time) }, value)
          : error;
        const hint = field.issue || (hintError?.startsWith('输入不符合规则') ? '输入不符合规则' : hintError);
        const describedBy = [field.hint ? helpId : '', hint ? hintId : ''].filter(Boolean).join(' ') || undefined;
        return <div className="placeholder-field" key={field.name}>
          <div className="placeholder-field-heading"><label htmlFor={inputId}>
            <span className="placeholder-type" title={typeLabel} role="img" aria-label={typeLabel}><TypeIcon size={14} aria-hidden="true" /></span>
            <span className="placeholder-name">{field.name}</span>
          </label>
          {field.hint && <span id={helpId} className="placeholder-help">{help.description}{help.example && <span className="placeholder-example"> e.g. <button type="button" aria-label={`填入 ${field.name} 示例：${help.example}`} onClick={() => {
            onChange(field.name, help.example!);
            requestAnimationFrame(() => {
              const input = document.getElementById(inputId);
              if (input instanceof HTMLInputElement) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
            });
          }}>{help.example}</button></span>}</span>}
          {field.type !== 'date' && field.pattern !== undefined && <PlaceholderRule name={field.name} pattern={field.pattern} />}</div>
          {field.type === 'date' ? <Suspense fallback={<div className="placeholder-date-input"><ParameterInput id={inputId} aria-label={`${field.name} ${typeLabel}`} aria-describedby={describedBy} aria-invalid={invalid} aria-busy="true" disabled value={inputValue.replace('T', ' ')} defaultText={field.defaultValue?.replace('T', ' ')} icon={<TypeIcon size={15} />} /></div>}>
            <DateParameterInput field={field} value={value} inputValue={inputValue} id={inputId} describedBy={describedBy} onChange={next => onChange(field.name, next)} />
          </Suspense> : <ParameterInput defaultText={field.defaultValue} onAcceptDefault={() => onChange(field.name, field.defaultValue!)} id={inputId} aria-label={field.name} type="text" inputMode={field.type === 'number' ? 'decimal' : undefined} value={inputValue} aria-invalid={invalid} aria-describedby={describedBy} onChange={event => onChange(field.name, event.target.value)} />}
          {hint && <div id={hintId} className={`placeholder-hint ${invalid ? 'is-invalid' : ''}`}>{hint}</div>}
        </div>;
      })}
    </div>
    {template.issues.length > 0 && <ul className="placeholder-diagnostics" aria-label="占位符格式提示">{template.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
  </section>;
}
