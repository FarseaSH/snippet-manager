import {
  siC, siCplusplus, siCss, siDart, siDocker, siFishshell, siGo,
  siGraphql, siHtml5, siJavascript, siJson, siKotlin, siLua, siMarkdown,
  siMysql, siPhp, siPostgresql, siPython, siR, siRuby, siRust, siSass,
  siScala, siSqlite, siSwift, siTypescript, siXml, siYaml, siZsh,
  type SimpleIcon,
} from 'simple-icons';

type LanguageIconData = Pick<SimpleIcon, 'slug' | 'path'> & { stroke?: true };
// Lucide Terminal: a flat command prompt without a surrounding frame.
const terminalIcon: LanguageIconData = { slug: 'terminal', path: 'm4 17 6-6-6-6M12 19h8', stroke: true };
// A custom $_ prompt, drawn as paths so it stays independent of text fonts.
const bashIcon: LanguageIconData = {
  slug: 'bash-prompt', stroke: true,
  path: 'M12.5 6.5C11.5 5 10 4.5 8 4.5C5.5 4.5 3.5 5.7 3.5 7.5C3.5 9.5 5.5 10.3 8 11C10.5 11.7 12.5 12.5 12.5 14.5C12.5 16.3 10.5 17.5 8 17.5C6 17.5 4.5 17 3.5 15.5M8 2.5v17.5M16 20h6',
};

const icons = new Map<string, LanguageIconData>([
  ['python', siPython], ['javascript', siJavascript], ['typescript', siTypescript],
  ['bash', bashIcon], ['bat', terminalIcon], ['cmd', terminalIcon], ['zsh', siZsh], ['fish', siFishshell],
  ['c', siC], ['cpp', siCplusplus], ['go', siGo], ['rust', siRust],
  ['ruby', siRuby], ['php', siPhp], ['swift', siSwift], ['kotlin', siKotlin],
  ['dart', siDart], ['scala', siScala], ['lua', siLua], ['r', siR],
  ['html', siHtml5], ['css', siCss], ['scss', siSass], ['sass', siSass],
  ['json', siJson], ['yaml', siYaml], ['xml', siXml], ['markdown', siMarkdown],
  ['dockerfile', siDocker], ['graphql', siGraphql], ['mysql', siMysql],
  ['postgresql', siPostgresql], ['sqlite', siSqlite],
]);
const aliases = new Map<string, string>([
  ['py', 'python'], ['python3', 'python'], ['js', 'javascript'], ['jsx', 'javascript'],
  ['mjs', 'javascript'], ['cjs', 'javascript'], ['ts', 'typescript'], ['tsx', 'typescript'],
  ['sh', 'bash'], ['shell', 'bash'], ['shellscript', 'bash'], ['c++', 'cpp'],
  ['batch', 'bat'],
  ['cxx', 'cpp'], ['cc', 'cpp'], ['golang', 'go'], ['rs', 'rust'], ['rb', 'ruby'],
  ['html5', 'html'], ['css3', 'css'], ['yml', 'yaml'], ['md', 'markdown'],
  ['docker', 'dockerfile'], ['gql', 'graphql'], ['postgres', 'postgresql'],
]);


export function getLanguageIcon(language: string): LanguageIconData | undefined {
  const key = language.trim().toLowerCase();
  return icons.get(aliases.get(key) ?? key);
}
