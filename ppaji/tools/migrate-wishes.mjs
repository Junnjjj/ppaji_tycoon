// P60-a 데이터 이관 (D71 — 풀 색·향·소품 삭제). 정본 `docs/plan-ppaji-rig-foodcourt.md` §10.1.
//   node tools/migrate-wishes.mjs            # 적용 (멱등 — 두 번 돌려도 같다)
//   node tools/migrate-wishes.mjs --dry      # 요약만
// 결정론: 난수 0 — 파일 순서(친구 id 순)로 돌아가며 섞는다. 손으로 고친 값은 이 스크립트가 덮어쓰지 않는다(이미 이관된 항목은 건드리지 않는다).
//
// 하는 일
//   wishes.json   조건 item · pool{color,scent,intensityMin} → rigCount/rigGrade/facilityClass/likes · 보상 item 151 → rigPart/ingredient/money(/facility) · 문장 재작성
//   certs.json    color_f/d/b → rigCount 2/4/6 · scent_f/d/b → facilityClass restaurant 2/4/6 · spa_d/b 는 scent 만 삭제 (id·family·보상 바이트 그대로)
//   calendar.json item 보상 → 같은 이름의 (시작 아닌) 재료 ×3 · 없으면 가장 싼 부품(값싼 순 회전)
//   areas.json    likeRewards item → 같은 규칙 (텍스트 치환 — 1.0 같은 표기를 보존)
//   shop.json     kind:'item' 삭제 · ingredient 진열 8 (장날 재료 3개 묶음 = 정가 ×3)
//   friends.json  fav.color/scent 삭제 (food 유지)
//   facilities.json scent/scentPower 삭제 (heat 는 남는다 — 계절 수온의 뿌리)
//   seasons.json  colors/scents 표 삭제 (ambient·idealTemp·sun 유지)
//   items.json    파일 삭제
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'src', 'data');
const DRY = process.argv.includes('--dry');
const read = (f) => JSON.parse(readFileSync(join(DATA, f), 'utf8'));
/** 원본 파일은 끝 개행이 없다 — 그대로 유지해 diff 를 줄인다 */
const write = (f, v) => { if (!DRY) writeFileSync(join(DATA, f), JSON.stringify(v, null, 2)); };
const summary = {};

const facilities = read('facilities.json');
const ingredients = read('ingredients.json');
const rigParts = read('rig-parts.json');
const facilityName = new Map(facilities.map((f) => [f.id, f.name]));
const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
/** 옛 소품 id → 같은 이름의 재료 id (없으면 null). 시작 재료(무한)는 보상이 무의미하므로 부품으로 보낸다 */
const ITEM_TO_INGREDIENT = {
  lemon: 'lemon_fruit', honey: 'honey_jar', coffee_beans: 'coffee_bean', orange: 'orange_fruit', banana: 'banana_fruit', seaweed: 'seaweed',
  grapes: 'grape_fruit', milk: 'milk', kiwi: 'kiwi_fruit', coconut: 'coconut_milk', strawberry: 'strawberry_fruit', chocolate: 'chocolate_bar',
  pineapple: 'pineapple_fruit', melon: 'melon_fruit', peach: 'peach_fruit', grapefruit: 'grapefruit_fruit', blueberry: 'blueberry_fruit',
  apple: null, mint: null, cinnamon: null, lavender: null, ice_block: null, bath_salt: null, rose: null,
};
const cheapParts = rigParts.filter((p) => p.unlock === 'shop').sort((a, b) => a.price - b.price || a.id.localeCompare(b.id));
let cheapCursor = 0;
/** 달력·지역 보상의 소품 → 재료 ×3 또는 값싼 부품 */
function itemGrantReplacement(itemId) {
  const ing = ITEM_TO_INGREDIENT[itemId];
  if (ing && ingredientById.get(ing) && ingredientById.get(ing).unlock !== 'start') return { kind: 'ingredient', id: ing, amount: 3 };
  const p = cheapParts[cheapCursor++ % Math.min(3, cheapParts.length)];
  return { kind: 'rigPart', id: p.id };
}

// ── wishes.json ──────────────────────────────────────────────────────────────
{
  const wishes = read('wishes.json');
  const CLASS_KO = { decor: '장식', restaurant: '식당', lounging: '쉼터', utility: '편의 시설', attraction: '놀이 시설', slide: '슬라이드', rig: '기구' };
  const isPool = (c) => c.kind === 'pool';
  const hasOld = (c) => c.kind === 'item' || (isPool(c) && (c.color !== undefined || c.scent !== undefined || c.intensityMin !== undefined)) || (Array.isArray(c.of) && c.of.some(hasOld));

  /** 잎 하나를 한국어 조각으로 (문장 재작성용) */
  function describe(c) {
    switch (c.kind) {
      case 'pool': {
        const p = [];
        if (c.indoor) p.push('실내');
        if (c.outdoor) p.push('야외');
        if (c.sizeMin !== undefined) p.push(`${c.sizeMin}칸 넘는`);
        if (c.tempMin !== undefined) p.push(`${c.tempMin}도 넘는`);
        if (c.tempMax !== undefined) p.push(`${c.tempMax}도 아래`);
        p.push('수역');
        if (c.count !== undefined && c.count > 1) p.push(`${c.count}곳`);
        if (c.likesMin !== undefined) p.push(`좋아요 ${c.likesMin}`);
        if (c.popMin !== undefined) p.push(`인기 ${c.popMin}`);
        return p.join(' ');
      }
      case 'facility': return `${facilityName.get(c.id) ?? c.id}${c.count && c.count > 1 ? ` ${c.count}개` : ''}`;
      case 'facilityClass': return `${CLASS_KO[c.class] ?? c.class} ${c.count ?? 1}개`;
      case 'facilityAdjacent': return `${facilityName.get(c.ids[0]) ?? c.ids[0]} 옆에 ${facilityName.get(c.ids[1]) ?? c.ids[1]}`;
      case 'likes': return `좋아요 ${c.min}`;
      case 'popularity': return `인기 ${c.min}`;
      case 'rigCount': return `물 위 기구 ${c.min}개${c.kinds ? ` (${c.kinds}종류)` : ''}`;
      case 'rigGrade': return `${c.min}등급 빠지`;
      case 'seatsFed': return `${facilityName.get(c.id) ?? c.id}가 먹여 주는 자리 ${c.count}`;
      default: return c.kind;
    }
  }
  /** 원문의 말투를 잇는다 */
  function tail(line, idx) {
    if (/주십시오|주십쇼|입니다|습니다/.test(line)) return ['만 갖춰 주십시오.', '까지 갖춰 주십시오.', '까지! 꼭 부탁드립니다.'][idx];
    if (/주게|하게[.!]/.test(line)) return ['만 갖춰 주게.', '까지 갖춰 주게.', '까지 갖춰 주게. 그럼 됐네.'][idx];
    if (/주세요|해요|요[.!?~]/.test(line)) return ['만 갖춰 주세요.', '까지 갖춰 주세요.', '까지 갖춰 주세요. 그럼 완벽해요!'][idx];
    return ['만 갖춰 줘!', '까지 갖춰 줘!', '까지! 꼭 해 줘!'][idx];
  }
  /** 같은 kind 는 하나로 (센 쪽) */
  function mergeLeaves(leaves) {
    const out = [];
    for (const c of leaves) {
      const same = out.find((o) => o.kind === c.kind && (c.kind !== 'facilityClass' || o.class === c.class) && (c.kind !== 'facility' || o.id === c.id));
      if (!same || c.kind === 'pool' || c.kind === 'facilityAdjacent') { out.push(c); continue; }
      if (c.kind === 'rigCount' || c.kind === 'rigGrade' || c.kind === 'likes' || c.kind === 'popularity') same.min = Math.max(same.min, c.min);
      if (c.kind === 'rigCount' && c.kinds) same.kinds = Math.max(same.kinds ?? 0, c.kinds);
      if (c.kind === 'facilityClass' || c.kind === 'facility') same.count = Math.max(same.count ?? 1, c.count ?? 1);
    }
    return out;
  }

  const condStats = { item: 0, color: 0, scent: 0, intensity: 0, rewritten: 0 };
  function migrateCondition(w) {
    const c = w.condition;
    const leaves = c.kind === 'all' ? c.of : [c];
    if (c.kind === 'any' || leaves.some((l) => l.kind === 'all' || l.kind === 'any')) throw new Error(`${w.friendId}/${w.idx}: 중첩 조건은 손으로`);
    const hasClass = (cls) => leaves.some((l) => l.kind === 'facilityClass' && l.class === cls);
    const kept = [];
    const added = [];
    for (const l of leaves) {
      if (l.kind === 'item') {
        condStats.item++;
        added.push({ kind: 'rigCount', min: l.count ?? 1 });
        continue;
      }
      if (l.kind !== 'pool') { kept.push(l); continue; }
      const p = { ...l };
      if (p.color !== undefined) {
        condStats.color++;
        added.push(p.color === 'rainbow' ? { kind: 'rigCount', min: 3, kinds: 3 } : { kind: 'rigCount', min: 1 + w.idx });
        delete p.color;
      }
      if (p.scent !== undefined) {
        condStats.scent++;
        if (!hasClass('decor')) added.push({ kind: 'facilityClass', class: 'decor', count: 2 + 2 * w.idx });
        else if (!hasClass('restaurant')) added.push({ kind: 'facilityClass', class: 'restaurant', count: 1 + w.idx });
        else added.push({ kind: 'likes', min: 100 * (w.idx + 1) });
        delete p.scent;
      }
      if (p.intensityMin !== undefined) {
        condStats.intensity++;
        added.push({ kind: 'rigGrade', min: 2 });
        delete p.intensityMin;
      }
      if (Object.keys(p).length > 1) kept.push(p);
    }
    const all = mergeLeaves([...kept, ...added]);
    w.condition = all.length === 1 ? all[0] : { kind: 'all', of: all };
    w.line = all.map(describe).join(', ') + tail(w.line, w.idx);
    condStats.rewritten++;
  }

  // 보상 — 종류는 「목표 대비 가장 덜 준 것」을 고른다. 목표 ingredient 95 · rigPart 56 · 돈 0 — 원래 돈 보상 20 이 있어 전체 213 의 10% 이하(하네스 G49 계약)를 지키려면 새 돈은 못 준다.
  // 같은 친구 안에서 **종류** 중복은 허용하고 **id** 만 다르게(2차: 종류 중복 금지가 돈 65 를 강제했다) · facility 는 wish-source 시설이 전부 쓰여 0
  const TARGET = { ingredient: 95, rigPart: 56 }; // 3차: 원래 돈 보상 20 이 있어 새 돈은 0 — 전체 돈 ≤ 10%(21) 계약
  const wishFacilities = facilities.filter((f) => f.unlock.source === 'wish');
  const facilityUsed = new Set(wishes.filter((w) => w.reward.kind === 'facility').map((w) => w.reward.id));
  const freeFacilities = wishFacilities.filter((f) => !facilityUsed.has(f.id));
  const wishIngredients = ingredients.filter((i) => i.unlock === 'wish').map((i) => i.id);
  const shopParts = rigParts.filter((p) => p.unlock === 'shop').map((p) => p.id);
  const given = { ingredient: 0, rigPart: 0, money: 0, facility: 0 };
  const counters = { ingredient: 0, rigPart: 0, money: 0 };
  const byFriend = new Map();
  for (const w of wishes) { if (!byFriend.has(w.friendId)) byFriend.set(w.friendId, []); byFriend.get(w.friendId).push(w); }
  function migrateReward(w) {
    const sibs = byFriend.get(w.friendId).filter((o) => o !== w && o.reward.kind !== 'item');
    const used = new Set(sibs.filter((o) => o.reward.kind === 'facility').map((o) => o.reward.kind));
    const usedIds = new Set(sibs.map((o) => o.reward.id).filter(Boolean));
    if (freeFacilities.length > 0 && !used.has('facility')) {
      const f = freeFacilities.shift();
      w.reward = { kind: 'facility', id: f.id }; given.facility++;
      return;
    }
    let kind = null;
    for (const k of Object.keys(TARGET)) {
      if (kind === null || given[k] / TARGET[k] < given[kind] / TARGET[kind]) kind = k;
    }
    given[kind]++;
    const pick = (list, counter) => { for (let t = 0; t < list.length; t++) { const id = list[(counters[counter] + t) % list.length]; if (!usedIds.has(id)) { counters[counter] += t + 1; return id; } } return list[counters[counter]++ % list.length]; };
    if (kind === 'ingredient') w.reward = { kind, id: pick(wishIngredients, 'ingredient') };
    else if (kind === 'rigPart') w.reward = { kind, id: pick(shopParts, 'rigPart') };
    else w.reward = { kind: 'money', amount: [700, 1500, 2500][w.idx] + (counters.money++ % 3) * 100 };
  }

  for (const w of wishes) {
    if (hasOld(w.condition)) migrateCondition(w);
    if (w.reward.kind === 'item') migrateReward(w);
  }
  const rewardKinds = {};
  for (const w of wishes) rewardKinds[w.reward.kind] = (rewardKinds[w.reward.kind] ?? 0) + 1;
  summary.wishes = { total: wishes.length, conditions: condStats, itemRewardsReplaced: given, rewardKinds };
  write('wishes.json', wishes);
}

// ── certs.json ───────────────────────────────────────────────────────────────
{
  const certs = read('certs.json');
  const RENAME = { color_f: 'set_f', color_d: 'set_d', color_b: 'set_b', scent_f: 'court_f', scent_d: 'court_d', scent_b: 'court_b' }; // P60-a §10.1: id·family 개명 (보상 바이트 동일)
  const RIG_MIN = { set_f: 2, set_d: 4, set_b: 6 };
  const REST_COUNT = { court_f: 2, court_d: 4, court_b: 6 };
  let touched = 0;
  for (const c of certs) {
    if (RENAME[c.id]) { c.id = RENAME[c.id]; touched++; }
    if (c.requires && RENAME[c.requires]) c.requires = RENAME[c.requires];
    if (c.family === 'color') c.family = 'set'; else if (c.family === 'scent') c.family = 'court';
    const before = JSON.stringify(c.conditions);
    if (RIG_MIN[c.id]) {
      c.conditions = c.conditions
        .filter((w) => w.cond.kind !== 'item')
        .map((w) => (w.cond.kind === 'pool' && (w.cond.color !== undefined || w.cond.intensityMin !== undefined) ? { cond: { kind: 'rigCount', min: RIG_MIN[c.id] }, weight: w.weight } : w));
      // 심사관은 셋(가중치 합 3) — 지운 item 조건의 몫은 rigCount 가 「(2x)」 로 받는다
      const sum = c.conditions.reduce((n, w) => n + w.weight, 0);
      const rig = c.conditions.find((w) => w.cond.kind === 'rigCount');
      if (sum < 3 && rig) rig.weight = rig.weight + (3 - sum);
    } else if (REST_COUNT[c.id]) {
      c.conditions = c.conditions.map((w) => (w.cond.kind === 'pool' && w.cond.scent !== undefined ? { cond: { kind: 'facilityClass', class: 'restaurant', count: REST_COUNT[c.id] }, weight: w.weight } : w));
    } else {
      c.conditions = c.conditions.filter((w) => w.cond.kind !== 'item').map((w) => {
        if (w.cond.kind !== 'pool' || w.cond.scent === undefined) return w;
        const cond = { ...w.cond }; delete cond.scent; delete cond.color; delete cond.intensityMin;
        return { cond, weight: w.weight };
      });
    }
    if (JSON.stringify(c.conditions) !== before) touched++;
  }
  summary.certs = { total: certs.length, touched };
  write('certs.json', certs);
}

// ── calendar.json ────────────────────────────────────────────────────────────
{
  const calendar = read('calendar.json');
  const out = { ingredient: 0, rigPart: 0 };
  for (const e of calendar) {
    if (e.grant.kind !== 'item') continue;
    e.grant = itemGrantReplacement(e.grant.id);
    out[e.grant.kind]++;
  }
  summary.calendar = out;
  write('calendar.json', calendar);
}

// ── areas.json (텍스트 치환 — `1.0` 표기 보존) ───────────────────────────────
{
  const p = join(DATA, 'areas.json');
  let txt = readFileSync(p, 'utf8');
  let n = 0;
  txt = txt.replace(/"kind": "item",(\s*)"id": "(\w+)"/g, (_m, ws, id) => {
    n++;
    const g = itemGrantReplacement(id);
    return g.kind === 'ingredient' ? `"kind": "ingredient",${ws}"id": "${g.id}",${ws}"amount": ${g.amount}` : `"kind": "rigPart",${ws}"id": "${g.id}"`;
  });
  summary.areas = { replaced: n };
  if (!DRY) writeFileSync(p, txt);
}

// ── shop.json ────────────────────────────────────────────────────────────────
{
  const shop = read('shop.json');
  const SHOP_INGREDIENTS = [
    ['butter', 1], ['cream', 1], ['rice', 1], ['tomato', 1], ['chocolate_bar', 2], ['cheese', 2], ['fish_cake', 2], ['malt', 3],
  ];
  const firstItem = shop.findIndex((s) => s.kind === 'item');
  const kept = shop.filter((s) => s.kind !== 'item');
  const have = new Set(kept.map((s) => s.id));
  const add = SHOP_INGREDIENTS.filter(([ref]) => !have.has(`shop_${ref}`)).map(([ref, tier]) => {
    const ing = ingredientById.get(ref);
    if (!ing || ing.unlock !== 'shop' || !ing.price) throw new Error(`shop ingredient ${ref}: 장날 재료가 아니다`);
    return { id: `shop_${ref}`, kind: 'ingredient', ref, price: ing.price * 3, tier };
  });
  const at = firstItem >= 0 ? firstItem : kept.findIndex((s) => s.kind === 'gift');
  kept.splice(at < 0 ? kept.length : at, 0, ...add);
  summary.shop = { before: shop.length, after: kept.length, itemsRemoved: shop.length - kept.length + add.length, ingredientsAdded: add.length };
  write('shop.json', kept);
}

// ── friends.json ─────────────────────────────────────────────────────────────
{
  const friends = read('friends.json');
  let n = 0;
  for (const f of friends) { if ('color' in f.fav || 'scent' in f.fav) n++; f.fav = { food: f.fav.food }; }
  summary.friends = { total: friends.length, stripped: n };
  if (!DRY) writeFileSync(join(DATA, 'friends.json'), JSON.stringify(friends, null, 2) + '\n');
}

// ── facilities.json ──────────────────────────────────────────────────────────
{
  let n = 0;
  const CERT_REF = { color_f: 'set_f', color_d: 'set_d', color_b: 'set_b', scent_f: 'court_f', scent_d: 'court_d', scent_b: 'court_b' };
  for (const f of facilities) { if ('scent' in f || 'scentPower' in f) n++; delete f.scent; delete f.scentPower; if (f.unlock && f.unlock.source === 'cert' && CERT_REF[f.unlock.ref]) { f.unlock.ref = CERT_REF[f.unlock.ref]; n++; } }
  summary.facilities = { total: facilities.length, stripped: n };
  if (!DRY) writeFileSync(join(DATA, 'facilities.json'), JSON.stringify(facilities, null, 2) + '\n');
}

// ── seasons.json ─────────────────────────────────────────────────────────────
{
  const seasons = read('seasons.json');
  const had = 'colors' in seasons || 'scents' in seasons;
  delete seasons.colors; delete seasons.scents;
  summary.seasons = { stripped: had };
  if (!DRY) writeFileSync(join(DATA, 'seasons.json'), JSON.stringify(seasons, null, 2) + '\n');
}

// ── items.json ───────────────────────────────────────────────────────────────
{
  const p = join(DATA, 'items.json');
  summary.items = { deleted: existsSync(p) };
  if (!DRY && existsSync(p)) unlinkSync(p);
}

console.log(JSON.stringify(summary, null, 2));
