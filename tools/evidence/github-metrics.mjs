// tools/evidence/github-metrics.mjs — xuat so lieu minh chung cho rubric TC2.4 va TC2.6 tu GitHub.
// Ti le tuan co commit, ti le PR da gop co review, ti le pipeline xanh, so lan deploy tu dong.
// Dung: npm run evidence:github -- --since 2026-09-09 > ../tlcn-docs/minh-chung/github-metrics.md   (gh da dang nhap)
import { spawnSync } from 'node:child_process';

const sinceArg = process.argv.indexOf('--since');
const since = sinceArg > -1 ? process.argv[sinceArg + 1] : '2026-09-09';
const repo = process.env.GITHUB_REPOSITORY ?? 'F-R-E-Y-A/fashion-shop';

function gh(...args) {
  const r = spawnSync('gh', args, { encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(r.stderr || `gh ${args.join(' ')} that bai`);
  return JSON.parse(r.stdout || '[]');
}

/** Thu Hai cua tuan chua ngay iso, dang YYYY-MM-DD. */
const weekKey = (iso) => {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
};

const commits = gh(
  'api',
  '--paginate',
  `repos/${repo}/commits?since=${since}T00:00:00Z&per_page=100`,
);
const weeksWithCommit = new Set(commits.map((c) => weekKey(c.commit.author.date)));
const totalWeeks = Math.max(1, Math.ceil((Date.now() - new Date(since)) / (7 * 864e5)));

const prs = gh(
  'pr',
  'list',
  '-R',
  repo,
  '--state',
  'merged',
  '--limit',
  '500',
  '--json',
  'number,mergedAt,reviews,author',
);
const reviewed = prs.filter((p) =>
  p.reviews.some((r) => r.state === 'APPROVED' && r.author?.login !== p.author?.login),
);

const runPages = gh('api', '--paginate', `repos/${repo}/actions/runs?per_page=100`);
const runs = Array.isArray(runPages)
  ? runPages.flatMap((page) => page.workflow_runs ?? [])
  : (runPages.workflow_runs ?? []);
const inRange = runs.filter((r) => r.created_at >= since);
const ci = inRange.filter((r) => r.name === 'CI' && r.status === 'completed');
const green = ci.filter((r) => r.conclusion === 'success');
const deploys = inRange.filter((r) => r.name === 'CD staging' && r.conclusion === 'success');

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : 'n/a');
console.log(`# So lieu GitHub cho rubric (tu ${since}, xuat ${new Date().toISOString().slice(0, 10)})

| Metric (rubric) | Gia tri | Nguong Muc 5 |
|---|---|---|
| Ti le tuan co commit (TC2.4) | ${weeksWithCommit.size}/${totalWeeks} = ${pct(weeksWithCommit.size, totalWeeks)} | >= 90% |
| Ti le PR da gop co review cua nguoi khac (TC2.4) | ${reviewed.length}/${prs.length} = ${pct(reviewed.length, prs.length)} | >= 90% |
| Ti le pipeline CI xanh (TC2.6) | ${green.length}/${ci.length} = ${pct(green.length, ci.length)} | >= 90% |
| So lan trien khai tu dong len staging (TC2.6) | ${deploys.length} | >= 10, trai deu |
| Tong commit | ${commits.length} | |
`);
