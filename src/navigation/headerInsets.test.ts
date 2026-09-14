/// <reference types="node" />
import fs from 'fs';
import path from 'path';

/**
 * ScreenContainer applies the top safe-area inset itself, so a screen using it must not also
 * sit under a native stack header - the inset lands twice and leaves a band of dead space
 * below the header. Every navigator therefore hides the native header.
 */
const NAV = __dirname;

const navigators = fs
  .readdirSync(NAV)
  .filter((name) => /Navigator\.tsx$/.test(name))
  .map((name) => ({ name, source: fs.readFileSync(path.join(NAV, name), 'utf8') }));

it('there are navigators to check', () => {
  expect(navigators.length).toBeGreaterThan(3);
});

it('no navigator leaves the native header on for a screen', () => {
  const offenders: string[] = [];
  for (const { name, source } of navigators) {
    // Only count a global opt-out declared before any screen, or a lazy match would run on
    // into a later per-screen option and report the whole navigator as covered.
    const firstScreen = source.indexOf('<Stack.Screen');
    const preamble = firstScreen === -1 ? source : source.slice(0, firstScreen);
    const hidesGlobally = /headerShown:\s*false/.test(preamble);
    if (hidesGlobally) continue;
    // Otherwise every registered screen has to opt out for itself.
    for (const match of source.matchAll(/<Stack\.Screen\s[\s\S]*?\/>/g)) {
      const tag = match[0];
      if (!/headerShown:\s*false/.test(tag)) {
        offenders.push(`${name}: ${(/name="([^"]+)"/.exec(tag) || [])[1] || tag.slice(0, 40)}`);
      }
    }
  }
  expect(offenders).toEqual([]);
});
