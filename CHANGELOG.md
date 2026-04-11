# Changelog

이 문서는 `Thumbi`의 버전별 변경 사항을 추적하기 위한 인덱스다.
간단한 요약은 여기 남기고, 상세 구현 명세는 `docs/versions/` 아래 버전 문서를 참조한다.

## [1.0.0] - 2026-04-11

상세 문서: [docs/versions/1.0.0.md](./docs/versions/1.0.0.md)

### Added

- `Expo + React Native + TypeScript` 기반 로컬 전용 Android 앱 초기 구축
- `엄지 업 / 엄지 다운` 기록 입력과 메모 입력
- `AsyncStorage` 기반 기기 로컬 저장
- `오늘 / 주간 / 월간 / 분기` 집계
- `월 / 분기 / 년` 기준 최고 상승 / 최고 하락 기록 집계
- `월간 달력`과 날짜별 상세 보기
- 특정 날짜 기록 `초기화` 기능
- 최근 입력 `undo snackbar`
- 버튼 `롱프레스` 시 `1초마다 5건` 반복 입력
- 하단 탭 구조: `업다운 / 달력 / 통계`
- 앱 아이콘, adaptive icon, splash, favicon 커스텀 자산
- Android 네이티브 프로젝트 생성 및 독립 실행 APK 설치 가능 상태 구성

### Changed

- 메인 화면 문구를 제품 톤으로 단순화
- 기능 설명을 메인 카피에서 제거하고 앱 이름 옆 `i` 버튼 모달로 이동
- 빨간 상승 / 파란 하락 색 문법으로 UI와 아이콘 통일

### Notes

- 현재 `package.json` 버전은 `1.0.0`
- 현재 Android 패키지명은 `com.infini.thumbi`
- 현재 릴리즈 APK 산출 경로는 `android/app/build/outputs/apk/release/app-release.apk`
