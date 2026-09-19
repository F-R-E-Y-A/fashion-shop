// tools/git/install-hooks.mjs — chay o buoc "prepare" cua npm install.
// Cai hook git tu khoa "simple-git-hooks" trong package.json. Bo qua trong CI va trong Docker (khong co .git).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

if (process.env.CI || !fs.existsSync('.git')) process.exit(0);

const result = spawnSync('npx', ['simple-git-hooks'], { stdio: 'inherit', shell: true });
process.exit(result.status ?? 0);
