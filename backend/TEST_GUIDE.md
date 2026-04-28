# API 테스트 가이드

## 테스트 실행 방법

### 1. 전체 테스트 실행
```bash
python backend/test_api.py
```

### 2. 상세 출력과 함께 실행
```bash
python backend/test_api.py -v
```

## 테스트 구성

### 공구 피드 목록 조회 API 테스트 (18개)

#### 기본 기능
- `test_get_group_buys_default`: 기본 요청 검증
- `test_get_group_buys_response_structure`: 응답 데이터 구조 검증

#### 페이징
- `test_get_group_buys_pagination`: 페이징 기능 검증
- `test_get_group_buys_page_2`: 페이지 2 요청 검증
- `test_get_group_buys_invalid_page`: 범위 초과 페이지 요청 검증

#### 정렬
- `test_get_group_buys_sort_latest`: 최신순 정렬 검증
- `test_get_group_buys_sort_popular`: 실시간 인기순 정렬 검증

#### 검색
- `test_get_group_buys_keyword_search`: 키워드 검색 검증
- `test_get_group_buys_keyword_no_match`: 검색 결과 없음 검증

#### 파라미터 유효성
- `test_get_group_buys_size_limit`: 페이지 크기 제한 검증
- `test_get_group_buys_size_invalid`: 잘못된 페이지 크기 검증

#### 데이터 계산
- `test_get_group_buys_achievement_rate`: 달성률 계산 검증
- `test_get_group_buys_time_ago_format`: 경과 시간 포맷 검증

#### 필터링 및 엣지 케이스
- `test_get_group_buys_only_recruiting`: 진행 중인 공구만 반환 검증
- `test_get_group_buys_empty_result`: 빈 결과 반환 검증
- `test_get_group_buys_pagination_info`: 페이지네이션 정보 검증

### 굿즈 상세 조회 API 테스트 (7개)

#### 기본 기능
- `test_get_group_buy_detail_success`: 상세 조회 성공 검증
- `test_get_group_buy_detail_response_structure`: 응답 구조 검증

#### 에러 처리
- `test_get_group_buy_detail_not_found`: 404 에러 검증

#### 조회수 추적
- `test_get_group_buy_detail_view_count_increment`: 조회수 증가 검증

#### 데이터 계산
- `test_get_group_buy_detail_achievement_rate`: 달성률 계산 검증

#### 이미지 및 디자이너 정보
- `test_get_group_buy_detail_image_urls_array`: 이미지 배열 검증
- `test_get_group_buy_detail_designer_info`: 디자이너 정보 검증

## 테스트 결과 해석

### 성공 (OK)
```
Ran 38 tests in 0.006s

OK
```
모든 테스트가 통과했습니다.

### 실패 (FAILED)
```
FAILED (failures=1, errors=2)
```
실패한 테스트가 있습니다. 상세 메시지를 확인하세요.

## 테스트 커버리지

### 공구 피드 목록 조회 API
- ✅ 기본 요청 및 응답 구조
- ✅ 페이징 (page, size)
- ✅ 정렬 (latest, popular)
- ✅ 검색 (keyword)
- ✅ 파라미터 유효성 검사
- ✅ 달성률 계산
- ✅ 경과 시간 포맷
- ✅ 진행 중인 공구만 필터링
- ✅ 빈 결과 처리

### 굿즈 상세 조회 API
- ✅ 상세 정보 조회
- ✅ 응답 데이터 구조
- ✅ 404 에러 처리
- ✅ 조회수 자동 증가
- ✅ 달성률 계산
- ✅ 이미지 배열 처리
- ✅ 디자이너 정보 포함

## 주요 테스트 케이스

### 1. 페이징 테스트
```python
# 페이지 1, 크기 2
status, response = handle_api("GET", "/api/group-buys", {}, {
    "page": ["1"],
    "size": ["2"]
})
assert len(response["data"]) == 2
```

### 2. 정렬 테스트
```python
# 실시간 인기순
status, response = handle_api("GET", "/api/group-buys", {}, {
    "sort": ["popular"]
})
# 좋아요 + 댓글 수 기준으로 정렬됨
```

### 3. 검색 테스트
```python
# 키워드 검색
status, response = handle_api("GET", "/api/group-buys", {}, {
    "keyword": ["후리스"]
})
assert "후리스" in response["data"][0]["title"]
```

### 4. 조회수 증가 테스트
```python
# 첫 번째 조회
status1, _ = handle_api("GET", f"/api/group-buys/{project_id}", {}, {})
views_after_first = DATA["group_buys"][0].get("viewCount", 0)

# 두 번째 조회
status2, _ = handle_api("GET", f"/api/group-buys/{project_id}", {}, {})
views_after_second = DATA["group_buys"][0].get("viewCount", 0)

assert views_after_second == views_after_first + 1
```

### 5. 404 에러 테스트
```python
# 존재하지 않는 상품
status, response = handle_api("GET", "/api/group-buys/invalid-id", {}, {})
assert status == 404
assert "삭제" in response["error"]
```

## 테스트 데이터

테스트는 `init_sample_data()`로 초기화된 샘플 데이터를 사용합니다:
- 4개의 공구 아이템
- 각 아이템은 필수 필드 모두 포함
- 다양한 달성률 (45%, 80%, 120%, 200%)
- 다양한 생성 시간 (방금 전, 1시간 전, 5시간 전, 1일 전)

## 자동화 테스트 (CI/CD)

### GitHub Actions 예시
```yaml
name: API Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-python@v2
        with:
          python-version: '3.9'
      - run: python backend/test_api.py
```

## 문제 해결

### 테스트 실패 시
1. 에러 메시지 확인
2. 해당 테스트 함수 검토
3. `server.py`의 해당 API 함수 확인
4. 샘플 데이터 초기화 상태 확인

### 조회수 테스트 실패
- `setUp()`에서 데이터가 제대로 초기화되는지 확인
- `viewCount` 필드가 모든 아이템에 포함되는지 확인

### 정렬 테스트 실패
- 샘플 데이터의 `likeCount`, `commentCount` 값 확인
- 정렬 로직이 올바르게 구현되었는지 확인


### 공구 참여 예약 API 테스트 (13개)

#### 기본 기능
- `test_create_reservation_success`: 예약 생성 성공 검증
- `test_create_reservation_response_structure`: 응답 구조 검증

#### 중복 참여 방지
- `test_create_reservation_duplicate_prevention`: 중복 참여 방지 검증

#### 인증 및 에러 처리
- `test_create_reservation_no_auth`: 인증 없이 예약 시도 검증
- `test_create_reservation_project_not_found`: 존재하지 않는 상품 예약 검증

#### 달성률 기반 상태 관리
- `test_create_reservation_achievement_rate_cancellable`: 달성률 100% 미만 (CANCELLABLE) 검증
- `test_create_reservation_achievement_rate_non_cancellable`: 달성률 100% 이상 (NON_CANCELLABLE) 검증

#### 옵션 및 수량
- `test_create_reservation_with_options`: 옵션과 함께 예약 검증

#### 데이터 계산 및 저장
- `test_create_reservation_achievement_rate_calculation`: 달성률 계산 검증
- `test_create_reservation_multiple_users`: 여러 사용자 예약 검증
- `test_create_reservation_stored_data`: 예약 데이터 저장 검증

## 전체 테스트 통계

| 항목 | 수치 |
|------|------|
| 총 테스트 | 38개 |
| 피드 API | 18개 |
| 상세 API | 7개 |
| 예약 API | 13개 |
| 통과율 | 100% |

## 예약 API 테스트 상세

### 1. 예약 생성 성공
```python
def test_create_reservation_success(self):
    project_id = DATA["group_buys"][0]["id"]
    original_people = DATA["group_buys"][0]["currentPeople"]
    
    status, response = handle_api("POST", f"/api/group-buys/{project_id}/reservations", {}, {
        "token": [self.test_token]
    })
    
    assert status == 201
    assert "reservationId" in response
    assert DATA["group_buys"][0]["currentPeople"] == original_people + 1
```

### 2. 중복 참여 방지
```python
def test_create_reservation_duplicate_prevention(self):
    project_id = DATA["group_buys"][0]["id"]
    
    # 첫 번째 예약 - 성공
    status1, _ = handle_api("POST", f"/api/group-buys/{project_id}/reservations", {}, {
        "token": [self.test_token]
    })
    assert status1 == 201
    
    # 두 번째 예약 - 실패
    status2, response2 = handle_api("POST", f"/api/group-buys/{project_id}/reservations", {}, {
        "token": [self.test_token]
    })
    assert status2 == 400
    assert "이미" in response2["error"]
```

### 3. 달성률 기반 상태 관리
```python
def test_create_reservation_achievement_rate_cancellable(self):
    # 달성률 < 100%인 상품 찾기
    project = next((i for i in DATA["group_buys"] 
                   if (i["currentPeople"] / i["minPeople"]) * 100 < 100), None)
    
    if project:
        status, _ = handle_api("POST", f"/api/group-buys/{project['id']}/reservations", {}, {
            "token": [self.test_token]
        })
        
        assert status == 201
        reservation = DATA["reservations"][-1]
        assert reservation["status"] == "CANCELLABLE"
```

### 4. 옵션과 함께 예약
```python
def test_create_reservation_with_options(self):
    project_id = DATA["group_buys"][0]["id"]
    
    status, response = handle_api("POST", f"/api/group-buys/{project_id}/reservations", {
        "options": {"사이즈": "M", "색상": "블랙"},
        "quantity": 2
    }, {
        "token": [self.test_token]
    })
    
    assert status == 201
    reservation = DATA["reservations"][-1]
    assert reservation["options"]["사이즈"] == "M"
    assert reservation["quantity"] == 2
```

## 테스트 실행 결과 예시

```
Ran 38 tests in 0.006s

OK
```

### 테스트 분류별 결과
- ✅ 공구 피드 목록 조회: 18개 통과
- ✅ 굿즈 상세 조회: 7개 통과
- ✅ 공구 참여 예약: 13개 통과

## 주요 테스트 시나리오

### 시나리오 1: 정상 예약 플로우
1. 사용자 인증 (토큰 생성)
2. 상품 조회
3. 예약 생성
4. 달성률 업데이트 확인
5. 예약 상태 확인 (CANCELLABLE/NON_CANCELLABLE)

### 시나리오 2: 중복 참여 방지
1. 첫 번째 예약 성공
2. 두 번째 예약 시도
3. 400 에러 반환 확인
4. 에러 메시지 확인

### 시나리오 3: 달성률 기반 상태 관리
1. 달성률 < 100% 상품에 예약
2. 상태가 CANCELLABLE인지 확인
3. 달성률 ≥ 100% 상품에 예약
4. 상태가 NON_CANCELLABLE인지 확인

### 시나리오 4: 여러 사용자 예약
1. 사용자 A 예약
2. 사용자 B 예약
3. currentPeople 2 증가 확인
4. 두 예약 모두 저장 확인
