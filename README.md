# Aid Project Map

정적 웹앱으로 d-portal의 공개 `q.json` 데이터를 불러와 IATI aid project 위치를 지도에 표시합니다.

## 실행

브라우저에서 `index.html`을 열거나, 로컬 서버를 띄워 확인합니다.

```powershell
python -m http.server 8080
```

그 다음 `http://localhost:8080`으로 접속합니다.

## 데이터

- 기본 쿼리: `https://d-portal.org/q.json?from=act,location`
- 수원국 필터 쿼리: `https://d-portal.org/q.json?from=act,location,country`
- 위치 필드: `location_latitude`, `location_longitude`
- 활동 필드: `aid`, `title`, `reporting`, `reporting_ref`, `funder_ref`, `country_code`, `status_code`, `day_start`, `day_end`, `commitment`
- d-portal의 CORS 헤더가 `Access-Control-Allow-Origin: *`라서 브라우저에서 직접 호출합니다.

대량 데이터를 한 번에 모두 불러오면 브라우저가 느려질 수 있어 500~2000개 단위로 페이지네이션합니다.
수원국, 상태, 공여국/기관, 프로젝트 규모 필터는 불러온 데이터에 즉시 적용됩니다.
첫 화면은 중복 위치가 적은 `day_start-` 정렬로 불러옵니다.
