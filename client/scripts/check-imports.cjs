"use strict";
// فحص الواجهة: يستورد صفحة الدفع في Node (jsdom غير متاح) — نتحقق من الواردات والتعريفات
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const files = [
  'src/pages/admin/Payments.jsx',
  'src/pages/admin/Unpaid.jsx',
  'src/pages/admin/PaymentHistory.jsx',
  'src/pages/admin/Dashboard.jsx'
];
let problems = 0;
for (const rel of files) {
  const file = path.resolve(__dirname, '..', rel);
  const code = fs.readFileSync(file, 'utf8');
  const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx'] });
  const imports = [];
  const traverse = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(traverse);
    if (n.type === 'ImportDeclaration') imports.push({ src: n.source.value, names: n.specifiers.map(s => s.local.name) });
    for (const k of Object.keys(n)) { if (k !== 'loc') traverse(n[k]); }
  };
  traverse(ast);

  // كل مسار استيراد موجود فعلاً؟
  for (const im of imports) {
    if (!im.src.startsWith('.')) continue; // حزم npm — يتكفّل بها البناء
    const base = path.resolve(path.dirname(file), im.src);
    const ok = ['', '.js', '.jsx', '.json', '/index.js', '/index.jsx'].some(ext => fs.existsSync(base + ext));
    if (!ok) { console.log(`MISSING FILE  ${rel}  ->  ${im.src}`); problems++; }
  }
  // أسماء مستوردة مستعملة فعلاً؟ (يمنع أخطاء أحرف/أسماء)
  const used = new Set();
  const t2 = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(t2);
    if (n.type === 'Identifier') used.add(n.name);
    for (const k of Object.keys(n)) { if (k !== 'loc') t2(n[k]); }
  };
  t2(ast);
  for (const im of imports) {
    for (const nm of im.names) {
      const count = (code.match(new RegExp(`\\b${nm}\\b`, 'g')) || []).length;
      if (count <= 1) { console.log(`UNUSED IMPORT  ${rel}  ->  ${nm}  (${im.src})`); problems++; }
    }
  }
  console.log(`${rel}: ${imports.length} imports, ${code.split('\n').length} سطر`);
}
console.log(problems === 0 ? '\nOK: كل الاستيرادات موجودة ولا يوجد استيراد زائد' : `\nTOTAL: ${problems}`);