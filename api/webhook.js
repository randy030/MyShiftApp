// ==========================================
// LINE Webhook
// 班表 LINE 通知 + 接單系統測試 Router
// ==========================================

// LINE Channel Access Token
// 請放在 Vercel Environment Variables：
// LINE_CHANNEL_ACCESS_TOKEN
const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

export default async function handler(req, res) {

  // ==========================================
  // 1. GET / LINE Verify
  // ==========================================
  if (
    req.method === 'GET' ||
    (req.body && Object.keys(req.body).length === 0)
  ) {
    return res.status(200).send('OK');
  }

  try {
    const { to, messages, events } = req.body || {};

    // ==========================================
    // 情況 A：
    // 班表 APP 主動發 LINE 通知給員工
    // ==========================================
    if (to && messages) {
      await sendLinePush(to, messages);

      return res.status(200).send('Sent');
    }

    // ==========================================
    // 情況 B：
    // LINE 使用者傳訊息進來
    // ==========================================
    if (events && events.length > 0) {

      // 不只處理第一個 event
      for (const event of events) {

        // 目前只處理文字訊息
        if (
          event.type !== 'message' ||
          event.message?.type !== 'text'
        ) {
          continue;
        }

        const userMsg = event.message.text.trim();
        const userId = event.source?.userId || '';
        const replyToken = event.replyToken;

        // ==========================================
        // 原班表功能：查 LINE User ID
        // ==========================================
        if (
          userMsg === '查ID' ||
          userMsg.toUpperCase() === 'MYID'
        ) {
          await replyLineMessage(
            replyToken,
            `您的員工 ID 是：\n\n${userId}\n\n(請長按複製，貼到排班系統設定頁)`
          );

          continue;
        }

        // ==========================================
        // 新功能：接單系統測試入口
        // 目前先只確認 LINE Router 有正常工作
        // ==========================================
        await replyLineMessage(
          replyToken,
          `🧋 接單系統已收到您的訊息：\n\n${userMsg}`
        );
      }

      return res.status(200).send('OK');
    }

    // 沒有符合任何處理條件
    return res.status(200).send('No Action');

  } catch (error) {
    console.error('LINE Webhook Error:', error);

    return res.status(500).send('Internal Server Error');
  }
}


// ==========================================
// 發送 LINE Push
// 班表 APP → 員工 LINE
// ==========================================
async function sendLinePush(to, messages) {

  if (!CHANNEL_ACCESS_TOKEN) {
    throw new Error('缺少 LINE_CHANNEL_ACCESS_TOKEN');
  }

  const url = 'https://api.line.me/v2/bot/message/multicast';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to,
      messages
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `LINE multicast 發送失敗：${response.status} ${errorText}`
    );
  }
}


// ==========================================
// 回覆 LINE 使用者
// LINE → Webhook → LINE Reply
// ==========================================
async function replyLineMessage(replyToken, text) {

  if (!CHANNEL_ACCESS_TOKEN) {
    throw new Error('缺少 LINE_CHANNEL_ACCESS_TOKEN');
  }

  const url = 'https://api.line.me/v2/bot/message/reply';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [
        {
          type: 'text',
          text
        }
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `LINE Reply 發送失敗：${response.status} ${errorText}`
    );
  }
}