/**
 * Keeply 도메인 용어집 (초안).
 *
 * apps/agent/src/intents/get-ask-intent.ts 의 시스템 프롬프트에 삽입되어, 기획자의 한국어 질문을
 * Keeply-Server / Keeply-client 저장소의 실제 코드 식별자와 매핑하는 데 쓰인다.
 *
 * 아래 매핑은 /Users/huniverse/Desktop/itc_Keeply/keeply-server 와
 * /Users/huniverse/Desktop/itc_Keeply/keeply-client 코드를 직접 읽고 확인한 용어만 포함했다.
 * 두 저장소의 도메인이 바뀌면(신규 기능 추가, 패키지 이름 변경 등) 이 파일도 함께 갱신해야 한다.
 */
export const PROJECT_CONTEXT = `
Keeply는 매장(가게) 직원들이 유통기한 관리, 공지사항, 근무 인수인계를 한 곳에서 처리하는 매장 운영 협업 서비스다.

- Keeply-Server: Spring Boot(Kotlin/Java) 기반 REST API 서버. 인증, 매장(그룹) 관리, 유통기한 물품, 공지, 근무 일지, 파일 업로드를 담당한다.
- Keeply-client: React + Vite 기반 웹 프런트엔드. 매장 직원이 실제로 사용하는 화면(홈, 근무 공간, 관리, 마이페이지 등)을 제공한다.

한국어 기능 용어 ↔ 코드 식별자 매핑:
- 유통기한 물품 관리 ↔ server: com.keeply.expiry 패키지, ExpiryItem 엔티티(테이블 expiry_items), ExpiryItemController(/groups/{groupId}/expiry-items) · client: src/entities/disposal, DisposalItem 타입, ROUTE_PATH.MANAGEMENT
- 폐기(물품 폐기) ↔ client: src/features/disposal-write, DisposalItem.category, ROUTE_PATH.MANAGEMENT_WRITE
- 매장/그룹 관리 ↔ server: com.keeply.group 패키지, Group 엔티티(테이블 store_groups), GroupController(/groups), GroupMemberController(/groups/{groupId}/members), GroupRole, StoreBrand · client: src/entities/group
- 초대 코드 ↔ server: GroupController의 PATCH /groups/me/invite-code · client: ROUTE_PATH.MYPAGE_INVITE, src/pages/my-page/invite
- 공지사항 ↔ server: com.keeply.notice 패키지, Notice 엔티티(테이블 notices), NoticeController(/groups/{groupId}/notices), NoticeTag · client: src/entities/announcement, Announcement 타입, ROUTE_PATH.ANNOUNCEMENT_WRITE
- 근무 일지/인수인계 ↔ server: com.keeply.worklog 패키지, WorkLog 엔티티(테이블 work_logs), WorkLogController(/groups/{groupId}/work-logs) · client: src/entities/working-space, WorkingLog 타입, ROUTE_PATH.WORKING_SPACE
- 회원/사용자 ↔ server: com.keeply.user 패키지, User 엔티티(테이블 users), UserController(/users/me) · client: src/entities/user, UserResponse 타입
- 로그인/인증(카카오 로그인) ↔ server: com.keeply.auth 패키지, AuthController(/auth/kakao/callback, /auth/refresh, /auth/logout), RefreshToken 엔티티 · client: src/features/auth, ROUTE_PATH.LOGIN, ROUTE_PATH.LOGIN_CALLBACK
- 온보딩(최초 가입 플로우, 점주/직원 구분) ↔ server: com.keeply.onboarding 패키지, OnboardingController(/onboarding/owner, /onboarding/staff) · client: src/features/onboarding, ROUTE_PATH.ONBOARDING
- 파일 업로드(이미지 등) ↔ server: com.keeply.file 패키지, FileController(/files/presigned-url)
- 회원 탈퇴 ↔ client: ROUTE_PATH.MYPAGE_WITHDRAW, src/pages/my-page/withdraw · server: UserController의 DELETE /users/me
`.trim();
