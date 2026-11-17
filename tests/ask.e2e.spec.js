import { test, expect } from '@playwright/test';

// 使用本机 Chrome，避免依赖额外的 Chromium 下载。
test.use({ channel: 'chrome' });

test('提交问题后显示回答，且历史记录在刷新后仍然保留', async ({ page }) => {
    test.setTimeout(120000);

    const question = '什么是 Spec 驱动开发？';

    // 打开首页，使用稳定的语义化 id 定位输入框与提交按钮。
    await page.goto('http://localhost:3000');
    await expect(page.locator('#question')).toBeVisible();
    await expect(page.locator('#askBtn')).toBeEnabled();
    await page.locator('#question').fill(question);

    // 等待真实提问接口完成，避免请求中的按钮状态与回答占位文本造成竞态。
    const askResponsePromise = page.waitForResponse(response => {
        return response.url().includes('/api/ask')
            && response.request().method() === 'POST';
    }, { timeout: 60000 });
    await page.locator('#askBtn').click();
    const askResponse = await askResponsePromise;
    expect(askResponse.status()).toBe(200);

    // 按钮在 finally 中恢复可用，此时回答和最新历史记录均已完成渲染。
    await expect(page.locator('#askBtn')).toBeEnabled({ timeout: 60000 });
    await expect(page.locator('#result')).toBeVisible();
    await expect(page.locator('#answer')).not.toBeEmpty();

    const answer = (await page.locator('#answer').textContent())?.trim() ?? '';
    expect(answer.length).toBeGreaterThan(0);
    expect(answer).not.toMatch(/^(错误：|网络异常：)/);

    // 最新历史记录应包含刚提交的问题及对应回答。
    const latestHistoryItem = page.locator('#history > div').first();
    await expect(latestHistoryItem).toContainText(`Q:${question}`);
    await expect(latestHistoryItem).toContainText(answer);

    // 刷新后重新从后端加载历史，验证刚才的记录已经持久化。
    await page.reload();
    const persistedHistoryItem = page.locator('#history > div')
        .filter({ hasText: `Q:${question}` })
        .first();
    await expect(persistedHistoryItem).toBeVisible({ timeout: 10000 });
    await expect(persistedHistoryItem).toContainText(answer);
});
