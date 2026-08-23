import crypto from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

// ==========================================
// TEA TOP LINE 接單 V3.3 正式 orders 建立測試版
// 班表 LINE 通知 + 查ID + 飲料訂單解析
//
// 目前功能：
// 1. 保留班表 APP 主動 LINE Push
// 2. 保留「查ID / MYID」
// 3. 一般文字嘗試解析成飲料訂單草稿
// 4. 解析成功後寫入 Firestore orderDrafts；仍不成立正式訂單
// ==========================================

const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;

let firebaseAdminApp = null;
let firebaseAdminAuth = null;
let firestoreDb = null;

function getFirebaseAdminApp() {
  if (firebaseAdminApp) return firebaseAdminApp;

  if (getApps().length > 0) {
    firebaseAdminApp = getApps()[0];
    return firebaseAdminApp;
  }

  const rawServiceAccount =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!rawServiceAccount) {
    throw new Error(
      '缺少 FIREBASE_SERVICE_ACCOUNT_JSON'
    );
  }

  let serviceAccount;

  try {
    serviceAccount = JSON.parse(rawServiceAccount);
  } catch (error) {
    console.error(
      'FIREBASE_SERVICE_ACCOUNT_JSON 解析失敗',
      error
    );
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON 格式錯誤'
    );
  }

  firebaseAdminApp = initializeApp({
    credential: cert(serviceAccount),
  });

  return firebaseAdminApp;
}

function getFirebaseAdminAuth() {
  if (firebaseAdminAuth) return firebaseAdminAuth;

  firebaseAdminAuth =
    getAdminAuth(getFirebaseAdminApp());

  return firebaseAdminAuth;
}

function getFirestoreDb() {
  if (firestoreDb) return firestoreDb;

  firestoreDb =
    getFirestore(getFirebaseAdminApp());

  return firestoreDb;
}

async function verifyFirebaseRequest(req) {
  const authorization =
    String(req.headers.authorization || '');

  if (!authorization.startsWith('Bearer ')) {
    return {
      ok: false,
      status: 401,
      error: 'Missing Firebase ID Token',
    };
  }

  const idToken =
    authorization.slice('Bearer '.length).trim();

  if (!idToken) {
    return {
      ok: false,
      status: 401,
      error: 'Missing Firebase ID Token',
    };
  }

  try {
    const adminAuth = getFirebaseAdminAuth();
    const decodedToken =
      await adminAuth.verifyIdToken(idToken);

    if (!decodedToken.uid) {
      return {
        ok: false,
        status: 401,
        error: 'Invalid Firebase User',
      };
    }

    if (
      decodedToken.email &&
      decodedToken.email_verified === false
    ) {
      return {
        ok: false,
        status: 403,
        error: 'Email Not Verified',
      };
    }

    return {
      ok: true,
      user: decodedToken,
    };

  } catch (error) {
    console.error(
      'Firebase ID Token 驗證失敗:',
      error?.message || error
    );

    return {
      ok: false,
      status: 401,
      error: 'Invalid Firebase ID Token',
    };
  }
}

// ==========================================
// V3.0 Firestore 訂單草稿
// ==========================================

function serializeDraftsForFirestore(drafts) {
  return drafts.map((draft, draftIndex) => {
    const serializedItems =
      (draft.items || []).map((item, itemIndex) => {
        const basePrice =
          Number(item.basePrice ?? item.price ?? 0);

        const toppings =
          Array.isArray(item.toppings)
            ? item.toppings.map(topping => ({
                name: topping.name || '',
                qty: Number(topping.qty || 0),
                unitPrice:
                  Number(topping.unitPrice || 0),
                subtotal:
                  Number(topping.unitPrice || 0) *
                  Number(topping.qty || 0),
              }))
            : [];

        const toppingTotal =
          toppings.reduce(
            (sum, topping) =>
              sum + topping.subtotal,
            0
          );

        const unitFinalPrice =
          basePrice + toppingTotal;

        return {
          itemIndex,
          productId: item.productId || '',
          name: item.name || '',
          qty: Number(item.qty || 0),
          size: item.size || '',
          sugar: item.sugar || '',
          ice: item.ice || '',
          temp: item.temp || '',

          basePrice,
          price: basePrice,

          toppings,
          toppingsTotal: toppingTotal,
          unitFinalPrice,

          subtotal:
            unitFinalPrice *
            Number(item.qty || 0),

          issues: Array.isArray(item.issues)
            ? item.issues
            : [],
        };
      });

    const promotion =
      calculatePromotionForItems(
        serializedItems
      );

    const originalTotal =
      serializedItems.reduce(
        (sum, item) =>
          sum + item.subtotal,
        0
      );

    return {
      draftIndex,
      fulfillment: draft.fulfillment || '未指定',
      time: draft.time || '未指定',
      address: draft.address || '',
      items: serializedItems,

      drinkCount: promotion.drinkCount,
      originalTotal,
      promotion,
      discountAmount:
        promotion.discountAmount,
      finalTotal:
        originalTotal -
        promotion.discountAmount,
    };
  });
}

function calculatePromotionForItems(items) {
  const cups = [];

  for (const item of items || []) {
    const qty = Number(item.qty || 0);
    const basePrice =
      Number(item.basePrice ?? item.price ?? 0);
    const toppingTotal =
      Number(
        item.toppingsTotal ??
        toppingsTotal(item.toppings)
      );

    const unitFinalPrice =
      basePrice + toppingTotal;

    for (let i = 0; i < qty; i++) {
      cups.push({
        productId: item.productId || '',
        name: item.name || '',
        size: item.size || '',
        basePrice,
        toppings:
          Array.isArray(item.toppings)
            ? item.toppings
            : [],
        toppingsTotal: toppingTotal,
        unitFinalPrice,
      });
    }
  }

  const drinkCount = cups.length;
  const freeDrinkCount =
    Math.floor(drinkCount / 11);

  const sorted =
    [...cups].sort(
      (a, b) =>
        a.unitFinalPrice -
        b.unitFinalPrice
    );

  const discountItems =
    sorted
      .slice(0, freeDrinkCount)
      .map((cup, index) => ({
        rewardIndex: index + 1,
        productId: cup.productId,
        name: cup.name,
        size: cup.size,
        basePrice: cup.basePrice,
        toppings: cup.toppings,
        toppingsTotal: cup.toppingsTotal,
        unitFinalPrice: cup.unitFinalPrice,
      }));

  const discountAmount =
    discountItems.reduce(
      (sum, item) =>
        sum + item.unitFinalPrice,
      0
    );

  return {
    type: 'buy10get1',
    drinkCount,
    freeDrinkCount,
    discountAmount,
    discountItems,
    shouldRemindAddOne:
      drinkCount > 0 &&
      drinkCount % 11 === 10,
    nextRewardAt:
      drinkCount > 0 &&
      drinkCount % 11 === 10
        ? drinkCount + 1
        : (Math.floor(drinkCount / 11) + 1) * 11,
  };
}

function calculatePromotion(drafts) {
  const perDraft = (drafts || []).map(
    (draft, draftIndex) => {
      const promo =
        calculatePromotionForItems(
          draft.items || []
        );

      return {
        draftIndex,
        fulfillment:
          draft.fulfillment || '未指定',
        address: draft.address || '',
        time: draft.time || '未指定',
        ...promo,
      };
    }
  );

  const freeDrinkCount =
    perDraft.reduce(
      (sum, promo) =>
        sum + promo.freeDrinkCount,
      0
    );

  const discountAmount =
    perDraft.reduce(
      (sum, promo) =>
        sum + promo.discountAmount,
      0
    );

  const discountItems =
    perDraft.flatMap(promo =>
      (promo.discountItems || []).map(item => ({
        ...item,
        draftIndex: promo.draftIndex,
      }))
    );

  return {
    type: 'buy10get1',
    freeDrinkCount,
    discountAmount,
    discountItems,
    shouldRemindAddOne:
      perDraft.some(
        promo => promo.shouldRemindAddOne
      ),
    perDraft,
  };
}

function summarizeDrafts(drafts) {
  let drinkCount = 0;
  let originalTotal = 0;
  let hasIssue = false;

  for (const draft of drafts) {
    if (
      draft.fulfillment === '未指定' ||
      (draft.fulfillment === '外送' && !draft.address)
    ) {
      hasIssue = true;
    }

    for (const item of draft.items || []) {
      const qty = Number(item.qty || 0);
      const basePrice =
        Number(item.basePrice ?? item.price ?? 0);
      const toppingTotal =
        Number(
          item.toppingsTotal ??
          toppingsTotal(item.toppings)
        );

      const unitFinalPrice =
        basePrice + toppingTotal;

      drinkCount += qty;
      originalTotal +=
        qty * unitFinalPrice;

      if (
        Array.isArray(item.issues) &&
        item.issues.length > 0
      ) {
        hasIssue = true;
      }
    }
  }

  const promotion =
    calculatePromotion(drafts);

  return {
    drinkCount,
    originalTotal,
    hasIssue,
    promotion,
    discountAmount:
      promotion.discountAmount,
    finalTotal:
      originalTotal -
      promotion.discountAmount,
  };
}

async function saveOrderDraftToFirestore({
  event,
  lineUserId,
  rawMessage,
  drafts,
}) {
  const db = getFirestoreDb();

  const webhookEventId =
    String(event?.webhookEventId || '');

  const draftRef = webhookEventId
    ? db.collection('orderDrafts')
        .doc(`line_${webhookEventId}`)
    : db.collection('orderDrafts').doc();

  const existing = await draftRef.get();

  if (existing.exists) {
    return {
      draftId: draftRef.id,
      duplicated: true,
    };
  }

  const summary = summarizeDrafts(drafts);

  await draftRef.set({
    schemaVersion: 1,
    source: 'LINE',
    status: 'draft',

    lineUserId,
    webhookEventId:
      webhookEventId || null,
    isRedelivery:
      Boolean(event?.deliveryContext?.isRedelivery),

    rawMessage,

    drafts:
      serializeDraftsForFirestore(drafts),

    drinkCount: summary.drinkCount,
    originalTotal: summary.originalTotal,
    hasIssue: summary.hasIssue,

    promotion: summary.promotion,

    bags: {
      qty: 0,
      unitPrice: 1,
      subtotal: 0,
    },

    discountAmount:
      summary.discountAmount,
    finalTotal:
      summary.finalTotal,

    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    draftId: draftRef.id,
    duplicated: false,
  };
}

// ==========================================
// V3.1 加料主檔
// ==========================================
const TOPPINGS = [
  { name: '珍珠', price: 5, aliases: ['珍珠', '波霸'] },
  { name: '仙草凍', price: 5, aliases: ['仙草凍', '仙草'] },
  { name: '西米露', price: 5, aliases: ['西米露', '西米'] },
  { name: '焙香粉角', price: 10, aliases: ['焙香粉角', '粉角'] },
  { name: '茶凍', price: 10, aliases: ['茶凍'] },
  { name: '紅豆', price: 10, aliases: ['紅豆'] },
  { name: '芋圓', price: 10, aliases: ['芋圓'] },
  { name: '粉粿', price: 10, aliases: ['粉粿'] },
  { name: '寒天', price: 10, aliases: ['寒天'] },
  { name: '椰果', price: 10, aliases: ['椰果'] },
  { name: '桂花凍', price: 15, aliases: ['桂花凍'] },
];

function findToppingsInSegment(segment) {
  const results = [];

  for (const topping of TOPPINGS) {
    let totalQty = 0;

    for (const alias of topping.aliases) {
      const escapedAlias =
        alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // 明確雙份語意：
      // 雙份珍珠 / 珍珠雙份 / 兩份珍珠 / 珍珠2份
      const explicitDoublePatterns = [
        new RegExp(`雙份\\s*${escapedAlias}`, 'g'),
        new RegExp(`${escapedAlias}\\s*雙份`, 'g'),
        new RegExp(`兩份\\s*${escapedAlias}`, 'g'),
        new RegExp(`${escapedAlias}\\s*兩份`, 'g'),
        new RegExp(`${escapedAlias}\\s*2份`, 'g'),
      ];

      let explicitQty = 0;

      for (const regex of explicitDoublePatterns) {
        const matches = segment.match(regex);
        if (matches) {
          explicitQty += matches.length * 2;
        }
      }

      if (explicitQty > 0) {
        totalQty += explicitQty;
        continue;
      }

      // 一般加料只算 1 份。
      // 「珍珠*2」由 quantityAround 視為 2 杯，不在這裡當雙份。
      const normalRegex = new RegExp(
        `(?:加)?${escapedAlias}(?!\\s*(?:雙份|兩份|2份))`,
        'g'
      );

      const matches = segment.match(normalRegex);

      if (matches) {
        totalQty += matches.length;
      }
    }

    if (totalQty > 0) {
      results.push({
        name: topping.name,
        qty: totalQty,
        unitPrice: topping.price,
        subtotal: topping.price * totalQty,
      });
    }
  }

  return results;
}

function toppingsTotal(toppings) {
  return (toppings || []).reduce(
    (sum, topping) =>
      sum +
      Number(topping.unitPrice || 0) *
      Number(topping.qty || 0),
    0
  );
}


// ==========================================
// V3.2 LINE 訂單互動 Session
// ==========================================

function getLineSessionRef(lineUserId) {
  return getFirestoreDb()
    .collection('lineOrderSessions')
    .doc(lineUserId);
}

async function setLineSession(lineUserId, data) {
  await getLineSessionRef(lineUserId).set({
    ...data,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function clearLineSession(lineUserId) {
  await getLineSessionRef(lineUserId).delete().catch(() => {});
}

async function getLineSession(lineUserId) {
  const snap = await getLineSessionRef(lineUserId).get();
  return snap.exists ? snap.data() : null;
}

function normalizeStoredDrafts(storedDrafts) {
  return (storedDrafts || []).map(draft => ({
    fulfillment: draft.fulfillment || '未指定',
    time: draft.time || '未指定',
    address: draft.address || '',
    items: (draft.items || []).map(item => ({
      productId: item.productId || '',
      name: item.name || '',
      qty: Number(item.qty || 0),
      size: item.size || '',
      sugar: item.sugar || '',
      ice: item.ice || '',
      temp: item.temp || '冷',
      price: Number(item.basePrice ?? item.price ?? 0),
      basePrice: Number(item.basePrice ?? item.price ?? 0),
      toppings: Array.isArray(item.toppings) ? item.toppings : [],
      toppingsTotal: Number(item.toppingsTotal || 0),
      unitFinalPrice: Number(
        item.unitFinalPrice ??
        (
          Number(item.basePrice ?? item.price ?? 0) +
          Number(item.toppingsTotal || 0)
        )
      ),
      issues: Array.isArray(item.issues) ? item.issues : [],
    })),
  }));
}

function mergeDrafts(
  existingDrafts,
  addedDrafts,
  targetDraftIndex = 0
) {
  const normalized =
    normalizeStoredDrafts(existingDrafts);

  const additions =
    normalizeStoredDrafts(
      serializeDraftsForFirestore(addedDrafts)
    );

  if (normalized.length === 0) {
    return additions;
  }

  const safeIndex =
    Math.max(
      0,
      Math.min(
        normalized.length - 1,
        Number(targetDraftIndex || 0)
      )
    );

  const newItems =
    additions.flatMap(
      d => d.items || []
    );

  normalized[safeIndex].items.push(
    ...newItems
  );

  return normalized;
}

async function updateDraftDocument(draftId, drafts, extra = {}) {
  const db = getFirestoreDb();
  const draftRef = db.collection('orderDrafts').doc(draftId);
  const snap = await draftRef.get();

  if (!snap.exists) {
    throw new Error(`找不到草稿 ${draftId}`);
  }

  const summary = summarizeDrafts(drafts);
  const current = snap.data() || {};
  const bagQty = Number(extra.bagQty ?? current.bags?.qty ?? 0);
  const bagUnitPrice = 1;
  const bagSubtotal = bagQty * bagUnitPrice;

  await draftRef.set({
    drafts: serializeDraftsForFirestore(drafts),
    drinkCount: summary.drinkCount,
    originalTotal: summary.originalTotal,
    hasIssue: summary.hasIssue,
    promotion: summary.promotion,
    discountAmount: summary.discountAmount,
    bags: {
      qty: bagQty,
      unitPrice: bagUnitPrice,
      subtotal: bagSubtotal,
    },
    finalTotal: summary.finalTotal + bagSubtotal,
    updatedAt: FieldValue.serverTimestamp(),
    ...extra.fields,
  }, { merge: true });

  return {
    draftId,
    summary,
    bagQty,
    bagSubtotal,
    finalTotal: summary.finalTotal + bagSubtotal,
  };
}

async function getDraftDocument(draftId) {
  const snap = await getFirestoreDb()
    .collection('orderDrafts')
    .doc(draftId)
    .get();

  if (!snap.exists) return null;

  return {
    id: snap.id,
    ...snap.data(),
  };
}

function buildFormalSubOrders(draftDoc) {
  const runtimeDrafts =
    normalizeStoredDrafts(
      draftDoc.drafts || []
    );

  return runtimeDrafts.map(
    (draft, draftIndex) => {
      const serialized =
        serializeDraftsForFirestore(
          [draft]
        )[0];

      const promotion =
        calculatePromotionForItems(
          draft.items || []
        );

      const originalTotal =
        (serialized.items || []).reduce(
          (sum, item) =>
            sum + Number(item.subtotal || 0),
          0
        );

      const discountAmount =
        Number(
          promotion.discountAmount || 0
        );

      return {
        subOrderIndex: draftIndex,
        subOrderNo:
          `${draftDoc.id}-${draftIndex + 1}`,

        status: '待確認',

        fulfillment:
          serialized.fulfillment || '未指定',
        time:
          serialized.time || '未指定',
        address:
          serialized.address || '',

        items:
          serialized.items || [],

        drinkCount:
          Number(promotion.drinkCount || 0),

        originalTotal,
        promotion,
        discountAmount,

        finalTotal:
          originalTotal -
          discountAmount,
      };
    }
  );
}

async function createFormalOrderFromDraft(
  draftId,
  lineUserId
) {
  const db = getFirestoreDb();

  const draftRef =
    db.collection('orderDrafts')
      .doc(draftId);

  // 正式訂單直接沿用草稿 ID：
  // 可避免 LINE 重送 confirm postback 時建立重複訂單。
  const orderRef =
    db.collection('orders')
      .doc(draftId);

  return db.runTransaction(
    async transaction => {
      const [draftSnap, orderSnap] =
        await Promise.all([
          transaction.get(draftRef),
          transaction.get(orderRef),
        ]);

      if (!draftSnap.exists) {
        throw new Error(
          `找不到草稿 ${draftId}`
        );
      }

      // Idempotency：
      // 已經建立過就直接回傳原訂單，不重複新增。
      if (orderSnap.exists) {
        const existing =
          orderSnap.data() || {};

        return {
          orderId: orderRef.id,
          duplicated: true,
          status:
            existing.status || '待確認',
          subOrderCount:
            Array.isArray(existing.subOrders)
              ? existing.subOrders.length
              : 0,
          finalTotal:
            Number(
              existing.finalTotal || 0
            ),
        };
      }

      const draftDoc = {
        id: draftSnap.id,
        ...draftSnap.data(),
      };

      if (
        draftDoc.status === 'cancelled'
      ) {
        throw new Error(
          '這份草稿已取消，不能建立正式訂單。'
        );
      }

      if (
        draftDoc.hasIssue === true
      ) {
        throw new Error(
          '這份草稿仍有未完成欄位，不能建立正式訂單。'
        );
      }

      const subOrders =
        buildFormalSubOrders(
          draftDoc
        );

      if (subOrders.length === 0) {
        throw new Error(
          '草稿內沒有可建立的訂單。'
        );
      }

      const originalTotal =
        subOrders.reduce(
          (sum, order) =>
            sum +
            Number(order.originalTotal || 0),
          0
        );

      const discountAmount =
        subOrders.reduce(
          (sum, order) =>
            sum +
            Number(order.discountAmount || 0),
          0
        );

      const drinkCount =
        subOrders.reduce(
          (sum, order) =>
            sum +
            Number(order.drinkCount || 0),
          0
        );

      const bagQty =
        Number(
          draftDoc.bags?.qty || 0
        );

      const bagUnitPrice =
        Number(
          draftDoc.bags?.unitPrice || 1
        );

      const bagSubtotal =
        bagQty * bagUnitPrice;

      const finalTotal =
        originalTotal -
        discountAmount +
        bagSubtotal;

      const formalOrder = {
        schemaVersion: 1,
        source: 'LINE',

        status: '待確認',

        orderId: orderRef.id,
        draftId,

        lineUserId:
          lineUserId ||
          draftDoc.lineUserId ||
          '',

        rawMessage:
          draftDoc.rawMessage || '',

        subOrders,
        subOrderCount:
          subOrders.length,

        drinkCount,
        originalTotal,
        discountAmount,

        bags: {
          qty: bagQty,
          unitPrice: bagUnitPrice,
          subtotal: bagSubtotal,
        },

        finalTotal,

        // 這版只建立 orders，
        // 尚未送店員通知。
        staffNotificationStatus:
          'not_sent',

        createdAt:
          FieldValue.serverTimestamp(),
        updatedAt:
          FieldValue.serverTimestamp(),
      };

      transaction.set(
        orderRef,
        formalOrder
      );

      transaction.set(
        draftRef,
        {
          status: 'formalized',
          orderId: orderRef.id,
          formalizedAt:
            FieldValue.serverTimestamp(),
          updatedAt:
            FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return {
        orderId: orderRef.id,
        duplicated: false,
        status: '待確認',
        subOrderCount:
          subOrders.length,
        finalTotal,
      };
    }
  );
}

function buildFormalOrderCreatedText(result) {
  return [
    result.duplicated
      ? '✅ 這筆正式訂單已經建立過，不會重複新增。'
      : '✅ 訂單已正式建立！',
    '',
    `🧾 訂單編號：${result.orderId}`,
    `📦 訂單數：${result.subOrderCount}`,
    `💰 應收：$${result.finalTotal}`,
    `📌 狀態：${result.status}`,
    '',
    '🧪 V3.3 目前只建立正式 orders 資料。',
    '尚未通知店員，也不會自動進入製作流程。'
  ].join('\n');
}

async function replyPromoChoice(
  replyToken,
  text,
  draftId,
  promotion
) {
  const reminderDrafts =
    (promotion?.perDraft || [])
      .filter(p => p.shouldRemindAddOne);

  const items = [];

  if (reminderDrafts.length === 0) {
    items.push({
      type: 'action',
      action: {
        type: 'postback',
        label: '直接結帳',
        data: `promo_checkout|${draftId}`,
        displayText: '直接結帳'
      }
    });
  } else {
    for (const promo of reminderDrafts.slice(0, 8)) {
      const label =
        reminderDrafts.length === 1
          ? '➕ 再加一杯'
          : `➕ 訂單${promo.draftIndex + 1}加1杯`;

      items.push({
        type: 'action',
        action: {
          type: 'postback',
          label,
          data:
            `promo_add|${draftId}|${promo.draftIndex}`,
          displayText:
            reminderDrafts.length === 1
              ? '再加一杯'
              : `訂單${promo.draftIndex + 1}再加一杯`
        }
      });
    }

    items.push({
      type: 'action',
      action: {
        type: 'postback',
        label: '直接結帳',
        data: `promo_checkout|${draftId}`,
        displayText: '直接結帳'
      }
    });
  }

  items.push({
    type: 'action',
    action: {
      type: 'postback',
      label: '❌ 取消',
      data: `canceldraft|${draftId}`,
      displayText: '取消訂單'
    }
  });

  return replyLineMessages(
    replyToken,
    [{
      type: 'text',
      text,
      quickReply: { items }
    }]
  );
}

async function replyBagQuestion(replyToken, draftId) {
  return replyLineMessages(
    replyToken,
    [{
      type: 'text',
      text: '🛍️ 需要加購塑膠袋嗎？\n塑膠袋 $1／個',
      quickReply: {
        items: [0, 1, 2, 3].map(qty => ({
          type: 'action',
          action: {
            type: 'postback',
            label: qty === 0 ? '不用' : `${qty}個`,
            data: `bag|${draftId}|${qty}`,
            displayText:
              qty === 0
                ? '不用塑膠袋'
                : `塑膠袋${qty}個`
          }
        }))
      }
    }]
  );
}

function buildFinalDraftText(draftDoc) {
  const drafts =
    normalizeStoredDrafts(
      draftDoc.drafts || []
    );

  const output = [
    '🧋 最終訂單確認',
    ''
  ];

  drafts.forEach((draft, draftIndex) => {
    const isMulti = drafts.length > 1;

    if (isMulti) {
      output.push(`【訂單 ${draftIndex + 1}】`);
    }

    let draftOriginalTotal = 0;

    for (const item of draft.items || []) {
      const unitFinalPrice =
        Number(item.unitFinalPrice || 0);

      const subtotal =
        unitFinalPrice *
        Number(item.qty || 0);

      draftOriginalTotal += subtotal;

      output.push(
        `${item.name} ${item.size} ×${item.qty}　$${subtotal}`
      );

      const specs = [];

      if (item.sugar) {
        specs.push(item.sugar);
      }

      if (
        item.temp &&
        item.temp !== '冷'
      ) {
        specs.push(item.temp);
      } else if (item.ice) {
        specs.push(item.ice);
      }

      if (specs.length) {
        output.push(
          `　${specs.join(' / ')}`
        );
      }

      for (
        const topping of item.toppings || []
      ) {
        const toppingSubtotal =
          Number(topping.unitPrice || 0) *
          Number(topping.qty || 0);

        output.push(
          `　＋${topping.name}` +
          `${
            Number(topping.qty || 0) > 1
              ? ` ×${topping.qty}`
              : ''
          }` +
          `　+$${toppingSubtotal}`
        );
      }
    }

    output.push(
      draft.fulfillment === '外送'
        ? `📍 外送${
            draft.address
              ? `｜${draft.address}`
              : ''
          }`
        : '📍 自取'
    );

    output.push(
      `⏱ ${draft.time || '未指定'}`
    );

    const promo =
      calculatePromotionForItems(
        draft.items || []
      );

    output.push(
      `🥤 本單 ${promo.drinkCount} 杯`
    );

    output.push(
      `原價：$${draftOriginalTotal}`
    );

    if (promo.freeDrinkCount > 0) {
      output.push(
        `🎁 買10送1 ×${promo.freeDrinkCount}：-$${promo.discountAmount}`
      );
    }

    output.push(
      `本單優惠後：$${
        draftOriginalTotal -
        promo.discountAmount
      }`
    );

    if (draftIndex < drafts.length - 1) {
      output.push('');
    }
  });

  output.push('');

  const bagQty =
    Number(draftDoc.bags?.qty || 0);

  if (bagQty > 0) {
    output.push(
      `🛍️ 塑膠袋 ×${bagQty}：+$${bagQty}`
    );
  }

  output.push('----------------');
  output.push(
    `💰 全部應收：$${Number(draftDoc.finalTotal || 0)}`
  );

  output.push('');
  output.push(
    '✅ 按下「確認訂單」後，將建立正式 orders 訂單。'
  );
  output.push(
    '🧪 V3.3 暫時不通知店員，也不會自動進入製作流程。'
  );

  return output
    .join('\n')
    .slice(0, 4800);
}

async function replyFinalConfirmation(replyToken, draftId) {
  const draftDoc = await getDraftDocument(draftId);

  if (!draftDoc) {
    return replyLineMessage(
      replyToken,
      '⚠️ 找不到這份訂單草稿，請重新輸入訂單。'
    );
  }

  return replyLineMessages(
    replyToken,
    [{
      type: 'text',
      text: buildFinalDraftText(draftDoc),
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'postback',
              label: '✅ 確認訂單',
              data: `confirmdraft|${draftId}`,
              displayText: '確認訂單'
            }
          },
          {
            type: 'action',
            action: {
              type: 'postback',
              label: '✏️ 修改訂單',
              data: `modifydraft|${draftId}`,
              displayText: '修改訂單'
            }
          },
          {
            type: 'action',
            action: {
              type: 'postback',
              label: '❌ 取消',
              data: `canceldraft|${draftId}`,
              displayText: '取消訂單'
            }
          }
        ]
      }
    }]
  );
}

// LINE OA 既有自動回覆關鍵字。
// 這些文字交給 LINE Official Account Manager 原本的自動回覆處理，
// 避免 Webhook 再多回一則。
const PASSTHROUGH_KEYWORDS = new Set(['評論']);

// 商品資料：由 TEA TOP V1.7 規則版商品主檔內嵌。
const PRODUCTS = [{"id":"P001","category":"找好茶","name":"招牌高山青","sizes":{"M":30.0,"L":35.0,"瓶":55.0},"defaultSize":"L","aliases":["高山青","青茶"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P002","category":"找好茶","name":"青茶3Q","sizes":{"L":55.0},"defaultSize":"L","aliases":["青茶3Q","3Q青茶"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P003","category":"找好茶","name":"烏龍綠茶","sizes":{"M":25.0,"L":30.0,"瓶":50.0},"defaultSize":"L","aliases":["烏龍綠","烏綠"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P004","category":"找好茶","name":"茉香綠茶","sizes":{"M":30.0,"L":35.0,"瓶":55.0},"defaultSize":"L","aliases":["綠茶","茉綠"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P005","category":"找好茶","name":"大吉嶺紅茶","sizes":{"M":30.0,"L":35.0,"瓶":55.0},"defaultSize":"L","aliases":["紅茶","大吉嶺"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P006","category":"找好茶","name":"日月潭紅茶","sizes":{"M":30.0,"L":35.0,"瓶":55.0},"defaultSize":"L","aliases":["日月紅","日月潭"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P007","category":"找好茶","name":"冷泡冬片","sizes":{"M":30.0,"L":35.0,"瓶":55.0},"defaultSize":"L","aliases":["冬片","冷泡冬片"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":false},"slush":false,"note":""},{"id":"P008","category":"找好茶","name":"奶香金萱","sizes":{"L":40.0,"瓶":60.0},"defaultSize":"L","aliases":["奶金","金萱"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P009","category":"找好茶","name":"108茶王","sizes":{"L":45.0,"瓶":65.0},"defaultSize":"L","aliases":["108","茶王"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":false},"slush":false,"note":""},{"id":"P010","category":"找好茶","name":"白毫烏龍","sizes":{"M":60.0,"L":65.0},"defaultSize":"L","aliases":["白毫","白毫烏龍"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":false},"slush":false,"note":""},{"id":"P011","category":"找好茶","name":"珍珠紅/綠/青","sizes":{"L":45.0},"defaultSize":"L","aliases":["珍珠紅","珍珠綠","珍珠青"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P012","category":"找好茶","name":"焙香粉角金萱","sizes":{"L":50.0},"defaultSize":"L","aliases":["粉角金萱","焙香粉角金萱"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P013","category":"芝士奶蓋","name":"奶蓋綠/青/烏/金","sizes":{"L":60.0},"defaultSize":"L","aliases":["奶蓋綠","奶蓋青","奶蓋烏","奶蓋金"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P014","category":"芝士奶蓋","name":"奶蓋紅茶/日月紅","sizes":{"L":60.0},"defaultSize":"L","aliases":["奶蓋紅茶","奶蓋日月紅"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P015","category":"芝士奶蓋","name":"奶蓋蕎麥","sizes":{"L":60.0},"defaultSize":"L","aliases":["奶蓋蕎麥"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P016","category":"芝士奶蓋","name":"炳叔奶蓋金萱","sizes":{"M":65.0,"L":75.0},"defaultSize":"L","aliases":["炳叔奶蓋","奶蓋金萱"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P017","category":"找鮮奶","name":"紅茶鮮奶茶","sizes":{"L":65.0},"defaultSize":"L","aliases":["紅茶鮮奶","鮮奶紅茶"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P018","category":"找鮮奶","name":"珍珠鮮奶茶","sizes":{"L":65.0},"defaultSize":"L","aliases":["珍珠鮮奶"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P019","category":"找鮮奶","name":"108焙烏龍鮮奶茶","sizes":{"L":70.0},"defaultSize":"L","aliases":["108鮮奶","焙烏龍鮮奶"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":false},"slush":false,"note":""},{"id":"P020","category":"找鮮奶","name":"蕎麥鮮奶茶","sizes":{"L":70.0},"defaultSize":"L","aliases":["蕎麥鮮奶"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P021","category":"找鮮奶","name":"雙Q鮮奶茶","sizes":{"L":75.0},"defaultSize":"L","aliases":["雙Q鮮奶"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P022","category":"找鮮奶","name":"黑糖珍珠鮮奶","sizes":{"L":80.0},"defaultSize":"L","aliases":["黑糖珍珠鮮奶"],"active":true,"sugarMode":"固定","fixedSugar":"依標準配方","minSugar":"","sugarOptions":[],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P023","category":"找鮮奶","name":"紅豆粉粿鮮奶","sizes":{"M":65.0,"L":90.0},"defaultSize":"L","aliases":["紅豆粉粿鮮奶"],"active":true,"sugarMode":"固定","fixedSugar":"依標準配方","minSugar":"","sugarOptions":[],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P024","category":"找果茶","name":"甘蔗青","sizes":{"L":65.0,"瓶":85.0},"defaultSize":"L","aliases":["甘蔗青","蔗青"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P025","category":"找果茶","name":"芒果綠茶","sizes":{"L":50.0,"瓶":75.0},"defaultSize":"L","aliases":["芒果綠"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P026","category":"找果茶","name":"日月蘋安","sizes":{"L":55.0,"瓶":80.0},"defaultSize":"L","aliases":["蘋安","日月蘋安"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P027","category":"找果茶","name":"檸檬綠茶","sizes":{"L":55.0},"defaultSize":"L","aliases":["檸檬綠"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"固定","fixedIce":"依標準配方","iceOptions":[],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P028","category":"找果茶","name":"百香綠","sizes":{"L":60.0},"defaultSize":"L","aliases":["百香綠茶"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P029","category":"找果茶","name":"甘檸冷泡","sizes":{"L":65.0,"瓶":85.0},"defaultSize":"L","aliases":["甘檸","甘蔗檸檬冷泡"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":false},"slush":false,"note":""},{"id":"P030","category":"找果茶","name":"橙香白毫烏龍","sizes":{"L":69.0},"defaultSize":"L","aliases":["橙香白毫","白毫橙香"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":false},"slush":false,"note":""},{"id":"P031","category":"找果茶","name":"柳橙綠","sizes":{"L":70.0},"defaultSize":"L","aliases":["柳橙綠茶"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P032","category":"找果茶","name":"百香QQ","sizes":{"L":70.0},"defaultSize":"L","aliases":["百香QQ"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P033","category":"找果茶","name":"芒果鳳梨果粒茶","sizes":{"L":70.0},"defaultSize":"L","aliases":["芒果鳳梨"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P034","category":"找果茶","name":"葡萄柚果粒茶","sizes":{"L":70.0},"defaultSize":"L","aliases":["葡萄柚果粒"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P035","category":"無咖啡因","name":"古早味冬瓜茶","sizes":{"L":35.0,"瓶":55.0},"defaultSize":"L","aliases":["冬瓜茶","古早味冬瓜"],"active":true,"sugarMode":"固定","fixedSugar":"依標準配方","minSugar":"","sugarOptions":[],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P036","category":"無咖啡因","name":"蕎麥茶","sizes":{"L":40.0,"瓶":60.0},"defaultSize":"L","aliases":["蕎麥"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P037","category":"無咖啡因","name":"冬瓜仙草","sizes":{"L":45.0},"defaultSize":"L","aliases":["冬瓜仙草"],"active":true,"sugarMode":"固定","fixedSugar":"依標準配方","minSugar":"","sugarOptions":[],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P038","category":"無咖啡因","name":"蘋果冰醋","sizes":{"L":45.0,"瓶":75.0},"defaultSize":"L","aliases":["蘋果醋","冰醋"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P039","category":"無咖啡因","name":"冬瓜檸檬","sizes":{"L":55.0,"瓶":75.0},"defaultSize":"L","aliases":["冬檸"],"active":true,"sugarMode":"固定","fixedSugar":"依標準配方","minSugar":"","sugarOptions":[],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P040","category":"無咖啡因","name":"冬梅粉粿","sizes":{"L":60.0},"defaultSize":"L","aliases":["冬梅粉粿"],"active":true,"sugarMode":"固定","fixedSugar":"依標準配方","minSugar":"","sugarOptions":[],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P041","category":"無咖啡因","name":"蕎麥粉粿","sizes":{"L":60.0},"defaultSize":"L","aliases":["蕎麥粉粿"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P042","category":"無咖啡因","name":"轟蜜蕎麥粉粿","sizes":{"L":60.0,"瓶":85.0},"defaultSize":"L","aliases":["轟蜜蕎麥","蜜蕎麥粉粿"],"active":true,"sugarMode":"固定","fixedSugar":"依標準配方","minSugar":"","sugarOptions":[],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P043","category":"無咖啡因","name":"桂花凍蜜檸","sizes":{"L":65.0},"defaultSize":"L","aliases":["桂花凍蜜檸"],"active":true,"sugarMode":"固定","fixedSugar":"依標準配方","minSugar":"","sugarOptions":[],"iceMode":"固定","fixedIce":"依標準配方","iceOptions":[],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P044","category":"無咖啡因","name":"芒果冰沙","sizes":{"L":50.0},"defaultSize":"L","aliases":["芒果冰沙"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"冰沙固定","fixedIce":"冰沙","iceOptions":[],"temp":{"冷":true,"常溫":false,"溫":false,"熱":false},"slush":true,"note":""},{"id":"P045","category":"無咖啡因","name":"綠豆星沙","sizes":{"L":50.0},"defaultSize":"L","aliases":["綠豆沙","綠豆星沙"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"冰沙固定","fixedIce":"冰沙","iceOptions":[],"temp":{"冷":true,"常溫":false,"溫":false,"熱":false},"slush":true,"note":""},{"id":"P046","category":"無咖啡因","name":"綠豆星沙牛奶","sizes":{"L":60.0},"defaultSize":"L","aliases":["綠豆沙牛奶","綠豆星沙牛奶"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"冰沙固定","fixedIce":"冰沙","iceOptions":[],"temp":{"冷":true,"常溫":false,"溫":false,"熱":false},"slush":true,"note":""},{"id":"P047","category":"找特調","name":"冬瓜青茶","sizes":{"L":50.0,"瓶":70.0},"defaultSize":"L","aliases":["冬瓜青"],"active":true,"sugarMode":"固定","fixedSugar":"依標準配方","minSugar":"","sugarOptions":[],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P048","category":"找特調","name":"青梅青/綠","sizes":{"L":55.0},"defaultSize":"L","aliases":["青梅青","青梅綠"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P049","category":"找特調","name":"多多綠茶","sizes":{"L":55.0,"瓶":75.0},"defaultSize":"L","aliases":["多多綠"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P050","category":"找特調","name":"8冰綠","sizes":{"L":50.0,"瓶":75.0},"defaultSize":"L","aliases":["八冰綠","8冰綠"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P051","category":"找特調","name":"仙楂108","sizes":{"L":50.0,"瓶":75.0},"defaultSize":"L","aliases":["仙楂108","山楂108"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":false},"slush":false,"note":""},{"id":"P052","category":"找特調","name":"桂花凍108","sizes":{"L":60.0},"defaultSize":"L","aliases":["桂花108","桂花凍108"],"active":true,"sugarMode":"固定","fixedSugar":"依標準配方","minSugar":"","sugarOptions":[],"iceMode":"固定","fixedIce":"依標準配方","iceOptions":[],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P053","category":"找特調","name":"轟蜜茶","sizes":{"L":60.0,"瓶":85.0},"defaultSize":"L","aliases":["轟蜜茶","蜂蜜茶"],"active":true,"sugarMode":"限制調整","fixedSugar":"","minSugar":"微糖","sugarOptions":["正常糖","少糖","半糖","微糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P054","category":"找特調","name":"冬瓜檸檬粉角","sizes":{"L":65.0},"defaultSize":"L","aliases":["冬檸粉角","冬瓜檸檬粉角"],"active":true,"sugarMode":"固定","fixedSugar":"依標準配方","minSugar":"","sugarOptions":[],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P055","category":"找奶茶","name":"靚奶茶","sizes":{"L":55.0,"瓶":75.0},"defaultSize":"L","aliases":["靚奶"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P056","category":"找奶茶","name":"靚奶凍","sizes":{"L":65.0},"defaultSize":"L","aliases":["靚奶凍"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P057","category":"找奶茶","name":"奶茶/奶綠","sizes":{"L":55.0,"瓶":75.0},"defaultSize":"L","aliases":["奶茶","奶綠"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P058","category":"找奶茶","name":"烏龍奶茶","sizes":{"L":55.0,"瓶":75.0},"defaultSize":"L","aliases":["烏龍奶"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P059","category":"找奶茶","name":"108焙烏龍奶茶","sizes":{"L":60.0},"defaultSize":"L","aliases":["108奶茶","焙烏龍奶茶"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":false},"slush":false,"note":""},{"id":"P060","category":"找奶茶","name":"珍珠奶茶","sizes":{"L":55.0},"defaultSize":"L","aliases":["珍奶"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P061","category":"找奶茶","name":"粉角奶茶","sizes":{"L":65.0},"defaultSize":"L","aliases":["粉角奶"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P062","category":"找奶茶","name":"仙草凍奶茶","sizes":{"L":65.0},"defaultSize":"L","aliases":["仙草奶茶","仙草凍奶"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P063","category":"找奶茶","name":"粉粿奶茶","sizes":{"L":65.0},"defaultSize":"L","aliases":["粉粿奶"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P064","category":"找奶茶","name":"當代雙Q","sizes":{"L":65.0,"瓶":85.0},"defaultSize":"L","aliases":["雙Q","當代雙Q"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P065","category":"找奶茶","name":"珍珠紅豆奶","sizes":{"L":65.0},"defaultSize":"L","aliases":["紅豆珍奶","珍珠紅豆奶"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P066","category":"找奶茶","name":"紫芋西米露","sizes":{"L":70.0},"defaultSize":"L","aliases":["紫芋西米露","芋頭西米露"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":""},{"id":"P067","category":"找奶茶","name":"白毫烏龍輕乳茶","sizes":{"L":75.0},"defaultSize":"L","aliases":["白毫輕乳","烏龍輕乳"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":false},"slush":false,"note":""},{"id":"P068","category":"找果茶","name":"西瓜綠","sizes":{"L":65.0},"defaultSize":"L","aliases":["西瓜綠","西瓜綠茶"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":"新增：使用者補充"},{"id":"P069","category":"找果茶","name":"西瓜烏龍","sizes":{"L":70.0},"defaultSize":"L","aliases":["西瓜烏龍"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":false},"slush":false,"note":"新增：使用者補充"},{"id":"P070","category":"芝士奶蓋","name":"奶蓋西瓜綠","sizes":{"L":70.0},"defaultSize":"L","aliases":["奶蓋西瓜綠"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":true},"slush":false,"note":"新增：使用者補充"},{"id":"P071","category":"芝士奶蓋","name":"奶蓋西瓜烏龍","sizes":{"L":75.0},"defaultSize":"L","aliases":["奶蓋西瓜烏龍"],"active":true,"sugarMode":"自由調整","fixedSugar":"","minSugar":"","sugarOptions":["正常糖","少糖","半糖","微糖","一分糖","無糖"],"iceMode":"自由調整","fixedIce":"","iceOptions":["多冰","正常冰","少冰","微冰","去冰","完全去冰"],"temp":{"冷":true,"常溫":true,"溫":true,"熱":false},"slush":false,"note":"新增：使用者補充"}];

// ==========================================
// Webhook 主入口
// ==========================================
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).send('OK');
  }

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const rawBody = await readRawBody(req);

    if (!rawBody) {
      return res.status(200).send('OK');
    }

    const signature = String(req.headers['x-line-signature'] || '');

    if (signature) {
      if (!CHANNEL_SECRET) {
        console.error('缺少 LINE_CHANNEL_SECRET');
        return res.status(500).send('Missing LINE_CHANNEL_SECRET');
      }

      const isValid = verifyLineSignature(rawBody, signature, CHANNEL_SECRET);

      if (!isValid) {
        console.warn('LINE Webhook signature 驗證失敗');
        return res.status(401).send('Invalid signature');
      }

      let body;

      try {
        body = JSON.parse(rawBody);
      } catch (error) {
        console.error('LINE Webhook JSON 解析失敗:', error);
        return res.status(400).send('Invalid JSON');
      }

      const { events } = body || {};

      if (!Array.isArray(events) || events.length === 0) {
        return res.status(200).send('OK');
      }

      for (const event of events) {
        const replyToken = event.replyToken;
        if (!replyToken) continue;

        if (event.type === 'postback') {
          const data = String(event.postback?.data || '');
          const lineUserId = event.source?.userId || '';

          if (data.startsWith('promo_add|')) {
            const parts = data.split('|');
            const draftId = parts[1] || '';
            const targetDraftIndex =
              Math.max(0, Number(parts[2] || 0));

            const draftDoc =
              await getDraftDocument(draftId);

            if (!draftDoc) {
              await replyLineMessage(
                replyToken,
                '⚠️ 找不到這份草稿，請重新輸入訂單。'
              );
              continue;
            }

            const targetDraft =
              (draftDoc.drafts || [])[targetDraftIndex];

            if (!targetDraft) {
              await replyLineMessage(
                replyToken,
                '⚠️ 找不到要加杯的那張訂單，請重新輸入訂單。'
              );
              continue;
            }

            await getFirestoreDb()
              .collection('orderDrafts')
              .doc(draftId)
              .set({
                status: 'waiting_add_one',
                updatedAt:
                  FieldValue.serverTimestamp(),
              }, { merge: true });

            await setLineSession(lineUserId, {
              mode: 'waiting_add_one',
              draftId,
              targetDraftIndex,
            });

            await replyLineMessage(
              replyToken,
              [
                `➕ 好的，請替「訂單 ${targetDraftIndex + 1}」再加 1 杯飲料。`,
                '',
                '例如：',
                '綠茶一分糖去冰',
                '奶茶加珍珠微糖微冰',
                '',
                '這一步只接受 1 杯，原本訂單資料會保留。'
              ].join('\n')
            );
            continue;
          }

          if (data.startsWith('promo_checkout|')) {
            const draftId =
              data.slice('promo_checkout|'.length);

            await getFirestoreDb()
              .collection('orderDrafts')
              .doc(draftId)
              .set({
                status: 'waiting_bag',
                updatedAt: FieldValue.serverTimestamp(),
              }, { merge: true });

            await clearLineSession(lineUserId);
            await replyBagQuestion(replyToken, draftId);
            continue;
          }

          if (data.startsWith('bag|')) {
            const parts = data.split('|');
            const draftId = parts[1];
            const bagQty = Math.max(
              0,
              Math.min(99, Number(parts[2] || 0))
            );

            const draftDoc =
              await getDraftDocument(draftId);

            if (!draftDoc) {
              await replyLineMessage(
                replyToken,
                '⚠️ 找不到這份草稿，請重新輸入訂單。'
              );
              continue;
            }

            const runtimeDrafts =
              normalizeStoredDrafts(draftDoc.drafts || []);

            await updateDraftDocument(
              draftId,
              runtimeDrafts,
              {
                bagQty,
                fields: {
                  status: 'waiting_confirm',
                },
              }
            );

            await clearLineSession(lineUserId);
            await replyFinalConfirmation(
              replyToken,
              draftId
            );
            continue;
          }

          if (data.startsWith('confirmdraft|')) {
            const draftId =
              data.slice('confirmdraft|'.length);

            try {
              const result =
                await createFormalOrderFromDraft(
                  draftId,
                  lineUserId
                );

              await clearLineSession(
                lineUserId
              );

              await replyLineMessage(
                replyToken,
                buildFormalOrderCreatedText(
                  result
                )
              );
            } catch (error) {
              console.error(
                '建立正式訂單失敗',
                error
              );

              await replyLineMessage(
                replyToken,
                [
                  '⚠️ 正式訂單建立失敗。',
                  '草稿仍然保留，沒有遺失。',
                  '',
                  `原因：${error.message || '未知錯誤'}`
                ].join('\n')
              );
            }

            continue;
          }

          if (data.startsWith('modifydraft|')) {
            const draftId =
              data.slice('modifydraft|'.length);

            await setLineSession(lineUserId, {
              mode: 'replace_order',
              draftId,
            });

            await replyLineMessage(
              replyToken,
              [
                '✏️ 請重新輸入完整訂單內容。',
                '送出後會覆蓋目前這份草稿。',
                '',
                '目前測試版請把飲品、糖冰、自取／外送資料一次輸入完整。'
              ].join('\n')
            );
            continue;
          }

          if (data.startsWith('canceldraft|')) {
            const draftId =
              data.slice('canceldraft|'.length);

            await getFirestoreDb()
              .collection('orderDrafts')
              .doc(draftId)
              .set({
                status: 'cancelled',
                cancelledAt:
                  FieldValue.serverTimestamp(),
                updatedAt:
                  FieldValue.serverTimestamp(),
              }, { merge: true });

            await clearLineSession(lineUserId);

            await replyLineMessage(
              replyToken,
              '❌ 已取消這份訂單草稿。\n目前沒有建立正式訂單。'
            );
            continue;
          }

          // 保留舊 V2 測試 postback 相容性
          if (data === 'cancel') {
            await replyLineMessage(
              replyToken,
              '❌ 已取消這份訂單草稿。\n\n目前仍是測試模式，沒有建立任何正式訂單。'
            );
            continue;
          }

          continue;
        }

        if (
          event.type !== 'message' ||
          event.message?.type !== 'text'
        ) {
          continue;
        }

        const userMsg = String(event.message.text || '').trim();
        const userId = event.source?.userId || '';

        if (!userMsg) continue;

        // V3.2：如果使用者正在「再加1杯」或「重新輸入完整訂單」
        // 優先處理該 Session，不建立新的獨立草稿。
        const activeSession =
          await getLineSession(userId);

        if (
          activeSession?.mode === 'waiting_add_one' &&
          activeSession?.draftId
        ) {
          const addedDrafts =
            parseOrderMessage(userMsg);

          const addedSummary =
            summarizeDrafts(addedDrafts);

          const addedItemHasIssue =
            addedDrafts.length === 0 ||
            addedDrafts.some(draft =>
              (draft.items || []).some(item =>
                Array.isArray(item.issues) &&
                item.issues.length > 0
              )
            );

          if (addedItemHasIssue) {
            await replyLineMessage(
              replyToken,
              '⚠️ 新增的飲料資料不完整，請重新輸入「1杯」完整飲料內容。'
            );
            continue;
          }

          if (addedSummary.drinkCount !== 1) {
            await replyLineMessage(
              replyToken,
              `⚠️ 目前辨識到 ${addedSummary.drinkCount} 杯。\n這一步只需要再加 1 杯，請重新輸入。`
            );
            continue;
          }

          const draftDoc =
            await getDraftDocument(
              activeSession.draftId
            );

          if (!draftDoc) {
            await clearLineSession(userId);
            await replyLineMessage(
              replyToken,
              '⚠️ 原本的訂單草稿已不存在，請重新輸入完整訂單。'
            );
            continue;
          }

          const targetDraftIndex =
            Math.max(
              0,
              Number(
                activeSession.targetDraftIndex || 0
              )
            );

          const mergedDrafts =
            mergeDrafts(
              draftDoc.drafts || [],
              addedDrafts,
              targetDraftIndex
            );

          const updated =
            await updateDraftDocument(
              activeSession.draftId,
              mergedDrafts,
              {
                fields: {
                  status: 'waiting_bag',
                  lastAddedMessage: userMsg,
                },
              }
            );

          await clearLineSession(userId);

          const addedName =
            addedDrafts[0]?.items?.[0]?.name ||
            '飲料';

          const targetPromo =
            updated.summary.promotion.perDraft
              ?.find(
                p =>
                  p.draftIndex ===
                  targetDraftIndex
              );

          const remainingReminder =
            (updated.summary.promotion.perDraft || [])
              .some(p => p.shouldRemindAddOne);

          const statusText = [
            `✅ 已加入到訂單 ${targetDraftIndex + 1}：${addedName} ×1`,
            targetPromo
              ? `🥤 訂單 ${targetDraftIndex + 1} 現在共 ${targetPromo.drinkCount} 杯`
              : '',
            targetPromo?.freeDrinkCount > 0
              ? `🎁 本單買10送1 ×${targetPromo.freeDrinkCount}，折抵 $${targetPromo.discountAmount}`
              : '',
            `💰 全部訂單優惠後合計：$${updated.summary.finalTotal}`
          ].filter(Boolean).join('\n');

          if (remainingReminder) {
            await getFirestoreDb()
              .collection('orderDrafts')
              .doc(activeSession.draftId)
              .set({
                status: 'waiting_promo_choice',
                updatedAt:
                  FieldValue.serverTimestamp(),
              }, { merge: true });

            await replyPromoChoice(
              replyToken,
              statusText +
                '\n\n仍有其他訂單只差 1 杯即可多享一次優惠。',
              activeSession.draftId,
              updated.summary.promotion
            );
            continue;
          }

          await replyLineMessages(
            replyToken,
            [
              {
                type: 'text',
                text: statusText
              },
              {
                type: 'text',
                text: '🛍️ 需要加購塑膠袋嗎？\n塑膠袋 $1／個',
                quickReply: {
                  items: [0, 1, 2, 3].map(qty => ({
                    type: 'action',
                    action: {
                      type: 'postback',
                      label:
                        qty === 0
                          ? '不用'
                          : `${qty}個`,
                      data:
                        `bag|${activeSession.draftId}|${qty}`,
                      displayText:
                        qty === 0
                          ? '不用塑膠袋'
                          : `塑膠袋${qty}個`
                    }
                  }))
                }
              }
            ]
          );
          continue;
        }

        if (
          activeSession?.mode === 'replace_order' &&
          activeSession?.draftId
        ) {
          const replacementDrafts =
            parseOrderMessage(userMsg);

          const replacementSummary =
            summarizeDrafts(replacementDrafts);

          if (
            replacementDrafts.length === 0 ||
            replacementSummary.hasIssue
          ) {
            await replyLineMessage(
              replyToken,
              '⚠️ 新訂單資料仍有缺漏，請重新輸入完整內容。'
            );
            continue;
          }

          await updateDraftDocument(
            activeSession.draftId,
            replacementDrafts,
            {
              bagQty: 0,
              fields: {
                status:
                  replacementSummary.promotion.shouldRemindAddOne
                    ? 'waiting_promo_choice'
                    : 'waiting_bag',
                rawMessage: userMsg,
              },
            }
          );

          await clearLineSession(userId);

          const replacementText =
            buildDraftReply(replacementDrafts);

          if (
            replacementSummary.promotion.shouldRemindAddOne
          ) {
            await replyPromoChoice(
              replyToken,
              replacementText,
              activeSession.draftId,
              replacementSummary.promotion
            );
          } else {
            await getFirestoreDb()
              .collection('orderDrafts')
              .doc(activeSession.draftId)
              .set({
                status: 'waiting_bag',
                updatedAt:
                  FieldValue.serverTimestamp(),
              }, { merge: true });

            await replyLineMessages(
              replyToken,
              [
                {
                  type: 'text',
                  text: replacementText
                },
                {
                  type: 'text',
                  text: '🛍️ 需要加購塑膠袋嗎？\n塑膠袋 $1／個',
                  quickReply: {
                    items: [0, 1, 2, 3].map(qty => ({
                      type: 'action',
                      action: {
                        type: 'postback',
                        label: qty === 0 ? '不用' : `${qty}個`,
                        data: `bag|${activeSession.draftId}|${qty}`,
                        displayText:
                          qty === 0
                            ? '不用塑膠袋'
                            : `塑膠袋${qty}個`
                      }
                    }))
                  }
                }
              ]
            );
          }
          continue;
        }

        const normalizedIdCommand = userMsg
          .replace(/[’'`]/g, '')
          .replace(/\s+/g, '')
          .toUpperCase();

        if (
          normalizedIdCommand === '查ID' ||
          normalizedIdCommand === 'MYID'
        ) {
          await replyLineMessage(
            replyToken,
            `您的員工 ID 是：\n\n${userId}\n\n(請長按複製，貼到排班系統設定頁)`
          );
          continue;
        }

        if (PASSTHROUGH_KEYWORDS.has(userMsg)) {
          continue;
        }

        const drafts = parseOrderMessage(userMsg);

        if (drafts.length === 0) {
          await replyLineMessage(
            replyToken,
            [
              '🧋 目前沒有辨識到飲料商品。',
              '',
              '可以像這樣輸入：',
              '綠茶*2無糖去冰，我過去拿',
              '奶香金萱2杯微糖微冰',
              '西瓜烏龍*3微糖微冰，幫我送 東山路一段189-19號',
              '',
              '目前為 LINE 接單測試版，不會直接成立訂單。'
            ].join('\n')
          );
          continue;
        }

        let savedDraft;

        try {
          savedDraft =
            await saveOrderDraftToFirestore({
              event,
              lineUserId: userId,
              rawMessage: userMsg,
              drafts,
            });
        } catch (error) {
          console.error(
            'Firestore 訂單草稿寫入失敗:',
            error
          );

          await replyLineMessage(
            replyToken,
            [
              '⚠️ 訂單內容已辨識，但測試草稿寫入 Firestore 失敗。',
              '目前不會成立正式訂單。',
              '',
              '請通知店家檢查系統。'
            ].join('\n')
          );
          continue;
        }

        const replyText =
          buildDraftReply(drafts) +
          `\n\n🗃️ 草稿編號：${savedDraft.draftId}`;

        const currentSummary =
          summarizeDrafts(drafts);

        if (currentSummary.hasIssue) {
          await replyOrderDraft(
            replyToken,
            replyText,
            userMsg,
            true
          );
          continue;
        }

        if (
          currentSummary.promotion.shouldRemindAddOne
        ) {
          await getFirestoreDb()
            .collection('orderDrafts')
            .doc(savedDraft.draftId)
            .set({
              status: 'waiting_promo_choice',
              updatedAt:
                FieldValue.serverTimestamp(),
            }, { merge: true });

          await replyPromoChoice(
            replyToken,
            replyText,
            savedDraft.draftId,
            currentSummary.promotion
          );
          continue;
        }

        await getFirestoreDb()
          .collection('orderDrafts')
          .doc(savedDraft.draftId)
          .set({
            status: 'waiting_bag',
            updatedAt:
              FieldValue.serverTimestamp(),
          }, { merge: true });

        await replyLineMessages(
          replyToken,
          [
            {
              type: 'text',
              text: replyText
            },
            {
              type: 'text',
              text: '🛍️ 需要加購塑膠袋嗎？\n塑膠袋 $1／個',
              quickReply: {
                items: [0, 1, 2, 3].map(qty => ({
                  type: 'action',
                  action: {
                    type: 'postback',
                    label: qty === 0 ? '不用' : `${qty}個`,
                    data: `bag|${savedDraft.draftId}|${qty}`,
                    displayText:
                      qty === 0
                        ? '不用塑膠袋'
                        : `塑膠袋${qty}個`
                  }
                }))
              }
            }
          ]
        );
      }

      return res.status(200).send('OK');
    }

    // --------------------------------------------------
    // B. 班表 APP → LINE 員工通知
    // 必須帶 Firebase Authentication ID Token
    // --------------------------------------------------
    const firebaseAuthResult =
      await verifyFirebaseRequest(req);

    if (!firebaseAuthResult.ok) {
      return res
        .status(firebaseAuthResult.status)
        .send(firebaseAuthResult.error);
    }

    let body;

    try {
      body = JSON.parse(rawBody);
    } catch (error) {
      return res.status(400).send('Invalid JSON');
    }

    const { to, messages } = body || {};

    if (to && messages) {
      await sendLinePush(to, messages);

      console.log(
        'LINE Push authorized by Firebase user:',
        firebaseAuthResult.user.uid
      );

      return res.status(200).send('Sent');
    }

    return res.status(200).send('No Action');

  } catch (error) {
    console.error('LINE Webhook Error:', error);
    return res.status(500).send('Internal Server Error');
  }
}

function verifyLineSignature(rawBody, signature, channelSecret) {
  const expectedSignature = crypto
    .createHmac('sha256', channelSecret)
    .update(rawBody, 'utf8')
    .digest('base64');

  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

async function readRawBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(
      Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk)
    );
  }

  return Buffer.concat(chunks).toString('utf8');
}


// ==========================================
// LINE API
// ==========================================
async function sendLinePush(to, messages) {
  if (!CHANNEL_ACCESS_TOKEN) {
    throw new Error('缺少 LINE_CHANNEL_ACCESS_TOKEN');
  }

  const response = await fetch(
    'https://api.line.me/v2/bot/message/multicast',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ to, messages }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LINE multicast 發送失敗：${response.status} ${errorText}`
    );
  }
}

async function replyLineMessages(replyToken, messages) {
  if (!CHANNEL_ACCESS_TOKEN) {
    throw new Error('缺少 LINE_CHANNEL_ACCESS_TOKEN');
  }

  const response = await fetch(
    'https://api.line.me/v2/bot/message/reply',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        replyToken,
        messages,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LINE Reply 發送失敗：${response.status} ${errorText}`
    );
  }
}

async function replyLineMessage(replyToken, text) {
  return replyLineMessages(
    replyToken,
    [{ type: 'text', text }]
  );
}

async function replyOrderDraft(replyToken, text, originalMsg, hasIssue) {
  // LINE Postback data 與 fillInText 上限 300 字元。
  // 留一點空間給 action prefix。
  const canCarryOriginal = originalMsg.length <= 285;

  const items = [];

  if (!hasIssue && canCarryOriginal) {
    items.push({
      type: 'action',
      action: {
        type: 'postback',
        label: '✅ 確認訂單',
        data: `confirm|${originalMsg}`,
        displayText: '確認訂單'
      }
    });
  }

  if (canCarryOriginal) {
    items.push({
      type: 'action',
      action: {
        type: 'postback',
        label: '✏️ 修改訂單',
        data: `modify|${originalMsg}`,
        displayText: '修改訂單',
        inputOption: 'openKeyboard',
        fillInText: originalMsg
      }
    });
  }

  items.push({
    type: 'action',
    action: {
      type: 'postback',
      label: '❌ 取消',
      data: 'cancel',
      displayText: '取消訂單'
    }
  });

  const suffix = !canCarryOriginal
    ? '\n\n⚠️ 這筆訊息較長，測試版暫不提供確認／修改按鈕，請直接重新輸入。'
    : hasIssue
      ? '\n\n⚠️ 資料尚有缺漏，因此暫不顯示「確認訂單」。'
      : '';

  return replyLineMessages(
    replyToken,
    [{
      type: 'text',
      text: `${text}${suffix}`,
      quickReply: {
        items
      }
    }]
  );
}


// ==========================================
// V1.7 訂單解析核心
// ==========================================

const SUGAR_ALIASES = {
  '正常甜度': '正常糖',
  '正常甜': '正常糖',
  '正常糖': '正常糖',
  '全糖': '正常糖',
  '少糖': '少糖',
  '少堂': '少糖',
  '半糖': '半糖',
  '半堂': '半糖',
  '微糖': '微糖',
  '微堂': '微糖',
  '為唐': '微糖',
  '微唐': '微糖',
  '為糖': '微糖',
  '一分糖': '一分糖',
  '1分糖': '一分糖',
  '一分': '一分糖',
  '1分': '一分糖',
  '無糖': '無糖',
  '無堂': '無糖',
  '0糖': '無糖',
  '零糖': '無糖',
};

const ICE_ALIASES = {
  '完全去冰': '完全去冰',
  '正常冰': '正常冰',
  '正常兵': '正常冰',
  '少冰': '少冰',
  '少兵': '少冰',
  '微冰': '微冰',
  '微兵': '微冰',
  '為兵': '微冰',
  '為冰': '微冰',
  '威冰': '微冰',
  '去冰': '去冰',
  '去兵': '去冰',
  '趣冰': '去冰',
};

const TEMP_ALIASES = {
  '常溫': '常溫',
  '熱飲': '熱',
  '做熱': '熱',
  '熱的': '熱',
  '溫飲': '溫',
  '溫的': '溫',
  '冷飲': '冷',
  '冷的': '冷',
};

function normalizePunctuation(text) {
  return String(text || '')
    .replace(/[，、；;]/g, ',')
    .replace(/[。]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeFulfillment(text) {
  return String(text || '')
    .replaceAll('自娶', '自取')
    .replaceAll('我過去拿', '自取')
    .replaceAll('我等等拿', '自取')
    .replaceAll('我等一下拿', '自取')
    .replaceAll('我現在過去', '自取')
    .replaceAll('我去拿', '自取')
    .replaceAll('自己拿', '自取');
}

function chineseNumber(value) {
  if (!value) return null;
  if (/^\d+$/.test(value)) return parseInt(value, 10);

  const map = {
    '一': 1, '二': 2, '兩': 2, '三': 3, '四': 4,
    '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
  };

  if (value === '十') return 10;

  if (value.includes('十')) {
    const [a, b] = value.split('十');
    return (a ? map[a] : 1) * 10 + (b ? map[b] : 0);
  }

  return map[value] || null;
}

function activeNames() {
  const result = [];

  for (const product of PRODUCTS) {
    if (!product.active) continue;

    result.push({
      text: product.name,
      product
    });

    for (const alias of product.aliases || []) {
      if (alias) {
        result.push({
          text: alias,
          product
        });
      }
    }
  }

  return result.sort((a, b) => b.text.length - a.text.length);
}

function findProductHits(text) {
  const hits = [];

  for (const entry of activeNames()) {
    let pos = 0;

    while ((pos = text.indexOf(entry.text, pos)) >= 0) {
      hits.push({
        pos,
        len: entry.text.length,
        matched: entry.text,
        product: entry.product,
      });

      pos += entry.text.length;
    }
  }

  hits.sort((a, b) => a.pos - b.pos || b.len - a.len);

  const result = [];

  for (const hit of hits) {
    const overlaps = result.some(existing =>
      !(hit.pos + hit.len <= existing.pos ||
        hit.pos >= existing.pos + existing.len)
    );

    if (!overlaps) result.push(hit);
  }

  return result.sort((a, b) => a.pos - b.pos);
}

function quantityAround(text, hit) {
  const before = text.slice(
    Math.max(0, hit.pos - 16),
    hit.pos
  );

  const after = text.slice(
    hit.pos + hit.len,
    hit.pos + hit.len + 40
  );

  // 商品名稱前面的數量：
  // 2綠茶 / 2杯綠茶 / 2*綠茶
  let match = before.match(
    /(\d+|[一二兩三四五六七八九十]+)\s*(?:杯|瓶|[xX×*])?\s*$/
  );

  if (match) {
    const qty = chineseNumber(match[1]);
    if (qty && qty <= 300) return qty;
  }

  // 商品名稱後直接數量：
  // 綠茶*2 / 綠茶x2 / 綠茶2杯
  match = after.match(
    /^\s*(?:[xX×*]\s*)?(\d+|[一二兩三四五六七八九十]+)\s*(?:杯|瓶)?/
  );

  if (match) {
    const qty = chineseNumber(match[1]);
    if (qty && qty <= 300) return qty;
  }

  // V3.2.3：
  // 綠茶加珍珠*2 / 綠茶加珍珠2杯
  // 視為「綠茶+珍珠，共2杯」
  // 但「珍珠雙份 / 雙份珍珠」不套這條。
  const toppingNames = TOPPINGS
    .flatMap(t => t.aliases || [t.name])
    .sort((a, b) => b.length - a.length);

  for (const toppingName of toppingNames) {
    const escaped = toppingName
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const toppingQtyRegex = new RegExp(
      `(?:加)?${escaped}\\s*(?:[xX×*]\\s*)?(\\d+|[一二兩三四五六七八九十]+)\\s*杯?`
    );

    const m = after.match(toppingQtyRegex);

    if (m) {
      const nearby = after.slice(
        Math.max(0, m.index - 6),
        m.index + m[0].length + 6
      );

      if (
        !nearby.includes('雙份') &&
        !nearby.includes('兩份') &&
        !nearby.includes('2份')
      ) {
        const qty = chineseNumber(m[1]);
        if (qty && qty <= 300) return qty;
      }
    }
  }

  return 1;
}

function sizeFrom(segment, product) {
  // 瓶裝優先，避免「1瓶」被當成數量後漏掉尺寸。
  if (/瓶裝|瓶\b/.test(segment)) return '瓶';
  if (/(^|[^A-Za-z])M([^A-Za-z]|$)|中杯/i.test(segment)) return 'M';
  if (/(^|[^A-Za-z])L([^A-Za-z]|$)|大杯/i.test(segment)) return 'L';

  return product.defaultSize || 'L';
}

function sugarFrom(segment) {
  for (const [raw, normalized] of Object.entries(SUGAR_ALIASES)) {
    if (segment.includes(raw)) return normalized;
  }
  return '';
}

function iceFrom(segment) {
  // 長字串優先，避免完全去冰先被「去冰」截走。
  const keys = Object.keys(ICE_ALIASES)
    .sort((a, b) => b.length - a.length);

  for (const raw of keys) {
    if (segment.includes(raw)) return ICE_ALIASES[raw];
  }

  return '';
}

function tempFrom(segment) {
  for (const [raw, normalized] of Object.entries(TEMP_ALIASES)) {
    if (segment.includes(raw)) return normalized;
  }
  return '冷';
}

function sugarRank(sugar) {
  return {
    '無糖': 0,
    '一分糖': 1,
    '微糖': 2,
    '半糖': 3,
    '少糖': 4,
    '正常糖': 5,
  }[sugar] ?? 99;
}

function globalModifiers(text) {
  const markers = ['全部', '通通', '全都', '都', '皆'];

  let position = -1;

  for (const marker of markers) {
    position = Math.max(position, text.lastIndexOf(marker));
  }

  if (position < 0) {
    return { sugar: '', ice: '', temp: '' };
  }

  const tail = text.slice(position);
  const temp = tempFrom(tail);

  return {
    sugar: sugarFrom(tail),
    ice: iceFrom(tail),
    temp: temp !== '冷' ? temp : '',
  };
}

function validateItem(item) {
  const product = PRODUCTS.find(p => p.id === item.productId);
  const issues = [];

  if (!product) return ['商品不存在'];

  if (!product.sizes?.[item.size]) {
    const available = Object.keys(product.sizes || {}).join(' / ') || '無';
    issues.push(`沒有 ${item.size} 尺寸，可選：${available}`);
  }

  // 糖度
  if (product.sugarMode === '固定') {
    item.sugar = product.fixedSugar || '固定甜度（依標準配方）';
  } else {
    if (!item.sugar) {
      issues.push('缺糖度');
    }

    if (
      product.minSugar &&
      item.sugar &&
      sugarRank(item.sugar) < sugarRank(product.minSugar)
    ) {
      issues.push(`最低糖度為 ${product.minSugar}`);
    }

    if (
      Array.isArray(product.sugarOptions) &&
      product.sugarOptions.length &&
      item.sugar &&
      !product.sugarOptions.includes(item.sugar)
    ) {
      issues.push(`不可選 ${item.sugar}`);
    }
  }

  // 冰沙
  if (product.slush || product.iceMode === '冰沙固定') {
    if (
      item.requestedTemp &&
      ['常溫', '溫', '熱'].includes(item.requestedTemp)
    ) {
      issues.push('冰沙只能做冷飲');
    }

    if (
      item.requestedIce &&
      ['去冰', '完全去冰'].includes(item.requestedIce)
    ) {
      issues.push('冰沙無法去冰');
    }

    item.temp = '冷';
    item.ice = product.fixedIce || '冰沙';
    return issues;
  }

  // 溫度
  if (!product.temp?.[item.temp]) {
    issues.push(`不可做${item.temp}`);
  }

  // 常溫 / 溫 / 熱，不再要求冰量
  if (['常溫', '溫', '熱'].includes(item.temp)) {
    item.ice = '';
    return issues;
  }

  // 冷飲冰量
  if (product.iceMode === '固定') {
    item.ice = product.fixedIce || '固定冰量（依標準配方）';
  } else {
    if (!item.ice) {
      issues.push('缺冰量');
    }

    if (
      Array.isArray(product.iceOptions) &&
      product.iceOptions.length &&
      item.ice &&
      !product.iceOptions.includes(item.ice)
    ) {
      issues.push(`不可選 ${item.ice}`);
    }
  }

  return issues;
}

function extractAddress(text) {
  // 目前先抓常見台灣路/街/大道地址。
  const match = String(text || '').match(
    /([\u4e00-\u9fa5A-Za-z0-9\-]{2,35}(?:路|街|大道)(?:[一二三四五六七八九十0-9]+段)?(?:[0-9一二三四五六七八九十]+巷)?(?:[0-9一二三四五六七八九十]+弄)?[0-9\-]+號)/
  );

  return match ? match[1] : '';
}

function splitOrderBlocks(raw) {
  const normalized = normalizeFulfillment(raw);
  const lines = normalized
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);

  const blocks = [];
  let current = [];

  const flush = () => {
    if (current.length) {
      blocks.push(current.join('，'));
      current = [];
    }
  };

  for (const line of lines) {
    current.push(line);

    if (
      line.includes('自取') ||
      line.includes('外送') ||
      line.includes('幫我送') ||
      extractAddress(line)
    ) {
      flush();
    }
  }

  flush();
  return blocks.length ? blocks : [normalized];
}

function parseOrderBlock(raw) {
  const text = normalizePunctuation(
    normalizeFulfillment(raw)
  );

  const hits = findProductHits(text);
  const global = globalModifiers(text);
  const items = [];

  hits.forEach((hit, index) => {
    const nextPos =
      index < hits.length - 1
        ? hits[index + 1].pos
        : text.length;

    const segment = text.slice(hit.pos, nextPos);
    const product = hit.product;

    let sugar = sugarFrom(segment) || global.sugar;
    let ice = iceFrom(segment) || global.ice;
    let temp = tempFrom(segment);

    if (temp === '冷' && global.temp) {
      temp = global.temp;
    }

    const size = sizeFrom(segment, product);

    const toppings =
      findToppingsInSegment(segment);

    const item = {
      productId: product.id,
      name: product.name,
      qty: quantityAround(text, hit),
      size,
      sugar,
      ice,
      temp,
      requestedIce: ice,
      requestedTemp: temp,

      // 飲品本體價格
      price: Number(product.sizes?.[size] || 0),
      basePrice: Number(product.sizes?.[size] || 0),

      // V3.1 加料
      toppings,
      toppingsTotal: toppingsTotal(toppings),
      unitFinalPrice: 0,

      issues: [],
    };

    item.issues = validateItem(item);

    item.price =
      Number(product.sizes?.[item.size] || 0);
    item.basePrice = item.price;
    item.toppingsTotal =
      toppingsTotal(item.toppings);
    item.unitFinalPrice =
      item.basePrice + item.toppingsTotal;

    items.push(item);
  });

  let fulfillment = '未指定';

  if (text.includes('自取')) {
    fulfillment = '自取';
  }

  if (
    text.includes('外送') ||
    text.includes('幫我送') ||
    extractAddress(text)
  ) {
    fulfillment = '外送';
  }

  const timeMatch = text.match(/(\d{1,2})[:：](\d{2})/);

  let time = timeMatch
    ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`
    : '未指定';

  if (fulfillment === '自取' && time === '未指定') {
    time = '盡快（約5–10分鐘）';
  }

  if (fulfillment === '外送' && time === '未指定') {
    time = '做好就送';
  }

  return {
    raw,
    items,
    fulfillment,
    time,
    address:
      fulfillment === '外送'
        ? extractAddress(text)
        : '',
  };
}

function parseOrderMessage(raw) {
  return splitOrderBlocks(raw)
    .map(parseOrderBlock)
    .filter(draft => draft.items.length > 0);
}


// ==========================================
// LINE 草稿輸出
// ==========================================
function buildDraftReply(drafts) {
  const output = [
    '🧋 已幫您整理訂單草稿',
    ''
  ];

  let hasAnyIssue = false;

  drafts.forEach((draft, draftIndex) => {
    if (drafts.length > 1) {
      output.push(`【訂單 ${draftIndex + 1}】`);
    }

    draft.items.forEach(item => {
      const subtotal = item.price * item.qty;

      const basePrice =
        Number(item.basePrice ?? item.price ?? 0);
      const toppingTotal =
        Number(
          item.toppingsTotal ??
          toppingsTotal(item.toppings)
        );
      const unitFinalPrice =
        basePrice + toppingTotal;
      const itemSubtotal =
        unitFinalPrice * item.qty;

      output.push(
        `${item.name} ${item.size} ×${item.qty}　$${itemSubtotal}`
      );

      const specs = [];

      if (item.sugar) specs.push(item.sugar);
      if (item.temp && item.temp !== '冷') {
        specs.push(item.temp);
      } else if (item.ice) {
        specs.push(item.ice);
      }

      if (specs.length) {
        output.push(`　${specs.join(' / ')}`);
      }

      if (
        Array.isArray(item.toppings) &&
        item.toppings.length > 0
      ) {
        for (const topping of item.toppings) {
          const toppingSubtotal =
            Number(topping.unitPrice || 0) *
            Number(topping.qty || 0);

          output.push(
            `　＋${topping.name}` +
            `${topping.qty > 1 ? ` ×${topping.qty}` : ''}` +
            `　+$${toppingSubtotal}`
          );
        }

        output.push(
          `　單杯成品價：$${unitFinalPrice}`
        );
      }

      if (item.issues.length) {
        hasAnyIssue = true;
        output.push(
          `　⚠️ ${item.issues.join('；')}`
        );
      }
    });

    if (draft.fulfillment === '未指定') {
      hasAnyIssue = true;
      output.push('📍 取餐方式：⚠️ 未指定自取或外送');
    } else {
      output.push(`📍 ${draft.fulfillment}`);
    }

    output.push(`⏱ ${draft.time}`);

    if (draft.fulfillment === '外送') {
      if (draft.address) {
        output.push(`🏠 ${draft.address}`);
      } else {
        hasAnyIssue = true;
        output.push('🏠 ⚠️ 缺外送地址');
      }
    }

    const total = draft.items.reduce(
      (sum, item) => {
        const basePrice =
          Number(item.basePrice ?? item.price ?? 0);
        const toppingTotal =
          Number(
            item.toppingsTotal ??
            toppingsTotal(item.toppings)
          );

        return (
          sum +
          (basePrice + toppingTotal) *
          Number(item.qty || 0)
        );
      },
      0
    );

    const draftPromotion =
      calculatePromotionForItems(
        draft.items || []
      );

    output.push(`小計：$${total}`);

    if (drafts.length > 1) {
      output.push(
        `🥤 本單飲品 ${draftPromotion.drinkCount} 杯`
      );

      if (
        draftPromotion.freeDrinkCount > 0
      ) {
        output.push(
          `🎁 本單買10送1 ×${draftPromotion.freeDrinkCount}` +
          `　-$${draftPromotion.discountAmount}`
        );
        output.push(
          `💰 本單優惠後：$${total - draftPromotion.discountAmount}`
        );
      }

      if (
        draftPromotion.shouldRemindAddOne
      ) {
        output.push(
          '🎁 本單再加 1 杯即可多享一次買10送1優惠！'
        );
      }
    }

    if (draftIndex < drafts.length - 1) {
      output.push('');
    }
  });

  const allDraftSummary =
    summarizeDrafts(drafts);

  if (
    allDraftSummary.drinkCount > 0 &&
    drafts.length === 1
  ) {
    output.push(
      `🥤 飲品共 ${allDraftSummary.drinkCount} 杯`
    );

    if (
      allDraftSummary.promotion.freeDrinkCount > 0
    ) {
      output.push(
        `🎁 買10送1 ×${allDraftSummary.promotion.freeDrinkCount}` +
        `　-$${allDraftSummary.promotion.discountAmount}`
      );
      output.push(
        `💰 優惠後金額：$${allDraftSummary.finalTotal}`
      );
    }

    if (
      allDraftSummary.promotion.shouldRemindAddOne
    ) {
      output.push(
        '🎁 再加 1 杯即可多享一次買10送1優惠！'
      );
    }
  }

  if (drafts.length > 1) {
    output.push(
      `📦 共拆成 ${drafts.length} 張訂單，優惠各自計算。`
    );
  }

  output.push('');

  if (hasAnyIssue) {
    output.push(
      '⚠️ 上面有資料需要補充或修正，請直接回覆完整內容再測一次。'
    );
  } else {
    output.push(
      '✅ 目前辨識完整。'
    );
  }

  output.push(
    '🧪 現在是測試模式，尚未正式送出訂單。'
  );

  // LINE 單一 text message 上限很大，但仍避免意外超長。
  return output.join('\n').slice(0, 4800);
}