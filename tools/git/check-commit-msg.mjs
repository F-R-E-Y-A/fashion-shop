// tools/git/check-commit-msg.mjs — hook commit-msg: kiem dinh dang commit theo docs/GIT_FLOW.md.
// Dung: node tools/git/check-commit-msg.mjs <tep chua commit message>
import fs from 'node:fs';

const TYPES = ['feat', 'fix', 'refactor', 'test', 'docs', 'chore', 'perf', 'ci', 'build', 'revert'];
const HEADER_MAX = 100;

const file = process.argv[2];
if (!file) process.exit(0);

const header =
  fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .find((line) => line.trim() && !line.startsWith('#')) ?? '';

// <loai>(<pham vi>)?: <mo ta>  — chu dau khong viet hoa, khong cham cuoi.
const pattern = new RegExp(`^(${TYPES.join('|')})(\\([a-z0-9._/-]+\\))?!?: [^A-Z\\sÀ-ỹ].*[^.\\s]$`);
const isSpecial = /^(Merge |Revert |fixup! |squash! )/.test(header);

if (isSpecial || (pattern.test(header) && header.length <= HEADER_MAX)) process.exit(0);

console.error(`
✖ Commit message khong dung quy uoc (docs/GIT_FLOW.md):
    "${header}"

  Mau : <loai>(<pham vi tuy chon>): <mo ta ngan, chu thuong dau, khong cham cuoi, toi da ${HEADER_MAX} ky tu>
  Loai: ${TYPES.join(', ')}
  Vi du: feat(ph-05): them bo loc theo danh muc o trang san pham
         fix(ph-07): sua tong tien gio hang khi bo mot dong hang
`);
process.exit(1);
