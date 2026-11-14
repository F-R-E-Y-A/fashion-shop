// tools/evidence/github-metrics.mjs — xuat so lieu minh chung cho rubric TC2.4 va TC2.6 tu GitHub.
// Ti le tuan co commit, ti le PR da gop co review, ti le pipeline xanh, so lan deploy tu dong.
// Dung: npm run evidence:github -- --since 2026-09-09 > ../tlcn-docs/minh-chung/github-metrics.md   (gh da dang nhap)
import { spawnSync } from 'node:child_process';

const sinceArg = process.argv.indexOf('--since');
const since = sinceArg > -1 ? process.argv[sinceArg + 1] : '2026-09-09';
const repo = process.env.GITHUB_REPOSITORY ?? 'F-R-E-Y-A/fashion-shop';

// Goi thang gh.exe, KHONG qua shell: tren Windows cmd.exe cat URL tai dau `&` (per_page=100 thanh
// lenh rieng) nen lan goi dau da hong. Bo dem lon vi --paginate tra ca lich su commit va run.
function gh(...args) {
  const r = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.error) throw r.error;
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

// Run tra ve doi tuong { workflow_runs } moi trang; --paginate noi cac doi tuong lien nhau (khong phai
// JSON hop le), --slurp gom thanh mang cac trang.
const runPages = gh('api', '--paginate', '--slurp', `repos/${repo}/actions/runs?per_page=100`);
const runs = Array.isArray(runPages)
  ? runPages.flatMap((page) => page.workflow_runs ?? [])
  : (runPages.workflow_runs ?? []);
const inRange = runs.filter((r) => r.created_at >= since);
const ci = inRange.filter((r) => r.name === 'CI' && r.status === 'completed');
const green = ci.filter((r) => r.conclusion === 'success');
// Run bi huy (cancelled) khong phai build do: PR day commit moi thi luot cu bi huy; truoc ADR CI/CD
// 14/11 gop don vao develop cung huy luot giua. Bao ca hai cach dem, ghi ro dinh nghia.
const cancelled = ci.filter((r) => r.conclusion === 'cancelled');
const ciDevelop = ci.filter((r) => r.event === 'push' && r.head_branch === 'develop');
const greenDevelop = ciDevelop.filter((r) => r.conclusion === 'success');
const cancelledDevelop = ciDevelop.filter((r) => r.conclusion === 'cancelled');

// CD xanh gom hai loai: that su goi Render, va bo qua vi staging da chay ban moi hon chua commit nay
// (buoc "Bo qua neu staging..." trong cd-staging.yml). Phan biet bang ket qua buoc goi Render.
const DEPLOY_STEP = 'Goi Render dung va trien khai may chu';
const cdOk = inRange.filter((r) => r.name === 'CD staging' && r.conclusion === 'success');
const cdKind = new Map(
  cdOk.map((r) => {
    const { jobs = [] } = gh('api', `repos/${repo}/actions/runs/${r.id}/jobs`);
    const step = jobs.flatMap((j) => j.steps ?? []).find((s) => s.name === DEPLOY_STEP);
    return [r.id, step?.conclusion === 'skipped' ? 'covered' : 'deployed'];
  }),
);
const deploys = cdOk.filter((r) => cdKind.get(r.id) === 'deployed');
const covered = cdOk.filter((r) => cdKind.get(r.id) === 'covered');
const autoDeploys = deploys.filter((r) => r.event === 'workflow_run');
const deploysByWeek = autoDeploys.reduce(
  (m, r) => ((m[weekKey(r.created_at)] = (m[weekKey(r.created_at)] ?? 0) + 1), m),
  {},
);

// Gop -> staging: tu luc CI cua lan day develop bat dau (xap xi luc gop) toi khi lan trien khai
// that dau tien bat dau tu sau do ket thuc. Chi tinh tu lan CD xanh dau tien (truoc do CD chua dung xong).
const minutes = (a, b) => (new Date(b) - new Date(a)) / 60000;
const deploysAsc = [...autoDeploys].sort((a, b) => a.created_at.localeCompare(b.created_at));
const firstDeploy = deploysAsc[0]?.created_at;
const leads = ciDevelop
  .filter((c) => firstDeploy && c.created_at >= firstDeploy)
  .flatMap((c) => {
    const next = deploysAsc.find((d) => d.created_at >= c.created_at);
    return next ? [minutes(c.created_at, next.updated_at)] : [];
  })
  .sort((a, b) => a - b);
const quantile = (p) =>
  leads.length ? leads[Math.min(leads.length - 1, Math.floor(p * leads.length))].toFixed(0) : 'n/a';

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : 'n/a');
console.log(`# So lieu GitHub cho rubric (tu ${since}, xuat ${new Date().toISOString().slice(0, 10)})

| Metric (rubric) | Gia tri | Nguong Muc 5 |
|---|---|---|
| Ti le tuan co commit (TC2.4) | ${weeksWithCommit.size}/${totalWeeks} = ${pct(weeksWithCommit.size, totalWeeks)} | >= 90% |
| Ti le PR da gop co review cua nguoi khac (TC2.4) | ${reviewed.length}/${prs.length} = ${pct(reviewed.length, prs.length)} | >= 90% |
| Ti le pipeline CI xanh, moi run da xong (TC2.6) | ${green.length}/${ci.length} = ${pct(green.length, ci.length)} | >= 90% |
| Ti le pipeline CI xanh, bo run bi huy (TC2.6) | ${green.length}/${ci.length - cancelled.length} = ${pct(green.length, ci.length - cancelled.length)} | >= 90% |
| CI tren develop: xanh / bi huy / tong | ${greenDevelop.length} / ${cancelledDevelop.length} / ${ciDevelop.length} | |
| So lan trien khai tu dong len staging (TC2.6) | ${autoDeploys.length} (chay tay: ${deploys.length - autoDeploys.length}; CD xanh nhung khong dung lai vi da co trong ban moi hon: ${covered.length}) | >= 10, trai deu |
| Trien khai tu dong theo tuan (thu Hai) | ${
  Object.entries(deploysByWeek)
    .map(([w, n]) => `${w}: ${n}`)
    .join(', ') || 'n/a'
} | trai deu |
| Gop -> staging, phut (${leads.length} lan day develop) | trung vi ${quantile(0.5)}, p90 ${quantile(0.9)}, lon nhat ${leads.length ? leads.at(-1).toFixed(0) : 'n/a'} | <= 15 |
| Tong commit | ${commits.length} | |

Dinh nghia: "bi huy" la run cancelled (bi luot moi hon thay); "gop -> staging" tinh tu luc CI cua lan day develop bat dau toi khi lan trien khai that ke tiep xong.
`);
