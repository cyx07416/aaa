/**
 * AI 答疑助手接口级集成测试。
 * 通过 createServer() 和 Supertest 验证 POST /api/ask 与 GET /api/history 的接口契约。
 * 大模型网络请求和记录文件均采用内存模拟，避免真实外部调用及测试数据污染。
 */
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import https from 'node:https';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import serverModule from '../src/server.js';
import qaRecord from '../src/record/qaRecord.js';

const { createServer } = serverModule;
const { readAll, writeAll } = qaRecord;
const QUESTION = '什么是 Spec 驱动开发？';
const MOCK_ANSWER = 'Spec 驱动开发是先编写明确规范，再依据规范实现和验证软件的方法。';

function mockAiSuccess(answer = MOCK_ANSWER) {
    vi.mocked(https.request).mockImplementation((options, onResponse) => {
        const req = new EventEmitter();
        req.write = vi.fn();
        req.end = vi.fn(() => {
            const res = new EventEmitter();
            onResponse(res);
            res.emit('data', JSON.stringify({
                choices: [{ message: { content: answer } }]
            }));
            res.emit('end');
        });
        return req;
    });
}

function mockAiFailure() {
    vi.mocked(https.request).mockImplementation(() => {
        const req = new EventEmitter();
        req.write = vi.fn();
        req.end = vi.fn(() => {
            req.emit('error', new Error('模拟大模型网络故障'));
        });
        return req;
    });
}

describe('AI 答疑助手 API 集成测试', () => {
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
        vi.spyOn(https, 'request').mockImplementation(() => {
            throw new Error('未配置大模型 mock，禁止真实网络请求');
        });

        // 每个用例开始前都将隔离的问答记录文件恢复为空，避免记录在用例之间互相污染。
        writeAll([]);
        expect(readAll()).toEqual([]);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('POST /api/ask 正常提问返回 200、完整字段及非空回答', async () => {
        // 验证接口契约：合法 question 应获得 200 和 ok=true，data 包含完整记录字段且 answer 非空。
        mockAiSuccess();
        const server = createServer();

        const response = await request(server)
            .post('/api/ask')
            .send({ question: QUESTION });

        expect(response.status).toBe(200);
        expect(response.body.ok).toBe(true);
        expect(response.body.data).toMatchObject({
            question: QUESTION,
            answer: MOCK_ANSWER,
            sources: ['DeepSeek大模型'],
            mode: 'llm'
        });
        expect(response.body.data.id).toEqual(expect.any(String));
        expect(response.body.data.id.length).toBeGreaterThan(0);
        expect(response.body.data.answer.trim().length).toBeGreaterThan(0);
        expect(Date.parse(response.body.data.createdAt)).not.toBeNaN();
        expect(Object.keys(response.body.data)).toEqual(expect.arrayContaining([
            'id', 'question', 'answer', 'sources', 'mode', 'createdAt'
        ]));
    });

    it('POST /api/ask 空字符串问题返回 400', async () => {
        // 验证接口契约：question 为空字符串时应返回 400 及约定的错误消息，且不调用大模型。
        const server = createServer();

        const response = await request(server)
            .post('/api/ask')
            .send({ question: '' });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ ok: false, error: '问题内容不能为空' });
        expect(https.request).not.toHaveBeenCalled();
    });

    it('POST /api/ask 仅包含空格的问题返回 400', async () => {
        // 验证接口契约：question 去除首尾空白后为空时应返回 400 及约定的错误消息。
        const server = createServer();

        const response = await request(server)
            .post('/api/ask')
            .send({ question: '   ' });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ ok: false, error: '问题内容不能为空' });
        expect(https.request).not.toHaveBeenCalled();
    });

    it('POST /api/ask 大模型调用失败返回 502', async () => {
        // 验证接口契约：上游大模型请求失败时应返回 502，并将失败信息放入错误响应。
        mockAiFailure();
        const server = createServer();

        const response = await request(server)
            .post('/api/ask')
            .send({ question: QUESTION });

        expect(response.status).toBe(502);
        expect(response.body.ok).toBe(false);
        expect(response.body.error).toContain('AI请求失败');
    });

    it('提问后 GET /api/history?limit=20 能查询到新记录且最新记录在前', async () => {
        // 验证接口契约：POST 写入的记录应能通过 GET 查询，两个接口共享数据，并按最新记录优先返回。
        const oldRecord = {
            id: 'old-record',
            question: '历史旧问题',
            answer: '历史旧回答',
            sources: ['DeepSeek大模型'],
            mode: 'llm',
            createdAt: '2026-01-01T00:00:00.000Z'
        };
        writeAll([oldRecord]);
        mockAiSuccess();
        const server = createServer();

        const askResponse = await request(server)
            .post('/api/ask')
            .send({ question: QUESTION });
        expect(askResponse.status).toBe(200);

        const historyResponse = await request(server).get('/api/history?limit=20');

        expect(historyResponse.status).toBe(200);
        expect(historyResponse.body.ok).toBe(true);
        expect(Array.isArray(historyResponse.body.data)).toBe(true);
        expect(historyResponse.body.data).toHaveLength(2);
        expect(historyResponse.body.data[0]).toStrictEqual(askResponse.body.data);
        expect(historyResponse.body.data[0].question).toBe(QUESTION);
        expect(historyResponse.body.data[1]).toStrictEqual(oldRecord);
    });
});
