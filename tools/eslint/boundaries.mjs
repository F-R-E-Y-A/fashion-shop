// tools/eslint/boundaries.mjs — luat ESLint cuc bo ep RANH GIOI giua cac phan he va tang dung chung.
// Khong can plugin ngoai. Cau hinh o eslint.config.js. Bao loi bang tieng Viet, chi thang luat bi pham.
//
// Khai niem:
//   root            thu muc goc cua ung dung, vi du apps/api/src
//   unitsDir        thu muc chua cac phan he, vi du modules (api) hay features (web)
//   gate            ten tep "cua" cua mot phan he hay mot tang, mac dinh index
//   alias           tien to import doi sang duong dan trong root, vi du { '@/': '' }
//   gated           cac tang chi duoc import qua cua index, vi du ['core', 'ui']
//   allowUnitsFrom  cac tep ngoai phan he duoc phep import phan he, vi du app.module.ts
//   forbid          danh sach { files, targets, message }: tep khop files khong duoc import targets
import path from 'node:path';

const toPosix = (p) => p.split(path.sep).join('/');
const stripExt = (p) => p.replace(/\.(m?[jt]sx?)$/, '');
const SPECIALS = new Set(['.', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\']);

/** Doi glob don gian sang RegExp: ** la moi thu ke ca /, * la mot doan khong co /. */
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i++;
        if (glob[i + 1] === '/') i++;
      } else {
        re += '[^/]*';
      }
    } else if (SPECIALS.has(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}
const matchAny = (rel, globs = []) => globs.some((g) => globToRegExp(g).test(rel));

export const boundaries = {
  meta: {
    type: 'problem',
    docs: { description: 'Ep ranh gioi giua cac phan he va tang dung chung' },
    schema: [{ type: 'object', additionalProperties: true }],
    messages: {
      crossUnit:
        'Phan he "{{from}}" chi duoc dung phan he "{{to}}" qua cua {{gate}} cua ho, khong import sau vao "{{target}}". Can gi thi de ho xuat ra o index (docs/CONTRIBUTING.md luat 2).',
      unitFromShared:
        'Tep dung chung "{{file}}" khong duoc import phan he "{{to}}". Tang dung chung khong biet nghiep vu.',
      deepGate:
        'Vao tang "{{layer}}" chi qua cua {{gate}} cua no, khong import sau vao "{{target}}".',
      forbidden: '{{message}} (import "{{target}}")',
    },
  },
  create(context) {
    const opt = context.options[0] ?? {};
    const cwd = toPosix(context.cwd ?? process.cwd());
    const rootAbs = toPosix(path.resolve(cwd, opt.root ?? '.'));
    const fileAbs = toPosix(context.filename ?? context.getFilename());
    if (!fileAbs.startsWith(rootAbs + '/')) return {};

    const fileRel = fileAbs.slice(rootAbs.length + 1);
    const unitsDir = opt.unitsDir ?? 'modules';
    const gate = opt.gate ?? 'index';
    const unitRe = new RegExp('^' + unitsDir + '/([^/]+)(?:/(.*))?$');
    const unitOf = (rel) => {
      const m = rel.match(unitRe);
      return m ? { name: m[1], rest: m[2] ?? '' } : null;
    };
    const fileUnit = unitOf(fileRel);

    function resolveTarget(source) {
      if (source.startsWith('.')) {
        return path.posix.normalize(path.posix.join(path.posix.dirname(fileRel), source));
      }
      for (const [prefix, to] of Object.entries(opt.alias ?? {})) {
        if (source.startsWith(prefix))
          return path.posix.normalize(to + source.slice(prefix.length));
      }
      return null; // goi ngoai: khong kiem
    }

    function check(node, source) {
      if (typeof source !== 'string') return;
      const target = resolveTarget(source);
      if (!target || target.startsWith('..')) return;
      const targetNoExt = stripExt(target);
      const targetUnit = unitOf(target);

      // 1. Sang phan he khac: chi qua cua index.
      if (targetUnit && (!fileUnit || fileUnit.name !== targetUnit.name)) {
        const isGate = targetUnit.rest === '' || stripExt(targetUnit.rest) === gate;
        if (!isGate) {
          context.report({
            node,
            messageId: 'crossUnit',
            data: { from: fileUnit?.name ?? fileRel, to: targetUnit.name, target, gate },
          });
        }
        if (!fileUnit && !matchAny(fileRel, opt.allowUnitsFrom)) {
          context.report({
            node,
            messageId: 'unitFromShared',
            data: { file: fileRel, to: targetUnit.name },
          });
        }
      }

      // 2. Tang co cua (core, ui...): tu ngoai chi qua index.
      for (const layer of opt.gated ?? []) {
        if (target.startsWith(layer + '/') && !fileRel.startsWith(layer + '/')) {
          const rest = target.slice(layer.length + 1);
          if (stripExt(rest) !== gate) {
            context.report({ node, messageId: 'deepGate', data: { layer, target, gate } });
          }
        }
      }

      // 3. Cam theo cap (files -> targets).
      for (const rule of opt.forbid ?? []) {
        if (
          matchAny(fileRel, rule.files) &&
          (matchAny(target, rule.targets) || matchAny(targetNoExt, rule.targets))
        ) {
          context.report({
            node,
            messageId: 'forbidden',
            data: { message: rule.message ?? 'Import bi cam', target },
          });
        }
      }
    }

    return {
      ImportDeclaration(node) {
        check(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        if (node.source) check(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node, node.source.value);
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal') check(node, node.source.value);
      },
    };
  },
};
