export const CONTENT_FIELDS = ['name', 'description', 'material', 'careInstructions'] as const;
export type ContentField = (typeof CONTENT_FIELDS)[number];
export interface ProductContent {
  name: string;
  description: string | null;
  material: string | null;
  careInstructions: string | null;
}
export interface ProtectedContent extends ProductContent {
  adminContentFields: string[];
}

export function adminContentChange(before: ProtectedContent, input: ProductContent) {
  const changed = CONTENT_FIELDS.filter((field) => before[field] !== input[field]);
  if (!changed.length) return null;
  return {
    name: input.name,
    description: input.description,
    material: input.material,
    careInstructions: input.careInstructions,
    adminContentFields: CONTENT_FIELDS.filter(
      (field) => before.adminContentFields.includes(field) || changed.includes(field),
    ),
    contentVersion: { increment: 1 },
  };
}

/** Doc noi dung sau khoa; null duoc bao ve nhu chuoi, khong co nghia la bo qua. */
export function importedContent(before: ProtectedContent, source: ProductContent) {
  const effective = {
    name: before.adminContentFields.includes('name') ? before.name : source.name,
    description: before.adminContentFields.includes('description')
      ? before.description
      : source.description,
    material: before.adminContentFields.includes('material') ? before.material : source.material,
    careInstructions: before.adminContentFields.includes('careInstructions')
      ? before.careInstructions
      : source.careInstructions,
  };
  return {
    ...effective,
    ...(CONTENT_FIELDS.some((field) => effective[field] !== before[field])
      ? { contentVersion: { increment: 1 } }
      : {}),
  };
}
