import tomorrowTheme from '../../core/tomorrow.json' with { type: 'json' };
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
// Original Tomorrow palette: https://github.com/chriskempson/tomorrow-theme
// TextMate scopes are retained for compatibility; Monarch tokens use the same palette.
monaco.editor.defineTheme('tomorrow', {
  base: 'vs', inherit: false,
  rules: [
    { token: '', foreground: '4D4D4C', background: 'FFFFFF' },
    ...tomorrowTheme.tokenColors.flatMap(rule => rule.scope.split(', ').map(token => ({
      token, ...rule.settings,
      foreground: rule.settings.foreground?.replace('#', ''),
      background: rule.settings.background?.replace('#', ''),
    }))),
    { token: 'comment', foreground: '8E908C' },
    { token: 'keyword', foreground: '8959A8' },
    { token: 'keyword.operator', foreground: '3E999F' },
    { token: 'operator', foreground: '3E999F' },
    { token: 'delimiter', foreground: '4D4D4C' },
    { token: 'identifier', foreground: '4D4D4C' },
    { token: 'type', foreground: 'C99E00' },
    { token: 'type.identifier', foreground: 'C99E00' },
    { token: 'number', foreground: 'F5871F' },
    { token: 'constant', foreground: 'F5871F' },
    { token: 'string', foreground: '718C00' },
    { token: 'string.escape', foreground: 'F5871F' },
    { token: 'regexp', foreground: 'C82829' },
    { token: 'tag', foreground: 'C82829' },
    { token: 'attribute.name', foreground: 'C82829' },
    { token: 'attribute.value', foreground: '718C00' },
    { token: 'variable', foreground: 'C82829' },
    { token: 'function', foreground: '4271AE' },
  ],
  colors: {
    ...tomorrowTheme.colors,
    'editorLineNumber.foreground': '#8E908C', 'editorLineNumber.activeForeground': '#4D4D4C',
    'editorGutter.background': '#FFFFFF', 'editorStickyScroll.background': '#FFFFFF',
    'editorOverviewRuler.background': '#FFFFFF', 'editor.inactiveSelectionBackground': '#D6D6D680',
    'editor.lineHighlightBorder': '#FFFFFF00',
    'editorIndentGuide.background1': '#D1D1D1', 'editorIndentGuide.activeBackground1': '#8E908C',
    'editorWidget.background': '#FFFFFF', 'editorWidget.border': '#D1D1D1',
    'editorBracketMatch.background': '#EFEFEF', 'editorBracketMatch.border': '#D1D1D1',
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
