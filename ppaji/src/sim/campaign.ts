/**
 * 캠페인 — 광고·버스: 며칠 동안 유입 배율, 그 뒤 쿨다운. 동시에 하나만.
 */
import type { CampaignDef } from '../data/schema.js';

export interface CampaignState {
  active: { id: string; untilDay: number; areaId?: string; fromDay?: number } | null;
  cooldownUntil: Record<string, number>;
}

export class Campaigns {
  readonly defs: ReadonlyMap<string, CampaignDef>;
  state: CampaignState = { active: null, cooldownUntil: {} };

  constructor(defs: readonly CampaignDef[]) {
    this.defs = new Map(defs.map((d) => [d.id, d]));
  }

  /** 오늘의 유입 배율 */
  mul(day: number): number {
    const a = this.state.active;
    if (!a || day >= a.untilDay) return 1;
    return this.defs.get(a.id)?.mul ?? 1;
  }

  /** 오늘 아침 캠페인 버스가 오는 지역 (G33) — 없으면 null */
  busArea(day: number): string | null {
    const a = this.state.active;
    if (!a || day >= a.untilDay || day < (a.fromDay ?? 0)) return null;
    return this.defs.get(a.id)?.kind === 'bus' ? (a.areaId ?? null) : null;
  }

  canStart(id: string, day: number, money: number, areaId?: string): { ok: true } | { ok: false; reason: string } {
    const d = this.defs.get(id);
    if (!d) return { ok: false, reason: '알 수 없는 캠페인' };
    if (d.kind === 'bus' && !areaId) return { ok: false, reason: '버스를 보낼 지역을 고르세요' };
    if (this.state.active && day < this.state.active.untilDay) return { ok: false, reason: '진행 중인 캠페인이 있습니다' };
    const cd = this.state.cooldownUntil[id] ?? 0;
    if (day < cd) return { ok: false, reason: `${cd - day}일 뒤에 다시 할 수 있습니다` };
    if (d.cost > money) return { ok: false, reason: `돈이 부족합니다 — ${d.cost.toLocaleString('ko-KR')}G 필요` };
    return { ok: true };
  }

  start(id: string, day: number, money: number, areaId?: string): { ok: true; cost: number } | { ok: false; reason: string } {
    const r = this.canStart(id, day, money, areaId);
    if (!r.ok) return r;
    const d = this.defs.get(id) as CampaignDef;
    // 버스는 내일 아침부터 d.days 일 (원작: 「2日間、毎朝バス」) · 광고는 오늘부터
    const fromDay = d.kind === 'bus' ? day + 1 : day;
    this.state.active = { id, untilDay: fromDay + d.days, ...(areaId ? { areaId, fromDay } : {}) };
    this.state.cooldownUntil[id] = day + d.cooldown;
    return { ok: true, cost: d.cost };
  }

  toSnapshot(): CampaignState {
    return { active: this.state.active ? { ...this.state.active } : null, cooldownUntil: { ...this.state.cooldownUntil } };
  }

  fromSnapshot(s: CampaignState): void {
    this.state = { active: s.active ? { ...s.active } : null, cooldownUntil: { ...s.cooldownUntil } };
  }
}
