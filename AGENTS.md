# Thumbi Working Notes

## Stack

- Expo
- React Native
- TypeScript
- Android

## Completion Routine

- 코드 작업이 끝나면 반드시 `npx tsc --noEmit`로 타입 검증을 먼저 수행한다.
- 검증이 끝나면 반드시 Android 빌드를 생성한다.
- 빌드가 성공하면 연결된 실제 단말에 최신 빌드를 설치한다.
- 설치까지 끝나면 변경 사항을 Git에 커밋하고 원격 저장소로 푸시한다.
- 빌드, 설치, 푸시 중 하나라도 실패하면 실패 지점과 원인을 사용자에게 바로 보고한다.

## Android Delivery Default

- 기본 빌드 경로는 `android/app/build/outputs/apk/release/app-release.apk`를 우선 사용한다.
- 기본 설치 방식은 `adb install -r`를 사용한다.
