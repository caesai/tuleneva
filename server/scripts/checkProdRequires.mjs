/**
 * @file Проверяет, что каждый внешний require бандла сервера ставится в production.
 *
 * Читает `dist/index.cjs` и вызывает `require.resolve` из каталога, где выполнен
 * `npm ci --omit=dev`. Так CI ловит пакет, который esbuild оставил внешним,
 * а на VPS его нет, потому что он лежал только в devDependencies.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const bundlePath = process.argv[2];
const prodDir = process.argv[3];

if (!bundlePath || !prodDir) {
    console.error('usage: node scripts/checkProdRequires.mjs <dist/index.cjs> <prod-dir>');
    process.exit(2);
}

const source = fs.readFileSync(bundlePath, 'utf8');
const names = new Set();
const requirePattern = /require\(\s*(['"])([^'"]+)\1\s*\)/g;
for (const match of source.matchAll(requirePattern)) {
    names.add(match[2]);
}

if (names.size === 0) {
    console.error(`в ${bundlePath} не найдено require()`);
    process.exit(1);
}

const requireFromProd = createRequire(path.join(path.resolve(prodDir), 'package.json'));
const missing = [];

for (const name of [...names].sort()) {
    try {
        requireFromProd.resolve(name);
    } catch {
        missing.push(name);
    }
}

if (missing.length > 0) {
    console.error('production-установка не резолвит:\n' + missing.map((name) => `  ${name}`).join('\n'));
    process.exit(1);
}

console.log(`production requires ok (${names.size})`);
