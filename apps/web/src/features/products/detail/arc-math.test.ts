import { describe, expect, it } from 'vitest';

import {
  cardPose,
  loopReach,
  mod,
  pickReach,
  railStep,
  REACH_NARROW,
  REACH_WIDE,
  releaseTarget,
  rubberBand,
  wrapOffset,
} from './arc-math.js';

const pose = (index: number, pos: number, reach = REACH_WIDE, intro = 1) =>
  cardPose({ index, pos, cardWidth: 100, cardHeight: 133, intro, tiltX: 0, tiltY: 0, reach });

const loopPose = (index: number, pos: number, count: number, axis: 'x' | 'y' = 'x') =>
  cardPose({
    index,
    pos,
    cardWidth: 100,
    cardHeight: 133,
    intro: 1,
    tiltX: 0,
    tiltY: 0,
    reach: loopReach(REACH_WIDE, count),
    axis,
    loop: true,
    count,
  });

describe('arc-math: day anh cong trang chi tiet', () => {
  it('the dang xem nam giua, to nhat va tren cung', () => {
    const center = pose(2, 2);
    expect(center.offset).toBe(0);
    expect(center.transform).toContain('translate(0px, 0px)');
    expect(center.transform).toContain('scale(1)');
    expect(center.zIndex).toBe(100);
    expect(center.opacity).toBe(1);
  });

  it('hai ben doi xung va lui dan ve sau', () => {
    const left = pose(1, 2);
    const right = pose(3, 2);
    expect(left.transform).toContain('translate(-104px');
    expect(right.transform).toContain('translate(104px');
    expect(left.zIndex).toBe(right.zIndex);
    expect(pose(4, 2).zIndex).toBeLessThan(right.zIndex);
  });

  it('day tuyen tinh: the dau khong vong sang mep phai khi dang xem anh cuoi', () => {
    const first = pose(0, 4);
    expect(first.offset).toBe(-4);
    expect(first.transform).toContain('translate(-');
  });

  it('day hep chi hien hai anh moi ben, day rong ba anh ro va anh thu tu mo dan', () => {
    expect(pose(5, 2, REACH_NARROW).hidden).toBe(true);
    expect(pose(4, 2, REACH_NARROW).opacity).toBe(1);
    expect(pose(5, 2, REACH_WIDE).opacity).toBe(1);
    expect(pose(6, 2, REACH_WIDE).opacity).toBeLessThan(0.5);
    expect(pose(7, 2, REACH_WIDE).hidden).toBe(true);
  });

  it('truoc khi chia bai moi the deu an', () => {
    expect(pose(2, 2, REACH_WIDE, 0).hidden).toBe(true);
  });

  it('keo qua hai dau day chi nhuc nhich', () => {
    expect(rubberBand(2, 5)).toBe(2);
    expect(rubberBand(-1, 5)).toBeCloseTo(-0.35);
    expect(rubberBand(5, 5)).toBeCloseTo(4.35);
  });

  it('tha tay: keo cham lam tron, vuot nhanh troi them nhung khong ra khoi day', () => {
    expect(releaseTarget(1.4, 0, 5)).toBe(1);
    expect(releaseTarget(1.4, -1, 5)).toBe(4);
    expect(releaseTarget(3.6, -5, 5)).toBe(4);
    expect(releaseTarget(0.4, 5, 5)).toBe(0);
  });
});

describe('arc-math: day khep vong', () => {
  it('lech ngan nhat tren vong', () => {
    expect(mod(-1, 5)).toBe(4);
    expect(wrapOffset(4, 5)).toBe(-1);
    expect(wrapOffset(-4, 5)).toBe(1);
    expect(wrapOffset(2, 5)).toBe(2);
  });

  it('dang xem anh cuoi: anh dau nam ngay ben phai, khong o tit ben trai', () => {
    const first = loopPose(0, 4, 5);
    expect(first.offset).toBe(1);
    expect(first.transform).toContain('translate(104px');
    expect(first.opacity).toBe(1);
  });

  it('vi tri khong gioi han: vong thu hai van ve dung the', () => {
    expect(loopPose(2, 7, 5).offset).toBe(0);
    expect(loopPose(2, -3, 5).offset).toBe(0);
  });

  it('it anh: the mo han truoc duong noi count/2, khong nhay mep truoc mat', () => {
    // 4 anh: duong noi o lech 2, the o lech 2 phai vo hinh.
    const four = loopReach(REACH_WIDE, 4);
    expect(four.fadeFrom + four.fadeSpan).toBeCloseTo(2);
    expect(loopPose(2, 0, 4).hidden).toBe(true);
    expect(loopPose(1, 0, 4).opacity).toBe(1);
    // Du anh thi giu nguyen tam nhin.
    expect(loopReach(REACH_WIDE, 12)).toBe(REACH_WIDE);
  });

  it('khep vong thi keo khong cao su va tha tay khong bi chan', () => {
    expect(rubberBand(-1, 5, true)).toBe(-1);
    expect(releaseTarget(4.6, 0, 5, true)).toBe(5);
    expect(releaseTarget(0.2, 1, 5, true)).toBe(-2);
  });
});

describe('arc-math: day doc canh khung', () => {
  it('the dang xem nam giua; hai ben xep theo truc doc, cong ve phia khung ben phai', () => {
    expect(loopPose(2, 2, 5, 'y').transform).toContain('translate(0px, 0px)');
    const above = loopPose(1, 2, 5, 'y');
    const below = loopPose(3, 2, 5, 'y');
    expect(above.transform).toMatch(/translate\([\d.]+px, -138\.32px\)/);
    expect(below.transform).toMatch(/translate\([\d.]+px, 138\.32px\)/);
    expect(above.transform).toContain('rotateX(-20deg)');
    expect(below.transform).toContain('rotateX(20deg)');
  });

  it('day doc cao gian buoc toi 1.5 lan canh the; day thap giu buoc bang canh the', () => {
    expect(railStep(730, 80, REACH_NARROW)).toBe(120);
    expect(railStep(300, 80, REACH_NARROW)).toBe(80);
    const mid = railStep(440, 80, REACH_NARROW);
    expect(mid).toBeGreaterThan(80);
    expect(mid).toBeLessThan(120);
  });

  it('day doc cao thi ba anh moi ben, day thap chi hai', () => {
    expect(pickReach('y', 700, 80)).toBe(REACH_WIDE);
    expect(pickReach('y', 400, 80)).toBe(REACH_NARROW);
    expect(pickReach('x', 400, 80)).toBe(REACH_NARROW);
    expect(pickReach('x', 600, 80)).toBe(REACH_WIDE);
  });
});
