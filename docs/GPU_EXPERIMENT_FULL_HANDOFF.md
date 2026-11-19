# GPU 실험 시작 이후 전체 개발·연구 인계 보고서

기준일: 2026-11-18, Asia/Seoul. 대상 독자: **GPU 실험 직전의 CPU 실험과 기존 옷장 웹만 알고 있는 다른 AI 채팅**. 이 문서만으로 이후의 목적·구현·실험·실패·현재 상태와 다음 판단을 이해할 수 있게 작성했다. 실행 당시의 개별 보고서는 역사 기록이며, 현재 상태는 이 문서와 최신 비교 보고서의 설명을 따른다.

## 1. 지금 알아야 할 상태

1. RTX 3070 Ti에서 Qwen3-VL 4B 양자화 모델의 실제 이미지 추론을 확인했고, 기존 60장 CPU 결과와 비교했다. 장당 평균 43.622초에서 0.840초로 줄었지만 하드웨어·정밀도·런타임이 함께 달라진 **배포 설정 비교**다.
2. 옷장 웹의 사진 등록을 실제 로컬 GPU에 연결했다. 종류·소매뿐 아니라 이름·색상·스타일·패턴·목 형태·원단 느낌이 자동 입력되고 사용자가 수정·저장할 수 있다.
3. 실제 Qwen으로 코디 2~4개 아이템의 사진 묶음을 평가하는 데모가 있다. 후보 구성·고정·제외는 규칙이고, 조화·상황 판단은 Qwen 프롬프트 추론이다. 논문의 학습 모델이 웹에서 추천하는 상태가 아니다.
4. 데모는 처음 예시 12개에서 출발했으나 현재 전달 사진 60장 + 하의·신발 예시 8개 = **68개 등록 항목**이다. 사용자 사진을 빠뜨렸던 문제와 앞쪽 120개 조합에 치우치던 후보 생성 문제를 수정했다.
5. 공식 Polyvore를 받아 분할 누수를 검사하고, 동결 ResNet18 특징 위에 별도 궁합 모델을 실제 학습했다. Qwen을 fine-tuning한 것은 아니다. WACV2023 원본 전체 재현도 아니다.
6. 첫 Transformer 학습에서 과적합이 관찰돼 더 작은 모델을 비교했다. 최신 Pool32는 평균 AUC 0.746 / FITB 42.23%로 수치상 개선됐지만 **과적합은 남는다**. 재사용 테스트의 탐색 결과이며 웹으로 승격하지 않았다.
7. 구매 범용성·대체 가능성·개인 취향 학습은 아직 없다. 인증·날씨·구매분석의 일부 흐름은 mock이다. 실제 추천 품질의 사람 검증과 Qwen 대 학습 모델의 동일 후보 비교도 아직 하지 않았다.
8. 외부 배포·커밋·PR은 수행하지 않았다. 작업 트리에 기존 작업을 포함한 미커밋 변경이 많으므로 다음 AI가 초기화하거나 덮어쓰면 안 된다.

## 2. 작업 환경과 폴더

workspace: `C:\Users\phs\Desktop\박지민\personal_p`, Windows / PowerShell.

| 경로 | 역할 |
|---|---|
| `wardrobe-desktop-handoff/` | CPU 기준 자료, 원본 사진 60장, Qwen GGUF·프로젝터, llama.cpp CUDA 런타임, GPU 속도 실험 |
| `lion_personal/` | Next.js 16.3.4 / React 19.2.6 / TypeScript 옷장 웹 |
| `lion_personal/scripts/` | Qwen 상주 GPU 게이트웨이, 코디 프롬프트·검증, 데모 시작/브라우저 검사 |
| `lion_personal/training/` | Polyvore 다운로드·특징 추출·누수 검사·학습·비교·CLI 추론 |
| `lion_personal/docs/` | 웹/GPU/학습 개별 보고서와 이 인계 문서 |

GPU는 RTX 3070 Ti 8GB, 처음 확인한 드라이버는 621.01이다. Qwen 서빙은 **llama.cpp CUDA 12.4 바이너리**, 궁합 학습은 별도 **PyTorch 2.11.0+cu128 / torchvision 0.26.0+cu128** 환경이다. 둘을 같은 CUDA 패키지나 같은 모델로 혼동하지 않는다.

Python도 구분한다.

- `wardrobe-desktop-handoff/.venv`: Python 3.11 계열, Pillow를 사용하는 Qwen 웹 게이트웨이·벤치마크 환경.
- `lion_personal/training/.venv`: PyTorch, torchvision, huggingface_hub, pyarrow, numpy, scikit-learn, matplotlib 등의 학습 환경. 정확한 버전은 `training/requirements-lock.txt`.

`lion_personal/AGENTS.md`는 Next.js 변경 전에 로컬 `node_modules/next/dist/docs/` 관련 문서를 확인하도록 요구한다. Next.js 예전 API를 기억에 의존해 적용하지 않는다. 예를 들어 동적 route params는 현재 비동기 방식이다. 학습 스크립트만 바꾸는 작업과 웹 변경은 별개다.

## 3. GPU 시작 직전의 기준 상태

사용자는 `C:\Users\phs\Downloads\wardrobe-desktop-handoff.zip`을 전달했고 `START_HERE.md`를 읽고 RTX 3070 Ti 비교를 요청했다. 압축은 workspace의 동명 폴더에 풀었다.

- 기준 자료: `data/fresh_01/manifest.json`의 사진 60장과 SHA256.
- 기준 정답: `data/fresh_01/registration_labels.json`의 종류·소매. 기존 자료 재사용 및 보조 시각 검토로 만든 동결표이며 **전문가 검증 정답은 아니다**.
- CPU 결과: `runs/larger_01/results.jsonl`, `comparison.json`, `protocol.json`.
- CPU Qwen3-VL 4B BF16: 종류 54/60, 소매 60/60, 평균 43.6215초/장.
- 정해진 진단 5장: `photo_000`, `photo_005`, `photo_020`, `photo_028`, `photo_042`.
- 사진 구성: 상의 56장, 아우터 4장. 개인 촬영 11장, 상품 이미지 49장. 60장 모두 서로 다른 물리적 의류라고 검증한 것은 아니다. 종류·소매 라벨은 코디 궁합 라벨이 아니다.

초기 참고 문서에는 FashionCLIP·Marqo 등 인코더 공유 구조 후보도 있었다. **이 인코더 비교는 아직 실행하지 않았다.** 이후 궁합 실험에서는 먼저 가볍고 공식 사용 경로가 명확한 ResNet18을 동결 인코더로 사용했다.

## 4. 1단계 — RTX 3070 Ti 추론 비교

2026-11-10에 공식 모델과 CUDA 런타임을 준비했다.

- 모델: `models/Qwen3VL-4B-Instruct-Q4_K_M.gguf`.
- 비전 프로젝터: `models/mmproj-Qwen3VL-4B-Instruct-F16.gguf`.
- 공식 Qwen GGUF revision: `1cd86afb9a95c410a6038ab3b40d8b578c892266`.
- 런타임: llama.cpp `b12224`, build `806b3c2be`, Windows CUDA 12.4. 실행파일·DLL은 `runtime/`.
- 이미지 EXIF 보정 → RGB → 최대 768px LANCZOS. 프롬프트에는 사진 픽셀과 공통 요청만 넣고 파일명·정답을 넣지 않았다.
- temperature=0, seed=42, 최대 240토큰, ctx4096, parallel1, batch/ubatch128, prompt cache 비활성화. 로그에서 모델 37/37 layer와 비전 인코더의 CUDA0 사용을 확인했다.

### 시도와 문제

첫 진단은 CUDA 사용 증거가 로그에 충분하지 않아 5장 뒤 중단하고 로그 수준을 올렸다. 이후 F1 25가 GPU를 점유한 상태에서 지연이 발생했다. 게임 종료를 사용자에게 요청했고, 종료 후 정식 측정을 진행했다. 게임을 임의로 종료하지 않았다.

아래 실패·진단 경로도 삭제하지 않고 보존했다.

| 경로 | 의미 |
|---|---|
| `runs/gpu_01_initial/` | 초기 로그 증거 부족 진단 |
| `runs/gpu_01_large_batch/` | 자원 경합 중 후속 시도 |
| `runs/gpu_01_game_contention/` | 게임과의 GPU 경합 시도 |
| `runs/gpu_01/` | 게임 종료 후 정식 60장 결과 |

속도 변화가 배치 설정 하나 때문이라고 해석하지 않는다. 당시 게임 경합과 설정 변화가 함께 있었다.

### 정식 결과

| 항목 | CPU BF16 | GPU Q4_K_M |
|---|---:|---:|
| 종류 | 54/60 | 55/60 |
| 소매 | 60/60 | 60/60 |
| 장당 평균 | 43.622초 | 0.840초 |
| 출력 검사 실패 | 0 | 0 |

GPU 중앙값 0.823초, 60장 순차 경과 50.449초, 서버 로딩 3.521초, 별도 워밍업 0.960초. 전체 GPU 메모리 표본 최고 5,173MiB이며 다른 데스크톱 프로세스도 포함한다. 평균 시간 비율은 약 51.96배다.

종류 결과가 CPU와 달라진 것은 3장: `photo_032`와 `photo_042`는 개선, `photo_050`은 악화. **순수 GPU 가속 효과나 양자화 효과를 분리한 실험은 아니다.** CPU와 GPU는 기기·런타임·정밀도가 다르며 동일 GGUF CPU 대조는 하지 않았다.

코드: `setup_gpu.py`, `run_gpu.py`, `summarize_gpu.py`. 결과: `runs/gpu_01/REPORT.md`, `comparison.csv/json`, `results.jsonl`, `protocol.json`, 메모리 표본·로그·모델 해시.

## 5. 2단계 — 웹 사진 등록에 실제 GPU 연결

기존 웹은 mock 중심이었다. 사용자가 한 장 업로드하면 종류·소매가 자동 입력되고, 클릭부터 표시까지 시간을 측정하도록 연결했다.

실제 흐름:

```text
업로드 버튼 / 파일 선택
→ components/wardrobe.tsx
→ lib/garment-analysis.ts
→ POST /api/garments/analyze (Next Node route)
→ 127.0.0.1:8092/analyze (Python gateway)
→ 127.0.0.1:8091/v1/chat/completions (상주 llama.cpp CUDA)
→ 응답 검증·정규화
→ 사용자가 수정 가능한 등록 폼
→ 저장 시 브라우저 localStorage
```

주요 구현:

- `scripts/gpu_service.py`: 표준 라이브러리 ThreadingHTTPServer, 상주 llama-server 기동, Pillow 전처리. 요청 사진은 분석 서버에서 디스크에 저장하지 않는다.
- 동시 GPU 작업은 LOCK으로 막고 다른 요청에는 429. localhost에만 바인딩한다. 모델이 꺼졌을 때 503과 재시도 UI를 제공하며 가짜 성공으로 바꾸지 않는다.
- MIME·12MB 제한·손상 이미지 검사, 모바일 JPEG의 MPO 첫 프레임 지원.
- Next route에서 same-origin 검사. Next 내부 URL의 localhost와 브라우저 127.0.0.1 차이 때문에 Host를 반영해 실제 요청 출처를 비교했다.
- 입력값 수정·저장·상세·새로고침 유지. 원본 파일명·정답을 모델에 넣지 않는다.
- `components/application.tsx`에 `useSyncExternalStore` 기반 hydration 준비 확인을 넣어 스트리밍 경계와 저장소 복원의 충돌(#418)을 보완했다.

첫 5장 실제 브라우저 클릭→표시 평균 **1.115초**(0.862~1.547초). 측정은 클릭 처리 시점부터 React 반영 이후 두 번째 animation frame까지다. 모델 로딩은 제외하고, 자동 파일 선택을 사용해 사람의 파일 탐색 시간은 재현하지 않았다. 0.840초 모델 실험과 같은 지표가 아니다.

근거: `docs/GPU_REGISTRATION_LOCAL_REPORT.md`, `GPU_REGISTRATION_TIMING.json`.

## 6. 3단계 — 등록 속성 확장

이후 사용자가 다른 요소도 자동 입력하도록 요청해 이름·색상·스타일·패턴·목 형태·원단 추정을 추가했다.

- 전용 `scripts/registration_prompt.txt`, 최대 384토큰. 기존 60장 실험과 프롬프트·출력량이 달라 **55/60 정확도와 0.840초를 그대로 적용하지 않는다**.
- 모델의 자유 서술 이름에 부정확한 표현·다른 언어가 섞이는 경우가 있어, 이름은 정규화한 한글 색상+종류로 조합한다. 브랜드를 추정하지 않는다.
- 색상·스타일·패턴·목 형태·질감 표현은 허용 enum으로 정리한다. 지원하지 않는 값/null은 모르겠어요 또는 빈칸으로 둔다. 모르는 스타일을 캐주얼로 덮지 않는다.
- 원단은 `데님 느낌`, `메쉬 조직` 같은 시각적 추정이다. 성분을 확정하지 않으며 값이 있어도 확인 필요를 표시한다.
- 새 사진이 불명확하면 이전 사진의 속성을 남기지 않는다. 사용자가 직접 바꾼 이름은 보존한다.
- 이후 코디 구현 때 하의·원피스·신발 종류도 확장했다. 예시 바지→trousers, 스니커즈→sneakers는 GPU로 확인했지만 새 유형 전체 정확도는 평가하지 않았다.

실제 5장 UI 자동 입력 평균 **1.400초**, 범위 1.194~1.703초. 자동 반영과 저장·수정·오류를 검증한 결과이지 부가 속성의 정답률은 아니다. 예를 들어 사진에서 원단·목 형태를 틀리게 추정할 수 있다.

근거: `docs/GPU_REGISTRATION_ATTRIBUTES_REPORT.md`, `GPU_REGISTRATION_ATTRIBUTES_TIMING.json`.

## 7. 4단계 — 기준 조사와 실제 Qwen 코디 데모

사용자는 코디 적합도·구매 범용성·추천의 기준을 공신력 있는 자료에서 잡기를 요청했다. 정리한 원칙은 시각적 조화 / 상황 적합성 / 개인 취향을 분리하고, 유사한 옷과 서로 어울리는 옷을 구분하는 것이다. 임의의 색상40% 같은 점수 공식을 논문 근거로 포장하지 않았다.

참고한 주요 자료:

| 자료 | 참고한 개념 | 구현 범위 |
|---|---|---|
| [ECCV2018 Type-Aware Embeddings](https://github.com/mvasil/fashion-compatibility) | 유사성과 궁합 구분, benchmark | 개념·데이터 참고. 원본 triplet/text 학습 미재현 |
| [WACV2023 OutfitTransformer](https://openaccess.thecvf.com/content/WACV2023/html/Sarkar_OutfitTransformer_Learning_Outfit_Representations_for_Fashion_Recommendation_WACV_2023_paper.html) | 전체 코디 관계, self-attention | 초기에는 프롬프트 설계 참고, 이후 별도 경량 학습 헤드 구현 |
| [CVPR2021 Workshops 설명 가능한 궁합](https://openaccess.thecvf.com/content/CVPR2021W/CVFAD/papers/Kaicheng_Modeling_Fashion_Compatibility_With_Explanation_by_Using_Bidirectional_LSTM_CVPRW_2021_paper.pdf) | 속성과 설명 연결 | Qwen 설명 항목 설계 참고, 해당 모델 미사용 |
| [CVPR2018 Creating Capsule Wardrobes](https://openaccess.thecvf.com/content_cvpr_2018/html/Hsiao_Creating_Capsule_Wardrobes_CVPR_2018_paper.html) | 코디 가능성과 스타일 coverage | 구매 범용성의 향후 방향, 미구현 |
| [CVPR2021 Learnable Anchors](https://openaccess.thecvf.com/content/CVPR2021/papers/Lu_Personalized_Outfit_Recommendation_With_Learnable_Anchors_CVPR_2021_paper.pdf) | 개인 취향을 별도로 모델링 | 개인화 향후 방향, 미구현 |

이 단계의 승인 범위는 시각적 코디 평가와 이유·상황을 보여주는 로컬 데모였다. 범용성·개인화는 뒤로 미뤘다.

### 현재 웹 추천이 실제로 하는 일

1. `lib/outfit-evaluation.ts`의 후보 생성기가 상의+하의+신발 또는 원피스+신발에 선택적 아우터를 붙인다. 고정·제외·중복 방지 규칙을 적용한다. 이 단계에는 학습된 궁합 점수가 없다.
2. 매번 최대 6개 후보를 선택한다. 전체 옷장 조합을 전수 평가하지 않는다.
3. `POST /api/outfits/evaluate`가 실제 이미지 픽셀을 읽어 Python 게이트웨이로 보낸다. 외부 URL을 임의로 fetch하지 않는다.
4. `scripts/outfit_evaluation.py`가 후보별 사진 2~4장을 번호가 붙은 768×768 컨택트 시트로 구성한다. 개별 사진은 최대 360×340. Qwen이 후보당 한 번, 순차 평가한다.
5. Qwen이 시각적 조화(`cohesive/ordinary/review`)와 상황(`suitable/uncertain/unsuitable`)을 별도로 반환한다. 색상·패턴·질감·형태·전체 관계의 설명과 한계를 함께 보낸다.
6. 상황 부적합은 뒤로, 나머지는 조화로움→무난함→확인 필요 순으로 정렬한다. 동률은 후보 순서를 유지한다. 이 정렬은 제품 정책이며 논문의 점수 공식이 아니다.

**현재 웹은 학습 체크포인트를 호출하지 않는다.** 학습된 분류 logit과 Qwen의 세 등급 판단은 서로 다른 출력이다. 학습 logit을 임의로 세 등급·확률로 바꾸는 연결도 하지 않았다.

### 구현·실패·검증

- `components/ai-outfits.tsx`, `components/outfits.tsx`: 명시적 평가 버튼·평가 전 후보·평가 후 카드·상황·고정·제외·오류/재시도·시간.
- `components/application.tsx`: `/demo/outfits`는 로그인·온보딩 없이 체험 가능. 개인 저장소가 잘못돼도 데모가 불필요하게 막히지 않도록 처리했다.
- 처음에는 모델이 reasons를 문자열로 반환해 검증 실패했다. llama.cpp `response_format`의 JSON schema 문법 제약을 추가했다. max512토큰, temp0, seed42.
- 스키마는 형식만 제한한다. 허리 높이·원단·색상 등을 과하게 추정하는 내용 오류는 남을 수 있다. 질감/형태는 추정으로 표시하고 실제 착용 핏·체형·성분은 확인할 수 없음을 안내한다.
- 요청 실패·잘린 출력·누락 결과를 좋은 예시로 채우지 않는다. Node route는 20MB/개별 이미지3MB/후보1~6/아이템2~4와 구성·ID를 검증한다.
- 최초 12개 예시 데모: 6개 평가 API 응답 검증까지 **17.092초**, Python 평가 **16.797초**. 내 옷장 6개 Python **15.546초**.
- 모델 로딩과 후속 화면 페인트는 이 코디 API 시간에 포함되지 않는다. 등록 화면의 클릭→두 animation frame 측정과 다르다.

Qwen 평가가 실행되고 UI가 동작한다는 검증이다. 사람의 판단과 일치하는지, 설명이 정확한지에 대한 성능 검증은 아니다.

근거: `docs/OUTFIT_AI_DEMO_REPORT.md`, `OUTFIT_AI_DEMO_RUN.json`.

## 8. 5단계 — 전달된 60장 전체를 데모에 포함

사용자가 기존에 넣어둔 60장 이상 자료가 빠졌다고 지적했다. 실제 첫 데모는 `public/clothes` 예시 12개만 사용하고 있었다. 이를 수정했다.

- `lib/demo-catalog.ts`가 원본 manifest와 검토표를 읽는다. ID `provided_photo_000`~`provided_photo_059`.
- 60장은 상의56/아우터4라, 기존 하의4/신발4를 보충해 총68개 항목을 구성한다. 과거 예시 상의4는 중복 보충하지 않는다.
- `/api/demo/garments`가 카탈로그를 제공하고 `/api/demo/photos/[id]`가 manifest에 있는 경로·SHA256을 확인한 원본 바이트만 제공한다. 이미지를 public이나 외부로 복사하지 않는다.
- 전체 검색·카테고리 필터·개별 제외·고정·다른 후보 만들기를 제공한다. 데모는 실제 내 옷장을 변경하지 않는다.
- 과거 최대120개 조합 접두부에서 후보를 고르던 방식은 많은 옷의 뒤쪽 항목이 배제될 수 있었다. mixed-radix 지연 순회와 offset으로 바꿔 모든 옷에 접근 가능하게 했다. 전체 조합을 한 번에 GPU로 평가하는 것은 아니다.
- 20개 후보 배치에서 68개 항목 모두가 등장하는 로직 테스트를 통과했다. 이는 GPU가 68개 모두를 평가했다는 뜻이 아니다.

실제 원본 사진 API 60개를 호출해 SHA256을 전부 검증했다. 브라우저에서 68개 목록·마지막 사진 검색·아우터4개 필터·후보 전환을 확인했다. 6개 실제 GPU 평가의 API 응답 검증까지 **16.306초**, Python **15.588초**. 마지막 사진 `photo_059` 고정 및 `photo_000` 제외 내 옷장 흐름도 실제 GPU 6개 평가(Python15.684초), 좋아요 저장까지 통과했다.

검증 당시 기존3000 서버를 임의로 죽이지 않고 별도 소유한3002 프로덕션 서버를 사용한 뒤 종료했다. 근거: `docs/OUTFIT_DEMO_CATALOG_REPORT.md`, `OUTFIT_DEMO_CATALOG_RUN.json`.

## 9. 6단계 — 논문·데이터 기반 실제 학습 준비

사용자는 프롬프트 평가만으로 끝내지 말고 자료 기반 학습과 과적합 방지를 요청했다. 기존60장에는 궁합 라벨이 없어 지도학습 정답으로 쓰지 않았다. Qwen 출력을 정답처럼 복제하지도 않았다.

공식 Polyvore 파일은 접근 동의가 필요했다. 사용자가 직접 가입·접근 동의를 진행하고 `.env.local`에 `HF_TOKEN`을 저장했다. 처음에는 파일이 비어 있어 저장을 요청했고, 저장 후 실제 제한 파일 다운로드가 성공했다. **토큰 값은 출력·문서화·Git 저장하지 않았다.** 다음 AI도 파일 전체를 cat하지 말고 필요한 코드에서 해당 키만 읽어야 한다.

공식 데이터 카드에는 CC BY 4.0과 연구 접근 조건이 함께 있다. 계정 접근 성공과 제품용 이미지 권리 확보를 같은 것으로 보지 않는다. 이번 작업은 로컬 연구 실험이다.

- `training/download_polyvore.py`: `.env.local`의 키만 파싱해 공식 hub client에 전달. revision 고정, 15개 파일 다운로드. `--check`는 제한 파일1개로 접근 확인.
- 받은 파일: disjoint train/validation/test parquet, 코디 JSON, compatibility/FITB 문항, item metadata, categories, README.
- parquet schema: `item_id`, `image: {bytes, path}`. 이미지 수 train71,967 / validation14,657 / test70,035.
- `training/data/source_manifest.json`: 15개 파일의 SHA256과 크기.
- `training/prepare_polyvore.py`: 공식 torchvision ResNet18 ImageNet1K V1의 224px 전처리, 인코더 동결, CUDA fp16 autocast로 512차원 특징 추출 후 fp32 캐시 저장. 텍스트·파일명·Qwen 속성은 특징 입력이 아니다.
- CPU 전처리 스레드 중첩과 GPU 메모리를 줄이기 위해 thread pool과 torch CPU thread=1, fp16 추출을 적용했다. 초기 추출 중 F1 25 경합이 다시 있어 사용자가 종료했다. 순수 추출 속도 벤치마크로 사용하지 않는다.
- 캐시: `training/data/prepared/{train,validation,test}_features.npz`, `*_hashes.json`. 완료 캐시를 재사용한다.

## 10. 분할 누수 발견과 정제

**공식 파일 경로에 disjoint가 붙어 있어도 실제 중복을 검사해야 했다.** 받은 파일의 공유 item ID는 학습–검증3,781 / 학습–테스트84 / 검증–테스트34였다. 여러 쌍에 동시에 속한 ID가 있어 합집합은3,849개다.

원본 SHA256 또는 EXIF 정규화 RGB 픽셀 해시가 분할을 넘는 그룹은3,899개, dHash+반올림 종횡비가 같은 유사 후보 그룹은5,220개였다. 충돌한 항목을 모든 분할에서 제외했고, 기존60장과 같은 유사 후보1개도 제외했다. 총 제외 item ID는10,690개다. 유사 후보는 다른 옷일 수도 있어 실제 같은 사진이라고 확정하지 않는다.

동일 아이템 반복·중복/충돌 코디·2~8개 범위를 벗어난 코디도 제거했다. FITB 답 후보가 같은 item ID로 중복된 테스트11문항을 제외했다.

| 최종 분할 | 분류 코디 | 양성 | 음성 | FITB |
|---|---:|---:|---:|---:|
| 학습 | 17,492 | 8,728 | 8,764 | 학습 안 함 |
| 검증 | 917 | 426 | 491 | 147 |
| 테스트 | 23,238 | 11,630 | 11,608 | 10,227 |

사용된 분류·FITB 항목을 합쳐 분할 사이에 ID·원본해시·픽셀해시·동일 dHash 후보 교집합이 없음을 assert했다. **물리적 동일 의류의 다른 각도·크롭·모든 유사 이미지를 잡았다는 뜻은 아니다.** 정제의 선택 편향과 검증917개라는 작은 표본도 남는다. 원 논문의 수치와 직접 비교할 수 없는 자체 정제 프로토콜이다.

`training/audit_dataset.py`는 별도의 정규화 manifest에 실제 의류 group_id까지 요구하는 일반 검사기다. Polyvore에서 실제 의류 그룹을 확보했다는 뜻은 아니며, 실제 준비 경로의 감사 결과는 `data/prepared/audit.json`이다.

## 11. 7단계 — 첫 궁합 모델 학습과 과적합

학습 모델은 Qwen과 별개다. 동결 ResNet18 → 이미지별 LayerNorm →512→128 projection + 종류 embedding → outfit token →2층/4-head Transformer → BCE 이진 분류. 학습 파라미터332,673개. 위치 embedding을 사용하지 않아 아이템 순서가 점수의 기준이 되지 않는다.

고정 조건: AdamW lr0.0003, dropout0.3, batch256, gradient clip1.0, 최대30epoch, validation BCE min_delta0.0001/patience5. seed42에서 weight decay0.01/0.1 중 선택 후 선택된0.1을 seed43/44로 반복했다. 기본seed42를 유지했다.

첫 정규화 없는 pilot은 validation AUC약0.57로 pooled image Logistic약0.67보다 낮았다. 이미지 입력 스케일을 보정한 `normalized_visual_v2`로 한 번 수정했다. 이 수정 결정에서 테스트 성능을 보지 않았다. 초기 체크포인트와 곡선은 `runs/compatibility_01_initial_underfit/`에 남겼다. 최종 테스트 출력 파일은 그 초기 경로에 생성되지 않았다.

수정 모델은 `runs/compatibility_01/`에서 완료했다. 검증 선택 파일을 저장한 뒤 테스트를 평가했다.

| 모델 | 학습 AUC | 검증 AUC | 당시 보류 테스트 AUC | FITB |
|---|---:|---:|---:|---:|
| 이미지 Logistic | 0.697 | 0.671 | 0.642 | 39.10% |
| Transformer seed42 | 0.752 | 0.703 | 0.701 | 37.32% |
| Transformer seed43 | 0.850 | 0.758 | 0.750 | 42.34% |
| Transformer seed44 | 0.812 | 0.744 | 0.721 | 40.43% |

3seed 평균 테스트 AUC0.724, seed 표준편차0.024. 기본checkpoint는epoch11, 마지막epoch16이다. seed43/44 선택은epoch16/14다. 후반에 학습 손실은 내려가는데 검증 손실은 나빠져 **과적합 징후가 명확했다**. 조기 종료는 악화된 마지막 가중치 대신 이전 것을 선택했을 뿐, 과적합을 해결한 것이 아니다. 이전 그래프의 학습 손실은 dropout 활성, 검증은 eval이어서 선 사이 간격만 단순 비교하면 안 된다.

분류 AUC 개선이 옷 선택 개선을 보장하지 않았다. 기본 FITB는 기준 모델보다 낮았다. seed 편차도 있어 웹으로 승격하지 않았다. 학습·평가 약60.2초, PyTorch peak allocated 약123.6MiB는 **동결 특징 이후 단계만**의 값이다. 이미지 인코더·서빙 전체 메모리나 end-to-end 업로드 시간이 아니다.

체크포인트·곡선·선택·테스트 예측·CSV를 저장했다. `training/predict_compatibility.py`로 예시 상의/바지/신발3장 실제 추론도 확인했다. 모델 로드 포함 약0.915초, raw logit1.3626이 나왔지만 이를 어울릴 확률이나 사람이 검증한 판정으로 해석하지 않는다.

근거: `docs/OUTFIT_TRAINING_PROTOCOL.md`, `OUTFIT_TRAINING_LOCAL_REPORT.md`, `OUTFIT_TRAINING_RUN.json`, `OUTFIT_TRAINING_LEARNING_CURVES.png`.

## 12. 8단계 — 이번 소형 모델 비교

사용자가 과적합 그래프를 지적한 뒤, 더 작은 모델 비교와 보고서2개 작성을 요청했다. 같은 이미지 특징·정제 데이터에서 새 모델2종×3seed를 실제 CUDA 학습했다. 기존 Logistic과 Transformer는 저장된 결과를 비교 기준으로 유지했다.

- **Pool32**: 32차원 per-item projection + 종류 embedding, 평균/표준편차 풀링, 작은 분류 헤드.17,985학습 파라미터.
- **Tiny Transformer32×1**: hidden32/1층/4head.25,473파라미터.
- 학습률·weight decay0.1·dropout0.3·최대epoch·조기종료를 고정했고 추가 grid search는 하지 않았다.
- 새 모델 곡선은 매 epoch 학습과 검증 모두 eval mode로 계산했다. 이전 dropout 차이 없이 과적합을 본다.
- 모든 새 체크포인트 선택 후 테스트를 봤지만, 테스트가 이미 첫 실험에서 관찰됐으므로 **후속 탐색 비교**로 표시했다. 새 독립 확인 실험이 아니다.

| 모델 | 파라미터 | 평균 검증 AUC | 평균 재사용 테스트 AUC | 평균 FITB | 평균 학습−검증 AUC |
|---|---:|---:|---:|---:|---:|
| 이미지 Logistic | 1,038 | 0.671 | 0.642 | 39.10% | 0.026 |
| Pool32 | 17,985 | 0.748 | 0.746 | 42.23% | 0.093 |
| Tiny Transformer32×1 | 25,473 | 0.586 | 0.610 | 32.04% | 0.060 |
| 기존 Transformer128×2 | 332,673 | 0.735 | 0.724 | 40.03% | 0.070 |

Pool32의 테스트 AUC seed표준편차0.0032/FITB0.26%p로 기존0.0243/2.53%p보다 작았다. 파라미터는94.6% 적고 수치상 성능도 높아 **다음 검증 후보**로 삼을 만하다. 그러나 학습–검증 격차는 오히려 커졌다. seed42는epoch9 학습BCE0.5062/검증0.5988, epoch14학습0.4439/검증0.6049로 과적합이 남았다.

Tiny Transformer는 seed43만 상대적으로 학습됐고 다른 두 seed는 낮은 성능이었다. 작은 격차가 좋은 일반화가 아니라 학습 부족일 수도 있다. 고정한 공통 학습조건이 모델별 최적조건이라는 뜻은 아니다.

정확한 seed별 값·곡선·한계는 **[이번 비교 보고서](SMALL_MODEL_COMPARISON_REPORT.md)**. 원문 JSON/CSV/이미지는 같은 이름의 `SMALL_MODEL_COMPARISON_RUN.json`, `.csv`, `.png`다. 실험 원본은 `training/runs/small_comparison_01/`이며 계획·코드해시·곡선·가중치·예측을 보존했다.

**어느 학습 모델도 현재 웹에 연결하지 않았다.** Logistic/Qwen과 사람이 평가한 실제 코디에서 검증해야 한다. 재사용 테스트 점수를 보고 우수seed만 제품 모델로 고르는 방식은 하지 않았다. 유의성 검정이나 의류 연결 그룹 신뢰구간도 아직 없다. seed표준편차는 신뢰구간이 아니다.

## 13. 현재 실행·재현 방법

### 웹 데모

`lion_personal` 폴더에서:

```powershell
npm run demo
```

웹/GPU ready 후 `http://127.0.0.1:3000/demo/outfits`. 기존 웹·게이트웨이가 같은 포트를 쓰면 중복 실행하지 않는다. 또는 터미널을 나눠 `npm run gpu`와 `npm run dev`. 종료는 실행 터미널 Ctrl+C. `npm run demo -- --check`는 준비 확인 후 자신이 실행한 프로세스를 정리한다.

기본 포트: 웹3000 / gateway8092 / llama8091, 모두 로컬. 모델 상주는 Qwen 서비스에서만 사용한다. 웹만 외부에 배포하면 외부 서버가 이 PC의 loopback에 연결할 수 없으므로 별도 서빙 구조가 필요하다.

환경변수: `WARDROBE_MODEL_ROOT`(인접 handoff 기본), `WARDROBE_PYTHON`, `WARDROBE_GPU_URL`(웹→gateway), `WARDROBE_GPU_PORT`, `WARDROBE_LLAMA_PORT`. 사용자 Hugging Face 토큰은 `.env.local`의 `HF_TOKEN`. 값 자체를 출력하거나 예시파일에 넣지 않는다.

게이트웨이 `/shutdown`은 데모 시작기가 만든 랜덤 `WARDROBE_SHUTDOWN_TOKEN`/헤더가 있어야 한다. 종료 시 자기 자식 모델·Next만 정리한다. 다른 사용자 서버나 게임은 임의로 종료하지 않는다.

### 웹 검사

```powershell
# lion_personal에서
npm test
npm run typecheck
npm run build
# 실제 GPU와 프로덕션 웹이 실행 중일 때, 다른 터미널
npm run test:gpu-web
npm run test:outfits
```

대체 웹 포트는 `WARDROBE_WEB_URL`로 지정한다. Chromium headless shell은 `.playwright/`에 설치돼 있다. 일반 Playwright 실행기의 Windows pipe 시작이 멈추는 문제가 있어 `scripts/test-gpu-web.mjs`가 숨겨진 브라우저의 loopback CDP에 연결하고 `tsx`로 검증 함수를 직접 호출한다. 자체 생성한 브라우저만 종료한다. 사진 포함 스크린샷은 Git 제외 `test-results/`에 저장한다.

### 학습·결과 확인

아래는 workspace 루트에서:

```powershell
lion_personal/training/.venv/Scripts/python.exe -m unittest discover -s lion_personal/training -p 'test_*.py'
lion_personal/training/.venv/Scripts/python.exe lion_personal/training/download_polyvore.py --check
lion_personal/training/.venv/Scripts/python.exe lion_personal/training/plot_small_comparison.py
lion_personal/training/.venv/Scripts/python.exe lion_personal/training/predict_compatibility.py --item tops=lion_personal/public/clothes/t001.jpg --item bottoms=lion_personal/public/clothes/b005.jpg --item shoes=lion_personal/public/clothes/s002.jpg
```

CLI는 첫 학습의 기본seed42 Transformer를 사용한다. 최신 Pool32를 사용하도록 조용히 바꾸지 않았다. 출력은 raw logit이며 서비스용 확률이 아니다. Pool32 가중치는 비교 run에 별도로 있다.

최초 데이터/학습 파이프라인은 `download_polyvore.py` → `prepare_polyvore.py` → `train_compatibility.py`. 후속 비교는 `compare_small_models.py`. 이미 완료된 학습/비교 경로는 보호돼 재실행을 거부한다. 새 실험은 새 RUN·고정 계획을 사용하고 기존 폴더를 지워 테스트 선택을 반복하지 않는다. `.venv`, `.cache`, `data`, `runs`, `.env.local`은 Git 제외이며 다른 AI 채팅만으로 파일이 전달되는 것은 아니다.

## 14. 파일 지도와 검증 범위

| 목적 | 주요 파일 |
|---|---|
| 등록 UI/자료형/저장 | `components/wardrobe.tsx`, `lib/types.ts`, `lib/garment-analysis.ts`, `components/store.tsx` |
| 앱 분기·hydration·무로그인 데모 | `components/application.tsx` |
| 등록 API/Qwen gateway | `app/api/garments/analyze/route.ts`, `scripts/gpu_service.py`, `registration_prompt.txt` |
| 코디 후보·검증·정렬 | `lib/outfit-evaluation.ts`, `components/ai-outfits.tsx`, `components/outfits.tsx` |
| 코디 API/실제 Qwen 평가 | `app/api/outfits/evaluate/route.ts`, `scripts/outfit_evaluation.py`, `outfit_prompt.txt` |
| 전체60장 카탈로그/원본 | `lib/demo-catalog.ts`, `app/api/demo/garments/route.ts`, `app/api/demo/photos/[id]/route.ts` |
| mock 체험 흐름 | `lib/mock-api.ts`, `lib/seed.ts`, `lib/wardrobe-logic.ts` |
| GPU 시작/종료·브라우저 검증 | `scripts/start-gpu.mjs`, `start-demo.mjs`, `test-gpu-web.mjs`, `e2e/gpu-registration.ts`, `e2e/outfit-demo.ts` |
| 학습 데이터/누수 | `training/download_polyvore.py`, `prepare_polyvore.py`, `audit_dataset.py` |
| 첫 모델/로컬추론 | `training/compatibility_model.py`, `train_compatibility.py`, `predict_compatibility.py`, `plot_results.py` |
| 최신 소형 비교 | `training/small_models.py`, `compare_small_models.py`, `plot_small_comparison.py`, `test_small_models.py` |

이전 웹 검증에서는 JS 회귀/로직16개, 타입검사·프로덕션빌드, 실제GPU 등록5장·코디 데모6개/내옷장6개, 모바일390px·오류/재시도·저장 유지 등을 통과했다. 이는 당시 실행의 결과다. 최신 작업은 학습 코드·보고서 중심이므로 이번에 웹 전체 E2E를 다시 실행한 것은 아니다.

학습 Python 테스트는 최초12개에서 최신14개로 늘었다. 누수, 모델 순서/패딩 불변성, finite gradient, 특징 fingerprint, 지표와 새 모델 크기 등을 확인한다. Qwen 게이트웨이 정규화/코디 출력 경계 테스트5개와는 별도 묶음이다. 테스트 성공이 패션 정답률·서비스 품질을 증명하지 않는다.

Git 소유권 경고가 발생하면 `git -c safe.directory=C:/Users/phs/Desktop/박지민/personal_p/lion_personal ...`처럼 명령별로 지정했다. 전역 설정을 바꾸지 않았다. 한글 파일을 PowerShell 파이프로 Python에 전달할 때 인코딩이 깨진 적이 있어 한글 소스·문서는 패치/명시적 UTF-8을 사용한다. 이미지/토큰이 포함된 파일을 불필요하게 출력하지 않는다.

## 15. 남은 과제와 다음 진행 방향

### 가장 먼저: 실제 추천 품질을 평가할 자료

새로 확보한 실제 의류 그룹과 완성 코디에 대해 사람의 블라인드 평가를 모아야 한다. 같은 후보에 대해 현재 Qwen·Logistic·Pool32를 비교한다. 누가 라벨을 줬는지(사용자/전문가), 평가자 간 불일치, 상황·취향을 분리해서 기록한다. 일부 새 의류 그룹은 최종 평가로 잠근다. 기존60장은 개발에 많이 사용됐으므로 새 독립 최종 테스트라고 부르지 않는다.

### 모델 개발

Pool32를 다음 검증 후보로 유지한다. 과적합이 남아 있으므로 새 보류 데이터 없이 기존 테스트 점수만 올리는 추가 튜닝을 피한다. 검증 표본과 의류 그룹·라벨 품질을 보강하고, 이후 정규화·규제·학습 목표나 패션 특화 인코더를 제한된 예산으로 비교할 수 있다. FashionCLIP/Marqo 교체, 이미지 인코더 fine-tuning, 전용 검색 학습은 **아직 시도하지 않은 제안**이다.

### 제품 연결

사람 평가와 실제 3~4개 아이템 코디에서 검증한 뒤, 학습 모델을 많은 후보의 1차 순위/필터로 쓰고 Qwen을 제한된 설명에 쓰는 구조를 검토할 수 있다. 현재 코드에는 이 결합이 없다. 학습 logit을 100점이나 어울릴 확률로 보이게 만들려면 별도 보정·사용자 검증이 필요하다. Qwen 설명은 실제 점수 결정 근거와 일치하는지도 검증해야 한다.

### 범용성·개인화

새 옷이 추가하는 유효하고 다양한 코디/스타일 coverage와 대체·중복을 분리해 설계해야 한다. 단순 가능한 조합 개수를 범용성으로 부르지 않는다. 날씨·상황·개인 취향도 시각적 궁합과 분리한다. 좋아요 UI는 존재하지만 그것으로 개인화 모델을 학습한 상태가 아니다.

## 16. 다른 AI가 특히 피해야 할 오해

- 웹이 OutfitTransformer pretrained 모델을 호출한다고 설명하지 않는다. 현재 웹은 Qwen 프롬프트 평가다.
- 최신 학습 모델이 Qwen 4B fine-tuning이라고 설명하지 않는다. 동결 ResNet18 위의 별도 작은 궁합 헤드다.
- CPU→GPU 약52배를 GPU 하나의 순수 가속 효과라고 말하지 않는다.
- 종류55/60을 확장 프롬프트의 전체 속성 정확도나 코디 추천 정확도로 재사용하지 않는다.
- 사진60장·등록68개를 물리적으로 독립된 옷60/68벌이라고 확정하지 않는다.
- 현재 테스트셋을 다시 처음 보는 평가셋이라고 설명하지 않는다. 최신 비교는 재사용 탐색이다.
- 조기 종료나 작은 모델이 과적합을 제거했다고 말하지 않는다. Pool32의 격차는 오히려 남고 커졌다.
- ROC-AUC·sigmoid·raw logit을 개인의 어울림 확률로 표시하지 않는다.
- 테스트/브라우저 성공, 낮은 latency, 스키마 준수를 추천 내용의 정확성과 혼동하지 않는다.
- 기존 개인 저장소·raw 실험·미커밋 변경을 초기화하지 않는다. 새 실험은 새 경로에 보존한다.

이 요청의 산출물은 **소형 비교 보고서와 본 전체 인계 보고서**다. 추가 개발·배포·새 데이터 라벨링이 완료된 것으로 해석하지 않는다.
