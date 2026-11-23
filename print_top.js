const items = require('./gmarket_real_live_100.json');
console.log('Total live items:', items.length);
items.slice(0, 15).forEach((it, i) => {
  const p = it.couponAppliedInfo?.couponAppliedPrice || it.discountPrice || it.sellPrice;
  console.log(`${i+1}. [${it.goodsCode}] ${it.goodsName} -> ${p}원`);
});
