# 로컬 AI 코디 추천 데모

2026-11-17 · RTX 3070 Ti · Qwen3-VL 4B Q4_K_M / F16 projector · llama.cpp b12224 CUDA 12.4.

이 문서는 예시 12벌을 사용했던 초기 구현 기록이다. 현재는 전달받은 사진 60장과 하의·신발 예시 8개로 데모를 확장했고, 120개 후보 접두부 제한도 제거했다. 최신 구성과 검증 결과는 [60장 자료 연결 보고서](OUTFIT_DEMO_CATALOG_REPORT.md)를 따른다.

## 바로 실행

프로젝트 `lion_personal`에서:

```powershell
npm run demo
```

`GPU gateway ready`와 웹 `Ready` 표시 후 [로그인 없는 데모](http://127.0.0.1:3000/demo/outfits)에 접속해 **AI로 코디 추천받기**를 누른다. 예시 사진 12벌로 후보 6개를 실제 GPU가 평가한다. 상황 변경, 특정 옷 고정, 체크 해제를 통한 추천 제외를 지원한다. 데모는 사용자의 저장된 옷장을 바꾸지 않는다.

기존 사진 등록용 `npm run gpu`, `npm run dev`를 이미 실행 중이라면 다시 서버를 띄우지 않고 같은 주소를 열면 된다. 두 방식의 포트는 같으므로 동시에 중복 실행하지 않는다. 종료는 터미널 Ctrl+C. `npm run demo -- --check`는 웹/GPU 준비 상태를 확인한 뒤 자신이 실행한 서버들을 종료하는 점검 명령이다.

**내 옷장 사용:** 로그인/데모 체험과 온보딩 후 코디 메뉴(`/outfits`)에서 같은 평가 버튼을 누른다. 원래의 카테고리별 조합은 ‘평가 전 후보’로 구분하고, 실제 AI 응답이 온 뒤 평가된 추천 목록으로 대체한다. 내 옷장에서는 좋아요와 코디 상세·착용 예정 저장을 계속 사용할 수 있다. 평가 결과는 화면 상태에만 있고 영구 저장하지 않으며, 상세 화면은 코디 구성 정보를 보여준다.

## 구현 범위

- 상의·하의·신발, 또는 원피스·신발 후보를 만든다. 고정된 아우터도 포함한다. 제외된 옷과 중복 코디는 배제한다.
- 기존 생성기의 최대 120개 후보에서 여러 옷이 등장하도록 최대 6개를 선택한다. 이는 후보 다양화이며 어울림 점수가 아니다. 전체 옷장 조합을 전수 평가한 결과나 최적 코디라는 주장을 하지 않는다.
- Node API는 실제 사진을 로컬 파일 또는 저장된 이미지 데이터에서 읽어 GPU 게이트웨이로 보낸다. 외부 URL은 가져오지 않는다. 원본 파일명·브랜드·모델이 추정했던 스타일 값은 평가 입력으로 주지 않는다.
- 각 후보의 사진 2~4장을 번호가 붙은 768×768 컨택트 시트로 구성한다. 번호별 옷은 각각 최대 360×340이다. 하나의 실제 착용 사진이 아니므로 전체 착용 핏이나 신체 비율은 확인할 수 없다.
- GPU가 코디별로 전체 조화와 상황 적합성을 별도로 판단한다. 최대 6개를 순차 실행하며 진행 중 다른 GPU 요청에는 429를 반환한다. 임의로 좋은 예시 결과를 대입하지 않는다.
- 사진 등록의 분류 후보도 바지·청바지·반바지·치마·원피스·스니커즈·구두·부츠·샌들로 넓혔다. 종류를 실제 옷장 카테고리로 연결한다. 아직 유형별 독립 정확도를 검증하지 않았다.

## 평가 기준과 표시

전체 조화는 **조화로움 / 무난함 / 확인 필요**, 상황은 **상황에 적합 / 상황 확인 필요 / 상황에 부적합**이다. 색상·패턴·질감·형태·전체 관계에 대한 AI 관찰과 판단의 한계를 함께 보여준다. 질감·형태 설명은 추정으로 표시하며 실제 착용 핏·체형·성분은 확정할 수 없다고 안내한다.

정렬은 상황 부적합을 뒤로 보내고, 나머지는 조화로움→무난함→확인 필요 순이다. 같은 판단이면 후보 순서를 유지한다. 확률·100점 점수·임의 가중합을 사용하지 않는다. 이 정렬 규칙은 서비스의 초기 정책이지 논문에서 검증된 점수 공식이 아니다. 개인 취향·날씨·구매 범용성은 이번 평가에 포함하지 않는다.

연구에서 참고한 것은 유사성과 호환성의 구분, 여러 옷을 함께 평가하는 구조다. 해당 논문의 모델을 재현하거나 성능을 이전한 것은 아니다.

- [ECCV 2018, Learning Type-Aware Embeddings](https://www.ecva.net/papers/eccv_2018/papers_ECCV/html/Mariya_Vasileva_Learning_Type-Aware_Embeddings_ECCV_2018_paper.php): 유사 의류와 서로 어울리는 의류를 구분하는 근거.
- [WACV 2023, OutfitTransformer](https://openaccess.thecvf.com/content/WACV2023/papers/Sarkar_OutfitTransformer_Learning_Outfit_Representations_for_Fashion_Recommendation_WACV_2023_paper.pdf): 코디 전체 관계를 고려하는 근거.
- [CVPR 2021 Workshops, Modeling Fashion Compatibility With Explanation](https://openaccess.thecvf.com/content/CVPR2021W/CVFAD/papers/Kaicheng_Modeling_Fashion_Compatibility_With_Explanation_by_Using_Bidirectional_LSTM_CVPRW_2021_paper.pdf): 속성과 판단 이유를 연결하는 설명 항목 참고.
- [llama.cpp 공식 서버 문서](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md): JSON 스키마 제한 출력을 사용해 구조를 고정했다. 형식 준수는 내용 정확도를 보장하지 않는다.

## 검증 결과

- Next.js 프로덕션 빌드와 실제 Chromium 브라우저에서 로그인 없는 데모 **6개**, 내 옷장 **6개**를 실제 GPU로 평가했다.
- 데모 6개: 브라우저 버튼 처리부터 API 응답 검증 완료까지 **17.092초**, Python의 순차 평가 구간 **16.797초**. 모델 로딩·첫 페이지 로딩·후속 화면 페인트는 이 시간에 포함되지 않는다. 단회 결과이며 운영 환경의 p95를 의미하지 않는다.
- 데모에서 조화로움 3개, 확인 필요 3개가 반환됐다. 상황 부적합 2개가 포함됐다. 이는 모델의 출력 분포이며 정답률이 아니다.
- 내 옷장에서는 고정한 셔츠가 모든 후보에 들어가고 제외한 바지는 모든 후보에서 빠진 것을 요청 본문으로 확인했다. GPU 평가 구간은 **15.546초**였다. 좋아요 저장도 확인했다.
- 상황 변경 시 이전 평가 제거, 데모가 localStorage를 변경하지 않음, 390px 모바일에서 가로 넘침 없음, 잘못된 API 요청 400, 주입한 503에서 가짜 평가 미표시를 검증했다. 브라우저 런타임 오류는 없었다.
- 하의·신발 등록은 예시 슬랙스가 `trousers`, 스니커즈가 `sneakers`로 반환되는 것을 실제 GPU로 확인했다. 원단 등의 부가 속성 정확도까지 검증한 것은 아니다.
- 기존 등록 5장 자동 입력·수정·저장·새로고침·오류 재시도 검증도 통과했다.
- JavaScript 회귀/로직 테스트 **15개**, Python 경계 테스트 **5개**, 타입 검사와 프로덕션 빌드가 통과했다. 한 명령 데모의 웹/GPU 준비·종료 점검도 통과했다.

실행 원문은 [OUTFIT_AI_DEMO_RUN.json](OUTFIT_AI_DEMO_RUN.json), 스크린샷은 로컬 `test-results/outfit-demo-desktop.png`, `test-results/outfit-demo-mobile.png`에 있다. 사진이 포함된 스크린샷은 Git에서 제외한다.

**품질 검증은 다음 단계다.** 이번 검증은 실제 모델 실행과 UI 동작 검증이다. 모델이 사진 속 형태를 과하게 해석하거나 색상·옷 종류를 잘못 설명할 수 있다. 전문가·사용자의 블라인드 비교로 판단과 설명의 정확성을 평가하기 전에는 ‘패션 정답’이나 검증된 추천 성능으로 소개하지 않는다. 범용성·대체 가능성·개인화는 아직 구현하지 않았다.

## 재현

```powershell
# 프로덕션 웹 검증: GPU와 웹을 별도 터미널에서 실행
npm run gpu
npm run build
npm start -- --hostname 127.0.0.1
# 다른 터미널
npm run test:outfits
npm run test:gpu-web
npm test
../wardrobe-desktop-handoff/.venv/Scripts/python.exe scripts/test_outfit_evaluation.py
../wardrobe-desktop-handoff/.venv/Scripts/python.exe scripts/test_gpu_attributes.py
```
