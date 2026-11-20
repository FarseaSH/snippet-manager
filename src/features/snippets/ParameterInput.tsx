import { useRef, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  defaultText?: string;
  icon?: ReactNode;
  active?: boolean;
  onAcceptDefault?(): void;
  ref?: Ref<HTMLInputElement>;
}

export function ParameterInput({ defaultText, icon, active, onAcceptDefault, ...props }: Props) {
  const composing = useRef(false);
  const value = String(props.value ?? '');
  const isDefault = defaultText !== undefined && value === '';
  return <div className={`placeholder-input${value === '' && !isDefault ? ' is-empty' : ''}${isDefault ? ' is-default' : ''}${icon ? ' has-icon' : ''}${active ? ' is-open' : ''}`}>
    <input {...props} placeholder={undefined}
      aria-description={isDefault ? `默认值：${defaultText}` : undefined}
      onCompositionStart={event => { composing.current = true; props.onCompositionStart?.(event); }}
      onCompositionEnd={event => { composing.current = false; props.onCompositionEnd?.(event); }}
      onKeyDown={event => {
        if (event.key === 'ArrowRight' && isDefault && defaultText && onAcceptDefault && !composing.current && !event.nativeEvent.isComposing && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.currentTarget.selectionStart === event.currentTarget.selectionEnd) {
          event.preventDefault();
          const input = event.currentTarget;
          onAcceptDefault();
          requestAnimationFrame(() => {
            if (input.isConnected && document.activeElement === input) input.setSelectionRange(input.value.length, input.value.length);
          });
          return;
        }
        props.onKeyDown?.(event);
      }} />
    {isDefault && <span className="placeholder-default" aria-hidden="true">{defaultText}</span>}
    {icon && <span className="placeholder-input-icon" aria-hidden="true">{icon}</span>}
  </div>;
}
