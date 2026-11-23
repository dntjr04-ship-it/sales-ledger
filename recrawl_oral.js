const fs = require('fs');
const { fetchDanawaQuery } = require('./crawler.js');

async function run() {
  const cache = JSON.parse(fs.readFileSync('gmarket_categories_cache.json', 'utf8'));
  const oral = cache['100000007_200001003'];
  if (!oral) return console.log('구강 카테고리 없음');

  console.log('구강/위생용품 다나와 재매칭 시작 (총 ' + oral.items.length + '개)...');

  // 리사님이 보신 상위 35개 우선 정밀 매칭
  for (let i = 0; i < Math.min(40, oral.items.length); i++) {
    const it = oral.items[i];
    const kw = it.cleanKeyword || it.name;
    try {
      const danawaRes = await fetchDanawaQuery(kw, it.gmarketPrice);
      if (danawaRes && danawaRes.lowestPrice > 0 && danawaRes.url) {
        it.danawaPrice = danawaRes.lowestPrice;
        it.lowestPrice = danawaRes.lowestPrice;
        it.danawaDetailUrl = danawaRes.url;
        it.danawaUrl = danawaRes.url;
        it.lowestUrl = danawaRes.url;
        it.isDanawaDirect = true;
        it.sourcingTitle = danawaRes.name || it.name;
        it.margin = it.gmarketPrice - danawaRes.lowestPrice;
        it.marginRate = parseFloat(((it.margin / it.gmarketPrice) * 100).toFixed(1));
        console.log(`[${it.rank}위] ${kw} -> ${it.danawaPrice}원 (${it.danawaDetailUrl})`);
      } else {
        it.danawaDetailUrl = it.danawaSearchUrl;
        it.danawaUrl = it.danawaSearchUrl;
        it.lowestUrl = it.danawaSearchUrl;
        it.isDanawaDirect = false;
        console.log(`[${it.rank}위] ${kw} -> 상세 매칭 없음(검색 결과로 연결)`);
      }
    } catch(e) {
      console.log(`[${it.rank}위] 오류:`, e.message);
    }
  }

  fs.writeFileSync('gmarket_categories_cache.json', JSON.stringify(cache, null, 2), 'utf8');
  console.log('🎉 구강/위생용품 재매칭 저장 완료!');
}

run();
