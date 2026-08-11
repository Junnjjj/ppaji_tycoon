import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'prototype/**', '.superpowers/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
    },
  },

  // ══════════════════════════════════════════════════════════════════
  // 아키텍처 불변식 — 계획서 §3. 이 규칙들을 끄지 말 것.
  //
  // 불변식 1: sim/ 은 Phaser·렌더·UI 를 몰라야 한다.
  //   깨지면 헤드리스 시뮬 러너(npm run sim)와 단위 테스트가 죽고,
  //   에셋 교체(§4)도 불가능해진다.
  //
  // 불변식 2: sim/ 은 결정론적이어야 한다.
  //   Math.random()·Date.now()·performance.now()·new Date() 금지.
  //   시드 RNG(sim/rng.ts)와 주입된 tick 만 사용한다.
  //   깨지면 골든 시나리오 회귀 테스트와 밸런싱 반복 실행이 무의미해진다.
  // ══════════════════════════════════════════════════════════════════
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['phaser', 'phaser/*'],
              message:
                '불변식 1 위반: sim/ 은 Phaser 를 import 할 수 없습니다. ' +
                '렌더링이 필요하면 render/ 가 sim 상태를 읽어가도록 하세요.',
            },
            {
              group: ['**/render/**', '**/ui/**', '**/assets/**', '**/save/**'],
              message:
                '불변식 1 위반: sim/ 은 render·ui·assets·save 에 의존할 수 없습니다. ' +
                '의존 방향은 항상 바깥 → sim 입니다. ' +
                'sim 은 toSnapshot()/fromSnapshot() 으로 평문 데이터만 주고받습니다.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: '불변식 2 위반: sim/ 에서는 Rng(sim/rng.ts)를 사용하세요.',
        },
        {
          object: 'Date',
          property: 'now',
          message: '불변식 2 위반: sim/ 에서는 주입된 tick 을 사용하세요.',
        },
        {
          object: 'performance',
          property: 'now',
          message: '불변식 2 위반: sim/ 에서는 주입된 tick 을 사용하세요.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: '불변식 2 위반: sim/ 에서 new Date() 금지. 주입된 tick 을 사용하세요.',
        },
      ],
    },
  },

  // 헤드리스 러너와 테스트는 Node 전역을 쓴다
  {
    files: ['tools/**/*.ts', '**/*.test.ts'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly' },
    },
  },
);
