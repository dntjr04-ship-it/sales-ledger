const https = require('https');
const fs = require('fs');

const options = {
  hostname: 'www.gmarket.co.kr',
  path: '/n/best',
  method: 'GET',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  }
};

const req = https.request(options, (res) => {
  console.log('Status code:', res.statusCode);
  console.log('Headers:', res.headers);
  let body = '';
  res.on('data', chunk => { body += chunk; });
  res.on('end', () => {
    console.log('Body length:', body.length);
    const match = body.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (match) {
      console.log('Found __NEXT_DATA__! Length:', match[1].length);
      const json = JSON.parse(match[1]);
      const items = json?.props?.pageProps?.initialStates?.itemPage?.items || [];
      console.log('Parsed items count:', items.length);
      if (items.length > 0) {
        console.log('Top 3 items:');
        items.slice(0, 3).forEach((it, idx) => {
          console.log(`#${idx + 1}: ${it.goodsName} (${it.goodsCode}) - ${it.discountPrice || it.price}원`);
        });
        fs.writeFileSync('gmarket_raw_live.json', JSON.stringify(items, null, 2), 'utf8');
      }
    } else {
      console.log('__NEXT_DATA__ not found. First 500 chars of body:', body.substring(0, 500));
    }
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
});

req.end();
