import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the real routes with DB/auth/network boundaries replaced. Unknown
// dependencies fail closed, so these tests cannot load a real database client.
export function loadSource(file: string, mocks: Record<string, unknown>, globals: Record<string, unknown> = {}): any {
  const filename = resolve(file);
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (name: string): unknown => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === 'next/server') return { NextResponse: Response };
    if (name === 'zod' || name === 'node:crypto') return require(name);
    if (name.startsWith('@/lib/linear-')) return loadSource(`src/lib/${name.slice('@/lib/'.length)}.ts`, mocks, globals);
    if (name.startsWith('./linear-')) return loadSource(resolve(dirname(filename), `${name}.ts`), mocks, globals);
    throw new Error(`Unstubbed dependency: ${name}`);
  };
  runInNewContext(code, {
    module, exports: module.exports, require: localRequire, Buffer, Request, Response, AbortSignal,
    console: { error: () => {} }, process: { env: {} },
    fetch: () => { throw new Error('Network forbidden'); }, ...globals,
  }, { filename });
  return module.exports;
}
