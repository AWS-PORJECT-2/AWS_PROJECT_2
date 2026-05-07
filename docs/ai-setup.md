# AI 디자인 생성 + 가상 피팅 셋업 가이드

> **대상 GPU**: AMD Radeon RX 7900 GRE (16GB VRAM, RDNA3)
> **권장 OS**: Ubuntu 22.04 / 24.04 (네이티브) — Windows + ZLUDA 도 가능하지만 ROCm 정식 지원이 더 안정적

---

## 1. 왜 이 조합인가

| 영역 | 추천 | 이유 |
|---|---|---|
| AI 디자인 생성 | **SDXL + 패션 LoRA** (또는 FLUX.1 [schnell] GGUF) | RX 7900 GRE 16GB 에 잘 맞음. SDXL은 검증된 생태계, FLUX는 더 고품질 |
| 가상 피팅 | **CatVTON** (ComfyUI 노드 사용) | 8~16GB VRAM에서 동작, 마스킹 기반이라 인물 사진을 거의 변형 안 함, ROCm 호환 |
| 워크플로우 엔진 | **ComfyUI** | 두 모델 모두 노드로 통합 가능, REST API 제공 → 백엔드에서 호출 쉬움 |

검증된 대안:
- **FASHN AI** (클라우드 API): 자체 GPU 부담 없음. 한 장 ~$0.04~0.08. 품질 매우 우수. 빠른 시연용 추천.
- **Replicate**: IDM-VTON, OOTDiffusion 호스팅. CatVTON 보다 무겁지만 디테일은 더 높음.
- **AWS Bedrock**: 운영 시 후보. 한국 학생 프로젝트면 비용 비쌈.

---

## 2. ROCm + PyTorch 설치 (Ubuntu 24.04 기준)

### 2-1. ROCm 6.x 설치

```bash
# AMDGPU 드라이버 + ROCm
wget https://repo.radeon.com/amdgpu-install/6.2/ubuntu/jammy/amdgpu-install_6.2.60200-1_all.deb
sudo apt install ./amdgpu-install_6.2.60200-1_all.deb
sudo amdgpu-install --usecase=rocm --no-dkms

# 사용자를 video, render 그룹에 추가
sudo usermod -aG render,video $USER

# 재부팅 후 확인
rocminfo | grep "Marketing Name"   # "Radeon RX 7900 GRE" 표시되어야 함
rocm-smi                           # GPU 상태 출력
```

### 2-2. PyTorch ROCm 빌드

```bash
python3 -m venv ~/ai-env
source ~/ai-env/bin/activate
pip install --upgrade pip

# PyTorch ROCm 6.2 (2026-04 기준 최신 안정판)
pip install torch torchvision --index-url https://download.pytorch.org/whl/rocm6.2

# 동작 확인
python3 -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
# → True, "AMD Radeon RX 7900 GRE"
```

> ROCm은 PyTorch 안에서 `torch.cuda` API 그대로 사용. 기존 CUDA 코드 거의 그대로 작동.

---

## 3. ComfyUI 설치

```bash
cd ~
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI
source ~/ai-env/bin/activate
pip install -r requirements.txt

# 모델 폴더 구조 확인
ls models/
# checkpoints, loras, vae, upscale_models 등이 있어야 함
```

### 3-1. SDXL 베이스 + 패션 LoRA 다운로드

```bash
# SDXL 베이스 (HuggingFace 또는 CivitAI에서)
cd ~/ComfyUI/models/checkpoints
wget https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors

# 패션 LoRA (예: "fashion design" 키워드로 CivitAI 검색)
cd ~/ComfyUI/models/loras
# (CivitAI 사이트에서 적절한 LoRA를 직접 다운로드)
```

### 3-2. (선택) FLUX.1 [schnell] GGUF

```bash
# RX 7900 GRE 16GB는 FLUX dev 풀 모델이 빡빡 → schnell GGUF Q5_K_M 권장
cd ~/ComfyUI/custom_nodes
git clone https://github.com/city96/ComfyUI-GGUF.git
# requirements 설치 후 ComfyUI 재시작

# 모델 다운로드
cd ~/ComfyUI/models/diffusion_models
wget https://huggingface.co/city96/FLUX.1-schnell-gguf/resolve/main/flux1-schnell-Q5_K_M.gguf
```

### 3-3. ComfyUI 실행

```bash
cd ~/ComfyUI
source ~/ai-env/bin/activate
python main.py --listen 0.0.0.0 --port 8188
# → http://<이 PC IP>:8188 에서 웹 UI 접속
```

ComfyUI가 뜨면 두띵 백엔드 `.env` 에 다음을 채움:

```
AI_DESIGN_URL=http://<ComfyUI 서버 IP>:8188
AI_COMFYUI_WORKFLOW_DIR=/path/to/workflows
AI_TIMEOUT_MS=90000
```

---

## 4. CatVTON 설치 (가상 피팅)

### 4-1. ComfyUI 커스텀 노드로 설치

```bash
cd ~/ComfyUI/custom_nodes
git clone https://github.com/chflame163/ComfyUI_CatVTON_Wrapper.git
cd ComfyUI_CatVTON_Wrapper
pip install -r requirements.txt

# 모델 가중치 자동 다운로드 (첫 실행 시)
# 또는 수동: HuggingFace의 zhengchong/CatVTON
```

### 4-2. 마네킹/모델 사진 카탈로그 준비

CatVTON은 **옷 + 모델 사진 → 옷이 입혀진 모델 사진** 을 만드는 모델. 모델 사진(마네킹)은 미리 준비해 두고 카테고리·성별·체형·배경별로 분류.

```
/path/to/model_dir/
├── female/
│   ├── campus_01.png
│   ├── studio_01.png
│   └── ...
├── male/
│   └── ...
```

`.env` 에 경로 등록:
```
AI_TRYON_URL=http://<ComfyUI 서버 IP>:8188
AI_TRYON_MODEL_DIR=/path/to/model_dir
```

### 4-3. 워크플로우 JSON 준비

ComfyUI 웹 UI에서 한 번 시안을 돌려본 뒤 "Save (API Format)" 으로 내보내면 JSON이 생성됨. 이 JSON을 `AI_COMFYUI_WORKFLOW_DIR` 에 카테고리별로 저장:

```
/path/to/workflows/
├── varsity.json     # 과잠 디자인 생성 워크플로우
├── tshirt.json
├── try_on.json      # 가상 피팅 워크플로우
└── ...
```

JSON 안의 prompt 노드 텍스트는 백엔드가 `__PROMPT__` 같은 placeholder로 치환할 예정 (구현은 `server/src/services/ai/comfyui-design-generator.ts` 의 `// TODO` 부분).

---

## 5. 백엔드 어댑터 채우기

현재 두띵 백엔드는 `Null*` 어댑터로 시작 → 라우트가 503 반환.

GPU 셋업이 끝나면 다음 두 파일의 `// TODO` 부분을 채우면 됨:

- `server/src/services/ai/comfyui-design-generator.ts`
- `server/src/services/ai/catvton-virtual-try-on.ts`

흐름:
1. workflow JSON 로드 → 프롬프트 치환
2. `POST {AI_DESIGN_URL}/prompt` 큐잉 → `prompt_id`
3. `GET {AI_DESIGN_URL}/history/:prompt_id` 폴링 (1초 간격)
4. 결과 이미지를 `/view?filename=…` 로 다운로드
5. `server/uploads/` 또는 S3에 저장 + `design` 레코드 INSERT
6. `AiDesignResult[]` 반환

---

## 6. 동작 검증

### 6-1. 백엔드 단독 테스트

```bash
# AI 서버 미연결 상태 (Null*)
curl -i -X POST http://localhost:3000/api/ai/designs/generate \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test","productCategory":"varsity","count":3}'
# → HTTP 503 AI_UNAVAILABLE

# AI 서버 연결 상태 (어댑터 구현 후)
# → HTTP 200 { designs: [...] }
```

### 6-2. 프론트엔드 흐름

1. http://localhost:3000 → 로그인
2. 홈 → "펀드 개설" 클릭
3. Step 1: "AI로 디자인 생성" → 모달에서 프롬프트 입력 → "시안 3장 생성"
   - AI 서버 미연결 시: 안내 문구 + 직접 디자인 만들기 옵션 제공
   - 연결 시: 시안 3장 → 클릭으로 선택 → 자동 다음 단계
4. Step 2: 펀드 정보 입력
5. Step 3: "AI 모델 피팅 미리보기 생성" 버튼 (선택)
6. Step 4: 검토 후 "펀드 개설하기"

---

## 7. 비용·시간 가이드

| 항목 | 자체 호스팅 | FASHN AI 클라우드 |
|---|---|---|
| 초기 비용 | RX 7900 GRE 1대 (이미 보유 중) | $0 |
| 시안 1장 생성 시간 | SDXL 약 5초, FLUX schnell 약 8초 | 2~5초 |
| 가상 피팅 1장 시간 | CatVTON 약 10~15초 | 3~6초 |
| 한 달 1000장 비용 | 전기료 + 시간 | 약 $40~80 |
| 결과 품질 | 패션 LoRA 튜닝에 따라 | FASHN 이 더 안정적 |

> **추천**: 개발 단계에서는 FASHN AI 1주 무료 크레딧으로 워크플로우 검증 → 시연 임박 시 사장님 PC에 ComfyUI 띄우고 자체 호스팅으로 전환.

---

## 8. AMD GPU 주의사항

- **Windows + ZLUDA**: 가능하지만 일부 노드(특히 GGUF) 호환성 이슈. Linux 네이티브 ROCm 권장
- **WSL2**: RX 7900 시리즈 WSL2 ROCm은 제한적. 듀얼부팅이 안정적
- **HIP_VISIBLE_DEVICES=0**: 다중 GPU 환경에서 GPU 선택 시 사용
- **VRAM 부족 시**:
  - SDXL: `--lowvram` 또는 `--medvram` 플래그
  - FLUX: GGUF Q4_K_M 으로 더 양자화
  - CatVTON: 입력 이미지를 768x768 또는 512x768로 다운스케일
- **ROCm은 CUDA 대비 약 70~85% 속도** — 동일 GPU 라도 NVIDIA가 빠름. 그래도 16GB로 SDXL/CatVTON 안정 동작 가능.
