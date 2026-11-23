const https = require('https');
const fs = require('fs');
const path = require('path');

function getUrl(url) {
  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://www.danawa.com/'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, location: res.headers.location, html: data });
      });
    }).on('error', e => resolve({ error: e.message }));
  });
}

async function fetchDanawaSearch(query) {
  let url = 'https://search.danawa.com/?query=' + encodeURIComponent(query);
  for (let i = 0; i < 3; i++) {
    const res = await getUrl(url);
    if (res.statusCode >= 300 && res.statusCode < 400 && res.location) {
      url = res.location.startsWith('/') ? 'https://search.danawa.com' + res.location : res.location;
      continue;
    }
    return res.html || '';
  }
  return '';
}

function extractCoreKeyword(name) {
  if (!name) return '';

  // 1. Model code like SL-M2030W, 14-HU0055TU
  const modelMatch = name.match(/([A-Z0-9]{2,}-[A-Z0-9]{3,}[A-Z0-9]*)/i);
  if (modelMatch && !modelMatch[1].toLowerCase().includes('1+1')) {
    return modelMatch[1];
  }

  // 2. Strip brackets and parentheses
  let clean = name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/<[^>]*>/g, ' ');

  // 3. Take before "+"
  if (clean.includes('+')) {
    clean = clean.split('+')[0];
  }

  // 4. Remove noise
  const noiseWords = [
    '사은품', '증정', '특가', '1+1', '주문폭주', '예약발송', '창고대방출',
    '네이버페이', '포인트', '골라담기', '시리즈', '모음전', '첫수확', '로얄과',
    '신선직송', '단독', '앵콜행사', '선착순', '토너포함', '무료배송', '당일발송',
    '쿠폰', '할인', '행사', '라이브', '본사직영', '공식', '정품', '국내산', 'GAP획득',
    '랜덤', '가정용', '무라벨', '선택구매', '패밀리박스'
  ];

  for (const w of noiseWords) {
    clean = clean.split(w).join(' ');
  }

  clean = clean.replace(/\s+/g, ' ').trim();
  const tokens = clean.split(' ').filter(t => t.length > 0);

  if (tokens.length >= 4) {
    if (tokens[2].match(/\d+(g|kg|ml|L|T|팩|입|매|롤|개)/i)) {
      return tokens.slice(0, 3).join(' ');
    } else if (tokens[3].match(/\d+(g|kg|ml|L|T|팩|입|매|롤|개)/i)) {
      return tokens.slice(0, 4).join(' ');
    }
    return tokens.slice(0, 3).join(' ');
  }

  return clean;
}

function parseDanawa(html, targetPrice) {
  const matches = [...html.matchAll(/data-product-seq="(\d+)"/g)];
  if (matches.length === 0) return null;

  const results = [];
  for (let i = 0; i < Math.min(4, matches.length); i++) {
    const seq = matches[i][1];
    const seqIdx = html.indexOf(`data-product-seq="${seq}"`);
    const nextIdx = i + 1 < matches.length ? html.indexOf(`data-product-seq="${matches[i+1][1]}"`) : seqIdx + 6000;
    const block = html.substring(seqIdx, nextIdx > seqIdx ? nextIdx : seqIdx + 6000);

    const titleMatch = block.match(/href="[^"]*prod\.danawa\.com\/info\/\?pcode=\d+[^"]*"[^>]*>([\s\S]*?)<\/a>/);
    let title = '';
    if (titleMatch) {
      title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }

    const priceLinks = [...block.matchAll(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map(m => ({
      href: m[1].replace(/&amp;/g, '&'),
      text: m[2].replace(/<[^>]+>/g, '').trim()
    })).filter(x => x.text.includes('원'));

    for (const pl of priceLinks) {
      if (pl.text.includes('/') || pl.text.includes('100g') || pl.text.includes('1개입') || pl.text.includes('100ml')) continue;
      const numMatch = pl.text.match(/([0-9,]+)\s*원/);
      if (!numMatch) continue;
      const price = parseInt(numMatch[1].replace(/,/g, ''), 10);
      if (price < 1000) continue;

      const pcodeMatch = pl.href.match(/pcode=(\d+)/);
      const pcode = pcodeMatch ? pcodeMatch[1] : seq;
      results.push({
        pcode,
        title: title || '',
        price,
        directLink: `https://prod.danawa.com/info/?pcode=${pcode}`
      });
    }
  }

  if (results.length === 0) return null;

  // Find candidate that is within 45%~160% of target price
  const reasonable = results.filter(r => r.price >= targetPrice * 0.45 && r.price <= targetPrice * 1.6);
  if (reasonable.length > 0) {
    reasonable.sort((a, b) => a.price - b.price);
    return reasonable[0];
  }

  // closest
  results.sort((a, b) => Math.abs(a.price - targetPrice) - Math.abs(b.price - targetPrice));
  return results[0];
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const jsonPath = path.join(__dirname, 'gmarket_best100_live.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  console.log(`🚀 총 ${data.items.length}개 상품의 실제 다나와 최저가 및 직링크 수집 시작...`);

  let matchedCount = 0;
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    const coreKw = extractCoreKeyword(item.name);
    item.cleanKeyword = coreKw;

    // Search query fallback URLs
    const danawaSearchUrl = `https://search.danawa.com/dsearch.php?query=${encodeURIComponent(coreKw)}`;
    const naverSearchUrl = `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(coreKw)}`;

    process.stdout.write(`[${i + 1}/${data.items.length}] #${item.rank} "${coreKw.substring(0, 20)}"... `);

    let match = null;
    try {
      const html = await fetchDanawaSearch(coreKw);
      match = parseDanawa(html, item.gmarketPrice);
    } catch (e) {
      // ignore
    }

    if (match && match.price > 0) {
      matchedCount++;
      item.lowestPrice = match.price;
      item.lowestUrl = match.directLink;
      item.danawaUrl = match.directLink;
      item.naverUrl = naverSearchUrl;
      item.lowestPlatform = '다나와';
      item.sourcingTitle = match.title || item.name;
      item.isDirectMatch = true;

      const margin = item.gmarketPrice - match.price;
      const marginRate = item.gmarketPrice > 0 ? (margin / item.gmarketPrice) * 100 : 0;
      item.margin = margin;
      item.marginRate = parseFloat(marginRate.toFixed(1));

      console.log(`✅ 다나와 직링크 매칭! ${match.price.toLocaleString()}원 (마진: ${marginRate.toFixed(1)}%)`);
    } else {
      // Gmarket is cheapest or unbranded/flash deal
      item.lowestPrice = item.gmarketPrice;
      item.lowestUrl = naverSearchUrl;
      item.danawaUrl = danawaSearchUrl;
      item.naverUrl = naverSearchUrl;
      item.lowestPlatform = '지마켓단독';
      item.sourcingTitle = item.name;
      item.isDirectMatch = false;
      item.margin = 0;
      item.marginRate = 0;

      console.log(`⚡ 지마켓 단독특가/최저가`);
    }

    await sleep(250); // Be gentle to Danawa server
  }

  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');

  console.log(`\n🎉 완료! 총 ${data.items.length}개 중 ${matchedCount}개 실제 다나와 카탈로그 직링크 매칭 완료!`);
}

main().catch(console.error);
