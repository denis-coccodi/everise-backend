// Fails when an exported data type lives outside a model or DTO file (see the
// backend-best-practices skill): node scripts/check-types.mjs.
//
// - The app's own data (stored documents, records, a service's params and
//   results) is in <name>-model.ts; what crosses the boundary (what the API
//   answers, what an outside service sends) in <name>-dto.ts; the API's
//   request and response schemas in <feature>-schemas.ts.
// - Ports stay with their code: an interface with methods (Db, FileStore) or
//   a function type (the *Fetch types the tests replace).
import {readFileSync, readdirSync} from 'node:fs';
import ts from 'typescript';

const HOMES = /-(model|dto|schemas)\.ts$/;

const files = [];
const walk = dir => {
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(path);
    }
  }
};
walk('src');

const isPort = node =>
  ts.isInterfaceDeclaration(node)
    ? node.members.some(
        m => ts.isMethodSignature(m) || ts.isCallSignatureDeclaration(m),
      )
    : ts.isFunctionTypeNode(node.type);

const problems = [];
for (const path of files.filter(f => !HOMES.test(f))) {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  // Exported by `export interface` or by name in an `export {…}` list.
  const listed = new Set();
  for (const statement of source.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      !statement.moduleSpecifier &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const e of statement.exportClause.elements) {
        listed.add((e.propertyName ?? e.name).text);
      }
    }
  }
  for (const statement of source.statements) {
    if (
      !ts.isInterfaceDeclaration(statement) &&
      !ts.isTypeAliasDeclaration(statement)
    ) {
      continue;
    }
    const exported =
      listed.has(statement.name.text) ||
      statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    if (exported && !isPort(statement)) {
      problems.push(`${path}: ${statement.name.text}`);
    }
  }
}

if (problems.length > 0) {
  console.error(
    'Data types outside a model or DTO file (<name>-model.ts, <name>-dto.ts):\n  ' +
      problems.join('\n  '),
  );
  process.exit(1);
}
console.log(
  `Types: every exported data type of ${files.length} files is in a model, DTO or schemas file.`,
);
