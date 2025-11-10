import { readFile, writeFile, copyFile, mkdir, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function ensureDist(dir) {
  await mkdir(dir, { recursive: true });
}

async function main() {
  const pkgRoot = path.resolve(__dirname, '..');
  const distDir = path.join(pkgRoot, 'dist');
  await ensureDist(distDir);

  const existing = await readdir(distDir, { withFileTypes: true });
  await Promise.all(
    existing
      .filter((entry) => entry.isFile() && entry.name.startsWith('badge-v') && entry.name.endsWith('.mjs'))
      .map((entry) => unlink(path.join(distDir, entry.name)))
  );

  const pkgRaw = await readFile(path.join(pkgRoot, 'package.json'), 'utf8');
  const pkg = JSON.parse(pkgRaw);
  const version = pkg.version || '0.0.0';

  const entryPath = path.join(distDir, 'index.js');
  const targetFile = `badge-v${version}.mjs`;
  const targetPath = path.join(distDir, targetFile);

  await copyFile(entryPath, targetPath);

  const fileBuffer = await readFile(targetPath);
  const integrityHash = createHash('sha384').update(fileBuffer).digest('base64');
  const integrity = `sha384-${integrityHash}`;

  const meta = {
    version,
    file: targetFile,
    integrity,
    generatedAt: new Date().toISOString()
  };

  await writeFile(path.join(distDir, 'badge.meta.json'), JSON.stringify(meta, null, 2));
}

main().catch((error) => {
  console.error('Failed to prepare badge build', error);
  process.exitCode = 1;
});
