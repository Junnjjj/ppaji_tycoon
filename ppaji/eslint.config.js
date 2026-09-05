import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * 아키텍처 불변식 — 부모 리포(`../eslint.config.js`)와 같은 규칙, 경로만 이 폴더 기준.
 * `src/sim/invariants.test.ts` 가 "규칙이 실제로 위반을 잡는지"를 검사한다. **끄지 말 것.**
 */
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'tmp-shots/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['phaser', 'phaser/*'],
              message: '불변식 1 위반: sim/ 은 Phaser 를 import 할 수 없습니다. render/ 가 sim 을 읽어가게 하세요.',
            },
            {
              group: ['**/render/**', '**/ui/**', '**/assets/**', '**/save/**'],
              message:
                '불변식 1 위반: sim/ 은 render·ui·assets·save 에 의존할 수 없습니다. ' +
                '의존 방향은 바깥 → sim 이고, sim 은 toSnapshot()/fromSnapshot() 으로 평문만 주고받습니다.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: '불변식 2 위반: sim/ 에서는 Rng(sim/rng.ts)를 사용하세요.' },
        { object: 'Date', property: 'now', message: '불변식 2 위반: sim/ 에서는 주입된 tick 을 사용하세요.' },
        { object: 'performance', property: 'now', message: '불변식 2 위반: sim/ 에서는 주입된 tick 을 사용하세요.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: '불변식 2 위반: sim/ 에서 new Date() 금지.' },
      ],
    },
  },
  {
    files: ['tools/**/*.ts', 'tools/**/*.mjs', '**/*.test.ts'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
);
