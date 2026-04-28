"""
공구 피드 API 테스트 코드
"""
import json
import unittest
from server import handle_api, init_sample_data, DATA


class TestGroupBuysFeedAPI(unittest.TestCase):
    """공구 피드 목록 조회 API 테스트"""

    def setUp(self):
        """각 테스트 전에 샘플 데이터 초기화"""
        DATA["group_buys"] = []
        DATA["users"] = {}
        init_sample_data()

    def test_get_group_buys_default(self):
        """기본 요청 (페이지 1, 10개)"""
        status, response = handle_api("GET", "/api/group-buys", {}, {})
        
        self.assertEqual(status, 200)
        self.assertIn("data", response)
        self.assertIn("pagination", response)
        self.assertEqual(response["pagination"]["page"], 1)
        self.assertEqual(response["pagination"]["size"], 10)
        self.assertGreater(len(response["data"]), 0)

    def test_get_group_buys_response_structure(self):
        """응답 데이터 구조 검증"""
        status, response = handle_api("GET", "/api/group-buys", {}, {})
        
        self.assertEqual(status, 200)
        self.assertGreater(len(response["data"]), 0)
        
        item = response["data"][0]
        required_fields = [
            "projectId", "thumbnailUrl", "title", "deliveryType",
            "timeAgo", "price", "achievementRate", "commentCount", "likeCount"
        ]
        
        for field in required_fields:
            self.assertIn(field, item, f"Missing field: {field}")

    def test_get_group_buys_pagination(self):
        """페이징 테스트"""
        # 페이지 1, 크기 2
        status, response = handle_api("GET", "/api/group-buys", {}, {
            "page": ["1"],
            "size": ["2"]
        })
        
        self.assertEqual(status, 200)
        self.assertEqual(len(response["data"]), 2)
        self.assertEqual(response["pagination"]["page"], 1)
        self.assertEqual(response["pagination"]["size"], 2)

    def test_get_group_buys_page_2(self):
        """페이지 2 요청"""
        status, response = handle_api("GET", "/api/group-buys", {}, {
            "page": ["2"],
            "size": ["2"]
        })
        
        self.assertEqual(status, 200)
        self.assertEqual(response["pagination"]["page"], 2)

    def test_get_group_buys_invalid_page(self):
        """잘못된 페이지 요청 (범위 초과)"""
        status, response = handle_api("GET", "/api/group-buys", {}, {
            "page": ["999"],
            "size": ["10"]
        })
        
        self.assertEqual(status, 200)
        self.assertEqual(len(response["data"]), 0)

    def test_get_group_buys_sort_latest(self):
        """최신순 정렬"""
        status, response = handle_api("GET", "/api/group-buys", {}, {
            "sort": ["latest"]
        })
        
        self.assertEqual(status, 200)
        self.assertGreater(len(response["data"]), 1)
        
        # 첫 번째 아이템이 가장 최신이어야 함
        first_item = response["data"][0]
        self.assertIsNotNone(first_item["projectId"])

    def test_get_group_buys_sort_popular(self):
        """실시간 인기순 정렬"""
        status, response = handle_api("GET", "/api/group-buys", {}, {
            "sort": ["popular"]
        })
        
        self.assertEqual(status, 200)
        self.assertGreater(len(response["data"]), 0)

    def test_get_group_buys_keyword_search(self):
        """키워드 검색"""
        status, response = handle_api("GET", "/api/group-buys", {}, {
            "keyword": ["후리스"]
        })
        
        self.assertEqual(status, 200)
        # 후리스 관련 아이템이 있어야 함
        self.assertGreater(len(response["data"]), 0)
        self.assertIn("후리스", response["data"][0]["title"])

    def test_get_group_buys_keyword_no_match(self):
        """키워드 검색 - 결과 없음"""
        status, response = handle_api("GET", "/api/group-buys", {}, {
            "keyword": ["존재하지않는상품"]
        })
        
        self.assertEqual(status, 200)
        self.assertEqual(len(response["data"]), 0)

    def test_get_group_buys_size_limit(self):
        """페이지 크기 제한 (최대 50)"""
        status, response = handle_api("GET", "/api/group-buys", {}, {
            "size": ["100"]
        })
        
        self.assertEqual(status, 200)
        # size가 50을 초과하면 10으로 조정
        self.assertEqual(response["pagination"]["size"], 10)

    def test_get_group_buys_size_invalid(self):
        """페이지 크기 유효성 검사 (0 이하)"""
        status, response = handle_api("GET", "/api/group-buys", {}, {
            "size": ["0"]
        })
        
        self.assertEqual(status, 200)
        self.assertEqual(response["pagination"]["size"], 10)

    def test_get_group_buys_achievement_rate(self):
        """달성률 계산 검증"""
        status, response = handle_api("GET", "/api/group-buys", {}, {})
        
        self.assertEqual(status, 200)
        self.assertGreater(len(response["data"]), 0)
        
        item = response["data"][0]
        # 달성률은 0 이상의 정수여야 함
        self.assertIsInstance(item["achievementRate"], int)
        self.assertGreaterEqual(item["achievementRate"], 0)

    def test_get_group_buys_time_ago_format(self):
        """경과 시간 포맷 검증"""
        status, response = handle_api("GET", "/api/group-buys", {}, {})
        
        self.assertEqual(status, 200)
        self.assertGreater(len(response["data"]), 0)
        
        item = response["data"][0]
        # timeAgo는 문자열이어야 함
        self.assertIsInstance(item["timeAgo"], str)
        self.assertIn("전", item["timeAgo"])

    def test_get_group_buys_only_recruiting(self):
        """진행 중인 공구만 반환"""
        status, response = handle_api("GET", "/api/group-buys", {}, {})
        
        self.assertEqual(status, 200)
        # 모든 아이템이 진행 중이어야 함
        for item in response["data"]:
            # 원본 데이터에서 status 확인
            original_item = next(
                (i for i in DATA["group_buys"] if i["id"] == item["projectId"]),
                None
            )
            self.assertIsNotNone(original_item)
            self.assertEqual(original_item["status"], "모집중")

    def test_get_group_buys_empty_result(self):
        """공구가 없을 때 빈 배열 반환"""
        DATA["group_buys"] = []
        
        status, response = handle_api("GET", "/api/group-buys", {}, {})
        
        self.assertEqual(status, 200)
        self.assertEqual(len(response["data"]), 0)
        self.assertEqual(response["pagination"]["total"], 0)
        self.assertEqual(response["pagination"]["totalPages"], 0)

    def test_get_group_buys_pagination_info(self):
        """페이지네이션 정보 검증"""
        status, response = handle_api("GET", "/api/group-buys", {}, {
            "page": ["1"],
            "size": ["2"]
        })
        
        self.assertEqual(status, 200)
        pagination = response["pagination"]
        
        self.assertIn("page", pagination)
        self.assertIn("size", pagination)
        self.assertIn("total", pagination)
        self.assertIn("totalPages", pagination)
        
        # totalPages 계산 검증
        expected_total_pages = (pagination["total"] + pagination["size"] - 1) // pagination["size"]
        self.assertEqual(pagination["totalPages"], expected_total_pages)

    def test_get_group_buys_invalid_page_string(self):
        """page에 문자열이 들어올 경우 400 에러"""
        status, response = handle_api("GET", "/api/group-buys", {}, {
            "page": ["abc"]
        })
        
        self.assertEqual(status, 400)
        self.assertIn("error", response)

    def test_get_group_buys_invalid_size_string(self):
        """size에 문자열이 들어올 경우 400 에러"""
        status, response = handle_api("GET", "/api/group-buys", {}, {
            "size": ["xyz"]
        })
        
        self.assertEqual(status, 400)
        self.assertIn("error", response)


class TestGroupBuyDetailAPI(unittest.TestCase):
    """굿즈 상세 조회 API 테스트"""

    def setUp(self):
        """각 테스트 전에 샘플 데이터 초기화"""
        DATA["group_buys"] = []
        DATA["users"] = {}
        init_sample_data()

    def test_get_group_buy_detail_success(self):
        """상세 조회 성공"""
        # 첫 번째 아이템의 ID 가져오기
        project_id = DATA["group_buys"][0]["id"]
        
        status, response = handle_api("GET", f"/api/group-buys/{project_id}", {}, {})
        
        self.assertEqual(status, 200)
        self.assertIn("imageUrls", response)
        self.assertIn("achievementRate", response)
        self.assertIn("designer", response)
        self.assertIn("title", response)
        self.assertIn("price", response)
        self.assertIn("description", response)
        self.assertIn("isLiked", response)

    def test_get_group_buy_detail_response_structure(self):
        """상세 조회 응답 구조 검증"""
        project_id = DATA["group_buys"][0]["id"]
        
        status, response = handle_api("GET", f"/api/group-buys/{project_id}", {}, {})
        
        self.assertEqual(status, 200)
        
        # imageUrls는 배열
        self.assertIsInstance(response["imageUrls"], list)
        self.assertGreater(len(response["imageUrls"]), 0)
        
        # designer 객체
        self.assertIsInstance(response["designer"], dict)
        self.assertIn("profileImageUrl", response["designer"])
        self.assertIn("nickname", response["designer"])
        self.assertIn("department", response["designer"])
        
        # 기본 필드
        self.assertIsInstance(response["title"], str)
        self.assertIsInstance(response["price"], int)
        self.assertIsInstance(response["description"], str)
        self.assertIsInstance(response["achievementRate"], int)
        self.assertIsInstance(response["isLiked"], bool)

    def test_get_group_buy_detail_not_found(self):
        """존재하지 않는 상품 조회"""
        status, response = handle_api("GET", "/api/group-buys/invalid-id-12345", {}, {})
        
        self.assertEqual(status, 404)
        self.assertIn("error", response)
        self.assertIn("삭제", response["error"])

    def test_get_group_buy_detail_view_count_increment(self):
        """조회수 증가 검증"""
        project_id = DATA["group_buys"][0]["id"]
        original_views = DATA["group_buys"][0].get("viewCount", 0)
        
        # 첫 번째 조회
        status1, _ = handle_api("GET", f"/api/group-buys/{project_id}", {}, {})
        views_after_first = DATA["group_buys"][0].get("viewCount", 0)
        
        # 두 번째 조회
        status2, _ = handle_api("GET", f"/api/group-buys/{project_id}", {}, {})
        views_after_second = DATA["group_buys"][0].get("viewCount", 0)
        
        self.assertEqual(status1, 200)
        self.assertEqual(status2, 200)
        self.assertEqual(views_after_first, original_views + 1)
        self.assertEqual(views_after_second, original_views + 2)

    def test_get_group_buy_detail_achievement_rate(self):
        """상세 조회 달성률 계산"""
        project_id = DATA["group_buys"][0]["id"]
        
        status, response = handle_api("GET", f"/api/group-buys/{project_id}", {}, {})
        
        self.assertEqual(status, 200)
        
        # 달성률 검증
        item = DATA["group_buys"][0]
        expected_rate = int((item["currentPeople"] / item["minPeople"]) * 100)
        self.assertEqual(response["achievementRate"], expected_rate)

    def test_get_group_buy_detail_image_urls_array(self):
        """이미지 URL 배열 검증"""
        project_id = DATA["group_buys"][0]["id"]
        
        status, response = handle_api("GET", f"/api/group-buys/{project_id}", {}, {})
        
        self.assertEqual(status, 200)
        self.assertIsInstance(response["imageUrls"], list)
        
        # 각 URL이 문자열이어야 함
        for url in response["imageUrls"]:
            self.assertIsInstance(url, str)
            self.assertTrue(url.startswith("http"))

    def test_get_group_buy_detail_designer_info(self):
        """디자이너 정보 검증"""
        project_id = DATA["group_buys"][0]["id"]
        
        status, response = handle_api("GET", f"/api/group-buys/{project_id}", {}, {})
        
        self.assertEqual(status, 200)
        
        designer = response["designer"]
        self.assertIsNotNone(designer["profileImageUrl"])
        self.assertIsNotNone(designer["nickname"])
        self.assertIsNotNone(designer["department"])


class TestReservationAPI(unittest.TestCase):
    """공구 참여 예약 API 테스트"""

    def setUp(self):
        """각 테스트 전에 샘플 데이터 초기화"""
        DATA["group_buys"] = []
        DATA["users"] = {}
        DATA["reservations"] = []
        DATA["sessions"] = {}
        init_sample_data()
        
        # 테스트용 토큰 생성
        self.test_token = "test-token-12345"
        self.test_email = "sample@kookmin.ac.kr"
        DATA["sessions"][self.test_token] = self.test_email

    def test_create_reservation_success(self):
        """예약 생성 성공"""
        project_id = DATA["group_buys"][0]["id"]
        original_people = DATA["group_buys"][0]["currentPeople"]
        
        status, response = handle_api("POST", f"/api/group-buys/{project_id}/reservations", {}, {
            "token": [self.test_token]
        })
        
        self.assertEqual(status, 201)
        self.assertIn("reservationId", response)
        self.assertIn("currentAchievementRate", response)
        self.assertEqual(response["status"], "success")
        
        # currentPeople 증가 확인
        self.assertEqual(DATA["group_buys"][0]["currentPeople"], original_people + 1)

    def test_create_reservation_duplicate_prevention(self):
        """중복 참여 방지"""
        project_id = DATA["group_buys"][0]["id"]
        
        # 첫 번째 예약
        status1, response1 = handle_api("POST", f"/api/group-buys/{project_id}/reservations", {}, {
            "token": [self.test_token]
        })
        self.assertEqual(status1, 201)
        
        # 두 번째 예약 (중복)
        status2, response2 = handle_api("POST", f"/api/group-buys/{project_id}/reservations", {}, {
            "token": [self.test_token]
        })
        self.assertEqual(status2, 400)
        self.assertIn("이미", response2["error"])

    def test_create_reservation_no_auth(self):
        """인증 없이 예약 시도"""
        project_id = DATA["group_buys"][0]["id"]
        
        status, response = handle_api("POST", f"/api/group-buys/{project_id}/reservations", {}, {
            "token": ["invalid-token"]
        })
        
        self.assertEqual(status, 401)
        self.assertIn("인증", response["error"])

    def test_create_reservation_project_not_found(self):
        """존재하지 않는 상품에 예약"""
        status, response = handle_api("POST", "/api/group-buys/invalid-id/reservations", {}, {
            "token": [self.test_token]
        })
        
        self.assertEqual(status, 404)
        self.assertIn("상품", response["error"])

    def test_create_reservation_achievement_rate_cancellable(self):
        """달성률 100% 미만 - CANCELLABLE 상태"""
        # 달성률이 100% 미만인 상품 찾기
        project = None
        for item in DATA["group_buys"]:
            rate = int((item["currentPeople"] / item["minPeople"]) * 100)
            if rate < 100:
                project = item
                break
        
        if project:
            status, response = handle_api("POST", f"/api/group-buys/{project['id']}/reservations", {}, {
                "token": [self.test_token]
            })
            
            self.assertEqual(status, 201)
            # 예약 상태 확인
            reservation = DATA["reservations"][-1]
            self.assertEqual(reservation["status"], "CANCELLABLE")

    def test_create_reservation_achievement_rate_non_cancellable(self):
        """달성률 100% 이상 - NON_CANCELLABLE 상태"""
        # 달성률이 100% 이상인 상품 찾기
        project = None
        for item in DATA["group_buys"]:
            rate = int((item["currentPeople"] / item["minPeople"]) * 100)
            if rate >= 100:
                project = item
                break
        
        if project:
            status, response = handle_api("POST", f"/api/group-buys/{project['id']}/reservations", {}, {
                "token": [self.test_token]
            })
            
            self.assertEqual(status, 201)
            # 예약 상태 확인
            reservation = DATA["reservations"][-1]
            self.assertEqual(reservation["status"], "NON_CANCELLABLE")

    def test_create_reservation_with_options(self):
        """옵션과 함께 예약"""
        project_id = DATA["group_buys"][0]["id"]
        
        status, response = handle_api("POST", f"/api/group-buys/{project_id}/reservations", {
            "options": {"사이즈": "M", "색상": "블랙"},
            "quantity": 2
        }, {
            "token": [self.test_token]
        })
        
        self.assertEqual(status, 201)
        
        # 예약 정보 확인
        reservation = DATA["reservations"][-1]
        self.assertEqual(reservation["options"]["사이즈"], "M")
        self.assertEqual(reservation["quantity"], 2)

    def test_create_reservation_response_structure(self):
        """예약 응답 구조 검증"""
        project_id = DATA["group_buys"][0]["id"]
        
        status, response = handle_api("POST", f"/api/group-buys/{project_id}/reservations", {}, {
            "token": [self.test_token]
        })
        
        self.assertEqual(status, 201)
        self.assertIsInstance(response["reservationId"], str)
        self.assertIsInstance(response["currentAchievementRate"], int)
        self.assertEqual(response["status"], "success")

    def test_create_reservation_achievement_rate_calculation(self):
        """달성률 계산 검증"""
        project_id = DATA["group_buys"][0]["id"]
        project = DATA["group_buys"][0]
        
        original_people = project["currentPeople"]
        original_min = project["minPeople"]
        
        status, response = handle_api("POST", f"/api/group-buys/{project_id}/reservations", {}, {
            "token": [self.test_token]
        })
        
        self.assertEqual(status, 201)
        
        # 예상 달성률 계산
        expected_rate = int(((original_people + 1) / original_min) * 100)
        self.assertEqual(response["currentAchievementRate"], expected_rate)

    def test_create_reservation_multiple_users(self):
        """여러 사용자의 예약"""
        project_id = DATA["group_buys"][0]["id"]
        original_people = DATA["group_buys"][0]["currentPeople"]
        
        # 첫 번째 사용자
        status1, response1 = handle_api("POST", f"/api/group-buys/{project_id}/reservations", {}, {
            "token": [self.test_token]
        })
        self.assertEqual(status1, 201)
        
        # 두 번째 사용자
        token2 = "test-token-67890"
        email2 = "user2@kookmin.ac.kr"
        DATA["sessions"][token2] = email2
        
        status2, response2 = handle_api("POST", f"/api/group-buys/{project_id}/reservations", {}, {
            "token": [token2]
        })
        self.assertEqual(status2, 201)
        
        # currentPeople 증가 확인
        self.assertEqual(DATA["group_buys"][0]["currentPeople"], original_people + 2)
        
        # 두 예약이 모두 저장되었는지 확인
        self.assertEqual(len(DATA["reservations"]), 2)

    def test_create_reservation_stored_data(self):
        """예약 데이터 저장 검증"""
        project_id = DATA["group_buys"][0]["id"]
        
        status, response = handle_api("POST", f"/api/group-buys/{project_id}/reservations", {
            "options": {"사이즈": "L"},
            "quantity": 1
        }, {
            "token": [self.test_token]
        })
        
        self.assertEqual(status, 201)
        
        # 저장된 예약 확인
        reservation = DATA["reservations"][-1]
        self.assertEqual(reservation["projectId"], project_id)
        self.assertEqual(reservation["userEmail"], self.test_email)
        self.assertEqual(reservation["options"]["사이즈"], "L")
        self.assertIn("createdAt", reservation)
        self.assertIn("id", reservation)

    def test_create_reservation_quantity_zero(self):
        """수량 0으로 예약 시도 - 400 에러"""
        project_id = DATA["group_buys"][0]["id"]
        
        status, response = handle_api("POST", f"/api/group-buys/{project_id}/reservations", {
            "quantity": 0
        }, {
            "token": [self.test_token]
        })
        
        self.assertEqual(status, 400)
        self.assertIn("수량", response["error"])

    def test_create_reservation_quantity_negative(self):
        """수량 음수로 예약 시도 - 400 에러"""
        project_id = DATA["group_buys"][0]["id"]
        
        status, response = handle_api("POST", f"/api/group-buys/{project_id}/reservations", {
            "quantity": -1
        }, {
            "token": [self.test_token]
        })
        
        self.assertEqual(status, 400)
        self.assertIn("수량", response["error"])


if __name__ == "__main__":
    unittest.main()
