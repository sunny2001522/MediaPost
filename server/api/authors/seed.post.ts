import { nanoid } from 'nanoid'
import { useDB, schema } from '~/server/database/client'

// 作者名單
const AUTHORS = [
  '小資女艾蜜莉',
  '無聊詹',
  '林恩如',
  '朱家泓x林穎',
  '阿格力',
  '不敗教主-陳重銘',
  '權證小哥',
  'Sara Wang',
  '大俠武林',
  '股市隱者',
  '肌肉書僮',
  '股市駱哥',
  '不魯',
  '股人阿勳',
  '麻紗',
  '春燕來了',
  '瓦基',
  '愛德恩',
  '台北強哥',
  '老簡',
  '阮慕驊',
  '好好理財',
  '落魄藝術家',
  '財源滾滾',
  '怪博士',
  'MarsLai',
  '6元股先生9',
  '鬼手易生',
  '亮亮',
  '美股夢想家-施雅棠',
  '奔馳股市',
  '波段醫生',
  '岱爺',
  '廖崧沂',
  '心中無多空',
  '韭菜叔叔',
  '輝哥',
  '蕭大哥',
  '阿雪',
  '交易醫生',
  '順流小畢',
  '投資癮',
  '小P',
  '尼克萊',
  '旺大財經',
  'Allmoney',
  '算利教官',
  '華倫',
  '陳光廷',
  'BC股倉',
  'Dr.Selena',
  '產業隊長張捷',
  'Allan冷大',
  '自由人',
  '薛兆亨',
  '畢卡胡',
  '股市阿水',
  'MJ 林明樟',
  '奧丁',
  '發財一哥',
  '主力大',
  'Mike',
  'ChiefPaPa',
  '投資Talk君',
  '窮奢極欲x大俠武林',
  '好葉',
  'Victor',
  '杰夫谈股论财',
  '墨鏡姐一粒沙',
  '開發&排程中',
  '權證小哥-處置王',
  '沈萬鈞',
  '悄悄打一槍',
  '蔡斯',
  '股海哥',
  '嫻人',
  'Haoway',
  '卡爾先生',
  '芯晴天地',
]

export default defineEventHandler(async () => {
  const db = useDB()
  const now = new Date()

  // 使用 Set 來去除重複的作者名稱
  const uniqueAuthors = [...new Set(AUTHORS)]

  const authorsToInsert = uniqueAuthors.map((name) => ({
    id: nanoid(),
    name,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }))

  // 使用 INSERT OR IGNORE 避免重複
  for (const author of authorsToInsert) {
    try {
      await db.insert(schema.authors).values(author).onConflictDoNothing()
    }
    catch {
      // 忽略重複錯誤
    }
  }

  return {
    success: true,
    count: uniqueAuthors.length,
    message: `已初始化 ${uniqueAuthors.length} 位作者`,
  }
})
