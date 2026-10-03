# Orca 병렬 작업 정산

Run `run_fc9dbd55012a`. 각 작업의 마지막 시도를 기준으로 합니다. 준비 화면에서 실패한 시작 시도는 같은 작업으로 재시도했고, 최종 소유 터미널은 모두 해제했습니다. 현재 활성 작업0·회수 대기0·미해제 소유 자원0.

| Task | 최종 Dispatch | 결과 | 자원 상태 |
|---|---|---|---|
| `task_edb9cec4c9c4` | `ctx_587013741196` | succeeded | released |
| `task_21d9d262d18d` | `ctx_e8b5fd0bd780` | succeeded | released |
| `task_bfa599fbff92` | `ctx_5b6a6db1d215` | succeeded | retained |
| `task_9e9a3999a40c` | `ctx_f5905f0bb359` | succeeded | released |
| `task_7ddb6a714113` | `ctx_d5efc504062c` | succeeded | released |
| `task_dbeb01552dfd` | `ctx_6d1126edee76` | succeeded | released |
| `task_1e6034b44ef9` | `ctx_3d64ba3391b6` | succeeded | retained |
| `task_8b3abbd2b6b7` | `ctx_1ca5d829544d` | succeeded | retained |
| `task_766eee2e3bf6` | `ctx_fa607e3aac30` | succeeded | retained |
| `task_5c3055ba51e9` | `ctx_41095014286a` | succeeded | released |
| `task_89963b04f982` | `ctx_0c44aa604017` | succeeded | released |
| `task_a92d42e4e597` | `ctx_4f7409e92deb` | succeeded | released |
| `task_0705ff17eb49` | `ctx_70595405f32e` | succeeded | released |
| `task_6c1ce2529618` | `ctx_c9bded2d9197` | succeeded | retained |
| `task_49856df8fe53` | `ctx_0130fe112f25` | succeeded | released |
| `task_8495bb1dd3ef` | `ctx_8137409f36a8` | succeeded | released |
| `task_6f770cd2a90c` | `ctx_8f2e99c5a91f` | succeeded | released |
| `task_5af033c2ef93` | `ctx_0e98eeee41ac` | succeeded | retained |

`retained`는 후속 작업으로 소유권을 이전했던 과거 시도 행입니다. 해당 행에 현재 소유 자원은 없습니다. 실제 최종 소유 자원의 release 상태와 task/dispatch 근거는 final-orchestration.json에 보존했습니다.

이번 마지막 적용 팩: 휴식4종, 곡면4종, 장애물7종, 복합 놀이터1종. 팩별 HANDOVER 및 coordinator-visual-qa, runtime/water-runtime-qa, 적용 후 HTTP/browser-qa 참조. 이전 병렬 묶음은 같은 docs/assets/handovers 아래 parallel-village, parallel-decor, parallel-nature-slides-towers 기록을 참조합니다.
