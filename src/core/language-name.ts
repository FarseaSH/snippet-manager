// Display names only: fence identifiers still control highlighting and raw copies.
const names = [
  ['JavaScript', 'js', 'mjs', 'cjs'],
  ['TypeScript', 'ts'],
  ['JavaScript (JSX)', 'jsx'],
  ['TypeScript (TSX)', 'tsx'],
  ['Python', 'py', 'python3'],
  ['Ruby', 'rb'], ['Rust', 'rs'], ['Go', 'golang'],
  ['C'], ['C++', 'cpp', 'cxx', 'cc'], ['C#', 'csharp', 'cs'], ['F#', 'fsharp', 'fs'],
  ['Java'], ['Kotlin', 'kt', 'kts'], ['Swift'], ['Objective-C', 'objc', 'objectivec'],
  ['Dart'], ['Scala'], ['Lua'], ['R'], ['PHP'], ['Perl', 'pl'],
  ['Shell', 'sh', 'shellscript'], ['Bash'], ['Zsh'], ['Fish'],
  ['PowerShell', 'ps1', 'ps'], ['Batch', 'bat', 'cmd'],
  ['HTML', 'html5', 'htm'], ['CSS', 'css3'], ['SCSS'], ['Sass'], ['Less'],
  ['JSON'], ['JSONC'], ['JSON5'], ['YAML', 'yml'], ['XML'], ['TOML'], ['INI'],
  ['Markdown', 'md'], ['MDX'], ['SQL'], ['GraphQL', 'gql'],
  ['PostgreSQL', 'postgres', 'pgsql'], ['MySQL'], ['SQLite'],
  ['Dockerfile', 'docker'], ['Makefile', 'make'], ['Diff', 'patch'],
  ['Vue'], ['Svelte'], ['Astro'], ['Regular Expression', 'regex', 'regexp'],
  ['Plain Text', 'text', 'txt', 'plaintext', 'plain'],
];
const labels = new Map(names.flatMap(([name, ...aliases]) =>
  [name, ...aliases].map(alias => [alias.toLowerCase(), name] as const)));

export function languageName(language: string): string {
  const value = language.trim();
  return labels.get(value.toLowerCase()) ?? (value || 'Plain Text');
}
