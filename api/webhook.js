import crypto from 'node:crypto';

// ==========================================
// TEA TOP LINE 接單互動測試 V2.1 安全版
// 班表 LINE 通知 + 查ID + 飲料訂單解析
//
// 目前功能：
// 1. 保留班表 APP 主動 LINE Push
// 2. 保留「查ID / MYID」
// 3. 一般文字嘗試解析成飲料訂單草稿
// 4. 只回覆草稿，不寫 Firestore、不成立正式訂單
// ==========================================

const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;

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

          if (data === 'cancel') {
            await replyLineMessage(
              replyToken,
              '❌ 已取消這份訂單草稿。\n\n目前仍是測試模式，沒有建立任何正式訂單。'
            );
            continue;
          }

          if (data.startsWith('confirm|')) {
            const originalMsg = data.slice('confirm|'.length);
            const drafts = parseOrderMessage(originalMsg);
            const hasIssue = drafts.some(d =>
              d.fulfillment === '未指定' ||
              (d.fulfillment === '外送' && !d.address) ||
              d.items.some(item => item.issues.length > 0)
            );

            if (!drafts.length || hasIssue) {
              await replyLineMessage(
                replyToken,
                '⚠️ 這份草稿仍有缺漏或不符合商品規則，暫時不能確認。\n請重新輸入完整訂單內容。'
              );
              continue;
            }

            await replyLineMessage(
              replyToken,
              [
                '✅ 已收到「確認訂單」操作。',
                '',
                '目前是互動測試模式，所以尚未寫入正式訂單資料庫。',
                '下一階段才會把確認後的訂單寫入 Firestore，並通知店員後台。'
              ].join('\n')
            );
            continue;
          }

          if (data.startsWith('modify|')) {
            await replyLineMessage(
              replyToken,
              '✏️ 請直接修改輸入框中的訂單內容後重新送出。'
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

        const replyText = buildDraftReply(drafts);
        const hasIssue = drafts.some(d =>
          d.fulfillment === '未指定' ||
          (d.fulfillment === '外送' && !d.address) ||
          d.items.some(item => item.issues.length > 0)
        );

        await replyOrderDraft(replyToken, replyText, userMsg, hasIssue);
      }

      return res.status(200).send('OK');
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
  const before = text.slice(Math.max(0, hit.pos - 12), hit.pos);
  const after = text.slice(hit.pos + hit.len, hit.pos + hit.len + 12);

  let match = before.match(
    /(\d+|[一二兩三四五六七八九十]+)\s*(?:杯|瓶|[xX×*])?\s*$/
  );

  if (match) {
    const qty = chineseNumber(match[1]);
    if (qty && qty <= 300) return qty;
  }

  match = after.match(
    /^\s*(?:[xX×*]\s*)?(\d+|[一二兩三四五六七八九十]+)\s*(?:杯|瓶)?/
  );

  if (match) {
    const qty = chineseNumber(match[1]);
    if (qty && qty <= 300) return qty;
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
      price: Number(product.sizes?.[size] || 0),
      issues: [],
    };

    item.issues = validateItem(item);
    item.price = Number(product.sizes?.[item.size] || 0);

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

      output.push(
        `${item.name} ${item.size} ×${item.qty}　$${subtotal}`
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
      (sum, item) => sum + item.price * item.qty,
      0
    );

    output.push(`小計：$${total}`);

    if (draftIndex < drafts.length - 1) {
      output.push('');
    }
  });

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