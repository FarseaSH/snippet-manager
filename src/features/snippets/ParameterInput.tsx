import type { InputHTMLAttributes, ReactNode, Ref } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  defaultText?: string;
  icon?: ReactNode;
  active?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function ParameterInput({ defaultText, icon, active, ...props }: Props) {
  const value = String(props.value ?? '');
  const isDefault = defaultText !== undefined && value !== '' && value === defaultText;
  return <div className={`placeholder-input${value === '' ? ' is-empty' : ''}${isDefault ? ' is-default' : ''}${icon ? ' has-icon' : ''}${active ? ' is-open' : ''}`}>
    <input {...props} />
    {isDefault && <span className="placeholder-default" aria-hidden="true">{defaultText}</span>}
    {icon && <span className="placeholder-input-icon" aria-hidden="true">{icon}</span>}
  </div>;
}
