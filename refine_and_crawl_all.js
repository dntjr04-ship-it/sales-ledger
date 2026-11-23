const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

function getWithRedirect(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.get({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.danawa.com/'
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let loc = res.headers.location;
        if (loc.startsWith('/')) loc = 'https://' + parsed.hostname + loc;
        return getWithRedirect(loc).then(resolve).catch(reject);
      }

      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const encoding = res.headers['content-encoding'];
        if (encoding === 'gzip') {
          zlib.gunzip(buffer, (err, decoded) => {
            if (err) reject(err);
            else resolve(decoded.toString('utf8'));
          });
        } else if (encoding === 'deflate') {
          zlib.inflate(buffer, (err, decoded) => {
            if (err) reject(err);
            else resolve(decoded.toString('utf8'));
          });
        } else {
          resolve(buffer.toString('utf8'));
        }
      });
    });
    req.on('error', reject);
  });
}

function cleanProductKeyword(name) {
  if (!name) return '';

  // 1. Model code extraction
  const modelMatch = name.match(/([A-Z0-9]{2,}-[A-Z0-9]{3,}[A-Z0-9]*)/i);
  if (modelMatch && !modelMatch[1].toLowerCase().includes('1+1')) {
    return modelMatch[1];
  }

  // 2. Remove bracketed text: (..), [..], <..>
  let clean = name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/<[^>]*>/g, ' ');

  // 3. Remove cut-off brackets
  clean = clean.replace(/[\(\[\<][^\)\]\>]*$/, ' ');

  // 4. Split before "+" if present
  if (clean.includes('+')) {
    clean = clean.split('+')[0];
  }

  // 5. Remove marketing noise
  const noise = [
    '사은품', '증정', '특가', '1+1', '주문폭주', '예약발송', '창고대방출',
    '네이버페이', '포인트', '골라담기', '시리즈', '모음전', '첫수확', '로얄과',
    '신선직송', '단독', '앵콜행사', '선착순', '토너포함', '무료배송', '당일발송',
    '쿠폰', '할인', '행사', '라이브', '본사직영', '공식', '정품', '국내산', 'GAP획득',
    '랜덤', '가정용', '무라벨', '선택구매', '패밀리박스', '전국무료배송', '고객감사특가',
    '신세계강남점', '현대홈쇼핑', '김장용', '초특가', '핫딜', '옵션선택', '대용량',
    '기타브랜드', '브랜드', '프리미엄'
  ];

  for (const w of noise) {
    clean = clean.split(w).join(' ');
  }

  // 6. Clean dangling special chars and spaces
  clean = clean.replace(/[,\/\|\&~\!@#\$%\^_\=\+]/g, ' ')
               .replace(/\s+/g, ' ')
               .trim();

  // 7. Strip trailing single letters like "x", "X"
  clean = clean.replace(/\s+[xX]$/, '').trim();

  // 8. If too long, pick meaningful first 3~4 tokens
  const tokens = clean.split(' ').filter(t => t.length > 0);
  if (tokens.length >= 4) {
    if (tokens[2].match(/\d+(g|kg|ml|L|T|팩|입|매|롤|캔|봉|병|미)/i)) {
      return tokens.slice(0, 3).join(' ');
    } else if (tokens[3].match(/\d+(g|kg|ml|L|T|팩|입|매|롤|캔|봉|병|미)/i)) {
      return tokens.slice(0, 4).join(' ');
    }
    return tokens.slice(0, 3).join(' ');
  }

  return clean;
}

function parseDanawaLi(liHtml) {
  const pcodeMatch = liHtml.match(/data-product-seq="(\d+)"/);
  if (!pcodeMatch) return null;
  const pcode = pcodeMatch[1];

  // Title
  const titleMatches = [...liHtml.matchAll(/<a[^>]*href="[^"]*prod\.danawa\.com\/info\/\?pcode=\d+[^"]*"[^>]*>([\s\S]*?)<\/a>/g)];
  let title = '';
  for (const tm of titleMatches) {
    const raw = tm[1].replace(/<[^>]+>/g, '').trim();
    if (raw && !raw.includes('이미지 보기') && raw.length > 3) {
      title = raw;
      break;
    }
  }

  // Prices
  const prices = [];
  const modernMatches = [...liHtml.matchAll(/class="[^"]*text-px16[^"]*"[^>]*>([0-9,]+)\s*원/g)];
  modernMatches.forEach(m => prices.push(parseInt(m[1].replace(/,/g, ''), 10)));

  const legacyMatches = [...liHtml.matchAll(/<em class="num_c">([0-9,]+)<\/em>/g)];
  legacyMatches.forEach(m => prices.push(parseInt(m[1].replace(/,/g, ''), 10)));

  if (prices.length === 0) {
    const anyWon = [...liHtml.matchAll(/>([0-9,]{3,})\s*원</g)];
    anyWon.forEach(m => {
      const val = parseInt(m[1].replace(/,/g, ''), 10);
      if (val >= 1000) prices.push(val);
    });
  }

  const validPrices = prices.filter(p => p >= 1000);
  const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : null;

  return {
    pcode,
    title,
    minPrice,
    detailUrl: `https://prod.danawa.com/info/?pcode=${pcode}`
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  const jsonPath = path.join(__dirname, 'gmarket_best100_live.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  console.log(`🚀 총 100개 상품 다나와 검색 결과 기반 정밀 매칭 시작...`);

  let matchedCount = 0;

  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    
    // Calculate best clean keyword
    let cleanKw = cleanProductKeyword(item.name);
    // Edge case refinements
    if (item.name.includes('SL-M2030W')) cleanKw = 'SL-M2030W';
    if (item.name.includes('14-HU0055TU')) cleanKw = '14-HU0055TU';
    if (item.name.includes('듀얼센스') && item.name.includes('화이트')) cleanKw = '듀얼센스 화이트';
    if (item.name.includes('듀얼센스') && item.name.includes('미드나')) cleanKw = '듀얼센스 미드나이트 블랙';
    if (item.name.includes('스탠리') && item.name.includes('플립 스트로')) cleanKw = '스탠리 아이스플로우 플립 스트로 2.0';
    if (item.name.includes('초코파이')) cleanKw = '오리온 초코파이';
    if (item.name.includes('코디 순수 3겹')) cleanKw = '코디 순수 3겹 데코';
    if (item.name.includes('크리넥스 3겹 데코앤소프트')) cleanKw = '크리넥스 3겹 데코앤소프트';
    if (item.name.includes('맥심') && item.name.includes('화이트골드')) cleanKw = '맥심 화이트골드 400T';
    if (item.name.includes('맥심') && item.name.includes('모카골드')) cleanKw = '맥심 모카골드 400T';
    if (item.name.includes('스파클') && item.name.includes('2L')) cleanKw = '스파클 생수 2L';
    if (item.name.includes('스파클') && item.name.includes('500ml')) cleanKw = '스파클 생수 500ml';
    if (item.name.includes('코카콜라 제로') && item.name.includes('355ml')) cleanKw = '코카콜라 제로 355ml 24캔';
    if (item.name.includes('신라면') && item.name.includes('새우탕')) cleanKw = '신라면 새우탕';
    if (item.name.includes('비비고 육개장')) cleanKw = '비비고 육개장 500g';
    if (item.name.includes('대건명가 돼지국밥')) cleanKw = '대건명가 돼지국밥 630g 5팩';

    item.cleanKeyword = cleanKw;
    const targetPrice = item.gmarketPrice || 10000;

    let foundCandidate = null;

    try {
      const url = `https://search.danawa.com/?query=${encodeURIComponent(cleanKw)}`;
      const html = await getWithRedirect(url);
      const liMatches = [...html.matchAll(/<li[^>]*data-product-seq="(\d+)"[\s\S]*?<\/li>/g)];
      
      const candidates = [];
      for (let j = 0; j < Math.min(5, liMatches.length); j++) {
        const parsed = parseDanawaLi(liMatches[j][0]);
        if (parsed && parsed.minPrice) {
          candidates.push(parsed);
        }
      }

      // Filter within reasonable price range (30% to 220% of Gmarket price)
      const reasonable = candidates.filter(c => c.minPrice >= targetPrice * 0.3 && c.minPrice <= targetPrice * 2.2);
      if (reasonable.length > 0) {
        foundCandidate = reasonable[0];
      } else if (candidates.length > 0) {
        foundCandidate = candidates[0];
      }
    } catch (e) {
      // ignore
    }

    const danawaSearchUrl = `https://search.danawa.com/dsearch.php?query=${encodeURIComponent(cleanKw)}`;

    if (foundCandidate && foundCandidate.minPrice) {
      matchedCount++;
      item.danawaDetailUrl = foundCandidate.detailUrl;
      item.danawaUrl = foundCandidate.detailUrl;
      item.lowestUrl = foundCandidate.detailUrl;
      item.danawaPrice = foundCandidate.minPrice;
      item.lowestPrice = foundCandidate.minPrice;
      item.lowestPlatform = '다나와';
      item.sourcingTitle = foundCandidate.title || item.name;
      item.isDirectMatch = true;
      item.isDanawaDirect = true;

      const margin = item.gmarketPrice - foundCandidate.minPrice;
      const marginRate = item.gmarketPrice > 0 ? (margin / item.gmarketPrice) * 100 : 0;
      item.margin = margin;
      item.marginRate = parseFloat(marginRate.toFixed(1));

      console.log(`[${i+1}/100] #${item.rank} ✅ 다나와 매칭 성공! "${(foundCandidate.title || '').substring(0, 22)}" | ${foundCandidate.minPrice.toLocaleString()}원 | ${foundCandidate.detailUrl}`);
    } else {
      item.danawaDetailUrl = danawaSearchUrl;
      item.danawaUrl = danawaSearchUrl;
      item.lowestUrl = danawaSearchUrl;
      item.danawaPrice = item.gmarketPrice;
      item.lowestPrice = item.gmarketPrice;
      item.lowestPlatform = '지마켓단독';
      item.sourcingTitle = item.name;
      item.isDirectMatch = false;
      item.isDanawaDirect = false;
      item.margin = 0;
      item.marginRate = 0;

      console.log(`[${i+1}/100] #${item.rank} ⚡ 다나와 카탈로그 없음 (검색창으로 연결): "${cleanKw}"`);
    }

    item.danawaSearchUrl = danawaSearchUrl;
    await sleep(150);
  }

  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');

  // Also sync to sourcingRadar.js
  const jsPath = path.join(__dirname, 'sourcingRadar.js');
  let jsContent = fs.readFileSync(jsPath, 'utf8');

  // 1. Replace GMARKET_BEST_100_BASE
  const startMarker = 'const GMARKET_BEST_100_BASE = ';
  const startIdx = jsContent.indexOf(startMarker);
  if (startIdx !== -1) {
    const endMarker = '];\n';
    const endIdx = jsContent.indexOf(endMarker, startIdx);
    if (endIdx !== -1) {
      const newJsonString = JSON.stringify(data.items, null, 2);
      jsContent = jsContent.substring(0, startIdx + startMarker.length) + newJsonString + ';\n' + jsContent.substring(endIdx + endMarker.length);
      console.log('✅ sourcingRadar.js 의 GMARKET_BEST_100_BASE 에 100개 데이터 동기화 완료!');
    }
  }

  // 2. Bump version to 20261116_v8
  jsContent = jsContent.replace(/RADAR_LIVE_DATA_VER.*=.*'20261116_v7'/g, "RADAR_LIVE_DATA_VER') !== '20261116_v8'");
  jsContent = jsContent.replace(/'20261116_v7'/g, "'20261116_v8'");

  fs.writeFileSync(jsPath, jsContent, 'utf8');
  console.log(`\n🎉 작업 완료! 총 100개 중 ${matchedCount}개 다나와 카탈로그 직링크 매칭 완료! 캐시 버전 20261116_v8 적용 완료!`);
}

run().catch(console.error);
