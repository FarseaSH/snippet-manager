import { Folder } from 'lucide-react';
import { getLanguageIcon } from '../../core/language-icons';
import { LanguageIcon } from '../snippets/LanguageIcon';

export function FolderIcon({ icon, size = 16 }: { icon?: string; size?: number }) {
  if (icon && getLanguageIcon(icon)) return <LanguageIcon language={icon} size={size} />;
  return <Folder size={size} aria-hidden="true" focusable="false" data-folder-icon="default" />;
}
