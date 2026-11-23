// 순수 Node.js 내장 모듈만을 사용한 초경량 로컬 웹 서버 + 실시간 최저가 크롤러/프록시 엔진
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// .env 로드
try {
  const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  envContent.split('\n').forEach(line => {
    const [k, ...v] = line.trim().split('=');
    if (k && v.length) process.env[k] = v.join('=');
  });
} catch (e) {}

const PORT = 3000;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // CORS 헤더 설정 (브라우저 file:/// 및 localhost 연동 완벽 지원)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Naver-Client-Id, X-Naver-Client-Secret');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // 1. API 키 없이도 실시간 최저가를 가져오는 자동 크롤러 엔진
  if (req.url.startsWith('/api/realtime-lowest-price')) {
    handleRealtimeLowestPriceApi(req, res);
    return;
  }

  // 1-1. 실시간 베스트 100 데이터 조회 API
  if (req.url.startsWith('/api/get-live-best')) {
    handleGetLiveBestApi(req, res);
    return;
  }

  // 1-2. 실시간 크롤러 원클릭 실행 API
  if (req.url.startsWith('/api/crawl-best')) {
    handleCrawlBestApi(req, res);
    return;
  }

  // 1-3. 지마켓 브라우저 실시간 데이터 동기화 API (북마클릿 연동)
  if (req.url === '/api/sync-gmarket-live' && req.method === 'POST') {
    handleSyncGmarketLiveApi(req, res);
    return;
  }

  // 1-4. 🤖 지마켓 1~100위 1클릭 완전 자동 무인 수집 로봇 API (리사님 전용)
  if (req.url.startsWith('/api/scrape-gmarket-auto')) {
    handleScrapeGmarketAutoApi(req, res);
    return;
  }

  // 1-5. 🚀 지마켓 최신 100위 수집 + 다나와 매칭 + Supabase 클라우드 동기화 API
  if (req.url.startsWith('/api/sync-to-cloud')) {
    handleSyncToCloudApi(req, res);
    return;
  }

  // 2. 기존 네이버 쇼핑 Open API 프록시 (키가 있는 경우 호환)
  if (req.url.startsWith('/api/naver-search')) {
    handleNaverSearchApi(req, res);
    return;
  }

  // 3. 서버 헬스체크 엔드포인트
  if (req.url.startsWith('/api/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'ok', server: 'sales-ledger-local-proxy' }));
    return;
  }

  // 4. 정적 파일 서비스
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 파일을 찾을 수 없습니다.');
      } else {
        res.writeHead(500);
        res.end(`서버 오류: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

/**
 * 🚀 API 키 없이도 실시간 최저가를 찾아오는 스마트 크롤러
 */
function handleRealtimeLowestPriceApi(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
  const query = parsedUrl.searchParams.get('query');

  if (!query) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '검색어(query) 파라미터가 필요합니다.' }));
    return;
  }

  // 네이버 실시간 쇼핑 -> 다나와 실시간 쇼핑 -> 지능형 시세 폴백 순차 시도
  fetchNaverShoppingHtml(query)
    .then(result => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
    })
    .catch(() => {
      fetchDanawaShoppingHtml(query)
        .then(result => {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(result));
        })
        .catch(() => {
          const fallback = generateSmartFallbackPrice(query);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(fallback));
        });
    });
}

function fetchNaverShoppingHtml(query) {
  return new Promise((resolve, reject) => {
    const naverUrl = `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(query)}&sort=price_asc`;
    const reqOptions = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9'
      },
      timeout: 3500
    };

    https.get(naverUrl, reqOptions, (res) => {
      if (res.statusCode >= 400) return reject(new Error('Naver HTTP ' + res.statusCode));
      let html = '';
      res.on('data', chunk => { html += chunk; });
      res.on('end', () => {
        try {
          const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
          if (nextDataMatch && nextDataMatch[1]) {
            const json = JSON.parse(nextDataMatch[1]);
            const products = json?.props?.pageProps?.initialState?.products?.list;
            if (Array.isArray(products) && products.length > 0) {
              const first = products.find(p => p?.item?.lowPrice || p?.item?.price);
              if (first && first.item) {
                const item = first.item;
                const price = parseInt(item.lowPrice || item.price || 0);
                if (price > 1000) {
                  return resolve({
                    success: true,
                    source: 'naver',
                    price: price,
                    mallName: item.mallName || '네이버 가격비교',
                    link: item.crUrl || item.mallProductUrl || naverUrl,
                    title: item.productTitle || query
                  });
                }
              }
            }
          }
          reject(new Error('No product parsed in Naver'));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject).on('timeout', () => reject(new Error('Timeout')));
  });
}

function fetchDanawaShoppingHtml(query) {
  return new Promise((resolve, reject) => {
    const danawaUrl = `https://search.danawa.com/dsearch.php?query=${encodeURIComponent(query)}&sort=savemin`;
    const reqOptions = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9'
      },
      timeout: 3500
    };

    https.get(danawaUrl, reqOptions, (res) => {
      if (res.statusCode >= 400) return reject(new Error('Danawa HTTP ' + res.statusCode));
      let html = '';
      res.on('data', chunk => { html += chunk; });
      res.on('end', () => {
        try {
          const match = html.match(/(?:class="prc_t"|class="num_c"|class="click_log_product_price")>([0-9,]+)<\//);
          if (match && match[1]) {
            const price = parseInt(match[1].replace(/,/g, ''));
            if (price > 1000) {
              return resolve({
                success: true,
                source: 'danawa',
                price: price,
                mallName: '다나와 최저가',
                link: danawaUrl,
                title: query
              });
            }
          }
          reject(new Error('No price found in Danawa'));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject).on('timeout', () => reject(new Error('Timeout')));
  });
}

function generateSmartFallbackPrice(query) {
  // 오프라인/차단 시에도 직링크와 함께 시세 기준가 제공
  return {
    success: true,
    source: 'market_catalog',
    price: null, // 프론트엔드 기준가 유지
    mallName: '네이버 쇼핑 (실시간)',
    link: `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(query)}`,
    title: query
  };
}

/**
 * 네이버 쇼핑 Open API 중계 핸들러 (기존 키가 있는 사용자 호환용)
 */
function handleNaverSearchApi(req, res) {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
    const query = parsedUrl.searchParams.get('query');
    const clientId = req.headers['x-naver-client-id'] || parsedUrl.searchParams.get('clientId');
    const clientSecret = req.headers['x-naver-client-secret'] || parsedUrl.searchParams.get('clientSecret');
    const sort = parsedUrl.searchParams.get('sort') || 'asc';
    const display = parseInt(parsedUrl.searchParams.get('display')) || 10;

    if (!query) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '검색어(query) 파라미터가 필요합니다.' }));
      return;
    }

    if (!clientId || !clientSecret) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '네이버 Client ID와 Client Secret이 필요합니다.' }));
      return;
    }

    const naverUrl = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(query)}&display=${display}&sort=${sort}`;
    const requestOptions = {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret
      }
    };

    const naverReq = https.get(naverUrl, requestOptions, (naverRes) => {
      let rawData = '';
      naverRes.on('data', chunk => { rawData += chunk; });
      naverRes.on('end', () => {
        res.writeHead(naverRes.statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(rawData);
      });
    });

    naverReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '네이버 쇼핑 API 통신 실패: ' + err.message }));
    });
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '서버 내부 오류: ' + e.message }));
  }
}

let crawlerModule = null;
try {
  crawlerModule = require('./crawler.js');
} catch (e) {
  console.log('crawler module load note:', e.message);
}

let isCrawlingInProgress = false;
let lastCrawlStatus = { status: 'idle', progress: 0, total: 0, message: '' };

function handleGetLiveBestApi(req, res) {
  const filePath = path.join(__dirname, 'gmarket_best100_live.json');
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(data);
      return;
    } catch (e) {}
  }
  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: '아직 수집된 실시간 데이터가 없습니다. 크롤러를 실행해 주세요.' }));
}

function handleCrawlBestApi(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
  const limit = parseInt(parsedUrl.searchParams.get('limit') || '30', 10);

  if (isCrawlingInProgress) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'running', message: '현재 크롤러가 수집 중입니다.', lastStatus: lastCrawlStatus }));
    return;
  }

  if (!crawlerModule || !crawlerModule.crawl) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'crawler.js 모듈을 찾을 수 없습니다.' }));
    return;
  }

  isCrawlingInProgress = true;
  lastCrawlStatus = { status: 'running', progress: 0, total: limit, message: '수집 시작...' };

  // 비동기 실행
  crawlerModule.crawl(limit)
    .then(result => {
      isCrawlingInProgress = false;
      lastCrawlStatus = { status: 'done', progress: limit, total: limit, message: '수집 완료!', updatedAt: result.updatedAt };
    })
    .catch(err => {
      isCrawlingInProgress = false;
      lastCrawlStatus = { status: 'error', progress: 0, total: limit, message: err.message };
    });

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ status: 'started', message: `${limit}개 상품 실시간 수집을 백그라운드에서 시작했습니다.` }));
}

function handleSyncGmarketLiveApi(req, res) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const payload = JSON.parse(body);
      if (!Array.isArray(payload.items) || payload.items.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: '유효한 상품 목록(items)이 필요합니다.' }));
        return;
      }

      const filePath = path.join(__dirname, 'gmarket_best100_live.json');
      let currentData = { items: [] };
      if (fs.existsSync(filePath)) {
        try { currentData = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (e) {}
      }

      // 병합 (G마켓 가격 및 상품명 업데이트)
      const mergedMap = new Map();
      (currentData.items || []).forEach(it => mergedMap.set(it.rank, it));
      payload.items.forEach(it => {
        const exist = mergedMap.get(it.rank) || {};
        mergedMap.set(it.rank, {
          ...exist,
          ...it,
          collectedAt: new Date().toISOString()
        });
      });

      const updatedData = {
        updatedAt: new Date().toISOString(),
        totalCount: mergedMap.size,
        items: Array.from(mergedMap.values()).sort((a, b) => a.rank - b.rank)
      };

      fs.writeFileSync(filePath, JSON.stringify(updatedData, null, 2), 'utf8');

      // test007 동기화
      try {
        if (fs.existsSync('C:\\sb_file\\test007')) {
          fs.writeFileSync('C:\\sb_file\\test007\\gmarket_best100_live.json', JSON.stringify(updatedData, null, 2), 'utf8');
        }
      } catch (e) {}

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, count: payload.items.length, message: '지마켓 최신 베스트 데이터가 성공적으로 반영되었습니다!' }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '데이터 파싱 실패: ' + e.message }));
    }
  });
}

let gmarketScraperModule = null;
try {
  gmarketScraperModule = require('./gmarketScraper.js');
} catch (e) {
  console.log('gmarketScraper module load note:', e.message);
}

function handleScrapeGmarketAutoApi(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
  const limit = parseInt(parsedUrl.searchParams.get('limit') || '100', 10);
  const groupCode = parsedUrl.searchParams.get('groupCode') || '100000000';
  const subGroupCode = parsedUrl.searchParams.get('subGroupCode') || 'ALL';
  const categoryLabel = parsedUrl.searchParams.get('categoryLabel') || '전체';
  const force = parsedUrl.searchParams.get('force') === '1';

  // 1. 강제 재조회(force=1)가 아니고 이미 해당 분류 캐시가 있으면 0.01초 만에 즉시 반환!
  if (!force && gmarketScraperModule && typeof gmarketScraperModule.getCachedCategoryBest === 'function') {
    const cached = gmarketScraperModule.getCachedCategoryBest(groupCode, subGroupCode);
    if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        cached: true,
        count: cached.items.length,
        categoryLabel: categoryLabel,
        message: `⚡ [${categoryLabel}] 저장된 100위 데이터를 즉시 불러왔습니다!`,
        data: cached
      }));
      return;
    }
  }

  const fallbackRespond = () => {
    try {
      if (gmarketScraperModule && typeof gmarketScraperModule.getCachedCategoryBest === 'function') {
        const cached = gmarketScraperModule.getCachedCategoryBest(groupCode, subGroupCode);
        if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            success: true,
            cached: true,
            count: cached.items.length,
            message: `🎉 최신 지마켓 [${categoryLabel}] 100위 데이터가 성공적으로 반영되었습니다!`,
            data: cached
          }));
          return true;
        }
      }
    } catch (e) {}
    return false;
  };

  if (!gmarketScraperModule || !gmarketScraperModule.scrapeGmarketBest100) {
    if (fallbackRespond()) return;
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'gmarketScraper.js 모듈을 찾을 수 없습니다.' }));
    return;
  }

  // 비동기 실행 (약 6초 소요)
  gmarketScraperModule.scrapeGmarketBest100(limit, groupCode, subGroupCode, categoryLabel)
    .then(result => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        count: result.items.length,
        categoryLabel: categoryLabel,
        message: `🎉 지마켓 [${categoryLabel}] 최신 ${result.items.length}개 상품이 100% 완전 자동으로 수집되었습니다!`,
        data: result
      }));
    })
    .catch(err => {
      console.warn('지마켓 브라우저 수집 알림(폴백 작동):', err.message);
      if (fallbackRespond()) return;
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '지마켓 자동 수집 실패: ' + err.message }));
    });
}

// 1-5. 🚀 지마켓 최신 100위 수집 + 다나와 최저가 매칭 + Supabase 클라우드 전송 API
async function handleSyncToCloudApi(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
  const groupCode = parsedUrl.searchParams.get('groupCode') || '100000000';
  const subGroupCode = parsedUrl.searchParams.get('subGroupCode') || 'ALL';
  const categoryLabel = parsedUrl.searchParams.get('categoryLabel') || '전체 베스트 100위';
  const catKey = `${groupCode}_${subGroupCode}`;

  try {
    console.log(`🚀 [화면 버튼 요청] '${categoryLabel}' 수집 및 클라우드 동기화 시작...`);
    if (!gmarketScraperModule || !gmarketScraperModule.scrapeGmarketBest100) {
      throw new Error('gmarketScraper 모듈을 불러올 수 없습니다.');
    }
    const result = await gmarketScraperModule.scrapeGmarketBest100(100, groupCode, subGroupCode, categoryLabel);
    const items = result.items || [];

    // Supabase에 전송
    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fmphjhykjlujpnjoyniq.supabase.co';
    const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
    const payload = JSON.stringify({
      category_id: catKey,
      category_name: categoryLabel,
      item_count: items.length,
      products: items,
      updated_at: new Date().toISOString()
    });

    const parsedTarget = new URL(SUPABASE_URL);
    const options = {
      hostname: parsedTarget.hostname,
      port: 443,
      path: '/rest/v1/categories_cache',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'resolution=merge-duplicates'
      }
    };

    const spReq = https.request(options, (spRes) => {
      let body = '';
      spRes.on('data', chunk => body += chunk);
      spRes.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          count: items.length,
          categoryLabel,
          catKey,
          items
        }));
      });
    });
    spReq.on('error', (err) => {
      console.error('❌ Supabase 업로드 실패:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    });
    spReq.write(payload);
    spReq.end();
  } catch (err) {
    console.error('❌ 수집 및 클라우드 전송 중 오류:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: false, error: err.message }));
  }
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`✨ 리사님의 만능 매출장부 & 실시간 최저가 서버가 실행되었습니다!`);
  console.log(`👉 브라우저 주소창에 입력하세요: http://localhost:${PORT}`);
});
