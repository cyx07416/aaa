/**
 * 被测模块：src/record/qaRecord.js，负责问答记录的读取、写入、新增和列表查询。
 * 测试范围：add 新增与字段完整性、list 最新优先与 limit 限制、writeAll/readAll 持久化一致性。
 * 隔离策略：使用内存 Map 模拟 node:fs，不读取或修改真实的 data/qa-records.json 文件。
 */
import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import qaRecord from '../src/record/qaRecord.js';

const { add, list, readAll, writeAll } = qaRecord;

const makeEntry = (id, createdAt) => ({
    id,
    question: `问题-${id}`,
    answer: `回答-${id}`,
    sources: [`来源-${id}`],
    mode: 'llm',
    createdAt
});

describe('qaRecord 问答记录模块', () => {
    let virtualFiles;

    beforeEach(() => {
        virtualFiles = new Map();

        vi.spyOn(fs, 'existsSync').mockImplementation(filePath => {
            return virtualFiles.has(String(filePath));
        });
        vi.spyOn(fs, 'readFileSync').mockImplementation(filePath => {
            const key = String(filePath);
            if (!virtualFiles.has(key)) {
                const error = new Error(`ENOENT: no such file or directory, open '${key}'`);
                error.code = 'ENOENT';
                throw error;
            }
            return virtualFiles.get(key);
        });
        vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
        vi.spyOn(fs, 'writeFileSync').mockImplementation((filePath, content) => {
            virtualFiles.set(String(filePath), String(content));
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('记录文件不存在时 readAll 返回空数组', () => {
        // 测试意图：验证首次运行且尚无记录文件的场景；预期返回空数组，并且不尝试读取文件。
        expect(readAll()).toEqual([]);
        expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it('add 新增后记录总数递增 1 且所有字段完整保存', () => {
        // 测试意图：验证在已有数据上新增记录；预期保留旧记录，总数增加 1，新记录全部字段与原始输入一致。
        const existingEntry = makeEntry('old', '2026-01-01T08:00:00.000Z');
        const newEntry = {
            ...makeEntry('new', '2026-01-02T08:00:00.000Z'),
            metadata: { channel: 'unit-test', tags: ['回归', '持久化'] }
        };
        writeAll([existingEntry]);
        const initialCount = readAll().length;

        add(newEntry);

        const records = readAll();
        expect(records).toHaveLength(initialCount + 1);
        expect(records[0]).toStrictEqual(existingEntry);
        expect(records[1]).toStrictEqual(newEntry);
    });

    it('list 按最新创建在前的顺序返回全部记录', () => {
        // 测试意图：验证连续追加的三条不同时间记录；预期查询结果按创建时间从新到旧排列。
        const oldest = makeEntry('oldest', '2026-01-01T08:00:00.000Z');
        const middle = makeEntry('middle', '2026-01-02T08:00:00.000Z');
        const newest = makeEntry('newest', '2026-01-03T08:00:00.000Z');
        writeAll([oldest, middle, newest]);

        const result = list();

        expect(result.map(entry => entry.id)).toEqual(['newest', 'middle', 'oldest']);
        expect(result.map(entry => entry.createdAt)).toEqual([
            '2026-01-03T08:00:00.000Z',
            '2026-01-02T08:00:00.000Z',
            '2026-01-01T08:00:00.000Z'
        ]);
    });

    it('list 传入数值 1 时仅返回最新的一条记录', () => {
        // 测试意图：验证 limit 参数为 1 的截取行为；预期只返回最新记录，且数组长度为 1。
        const oldest = makeEntry('oldest', '2026-01-01T08:00:00.000Z');
        const newest = makeEntry('newest', '2026-01-02T08:00:00.000Z');
        writeAll([oldest, newest]);

        const result = list(1);

        expect(result).toHaveLength(1);
        expect(result).toStrictEqual([newest]);
    });

    it('list 查询不会改变持久化数据原有顺序', () => {
        // 测试意图：验证列表倒序展示不会改写原始存储；预期查询后再次读取的数据仍与查询前完全一致。
        const oldest = makeEntry('oldest', '2026-01-01T08:00:00.000Z');
        const newest = makeEntry('newest', '2026-01-02T08:00:00.000Z');
        writeAll([oldest, newest]);
        const beforeList = readAll();

        list();

        expect(readAll()).toStrictEqual(beforeList);
    });

    it('writeAll 写入的记录能够被 readAll 完整准确地读回', () => {
        // 测试意图：验证 JSON 持久化往返的一致性；预期读回记录的数量、字段、嵌套数组及字段顺序无关的值均与写入数据相同。
        const records = [
            {
                ...makeEntry('first', '2026-01-01T08:00:00.000Z'),
                sources: ['DeepSeek大模型', { title: '测试资料', page: 12 }]
            },
            makeEntry('second', '2026-01-02T08:00:00.000Z')
        ];

        writeAll(records);
        const restoredRecords = readAll();

        expect(restoredRecords).toStrictEqual(records);
        expect(restoredRecords).not.toBe(records);
    });
});
