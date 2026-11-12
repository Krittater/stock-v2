// dev helper: ดาวน์โหลดรูปกว้าง 320px จาก Wikimedia Commons + พิมพ์ entry ของ ImageCredits
// node scripts/fetch-commons.js "File:Electrical-tape black.jpg" mockup/img/photo/tape.jpg
const fs = require('node:fs');
const path = require('node:path');

const OK = /^(CC0|Public domain|No restrictions|CC BY(-SA)? [\d.]+)$/;
const UA = { 'User-Agent': 'stockpro-mockup/1.0' };
const strip = (html) => String(html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

async function main([title, out]) {
  if (!title || !out) throw new Error('usage: node scripts/fetch-commons.js "File:Name.jpg" mockup/img/photo/name.jpg');
  const api = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', format: 'json', titles: title, prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '320',
  });
  const res = await fetch(api, { headers: UA });
  if (!res.ok) throw new Error('Commons API ' + res.status);
  const page = Object.values((await res.json()).query.pages)[0];
  const info = page.imageinfo && page.imageinfo[0];
  if (!info) throw new Error('ไม่พบไฟล์: ' + title);
  const meta = info.extmetadata || {};
  const license = strip(meta.LicenseShortName && meta.LicenseShortName.value);
  if (!OK.test(license)) { console.error(`license ไม่อยู่ในรายการที่อนุญาต: "${license}" — ไม่บันทึกไฟล์`); process.exit(1); }

  const img = await fetch(info.thumburl || info.url, { headers: UA });
  if (!img.ok) throw new Error('download ' + img.status);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(await img.arrayBuffer()));

  const key = path.relative(path.join(__dirname, '../mockup'), path.resolve(out)).split(path.sep).join('/');
  const credit = {
    title: page.title.replace(/^File:/, ''), author: strip(meta.Artist && meta.Artist.value) || 'ไม่ระบุ',
    license, source: info.descriptionurl, kind: 'photo',
  };
  console.log(JSON.stringify({ [key]: credit }, null, 2));
  console.error(`saved ${out} (${fs.statSync(out).size} bytes)`);
}

main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
