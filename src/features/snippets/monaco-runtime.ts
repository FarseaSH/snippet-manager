import * as monaco from 'monaco-editor/editor/editor.api.js';
import 'monaco-editor/features/codicon/register.js';
import 'monaco-editor/editor/browser/coreCommands.js';
import 'monaco-editor/editor/contrib/clipboard/browser/clipboard.js';
import 'monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js';
import 'monaco-editor/features/find/register.js';
import 'monaco-editor/editor/contrib/folding/browser/folding.js';
import 'monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching.js';
import 'monaco-editor/editor/contrib/wordOperations/browser/wordOperations.js';
import 'monaco-editor/basic-languages/monaco.contribution.js';
import { jsonDefaults } from 'monaco-editor/languages/features/json/register.js';
// JSON also registers editor services; load them before the first editor is created.
import 'monaco-editor/languages/features/json/jsonMode.js';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker.js?worker';

self.MonacoEnvironment = {
  getWorker(_moduleId, label) { return label === 'json' ? new JsonWorker() : new EditorWorker(); },
};
jsonDefaults.setDiagnosticsOptions({ validate: false });
const codeSurface = getComputedStyle(document.documentElement).getPropertyValue('--code-surface').trim() || '#f8f9fa';

monaco.editor.defineTheme('snippet-light', {
  base: 'vs', inherit: true,
  rules: [
    { token: 'comment', foreground: '536e72' },
    { token: 'keyword', foreground: '9c3454' },
    { token: 'string', foreground: '315659' },
    { token: 'number', foreground: '2978a0' },
  ],
  colors: {
    'editor.background': codeSurface, 'editor.foreground': '#253031',
    'editorLineNumber.foreground': '#536e72', 'editorLineNumber.activeForeground': '#2978a0',
    'editorGutter.background': codeSurface, 'editor.selectionBackground': '#c6e0ff',
    'editorStickyScroll.background': codeSurface, 'editorOverviewRuler.background': codeSurface,
    'editor.inactiveSelectionBackground': '#c6e0ff80', 'editor.lineHighlightBackground': '#f5f9ff',
    'editor.lineHighlightBorder': '#ffffff00', 'editorCursor.foreground': '#2978a0',
    'editorIndentGuide.background1': '#d4e0e7', 'editorIndentGuide.activeBackground1': '#8eb7ca',
    'editorWidget.background': '#f5f9ff', 'editorWidget.border': '#d4e0e7',
    'editorBracketMatch.background': '#c6e0ff80', 'editorBracketMatch.border': '#2978a0',
  },
});

const aliases: Record<string, string> = {
  py: 'python', python3: 'python', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', sh: 'shell', bash: 'shell', shellscript: 'shell', zsh: 'shell',
  'c++': 'cpp', cxx: 'cpp', cc: 'cpp', c: 'cpp', golang: 'go', rs: 'rust', rb: 'ruby',
  yml: 'yaml', md: 'markdown', html5: 'html', css3: 'css', docker: 'dockerfile', gql: 'graphql',
  postgres: 'pgsql', postgresql: 'pgsql', mysql: 'sql', sqlite: 'sql', text: 'plaintext',
};
export function editorLanguage(language: string) {
  const key = language.trim().toLowerCase();
  const id = Object.hasOwn(aliases, key) ? aliases[key] : key;
  return monaco.languages.getLanguages().some(value => value.id === id) ? id : 'plaintext';
}

export { monaco };
