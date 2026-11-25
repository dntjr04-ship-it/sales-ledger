/**
 * 리사님의 만능 매출장부 & 경영 비서 애플리케이션
 * 한줄 주문장, 사입/위탁 구분, 4단계 다중 정렬, 주문일자(주문고유번호) 표시 및 사입 재고 전용 관리 엔진
 */

// 전역 상태 관리
const AppState = {
  rawOrders: [],              // 전체 주문 데이터
  currentBizFilter: 'ALL',    // 'ALL', '아커만', '제니틱스' 또는 사용자 등록 사업자명
  businesses: [               // 🏢 등록 사업자 목록
    { id: 'biz_ackerman', name: '아커만', owner: '리사', regNum: '', desc: '스마트스토어 / 쿠팡 주력' },
    { id: 'biz_zenitics', name: '제니틱스', owner: '리사', regNum: '', desc: '오픈마켓 / 도매매 주력' }
  ],
  bizMappingRules: [          // 🏢 사업자 자동 분류 매핑 규칙
    { id: 'rule_1', field: 'market', operator: 'contains', value: '스마트스토어', targetBiz: '아커만' },
    { id: 'rule_2', field: 'market', operator: 'contains', value: '쿠팡', targetBiz: '제니틱스' },
    { id: 'rule_3', field: 'market', operator: 'contains', value: '올웨이즈', targetBiz: '아커만' },
    { id: 'rule_4', field: 'market', operator: 'contains', value: '11번가', targetBiz: '제니틱스' }
  ],
  searchQuery: '',            // 검색어
  selectedMarket: 'ALL',      // 판매사이트 필터
  selectedSourcing: 'ALL',    // 소싱플랫폼 필터
  selectedSourcingType: 'ALL',// 매입유형 필터 (ALL / 위탁 / 사입)
  selectedOrderStage: 'ALL',  // 주문구분 필터 (대기/완료/취소/반품/교환)
  selectedPurchaseStage: 'ALL',// 발주상태 필터 (완료/반품/취소)

  // 1. 카드사 결제일 & 청구기간 관리 (기본 템플릿)
  cardSettings: [
    { id: 'card_kb_a', name: '국민카드', holder: '리사', payDay: 14, billingStartDay: 1, billingEndDay: 31, billingDesc: '전월 1일 ~ 전월 말일', theme: 'theme-blue', note: '소싱처 전용' },
    { id: 'card_samsung_a', name: '삼성카드', holder: '리사', payDay: 25, billingStartDay: 14, billingEndDay: 13, billingDesc: '전전월 14일 ~ 전월 13일', theme: 'theme-blue', note: '마켓 결제용' }
  ],
  selectedCardKey: null,
  selectedCardTxTab: 'ALL', // 'ALL', 'CURRENT', 'NEXT'

  // 2. 통장 데이터 (실제 데이터 입력 대기 - 빈 상태)
  bankAccounts: [],

  // 2-B. 통장 거래내역 (입출금 장부 - 실제 데이터 입력 대기)
  bankTransactions: [],

  // 3. 판매처별 기입금 완료 내역
  marketSettlements: {},

  // 3-B. 비용 & 손익계산서 (판관비 및 자산/부채 - 실제 데이터 입력 대기)
  plViewTab: 'expense',
  editingExpenseId: null,
  customExpenses: [],
  customAssets: [],

  // 4. 주문장 뷰 모드 ('list', 'daily', 'monthly')
  ordersViewMode: 'list',

  // 5. 주문장 페이징 상태 (⭐ 리사님 요청: 기본 10건씩 조회)
  ordersCurrentPage: 1,
  ordersPageSize: 10,

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
  return o.orderStage === '완료';
}

/**
 * ⭐ 순수 상품 매입가 산출 헬퍼 (테이블 '매입가' 열 전용):
 * - 사입: (사입단가 × 수량) - 출고 택배비는 절대 포함하지 않음!
 * - 위탁: 카드결제가 - 포인트사용액
 */
function getOrderProductCost(o) {
  const ptAmount = (o.point > 0 ? o.point : (o.pointUsed > 0 ? o.pointUsed : 0));
  if (o.sourcingType === '사입') {
    // ⭐ 리사님 핵심 요청: 사입매입금액은 수량을 곱하지 않고 그냥 입력하는 금액 그대로 보여줌!
    const unitCost = (o.inventoryUnitCost > 0) ? o.inventoryUnitCost : (o.sourcingStandardPrice > 0 ? o.sourcingStandardPrice : 0);
    if (unitCost > 0) {
      return unitCost;
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

/**
 * ⭐ 리사님의 핵심 규칙:
 * "마진금액과 마진률은 직접계산하지 말고 업로드 파일에 있는 수치를 연결해줘"
 * - 업로드 파일에서 읽어온 o.marginAmt 수치가 있으면 파일 수치를 그대로 연결!
 * - 파일에 마진금액이 없는 경우에만 보조적으로 (정산가 - 총매입원가) 산출
 */
function getOrderMarginAmt(o) {
  if (o.marginAmt !== undefined && o.marginAmt !== null && !isNaN(o.marginAmt)) {
    return Number(o.marginAmt);
  }
  const isPurchaseOnly = (o.sourcingType === '사입' && (!o.market || o.salePrice === 0));
  if (isPurchaseOnly) return 0;
  const settleAmt = (o.actualSettlement > 0) ? o.actualSettlement : (o.standardPrice || o.totalSales || 0);
  const totalCost = getOrderActualCost(o);
  // ⭐ 리사님 적용 공식: 매출부가세, 수수료부가세, 매입부가세 반영 알짜 순마진 = (정산가 - 매입가) / 1.1
  return Math.round((settleAmt - totalCost) / 1.1);
}

/**
 * ⭐ 주문 마진율(%) 반환 헬퍼:
 * - 업로드 파일에서 읽어온 o.marginRate 수치가 있으면 파일 수치를 그대로 연결!
 * - 파일에 마진율이 없는 경우 보조적으로 (마진금액 / 판매가) * 100 산출
 */
function getOrderMarginRate(o) {
  if (o.marginRate !== undefined && o.marginRate !== null && !isNaN(o.marginRate)) {
    return Number(o.marginRate);
  }
  const isPurchaseOnly = (o.sourcingType === '사입' && (!o.market || o.salePrice === 0));
  if (isPurchaseOnly) return 0;
  const salesBase = (o.totalSales > 0) ? o.totalSales : ((o.actualSettlement > 0) ? o.actualSettlement : (o.standardPrice || 0));
  const marginAmt = getOrderMarginAmt(o);
  if (salesBase > 0) {
    return (marginAmt / salesBase) * 100;
  }
  return 0;
}

const CURRENT_APP_DATA_VERSION = '20261125_CLEAN_WRONG_DATA_V2';

/**
 * 🧹 실제 데이터 입력을 위한 기존 모의/가상 및 잘못 등록된 데이터 클린업
 */
function checkDataVersionMigration() {
  try {
    const savedVersion = localStorage.getItem('APP_DATA_VERSION');
    if (savedVersion !== CURRENT_APP_DATA_VERSION) {
      // 리사님의 요청: 현재 올려져 있는 잘못된 주문 데이터 완전 삭제!
      localStorage.removeItem(STORAGE_KEY_ORDERS);
      AppState.rawOrders = [];
      localStorage.setItem('APP_DATA_VERSION', CURRENT_APP_DATA_VERSION);
      return true;
    }
  } catch (e) {
    console.warn('데이터 버전 체크 오류:', e);
  }
  return false;
}

// DOM 로드 시 실행
document.addEventListener('DOMContentLoaded', () => {
  if (window.feather) feather.replace();

  // 실제 데이터 입력 모드 클린업 체크
  checkDataVersionMigration();

  initNavigation();
  initBusinessSwitcher();
  initFileUpload();
  initAuthDemo();
  initFilters();

  // 실제 데이터 복원 및 화면 렌더링 (가상 샘플은 자동 로드하지 않음!)
  loadStateFromStorage();

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
    plView: '💸 비용 & 손익계산서',
    sourcingRadarView: '🎯 지마켓 베스트 소싱 & 실시간 최저가 레이더',
    uploadView: '📁 엑셀 / CSV 주문 파일 업로드'
  };
  if (pageTitle && titles[targetId]) {
    pageTitle.textContent = titles[targetId];
  }

  if (targetId === 'dashboardView' && marketChartInstance) {
    marketChartInstance.resize();
  }

  if (targetId === 'plView') {
    initExpenseView();
    calculatePL();
  }

  if (targetId === 'sourcingRadarView' && window.renderSourcingRadar) {
    window.renderSourcingRadar();
  }

  if (window.feather) feather.replace();
}

/**
 * HTML 특수문자 이스케이프 헬퍼
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 🏢 등록 사업자 배지 색상 팔레트 생성기
 * (어떤 사업자명이 등록되어도 고유하고 예쁜 파스텔 배지 색상을 자동 배정)
 */
function getBizBadgeStyle(bizName) {
  const palette = [
    { bg: '#e0e7ff', color: '#3730a3' }, // Indigo (아커만 기본)
    { bg: '#fef3c7', color: '#92400e' }, // Amber (제니틱스 기본)
    { bg: '#ecfdf5', color: '#065f46' }, // Emerald
    { bg: '#f3e8ff', color: '#6b21a8' }, // Purple
    { bg: '#ffe4e6', color: '#9f1239' }, // Rose
    { bg: '#cffafe', color: '#155e75' }, // Cyan
    { bg: '#fef9c3', color: '#854d0e' }, // Yellow
    { bg: '#e2e8f0', color: '#334155' }  // Slate (공통)
  ];

  if (!bizName || bizName === '공통') return palette[7];
  if (bizName === '아커만' || bizName === '사업자A') return palette[0];
  if (bizName === '제니틱스' || bizName === '사업자B') return palette[1];

  let hash = 0;
  for (let i = 0; i < bizName.length; i++) {
    hash = bizName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % (palette.length - 1);
  return palette[index];
}

/**
 * 사이드바 사업자 스위처 버튼 동적 렌더링
 */
function renderBusinessSwitcher() {
  const group = document.getElementById('businessFilterGroup');
  if (!group) return;

  const current = AppState.currentBizFilter || 'ALL';
  let html = `<button class="toggle-btn ${current === 'ALL' ? 'active' : ''}" data-biz="ALL" onclick="setBusinessFilter('ALL')">통합 전체</button>`;

  (AppState.businesses || []).forEach(b => {
    const isActive = (current === b.name);
    html += `<button class="toggle-btn ${isActive ? 'active' : ''}" data-biz="${escapeHtml(b.name)}" onclick="setBusinessFilter('${escapeHtml(b.name)}')">${escapeHtml(b.name)}</button>`;
  });

  group.innerHTML = html;
}

/**
 * 모든 폼의 사업자 선택 드롭다운(<select>) 동기화
 */
function populateBusinessSelects() {
  const bizList = AppState.businesses || [];

  // 1. 주문 모달 (#formBiz)
  const formBiz = document.getElementById('formBiz');
  if (formBiz) {
    const curVal = formBiz.value;
    formBiz.innerHTML = bizList.map(b => `<option value="${escapeHtml(b.name)}">${escapeHtml(b.name)}</option>`).join('');
    if (curVal && bizList.some(b => b.name === curVal)) formBiz.value = curVal;
    else if (bizList.length > 0) formBiz.value = (AppState.currentBizFilter !== 'ALL' && bizList.some(b => b.name === AppState.currentBizFilter)) ? AppState.currentBizFilter : bizList[0].name;
  }

  // 2. 통장 모달 (#formBankBiz)
  const formBankBiz = document.getElementById('formBankBiz');
  if (formBankBiz) {
    const curVal = formBankBiz.value;
    formBankBiz.innerHTML = bizList.map(b => `<option value="${escapeHtml(b.name)}">${escapeHtml(b.name)}</option>`).join('');
    if (curVal && bizList.some(b => b.name === curVal)) formBankBiz.value = curVal;
    else if (bizList.length > 0) formBankBiz.value = (AppState.currentBizFilter !== 'ALL' && bizList.some(b => b.name === AppState.currentBizFilter)) ? AppState.currentBizFilter : bizList[0].name;
  }

  // 3. 지출 모달 (#formExpBiz)
  const formExpBiz = document.getElementById('formExpBiz');
  if (formExpBiz) {
    const curVal = formExpBiz.value;
    formExpBiz.innerHTML = `<option value="ALL">전체 공통 (ALL)</option>` +
      bizList.map(b => `<option value="${escapeHtml(b.name)}">${escapeHtml(b.name)}</option>`).join('');
    if (curVal) formExpBiz.value = curVal;
  }

  // 4. 자산 모달 (#formAssetBiz)
  const formAssetBiz = document.getElementById('formAssetBiz');
  if (formAssetBiz) {
    const curVal = formAssetBiz.value;
    formAssetBiz.innerHTML = `<option value="ALL">전체 공통 (ALL)</option>` +
      bizList.map(b => `<option value="${escapeHtml(b.name)}">${escapeHtml(b.name)}</option>`).join('');
    if (curVal) formAssetBiz.value = curVal;
  }

  // 5. 비용 퀵 입력 사업자 (#quickExpBiz)
  const quickExpBiz = document.getElementById('quickExpBiz');
  if (quickExpBiz) {
    const curVal = quickExpBiz.value;
    quickExpBiz.innerHTML = `<option value="ALL">공통(ALL)</option>` +
      bizList.map(b => `<option value="${escapeHtml(b.name)}">${escapeHtml(b.name)}</option>`).join('');
    if (curVal) quickExpBiz.value = curVal;
    else if (AppState.currentBizFilter !== 'ALL' && bizList.some(b => b.name === AppState.currentBizFilter)) {
      quickExpBiz.value = AppState.currentBizFilter;
    }
  }

  // 6. 비용 필터 사업자 (#expenseFilterBiz)
  const expenseFilterBiz = document.getElementById('expenseFilterBiz');
  if (expenseFilterBiz) {
    const curVal = expenseFilterBiz.value;
    expenseFilterBiz.innerHTML = `<option value="ALL">모든 사업자</option>` +
      bizList.map(b => `<option value="${escapeHtml(b.name)}">${escapeHtml(b.name)}</option>`).join('');
    if (curVal) expenseFilterBiz.value = curVal;
  }

  // 7. 주문장 일괄 변경 사업자 (#batchTargetBizSelect)
  const batchTargetBizSelect = document.getElementById('batchTargetBizSelect');
  if (batchTargetBizSelect) {
    const curVal = batchTargetBizSelect.value;
    batchTargetBizSelect.innerHTML = bizList.map(b => `<option value="${escapeHtml(b.name)}">${escapeHtml(b.name)}</option>`).join('');
    if (curVal && bizList.some(b => b.name === curVal)) batchTargetBizSelect.value = curVal;
  }

  // 8. 자동 매핑 규칙 추가 모달 사업자 (#newRuleTargetBiz)
  const newRuleTargetBiz = document.getElementById('newRuleTargetBiz');
  if (newRuleTargetBiz) {
    const curVal = newRuleTargetBiz.value;
    newRuleTargetBiz.innerHTML = bizList.map(b => `<option value="${escapeHtml(b.name)}">${escapeHtml(b.name)}</option>`).join('');
    if (curVal && bizList.some(b => b.name === curVal)) newRuleTargetBiz.value = curVal;
  }
}

/**
 * 사업자 필터 스위처
 */
function setBusinessFilter(biz) {
  AppState.currentBizFilter = biz;
  AppState.ordersCurrentPage = 1;
  renderBusinessSwitcher();

  const badge = document.getElementById('currentBizBadge');
  if (badge) {
    if (biz === 'ALL') badge.textContent = '🏢 전체 사업자 통합 현황';
    else badge.textContent = `🏢 ${biz} 전용 장부`;
  }

  renderAll();
}

function initBusinessSwitcher() {
  renderBusinessSwitcher();
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
      AppState.ordersCurrentPage = 1;
      renderOrdersTable();
    });
  }

  if (marketSelect) {
    marketSelect.addEventListener('change', (e) => {
      AppState.selectedMarket = e.target.value;
      AppState.ordersCurrentPage = 1;
      renderOrdersTable();
    });
  }

  if (sourcingSelect) {
    sourcingSelect.addEventListener('change', (e) => {
      AppState.selectedSourcing = e.target.value;
      AppState.ordersCurrentPage = 1;
      renderOrdersTable();
    });
  }

  if (sourcingTypeSelect) {
    sourcingTypeSelect.addEventListener('change', (e) => {
      AppState.selectedSourcingType = e.target.value;
      AppState.ordersCurrentPage = 1;
      renderOrdersTable();
    });
  }

  if (orderStageSelect) {
    orderStageSelect.addEventListener('change', (e) => {
      AppState.selectedOrderStage = e.target.value;
      AppState.ordersCurrentPage = 1;
      renderOrdersTable();
    });
  }

  if (purchaseStageSelect) {
    purchaseStageSelect.addEventListener('change', (e) => {
      AppState.selectedPurchaseStage = e.target.value;
      AppState.ordersCurrentPage = 1;
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

/**
 * 📥 파일 업로드 처리 (엑셀 .xlsx, .xls 및 .csv 자동 판별 및 인코딩 지원)
 */
function handleFile(file) {
  if (!file) return;
  const fileName = file.name || '';
  const isExcel = /\.(xlsx|xls)$/i.test(fileName);

  const reader = new FileReader();

  if (isExcel) {
    // 1. 엑셀 파일 (.xlsx, .xls) 파싱: SheetJS 사용
    reader.onload = function(e) {
      try {
        if (!window.XLSX) {
          throw new Error('엑셀 파싱 라이브러리(SheetJS)가 로드되지 않았습니다.');
        }
        const data = new Uint8Array(e.target.result);
        const workbook = window.XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        processOrderRows(rows, fileName);
      } catch (err) {
        console.error('엑셀 파싱 에러:', err);
        alert(`엑셀 파일 [${fileName}] 파싱 중 오류가 발생했습니다: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    // 2. CSV 파일: EUC-KR / UTF-8 자동 판별
    reader.onload = function(e) {
      try {
        const buffer = e.target.result;
        let text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
        // 만약 UTF-8 디코딩 시 대체문자(U+FFFD)가 3개 이상 나타나면 EUC-KR로 재디코딩
        const fffdCount = (text.match(/\uFFFD/g) || []).length;
        if (fffdCount > 3) {
          text = new TextDecoder('euc-kr', { fatal: false }).decode(buffer);
        }
        const rows = parseCSV(text);
        processOrderRows(rows, fileName);
      } catch (err) {
        console.error('CSV 파싱 에러:', err);
        alert(`CSV 파일 [${fileName}] 파싱 중 오류가 발생했습니다: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  }
}

/**
 * 인라인 백업 샘플 CSV (로컬 file:/// 프로토콜에서도 즉시 로드)
 */
const INLINE_SAMPLE_CSV = `주문고유번호,판매사이트명,판매자ID,수집일,주문일,결제일,판매사이트 주문번호,상품명,주문선택사항,판매가,주문수량,배송비금액,수령자명,송장번호,한줄메모,상품요약,출고중지여부,담당자,결제플랫폼,카드명의,결제카드,결제ID,결제기준가,결제가,포인트,결제일자,주문번호,택배사,주문송장번호,판매처명,사업자명,주문자 메모,CS담당자메모,로스처리,등록상품
103309491451,스마트스토어,아커만,2026-10-18 오후 5:18:25,2026-10-17 오전 2:13:14,2026-10-17 오전 2:13:24,2026101751952881,CJ 비비고 소고기 미역국 500g x 10개,,29700,1,2500,김철수,,,,,,,,,,,,,,,,,,,,미등록
101034774051,스마트스토어,아커만,2026-10-18 오후 5:18:25,2026-10-17 오전 5:41:31,2026-10-17 오전 5:41:36,2026101752416041,동아오츠카 나랑드 사이다 제로 그린애플 500ml x 24개,,15090,1,2500,이영희,,,,,,지마켓,tjrdnrkd,스마일카드 Edition3,tjrdnrkd,16753,"14,160",,2026-10-18 오후 5:48:35,4504976132,CJ택배,302535711474,여병주,에스엠맨테크,,,,등록
100563940973,스마트스토어,아커만,2026-10-18 오후 5:18:25,2026-10-17 오전 11:59:24,2026-10-17 오전 11:59:42,2026101756699671,센텔리안24 마데카 더마 마스크 x 2개,,11510,1,2500,박민수,,,,,,,,,,,11920,,,123,우체국택배,6082251098067,,,,,,미등록
101235309067,스마트스토어,아커만,2026-10-18 오후 5:18:25,2026-10-17 오후 11:10:37,2026-10-17 오후 11:10:48,2026101767895311,코카콜라 태양의 마테차 500ml x 24개,,14000,1,2500,최지우,,,,,,,,,,,,,,,,,,,,미등록
100104986839,쿠팡(신),제니틱스,2026-10-18 오후 5:17:23,2026-10-17 오전 1:40:00,2026-10-17 오전 1:40:00,15103651673828,오리온 비쵸비 초코맛+딸기맛 세트,125g 1세트,16830,1,0,정하나,,,,,,옥션,tjrdnrkd,스마일카드 Edition3,tjrdnrkd,,"14,140",,2026-10-18 오후 5:49:05,2573535631,CJ대한통운,302535723260,스타배송,,,,,등록
103203677470,쿠팡(신),제니틱스,2026-10-18 오후 5:17:23,2026-10-17 오전 6:51:00,2026-10-17 오전 6:51:00,2103656517335,오리온 비쵸비 초코맛+딸기맛 세트,125g 1세트,16830,1,0,한수민,,,,,,옥션,tjrdnrkd,스마일카드 Edition3,tjrdnrkd,,"14,140",,2026-10-18 오후 5:49:02,2573535690,CJ대한통운,302535723282,스타배송,,,,,등록
101868691697,쿠팡(신),제니틱스,2026-10-18 오후 5:17:23,2026-10-17 오후 12:50:00,2026-10-17 오후 12:50:00,30103661912842,비첸향 미니이지 포크 원물간식,500g 1개,52830,1,0,윤서준,,,,,,롯데온,강우석,국민카드,,,"45,750",,2026-10-19 오전 1:11:13,2026101912630748,,,,,,,,등록
101092965762,쿠팡(신),제니틱스,2026-10-18 오후 5:17:23,2026-10-18 오후 2:43:00,2026-10-18 오후 2:43:00,21103685219095,지구식단 슬림핏 콩면 4인분,150g 10개,21810,1,0,송지은,,,,,,지마켓,tjrdnrkd,삼성카드,tjrdnrkd,,"17,410",,2026-10-18 오후 5:48:04,4504981191,,,신세계라이브쇼핑,(주)신세계라이브쇼핑,,,,등록
102427680450,올웨이즈,아커만,2026-10-18 오후 5:17:17,2026-10-18 오전 6:31:23,2026-10-18 오전 6:31:23,308bc34e-bad1-4ce6,정성곳간 뼈없는 갈비탕 800g x 8개,단일상품,34354,1,0,임다솜,,,,,,네이버,강우석,우리카드,tjrdnrkd,,"31,980",,2026-10-18 오후 5:58:44,2026101881041151,한진택배,522529516250,NS홈쇼핑,(주)엔에스쇼핑,,,,등록
103298032857,올웨이즈,아커만,2026-10-18 오후 5:17:17,2026-10-17 오후 9:08:57,2026-10-17 오후 9:08:57,fce09006-e804-4657,켈로그 프링글스 치즈맛 110g x 12개,단일상품,24840,1,0,배도현,,,,,,지마켓,tjrdnrkd,스마일카드 Edition3,tjrdnrkd,,"18,820",,2026-10-18 오후 6:13:02,4504986076,CJ택배,304347554293,켈로그대리점,주식회사편한세상,,,,등록
100836987268,G마켓,아커만,2026-10-18 오후 5:16:53,2026-10-18 오후 4:49:00,2026-10-18 오후 4:49:00,4504964806,쏘피 바디피트 천연코튼 팬티라이너 x 5개,,16300,1,0,오유진,,,,,,옥션,tjrdnrkd,스마일카드 Edition3,tjrdnrkd,,"12,020",,2026-10-18 오후 6:15:13,2573537089,CJ대한통운,302535728322,스타배송,,,,,등록
101294781887,카카오 톡스토어,아커만,2026-10-18 오후 5:16:33,2026-10-17 오전 1:17:16,2026-10-17 오전 1:17:15,3498154817,사조참치 안심따개 100g x 12개,,22000,1,0,류태현,,,,,,지마켓,tjrdnrkd,스마일카드 Edition3,tjrdnrkd,,"18,330",,2026-10-18 오후 6:12:57,4504987023,CJ택배,302535815984,여병주,에스엠맨테크,,,,등록
100492432399,카카오 톡스토어,아커만,2026-10-18 오후 5:16:33,2026-10-17 오후 6:36:47,2026-10-17 오후 6:36:47,3498760000,맥심 모카골드 마일드 커피믹스 400T,"수량/400개",57500,1,0,신예원,,,,,,네이버,강우석,우리카드,tjrdnrkd,,"49,900",,2026-10-18 오후 6:10:30,2026101881279251,CJ대한통운,512166957343,큐마트몰,(주)서광물류,,,,등록
102902045675,카카오 톡스토어,아커만,2026-10-18 오후 5:16:33,2026-10-18 오전 11:15:36,2026-10-18 오전 11:15:35,3499252188,프로쉬 식기세척기세제 미니 50개입 x 3개,,45600,1,0,구자경,,,,,,지마켓,tjrdnrkd,스마일카드 Edition3,tjrdnrkd,,"38,900",1000,2026-10-18 오후 6:12:56,4504988287,CJ택배,522825439735,프로쉬스토어,(주)제이엔비,,,,등록
102699088111,옥션,아커만,2026-10-18 오후 5:16:21,2026-10-17 오전 5:26:00,2026-10-17 오전 5:26:00,2573444362,비폰 포보 베트남 쌀국수 소고기맛 60g x 30개,,23200,1,0,권지후,,,,,,쿠팡,강우석,국민카드,tjrdnrkd,,16330,,,27103688371798,로켓배송,10333082276646,,,,,,등록
100035653447,올웨이즈,아커만,2026-10-19 오전 12:05:28,2026-10-18 오후 8:52:12,2026-10-18 오후 8:52:12,706f0221-045a,동화약품 소다활 매실맛 500ml x 48개,단일상품,37291,1,0,문채원,,,,,,11번가,강우석,신한카드,tjrdnrkd,,34910,,2026-10-19 오전,20261019109464773,CJ대한통운,531055086502,,,,,,등록
102963544829,스마트스토어,아커만,2026-10-19 오전 12:06:31,2026-10-18 오후 5:34:52,2026-10-18 오후 5:35:29,2026101880559891,해화당 이영자의 뼈없는 갈비탕 x 8개,수량: 1세트,55100,1,2500,안지호,,,,,,지마켓,강우석,삼성카드,tjrdnrkd,,"47,820",,2026-10-19 오전 1:31:42,4505126870,CJ택배,7721414942,롯데원티비,(주)우리홈쇼핑,,,,등록
100186721641,쿠팡(신),제니틱스,2026-10-18 오후 6:41:00,2026-10-18 오후 6:41:00,2026-10-18 오후 6:41:00,24103688719737,혁명티슈 멀티 세정 티슈 85매,3개 세트,34900,1,0,백서현,,,,,,sk스토아,강우석,삼성카드,강우석,,31640,,2026-10-19 오전 10:44:58,20261019651572,,,,,,,,등록`;

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
const STORAGE_KEY_BUSINESSES = 'LISA_BUSINESSES_V1';
const STORAGE_KEY_BIZ_RULES = 'LISA_BIZ_RULES_V1';

function saveStateToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY_ORDERS, JSON.stringify(AppState.rawOrders));
    localStorage.setItem(STORAGE_KEY_BANKS, JSON.stringify(AppState.bankAccounts));
    localStorage.setItem(STORAGE_KEY_SETTLE, JSON.stringify(AppState.marketSettlements));
    localStorage.setItem(STORAGE_KEY_CARDS, JSON.stringify(AppState.cardSettings));
    localStorage.setItem(STORAGE_KEY_BANK_TX, JSON.stringify(AppState.bankTransactions));
    localStorage.setItem(STORAGE_KEY_EXPENSES, JSON.stringify(AppState.customExpenses));
    localStorage.setItem(STORAGE_KEY_ASSETS, JSON.stringify(AppState.customAssets));
    localStorage.setItem(STORAGE_KEY_BUSINESSES, JSON.stringify(AppState.businesses));
    localStorage.setItem(STORAGE_KEY_BIZ_RULES, JSON.stringify(AppState.bizMappingRules || []));
    localStorage.setItem('sales_ledger_page_size', String(AppState.ordersPageSize || 10));
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
    const savedBusinesses = localStorage.getItem(STORAGE_KEY_BUSINESSES);
    const savedBizRules = localStorage.getItem(STORAGE_KEY_BIZ_RULES);
    const savedPageSize = localStorage.getItem('sales_ledger_page_size');

    if (savedPageSize) {
      AppState.ordersPageSize = (savedPageSize === 'ALL') ? 'ALL' : (parseInt(savedPageSize, 10) || 10);
    } else {
      AppState.ordersPageSize = 10;
    }

    if (savedBizRules) {
      try {
        const parsedRules = JSON.parse(savedBizRules);
        if (Array.isArray(parsedRules) && parsedRules.length > 0) {
          AppState.bizMappingRules = parsedRules;
        }
      } catch (e) {
        console.warn('사업자 규칙 복원 오류:', e);
      }
    }

    if (savedBusinesses) {
      try {
        const parsedBiz = JSON.parse(savedBusinesses);
        if (Array.isArray(parsedBiz) && parsedBiz.length > 0) {
          AppState.businesses = parsedBiz;
        }
      } catch (e) {
        console.warn('사업자 목록 복원 오류:', e);
      }
    }
    if (!AppState.businesses || !Array.isArray(AppState.businesses) || AppState.businesses.length === 0) {
      AppState.businesses = [
        { id: 'biz_ackerman', name: '아커만', owner: '리사', regNum: '', desc: '스마트스토어 / 쿠팡 주력' },
        { id: 'biz_zenitics', name: '제니틱스', owner: '리사', regNum: '', desc: '오픈마켓 / 도매매 주력' }
      ];
    } else {
      let migrated = false;
      AppState.businesses.forEach(b => {
        if (b.name === '사업자A') { b.name = '아커만'; migrated = true; }
        if (b.name === '사업자B') { b.name = '제니틱스'; migrated = true; }
        if (b.owner === '강우석') { b.owner = '리사'; }
      });
      const hasAckerman = AppState.businesses.some(b => b.name === '아커만');
      const hasZenitics = AppState.businesses.some(b => b.name === '제니틱스');
      if (!hasAckerman) {
        AppState.businesses.unshift({ id: 'biz_ackerman', name: '아커만', owner: '리사', regNum: '', desc: '주력 사업자' });
        migrated = true;
      }
      if (!hasZenitics) {
        AppState.businesses.push({ id: 'biz_zenitics', name: '제니틱스', owner: '리사', regNum: '', desc: '제2 사업자' });
        migrated = true;
      }
      if (migrated) {
        saveStateToStorage();
      }
    }

    if (savedBanks) {
      AppState.bankAccounts = JSON.parse(savedBanks);
      AppState.bankAccounts.forEach(b => {
        if (b.initialBalance === undefined) {
          b.initialBalance = b.balance || 0;
        }
      });
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
    recalculateAllBankBalances();
    if (savedExpenses) {
      AppState.customExpenses = JSON.parse(savedExpenses);
      (AppState.customExpenses || []).forEach(e => {
        if (!e.date && e.month) {
          e.date = e.month + '-01';
        }
      });
    }
    if (savedAssets) {
      AppState.customAssets = JSON.parse(savedAssets);
    }

    // 🏢 기존 주문 및 금융 데이터 사업자명 자동 마이그레이션 (사업자A -> 아커만, 사업자B -> 제니틱스)
    if (savedOrders) {
      const parsed = JSON.parse(savedOrders);
      if (Array.isArray(parsed) && parsed.length > 0) {
        AppState.rawOrders = parsed;
        AppState.rawOrders.forEach(o => {
          if (o.biz === '사업자A') o.biz = '아커만';
          if (o.biz === '사업자B') o.biz = '제니틱스';
          if (!o.biz || o.biz === '미지정') o.biz = '아커만';
        });
      }
    }
    (AppState.bankAccounts || []).forEach(b => {
      if (b.biz === '사업자A') b.biz = '아커만';
      if (b.biz === '사업자B') b.biz = '제니틱스';
    });
    (AppState.customExpenses || []).forEach(e => {
      if (e.biz === '사업자A') e.biz = '아커만';
      if (e.biz === '사업자B') e.biz = '제니틱스';
    });
    (AppState.customAssets || []).forEach(a => {
      if (a.biz === '사업자A') a.biz = '아커만';
      if (a.biz === '사업자B') a.biz = '제니틱스';
    });

    // 기존 주문이나 계좌에 혹시 다른 커스텀 사업자명이 있다면 누락 방지 자동 등록
    const existingBizNames = new Set(AppState.businesses.map(b => b.name));
    if (AppState.rawOrders && AppState.rawOrders.length > 0) {
      AppState.rawOrders.forEach(o => {
        if (o.biz && o.biz !== 'ALL' && !existingBizNames.has(o.biz)) {
          AppState.businesses.push({ id: 'biz_' + Date.now() + Math.random().toString(36).substr(2, 4), name: o.biz, owner: '', regNum: '', desc: '' });
          existingBizNames.add(o.biz);
        }
      });
      (AppState.bankAccounts || []).forEach(b => {
        if (b.biz && b.biz !== 'ALL' && !existingBizNames.has(b.biz)) {
          AppState.businesses.push({ id: 'biz_' + Date.now() + Math.random().toString(36).substr(2, 4), name: b.biz, owner: '', regNum: '', desc: '' });
          existingBizNames.add(b.biz);
        }
      });
    }

    renderBusinessSwitcher();
    populateBusinessSelects();
    populateSelectFilters();
    renderAll();
    return true;
  } catch (err) {
    console.warn('LocalStorage 복원 실패:', err);
    renderBusinessSwitcher();
    populateBusinessSelects();
    populateSelectFilters();
    renderAll();
  }
  return false;
}

/**
 * 샘플 데이터 로드 (사용자가 업로드 탭에서 수동으로 누른 경우에만 실행)
 */
function loadSampleOrders(forceReload = false) {
  if (!forceReload) {
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
      renderAll();
    })
    .catch(() => {
      parseCSVOrders(INLINE_SAMPLE_CSV);
      saveStateToStorage();
      renderAll();
    });
}

/**
 * 🧹 전체 장부 데이터 비우기 (새 장부 시작용)
 */
function clearAllLedgerData(skipConfirm = false) {
  if (!skipConfirm && !confirm('모든 주문, 통장 거래, 지출, 자산 내역을 삭제하고 깨끗한 새 장부로 시작할까요?')) {
    return;
  }
  AppState.rawOrders = [];
  AppState.bankAccounts = [];
  AppState.bankTransactions = [];
  AppState.marketSettlements = {};
  AppState.customExpenses = [];
  AppState.customAssets = [];
  saveStateToStorage();
  renderAll();
  alert('모든 가상/임시 데이터가 깨끗하게 비워졌습니다!\n이제 실제 데이터를 자유롭게 입력해 보세요, 리사님! ✨');
}
window.clearAllLedgerData = clearAllLedgerData;

/**
 * 🧹 현재 등록된 주문 데이터만 전체 삭제하기 (잘못 올린 파일 비우기 ⭐)
 */
function clearAllOrders(skipConfirm = false) {
  if (!skipConfirm && !confirm('현재 등록된 모든 주문 데이터를 삭제할까요, 리사님?\n(새로운 엑셀/CSV 파일을 깨끗하게 올릴 수 있습니다)')) {
    return;
  }
  AppState.rawOrders = [];
  try {
    localStorage.removeItem(STORAGE_KEY_ORDERS);
  } catch (e) {}
  saveStateToStorage();
  populateSelectFilters();
  renderAll();
  alert('현재 올려져 있던 주문 데이터가 깨끗하게 모두 삭제되었습니다! ✨\n이제 [엑셀/CSV 업로드]에서 새 파일을 올려보세요.');
}
window.clearAllOrders = clearAllOrders;

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
 * 📑 엑셀/CSV 행 데이터 유연한 지능형 매칭 및 정규화
 */
function processOrderRows(rows, fileName = '주문파일') {
  if (!rows || rows.length < 2) {
    alert(`파일 [${fileName}]에 유효한 데이터 행이 없습니다.`);
    return;
  }

  // 1. 헤더 행 자동 감지 (상단 타이틀/빈 행 건너뛰기)
  const keyKeywords = ['상품명', '주문번호', '주문고유번호', '판매가', '결제금액', '판매사이트', '판매처', '마켓', '수량', '구매자', '수령자'];
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const rowStr = (rows[i] || []).map(cell => String(cell || '').trim()).join(' ');
    const matchCount = keyKeywords.filter(k => rowStr.includes(k)).length;
    if (matchCount >= 2) {
      headerRowIdx = i;
      break;
    }
  }

  const rawHeaders = (rows[headerRowIdx] || []).map(h => String(h || '').trim());

  // 2. 컬럼 동의어 사전 (스마트스토어, 쿠팡, 오픈마켓, 사방넷, 플레이오토, 이지어드민 등 완벽 지원)
  const COL_CANDIDATES = {
    orderNo: ['주문고유번호', '주문번호', '주문No', '주문NO', '주문코드', '주문순번', '주문ID', 'Order ID', 'OrderNo'],
    orderSeq: ['판매사이트 주문번호', '판매사이트주문번호', '쇼핑몰주문번호', '스토어주문번호', '원주문번호', '마켓주문번호'],
    market: ['판매사이트명', '판매사이트', '판매처명', '판매처', '쇼핑몰', '쇼핑몰명', '마켓', '마켓명', '채널', '채널명', '몰명', '주문처', '사이트명', '사이트'],
    biz: ['판매자ID', '사업자명', '사업자', '판매자명', '스토어명', '스토어', '계정', '아이디'],
    orderDate: ['주문일', '주문일시', '주문일자', '결제일', '결제일시', '결제일자', '수집일', '수집일시', '주문시간', '날짜', '일자'],
    productName: ['상품명', '주문상품명', '판매상품명', '상품', '품명', '노출상품명', '등록상품명'],
    option: ['주문선택사항', '선택사항', '옵션', '옵션명', '옵션정보', '단품명', '규격'],
    qty: ['주문수량', '수량', '구매수량', '개수', '수량(개)'],
    salePrice: ['판매가', '결제금액', '판매금액', '실결제금액', '주문금액', '상품금액', '단가', '판매단가'],
    shipping: ['배송비금액', '배송비', '배송비(원)', '운임', '고객부담배송비', '배송료'],
    recipient: ['수령자명', '수령인', '수취인명', '수취인', '받는분', '받는사람', '구매자명', '주문자명', '구매자', '주문자', '고객명'],
    trackingNo: ['송장번호', '운송장번호', '운송장', '주문송장번호'],
    courier: ['택배사', '배송사', '택배사명'],
    standardPrice: ['결제기준가', '정산예정액', '정산예정금액', '정산금액', '정산금', '공급가액'],
    sourcingPlatform: ['결제플랫폼', '소싱처', '소싱사이트', '소싱플랫폼', '매입처', '매입사이트', '발주처', '발주플랫폼', '공급처', '도매처'],
    sourcingOrderNo: ['소싱주문번호', '소싱처주문번호', '매입주문번호', '발주번호', '소싱처 주문번호'],
    paymentCard: ['결제카드', '카드명', '결제수단', '카드', '신용카드', '결제방식'],
    cardHolder: ['카드명의', '명의자', '카드명의자', '결제자'],
    sourcingId: ['결제ID', '소싱ID', '발주ID'],
    purchaseCost: ['결제가', '실매입가', '매입금액', '매입가', '발주금액', '원가', '상품원가', '사입금액', '구매금액', '결제금액(매입)'],
    point: ['포인트', '사용포인트', '적립금', '할인금액'],
    paymentDate: ['결제일자', '발주일자', '매입일자', '소싱결제일'],
    supplierName: ['공급사명', '공급사', '제조사', '도매업체', '매입처명'],
    supplierBiz: ['사업자명', '공급자사업자'],
    orderStage: ['주문구분', '주문상태', '처리상태', '진행상태', '등록상품'],
    purchaseStage: ['발주상태', '매입상태'],
    sourcingType: ['매입유형', '소싱유형', '사입/위탁', '구분'],
    marginAmt: ['마진금액', '마진액', '마진(원)', '예상마진', '예상마진금액', '순이익', '이익', '이익금', '영업이익', '수익금', '마진', 'Margin', 'Profit'],
    marginRate: ['마진율', '마진률', '예상마진율', '예상마진률', '수익률', '이익률', '순이익률', '마진(%)', '마진비율', '마진퍼센트', 'Margin%', 'Margin Rate', 'Profit Rate', 'Profit%']
  };

  // 인덱스 매핑 헬퍼
  function findColIndex(candidates) {
    // 1차: 정확 일치 (공백, 특수문자 제거)
    for (const c of candidates) {
      const cleanC = c.replace(/[\s\-_()\[\]]/g, '').toLowerCase();
      const idx = rawHeaders.findIndex(h => h.replace(/[\s\-_()\[\]]/g, '').toLowerCase() === cleanC);
      if (idx !== -1) return idx;
    }
    // 2차: 부분 일치
    for (const c of candidates) {
      const cleanC = c.replace(/[\s\-_()\[\]]/g, '').toLowerCase();
      const idx = rawHeaders.findIndex(h => {
        const cleanH = h.replace(/[\s\-_()\[\]]/g, '').toLowerCase();
        return cleanH.includes(cleanC) || cleanC.includes(cleanH);
      });
      if (idx !== -1) return idx;
    }
    return -1;
  }

  const colIdx = {};
  Object.keys(COL_CANDIDATES).forEach(key => {
    colIdx[key] = findColIndex(COL_CANDIDATES[key]);
  });

  // ⭐ 마진금액과 마진율 컬럼 인덱스 정밀 보정 (마진율 컬럼이 마진금액으로 오인식되는 것 방지)
  const rateCandidates = ['마진율', '마진률', '예상마진율', '예상마진률', '수익률', '이익률', '순이익률', '마진(%)', '마진비율', 'margin%', 'marginrate', 'profit%'];
  let foundRateIdx = -1;
  for (const c of rateCandidates) {
    const cleanC = c.replace(/[\s\-_()\[\]]/g, '').toLowerCase();
    const idx = rawHeaders.findIndex(h => h.replace(/[\s\-_()\[\]]/g, '').toLowerCase() === cleanC);
    if (idx !== -1) { foundRateIdx = idx; break; }
  }
  if (foundRateIdx === -1) {
    for (const c of rateCandidates) {
      const cleanC = c.replace(/[\s\-_()\[\]]/g, '').toLowerCase();
      const idx = rawHeaders.findIndex(h => h.replace(/[\s\-_()\[\]]/g, '').toLowerCase().includes(cleanC));
      if (idx !== -1) { foundRateIdx = idx; break; }
    }
  }

  const amtCandidates = ['마진금액', '마진액', '마진(원)', '예상마진', '예상마진금액', '순이익', '이익', '이익금', '영업이익', '수익금', '마진', 'margin', 'profit'];
  let foundAmtIdx = -1;
  for (const c of amtCandidates) {
    const cleanC = c.replace(/[\s\-_()\[\]]/g, '').toLowerCase();
    const idx = rawHeaders.findIndex((h, i) => i !== foundRateIdx && h.replace(/[\s\-_()\[\]]/g, '').toLowerCase() === cleanC);
    if (idx !== -1) { foundAmtIdx = idx; break; }
  }
  if (foundAmtIdx === -1) {
    for (const c of amtCandidates) {
      const cleanC = c.replace(/[\s\-_()\[\]]/g, '').toLowerCase();
      const idx = rawHeaders.findIndex((h, i) => i !== foundRateIdx && h.replace(/[\s\-_()\[\]]/g, '').toLowerCase().includes(cleanC) && !h.includes('율') && !h.includes('률') && !h.includes('%'));
      if (idx !== -1) { foundAmtIdx = idx; break; }
    }
  }

  colIdx.marginRate = foundRateIdx;
  colIdx.marginAmt = foundAmtIdx;

  const orders = [];
  const defaultBiz = (AppState.currentBizFilter !== 'ALL') ? AppState.currentBizFilter : (AppState.businesses[0]?.name || '아커만');
  const existingBizNames = new Set((AppState.businesses || []).map(b => b.name));

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;

    const get = (key) => {
      const idx = colIdx[key];
      if (idx === -1 || idx === undefined || r[idx] === undefined || r[idx] === null) return '';
      return String(r[idx]).trim();
    };

    const getNum = (key) => {
      const str = get(key).replace(/[^0-9.-]+/g, "");
      const val = parseFloat(str);
      return isNaN(val) ? 0 : val;
    };

    const productName = get('productName');
    // 상품명이나 주문번호가 없으면 빈 행 건너뛰기
    if (!productName && !get('orderNo')) continue;

    const orderNo = get('orderNo') || `ORD-${Date.now()}-${i}`;
    let market = get('market') || '스마트스토어';
    let rawBiz = get('biz');
    let biz = defaultBiz;

    // 1) 행 데이터에 사업자명이 들어있는 경우
    if (rawBiz) {
      const cleanRaw = rawBiz.trim();
      if (cleanRaw.includes('아커만') || cleanRaw.toLowerCase().includes('ackerman')) biz = '아커만';
      else if (cleanRaw.includes('제니틱스') || cleanRaw.toLowerCase().includes('zeni')) biz = '제니틱스';
      else if (cleanRaw === '사업자A') biz = '아커만';
      else if (cleanRaw === '사업자B') biz = '제니틱스';
      else biz = cleanRaw;
    }

    // 2) 사업자 자동 분류 매핑 규칙 검사 (마켓명, 판매자ID, 상품명 등)
    const ruleObj = {
      market: market,
      biz: rawBiz,
      sellerId: rawBiz,
      productName: productName,
      paymentCard: get('paymentCard')
    };
    const matchedRuleBiz = matchBizForOrder(ruleObj);
    if (matchedRuleBiz) {
      biz = matchedRuleBiz;
    }

    // 만약 파일에 새로운 사업자명이 들어있다면 사업자 목록에 자동 추가
    if (biz && biz !== 'ALL' && !existingBizNames.has(biz)) {
      AppState.businesses.push({
        id: 'biz_' + Date.now() + Math.random().toString(36).substr(2, 4),
        name: biz,
        owner: '리사',
        regNum: '',
        desc: '파일 업로드로 자동 등록됨'
      });
      existingBizNames.add(biz);
    }

    const orderDate = get('orderDate') || formatDateForInput(new Date());
    const orderSeq = get('orderSeq');
    const option = get('option');
    const qty = getNum('qty') || 1;
    const salePrice = getNum('salePrice');
    const shipping = getNum('shipping');

    // ⭐ 리사님의 핵심 요청: 판매가도 엑셀 파일에 있는 숫자 그대로 사용! (수량 곱해서 부풀리지 않음)
    const totalSales = salePrice > 0 ? salePrice : shipping;
    let standardPrice = getNum('standardPrice');
    if (standardPrice <= 0 && totalSales > 0) {
      standardPrice = totalSales;
    }
    const actualSettlement = standardPrice;

    const sourcingPlatform = get('sourcingPlatform') || '';
    const sourcingOrderNo = get('sourcingOrderNo');
    const paymentCard = get('paymentCard') || '';
    const cardHolder = get('cardHolder') || '';
    const sourcingId = get('sourcingId') || '';
    const purchaseCost = getNum('purchaseCost');
    const sourcingStandardPrice = getNum('standardPrice') || purchaseCost;
    const point = getNum('point');
    const purchasePrice = Math.max(0, purchaseCost - point);
    const paymentDate = get('paymentDate') || (purchaseCost > 0 ? orderDate : '');
    const courier = get('courier');
    const trackingNo = get('trackingNo');
    const supplierName = get('supplierName');
    const supplierBiz = get('supplierBiz');
    const recipient = get('recipient') || '-';

    // 매입유형: 파일에 명시되어 있으면 따르고, 없으면 기본 '위탁'
    const rawType = get('sourcingType');
    let sourcingType = '위탁';
    if (rawType.includes('사입') || (!market && salePrice === 0)) {
      sourcingType = '사입';
    }

    // 주문구분 & 발주상태 (매출이 제대로 집계되도록 지능형 상태 판별 ⭐)
    const rawStage = (get('orderStage') + ' ' + get('purchaseStage')).trim();
    let orderStage = '완료';
    let purchaseStage = '완료';

    if (rawStage.includes('취소') || rawStage.includes('환불')) {
      orderStage = '취소';
      purchaseStage = '취소';
    } else if (rawStage.includes('반품')) {
      orderStage = '반품';
      purchaseStage = '반품';
    } else if (rawStage.includes('교환')) {
      orderStage = '교환';
      purchaseStage = '완료';
    } else if (rawStage.includes('대기') || rawStage.includes('접수') || rawStage.includes('결제대기')) {
      orderStage = '대기';
      purchaseStage = (purchaseCost > 0) ? '완료' : '대기';
    } else {
      orderStage = '완료';
      purchaseStage = '완료';
    }

    const inventoryUnitCost = purchaseCost > 0 ? purchaseCost : purchasePrice;

    // ⭐ 리사님의 핵심 요청: 마진금액과 마진률은 직접 계산하지 않고 업로드 파일에 있는 수치를 그대로 연결!
    let marginAmt = null;
    let marginRate = null;

    if (colIdx.marginAmt !== -1 && r[colIdx.marginAmt] !== undefined && r[colIdx.marginAmt] !== null) {
      const rawVal = String(r[colIdx.marginAmt]).trim();
      if (rawVal !== '' && rawVal !== '-') {
        const cleanVal = rawVal.replace(/[^0-9.-]+/g, "");
        const parsed = parseFloat(cleanVal);
        if (!isNaN(parsed)) {
          marginAmt = parsed;
        }
      }
    }

    if (colIdx.marginRate !== -1 && r[colIdx.marginRate] !== undefined && r[colIdx.marginRate] !== null) {
      const rawVal = String(r[colIdx.marginRate]).trim();
      if (rawVal !== '' && rawVal !== '-') {
        const cleanVal = rawVal.replace(/[^0-9.-]+/g, "");
        let parsed = parseFloat(cleanVal);
        if (!isNaN(parsed)) {
          // 엑셀에서 0.155처럼 소수로 서식 지정된 백분율인 경우 (15.5%)
          if (parsed > 0 && parsed < 1 && !rawVal.includes('%')) {
            parsed = Math.round(parsed * 1000) / 10;
          }
          marginRate = parsed;
        }
      }
    }

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
      sourcingType,
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
      inventoryUnitCost,
      marginAmt,
      marginRate
    });
  }

  // 이번 업로드 주문 데이터로 갱신 (실데이터 모드 ⭐)
  AppState.rawOrders = orders;
  AppState.ordersCurrentPage = 1;
  saveStateToStorage();
  renderBusinessSwitcher();
  populateBusinessSelects();
  populateSelectFilters();
  renderAll();

  // 사용자 안내 알림
  const countableCount = orders.filter(o => o.orderStage === '완료' && o.purchaseStage === '완료').length;
  alert(`🎉 파일 [${fileName}] 업로드가 완료되었습니다!\n총 ${orders.length}건 중 실적 집계 대상: ${countableCount}건이 등록되었습니다.`);
  switchNav('ordersView');
}

/**
 * CSV 텍스트 파싱 후 processOrderRows 연계 (하위 호환성 유지)
 */
function parseCSVOrders(csvText) {
  const rows = parseCSV(csvText);
  processOrderRows(rows, 'CSV 가져오기');
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
    totalProfit += getOrderMarginAmt(o);
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
    const profit = getOrderMarginAmt(o);

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

  const totalItems = list.length;
  const pageSize = (AppState.ordersPageSize === 'ALL') ? totalItems : (parseInt(AppState.ordersPageSize, 10) || 10);
  const totalPages = (pageSize > 0 && totalItems > 0) ? Math.ceil(totalItems / pageSize) : 1;

  if (AppState.ordersCurrentPage > totalPages) {
    AppState.ordersCurrentPage = Math.max(1, totalPages);
  }
  if (AppState.ordersCurrentPage < 1) {
    AppState.ordersCurrentPage = 1;
  }

  // 상단 페이지당 건수 셀렉트 동기화
  const sizeSelect = document.getElementById('ordersPageSizeSelect');
  if (sizeSelect && sizeSelect.value !== String(AppState.ordersPageSize)) {
    sizeSelect.value = String(AppState.ordersPageSize);
  }

  if (totalItems === 0) {
    tbody.innerHTML = '<tr><td colspan="17" style="text-align:center;padding:40px;color:#94a3b8;">조건에 일치하는 주문 내역이 없습니다.</td></tr>';
    updateSelectedOrdersBadge();
    renderOrdersPagination(0, 0, 0, 1, 1);
    renderOrdersDailyTable();
    renderOrdersMonthlyTable();
    return;
  }

  let startIdx = 0;
  let endIdx = totalItems;
  let pageItems = list;

  if (AppState.ordersPageSize !== 'ALL' && totalItems > 0) {
    startIdx = (AppState.ordersCurrentPage - 1) * pageSize;
    endIdx = Math.min(startIdx + pageSize, totalItems);
    pageItems = list.slice(startIdx, endIdx);
  }

  let html = '';

  pageItems.forEach(o => {
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
    // ⭐ 마진금액과 마진률: 업로드 파일 수치 그대로 연결 (직접 계산 대신 파일 우선 반영)
    const marginAmt = getOrderMarginAmt(o);
    const marginPct = getOrderMarginRate(o);

    const isCounted = isOrderCountable(o);

    html += `
      <tr class="${isCounted ? '' : 'row-dimmed'}">
        <!-- 0. 선택 체크박스 -->
        <td style="text-align:center;">
          <input type="checkbox" class="order-select-chk" value="${escapeHtml(o.orderNo)}" onchange="updateSelectedOrdersBadge()" style="width:15px;height:15px;cursor:pointer;">
        </td>

        <!-- 1. 사업자 (원클릭 인라인 변경 드롭다운 ⭐) -->
        <td>
          <select class="order-biz-inline-select" onchange="quickUpdateOrderBiz('${escapeHtml(o.orderNo)}', this.value)" style="background:${getBizBadgeStyle(o.biz).bg};color:${getBizBadgeStyle(o.biz).color};">
            ${(AppState.businesses || []).map(b => `<option value="${escapeHtml(b.name)}" ${o.biz === b.name ? 'selected' : ''}>${escapeHtml(b.name)}</option>`).join('')}
          </select>
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

        <!-- 4. 고객명 (상품명 앞으로 이동 & 가로폭 축소 ⭐) -->
        <td style="width:65px;max-width:75px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${isPurchaseOnly ? '-' : (o.recipient || '-')}">
          <span style="font-weight:600;color:#334155;font-size:12px;">${isPurchaseOnly ? '-' : (o.recipient || '-')}</span>
        </td>

        <!-- 5. 상품명 / 옵션 -->
        <td style="max-width:220px;">
          <div style="font-weight:600;color:#1e293b;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;" title="${o.productName}">${o.productName}</div>
          ${o.option ? `<div style="font-size:11px;color:#64748b;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;">${o.option}</div>` : ''}
        </td>

        <!-- 6. 수량 -->
        <td style="width:45px;text-align:center;">
          <strong>${o.qty}</strong>
        </td>

        <!-- 7. 판매가(배송비포함) -->
        <td style="text-align:right;">
          <strong style="font-size:13px;color:#1e293b;">${isPurchaseOnly ? '-' : formatKRW(o.totalSales)}</strong>
        </td>

        <!-- 8. 정산가 (정산예정가와 통합 & 직접 가격 변경 가능 ⭐) -->
        <td style="text-align:right;">
          ${isPurchaseOnly ? '-' : `
            <input type="text" class="input-settlement" 
                   value="${formatKRW(o.actualSettlement > 0 ? o.actualSettlement : (o.standardPrice || o.totalSales))}" 
                   title="정산가를 클릭하여 변경할 수 있습니다"
                   style="width:85px;text-align:right;font-weight:700;color:#1e40af;border:1px solid #bfdbfe;background:#f8fafc;padding:3px 6px;border-radius:5px;font-size:12.5px;"
                   onfocus="this.select()"
                   oninput="formatSettlementInput(this)"
                   onchange="updateActualSettlement(${rawIdx}, this.value)">
          `}
        </td>

        <!-- 9. 주문구분 (사입입고 삭제! 대기/완료/취소/반품/교환만 관리 ⭐) -->
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

        <!-- 10. 매입유형 (사입은 오직 여기서 관리! ⭐) -->
        <td style="text-align:center;">
          <select class="select-stage ${o.sourcingType==='사입'?'stage-waiting':'stage-completed'}" 
                  onchange="updateSourcingType(${rawIdx}, this.value)">
            <option value="위탁" ${o.sourcingType==='위탁'?'selected':''}>위탁</option>
            <option value="사입" ${o.sourcingType==='사입'?'selected':''}>사입</option>
          </select>
        </td>

        <!-- 11. 소싱처 / 공급사 (소싱처 수기 등록 확인 ⭐) -->
        <td>
          <div style="font-weight:600;color:#1e293b;">${o.sourcingPlatform || '-'}</div>
          <div style="font-size:11px;color:#64748b;">${o.supplierName || o.supplierBiz || '-'}</div>
        </td>

        <!-- 12. 결제카드 / 카드명의 (가로폭 축소 ⭐) -->
        <td style="width:90px;max-width:105px;line-height:1.25;">
          <div style="font-size:12px;font-weight:600;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${o.paymentCard || '-'}">${o.paymentCard || '-'}</div>
          <div style="font-size:10.5px;color:#4f46e5;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${o.cardHolder || '명의미지정'}">${o.cardHolder || '미지정'}</div>
        </td>

        <!-- 13. 매입가 (순수 상품 매입가만 깔끔하게 표시! 사입 택배비는 표시 안 함 ⭐) -->
        <td style="text-align:right;">
          <strong class="text-danger">${productCost > 0 ? formatKRW(productCost) : '-'}</strong>
          ${(o.sourcingType === '위탁' && (o.point > 0 || o.pointUsed > 0)) ? `
            <div style="font-size:11px;color:#d97706;font-weight:600;margin-top:2px;" title="소싱 시 사용된 포인트">
              (포인트 ${formatKRW(o.point || o.pointUsed)})
            </div>
          ` : ''}
        </td>

        <!-- 14. 마진금액 (업로드 파일 수치 연결 ⭐) -->
        <td style="text-align:right;">
          ${isPurchaseOnly ? '<span style="color:#94a3b8;font-size:11px;">(사입재고)</span>' : `
            <strong class="${marginAmt >= 0 ? 'text-success' : 'text-danger'}" style="font-size:12.5px;">
              ${formatKRW(marginAmt)}
            </strong>
          `}
        </td>

        <!-- 15. 마진율 (업로드 파일 수치 연결 ⭐) -->
        <td style="text-align:center;">
          ${isPurchaseOnly ? '-' : `
            <span class="badge" style="background:${marginPct >= 15 ? '#ecfdf5' : (marginPct < 0 ? '#fef2f2' : '#f1f5f9')};color:${marginPct >= 15 ? '#059669' : (marginPct < 0 ? '#dc2626' : '#475569')};font-weight:700;">
              ${marginPct.toFixed(1)}%
            </span>
          `}
        </td>

        <!-- 16. 관리 -->
        <td style="text-align:center;">
          <button class="btn-action-icon" onclick="openOrderModal(${rawIdx})" title="주문 수정">✏️</button>
          <button class="btn-action-icon delete" onclick="deleteOrder(${rawIdx})" title="주문 삭제">🗑️</button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  updateSelectedOrdersBadge();

  // ⭐ 페이지네이션 컨트롤 바 렌더링
  renderOrdersPagination(totalItems, startIdx, endIdx, totalPages, AppState.ordersCurrentPage);

  // 일별 및 월별 집계표도 함께 동기화 갱신 ⭐
  renderOrdersDailyTable();
  renderOrdersMonthlyTable();
}

/**
 * 📄 매입·매출 주문장 페이지네이션 UI 렌더링
 */
function renderOrdersPagination(totalItems, startIdx, endIdx, totalPages, currentPage) {
  const container = document.getElementById('ordersPaginationContainer');
  const infoEl = document.getElementById('ordersPaginationInfo');
  const navEl = document.getElementById('ordersPaginationNav');
  if (!container || !infoEl || !navEl) return;

  if (totalItems === 0) {
    infoEl.innerHTML = `<span>총 <strong>0</strong>건의 주문이 있습니다.</span>`;
    navEl.innerHTML = '';
    return;
  }

  // 1. 정보 텍스트 (총 N건 중 A~B건 표시)
  if (AppState.ordersPageSize === 'ALL') {
    infoEl.innerHTML = `
      <span>총 <strong>${formatNumber(totalItems)}</strong>건의 주문이 전체 표시 중입니다.</span>
    `;
  } else {
    infoEl.innerHTML = `
      <span>총 <strong>${formatNumber(totalItems)}</strong>건 중 <strong>${formatNumber(startIdx + 1)} ~ ${formatNumber(endIdx)}</strong>건 표시</span>
      <span style="color:#cbd5e1;margin:0 4px;">|</span>
      <span>페이지 <strong>${currentPage}</strong> / ${totalPages}</span>
    `;
  }

  // 2. 단일 페이지거나 전체 보기일 때는 이동 버튼 숨김
  if (totalPages <= 1 || AppState.ordersPageSize === 'ALL') {
    navEl.innerHTML = '';
    return;
  }

  let buttonsHtml = '';

  // 1) 처음으로
  const isFirst = (currentPage <= 1);
  buttonsHtml += `
    <button type="button" class="pagination-btn pagination-btn-arrow" 
            onclick="goToOrdersPage(1)" ${isFirst ? 'disabled' : ''} title="첫 페이지로 이동">
      ⏮ 처음
    </button>
  `;

  // 2) 이전
  buttonsHtml += `
    <button type="button" class="pagination-btn pagination-btn-arrow" 
            onclick="goToOrdersPage(${currentPage - 1})" ${isFirst ? 'disabled' : ''} title="이전 페이지">
      ◀ 이전
    </button>
  `;

  // 3) 페이지 번호 버튼들 (최대 5개 노출)
  const maxButtons = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
  let endPage = startPage + maxButtons - 1;
  if (endPage > totalPages) {
    endPage = totalPages;
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  if (startPage > 1) {
    buttonsHtml += `<button type="button" class="pagination-btn" onclick="goToOrdersPage(1)">1</button>`;
    if (startPage > 2) {
      buttonsHtml += `<span style="padding:0 3px;color:#94a3b8;font-size:12px;">…</span>`;
    }
  }

  for (let p = startPage; p <= endPage; p++) {
    const isActive = (p === currentPage);
    buttonsHtml += `
      <button type="button" class="pagination-btn ${isActive ? 'active' : ''}" 
              onclick="goToOrdersPage(${p})">
        ${p}
      </button>
    `;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      buttonsHtml += `<span style="padding:0 3px;color:#94a3b8;font-size:12px;">…</span>`;
    }
    buttonsHtml += `<button type="button" class="pagination-btn" onclick="goToOrdersPage(${totalPages})">${totalPages}</button>`;
  }

  // 4) 다음
  const isLast = (currentPage >= totalPages);
  buttonsHtml += `
    <button type="button" class="pagination-btn pagination-btn-arrow" 
            onclick="goToOrdersPage(${currentPage + 1})" ${isLast ? 'disabled' : ''} title="다음 페이지">
      다음 ▶
    </button>
  `;

  // 5) 마지막으로
  buttonsHtml += `
    <button type="button" class="pagination-btn pagination-btn-arrow" 
            onclick="goToOrdersPage(${totalPages})" ${isLast ? 'disabled' : ''} title="마지막 페이지로 이동">
      끝 ⏭
    </button>
  `;

  navEl.innerHTML = buttonsHtml;
}

/**
 * 📄 특정 페이지로 이동
 */
function goToOrdersPage(page) {
  AppState.ordersCurrentPage = page;
  renderOrdersTable();
  const table = document.getElementById('ordersTable');
  if (table) {
    table.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/**
 * 📄 한 페이지당 표시할 건수 변경 (10건, 20건, 50건, 100건, ALL)
 */
function changeOrdersPageSize(size) {
  AppState.ordersPageSize = (size === 'ALL') ? 'ALL' : (parseInt(size, 10) || 10);
  AppState.ordersCurrentPage = 1;
  saveStateToStorage();
  renderOrdersTable();
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
    const mAmount = Math.round(getOrderMarginAmt(o));

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
    const mAmount = Math.round(getOrderMarginAmt(o));

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
    AppState.ordersCurrentPage = 1;
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

/**
 * 💳 비용 결제수단이 카드인 경우 매칭되는 카드 설정 및 카드키 반환
 */
function matchExpenseCard(exp) {
  const method = (exp.paymentMethod || '').trim();
  if (!method) return null;

  // 1. 등록된 카드 세팅과 직접 일치 (카드명 또는 '카드명 (명의자)')
  for (const s of (AppState.cardSettings || [])) {
    const cardKey = s.holder ? `${s.name} (${s.holder})` : s.name;
    if (method === cardKey || method === s.name) {
      return { setting: s, cardKey };
    }
  }

  // 2. 부분 일치 검색 (예: '국민' -> 국민카드, '삼성' -> 삼성카드, '신한' -> 신한카드, '우리' -> 우리카드, '스마일' -> 스마일카드)
  for (const s of (AppState.cardSettings || [])) {
    if (method.includes(s.name) || s.name.includes(method)) {
      const cardKey = s.holder ? `${s.name} (${s.holder})` : s.name;
      return { setting: s, cardKey };
    }
  }

  // 3. '카드'라는 단어가 포함된 경우 (예: '신용카드', '법인카드', '카드')
  if (method.includes('카드') || method.toLowerCase().includes('card')) {
    const s = (AppState.cardSettings || [])[0];
    if (s) {
      const cardKey = s.holder ? `${s.name} (${s.holder})` : s.name;
      return { setting: s, cardKey };
    }
  }

  return null;
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

  // ⭐ 2-B. 비용(지출 장부) 중 결제수단이 카드인 항목 집계 및 카드 잔액/결제예정에 반영!
  const cardExpenses = [];
  (AppState.customExpenses || []).forEach(exp => {
    const bizOk = (AppState.currentBizFilter === 'ALL' || exp.biz === 'ALL' || exp.biz === AppState.currentBizFilter);
    if (!bizOk) return;

    const matched = matchExpenseCard(exp);
    if (matched && exp.amount > 0) {
      const cardKey = matched.cardKey;
      if (!cardMap[cardKey]) {
        const s = matched.setting;
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
      }

      const entry = cardMap[cardKey];
      entry.total += exp.amount;
      entry.count += 1;
      entry.platforms.add(`비용(${exp.category})`);

      const split = calcCardBillingSplit(exp.date || exp.month, entry);
      if (split === 'CURRENT') {
        entry.currentDue += exp.amount;
      } else {
        entry.nextDue += exp.amount;
      }

      cardExpenses.push({
        isExpense: true,
        id: exp.id,
        paymentCard: matched.setting.name,
        cardHolder: matched.setting.holder,
        cardKey: cardKey,
        split: split,
        sourcingPlatform: `💸 비용(${exp.category})`,
        productName: `[${exp.category}] ${exp.title}`,
        paymentDate: exp.date || exp.month,
        purchaseCost: exp.amount,
        sourcingOrderNo: exp.paymentMethod || '카드결제',
        supplierName: exp.biz || '공통',
        note: exp.note || ''
      });
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

            <!-- 당월 / 다음월 결제예정금액 분리 박스 (주문원가 + 카드비용 모두 반영) -->
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

  // 4. 하단 결제 내역 테이블 렌더링 (주문 결제 + 비용 카드결제 통합)
  if (tbody) {
    let combinedTx = [];

    // 주문 결제 항목 추가
    allOrders.filter(o => o.purchaseCost > 0 && o.paymentCard).forEach(o => {
      const k = o.cardHolder ? `${o.paymentCard} (${o.cardHolder})` : o.paymentCard;
      const cSetting = cardMap[k];
      const split = calcCardBillingSplit(o.paymentDate || o.orderDate, cSetting);
      combinedTx.push({
        isExpense: false,
        paymentCard: o.paymentCard,
        cardHolder: o.cardHolder,
        cardKey: k,
        split: split,
        sourcingPlatform: o.sourcingPlatform || '-',
        productName: o.productName,
        paymentDate: o.paymentDate || o.orderDate,
        purchaseCost: o.purchaseCost,
        sourcingOrderNo: o.sourcingOrderNo || '-',
        supplierName: o.supplierName || o.supplierBiz || '-'
      });
    });

    // 비용 카드결제 항목 추가
    cardExpenses.forEach(ce => {
      combinedTx.push(ce);
    });

    // 날짜 최신순 정렬
    combinedTx.sort((a, b) => {
      const dateA = a.paymentDate || '';
      const dateB = b.paymentDate || '';
      return dateB.localeCompare(dateA);
    });

    // 선택된 카드 필터
    if (AppState.selectedCardKey) {
      combinedTx = combinedTx.filter(t => t.cardKey === AppState.selectedCardKey);
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
      combinedTx = combinedTx.filter(t => t.split === AppState.selectedCardTxTab);
    }

    if (combinedTx.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:#94a3b8;">해당 조건의 결제 내역이 없습니다.</td></tr>';
    } else {
      tbody.innerHTML = combinedTx.map(t => {
        const platformBadge = t.isExpense
          ? `<span class="badge" style="background:#fee2e2;color:#991b1b;font-weight:700;">${escapeHtml(t.sourcingPlatform)}</span>`
          : escapeHtml(t.sourcingPlatform || '-');

        const nameDisplay = t.isExpense
          ? `<strong style="color:#1e3a8a;">${escapeHtml(t.productName)}</strong>${t.note ? `<div style="font-size:11px;color:#64748b;">📝 ${escapeHtml(t.note)}</div>` : ''}`
          : `<span title="${escapeHtml(t.productName)}">${escapeHtml(t.productName)}</span>`;

        return `
          <tr style="${t.isExpense ? 'background:#fffaf0;' : ''}">
            <td>
              <strong>${escapeHtml(t.paymentCard)}</strong>
              <div style="font-size:11px;color:#4f46e5;font-weight:700;">명의자: ${escapeHtml(t.cardHolder || '명의미지정')}</div>
            </td>
            <td style="text-align:center;">
              <span class="badge" style="background:${t.split === 'CURRENT' ? '#ecfdf5;color:#059669;border:1px solid #a7f3d0;' : '#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;'}font-weight:700;font-size:11px;">
                ${t.split === 'CURRENT' ? '🟢 당월 청구' : '🔵 다음월 청구'}
              </span>
            </td>
            <td>${platformBadge}</td>
            <td style="max-width:260px;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;">
              ${nameDisplay}
            </td>
            <td>${formatOrderDateOnly(t.paymentDate)}</td>
            <td style="text-align:right;"><strong class="text-danger">${formatKRW(t.purchaseCost)}</strong></td>
            <td style="font-size:12px;">${escapeHtml(t.sourcingOrderNo || '-')}</td>
            <td>${escapeHtml(t.supplierName || '-')}</td>
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
 * =========================================================
 * 🏢 사업자 이름 등록 및 관리 기능 (Business Management)
 * =========================================================
 */
function openBusinessModal() {
  resetBusinessForm();
  renderBusinessTable();
  const overlay = document.getElementById('businessModalOverlay');
  if (overlay) overlay.style.display = 'flex';
  if (window.feather) feather.replace();
}

function closeBusinessModal() {
  const overlay = document.getElementById('businessModalOverlay');
  if (overlay) overlay.style.display = 'none';
}

function resetBusinessForm() {
  const idEl = document.getElementById('formBizId');
  const origEl = document.getElementById('formBizOriginalName');
  const nameEl = document.getElementById('formBizName');
  const ownerEl = document.getElementById('formBizOwner');
  const regNumEl = document.getElementById('formBizRegNum');
  const descEl = document.getElementById('formBizDesc');
  const titleEl = document.getElementById('businessFormTitle');

  if (idEl) idEl.value = '';
  if (origEl) origEl.value = '';
  if (nameEl) nameEl.value = '';
  if (ownerEl) ownerEl.value = '';
  if (regNumEl) regNumEl.value = '';
  if (descEl) descEl.value = '';
  if (titleEl) titleEl.textContent = '+ 새 사업자 등록하기';
}

function editBusiness(id) {
  const biz = (AppState.businesses || []).find(b => b.id === id);
  if (!biz) return;

  const idEl = document.getElementById('formBizId');
  const origEl = document.getElementById('formBizOriginalName');
  const nameEl = document.getElementById('formBizName');
  const ownerEl = document.getElementById('formBizOwner');
  const regNumEl = document.getElementById('formBizRegNum');
  const descEl = document.getElementById('formBizDesc');
  const titleEl = document.getElementById('businessFormTitle');

  if (idEl) idEl.value = biz.id;
  if (origEl) origEl.value = biz.name;
  if (nameEl) nameEl.value = biz.name;
  if (ownerEl) ownerEl.value = biz.owner || '';
  if (regNumEl) regNumEl.value = biz.regNum || '';
  if (descEl) descEl.value = biz.desc || '';
  if (titleEl) titleEl.textContent = `✏️ '${biz.name}' 사업자 정보 수정`;

  if (nameEl) nameEl.focus();
}

function saveBusiness() {
  const id = (document.getElementById('formBizId').value || '').trim();
  const originalName = (document.getElementById('formBizOriginalName').value || '').trim();
  const name = (document.getElementById('formBizName').value || '').trim();
  const owner = (document.getElementById('formBizOwner').value || '').trim();
  const regNum = (document.getElementById('formBizRegNum').value || '').trim();
  const desc = (document.getElementById('formBizDesc').value || '').trim();

  if (!name) {
    alert('사업자 이름을 입력해 주세요!');
    const nameEl = document.getElementById('formBizName');
    if (nameEl) nameEl.focus();
    return;
  }

  if (name.toUpperCase() === 'ALL' || name === '통합' || name === '전체') {
    alert('"통합" 또는 "ALL"은 전체 조회를 위한 예약어이므로 사업자 이름으로 사용할 수 없습니다.');
    return;
  }

  if (!AppState.businesses) AppState.businesses = [];

  // 중복 검사 (자기 자신 수정은 허용)
  const isDuplicate = AppState.businesses.some(b => b.name === name && b.id !== id);
  if (isDuplicate) {
    alert(`'${name}' 이름의 사업자가 이미 등록되어 있습니다.`);
    return;
  }

  if (id) {
    // ✏️ 기존 사업자 수정
    const biz = AppState.businesses.find(b => b.id === id);
    if (biz) {
      biz.name = name;
      biz.owner = owner;
      biz.regNum = regNum;
      biz.desc = desc;

      // 이름이 변경된 경우, 기존 데이터(주문, 통장, 지출, 자산)의 사업자명도 자동 동기화!
      if (originalName && originalName !== name) {
        let updatedOrders = 0;
        (AppState.rawOrders || []).forEach(o => {
          if (o.biz === originalName) {
            o.biz = name;
            updatedOrders++;
          }
        });
        (AppState.bankAccounts || []).forEach(b => {
          if (b.biz === originalName) b.biz = name;
        });
        (AppState.customExpenses || []).forEach(e => {
          if (e.biz === originalName) e.biz = name;
        });
        (AppState.customAssets || []).forEach(a => {
          if (a.biz === originalName) a.biz = name;
        });
        if (AppState.currentBizFilter === originalName) {
          AppState.currentBizFilter = name;
        }
      }
    }
  } else {
    // ➕ 신규 사업자 등록
    const newBiz = {
      id: 'biz_' + Date.now(),
      name,
      owner,
      regNum,
      desc
    };
    AppState.businesses.push(newBiz);
  }

  saveStateToStorage();
  resetBusinessForm();
  renderBusinessTable();
  renderBusinessSwitcher();
  populateBusinessSelects();
  renderAll();

  alert(`사업자 '${name}'이(가) 성공적으로 저장되었습니다!`);
}

function deleteBusiness(id) {
  const biz = (AppState.businesses || []).find(b => b.id === id);
  if (!biz) return;

  if (AppState.businesses.length <= 1) {
    alert('최소 1개 이상의 사업자가 등록되어 있어야 합니다.');
    return;
  }

  // 연결된 주문 및 통장 확인
  const orderCount = (AppState.rawOrders || []).filter(o => o.biz === biz.name).length;
  const bankCount = (AppState.bankAccounts || []).filter(b => b.biz === biz.name).length;

  let msg = `'${biz.name}' 사업자를 정말 삭제하시겠습니까?`;
  if (orderCount > 0 || bankCount > 0) {
    msg = `⚠️ 주의: '${biz.name}' 사업자 이름으로 등록된 주문 ${orderCount}건, 통장 ${bankCount}개가 있습니다.\n정말 삭제하시겠습니까?`;
  }

  if (!confirm(msg)) return;

  AppState.businesses = AppState.businesses.filter(b => b.id !== id);
  if (AppState.currentBizFilter === biz.name) {
    AppState.currentBizFilter = 'ALL';
  }

  saveStateToStorage();
  resetBusinessForm();
  renderBusinessTable();
  renderBusinessSwitcher();
  populateBusinessSelects();
  renderAll();
}

function renderBusinessTable() {
  const tbody = document.getElementById('businessTableBody');
  const countBadge = document.getElementById('businessCountBadge');
  if (!tbody) return;

  const list = AppState.businesses || [];
  if (countBadge) countBadge.textContent = list.length;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:#94a3b8;">등록된 사업자가 없습니다. 위 입력창에서 등록해 주세요.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(b => {
    const badgeStyle = getBizBadgeStyle(b.name);
    const orderCount = (AppState.rawOrders || []).filter(o => o.biz === b.name).length;
    const bankCount = (AppState.bankAccounts || []).filter(b2 => b2.biz === b.name).length;

    return `
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:10px 12px;font-weight:700;">
          <span class="badge" style="background:${badgeStyle.bg};color:${badgeStyle.color};padding:4px 10px;font-size:12px;border-radius:6px;">
            ${escapeHtml(b.name)}
          </span>
        </td>
        <td style="padding:10px 12px;color:#475569;">
          ${escapeHtml(b.owner || '-')}
        </td>
        <td style="padding:10px 12px;color:#64748b;font-size:12px;">
          <div>${escapeHtml(b.regNum || '')}</div>
          <div style="color:#94a3b8;">${escapeHtml(b.desc || '')}</div>
        </td>
        <td style="padding:10px 12px;text-align:center;font-size:12px;color:#334155;">
          주문 <b style="color:#2563eb;">${orderCount}</b>건 / 통장 <b style="color:#059669;">${bankCount}</b>개
        </td>
        <td style="padding:10px 12px;text-align:center;">
          <button type="button" class="btn btn-xs btn-secondary" onclick="editBusiness('${b.id}')" style="padding:3px 8px;font-size:11px;margin-right:4px;">
            ✏️ 수정
          </button>
          <button type="button" class="btn btn-xs btn-danger" onclick="deleteBusiness('${b.id}')" style="padding:3px 8px;font-size:11px;background:#fee2e2;color:#b91c1c;border:none;border-radius:4px;cursor:pointer;">
            🗑️ 삭제
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * =========================================================
 * 🏢 사업자(아커만/제니틱스) 인라인 즉시 변경, 일괄 배정 및 자동 분류 규칙 엔진
 * =========================================================
 */

/**
 * 주문의 사업자 원클릭 즉시 변경 (테이블 행 인라인 드롭다운 변경 시)
 */
function quickUpdateOrderBiz(orderNo, newBiz) {
  const target = (AppState.rawOrders || []).find(o => String(o.orderNo) === String(orderNo));
  if (!target) return;
  target.biz = newBiz;
  saveStateToStorage();

  // 손익계산서 및 테이블 동기화
  calculatePL();
  if (AppState.currentBizFilter !== 'ALL') {
    renderAll();
  } else {
    renderOrdersTable();
    renderDashboard();
    renderSettlementView();
  }
  showQuickToast(`✅ 주문 [#${orderNo}] 사업자가 '${newBiz}'(으)로 즉시 변경되었습니다!`);
}

/**
 * 주문 전체 선택 / 해제 토글
 */
function toggleSelectAllOrders(checked) {
  const chks = document.querySelectorAll('.order-select-chk');
  chks.forEach(chk => { chk.checked = checked; });
  updateSelectedOrdersBadge();
}

/**
 * 선택된 주문 개수 배지 및 전체선택 체크박스 상태 업데이트
 */
function updateSelectedOrdersBadge() {
  const chks = document.querySelectorAll('.order-select-chk:checked');
  const count = chks.length;
  const countText = document.getElementById('selectedOrdersCountText');
  if (countText) {
    countText.textContent = `(${count}건 선택됨)`;
    countText.style.color = count > 0 ? '#2563eb' : '#64748b';
    countText.style.fontWeight = count > 0 ? '700' : '600';
  }
  const selectAll = document.getElementById('orderSelectAll');
  const totalChks = document.querySelectorAll('.order-select-chk');
  if (selectAll && totalChks.length > 0) {
    selectAll.checked = (count === totalChks.length);
  }
}

/**
 * 체크박스로 선택한 주문들 사업자 일괄 변경
 */
function batchAssignOrdersBiz() {
  const chks = document.querySelectorAll('.order-select-chk:checked');
  if (chks.length === 0) {
    alert('사업자를 일괄 변경할 주문을 체크박스로 먼저 선택해주세요, 리사님! 😊');
    return;
  }
  const targetSelect = document.getElementById('batchTargetBizSelect');
  const targetBiz = targetSelect ? targetSelect.value : (AppState.businesses[0]?.name || '아커만');

  const selectedOrderNos = new Set(Array.from(chks).map(c => String(c.value)));
  let updatedCount = 0;
  (AppState.rawOrders || []).forEach(o => {
    if (selectedOrderNos.has(String(o.orderNo))) {
      o.biz = targetBiz;
      updatedCount++;
    }
  });

  saveStateToStorage();
  renderOrdersTable();
  calculatePL();
  if (AppState.currentBizFilter !== 'ALL') {
    renderAll();
  } else {
    renderDashboard();
    renderSettlementView();
  }
  updateSelectedOrdersBadge();
  alert(`🎉 선택하신 주문 ${updatedCount}건이 '${targetBiz}' 사업자로 쏙 일괄 변경되었습니다, 리사님! ✨`);
}

/**
 * ⚙️ 사업자 자동 분류 규칙 엔진 (마켓명, 판매자ID/계정, 상품명 등 매칭)
 */
function matchBizForOrder(orderData) {
  const rules = AppState.bizMappingRules || [];
  for (const rule of rules) {
    const fieldVal = (
      rule.field === 'market' ? (orderData.market || '') :
      rule.field === 'sellerId' ? (orderData.biz || orderData.sellerId || '') :
      rule.field === 'productName' ? (orderData.productName || '') :
      rule.field === 'paymentCard' ? (orderData.paymentCard || '') :
      ''
    ).toLowerCase();

    const targetVal = (rule.value || '').trim().toLowerCase();
    if (!targetVal) continue;

    if (fieldVal.includes(targetVal)) {
      return rule.targetBiz;
    }
  }
  return null;
}

/**
 * 사업자 자동 분류 규칙 모달 열기
 */
function openBizMappingRulesModal() {
  populateBusinessSelects();
  renderBizRulesTable();
  const overlay = document.getElementById('bizRulesModalOverlay');
  if (overlay) overlay.style.display = 'flex';
  if (window.feather) feather.replace();
}

/**
 * 사업자 자동 분류 규칙 모달 닫기
 */
function closeBizMappingRulesModal() {
  const overlay = document.getElementById('bizRulesModalOverlay');
  if (overlay) overlay.style.display = 'none';
}

/**
 * 사업자 자동 분류 규칙 테이블 렌더링
 */
function renderBizRulesTable() {
  const tbody = document.getElementById('bizRulesTableBody');
  const countBadge = document.getElementById('bizRulesCountBadge');
  if (!tbody) return;

  const rules = AppState.bizMappingRules || [];
  if (countBadge) countBadge.textContent = rules.length;

  if (rules.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:#94a3b8;">설정된 자동 분류 규칙이 없습니다. 위에서 새 규칙을 추가해 보세요.</td></tr>`;
    return;
  }

  const fieldLabels = {
    market: '판매사이트 (마켓명)',
    sellerId: '판매자ID / 스토어명',
    productName: '상품명 키워드',
    paymentCard: '결제카드명'
  };

  tbody.innerHTML = rules.map(rule => {
    const badgeStyle = getBizBadgeStyle(rule.targetBiz);
    return `
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:9px 12px;font-weight:600;color:#334155;">
          ${fieldLabels[rule.field] || rule.field}
        </td>
        <td style="padding:9px 12px;font-weight:700;color:#1e293b;">
          "${escapeHtml(rule.value)}" 단어 포함
        </td>
        <td style="padding:9px 12px;">
          <span class="badge" style="background:${badgeStyle.bg};color:${badgeStyle.color};padding:3px 8px;font-size:11.5px;font-weight:700;border-radius:6px;">
            ${escapeHtml(rule.targetBiz)}
          </span>
        </td>
        <td style="padding:9px 12px;text-align:center;">
          <button type="button" class="btn btn-xs btn-danger" onclick="deleteBizRule('${rule.id}')" style="padding:2px 8px;font-size:11px;background:#fee2e2;color:#b91c1c;border:none;border-radius:4px;cursor:pointer;">
            삭제
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * 새 자동 분류 규칙 등록
 */
function addNewBizRule() {
  const field = document.getElementById('newRuleField').value;
  const valueInput = document.getElementById('newRuleValue');
  const targetBizSelect = document.getElementById('newRuleTargetBiz');

  const value = valueInput ? valueInput.value.trim() : '';
  const targetBiz = targetBizSelect ? targetBizSelect.value : (AppState.businesses[0]?.name || '아커만');

  if (!value) {
    alert('포함될 검색어 키워드를 입력해 주세요, 리사님! (예: 스마트스토어, 쿠팡 등)');
    if (valueInput) valueInput.focus();
    return;
  }

  if (!AppState.bizMappingRules) AppState.bizMappingRules = [];
  AppState.bizMappingRules.push({
    id: 'rule_' + Date.now(),
    field,
    operator: 'contains',
    value,
    targetBiz
  });

  saveStateToStorage();
  if (valueInput) valueInput.value = '';
  renderBizRulesTable();
  showQuickToast(`✅ 새 자동 분류 규칙("${value}" ➔ ${targetBiz})이 등록되었습니다!`);
}

/**
 * 자동 분류 규칙 삭제
 */
function deleteBizRule(id) {
  if (!confirm('이 자동 분류 규칙을 삭제하시겠습니까?')) return;
  AppState.bizMappingRules = (AppState.bizMappingRules || []).filter(r => r.id !== id);
  saveStateToStorage();
  renderBizRulesTable();
}

/**
 * 추천 기본 규칙으로 재설정
 */
function resetDefaultBizRules() {
  if (!confirm('추천 기본 분류 규칙(스마트스토어/올웨이즈 ➔ 아커만, 쿠팡/11번가 ➔ 제니틱스)으로 재설정하시겠습니까?')) return;
  AppState.bizMappingRules = [
    { id: 'rule_1', field: 'market', operator: 'contains', value: '스마트스토어', targetBiz: '아커만' },
    { id: 'rule_2', field: 'market', operator: 'contains', value: '쿠팡', targetBiz: '제니틱스' },
    { id: 'rule_3', field: 'market', operator: 'contains', value: '올웨이즈', targetBiz: '아커만' },
    { id: 'rule_4', field: 'market', operator: 'contains', value: '11번가', targetBiz: '제니틱스' }
  ];
  saveStateToStorage();
  renderBizRulesTable();
}

/**
 * 현재 등록된 전체 주문에 규칙 일괄 적용
 */
function applyBizRulesToAllOrders() {
  const rules = AppState.bizMappingRules || [];
  if (rules.length === 0) {
    alert('등록된 사업자 자동 분류 규칙이 없습니다. 먼저 규칙을 등록해 주세요.');
    return;
  }

  let ackermanCount = 0;
  let zeniticsCount = 0;
  let otherCount = 0;
  let matchedTotal = 0;

  (AppState.rawOrders || []).forEach(o => {
    const matchedBiz = matchBizForOrder(o);
    if (matchedBiz) {
      o.biz = matchedBiz;
      matchedTotal++;
      if (matchedBiz === '아커만') ackermanCount++;
      else if (matchedBiz === '제니틱스') zeniticsCount++;
      else otherCount++;
    }
  });

  saveStateToStorage();
  renderOrdersTable();
  calculatePL();
  if (AppState.currentBizFilter !== 'ALL') {
    renderAll();
  } else {
    renderDashboard();
    renderSettlementView();
  }

  let summaryMsg = `🎉 사업자 자동 분류 규칙이 성공적으로 적용되었습니다, 리사님!\n\n총 ${matchedTotal}건의 주문이 규칙에 따라 분류되었습니다:\n- 🏢 아커만: ${ackermanCount}건\n- 🏢 제니틱스: ${zeniticsCount}건`;
  if (otherCount > 0) summaryMsg += `\n- 기타 사업자: ${otherCount}건`;
  alert(summaryMsg);
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
 * 🏦 통장별 기초 이월금액 및 거래내역(입출금) 집계 통계
 */
function getBankAccountStats(bankId) {
  const bank = AppState.bankAccounts.find(b => b.id == bankId);
  if (!bank) return { initialBalance: 0, totalIn: 0, totalOut: 0, currentBalance: 0 };

  const initial = bank.initialBalance !== undefined ? Number(bank.initialBalance) : (Number(bank.balance) || 0);

  let totalIn = 0;
  let totalOut = 0;

  AppState.bankTransactions.forEach(tx => {
    if (String(tx.accountId) === String(bankId)) {
      const amt = Number(tx.amount) || 0;
      if (tx.type === '입금') {
        totalIn += amt;
      } else if (tx.type === '출금') {
        totalOut += amt;
      }
    }
  });

  const currentBalance = initial + totalIn - totalOut;
  return {
    initialBalance: initial,
    totalIn,
    totalOut,
    currentBalance
  };
}

/**
 * 모든 통장의 잔고를 (이월금액 + 입금 - 출금) 공식으로 실시간 일괄 동기화
 */
function recalculateAllBankBalances() {
  AppState.bankAccounts.forEach(b => {
    const stats = getBankAccountStats(b.id);
    b.balance = stats.currentBalance;
  });
}

/**
 * 4. 정산 미수금 & 통장 관리 (⭐ 통장 입출금 내역과 100% 실시간 연동!)
 */
function renderSettlementView() {
  // 모든 통장의 잔고를 이월금액과 거래내역 합산으로 실시간 동기화
  recalculateAllBankBalances();

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

  // 등록 통장 카드 목록 렌더링 (이월금액, 거래 입금/출금 합산 및 실시간 현재잔고 표시)
  const bankList = document.getElementById('bankAccountsList');
  if (bankList) {
    const displayBanks = AppState.bankAccounts;
    if (displayBanks.length === 0) {
      bankList.innerHTML = '<div style="padding:24px;text-align:center;color:#94a3b8;">등록된 통장이 없습니다. [+ 통장 등록] 버튼으로 추가해보세요!</div>';
    } else {
      bankList.innerHTML = displayBanks.map(b => {
        const stats = getBankAccountStats(b.id);
        const bStyle = getBizBadgeStyle(b.biz);

        return `
        <div class="bank-account-card" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.04);margin-bottom:10px;">
          <div>
            <div class="bank-name" style="font-weight:700;font-size:14px;color:#1e293b;display:flex;align-items:center;gap:6px;">
              <span>🏦 ${b.bankName || b.name}</span>
              <span class="badge" style="background:${bStyle.bg};color:${bStyle.color};font-size:11px;font-weight:700;">${escapeHtml(b.biz || '공통')}</span>
            </div>
            <div style="font-size:12.5px;color:#475569;margin-top:3px;font-weight:600;">${b.accountName || b.name}</div>
            <div class="bank-num" style="font-size:12px;color:#64748b;margin-top:2px;font-family:monospace;">${b.accountNum}</div>
            ${b.note ? `<div style="font-size:11px;color:#0d9488;margin-top:3px;">📝 ${b.note}</div>` : ''}
            <div style="font-size:11px;color:#64748b;margin-top:6px;display:flex;gap:10px;flex-wrap:wrap;background:#f8fafc;padding:4px 8px;border-radius:6px;border:1px solid #f1f5f9;">
              <span>이월(기초): <strong style="color:#1e293b;">${formatKRW(stats.initialBalance)}</strong></span>
              <span>입금: <strong style="color:#059669;">+${formatKRW(stats.totalIn)}</strong></span>
              <span>출금: <strong style="color:#dc2626;">-${formatKRW(stats.totalOut)}</strong></span>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;color:#64748b;font-weight:600;">현재 통장 잔고</div>
            <div class="bank-bal" style="font-size:17px;font-weight:800;color:#065f46;margin-top:1px;">${formatKRW(stats.currentBalance)}</div>
            <div style="margin-top:6px;display:flex;gap:4px;justify-content:flex-end;">
              <button class="btn btn-sm btn-secondary" onclick="openBankAccountModal(${b.id})" style="font-size:11px;padding:3px 8px;" title="이월금액 및 정보 수정">✏️ 이월금액/정보 수정</button>
              <button class="btn btn-sm btn-secondary" onclick="deleteBankAccount(${b.id})" style="font-size:11px;padding:3px 8px;color:#dc2626;">🗑️ 삭제</button>
            </div>
          </div>
        </div>
        `;
      }).join('');
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

  // ⚡ 엑셀식 실시간 바로입력 행 통장 목록 동기화
  const quickBank = document.getElementById('quickTxBankId');
  if (quickBank) {
    const curVal = quickBank.value;
    if (AppState.bankAccounts.length === 0) {
      quickBank.innerHTML = '<option value="">통장을 먼저 등록해주세요</option>';
    } else {
      quickBank.innerHTML = AppState.bankAccounts.map(b => `
        <option value="${b.id}">${b.bankName || b.name} (${b.biz || '공통'})</option>
      `).join('');
      if (curVal) quickBank.value = curVal;
    }
  }

  const quickDate = document.getElementById('quickTxDate');
  if (quickDate && !quickDate.value) {
    const now = new Date();
    quickDate.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  // 📋 엑셀 복사-붙여넣기 대상 통장 목록 동기화
  const pasteTarget = document.getElementById('bankPasteTargetAccount');
  if (pasteTarget) {
    const curVal = pasteTarget.value;
    if (AppState.bankAccounts.length === 0) {
      pasteTarget.innerHTML = '<option value="">통장을 먼저 등록해주세요</option>';
    } else {
      pasteTarget.innerHTML = AppState.bankAccounts.map(b => `
        <option value="${b.id}">${b.bankName || b.name} - ${b.accountName || b.name} (${b.accountNum})</option>
      `).join('');
      if (curVal) pasteTarget.value = curVal;
    }
  }

  // 통장 입출금 거래내역 장부 렌더링 동기화
  renderBankTxTable();
  if (window.feather) feather.replace();
}

/**
 * 통장 등록 / 수정 모달 핸들러 (이월금액 / 기초시작잔액 입력 지원 ⭐)
 */
function openBankAccountModal(id) {
  const idEl = document.getElementById('formBankId');
  const nameEl = document.getElementById('formBankName');
  const bizEl = document.getElementById('formBankBiz');
  const accNameEl = document.getElementById('formBankAccName');
  const accNumEl = document.getElementById('formBankAccNum');
  const balEl = document.getElementById('formBankInitialBalance');
  const noteEl = document.getElementById('formBankNote');
  const titleEl = document.getElementById('bankModalTitle');

  populateBusinessSelects();

  if (id && id !== -1) {
    const b = AppState.bankAccounts.find(item => item.id == id);
    if (b) {
      if (idEl) idEl.value = b.id;
      if (nameEl) nameEl.value = b.bankName || '기업은행';
      if (bizEl) bizEl.value = b.biz || (AppState.businesses[0]?.name || '사업자A');
      if (accNameEl) accNameEl.value = b.accountName || b.name || '';
      if (accNumEl) accNumEl.value = b.accountNum || '';
      const initial = (b.initialBalance !== undefined) ? b.initialBalance : (b.balance || 0);
      if (balEl) balEl.value = initial;
      if (noteEl) noteEl.value = b.note || '';
      if (titleEl) titleEl.textContent = `✏️ [${b.bankName || b.name}] 계좌 및 이월금액 수정`;
    }
  } else {
    if (idEl) idEl.value = '';
    if (nameEl) nameEl.value = '기업은행';
    const defaultBiz = (AppState.currentBizFilter !== 'ALL' && (AppState.businesses || []).some(b => b.name === AppState.currentBizFilter)) 
      ? AppState.currentBizFilter 
      : (AppState.businesses[0]?.name || '사업자A');
    if (bizEl) bizEl.value = defaultBiz;
    if (accNameEl) accNameEl.value = '';
    if (accNumEl) accNumEl.value = '';
    if (balEl) balEl.value = '';
    if (noteEl) noteEl.value = '';
    if (titleEl) titleEl.textContent = '🏦 통장 기본정보 및 이월금액 등록';
  }

  previewBankBalanceCalc();

  const overlay = document.getElementById('bankAccountModalOverlay');
  if (overlay) overlay.style.display = 'flex';
  if (window.feather) feather.replace();
}

/**
 * 모달 내 이월금액 입력 시 실시간 계산 잔액 미리보기
 */
function previewBankBalanceCalc() {
  const idEl = document.getElementById('formBankId');
  const balEl = document.getElementById('formBankInitialBalance');
  const previewEl = document.getElementById('bankModalCalcPreview');
  if (!balEl || !previewEl) return;

  const initBal = parseFloat(balEl.value) || 0;
  const id = idEl ? idEl.value : null;

  if (id) {
    const stats = getBankAccountStats(id);
    const curr = initBal + stats.totalIn - stats.totalOut;
    previewEl.style.display = 'block';
    previewEl.innerHTML = `
      <div><strong>📊 잔고 실시간 계산 미리보기</strong></div>
      <div style="margin-top:3px;color:#475569;">
        이월(기초)금액: <strong>${formatKRW(initBal)}</strong> 
        + 거래 입금합계: <span style="color:#059669;font-weight:700;">+${formatKRW(stats.totalIn)}</span> 
        - 거래 출금합계: <span style="color:#dc2626;font-weight:700;">-${formatKRW(stats.totalOut)}</span>
      </div>
      <div style="margin-top:4px;font-size:13px;font-weight:800;color:#065f46;">
        ➔ 최종 현재 통장 잔고: ${formatKRW(curr)}
      </div>
    `;
  } else {
    previewEl.style.display = 'block';
    previewEl.innerHTML = `
      <div><strong>📊 시작 잔고 안내</strong></div>
      <div style="margin-top:3px;color:#475569;">
        처음 시작 시 이월금액이 기준 잔액이 되며, 이후 입금·출금 내역에 따라 자동으로 더해지고 빼집니다.
      </div>
      <div style="margin-top:4px;font-size:13px;font-weight:800;color:#065f46;">
        ➔ 최초 등록 기준금액: ${formatKRW(initBal)}
      </div>
    `;
  }
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
  const initialBalance = parseFloat(document.getElementById('formBankInitialBalance').value) || 0;
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
        initialBalance,
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
      initialBalance,
      balance: initialBalance,
      biz,
      note
    };
    AppState.bankAccounts.push(newBank);
  }

  recalculateAllBankBalances();
  saveStateToStorage();
  closeBankAccountModal();
  renderSettlementView();
  calculatePL();
  alert(`통장 정보(이월금액 ${formatKRW(initialBalance)})가 안전하게 저장되었습니다, 리사님!`);
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
let editingBankTxId = null;

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
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:30px;color:#94a3b8;">해당 조건의 입출금 거래내역이 없습니다. 상단 빠른 입력 행에서 엑셀처럼 바로 타이핑하여 등록해보세요!</td></tr>';
    return;
  }

  const markets = getKnownMarketsList();

  // 🏦 계좌별 거래일시 오름차순(오래된 순)으로 거래 후 잔액(Running Balance) 완벽 계산
  const bankRunningMap = {};
  AppState.bankAccounts.forEach(b => {
    bankRunningMap[b.id] = (b.initialBalance !== undefined) ? Number(b.initialBalance) : (Number(b.balance) || 0);
  });

  const chronological = [...AppState.bankTransactions].sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.id - b.id));
  const txRunningBalances = {};

  chronological.forEach(tx => {
    const accId = tx.accountId;
    if (bankRunningMap[accId] === undefined) {
      bankRunningMap[accId] = 0;
    }
    const amt = Number(tx.amount) || 0;
    if (tx.type === '입금') {
      bankRunningMap[accId] += amt;
    } else if (tx.type === '출금') {
      bankRunningMap[accId] -= amt;
    }
    txRunningBalances[tx.id] = bankRunningMap[accId];
  });

  tbody.innerHTML = list.map(tx => {
    const runningBal = txRunningBalances[tx.id] !== undefined ? txRunningBalances[tx.id] : tx.balanceAfter;

    // 인라인 수정 모드
    if (editingBankTxId === tx.id) {
      return `
        <tr style="background:#fffbeb;border:2px solid #f59e0b;">
          <td style="padding:4px 4px;">
            <input type="date" id="inlineTxDate_${tx.id}" class="form-control" style="font-size:11px;padding:2px 4px;height:28px;" value="${tx.date || ''}">
          </td>
          <td style="font-size:12px;font-weight:700;">
            ${tx.bankName || ''}
            <div style="font-size:11px;color:#64748b;font-family:monospace;">${tx.accountNum || ''}</div>
          </td>
          <td style="padding:4px 4px;text-align:center;">
            <select id="inlineTxType_${tx.id}" class="form-control" style="font-size:11px;padding:2px 3px;height:28px;font-weight:700;">
              <option value="입금" ${tx.type === '입금' ? 'selected' : ''}>🟢 입금</option>
              <option value="출금" ${tx.type === '출금' ? 'selected' : ''}>🔴 출금</option>
            </select>
          </td>
          <td style="padding:4px 4px;">
            <input type="number" id="inlineTxAmount_${tx.id}" class="form-control text-right" style="font-size:12px;padding:2px 4px;height:28px;font-weight:700;" value="${tx.amount || 0}">
          </td>
          <td style="text-align:right;color:#64748b;font-size:11px;vertical-align:middle;">
            ${formatKRW(runningBal)}
          </td>
          <td style="padding:4px 4px;">
            <select id="inlineTxMarket_${tx.id}" class="form-control" style="font-size:11px;padding:2px 3px;height:28px;">
              <option value="AUTO" ${tx.targetMarket === 'AUTO' ? 'selected' : ''}>🤖 자동감지</option>
              ${markets.map(m => `<option value="${m}" ${tx.targetMarket === m ? 'selected' : ''}>${m}</option>`).join('')}
              <option value="NONE" ${tx.targetMarket === 'NONE' ? 'selected' : ''}>일반거래</option>
            </select>
          </td>
          <td style="padding:4px 4px;">
            <input type="text" id="inlineTxSummary_${tx.id}" class="form-control" style="font-size:11.5px;padding:2px 4px;height:28px;" value="${tx.summary || ''}">
          </td>
          <td style="padding:4px 4px;">
            <input type="text" id="inlineTxNote_${tx.id}" class="form-control" style="font-size:11px;padding:2px 4px;height:28px;" value="${tx.note || ''}">
          </td>
          <td style="text-align:center;white-space:nowrap;padding:4px 4px;">
            <button class="btn btn-sm btn-primary" onclick="saveBankTxInline(${tx.id})" style="font-size:11px;padding:2px 6px;background:#16a34a;border:none;" title="저장">💾</button>
            <button class="btn btn-sm btn-secondary" onclick="cancelEditBankTxInline()" style="font-size:11px;padding:2px 6px;" title="취소">✕</button>
          </td>
        </tr>
      `;
    }

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
          ${formatKRW(runningBal)}
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
        <td style="text-align:center;white-space:nowrap;">
          <button class="btn btn-sm btn-secondary" onclick="editBankTxInline(${tx.id})" style="font-size:11px;padding:2px 6px;" title="수정">✏️</button>
          <button class="btn btn-sm btn-secondary" onclick="deleteBankTx(${tx.id})" style="font-size:11px;padding:2px 6px;color:#dc2626;" title="삭제">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * ⚡ 엑셀식 빠른 인라인 입력 관련 함수들
 */
function autoDetectQuickTxMarket() {
  const summary = (document.getElementById('quickTxSummary').value || '').trim();
  const note = (document.getElementById('quickTxNote') ? document.getElementById('quickTxNote').value || '' : '').trim();
  const mktSelect = document.getElementById('quickTxMarket');
  if (mktSelect && summary) {
    const detected = detectMarketFromText(summary + ' ' + note);
    if (detected && detected !== 'NONE') {
      mktSelect.value = detected;
    }
  }
}

function handleQuickTxKeyDown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    addQuickBankTx();
  }
}

function addQuickBankTx() {
  const dateEl = document.getElementById('quickTxDate');
  const bankIdEl = document.getElementById('quickTxBankId');
  const typeEl = document.getElementById('quickTxType');
  const amountEl = document.getElementById('quickTxAmount');
  const marketEl = document.getElementById('quickTxMarket');
  const summaryEl = document.getElementById('quickTxSummary');
  const noteEl = document.getElementById('quickTxNote');

  if (!amountEl || !summaryEl || !bankIdEl) return;

  const amount = parseFloat(amountEl.value) || 0;
  const summary = summaryEl.value.trim();
  const bankId = bankIdEl.value;
  const type = typeEl ? typeEl.value : '입금';
  let targetMarket = marketEl ? marketEl.value : 'AUTO';
  const note = noteEl ? noteEl.value.trim() : '';
  const dateStr = dateEl ? dateEl.value.trim() : '';

  if (!amount || amount <= 0) {
    alert('거래금액을 입력해 주세요, 리사님!');
    amountEl.focus();
    return;
  }
  if (!summary) {
    alert('적요(거래내용)를 입력해 주세요, 리사님!');
    summaryEl.focus();
    return;
  }

  const targetBank = AppState.bankAccounts.find(b => b.id == bankId);
  if (!targetBank) {
    alert('통장을 선택해 주세요, 리사님!');
    return;
  }

  if (targetMarket === 'AUTO') {
    const detected = detectMarketFromText(summary + ' ' + note);
    if (detected && detected !== 'NONE') targetMarket = detected;
  }

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const newTx = {
    id: Date.now(),
    accountId: targetBank.id,
    bankName: targetBank.bankName || targetBank.name,
    accountName: targetBank.accountName || targetBank.name,
    accountNum: targetBank.accountNum,
    date: dateStr || todayStr,
    type: type,
    amount: amount,
    summary: summary,
    targetMarket: targetMarket,
    note: note
  };

  AppState.bankTransactions.unshift(newTx);
  recalculateAllBankBalances();
  saveStateToStorage();

  // 입력칸 비우고 다음 입력을 위해 포커스 준비
  amountEl.value = '';
  summaryEl.value = '';
  if (noteEl) noteEl.value = '';
  if (marketEl) marketEl.value = 'AUTO';

  renderSettlementView();
  calculatePL();

  showQuickToast(`✅ ${type} ${formatKRW(amount)} (${summary}) 등록 완료! 바로 다음 행을 입력하세요.`);

  // 금액 입력창에 다시 포커스! (엑셀처럼 엔터 치며 연속 입력 가능)
  setTimeout(() => {
    const el = document.getElementById('quickTxAmount');
    if (el) el.focus();
  }, 50);
}

function togglePasteBox() {
  const box = document.getElementById('bankPasteBoxContainer');
  if (box) {
    box.style.display = (box.style.display === 'none' || !box.style.display) ? 'block' : 'none';
    if (box.style.display === 'block') {
      const textarea = document.getElementById('bankPasteTextarea');
      if (textarea) textarea.focus();
    }
  }
}

function processBankPasteData() {
  const textarea = document.getElementById('bankPasteTextarea');
  const targetAccSelect = document.getElementById('bankPasteTargetAccount');
  if (!textarea) return;

  const text = textarea.value.trim();
  if (!text) {
    alert('붙여넣을 엑셀 데이터가 없습니다, 리사님!');
    return;
  }

  const defaultBankId = targetAccSelect ? targetAccSelect.value : (AppState.bankAccounts[0] ? AppState.bankAccounts[0].id : null);
  const defaultBank = AppState.bankAccounts.find(b => b.id == defaultBankId) || AppState.bankAccounts[0];

  if (!defaultBank) {
    alert('먼저 등록된 통장이 필요합니다, 리사님!');
    return;
  }

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  let addedCount = 0;

  lines.forEach((line, idx) => {
    // 탭(\t) 또는 쉼표(,) 또는 2개 이상의 공백으로 열 분리
    const cols = line.includes('\t') ? line.split('\t') : (line.includes(',') ? line.split(',') : line.split(/\s{2,}/));
    if (cols.length === 0) return;

    let date = '';
    let type = '입금';
    let amount = 0;
    let summary = '';
    let note = '';
    let bank = defaultBank;

    cols.forEach(col => {
      const c = col.trim();
      if (!c) return;
      if (/^\d{4}[-./]\d{1,2}[-./]\d{1,2}/.test(c)) {
        date = c.replace(/[/.]/g, '-');
      } else if (c === '입금' || c === '출금') {
        type = c;
      } else if (/^[+-]?[\d,]+(\.00)?$/.test(c.replace(/원/g, '').trim())) {
        const num = parseFloat(c.replace(/[^\d.-]/g, ''));
        if (!isNaN(num) && num > 0) amount = num;
      } else {
        const matchedB = AppState.bankAccounts.find(b => (b.bankName && c.includes(b.bankName)) || (b.name && c.includes(b.name)));
        if (matchedB) {
          bank = matchedB;
        } else if (!summary) {
          summary = c;
        } else if (!note) {
          note = c;
        } else {
          summary += ' ' + c;
        }
      }
    });

    if (amount > 0) {
      if (!date) date = new Date().toISOString().slice(0, 10);
      if (!summary) summary = '통장 거래내역';

      const detectedMkt = detectMarketFromText(summary + ' ' + note);

      AppState.bankTransactions.unshift({
        id: Date.now() + idx + Math.floor(Math.random() * 1000),
        accountId: bank.id,
        bankName: bank.bankName || bank.name,
        accountName: bank.accountName || bank.name,
        accountNum: bank.accountNum,
        date: date,
        type: type,
        amount: amount,
        summary: summary,
        targetMarket: detectedMkt || 'AUTO',
        note: note
      });
      addedCount++;
    }
  });

  if (addedCount > 0) {
    recalculateAllBankBalances();
    saveStateToStorage();
    textarea.value = '';
    togglePasteBox();
    renderSettlementView();
    calculatePL();
    alert(`🎉 엑셀 데이터 ${addedCount}건이 통장 장부에 한 번에 쏙 등록되었습니다, 리사님!`);
  } else {
    alert('유효한 금액이 포함된 행을 찾지 못했습니다. 날짜, 금액, 적요 형식을 확인해주세요.');
  }
}

function editBankTxInline(id) {
  editingBankTxId = id;
  renderBankTxTable();
}

function cancelEditBankTxInline() {
  editingBankTxId = null;
  renderBankTxTable();
}

function saveBankTxInline(id) {
  const tx = AppState.bankTransactions.find(t => t.id == id);
  if (!tx) return;

  const dateEl = document.getElementById(`inlineTxDate_${id}`);
  const typeEl = document.getElementById(`inlineTxType_${id}`);
  const amountEl = document.getElementById(`inlineTxAmount_${id}`);
  const marketEl = document.getElementById(`inlineTxMarket_${id}`);
  const summaryEl = document.getElementById(`inlineTxSummary_${id}`);
  const noteEl = document.getElementById(`inlineTxNote_${id}`);

  if (!amountEl || !summaryEl) return;

  const date = dateEl ? dateEl.value.trim() : tx.date;
  const type = typeEl ? typeEl.value : tx.type;
  const amount = parseFloat(amountEl.value) || 0;
  const market = marketEl ? marketEl.value : tx.targetMarket;
  const summary = summaryEl.value.trim();
  const note = noteEl ? noteEl.value.trim() : '';

  if (!amount || amount <= 0 || !summary) {
    alert('금액과 적요를 입력해주세요!');
    return;
  }

  tx.date = date;
  tx.type = type;
  tx.amount = amount;
  tx.targetMarket = market;
  tx.summary = summary;
  tx.note = note;

  editingBankTxId = null;
  recalculateAllBankBalances();
  saveStateToStorage();
  renderSettlementView();
  calculatePL();
  showQuickToast('수정 내용이 저장되고 통장 잔고가 재계산되었습니다!');
}

function showQuickToast(msg) {
  let toastContainer = document.getElementById('radarToastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'radarToastContainer';
    toastContainer.className = 'radar-toast-container';
    document.body.appendChild(toastContainer);
  }
  const toast = document.createElement('div');
  toast.className = 'radar-toast';
  toast.style.cssText = 'background:#1e293b;color:#fff;padding:10px 16px;border-radius:10px;margin-bottom:8px;font-size:12.5px;box-shadow:0 4px 12px rgba(0,0,0,0.15);display:flex;align-items:center;gap:8px;z-index:9999;';
  toast.innerHTML = msg;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.4s ease';
    setTimeout(() => toast.remove(), 400);
  }, 2500);
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

  const newTx = {
    id: Date.now(),
    accountId: targetBank.id,
    bankName: targetBank.bankName || targetBank.name,
    accountName: targetBank.accountName || targetBank.name,
    accountNum: targetBank.accountNum,
    date: dateStr || new Date().toISOString().slice(0, 10),
    type: type,
    amount: amount,
    summary: summary,
    targetMarket: targetMarket,
    note: note
  };

  AppState.bankTransactions.unshift(newTx);
  recalculateAllBankBalances();
  saveStateToStorage();
  closeBankTxModal();
  renderSettlementView();
  calculatePL();
  alert(`통장 거래내역(${type} ${formatKRW(amount)})이 등록되었습니다!`);
}

function deleteBankTx(id) {
  if (!confirm('이 거래내역을 장부에서 삭제하시겠습니까? (삭제 시 통장 잔고가 자동으로 다시 계산됩니다)')) return;
  AppState.bankTransactions = AppState.bankTransactions.filter(tx => tx.id != id);
  recalculateAllBankBalances();
  saveStateToStorage();
  renderSettlementView();
  calculatePL();
  showQuickToast('거래내역이 삭제되고 통장 잔고가 재계산되었습니다.');
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

  // 사입 재고는 장부에 등록된 사입 주문 및 입고 데이터를 기반으로 집계
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
 * 📊 숫자 3자리 콤마 포맷 (엑셀식, 원 단위 제외)
 */
function formatNumber(num) {
  if (num === 0 || num === '0') return '0';
  if (!num) return '';
  return Math.round(num).toLocaleString('ko-KR');
}

/**
 * 📊 엑셀식 손익계산서용 사업자별 / 통합 재무 수치 계산
 */
function getScopeFinancials(scopeBiz, selectedYear) {
  const allOrders = AppState.rawOrders || [];
  const bizCount = (AppState.businesses && AppState.businesses.length > 0) ? AppState.businesses.length : 2;

  // 1. 주문 필터링
  const orders = allOrders.filter(o => {
    if (o.status === '취소') return false;
    const d = o.orderDate || o.paymentDate || '';
    const yearOk = (selectedYear === 'ALL' || d.startsWith(selectedYear));
    const bizOk = (scopeBiz === 'ALL' || o.biz === scopeBiz);
    return yearOk && bizOk;
  });

  let grossSales = 0;
  let netSales = 0;
  let marketFees = 0;
  const supplierMap = {};
  let totalPurchase = 0;
  let orderDelivery = 0;

  orders.forEach(o => {
    if (o.totalSales > 0) {
      grossSales += o.totalSales;
      const settleAmt = (o.actualSettlement > 0) ? o.actualSettlement : (o.standardPrice || o.totalSales);
      netSales += settleAmt;
      marketFees += (o.totalSales - settleAmt);
    }
    const cost = getOrderActualCost(o);
    if (cost > 0) {
      totalPurchase += cost;
      const supp = (o.supplierName || o.supplierBiz || o.sourcingPlatform || '매입1').trim();
      supplierMap[supp] = (supplierMap[supp] || 0) + cost;
    }
    if (o.deliveryFeeOut > 0) {
      orderDelivery += o.deliveryFeeOut;
    }
  });

  // 2. 비용(customExpenses) 필터링
  const expMap = {
    delivery: 0,      // 택배비
    ad: 0,            // 광고비
    fee: 0,           // 수수료
    office: 0,        // 사무실비용
    regTax: 0,        // 등록세
    licenseTax: 0,    // 면허세
    education: 0,     // 교육비
    vat: 0,           // 부가세
    others: {}        // 기타 세부 카테고리 (프로그램비, 식대, 소모품 등)
  };

  (AppState.customExpenses || []).forEach(exp => {
    const d = exp.date || exp.month || '';
    const yearOk = (selectedYear === 'ALL' || d.startsWith(selectedYear));
    if (!yearOk) return;

    let multiplier = 0;
    if (scopeBiz === 'ALL') {
      multiplier = 1;
    } else if (exp.biz === scopeBiz) {
      multiplier = 1;
    } else if (exp.biz === 'ALL') {
      multiplier = 1 / bizCount;
    }
    if (multiplier <= 0) return;

    const amt = Math.round((exp.amount || 0) * multiplier);
    const cat = (exp.category || '').trim();
    const title = (exp.title || '').trim();

    if (cat === '포장/택배비' || title.includes('택배') || title.includes('배송')) {
      expMap.delivery += amt;
    } else if (cat === '광고비' || title.includes('광고')) {
      expMap.ad += amt;
    } else if (cat === '결제수수료' || title.includes('수수료')) {
      expMap.fee += amt;
    } else if (cat === '임차료' || title.includes('사무실') || title.includes('월세') || title.includes('임대')) {
      expMap.office += amt;
    } else if (title.includes('등록세')) {
      expMap.regTax += amt;
    } else if (title.includes('면허세')) {
      expMap.licenseTax += amt;
    } else if (cat === '교육비' || title.includes('교육') || title.includes('강의')) {
      expMap.education += amt;
    } else if (title.includes('부가세') || title.includes('세무')) {
      expMap.vat += amt;
    } else {
      const otherCat = cat || '기타잡비';
      expMap.others[otherCat] = (expMap.others[otherCat] || 0) + amt;
    }
  });

  const totalDelivery = orderDelivery + expMap.delivery;
  const totalMarketFee = marketFees + expMap.fee;

  // 지출 항목 리스트 구성 (사용자 엑셀 원본 양식 순서 그대로 ⭐)
  const expenseRows = [];

  const suppliers = Object.keys(supplierMap);
  if (suppliers.length === 0) {
    expenseRows.push({ name: '매입1', amount: totalPurchase });
  } else if (suppliers.length === 1) {
    const sName = suppliers[0];
    const label = (sName === '기본' || sName === '매입1') ? '매입1' : `매입1(${sName})`;
    expenseRows.push({ name: label, amount: supplierMap[sName] });
  } else {
    suppliers.forEach((sName, idx) => {
      expenseRows.push({ name: `매입${idx + 1}(${sName})`, amount: supplierMap[sName] });
    });
  }

  expenseRows.push({ name: '택배비', amount: totalDelivery });
  expenseRows.push({ name: '광고비', amount: expMap.ad });
  expenseRows.push({ name: '판매수수료', amount: totalMarketFee });
  expenseRows.push({ name: '사무실비용', amount: expMap.office });
  expenseRows.push({ name: '등록세', amount: expMap.regTax });
  expenseRows.push({ name: '면허세', amount: expMap.licenseTax });
  expenseRows.push({ name: '교육비', amount: expMap.education });
  expenseRows.push({ name: '부가세', amount: expMap.vat });

  // 추가로 등록된 기타 비용들 (프로그램비 등)
  Object.keys(expMap.others).forEach(otherCat => {
    if (expMap.others[otherCat] > 0) {
      expenseRows.push({ name: otherCat, amount: expMap.others[otherCat] });
    }
  });

  let totalExpense = 0;
  expenseRows.forEach(r => { totalExpense += r.amount; });

  const totalIncome = grossSales;
  const netProfit = totalIncome - totalExpense;

  return {
    grossSales,
    totalIncome,
    expenseRows,
    totalExpense,
    netProfit
  };
}

/**
 * 📊 엑셀식 손익계산서 카드 HTML 생성
 */
function renderExcelPlCardHtml(title, badgeText, themeColor, data) {
  const rowCount = Math.max(data.expenseRows.length, 10);

  let rowsHtml = '';
  for (let i = 0; i < rowCount; i++) {
    // 수입 컬럼
    let incomeLabel = '';
    let incomeValHtml = '';
    if (i === 0) {
      incomeLabel = '매출금액';
      incomeValHtml = (data.totalIncome > 0)
        ? `<td class="excel-col-val excel-amt-active">${formatNumber(data.totalIncome)}</td>`
        : `<td class="excel-col-val"></td>`;
    } else {
      incomeLabel = '';
      incomeValHtml = `<td class="excel-col-val"></td>`;
    }

    // 지출 컬럼
    const expItem = data.expenseRows[i];
    let expLabel = expItem ? expItem.name : '';
    let expValHtml = '';
    if (expItem && expItem.amount > 0) {
      expValHtml = `<td class="excel-col-val excel-amt-active">${formatNumber(expItem.amount)}</td>`;
    } else {
      expValHtml = `<td class="excel-col-val"></td>`;
    }

    rowsHtml += `
      <tr>
        <td class="excel-col-label">${escapeHtml(incomeLabel)}</td>
        ${incomeValHtml}
        <td class="excel-col-label">${escapeHtml(expLabel)}</td>
        ${expValHtml}
      </tr>
    `;
  }

  // 합계 행 (엑셀 원본처럼 흰색 배경에 굵은 테두리)
  const totalRowHtml = `
    <tr class="excel-total-row">
      <td class="excel-col-label"></td>
      <td class="excel-col-val">${data.totalIncome > 0 ? formatNumber(data.totalIncome) : '0'}</td>
      <td class="excel-col-label"></td>
      <td class="excel-col-val">${data.totalExpense > 0 ? formatNumber(data.totalExpense) : '0'}</td>
    </tr>
  `;

  // 수익 행
  const profitLabel = '수익';
  const profitClass = data.netProfit >= 0 ? 'profit-plus' : 'profit-minus';
  const profitRowHtml = `
    <tr class="excel-profit-row">
      <td class="excel-col-label" style="border-right:none;"></td>
      <td class="excel-col-val" style="border-left:none;"></td>
      <td class="excel-profit-label">${profitLabel}</td>
      <td class="excel-profit-val ${profitClass}">${formatNumber(data.netProfit)}</td>
    </tr>
  `;

  return `
    <div class="excel-pl-card">
      <div class="excel-card-header" style="background:${themeColor};color:#fff;padding:9px 12px;display:flex;align-items:center;justify-content:space-between;">
        <span style="font-weight:800;font-size:13.5px;">${escapeHtml(title)}</span>
        <span style="font-size:11px;background:rgba(255,255,255,0.22);padding:2px 8px;border-radius:12px;font-weight:700;">${escapeHtml(badgeText)}</span>
      </div>
      <div style="padding:10px;overflow-x:auto;">
        <table class="excel-pl-table">
          <thead>
            <tr class="excel-header-row">
              <th colspan="2" style="width:50%;">수입</th>
              <th colspan="2" style="width:50%;">지출</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            ${totalRowHtml}
            ${profitRowHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/**
 * 6. 비용 & 손익계산서 & 순자산 (년도별 손익계산서 및 일자별 비용 연동)
 */
function calculatePL() {
  const yearSelect = document.getElementById('plYearSelect');
  const selectedYear = yearSelect ? yearSelect.value : (AppState.selectedPlYear || '2026');
  AppState.selectedPlYear = selectedYear;

  const tableTitle = document.getElementById('plTableTitle');
  if (tableTitle) {
    if (selectedYear === 'ALL') tableTitle.textContent = '🌐 전체 연도 통합 경영 손익계산서 (수입 vs 지출)';
    else tableTitle.textContent = `📅 ${selectedYear}년 경영 손익계산서 (수입 vs 지출)`;
  }

  // ⭐ 3개 비교 엑셀 손익계산서 렌더링 (한 화면에 전체 + 각 사업자별 비교 ⭐)
  const comparativeGrid = document.getElementById('plComparativeGrid');
  if (comparativeGrid) {
    const cards = [];

    // 1) 통합 전체
    const totalData = getScopeFinancials('ALL', selectedYear);
    cards.push(renderExcelPlCardHtml('🌐 통합 전체 손익계산서', '전 사업자 합산', '#1e3a8a', totalData));

    // 2) 등록된 각 사업자별
    const colors = ['#0f766e', '#7c3aed', '#c2410c', '#0284c7', '#4f46e5'];
    (AppState.businesses || []).forEach((b, idx) => {
      const bData = getScopeFinancials(b.name, selectedYear);
      const color = colors[idx % colors.length];
      const badge = b.owner ? `대표: ${b.owner}` : '사업자';
      cards.push(renderExcelPlCardHtml(`🏢 ${b.name} 손익계산서`, badge, color, bData));
    });

    comparativeGrid.innerHTML = cards.join('');
  }

  // 1. 순자산 계산용 주문 필터링: 선택된 사업자 + 선택된 년도
  const baseCountable = getCountableOrders();
  const baseAllOrders = getBizOrders();

  const countableOrders = baseCountable.filter(o => {
    if (selectedYear === 'ALL') return true;
    const d = o.orderDate || '';
    return d.startsWith(selectedYear);
  });
  const allOrders = baseAllOrders.filter(o => {
    if (selectedYear === 'ALL') return true;
    const d = o.orderDate || '';
    return d.startsWith(selectedYear);
  });

  let purchaseCost = 0;
  countableOrders.forEach(o => {
    if (o.market && o.totalSales > 0) {
      purchaseCost += getOrderActualCost(o);
    }
  });

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
 * =========================================================
 * 💸 비용 관리 (일자별 지출 장부) & 손익계산서 탭 핸들러
 * =========================================================
 */

/**
 * 비용 & 손익계산서 탭 전환 (expense: 비용 관리 / pnl: 손익계산서 & 순자산)
 */
function switchPlTab(tab) {
  AppState.plViewTab = tab;
  const expCont = document.getElementById('expenseContainer');
  const pnlCont = document.getElementById('pnlContainer');
  const btnExp = document.getElementById('btnTabExpense');
  const btnPnl = document.getElementById('btnTabProfitLoss');
  const desc = document.getElementById('plTabDesc');

  if (btnExp && btnPnl) {
    btnExp.classList.toggle('active', tab === 'expense');
    btnPnl.classList.toggle('active', tab === 'pnl');
  }

  if (expCont) expCont.style.display = (tab === 'expense') ? 'block' : 'none';
  if (pnlCont) pnlCont.style.display = (tab === 'pnl') ? 'block' : 'none';

  if (desc) {
    if (tab === 'expense') {
      desc.textContent = '💡 통장거래처럼 광고비, 프로그램비 등 지출 내역을 일자별로 쉽고 빠르게 기록합니다.';
    } else {
      desc.textContent = '📊 선택한 연도의 총 매출액, 원가, 판관비 및 당기순이익과 알짜 순자산을 확인합니다.';
    }
  }

  if (tab === 'expense') {
    initExpenseView();
  } else {
    populatePlYears();
    calculatePL();
  }
  if (window.feather) feather.replace();
}

/**
 * 손익계산서 년도 셀렉트 박스 동적 옵션 생성
 */
function populatePlYears() {
  const select = document.getElementById('plYearSelect');
  if (!select) return;

  const years = new Set(['2026', '2025']);
  (AppState.rawOrders || []).forEach(o => {
    if (o.orderDate && o.orderDate.length >= 4) {
      years.add(o.orderDate.substring(0, 4));
    }
  });
  (AppState.customExpenses || []).forEach(e => {
    const d = e.date || e.month || '';
    if (d.length >= 4) {
      years.add(d.substring(0, 4));
    }
  });

  const sortedYears = Array.from(years).sort().reverse();
  const currentVal = select.value || AppState.selectedPlYear || '2026';

  let html = sortedYears.map(y => `<option value="${y}" ${y === currentVal ? 'selected' : ''}>📅 ${y}년 손익계산서</option>`).join('');
  html += `<option value="ALL" ${currentVal === 'ALL' ? 'selected' : ''}>🌐 전체 연도 통합 손익계산서</option>`;
  select.innerHTML = html;
}

/**
 * 💳 비용 등록/수정용 결제수단 자동완성 datalist 동기화
 */
function populateCardPayMethods() {
  const datalist = document.getElementById('cardPayMethodList');
  if (!datalist) return;
  const methods = new Set(['통장이체', '현금', '체크카드']);
  (AppState.cardSettings || []).forEach(s => {
    if (s.name) methods.add(s.name);
    if (s.holder) methods.add(`${s.name} (${s.holder})`);
  });
  datalist.innerHTML = Array.from(methods).map(m => `<option value="${escapeHtml(m)}">`).join('');
}

/**
 * 비용 뷰 초기화 (기본 일자, 사업자 목록 동기화, 테이블 렌더링)
 */
function initExpenseView() {
  const quickDate = document.getElementById('quickExpDate');
  if (quickDate && !quickDate.value) {
    quickDate.value = formatDateForInput(new Date());
  }

  populateBusinessSelects();
  populatePlYears();
  populateCardPayMethods();
  renderExpenseTable();
}

/**
 * 일자별 비용(지출) 내역 테이블 렌더링
 */
function renderExpenseTable() {
  const tbody = document.getElementById('expenseTableBody');
  const countBadge = document.getElementById('expenseCountBadge');
  const totalAmountEl = document.getElementById('expenseTotalAmount');
  const thisMonthAmountEl = document.getElementById('expenseThisMonthAmount');
  if (!tbody) return;

  const filterYear = document.getElementById('expenseFilterYear') ? document.getElementById('expenseFilterYear').value : 'ALL';
  const filterMonth = document.getElementById('expenseFilterMonth') ? document.getElementById('expenseFilterMonth').value : 'ALL';
  const filterBiz = document.getElementById('expenseFilterBiz') ? document.getElementById('expenseFilterBiz').value : 'ALL';
  const filterCat = document.getElementById('expenseFilterCat') ? document.getElementById('expenseFilterCat').value : 'ALL';

  let list = (AppState.customExpenses || []).slice();

  // 날짜 최신순 정렬
  list.sort((a, b) => {
    const dateA = a.date || a.month || '';
    const dateB = b.date || b.month || '';
    return dateB.localeCompare(dateA);
  });

  // 전역 사이드바 사업자 필터 적용
  if (AppState.currentBizFilter !== 'ALL') {
    list = list.filter(e => e.biz === 'ALL' || e.biz === AppState.currentBizFilter);
  }

  // 테이블 자체 필터 적용
  if (filterYear !== 'ALL') {
    list = list.filter(e => (e.date || e.month || '').startsWith(filterYear));
  }
  if (filterMonth !== 'ALL') {
    list = list.filter(e => {
      const d = e.date || e.month || '';
      return d.includes(`-${filterMonth}-`) || d.endsWith(`-${filterMonth}`) || (d.length >= 7 && d.substring(5, 7) === filterMonth);
    });
  }
  if (filterBiz !== 'ALL') {
    list = list.filter(e => e.biz === filterBiz);
  }
  if (filterCat !== 'ALL') {
    list = list.filter(e => e.category === filterCat);
  }

  // 요약 통계 집계
  let totalSum = 0;
  let thisMonthSum = 0;
  const now = new Date();
  const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  (AppState.customExpenses || []).forEach(e => {
    const amt = e.amount || 0;
    const bizOk = (AppState.currentBizFilter === 'ALL' || e.biz === 'ALL' || e.biz === AppState.currentBizFilter);
    if (bizOk) {
      totalSum += amt;
      const d = e.date || e.month || '';
      if (d.startsWith(currentMonthPrefix)) {
        thisMonthSum += amt;
      }
    }
  });

  if (countBadge) countBadge.textContent = `${list.length}건`;
  if (totalAmountEl) totalAmountEl.textContent = formatKRW(totalSum);
  if (thisMonthAmountEl) thisMonthAmountEl.textContent = formatKRW(thisMonthSum);

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:36px;color:#94a3b8;font-size:13px;">등록된 비용 내역이 없습니다. 위 초록색 입력줄에서 날짜와 금액을 넣고 [+ 추가]를 눌러보세요!</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(exp => {
    const isEditing = AppState.editingExpenseId === exp.id;
    if (isEditing) {
      return renderExpenseInlineEditRow(exp);
    }
    const bStyle = getBizBadgeStyle(exp.biz);
    return `
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="font-weight:700;color:#1e293b;white-space:nowrap;">${escapeHtml(exp.date || exp.month || '')}</td>
        <td>
          <span class="badge" style="background:${bStyle.bg};color:${bStyle.color};font-size:11px;font-weight:700;">
            ${escapeHtml(exp.biz || '공통')}
          </span>
        </td>
        <td>
          <span class="badge" style="background:#fee2e2;color:#991b1b;font-size:11px;font-weight:700;">
            ${escapeHtml(exp.category || '기타')}
          </span>
        </td>
        <td style="font-weight:600;color:#1e293b;">
          ${escapeHtml(exp.title || '')}
        </td>
        <td style="text-align:right;font-weight:700;color:#dc2626;font-size:13.5px;">
          -${formatKRW(exp.amount || 0)}
        </td>
        <td style="color:#475569;font-size:12px;">
          ${escapeHtml(exp.paymentMethod || '-')}
        </td>
        <td style="color:#64748b;font-size:12px;">
          ${escapeHtml(exp.note || '-')}
        </td>
        <td style="text-align:center;white-space:nowrap;">
          <button type="button" class="btn btn-xs btn-secondary" onclick="editExpenseInline('${exp.id}')" title="수정" style="padding:2px 7px;font-size:11px;margin-right:3px;">
            ✏️
          </button>
          <button type="button" class="btn btn-xs btn-danger" onclick="deleteExpense('${exp.id}')" title="삭제" style="padding:2px 7px;font-size:11px;background:#fee2e2;color:#b91c1c;border:none;border-radius:4px;cursor:pointer;">
            🗑️
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * 인라인 수정 행 HTML 생성
 */
function renderExpenseInlineEditRow(exp) {
  const bizOptions = [
    `<option value="ALL" ${exp.biz === 'ALL' ? 'selected' : ''}>공통(ALL)</option>`,
    ...(AppState.businesses || []).map(b => `<option value="${escapeHtml(b.name)}" ${exp.biz === b.name ? 'selected' : ''}>${escapeHtml(b.name)}</option>`)
  ].join('');

  const categories = ['광고비', '프로그램비', '임차료', '포장/택배비', '소모품비', '세금/공과금', '식대/복리후생', '결제수수료', '기타잡비'];
  const catOptions = categories.map(c => `<option value="${c}" ${exp.category === c ? 'selected' : ''}>${c}</option>`).join('');

  return `
    <tr style="background:#fefce8;border:2px solid #eab308;">
      <td style="padding:4px;">
        <input type="date" id="inlineExpDate_${exp.id}" class="form-control" value="${exp.date || exp.month || ''}" style="font-size:11px;padding:2px 4px;height:28px;background:#fff;">
      </td>
      <td style="padding:4px;">
        <select id="inlineExpBiz_${exp.id}" class="form-control" style="font-size:11px;padding:2px 4px;height:28px;background:#fff;">
          ${bizOptions}
        </select>
      </td>
      <td style="padding:4px;">
        <select id="inlineExpCat_${exp.id}" class="form-control" style="font-size:11px;padding:2px 4px;height:28px;background:#fff;">
          ${catOptions}
        </select>
      </td>
      <td style="padding:4px;">
        <input type="text" id="inlineExpTitle_${exp.id}" class="form-control" value="${escapeHtml(exp.title || '')}" style="font-size:12px;padding:2px 6px;height:28px;background:#fff;">
      </td>
      <td style="padding:4px;">
        <input type="number" id="inlineExpAmt_${exp.id}" class="form-control text-right" value="${exp.amount || 0}" style="font-size:12px;padding:2px 6px;height:28px;font-weight:700;background:#fff;">
      </td>
      <td style="padding:4px;">
        <input type="text" id="inlineExpPay_${exp.id}" list="cardPayMethodList" class="form-control" value="${escapeHtml(exp.paymentMethod || '')}" style="font-size:11.5px;padding:2px 6px;height:28px;background:#fff;" placeholder="카드/통장/현금">
      </td>
      <td style="padding:4px;">
        <input type="text" id="inlineExpNote_${exp.id}" class="form-control" value="${escapeHtml(exp.note || '')}" style="font-size:11px;padding:2px 6px;height:28px;background:#fff;">
      </td>
      <td style="padding:4px;text-align:center;white-space:nowrap;">
        <button type="button" class="btn btn-xs btn-primary" onclick="saveExpenseInline('${exp.id}')" style="padding:2px 7px;font-size:11px;background:#16a34a;border:none;margin-right:2px;cursor:pointer;">저장</button>
        <button type="button" class="btn btn-xs btn-secondary" onclick="cancelEditExpenseInline()" style="padding:2px 7px;font-size:11px;cursor:pointer;">취소</button>
      </td>
    </tr>
  `;
}

/**
 * ⚡ 엑셀식 빠른 비용 한 줄 추가
 */
function addQuickExpense() {
  const dateEl = document.getElementById('quickExpDate');
  const bizEl = document.getElementById('quickExpBiz');
  const catEl = document.getElementById('quickExpCategory');
  const titleEl = document.getElementById('quickExpTitle');
  const amountEl = document.getElementById('quickExpAmount');
  const payEl = document.getElementById('quickExpPayMethod');
  const noteEl = document.getElementById('quickExpNote');

  const date = dateEl ? dateEl.value : '';
  const biz = bizEl ? bizEl.value : 'ALL';
  const category = catEl ? catEl.value : '기타잡비';
  const title = titleEl ? titleEl.value.trim() : '';
  const amount = amountEl ? parseFloat(amountEl.value) : 0;
  const paymentMethod = payEl ? payEl.value.trim() : '';
  const note = noteEl ? noteEl.value.trim() : '';

  if (!title) {
    alert('비용 내용(항목명)을 입력해주세요, 리사님!');
    if (titleEl) titleEl.focus();
    return;
  }
  if (!amount || amount <= 0) {
    alert('금액을 0원보다 크게 입력해주세요!');
    if (amountEl) amountEl.focus();
    return;
  }

  const finalDate = date || formatDateForInput(new Date());
  const newExp = {
    id: 'exp_' + Date.now(),
    date: finalDate,
    category,
    title,
    amount,
    biz: biz || 'ALL',
    paymentMethod: paymentMethod || '카드',
    note
  };

  if (!AppState.customExpenses) AppState.customExpenses = [];
  AppState.customExpenses.unshift(newExp);
  saveStateToStorage();

  // 입력칸 초기화
  if (titleEl) titleEl.value = '';
  if (amountEl) amountEl.value = '';
  if (noteEl) noteEl.value = '';
  if (titleEl) titleEl.focus();

  renderExpenseTable();
  calculatePL();
}

function handleQuickExpKeyDown(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    addQuickExpense();
  }
}

function editExpenseInline(id) {
  AppState.editingExpenseId = id;
  renderExpenseTable();
}

function cancelEditExpenseInline() {
  AppState.editingExpenseId = null;
  renderExpenseTable();
}

function saveExpenseInline(id) {
  const exp = (AppState.customExpenses || []).find(e => e.id === id);
  if (!exp) return;

  const dateEl = document.getElementById(`inlineExpDate_${id}`);
  const bizEl = document.getElementById(`inlineExpBiz_${id}`);
  const catEl = document.getElementById(`inlineExpCat_${id}`);
  const titleEl = document.getElementById(`inlineExpTitle_${id}`);
  const amtEl = document.getElementById(`inlineExpAmt_${id}`);
  const payEl = document.getElementById(`inlineExpPay_${id}`);
  const noteEl = document.getElementById(`inlineExpNote_${id}`);

  if (dateEl) exp.date = dateEl.value;
  if (bizEl) exp.biz = bizEl.value;
  if (catEl) exp.category = catEl.value;
  if (titleEl) exp.title = titleEl.value.trim() || exp.title;
  if (amtEl) exp.amount = parseFloat(amtEl.value) || 0;
  if (payEl) exp.paymentMethod = payEl.value.trim();
  if (noteEl) exp.note = noteEl.value.trim();

  AppState.editingExpenseId = null;
  saveStateToStorage();
  renderExpenseTable();
  calculatePL();
}

function deleteExpense(id) {
  const exp = (AppState.customExpenses || []).find(e => e.id === id);
  if (!exp) return;
  if (!confirm(`'${exp.title}' (${formatKRW(exp.amount)}) 비용 항목을 삭제하시겠습니까?`)) return;

  AppState.customExpenses = AppState.customExpenses.filter(e => e.id !== id);
  saveStateToStorage();
  renderExpenseTable();
  calculatePL();
}

/**
 * 💸 판관비(추가 비용) 모달 및 관리 핸들러 (이전 모달 호환용)
 */
function openCustomExpenseModal() {
  switchPlTab('expense');
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
    date: month ? `${month}-01` : formatDateForInput(new Date()),
    category,
    title,
    amount,
    biz,
    note
  };

  AppState.customExpenses.unshift(newExp);
  saveStateToStorage();
  closeCustomExpenseModal();
  renderExpenseTable();
  calculatePL();
  alert(`비용 항목[${title}]이(가) 등록되었습니다!`);
}

function deleteCustomExpense(id) {
  deleteExpense(id);
}

function renderCustomExpenses() {
  renderExpenseTable();
}

/**
 * 💎 자산 & 부채 모달 및 관리 핸들러 (순자산 반영)
 */
function openCustomAssetModal() {
  populateBusinessSelects();
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
    const o = AppState.rawOrders[index];
    o.actualSettlement = cleanNum;
    o.standardPrice = cleanNum; // ⭐ 정산예정가와 통합되어 둘 다 동기화

    // ⭐ 리사님 요청: 지금 적용되어 있는 부가세 정산 공식 적용!
    // 마진금액 = (정산가 - 매입가) / 1.1 (매출부가세, 수수료부가세, 매입부가세 반영 알짜 마진)
    const cost = getOrderActualCost(o);
    const newMarginAmt = Math.round((cleanNum - cost) / 1.1);
    o.marginAmt = newMarginAmt;

    // 마진율 = (마진금액 / 판매가) * 100
    const salesBase = (o.totalSales > 0) ? o.totalSales : (cleanNum > 0 ? cleanNum : 1);
    o.marginRate = (newMarginAmt / salesBase) * 100;

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

  // ⭐ 리사님 요청 규칙: 판매가는 수량 곱셈 없이 입력된 금액 그대로 사용!
  const total = (salePrice + shipping);
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
  populateBusinessSelects();

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

    document.getElementById('formBiz').value = o.biz || (AppState.businesses[0]?.name || '사업자A');
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
    }
  } else {
    form.reset();
    document.getElementById('formOrderIndex').value = -1;
    toggleModalMode(defaultMode);

    const defaultBiz = (AppState.currentBizFilter !== 'ALL' && (AppState.businesses || []).some(b => b.name === AppState.currentBizFilter))
      ? AppState.currentBizFilter 
      : (AppState.businesses[0]?.name || '사업자A');
    document.getElementById('formBiz').value = defaultBiz;
    document.getElementById('formOrderDate').value = formatDateForInput(new Date());
    document.getElementById('formOrderNo').value = (defaultMode === 'PURCHASE_ONLY' ? `BUY-${Date.now()}` : `ORD-${Date.now()}`);
    document.getElementById('formQty').value = 1;
    document.getElementById('formSourcingType').value = (defaultMode === 'CONSIGNMENT_SALE' ? '위탁' : '사입');
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
    // ⭐ 리사님 요청 규칙: 판매가는 수량 곱셈 없이 입력된 금액 그대로 사용!
    totalSales = (salePrice + shipping);
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

    // ⭐ 리사님 핵심 요청: 수량을 곱하지 않고 입력한 금액 그대로 purchaseCost/purchasePrice에 반영!
    purchaseCost = stockUnitCost;
    purchasePrice = stockUnitCost;
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
    purchaseStage: '완료',
    courier: '',
    trackingNo: '',
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
    biz: AppState.currentBizFilter === 'ALL' ? '아커만' : AppState.currentBizFilter
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
// 1. 주문장 일별/월별 집계 및 사업자 즉시/일괄 변경
window.switchOrdersViewTab = switchOrdersViewTab;
window.goToOrdersPage = goToOrdersPage;
window.changeOrdersPageSize = changeOrdersPageSize;
window.renderOrdersDailyTable = renderOrdersDailyTable;
window.renderOrdersMonthlyTable = renderOrdersMonthlyTable;
window.filterOrdersByDate = filterOrdersByDate;
window.quickUpdateOrderBiz = quickUpdateOrderBiz;
window.toggleSelectAllOrders = toggleSelectAllOrders;
window.updateSelectedOrdersBadge = updateSelectedOrdersBadge;
window.batchAssignOrdersBiz = batchAssignOrdersBiz;

// 0. 사업자 등록 및 관리 & 자동 분류 규칙
window.openBusinessModal = openBusinessModal;
window.closeBusinessModal = closeBusinessModal;
window.resetBusinessForm = resetBusinessForm;
window.editBusiness = editBusiness;
window.saveBusiness = saveBusiness;
window.deleteBusiness = deleteBusiness;
window.renderBusinessTable = renderBusinessTable;
window.renderBusinessSwitcher = renderBusinessSwitcher;
window.populateBusinessSelects = populateBusinessSelects;
window.getBizBadgeStyle = getBizBadgeStyle;
window.matchBizForOrder = matchBizForOrder;
window.openBizMappingRulesModal = openBizMappingRulesModal;
window.closeBizMappingRulesModal = closeBizMappingRulesModal;
window.renderBizRulesTable = renderBizRulesTable;
window.addNewBizRule = addNewBizRule;
window.deleteBizRule = deleteBizRule;
window.resetDefaultBizRules = resetDefaultBizRules;
window.applyBizRulesToAllOrders = applyBizRulesToAllOrders;

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
window.autoDetectQuickTxMarket = autoDetectQuickTxMarket;
window.handleQuickTxKeyDown = handleQuickTxKeyDown;
window.addQuickBankTx = addQuickBankTx;
window.togglePasteBox = togglePasteBox;
window.processBankPasteData = processBankPasteData;
window.editBankTxInline = editBankTxInline;
window.cancelEditBankTxInline = cancelEditBankTxInline;
window.saveBankTxInline = saveBankTxInline;
window.previewBankBalanceCalc = previewBankBalanceCalc;
window.recalculateAllBankBalances = recalculateAllBankBalances;
window.getBankAccountStats = getBankAccountStats;

// 4. 비용 & 판관비 & 손익계산서 & 순자산
window.switchPlTab = switchPlTab;
window.initExpenseView = initExpenseView;
window.populatePlYears = populatePlYears;
window.renderExpenseTable = renderExpenseTable;
window.addQuickExpense = addQuickExpense;
window.handleQuickExpKeyDown = handleQuickExpKeyDown;
window.editExpenseInline = editExpenseInline;
window.cancelEditExpenseInline = cancelEditExpenseInline;
window.saveExpenseInline = saveExpenseInline;
window.deleteExpense = deleteExpense;
window.calculatePL = calculatePL;
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
window.getOrderMarginAmt = getOrderMarginAmt;
window.getOrderMarginRate = getOrderMarginRate;
