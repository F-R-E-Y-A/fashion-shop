import { readFileSync } from 'node:fs';

import type { Prisma, PrismaClient } from '../../src/generated/prisma/client.js';

/**
 * Danh muc tinh/xa that theo Quyet dinh 19/2025/QD-TTg (hieu luc 01/07/2025): 34 tinh, 3321 xa, khong
 * co bac huyen. Nguon va cach chep nam trong truong `source` cua tep du lieu; tep nay chi nap.
 *
 * Nap theo `code` (ma cua Quyet dinh, giu nguyen so 0 dau), trong MOT giao dich:
 *   - chua co thi them, isActive = true;
 *   - co roi, cung bac va cung tinh cha thi chi sua `name` neu khac; KHONG dong vao isActive, de ai da
 *     ngung giao toi mot xa thi chay lai seed khong mo lai;
 *   - co roi nhung khac bac hay khac tinh cha thi DUNG, khong ghi gi (AdministrativeAreaConflictError);
 *   - khong xoa, khong truncate: dong khong co trong tep (vi du khu vuc tu tao tay) giu nguyen, va id cua
 *     moi dong da co khong doi nen khoa ngoai tu addresses van dung.
 * Chay lai bao nhieu lan cung ra cung mot ket qua.
 *
 * Chi import src/generated: tep chay ca trong image API (SEED_ON_START o staging), noi khong co
 * src/modules. Production khong chay seed, dung `npm run areas:import -w apps/api`.
 */

const DATASET_URL = new URL('../data/vietnam-administrative-areas-2025.json', import.meta.url);

export interface AdministrativeDatasetProvince {
  code: string;
  name: string;
  /** So don vi cap xa theo tung loai, chep tu dong tong cua tinh trong Phu luc II. */
  xa: number;
  phuong: number;
  dacKhu: number;
}

export interface AdministrativeDatasetCommune {
  code: string;
  name: string;
  provinceCode: string;
}

export interface AdministrativeDataset {
  version: string;
  source: Record<string, string>;
  expected: { provinces: number; communes: number };
  provinces: AdministrativeDatasetProvince[];
  communes: AdministrativeDatasetCommune[];
}

export interface AdministrativeAreaSeedResult {
  provinces: number;
  communes: number;
  inserted: number;
  updated: number;
  unchanged: number;
  /** Dong co san trong bang nhung khong co trong tep: giu nguyen, chi dem de bao. */
  notInDataset: number;
}

export interface AdministrativeAreaConflict {
  code: string;
  expected: string;
  actual: string;
}

export class AdministrativeAreaConflictError extends Error {
  constructor(readonly conflicts: AdministrativeAreaConflict[]) {
    super(
      `${conflicts.length} khu vuc da co trong CSDL khac bac hoac khac tinh cha so voi tep du lieu; ` +
        'khong ghi gi. Dau tien: ' +
        conflicts
          .slice(0, 5)
          .map((c) => `${c.code} (can ${c.expected}, dang ${c.actual})`)
          .join('; '),
    );
    this.name = 'AdministrativeAreaConflictError';
  }
}

export function loadAdministrativeDataset(): AdministrativeDataset {
  return JSON.parse(readFileSync(DATASET_URL, 'utf8')) as AdministrativeDataset;
}

const COMMUNE_PREFIXES = [
  ['Xã ', 'xa'],
  ['Phường ', 'phuong'],
  ['Đặc khu ', 'dacKhu'],
] as const;

/** Tra ve danh sach loi; rong nghia la tep dung. Khong cham CSDL. */
export function validateAdministrativeDataset(dataset: AdministrativeDataset): string[] {
  const problems: string[] = [];
  const { provinces, communes, expected } = dataset;

  if (provinces.length !== expected.provinces) {
    problems.push(`Can ${expected.provinces} tinh, co ${provinces.length}`);
  }
  if (communes.length !== expected.communes) {
    problems.push(`Can ${expected.communes} xa, co ${communes.length}`);
  }

  const seen = new Set<string>();
  const checkName = (code: string, name: string) => {
    if (name.trim() !== name || name.length === 0 || /\s{2,}/.test(name)) {
      problems.push(`${code}: ten rong hoac thua khoang trang`);
    }
    if (name.normalize('NFC') !== name) problems.push(`${code}: ten chua chuan hoa NFC`);
  };
  const checkUnique = (code: string) => {
    if (seen.has(code)) problems.push(`${code}: ma trung`);
    seen.add(code);
  };

  const counts = new Map<string, { xa: number; phuong: number; dacKhu: number }>();
  for (const province of provinces) {
    if (!/^\d{2}$/.test(province.code)) problems.push(`${province.code}: ma tinh phai 2 chu so`);
    if (!/^(Tỉnh|Thành phố) \S/.test(province.name)) {
      problems.push(`${province.code}: ten tinh phai bat dau bang "Tỉnh" hoac "Thành phố"`);
    }
    checkUnique(province.code);
    checkName(province.code, province.name);
    counts.set(province.code, { xa: 0, phuong: 0, dacKhu: 0 });
  }

  for (const commune of communes) {
    if (!/^\d{5}$/.test(commune.code)) problems.push(`${commune.code}: ma xa phai 5 chu so`);
    checkUnique(commune.code);
    checkName(commune.code, commune.name);
    const kind = COMMUNE_PREFIXES.find(([prefix]) => commune.name.startsWith(prefix))?.[1];
    if (!kind) problems.push(`${commune.code}: ten xa phai bat dau bang Xã, Phường hoac Đặc khu`);
    const tally = counts.get(commune.provinceCode);
    if (!tally) problems.push(`${commune.code}: tinh cha ${commune.provinceCode} khong co`);
    else if (kind) tally[kind] += 1;
  }

  for (const province of provinces) {
    const tally = counts.get(province.code);
    if (
      tally &&
      (tally.xa !== province.xa ||
        tally.phuong !== province.phuong ||
        tally.dacKhu !== province.dacKhu)
    ) {
      problems.push(
        `${province.code}: can ${province.xa} xa, ${province.phuong} phuong, ${province.dacKhu} dac khu; ` +
          `co ${tally.xa}, ${tally.phuong}, ${tally.dacKhu}`,
      );
    }
  }

  return problems;
}

type Transaction = Prisma.TransactionClient;

export async function seedAdministrativeAreas(
  prisma: PrismaClient,
  dataset: AdministrativeDataset = loadAdministrativeDataset(),
): Promise<AdministrativeAreaSeedResult> {
  const problems = validateAdministrativeDataset(dataset);
  if (problems.length > 0) {
    throw new Error(`Tep du lieu khu vuc hanh chinh sai: ${problems.slice(0, 5).join('; ')}`);
  }

  return prisma.$transaction(
    async (tx) => {
      // Chan ghi dong thoi (hai lan seed cung luc) nhung van cho doc: API van tra danh sach trong luc nap.
      await tx.$executeRaw`LOCK TABLE administrative_areas IN SHARE ROW EXCLUSIVE MODE`;

      await assertNoConflicts(tx, dataset);

      const provinces = await upsertProvinces(tx, dataset.provinces);
      const communes = await upsertCommunes(tx, dataset.communes);

      const allCodes = [...dataset.provinces, ...dataset.communes].map((area) => area.code);
      const [counted] = await tx.$queryRaw<{ matched: bigint; others: bigint }[]>`
        SELECT count(*) FILTER (WHERE code = ANY(${allCodes}::text[])) AS matched,
               count(*) FILTER (WHERE NOT (code = ANY(${allCodes}::text[]))) AS others
        FROM administrative_areas
      `;
      // Xa ma tinh cha khong tim thay se bi JOIN bo qua am tham; dem lai de chac khong thieu dong nao.
      if (Number(counted?.matched) !== allCodes.length) {
        throw new Error(
          `Sau khi nap chi co ${String(counted?.matched)}/${allCodes.length} khu vuc; huy giao dich`,
        );
      }

      const inserted = provinces.inserted + communes.inserted;
      const updated = provinces.updated + communes.updated;
      return {
        provinces: dataset.provinces.length,
        communes: dataset.communes.length,
        inserted,
        updated,
        unchanged: allCodes.length - inserted - updated,
        notInDataset: Number(counted?.others ?? 0),
      };
    },
    { timeout: 60_000 },
  );
}

async function assertNoConflicts(tx: Transaction, dataset: AdministrativeDataset): Promise<void> {
  const wanted = new Map<string, string>();
  for (const province of dataset.provinces) wanted.set(province.code, 'PROVINCE');
  for (const commune of dataset.communes) {
    wanted.set(commune.code, `COMMUNE thuoc ${commune.provinceCode}`);
  }

  const existing = await tx.$queryRaw<
    { code: string; level: string; parent_code: string | null }[]
  >`
    SELECT area.code, area.level::text AS level, parent.code AS parent_code
    FROM administrative_areas area
    LEFT JOIN administrative_areas parent ON parent.id = area.parent_id
    WHERE area.code = ANY(${[...wanted.keys()]}::text[])
  `;

  const conflicts: AdministrativeAreaConflict[] = [];
  for (const row of existing) {
    const actual =
      row.level === 'PROVINCE' && row.parent_code === null
        ? 'PROVINCE'
        : `${row.level} thuoc ${row.parent_code ?? '(khong co)'}`;
    const expected = wanted.get(row.code);
    if (expected !== undefined && actual !== expected) {
      conflicts.push({ code: row.code, expected, actual });
    }
  }
  if (conflicts.length > 0) throw new AdministrativeAreaConflictError(conflicts);
}

interface UpsertCount {
  inserted: number;
  updated: number;
}

function countUpserts(rows: { inserted: boolean }[]): UpsertCount {
  const inserted = rows.filter((row) => row.inserted).length;
  return { inserted, updated: rows.length - inserted };
}

// `xmax = 0` chi dung voi dong vua INSERT; dong di qua nhanh DO UPDATE co xmax khac 0. Dong khong doi ten
// bi menh de WHERE loai nen khong tra ve, khong tang updated_at.
async function upsertProvinces(
  tx: Transaction,
  provinces: AdministrativeDatasetProvince[],
): Promise<UpsertCount> {
  const rows = await tx.$queryRaw<{ inserted: boolean }[]>`
    INSERT INTO administrative_areas (code, name, level, parent_id)
    SELECT input.code, input.name, 'PROVINCE'::administrative_area_level, NULL
    FROM unnest(${provinces.map((p) => p.code)}::text[], ${provinces.map((p) => p.name)}::text[])
      AS input(code, name)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
    WHERE administrative_areas.name IS DISTINCT FROM EXCLUDED.name
    RETURNING (xmax = 0) AS inserted
  `;
  return countUpserts(rows);
}

async function upsertCommunes(
  tx: Transaction,
  communes: AdministrativeDatasetCommune[],
): Promise<UpsertCount> {
  const rows = await tx.$queryRaw<{ inserted: boolean }[]>`
    INSERT INTO administrative_areas (code, name, level, parent_id)
    SELECT input.code, input.name, 'COMMUNE'::administrative_area_level, province.id
    FROM unnest(
      ${communes.map((c) => c.code)}::text[],
      ${communes.map((c) => c.name)}::text[],
      ${communes.map((c) => c.provinceCode)}::text[]
    ) AS input(code, name, province_code)
    JOIN administrative_areas province
      ON province.code = input.province_code AND province.level = 'PROVINCE'
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
    WHERE administrative_areas.name IS DISTINCT FROM EXCLUDED.name
    RETURNING (xmax = 0) AS inserted
  `;
  return countUpserts(rows);
}
