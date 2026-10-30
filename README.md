# 한자 사전 (Hanja Search PWA)

iPhone 및 iPad에서 사용할 수 있는 **완전 무료 / 오프라인 지원 한자 사전 PWA 웹앱**입니다.

Apple Developer 계정($99/년)과 Xcode 없이, Safari에서 **"홈 화면에 추가"**하면 네이티브 앱처럼 전체 화면으로 사용할 수 있습니다.

---

## 🌟 주요 기능

1. **✍️ 실시간 필기 한자 검색 (Handwriting Recognition)**
   - 화면에 손가락이나 Apple Pencil로 한자를 쓰면 실시간으로 획(Stroke)을 분석하여 유사한 한자 후보(최대 10개)를 추천합니다.
   - 후보 한자를 터치하면 **훈(뜻), 음(소리), 총 획수, 영문 정의, 유니코드**가 즉시 표시됩니다.
   - **획 취소(Undo)** 및 **전체 지우기(Clear)** 지원.
   - Open Source CJK 스트로크 분석 엔진(`HanziLookupJS` + `Make Me a Hanzi` 9,000+ 벡터 데이터셋) 탑재.

2. **🔍 한글 음·훈·단어 검색 (Hangul & Word Lookup)**
   - 한글 음으로 찾기: 예) `학` 입력 시 `學`(배울 학), `鶴`(두루미 학) 등 표시
   - 한글 훈으로 찾기: 예) `배울` 입력 시 `學`(배울 학) 표시
   - 단어로 찾기: 예) `학교` 입력 시 '학', '교' 음절별 대표 한자 분해 표시
   - 한자 직접 입력: 복사한 한자(`學`)를 넣으면 즉시 상세 정보 표시
   - 유니코드 Unihan DB + 국립국어원/libhangul 표준 데이터 27,826자 완벽 수록

3. **🔊 부가 편의 기능**
   - **한국어 발음 재생 (TTS)**: 음성으로 훈/음을 들려줍니다.
   - **클립보드 한자 복사**: 원클릭으로 한자 복사.
   - **⭐ 즐겨찾기(Favorites)**: 자주 찾는 한자를 저장하고 모아보기.
   - **다크 모드(Dark Mode)** 자동 지원.

4. **📱 오프라인 PWA (Progressive Web App)**
   - Service Worker를 통해 앱 셸과 데이터가 브라우저에 자동 캐싱됩니다.
   - 최초 1회 접속 후에는 **비행기 모드나 데이터/와이파이 없는 상태에서도 100% 동작**합니다.

---

## 🚀 로컬 실행 방법 (지금 바로 테스트하기)

터미널에서 아래 명령을 실행합니다:

```bash
cd /Users/askum/workspace_gemini/hanja_search
./start.sh
```

- **Mac 브라우저**: [http://localhost:8080](http://localhost:8080) 접속
- **iPhone / iPad**: Mac과 같은 Wi-Fi에 연결된 상태에서 Safari를 열고 터미널에 출력된 IP 주소(예: `http://192.168.x.x:8080`)로 접속

### 📲 iPhone/iPad에서 앱으로 설치하기
1. Safari에서 해당 주소로 접속합니다.
2. Safari 하단의 **공유 버튼(네모에 위쪽 화살표 `⎋`)**을 누릅니다.
3. 메뉴에서 **"홈 화면에 추가"**를 누릅니다.
4. 홈 화면에 **'한자사전' 앱 아이콘**이 생기며, 실행 시 브라우저 주소창 없이 **진짜 네이티브 앱처럼 전체 화면으로 실행**됩니다!

---

## 🌐 무료 웹 호스팅 배포 (언제 어디서나 접속하기)

### 방법 1: GitHub Pages (가장 추천 - 완전 무료)
1. GitHub에 새 저장소(`hanja-search`)를 만듭니다.
2. 코드를 푸시합니다:
   ```bash
   git init
   git add .
   git commit -m "Initial Hanja Search PWA"
   git branch -M main
   git remote add origin https://github.com/사용자아이디/hanja-search.git
   git push -u origin main
   ```
3. GitHub 저장소의 **Settings → Pages** 메뉴에서 Source를 `Deploy from a branch (main)`로 설정하고 저장합니다.
4. 1~2분 뒤 부여되는 주소(예: `https://사용자아이디.github.io/hanja-search/`)로 iPhone/iPad에서 접속하여 "홈 화면에 추가"하면 끝납니다!

### 방법 2: Netlify 또는 Vercel (드래그 앤 드롭 무료 호스팅)
- Netlify 사이트에 로그인 후 폴더를 드래그 앤 드롭하기만 하면 5초 만에 무료 HTTPS URL이 생성됩니다.

---

## 📁 프로젝트 구조

```
hanja_search/
├── index.html           # 메인 UI (반응형 모바일 레이아웃 & 캔버스)
├── manifest.json        # PWA 매니페스트 (홈화면 아이콘 및 앱 설정)
├── sw.js                # 서비스 워커 (오프라인 캐싱 엔진)
├── start.sh             # 로컬 테스트용 실행 스크립트
├── css/
│   └── style.css        # 모바일 최적화 및 다크모드 스타일시트
├── js/
│   └── app.js           # 캔버스 터치 필기 드로잉 & 사전 검색 엔진 로직
├── lib/
│   └── hanzilookup.min.js # HanziLookupJS CJK 필기 인식 라이브러리
├── data/
│   ├── hanja_dict.json  # 27,826자 한자 사전 (훈/음/획수/영문정의)
│   └── mmah.json        # Make Me a Hanzi 필기 스트로크 벡터 데이터 (9,507자)
└── icons/               # 180px, 192px, 512px 앱 아이콘
```
