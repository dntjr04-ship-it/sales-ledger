// upload_to_supabase.js
const fs = require('fs');
const path = require('path');
const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || process.argv[2];
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.argv[3];

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('사용법: node upload_to_supabase.js <SUPABASE_URL> <SUPABASE_KEY>');
    process.exit(1);
}

const cacheFilePath = path.join(__dirname, 'gmarket_categories_cache.json');
const cacheData = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
const categoryIds = Object.keys(cacheData);

console.log(`총 ${categoryIds.length}개 카테고리 업로드를 시작합니다...`);

async function uploadCategory(catId) {
    const data = cacheData[catId];
    const items = data.items || [];
    const payload = JSON.stringify({
        category_id: catId,
        category_name: data.categoryLabel || catId,
        item_count: items.length,
        products: items,
        updated_at: data.updatedAt || new Date().toISOString()
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
                    resolve({ catId, success: true, count: items.length });
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

async function run() {
    let successCount = 0;
    let totalItems = 0;
    for (const catId of categoryIds) {
        try {
            const res = await uploadCategory(catId);
            successCount++;
            totalItems += res.count;
            console.log(`✅ [${catId}] ${cacheData[catId].categoryLabel} (${res.count}개) 업로드 성공!`);
        } catch (err) {
            console.error(`❌ [${catId}] 업로드 실패:`, err.message);
        }
    }
    console.log(`\n🎉 총 ${successCount}/${categoryIds.length}개 카테고리, 총 ${totalItems}개 상품 데이터 Supabase 저장 완료!`);
}

run();
