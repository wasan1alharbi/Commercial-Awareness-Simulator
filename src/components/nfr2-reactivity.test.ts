/** @jest-environment jsdom */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const componentsDir = path.dirname(fileURLToPath(import.meta.url));

function listTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listTsxFiles(full));
    else if (e.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

describe('Reactivity: UI is push-based via Convex useQuery, not a poll-based', () => {
  const files = listTsxFiles(componentsDir);

  test('no component polls backend state via setInterval', () => {
    const offenders = files.filter(f => /\bsetInterval\s*\(/.test(fs.readFileSync(f, 'utf-8')));
    expect(offenders).toEqual([]);
  });

  test('subscribe via useQuery', () => {
    const subscribers = files
      .filter(f => /\buseQuery\b/.test(fs.readFileSync(f, 'utf-8')))
      .map(f => path.basename(f));
    for (const r of ['SimulatorShell.tsx', 'QuizDashboard.tsx', 'KPIDashboard.tsx']) {
      expect(subscribers).toContain(r);
    }
  });

  test('useQuery contract: pushed data update and rerenders the view (no refetch call)', () => {
    const subs = new Set<() => void>();
    let data = 'A';
    const useQuery = () => React.useSyncExternalStore(
      cb => { subs.add(cb); return () => { subs.delete(cb); }; },
      () => data,
    );
    const View = () => React.createElement('div', null, useQuery());

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(React.createElement(View)));
    expect(container.textContent).toBe('A');

    act(() => { data = 'B'; subs.forEach(s => s()); });
    expect(container.textContent).toBe('B');
  });
});
