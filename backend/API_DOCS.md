# 공구 피드 목록 조회 API

## 엔드포인트
```
GET /api/group-buys
```

## 요청 (Request)

### Query Parameters

| 파라미터 | 타입 | 기본값 | 설명 |
|---------|------|-------|------|
| `page` | number | 1 | 페이지 번호 (1부터 시작) |
| `size` | number | 10 | 페이지 크기 (1~50) |
| `sort` | string | latest | 정렬 기준 (`latest`: 최신순, `popular`: 실시간 인기순) |
| `keyword` | string | - | 검색 키워드 (제목, 설명에서 검색) |

### 요청 예시
```bash
# 기본 요청 (최신순, 페이지 1, 10개)
GET /api/group-buys

# 페이지 2, 20개씩
GET /api/group-buys?page=2&size=20

# 실시간 인기순
GET /api/group-buys?sort=popular

# 키워드 검색
GET /api/group-buys?keyword=후리스

# 조합
GET /api/group-buys?page=1&size=15&sort=popular&keyword=국민대
```

## 응답 (Response)

### 성공 응답 (200 OK)

```json
{
  "data": [
    {
      "projectId": "550e8400-e29b-41d4-a716-446655440000",
      "thumbnailUrl": "https://picsum.photos/seed/fleece1/400/400",
      "title": "국민대학교 실시간 인기 순 후리스",
      "deliveryType": "캠퍼스 내 직수령",
      "timeAgo": "1시간 전",
      "price": 35000,
      "achievementRate": 120,
      "commentCount": 34,
      "likeCount": 142
    },
    {
      "projectId": "550e8400-e29b-41d4-a716-446655440001",
      "thumbnailUrl": "https://picsum.photos/seed/jacket1/400/400",
      "title": "국민대학교 블랙 크롭탑 공구",
      "deliveryType": "캠퍼스 내 직수령",
      "timeAgo": "3시간 전",
      "price": 18000,
      "achievementRate": 80,
      "commentCount": 12,
      "likeCount": 85
    }
  ],
  "pagination": {
    "page": 1,
    "size": 10,
    "total": 4,
    "totalPages": 1
  }
}
```

### 응답 필드 설명

| 필드 | 타입 | 설명 |
|------|------|------|
| `projectId` | string | 공구 프로젝트 고유 ID (상세 페이지 이동 시 사용) |
| `thumbnailUrl` | string | 상품 썸네일 이미지 URL |
| `title` | string | 공구 제목 |
| `deliveryType` | string | 수령 방식 (예: "캠퍼스 내 직수령") |
| `timeAgo` | string | 등록 경과 시간 (예: "1시간 전", "3일 전") |
| `price` | number | 상품 가격 (원) |
| `achievementRate` | number | 공구 달성률 (%) - 현재 참여자 / 최소 인원 × 100 |
| `commentCount` | number | 달린 댓글 수 |
| `likeCount` | number | 좋아요 수 |

### Pagination 필드 설명

| 필드 | 타입 | 설명 |
|------|------|------|
| `page` | number | 현재 페이지 번호 |
| `size` | number | 페이지 크기 |
| `total` | number | 전체 아이템 수 |
| `totalPages` | number | 전체 페이지 수 |

## 엣지 케이스 처리

### 1. 등록된 공구가 없을 경우
```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "size": 10,
    "total": 0,
    "totalPages": 0
  }
}
```

### 2. 진행 중인 공구만 노출
- `status == "모집중"`인 공구만 응답에 포함됩니다
- 마감되었거나 완료된 공구는 자동으로 필터링됩니다

### 3. 페이지 범위 초과
- 요청한 페이지가 범위를 초과하면 빈 배열을 반환합니다
- 예: 전체 3페이지인데 page=5 요청 시 `data: []` 반환

### 4. 잘못된 파라미터
- `size > 50`: 자동으로 10으로 조정
- `size < 1`: 자동으로 10으로 조정
- `page < 1`: 자동으로 1로 조정

## 정렬 기준

### latest (최신순, 기본값)
- 등록 시간 기준 내림차순
- 가장 최근에 등록된 공구가 맨 위에 표시

### popular (실시간 인기순)
- (좋아요 수 + 댓글 수) 기준 내림차순
- 사용자 상호작용이 많은 공구가 우선 표시

## 사용 예시

### JavaScript/Fetch
```javascript
// 기본 요청
const response = await fetch('/api/group-buys');
const { data, pagination } = await response.json();

// 페이지 2, 실시간 인기순
const response = await fetch('/api/group-buys?page=2&sort=popular');
const { data, pagination } = await response.json();

// 검색
const response = await fetch('/api/group-buys?keyword=후리스&sort=popular');
const { data, pagination } = await response.json();
```

### React 무한 스크롤 예시
```javascript
const [items, setItems] = useState([]);
const [page, setPage] = useState(1);
const [hasMore, setHasMore] = useState(true);

const loadMore = async () => {
  const response = await fetch(`/api/group-buys?page=${page}&size=10`);
  const { data, pagination } = await response.json();
  
  setItems(prev => [...prev, ...data]);
  setPage(prev => prev + 1);
  setHasMore(page < pagination.totalPages);
};
```

## 주의사항

1. **대학교 필터링**: 현재는 국민대학교만 지원합니다
2. **인증**: 현재 버전에서는 인증이 필요하지 않습니다
3. **CORS**: 모든 출처에서 접근 가능합니다
4. **캐싱**: 응답은 캐싱되지 않으므로 매번 최신 데이터를 받습니다


---

# 굿즈 상세 조회 API

## 엔드포인트
```
GET /api/group-buys/{projectId}
```

## 요청 (Request)

### Path Parameters

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `projectId` | string | 공구 프로젝트 고유 ID |

### 요청 예시
```bash
# 기본 요청
GET /api/group-buys/550e8400-e29b-41d4-a716-446655440000
```

## 응답 (Response)

### 성공 응답 (200 OK)

```json
{
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "imageUrls": [
    "https://picsum.photos/seed/fleece1/400/400",
    "https://picsum.photos/seed/fleece2/400/400",
    "https://picsum.photos/seed/fleece3/400/400",
    "https://picsum.photos/seed/fleece4/400/400",
    "https://picsum.photos/seed/fleece5/400/400"
  ],
  "achievementRate": 140,
  "designer": {
    "profileImageUrl": "https://picsum.photos/seed/designer1/100/100",
    "nickname": "도팅디자이너",
    "department": "국민대학교 디자인학부"
  },
  "title": "국민대학교 실시간 인기 순 후리스",
  "price": 35000,
  "description": "2025년 신규 디자인 국민대 로고 후리스입니다. 따뜻하고 세련된 디자인!",
  "isLiked": false,
  "deliveryType": "캠퍼스 내 직수령",
  "deadline": "2026-04-30",
  "minPeople": 30,
  "currentPeople": 42,
  "commentCount": 34,
  "likeCount": 142,
  "viewCount": 1,
  "options": [
    {
      "name": "사이즈",
      "values": ["S", "M", "L", "XL"]
    }
  ]
}
```

### 응답 필드 설명

| 필드 | 타입 | 설명 |
|------|------|------|
| `projectId` | string | 공구 프로젝트 고유 ID |
| `imageUrls` | array | 상품 상세 이미지 URL 배열 (여러 장 지원) |
| `achievementRate` | number | 현재 펀딩 달성률 (%) |
| `designer` | object | 디자이너 정보 객체 |
| `designer.profileImageUrl` | string | 디자이너 프로필 사진 URL |
| `designer.nickname` | string | 디자이너 이름 (예: "도팅디자이너") |
| `designer.department` | string | 디자이너 소속 (예: "국민대학교 디자인학부") |
| `title` | string | 굿즈 전체 이름 |
| `price` | number | 상품 가격 (원) |
| `description` | string | 굿즈 상세 설명 텍스트 |
| `isLiked` | boolean | 현재 사용자의 좋아요 여부 |
| `deliveryType` | string | 수령 방식 |
| `deadline` | string | 펀딩 마감 날짜 |
| `minPeople` | number | 최소 인원 |
| `currentPeople` | number | 현재 참여 인원 |
| `commentCount` | number | 댓글 수 |
| `likeCount` | number | 좋아요 수 |
| `viewCount` | number | 조회수 |
| `options` | array | 상품 옵션 배열 |

### 에러 응답 (404 Not Found)

```json
{
  "error": "삭제된 굿즈입니다"
}
```

## 주요 기능

### 1. 이미지 갤러리
- `imageUrls` 배열로 여러 장의 이미지 제공
- 프론트에서 "1/5" 형식으로 표시 가능
- 각 URL은 유효한 이미지 주소

### 2. 디자이너 정보
- 별도의 `designer` 객체로 구조화
- 프로필 이미지, 이름, 소속 정보 포함
- 프론트에서 디자이너 카드 렌더링 용이

### 3. 달성률 계산
- 자동으로 계산되어 반환 (현재 인원 / 최소 인원 × 100)
- 100% 이상도 가능 (목표 초과 달성)

### 4. 조회수 추적
- API 호출 시마다 `viewCount` 자동 증가
- 나중에 '인기순' 정렬 시 활용 가능

### 5. 좋아요 상태
- `isLiked`: 현재 사용자가 좋아요를 눌렀는지 여부
- 향후 사용자 인증 추가 시 개인화 가능

## 엣지 케이스 처리

### 1. 존재하지 않는 상품
```json
{
  "error": "삭제된 굿즈입니다"
}
```
- HTTP 상태 코드: 404
- 명확한 에러 메시지로 프론트에서 UI 처리 용이

### 2. 조회수 증가
- 매 API 호출 시 `viewCount` 1씩 증가
- 중복 조회도 모두 카운트 (실제 조회수 추적)

### 3. 이미지 배열
- 최소 1개 이상의 이미지 URL 보장
- 빈 배열 반환 안 함

## 사용 예시

### JavaScript/Fetch
```javascript
// 상세 조회
const projectId = '550e8400-e29b-41d4-a716-446655440000';
const response = await fetch(`/api/group-buys/${projectId}`);

if (response.status === 404) {
  alert('삭제된 굿즈입니다');
} else {
  const data = await response.json();
  console.log(data.designer.nickname);
  console.log(data.imageUrls.length); // 이미지 개수
}
```

### React 상세 페이지 예시
```javascript
const [product, setProduct] = useState(null);
const [loading, setLoading] = useState(true);

useEffect(() => {
  const fetchDetail = async () => {
    const response = await fetch(`/api/group-buys/${projectId}`);
    
    if (response.status === 404) {
      setProduct(null);
    } else {
      const data = await response.json();
      setProduct(data);
    }
    setLoading(false);
  };
  
  fetchDetail();
}, [projectId]);

if (loading) return <div>로딩 중...</div>;
if (!product) return <div>삭제된 굿즈입니다</div>;

return (
  <div>
    <ImageGallery images={product.imageUrls} />
    <DesignerCard designer={product.designer} />
    <h1>{product.title}</h1>
    <p>{product.price}원</p>
    <p>달성률: {product.achievementRate}%</p>
  </div>
);
```

## 주의사항

1. **조회수 추적**: 매 요청마다 조회수가 증가하므로, 프론트에서 중복 요청 방지 필요
2. **이미지 URL**: 모든 URL이 유효한지 확인 필요
3. **디자이너 정보**: 필수 필드이므로 항상 포함됨
4. **좋아요 상태**: 현재는 고정값이지만, 향후 사용자 인증 추가 시 동적으로 변경 가능


---

# 공구 참여 예약 API

## 엔드포인트
```
POST /api/group-buys/{projectId}/reservations
```

## 요청 (Request)

### Path Parameters

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `projectId` | string | 공구 프로젝트 고유 ID |

### Query Parameters

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `token` | string | ✅ | 인증 토큰 (로그인 후 받은 토큰) |

### Request Body

```json
{
  "options": {
    "사이즈": "M",
    "색상": "블랙"
  },
  "quantity": 1
}
```

### Body 필드 설명

| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|-------|------|
| `options` | object | ❌ | {} | 선택한 옵션 (확장 가능) |
| `quantity` | number | ❌ | 1 | 수량 |

### 요청 예시

```bash
# 기본 요청
curl -X POST http://localhost:3000/api/group-buys/550e8400-e29b-41d4-a716-446655440000/reservations \
  -H "Content-Type: application/json" \
  -d '{}' \
  -G --data-urlencode "token=test-token-12345"

# 옵션과 함께 요청
curl -X POST http://localhost:3000/api/group-buys/550e8400-e29b-41d4-a716-446655440000/reservations \
  -H "Content-Type: application/json" \
  -d '{
    "options": {"사이즈": "M", "색상": "블랙"},
    "quantity": 2
  }' \
  -G --data-urlencode "token=test-token-12345"
```

## 응답 (Response)

### 성공 응답 (201 Created)

```json
{
  "reservationId": "550e8400-e29b-41d4-a716-446655440100",
  "currentAchievementRate": 145,
  "status": "success",
  "message": "예약이 완료되었습니다"
}
```

### 응답 필드 설명

| 필드 | 타입 | 설명 |
|------|------|------|
| `reservationId` | string | 생성된 예약의 고유 ID |
| `currentAchievementRate` | number | 예약 반영 후의 최신 달성률 (%) |
| `status` | string | 응답 상태 ("success") |
| `message` | string | 응답 메시지 |

### 에러 응답

#### 400 Bad Request - 중복 참여
```json
{
  "error": "이미 이 상품에 참여했습니다"
}
```

#### 401 Unauthorized - 인증 실패
```json
{
  "error": "인증이 필요합니다"
}
```

#### 404 Not Found - 상품 없음
```json
{
  "error": "상품을 찾을 수 없습니다"
}
```

## 핵심 비즈니스 로직

### 1. 중복 참여 방지
- 한 사용자는 같은 상품에 **1회만** 참여 가능
- 중복 참여 시도 시 400 에러 반환
- 에러 메시지: "이미 이 상품에 참여했습니다"

### 2. 달성률 기반 상태 관리

#### CANCELLABLE (취소 가능)
- 달성률 < 100%일 때 예약 생성
- 사용자가 예약을 취소할 수 있음
- 프론트에서 "취소" 버튼 활성화

#### NON_CANCELLABLE (취소 불가능)
- 달성률 ≥ 100%일 때 예약 생성
- 사용자가 예약을 취소할 수 없음
- 프론트에서 "취소" 버튼 비활성화
- 경고 메시지: "달성률이 100%가 되기 전에는 취소 가능, 이후로는 취소 불가능"

### 3. 달성률 계산
```
달성률 = (현재 참여자 수 / 최소 인원) × 100
```

예시:
- 최소 인원: 30명
- 현재 참여자: 42명
- 달성률: (42 / 30) × 100 = 140%

### 4. 예약 데이터 구조

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440100",
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "userEmail": "sample@kookmin.ac.kr",
  "options": {
    "사이즈": "M",
    "색상": "블랙"
  },
  "quantity": 1,
  "status": "CANCELLABLE",
  "achievementRateAtReservation": 140,
  "createdAt": 1713000000000
}
```

## 사용 예시

### JavaScript/Fetch
```javascript
// 예약 생성
const projectId = '550e8400-e29b-41d4-a716-446655440000';
const token = 'test-token-12345';

const response = await fetch(
  `/api/group-buys/${projectId}/reservations?token=${token}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      options: { '사이즈': 'M' },
      quantity: 1
    })
  }
);

if (response.status === 201) {
  const data = await response.json();
  console.log('예약 ID:', data.reservationId);
  console.log('새 달성률:', data.currentAchievementRate);
} else if (response.status === 400) {
  alert('이미 참여한 상품입니다');
} else if (response.status === 401) {
  alert('로그인이 필요합니다');
}
```

### React 예약 버튼 예시
```javascript
const [isReserving, setIsReserving] = useState(false);

const handleReservation = async () => {
  setIsReserving(true);
  
  try {
    const response = await fetch(
      `/api/group-buys/${projectId}/reservations?token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          options: selectedOptions,
          quantity: 1
        })
      }
    );
    
    if (response.status === 201) {
      const data = await response.json();
      
      // 달성률 업데이트
      setAchievementRate(data.currentAchievementRate);
      
      // 취소 가능 여부 판단
      const isCancellable = data.currentAchievementRate < 100;
      setCanCancel(isCancellable);
      
      alert('예약이 완료되었습니다!');
    } else if (response.status === 400) {
      alert('이미 이 상품에 참여했습니다');
    }
  } finally {
    setIsReserving(false);
  }
};
```

## 주의사항

1. **인증 필수**: 모든 요청에 유효한 토큰 필요
2. **중복 방지**: 같은 사용자의 중복 참여 불가
3. **달성률 기반 상태**: 예약 생성 시점의 달성률로 상태 결정
4. **옵션 확장성**: 향후 옵션 추가 시 options 객체에 자유롭게 추가 가능
5. **수량 지원**: 현재는 1개씩만 지원하지만, quantity 필드로 확장 가능

## 플로우 다이어그램

```
사용자가 "DOO(참여)" 버튼 클릭
    ↓
경고창 표시 ("달성률이 100%가 되기 전에는 취소 가능...")
    ↓
사용자가 "확인" 클릭
    ↓
POST /api/group-buys/{projectId}/reservations
    ↓
인증 확인 (토큰 검증)
    ↓
중복 참여 확인
    ↓
달성률 계산 (현재 상태)
    ↓
예약 상태 결정 (CANCELLABLE / NON_CANCELLABLE)
    ↓
예약 저장
    ↓
currentPeople 증가
    ↓
새 달성률 계산
    ↓
201 응답 반환
    ↓
프론트에서 달성률 업데이트 및 취소 버튼 상태 변경
```

## 테스트 케이스

- ✅ 예약 생성 성공
- ✅ 중복 참여 방지
- ✅ 인증 실패 처리
- ✅ 상품 없음 처리
- ✅ 달성률 100% 미만 (CANCELLABLE)
- ✅ 달성률 100% 이상 (NON_CANCELLABLE)
- ✅ 옵션과 함께 예약
- ✅ 응답 구조 검증
- ✅ 달성률 계산 검증
- ✅ 여러 사용자 예약
- ✅ 예약 데이터 저장 검증
