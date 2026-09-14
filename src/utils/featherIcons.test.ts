/// <reference types="node" />
import fs from 'fs';
import path from 'path';
import feather from 'react-native-vector-icons/glyphmaps/Feather.json';
import material from 'react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json';

/**
 * An icon set renders a "?" for a name it does not know, which is easy to ship and easy to
 * miss in review. This walks the source for literal icon names and checks each one exists.
 */
const SRC = path.join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const names = (source: string, pattern: RegExp) => [...source.matchAll(pattern)].map((match) => match[1]);

it('every Feather icon rendered directly exists', () => {
  const known = new Set(Object.keys(feather));
  const unknown: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const name of names(source, /<Feather[^>]*?\sname=["']([a-z0-9-]+)["']/g)) {
      if (!known.has(name)) unknown.push(`${path.relative(SRC, file)}: ${name}`);
    }
  }
  expect(unknown).toEqual([]);
});

it('every icon name passed as a prop belongs to an icon set we ship', () => {
  // An `icon` prop reaches Feather or MaterialCommunityIcons depending on the component, so
  // a name in neither set is a bug whichever one it was meant for.
  const known = new Set([...Object.keys(feather), ...Object.keys(material)]);
  const unknown: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const name of names(source, /\bicon(?::\s*|=)["']([a-z0-9-]+)["']/g)) {
      if (!known.has(name)) unknown.push(`${path.relative(SRC, file)}: ${name}`);
    }
  }
  expect(unknown).toEqual([]);
});
