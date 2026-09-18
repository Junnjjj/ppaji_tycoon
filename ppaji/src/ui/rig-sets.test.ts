import { describe, it, expect, vi } from 'vitest';

/** P60-c — `rig-sets.json` 은 과제 S 소유라 여기선 그 파일(2026-09-18)과 같은 8종을 픽스처로 꽂는다 — UI 헬퍼 검사가 데이터 파일 유무·내용 변경에 흔들리지 않게 */
const FIXTURE = [
  { id: 'ninja', name: '닌자 코스', members: ['rig_bridge', 'rig_beam', 'rig_stepstone'], hidden: false },
  { id: 'kids', name: '키즈존', members: ['rig_mini_slide', 'rig_kids_park', 'rig_hammock'], hidden: false },
  { id: 'jump', name: '점프존', members: ['rig_blob', 'rig_iceberg', 'rig_totem'], hidden: true },
  { id: 'slide3', name: '슬라이드 트리오', members: ['rig_slide', 'rig_slidedock', 'rig_mini_slide'], hidden: false },
  { id: 'lounge', name: '라운지', members: ['rig_hammock', 'rig_sunbed', 'rig_float_bar'], hidden: false },
  { id: 'night', name: '밤빠지', members: ['rig_led_buoy', 'rig_sunbed_led', 'rig_float_bar'], hidden: true },
  { id: 'roll', name: '굴림존', members: ['rig_roller', 'waterwalk', 'rig_seesaw'], hidden: true },
  { id: 'trio', name: '빅 트리오', members: ['trampoline_w', 'airbounce', 'turtle_island'], hidden: true },
];
vi.mock('../data/rig-sets.json', () => ({ default: FIXTURE }));

const { RIG_SETS, setsByMember, visibleSetsOf, rigSetLabel, HIDDEN_SET_LABEL } = await import('./rig-sets.js');

describe('P60-c 세트 도감 헬퍼', () => {
  it('역색인 — 한 시설이 여러 세트의 멤버일 수 있다(해먹 = 키즈존 + 라운지 · 미니슬라이드 = 키즈존 + 슬라이드 트리오)', () => {
    const idx = setsByMember(RIG_SETS);
    expect(idx.get('rig_hammock')?.map((s) => s.id)).toEqual(['kids', 'lounge']);
    expect(idx.get('rig_mini_slide')?.map((s) => s.id)).toEqual(['kids', 'slide3']);
    expect(idx.get('nope')).toBeUndefined();
  });
  it('건설 카드 배지 — hidden 세트의 멤버십은 새지 않는다: 블롭(점프존만 · hidden)은 배지 0 · 플로팅 바는 라운지만(밤빠지는 hidden) · 다리는 「세트」', () => {
    const idx = setsByMember(RIG_SETS);
    expect(visibleSetsOf('rig_blob', idx)).toEqual([]);
    expect(visibleSetsOf('rig_float_bar', idx).map((s) => s.id)).toEqual(['lounge']);
    expect(visibleSetsOf('rig_bridge', idx).map((s) => s.id)).toEqual(['ninja']);
  });
  it('이름표 — hidden 은 발견 전 「?」, 발견 뒤 이름 · 보이는 세트는 언제나 이름 · 모르는 id 는 그대로(S 가 이름을 넘겨도 안 깨진다)', () => {
    const none = new Set<string>();
    expect(rigSetLabel('ninja', none)).toBe('닌자 코스');
    expect(rigSetLabel('night', none)).toBe(HIDDEN_SET_LABEL);
    expect(rigSetLabel('night', new Set(['night']))).toBe('밤빠지');
    expect(rigSetLabel('닌자 코스', none)).toBe('닌자 코스');
  });
  it('픽스처 자체 — 8종 · hidden 4 · 멤버 3 서로 다름 (§10.3 데이터 검산과 같은 자)', () => {
    expect(RIG_SETS.length).toBe(8);
    expect(RIG_SETS.filter((s) => s.hidden).length).toBe(4);
    for (const s of RIG_SETS) expect(new Set(s.members).size).toBe(3);
  });
});
