import { parseFragment } from 'parse5';

interface HtmlNode {
  nodeName: string;
  tagName?: string;
  value?: string;
  childNodes?: HtmlNode[];
  attrs?: Array<{ name: string; value: string }>;
}

export interface EmbeddedDescriptionImage {
  src: string;
  alt: string;
}

const blockTags = new Set([
  'address',
  'article',
  'blockquote',
  'br',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'td',
  'th',
  'tr',
  'ul',
]);

const ignoredTags = new Set([
  'audio',
  'canvas',
  'iframe',
  'noscript',
  'script',
  'style',
  'svg',
  'video',
]);

function parsedTree(markup: string): HtmlNode {
  return parseFragment(markup) as unknown as HtmlNode;
}

function textContent(node: HtmlNode): string {
  if (node.nodeName === '#text') return node.value ?? '';
  if (node.nodeName === '#comment' || (node.tagName && ignoredTags.has(node.tagName))) return '';
  if (node.tagName === 'img') return '';

  const content = (node.childNodes ?? []).map(textContent).join('');
  return node.tagName && blockTags.has(node.tagName) ? `\n${content}\n` : content;
}

export function cleanDescriptionHtml(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const text = textContent(parsedTree(value))
    .replaceAll('\u00a0', ' ')
    .replaceAll('\u202f', ' ')
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replace(/[\t\f\v ]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
  return text || null;
}

export function embeddedDescriptionImages(markup: unknown): EmbeddedDescriptionImage[] {
  if (typeof markup !== 'string' || markup.length === 0) return [];
  const images: EmbeddedDescriptionImage[] = [];
  const visit = (node: HtmlNode) => {
    if (node.tagName === 'img') {
      const attrs = new Map(
        (node.attrs ?? []).map((attribute) => [attribute.name, attribute.value]),
      );
      const src = attrs.get('src')?.trim();
      if (src) images.push({ src, alt: attrs.get('alt')?.trim() ?? '' });
    }
    if (node.tagName && ignoredTags.has(node.tagName)) return;
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(parsedTree(markup));
  return images;
}
