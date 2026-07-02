# K-Logistics — AI 기반 물류 통합 플랫폼

> **고팡(Gopang) 생태계** 위에서 동작하는 AI 물류 플랫폼.  
> 이미 이동 중인 차량의 동선에 화물을 끼워 넣어 최적의 물류 경로를 구성합니다.  
> 1·2·3차 산업 전 영역(농수산물, 제조 부품, 소비재, 의료품)을 단일 플랫폼으로 통합합니다.

🌐 **배포 주소**: [logistics.hondi.net](https://logistics.hondi.net)  
📄 **백서**: [docs/k-logistics-whitepaper.md](docs/k-logistics-whitepaper.md)  
📱 **참조 시스템**: [traffic.hondi.net](https://traffic.hondi.net) (동일 아키텍처)

---

## 디렉토리 구조

```
logistics/
│
│   ─── 진입점 & GitHub Pages 설정 ───
│   index.html                  화면 크기 감지 → desktop/webapp 라우팅
│   .nojekyll                   Jekyll 비활성화
│   CNAME                       logistics.hondi.net
│
│   ─── 클라이언트 앱 ───
│   desktop.html                데스크톱 서비스 소개 랜딩 (whitepaper·dashboard 링크)
│   webapp.html                 모바일 웹앱 (AI 물류 매칭 채팅·배송 요청·추적)
│
│   ─── 대시보드 ───
│   user-dashboard.html         사용자 물류 대시보드 (배송 이력·KPI·GDC·PDV)
│   national-dashboard.html     국가 물류 관제 대시보드 (7개 페이지)
│   realtime-board.html         실시간 물류 상황판 (Kakao Maps + OpenHash)
│
│   ─── 공통 모듈 ───
│   pdv.js                      PDV 기록 모듈 v1.0
│
│   ─── 서버 패치 ───
│   worker-kakao-patch.js       gopang-proxy Worker 패치
│                                (/kakao/appkey · /ai/chat 엔드포인트)
│
├───docs/
│       k-logistics-whitepaper.md  K-Logistics 기술 백서
│
└───prompts/
        logistics.md            DeepSeek V3 AI 물류 매칭 시스템 프롬프트
```

---

## 파일별 역할

### 클라이언트

| 파일 | 대상 | 핵심 기능 |
|------|------|----------|
| `desktop.html` | 운영자·정책 담당자 | 서비스 소개, 차별점 비교표, 대시보드·webapp 링크 |
| `webapp.html` | 스마트폰 이용자 | AI 물류 채팅 매칭, 배송 요청, 실시간 추적, PDV 기록 |
| `user-dashboard.html` | 개인 발송자 | 내 배송 이력, GDC 지출, OpenHash 증빙 조회 |
| `national-dashboard.html` | 정책 결정자·관리자 | 전국 7개 페이지 물류 현황 관제 (Kakao Maps 포함) |
| `realtime-board.html` | 물류 관제 센터 | Kakao Maps 실시간 차량·허브·이상 탐지 상황판 |

### 공통 모듈 & 서버

| 파일 | 역할 |
|------|------|
| `pdv.js` | 배송 요청·출발·완료·릴레이·온도 경보·평가 → gopang-proxy → Supabase |
| `worker-kakao-patch.js` | Cloudflare Worker `/kakao/appkey`, `/ai/chat` 엔드포인트 (traffic 공용) |

---

## 핵심 아키텍처

```
클라이언트 (5개 HTML)
        │
        ▼
gopang-proxy (Cloudflare Workers)
        ├─ /pdv/report     → Supabase (배송 기록)
        ├─ /ai/chat        → DeepSeek V3 Pro → Claude 폴백
        └─ /kakao/appkey   → Kakao Maps SDK 동적 로드
        │
        ▼
Openhash Network
 L1(읍면동) → L2(시군구) → L3(광역) → L4(국가) → L5(글로벌)
        │
        ▼
고팡 블랙박스 탑재 차량 (1분 단위 위치·동선 전송)
        │
        ▼
K-Tax 연동 (수출입 통관·세금계산서 자동 발행)
K-Health 연동 (의료·방역 긴급 물류 우선 배분)
```

---

## PDV 이벤트 유형

| 이벤트 | 메서드 | 설명 |
|--------|--------|------|
| `logistics_ship_request` | `PDV.writeShipRequest()` | 배송 요청 |
| `logistics_ship_start` | `PDV.writeShipStart()` | 수령 출발 |
| `logistics_ship_end` | `PDV.writeShipEnd()` | 배달 완료 + GDC 결제 |
| `logistics_relay` | `PDV.writeRelay()` | 릴레이 인수인계 |
| `logistics_temp_alert` | `PDV.writeTempAlert()` | 냉장 온도 이탈 |
| `logistics_delivery_confirm` | `PDV.writeDeliveryConfirm()` | 수취인 확인 |
| `logistics_rating` | `PDV.writeRating()` | 상호 평가 |
| `logistics_cargo_alert` | `PDV.writeCargoAlert()` | 화물 이상 신고 |
| `logistics_consult` | `PDV.writeConsult()` | AI 상담 기록 |

---

## 빠른 시작

### 1. Cloudflare Worker 패치

`worker-kakao-patch.js` (traffic과 동일 파일 공용):

```javascript
if (url.pathname === '/kakao/appkey') return handleKakaoAppKey(request, env);
if (url.pathname === '/ai/chat')      return handleAIChat(request, env);
```

### 2. 환경 변수 확인

| 이름 | 용도 | 상태 |
|------|------|------|
| `DEEPSEEK_API_KEY` | DeepSeek V3 AI | ✅ 설정됨 |
| `KAKAO_REST_KEY` | Kakao REST API | ✅ 설정됨 |
| `KAKAO_JS_KEY` | Kakao Maps JS SDK | ⚠️ 추가 필요 |
| `SUPABASE_KEY` | PDV 로그 DB | ✅ 설정됨 |

> `KAKAO_JS_KEY`: [developers.kakao.com](https://developers.kakao.com) → 앱 키 → **JavaScript 키**

### 3. Kakao Developers 플랫폼 등록

> 앱 → 플랫폼 → Web → `https://logistics.hondi.net` 추가

### 4. 배포

```bash
git add .
git commit -m "feat: K-Logistics 전체 파일셋 (traffic 패턴 적용)"
git push origin main
```

---

## K-Traffic vs K-Logistics 차이점

| 항목 | K-Traffic | K-Logistics |
|------|-----------|-------------|
| 수요 유형 | 사람의 이동 | 물자의 이동 |
| svc ID | `traffic` | `logistics` |
| 핵심 PDV | 탑승 시작/완료/평가 | 배송 요청/완료/릴레이/온도 경보 |
| 냉장 관리 | 없음 | IoT 온도 모니터링 |
| 연동 시스템 | K-Traffic (인프라) | K-Tax (통관), K-Health (의료품) |
| AI 프롬프트 | `prompts/traffic.md` | `prompts/logistics.md` |
| 색상 브랜드 | 파란색 (`#2563eb`) | 녹색 (`#3ecf8e`, 고팡 표준) |

---

## 연관 고팡 서브시스템

| 시스템 | 도메인 | 상태 |
|--------|--------|------|
| K-Logistics | logistics.hondi.net | ✅ 운영 중 |
| K-Traffic | traffic.hondi.net | ✅ 운영 중 |
| K-Tax | tax.hondi.net | ✅ 운영 중 (통관 연동) |
| K-Health | health.hondi.net | ✅ 운영 중 (의료 물류 연동) |
| K-Market | market.hondi.net | ✅ 운영 중 |
| K-Police | police.hondi.net | ✅ 운영 중 |

---

*© 2026 AI City Inc. · Jeju, Korea — K-Logistics Team*
