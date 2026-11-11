import { useRef, useState } from 'react';
import DatePicker from 'react-datepicker';
import { zhCN } from 'date-fns/locale/zh-CN';
import { CalendarClock, CalendarDays, Clock3 } from 'lucide-react';
import { splitDateValue, validatePlaceholderValue, type PlaceholderField } from '../../core/placeholders';
import { ParameterInput } from './ParameterInput';
import 'react-datepicker/dist/react-datepicker.css';

interface Props {
  field: PlaceholderField;
  value: string | undefined;
  id: string;
  describedBy?: string;
  onChange(value: string): void;
}

const pad = (value: number) => String(value).padStart(2, '0');
const dateText = (date: Date) => `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function DateParameterInput({ field, value, id, describedBy, onChange }: Props) {
  const picker = useRef<DatePicker>(null);
  const [open, setOpen] = useState(false);
  const parts = splitDateValue(value ?? '');
  const timeParts = parts.time.split(':');
  const display = (raw: string) => raw.replace('T', ' ');
  const invalid = Boolean(validatePlaceholderValue(field, value || undefined));
  const label = `${field.name} ${field.date ? field.time ? '日期和时间' : '日期' : '时间'}`;
  const Icon = field.date ? field.time ? CalendarClock : CalendarDays : Clock3;
  let selected: Date | null = null;
  // Construct a local calendar date; never parse a date-only string as UTC.
  if (parts.date && !validatePlaceholderValue({ ...field, time: false }, parts.date)) {
    const [year, month, day] = parts.date.split('-').map(Number);
    selected = new Date(0);
    selected.setFullYear(year, month - 1, day);
    selected.setHours(0, 0, 0, 0);
  }
  function changeTime(index: number, next: string) {
    const nextParts = Array.from({ length: field.seconds ? 3 : 2 }, (_, i) => timeParts[i] ?? (i === 2 && parts.time ? '00' : ''));
    nextParts[index] = next;
    const time = nextParts.some(Boolean) ? nextParts.join(':') : '';
    onChange(field.date && (parts.date || time) ? `${parts.date}T${time}` : time);
  }
  return <div className="placeholder-date-input">
    <DatePicker ref={picker}
      id={id} aria-label={label} aria-invalid={String(invalid)} aria-describedby={describedBy}
      selected={selected} value={display(value ?? '')}
      locale={zhCN} dateFormatCalendar="yyyy年 M月" calendarStartDay={1}
      dateFormat={field.date ? field.time ? `yyyy-MM-dd HH:mm${field.seconds ? ':ss' : ''}` : 'yyyy-MM-dd' : `HH:mm${field.seconds ? ':ss' : ''}`}
      autoComplete="off" placeholderText={field.date ? field.time ? '选择日期和时间' : '选择日期' : '选择时间'}
      customInput={<ParameterInput active={open} defaultText={field.defaultValue === undefined ? undefined : display(field.defaultValue)} icon={<Icon size={15} />} />}
      onChangeRaw={event => {
        if (!(event?.target instanceof HTMLInputElement)) return;
        event.preventDefault();
        onChange(field.date && field.time ? event.target.value.replace(' ', 'T') : event.target.value);
      }}
      onChange={(date: Date | null) => onChange(date ? field.time ? `${dateText(date)}T${parts.time}` : dateText(date) : '')}
      shouldCloseOnSelect={!field.time} showTimeSelectOnly={!field.date}
      onCalendarOpen={() => setOpen(true)} onCalendarClose={() => setOpen(false)}
      portalId="placeholder-datepicker-portal" popperPlacement="bottom-start" popperProps={{ strategy: 'fixed' }}
      calendarClassName="parameter-calendar" popperClassName="parameter-datepicker-popper" showPopperArrow={false}
      previousMonthButtonLabel="上个月" nextMonthButtonLabel="下个月"
      previousMonthAriaLabel="上个月" nextMonthAriaLabel="下个月"
    >
      {field.time && <div className="parameter-time" role="group" aria-label={`${field.name} 时间选择`}>
        <span><Clock3 size={14} aria-hidden="true" />时间</span>
        <div className="parameter-time-selects">
          {(field.seconds ? ['时', '分', '秒'] : ['时', '分']).map((unit, index) => <label key={unit}>
            <select aria-label={`${field.name} ${unit}`} value={timeParts[index] ?? (index === 2 && parts.time ? '00' : '')} onChange={event => changeTime(index, event.target.value)}>
              <option value="">--</option>
              {Array.from({ length: index === 0 ? 24 : 60 }, (_, number) => <option key={number} value={pad(number)}>{pad(number)}</option>)}
            </select>
            <span>{unit}</span>
          </label>)}
        </div>
      </div>}
      <div className="parameter-calendar-actions">
        <button type="button" onClick={() => { onChange(''); picker.current?.setOpen(false); }}>清空</button>
        <button type="button" onClick={() => picker.current?.setOpen(false)}>完成</button>
      </div>
    </DatePicker>
  </div>;
}
