// โหลด Domain ตามลำดับเดียวกับ index.html: domain.js แล้วตามด้วย domain/*.js
const D = require('../mockup/js/domain.js');
['stock', 'returns', 'scan', 'products', 'jobs'].forEach((f) => require('../mockup/js/domain/' + f + '.js'));
module.exports = D;
