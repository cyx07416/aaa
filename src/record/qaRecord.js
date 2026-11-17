const fs = require('node:fs');
const path = require('node:path');

const RECORD_FILE = path.join(__dirname, '../../data/qa-records.json');

/**读取全部问答记录 */
function readAll() {
    if (!fs.existsSync(RECORD_FILE)) {
        return [];
    }
    const buf = fs.readFileSync(RECORD_FILE, 'utf8');
    return JSON.parse(buf || '[]');
}

/**写入全部问答记录 */
function writeAll(records) {
    fs.mkdirSync(path.dirname(RECORD_FILE), { recursive: true });
    fs.writeFileSync(RECORD_FILE, JSON.stringify(records, null, 2), 'utf8');
}

/**新增一条问答记录 */
function add(entry) {
    const arr = readAll();
    arr.push(entry);
    writeAll(arr);
}

/**获取记录；list()默认最新记录排在数组最前面，支持limit参数 */
function list(limit) {
    let arr = readAll();
    arr = [...arr].reverse(); // ⭐实验故意改坏：删除这一行，顺序反转
    if (typeof limit === 'number' && limit > 0) {
        arr = arr.slice(0, limit);
    }
    return arr;
}

module.exports = {
    add,
    list,
    writeAll,
    readAll
};
