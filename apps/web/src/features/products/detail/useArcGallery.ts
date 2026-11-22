import { useCallback, useEffect, useRef } from 'react';

import {
  type Axis,
  cardPose,
  clamp,
  introEase,
  LOOP_MIN,
  loopReach,
  mod,
  pickReach,
  railStep,
  releaseTarget,
  rubberBand,
  wrapOffset,
  XS,
} from './arc-math.js';

/** Nguong (px) truoc khi mot lan nhan bi coi la keo: duoi nguong van la bam (mo anh, chon the). */
const DRAG_THRESHOLD = 6;
const INTRO_MS = 900;
/** Cuon ngang tich du bao nhieu px thi doi mot anh, va cach nhau toi thieu bao lau. */
const WHEEL_THRESHOLD = 60;
const WHEEL_GAP_MS = 240;

/** Vung duoi con tro, khai bao bang `data-cursor` tren phan tu gan nhat. */
export type CursorZone = 'pick' | 'drag' | 'zoom' | 'ui';

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Motion {
  key: string;
  pos: number;
  target: number;
  dragging: boolean;
  moved: boolean;
  /** Toa do bat dau va gan nhat theo truc cua lan keo nay. */
  startC: number;
  startPos: number;
  lastC: number;
  lastT: number;
  /** Lan keo bat dau tren day doc thi keo doc; tren khung thi luon keo ngang. */
  dragAxis: Axis;
  /** So px keo de troi mot anh. */
  spacing: number;
  /** Van toc keo, px/ms, da lam muot. */
  velocity: number;
  wantTiltX: number;
  wantTiltY: number;
  tiltX: number;
  tiltY: number;
  pointerX: number;
  pointerY: number;
  cursorX: number;
  cursorY: number;
  trackWidth: number;
  trackHeight: number;
  frameWidth: number;
  /** CSS quyet day nam ngang hay dung doc; engine doc lai tu hinh dang day khi do. */
  axis: Axis;
  cardWidth: number;
  cardHeight: number;
  /** Px moi don vi XS doc theo day (day doc cao thi gian ra); keo tren day dung cung buoc. */
  step: number;
  /** Anh dang chon theo dich (khong theo vi tri dang troi). */
  index: number;
  zone: CursorZone;
}

/**
 * Dong co cua day anh cong: vong rAF ghi transform thang vao DOM qua ref (khong re-render React moi
 * khung hinh) va chi chay khi co gi dang chuyen dong; dung yen thi ngu.
 *
 * Trang so huu anh dang xem (`active`): keo, vuot, cuon ngang bao `onChange` ngay khi dich doi;
 * nut, phim, the va Lightbox doi `active` thi day troi theo. `resetKey` doi (doi mau) thi day ve
 * anh dau va chia bai lai ma khong remount. Vung keo la ca khung xem lan day anh (`rootRef`), con
 * vi tri the tinh theo be rong day (`trackRef`).
 */
export function useArcGallery({
  count,
  active,
  resetKey,
  onChange,
}: {
  count: number;
  active: number;
  resetKey: string;
  onChange: (index: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLElement | null)[]>([]);
  const wakeRef = useRef<() => void>(() => undefined);
  const countRef = useRef(count);
  const motion = useRef<Motion>({
    key: '',
    pos: 0,
    target: 0,
    dragging: false,
    moved: false,
    startC: 0,
    startPos: 0,
    lastC: 0,
    lastT: 0,
    dragAxis: 'x',
    spacing: 1,
    velocity: 0,
    wantTiltX: 0,
    wantTiltY: 0,
    tiltX: 0,
    tiltY: 0,
    pointerX: 0,
    pointerY: 0,
    cursorX: 0,
    cursorY: 0,
    trackWidth: 0,
    trackHeight: 0,
    frameWidth: 0,
    axis: 'x',
    cardWidth: 0,
    cardHeight: 0,
    step: 1,
    index: 0,
    zone: 'ui',
  });
  const changeRef = useRef(onChange);
  useEffect(() => {
    changeRef.current = onChange;
    countRef.current = count;
  }, [onChange, count]);

  /**
   * Dat dich moi va bao trang ngay neu anh dang chon doi. Day tuyen tinh thi chan trong day; khep
   * vong thi dich tu do, anh dang chon la mod(dich, count).
   */
  const aim = useCallback((target: number) => {
    const m = motion.current;
    const count = countRef.current;
    const loop = count >= LOOP_MIN;
    m.target = loop ? target : clamp(target, 0, Math.max(0, count - 1));
    const index = loop ? mod(Math.round(m.target), count) : Math.round(m.target);
    if (index !== m.index) {
      m.index = index;
      changeRef.current(index);
    }
    wakeRef.current();
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    if (!root || !track || count < 2) return;
    const m = motion.current;
    const key = `${resetKey}|${count}`;
    if (m.key !== key) {
      m.key = key;
      m.pos = 0;
      m.target = 0;
      m.index = 0;
    }
    const loop = count >= LOOP_MIN;
    const reduced = prefersReducedMotion();
    const born = performance.now();
    let frame = 0;
    let last = born;
    let visible = true;
    let wheelSum = 0;
    let wheelAt = -Infinity;

    const paint = (now: number) => {
      frame = 0;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (!m.dragging) {
        const k = reduced ? 1 : 1 - Math.exp(-dt * 9);
        m.pos += (m.target - m.pos) * k;
        if (Math.abs(m.target - m.pos) < 0.0005) m.pos = m.target;
      }
      const tk = reduced ? 1 : 1 - Math.exp(-dt * 4);
      m.tiltX += (m.wantTiltX - m.tiltX) * tk;
      m.tiltY += (m.wantTiltY - m.tiltY) * tk;
      const ck = 1 - Math.exp(-dt * 15);
      m.cursorX += (m.pointerX - m.cursorX) * ck;
      m.cursorY += (m.pointerY - m.cursorY) * ck;
      const intro = reduced ? 1 : introEase((now - born) / INTRO_MS);
      const vertical = m.axis === 'y';
      const view = pickReach(
        m.axis,
        vertical ? m.trackHeight : m.trackWidth,
        vertical ? m.cardHeight : m.cardWidth,
      );
      const reach = loop ? loopReach(view, count) : view;
      m.step = vertical ? railStep(m.trackHeight, m.cardHeight, reach) : m.cardWidth;

      cards.current.forEach((card, index) => {
        if (!card || index >= count) return;
        const pose = cardPose({
          index,
          pos: m.pos,
          cardWidth: m.cardWidth,
          cardHeight: m.cardHeight,
          intro,
          tiltX: m.tiltX,
          tiltY: m.tiltY,
          reach,
          axis: m.axis,
          loop,
          count,
          step: m.step,
        });
        // So sanh truoc khi ghi: the dung yen khong bi tinh lai style.
        if (card.style.transform !== pose.transform) card.style.transform = pose.transform;
        card.style.opacity = String(pose.opacity);
        card.style.zIndex = String(pose.zIndex);
        card.style.filter = pose.blur > 0 ? `blur(${pose.blur}px)` : '';
        // The da mo han thi khong cho bam nham hay cong nghe ho tro doc toi.
        if (card.hasAttribute('inert') !== pose.hidden) card.toggleAttribute('inert', pose.hidden);
        const center = Math.abs(pose.offset) < 0.5;
        if (card.hasAttribute('data-center') !== center) {
          card.toggleAttribute('data-center', center);
        }
      });

      const cursor = cursorRef.current;
      if (cursor) cursor.style.transform = `translate3d(${m.cursorX}px, ${m.cursorY}px, 0)`;

      const busy =
        m.dragging ||
        m.pos !== m.target ||
        intro < 1 ||
        Math.abs(m.wantTiltX - m.tiltX) + Math.abs(m.wantTiltY - m.tiltY) > 0.001 ||
        Math.abs(m.pointerX - m.cursorX) + Math.abs(m.pointerY - m.cursorY) > 0.3;
      if (busy) frame = requestAnimationFrame(paint);
    };

    const wake = () => {
      if (frame || !visible || document.hidden || typeof requestAnimationFrame !== 'function') {
        return;
      }
      last = performance.now();
      frame = requestAnimationFrame(paint);
    };
    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };
    wakeRef.current = wake;

    // Be rong the va huong day do CSS quyet (container query, media query); doc kich thuoc bo cuc,
    // khong bi transform anh huong. Day cao hon rong la day doc canh khung.
    const measure = () => {
      m.trackWidth = track.clientWidth;
      m.trackHeight = track.clientHeight;
      m.axis = m.trackHeight > m.trackWidth ? 'y' : 'x';
      m.frameWidth = (track.previousElementSibling as HTMLElement | null)?.offsetWidth ?? 0;
      const sample = cards.current.find(Boolean);
      m.cardWidth = sample?.offsetWidth ?? 0;
      m.cardHeight = sample?.offsetHeight ?? 0;
      wake();
    };
    measure();
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    resize?.observe(track);

    const io =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => {
            visible = entry?.isIntersecting ?? true;
            if (visible) wake();
            else stop();
          });
    io?.observe(root);
    const onVisibility = () => (document.hidden ? stop() : wake());
    document.addEventListener('visibilitychange', onVisibility);

    const zoneAt = (target: EventTarget | null): CursorZone => {
      if (m.dragging && m.moved) return 'drag';
      const owner = target instanceof Element ? target.closest('[data-cursor]') : null;
      return (owner?.getAttribute('data-cursor') as CursorZone | null) ?? 'ui';
    };
    const setZone = (zone: CursorZone) => {
      if (zone === m.zone) return;
      // Vua vao vung co con tro rieng: dat thang toi chuot, khong bay tu goc khung vao.
      if (m.zone === 'ui') {
        m.cursorX = m.pointerX;
        m.cursorY = m.pointerY;
      }
      m.zone = zone;
      if (cursorRef.current) cursorRef.current.dataset.zone = zone;
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      m.pointerX = event.clientX - rect.left;
      m.pointerY = event.clientY - rect.top;
      if (event.pointerType === 'mouse') {
        m.wantTiltX = m.pointerX / Math.max(1, rect.width) - 0.5;
        m.wantTiltY = m.pointerY / Math.max(1, rect.height) - 0.5;
      }
      setZone(zoneAt(event.target));

      if (m.dragging) {
        const coord = m.dragAxis === 'y' ? event.clientY : event.clientX;
        const delta = coord - m.startC;
        if (!m.moved && Math.abs(delta) > DRAG_THRESHOLD) {
          m.moved = true;
          // Chi bat con tro sau nguong: bat som thi click roi vao khung, khong toi nut the.
          try {
            root.setPointerCapture(event.pointerId);
          } catch {
            // Con tro da nha (pointerup den truoc): bo qua, lan keo van dung theo toa do.
          }
          root.dataset.dragging = 'true';
          setZone('drag');
        }
        if (m.moved) {
          m.pos = rubberBand(m.startPos - delta / m.spacing, countRef.current, loop);
          const elapsed = event.timeStamp - m.lastT;
          if (elapsed > 0) {
            const speed = (coord - m.lastC) / elapsed;
            m.velocity = m.velocity * 0.6 + speed * 0.4;
          }
          m.lastC = coord;
          m.lastT = event.timeStamp;
        }
      }
      wake();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const onTrack = event.target instanceof Node && track.contains(event.target);
      m.dragAxis = onTrack && m.axis === 'y' ? 'y' : 'x';
      // Tren day: keo dung mot khoang cach giua hai the thi troi dung mot anh. Tren khung: mot
      // phan ba be rong khung moi doi mot anh, khong thi vuot ngan tren khung lon nhay ca loat.
      const cardStep = XS[1] * (m.dragAxis === 'y' ? m.step : m.cardWidth);
      m.spacing = Math.max(1, onTrack ? cardStep : Math.max(cardStep, m.frameWidth / 3));
      m.dragging = true;
      m.moved = false;
      m.startC = m.dragAxis === 'y' ? event.clientY : event.clientX;
      m.startPos = m.pos;
      m.lastC = m.startC;
      m.lastT = event.timeStamp;
      m.velocity = 0;
      cursorRef.current?.setAttribute('data-pressed', '');
      wake();
    };
    const onPointerUp = (event: PointerEvent) => {
      cursorRef.current?.removeAttribute('data-pressed');
      if (!m.dragging) return;
      m.dragging = false;
      if (m.moved) {
        // Dung tay mot luc roi moi tha thi khong tinh quan tinh.
        const velocity = event.timeStamp - m.lastT > 80 ? 0 : m.velocity;
        aim(releaseTarget(m.pos, velocity, countRef.current, loop));
        try {
          if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
        } catch {
          // Trinh duyet da tu nha con tro.
        }
      }
      delete root.dataset.dragging;
      // Luc keo, con tro bi bat vao khung nen target luon la khung; tha ra thi doc lai vung duoi
      // chuot, khong thi nhan "Keo" dung yen toi lan di chuot sau.
      setZone(zoneAt(document.elementFromPoint(event.clientX, event.clientY)));
      wake();
    };
    const onPointerLeave = () => {
      m.wantTiltX = 0;
      m.wantTiltY = 0;
      setZone('ui');
      wake();
    };
    // Vua keo xong thi nuot click: tha tay tren khung khong mo Lightbox, tren the khong chon the.
    const onClickCapture = (event: MouseEvent) => {
      if (!m.moved) return;
      m.moved = false;
      event.preventDefault();
      event.stopPropagation();
    };
    // Chi an cuon ngang (trackpad, Shift + lan chuot); cuon doc van cuon trang nhu binh thuong.
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      wheelSum += event.deltaX;
      if (Math.abs(wheelSum) < WHEEL_THRESHOLD || event.timeStamp - wheelAt < WHEEL_GAP_MS) return;
      aim(Math.round(m.target) + Math.sign(wheelSum));
      wheelSum = 0;
      wheelAt = event.timeStamp;
    };

    root.addEventListener('pointermove', onPointerMove);
    root.addEventListener('pointerleave', onPointerLeave);
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('pointerup', onPointerUp);
    root.addEventListener('pointercancel', onPointerUp);
    root.addEventListener('click', onClickCapture, true);
    root.addEventListener('wheel', onWheel, { passive: false });

    wake();
    return () => {
      stop();
      wakeRef.current = () => undefined;
      resize?.disconnect();
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerleave', onPointerLeave);
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('pointerup', onPointerUp);
      root.removeEventListener('pointercancel', onPointerUp);
      root.removeEventListener('click', onClickCapture, true);
      root.removeEventListener('wheel', onWheel);
    };
  }, [count, resetKey, aim]);

  // Trang doi anh (nut, phim, the, Lightbox): day troi toi anh do. Chay sau effect tren nen lan
  // doi mau da dat lai day ve 0 truoc; dich da dung thi khong goi lai `onChange`. Khep vong thi di
  // duong ngan nhat: "tiep" tu anh cuoi sang anh dau la mot buoc, khong tua nguoc ca day.
  useEffect(() => {
    const count = countRef.current;
    const here = Math.round(motion.current.target);
    if (count < LOOP_MIN) {
      if (here !== active) aim(active);
      return;
    }
    const delta = wrapOffset(active - mod(here, count), count);
    if (delta !== 0) aim(here + delta);
  }, [active, aim]);

  /** Callback ref cho the thu `index`; chi chay luc commit, khong doc ref trong render. */
  const bindCard = useCallback(
    (index: number) => (element: HTMLElement | null) => {
      cards.current[index] = element;
    },
    [],
  );

  return { rootRef, trackRef, cursorRef, bindCard };
}
