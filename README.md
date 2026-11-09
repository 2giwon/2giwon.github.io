# 2giwon.github.io

https://2giwon.github.io/ 는 **나만 보는 작업노트**입니다. 이 repo 에는 화면 코드만 있고 문서는 한 글자도 없습니다.
브라우저가 사용자가 넣은 GitHub 토큰으로 비공개 문서 repo 를 직접 읽어 그 자리에서 그림으로 그립니다. 토큰이 없으면 토큰 입력 화면만 보입니다.

공개 블로그 [안드로이드 위클리 공부 노트](https://2giwon.github.io/android-weekly-study/)는 [2giwon/android-weekly-study](https://github.com/2giwon/android-weekly-study)에 있고, 주소는 그대로입니다.

## 명령

```bash
node --test test/*.test.mjs                       # 테스트 (디렉터리 대신 파일을 명시해야 Node 22에서도 돈다)
python3 -m http.server 5300                        # 로컬에서 띄우기 → http://localhost:5300/
node tools/notes-status.mjs <문서repo경로>          # 그림이 없거나 오래된 문서 목록 (그림 갱신 순서)
node tools/notes-check.mjs <문서repo경로>           # 그림 데이터 형식 검사
```

`package.json` 이 없다. 일부러다 — Node 내장 기능과 `vendor/` 고정 파일만 쓴다. 배포는 Pages legacy(main 루트 그대로)다.
