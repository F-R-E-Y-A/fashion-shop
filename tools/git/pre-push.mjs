// tools/git/pre-push.mjs — hook pre-push, hai viec:
//   1. Chan day thang vao develop va main. Moi thay doi di qua pull request (docs/GIT_FLOW.md).
//      Truong hop khan cap: ALLOW_DIRECT_PUSH=1 git push ...
//   2. Kiem kieu ca hai workspace truoc khi day, de CI khong do vi loi bat duoc ngay tren may.
//      Bo qua buoc nay: SKIP_TYPECHECK=1 git push ...
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const PROTECTED = new Set(['refs/heads/develop', 'refs/heads/main']);

// Git day danh sach ref qua stdin. Goi tay (khong co stdin) thi coi nhu khong day ref nao.
const readStdin = () => {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
};
const stdin = readStdin();
// Moi dong: <local ref> <local sha> <remote ref> <remote sha>
const remoteRefs = stdin
  .split('\n')
  .map((line) => line.trim().split(' ')[2])
  .filter(Boolean);
const direct = remoteRefs.filter((ref) => PROTECTED.has(ref));

if (direct.length > 0 && process.env.ALLOW_DIRECT_PUSH !== '1') {
  console.error(`
✖ Khong day thang vao ${direct.map((r) => r.replace('refs/heads/', '')).join(', ')}.
  Mo pull request vao develop; CI xanh va mot nguoi khac duyet roi moi gop (docs/GIT_FLOW.md).
  Khan cap: ALLOW_DIRECT_PUSH=1 git push ...
`);
  process.exit(1);
}

if (process.env.SKIP_TYPECHECK === '1') process.exit(0);

console.log('pre-push: kiem kieu hai workspace...');
const result = spawnSync('npm', ['run', 'typecheck', '--silent'], {
  stdio: 'inherit',
  shell: true,
});
process.exit(result.status ?? 1);
