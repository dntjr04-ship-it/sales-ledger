/**
 * 리사님의 만능 매출장부 & 경영 비서 애플리케이션
 * 한줄 주문장, 사입/위탁 구분, 4단계 다중 정렬, 주문일자(주문고유번호) 표시 및 사입 재고 전용 관리 엔진
 */

// 전역 상태 관리
const AppState = {
  rawOrders: [],              // 전체 주문 데이터
  currentBizFilter: 'ALL',    // 'ALL', '사업자A', '사업자B'
  searchQuery: '',            // 검색어
  selectedMarket: 'ALL',      // 판매사이트 필터
  selectedSourcing: 'ALL',    // 소싱플랫폼 필터
  selectedSourcingType: 'ALL',// 매입유형 필터 (ALL / 위탁 / 사입)
  selectedOrderStage: 'ALL',  // 주문구분 필터 (대기/완료/취소/반품/교환)
  selectedPurchaseStage: 'ALL',// 발주상태 필터 (완료/반품/취소)

  // 1. 카드사 결제일 & 청구기간 관리
  cardSettings: [
    { id: 'card_kb_a', name: '국민카드', holder: '강우석', payDay: 14, billingStartDay: 1, billingEndDay: 31, billingDesc: '전월 1일 ~ 전월 말일', theme: 'theme-blue', note: '소싱처(G마켓, 11번가) 전용, 실적 30만 이상 2% 캐시백' },
    { id: 'card_samsung_a', name: '삼성카드', holder: '강우석', payDay: 25, billingStartDay: 14, billingEndDay: 13, billingDesc: '전전월 14일 ~ 전월 13일', theme: 'theme-blue', note: '쿠팡 로켓소싱 전용, 무조건 1.2% 포인트' },
    { id: 'card_woori_b', name: '우리카드', holder: '강우석', payDay: 14, billingStartDay: 1, billingEndDay: 31, billingDesc: '전월 1일 ~ 전월 말일', theme: 'theme-blue', note: '스마트스토어 결제용, 무이자 6개월 할부 혜택' },
    { id: 'card_smile_b', name: '스마일카드 Edition3', holder: 'tjrdnrkd', payDay: 10, billingStartDay: 28, billingEndDay: 27, billingDesc: '전전월 28일 ~ 전월 27일', theme: 'theme-emerald', note: 'G마켓/옥션 2% 스마일캐시 적립' }
  ],
  selectedCardKey: null,
  selectedCardTxTab: 'ALL', // 'ALL', 'CURRENT', 'NEXT'

  // 2. 통장 데이터 (기본 모의 데이터)
  bankAccounts: [
    { id: 1, bankName: '기업은행', name: '기업은행 (주거래 통장)', accountName: '주거래 사업자 통장', accountNum: '010-8829-1234', balance: 14500000, biz: '사업자A', note: '스마트스토어 및 주요 오픈마켓 정산 계좌' },
    { id: 2, bankName: '국민은행', name: '국민은행 (스마트스토어 전용)', accountName: '스마트스토어 전용', accountNum: '421002-01-9988', balance: 8200000, biz: '사업자A', note: '국민카드 결제대금 자동이체 계좌' },
    { id: 3, bankName: '신한은행', name: '신한은행 (쿠팡/올웨이즈 전용)', accountName: '쿠팡/올웨이즈 전용', accountNum: '110-345-678901', balance: 11300000, biz: '사업자B', note: '쿠팡 정산금 입금 및 세금 적립 계좌' }
  ],

  // 2-B. 통장 거래내역 (입출금 장부)
  bankTransactions: [
    { id: 101, accountId: 1, bankName: '기업은행', accountName: '기업은행 (주거래 통장)', accountNum: '010-8829-1234', date: '2026-11-15 10:30', type: '입금', amount: 45000, balanceAfter: 14500000, summary: '스마트스토어 11월 1차 정산금 입금', note: '네이버페이', targetMarket: '스마트스토어' },
    { id: 102, accountId: 2, bankName: '국민은행', accountName: '국민은행 (스마트스토어 전용)', accountNum: '421002-01-9988', date: '2026-11-14 14:00', type: '출금', amount: 1250000, balanceAfter: 8200000, summary: '국민카드 11월 결제대금 출금', note: '자동이체', targetMarket: 'NONE' },
    { id: 103, accountId: 3, bankName: '신한은행', accountName: '신한은행 (쿠팡/올웨이즈 전용)', accountNum: '110-345-678901', date: '2026-11-10 11:20', type: '입금', amount: 320000, balanceAfter: 11300000, summary: '쿠팡 11월 주정산금 입금', note: '쿠팡 윙', targetMarket: '쿠팡(신)' },
    { id: 104, accountId: 1, bankName: '기업은행', accountName: '기업은행 (주거래 통장)', accountNum: '010-8829-1234', date: '2026-11-08 14:10', type: '입금', amount: 120000, balanceAfter: 11000000, summary: 'G마켓 11월 정산금 입금', note: '지마켓글로벌', targetMarket: 'G마켓' },
    { id: 105, accountId: 3, bankName: '신한은행', accountName: '신한은행 (쿠팡/올웨이즈 전용)', accountNum: '110-345-678901', date: '2026-11-05 09:30', type: '입금', amount: 50000, balanceAfter: 10950000, summary: '올웨이즈 1차 정산 입금', note: '레비잇', targetMarket: '올웨이즈' }
  ],

  // 3. 판매처별 기입금 완료 내역
  marketSettlements: {
    '스마트스토어': 45000,
    '쿠팡(신)': 320000,
    '올웨이즈': 50000,
    'G마켓': 40000,
    '카카오 톡스토어': 150000,
    '옥션': 20000
  },

  // 3-B. 손익계산서 & 순자산 (판관비 및 자산/부채)
  customExpenses: [
    { id: 'exp_1', category: '광고비', title: '쿠팡 키워드 검색광고', amount: 150000, biz: '사업자B', month: '2026-11', note: '쿠팡 윙 판매자 광고 집행비' },
    { id: 'exp_2', category: '프로그램비', title: '플레이오토 쇼핑몰 통합관리 솔루션', amount: 55000, biz: 'ALL', month: '2026-11', note: '주문수집 및 송장자동등록 솔루션 월이용료' }
  ],
  customAssets: [
    { id: 'asset_1', type: '자산', category: '임차보증금', title: '사무실 임차보증금', amount: 20000000, biz: '사업자A', note: '마포구 사무실 보증금' },
    { id: 'asset_2', type: '부채', category: '대출금', title: '소상공인 정책자금 운전자금 대출', amount: 10000000, biz: '사업자A', note: '신용보증재단 2.5% 저리대출' }
  ],

  // 4. 주문장 뷰 모드 ('list', 'daily', 'monthly')
  ordersViewMode: 'list',

  // 사용자 권한 상태
  currentUser: {
    name: '리사 사장님',
    email: 'lisa.ceo@gmail.com',
    role: 'ADMIN',
    avatar: 'L'
  }
};

let marketChartInstance = null;

/**
 * 날짜만 추출 헬퍼 (시간은 내부적으로만 관리하고 화면에는 일자만 표시!)
 */
function formatOrderDateOnly(dateTimeStr) {
  if (!dateTimeStr) return '-';
  const parts = dateTimeStr.trim().split(' ');
  return parts[0];
}

/**
 * ⭐ 리사님의 핵심 실적 집계 규칙:
 * "모든 실적을 집계할때는 주문구분표시와 발주상태가 완료인 것만 집계"
 */
function isOrderCountable(o) {
  return o.orderStage === '완료' && o.purchaseStage === '완료';
}

/**
 * ⭐ 순수 상품 매입가 산출 헬퍼 (테이블 '매입가' 열 전용):
 * - 사입: (사입단가 × 수량) - 출고 택배비는 절대 포함하지 않음!
 * - 위탁: 카드결제가 - 포인트사용액
 */
function getOrderProductCost(o) {
  const ptAmount = (o.point > 0 ? o.point : (o.pointUsed > 0 ? o.pointUsed : 0));
  if (o.sourcingType === '사입') {
    const unitCost = (o.inventoryUnitCost > 0) ? o.inventoryUnitCost : (o.sourcingStandardPrice > 0 ? o.sourcingStandardPrice : 0);
    if (unitCost > 0) {
      return unitCost * (o.qty || 1);
    }
    const rawCost = (o.purchasePrice > 0 ? o.purchasePrice : (o.purchaseCost || 0));
    if (o.deliveryFeeOut > 0 && rawCost > o.deliveryFeeOut) {
      return rawCost - o.deliveryFeeOut;
    }
    return rawCost;
  } else {
    const baseCost = o.purchaseCost > 0 ? o.purchaseCost : (o.sourcingStandardPrice || o.purchasePrice || 0);
    return ptAmount > 0 ? Math.max(0, baseCost - ptAmount) : baseCost;
  }
}

/**
 * ⭐ 매출 건당 총 매입원가 산출 헬퍼 (마진금액, 대시보드 실적, 손익계산서 전용):
 * - 사입 매출: (순수 상품매입가) + 출고 택배비 (마진 계산 시 택배비 차감 반영)
 * - 사입 입고: 순수 상품매입가
 * - 위탁: 카드결제가 - 포인트사용액
 */
function getOrderActualCost(o) {
  const productCost = getOrderProductCost(o);
  const deliveryFee = (o.sourcingType === '사입' && o.deliveryFeeOut > 0) ? o.deliveryFeeOut : 0;
  return productCost + deliveryFee;
}

// DOM 로드 시 실행
document.addEventListener('DOMContentLoaded', () => {
  if (window.feather) feather.replace();

  initNavigation();
  initBusinessSwitcher();
  initFileUpload();
  initAuthDemo();
  initFilters();

  // 기본 샘플 데이터 로드
  loadSampleOrders();

  // 🎯 지마켓 베스트 100 소싱 레이더 엔진 초기화
  if (window.initSourcingRadar) {
    window.initSourcingRadar();
  }
});

/**
 * 네비게이션 탭 전환 초기화
 */
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const sidebar = document.getElementById('sidebar');
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetId = item.getAttribute('data-target');
      switchNav(targetId);

      if (window.innerWidth <= 900 && sidebar) {
        sidebar.classList.remove('open');
      }
    });
  });

  if (mobileMenuBtn && sidebar) {
    mobileMenuBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }
}

function switchNav(targetId) {
  const navItems = document.querySelectorAll('.nav-item');
  const views = document.querySelectorAll('.content-view');
  const pageTitle = document.getElementById('pageTitle');

  navItems.forEach(nav => {
    if (nav.getAttribute('data-target') === targetId) {
      nav.classList.add('active');
    } else {
      nav.classList.remove('active');
    }
  });

  views.forEach(v => {
    if (v.id === targetId) {
      v.classList.add('active');
    } else {
      v.classList.remove('active');
    }
  });

  const titles = {
    dashboardView: '📊 실시간 경영 대시보드',
    ordersView: '📦 매입·매출 주문장',
    cardsView: '💳 카드사별 결제 관리 (카드명의 구분)',
    settlementView: '🏦 판매처 정산 미수금 & 통장',
    inventoryView: '📦 사입 상품 재고 현황 & 재고 평가액',
    plView: '📈 2026 연간 손익계산서 & 순자산',
    sourcingRadarView: '🎯 지마켓 베스트 소싱 & 실시간 최저가 레이더',
    uploadView: '📁 엑셀 / CSV 주문 파일 업로드'
  };
  if (pageTitle && titles[targetId]) {
    pageTitle.textContent = titles[targetId];
  }

  if (targetId === 'dashboardView' && marketChartInstance) {
    marketChartInstance.resize();
  }

  if (targetId === 'sourcingRadarView' && window.renderSourcingRadar) {
    window.renderSourcingRadar();
  }

  if (window.feather) feather.replace();
}

/**
 * 사업자 필터 스위처
 */
function setBusinessFilter(biz) {
  AppState.currentBizFilter = biz;

  const filterBtns = document.querySelectorAll('#businessFilterGroup .toggle-btn');
  filterBtns.forEach(b => {
    if (b.getAttribute('data-biz') === biz) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  const badge = document.getElementById('currentBizBadge');
  if (badge) {
    if (biz === 'ALL') badge.textContent = '🏢 전체 사업자 통합 현황';
    else badge.textContent = `🏢 ${biz} 전용 장부`;
  }

  renderAll();
}

function initBusinessSwitcher() {
  const filterBtns = document.querySelectorAll('#businessFilterGroup .toggle-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const biz = btn.getAttribute('data-biz');
      setBusinessFilter(biz);
    });
  });
}

/**
 * 검색 및 필터 초기화
 */
function initFilters() {
  const searchInput = document.getElementById('orderSearchInput');
  const marketSelect = document.getElementById('marketFilterSelect');
  const sourcingSelect = document.getElementById('sourcingFilterSelect');
  const sourcingTypeSelect = document.getElementById('sourcingTypeFilterSelect');
  const orderStageSelect = document.getElementById('orderStageFilterSelect');
  const purchaseStageSelect = document.getElementById('purchaseStageFilterSelect');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      AppState.searchQuery = e.target.value.trim().toLowerCase();
      renderOrdersTable();
    });
  }

  if (marketSelect) {
    marketSelect.addEventListener('change', (e) => {
      AppState.selectedMarket = e.target.value;
      renderOrdersTable();
    });
  }

  if (sourcingSelect) {
    sourcingSelect.addEventListener('change', (e) => {
      AppState.selectedSourcing = e.target.value;
      renderOrdersTable();
    });
  }

  if (sourcingTypeSelect) {
    sourcingTypeSelect.addEventListener('change', (e) => {
      AppState.selectedSourcingType = e.target.value;
      renderOrdersTable();
    });
  }

  if (orderStageSelect) {
    orderStageSelect.addEventListener('change', (e) => {
      AppState.selectedOrderStage = e.target.value;
      renderOrdersTable();
    });
  }

  if (purchaseStageSelect) {
    purchaseStageSelect.addEventListener('change', (e) => {
      AppState.selectedPurchaseStage = e.target.value;
      renderOrdersTable();
    });
  }
}

/**
 * 구글 로그인 데모
 */
function initAuthDemo() {
  const btn = document.getElementById('googleAuthBtn');
  const userName = document.getElementById('userName');
  const userRoleBadge = document.getElementById('userRoleBadge');
  const authBtnText = document.getElementById('authBtnText');

  if (btn) {
    btn.addEventListener('click', () => {
      if (AppState.currentUser.role === 'ADMIN') {
        AppState.currentUser = {
          name: '김직원 (파트너)',
          email: 'staff.kim@gmail.com',
          role: 'STAFF',
          avatar: 'S'
        };
        userName.textContent = '김직원 파트너';
        userRoleBadge.textContent = '일반 직원';
        userRoleBadge.className = 'badge';
        userRoleBadge.style.background = '#e2e8f0';
        userRoleBadge.style.color = '#475569';
        authBtnText.textContent = '관리자로 전환';
        alert('직원 모드로 전환되었습니다.');
      } else {
        AppState.currentUser = {
          name: '리사 사장님',
          email: 'lisa.ceo@gmail.com',
          role: 'ADMIN',
          avatar: 'L'
        };
        userName.textContent = '리사 사장님';
        userRoleBadge.textContent = '대표 관리자';
        userRoleBadge.className = 'badge admin-badge';
        authBtnText.textContent = '직원 계정 전환';
        alert('대표 관리자(리사 사장님)로 전환되었습니다.');
      }
      document.getElementById('userAvatar').textContent = AppState.currentUser.avatar;
    });
  }
}

/**
 * CSV 파일 업로드
 */
function initFileUpload() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const btnReloadSample = document.getElementById('btnReloadSample');

  if (dropzone && fileInput) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files.length > 0) handleFile(files[0]);
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) handleFile(e.target.files[0]);
    });
  }

  if (btnReloadSample) {
    btnReloadSample.addEventListener('click', () => {
      if (confirm('장부를 처음 기본 샘플 상태로 되돌릴까요?\n(직접 등록하거나 수정한 모든 내역이 초기화됩니다)')) {
        loadSampleOrders(true);
        alert('기본 샘플 주문 데이터가 다시 로드되었습니다!');
        switchNav('ordersView');
      }
    });
  }
}

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    parseCSVOrders(text);
    alert(`파일 [${file.name}] 업로드가 완료되었습니다! 총 ${AppState.rawOrders.length}건이 등록되었습니다.`);
    switchNav('ordersView');
  };
  reader.readAsText(file, 'UTF-8');
}

/**
 * 인라인 백업 샘플 CSV (로컬 file:/// 프로토콜에서도 즉시 로드)
 */
const INLINE_SAMPLE_CSV = `주문고유번호,판매사이트명,판매자ID,수집일,주문일,결제일,판매사이트 주문번호,상품명,주문선택사항,판매가,주문수량,배송비금액,수령자명,송장번호,한줄메모,상품요약,출고중지여부,담당자,결제플랫폼,카드명의,결제카드,결제ID,결제기준가,결제가,포인트,결제일자,주문번호,택배사,주문송장번호,판매처명,사업자명,주문자 메모,CS담당자메모,로스처리,등록상품
103309491451,스마트스토어,사업자A,2026-10-18 오후 5:18:25,2026-10-17 오전 2:13:14,2026-10-17 오전 2:13:24,2026101751952881,CJ 비비고 소고기 미역국 500g x 10개,,29700,1,2500,김철수,,,,,,,,,,,,,,,,,,,,미등록
101034774051,스마트스토어,사업자A,2026-10-18 오후 5:18:25,2026-10-17 오전 5:41:31,2026-10-17 오전 5:41:36,2026101752416041,동아오츠카 나랑드 사이다 제로 그린애플 500ml x 24개,,15090,1,2500,이영희,,,,,,지마켓,tjrdnrkd,스마일카드 Edition3,tjrdnrkd,16753,"14,160",,2026-10-18 오후 5:48:35,4504976132,CJ택배,302535711474,여병주,에스엠맨테크,,,,등록
100563940973,스마트스토어,사업자A,2026-10-18 오후 5:18:25,2026-10-17 오전 11:59:24,2026-10-17 오전 11:59:42,2026101756699671,센텔리안24 마데카 더마 마스크 x 2개,,11510,1,2500,박민수,,,,,,,,,,,11920,,,123,우체국택배,6082251098067,,,,,,미등록
101235309067,스마트스토어,사업자A,2026-10-18 오후 5:18:25,2026-10-17 오후 11:10:37,2026-10-17 오후 11:10:48,2026101767895311,코카콜라 태양의 마테차 500ml x 24개,,14000,1,2500,최지우,,,,,,,,,,,,,,,,,,,,미등록
100104986839,쿠팡(신),사업자B,2026-10-18 오후 5:17:23,2026-10-17 오전 1:40:00,2026-10-17 오전 1:40:00,15103651673828,오리온 비쵸비 초코맛+딸기맛 세트,125g 1세트,16830,1,0,정하나,,,,,,옥션,tjrdnrkd,스마일카드 Edition3,tjrdnrkd,,"14,140",,2026-10-18 오후 5:49:05,2573535631,CJ대한통운,302535723260,스타배송,,,,,등록
103203677470,쿠팡(신),사업자B,2026-10-18 오후 5:17:23,2026-10-17 오전 6:51:00,2026-10-17 오전 6:51:00,2103656517335,오리온 비쵸비 초코맛+딸기맛 세트,125g 1세트,16830,1,0,한수민,,,,,,옥션,tjrdnrkd,스마일카드 Edition3,tjrdnrkd,,"14,140",,2026-10-18 오후 5:49:02,2573535690,CJ대한통운,302535723282,스타배송,,,,,등록
101868691697,쿠팡(신),사업자B,2026-10-18 오후 5:17:23,2026-10-17 오후 12:50:00,2026-10-17 오후 12:50:00,30103661912842,비첸향 미니이지 포크 원물간식,500g 1개,52830,1,0,윤서준,,,,,,롯데온,강우석,국민카드,,,"45,750",,2026-10-19 오전 1:11:13,2026101912630748,,,,,,,,등록
101092965762,쿠팡(신),사업자B,2026-10-18 오후 5:17:23,2026-10-18 오후 2:43:00,2026-10-18 오후 2:43:00,21103685219095,지구식단 슬림핏 콩면 4인분,150g 10개,21810,1,0,송지은,,,,,,지마켓,tjrdnrkd,삼성카드,tjrdnrkd,,"17,410",,2026-10-18 오후 5:48:04,4504981191,,,신세계라이브쇼핑,(주)신세계라이브쇼핑,,,,등록
102427680450,올웨이즈,사업자A,2026-10-18 오후 5:17:17,2026-10-18 오전 6:31:23,2026-10-18 오전 6:31:23,308bc34e-bad1-4ce6,정성곳간 뼈없는 갈비탕 800g x 8개,단일상품,34354,1,0,임다솜,,,,,,네이버,강우석,우리카드,tjrdnrkd,,"31,980",,2026-10-18 오후 5:58:44,2026101881041151,한진택배,522529516250,NS홈쇼핑,(주)엔에스쇼핑,,,,등록
103298032857,올웨이즈,사업자A,2026-10-18 오후 5:17:17,2026-10-17 오후 9:08:57,2026-10-17 오후 9:08:57,fce09006-e804-4657,켈로그 프링글스 치즈맛 110g x 12개,단일상품,24840,1,0,배도현,,,,,,지마켓,tjrdnrkd,스마일카드 Edition3,tjrdnrkd,,"18,820",,2026-10-18 오후 6:13:02,4504986076,CJ택배,304347554293,켈로그대리점,주식회사편한세상,,,,등록
100836987268,G마켓,사업자A,2026-10-18 오후 5:16:53,2026-10-18 오후 4:49:00,2026-10-18 오후 4:49:00,4504964806,쏘피 바디피트 천연코튼 팬티라이너 x 5개,,16300,1,0,오유진,,,,,,옥션,tjrdnrkd,스마일카드 Edition3,tjrdnrkd,,"12,020",,2026-10-18 오후 6:15:13,2573537089,CJ대한통운,302535728322,스타배송,,,,,등록
101294781887,카카오 톡스토어,사업자A,2026-10-18 오후 5:16:33,2026-10-17 오전 1:17:16,2026-10-17 오전 1:17:15,3498154817,사조참치 안심따개 100g x 12개,,22000,1,0,류태현,,,,,,지마켓,tjrdnrkd,스마일카드 Edition3,tjrdnrkd,,"18,330",,2026-10-18 오후 6:12:57,4504987023,CJ택배,302535815984,여병주,에스엠맨테크,,,,등록
100492432399,카카오 톡스토어,사업자A,2026-10-18 오후 5:16:33,2026-10-17 오후 6:36:47,2026-10-17 오후 6:36:47,3498760000,맥심 모카골드 마일드 커피믹스 400T,"수량/400개",57500,1,0,신예원,,,,,,네이버,강우석,우리카드,tjrdnrkd,,"49,900",,2026-10-18 오후 6:10:30,2026101881279251,CJ대한통운,512166957343,큐마트몰,(주)서광물류,,,,등록
102902045675,카카오 톡스토어,사업자A,2026-10-18 오후 5:16:33,2026-10-18 오전 11:15:36,2026-10-18 오전 11:15:35,3499252188,프로쉬 식기세척기세제 미니 50개입 x 3개,,45600,1,0,구자경,,,,,,지마켓,tjrdnrkd,스마일카드 Edition3,tjrdnrkd,,"38,900",1000,2026-10-18 오후 6:12:56,4504988287,CJ택배,522825439735,프로쉬스토어,(주)제이엔비,,,,등록
102699088111,옥션,사업자A,2026-10-18 오후 5:16:21,2026-10-17 오전 5:26:00,2026-10-17 오전 5:26:00,2573444362,비폰 포보 베트남 쌀국수 소고기맛 60g x 30개,,23200,1,0,권지후,,,,,,쿠팡,강우석,국민카드,tjrdnrkd,,16330,,,27103688371798,로켓배송,10333082276646,,,,,,등록
100035653447,올웨이즈,사업자A,2026-10-19 오전 12:05:28,2026-10-18 오후 8:52:12,2026-10-18 오후 8:52:12,706f0221-045a,동화약품 소다활 매실맛 500ml x 48개,단일상품,37291,1,0,문채원,,,,,,11번가,강우석,신한카드,tjrdnrkd,,34910,,2026-10-19 오전,20261019109464773,CJ대한통운,531055086502,,,,,,등록
102963544829,스마트스토어,사업자A,2026-10-19 오전 12:06:31,2026-10-18 오후 5:34:52,2026-10-18 오후 5:35:29,2026101880559891,해화당 이영자의 뼈없는 갈비탕 x 8개,수량: 1세트,55100,1,2500,안지호,,,,,,지마켓,강우석,삼성카드,tjrdnrkd,,"47,820",,2026-10-19 오전 1:31:42,4505126870,CJ택배,7721414942,롯데원티비,(주)우리홈쇼핑,,,,등록
100186721641,쿠팡(신),사업자B,2026-10-18 오후 6:41:00,2026-10-18 오후 6:41:00,2026-10-18 오후 6:41:00,24103688719737,혁명티슈 멀티 세정 티슈 85매,3개 세트,34900,1,0,백서현,,,,,,sk스토아,강우석,삼성카드,강우석,,31640,,2026-10-19 오전 10:44:58,20261019651572,,,,,,,,등록`;

// =========================================================
// 브라우저 로컬 저장소 (LocalStorage) 영구 보관 로직 ⭐
// 리사님이 등록/수정한 내역이 새로고침(F5)이나 창을 닫아도 절대 사라지지 않도록 자동 저장!
// =========================================================
const STORAGE_KEY_ORDERS = 'LISA_SALES_ORDERS_V2';
const STORAGE_KEY_BANKS = 'LISA_BANK_ACCOUNTS_V2';
const STORAGE_KEY_SETTLE = 'LISA_MARKET_SETTLEMENTS_V2';
const STORAGE_KEY_CARDS = 'LISA_CARD_SETTINGS_V1';
const STORAGE_KEY_BANK_TX = 'LISA_BANK_TRANSACTIONS_V1';
const STORAGE_KEY_EXPENSES = 'LISA_CUSTOM_EXPENSES_V1';
const STORAGE_KEY_ASSETS = 'LISA_CUSTOM_ASSETS_V1';

function saveStateToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY_ORDERS, JSON.stringify(AppState.rawOrders));
    localStorage.setItem(STORAGE_KEY_BANKS, JSON.stringify(AppState.bankAccounts));
    localStorage.setItem(STORAGE_KEY_SETTLE, JSON.stringify(AppState.marketSettlements));
    localStorage.setItem(STORAGE_KEY_CARDS, JSON.stringify(AppState.cardSettings));
    localStorage.setItem(STORAGE_KEY_BANK_TX, JSON.stringify(AppState.bankTransactions));
    localStorage.setItem(STORAGE_KEY_EXPENSES, JSON.stringify(AppState.customExpenses));
    localStorage.setItem(STORAGE_KEY_ASSETS, JSON.stringify(AppState.customAssets));
  } catch (err) {
    console.warn('LocalStorage 저장 실패:', err);
  }
}

function loadStateFromStorage() {
  try {
    const savedOrders = localStorage.getItem(STORAGE_KEY_ORDERS);
    const savedBanks = localStorage.getItem(STORAGE_KEY_BANKS);
    const savedSettle = localStorage.getItem(STORAGE_KEY_SETTLE);
    const savedCards = localStorage.getItem(STORAGE_KEY_CARDS);
    const savedBankTx = localStorage.getItem(STORAGE_KEY_BANK_TX);
    const savedExpenses = localStorage.getItem(STORAGE_KEY_EXPENSES);
    const savedAssets = localStorage.getItem(STORAGE_KEY_ASSETS);

    if (savedBanks) {
      AppState.bankAccounts = JSON.parse(savedBanks);
    }
    if (savedSettle) {
      AppState.marketSettlements = JSON.parse(savedSettle);
    }
    if (savedCards) {
      AppState.cardSettings = JSON.parse(savedCards);
    }
    if (savedBankTx) {
      AppState.bankTransactions = JSON.parse(savedBankTx);
    }
    if (savedExpenses) {
      AppState.customExpenses = JSON.parse(savedExpenses);
    }
    if (savedAssets) {
      AppState.customAssets = JSON.parse(savedAssets);
    }

    if (savedOrders) {
      const parsed = JSON.parse(savedOrders);
      if (Array.isArray(parsed) && parsed.length > 0) {
        AppState.rawOrders = parsed;
        ensureAloeStockExists();
        populateSelectFilters();
        renderAll();
        return true;
      }
    }
  } catch (err) {
    console.warn('LocalStorage 복원 실패:', err);
  }
  return false;
}

function loadSampleOrders(forceReload = false) {
  // 사용자가 강제로 초기화 버튼을 누르지 않은 경우, 먼저 로컬스토리지에 저장된 장부가 있는지 확인!
  if (!forceReload && loadStateFromStorage()) {
    console.log('✅ 브라우저에 안전하게 보관된 장부 데이터를 복원했습니다.');
    return;
  }

  fetch('sample_orders.csv')
    .then(res => {
      if (!res.ok) throw new Error('Fetch failed');
      return res.text();
    })
    .then(csvText => {
      parseCSVOrders(csvText);
      saveStateToStorage();
    })
    .catch(() => {
      parseCSVOrders(INLINE_SAMPLE_CSV);
      saveStateToStorage();
    });
}

/**
 * RFC-4180 CSV 파서
 */
function parseCSV(text) {
  const lines = [];
  let row = [];
  let col = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        col += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(col);
      col = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      row.push(col);
      if (row.some(c => c.trim().length > 0)) lines.push(row);
      row = [];
      col = '';
    } else {
      col += char;
    }
  }
  if (col || row.length > 0) {
    row.push(col);
    if (row.some(c => c.trim().length > 0)) lines.push(row);
  }
  return lines;
}

/**
 * CSV 주문 데이터 파싱 및 정규화
 */
function parseCSVOrders(csvText) {
  const rows = parseCSV(csvText);
  if (rows.length < 2) return;

  const headers = rows[0].map(h => h.trim());
  const headerMap = {};
  headers.forEach((h, idx) => { headerMap[h] = idx; });

  const orders = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < headers.length * 0.4) continue;

    const get = (colName) => {
      const idx = headerMap[colName];
      return idx !== undefined && r[idx] !== undefined ? r[idx].trim() : '';
    };

    const getNum = (colName) => {
      const str = get(colName).replace(/[^0-9.-]+/g, "");
      const val = parseFloat(str);
      return isNaN(val) ? 0 : val;
    };

    const orderNo = get('주문고유번호') || `ORD-${Date.now()}-${i}`;
    const market = get('판매사이트명') || '스마트스토어';
    const biz = get('판매자ID') || '사업자A';
    const orderDate = get('주문일') || get('결제일') || get('수집일') || '2026-10-18';
    const orderSeq = get('판매사이트 주문번호');
    const productName = get('상품명') || '상품';
    const option = get('주문선택사항');
    const qty = getNum('주문수량') || 1;
    const salePrice = getNum('판매가');
    const shipping = getNum('배송비금액');
    const recipient = get('수령자명') || '고객';

    // 매출액 = 판매가 * 수량 + 배송비금액
    const totalSales = (salePrice * qty) + shipping;

    // 정산예정가 (구 결제기준가)
    let standardPrice = getNum('결제기준가');
    if (standardPrice <= 0) {
      standardPrice = Math.round(totalSales * 0.92);
    }
    const actualSettlement = standardPrice;

    // 소싱 및 매입 정보
    const sourcingPlatform = get('결제플랫폼') || '기타';
    const cardHolder = get('카드명의') || (get('결제ID') ? '명의미지정' : '');
    const paymentCard = get('결제카드') || (get('결제플랫폼') ? '일반결제' : '');
    const sourcingId = get('결제ID');

    const sourcingStandardPrice = getNum('결제기준가');
    const purchaseCost = getNum('결제가');
    const point = getNum('포인트');

    // 매입가
    let purchasePrice = 0;
    if (sourcingStandardPrice > 0) {
      purchasePrice = Math.max(0, sourcingStandardPrice - point);
    } else if (purchaseCost > 0) {
      purchasePrice = Math.max(0, purchaseCost - point);
    }

    const paymentDate = get('결제일자');
    const sourcingOrderNo = get('주문번호');
    const courier = get('택배사');
    const trackingNo = get('주문송장번호');
    const supplierName = get('판매처명') || get('사업자명');
    const supplierBiz = get('사업자명');

    // ⭐ 주문구분 (대기 / 완료 / 취소 / 반품 / 교환) - '사입입고' 제거!
    const regStatus = get('등록상품');
    let orderStage = '대기';
    if (regStatus === '등록' || purchaseCost > 0) {
      orderStage = '완료';
    }

    // 발주상태 (완료/반품/취소)
    let purchaseStage = '완료';
    if (!purchaseCost && !sourcingPlatform) {
      purchaseStage = '취소';
    }

    // ⭐ 사입은 매입유형으로만 관리!
    let sourcingType = '위탁';
    if (productName.includes('비쵸비') || productName.includes('맥심')) {
      sourcingType = '사입';
    }

    const inventoryUnitCost = purchaseCost > 0 ? (purchaseCost + point) : purchasePrice;

    orders.push({
      orderNo,
      market,
      biz,
      orderDate,
      orderSeq,
      productName,
      option,
      qty,
      salePrice,
      shipping,
      totalSales,
      recipient,
      standardPrice,
      actualSettlement,
      orderStage,
      sourcingType, // '위탁' vs '사입'
      sourcingPlatform,
      supplierName,
      supplierBiz,
      paymentCard,
      cardHolder,
      sourcingId,
      sourcingStandardPrice,
      purchaseCost,
      point,
      purchasePrice,
      purchaseStage,
      paymentDate,
      sourcingOrderNo,
      courier,
      trackingNo,
      inventoryUnitCost
    });
  }

  // ⭐ 리사님을 위한 사입 단독 매입 예시 1 (비쵸비)
  orders.unshift({
    orderNo: 'BUY-20261015-01',
    market: '', // 사입은 판매처 공란!
    biz: '사업자A',
    orderDate: '2026-10-15 오전 10:00:00',
    orderSeq: '',
    productName: '오리온 비쵸비 초코맛+딸기맛 세트',
    option: '125g 1세트',
    qty: 20, // 사입 입고 20개
    salePrice: 0,
    shipping: 0,
    totalSales: 0,
    recipient: '-',
    standardPrice: 0,
    actualSettlement: 0,
    orderStage: '대기', // 주문구분은 일반 대기 상태 (사입입고 삭제)
    sourcingType: '사입', // 사입은 오직 매입유형으로만 관리!
    sourcingPlatform: '도매꾹', // 소싱처 수기 등록
    supplierName: '스타유통(주)',
    supplierBiz: '스타유통',
    paymentCard: '국민카드',
    cardHolder: '리사',
    sourcingId: '',
    sourcingStandardPrice: 13500,
    purchaseCost: 270000,
    point: 0,
    purchasePrice: 270000,
    purchaseStage: '완료',
    paymentDate: '2026-10-15',
    sourcingOrderNo: 'DO-889912',
    courier: '화물택배',
    trackingNo: '8829123847',
    inventoryUnitCost: 13500
  });

  // ⭐ 리사님을 위한 사입 단독 매입 예시 2 (알로에 입고)
  orders.unshift({
    orderNo: 'BUY-20261012-02',
    market: '', // 사입은 판매처 공란!
    biz: '사업자A',
    orderDate: '2026-10-12 오전 11:30:00',
    orderSeq: '',
    productName: '김정문알로에 큐어 하이드라 수딩 토너 130ml',
    option: '130ml 1개',
    qty: 30, // 사입 입고 30개
    salePrice: 0,
    shipping: 0,
    totalSales: 0,
    recipient: '-',
    standardPrice: 0,
    actualSettlement: 0,
    orderStage: '대기',
    sourcingType: '사입',
    sourcingPlatform: '도매꾹',
    supplierName: '그린케어유통',
    supplierBiz: '그린케어유통',
    paymentCard: '국민카드',
    cardHolder: '리사',
    sourcingId: '',
    sourcingStandardPrice: 6500,
    purchaseCost: 195000,
    point: 0,
    purchasePrice: 195000,
    purchaseStage: '완료',
    paymentDate: '2026-10-12',
    sourcingOrderNo: 'DO-772183',
    courier: 'CJ대한통운',
    trackingNo: '6543219870',
    inventoryUnitCost: 6500
  });

  // ⭐ 알로에 사입 출고(판매) 예시 (2개 판매)
  orders.unshift({
    orderNo: 'ORD-20261016-01',
    market: '스마트스토어',
    biz: '사업자A',
    orderDate: '2026-10-16 오후 2:15:00',
    orderSeq: '1',
    productName: '김정문알로에 큐어 하이드라 수딩 토너 130ml',
    option: '130ml 1개',
    qty: 2, // 판매 출고 2개
    salePrice: 12500,
    shipping: 3000,
    totalSales: 28000,
    recipient: '김민지',
    standardPrice: 26000,
    actualSettlement: 26000,
    orderStage: '완료',
    sourcingType: '사입',
    sourcingPlatform: '자체창고',
    supplierName: '자체재고출고',
    supplierBiz: '자체재고',
    paymentCard: '-',
    cardHolder: '-',
    sourcingId: '',
    sourcingStandardPrice: 6500,
    purchaseCost: 13000,
    point: 0,
    purchasePrice: 13000,
    purchaseStage: '완료',
    paymentDate: '2026-10-16',
    sourcingOrderNo: 'SELF-OUT-01',
    courier: '우체국택배',
    trackingNo: '6098231456',
    inventoryUnitCost: 6500
  });

  AppState.rawOrders = orders;
  saveStateToStorage();
  populateSelectFilters();
  renderAll();
}

/**
 * 브라우저 로컬스토리지 복원 시 알로에 사입 품목이 누락되어 있다면 자동 복구
 */
function ensureAloeStockExists() {
  if (!AppState.rawOrders || !Array.isArray(AppState.rawOrders)) return;
  const aloeOrders = AppState.rawOrders.filter(o => (o.productName || '').includes('알로에'));
  const hasInbound = aloeOrders.some(o => o.sourcingType === '사입' && (!o.market || o.salePrice === 0));
  const hasOutbound = aloeOrders.some(o => o.sourcingType === '사입' && o.salePrice > 0);

  let updated = false;

  if (!hasInbound) {
    // 1) 알로에 사입 단독 매입 (입고 30개)
    AppState.rawOrders.unshift({
      orderNo: 'BUY-20261012-02',
      market: '',
      biz: '사업자A',
      orderDate: '2026-10-12 오전 11:30:00',
      orderSeq: '',
      productName: '김정문알로에 큐어 하이드라 수딩 토너 130ml',
      option: '130ml 1개',
      qty: 30,
      salePrice: 0,
      shipping: 0,
      totalSales: 0,
      recipient: '-',
      standardPrice: 0,
      actualSettlement: 0,
      orderStage: '대기',
      sourcingType: '사입',
      sourcingPlatform: '도매꾹',
      supplierName: '그린케어유통',
      supplierBiz: '그린케어유통',
      paymentCard: '국민카드',
      cardHolder: '리사',
      sourcingId: '',
      sourcingStandardPrice: 6500,
      purchaseCost: 195000,
      point: 0,
      purchasePrice: 195000,
      purchaseStage: '완료',
      paymentDate: '2026-10-12',
      sourcingOrderNo: 'DO-772183',
      courier: 'CJ대한통운',
      trackingNo: '6543219870',
      inventoryUnitCost: 6500
    });
    updated = true;
  }

  if (!hasOutbound) {
    // 2) 알로에 실제 판매(출고 2개)
    AppState.rawOrders.unshift({
      orderNo: 'ORD-20261016-01',
      market: '스마트스토어',
      biz: '사업자A',
      orderDate: '2026-10-16 오후 2:15:00',
      orderSeq: '1',
      productName: '김정문알로에 큐어 하이드라 수딩 토너 130ml',
      option: '130ml 1개',
      qty: 2,
      salePrice: 12500,
      shipping: 3000,
      totalSales: 28000,
      recipient: '김민지',
      standardPrice: 26000,
      actualSettlement: 26000,
      orderStage: '완료',
      sourcingType: '사입',
      sourcingPlatform: '자체창고',
      supplierName: '자체재고출고',
      supplierBiz: '자체재고',
      paymentCard: '-',
      cardHolder: '-',
      sourcingId: '',
      sourcingStandardPrice: 6500,
      purchaseCost: 13000,
      point: 0,
      purchasePrice: 13000,
      purchaseStage: '완료',
      paymentDate: '2026-10-16',
      sourcingOrderNo: 'SELF-OUT-01',
      courier: '우체국택배',
      trackingNo: '6098231456',
      inventoryUnitCost: 6500
    });
    updated = true;
  }

  if (updated) {
    saveStateToStorage();
  }
}

/**
 * 셀렉트 필터 옵션 채우기
 */
function populateSelectFilters() {
  const marketSelect = document.getElementById('marketFilterSelect');
  const sourcingSelect = document.getElementById('sourcingFilterSelect');

  const markets = new Set();
  const sourcings = new Set();

  AppState.rawOrders.forEach(o => {
    if (o.market) markets.add(o.market);
    if (o.sourcingPlatform) sourcings.add(o.sourcingPlatform);
  });

  if (marketSelect) {
    marketSelect.innerHTML = '<option value="ALL">모든 판매사이트</option>';
    markets.forEach(m => {
      marketSelect.innerHTML += `<option value="${m}">${m}</option>`;
    });
  }

  if (sourcingSelect) {
    sourcingSelect.innerHTML = '<option value="ALL">모든 소싱플랫폼</option>';
    sourcings.forEach(s => {
      sourcingSelect.innerHTML += `<option value="${s}">${s}</option>`;
    });
  }
}

/**
 * ⭐ 리사님의 4단계 다중 정렬 규칙:
 * 정렬 기준 = 주문일자(최신순) > 사업자(가나다) > 판매처(가나다) > 상품명(가나다)
 */
function sortOrders(list) {
  return [...list].sort((a, b) => {
    // 1순위: 주문일자 (내림차순, 최신 날짜 우선)
    const dateA = formatOrderDateOnly(a.orderDate);
    const dateB = formatOrderDateOnly(b.orderDate);
    if (dateA !== dateB) {
      return dateB.localeCompare(dateA);
    }

    // 2순위: 사업자 가나다 순 (사업자A -> 사업자B)
    const bizA = a.biz || '';
    const bizB = b.biz || '';
    if (bizA !== bizB) {
      return bizA.localeCompare(bizB, 'ko');
    }

    // 3순위: 판매처 가나다 순 (공란은 뒤로)
    const marketA = a.market || '';
    const marketB = b.market || '';
    if (marketA !== marketB) {
      if (!marketA) return 1;
      if (!marketB) return -1;
      return marketA.localeCompare(marketB, 'ko');
    }

    // 4순위: 상품명 가나다 순
    const prodA = a.productName || '';
    const prodB = b.productName || '';
    return prodA.localeCompare(prodB, 'ko');
  });
}

function getBizOrders() {
  let list = AppState.rawOrders;
  if (AppState.currentBizFilter !== 'ALL') {
    list = list.filter(o => o.biz === AppState.currentBizFilter);
  }
  return sortOrders(list);
}

function getCountableOrders() {
  return getBizOrders().filter(isOrderCountable);
}

function formatKRW(val) {
  const num = Math.round(val || 0);
  return num.toLocaleString('ko-KR') + '원';
}

/**
 * 전체 렌더링
 */
function renderAll() {
  renderDashboard();
  renderOrdersTable();
  renderCardsView();
  renderSettlementView();
  renderInventoryView();
  calculatePL();
  if (window.feather) feather.replace();
}

/**
 * 1. 대시보드 렌더링
 */
function renderDashboard() {
  const allBizOrders = getBizOrders();
  const countableOrders = getCountableOrders();

  let totalSales = 0;
  let totalSettlement = 0;
  let totalCost = 0;
  let totalProfit = 0;

  countableOrders.forEach(o => {
    totalSales += o.totalSales;
    const settleAmt = (o.actualSettlement > 0) ? o.actualSettlement : o.standardPrice;
    totalSettlement += settleAmt;
    const itemCost = getOrderActualCost(o);
    totalCost += itemCost;
    totalProfit += (settleAmt - itemCost);
  });

  const avgMargin = totalSettlement > 0 ? (totalProfit / totalSettlement) * 100 : 0;

  document.getElementById('statTotalSales').textContent = formatKRW(totalSales);
  document.getElementById('statSalesCount').textContent = `전체 ${allBizOrders.length}건 중 실적집계 ${countableOrders.length}건 반영`;
  document.getElementById('statNetSettlement').textContent = formatKRW(totalSettlement);
  document.getElementById('statTotalCost').textContent = formatKRW(totalCost);
  document.getElementById('statNetProfit').textContent = formatKRW(totalProfit);
  document.getElementById('statMarginRate').textContent = `평균 수익률 ${avgMargin.toFixed(1)}% (완료건 기준)`;

  document.getElementById('topTodayOrders').textContent = `${countableOrders.length}건`;
  document.getElementById('topExpectedProfit').textContent = formatKRW(totalProfit);

  renderDashboardCards(countableOrders);
  renderMarketChart(countableOrders);
  renderTopTables(countableOrders);
}

/**
 * 대시보드 카드사 목록 렌더링 (카드명의 구분)
 */
function renderDashboardCards(countableOrders) {
  const container = document.getElementById('dashboardCardList');
  const countBadge = document.getElementById('cardCountBadge');
  if (!container) return;

  const cardMap = {};
  countableOrders.forEach(o => {
    if (o.paymentCard && o.purchaseCost > 0) {
      const cardKey = o.cardHolder ? `${o.paymentCard} (${o.cardHolder})` : o.paymentCard;
      if (!cardMap[cardKey]) {
        cardMap[cardKey] = {
          name: o.paymentCard,
          holder: o.cardHolder || '명의미지정',
          displayName: cardKey,
          total: 0,
          count: 0
        };
      }
      cardMap[cardKey].total += o.purchaseCost;
      cardMap[cardKey].count += 1;
    }
  });

  const cardList = Object.values(cardMap).sort((a, b) => b.total - a.total);
  if (countBadge) countBadge.textContent = `${cardList.length}개 카드(명의)`;

  if (cardList.length === 0) {
    container.innerHTML = '<p class="text-gray-400" style="padding:14px;">완료 집계된 카드 결제 내역이 없습니다.</p>';
    return;
  }

  container.innerHTML = cardList.map(c => `
    <div class="card-item">
      <div class="card-item-left">
        <div class="card-logo">${c.name.slice(0, 2)}</div>
        <div class="card-meta">
          <div class="card-name">${c.displayName}</div>
          <div class="card-count">${c.count}건 결제 완료 · 명의자: ${c.holder}</div>
        </div>
      </div>
      <div class="card-amount">${formatKRW(c.total)}</div>
    </div>
  `).join('');
}

/**
 * 마켓 비중 차트
 */
function renderMarketChart(countableOrders) {
  const ctx = document.getElementById('marketChart');
  if (!ctx) return;

  if (typeof Chart === 'undefined') {
    const parent = ctx.parentElement;
    if (parent) {
      parent.innerHTML = '<div style="padding:40px;text-align:center;color:#64748b;font-size:13px;">📊 오프라인 모드: 차트 없이도 모든 표와 수치는 완벽하게 계산됩니다.</div>';
    }
    return;
  }

  const marketTotals = {};
  countableOrders.forEach(o => {
    if (o.market) {
      marketTotals[o.market] = (marketTotals[o.market] || 0) + o.totalSales;
    }
  });

  const labels = Object.keys(marketTotals);
  const data = Object.values(marketTotals);

  if (marketChartInstance) {
    marketChartInstance.destroy();
  }

  marketChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: [
          '#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'
        ],
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { font: { family: '-apple-system', size: 12 } }
        }
      }
    }
  });
}

/**
 * TOP 5 상품 테이블
 */
function renderTopTables(countableOrders) {
  const topSellingTbody = document.getElementById('topSellingTableBody');
  const topMarginTbody = document.getElementById('topMarginTableBody');

  const prodMap = {};
  countableOrders.forEach(o => {
    if (!prodMap[o.productName]) {
      prodMap[o.productName] = {
        name: o.productName,
        qty: 0,
        sales: 0,
        profit: 0,
        settlement: 0
      };
    }
    const settleAmt = (o.actualSettlement > 0) ? o.actualSettlement : o.standardPrice;
    const profit = settleAmt - getOrderActualCost(o);

    prodMap[o.productName].qty += o.qty;
    prodMap[o.productName].sales += o.totalSales;
    prodMap[o.productName].profit += profit;
    prodMap[o.productName].settlement += settleAmt;
  });

  const prodList = Object.values(prodMap);

  const topSelling = [...prodList].sort((a, b) => b.qty - a.qty).slice(0, 5);
  if (topSellingTbody) {
    topSellingTbody.innerHTML = topSelling.map((p, idx) => `
      <tr>
        <td><strong>#${idx + 1}</strong></td>
        <td style="max-width:240px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${p.name}">
          ${p.name}
        </td>
        <td><strong>${p.qty}개</strong></td>
        <td>${formatKRW(p.sales)}</td>
      </tr>
    `).join('');
  }

  const topMargin = [...prodList].filter(p => p.settlement > 0).sort((a, b) => (b.profit / b.qty) - (a.profit / a.qty)).slice(0, 5);
  if (topMarginTbody) {
    topMarginTbody.innerHTML = topMargin.map((p, idx) => {
      const unitMargin = p.qty > 0 ? p.profit / p.qty : 0;
      const rate = p.settlement > 0 ? (p.profit / p.settlement) * 100 : 0;
      return `
        <tr>
          <td><strong>#${idx + 1}</strong></td>
          <td style="max-width:240px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${p.name}">
            ${p.name}
          </td>
          <td><strong class="text-success">${formatKRW(unitMargin)}</strong></td>
          <td><span class="badge" style="background:#ecfdf5;color:#059669">${rate.toFixed(1)}%</span></td>
        </tr>
      `;
    }).join('');
  }
}

/**
 * 2. 매입·매출 상세 테이블 렌더링 (한줄 구조 + 4단계 다중 정렬 적용 ⭐)
 */
function renderOrdersTable() {
  const tbody = document.getElementById('ordersTableBody');
  if (!tbody) return;

  let list = getBizOrders();

  if (AppState.searchQuery) {
    const q = AppState.searchQuery;
    list = list.filter(o =>
      o.productName.toLowerCase().includes(q) ||
      o.recipient.toLowerCase().includes(q) ||
      o.orderNo.toLowerCase().includes(q) ||
      o.market.toLowerCase().includes(q) ||
      (o.cardHolder && o.cardHolder.toLowerCase().includes(q))
    );
  }

  if (AppState.selectedMarket !== 'ALL') {
    list = list.filter(o => o.market === AppState.selectedMarket);
  }

  if (AppState.selectedSourcing !== 'ALL') {
    list = list.filter(o => o.sourcingPlatform === AppState.selectedSourcing);
  }

  if (AppState.selectedSourcingType !== 'ALL') {
    list = list.filter(o => o.sourcingType === AppState.selectedSourcingType);
  }

  if (AppState.selectedOrderStage !== 'ALL') {
    list = list.filter(o => o.orderStage === AppState.selectedOrderStage);
  }

  if (AppState.selectedPurchaseStage !== 'ALL') {
    list = list.filter(o => o.purchaseStage === AppState.selectedPurchaseStage);
  }

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="18" style="text-align:center;padding:40px;color:#94a3b8;">조건에 일치하는 주문 내역이 없습니다.</td></tr>';
    return;
  }

  let html = '';

  list.forEach(o => {
    const rawIdx = AppState.rawOrders.indexOf(o);

    // 사입 입고 건 (매출 없이 사입한 경우: 판매처 공란 or 판매가 0)
    const isPurchaseOnly = (o.sourcingType === '사입' && (!o.market || o.salePrice === 0));

    // ⭐ 매입가와 총비용 분리:
    // 1) productCost: 순수 상품 매입가 (매입가 열에 표시 - 택배비 절대 제외!)
    // 2) totalCost: 매출 건당 총 매입원가 (마진 계산 시 택배비 차감 반영)
    const productCost = getOrderProductCost(o);
    const totalCost = getOrderActualCost(o);
    const ptAmount = (o.point > 0 ? o.point : (o.pointUsed > 0 ? o.pointUsed : 0));

    const settleAmt = (o.actualSettlement > 0) ? o.actualSettlement : o.standardPrice;
    const marginAmt = (!isPurchaseOnly && totalCost > 0) ? (settleAmt - totalCost) : 0;
    const marginPct = (!isPurchaseOnly && settleAmt > 0 && totalCost > 0) ? (marginAmt / settleAmt) * 100 : 0;

    const isCounted = isOrderCountable(o);

    html += `
      <tr class="${isCounted ? '' : 'row-dimmed'}">
        <!-- 1. 사업자 (독립 셀) -->
        <td>
          <span class="badge" style="background:${o.biz==='사업자A'?'#e0e7ff':'#fef3c7'};color:${o.biz==='사업자A'?'#3730a3':'#92400e'}">${o.biz}</span>
        </td>

        <!-- 2. 주문일자 / 주문고유번호 (위아래 교체 & 일자만 표시 ⭐) -->
        <td>
          <div style="font-weight:700;color:#1e293b;">${formatOrderDateOnly(o.orderDate)}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px;">#${o.orderNo}</div>
        </td>

        <!-- 3. 판매처 (독립 셀, 사입 시 공란 표시 ⭐) -->
        <td>
          <strong style="color:#1e293b;">${o.market ? o.market : '-'}</strong>
        </td>

        <!-- 4. 상품명 / 옵션 -->
        <td style="max-width:220px;">
          <div style="font-weight:600;color:#1e293b;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;" title="${o.productName}">${o.productName}</div>
          ${o.option ? `<div style="font-size:11px;color:#64748b;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;">${o.option}</div>` : ''}
        </td>

        <!-- 5. 수량 -->
        <td style="text-align:center;">
          <strong>${o.qty}</strong>
        </td>

        <!-- 6. 고객명 -->
        <td>${isPurchaseOnly ? '-' : (o.recipient || '-')}</td>

        <!-- 7. 판매가(배송비포함) -->
        <td style="text-align:right;">
          <strong style="font-size:13px;color:#1e293b;">${isPurchaseOnly ? '-' : formatKRW(o.totalSales)}</strong>
        </td>

        <!-- 8. 정산예정가 -->
        <td style="text-align:right;">
          <strong class="text-info">${isPurchaseOnly ? '-' : formatKRW(o.standardPrice)}</strong>
        </td>

        <!-- 9. 정산가 (천원단위 콤마 표시 ⭐) -->
        <td style="text-align:right;">
          ${isPurchaseOnly ? '-' : `
            <input type="text" class="input-settlement" 
                   value="${formatKRW(o.actualSettlement || o.standardPrice)}" 
                   title="실제 정산가를 입력하세요 (천원단위 콤마 표시)"
                   onfocus="this.select()"
                   oninput="formatSettlementInput(this)"
                   onchange="updateActualSettlement(${rawIdx}, this.value)">
          `}
        </td>

        <!-- 10. 주문구분 (사입입고 삭제! 대기/완료/취소/반품/교환만 관리 ⭐) -->
        <td style="text-align:center;">
          <select class="select-stage stage-${o.orderStage==='완료'?'completed':(o.orderStage==='대기'?'waiting':'cancel')}" 
                  onchange="updateOrderStage(${rawIdx}, this.value)">
            <option value="대기" ${o.orderStage==='대기'?'selected':''}>대기</option>
            <option value="완료" ${o.orderStage==='완료'?'selected':''}>완료</option>
            <option value="취소" ${o.orderStage==='취소'?'selected':''}>취소</option>
            <option value="반품" ${o.orderStage==='반품'?'selected':''}>반품</option>
            <option value="교환" ${o.orderStage==='교환'?'selected':''}>교환</option>
          </select>
        </td>

        <!-- 11. 매입유형 (사입은 오직 여기서 관리! ⭐) -->
        <td style="text-align:center;">
          <select class="select-stage ${o.sourcingType==='사입'?'stage-waiting':'stage-completed'}" 
                  onchange="updateSourcingType(${rawIdx}, this.value)">
            <option value="위탁" ${o.sourcingType==='위탁'?'selected':''}>위탁</option>
            <option value="사입" ${o.sourcingType==='사입'?'selected':''}>사입</option>
          </select>
        </td>

        <!-- 12. 소싱처 / 공급사 (소싱처 수기 등록 확인 ⭐) -->
        <td>
          <div style="font-weight:600;color:#1e293b;">${o.sourcingPlatform || '-'}</div>
          <div style="font-size:11px;color:#64748b;">${o.supplierName || o.supplierBiz || '-'}</div>
        </td>

        <!-- 13. 결제카드 / 카드명의 -->
        <td>
          <div>${o.paymentCard || '-'}</div>
          <div style="font-size:11px;color:#4f46e5;font-weight:700;">${o.cardHolder || '명의미지정'}</div>
        </td>

        <!-- 14. 매입가 (순수 상품 매입가만 깔끔하게 표시! 사입 택배비는 표시 안 함 ⭐) -->
        <td style="text-align:right;">
          <strong class="text-danger">${productCost > 0 ? formatKRW(productCost) : '-'}</strong>
          ${(o.sourcingType === '위탁' && (o.point > 0 || o.pointUsed > 0)) ? `
            <div style="font-size:11px;color:#d97706;font-weight:600;margin-top:2px;" title="소싱 시 사용된 포인트">
              (포인트 ${formatKRW(o.point || o.pointUsed)})
            </div>
          ` : ''}
        </td>

        <!-- 15. 마진금액 -->
        <td style="text-align:right;">
          ${isPurchaseOnly ? '<span style="color:#94a3b8;font-size:11px;">(사입재고)</span>' : `<strong class="text-success">${formatKRW(marginAmt)}</strong>`}
        </td>

        <!-- 16. 마진율 -->
        <td style="text-align:center;">
          ${isPurchaseOnly ? '-' : `
            <span class="badge" style="background:${marginPct >= 15 ? '#ecfdf5' : '#f1f5f9'};color:${marginPct >= 15 ? '#059669' : '#475569'}">
              ${marginPct.toFixed(1)}%
            </span>
          `}
        </td>

        <!-- 17. 발주상태 -->
        <td style="text-align:center;">
          <select class="select-stage stage-${o.purchaseStage==='완료'?'completed':'cancel'}" 
                  onchange="updatePurchaseStage(${rawIdx}, this.value)">
            <option value="완료" ${o.purchaseStage==='완료'?'selected':''}>완료</option>
            <option value="반품" ${o.purchaseStage==='반품'?'selected':''}>반품</option>
            <option value="취소" ${o.purchaseStage==='취소'?'selected':''}>취소</option>
          </select>
        </td>

        <!-- 18. 관리 -->
        <td style="text-align:center;">
          <button class="btn-action-icon" onclick="openOrderModal(${rawIdx})" title="주문 수정">✏️</button>
          <button class="btn-action-icon delete" onclick="deleteOrder(${rawIdx})" title="주문 삭제">🗑️</button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // 일별 및 월별 집계표도 함께 동기화 갱신 ⭐
  renderOrdersDailyTable();
  renderOrdersMonthlyTable();
}

/**
 * 주문장 뷰 모드 전환 (상세 주문장 / 일별 집계표 / 월별 집계표)
 */
function switchOrdersViewTab(tab) {
  AppState.ordersViewMode = tab;
  const listCont = document.getElementById('ordersListContainer');
  const dailyCont = document.getElementById('ordersDailyContainer');
  const monthlyCont = document.getElementById('ordersMonthlyContainer');
  const btnList = document.getElementById('btnViewOrdersList');
  const btnDaily = document.getElementById('btnViewOrdersDaily');
  const btnMonthly = document.getElementById('btnViewOrdersMonthly');
  const desc = document.getElementById('ordersViewTabDesc');

  if (btnList && btnDaily && btnMonthly) {
    btnList.classList.toggle('active', tab === 'list');
    btnDaily.classList.toggle('active', tab === 'daily');
    btnMonthly.classList.toggle('active', tab === 'monthly');
  }

  if (listCont) listCont.style.display = (tab === 'list') ? 'block' : 'none';
  if (dailyCont) dailyCont.style.display = (tab === 'daily') ? 'block' : 'none';
  if (monthlyCont) monthlyCont.style.display = (tab === 'monthly') ? 'block' : 'none';

  if (desc) {
    if (tab === 'list') desc.textContent = '💡 모든 주문 건의 판매·매입·마진 상세 내역을 1줄로 확인하고 관리합니다.';
    else if (tab === 'daily') desc.textContent = '📅 주문일자별 주문건수, 총 판매액, 매입원가 및 일별 마진 집계표입니다.';
    else if (tab === 'monthly') desc.textContent = '📆 월별 실적 추이, 매출액, 정산예정액, 매입원가 및 월간 누적 마진 집계표입니다.';
  }

  if (tab === 'daily') renderOrdersDailyTable();
  if (tab === 'monthly') renderOrdersMonthlyTable();
  if (window.feather) feather.replace();
}

/**
 * 일별 매입·매출 집계표 렌더링
 */
function renderOrdersDailyTable() {
  const tbody = document.getElementById('ordersDailyTableBody');
  const tfoot = document.getElementById('ordersDailyTableFoot');
  if (!tbody) return;

  const countable = getCountableOrders();
  const dayMap = {};

  countable.forEach(o => {
    const day = formatOrderDateOnly(o.orderDate);
    if (!day || day === '-') return;

    if (!dayMap[day]) {
      dayMap[day] = {
        date: day,
        count: 0,
        grossSales: 0,
        settleDue: 0,
        cost: 0,
        margin: 0
      };
    }

    const settleAmt = (o.actualSettlement > 0) ? o.actualSettlement : o.standardPrice;
    const actualCost = getOrderActualCost(o);
    const mAmount = Math.round(settleAmt - actualCost);

    dayMap[day].count += 1;
    dayMap[day].grossSales += (o.totalSales || 0);
    dayMap[day].settleDue += settleAmt;
    dayMap[day].cost += actualCost;
    dayMap[day].margin += mAmount;
  });

  const days = Object.values(dayMap).sort((a, b) => b.date.localeCompare(a.date));

  if (days.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:#94a3b8;">집계할 완료 주문 데이터가 없습니다.</td></tr>';
    if (tfoot) tfoot.innerHTML = '';
    return;
  }

  let totalCount = 0;
  let totalSales = 0;
  let totalSettle = 0;
  let totalCost = 0;
  let totalMargin = 0;

  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  tbody.innerHTML = days.map(d => {
    totalCount += d.count;
    totalSales += d.grossSales;
    totalSettle += d.settleDue;
    totalCost += d.cost;
    totalMargin += d.margin;

    const mRate = d.settleDue > 0 ? (d.margin / d.settleDue) * 100 : 0;
    const dObj = new Date(d.date);
    const dName = !isNaN(dObj.getDay()) ? `(${dayNames[dObj.getDay()]})` : '';

    return `
      <tr>
        <td style="text-align:center;font-weight:700;color:#1e293b;">
          ${d.date} <span style="font-size:11px;color:#64748b;">${dName}</span>
        </td>
        <td style="text-align:center;"><strong>${d.count}건</strong></td>
        <td style="text-align:right;">${formatKRW(d.grossSales)}</td>
        <td style="text-align:right;color:#1e40af;font-weight:700;">${formatKRW(d.settleDue)}</td>
        <td style="text-align:right;color:#dc2626;">${formatKRW(d.cost)}</td>
        <td style="text-align:right;color:#059669;font-weight:800;">+${formatKRW(d.margin)}</td>
        <td style="text-align:center;">
          <span class="badge" style="background:${mRate >= 20 ? '#ecfdf5' : '#eff6ff'};color:${mRate >= 20 ? '#059669' : '#1d4ed8'};font-weight:800;">
            ${mRate.toFixed(1)}%
          </span>
        </td>
        <td style="text-align:center;">
          <button class="btn btn-sm btn-secondary" onclick="filterOrdersByDate('${d.date}')" style="font-size:11px;padding:3px 8px;">
            🔍 주문보기
          </button>
        </td>
      </tr>
    `;
  }).join('');

  if (tfoot) {
    const avgRate = totalSettle > 0 ? (totalMargin / totalSettle) * 100 : 0;
    tfoot.innerHTML = `
      <tr style="background:#f8fafc;border-top:2px solid #cbd5e1;">
        <td style="text-align:center;font-weight:800;">총 합계</td>
        <td style="text-align:center;font-weight:800;">${totalCount}건</td>
        <td style="text-align:right;font-weight:800;">${formatKRW(totalSales)}</td>
        <td style="text-align:right;font-weight:800;color:#1e40af;">${formatKRW(totalSettle)}</td>
        <td style="text-align:right;font-weight:800;color:#dc2626;">${formatKRW(totalCost)}</td>
        <td style="text-align:right;font-weight:800;color:#059669;">+${formatKRW(totalMargin)}</td>
        <td style="text-align:center;font-weight:800;">${avgRate.toFixed(1)}%</td>
        <td style="text-align:center;">-</td>
      </tr>
    `;
  }
}

/**
 * 월별 매입·매출 집계표 렌더링
 */
function renderOrdersMonthlyTable() {
  const tbody = document.getElementById('ordersMonthlyTableBody');
  const tfoot = document.getElementById('ordersMonthlyTableFoot');
  if (!tbody) return;

  const countable = getCountableOrders();
  const monthMap = {};

  countable.forEach(o => {
    const day = formatOrderDateOnly(o.orderDate);
    if (!day || day === '-') return;
    const monthKey = day.substring(0, 7); // YYYY-MM

    if (!monthMap[monthKey]) {
      monthMap[monthKey] = {
        month: monthKey,
        count: 0,
        grossSales: 0,
        settleDue: 0,
        cost: 0,
        margin: 0
      };
    }

    const settleAmt = (o.actualSettlement > 0) ? o.actualSettlement : o.standardPrice;
    const actualCost = getOrderActualCost(o);
    const mAmount = Math.round(settleAmt - actualCost);

    monthMap[monthKey].count += 1;
    monthMap[monthKey].grossSales += (o.totalSales || 0);
    monthMap[monthKey].settleDue += settleAmt;
    monthMap[monthKey].cost += actualCost;
    monthMap[monthKey].margin += mAmount;
  });

  const months = Object.values(monthMap).sort((a, b) => b.month.localeCompare(a.month));

  if (months.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:#94a3b8;">집계할 완료 주문 데이터가 없습니다.</td></tr>';
    if (tfoot) tfoot.innerHTML = '';
    return;
  }

  let totalCount = 0;
  let totalSales = 0;
  let totalSettle = 0;
  let totalCost = 0;
  let totalMargin = 0;

  tbody.innerHTML = months.map(m => {
    totalCount += m.count;
    totalSales += m.grossSales;
    totalSettle += m.settleDue;
    totalCost += m.cost;
    totalMargin += m.margin;

    const mRate = m.settleDue > 0 ? (m.margin / m.settleDue) * 100 : 0;
    const parts = m.month.split('-');
    const label = `${parts[0]}년 ${parseInt(parts[1], 10)}월`;

    return `
      <tr>
        <td style="text-align:center;font-weight:800;color:#1e3a8a;font-size:14px;">
          ${label}
        </td>
        <td style="text-align:center;"><strong>${m.count}건</strong></td>
        <td style="text-align:right;">${formatKRW(m.grossSales)}</td>
        <td style="text-align:right;color:#1e40af;font-weight:700;">${formatKRW(m.settleDue)}</td>
        <td style="text-align:right;color:#dc2626;">${formatKRW(m.cost)}</td>
        <td style="text-align:right;color:#059669;font-weight:800;">+${formatKRW(m.margin)}</td>
        <td style="text-align:center;">
          <span class="badge" style="background:${mRate >= 20 ? '#ecfdf5' : '#eff6ff'};color:${mRate >= 20 ? '#059669' : '#1d4ed8'};font-weight:800;">
            ${mRate.toFixed(1)}%
          </span>
        </td>
        <td style="text-align:center;">
          <button class="btn btn-sm btn-secondary" onclick="filterOrdersByDate('${m.month}')" style="font-size:11px;padding:3px 8px;">
            🔍 주문보기
          </button>
        </td>
      </tr>
    `;
  }).join('');

  if (tfoot) {
    const avgRate = totalSettle > 0 ? (totalMargin / totalSettle) * 100 : 0;
    tfoot.innerHTML = `
      <tr style="background:#f8fafc;border-top:2px solid #cbd5e1;">
        <td style="text-align:center;font-weight:800;">누적 연간 합계</td>
        <td style="text-align:center;font-weight:800;">${totalCount}건</td>
        <td style="text-align:right;font-weight:800;">${formatKRW(totalSales)}</td>
        <td style="text-align:right;font-weight:800;color:#1e40af;">${formatKRW(totalSettle)}</td>
        <td style="text-align:right;font-weight:800;color:#dc2626;">${formatKRW(totalCost)}</td>
        <td style="text-align:right;font-weight:800;color:#059669;">+${formatKRW(totalMargin)}</td>
        <td style="text-align:center;font-weight:800;">${avgRate.toFixed(1)}%</td>
        <td style="text-align:center;">-</td>
      </tr>
    `;
  }
}

/**
 * 일자 또는 월을 검색창에 입력하여 상세 주문장으로 즉시 이동 필터링
 */
function filterOrdersByDate(dateOrMonthStr) {
  switchOrdersViewTab('list');
  const input = document.getElementById('orderSearchInput');
  if (input) {
    input.value = dateOrMonthStr;
    AppState.searchQuery = dateOrMonthStr.trim().toLowerCase();
    renderOrdersTable();
  }
}

/**
 * 3. 카드사 결제 관리 (카드명의 구분)
 */
/**
 * 3. 카드사 결제 관리 (카드명의자·결제일·청구기간 연동 및 당월/다음월 결제분할 엔진)
 */

/**
 * 주문 결제일시가 해당 카드의 당월 결제분인지, 다음월 결제분인지 계산
 */
function calcCardBillingSplit(orderDateStr, cardSetting) {
  if (!orderDateStr) return 'CURRENT';
  const cleanDate = orderDateStr.trim().split(' ')[0]; // YYYY-MM-DD
  const parts = cleanDate.split('-');
  if (parts.length < 3) return 'CURRENT';

  const orderYear = parseInt(parts[0], 10);
  const orderMonth = parseInt(parts[1], 10);
  const orderDay = parseInt(parts[2], 10);

  // 현재 시스템 기준 월 (2026년 11월)
  const curYear = 2026;
  const curMonth = 11;

  const payDay = (cardSetting && cardSetting.payDay) ? parseInt(cardSetting.payDay, 10) : 14;
  const billingDesc = (cardSetting && cardSetting.billingDesc) ? cardSetting.billingDesc : '전월 1일 ~ 전월 말일';

  // 표준 14일 전후 결제 (전월 1일 ~ 전월 말일 이용분)
  if (billingDesc.includes('전월 1일') || payDay <= 15) {
    if (orderYear === curYear && orderMonth === (curMonth - 1)) {
      return 'CURRENT'; // 10월 결제분 -> 11월 결제일에 청구
    } else if (orderYear === curYear && orderMonth === curMonth) {
      return 'NEXT';    // 11월 결제분 -> 12월 결제일에 청구
    } else if (orderYear === curYear && orderMonth < (curMonth - 1)) {
      return 'CURRENT'; // 과거분
    } else {
      return 'NEXT';
    }
  } else {
    // 25일 결제 등 (전전월 14일 ~ 전월 13일 이용분)
    const orderNum = orderMonth * 100 + orderDay;
    if (orderNum <= (curMonth - 1) * 100 + 13) {
      return 'CURRENT';
    } else {
      return 'NEXT';
    }
  }
}

// 명의자별 대표 색상 맵 (명의자별로 일관된 색상 부여)
const HOLDER_THEME_MAP = {
  '강우석': 'theme-blue',
  'tjrdnrkd': 'theme-emerald',
  '리사': 'theme-purple'
};

function getHolderTheme(holder, fallbackTheme) {
  if (!holder || holder === '명의미지정') return 'theme-slate';
  if (HOLDER_THEME_MAP[holder]) return HOLDER_THEME_MAP[holder];

  if (fallbackTheme && fallbackTheme.startsWith('theme-')) {
    HOLDER_THEME_MAP[holder] = fallbackTheme;
    return fallbackTheme;
  }

  const found = AppState.cardSettings.find(s => s.holder === holder && s.theme);
  if (found && found.theme) {
    HOLDER_THEME_MAP[holder] = found.theme;
    return found.theme;
  }

  const palette = ['theme-blue', 'theme-emerald', 'theme-purple', 'theme-amber', 'theme-rose', 'theme-teal', 'theme-indigo', 'theme-slate'];
  let hash = 0;
  for (let i = 0; i < holder.length; i++) {
    hash = holder.charCodeAt(i) + ((hash << 5) - hash);
  }
  const assigned = palette[Math.abs(hash) % palette.length];
  HOLDER_THEME_MAP[holder] = assigned;
  return assigned;
}

function renderCardsView() {
  const grid = document.getElementById('cardsDetailGrid');
  const tbody = document.getElementById('cardTransactionsTableBody');
  const allOrders = getBizOrders().filter(o => o.purchaseStage === '완료');

  const cardMap = {};

  // 1. 등록된 카드 세팅 기반으로 기본 맵 구성
  AppState.cardSettings.forEach(s => {
    const cardKey = s.holder ? `${s.name} (${s.holder})` : s.name;
    const theme = getHolderTheme(s.holder, s.theme);
    cardMap[cardKey] = {
      name: s.name,
      holder: s.holder || '명의미지정',
      displayName: cardKey,
      payDay: s.payDay || 14,
      billingDesc: s.billingDesc || '전월 1일 ~ 전월 말일',
      theme: theme,
      note: s.note || '',
      settingId: s.id,
      total: 0,
      currentDue: 0,
      nextDue: 0,
      count: 0,
      platforms: new Set()
    };
  });

  // 2. 주문 결제 데이터 집계 및 당월/다음월 분할
  allOrders.forEach(o => {
    if (o.paymentCard && o.purchaseCost > 0) {
      const cardKey = o.cardHolder ? `${o.paymentCard} (${o.cardHolder})` : o.paymentCard;
      if (!cardMap[cardKey]) {
        const theme = getHolderTheme(o.cardHolder);
        cardMap[cardKey] = {
          name: o.paymentCard,
          holder: o.cardHolder || '명의미지정',
          displayName: cardKey,
          payDay: 14,
          billingDesc: '전월 1일 ~ 전월 말일',
          theme: theme,
          note: '',
          settingId: null,
          total: 0,
          currentDue: 0,
          nextDue: 0,
          count: 0,
          platforms: new Set()
        };
      }
      const entry = cardMap[cardKey];
      entry.total += o.purchaseCost;
      entry.count += 1;
      if (o.sourcingPlatform) entry.platforms.add(o.sourcingPlatform);

      const split = calcCardBillingSplit(o.paymentDate || o.orderDate, entry);
      if (split === 'CURRENT') {
        entry.currentDue += o.purchaseCost;
      } else {
        entry.nextDue += o.purchaseCost;
      }
    }
  });

  const cards = Object.values(cardMap);

  // 3. 카드 그리드 렌더링 (불필요한 누적/주요처/비고 제거 & 명의자별 통일 테마 적용 ⭐)
  if (grid) {
    if (cards.length === 0) {
      grid.innerHTML = '<div style="padding:30px;color:#94a3b8;">등록되거나 사용된 결제 카드가 없습니다.</div>';
    } else {
      grid.innerHTML = cards.map(c => {
        const theme = getHolderTheme(c.holder, c.theme);
        const isSelected = AppState.selectedCardKey === c.displayName;

        return `
          <div class="card-credit-box ${theme} ${isSelected ? 'selected' : ''}" 
               onclick="selectCard('${c.displayName}')" 
               title="${c.displayName} (클릭하시면 아래에 상세 결제 내역이 표시됩니다)${c.note ? ' - [비고] ' + c.note : ''}">
            <div class="credit-box-top">
              <div>
                <div class="credit-box-name">${c.name}</div>
                <div style="font-size:12px;opacity:0.95;margin-top:2px;">
                  명의자: <strong>${c.holder}</strong>
                  <span style="margin-left:6px;font-size:11px;background:rgba(255,255,255,0.22);padding:1px 6px;border-radius:4px;">
                    매월 ${c.payDay}일 결제
                  </span>
                </div>
              </div>
              <span class="badge" style="background:${isSelected ? '#f59e0b;color:#fff;font-weight:800;' : 'rgba(255,255,255,0.25);color:#fff;'}">
                ${isSelected ? '⭐ 선택됨' : '선택하기'}
              </span>
            </div>

            <!-- 청구기간 안내 -->
            <div style="font-size:11px;opacity:0.85;margin-top:8px;">
              청구기간: ${c.billingDesc}
            </div>

            <!-- 당월 / 다음월 결제예정금액 분리 박스 -->
            <div class="credit-box-dues">
              <div class="due-item">
                <span class="due-label">💳 당월 결제예정</span>
                <span class="due-val">${formatKRW(c.currentDue)}</span>
              </div>
              <div class="due-item" style="border-left:1px solid rgba(255,255,255,0.2);padding-left:10px;">
                <span class="due-label">📆 다음월 결제예정</span>
                <span class="due-val">${formatKRW(c.nextDue)}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 4. 하단 결제 내역 테이블 렌더링
  if (tbody) {
    let paidOrders = allOrders.filter(o => o.purchaseCost > 0);

    // 선택된 카드 필터
    if (AppState.selectedCardKey) {
      paidOrders = paidOrders.filter(o => {
        const k = o.cardHolder ? `${o.paymentCard} (${o.cardHolder})` : o.paymentCard;
        return k === AppState.selectedCardKey;
      });
      const badge = document.getElementById('cardSelectedBadge');
      const resetBtn = document.getElementById('btnResetCardFilter');
      if (badge) {
        badge.textContent = `[${AppState.selectedCardKey}] 보기 중`;
        badge.style.display = 'inline-block';
      }
      if (resetBtn) resetBtn.style.display = 'inline-block';
    } else {
      const badge = document.getElementById('cardSelectedBadge');
      const resetBtn = document.getElementById('btnResetCardFilter');
      if (badge) badge.style.display = 'none';
      if (resetBtn) resetBtn.style.display = 'none';
    }

    // 당월/다음월 탭 필터
    if (AppState.selectedCardTxTab !== 'ALL') {
      paidOrders = paidOrders.filter(o => {
        const k = o.cardHolder ? `${o.paymentCard} (${o.cardHolder})` : o.paymentCard;
        const cSetting = cardMap[k];
        const split = calcCardBillingSplit(o.paymentDate || o.orderDate, cSetting);
        return split === AppState.selectedCardTxTab;
      });
    }

    if (paidOrders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:#94a3b8;">해당 조건의 결제 내역이 없습니다.</td></tr>';
    } else {
      tbody.innerHTML = paidOrders.map(o => {
        const k = o.cardHolder ? `${o.paymentCard} (${o.cardHolder})` : o.paymentCard;
        const cSetting = cardMap[k];
        const split = calcCardBillingSplit(o.paymentDate || o.orderDate, cSetting);

        return `
          <tr>
            <td>
              <strong>${o.paymentCard}</strong>
              <div style="font-size:11px;color:#4f46e5;font-weight:700;">명의자: ${o.cardHolder || '명의미지정'}</div>
            </td>
            <td style="text-align:center;">
              <span class="badge" style="background:${split === 'CURRENT' ? '#ecfdf5;color:#059669;border:1px solid #a7f3d0;' : '#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;'}font-weight:700;font-size:11px;">
                ${split === 'CURRENT' ? '🟢 당월 청구' : '🔵 다음월 청구'}
              </span>
            </td>
            <td>${o.sourcingPlatform || '-'}</td>
            <td style="max-width:260px;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;" title="${o.productName}">${o.productName}</td>
            <td>${formatOrderDateOnly(o.paymentDate || o.orderDate)}</td>
            <td style="text-align:right;"><strong class="text-danger">${formatKRW(o.purchaseCost)}</strong></td>
            <td style="font-size:12px;">${o.sourcingOrderNo || '-'}</td>
            <td>${o.supplierName || o.supplierBiz || '-'}</td>
          </tr>
        `;
      }).join('');
    }
  }

  // 상단 뱃지 갱신
  const countBadge = document.getElementById('cardCountBadge');
  if (countBadge) {
    countBadge.textContent = `${cards.length}개 카드사`;
  }
}

/**
 * 카드를 클릭하여 선택/해제 토글
 */
function selectCard(cardKey) {
  if (AppState.selectedCardKey === cardKey) {
    AppState.selectedCardKey = null;
  } else {
    AppState.selectedCardKey = cardKey;
  }
  renderCardsView();
}

function resetCardSelection() {
  AppState.selectedCardKey = null;
  renderCardsView();
}

/**
 * 결제내역 탭 전환 (전체 / 당월결제 / 다음월결제)
 */
function setCardTxTab(tab) {
  AppState.selectedCardTxTab = tab;
  const btnAll = document.getElementById('btnCardTxAll');
  const btnCur = document.getElementById('btnCardTxCurrent');
  const btnNext = document.getElementById('btnCardTxNext');
  if (btnAll && btnCur && btnNext) {
    btnAll.classList.toggle('active', tab === 'ALL');
    btnCur.classList.toggle('active', tab === 'CURRENT');
    btnNext.classList.toggle('active', tab === 'NEXT');
  }
  renderCardsView();
}

/**
 * 카드사 정보 관리 모달 핸들러
 */
function openCardSettingsModal() {
  resetCardForm();
  renderCardSettingsList();
  const overlay = document.getElementById('cardSettingsModalOverlay');
  if (overlay) overlay.style.display = 'flex';
  if (window.feather) feather.replace();
}

function closeCardSettingsModal() {
  const overlay = document.getElementById('cardSettingsModalOverlay');
  if (overlay) overlay.style.display = 'none';
}

function resetCardForm() {
  const idEl = document.getElementById('formCardId');
  const nameEl = document.getElementById('formCardName');
  const holderEl = document.getElementById('formCardHolder');
  const payDayEl = document.getElementById('formCardPayDay');
  const descEl = document.getElementById('formCardBillingDesc');
  const themeEl = document.getElementById('formCardTheme');
  const noteEl = document.getElementById('formCardNote');
  const titleEl = document.getElementById('cardFormTitle');

  if (idEl) idEl.value = '';
  if (nameEl) nameEl.value = '';
  if (holderEl) holderEl.value = '';
  if (payDayEl) payDayEl.value = '14';
  if (descEl) descEl.value = '전월 1일 ~ 전월 말일';
  if (themeEl) themeEl.value = 'theme-blue';
  if (noteEl) noteEl.value = '';
  if (titleEl) titleEl.textContent = '+ 카드사 기본정보 신규 등록';
}

function autoFillBillingRange() {
  const payDay = parseInt(document.getElementById('formCardPayDay').value, 10);
  const descEl = document.getElementById('formCardBillingDesc');
  if (!descEl) return;
  if (payDay === 14) {
    descEl.value = '전월 1일 ~ 전월 말일';
  } else if (payDay === 25) {
    descEl.value = '전전월 14일 ~ 전월 13일';
  } else if (payDay === 10) {
    descEl.value = '전전월 28일 ~ 전월 27일';
  } else if (payDay === 1) {
    descEl.value = '전전월 17일 ~ 전월 16일';
  } else {
    descEl.value = `전월 ${payDay - 13}일 ~ 당월 ${payDay - 14}일`;
  }
}

function setPresetBilling(preset) {
  const descEl = document.getElementById('formCardBillingDesc');
  if (!descEl) return;
  if (preset === 'MONTH_PREV') {
    descEl.value = '전월 1일 ~ 전월 말일';
  } else if (preset === 'CUSTOM_25') {
    descEl.value = '전전월 14일 ~ 전월 13일';
  }
}

function saveCardSetting() {
  const id = document.getElementById('formCardId').value;
  const name = document.getElementById('formCardName').value.trim();
  const holder = document.getElementById('formCardHolder').value.trim();
  const payDay = parseInt(document.getElementById('formCardPayDay').value, 10) || 14;
  const billingDesc = document.getElementById('formCardBillingDesc').value.trim();
  const theme = document.getElementById('formCardTheme').value;
  const note = document.getElementById('formCardNote').value.trim();

  if (!name || !holder || !billingDesc) {
    alert('카드사명, 카드명의자, 청구기간을 모두 입력해주세요, 리사님!');
    return;
  }

  if (id) {
    const idx = AppState.cardSettings.findIndex(s => s.id === id);
    if (idx !== -1) {
      AppState.cardSettings[idx] = { id, name, holder, payDay, billingDesc, theme, note };
    }
  } else {
    const newId = 'card_' + Date.now();
    AppState.cardSettings.push({ id: newId, name, holder, payDay, billingDesc, theme, note });
  }

  // 명의자별 대표 테마 맵 갱신 및 동일 명의자의 모든 등록 카드 테마 일괄 통일!
  if (holder) {
    HOLDER_THEME_MAP[holder] = theme;
    AppState.cardSettings.forEach(s => {
      if (s.holder === holder) {
        s.theme = theme;
      }
    });
  }

  saveStateToStorage();
  resetCardForm();
  renderCardSettingsList();
  renderCardsView();
  alert(`[${holder}] 명의자의 카드 테마가 안전하게 저장되었습니다!`);
}

function editCardSetting(id) {
  const s = AppState.cardSettings.find(item => item.id === id);
  if (!s) return;

  document.getElementById('formCardId').value = s.id;
  document.getElementById('formCardName').value = s.name;
  document.getElementById('formCardHolder').value = s.holder;
  document.getElementById('formCardPayDay').value = s.payDay || 14;
  document.getElementById('formCardBillingDesc').value = s.billingDesc || '전월 1일 ~ 전월 말일';
  const currentTheme = getHolderTheme(s.holder, s.theme);
  document.getElementById('formCardTheme').value = currentTheme || 'theme-blue';
  document.getElementById('formCardNote').value = s.note || '';

  const titleEl = document.getElementById('cardFormTitle');
  if (titleEl) titleEl.textContent = `✏️ [${s.name} (${s.holder})] 정보 수정`;
}

function deleteCardSetting(id) {
  if (!confirm('이 카드사 설정을 삭제하시겠습니까?')) return;
  AppState.cardSettings = AppState.cardSettings.filter(s => s.id !== id);
  saveStateToStorage();
  resetCardForm();
  renderCardSettingsList();
  renderCardsView();
}

function renderCardSettingsList() {
  const tbody = document.getElementById('cardSettingsTableBody');
  if (!tbody) return;

  if (AppState.cardSettings.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#94a3b8;">등록된 카드사 정보가 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = AppState.cardSettings.map(s => `
    <tr>
      <td><strong>${s.name}</strong></td>
      <td><span class="badge" style="background:#eef2ff;color:#4f46e5;">${s.holder}</span></td>
      <td>매월 ${s.payDay}일</td>
      <td style="font-size:12px;">${s.billingDesc}</td>
      <td style="font-size:12.5px;color:#334155;white-space:pre-wrap;line-height:1.5;min-width:180px;">${s.note || '-'}</td>
      <td style="text-align:center;">
        <button class="btn btn-sm btn-secondary" onclick="editCardSetting('${s.id}')" style="padding:2px 6px;font-size:11px;margin-right:4px;">✏️수정</button>
        <button class="btn btn-sm btn-secondary" onclick="deleteCardSetting('${s.id}')" style="padding:2px 6px;font-size:11px;color:#dc2626;">🗑️삭제</button>
      </td>
    </tr>
  `).join('');
}

/**
 * 알려진 판매처 목록 반환 헬퍼
 */
function getKnownMarketsList() {
  const set = new Set(['스마트스토어', '쿠팡(신)', '11번가', 'G마켓', '옥션', '올웨이즈', '카카오 톡스토어']);
  AppState.rawOrders.forEach(o => {
    if (o.market) set.add(o.market);
  });
  return Array.from(set);
}

/**
 * 은행 거래내역 적요/비고에서 정산 판매처명 자동 탐색 감지
 */
function detectMarketFromText(text) {
  if (!text) return null;
  const clean = text.toLowerCase().replace(/\s+/g, '');
  if (clean.includes('스마트스토어') || clean.includes('네이버페이') || clean.includes('네이버정산') || clean.includes('스토어정산')) {
    return '스마트스토어';
  }
  if (clean.includes('쿠팡')) {
    return '쿠팡(신)';
  }
  if (clean.includes('11번가') || clean.includes('십일번가') || clean.includes('일레븐')) {
    return '11번가';
  }
  if (clean.includes('g마켓') || clean.includes('지마켓') || clean.includes('이베이') || clean.includes('gmarket')) {
    return 'G마켓';
  }
  if (clean.includes('옥션') || clean.includes('auction')) {
    return '옥션';
  }
  if (clean.includes('올웨이즈') || clean.includes('alwayz') || clean.includes('레비잇')) {
    return '올웨이즈';
  }
  if (clean.includes('카카오') || clean.includes('톡스토어')) {
    return '카카오 톡스토어';
  }
  if (clean.includes('롯데온') || clean.includes('lotteon')) {
    return '롯데온';
  }
  if (clean.includes('인터파크')) {
    return '인터파크';
  }

  const known = getKnownMarketsList();
  for (const m of known) {
    const mClean = m.toLowerCase().replace(/\s+/g, '');
    if (clean.includes(mClean)) return m;
  }
  return null;
}

/**
 * ⭐ 통장 거래내역(bankTransactions)을 참조하여 판매처별 기입금 완료액과 입금 건수 집계
 */
function getMarketDepositsFromBank() {
  const marketMap = {}; // { [market]: { total: number, count: number, txList: [] } }
  let totalSettlementDeposited = 0;

  AppState.bankTransactions.forEach(tx => {
    if (tx.type === '입금' && tx.amount > 0) {
      let m = tx.targetMarket;
      if (!m || m === 'AUTO') {
        m = detectMarketFromText((tx.summary || '') + ' ' + (tx.note || ''));
      }

      if (m && m !== 'NONE') {
        if (m === '쿠팡') m = '쿠팡(신)';

        if (!marketMap[m]) {
          marketMap[m] = { total: 0, count: 0, txList: [] };
        }
        marketMap[m].total += tx.amount;
        marketMap[m].count += 1;
        marketMap[m].txList.push(tx);
        totalSettlementDeposited += tx.amount;
      }
    }
  });

  return { marketMap, totalSettlementDeposited };
}

/**
 * 4. 정산 미수금 & 통장 관리 (⭐ 통장 입출금 내역과 100% 실시간 연동!)
 */
function renderSettlementView() {
  const countableOrders = getCountableOrders();
  const bankDeposits = getMarketDepositsFromBank();

  const marketMap = {};
  let totalDue = 0;

  // 1. 주문장 기준 완료된 주문들의 판매처별 매출 기준가(정산예정액) 집계
  countableOrders.forEach(o => {
    if (o.market && o.totalSales > 0) {
      if (!marketMap[o.market]) {
        marketMap[o.market] = { market: o.market, due: 0, deposited: 0, depositCount: 0 };
      }
      const settleAmt = (o.actualSettlement > 0) ? o.actualSettlement : o.standardPrice;
      marketMap[o.market].due += settleAmt;
      totalDue += settleAmt;
    }
  });

  // 2. ⭐ 통장 거래내역에서 집계된 판매처별 입금액을 1:1 매핑
  Object.keys(bankDeposits.marketMap).forEach(m => {
    if (!marketMap[m]) {
      marketMap[m] = { market: m, due: 0, deposited: 0, depositCount: 0 };
    }
    marketMap[m].deposited = bankDeposits.marketMap[m].total;
    marketMap[m].depositCount = bankDeposits.marketMap[m].count;
  });

  // 3. 각 마켓별 남은 미수금 및 총 입금완료액 계산
  let totalDeposited = 0;
  Object.keys(marketMap).forEach(m => {
    const entry = marketMap[m];
    entry.receivable = Math.max(0, entry.due - entry.deposited);
    totalDeposited += entry.deposited;
  });

  const totalReceivable = Math.max(0, totalDue - totalDeposited);

  let bankTotal = 0;
  const filteredBanks = AppState.currentBizFilter === 'ALL'
    ? AppState.bankAccounts
    : AppState.bankAccounts.filter(b => b.biz === AppState.currentBizFilter);

  filteredBanks.forEach(b => { bankTotal += b.balance; });

  const elDue = document.getElementById('settleTotalDue');
  const elDep = document.getElementById('settleDeposited');
  const elRec = document.getElementById('settleRemainingReceivable');
  const elBal = document.getElementById('bankTotalBalance');

  if (elDue) elDue.textContent = formatKRW(totalDue);
  if (elDep) elDep.textContent = formatKRW(totalDeposited);
  if (elRec) elRec.textContent = formatKRW(totalReceivable);
  if (elBal) elBal.textContent = formatKRW(bankTotal);

  const tbody = document.getElementById('marketReceivablesTableBody');
  if (tbody) {
    const list = Object.values(marketMap);
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:#94a3b8;">정산 집계할 판매처 데이터가 없습니다.</td></tr>';
    } else {
      tbody.innerHTML = list.map(m => {
        const isCompleted = m.receivable === 0 && m.due > 0;
        const isPartial = m.deposited > 0 && m.receivable > 0;
        const isNone = m.deposited === 0 && m.due > 0;

        let statusBadge = '';
        if (isCompleted) {
          statusBadge = '<span class="badge" style="background:#ecfdf5;color:#059669;font-weight:700;">🟢 정산완료</span>';
        } else if (isPartial) {
          statusBadge = `<span class="badge" style="background:#eff6ff;color:#1d4ed8;font-weight:700;">🔵 부분입금 (${Math.round((m.deposited / m.due) * 100)}%)</span>`;
        } else if (isNone) {
          statusBadge = '<span class="badge" style="background:#fff7ed;color:#ea580c;font-weight:700;">🔴 미수금 발생</span>';
        } else {
          statusBadge = '<span class="badge" style="background:#f1f5f9;color:#64748b;">-</span>';
        }

        return `
          <tr>
            <td><strong>${m.market}</strong></td>
            <td style="text-align:right;">${formatKRW(m.due)}</td>
            <td style="text-align:right;">
              <strong class="text-success">${formatKRW(m.deposited)}</strong>
              ${m.depositCount > 0 ? `<div style="font-size:11px;color:#059669;font-weight:600;">(통장 ${m.depositCount}건 입금)</div>` : ''}
            </td>
            <td style="text-align:right;"><strong class="text-danger">${formatKRW(m.receivable)}</strong></td>
            <td style="text-align:center;">${statusBadge}</td>
            <td style="text-align:center;">
              <button class="btn btn-sm btn-secondary" onclick="filterBankTxByMarket('${m.market}')" style="font-size:11px;padding:3px 8px;" title="이 판매처의 통장 입금내역 필터링">
                🔍 통장내역 (${m.depositCount}건)
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  // 등록 통장 카드 목록 렌더링
  const bankList = document.getElementById('bankAccountsList');
  if (bankList) {
    if (filteredBanks.length === 0) {
      bankList.innerHTML = '<div style="padding:24px;text-align:center;color:#94a3b8;">등록된 통장이 없습니다. [+ 통장 등록] 버튼으로 추가해보세요!</div>';
    } else {
      bankList.innerHTML = filteredBanks.map(b => `
        <div class="bank-account-card" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.04);margin-bottom:10px;">
          <div>
            <div class="bank-name" style="font-weight:700;font-size:14px;color:#1e293b;display:flex;align-items:center;gap:6px;">
              <span>🏦 ${b.bankName || b.name}</span>
              <span class="badge" style="background:#eef2ff;color:#4f46e5;font-size:11px;">${b.biz}</span>
            </div>
            <div style="font-size:12.5px;color:#475569;margin-top:3px;font-weight:600;">${b.accountName || b.name}</div>
            <div class="bank-num" style="font-size:12px;color:#64748b;margin-top:2px;font-family:monospace;">${b.accountNum}</div>
            ${b.note ? `<div style="font-size:11px;color:#0d9488;margin-top:4px;">📝 ${b.note}</div>` : ''}
          </div>
          <div style="text-align:right;">
            <div class="bank-bal" style="font-size:16px;font-weight:800;color:#065f46;">${formatKRW(b.balance)}</div>
            <div style="margin-top:6px;display:flex;gap:4px;justify-content:flex-end;">
              <button class="btn btn-sm btn-secondary" onclick="openBankAccountModal(${b.id})" style="font-size:11px;padding:3px 8px;">✏️ 수정</button>
              <button class="btn btn-sm btn-secondary" onclick="deleteBankAccount(${b.id})" style="font-size:11px;padding:3px 8px;color:#dc2626;">🗑️ 삭제</button>
            </div>
          </div>
        </div>
      `).join('');
    }
  }

  // 필터 통장 셀렉트박스 옵션 동기화
  const filterAcc = document.getElementById('bankTxFilterAccount');
  if (filterAcc) {
    const curVal = filterAcc.value;
    filterAcc.innerHTML = '<option value="ALL">모든 등록 통장</option>' + 
      AppState.bankAccounts.map(b => `<option value="${b.id}">${b.bankName || ''} - ${b.accountName || b.name} (${b.accountNum})</option>`).join('');
    if (curVal) filterAcc.value = curVal;
  }

  // 필터 정산 판매처 셀렉트박스 옵션 동기화
  const filterMkt = document.getElementById('bankTxFilterMarket');
  if (filterMkt) {
    const curVal = filterMkt.value;
    const markets = getKnownMarketsList();
    filterMkt.innerHTML = '<option value="ALL">모든 정산 판매처</option>' + 
      markets.map(m => `<option value="${m}">${m} 정산 입금만</option>`).join('');
    if (curVal) filterMkt.value = curVal;
  }

  // 통장 입출금 거래내역 장부 렌더링 동기화
  renderBankTxTable();
  if (window.feather) feather.replace();
}

/**
 * 통장 등록 / 수정 모달 핸들러
 */
function openBankAccountModal(id) {
  const idEl = document.getElementById('formBankId');
  const nameEl = document.getElementById('formBankName');
  const bizEl = document.getElementById('formBankBiz');
  const accNameEl = document.getElementById('formBankAccName');
  const accNumEl = document.getElementById('formBankAccNum');
  const balEl = document.getElementById('formBankBalance');
  const noteEl = document.getElementById('formBankNote');
  const titleEl = document.getElementById('bankModalTitle');

  if (id && id !== -1) {
    const b = AppState.bankAccounts.find(item => item.id == id);
    if (b) {
      if (idEl) idEl.value = b.id;
      if (nameEl) nameEl.value = b.bankName || '기업은행';
      if (bizEl) bizEl.value = b.biz || '사업자A';
      if (accNameEl) accNameEl.value = b.accountName || b.name || '';
      if (accNumEl) accNumEl.value = b.accountNum || '';
      if (balEl) balEl.value = b.balance || 0;
      if (noteEl) noteEl.value = b.note || '';
      if (titleEl) titleEl.textContent = `✏️ [${b.bankName || b.name}] 계좌 정보 수정`;
    }
  } else {
    if (idEl) idEl.value = '';
    if (nameEl) nameEl.value = '기업은행';
    if (bizEl) bizEl.value = AppState.currentBizFilter === 'ALL' ? '사업자A' : AppState.currentBizFilter;
    if (accNameEl) accNameEl.value = '';
    if (accNumEl) accNumEl.value = '';
    if (balEl) balEl.value = '';
    if (noteEl) noteEl.value = '';
    if (titleEl) titleEl.textContent = '🏦 통장 기본정보 등록';
  }

  const overlay = document.getElementById('bankAccountModalOverlay');
  if (overlay) overlay.style.display = 'flex';
  if (window.feather) feather.replace();
}

function closeBankAccountModal() {
  const overlay = document.getElementById('bankAccountModalOverlay');
  if (overlay) overlay.style.display = 'none';
}

function saveBankAccount() {
  const id = document.getElementById('formBankId').value;
  const bankName = document.getElementById('formBankName').value;
  const biz = document.getElementById('formBankBiz').value;
  const accountName = document.getElementById('formBankAccName').value.trim();
  const accountNum = document.getElementById('formBankAccNum').value.trim();
  const balance = parseFloat(document.getElementById('formBankBalance').value) || 0;
  const note = document.getElementById('formBankNote').value.trim();

  if (!accountName || !accountNum) {
    alert('계좌명과 계좌번호를 모두 입력해주세요, 리사님!');
    return;
  }

  const displayName = `${bankName} (${accountName})`;

  if (id) {
    const idx = AppState.bankAccounts.findIndex(b => b.id == id);
    if (idx !== -1) {
      AppState.bankAccounts[idx] = {
        ...AppState.bankAccounts[idx],
        bankName,
        name: displayName,
        accountName,
        accountNum,
        balance,
        biz,
        note
      };
    }
  } else {
    const newBank = {
      id: Date.now(),
      bankName,
      name: displayName,
      accountName,
      accountNum,
      balance,
      biz,
      note
    };
    AppState.bankAccounts.push(newBank);
  }

  saveStateToStorage();
  closeBankAccountModal();
  renderSettlementView();
  calculatePL();
  alert('통장 기본정보가 안전하게 저장되었습니다!');
}

function deleteBankAccount(id) {
  if (!confirm('이 통장 정보를 삭제하시겠습니까? 관련 거래내역은 그대로 유지됩니다.')) return;
  AppState.bankAccounts = AppState.bankAccounts.filter(b => b.id != id);
  saveStateToStorage();
  renderSettlementView();
  calculatePL();
}

/**
 * 통장 입출금 거래내역 장부 렌더링
 */
function renderBankTxTable() {
  const tbody = document.getElementById('bankTxTableBody');
  const countBadge = document.getElementById('bankTxCountBadge');
  if (!tbody) return;

  const filterAcc = document.getElementById('bankTxFilterAccount');
  const filterType = document.getElementById('bankTxFilterType');
  const filterMkt = document.getElementById('bankTxFilterMarket');

  const selectedAccId = filterAcc ? filterAcc.value : 'ALL';
  const selectedType = filterType ? filterType.value : 'ALL';
  const selectedMkt = filterMkt ? filterMkt.value : 'ALL';

  let list = [...AppState.bankTransactions];

  if (selectedAccId !== 'ALL') {
    list = list.filter(tx => String(tx.accountId) === String(selectedAccId));
  }

  if (selectedType !== 'ALL') {
    list = list.filter(tx => tx.type === selectedType);
  }

  if (selectedMkt !== 'ALL') {
    list = list.filter(tx => {
      if (tx.type !== '입금') return false;
      let m = tx.targetMarket;
      if (!m || m === 'AUTO') {
        m = detectMarketFromText((tx.summary || '') + ' ' + (tx.note || ''));
      }
      if (m === '쿠팡') m = '쿠팡(신)';
      return m === selectedMkt;
    });
  }

  // 최신 거래일시 순 정렬
  list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (countBadge) {
    countBadge.textContent = `${list.length}건`;
  }

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:30px;color:#94a3b8;">해당 조건의 입출금 거래내역이 없습니다. [✍️ 거래내역 직접입력] 또는 [📥 통장 엑셀 업로드]로 내역을 등록해보세요!</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(tx => {
    const isDeposit = (tx.type === '입금');
    let matchedMarket = tx.targetMarket;
    if (!matchedMarket || matchedMarket === 'AUTO') {
      matchedMarket = detectMarketFromText((tx.summary || '') + ' ' + (tx.note || ''));
    }
    if (matchedMarket === '쿠팡') matchedMarket = '쿠팡(신)';
    const hasMarket = isDeposit && matchedMarket && matchedMarket !== 'NONE';

    return `
      <tr>
        <td style="font-size:12px;color:#334155;font-weight:600;">${tx.date || '-'}</td>
        <td>
          <strong>${tx.bankName || ''} ${tx.accountName || ''}</strong>
          <div style="font-size:11px;color:#64748b;font-family:monospace;">${tx.accountNum || ''}</div>
        </td>
        <td style="text-align:center;">
          <span class="badge" style="background:${isDeposit ? '#ecfdf5' : '#fef2f2'};color:${isDeposit ? '#059669' : '#dc2626'};font-weight:700;">
            ${isDeposit ? '🟢 입금' : '🔴 출금'}
          </span>
        </td>
        <td style="text-align:right;">
          <strong style="color:${isDeposit ? '#059669' : '#dc2626'};font-size:13.5px;">
            ${isDeposit ? '+' : '-'}${formatKRW(tx.amount || 0)}
          </strong>
        </td>
        <td style="text-align:right;color:#1e40af;font-weight:700;">
          ${tx.balanceAfter ? formatKRW(tx.balanceAfter) : '-'}
        </td>
        <td style="text-align:center;">
          ${hasMarket ? `
            <span class="badge" style="background:#eff6ff;color:#1e40af;font-weight:700;border:1px solid #bfdbfe;font-size:11px;">
              🏷️ ${matchedMarket}
            </span>
          ` : `<span style="color:#94a3b8;font-size:11px;">일반거래</span>`}
        </td>
        <td style="max-width:240px;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;" title="${tx.summary || ''}">
          ${tx.summary || '-'}
        </td>
        <td style="font-size:12px;color:#64748b;">${tx.note || '-'}</td>
        <td style="text-align:center;">
          <button class="btn btn-sm btn-secondary" onclick="deleteBankTx(${tx.id})" style="font-size:11px;padding:2px 6px;color:#dc2626;" title="삭제">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

function filterBankTxByMarket(marketName) {
  const filterMkt = document.getElementById('bankTxFilterMarket');
  const filterType = document.getElementById('bankTxFilterType');
  if (filterMkt) filterMkt.value = marketName;
  if (filterType) filterType.value = '입금';
  renderBankTxTable();
  const table = document.getElementById('bankTxTable');
  if (table) {
    table.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function openBankTxModal() {
  const selectAcc = document.getElementById('formTxBankId');
  if (selectAcc) {
    if (AppState.bankAccounts.length === 0) {
      alert('먼저 통장 기본정보를 최소 1개 이상 등록해주세요, 리사님!');
      openBankAccountModal(-1);
      return;
    }
    selectAcc.innerHTML = AppState.bankAccounts.map(b => `
      <option value="${b.id}">${b.bankName || ''} - ${b.accountName || b.name} (${b.accountNum})</option>
    `).join('');
  }

  const mktSelect = document.getElementById('formTxMarket');
  if (mktSelect) {
    const markets = getKnownMarketsList();
    mktSelect.innerHTML = `
      <option value="AUTO" selected>🤖 적요 내용으로 자동 감지 (추천)</option>
      ${markets.map(m => `<option value="${m}">${m} 정산금</option>`).join('')}
      <option value="NONE">연결 안 함 (일반 입금 / 비정산금)</option>
    `;
  }

  const dateEl = document.getElementById('formTxDate');
  if (dateEl) {
    const now = new Date();
    dateEl.value = now.toISOString().slice(0, 10);
  }

  document.getElementById('formTxType').value = '입금';
  document.getElementById('formTxAmount').value = '';
  document.getElementById('formTxSummary').value = '';
  document.getElementById('formTxNote').value = '';

  const overlay = document.getElementById('bankTxModalOverlay');
  if (overlay) overlay.style.display = 'flex';
  if (window.feather) feather.replace();
}

function closeBankTxModal() {
  const overlay = document.getElementById('bankTxModalOverlay');
  if (overlay) overlay.style.display = 'none';
}

function saveBankTx() {
  const bankId = document.getElementById('formTxBankId').value;
  const dateStr = document.getElementById('formTxDate').value.trim();
  const type = document.getElementById('formTxType').value;
  const amount = parseFloat(document.getElementById('formTxAmount').value) || 0;
  const summary = document.getElementById('formTxSummary').value.trim();
  const targetMarket = document.getElementById('formTxMarket') ? document.getElementById('formTxMarket').value : 'AUTO';
  const note = document.getElementById('formTxNote').value.trim();

  if (!amount || amount <= 0 || !summary) {
    alert('거래금액과 거래내용(적요)을 입력해주세요, 리사님!');
    return;
  }

  const targetBank = AppState.bankAccounts.find(b => b.id == bankId);
  if (!targetBank) {
    alert('대상 통장을 찾을 수 없습니다.');
    return;
  }

  // 통장 잔액 반영
  if (type === '입금') {
    targetBank.balance += amount;
  } else {
    targetBank.balance -= amount;
  }

  const newTx = {
    id: Date.now(),
    accountId: targetBank.id,
    bankName: targetBank.bankName || targetBank.name,
    accountName: targetBank.accountName || targetBank.name,
    accountNum: targetBank.accountNum,
    date: dateStr || new Date().toISOString().slice(0, 10),
    type: type,
    amount: amount,
    balanceAfter: targetBank.balance,
    summary: summary,
    targetMarket: targetMarket,
    note: note
  };

  AppState.bankTransactions.unshift(newTx);
  saveStateToStorage();
  closeBankTxModal();
  renderSettlementView();
  calculatePL();
  alert(`통장 거래내역(${type} ${formatKRW(amount)})이 등록되었습니다!`);
}

function deleteBankTx(id) {
  if (!confirm('이 거래내역을 장부에서 삭제하시겠습니까? (통장 잔액은 변경되지 않습니다)')) return;
  AppState.bankTransactions = AppState.bankTransactions.filter(tx => tx.id != id);
  saveStateToStorage();
  renderBankTxTable();
}

/**
 * 통장 거래내역 엑셀 업로드 핸들러
 */
function openBankUploadModal() {
  if (AppState.bankAccounts.length === 0) {
    alert('먼저 통장 기본정보를 최소 1개 이상 등록해주세요, 리사님!');
    openBankAccountModal(-1);
    return;
  }

  const selectAcc = document.getElementById('formUploadBankId');
  if (selectAcc) {
    selectAcc.innerHTML = AppState.bankAccounts.map(b => `
      <option value="${b.id}">${b.bankName || ''} - ${b.accountName || b.name} (${b.accountNum})</option>
    `).join('');
  }

  const fileInput = document.getElementById('bankFileInput');
  if (fileInput) fileInput.value = '';

  const overlay = document.getElementById('bankUploadModalOverlay');
  if (overlay) overlay.style.display = 'flex';
  if (window.feather) feather.replace();
}

function closeBankUploadModal() {
  const overlay = document.getElementById('bankUploadModalOverlay');
  if (overlay) overlay.style.display = 'none';
}

function handleBankFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const bankId = document.getElementById('formUploadBankId').value;
  const targetBank = AppState.bankAccounts.find(b => b.id == bankId);
  if (!targetBank) {
    alert('대상 통장을 먼저 선택해주세요.');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (!rows || rows.length < 2) {
        alert('엑셀 파일에 유효한 데이터가 없습니다.');
        return;
      }

      // 헤더 열 위치 탐색
      let headerRowIdx = -1;
      let dateCol = -1;
      let inCol = -1;
      let outCol = -1;
      let sumCol = -1;
      let balCol = -1;

      for (let r = 0; r < Math.min(rows.length, 15); r++) {
        const row = rows[r];
        if (!Array.isArray(row)) continue;
        for (let c = 0; c < row.length; c++) {
          const val = String(row[c] || '').trim();
          if (val.includes('일자') || val.includes('거래일') || val.includes('날짜') || val.includes('거래일시')) dateCol = c;
          if (val.includes('입금') || val.includes('맡기신금액')) inCol = c;
          if (val.includes('출금') || val.includes('찾으신금액')) outCol = c;
          if (val.includes('적요') || val.includes('내용') || val.includes('거래내용') || val.includes('보낸분') || val.includes('기재내용')) sumCol = c;
          if (val.includes('잔액') || val.includes('현재잔액') || val.includes('거래후잔액')) balCol = c;
        }
        if (dateCol !== -1 && (inCol !== -1 || outCol !== -1 || sumCol !== -1)) {
          headerRowIdx = r;
          break;
        }
      }

      if (headerRowIdx === -1) {
        alert('은행 엑셀의 열(거래일, 입금액, 출금액, 적요 등)을 자동으로 감지하지 못했습니다. 표준 통장 엑셀 양식인지 확인해주세요!');
        return;
      }

      let importedCount = 0;
      let latestBalance = null;

      for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        let dateVal = (dateCol !== -1) ? String(row[dateCol] || '').trim() : '';
        if (!dateVal) continue;

        let inAmt = 0;
        if (inCol !== -1) {
          inAmt = parseFloat(String(row[inCol] || '').replace(/[^0-9.-]/g, '')) || 0;
        }

        let outAmt = 0;
        if (outCol !== -1) {
          outAmt = parseFloat(String(row[outCol] || '').replace(/[^0-9.-]/g, '')) || 0;
        }

        if (inAmt === 0 && outAmt === 0) continue;

        let summaryVal = (sumCol !== -1) ? String(row[sumCol] || '').trim() : '통장 거래';
        let balVal = (balCol !== -1) ? parseFloat(String(row[balCol] || '').replace(/[^0-9.-]/g, '')) || 0 : 0;

        if (balVal > 0 && latestBalance === null) {
          latestBalance = balVal;
        }

        const type = inAmt > 0 ? '입금' : '출금';
        const amount = inAmt > 0 ? inAmt : outAmt;
        const matchedMarket = (type === '입금') ? detectMarketFromText(summaryVal) : null;

        AppState.bankTransactions.unshift({
          id: Date.now() + Math.floor(Math.random() * 10000),
          accountId: targetBank.id,
          bankName: targetBank.bankName || targetBank.name,
          accountName: targetBank.accountName || targetBank.name,
          accountNum: targetBank.accountNum,
          date: dateVal,
          type: type,
          amount: amount,
          balanceAfter: balVal || 0,
          summary: summaryVal,
          targetMarket: matchedMarket || 'AUTO',
          note: matchedMarket ? `[${matchedMarket}] 자동감지 정산입금` : '엑셀 일괄 등록'
        });

        importedCount++;
      }

      if (latestBalance !== null && latestBalance > 0) {
        targetBank.balance = latestBalance;
      }

      saveStateToStorage();
      closeBankUploadModal();
      renderSettlementView();
      calculatePL();
      alert(`🎉 ${targetBank.accountName || targetBank.bankName} 통장에 총 ${importedCount}건의 거래내역이 성공적으로 등록되었습니다, 리사님!`);
    } catch (err) {
      console.error(err);
      alert('엑셀 파일을 읽는 도중 오류가 발생했습니다: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

/**
 * 5. ⭐ 사입 품목 전용 재고 관리 (위탁 품목은 제외!)
 */
function renderInventoryView() {
  const tbody = document.getElementById('inventoryTableBody');
  if (!tbody) return;

  // ⭐ 리사님 편의: 사입재고(창고 실물 재고)는 사업자 선택 탭과 무관하게 항상 전체 사입 품목을 든든하게 확인할 수 있도록 처리!
  ensureAloeStockExists();
  const orders = AppState.rawOrders;
  const buyMap = {};

  orders.forEach(o => {
    if (o.sourcingType === '사입') {
      const pName = o.productName;
      // ⭐ 리사님 규칙: 재고관리 화면에 사입한 재고의 단가는 소싱기준가와 동일해야 함!
      const unitCost = (o.sourcingStandardPrice > 0) 
        ? o.sourcingStandardPrice 
        : (o.inventoryUnitCost || o.purchasePrice || o.purchaseCost || 0);

      if (!buyMap[pName]) {
        buyMap[pName] = {
          name: pName,
          supplier: o.supplierName || o.sourcingPlatform,
          unitCost: unitCost,
          inboundQty: 0,
          outboundQty: 0
        };
      }

      // 사입 입고 건 (매출 없이 사입한 경우)
      if (!o.market || o.salePrice === 0) {
        buyMap[pName].inboundQty += o.qty;
      } else {
        // 사입 상품의 실제 판매(출고) 건
        buyMap[pName].outboundQty += o.qty;
      }

      if (unitCost > 0) {
        buyMap[pName].unitCost = unitCost;
      }
    }
  });

  const list = Object.values(buyMap);

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#94a3b8;">등록된 사입 품목이 없습니다. 주문장에서 매입유형을 [사입]으로 지정하거나 [+ 사입 매입 단독 등록] 버튼으로 등록해 보세요!</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(item => {
    const currentStock = Math.max(0, item.inboundQty - item.outboundQty);
    const stockValue = currentStock * item.unitCost;
    const isSufficient = currentStock > 0;

    return `
      <tr>
        <td style="font-weight:700;color:#1e293b;">
          <span class="badge badge-sourcing-type badge-type-buy" style="margin-right:4px;">사입</span>
          ${item.name}
        </td>
        <td>${item.supplier || '-'}</td>
        <td style="text-align:right;"><strong class="text-danger">${formatKRW(item.unitCost)}</strong></td>
        <td style="text-align:center;"><strong>${item.inboundQty}개</strong></td>
        <td style="text-align:center;"><strong>${item.outboundQty}개</strong></td>
        <td style="text-align:center;">
          <strong style="font-size:15px;color:${isSufficient?'#059669':'#dc2626'};">
            ${currentStock}개
          </strong>
        </td>
        <td style="text-align:right;"><strong style="font-size:14px;color:#4f46e5;">${formatKRW(stockValue)}</strong></td>
        <td style="text-align:center;">
          <span class="badge" style="background:${isSufficient?'#ecfdf5':'#fef2f2'};color:${isSufficient?'#059669':'#b91c1c'};">
            ${isSufficient ? '재고 보유' : '재고 소진'}
          </span>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * 6. 손익계산서 & 순자산 (판관비 항목 연동 및 순자산 계산 공식 완벽 반영)
 */
function calculatePL() {
  const countableOrders = getCountableOrders();
  const allOrders = getBizOrders();

  let grossSales = 0;
  let netSales = 0;
  let purchaseCost = 0;

  countableOrders.forEach(o => {
    if (o.market && o.totalSales > 0) {
      grossSales += o.totalSales;
      const settleAmt = (o.actualSettlement > 0) ? o.actualSettlement : o.standardPrice;
      netSales += settleAmt;
      purchaseCost += getOrderActualCost(o);
    }
  });

  const marketFees = grossSales - netSales;
  const grossProfit = netSales - purchaseCost;

  // 1. 등록된 세부 판관비 항목 합산 및 손익계산서 동적 주입
  let customExpTotal = 0;
  const filteredExpenses = AppState.customExpenses.filter(exp => {
    return (AppState.currentBizFilter === 'ALL' || exp.biz === 'ALL' || exp.biz === AppState.currentBizFilter);
  });

  const placeholder = document.getElementById('plDynamicExpensePlaceholder');
  if (placeholder) {
    if (filteredExpenses.length === 0) {
      placeholder.style.display = 'none';
      placeholder.innerHTML = '';
    } else {
      placeholder.style.display = 'table-row-group';
      placeholder.innerHTML = filteredExpenses.map(exp => {
        customExpTotal += (exp.amount || 0);
        return `
          <tr class="pl-dynamic-exp-row" style="background:#fffaf0;">
            <td class="pl-indent">
              <span class="badge" style="background:#fee2e2;color:#991b1b;font-size:10.5px;margin-right:6px;">${exp.category}</span>
              ${exp.title}
              <span style="font-size:11px;color:#64748b;margin-left:4px;">(${exp.biz})</span>
            </td>
            <td style="font-size:11px;color:#94a3b8;">${exp.note || ''}</td>
            <td class="text-right text-danger">-${formatKRW(exp.amount || 0)}</td>
          </tr>
        `;
      }).join('');
    }
  } else {
    filteredExpenses.forEach(exp => { customExpTotal += (exp.amount || 0); });
  }

  const otherExpenseInput = document.getElementById('inputOtherExpense');
  const otherExpense = otherExpenseInput ? parseFloat(otherExpenseInput.value) || 0 : 50000;
  const taxReserve = Math.max(0, Math.round(grossProfit * 0.1));
  const totalExpense = customExpTotal + otherExpense + taxReserve;
  const finalNetProfit = grossProfit - totalExpense;

  const elST = document.getElementById('plSalesTotal');
  const elGS = document.getElementById('plGrossSales');
  const elMF = document.getElementById('plMarketFees');
  const elNS = document.getElementById('plNetSales');
  const elCT = document.getElementById('plCogsTotal');
  const elPC = document.getElementById('plPurchaseCost');
  const elGP = document.getElementById('plGrossProfit');
  const elET = document.getElementById('plExpenseTotal');
  const elOE = document.getElementById('plOtherExpense');
  const elTR = document.getElementById('plTaxReserve');
  const elFP = document.getElementById('plFinalNetProfit');

  if (elST) elST.textContent = formatKRW(grossSales);
  if (elGS) elGS.textContent = formatKRW(grossSales);
  if (elMF) elMF.textContent = '-' + formatKRW(marketFees);
  if (elNS) elNS.textContent = formatKRW(netSales);
  if (elCT) elCT.textContent = '-' + formatKRW(purchaseCost);
  if (elPC) elPC.textContent = '-' + formatKRW(purchaseCost);
  if (elGP) elGP.textContent = formatKRW(grossProfit);
  if (elET) elET.textContent = '-' + formatKRW(totalExpense);
  if (elOE) elOE.textContent = '-' + formatKRW(otherExpense);
  if (elTR) elTR.textContent = '-' + formatKRW(taxReserve);
  if (elFP) elFP.textContent = formatKRW(finalNetProfit);

  // 2. 순자산 공식 계산: (통장 잔고) + (정산 미수금) + (창고 재고가치) + (추가 자산) - (나갈 카드값) - (등록 부채)
  let bankTotal = 0;
  const filteredBanks = AppState.currentBizFilter === 'ALL'
    ? AppState.bankAccounts
    : AppState.bankAccounts.filter(b => b.biz === AppState.currentBizFilter);
  filteredBanks.forEach(b => { bankTotal += b.balance; });

  let totalDue = 0;
  countableOrders.forEach(o => {
    if (o.market && o.totalSales > 0) {
      totalDue += ((o.actualSettlement > 0) ? o.actualSettlement : o.standardPrice);
    }
  });
  // ⭐ 통장 거래내역 참조 판매처별 정산 입금 완료액 및 남은 미수금 동기화
  const bankDeposits = getMarketDepositsFromBank();
  const remainingReceivable = Math.max(0, totalDue - bankDeposits.totalSettlementDeposited);

  // 사입 품목 재고 평가액 계산
  let totalStockValue = 0;
  const buyStockMap = {};
  allOrders.forEach(o => {
    if (o.sourcingType === '사입') {
      const unitCost = (o.sourcingStandardPrice > 0) 
        ? o.sourcingStandardPrice 
        : (o.inventoryUnitCost || o.purchasePrice || o.purchaseCost || 0);

      if (!buyStockMap[o.productName]) {
        buyStockMap[o.productName] = { in: 0, out: 0, cost: unitCost };
      }
      if (unitCost > 0) {
        buyStockMap[o.productName].cost = unitCost;
      }

      if (!o.market || o.salePrice === 0) buyStockMap[o.productName].in += o.qty;
      else buyStockMap[o.productName].out += o.qty;
    }
  });
  Object.values(buyStockMap).forEach(s => {
    const cur = Math.max(0, s.in - s.out);
    totalStockValue += (cur * s.cost);
  });

  // 3. 등록된 추가 자산 및 부채 합산
  let extraAssets = 0;
  let extraDebts = 0;
  const filteredAssets = AppState.customAssets.filter(item => {
    return (AppState.currentBizFilter === 'ALL' || item.biz === 'ALL' || item.biz === AppState.currentBizFilter);
  });

  filteredAssets.forEach(item => {
    if (item.type === '자산') {
      extraAssets += (item.amount || 0);
    } else if (item.type === '부채') {
      extraDebts += (item.amount || 0);
    }
  });

  const totalCardDue = purchaseCost;
  const netAssetValue = (bankTotal + remainingReceivable + totalStockValue + extraAssets) - (totalCardDue + extraDebts);

  const elNAV = document.getElementById('totalNetAssetValue');
  const elFBank = document.getElementById('fBank');
  const elFRec = document.getElementById('fReceivable');
  const elFStock = document.getElementById('fStock');
  const elFCard = document.getElementById('fCard');
  const elFExA = document.getElementById('fExtraAsset');
  const elFExD = document.getElementById('fExtraDebt');

  if (elNAV) elNAV.textContent = formatKRW(netAssetValue);
  if (elFBank) elFBank.textContent = formatKRW(bankTotal);
  if (elFRec) elFRec.textContent = formatKRW(remainingReceivable);
  if (elFStock) elFStock.textContent = formatKRW(totalStockValue);
  if (elFCard) elFCard.textContent = formatKRW(totalCardDue);
  if (elFExA) elFExA.textContent = '+' + formatKRW(extraAssets);
  if (elFExD) elFExD.textContent = '-' + formatKRW(extraDebts);
}

/**
 * 💸 판관비(추가 비용) 모달 및 관리 핸들러
 */
function openCustomExpenseModal() {
  document.getElementById('formExpTitle').value = '';
  document.getElementById('formExpAmount').value = '';
  document.getElementById('formExpNote').value = '';
  renderCustomExpenses();

  const overlay = document.getElementById('customExpenseModalOverlay');
  if (overlay) overlay.style.display = 'flex';
  if (window.feather) feather.replace();
}

function closeCustomExpenseModal() {
  const overlay = document.getElementById('customExpenseModalOverlay');
  if (overlay) overlay.style.display = 'none';
}

function saveCustomExpense() {
  const category = document.getElementById('formExpCategory').value;
  const title = document.getElementById('formExpTitle').value.trim();
  const amount = parseFloat(document.getElementById('formExpAmount').value) || 0;
  const biz = document.getElementById('formExpBiz').value;
  const month = document.getElementById('formExpMonth').value;
  const note = document.getElementById('formExpNote').value.trim();

  if (!title || !amount || amount <= 0) {
    alert('비용 항목명과 금액을 정확히 입력해주세요, 리사님!');
    return;
  }

  const newExp = {
    id: 'exp_' + Date.now(),
    category,
    title,
    amount,
    biz,
    month,
    note
  };

  AppState.customExpenses.unshift(newExp);
  saveStateToStorage();
  document.getElementById('formExpTitle').value = '';
  document.getElementById('formExpAmount').value = '';
  document.getElementById('formExpNote').value = '';
  renderCustomExpenses();
  calculatePL();
  alert(`비용 항목[${title}]이(가) 등록되었습니다!`);
}

function deleteCustomExpense(id) {
  if (!confirm('이 비용 항목을 삭제하시겠습니까?')) return;
  AppState.customExpenses = AppState.customExpenses.filter(e => e.id !== id);
  saveStateToStorage();
  renderCustomExpenses();
  calculatePL();
}

function renderCustomExpenses() {
  const tbody = document.getElementById('customExpenseTableBody');
  const badgeTotal = document.getElementById('customExpTotalBadge');
  if (!tbody) return;

  if (AppState.customExpenses.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:#94a3b8;">등록된 판관비 항목이 없습니다.</td></tr>';
    if (badgeTotal) badgeTotal.textContent = '0원';
    return;
  }

  let total = 0;
  tbody.innerHTML = AppState.customExpenses.map(exp => {
    total += (exp.amount || 0);
    return `
      <tr>
        <td><span class="badge" style="background:#fee2e2;color:#991b1b;font-weight:700;">${exp.category}</span></td>
        <td><strong>${exp.title}</strong>${exp.note ? `<div style="font-size:11px;color:#64748b;">${exp.note}</div>` : ''}</td>
        <td style="text-align:right;"><strong class="text-danger">${formatKRW(exp.amount)}</strong></td>
        <td><span class="badge" style="background:#f1f5f9;color:#334155;">${exp.biz}</span></td>
        <td style="font-size:12px;color:#64748b;">${exp.month || '-'}</td>
        <td style="text-align:center;">
          <button class="btn btn-sm btn-secondary" onclick="deleteCustomExpense('${exp.id}')" style="font-size:11px;padding:2px 6px;color:#dc2626;">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');

  if (badgeTotal) badgeTotal.textContent = formatKRW(total);
}

/**
 * 💎 자산 & 부채 모달 및 관리 핸들러 (순자산 반영)
 */
function openCustomAssetModal() {
  document.getElementById('formAssetTitle').value = '';
  document.getElementById('formAssetAmount').value = '';
  document.getElementById('formAssetNote').value = '';
  renderCustomAssets();

  const overlay = document.getElementById('customAssetModalOverlay');
  if (overlay) overlay.style.display = 'flex';
  if (window.feather) feather.replace();
}

function closeCustomAssetModal() {
  const overlay = document.getElementById('customAssetModalOverlay');
  if (overlay) overlay.style.display = 'none';
}

function saveCustomAsset() {
  const type = document.getElementById('formAssetType').value;
  const category = document.getElementById('formAssetCategory').value;
  const biz = document.getElementById('formAssetBiz').value;
  const title = document.getElementById('formAssetTitle').value.trim();
  const amount = parseFloat(document.getElementById('formAssetAmount').value) || 0;
  const note = document.getElementById('formAssetNote').value.trim();

  if (!title || !amount || amount <= 0) {
    alert('항목명과 금액을 정확히 입력해주세요, 리사님!');
    return;
  }

  const newAsset = {
    id: 'asset_' + Date.now(),
    type,
    category,
    biz,
    title,
    amount,
    note
  };

  AppState.customAssets.unshift(newAsset);
  saveStateToStorage();
  document.getElementById('formAssetTitle').value = '';
  document.getElementById('formAssetAmount').value = '';
  document.getElementById('formAssetNote').value = '';
  renderCustomAssets();
  calculatePL();
  alert(`${type} 항목[${title}]이(가) 등록되었습니다!`);
}

function deleteCustomAsset(id) {
  if (!confirm('이 항목을 삭제하시겠습니까?')) return;
  AppState.customAssets = AppState.customAssets.filter(a => a.id !== id);
  saveStateToStorage();
  renderCustomAssets();
  calculatePL();
}

function renderCustomAssets() {
  const tbody = document.getElementById('customAssetTableBody');
  const badgeAsset = document.getElementById('customAssetTotalBadge');
  const badgeDebt = document.getElementById('customDebtTotalBadge');
  if (!tbody) return;

  if (AppState.customAssets.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:#94a3b8;">등록된 추가 자산이나 부채가 없습니다.</td></tr>';
    if (badgeAsset) badgeAsset.textContent = '+0원';
    if (badgeDebt) badgeDebt.textContent = '-0원';
    return;
  }

  let totalAsset = 0;
  let totalDebt = 0;

  tbody.innerHTML = AppState.customAssets.map(item => {
    const isAsset = (item.type === '자산');
    if (isAsset) totalAsset += (item.amount || 0);
    else totalDebt += (item.amount || 0);

    return `
      <tr>
        <td>
          <span class="badge" style="background:${isAsset ? '#ecfdf5' : '#fef2f2'};color:${isAsset ? '#059669' : '#dc2626'};font-weight:700;">
            ${isAsset ? '🟢 자산(+)' : '🔴 부채(-)'}
          </span>
        </td>
        <td style="font-size:12px;color:#475569;">${item.category}</td>
        <td><strong>${item.title}</strong>${item.note ? `<div style="font-size:11px;color:#64748b;">${item.note}</div>` : ''}</td>
        <td style="text-align:right;"><strong style="color:${isAsset ? '#059669' : '#dc2626'};font-size:13.5px;">${isAsset ? '+' : '-'}${formatKRW(item.amount)}</strong></td>
        <td><span class="badge" style="background:#f1f5f9;color:#334155;">${item.biz}</span></td>
        <td style="text-align:center;">
          <button class="btn btn-sm btn-secondary" onclick="deleteCustomAsset('${item.id}')" style="font-size:11px;padding:2px 6px;color:#dc2626;">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');

  if (badgeAsset) badgeAsset.textContent = '+' + formatKRW(totalAsset);
  if (badgeDebt) badgeDebt.textContent = '-' + formatKRW(totalDebt);
}

/**
 * =========================================================
 * 주문/사입 개별 입력 및 수정 핸들러
 * =========================================================
 */

function formatSettlementInput(el) {
  // 숫자만 추출하여 실시간 천원단위 콤마 표시 ⭐
  const rawNum = el.value.replace(/[^0-9]/g, '');
  if (rawNum === '') {
    el.value = '';
    return;
  }
  el.value = parseInt(rawNum, 10).toLocaleString('ko-KR');
}

function updateActualSettlement(index, val) {
  // 콤마 제거 후 숫자 변환 ⭐
  const cleanNum = parseFloat(String(val).replace(/,/g, '')) || 0;
  if (AppState.rawOrders[index]) {
    AppState.rawOrders[index].actualSettlement = cleanNum;
    saveStateToStorage();
    renderAll();
  }
}

function updateOrderStage(index, stage) {
  if (AppState.rawOrders[index]) {
    AppState.rawOrders[index].orderStage = stage;
    saveStateToStorage();
    renderAll();
  }
}

function updatePurchaseStage(index, stage) {
  if (AppState.rawOrders[index]) {
    AppState.rawOrders[index].purchaseStage = stage;
    saveStateToStorage();
    renderAll();
  }
}

function updateSourcingType(index, type) {
  if (AppState.rawOrders[index]) {
    AppState.rawOrders[index].sourcingType = type;
    saveStateToStorage();
    renderAll();
  }
}

function deleteOrder(index) {
  if (confirm('이 주문/사입 내역을 장부에서 삭제하시겠습니까?')) {
    AppState.rawOrders.splice(index, 1);
    saveStateToStorage();
    renderAll();
  }
}

// =========================================================
// 모달 모드 토글 (위탁 매출 vs 사입 매출 vs 사입 매입) & 실시간 계산 ⭐
// =========================================================
let currentModalMode = 'CONSIGNMENT_SALE';

function getStockProductsList() {
  const stockMap = {};
  AppState.rawOrders.forEach(o => {
    if (o.sourcingType === '사입' && o.productName) {
      if (!stockMap[o.productName]) {
        stockMap[o.productName] = {
          name: o.productName,
          unitCost: (o.inventoryUnitCost || o.sourcingStandardPrice || 0),
          in: 0,
          out: 0
        };
      }
      if (!o.market || o.salePrice === 0) {
        stockMap[o.productName].in += o.qty;
      } else {
        stockMap[o.productName].out += o.qty;
      }
      if (o.sourcingStandardPrice > 0) {
        stockMap[o.productName].unitCost = o.sourcingStandardPrice;
      }
    }
  });
  return Object.values(stockMap);
}

function populateStockDropdown() {
  const select = document.getElementById('formStockSelect');
  if (!select) return;
  const list = getStockProductsList();
  
  select.innerHTML = '<option value="">-- 보유 사입 재고에서 선택하거나 직접 입력하세요 --</option>' +
    list.map(p => {
      const cur = Math.max(0, p.in - p.out);
      return `<option value="${p.name}" data-cost="${p.unitCost}">[재고 ${cur}개] ${p.name} (단가: ${formatKRW(p.unitCost)})</option>`;
    }).join('');
}

function handleStockProductSelect(selectEl) {
  const selectedOpt = selectEl.options[selectEl.selectedIndex];
  if (!selectedOpt || !selectedOpt.value) return;
  
  const pName = selectedOpt.value;
  const cost = parseFloat(selectedOpt.getAttribute('data-cost')) || 0;
  
  const pNameInput = document.getElementById('formProductName');
  if (pNameInput) pNameInput.value = pName;
  
  const costInput = document.getElementById('formStockUnitCost');
  if (costInput) costInput.value = cost;
  
  calcPurchaseSaleTotalCost();
}

function calcPurchaseSaleTotalCost() {
  const qty = parseInt(document.getElementById('formQty').value) || 1;
  const unitCost = parseFloat(document.getElementById('formStockUnitCost').value) || 0;
  const deliveryFee = parseFloat(document.getElementById('formDeliveryFeeOut').value) || 0;
  
  const itemCost = unitCost * qty;
  const totalCost = itemCost + deliveryFee;
  
  const preview = document.getElementById('previewPurchaseSaleCost');
  const previewSub = document.getElementById('previewPurchaseSaleCostSub');
  if (preview) {
    preview.textContent = formatKRW(totalCost);
  }
  if (previewSub) {
    previewSub.textContent = `(상품원가 ${formatKRW(itemCost)} + 택배비 ${formatKRW(deliveryFee)})`;
  }
}

function handleModalQtyChange() {
  if (currentModalMode === 'PURCHASE_SALE') {
    calcPurchaseSaleTotalCost();
  }
  handleModalSalePriceChange();
}

function handleModalSalePriceChange() {
  const isPurchaseSale = (currentModalMode === 'PURCHASE_SALE');
  const qty = parseInt(document.getElementById('formQty').value) || 1;
  const salePrice = parseFloat(document.getElementById('formSalePrice').value) || 0;
  const shipping = parseFloat(document.getElementById('formShipping').value) || 0;

  // 사입 매출: 판매가는 수량 전체의 총 금액! 위탁: 판매단가 × 수량
  const total = isPurchaseSale ? (salePrice + shipping) : ((salePrice * qty) + shipping);
  // ⭐ 리사님 요청 규칙: 정산예정가와 실제정산가는 기본적으로 (총판매금액 + 배송비)로 설정! (상품마다 마켓 수수료율이 다르므로 일률적 8% 차감 금지)
  const newStandardPrice = total > 0 ? total : 0;

  const stdPriceInput = document.getElementById('formStandardPrice');
  const actualSettleInput = document.getElementById('formActualSettlement');

  // ⭐ 수동 입력화면에서 정산예정가와 실제정산가를 (총판매금액 + 배송비)로 자동 연동!
  if (stdPriceInput) {
    stdPriceInput.value = newStandardPrice > 0 ? newStandardPrice : '';
  }
  if (actualSettleInput) {
    actualSettleInput.value = newStandardPrice > 0 ? newStandardPrice : '';
    delete actualSettleInput.dataset.manualEdited;
  }
}

function handleStandardPriceInput() {
  const stdInput = document.getElementById('formStandardPrice');
  const actualInput = document.getElementById('formActualSettlement');
  const val = parseFloat(stdInput ? stdInput.value : 0) || 0;
  if (actualInput && !actualInput.dataset.manualEdited) {
    actualInput.value = val > 0 ? val : '';
  }
}

function updateSourcingFormulaUI(isConsignment) {
  const labelEl = document.getElementById('labelSourcingStandardPrice');
  const formulaEl = document.getElementById('formulaSourcingText');
  if (labelEl) {
    labelEl.textContent = isConsignment ? '🎯 위탁 실매입가 (소싱가, 원) *' : '🎯 사입 소싱가 (표준단가, 원) *';
  }
  if (formulaEl) {
    formulaEl.textContent = isConsignment 
      ? '위탁 공식: 카드결제가 - 카드할인 - 포인트적립 - 포인트사용액 (-포인트 차감)' 
      : '사입 공식: 카드결제가 - 카드할인 - 포인트적립 + 포인트사용액 (+포인트 복원)';
  }
}

function calcSourcingStandardPrice() {
  const cardPay = parseFloat(document.getElementById('formCardPayAmount').value) || 0;
  const cardDiscount = parseFloat(document.getElementById('formCardDiscount').value) || 0;
  const pointUsed = parseFloat(document.getElementById('formPointUsed').value) || 0;
  const pointEarned = parseFloat(document.getElementById('formPointEarned').value) || 0;
  const sourcingTypeEl = document.getElementById('formSourcingType');
  const isConsignment = sourcingTypeEl ? (sourcingTypeEl.value === '위탁') : false;

  let standardPrice = 0;
  if (isConsignment) {
    // ⭐ 위탁 수식: 소싱가(실매입가) = 카드결제가 - 카드할인금액 - 포인트적립액 - 포인트사용액 (포인트 차감!)
    standardPrice = Math.max(0, cardPay - cardDiscount - pointEarned - pointUsed);
  } else {
    // ⭐ 사입 수식: 소싱가(표준단가) = 카드결제가 - 카드할인금액 - 포인트적립액 + 포인트사용액 (포인트 복원!)
    standardPrice = Math.max(0, cardPay - cardDiscount - pointEarned + pointUsed);
  }

  const stdInput = document.getElementById('formSourcingStandardPrice');
  if (stdInput) {
    stdInput.value = standardPrice;
  }

  updateSourcingFormulaUI(isConsignment);
}

function toggleModalMode(mode) {
  if (mode === 'NORMAL') mode = 'CONSIGNMENT_SALE';
  currentModalMode = mode;

  const btnConsignment = document.getElementById('btnModeConsignment');
  const btnPurchaseSale = document.getElementById('btnModePurchaseSale');
  const btnPurchaseOnly = document.getElementById('btnModePurchaseOnly');

  const saleSection = document.getElementById('sectionSaleInfo');
  const stockOutSection = document.getElementById('sectionStockOutInfo');
  const purchaseSection = document.getElementById('sectionPurchaseInfo');
  const groupOrderStage = document.getElementById('groupOrderStage');

  const formMarket = document.getElementById('formMarket');
  const formSalePrice = document.getElementById('formSalePrice');
  const formSourcingType = document.getElementById('formSourcingType');
  const formStockUnitCost = document.getElementById('formStockUnitCost');
  const formDeliveryFeeOut = document.getElementById('formDeliveryFeeOut');

  const formSourcingPlatform = document.getElementById('formSourcingPlatform');
  const formPaymentCard = document.getElementById('formPaymentCard');
  const formCardHolder = document.getElementById('formCardHolder');
  const formCardPayAmount = document.getElementById('formCardPayAmount');
  const formSourcingStandardPrice = document.getElementById('formSourcingStandardPrice');

  const labelBasicInfo = document.getElementById('labelBasicInfo');
  const badgeBasicInfo = document.getElementById('badgeBasicInfo');
  const title = document.getElementById('modalTitle');
  const idx = parseInt(document.getElementById('formOrderIndex').value);

  // 탭 스타일 전환
  if (btnConsignment) {
    btnConsignment.className = mode === 'CONSIGNMENT_SALE' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary';
    btnConsignment.style.fontWeight = '700';
  }
  if (btnPurchaseSale) {
    btnPurchaseSale.className = mode === 'PURCHASE_SALE' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary';
    btnPurchaseSale.style.fontWeight = '700';
  }
  if (btnPurchaseOnly) {
    btnPurchaseOnly.className = mode === 'PURCHASE_ONLY' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary';
    btnPurchaseOnly.style.fontWeight = '700';
  }

  if (mode === 'PURCHASE_SALE') {
    // 🚀 사입 매출(출고) 등록 모드: 매입정보 완전 숨김 & 출고 택배비 반영 ⭐
    if (saleSection) saleSection.style.display = 'block';
    if (stockOutSection) stockOutSection.style.display = 'block';
    if (purchaseSection) purchaseSection.style.display = 'none'; // 매입정보 섹션 숨김!
    if (groupOrderStage) groupOrderStage.style.display = 'block';

    if (formMarket) formMarket.setAttribute('required', 'required');
    if (formSalePrice) formSalePrice.setAttribute('required', 'required');
    if (formStockUnitCost) formStockUnitCost.setAttribute('required', 'required');
    if (formDeliveryFeeOut) formDeliveryFeeOut.setAttribute('required', 'required');

    // 매입정보 필수값 해제 (매입정보를 입력하라는 에러 방지 ⭐)
    if (formSourcingPlatform) formSourcingPlatform.removeAttribute('required');
    if (formPaymentCard) formPaymentCard.removeAttribute('required');
    if (formCardHolder) formCardHolder.removeAttribute('required');
    if (formCardPayAmount) formCardPayAmount.removeAttribute('required');
    if (formSourcingStandardPrice) formSourcingStandardPrice.removeAttribute('required');

    if (formSourcingType) formSourcingType.value = '사입';
    if (labelBasicInfo) labelBasicInfo.textContent = '판매할 사입 재고 및 주문 정보';
    if (badgeBasicInfo) badgeBasicInfo.textContent = '[사입 매출(출고) 정보]';
    if (title) title.textContent = (idx >= 0 ? '✏️ 사입 상품 매출 수정' : '🚀 사입 상품 매출(출고) 등록');

    const labelSalePrice = document.getElementById('labelSalePrice');
    const helpSalePrice = document.getElementById('helpSalePrice');
    if (labelSalePrice) labelSalePrice.innerHTML = '총 판매금액 (원) * <span style="font-size:11px;color:#4f46e5;font-weight:normal;">(수량 전체 합계)</span>';
    if (formSalePrice) formSalePrice.placeholder = '수량 전체의 총 판매금액을 입력하세요 (예: 50000)';
    if (helpSalePrice) helpSalePrice.style.display = 'block';

    populateStockDropdown();
    calcPurchaseSaleTotalCost();
  } else if (mode === 'PURCHASE_ONLY') {
    // 📦 사입 매입(입고) 단독 등록 모드: 매출 없음, 창고 재고 입고
    if (saleSection) saleSection.style.display = 'none';
    const helpSalePrice = document.getElementById('helpSalePrice');
    if (helpSalePrice) helpSalePrice.style.display = 'none';
    if (stockOutSection) stockOutSection.style.display = 'none';
    if (purchaseSection) purchaseSection.style.display = 'block';
    if (groupOrderStage) groupOrderStage.style.display = 'none';

    if (formMarket) formMarket.removeAttribute('required');
    if (formSalePrice) formSalePrice.removeAttribute('required');
    if (formStockUnitCost) formStockUnitCost.removeAttribute('required');
    if (formDeliveryFeeOut) formDeliveryFeeOut.removeAttribute('required');

    if (formSourcingPlatform) formSourcingPlatform.setAttribute('required', 'required');
    if (formPaymentCard) formPaymentCard.setAttribute('required', 'required');
    if (formCardHolder) formCardHolder.setAttribute('required', 'required');
    if (formCardPayAmount) formCardPayAmount.setAttribute('required', 'required');
    if (formSourcingStandardPrice) formSourcingStandardPrice.setAttribute('required', 'required');

    if (formSourcingType) formSourcingType.value = '사입';
    if (labelBasicInfo) labelBasicInfo.textContent = '사입 입고할 상품명, 수량 및 소싱처 정보';
    if (badgeBasicInfo) badgeBasicInfo.textContent = '[사입 입고 정보]';
    if (title) title.textContent = (idx >= 0 ? '✏️ 사입 매입 내역 수정' : '📦 사입 매입(입고) 단독 등록');
    updateSourcingFormulaUI(false);

    if (formMarket) formMarket.value = '';
    const formSalePriceEl = document.getElementById('formSalePrice');
    if (formSalePriceEl) formSalePriceEl.value = 0;
    const formShippingEl = document.getElementById('formShipping');
    if (formShippingEl) formShippingEl.value = 0;
    const formStandardPriceEl = document.getElementById('formStandardPrice');
    if (formStandardPriceEl) formStandardPriceEl.value = 0;
    const formActualSettlementEl = document.getElementById('formActualSettlement');
    if (formActualSettlementEl) formActualSettlementEl.value = 0;
    const formRecipientEl = document.getElementById('formRecipient');
    if (formRecipientEl) formRecipientEl.value = '-';
  } else {
    // 🛒 위탁 매출 주문 등록 모드: 매출 + 소싱 발주
    if (saleSection) saleSection.style.display = 'block';
    if (stockOutSection) stockOutSection.style.display = 'none';
    if (purchaseSection) purchaseSection.style.display = 'block';
    if (groupOrderStage) groupOrderStage.style.display = 'block';

    if (formMarket) formMarket.setAttribute('required', 'required');
    if (formSalePrice) formSalePrice.setAttribute('required', 'required');
    if (formStockUnitCost) formStockUnitCost.removeAttribute('required');
    if (formDeliveryFeeOut) formDeliveryFeeOut.removeAttribute('required');

    if (formSourcingPlatform) formSourcingPlatform.setAttribute('required', 'required');
    if (formPaymentCard) formPaymentCard.setAttribute('required', 'required');
    if (formCardHolder) formCardHolder.setAttribute('required', 'required');
    if (formCardPayAmount) formCardPayAmount.setAttribute('required', 'required');
    if (formSourcingStandardPrice) formSourcingStandardPrice.setAttribute('required', 'required');

    if (formSourcingType) formSourcingType.value = '위탁';
    if (labelBasicInfo) labelBasicInfo.textContent = '사업자, 상품명, 수량 및 소싱 구분';
    if (badgeBasicInfo) badgeBasicInfo.textContent = '[위탁 주문 정보]';
    if (title) title.textContent = (idx >= 0 ? '✏️ 위탁 주문 내역 수정' : '🛒 위탁 주문 등록');

    const labelSalePrice = document.getElementById('labelSalePrice');
    const helpSalePrice = document.getElementById('helpSalePrice');
    if (labelSalePrice) labelSalePrice.textContent = '판매가 (원) *';
    if (formSalePrice) formSalePrice.placeholder = '29700';
    if (helpSalePrice) helpSalePrice.style.display = 'none';

    updateSourcingFormulaUI(true);
  }
}

function handleModalSourcingTypeChange(val) {
  const isConsignment = (val === '위탁');
  if (currentModalMode !== 'PURCHASE_SALE') {
    updateSourcingFormulaUI(isConsignment);
    calcSourcingStandardPrice();
  }
}

function formatDateForInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function openOrderModal(index = -1, defaultMode = 'CONSIGNMENT_SALE') {
  const overlay = document.getElementById('orderModalOverlay');
  const form = document.getElementById('orderForm');
  if (!overlay || !form) return;

  document.getElementById('formOrderIndex').value = index;

  if (index >= 0 && AppState.rawOrders[index]) {
    const o = AppState.rawOrders[index];
    let mode = 'CONSIGNMENT_SALE';
    if (o.sourcingType === '사입') {
      if (!o.market || o.salePrice === 0) {
        mode = 'PURCHASE_ONLY';
      } else {
        mode = 'PURCHASE_SALE';
      }
    } else {
      mode = 'CONSIGNMENT_SALE';
    }
    toggleModalMode(mode);

    document.getElementById('formBiz').value = o.biz || '사업자A';
    document.getElementById('formOrderDate').value = o.orderDate || formatDateForInput(new Date());
    document.getElementById('formOrderNo').value = o.orderNo || `ORD-${Date.now()}`;
    document.getElementById('formSourcingType').value = o.sourcingType || (mode === 'CONSIGNMENT_SALE' ? '위탁' : '사입');
    document.getElementById('formProductName').value = o.productName || '';
    document.getElementById('formOption').value = o.option || '';
    document.getElementById('formQty').value = o.qty || 1;
    document.getElementById('formOrderStage').value = (o.orderStage === '사입입고' ? '대기' : (o.orderStage || '완료'));

    document.getElementById('formMarket').value = o.market || '';
    document.getElementById('formRecipient').value = o.recipient || '';
    document.getElementById('formSalePrice').value = o.salePrice || 0;
    document.getElementById('formShipping').value = o.shipping || 0;
    document.getElementById('formStandardPrice').value = o.standardPrice || 0;
    const actualInput = document.getElementById('formActualSettlement');
    if (actualInput) {
      actualInput.value = o.actualSettlement || o.standardPrice || 0;
      delete actualInput.dataset.manualEdited;
    }

    if (mode === 'PURCHASE_SALE') {
      const stockCostEl = document.getElementById('formStockUnitCost');
      if (stockCostEl) stockCostEl.value = o.inventoryUnitCost || o.sourcingStandardPrice || 0;
      const feeEl = document.getElementById('formDeliveryFeeOut');
      if (feeEl) feeEl.value = (o.deliveryFeeOut !== undefined) ? o.deliveryFeeOut : 2500;
      calcPurchaseSaleTotalCost();
    } else {
      document.getElementById('formSourcingPlatform').value = o.sourcingPlatform || '';
      document.getElementById('formSupplierName').value = o.supplierName || '';
      document.getElementById('formPurchaseStage').value = o.purchaseStage || '완료';
      document.getElementById('formPaymentCard').value = o.paymentCard || '';
      document.getElementById('formCardHolder').value = o.cardHolder || '';

      const isConsignment = (o.sourcingType === '위탁');
      updateSourcingFormulaUI(isConsignment);

      const cardPay = (o.cardPayAmount !== undefined && o.cardPayAmount !== null && o.cardPayAmount !== '') 
                      ? o.cardPayAmount : (o.purchaseCost || 0);
      const cardDisc = o.cardDiscount || 0;
      const ptUsed = (o.pointUsed !== undefined && o.pointUsed !== null && o.pointUsed !== '') 
                     ? o.pointUsed : (o.point || 0);
      const ptEarned = o.pointEarned || 0;

      let stdPrice = o.sourcingStandardPrice;
      if (stdPrice === undefined || stdPrice === null || stdPrice === '') {
        stdPrice = isConsignment 
          ? Math.max(0, cardPay - cardDisc - ptEarned - ptUsed) 
          : Math.max(0, cardPay - cardDisc - ptEarned + ptUsed);
      }

      document.getElementById('formCardPayAmount').value = cardPay || '';
      document.getElementById('formCardDiscount').value = cardDisc;
      document.getElementById('formPointUsed').value = ptUsed;
      document.getElementById('formPointEarned').value = ptEarned;
      document.getElementById('formSourcingStandardPrice').value = stdPrice || '';

      document.getElementById('formCourier').value = o.courier || '';
      document.getElementById('formTrackingNo').value = o.trackingNo || '';
    }
  } else {
    form.reset();
    document.getElementById('formOrderIndex').value = -1;
    toggleModalMode(defaultMode);

    document.getElementById('formBiz').value = AppState.currentBizFilter === 'ALL' ? '사업자A' : AppState.currentBizFilter;
    document.getElementById('formOrderDate').value = formatDateForInput(new Date());
    document.getElementById('formOrderNo').value = (defaultMode === 'PURCHASE_ONLY' ? `BUY-${Date.now()}` : `ORD-${Date.now()}`);
    document.getElementById('formQty').value = 1;
    document.getElementById('formSourcingType').value = (defaultMode === 'CONSIGNMENT_SALE' ? '위탁' : '사입');
    document.getElementById('formPurchaseStage').value = '완료';
    document.getElementById('formOrderStage').value = (defaultMode === 'PURCHASE_ONLY' ? '대기' : '완료');

    if (defaultMode === 'PURCHASE_SALE') {
      const feeEl = document.getElementById('formDeliveryFeeOut');
      if (feeEl) feeEl.value = 2500;
      calcPurchaseSaleTotalCost();
    } else {
      document.getElementById('formCardPayAmount').value = '';
      document.getElementById('formCardDiscount').value = 0;
      document.getElementById('formPointUsed').value = 0;
      document.getElementById('formPointEarned').value = 0;
      document.getElementById('formSourcingStandardPrice').value = '';
      document.getElementById('formShipping').value = 0;
    }
  }

  overlay.classList.add('open');
}

function closeOrderModal() {
  const overlay = document.getElementById('orderModalOverlay');
  if (overlay) overlay.classList.remove('open');
}

function handleSaveOrder(e) {
  e.preventDefault();

  const idx = parseInt(document.getElementById('formOrderIndex').value);
  const qty = parseInt(document.getElementById('formQty').value) || 1;
  const isPurchaseSale = (currentModalMode === 'PURCHASE_SALE');
  const isPurchaseOnly = (currentModalMode === 'PURCHASE_ONLY');

  let salePrice = 0;
  let shipping = 0;
  let totalSales = 0;
  let standardPrice = 0;
  let actualSettlement = 0;
  let market = '';
  let recipient = '-';
  let orderStage = '완료';

  if (!isPurchaseOnly) {
    market = document.getElementById('formMarket').value;
    salePrice = parseFloat(document.getElementById('formSalePrice').value) || 0;
    shipping = parseFloat(document.getElementById('formShipping').value) || 0;
    // ⭐ 사입 매출인 경우 입력한 판매가는 개당 단가가 아니라 수량 전체의 총 판매금액!
    totalSales = isPurchaseSale ? (salePrice + shipping) : ((salePrice * qty) + shipping);
    const inputStd = parseFloat(document.getElementById('formStandardPrice').value);
    standardPrice = (!isNaN(inputStd) && inputStd > 0) ? inputStd : totalSales;
    const inputActual = parseFloat(document.getElementById('formActualSettlement').value);
    actualSettlement = (!isNaN(inputActual) && inputActual > 0) ? inputActual : standardPrice;
    recipient = document.getElementById('formRecipient').value || '-';
    orderStage = document.getElementById('formOrderStage').value || '완료';
  } else {
    // 사입 입고 건: 판매처 공란('-'), 주문구분 대기
    market = '';
    orderStage = '대기';
  }

  let sourcingType = '위탁';
  let sourcingPlatform = '';
  let supplierName = '';
  let paymentCard = '';
  let cardHolder = '';
  let cardPayAmount = 0;
  let cardDiscount = 0;
  let pointUsed = 0;
  let pointEarned = 0;
  let sourcingStandardPrice = 0;
  let purchaseCost = 0;
  let point = 0;
  let purchasePrice = 0;
  let inventoryUnitCost = 0;
  let deliveryFeeOut = 0;

  if (isPurchaseSale) {
    // 🚀 사입 매출: 재고 출고 + 택배비 반영 ⭐
    sourcingType = '사입';
    sourcingPlatform = '자체창고출고';
    supplierName = '자체재고';
    paymentCard = '자체재고';
    cardHolder = '-';
    deliveryFeeOut = parseFloat(document.getElementById('formDeliveryFeeOut').value) || 0;
    const stockUnitCost = parseFloat(document.getElementById('formStockUnitCost').value) || 0;
    
    inventoryUnitCost = stockUnitCost;
    sourcingStandardPrice = stockUnitCost;

    // ⭐ 순수 상품 매입가만 purchasePrice와 purchaseCost에 저장 (택배비는 deliveryFeeOut 필드로 보관되어 마진 계산 시에만 차감 반영)
    purchaseCost = stockUnitCost * qty;
    purchasePrice = stockUnitCost * qty;
  } else if (isPurchaseOnly) {
    // 📦 사입 매입(입고) 단독 등록
    sourcingType = '사입';
    sourcingPlatform = document.getElementById('formSourcingPlatform').value || '도매처(수기)';
    supplierName = document.getElementById('formSupplierName').value || '';
    paymentCard = document.getElementById('formPaymentCard').value || '';
    cardHolder = document.getElementById('formCardHolder').value || '';
    cardPayAmount = parseFloat(document.getElementById('formCardPayAmount').value) || 0;
    cardDiscount = parseFloat(document.getElementById('formCardDiscount').value) || 0;
    pointUsed = parseFloat(document.getElementById('formPointUsed').value) || 0;
    pointEarned = parseFloat(document.getElementById('formPointEarned').value) || 0;

    const defaultSourcingPrice = Math.max(0, cardPayAmount - cardDiscount - pointEarned + pointUsed);
    sourcingStandardPrice = parseFloat(document.getElementById('formSourcingStandardPrice').value);
    if (isNaN(sourcingStandardPrice) || sourcingStandardPrice === 0) {
      sourcingStandardPrice = defaultSourcingPrice;
    }

    purchaseCost = cardPayAmount;
    point = pointUsed;
    purchasePrice = sourcingStandardPrice;
    inventoryUnitCost = sourcingStandardPrice;
  } else {
    // 🛒 위탁 매출 주문 등록 (소싱 발주)
    sourcingType = '위탁';
    sourcingPlatform = document.getElementById('formSourcingPlatform').value || '도매처(수기)';
    supplierName = document.getElementById('formSupplierName').value || '';
    paymentCard = document.getElementById('formPaymentCard').value || '';
    cardHolder = document.getElementById('formCardHolder').value || '';
    cardPayAmount = parseFloat(document.getElementById('formCardPayAmount').value) || 0;
    cardDiscount = parseFloat(document.getElementById('formCardDiscount').value) || 0;
    pointUsed = parseFloat(document.getElementById('formPointUsed').value) || 0;
    pointEarned = parseFloat(document.getElementById('formPointEarned').value) || 0;

    const defaultSourcingPrice = Math.max(0, cardPayAmount - cardDiscount - pointEarned - pointUsed);
    sourcingStandardPrice = parseFloat(document.getElementById('formSourcingStandardPrice').value);
    if (isNaN(sourcingStandardPrice) || sourcingStandardPrice === 0) {
      sourcingStandardPrice = defaultSourcingPrice;
    }

    purchaseCost = cardPayAmount;
    point = pointUsed;
    purchasePrice = sourcingStandardPrice;
  }

  const orderData = {
    biz: document.getElementById('formBiz').value,
    orderDate: document.getElementById('formOrderDate').value,
    orderNo: document.getElementById('formOrderNo').value,
    market: market,
    productName: document.getElementById('formProductName').value,
    option: document.getElementById('formOption').value || '',
    qty: qty,
    recipient: recipient,
    salePrice: salePrice,
    shipping: shipping,
    totalSales: totalSales,
    standardPrice: standardPrice,
    actualSettlement: actualSettlement,
    orderStage: orderStage,
    sourcingType: sourcingType, // 사입 vs 위탁

    sourcingPlatform: sourcingPlatform,
    supplierName: supplierName,
    paymentCard: paymentCard,
    cardHolder: cardHolder,
    cardPayAmount: cardPayAmount,
    cardDiscount: cardDiscount,
    pointUsed: pointUsed,
    pointEarned: pointEarned,
    sourcingStandardPrice: sourcingStandardPrice,

    purchaseCost: purchaseCost,
    point: point,
    purchasePrice: purchasePrice, // 매입가 (사입매출은 단가+택배비)
    purchaseStage: document.getElementById('formPurchaseStage') ? document.getElementById('formPurchaseStage').value : '완료',
    courier: document.getElementById('formCourier') ? document.getElementById('formCourier').value : '',
    trackingNo: document.getElementById('formTrackingNo') ? document.getElementById('formTrackingNo').value : '',
    inventoryUnitCost: inventoryUnitCost,
    deliveryFeeOut: deliveryFeeOut // 출고 택배비 ⭐
  };

  if (idx >= 0 && AppState.rawOrders[idx]) {
    AppState.rawOrders[idx] = Object.assign(AppState.rawOrders[idx], orderData);
    saveStateToStorage();
    alert('내역이 성공적으로 수정되었습니다!');
  } else {
    AppState.rawOrders.unshift(orderData);
    saveStateToStorage();
    if (isPurchaseSale) {
      alert(`🚀 사입 상품 매출이 등록되었습니다!\n출고 택배비(${formatKRW(deliveryFeeOut)})가 원가에 반영되고, 보유 재고가 ${qty}개 차감되었습니다.`);
    } else if (isPurchaseOnly) {
      alert('📦 사입 매입(입고) 건이 등록되었습니다!\n[재고 & 상품 원가] 화면에서 재고 및 자산 가치를 확인하실 수 있습니다.');
    } else {
      alert('🛒 위탁 주문이 정상적으로 등록되었습니다!');
    }
  }

  closeOrderModal();
  populateSelectFilters();
  renderAll();
}

function promptAddBankAccount() {
  const name = prompt('통장 이름과 은행명을 입력해주세요:');
  if (!name) return;
  const num = prompt('계좌번호:');
  const balanceStr = prompt('현재 잔고 (숫자만):');
  const balance = parseFloat(balanceStr) || 0;

  AppState.bankAccounts.push({
    id: Date.now(),
    name: name,
    accountNum: num || '000-000-0000',
    balance: balance,
    biz: AppState.currentBizFilter === 'ALL' ? '사업자A' : AppState.currentBizFilter
  });

  saveStateToStorage();
  renderSettlementView();
  calculatePL();
  alert('새 통장이 등록되었습니다!');
}

function promptAddStock() {
  openOrderModal(-1, 'PURCHASE_ONLY');
}

// 전역 바인딩
window.switchNav = switchNav;
window.setBusinessFilter = setBusinessFilter;
window.updateActualSettlement = updateActualSettlement;
window.formatSettlementInput = formatSettlementInput;
window.updateOrderStage = updateOrderStage;
window.updatePurchaseStage = updatePurchaseStage;
window.updateSourcingType = updateSourcingType;
window.deleteOrder = deleteOrder;
window.openOrderModal = openOrderModal;
window.closeOrderModal = closeOrderModal;
window.toggleModalMode = toggleModalMode;
window.calcSourcingStandardPrice = calcSourcingStandardPrice;
window.handleModalSourcingTypeChange = handleModalSourcingTypeChange;
window.handleModalSalePriceChange = handleModalSalePriceChange;
window.handleStandardPriceInput = handleStandardPriceInput;
window.handleSaveOrder = handleSaveOrder;
window.promptAddBankAccount = promptAddBankAccount;
window.promptAddStock = promptAddStock;
// 1. 주문장 일별/월별 집계
window.switchOrdersViewTab = switchOrdersViewTab;
window.renderOrdersDailyTable = renderOrdersDailyTable;
window.renderOrdersMonthlyTable = renderOrdersMonthlyTable;
window.filterOrdersByDate = filterOrdersByDate;

// 2. 카드사 결제관리
window.selectCard = selectCard;
window.resetCardSelection = resetCardSelection;
window.setCardTxTab = setCardTxTab;
window.openCardSettingsModal = openCardSettingsModal;
window.closeCardSettingsModal = closeCardSettingsModal;
window.autoFillBillingRange = autoFillBillingRange;
window.setPresetBilling = setPresetBilling;
window.saveCardSetting = saveCardSetting;
window.editCardSetting = editCardSetting;
window.deleteCardSetting = deleteCardSetting;

// 3. 통장 및 거래내역
window.openBankAccountModal = openBankAccountModal;
window.closeBankAccountModal = closeBankAccountModal;
window.saveBankAccount = saveBankAccount;
window.deleteBankAccount = deleteBankAccount;
window.renderBankTxTable = renderBankTxTable;
window.openBankTxModal = openBankTxModal;
window.closeBankTxModal = closeBankTxModal;
window.saveBankTx = saveBankTx;
window.deleteBankTx = deleteBankTx;
window.filterBankTxByMarket = filterBankTxByMarket;
window.getMarketDepositsFromBank = getMarketDepositsFromBank;
window.openBankUploadModal = openBankUploadModal;
window.closeBankUploadModal = closeBankUploadModal;
window.handleBankFileSelected = handleBankFileSelected;

// 4. 판관비 & 순자산
window.openCustomExpenseModal = openCustomExpenseModal;
window.closeCustomExpenseModal = closeCustomExpenseModal;
window.saveCustomExpense = saveCustomExpense;
window.deleteCustomExpense = deleteCustomExpense;
window.renderCustomExpenses = renderCustomExpenses;
window.openCustomAssetModal = openCustomAssetModal;
window.closeCustomAssetModal = closeCustomAssetModal;
window.saveCustomAsset = saveCustomAsset;
window.deleteCustomAsset = deleteCustomAsset;
window.renderCustomAssets = renderCustomAssets;
window.getOrderProductCost = getOrderProductCost;
window.getOrderActualCost = getOrderActualCost;
