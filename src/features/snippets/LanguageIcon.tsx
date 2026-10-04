import { Code2 } from 'lucide-react';
import { getLanguageIcon } from '../../core/language-icons';

export function LanguageIcon({ language, size = 14 }: { language: string; size?: number }) {
  const icon = getLanguageIcon(language);
  if (!icon) return <Code2 size={size} className="language-icon" data-language-icon="fallback" aria-hidden="true" />;
  return <svg className="language-icon" width={size} height={size} viewBox="0 0 24 24" fill={icon.stroke ? 'none' : 'currentColor'} stroke={icon.stroke ? 'currentColor' : undefined} strokeWidth={icon.stroke ? 2 : undefined} strokeLinecap={icon.stroke ? 'round' : undefined} strokeLinejoin={icon.stroke ? 'round' : undefined} aria-hidden="true" focusable="false" data-language-icon={icon.slug}>
    <path d={icon.path} />
  </svg>;
}
