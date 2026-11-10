import { createHash } from 'node:crypto';

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function sourceSlug(name: string, sourceKey: string): string {
  const suffix = createHash('sha1').update(sourceKey).digest('hex').slice(0, 6);
  return `${slugify(name)}-${suffix}`;
}
