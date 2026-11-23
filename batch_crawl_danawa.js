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

function parseDanawaLi(liHtml) {
  const pcodeMatch = liHtml.match(/data-product-seq="(\d+)"/);
  if (!pcodeMatch) return null;
  const pcode = pcodeMatch[1];

  // Title: look for prod.danawa.com/info/?pcode=
  const titleMatches = [...liHtml.matchAll(/<a[^>]*href="[^"]*prod\.danawa\.com\/info\/\?pcode=\d+[^"]*"[^>]*>([\s\S]*?)<\/a>/g)];
  let title = '';
  for (const tm of titleMatches) {
    const raw = tm[1].replace(/<[^>]+>/g, '').trim();
    if (raw && !raw.includes('이미지 보기') && raw.length > 3) {
      title = raw;
      break;
    }
  }

  const prices = [];
  // Modern layout: <span class="text-px16">19,360원</span>
  const modernMatches = [...liHtml.matchAll(/class="[^"]*text-px16[^"]*"[^>]*>([0-9,]+)\s*원/g)];
  modernMatches.forEach(m => prices.push(parseInt(m[1].replace(/,/g, ''), 10)));

  // Legacy layout: <em class="num_c">19,360</em>
  const legacyMatches = [...liHtml.matchAll(/<em class="num_c">([0-9,]+)<\/em>/g)];
  legacyMatches.forEach(m => prices.push(parseInt(m[1].replace(/,/g, ''), 10)));

  // Fallback: any >1,000원
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

function simplifyKeyword(kw) {
  if (!kw) return '';
  return kw
    .replace(/1\+1/g, ' ')
    .replace(/총\s*\d+(g|kg|ml|L|개|팩|캔|봉|매|롤)/g, ' ')
    .replace(/\d+\+\d+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const jsonPath = path.join(__dirname, 'gmarket_best100_live.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  console.log(`🚀 총 ${data.items.length}개 상품 다나와 정밀 검색 결과 수집 시작...`);

  let matchedCount = 0;
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    const kw = item.cleanKeyword || item.name;
    const targetPrice = item.gmarketPrice || 10000;

    let foundCandidate = null;

    // 1st attempt: with exact cleanKeyword
    try {
      const url = `https://search.danawa.com/?query=${encodeURIComponent(kw)}`;
      const html = await getWithRedirect(url);
      const liMatches = [...html.matchAll(/<li[^>]*data-product-seq="(\d+)"[\s\S]*?<\/li>/g)];
      
      const candidates = [];
      for (let j = 0; j < Math.min(4, liMatches.length); j++) {
        const parsed = parseDanawaLi(liMatches[j][0]);
        if (parsed && parsed.minPrice) {
          candidates.push(parsed);
        }
      }

      // Pick best candidate: ideally within 35% ~ 180% of gmarketPrice
      const reasonable = candidates.filter(c => c.minPrice >= targetPrice * 0.35 && c.minPrice <= targetPrice * 2.0);
      if (reasonable.length > 0) {
        foundCandidate = reasonable[0];
      } else if (candidates.length > 0) {
        foundCandidate = candidates[0];
      }
    } catch (e) {
      // ignore
    }

    // 2nd attempt: if not found, try simplified keyword
    if (!foundCandidate) {
      const simpleKw = simplifyKeyword(kw);
      if (simpleKw && simpleKw !== kw) {
        try {
          await sleep(150);
          const url2 = `https://search.danawa.com/?query=${encodeURIComponent(simpleKw)}`;
          const html2 = await getWithRedirect(url2);
          const liMatches2 = [...html2.matchAll(/<li[^>]*data-product-seq="(\d+)"[\s\S]*?<\/li>/g)];
          const candidates2 = [];
          for (let j = 0; j < Math.min(4, liMatches2.length); j++) {
            const parsed = parseDanawaLi(liMatches2[j][0]);
            if (parsed && parsed.minPrice) candidates2.push(parsed);
          }
          const reasonable2 = candidates2.filter(c => c.minPrice >= targetPrice * 0.35 && c.minPrice <= targetPrice * 2.0);
          if (reasonable2.length > 0) {
            foundCandidate = reasonable2[0];
          } else if (candidates2.length > 0) {
            foundCandidate = candidates2[0];
          }
        } catch (e2) {
          // ignore
        }
      }
    }

    const danawaSearchUrl = `https://search.danawa.com/dsearch.php?query=${encodeURIComponent(kw)}`;

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

      console.log(`[${i+1}/100] #${item.rank} ✅ 다나와 검색결과 1:1 매칭: "${(foundCandidate.title || '').substring(0, 22)}" | ${foundCandidate.minPrice.toLocaleString()}원 | ${foundCandidate.detailUrl}`);
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

      console.log(`[${i+1}/100] #${item.rank} ⚡ 다나와 카탈로그 없음 (검색창 유지): "${kw.substring(0, 20)}"`);
    }

    item.danawaSearchUrl = danawaSearchUrl;
    await sleep(180);
  }

  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');

  console.log(`\n🎉 완료! 총 ${data.items.length}개 상품 중 ${matchedCount}개 다나와 검색 결과 상세 링크 & 가격 매칭 완료!`);
}

main().catch(console.error);
