/**
 * Toan hoc cua day anh cong canh khung xem chinh trang chi tiet. Ham thuan, khong cham DOM: vong
 * rAF goi moi khung hinh, kiem thu don vi goi truc tiep. Lay tu vong the thu do (ban mau
 * VirtualFit). Day KHEP VONG khi co tu LOOP_MIN anh: day tuyen tinh de trong nua day o anh dau va
 * anh cuoi. Moi mau chi co 2-12 anh, nen tam nhin bi chan duoi count/2 (`loopReach`): the chi
 * duoc nhay sang mep ben kia khi da mo han.
 */

/** Khoang cach ngang tu tam cua buoc 0..5, tinh theo be rong mot the. */
export const XS = [0, 1.04, 1.9, 2.6, 3.15, 3.55] as const;
/** Ti le cua the o buoc 0..5: the giua to nhat, cang ra mep cang nho nhu lui vao sau. */
export const SCALES = [1, 0.8, 0.68, 0.6, 0.55, 0.52] as const;

/** Bao xa thi the bat dau mo, va mo trong bao nhieu buoc. */
export interface Reach {
  fadeFrom: number;
  fadeSpan: number;
}
/** Day rong hien du ba anh moi ben the giua. */
export const REACH_WIDE: Reach = { fadeFrom: 3.4, fadeSpan: 0.8 };
/** Day hep (dien thoai, cot anh o tablet doc) chi hai anh moi ben de the con du to de nhan ra. */
export const REACH_NARROW: Reach = { fadeFrom: 2.4, fadeSpan: 0.6 };
/** Do bang be rong DAY ANH, khong bang viewport: cot anh hep thi day ngang cung hep. */
export const NARROW_TRACK = 420;
/** It hon so nay thi day tuyen tinh: hai anh khep vong thi anh kia nhay ben moi lan keo qua. */
export const LOOP_MIN = 3;

/** Day nam ngang duoi khung (man hep) hay dung doc ben trai khung (desktop). */
export type Axis = 'x' | 'y';

/** So du luon duong: mod(-1, 5) = 4. */
export const mod = (value: number, count: number): number => ((value % count) + count) % count;

/** Lech ngan nhat tren vong `count` anh, trong [-count/2, count/2). */
export const wrapOffset = (offset: number, count: number): number =>
  mod(offset + count / 2, count) - count / 2;

/**
 * Day doc: ba anh moi ben chi khi ca the thu tu (o buoc 4) van nam tron trong day; day thap hon
 * (man hinh thap) chi hai anh, the thu ba mo dan sat mep nhu goi y con anh.
 */
export function pickReach(axis: Axis, trackLength: number, cardLength: number): Reach {
  if (axis === 'x') return trackLength < NARROW_TRACK ? REACH_NARROW : REACH_WIDE;
  const fourth = ((XS[4] ?? 0) + (SCALES[4] ?? 0) / 2) * cardLength;
  return trackLength / 2 >= fourth ? REACH_WIDE : REACH_NARROW;
}

/**
 * Khep vong thi duong noi nam o lech count/2: the phai mo han truoc khi toi do, khong thi nhay tu
 * mep nay sang mep kia ngay truoc mat. Du anh (count/2 vuot tam nhin) thi giu nguyen.
 */
export function loopReach(reach: Reach, count: number): Reach {
  const end = Math.min(reach.fadeFrom + reach.fadeSpan, count / 2);
  if (end >= reach.fadeFrom + reach.fadeSpan) return reach;
  const span = Math.min(reach.fadeSpan, 0.6);
  return { fadeFrom: end - span, fadeSpan: span };
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Noi suy tuyen tinh trong bang; qua cuoi bang thi giu gia tri cuoi. */
export function lerpTable(step: number, table: readonly number[]): number {
  const last = table.length - 1;
  if (step >= last) return table[last] ?? 0;
  const i = Math.floor(step);
  const from = table[i] ?? 0;
  const to = table[i + 1] ?? from;
  return from + (to - from) * (step - i);
}

/**
 * Day doc cao hon tam nhin (desktop man cao): gian buoc giua cac the de anh xa nhat con ro nam
 * gan mep day, khong de trong hai dau. Khong nho hon canh the, toi da 1.5 lan.
 */
export function railStep(trackLength: number, cardLength: number, reach: Reach): number {
  const far = lerpTable(reach.fadeFrom, XS);
  const room = trackLength / 2 - cardLength * 0.4;
  return clamp(far > 0 ? room / far : cardLength, cardLength, cardLength * 1.5);
}

/** Do nhanh cua man chia bai: 0 -> 1 theo duong cubic out. */
export const introEase = (intro: number): number => 1 - Math.pow(1 - clamp(intro, 0, 1), 3);

export interface PoseInput {
  index: number;
  pos: number;
  cardWidth: number;
  cardHeight: number;
  /** Do chia bai da qua ham ease, 0..1. */
  intro: number;
  /** Lech con tro da lam muot, moi truc trong [-0.5, 0.5]. */
  tiltX: number;
  tiltY: number;
  reach: Reach;
  /** Mac dinh 'x' (day ngang). */
  axis?: Axis;
  /** Khep vong tren `count` anh; khong truyen thi day tuyen tinh. */
  loop?: boolean;
  count?: number;
  /** Px cho moi don vi XS; mac dinh bang canh the nam doc theo day. */
  step?: number;
}

export interface CardPose {
  offset: number;
  transform: string;
  opacity: number;
  blur: number;
  zIndex: number;
  hidden: boolean;
}

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

export function cardPose(input: PoseInput): CardPose {
  const count = input.count ?? 0;
  const raw = input.index - input.pos;
  const offset = input.loop && count > 0 ? wrapOffset(raw, count) : raw;
  const a = Math.abs(offset);
  const sign = Math.sign(offset);
  const vertical = input.axis === 'y';
  const scale = lerpTable(a, SCALES);
  // Doc theo day: buoc mac dinh bang canh cua the nam doc theo day.
  const step = input.step ?? (vertical ? input.cardHeight : input.cardWidth);
  const along = sign * lerpTable(a, XS) * step * input.intro;
  // Mep day cong ve phia khung xem (o tren day ngang, ben phai day doc): anh nhu nam trong long
  // mot vong cung do lay khung.
  const bend = (1 - scale) * (vertical ? input.cardWidth : input.cardHeight) * 0.32;
  const x = vertical ? bend : along;
  const y = vertical ? along : -bend;
  const z = -70 * Math.min(a, 4);
  // The hai ben xoay mat vao tam (vong cung lom ve phia nguoi xem), giong vong thu do. rotateY
  // duong day mep phai ra xa, rotateX duong day mep tren ra xa: nen dau nguoc nhau.
  const turn = a < 1 ? 20 * a : 20 + 7 * Math.min(2, a - 1);
  const rotateY = vertical ? input.tiltX * 6 : -sign * turn + input.tiltX * 8;
  const rotateX = vertical ? sign * turn - input.tiltY * 8 : -input.tiltY * 6;
  const blur = Math.max(0, a - 2.2) * 1.4;
  let opacity =
    a > input.reach.fadeFrom
      ? Math.max(0, 1 - (a - input.reach.fadeFrom) / input.reach.fadeSpan)
      : 1;
  opacity *= input.intro;

  const transform =
    `translate(${round(x)}px, ${round(y)}px) perspective(900px) translateZ(${round(z)}px) ` +
    `rotateY(${round(rotateY)}deg) rotateX(${round(rotateX)}deg) ` +
    `scale(${round(scale * (0.6 + 0.4 * input.intro), 4)})`;

  return {
    offset,
    transform,
    opacity: round(opacity, 3),
    blur: round(blur),
    zIndex: Math.round(100 - 10 * a),
    hidden: opacity < 0.01,
  };
}

/** Keo qua dau hoac cuoi day thi chi nhuc nhich (cao su), tha ra se bat ve anh bien. */
export function rubberBand(raw: number, count: number, loop = false): number {
  if (loop) return raw;
  const max = Math.max(0, count - 1);
  if (raw < 0) return raw * 0.35;
  if (raw > max) return max + (raw - max) * 0.35;
  return raw;
}

/** He so quan tinh khi tha tay: van toc (px/ms) nhan he so nay ra so anh troi them. */
export const FLICK = 2.4;

/**
 * Dich sau khi tha tay: vuot nhanh thi troi them theo quan tinh (toi da 3 anh), keo cham thi chi
 * lam tron ve anh gan nhat. Day tuyen tinh thi chan trong day; khep vong thi dich khong gioi han,
 * anh dang chon la mod(dich, count).
 */
export function releaseTarget(pos: number, velocity: number, count: number, loop = false): number {
  const fling = Math.abs(velocity) < 0.15 ? 0 : clamp(velocity * FLICK, -3, 3);
  const target = Math.round(pos - fling);
  return loop ? target : clamp(target, 0, Math.max(0, count - 1));
}
