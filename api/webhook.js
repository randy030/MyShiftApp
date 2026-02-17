// 🔴 設定區：請填入您的 LINE Token
const CHANNEL_ACCESS_TOKEN = "VveEe6A3WKqrVg/tq2bF9tOQCtuCoK1xI9vHjJM+QUnOXU0/1+JTOZni8JJjefiAqoofCCC+RQBWTJefKsvlQQrU3sZ8P4QqOvK33KRNGwr6INSq9YXpYkQjbECmcMWYSPs9nCDeRH01OhLbDsPqywdB04t89/1O/w1cDnyilFU=";

export default async function handler(req, res) {
  // 1. 處理 LINE 的 Webhook 驗證 (Verify)
  // 當您在 LINE 後台按 Verify 時，它通常是空請求或 GET，我們直接回傳 200
  if (req.method === 'GET' || (req.body && Object.keys(req.body).length === 0)) {
    return res.status(200).send('OK');
  }

  try {
    const { to, messages, events } = req.body;

    // 情況 A：網頁叫我要發通知 (給指定員工)
    if (to && messages) {
      await sendLinePush(to, messages);
      return res.status(200).send('Sent');
    }

    // 情況 B：員工在 LINE 輸入文字 (查 ID)
    if (events && events.length > 0) {
      const event = events[0];
      if (event.type === 'message' && event.message.type === 'text') {
        const userMsg = event.message.text.trim();
        const userId = event.source.userId;
        const replyToken = event.replyToken;

        // 關鍵字觸發
        if (userMsg === '查ID' || userMsg.toUpperCase() === 'MYID') {
          await replyLineMessage(replyToken, `您的員工 ID 是：\n\n${userId}\n\n(請長按複製，貼到排班系統設定頁)`);
        }
      }
      return res.status(200).send('OK');
    }

    return res.status(200).send('No Action');

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).send('Internal Server Error');
  }
}

// 輔助函式：發送 LINE Push
async function sendLinePush(to, messages) {
  const url = 'https://api.line.me/v2/bot/message/multicast';
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ to, messages }),
  });
}

// 輔助函式：回覆 LINE 訊息
async function replyLineMessage(replyToken, text) {
  const url = 'https://api.line.me/v2/bot/message/reply';
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken: replyToken,
      messages: [{ type: 'text', text: text }],
    }),
  });
}