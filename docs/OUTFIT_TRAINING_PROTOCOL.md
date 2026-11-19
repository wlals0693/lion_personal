# 코디 적합도 학습 실험 — 2026-11-18

## 현재 상태

공식 Polyvore 접근 인증·disjoint 데이터 다운로드·특징 추출·정제·실제 GPU 학습 및 보류 테스트 평가를 완료했다. [실행 결과 보고서](OUTFIT_TRAINING_LOCAL_REPORT.md)에 결과와 한계를 정리했다. 분류 성능은 개선됐으나 FITB 추천 성능과 seed 안정성이 부족해 현재 웹은 기존 Qwen 프롬프트 평가를 유지한다. 기존 60장에는 종류·소매 라벨만 있으며 코디 궁합 정답이 없다. Qwen 판단을 정답으로 복제하거나 임의의 조합을 실제 부적합 정답이라고 주장하지 않는다.

## 접근 신청

1. [공식 Polyvore 페이지](https://huggingface.co/datasets/mvasil/polyvore-outfits)에 본인 계정으로 로그인한다.
2. 접근 요청 양식을 확인하고 실제 사용 목적·소속을 기입한다. 데이터 카드는 기관/연구 관련 이메일과 학술·비영리 연구 목적을 안내한다. 없는 소속을 만들지 않는다.
3. 카드의 접근 조건과 CC BY 4.0 안내가 함께 있으므로 제품 적용 권한은 제공자에게 확인한다. 연구 실험 허용이 상업적 이미지 권리 확보를 의미하지 않는다.
4. 승인되면 로컬 Hugging Face 로그인 또는 승인된 데이터 경로를 연결한다. 토큰을 채팅·소스 코드·Git에 넣지 않는다. 계정 생성·접근 신청을 대리 제출하지 않았다.

확인하고 다운로드한 공식 저장소 revision: `22cc0c748c293a598e1df561a76abe96273cb76a`, API gated=`auto`. disjoint train/validation/test parquet 및 compatibility/FITB 문항 등 15개 파일을 받았다. 토큰은 `.env.local`에서만 읽고 로그에 출력하지 않는다. 데이터·가상환경·가중치는 Git에서 제외한다.

## 모델과 평가 설계

- [ECCV 2018 Type-Aware Embeddings](https://github.com/mvasil/fashion-compatibility): 실제 서로 다른 종류 사이의 궁합을 학습하는 기준 모델. 공개된 nondisjoint 가중치 성능을 disjoint 성능처럼 보고하지 않는다.
- [WACV 2023 OutfitTransformer](https://openaccess.thecvf.com/content/WACV2023/html/Sarkar_OutfitTransformer_Learning_Outfit_Representations_for_Fashion_Recommendation_WACV_2023_paper.html): 여러 아이템의 관계를 함께 학습하는 구조의 근거. 우선 동결된 이미지 인코더와 작은 Transformer 궁합 헤드로 RTX 3070 Ti 실험을 설계한다. 이는 경량 변형이며 논문의 전체 학습 절차 재현으로 부르지 않는다. 정확한 아키텍처·파라미터·이미지 인코더 가중치 출처는 실행 전에 설정으로 확정한다.
- 순서: 단순 카테고리/이미지 임베딩 기준 모델 → 궁합 학습 모델 → 동일한 보류 데이터의 Qwen 비교. 초기에는 시각적 궁합만 학습한다. 상황 적합성·개인 취향·설명 정확성은 별도 과제다.

## 과적합과 누수 방지

1. 공식 **disjoint** 분할을 시작점으로 사용한다. 아이템 ID뿐 아니라 원본 파일·EXIF 정규화 후 RGB 픽셀 해시와 동일 의류 그룹까지 점검한다. 크롭/리사이즈 유사 이미지는 추가 근접 중복 검사와 수동 검토가 필요하다. 누수가 발견되면 연결된 의류 그룹 전체를 제거/재분할하고 원본 대비 차이를 기록한다.
2. 기존 개인 사진 60장은 외부 점검용으로 보류한다. 이미 개발 과정에 사용됐으므로 독립 최종 테스트셋이라고 부르지 않는다. 실제 사용자 영역 성능은 새 옷·새 코디의 사람 평가로 추가 검증한다.
3. 부정 예제는 분할 내부에서만 구성한다. 같은 종류로 교체한 어려운 부정 예제를 포함하되, 무작위 교체가 반드시 미적으로 나쁘다는 뜻은 아니므로 합성 라벨의 한계를 명시한다. 공식 평가 문항과 프로젝트 생성 문항은 분리 보고한다.
4. 이미지 인코더를 우선 동결하고 작은 헤드만 학습한다. 초기 탐색 후보: dropout 0.1/0.3, weight decay 0.01/0.1, 최대 30 epoch, validation loss 개선이 5회 없으면 중지. 이 수치는 프로젝트 초기 설정이며 논문의 보편 기준이 아니다.
5. 하이퍼파라미터는 validation으로만 선택한다. 주 실험 seed 42를 고정하고 seed 43/44로 안정성을 확인한다. 최고 validation 체크포인트와 매 epoch train/validation loss를 보존한다. 테스트 결과를 보고 재조정하면 새 최종 보류셋이 필요하다.
6. ROC-AUC, PR-AUC, FITB 정확도, 카테고리 구성별 성능, train-validation 차이를 보고한다. 코디가 아이템을 공유하므로 신뢰구간은 의류 연결 그룹을 고려한다. 표본이 적거나 그룹이 부족하면 그 한계를 표시한다.
7. 과적합이 없다는 보장은 하지 않는다. 여러 seed에서 기준 모델 대비 개선이 불안정하거나 새 사용자 사진에서 효과가 없으면 웹 추천 모델로 승격하지 않는다. 실제 사용자 평가 없이 점수를 '잘 어울릴 확률'로 표시하지 않는다.

## 추가한 실행 가능한 누수 검사

`training/audit_dataset.py`는 정규화한 로컬 manifest의 중복·분할 누수를 검사하고 실패 시 exit 1을 반환한다. 공개 데이터 parquet 변환기는 데이터 스키마를 실제로 확인한 뒤 작성한다. 빈/가짜 데이터로 학습 성능을 보고하지 않는다.

```json
{
  "items": [{"id": "item-a", "path": "images/a.jpg", "group_id": "physical-garment-a"}],
  "splits": {
    "train": [{"id": "outfit-a", "items": ["item-a", "item-b"], "label": 1}],
    "validation": [],
    "test": []
  }
}
```

위 JSON은 필드 설명용이며 실행 가능한 데이터가 아니다. 실제 입력에는 모든 참조 아이템, 비어 있지 않은 세 분할, 각 분할의 양성·음성 예제가 필요하다.

```powershell
# workspace 루트에서, 기존 Pillow 환경 사용
wardrobe-desktop-handoff/.venv/Scripts/python.exe lion_personal/training/test_audit_dataset.py
wardrobe-desktop-handoff/.venv/Scripts/python.exe lion_personal/training/audit_dataset.py PATH_TO_MANIFEST --output PATH_TO_AUDIT_JSON
```

테스트용 합성 이미지 검사는 학습·모델 품질 검증과 무관하다. `prepare_polyvore.py`가 공식 parquet에서 특징을 추출하고, `train_compatibility.py`가 검증셋 선택과 조기 종료·3개 seed 평가를 실행한다. 웹 연동은 아직 하지 않았다.

## 첫 실행에서 확정한 설정

- 인코더: torchvision ResNet18 `IMAGENET1K_V1`, 동결. 공식 224px 전처리. CUDA fp16 autocast 추출 후 fp32 특징 저장.
- 헤드: 512→128 projection, 학습용 의류 종류 embedding, outfit token, 2개 Transformer encoder 층, 4 heads, FFN 256, dropout 0.3, LayerNorm+linear 이진 분류. 위치 embedding은 사용하지 않는다.
- 분류 손실: BCEWithLogitsLoss. AdamW lr 0.0003, batch 256, 최대 30 epoch, validation BCE 최소 개선 0.0001, patience 5, gradient clip 1.0.
- 탐색 예산: seed42에서 weight decay 0.01/0.1 두 후보만 비교하고 validation BCE로 선택. 선택된 설정만 seed43/44 추가 실행. dropout은 0.3으로 고정해 작은 탐색 예산을 유지한다.
- 카테고리 빈도만 쓰는 logistic 및 이미지 평균·분산을 쓰는 logistic 기준 모델도 평가한다. C=0.01/1.0 선택 역시 validation만 사용한다.
- 원본 분할 사이의 item ID·encoded SHA256·EXIF 정규화 RGB SHA256 충돌을 찾는다. 추가로 dHash와 반올림한 종횡비가 같은 후보도 보수적으로 모든 분할에서 제외한다. 이는 유사 이미지 전체 검출이나 실제 의류 동일성의 증명은 아니다.
- 이전 60장과 이미지/유사 후보가 일치하는 학습 데이터도 제외한다. 정규화된 코디 2–8개 아이템만 사용하며, 동일 아이템 반복·중복 코디·충돌 라벨을 제거한다.
- 검증 선택을 `validation_selection.json`에 기록한 **후** 테스트 평가. `results.json`이 있으면 같은 run의 재튜닝을 차단한다. 해당 결과를 본 후 추가 개발 시 테스트 재사용에 따른 한계를 기록해야 한다.
- FITB는 전용 검색 손실 없이 분류 점수로 네 후보를 비교한다. 논문의 CIR·텍스트 인코더·curriculum 학습 재현은 아니다.

### 검증 단계의 1회 수정 기록

최초 validation-only pilot에서 Transformer의 validation ROC-AUC는 약 0.57로 이미지 pooled logistic 기준 모델 약 0.67보다 낮았다. L2 특징의 작은 좌표별 분산을 그대로 projection에 넣는 구현에 대해, 이미지별 stateless LayerNorm을 추가한 `normalized_visual_v2`로 1회 수정한다. 하이퍼파라미터 후보 수·seed·조기 종료 규칙은 유지한다. 최초 pilot은 `runs/compatibility_01_initial_underfit`에 보존했고 테스트 결과 출력 파일은 생성되지 않았다. 이 수정 결정에서 테스트 성능을 열람하지 않았다. 수정된 모델도 기준 모델을 넘지 못하면 그 결과를 그대로 보고한다.

데이터 정제 중 FITB 답 후보의 의류 ID가 중복된 테스트 문항 11개도 제거했다. 이 정제는 정답/오답 점수에 근거한 필터가 아니라 중복 후보의 모호성 제거다. 정제 후 FITB 테스트는 10,227개다.

```powershell
lion_personal/training/.venv/Scripts/python.exe lion_personal/training/download_polyvore.py
lion_personal/training/.venv/Scripts/python.exe lion_personal/training/prepare_polyvore.py
lion_personal/training/.venv/Scripts/python.exe lion_personal/training/train_compatibility.py
```

환경은 `training/requirements-lock.txt`에 기록했다. CUDA PyTorch는 공식 `https://download.pytorch.org/whl/cu128`에서 설치한다. 코드 테스트는 `python -m unittest discover -s lion_personal/training -p 'test_*.py'`로 실행한다.
