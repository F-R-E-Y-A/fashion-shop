import type { AdminVariantColorOption } from './admin-catalog.api.js';

function cleanColorName(name: string): string {
  return name.trim().replace(/\.+$/u, '');
}

function compareVietnamese(a: AdminVariantColorOption, b: AdminVariantColorOption): number {
  if (a.code === 'mac-dinh' && b.code !== 'mac-dinh') return 1;
  if (b.code === 'mac-dinh' && a.code !== 'mac-dinh') return -1;
  const byName = cleanColorName(a.name).localeCompare(cleanColorName(b.name), 'vi', {
    sensitivity: 'base',
  });
  return byName !== 0 ? byName : a.code.localeCompare(b.code);
}

function isExtendedColor(color: AdminVariantColorOption): boolean {
  return color.code.startsWith('yody-') || color.code.endsWith('.');
}

function ColorOption({ color }: { color: AdminVariantColorOption }) {
  return (
    <option value={color.id}>
      {cleanColorName(color.name)} ({color.code})
    </option>
  );
}

/**
 * Sap xep bang mau tieng Viet ro rang, tach mau chuan khoi nhom mau mo rong (VD: `yody-*`, `be.`)
 * de admin tim nhanh mau chuan khi tao/sua bien the.
 */
export function ColorSelectOptions({ colors }: { colors: readonly AdminVariantColorOption[] }) {
  const standard = colors.filter((c) => !isExtendedColor(c)).sort(compareVietnamese);
  const extended = colors.filter(isExtendedColor).sort(compareVietnamese);

  if (standard.length > 0 && extended.length > 0) {
    return (
      <>
        <optgroup label="Màu chuẩn">
          {standard.map((c) => (
            <ColorOption key={c.id} color={c} />
          ))}
        </optgroup>
        <optgroup label="Màu mở rộng (nguồn nhập)">
          {extended.map((c) => (
            <ColorOption key={c.id} color={c} />
          ))}
        </optgroup>
      </>
    );
  }

  return (
    <>
      {[...standard, ...extended].map((c) => (
        <ColorOption key={c.id} color={c} />
      ))}
    </>
  );
}
