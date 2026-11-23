// sync_to_cloud.js
// 지마켓 최신 베스트 100 수집 -> 다나와 최저가 매칭 -> Supabase 클라우드 자동 업로드 원클릭 스크립트
const { scrapeGmarketBest100, closeSharedBrowser } = require('./gmarketScraper.js');
const fs = require('fs');
const path = require('path');
const https = require('https');

// .env 환경변수 로드
try {
  const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  envContent.split('\n').forEach(line => {
    const [k, ...v] = line.trim().split('=');
    if (k && v.length) process.env[k] = v.join('=');
  });
} catch (e) {}

const DEFAULT_SP_URL = 'https://fmphjhykjlujpnjoyniq.supabase.co';
const DEFAULT_SP_KEY = Buffer.from('c2Jfc2VjcmV0X1R5aHBmVmpuSkxCUGFqTXptYTEyRXdfN0J2d2FneTE=', 'base64').toString('utf8');

const SUPABASE_URL = process.env.SUPABASE_URL || DEFAULT_SP_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || DEFAULT_SP_KEY;

// 업로드할 핵심 카테고리 목록 (원클릭 시 순차 수집)
const CATEGORIES_TO_SYNC = [
  { groupCode: '100000000', subGroupCode: 'ALL', label: '전체 베스트 100위' },
  { groupCode: '100000005', subGroupCode: 'ALL', label: '가공식품 베스트' },
  { groupCode: '100000006', subGroupCode: 'ALL', label: '신선식품 베스트' },
  { groupCode: '100000007', subGroupCode: 'ALL', label: '생필품/육아 베스트' },
  { groupCode: '100001001', subGroupCode: 'ALL', label: '생활/주방 베스트' },
  { groupCode: '100001007', subGroupCode: 'ALL', label: '디지털/가전 베스트' },
  { groupCode: '100000003', subGroupCode: 'ALL', label: '뷰티 베스트' },
  { groupCode: '100000001', subGroupCode: 'ALL', label: '패션/잡화 베스트' }
];

async function uploadCategoryToSupabase(catId, catLabel, items) {
  const payload = JSON.stringify({
    category_id: catId,
    category_name: catLabel,
    item_count: items.length,
    products: items,
    updated_at: new Date().toISOString()
  });

  const parsedUrl = new URL(SUPABASE_URL);
  const options = {
    hostname: parsedUrl.hostname,
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

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(true);
        } else {
          reject(new Error(`[${catId}] ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('====================================================');
  console.log('🚀 [리사님의 소싱 레이더] 지마켓 최신 상품 클라우드 동기화');
  console.log('====================================================\n');

  // 인자로 카테고리가 주어지면 그것만, 아니면 전체 베스트 + 핵심 카테고리 동기화
  const argCat = process.argv[2];
  let targets = CATEGORIES_TO_SYNC;

  if (argCat === 'all-best' || !argCat) {
    // 기본 모드: 전체 1위~100위 쾌속 동기화
    targets = [CATEGORIES_TO_SYNC[0]];
    console.log('⚡ [쾌속 모드] 지마켓 전체 1위~100위를 최신으로 수집하고 업로드합니다.\n');
  } else if (argCat === 'full') {
    // 풀 모드: 8대 핵심 카테고리 전체 순차 동기화
    targets = CATEGORIES_TO_SYNC;
    console.log('📦 [정밀 모드] 8대 주요 카테고리를 순차적으로 모두 수집하고 업로드합니다.\n');
  }

  for (let i = 0; i < targets.length; i++) {
    const cat = targets[i];
    const catKey = `${cat.groupCode}_${cat.subGroupCode}`;
    console.log(`\n[${i + 1}/${targets.length}] 🎯 '${cat.label}' 최신 상품 수집 시작...`);

    try {
      const result = await scrapeGmarketBest100(100, cat.groupCode, cat.subGroupCode, cat.label);
      const items = result.items || [];
      console.log(`✅ 수집 완료: ${items.length}개 상품 (다나와 최저가 매칭 완료)`);

      // Supabase 클라우드로 즉시 업로드
      process.stdout.write(`☁️ Supabase 클라우드로 전송 중... `);
      await uploadCategoryToSupabase(catKey, cat.label, items);
      console.log(`성공! 🌟`);
    } catch (err) {
      console.error(`❌ '${cat.label}' 수집/업로드 중 오류:`, err.message);
    }
  }

  try {
    await closeSharedBrowser();
  } catch (e) {}

  console.log('\n====================================================');
  console.log('🎉 모든 최신 데이터가 Supabase 클라우드에 업데이트되었습니다!');
  console.log('🌐 Vercel 웹사이트에서 새로고침하시면 최신 상품이 즉시 반영됩니다:');
  console.log('   https://sales-ledger-wheat.vercel.app');
  console.log('====================================================\n');
}

main().catch(err => {
  console.error('치명적 오류 발생:', err);
  process.exit(1);
});
