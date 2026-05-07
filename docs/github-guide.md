# 깃허브 사용 가이드

우리 팀 프로젝트에서 깃허브를 사용하는 방법입니다.
처음 쓰는 사람도 따라할 수 있도록 정리했습니다.

---

## 1. 처음 세팅 (한 번만 하면 됨)

### 레포 클론
```bash
git clone https://github.com/AWS-PORJECT-2/AWS_PROJECT_2.git
cd AWS_PROJECT_2
```

### 본인 브랜치 만들기
```bash
git checkout -b 본인이름
# 예: git checkout -b sangjin
```

### 브랜치를 원격에 등록
```bash
git push -u origin 본인이름
# 예: git push -u origin sangjin
```

이후부터는 이 브랜치에서 작업하면 됩니다.

---

## 2. 일반적인 작업 흐름

### ① 작업 시작 전: 최신 코드 받기
```bash
git checkout 본인이름
git pull origin main
```

### ② 코드 작성
평소처럼 코드를 작성합니다.

### ③ 변경사항 확인
```bash
git status          # 변경된 파일 목록
git diff            # 변경 내용 확인 (민감 정보 없는지 체크)
```

### ④ 커밋
```bash
git add .
git commit -m "feat: 공동구매 참여 API 추가"
```

커밋 메시지 prefix 규칙:
- `feat:` 새 기능
- `fix:` 버그 수정
- `docs:` 문서 수정
- `style:` 코드 스타일 변경 (기능 변화 없음)
- `refactor:` 리팩토링
- `chore:` 기타 잡일 (설정 변경 등)

### ⑤ 푸시
```bash
git push origin 본인이름
```

---

## 3. PR (Pull Request) 만들기

### 방법 1: GitHub 웹에서
1. https://github.com/AWS-PORJECT-2/AWS_PROJECT_2 접속
2. 상단에 "Compare & pull request" 버튼 클릭
3. base: `main` ← compare: `본인이름` 확인
4. 제목과 설명 작성 후 "Create pull request" 클릭

### 방법 2: 터미널에서
```bash
gh pr create --base main --head 본인이름 --title "제목" --body "설명"
```

### PR 설명 작성 규칙
- 변경 사항을 간단히 설명
- 기존 파일을 수정한 경우 어떤 파일을 왜 수정했는지 반드시 명시
- 템플릿이 자동으로 뜨니까 체크리스트 채우기

---

## 4. 코드 리뷰 대응

PR을 올리면 CodeRabbit이 자동으로 코드 리뷰를 남깁니다.

1. PR 페이지에서 CodeRabbit 코멘트 확인
2. 지적 사항이 있으면 코드 수정
3. 수정 후 커밋 & 푸시
```bash
git add .
git commit -m "fix: CodeRabbit 리뷰 반영"
git push origin 본인이름
```
4. PR에 자동으로 반영됨
5. 리뷰 지적 사항이 모두 해결되면 팀원에게 머지 요청

---

## 5. 머지 후 정리

PR이 머지된 후 본인 브랜치를 최신 상태로 맞추기:
```bash
git checkout 본인이름
git pull origin main
```

---

## 6. 자주 쓰는 명령어 모음

| 상황 | 명령어 |
|------|--------|
| 현재 브랜치 확인 | `git branch` |
| 브랜치 전환 | `git checkout 브랜치이름` |
| 변경 파일 확인 | `git status` |
| 변경 내용 확인 | `git diff` |
| 전체 커밋 | `git add . && git commit -m "메시지"` |
| 푸시 | `git push origin 브랜치이름` |
| 최신 코드 받기 | `git pull origin main` |
| 커밋 로그 보기 | `git log --oneline` |

---

## 7. 주의사항

- main 브랜치에 직접 push 금지 (반드시 PR을 통해서)
- `.env` 파일, API 키 등 민감 정보는 절대 커밋하지 않기
- 커밋 전에 `git diff`로 민감 정보 포함 여부 확인
- 불필요한 파일 (메모, 스크린샷, 임시 파일) 커밋하지 않기
- 충돌(conflict)이 나면 혼자 해결하지 말고 팀원과 상의하기

---

## 8. 문제 상황 대처

### 잘못 커밋했을 때 (아직 push 안 한 경우)
```bash
git reset --soft HEAD~1    # 마지막 커밋 취소 (파일은 유지)
```

### push 후 되돌리고 싶을 때
```bash
git revert HEAD            # 되돌리는 새 커밋 생성
git push origin 본인이름
```

### 충돌(conflict) 발생 시
```bash
git pull origin main       # 충돌 발생
# 충돌 파일 열어서 <<<< ==== >>>> 부분 수동 수정
git add .
git commit -m "fix: merge conflict 해결"
git push origin 본인이름
```

모르겠으면 팀원에게 물어보세요.
