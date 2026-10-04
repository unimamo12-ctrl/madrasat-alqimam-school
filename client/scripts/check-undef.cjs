"use strict";
// فاحص دقيق: يمرّ على كل ملفات الواجهة ويكشف المعرّفات غير المعرّفة (Identifier not defined)
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverseModule = require('@babel/traverse');
const traverse = traverseModule.default || traverseModule;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', 'dist', 'build'].includes(e.name)) walk(p, out); }
    else if (/\.jsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(path.resolve(__dirname, '..', 'src'));
let problems = 0;
for (const f of files) {
  const code = fs.readFileSync(f, 'utf8');
  let ast;
  try {
    ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx'], allowReturnOutsideFunction: true });
  } catch (e) {
    console.log(`SYNTAX ${path.relative(process.cwd(), f)}: ${e.message}`);
    problems++;
    continue;
  }
  traverse(ast, {
    ReferencedIdentifier(p) {
      const name = p.node.name;
      // المتغيرات المحلية (params, var, let, const, functions, imports, catch) لا يُبلّغ عنها traverse
      if (!p.scope.hasBinding(name)) {
        // تجاهل الأسماء العامة المعروفة
        const known = new Set(['window', 'document', 'console', 'fetch', 'setTimeout', 'clearTimeout', 'setInterval',
          'localStorage', 'sessionStorage', 'navigator', 'location', 'history', 'globalThis', 'undefined', 'NaN',
          'Infinity', 'React', 'process', 'require', 'module', 'exports', '__dirname', 'arguments']);
        if (!known.has(name) && !/^[A-Z0-9_]+$/.test(name)) {
          const line = p.node.loc ? p.node.loc.start.line : 0;
          console.log(`UNDEF  ${path.relative(process.cwd(), f)}:${line} -> ${name}`);
          problems++;
        }
      }
    },
    // أخطاء إضافية: تكرار تعريف في نفس النطاق
    VariableDeclarator(p) {
      const n = p.node.id;
      if (n.type === 'Identifier' && p.scope.hasOwnBinding(n.name)) {
        const first = p.scope.getBinding(n.name);
        if (first && first.path !== p) {
          console.log(`DUP    ${path.relative(process.cwd(), f)}:${n.loc.start.line} -> ${n.name} (أول تعريف في السطر ${first.path.node.loc.start.line})`);
          problems++;
        }
      }
    }
  });
}
console.log(problems === 0 ? 'OK: لا أخطاء (undefined / تكرار)' : `TOTAL: ${problems}`);