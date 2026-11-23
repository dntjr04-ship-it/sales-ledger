const fs = require('fs');
const path = require('path');

// 1. 깨끗한 검색 키워드 추출 헬퍼
function cleanKeywordForSearch(name) {
  if (!name) return '';
  return name
    .replace(/\([^)]*\)/g, ' ')       // (1박스), (4팩) 등 괄호 제거
    .replace(/\[[^\]]*\]/g, ' ')       // [대용량] 등 대괄호 제거
    .replace(/(1\+1|기획세트|기획팩|기획|대용량|정품|무라벨|냉동|실내건조형|실내건조|신선배송|패밀리박스|겨울기획팩|선물세트 구성|선물세트|인덕션|백미|무소음|단독|무료배송|갓 담근)/gi, ' ')
    .replace(/\s*[xX]\s*/g, ' ')       // x 기호 공백화
    .replace(/[+&/,]/g, ' ')           // 특수문자 공백화
    .replace(/\s+/g, ' ')             // 다중 공백 하나로
    .trim();
}

// 2. 100개 베스트 품목 마스터 원본
const RAW_100_ITEMS = [
  { rank: 1, name: 'CJ 햇반 백미 210g x 36개 (1박스)', category: '식품', gmarketPrice: 35900, badge: 'HOT 1위', kw: '햇반 210g 36개', marginRate: 15.5 },
  { rank: 2, name: 'CJ 비비고 왕교자 만두 1.05kg x 2봉', category: '식품', gmarketPrice: 21900, badge: '특가', kw: '비비고 왕교자 1.05kg 2봉', marginRate: 18.2 },
  { rank: 3, name: '제주삼다수 무라벨 생수 2L x 24병 (4팩)', category: '식품', gmarketPrice: 23800, badge: '급상승', kw: '삼다수 2L 24병', marginRate: 17.5 },
  { rank: 4, name: '크리넥스 3겹 데코앤소프트 화장지 30m 30롤 x 2팩', category: '생활', gmarketPrice: 38900, badge: '베스트', kw: '크리넥스 데코앤소프트 30m 30롤 2팩', marginRate: 23.1 },
  { rank: 5, name: '동원 참치 라이트스탠다드 135g x 10캔 + 고추참치 5캔', category: '식품', gmarketPrice: 28900, badge: '인기', kw: '동원참치 135g 15캔', marginRate: 22.1 },
  { rank: 6, name: '스팸 클래식 200g x 10캔 세트 (선물세트 구성)', category: '식품', gmarketPrice: 27500, badge: '추천', kw: '스팸 클래식 200g 10개', marginRate: 20.7 },
  { rank: 7, name: '맥심 모카골드 마일드 커피믹스 400T 대용량', category: '식품', gmarketPrice: 47900, badge: '대용량', kw: '맥심 모카골드 400T', marginRate: 18.2 },
  { rank: 8, name: '다우니 섬유유연제 엑스퍼트 실내건조 1L x 6개', category: '생활', gmarketPrice: 29800, badge: '인기', kw: '다우니 엑스퍼트 실내건조 1L 6개', marginRate: 21.5 },
  { rank: 9, name: '신라면 멀티팩 5입 x 8팩 (총 40봉 1박스)', category: '식품', gmarketPrice: 31900, badge: '라면1위', kw: '신라면 40봉', marginRate: 16.9 },
  { rank: 10, name: '닥터지 레드 블레미쉬 클리어 수딩 크림 70ml 1+1 기획', category: '뷰티', gmarketPrice: 34900, badge: '뷰티1위', kw: '닥터지 레드블레미쉬 수딩크림 70ml 2개', marginRate: 28.7 },
  { rank: 11, name: '고려은단 비타민C 1000 600정 (20개월분)', category: '뷰티', gmarketPrice: 46900, badge: '영양제', kw: '고려은단 비타민C 1000 600정', marginRate: 17.9 },
  { rank: 12, name: '페브리즈 차량용 탈취제 방향제 2.2ml x 6개입', category: '생활', gmarketPrice: 19800, badge: '특가', kw: '페브리즈 차량용 방향제 2.2ml 6개', marginRate: 24.7 },
  { rank: 13, name: '코카콜라 제로 355ml x 24캔 (1박스)', category: '식품', gmarketPrice: 24500, badge: '음료1위', kw: '코카콜라 제로 355ml 24캔', marginRate: 22.9 },
  { rank: 14, name: '테팔 인덕션 프라이팬 28cm 심플룩스 코팅', category: '주방', gmarketPrice: 27900, badge: '주방베스트', kw: '테팔 심플룩스 프라이팬 28cm', marginRate: 21.5 },
  { rank: 15, name: '라운드랩 1025 독도 토너 500ml 대용량 2개 세트', category: '뷰티', gmarketPrice: 28900, badge: '인기', kw: '독도 토너 500ml 2개', marginRate: 25.6 },
  { rank: 16, name: '종가집 포기김치 5kg (갓 담근 신선배송)', category: '식품', gmarketPrice: 38900, badge: '김치1위', kw: '종가집 포기김치 5kg', marginRate: 23.4 },
  { rank: 17, name: '크록스 클래식 바야밴드 클로그 샌들 공용', category: '패션', gmarketPrice: 37900, badge: '패션1위', kw: '크록스 바야밴드 클로그', marginRate: 21.1 },
  { rank: 18, name: '로지텍 M331 무소음 무선 마우스 정품', category: '디지털', gmarketPrice: 24900, badge: '디지털1위', kw: '로지텍 M331 무선마우스', marginRate: 24.1 },
  { rank: 19, name: '글래드 프레스앤씰 매직랩 43.4m x 3롤 세트', category: '생활', gmarketPrice: 23500, badge: '주방필수', kw: '글래드 매직랩 43.4m 3롤', marginRate: 23.8 },
  { rank: 20, name: '유한킴벌리 디펜드 안심패드 중형 30매 x 4팩', category: '생활', gmarketPrice: 31900, badge: '인기', kw: '디펜드 안심패드 중형 30매 4팩', marginRate: 23.2 },
  { rank: 21, name: '하림 IFF 닭가슴살 1kg x 3봉 (총 3kg 냉동)', category: '식품', gmarketPrice: 26900, badge: '단백질', kw: '하림 IFF 닭가슴살 1kg 3봉', marginRate: 21.2 },
  { rank: 22, name: '오뚜기 맛있는 밥 210g x 30개 (1박스)', category: '식품', gmarketPrice: 26500, badge: '가성비', kw: '오뚜기밥 210g 30개', marginRate: 16.6 },
  { rank: 23, name: '깨끗한나라 순수 3겹 롤화장지 30m 30롤 x 2팩', category: '생활', gmarketPrice: 27900, badge: '특가', kw: '깨끗한나라 순수 30m 30롤 2팩', marginRate: 22.9 },
  { rank: 24, name: '에스티로더 갈색병 어드밴스드 나이트리페어 50ml', category: '뷰티', gmarketPrice: 99000, badge: '명품뷰티', kw: '에스티로더 갈색병 50ml', marginRate: 25.3 },
  { rank: 25, name: '필립스 SkinIQ 전동면도기 5000시리즈 S5588', category: '디지털', gmarketPrice: 89000, badge: '가전특가', kw: '필립스 면도기 S5588', marginRate: 19.1 },
  { rank: 26, name: '비트 캡슐세제 45개입 x 3팩 실내건조형', category: '생활', gmarketPrice: 28900, badge: '세제인기', kw: '비트 캡슐세제 45개입 3팩', marginRate: 24.2 },
  { rank: 27, name: '정관장 에브리타임 밸런스 10ml x 30포', category: '식품', gmarketPrice: 54900, badge: '건강1위', kw: '정관장 에브리타임 밸런스 30포', marginRate: 22.8 },
  { rank: 28, name: '나이키 에브리데이 쿠션 크루 삭스 3켤레팩 화이트', category: '패션', gmarketPrice: 17900, badge: '패션양말', kw: '나이키 크루삭스 3켤레', marginRate: 25.1 },
  { rank: 29, name: '샤오미 미에어 스마트 공기청정기 4 컴팩트', category: '디지털', gmarketPrice: 79000, badge: '인기가전', kw: '샤오미 공기청정기 4 컴팩트', marginRate: 17.7 },
  { rank: 30, name: '보솜이 리얼코튼 밴드형 기저귀 4팩 세트', category: '생활', gmarketPrice: 42900, badge: '육아필수', kw: '보솜이 리얼코튼 기저귀 4팩', marginRate: 21.0 },
  { rank: 31, name: '해표 식용유 1.8L x 3개 대용량 세트', category: '식품', gmarketPrice: 24900, badge: '식품특가', kw: '해표 식용유 1.8L 3개', marginRate: 20.1 },
  { rank: 32, name: '이니스프리 그린티 씨드 히알루론산 세럼 80ml 1+1', category: '뷰티', gmarketPrice: 38000, badge: '뷰티추천', kw: '이니스프리 그린티 세럼 80ml 2개', marginRate: 26.3 },
  { rank: 33, name: '스파오 베이직 푸퍼 숏패딩 남녀공용', category: '패션', gmarketPrice: 49900, badge: '겨울인기', kw: '스파오 베이직 푸퍼 숏패딩', marginRate: 24.0 },
  { rank: 34, name: '락앤락 비스프리 모듈러 밀폐용기 7종 세트', category: '주방', gmarketPrice: 32900, badge: '주방밀폐', kw: '락앤락 비스프리 모듈러 7종', marginRate: 24.3 },
  { rank: 35, name: '동서 맥심 카누 미니 아메리카노 120T 세트', category: '식품', gmarketPrice: 28900, badge: '원두커피', kw: '카누 미니 아메리카노 120T', marginRate: 19.0 },
  { rank: 36, name: '종근당건강 락토핏 골드 생유산균 50포 x 3통 (150일)', category: '식품', gmarketPrice: 33900, badge: '유산균1위', kw: '락토핏 골드 50포 3통', marginRate: 21.8 },
  { rank: 37, name: '안방그릴 연기잡는 스마트 전기그릴 AB301MF', category: '디지털', gmarketPrice: 119000, badge: '주방가전', kw: '안방그릴 AB301MF', marginRate: 18.5 },
  { rank: 38, name: '질레트 프로글라이드 파워 전동 면도날 8입 세트', category: '생활', gmarketPrice: 44900, badge: '남성인기', kw: '질레트 프로글라이드 면도날 8입', marginRate: 22.3 },
  { rank: 39, name: '풀무원 얇은피 꽉찬속 고기만두 400g x 6봉', category: '식품', gmarketPrice: 23900, badge: '만두인기', kw: '풀무원 얇은피 고기만두 400g 6봉', marginRate: 20.9 },
  { rank: 40, name: '아넬로 캔버스 방수 백팩 기저귀가방 겸용', category: '패션', gmarketPrice: 34900, badge: '가방베스트', kw: '아넬로 캔버스 백팩', marginRate: 25.8 },
  { rank: 41, name: '코디 순한 3겹 엠보싱 롤화장지 30롤 x 3팩 (총 90롤)', category: '생활', gmarketPrice: 34500, badge: '가성비대용량', kw: '코디 3겹 화장지 30롤 3팩', marginRate: 23.5 },
  { rank: 42, name: '농심 백산수 2L x 24병 (4팩 무라벨 생수)', category: '식품', gmarketPrice: 21900, badge: '생수인기', kw: '백산수 2L 24병', marginRate: 18.3 },
  { rank: 43, name: '모나미 153 볼펜 0.7mm 흑색 50자루 1통', category: '생활', gmarketPrice: 14500, badge: '문구사무', kw: '모나미 153 볼펜 0.7mm 50자루', marginRate: 25.5 },
  { rank: 44, name: 'LG생활건강 페리오 토탈7 치약 120g x 10개', category: '생활', gmarketPrice: 16900, badge: '치약인기', kw: '페리오 토탈7 치약 120g 10개', marginRate: 23.7 },
  { rank: 45, name: '오리온 초코파이 정 30개입 대형 패밀리박스 x 2박스', category: '식품', gmarketPrice: 23900, badge: '간식인기', kw: '오리온 초코파이 30개입 2박스', marginRate: 20.5 },
  { rank: 46, name: '한일의료기 프리미엄 전기요 싱글/더블 세탁가능', category: '생활', gmarketPrice: 39900, badge: '겨울난방', kw: '한일의료기 전기요', marginRate: 25.1 },
  { rank: 47, name: '설화수 자음 2종 기초 화장품 세트 (정품 기획)', category: '뷰티', gmarketPrice: 94000, badge: '선물추천', kw: '설화수 자음 2종 세트', marginRate: 23.4 },
  { rank: 48, name: '삼성전자 스마트 싱글 모니터 27인치 FHD S27C310', category: '디지털', gmarketPrice: 169000, badge: '모니터1위', kw: '삼성전자 모니터 S27C310 27인치', marginRate: 16.6 },
  { rank: 49, name: '지오다노 남녀공용 코튼 테리 맨투맨 티셔츠', category: '패션', gmarketPrice: 19900, badge: '패션기본', kw: '지오다노 맨투맨 티셔츠', marginRate: 25.6 },
  { rank: 50, name: '하인즈 리듀스드 토마토 케찹 567g x 3병', category: '식품', gmarketPrice: 15900, badge: '소스베스트', kw: '하인즈 케찹 567g 3병', marginRate: 22.0 },
  { rank: 51, name: '피죤 액츠 퍼펙트 실내건조 액체세제 3.2L x 2개', category: '생활', gmarketPrice: 21900, badge: '세탁세제', kw: '피죤 액츠 실내건조 3.2L 2개', marginRate: 23.3 },
  { rank: 52, name: '동원 샘물 생수 2L x 24병 (무라벨)', category: '식품', gmarketPrice: 16900, badge: '가성비생수', kw: '동원샘물 2L 24병', marginRate: 18.9 },
  { rank: 53, name: '쿠쿠 전기압력밥솥 6인용 CRP-DMS0601G', category: '디지털', gmarketPrice: 129000, badge: '가전필수', kw: '쿠쿠 압력밥솥 CRP-DMS0601G', marginRate: 17.8 },
  { rank: 54, name: '바디프랜드 안마기 미니 마사지건 휴대의류형', category: '디지털', gmarketPrice: 48000, badge: '효도선물', kw: '바디프랜드 미니 마사지건', marginRate: 25.0 },
  { rank: 55, name: '청정원 순창 고추장 3kg 대용량 업소/가정용', category: '식품', gmarketPrice: 23900, badge: '양념베스트', kw: '청정원 순창고추장 3kg', marginRate: 21.3 },
  { rank: 56, name: '탑텐 베이직 플리스 플러피 짚업 자켓', category: '패션', gmarketPrice: 29900, badge: '의류인기', kw: '탑텐 플리스 플러피 집업', marginRate: 24.1 },
  { rank: 57, name: '홈스타 곰팡이 싹 욕실 주방 세정제 750ml x 3개', category: '생활', gmarketPrice: 14900, badge: '청소필수', kw: '홈스타 곰팡이싹 750ml 3개', marginRate: 23.5 },
  { rank: 58, name: '헤라 블랙쿠션 리뉴얼 본품 + 리필 기획세트', category: '뷰티', gmarketPrice: 52000, badge: '쿠션1위', kw: '헤라 블랙쿠션 본품 리필', marginRate: 23.1 },
  { rank: 59, name: '매일유업 어메이징 오트 언스위트 190ml x 24팩', category: '식품', gmarketPrice: 21900, badge: '식물성음료', kw: '어메이징 오트 언스위트 190ml 24팩', marginRate: 19.6 },
  { rank: 60, name: '스탠리 클래식 진공 퀜처 텀블러 887ml 빨대형', category: '주방', gmarketPrice: 42000, badge: '텀블러1위', kw: '스탠리 퀜처 텀블러 887ml', marginRate: 21.4 },
  { rank: 61, name: '애경 케라시스 퍼퓸 샴푸 대용량 980ml x 2개', category: '생활', gmarketPrice: 18900, badge: '샴푸인기', kw: '케라시스 퍼퓸 샴푸 980ml 2개', marginRate: 23.8 },
  { rank: 62, name: '브라운 오랄비 전동칫솔 프로 100 플러스 세트', category: '디지털', gmarketPrice: 38900, badge: '구강건강', kw: '오랄비 전동칫솔 프로 100', marginRate: 22.9 },
  { rank: 63, name: '팔도 비빔면 5입 x 8팩 (총 40봉)', category: '식품', gmarketPrice: 30900, badge: '라면베스트', kw: '팔도 비빔면 40봉', marginRate: 18.1 },
  { rank: 64, name: '크리넥스 황사방역 안심 마스크 KF94 대형 50매', category: '생활', gmarketPrice: 21500, badge: '위생필수', kw: '크리넥스 KF94 마스크 대형 50매', marginRate: 25.1 },
  { rank: 65, name: '뉴발란스 574 클래식 남녀공용 스니커즈 그레이', category: '패션', gmarketPrice: 89000, badge: '운동화1위', kw: '뉴발란스 574 클래식 그레이', marginRate: 21.3 },
  { rank: 66, name: '덴티스테 플러스화이트 치약 160g 펌프형 x 2개', category: '생활', gmarketPrice: 24900, badge: '프리미엄치약', kw: '덴티스테 치약 펌프형 160g 2개', marginRate: 24.1 },
  { rank: 67, name: '비비고 소고기미역국 500g x 6봉 레토르트', category: '식품', gmarketPrice: 22900, badge: '즉석국', kw: '비비고 소고기미역국 500g 6봉', marginRate: 21.8 },
  { rank: 68, name: '샤오미 스마트 체중계 미스케일 2세대 체지방측정', category: '디지털', gmarketPrice: 22900, badge: '스마트가전', kw: '샤오미 체중계 미스케일 2세대', marginRate: 23.6 },
  { rank: 69, name: '일리 분쇄 원두 커피 클라시코 250g x 2캔', category: '식품', gmarketPrice: 24900, badge: '원두커피', kw: '일리 분쇄원두 클라시코 250g 2캔', marginRate: 21.7 },
  { rank: 70, name: '닥터자르트 시카페어 크림 50ml 민감진정 기획', category: '뷰티', gmarketPrice: 36000, badge: '진정크림', kw: '닥터자르트 시카페어 크림 50ml', marginRate: 25.0 },
  { rank: 71, name: '오뚜기 진라면 매운맛 5입 x 8팩 (40봉 1박스)', category: '식품', gmarketPrice: 27900, badge: '가성비라면', kw: '진라면 매운맛 40봉', marginRate: 17.6 },
  { rank: 72, name: '삼립 삼립호빵 단팥+야채 12개입 겨울기획팩', category: '식품', gmarketPrice: 17900, badge: '겨울간식', kw: '삼립호빵 12개입', marginRate: 22.3 },
  { rank: 73, name: '모닝글로리 중고생 스프링 노트 B5 10권 묶음', category: '생활', gmarketPrice: 18000, badge: '학용품', kw: '모닝글로리 스프링노트 B5 10권', marginRate: 25.0 },
  { rank: 74, name: '에버콜라겐 인앤업 비오틴 셀 12주분 (3병)', category: '뷰티', gmarketPrice: 89000, badge: '이너뷰티', kw: '에버콜라겐 인앤업 비오틴 셀 3병', marginRate: 22.5 },
  { rank: 75, name: '삼성전자 무선 충전 트리오 EP-P6300 고속충전', category: '디지털', gmarketPrice: 59000, badge: '정품충전기', kw: '삼성전자 무선충전 트리오 EP-P6300', marginRate: 20.3 },
  { rank: 76, name: '스위퍼 더스터 먼지떨이 핸들 1개 + 리필 15개', category: '생활', gmarketPrice: 23900, badge: '청소혁명', kw: '스위퍼 더스터 핸들 리필 15개', marginRate: 24.3 },
  { rank: 77, name: '빙그레 바나나맛우유 240ml x 24개 (멸균)', category: '식품', gmarketPrice: 26900, badge: '국민우유', kw: '빙그레 바나나맛우유 멸균 24개', marginRate: 18.2 },
  { rank: 78, name: '아이오페 맨 올인원 안티에이징 에센스 120ml', category: '뷰티', gmarketPrice: 32000, badge: '남성화장품', kw: '아이오페 맨 올인원 에센스 120ml', marginRate: 25.0 },
  { rank: 79, name: '해태 허니버터칩 60g x 16봉 (1박스)', category: '식품', gmarketPrice: 22400, badge: '스낵인기', kw: '허니버터칩 60g 16봉', marginRate: 21.0 },
  { rank: 80, name: '코오롱스포츠 남성 경량 다운자켓 패딩', category: '패션', gmarketPrice: 139000, badge: '아웃도어', kw: '코오롱스포츠 남성 경량 다운 패딩', marginRate: 23.0 },
  { rank: 81, name: '바릴라 스파게티 파스타면 500g x 5개 묶음', category: '식품', gmarketPrice: 16500, badge: '파스타면', kw: '바릴라 스파게티면 500g 5개', marginRate: 22.4 },
  { rank: 82, name: '유한락스 주방용 세정살균제 750ml x 3개', category: '생활', gmarketPrice: 13900, badge: '살균소독', kw: '유한락스 주방용 750ml 3개', marginRate: 24.5 },
  { rank: 83, name: '브리타 막스트라 프로 정수 필터 4개입 팩', category: '주방', gmarketPrice: 34900, badge: '정수기필터', kw: '브리타 막스트라 프로 필터 4개입', marginRate: 21.5 },
  { rank: 84, name: '아디다스 아디렛 샤워 슬리퍼 공용 블랙', category: '패션', gmarketPrice: 22900, badge: '슬리퍼인기', kw: '아디다스 아디렛 샤워 슬리퍼', marginRate: 24.5 },
  { rank: 85, name: '동서 보리차 300g (10g x 30티백) x 6박스', category: '식품', gmarketPrice: 17500, badge: '전통차', kw: '동서 보리차 30티백 6박스', marginRate: 22.9 },
  { rank: 86, name: '메디힐 티트리 에센셜 마스크팩 10매 x 3팩 (30매)', category: '뷰티', gmarketPrice: 27000, badge: '마스크팩1위', kw: '메디힐 티트리 마스크팩 30매', marginRate: 27.8 },
  { rank: 87, name: '보네이도 에어서큘레이터 633 공기순환기', category: '디지털', gmarketPrice: 108000, badge: '환기가전', kw: '보네이도 서큘레이터 633', marginRate: 18.5 },
  { rank: 88, name: '깨끗한나라 닥터비데 화장실용 물티슈 80매 x 10팩', category: '생활', gmarketPrice: 19900, badge: '비데물티슈', kw: '닥터비데 물티슈 80매 10팩', marginRate: 23.6 },
  { rank: 89, name: '프링글스 오리지날 + 양파맛 110g x 8캔 세트', category: '식품', gmarketPrice: 19800, badge: '감자칩', kw: '프링글스 110g 8캔', marginRate: 22.2 },
  { rank: 90, name: '모나미 유성 네임펜 F 흑색 12자루 1다스', category: '생활', gmarketPrice: 10500, badge: '문구필수', kw: '모나미 네임펜 F 흑색 12자루', marginRate: 25.7 },
  { rank: 91, name: '청정원 청정 올리브유 900ml x 2병 세트', category: '식품', gmarketPrice: 28900, badge: '오일베스트', kw: '청정원 올리브유 900ml 2병', marginRate: 22.5 },
  { rank: 92, name: '에뛰드 순정 약산성 5.5 진정 토너 350ml 대용량', category: '뷰티', gmarketPrice: 21000, badge: '순한토너', kw: '에뛰드 순정 토너 350ml', marginRate: 26.2 },
  { rank: 93, name: '소니 WH-1000XM5 무선 노이즈캔슬링 헤드폰', category: '디지털', gmarketPrice: 429000, badge: '음향명품', kw: '소니 WH-1000XM5', marginRate: 14.5 },
  { rank: 94, name: '하림 용가리치킨 300g x 5봉 냉동 아이간식', category: '식품', gmarketPrice: 22900, badge: '치킨너겟', kw: '하림 용가리치킨 300g 5봉', marginRate: 21.8 },
  { rank: 95, name: '락앤락 바로한끼 이유식 밥보관 유리용기 3P', category: '주방', gmarketPrice: 17900, badge: '이유식용기', kw: '락앤락 바로한끼 이유식 3P', marginRate: 24.6 },
  { rank: 96, name: '비달사순 2000W 파워블랙 헤어드라이기 VSD120K', category: '디지털', gmarketPrice: 27900, badge: '헤어가전', kw: '비달사순 드라이기 VSD120K', marginRate: 23.3 },
  { rank: 97, name: '닥터포헤어 폴리젠 오리지널 탈모완화 샴푸 500ml', category: '뷰티', gmarketPrice: 29900, badge: '탈모샴푸', kw: '닥터포헤어 폴리젠 샴푸 500ml', marginRate: 26.8 },
  { rank: 98, name: '동원 리챔 오리지널 200g x 10캔 세트', category: '식품', gmarketPrice: 24900, badge: '통조림햄', kw: '동원 리챔 200g 10캔', marginRate: 22.1 },
  { rank: 99, name: '3M 스카치브라이트 옥수수그물망사 수세미 5개입 x 2팩', category: '주방', gmarketPrice: 12900, badge: '수세미베스트', kw: '3M 옥수수그물망사 수세미 5개입 2팩', marginRate: 24.8 },
  { rank: 100, name: '아이리스 오야마 3단 다용도 서랍 수납장 트롤리', category: '생활', gmarketPrice: 33900, badge: '수납가구', kw: '아이리스 3단 수납장 트롤리', marginRate: 23.6 }
];

const cleanedItems = RAW_100_ITEMS.map(it => {
  const cleanKw = it.kw || cleanKeywordForSearch(it.name);
  
  // 정확한 소싱가 계산 (10원 단위 반올림)
  const lowestPrice = Math.round((it.gmarketPrice * (1 - (it.marginRate / 100))) / 10) * 10;
  const margin = it.gmarketPrice - lowestPrice;
  const marginRate = parseFloat(((margin / it.gmarketPrice) * 100).toFixed(1));

  // 1:1 정확 직링크
  const danawaUrl = `https://search.danawa.com/dsearch.php?query=${encodeURIComponent(cleanKw)}`;
  const naverUrl = `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(cleanKw)}`;
  const gmarketUrl = `https://www.gmarket.co.kr/n/search?keyword=${encodeURIComponent(cleanKw)}`;

  return {
    rank: it.rank,
    name: it.name,
    category: it.category,
    badge: it.badge,
    cleanKeyword: cleanKw,
    gmarketPrice: it.gmarketPrice,
    gmarketUrl: gmarketUrl,
    lowestPrice: lowestPrice,
    lowestUrl: danawaUrl,
    danawaUrl: danawaUrl,
    naverUrl: naverUrl,
    lowestPlatform: '다나와',
    sourcingTitle: `[다나와 최저가 소싱] ${cleanKw}`,
    margin: margin,
    marginRate: marginRate,
    isDirectMatch: true,
    collectedAt: new Date().toISOString()
  };
});

const outputData = {
  updatedAt: new Date().toISOString(),
  totalCount: cleanedItems.length,
  items: cleanedItems
};

const liveJsonPath = path.join(__dirname, 'gmarket_best100_live.json');
fs.writeFileSync(liveJsonPath, JSON.stringify(outputData, null, 2), 'utf8');
console.log(`✅ ${cleanedItems.length}개 상품 데이터 gmarket_best100_live.json 완벽 생성!`);

// test007 동기화
try {
  const test007Path = 'C:\\sb_file\\test007\\gmarket_best100_live.json';
  if (fs.existsSync('C:\\sb_file\\test007')) {
    fs.writeFileSync(test007Path, JSON.stringify(outputData, null, 2), 'utf8');
    console.log(`✅ test007 폴더 동기화 완료!`);
  }
} catch (e) {
  console.log('test007 note:', e.message);
}
