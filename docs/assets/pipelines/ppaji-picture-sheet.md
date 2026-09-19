# 빠지 스토리 — 그림 시트 주문서 (ChatGPT 이미지 생성용, 2026-09-11)

**받는 사람에게**: 아래 표의 **390장**을 픽셀아트 아이콘으로 그린다. 게임은 카이로소프트 풍(워터파크 스토리) 2:1 도트 그래픽이고, 이 그림들은 **창 안 카드 격자와 지도 위 팝**에 쓰인다 — 시설처럼 지면에 놓이는 것이 아니라 **정면 아이콘**이다.
정본 계획은 `docs/plan-ppaji-picture-ui.md`(D1 등록부 · P56-b 반입). 이 문서는 목록·규격·판정만 말한다. 무리별 수: 재료 70 · 요리 180 · 기구 부품 13 · 공방 부품 41(2026-09-14 추가 — 초안엔 빠져 공방 창이 폴백이었다) · 견인 기구 33 · 수역 소품 24 · 선물 18 · 팔찌 4 · 캠페인 3 · 인물 초상 10(P56-b2). 시트 밖 장면 배경 4(`src/data/scenes.json`, 192×64 불투명 — `public/assets/scenes/`)은 이 표에 안 든다.

## 1. 규격 (전부 지킬 것)

| 항목 | 값 |
|---|---|
| 크기 | 표의 `px` 열 — **24×24**(재료·요리·부품·소품·선물·팔찌) · **32×32**(견인 기구). 정확히 그 픽셀 수, 확대본 아님 |
| 배경 | 투명 PNG. 바깥 1px 은 비워 둔다(카드 테두리와 닿지 않게) |
| 윤곽 | 1px 남색 계열 외곽선(`#2b2f4a` 근처) — 크림 카드 위에서 실루엣이 서게 |
| 색 | `art-reference/palette-proposed-39.json` 39색 + HUD 크림 토큰 안. 게이트가 가장 가까운 팔레트 색과의 거리 24 로 잰다 — 형광·회색조는 걸린다 |
| 광원 | 좌상단. 그림자는 그리지 않는다(카드가 준다) |
| 시점 | 정면 살짝 위(카이로 아이템 아이콘). 등각 지면 그림 아님 |
| 파일명 | 표의 id 에서 `pic/` 을 떼고 `/` 를 `_` 로: `pic/ingredient/strawberry` → `ingredient_strawberry.png` |
| 묶음 | **한 번에 한 장**(K53 실측: 4-up 은 해상도가 1/4 로 떨어져 색이 샌다). 낱장으로 받으면 `tools/check-pictures.mjs` 가 시트 한 장 + `pictures.json` 으로 묶는다 |

## 2. 스타일의 정본은 첨부 이미지다 — 글로 다시 적지 말 것

반드시 첨부: `art-reference/ui-concept/concept-30-ppaji-target.png`(색·재질) · `art-reference/competitor/pss-ui-build-grid.png`·`pss-ui-item-effect.png`(카드 안에서 아이콘이 어떻게 앉는지 — **문법 참고**, 그 그림을 베끼지 않는다).
프롬프트 뼈대(한 장마다): `pixel art icon, {size}x{size}, front view, 1px dark outline, transparent background, palette-limited, Kairosoft item icon style — {표의 설명}`.

## 3. 판정 — 우리 게이트가 한다 (`tools/check-pictures.mjs`, P56-b)

크기 정확 · 알파 테두리 1px · 팔레트 거리 ≤ 24 · id 전수(표와 1:1) · 같은 계열끼리 실루엣이 겹치지 않음(IoU < 0.9). 못 넘긴 장은 폴백(계열 아이콘)으로 남고 목록에 다시 오른다.

## 4. 하면 안 되는 것

- 글자·숫자를 그림 안에 넣지 말 것(값은 카드가 쓴다) · 배경 장면을 넣지 말 것 · 그림자·광택 과다 금지 · 같은 계열을 색만 바꿔 복제하지 말 것(실루엣이 달라야 한다).

## 5. 목록 — 390장 (`src/data/*.json` 에서 생성, 손으로 고치지 말 것)

| id | 무리 | px | 그릴 것 (이름 · 힌트) |
|---|---|---|---|
| `pic/ingredient/ice` | 재료 | 24 | 얼음 · 계열 base |
| `pic/ingredient/water` | 재료 | 24 | 물 · 계열 base |
| `pic/ingredient/sugar` | 재료 | 24 | 설탕 · 계열 sweet |
| `pic/ingredient/milk` | 재료 | 24 | 우유 · 계열 dairy |
| `pic/ingredient/flour` | 재료 | 24 | 밀가루 · 계열 grain |
| `pic/ingredient/egg` | 재료 | 24 | 달걀 · 계열 base |
| `pic/ingredient/orange_fruit` | 재료 | 24 | 오렌지 · 계열 fruit |
| `pic/ingredient/strawberry_fruit` | 재료 | 24 | 딸기 · 계열 fruit |
| `pic/ingredient/lemon_fruit` | 재료 | 24 | 레몬 · 계열 fruit |
| `pic/ingredient/butter` | 재료 | 24 | 버터 · 계열 dairy |
| `pic/ingredient/cream` | 재료 | 24 | 생크림 · 계열 dairy |
| `pic/ingredient/chocolate_bar` | 재료 | 24 | 초콜릿 · 계열 sweet |
| `pic/ingredient/vanilla` | 재료 | 24 | 바닐라 · 계열 sweet |
| `pic/ingredient/coffee_bean` | 재료 | 24 | 원두 · 계열 base |
| `pic/ingredient/tea_leaf` | 재료 | 24 | 찻잎 · 계열 base |
| `pic/ingredient/cheese` | 재료 | 24 | 치즈 · 계열 dairy |
| `pic/ingredient/chicken` | 재료 | 24 | 닭고기 · 계열 meat |
| `pic/ingredient/beef` | 재료 | 24 | 소고기 · 계열 meat |
| `pic/ingredient/pork` | 재료 | 24 | 돼지고기 · 계열 meat |
| `pic/ingredient/shrimp` | 재료 | 24 | 새우 · 계열 seafood |
| `pic/ingredient/salmon` | 재료 | 24 | 연어 · 계열 seafood |
| `pic/ingredient/tuna` | 재료 | 24 | 참치 · 계열 seafood |
| `pic/ingredient/rice` | 재료 | 24 | 쌀 · 계열 grain |
| `pic/ingredient/seaweed` | 재료 | 24 | 김 · 계열 veg |
| `pic/ingredient/tomato` | 재료 | 24 | 토마토 · 계열 veg |
| `pic/ingredient/potato` | 재료 | 24 | 감자 · 계열 veg |
| `pic/ingredient/honey_jar` | 재료 | 24 | 꿀 · 계열 sweet |
| `pic/ingredient/matcha` | 재료 | 24 | 말차 · 계열 base |
| `pic/ingredient/hazelnut` | 재료 | 24 | 헤이즐넛 · 계열 nut |
| `pic/ingredient/banana_fruit` | 재료 | 24 | 바나나 · 계열 fruit |
| `pic/ingredient/melon_fruit` | 재료 | 24 | 멜론 · 계열 fruit |
| `pic/ingredient/peach_fruit` | 재료 | 24 | 복숭아 · 계열 fruit |
| `pic/ingredient/grapefruit_fruit` | 재료 | 24 | 자몽 · 계열 fruit |
| `pic/ingredient/kiwi_fruit` | 재료 | 24 | 키위 · 계열 fruit |
| `pic/ingredient/mango` | 재료 | 24 | 망고 · 계열 fruit |
| `pic/ingredient/coconut_milk` | 재료 | 24 | 코코넛밀크 · 계열 dairy |
| `pic/ingredient/soda_water` | 재료 | 24 | 탄산수 · 계열 base |
| `pic/ingredient/curry_powder` | 재료 | 24 | 카레가루 · 계열 base |
| `pic/ingredient/soy_sauce` | 재료 | 24 | 간장 · 계열 base |
| `pic/ingredient/truffle` | 재료 | 24 | 트러플 · 계열 base |
| `pic/ingredient/mayonnaise` | 재료 | 24 | 마요네즈 · 계열 base |
| `pic/ingredient/corn` | 재료 | 24 | 옥수수 · 계열 grain |
| `pic/ingredient/cabbage` | 재료 | 24 | 양배추 · 계열 veg |
| `pic/ingredient/noodle` | 재료 | 24 | 생면 · 계열 grain |
| `pic/ingredient/squid` | 재료 | 24 | 오징어 · 계열 seafood |
| `pic/ingredient/octopus` | 재료 | 24 | 문어 · 계열 seafood |
| `pic/ingredient/watermelon_fruit` | 재료 | 24 | 수박 · 계열 fruit |
| `pic/ingredient/dragonfruit` | 재료 | 24 | 용과 · 계열 fruit |
| `pic/ingredient/papaya` | 재료 | 24 | 파파야 · 계열 fruit |
| `pic/ingredient/pineapple_fruit` | 재료 | 24 | 파인애플 · 계열 fruit |
| `pic/ingredient/blueberry_fruit` | 재료 | 24 | 블루베리 · 계열 fruit |
| `pic/ingredient/raspberry_fruit` | 재료 | 24 | 라즈베리 · 계열 fruit |
| `pic/ingredient/grape_fruit` | 재료 | 24 | 포도 · 계열 fruit |
| `pic/ingredient/chestnut` | 재료 | 24 | 밤 · 계열 nut |
| `pic/ingredient/olive_oil` | 재료 | 24 | 올리브유 · 계열 base |
| `pic/ingredient/caramel` | 재료 | 24 | 캐러멜 · 계열 sweet |
| `pic/ingredient/bbq_sauce` | 재료 | 24 | 바비큐소스 · 계열 base |
| `pic/ingredient/charcoal` | 재료 | 24 | 숯 · 계열 base |
| `pic/ingredient/almond` | 재료 | 24 | 아몬드 · 계열 nut |
| `pic/ingredient/gold_leaf` | 재료 | 24 | 금박 · 계열 base |
| `pic/ingredient/fish_cake` | 재료 | 24 | 어묵 · 계열 seafood |
| `pic/ingredient/gochujang` | 재료 | 24 | 고추장 · 계열 base |
| `pic/ingredient/tteok` | 재료 | 24 | 가래떡 · 계열 grain |
| `pic/ingredient/ramyeon` | 재료 | 24 | 라면사리 · 계열 grain |
| `pic/ingredient/red_bean` | 재료 | 24 | 팥 · 계열 grain |
| `pic/ingredient/misugaru` | 재료 | 24 | 미숫가루 · 계열 grain |
| `pic/ingredient/silkworm` | 재료 | 24 | 번데기 · 계열 meat |
| `pic/ingredient/malt` | 재료 | 24 | 엿기름 · 계열 grain |
| `pic/ingredient/smelt` | 재료 | 24 | 빙어 · 계열 seafood |
| `pic/ingredient/persimmon` | 재료 | 24 | 홍시 · 계열 fruit |
| `pic/recipe/ice_water` | 요리 | 24 | 얼음물 ·  |
| `pic/recipe/orange_juice` | 요리 | 24 | 오렌지주스 ·  |
| `pic/recipe/lemonade` | 요리 | 24 | 레모네이드 ·  |
| `pic/recipe/orange_ade` | 요리 | 24 | 오렌지에이드 ·  |
| `pic/recipe/strawberry_milk` | 요리 | 24 | 딸기우유 ·  |
| `pic/recipe/milkshake` | 요리 | 24 | 밀크셰이크 ·  |
| `pic/recipe/egg_bread` | 요리 | 24 | 계란빵 ·  |
| `pic/recipe/pancake` | 요리 | 24 | 팬케이크 ·  |
| `pic/recipe/french_toast` | 요리 | 24 | 프렌치토스트 ·  |
| `pic/recipe/churros` | 요리 | 24 | 츄러스 ·  |
| `pic/recipe/donut` | 요리 | 24 | 도넛 ·  |
| `pic/recipe/crepe` | 요리 | 24 | 크레페 ·  |
| `pic/recipe/omelet` | 요리 | 24 | 오믈렛 ·  |
| `pic/recipe/egg_sandwich` | 요리 | 24 | 에그 샌드위치 ·  |
| `pic/recipe/snow_cone` | 요리 | 24 | 눈꽃빙수 ·  |
| `pic/recipe/strawberry_sorbet` | 요리 | 24 | 딸기 셔벗 ·  |
| `pic/recipe/lemon_shaved_ice` | 요리 | 24 | 레몬 빙수 ·  |
| `pic/recipe/orange_sorbet` | 요리 | 24 | 오렌지 셔벗 ·  |
| `pic/recipe/milk_pudding` | 요리 | 24 | 우유 푸딩 ·  |
| `pic/recipe/fruit_crepe` | 요리 | 24 | 과일 크레페 ·  |
| `pic/recipe/iced_coffee` | 요리 | 24 | 아이스커피 ·  |
| `pic/recipe/cafe_latte` | 요리 | 24 | 카페라테 ·  |
| `pic/recipe/milk_tea` | 요리 | 24 | 밀크티 ·  |
| `pic/recipe/banana_milk` | 요리 | 24 | 바나나우유 ·  |
| `pic/recipe/strawberry_smoothie` | 요리 | 24 | 딸기 스무디 ·  |
| `pic/recipe/matcha_latte` | 요리 | 24 | 말차라테 ·  |
| `pic/recipe/melon_soda` | 요리 | 24 | 멜론소다 ·  |
| `pic/recipe/grapefruit_ade` | 요리 | 24 | 자몽에이드 ·  |
| `pic/recipe/tropical_juice` | 요리 | 24 | 열대과일주스 ·  |
| `pic/recipe/chocolate_crepe` | 요리 | 24 | 초코 크레페 ·  |
| `pic/recipe/butter_cookie` | 요리 | 24 | 버터쿠키 ·  |
| `pic/recipe/croissant` | 요리 | 24 | 크루아상 ·  |
| `pic/recipe/fries` | 요리 | 24 | 감자튀김 ·  |
| `pic/recipe/hot_dog` | 요리 | 24 | 핫도그 ·  |
| `pic/recipe/chicken_nugget` | 요리 | 24 | 치킨너겟 ·  |
| `pic/recipe/seafood_tempura` | 요리 | 24 | 해물튀김 ·  |
| `pic/recipe/cheese_stick` | 요리 | 24 | 치즈스틱 ·  |
| `pic/recipe/potato_pancake` | 요리 | 24 | 감자전 ·  |
| `pic/recipe/salmon_sushi` | 요리 | 24 | 연어초밥 ·  |
| `pic/recipe/tuna_sushi` | 요리 | 24 | 참치초밥 ·  |
| `pic/recipe/gimbap` | 요리 | 24 | 김밥 ·  |
| `pic/recipe/seafood_fried_rice` | 요리 | 24 | 해물볶음밥 ·  |
| `pic/recipe/omurice` | 요리 | 24 | 오므라이스 ·  |
| `pic/recipe/tonkatsu` | 요리 | 24 | 돈가스 ·  |
| `pic/recipe/cheeseburger` | 요리 | 24 | 치즈버거 ·  |
| `pic/recipe/curry_rice` | 요리 | 24 | 카레라이스 ·  |
| `pic/recipe/soy_chicken` | 요리 | 24 | 간장치킨 ·  |
| `pic/recipe/truffle_risotto` | 요리 | 24 | 트러플 리조토 ·  |
| `pic/recipe/vanilla_ice_cream` | 요리 | 24 | 바닐라 아이스크림 ·  |
| `pic/recipe/choco_mint_ice_cream` | 요리 | 24 | 초코민트 아이스크림 ·  |
| `pic/recipe/affogato` | 요리 | 24 | 아포가토 ·  |
| `pic/recipe/matcha_shaved_ice` | 요리 | 24 | 녹차 빙수 ·  |
| `pic/recipe/mango_shaved_ice` | 요리 | 24 | 망고 빙수 ·  |
| `pic/recipe/fruit_sorbet` | 요리 | 24 | 과일 셔벗 ·  |
| `pic/recipe/strawberry_cake` | 요리 | 24 | 딸기 케이크 ·  |
| `pic/recipe/chocolate_cake` | 요리 | 24 | 초코 케이크 ·  |
| `pic/recipe/cheesecake` | 요리 | 24 | 치즈케이크 ·  |
| `pic/recipe/honey_toast` | 요리 | 24 | 허니 토스트 ·  |
| `pic/recipe/hazelnut_chocolate` | 요리 | 24 | 헤이즐넛 초콜릿 ·  |
| `pic/recipe/peach_tart` | 요리 | 24 | 복숭아 타르트 ·  |
| `pic/recipe/grapefruit_juice` | 요리 | 24 | 자몽주스 ·  |
| `pic/recipe/grape_juice` | 요리 | 24 | 포도주스 ·  |
| `pic/recipe/watermelon_juice` | 요리 | 24 | 수박주스 ·  |
| `pic/recipe/dragonfruit_juice` | 요리 | 24 | 용과주스 ·  |
| `pic/recipe/papaya_juice` | 요리 | 24 | 파파야주스 ·  |
| `pic/recipe/banana_juice` | 요리 | 24 | 바나나주스 ·  |
| `pic/recipe/pineapple_juice` | 요리 | 24 | 파인애플주스 ·  |
| `pic/recipe/blueberry_juice` | 요리 | 24 | 블루베리주스 ·  |
| `pic/recipe/raspberry_juice` | 요리 | 24 | 라즈베리주스 ·  |
| `pic/recipe/peach_juice` | 요리 | 24 | 복숭아주스 ·  |
| `pic/recipe/kiwi_juice` | 요리 | 24 | 키위주스 ·  |
| `pic/recipe/coconut_water` | 요리 | 24 | 코코넛워터 ·  |
| `pic/recipe/grape_soda` | 요리 | 24 | 포도소다 ·  |
| `pic/recipe/fruit_soda` | 요리 | 24 | 과일 소다 ·  |
| `pic/recipe/watermelon_soda` | 요리 | 24 | 수박소다 ·  |
| `pic/recipe/mixed_fruit_juice` | 요리 | 24 | 믹스 과일주스 ·  |
| `pic/recipe/ramune` | 요리 | 24 | 사이다 ·  |
| `pic/recipe/canned_coffee` | 요리 | 24 | 캔커피 ·  |
| `pic/recipe/green_smoothie` | 요리 | 24 | 그린 스무디 ·  |
| `pic/recipe/cream_soda` | 요리 | 24 | 크림소다 ·  |
| `pic/recipe/egg_crepe` | 요리 | 24 | 에그 크레페 ·  |
| `pic/recipe/chicken_crepe` | 요리 | 24 | 치킨 크레페 ·  |
| `pic/recipe/tuna_mayo_crepe` | 요리 | 24 | 참치마요 크레페 ·  |
| `pic/recipe/hazelnut_bun` | 요리 | 24 | 헤이즐넛 번 ·  |
| `pic/recipe/melon_bun` | 요리 | 24 | 멜론빵 ·  |
| `pic/recipe/pain_au_chocolat` | 요리 | 24 | 팽오쇼콜라 ·  |
| `pic/recipe/sandwich` | 요리 | 24 | 샌드위치 ·  |
| `pic/recipe/curry_bun` | 요리 | 24 | 카레빵 ·  |
| `pic/recipe/kumax_bun` | 요리 | 24 | 연어빵 ·  |
| `pic/recipe/kairo_bun` | 요리 | 24 | 빠지 번 ·  |
| `pic/recipe/taco` | 요리 | 24 | 타코 ·  |
| `pic/recipe/hamburger` | 요리 | 24 | 햄버거 ·  |
| `pic/recipe/corn_dog` | 요리 | 24 | 콘도그 ·  |
| `pic/recipe/fried_chicken` | 요리 | 24 | 프라이드치킨 ·  |
| `pic/recipe/steamed_pork_bun` | 요리 | 24 | 고기만두 ·  |
| `pic/recipe/fried_calamari` | 요리 | 24 | 오징어튀김 ·  |
| `pic/recipe/corn_on_cob` | 요리 | 24 | 군옥수수 ·  |
| `pic/recipe/chicken_kebab` | 요리 | 24 | 닭꼬치 ·  |
| `pic/recipe/salmon_rice_ball` | 요리 | 24 | 연어 주먹밥 ·  |
| `pic/recipe/popcorn` | 요리 | 24 | 팝콘 ·  |
| `pic/recipe/caramel_popcorn` | 요리 | 24 | 캐러멜 팝콘 ·  |
| `pic/recipe/caesar_salad` | 요리 | 24 | 시저 샐러드 ·  |
| `pic/recipe/fruit_salad` | 요리 | 24 | 과일 샐러드 ·  |
| `pic/recipe/octopus_fritters` | 요리 | 24 | 타코야키 ·  |
| `pic/recipe/almond_cookie` | 요리 | 24 | 아몬드 쿠키 ·  |
| `pic/recipe/bbq_kebab` | 요리 | 24 | 바비큐 꼬치 ·  |
| `pic/recipe/bone_in_roast` | 요리 | 24 | 뼈째 통구이 ·  |
| `pic/recipe/seafood_curry` | 요리 | 24 | 해물카레 ·  |
| `pic/recipe/beef_veg_rice` | 요리 | 24 | 소고기 덮밥 ·  |
| `pic/recipe/beefsteak` | 요리 | 24 | 비프스테이크 ·  |
| `pic/recipe/margherita_pizza` | 요리 | 24 | 마르게리타 피자 ·  |
| `pic/recipe/seafood_pizza` | 요리 | 24 | 해산물 피자 ·  |
| `pic/recipe/tropical_pizza` | 요리 | 24 | 트로피컬 피자 ·  |
| `pic/recipe/meat_pie` | 요리 | 24 | 미트파이 ·  |
| `pic/recipe/fried_noodles` | 요리 | 24 | 볶음면 ·  |
| `pic/recipe/stir_fry_rice` | 요리 | 24 | 볶음밥 ·  |
| `pic/recipe/boiled_noodles` | 요리 | 24 | 잔치국수 ·  |
| `pic/recipe/hot_pot` | 요리 | 24 | 전골 ·  |
| `pic/recipe/soy_ramen` | 요리 | 24 | 간장 라면 ·  |
| `pic/recipe/squid_sushi` | 요리 | 24 | 오징어초밥 ·  |
| `pic/recipe/octopus_sushi` | 요리 | 24 | 문어초밥 ·  |
| `pic/recipe/sushi_set` | 요리 | 24 | 모둠초밥 ·  |
| `pic/recipe/kairobot_toast` | 요리 | 24 | 해태 탄 토스트 ·  |
| `pic/recipe/soda_popsicle` | 요리 | 24 | 소다 아이스바 ·  |
| `pic/recipe/fruit_popsicle` | 요리 | 24 | 과일 아이스바 ·  |
| `pic/recipe/chocolate_ice_cream` | 요리 | 24 | 초코 아이스크림 ·  |
| `pic/recipe/matcha_ice_cream` | 요리 | 24 | 말차 아이스크림 ·  |
| `pic/recipe/coffee_soft_serve` | 요리 | 24 | 커피 소프트콘 ·  |
| `pic/recipe/matcha_hazelnut_crepe` | 요리 | 24 | 말차 헤이즐넛 크레페 ·  |
| `pic/recipe/deluxe_crepe` | 요리 | 24 | 디럭스 크레페 ·  |
| `pic/recipe/chocolate_donut` | 요리 | 24 | 초코 도넛 ·  |
| `pic/recipe/blue_hawaii_snow_cone` | 요리 | 24 | 블루하와이 빙수 ·  |
| `pic/recipe/rainbow_snow_cone` | 요리 | 24 | 무지개 빙수 ·  |
| `pic/recipe/strawberry_sundae` | 요리 | 24 | 딸기 선데 ·  |
| `pic/recipe/oriental_sundae` | 요리 | 24 | 말차 밤 선데 ·  |
| `pic/recipe/chestnut_cream_cake` | 요리 | 24 | 몽블랑 ·  |
| `pic/recipe/raspberry_tart` | 요리 | 24 | 라즈베리 타르트 ·  |
| `pic/recipe/dragonfruit_sorbet` | 요리 | 24 | 용과 셔벗 ·  |
| `pic/recipe/kairobot_pudding` | 요리 | 24 | 해태 황금 푸딩 ·  |
| `pic/recipe/kairobot_parfait` | 요리 | 24 | 해태 숯 파르페 ·  |
| `pic/recipe/veg_scraps` | 요리 | 24 | 야채 찌꺼기 ·  |
| `pic/recipe/burnt_bread` | 요리 | 24 | 탄 빵 ·  |
| `pic/recipe/tsukune` | 요리 | 24 | 탄 꼬치 ·  |
| `pic/recipe/mystery_juice` | 요리 | 24 | 수상한 주스 ·  |
| `pic/recipe/sikhye` | 요리 | 24 | 식혜 ·  |
| `pic/recipe/misugaru_shake` | 요리 | 24 | 미숫가루 셰이크 ·  |
| `pic/recipe/sujeonggwa` | 요리 | 24 | 수정과 ·  |
| `pic/recipe/iced_americano` | 요리 | 24 | 아이스 아메리카노 ·  |
| `pic/recipe/dalgona_latte` | 요리 | 24 | 달고나 라떼 ·  |
| `pic/recipe/slush` | 요리 | 24 | 슬러시 ·  |
| `pic/recipe/corn_tea` | 요리 | 24 | 옥수수차 ·  |
| `pic/recipe/persimmon_smoothie` | 요리 | 24 | 홍시 스무디 ·  |
| `pic/recipe/watermelon_hwachae` | 요리 | 24 | 수박화채 ·  |
| `pic/recipe/fish_cake_skewer` | 요리 | 24 | 어묵꼬치 ·  |
| `pic/recipe/bungeoppang` | 요리 | 24 | 붕어빵 ·  |
| `pic/recipe/hotteok` | 요리 | 24 | 호떡 ·  |
| `pic/recipe/tteokbokki` | 요리 | 24 | 떡볶이 ·  |
| `pic/recipe/sotteok` | 요리 | 24 | 소떡소떡 ·  |
| `pic/recipe/hotbar` | 요리 | 24 | 핫바 ·  |
| `pic/recipe/smelt_fry` | 요리 | 24 | 빙어튀김 ·  |
| `pic/recipe/beondegi` | 요리 | 24 | 번데기 ·  |
| `pic/recipe/grilled_squid` | 요리 | 24 | 오징어구이 ·  |
| `pic/recipe/ramyeon_soup` | 요리 | 24 | 라면 ·  |
| `pic/recipe/cup_ramyeon` | 요리 | 24 | 컵라면 ·  |
| `pic/recipe/sujebi` | 요리 | 24 | 수제비 ·  |
| `pic/recipe/maeuntang` | 요리 | 24 | 매운탕 ·  |
| `pic/recipe/mulhoe` | 요리 | 24 | 물회 ·  |
| `pic/recipe/pajeon` | 요리 | 24 | 파전 ·  |
| `pic/recipe/samgyeopsal` | 요리 | 24 | 삼겹살 ·  |
| `pic/recipe/dakgalbi` | 요리 | 24 | 닭갈비 ·  |
| `pic/recipe/bibim_guksu` | 요리 | 24 | 비빔국수 ·  |
| `pic/recipe/patbingsu` | 요리 | 24 | 팥빙수 ·  |
| `pic/recipe/ice_persimmon` | 요리 | 24 | 아이스홍시 ·  |
| `pic/recipe/injeolmi_bingsu` | 요리 | 24 | 인절미 빙수 ·  |
| `pic/recipe/dalgona` | 요리 | 24 | 달고나 ·  |
| `pic/recipe/red_bean_porridge` | 요리 | 24 | 단팥죽 ·  |
| `pic/recipe/melon_ice_bar` | 요리 | 24 | 메론 아이스바 ·  |
| `pic/recipe/corn_ice_bar` | 요리 | 24 | 옥수수 아이스바 ·  |
| `pic/recipe/yakgwa` | 요리 | 24 | 약과 ·  |
| `pic/recipe/strawberry_mochi` | 요리 | 24 | 딸기 찹쌀떡 ·  |
| `pic/part/pump_motor` | 기구 부품 | 24 | 펌프 모터 ·  |
| `pic/part/waterproof_canvas` | 기구 부품 | 24 | 방수 캔버스 ·  |
| `pic/part/anchor_chain` | 기구 부품 | 24 | 앵커 체인 ·  |
| `pic/part/safety_net` | 기구 부품 | 24 | 안전 그물 ·  |
| `pic/part/led_strip_buoy` | 기구 부품 | 24 | LED 스트립 부표 ·  |
| `pic/part/float_drum` | 기구 부품 | 24 | 부력 드럼 ·  |
| `pic/part/speaker_horn` | 기구 부품 | 24 | 스피커 혼 ·  |
| `pic/part/mooring_rope` | 기구 부품 | 24 | 계류 로프 ·  |
| `pic/part/ramp_deck` | 기구 부품 | 24 | 램프 데크 ·  |
| `pic/part/motor_electric` | 공방 부품 | 24 | 전동모터 · 계열 engine |
| `pic/part/motor_outboard` | 공방 부품 | 24 | 선외기모터 · 계열 engine |
| `pic/part/motor_turbo` | 공방 부품 | 24 | 터보모터 · 계열 engine |
| `pic/part/jet_pump` | 공방 부품 | 24 | 제트펌프 · 계열 engine |
| `pic/part/engine_twin` | 공방 부품 | 24 | 트윈엔진 · 계열 engine |
| `pic/part/tube_small` | 공방 부품 | 24 | 소형튜브 · 계열 tube |
| `pic/part/tube_round` | 공방 부품 | 24 | 원형튜브 · 계열 tube |
| `pic/part/tube_donut` | 공방 부품 | 24 | 도넛튜브 · 계열 tube |
| `pic/part/honey_cell` | 공방 부품 | 24 | 벌집셀 · 계열 tube |
| `pic/part/air_chamber` | 공방 부품 | 24 | 공기주머니 · 계열 tube |
| `pic/part/tube_giant` | 공방 부품 | 24 | 대형튜브 · 계열 tube |
| `pic/part/rope_nylon` | 공방 부품 | 24 | 나일론로프 · 계열 rope |
| `pic/part/rope_steel` | 공방 부품 | 24 | 강선로프 · 계열 rope |
| `pic/part/rope_bungee` | 공방 부품 | 24 | 번지로프 · 계열 rope |
| `pic/part/rope_kevlar` | 공방 부품 | 24 | 케블라로프 · 계열 rope |
| `pic/part/grip_handle` | 공방 부품 | 24 | 손잡이 · 계열 handle |
| `pic/part/bar_handle` | 공방 부품 | 24 | 핸들바 · 계열 handle |
| `pic/part/wing_grip` | 공방 부품 | 24 | 날개그립 · 계열 handle |
| `pic/part/twin_bar` | 공방 부품 | 24 | 쌍핸들 · 계열 handle |
| `pic/part/power_grip` | 공방 부품 | 24 | 파워그립 · 계열 handle |
| `pic/part/seat_cushion` | 공방 부품 | 24 | 방석시트 · 계열 seat |
| `pic/part/seat_bucket` | 공방 부품 | 24 | 버킷시트 · 계열 seat |
| `pic/part/seat_bench` | 공방 부품 | 24 | 벤치시트 · 계열 seat |
| `pic/part/seat_sling` | 공방 부품 | 24 | 슬링시트 · 계열 seat |
| `pic/part/life_strap` | 공방 부품 | 24 | 구명끈 · 계열 safety |
| `pic/part/foot_strap` | 공방 부품 | 24 | 발끈 · 계열 safety |
| `pic/part/safety_bar` | 공방 부품 | 24 | 안전바 · 계열 safety |
| `pic/part/harness_belt` | 공방 부품 | 24 | 하네스벨트 · 계열 safety |
| `pic/part/airbag_pad` | 공방 부품 | 24 | 에어백패드 · 계열 safety |
| `pic/part/deck_board` | 공방 부품 | 24 | 데크판 · 계열 board |
| `pic/part/keel_fin` | 공방 부품 | 24 | 킬핀 · 계열 board |
| `pic/part/ski_blade` | 공방 부품 | 24 | 스키날 · 계열 board |
| `pic/part/hydro_wing` | 공방 부품 | 24 | 수중날개 · 계열 board |
| `pic/part/carbon_deck` | 공방 부품 | 24 | 카본데크 · 계열 board |
| `pic/part/flag_small` | 공방 부품 | 24 | 작은깃발 · 계열 fun |
| `pic/part/water_gun` | 공방 부품 | 24 | 물총 · 계열 fun |
| `pic/part/led_strip` | 공방 부품 | 24 | LED띠 · 계열 fun |
| `pic/part/speaker_box` | 공방 부품 | 24 | 스피커 · 계열 fun |
| `pic/part/bubble_maker` | 공방 부품 | 24 | 거품기 · 계열 fun |
| `pic/part/mirror_ball` | 공방 부품 | 24 | 미러볼 · 계열 fun |
| `pic/gear/peanut` | 견인 기구 | 32 | 땅콩튜브 ·  |
| `pic/gear/jjinppang` | 견인 기구 | 32 | 찐빵튜브 ·  |
| `pic/gear/banana` | 견인 기구 | 32 | 바나나보트 ·  |
| `pic/gear/honeycomb` | 견인 기구 | 32 | 단군 ·  |
| `pic/gear/flyduck` | 견인 기구 | 32 | 날아라오리 ·  |
| `pic/gear/hexa` | 견인 기구 | 32 | 육각튜브 ·  |
| `pic/gear/lotus` | 견인 기구 | 32 | 연꽃보트 ·  |
| `pic/gear/wagon` | 견인 기구 | 32 | 마차튜브 ·  |
| `pic/gear/swing` | 견인 기구 | 32 | 마블 ·  |
| `pic/gear/spinpang` | 견인 기구 | 32 | 회전팡 ·  |
| `pic/gear/twinpang` | 견인 기구 | 32 | 쌍둥이팡 ·  |
| `pic/gear/dancing` | 견인 기구 | 32 | 댄싱보트 ·  |
| `pic/gear/flyfish` | 견인 기구 | 32 | 플라이피쉬 ·  |
| `pic/gear/skyfly` | 견인 기구 | 32 | 하늘날기 ·  |
| `pic/gear/jetski` | 견인 기구 | 32 | 제트스키 ·  |
| `pic/gear/jetboat` | 견인 기구 | 32 | 제트보트 ·  |
| `pic/gear/wakeboard` | 견인 기구 | 32 | 웨이크보드 ·  |
| `pic/gear/waterski` | 견인 기구 | 32 | 수상스키 ·  |
| `pic/gear/sofa_boat` | 견인 기구 | 32 | 소파보트 ·  |
| `pic/gear/flycarpet` | 견인 기구 | 32 | UFO 튜브 ·  |
| `pic/gear/rocket_tube` | 견인 기구 | 32 | 로켓튜브 ·  |
| `pic/gear/discopang` | 견인 기구 | 32 | 디스코팡팡 ·  |
| `pic/gear/blobjump` | 견인 기구 | 32 | 점프 튜브 ·  |
| `pic/gear/water_roller` | 견인 기구 | 32 | 롤링 튜브 ·  |
| `pic/gear/watersled` | 견인 기구 | 32 | 워터슬레드 ·  |
| `pic/gear/kneeboard` | 견인 기구 | 32 | 니보드 ·  |
| `pic/gear/air_chair` | 견인 기구 | 32 | 바이퍼 ·  |
| `pic/gear/marine_jet` | 견인 기구 | 32 | 샤크 제트보트 ·  |
| `pic/gear/hydrofoil` | 견인 기구 | 32 | 플라이보드 ·  |
| `pic/gear/flat_tube` | 견인 기구 | 32 | 구멍 난 튜브 ·  |
| `pic/gear/tangled_rope` | 견인 기구 | 32 | 엉킨 로프 ·  |
| `pic/gear/sunk_board` | 견인 기구 | 32 | 가라앉은 판 ·  |
| `pic/item/strawberry` | 수역 소품 | 24 | 분홍 랜턴 부표 ·  |
| `pic/item/chocolate` | 수역 소품 | 24 | 모닥불 장작 ·  |
| `pic/item/lemon` | 수역 소품 | 24 | 유자향 노란 향초 ·  |
| `pic/item/apple` | 수역 소품 | 24 | 빨간 과일향 풍선 ·  |
| `pic/item/blueberry` | 수역 소품 | 24 | 파란 베리 염료 ·  |
| `pic/item/peach` | 수역 소품 | 24 | 복숭아빛 조명 ·  |
| `pic/item/grapes` | 수역 소품 | 24 | 보랏빛 야간 조명 ·  |
| `pic/item/grapefruit` | 수역 소품 | 24 | 주황 자몽 향낭 ·  |
| `pic/item/melon` | 수역 소품 | 24 | 멜론향 연두 부표 ·  |
| `pic/item/kiwi` | 수역 소품 | 24 | 키위향 초록 염료 ·  |
| `pic/item/pineapple` | 수역 소품 | 24 | 햇살 반사판 ·  |
| `pic/item/coconut` | 수역 소품 | 24 | 하얀 야자잎 매트 ·  |
| `pic/item/milk` | 수역 소품 | 24 | 우윳빛 안개 분무기 ·  |
| `pic/item/coffee_beans` | 수역 소품 | 24 | 커피 트럭 스피커 ·  |
| `pic/item/mint` | 수역 소품 | 24 | 솔잎 얼음 바구니 ·  |
| `pic/item/ice_block` | 수역 소품 | 24 | 얼음 덩어리 ·  |
| `pic/item/bath_salt` | 수역 소품 | 24 | 온수관 ·  |
| `pic/item/rose` | 수역 소품 | 24 | 장미 꽃잎 띄우기 ·  |
| `pic/item/cinnamon` | 수역 소품 | 24 | 계피향 빨간 화로 ·  |
| `pic/item/honey` | 수역 소품 | 24 | 꿀단지 향로 ·  |
| `pic/item/lavender` | 수역 소품 | 24 | 보라 라벤더 화환 ·  |
| `pic/item/orange` | 수역 소품 | 24 | 오렌지향 등불 ·  |
| `pic/item/banana` | 수역 소품 | 24 | 노란 바나나 보트 ·  |
| `pic/item/seaweed` | 수역 소품 | 24 | 물레방아 ·  |
| `pic/gift/red_tube` | 선물 | 24 | 빨간 튜브 ·  |
| `pic/gift/duck_float` | 선물 | 24 | 오리 튜브 ·  |
| `pic/gift/blue_orca` | 선물 | 24 | 바다 범고래 튜브 ·  |
| `pic/gift/striped_swimsuit` | 선물 | 24 | 줄무늬 수영복 ·  |
| `pic/gift/school_swimsuit` | 선물 | 24 | MT 수영복 ·  |
| `pic/gift/retro_swimsuit` | 선물 | 24 | 레트로 수영복 ·  |
| `pic/gift/flower_pants` | 선물 | 24 | 꽃무늬 팬츠 ·  |
| `pic/gift/kayak_float` | 선물 | 24 | 카약 튜브 ·  |
| `pic/gift/kairo_float` | 선물 | 24 | 해태 튜브 ·  |
| `pic/gift/donut_float` | 선물 | 24 | 도넛 튜브 ·  |
| `pic/gift/banana_float` | 선물 | 24 | 바나나 튜브 ·  |
| `pic/gift/watermelon_float` | 선물 | 24 | 수박 튜브 ·  |
| `pic/gift/river_orca` | 선물 | 24 | 강 범고래 튜브 ·  |
| `pic/gift/hammock` | 선물 | 24 | 해먹 튜브 ·  |
| `pic/gift/flamingo_float` | 선물 | 24 | 홍학 튜브 ·  |
| `pic/gift/dreaming_orca` | 선물 | 24 | 꿈꾸는 범고래 튜브 ·  |
| `pic/gift/shell_float` | 선물 | 24 | 조개 튜브 ·  |
| `pic/gift/swim_ring` | 선물 | 24 | 파란 링 튜브 ·  |
| `pic/band/vest_only` | 팔찌 | 24 | 구명조끼 |
| `pic/band/big3` | 팔찌 | 24 | 3종 팔찌 |
| `pic/band/big5` | 팔찌 | 24 | 5종 팔찌 |
| `pic/band/allday` | 팔찌 | 24 | 종일 무제한 |
| `pic/campaign/flyer` | 캠페인 | 24 | 읍내 현수막 · ad |
| `pic/campaign/bus` | 캠페인 | 24 | 전세버스 송영 · bus |
| `pic/campaign/tv` | 캠페인 | 24 | 유튜브 광고 · ad |
| `pic/portrait/president_calm` | 인물 초상 | 32 | 이 사장 · 차분 · 가평 빠지 조합 이사장 — 50대 남자, 흰 셔츠에 밀짚모자, 넉넉한 웃음 |
| `pic/portrait/president_happy` | 인물 초상 | 32 | 이 사장 · 웃음 · 가평 빠지 조합 이사장 — 50대 남자, 흰 셔츠에 밀짚모자, 넉넉한 웃음 |
| `pic/portrait/nana_calm` | 인물 초상 | 32 | 알바 은지 · 차분 · 20대 여자 알바 — 갈색 포니테일, 노란 스태프 티셔츠 |
| `pic/portrait/nana_happy` | 인물 초상 | 32 | 알바 은지 · 웃음 · 20대 여자 알바 — 갈색 포니테일, 노란 스태프 티셔츠 |
| `pic/portrait/judge_calm` | 인물 초상 | 32 | 박 주무관 · 차분 · 군청 수상레저 담당 공무원 — 30대 남자, 안경, 반팔 셔츠와 서류철 |
| `pic/portrait/judge_happy` | 인물 초상 | 32 | 박 주무관 · 웃음 · 군청 수상레저 담당 공무원 — 30대 남자, 안경, 반팔 셔츠와 서류철 |
| `pic/portrait/coastguard_calm` | 인물 초상 | 32 | 해경 · 차분 · 해양경찰 심사위원 — 40대 남자, 흰 제모와 남색 제복 |
| `pic/portrait/coastguard_happy` | 인물 초상 | 32 | 해경 · 웃음 · 해양경찰 심사위원 — 40대 남자, 흰 제모와 남색 제복 |
| `pic/portrait/youtuber_calm` | 인물 초상 | 32 | 유튜버 · 차분 · 여행 유튜버 심사위원 — 20대 여자, 선글라스를 머리에 얹고 카메라를 든 |
| `pic/portrait/youtuber_happy` | 인물 초상 | 32 | 유튜버 · 웃음 · 여행 유튜버 심사위원 — 20대 여자, 선글라스를 머리에 얹고 카메라를 든 |
