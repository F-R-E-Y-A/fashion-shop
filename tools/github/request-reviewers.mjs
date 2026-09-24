// tools/github/request-reviewers.mjs — gan nguoi duyet pull request theo .github/CODEOWNERS.
// Vi sao co tep nay: repo PRIVATE tren goi GitHub Free khong tu gan nguoi duyet theo CODEOWNERS
// (tinh nang tra phi). Workflow pr-reviewers.yml goi script nay de lam thay.
// Doc tu bien moi truong: CHANGED_FILES (moi dong mot tep), PR_AUTHOR, PR_NUMBER, GITHUB_REPOSITORY, GH_TOKEN.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const SPECIALS = new Set(['.', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\']);

const codeowners = fs.readFileSync('.github/CODEOWNERS', 'utf8');
const changed = (process.env.CHANGED_FILES ?? '')
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);
const author = (process.env.PR_AUTHOR ?? '').toLowerCase();
const prNumber = process.env.PR_NUMBER;
const repo = process.env.GITHUB_REPOSITORY;

/** Doi mot dong CODEOWNERS sang RegExp theo cach GitHub hieu, du dung cho tep cua nhom. */
function patternToRegExp(pattern) {
  let p = pattern;
  const anchored = p.startsWith('/');
  if (anchored) p = p.slice(1);
  if (p.endsWith('/')) p = p.slice(0, -1);
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*') {
      if (p[i + 1] === '*') {
        re += '.*';
        i++;
        if (p[i + 1] === '/') i++;
      } else re += '[^/]*';
    } else if (SPECIALS.has(c)) re += '\\' + c;
    else re += c;
  }
  const prefix = anchored || p.includes('/') ? '^' : '(^|/)';
  return new RegExp(prefix + re + '(/.*)?$');
}

const rules = codeowners
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => {
    const [pattern, ...owners] = l.split(/\s+/);
    return { re: patternToRegExp(pattern), owners: owners.map((o) => o.replace(/^@/, '')) };
  });

const reviewers = new Set();
for (const file of changed) {
  // GitHub lay dong khop CUOI CUNG trong tep.
  let match = null;
  for (const rule of rules) if (rule.re.test(file)) match = rule;
  match?.owners.forEach((o) => reviewers.add(o));
}
for (const r of [...reviewers]) if (r.toLowerCase() === author) reviewers.delete(r);

if (reviewers.size === 0) {
  console.log('Khong co nguoi duyet nao ngoai tac gia; bo qua.');
  process.exit(0);
}
console.log(`Gan nguoi duyet: ${[...reviewers].join(', ')}`);
const args = ['api', '-X', 'POST', `repos/${repo}/pulls/${prNumber}/requested_reviewers`];
for (const r of reviewers) args.push('-f', `reviewers[]=${r}`);
const result = spawnSync('gh', args, { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(result.status ?? 1);
