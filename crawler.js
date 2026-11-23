/**
 * ==============================================================================
 * 🚀 G마켓 베스트 100 & 다나와 실시간 최저가 자동 수집기 (crawler.js)
 * ------------------------------------------------------------------------------
 * - [핵심] 다나와 검색 결과의 각 옵션별 <a href="...pcode=XXXXX">...<span class="text-px16">가격원</span></a>
 *   태그에서 (pcode, price)를 한 쌍(Pair)으로 추출합니다.
 * - 따라서 화면에 표시되는 '다나와 최저가'와 '[🔗 최저가 상세]' 버튼을 눌렀을 때 열리는 페이지의 가격이
 *   100% 일치합니다!
 * ==============================================================================
 */

const https = require('https');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function getWithRedirect(url) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(url);
      const req = https.get({
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate',
          'Referer': 'https://www.danawa.com/'
        },
        timeout: 6000
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
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    } catch (err) {
      reject(err);
    }
  });
}

function parseDanawaLi(liHtml) {
  const pcodeMatch = liHtml.match(/data-product-seq="(\d+)"/);
  if (!pcodeMatch) return null;
  const mainPcode = pcodeMatch[1];

  const titleMatches = [...liHtml.matchAll(/<a[^>]*href="[^"]*prod\.danawa\.com\/info\/\?pcode=\d+[^"]*"[^>]*>([\s\S]*?)<\/a>/g)];
  let title = '';
  for (const tm of titleMatches) {
    const raw = tm[1].replace(/<[^>]+>/g, '').trim();
    if (raw && !raw.includes('이미지 보기') && raw.length > 3) {
      title = raw;
      break;
    }
  }

  // 핵심: 각 옵션 링크(<a href="...pcode=XXXXX">)와 그 안의 가격(<span class="text-px16">가격원</span>)을 1:1 쌍(Pair)으로 정확히 추출!
  const optionPairs = [];
  const aTagMatches = [...liHtml.matchAll(/<a[^>]+href="([^"]*pcode=(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/g)];
  for (const m of aTagMatches) {
    const optPcode = m[2];
    const innerHtml = m[3];
    const priceMatch = innerHtml.match(/class="[^"]*text-px16[^"]*"[^>]*>([0-9,]+)\s*원/) ||
                       innerHtml.match(/<em class="num_c">([0-9,]+)<\/em>/);
    if (priceMatch) {
      const priceVal = parseInt(priceMatch[1].replace(/,/g, ''), 10);
      if (priceVal >= 1000) {
        optionPairs.push({
          pcode: optPcode,
          price: priceVal,
          url: `https://prod.danawa.com/info/?pcode=${optPcode}`
        });
      }
    }
  }

  // 만약 <a> 태그 내부 매칭이 안 된 구형 레이아웃인 경우 mainPcode와 연결
  if (optionPairs.length === 0) {
    const modernMatches = [...liHtml.matchAll(/class="[^"]*text-px16[^"]*"[^>]*>([0-9,]+)\s*원/g)];
    modernMatches.forEach(m => {
      const val = parseInt(m[1].replace(/,/g, ''), 10);
      if (val >= 1000) {
        optionPairs.push({
          pcode: mainPcode,
          price: val,
          url: `https://prod.danawa.com/info/?pcode=${mainPcode}`
        });
      }
    });
  }

  if (optionPairs.length === 0) return null;

  return {
    mainPcode,
    title,
    optionPairs
  };
}

function isTitleRelevant(candidateTitle, keyword) {
  if (!candidateTitle || !keyword) return true;
  const cleanTitle = candidateTitle.toLowerCase().replace(/\s+/g, '');
  const kwTokens = keyword
    .toLowerCase()
    .replace(/\d+(?:kg|g|ml|l|t|매|롤|캔|봉|병|팩|개|구|마리|미|박스|정|포|종|원|만원권)/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !['무조건', '첫출하', '세일', '특가', '당일발송', '신선집중', '인기', '베스트', '모음', '세트'].includes(w));

  if (kwTokens.length === 0) return false;
  return kwTokens.some(token => cleanTitle.includes(token));
}

function getFallbackTwoWordQueries(keyword) {
  const words = (keyword || '')
    .replace(/\d+(?:kg|g|ml|L|T|매|롤|캔|봉|병|팩|개|구|마리|미|박스|정|포|원권|만원권)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length >= 2 && !['무조건', '첫출하', '세일', '특가', '당일발송', '신선집중'].includes(w));

  const fallbacks = [];
  if (words.length >= 2) {
    fallbacks.push(words.slice(0, 2).join(' '));
    fallbacks.push(words.slice(-2).join(' '));
  }
  return [...new Set(fallbacks)].filter(q => q && q !== keyword);
}

async function searchDanawaCandidates(query) {
  const url = `https://search.danawa.com/?query=${encodeURIComponent(query)}`;
  const html = await getWithRedirect(url);
  const liMatches = [...html.matchAll(/<li[^>]*data-product-seq="(\d+)"[\s\S]*?<\/li>/g)];
  const candidates = [];
  for (let j = 0; j < Math.min(5, liMatches.length); j++) {
    const parsed = parseDanawaLi(liMatches[j][0]);
    if (parsed && parsed.optionPairs.length > 0 && isTitleRelevant(parsed.title, query)) {
      candidates.push(parsed);
    }
  }
  return candidates;
}

async function fetchDanawaQuery(keyword, targetGmarketPrice = 10000) {
  try {
    let candidates = await searchDanawaCandidates(keyword);

    if (candidates.length === 0) {
      const fallbacks = getFallbackTwoWordQueries(keyword);
      for (const fb of fallbacks) {
        candidates = await searchDanawaCandidates(fb);
        if (candidates.length > 0) break;
      }
    }

    if (candidates.length === 0) return null;

    // 1순위: 첫 번째(가장 정확도 높은) 후보 상품의 옵션 쌍(optionPairs) 중에서
    // 지마켓 판매가의 65% ~ 180% 범위에 있는 동일 묶음 규격 최저가 쌍(pcode + price) 선택!
    for (const c of candidates) {
      const realisticPairs = c.optionPairs.filter(pair => pair.price >= targetGmarketPrice * 0.65 && pair.price <= targetGmarketPrice * 1.8);
      if (realisticPairs.length > 0) {
        // 해당 범위 내에서 가장 저렴한 옵션의 (pcode, price) 쌍을 그대로 반환!
        realisticPairs.sort((a, b) => a.price - b.price);
        const bestPair = realisticPairs[0];
        return {
          name: c.title || keyword,
          lowestPrice: bestPair.price,
          url: bestPair.url,
          pcode: bestPair.pcode
        };
      }
    }

    // 2순위: 만약 옵션들이 지마켓 가격과 차이가 있다면, 지마켓 가격과 가장 가까운 옵션의 (pcode, price) 쌍을 선택하되,
    // 단품(60% 미만) 오매칭으로 가짜 고마진이 나오는 상품은 카탈로그 미매칭(검색창 연결)으로 안전 처리!
    const top = candidates[0];
    const sortedByDiff = [...top.optionPairs].sort((a, b) => Math.abs(a.price - targetGmarketPrice) - Math.abs(b.price - targetGmarketPrice));
    const closestPair = sortedByDiff[0];

    if (closestPair && closestPair.price >= targetGmarketPrice * 0.65) {
      return {
        name: top.title || keyword,
        lowestPrice: closestPair.price,
        url: closestPair.url,
        pcode: closestPair.pcode
      };
    }

    return null;
  } catch (err) {
    return null;
  }
}

async function enrichItemsWithDanawa(items, concurrency = 25, forceReenrich = false) {
  const results = [...items];
  let idx = 0;

  async function worker() {
    while (idx < results.length) {
      const currentIdx = idx++;
      const item = results[currentIdx];

      if (!forceReenrich && item.isDanawaDirect && item.danawaDetailUrl && item.danawaDetailUrl.includes('prod.danawa.com')) {
        continue;
      }

      const queryKw = item.cleanKeyword || item.searchKw || item.name;
      const gPrice = item.gmarketPrice || 10000;
      const danawaSearchUrl = `https://search.danawa.com/dsearch.php?query=${encodeURIComponent(queryKw)}`;

      const danawaResult = await fetchDanawaQuery(queryKw, gPrice);

      if (danawaResult && danawaResult.pcode && danawaResult.lowestPrice > 0) {
        // 중요: 다나와 표시 가격(dPrice)과 상세 링크(danawaResult.url)가 반드시 동일한 옵션 쌍(pcode, price)에서 나옴!
        const dPrice = danawaResult.lowestPrice;
        const margin = gPrice - dPrice;
        const marginRate = gPrice > 0 ? parseFloat(((margin / gPrice) * 100).toFixed(1)) : 0;

        results[currentIdx] = {
          ...item,
          danawaPrice: dPrice,
          lowestPrice: dPrice,
          danawaSearchUrl: danawaSearchUrl,
          danawaDetailUrl: danawaResult.url,
          danawaUrl: danawaResult.url,
          lowestUrl: danawaResult.url,
          lowestPlatform: dPrice < gPrice ? '다나와' : '지마켓단독',
          sourcingTitle: danawaResult.name || item.name,
          margin: margin,
          marginRate: marginRate,
          isDirectMatch: true,
          isDanawaDirect: true,
          collectedAt: new Date().toISOString()
        };
      } else {
        results[currentIdx] = {
          ...item,
          danawaPrice: gPrice,
          lowestPrice: gPrice,
          danawaSearchUrl: danawaSearchUrl,
          danawaDetailUrl: danawaSearchUrl,
          danawaUrl: danawaSearchUrl,
          lowestUrl: danawaSearchUrl,
          lowestPlatform: '지마켓단독',
          sourcingTitle: item.name,
          margin: 0,
          marginRate: 0,
          isDirectMatch: false,
          isDanawaDirect: false,
          collectedAt: new Date().toISOString()
        };
      }
    }
  }

  const workers = [];
  for (let w = 0; w < Math.min(concurrency, results.length); w++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

async function crawl(limit = 100) {
  const liveJsonPath = path.join(__dirname, 'gmarket_best100_live.json');
  let allItems = [];
  if (fs.existsSync(liveJsonPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(liveJsonPath, 'utf8'));
      if (Array.isArray(parsed.items)) allItems = parsed.items;
    } catch (e) {}
  }

  const targetCount = Math.min(limit, allItems.length);
  const targetSlice = allItems.slice(0, targetCount);
  const enrichedSlice = await enrichItemsWithDanawa(targetSlice, 25, true);
  const updatedItems = [...enrichedSlice, ...allItems.slice(targetCount)];

  const outData = {
    updatedAt: new Date().toISOString(),
    totalCount: updatedItems.length,
    items: updatedItems
  };

  fs.writeFileSync(liveJsonPath, JSON.stringify(outData, null, 2), 'utf8');
  return outData;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let limit = 100;
  const limitIdx = args.indexOf('--limit');
  if (limitIdx !== -1 && args[limitIdx + 1]) {
    limit = parseInt(args[limitIdx + 1], 10) || 100;
  }
  crawl(limit).catch(console.error);
}

module.exports = { crawl, fetchDanawaQuery, enrichItemsWithDanawa };
