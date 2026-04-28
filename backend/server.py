"""
국민대학교 공동구매·중고거래 플랫폼 - 로컬 백엔드 서버
Python 3 기반, 외부 의존성 없음
"""
import json
import http.server
import urllib.parse
import uuid
import time
import os
import hashlib

# ===== 인메모리 데이터 저장소 =====
DATA = {
    "users": {},          # email -> user info
    "group_buys": [],     # 공동구매 게시글
    "used_trades": [],    # 중고거래 게시글
    "messages": [],       # 쪽지
    "notifications": [],  # 알림
    "sessions": {},       # token -> email
    "reservations": [],   # 공구 참여 예약
}

# 샘플 데이터 초기화
def init_sample_data():
    sample_user = {
        "email": "sample@kookmin.ac.kr",
        "name": "홍길동",
        "studentId": "20210001",
        "password": hashlib.sha256("1234".encode()).hexdigest(),
        "verified": True,
    }
    DATA["users"]["sample@kookmin.ac.kr"] = sample_user

    now = int(time.time() * 1000)
    sample_group_buys = [
        {
            "id": str(uuid.uuid4()),
            "title": "국민대학교 실시간 인기 순 후리스",
            "description": "2025년 신규 디자인 국민대 로고 후리스입니다. 따뜻하고 세련된 디자인!",
            "price": 35000,
            "thumbnailUrl": "https://picsum.photos/seed/fleece1/400/400",
            "image": "https://picsum.photos/seed/fleece1/400/400",
            "imageUrls": [
                "https://picsum.photos/seed/fleece1/400/400",
                "https://picsum.photos/seed/fleece2/400/400",
                "https://picsum.photos/seed/fleece3/400/400",
                "https://picsum.photos/seed/fleece4/400/400",
                "https://picsum.photos/seed/fleece5/400/400",
            ],
            "deliveryType": "캠퍼스 내 직수령",
            "options": [{"name": "사이즈", "values": ["S", "M", "L", "XL"]}],
            "deadline": "2026-04-30",
            "minPeople": 30,
            "currentPeople": 42,
            "status": "모집중",
            "author": "sample@kookmin.ac.kr",
            "designer": {
                "profileImageUrl": "https://picsum.photos/seed/designer1/100/100",
                "nickname": "도팅디자이너",
                "department": "국민대학교 디자인학부",
            },
            "participants": [],
            "commentCount": 34,
            "likeCount": 142,
            "viewCount": 0,
            "isLiked": False,
            "createdAt": now,
        },
        {
            "id": str(uuid.uuid4()),
            "title": "국민대학교 블랙 크롭탑 공구",
            "description": "국민대 공식 과잠! 학과명 커스텀 가능합니다.",
            "price": 18000,
            "thumbnailUrl": "https://picsum.photos/seed/jacket1/400/400",
            "image": "https://picsum.photos/seed/jacket1/400/400",
            "imageUrls": [
                "https://picsum.photos/seed/jacket1/400/400",
                "https://picsum.photos/seed/jacket2/400/400",
                "https://picsum.photos/seed/jacket3/400/400",
            ],
            "deliveryType": "캠퍼스 내 직수령",
            "options": [
                {"name": "사이즈", "values": ["S", "M", "L", "XL"]},
                {"name": "색상", "values": ["네이비", "블랙", "그레이"]},
            ],
            "deadline": "2026-04-25",
            "minPeople": 50,
            "currentPeople": 40,
            "status": "모집중",
            "author": "sample@kookmin.ac.kr",
            "designer": {
                "profileImageUrl": "https://picsum.photos/seed/designer2/100/100",
                "nickname": "크리에이티브팀",
                "department": "국민대학교 패션학과",
            },
            "participants": [],
            "commentCount": 12,
            "likeCount": 85,
            "viewCount": 0,
            "isLiked": False,
            "createdAt": now - 3600000,
        },
        {
            "id": str(uuid.uuid4()),
            "title": "국민대학교 시그니처 과잠 (블랙&화이트)",
            "description": "이번 학기 새롭게 디자인된 국민대 시그니처 과잠입니다. 고급 소재와 세련된 디자인으로 완성했습니다.",
            "price": 45000,
            "thumbnailUrl": "https://picsum.photos/seed/bus1/400/400",
            "image": "https://picsum.photos/seed/bus1/400/400",
            "imageUrls": [
                "https://picsum.photos/seed/bus1/400/400",
                "https://picsum.photos/seed/bus2/400/400",
                "https://picsum.photos/seed/bus3/400/400",
                "https://picsum.photos/seed/bus4/400/400",
            ],
            "deliveryType": "캠퍼스 내 직수령",
            "options": [],
            "deadline": "2026-04-20",
            "minPeople": 40,
            "currentPeople": 90,
            "status": "모집중",
            "author": "sample@kookmin.ac.kr",
            "designer": {
                "profileImageUrl": "https://picsum.photos/seed/designer3/100/100",
                "nickname": "행글",
                "department": "국민대학교 미술학부",
            },
            "participants": [],
            "commentCount": 56,
            "likeCount": 210,
            "viewCount": 0,
            "isLiked": False,
            "createdAt": now - 18000000,
        },
        {
            "id": str(uuid.uuid4()),
            "title": "국민대학교 미니멀 베이직 롱패딩",
            "description": "겨울 대비 국민대 롱패딩 공동구매! 경량 구스다운.",
            "price": 32000,
            "thumbnailUrl": "https://picsum.photos/seed/padding1/400/400",
            "image": "https://picsum.photos/seed/padding1/400/400",
            "imageUrls": [
                "https://picsum.photos/seed/padding1/400/400",
                "https://picsum.photos/seed/padding2/400/400",
                "https://picsum.photos/seed/padding3/400/400",
            ],
            "deliveryType": "캠퍼스 내 직수령",
            "options": [{"name": "사이즈", "values": ["M", "L", "XL", "XXL"]}],
            "deadline": "2026-05-15",
            "minPeople": 20,
            "currentPeople": 9,
            "status": "모집중",
            "author": "sample@kookmin.ac.kr",
            "designer": {
                "profileImageUrl": "https://picsum.photos/seed/designer4/100/100",
                "nickname": "미니멀디자인",
                "department": "국민대학교 의류학과",
            },
            "participants": [],
            "commentCount": 8,
            "likeCount": 45,
            "viewCount": 0,
            "isLiked": False,
            "createdAt": now - 86400000,
        },
    ]
    DATA["group_buys"] = sample_group_buys

    sample_trades = [
        {
            "id": str(uuid.uuid4()),
            "title": "자료구조 교재 팝니다",
            "description": "한 학기 사용, 밑줄 약간 있음. 상태 양호합니다.",
            "price": 12000,
            "image": "https://picsum.photos/seed/book1/400/400",
            "category": "교재",
            "location": "복지관 1층",
            "status": "판매중",
            "author": "sample@kookmin.ac.kr",
            "createdAt": now,
        },
        {
            "id": str(uuid.uuid4()),
            "title": "에어팟 프로 2세대",
            "description": "작년 구매, 케이스 포함. 배터리 상태 좋습니다.",
            "price": 180000,
            "image": "https://picsum.photos/seed/airpod1/400/400",
            "category": "전자기기",
            "location": "정문 앞",
            "status": "판매중",
            "author": "sample@kookmin.ac.kr",
            "createdAt": now - 86400000,
        },
        {
            "id": str(uuid.uuid4()),
            "title": "국민대 후드티 L사이즈",
            "description": "한 번 입고 세탁한 상태. 거의 새것입니다.",
            "price": 20000,
            "image": "https://picsum.photos/seed/hoodie2/400/400",
            "category": "의류",
            "location": "도서관 앞",
            "status": "예약중",
            "author": "sample@kookmin.ac.kr",
            "createdAt": now - 172800000,
        },
    ]
    DATA["used_trades"] = sample_trades


init_sample_data()


# ===== API 핸들러 =====

def handle_api(method, path, body, query):
    """API 라우팅"""

    # 인증
    if path == "/api/auth/register" and method == "POST":
        return register(body)
    if path == "/api/auth/login" and method == "POST":
        return login(body)

    # 공동구매
    if path == "/api/group-buys" and method == "GET":
        return get_group_buys(query)
    if path == "/api/group-buys" and method == "POST":
        return create_group_buy(body)
    if path.startswith("/api/group-buys/") and path.endswith("/reservations") and method == "POST":
        gid = path.split("/")[3]
        token = query.get("token", [""])[0]
        return create_reservation(gid, token, body)
    if path.startswith("/api/group-buys/") and method == "GET":
        gid = path.split("/")[3]
        return get_group_buy_detail(gid)

    # 중고거래
    if path == "/api/trades" and method == "GET":
        return get_trades(query)
    if path == "/api/trades" and method == "POST":
        return create_trade(body)
    if path.startswith("/api/trades/") and method == "PUT":
        tid = path.split("/")[3]
        return update_trade(tid, body)
    if path.startswith("/api/trades/") and method == "GET":
        tid = path.split("/")[3]
        return get_trade_detail(tid)

    # AI 생성
    if path == "/api/ai/generate" and method == "POST":
        return ai_generate(body)

    return 404, {"error": "Not found"}


def register(body):
    email = body.get("email", "")
    if not email.endswith("@kookmin.ac.kr"):
        return 400, {"error": "국민대학교 메일(@kookmin.ac.kr)만 사용 가능합니다"}
    if email in DATA["users"]:
        return 400, {"error": "이미 가입된 이메일입니다"}
    password = body.get("password", "")
    hashed_password = hashlib.sha256(password.encode()).hexdigest()
    DATA["users"][email] = {
        "email": email,
        "name": body.get("name", ""),
        "studentId": body.get("studentId", ""),
        "password": hashed_password,
        "verified": True,
    }
    return 200, {"message": "회원가입 완료", "email": email}


def login(body):
    email = body.get("email", "")
    password = body.get("password", "")
    hashed_password = hashlib.sha256(password.encode()).hexdigest()
    user = DATA["users"].get(email)
    if not user or user["password"] != hashed_password:
        return 401, {"error": "이메일 또는 비밀번호가 올바르지 않습니다"}
    token = str(uuid.uuid4())
    DATA["sessions"][token] = email
    return 200, {
        "token": token,
        "user": {"email": email, "name": user["name"], "studentId": user["studentId"]},
    }


def get_group_buys(query):
    """
    공구 피드 목록 조회 API
    
    Query Parameters:
    - universityName: 대학교 필터링 (기본값: 국민대학교)
    - page: 페이지 번호 (기본값: 1)
    - size: 페이지 크기 (기본값: 10)
    - sort: 정렬 기준 (기본값: latest, 옵션: latest, popular)
    - keyword: 검색 키워드
    """
    # 쿼리 파라미터 파싱 (안전한 변환)
    try:
        page = int(query.get("page", ["1"])[0])
    except (ValueError, TypeError):
        return 400, {"error": "page 파라미터는 숫자여야 합니다"}
    try:
        size = int(query.get("size", ["10"])[0])
    except (ValueError, TypeError):
        return 400, {"error": "size 파라미터는 숫자여야 합니다"}
    sort = query.get("sort", ["latest"])[0]
    keyword = query.get("keyword", [""])[0]
    
    # 페이지 유효성 검사
    if page < 1:
        page = 1
    if size < 1 or size > 50:
        size = 10
    
    # 진행 중인 공구만 필터링 (status == "모집중")
    items = [i for i in DATA["group_buys"] if i["status"] == "모집중"]
    
    # 키워드 검색
    if keyword:
        items = [i for i in items if keyword in i["title"] or keyword in i["description"]]
    
    # 정렬
    if sort == "popular":
        # 실시간 인기순: 좋아요 수 + 댓글 수 기준
        items = sorted(items, key=lambda x: (x.get("likeCount", 0) + x.get("commentCount", 0)), reverse=True)
    else:
        # 최신순 (기본값)
        items = sorted(items, key=lambda x: x["createdAt"], reverse=True)
    
    # 페이징
    total = len(items)
    start = (page - 1) * size
    end = start + size
    paginated_items = items[start:end]
    
    # 응답 데이터 포맷팅
    def format_feed_item(item):
        # 달성률 계산
        achievement_rate = 0
        if item["minPeople"] > 0:
            achievement_rate = int((item["currentPeople"] / item["minPeople"]) * 100)
        
        # 경과 시간 계산
        now = int(time.time() * 1000)
        elapsed = now - item["createdAt"]
        
        if elapsed < 60000:  # 1분 미만
            time_ago = "방금 전"
        elif elapsed < 3600000:  # 1시간 미만
            minutes = elapsed // 60000
            time_ago = f"{minutes}분 전"
        elif elapsed < 86400000:  # 1일 미만
            hours = elapsed // 3600000
            time_ago = f"{hours}시간 전"
        else:
            days = elapsed // 86400000
            time_ago = f"{days}일 전"
        
        return {
            "projectId": item["id"],
            "thumbnailUrl": item.get("thumbnailUrl", item.get("image", "")),
            "title": item["title"],
            "deliveryType": item.get("deliveryType", "캠퍼스 내 직수령"),
            "timeAgo": time_ago,
            "price": item["price"],
            "achievementRate": achievement_rate,
            "commentCount": item.get("commentCount", 0),
            "likeCount": item.get("likeCount", 0),
        }
    
    feed_items = [format_feed_item(item) for item in paginated_items]
    
    return 200, {
        "data": feed_items,
        "pagination": {
            "page": page,
            "size": size,
            "total": total,
            "totalPages": (total + size - 1) // size,
        }
    }


def get_group_buy_detail(gid):
    """
    굿즈 상세 조회 API
    
    Path Parameters:
    - gid: 공구 프로젝트 고유 ID
    
    Returns:
    - 200: 상세 정보 반환
    - 404: 존재하지 않는 상품
    """
    for item in DATA["group_buys"]:
        if item["id"] == gid:
            # 조회수 증가
            item["viewCount"] = item.get("viewCount", 0) + 1
            
            # 달성률 계산
            achievement_rate = 0
            if item["minPeople"] > 0:
                achievement_rate = int((item["currentPeople"] / item["minPeople"]) * 100)
            
            # 응답 데이터 포맷팅
            response = {
                "projectId": item["id"],
                "imageUrls": item.get("imageUrls", [item.get("image", "")]),
                "achievementRate": achievement_rate,
                "designer": item.get("designer", {
                    "profileImageUrl": "https://picsum.photos/seed/designer/100/100",
                    "nickname": "디자이너",
                    "department": "국민대학교",
                }),
                "title": item["title"],
                "price": item["price"],
                "description": item["description"],
                "isLiked": item.get("isLiked", False),
                "deliveryType": item.get("deliveryType", "캠퍼스 내 직수령"),
                "deadline": item.get("deadline", ""),
                "minPeople": item.get("minPeople", 0),
                "currentPeople": item.get("currentPeople", 0),
                "commentCount": item.get("commentCount", 0),
                "likeCount": item.get("likeCount", 0),
                "viewCount": item.get("viewCount", 0),
                "options": item.get("options", []),
            }
            return 200, response
    
    return 404, {"error": "삭제된 굿즈입니다"}


def create_group_buy(body):
    required = ["title", "description", "price", "deadline", "minPeople"]
    missing = [f for f in required if not body.get(f)]
    if missing:
        return 400, {"error": f"필수 항목 누락: {', '.join(missing)}"}
    
    image_url = body.get("image", "https://picsum.photos/seed/new/400/400")
    
    item = {
        "id": str(uuid.uuid4()),
        "title": body["title"],
        "description": body["description"],
        "price": int(body["price"]),
        "image": image_url,
        "thumbnailUrl": body.get("thumbnailUrl", image_url),
        "imageUrls": body.get("imageUrls", [image_url]),
        "deliveryType": body.get("deliveryType", "캠퍼스 내 직수령"),
        "options": body.get("options", []),
        "deadline": body["deadline"],
        "minPeople": int(body["minPeople"]),
        "currentPeople": 0,
        "status": "모집중",
        "author": body.get("author", "anonymous"),
        "designer": body.get("designer", {
            "profileImageUrl": "https://picsum.photos/seed/designer/100/100",
            "nickname": "디자이너",
            "department": "국민대학교",
        }),
        "participants": [],
        "commentCount": 0,
        "likeCount": 0,
        "viewCount": 0,
        "isLiked": False,
        "createdAt": int(time.time() * 1000),
    }
    DATA["group_buys"].insert(0, item)
    return 201, item



def create_reservation(gid, token, body):
    """
    공구 참여 예약 API
    
    Path Parameters:
    - gid: 공구 프로젝트 고유 ID
    
    Query Parameters:
    - token: 인증 토큰
    
    Body:
    - options: 선택한 옵션 (예: {"사이즈": "M", "색상": "블랙"})
    - quantity: 수량 (기본값: 1)
    
    Returns:
    - 201: 예약 생성 성공
    - 400: 중복 참여, 잘못된 요청
    - 401: 인증 실패
    - 404: 상품 없음
    """
    # 1. 인증 확인
    if not token or token not in DATA["sessions"]:
        return 401, {"error": "인증이 필요합니다"}
    
    user_email = DATA["sessions"][token]
    
    # 2. 상품 확인
    project = None
    for item in DATA["group_buys"]:
        if item["id"] == gid:
            project = item
            break
    
    if not project:
        return 404, {"error": "상품을 찾을 수 없습니다"}
    
    # 3. 중복 참여 확인
    for reservation in DATA["reservations"]:
        if reservation["projectId"] == gid and reservation["userEmail"] == user_email:
            return 400, {"error": "이미 이 상품에 참여했습니다"}
    
    # 4. 수량 유효성 검사
    quantity = body.get("quantity", 1)
    try:
        quantity = int(quantity)
    except (ValueError, TypeError):
        return 400, {"error": "수량은 숫자여야 합니다"}
    if quantity < 1:
        return 400, {"error": "수량은 1 이상이어야 합니다"}
    
    # 5. 달성률 계산 (현재 상태)
    current_achievement_rate = 0
    if project["minPeople"] > 0:
        current_achievement_rate = int((project["currentPeople"] / project["minPeople"]) * 100)
    
    # 6. 예약 상태 결정 (달성률 100% 기준)
    reservation_status = "CANCELLABLE" if current_achievement_rate < 100 else "NON_CANCELLABLE"
    
    # 7. 예약 생성
    reservation = {
        "id": str(uuid.uuid4()),
        "projectId": gid,
        "userEmail": user_email,
        "options": body.get("options", {}),
        "quantity": quantity,
        "status": reservation_status,
        "achievementRateAtReservation": current_achievement_rate,
        "createdAt": int(time.time() * 1000),
    }
    
    DATA["reservations"].append(reservation)
    
    # 8. 프로젝트의 currentPeople 증가
    project["currentPeople"] += 1
    
    # 9. 새로운 달성률 계산
    new_achievement_rate = 0
    if project["minPeople"] > 0:
        new_achievement_rate = int((project["currentPeople"] / project["minPeople"]) * 100)
    
    return 201, {
        "reservationId": reservation["id"],
        "currentAchievementRate": new_achievement_rate,
        "status": "success",
        "message": "예약이 완료되었습니다",
    }


def get_trades(query):
    items = DATA["used_trades"]
    category = query.get("category", [""])[0]
    keyword = query.get("keyword", [""])[0]
    status = query.get("status", [""])[0]
    if category:
        items = [i for i in items if i["category"] == category]
    if status:
        items = [i for i in items if i["status"] == status]
    if keyword:
        items = [i for i in items if keyword in i["title"] or keyword in i["description"]]
    items = sorted(items, key=lambda x: x["createdAt"], reverse=True)
    return 200, items


def get_trade_detail(tid):
    for item in DATA["used_trades"]:
        if item["id"] == tid:
            return 200, item
    return 404, {"error": "게시글을 찾을 수 없습니다"}


def create_trade(body):
    required = ["title", "description", "price", "category"]
    missing = [f for f in required if not body.get(f)]
    if missing:
        return 400, {"error": f"필수 항목 누락: {', '.join(missing)}"}
    item = {
        "id": str(uuid.uuid4()),
        "title": body["title"],
        "description": body["description"],
        "price": int(body["price"]),
        "image": body.get("image", "https://picsum.photos/seed/trade/400/400"),
        "category": body["category"],
        "location": body.get("location", ""),
        "status": "판매중",
        "author": body.get("author", "anonymous"),
        "createdAt": int(time.time() * 1000),
    }
    DATA["used_trades"].insert(0, item)
    return 201, item


def update_trade(tid, body):
    for item in DATA["used_trades"]:
        if item["id"] == tid:
            for key in ["title", "description", "price", "status", "location", "image"]:
                if key in body:
                    item[key] = body[key]
            return 200, item
    return 404, {"error": "게시글을 찾을 수 없습니다"}


def ai_generate(body):
    product = body.get("product", "상품")
    keywords = body.get("keywords", "")
    title = f"🔥 국민대 {product} 공동구매 - 지금 참여하세요!"
    description = (
        f"국민대학교 학생 여러분, {product} 공동구매를 시작합니다!\n\n"
        f"{keywords + ' ' if keywords else ''}"
        f"합리적인 가격에 고품질 {product}을(를) 만나보세요. "
        f"최소 인원 달성 시 특별 할인가로 제공됩니다.\n\n"
        f"✅ 국민대 재학생 전용\n"
        f"✅ 옵션 선택 가능\n"
        f"✅ 교내 수령 가능\n\n"
        f"많은 참여 부탁드립니다! 🎓"
    )
    return 200, {"title": title, "description": description}


# ===== HTTP 서버 =====

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")


class RequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=FRONTEND_DIR, **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/"):
            query = urllib.parse.parse_qs(parsed.query)
            status, data = handle_api("GET", parsed.path, {}, query)
            self._json_response(status, data)
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        body = self._read_body()
        query = urllib.parse.parse_qs(parsed.query)
        status, data = handle_api("POST", parsed.path, body, query)
        self._json_response(status, data)

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        body = self._read_body()
        query = urllib.parse.parse_qs(parsed.query)
        status, data = handle_api("PUT", parsed.path, body, query)
        self._json_response(status, data)

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def _json_response(self, status, data):
        self.send_response(status)
        self._cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {format % args}")


def main():
    port = 3000
    server = http.server.HTTPServer(("0.0.0.0", port), RequestHandler)
    print(f"\n{'='*50}")
    print(f"  🎓 국민대학교 공동구매·중고거래 플랫폼")
    print(f"  서버 실행 중: http://localhost:{port}")
    print(f"{'='*50}\n")
    print(f"  프론트엔드: http://localhost:{port}/")
    print(f"  API: http://localhost:{port}/api/group-buys")
    print(f"\n  종료: Ctrl+C\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n서버 종료")
        server.server_close()


if __name__ == "__main__":
    main()
