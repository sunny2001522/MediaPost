/**
 * 批次設定投資網誌 blogUserId + blogAuthorSlug
 * POST /api/authors/seed-blog-userids
 *
 * 根據「新網誌作者 ID 對應表 (正式站)」匹配作者名稱並更新
 */

import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

// 來源：20251106 新網誌作者 ID 對應表 (正式站).html
// 格式：{ authorSlug(即 author_id), name, memberId(即 userId) }
// 只收錄有 member_id 的作者
const BLOG_AUTHOR_MAP: Array<{ authorSlug: string; name: string; memberId: string }> = [
  { authorSlug: 'winner', name: 'Winner印鈔機', memberId: '47894' },
  { authorSlug: 'edwin', name: '愛德恩 - 小朋友學投資', memberId: '85425' },
  { authorSlug: 'acer2266', name: '交易醫生 Acer', memberId: '398755' },
  { authorSlug: 'p', name: '小Ｐ', memberId: '961964' },
  { authorSlug: 'laochien', name: '老簡', memberId: '1507243' },
  { authorSlug: 'spring', name: '春燕來了', memberId: '3146341' },
  { authorSlug: 'deehsiang', name: '狄驤', memberId: '9195142' },
  { authorSlug: 'mrcarl', name: '卡爾先生', memberId: '9759393' },
  { authorSlug: 'victorhinvesting', name: 'Victor H Investing', memberId: '15284768' },
  { authorSlug: 'sunglasssister', name: '墨鏡姊一粒沙', memberId: '20930072' },
  { authorSlug: 'masterhsiao', name: '怪老子', memberId: '13694' },
  { authorSlug: 'snowbaby', name: '阿雪來了', memberId: '13759719' },
  { authorSlug: 'warrant', name: '權證小哥', memberId: '13997' },
  { authorSlug: 'bosscat', name: '貓草谷－強勢股指南針', memberId: '14466996' },
  { authorSlug: 'rainac', name: 'Raina.C', memberId: '15317180' },
  { authorSlug: 'marra', name: '好好理財', memberId: '153293' },
  { authorSlug: '3606', name: '財源滾滾', memberId: '1539122' },
  { authorSlug: 'mike', name: 'Mike 是麥克', memberId: '15772888' },
  { authorSlug: 'liao', name: '廖崧沂（點靈）', memberId: '16729348' },
  { authorSlug: 'jefftalksstock', name: '杰夫 Jeff Talks Stock', memberId: '17351808' },
  { authorSlug: 'allan', name: 'Allan冷大', memberId: '1742556' },
  { authorSlug: 'talkjun', name: '投資Talk君', memberId: '17427140' },
  { authorSlug: 'betterleaf', name: '好葉 Better Leaf', memberId: '17531364' },
  { authorSlug: 'rich', name: 'Rich智富選股', memberId: '17593189' },
  { authorSlug: 'ugly', name: '阿格力', memberId: '1872328' },
  { authorSlug: 'skyvest', name: '穹蒼美股', memberId: '19076785' },
  { authorSlug: '3608', name: '6元股先生9', memberId: '1948611' },
  { authorSlug: 'marslai', name: 'MarsLai', memberId: '2001085' },
  { authorSlug: 'boring', name: '無聊詹', memberId: '20473' },
  { authorSlug: '3484', name: '毛毛交易日記', memberId: '2071216' },
  { authorSlug: 'water', name: '股市阿水', memberId: '222173' },
  { authorSlug: '1411', name: '華倫', memberId: '2330925' },
  { authorSlug: 'nickvalueinvesting', name: '美股咖啡館（尼科）', memberId: '2391589' },
  { authorSlug: 'hsu', name: '許總｜HSU', memberId: '2418534' },
  { authorSlug: 'huistock', name: '阿輝（輝哥）', memberId: '2467770' },
  { authorSlug: 'unclestock', name: '韭菜叔叔', memberId: '2514280' },
  { authorSlug: 'wealthonebro', name: '發財1哥', memberId: '2532566' },
  { authorSlug: '3599', name: '奔馳股市', memberId: '2538773' },
  { authorSlug: 'so2ym6jh', name: '台北強哥 (so2ym6jh)', memberId: '2544578' },
  { authorSlug: 'featurely42', name: '蔡司', memberId: '26167' },
  { authorSlug: '3532', name: '亮亮', memberId: '261711' },
  { authorSlug: '3418', name: '鬼手易生', memberId: '2647385' },
  { authorSlug: 'strangedoctor', name: '怪博士', memberId: '2656190' },
  { authorSlug: 'aben', name: '順流小畢', memberId: '26655' },
  { authorSlug: 'lewis', name: '小路 Lewis', memberId: '269965' },
  { authorSlug: 'alansays', name: '艾綸說Alansays', memberId: '27565' },
  { authorSlug: 'lostartist', name: '落魄藝術家', memberId: '2845867' },
  { authorSlug: 'nico', name: '妮可要投資', memberId: '286280' },
  { authorSlug: 'myetf', name: '老吳（打造屬於自己的 ETF）', memberId: '2899334' },
  { authorSlug: 'mrmarket', name: 'Mr.Market 市場先生', memberId: '293565' },
  { authorSlug: 'linenru', name: '林恩如', memberId: '29475' },
  { authorSlug: 'nicklai', name: '交易人尼克萊', memberId: '295561' },
  { authorSlug: 'bubuypope', name: '不敗教主陳重銘', memberId: '3031860' },
  { authorSlug: 'purple', name: '葉芷娟', memberId: '304214' },
  { authorSlug: 'fly', name: '飛天翔', memberId: '306227' },
  { authorSlug: 'firebro', name: '🔥火哥(+8)┃光廷', memberId: '3074781' },
  { authorSlug: '3533', name: '肌肉書僮', memberId: '3158198' },
  { authorSlug: 'captain', name: '產業隊長 張捷', memberId: '3350317' },
  { authorSlug: 'blue', name: '不魯｜小朋友學投資', memberId: '33529' },
  { authorSlug: 'president', name: '腫材彭懷男', memberId: '3428511' },
  { authorSlug: 'sara', name: 'Sara Wang', memberId: '348444' },
  { authorSlug: 'usstockdreamer', name: '美股夢想家-施雅棠', memberId: '357150' },
  { authorSlug: 'gintonic', name: '金湯尼', memberId: '35858' },
  { authorSlug: 'technicaldoctor', name: '波段醫生', memberId: '362034' },
  { authorSlug: 'cmfaren', name: 'CM法人團隊', memberId: '36746' },
  { authorSlug: 'mj', name: 'MJ 林明樟', memberId: '371393' },
  { authorSlug: 'emily', name: '小資女艾蜜莉', memberId: '37323' },
  { authorSlug: 'daniel', name: '丹尼爾', memberId: '407409' },
  { authorSlug: 'wealtholic', name: '投資癮 Wealtholic', memberId: '5317761' },
  { authorSlug: '3601', name: '股市駱哥', memberId: '543002' },
  { authorSlug: 'drselena', name: 'Dr.Selena 楊倩琳', memberId: '6374652' },
  { authorSlug: '3393', name: '主力大', memberId: '646647' },
  { authorSlug: 'wantgo', name: '旺大財經', memberId: '649968' },
  { authorSlug: 'daiyi', name: '💵 岱爺 💵', memberId: '6993299' },
  { authorSlug: '1405', name: '慢活夫妻', memberId: '7615383' },
  { authorSlug: 'ruanmuhhwa', name: '阮慕驊', memberId: '7680157' },
  { authorSlug: '656', name: '算利教官楊禮軒', memberId: '776004' },
  { authorSlug: 'jg', name: 'JG說真的', memberId: '7763537' },
  { authorSlug: 'bcstock', name: 'BC股倉', memberId: '8273498' },
  { authorSlug: 'hermit', name: '股市隱者', memberId: '8326462' },
  { authorSlug: '3441', name: '諸神奧丁', memberId: '833872' },
  { authorSlug: '3531', name: '股市洪七公', memberId: '8488660' },
  { authorSlug: 'cmoney', name: 'CMoney官方', memberId: '8630400' },
  { authorSlug: 'daxia', name: '大俠武林', memberId: '868093' },
  { authorSlug: 'allmoneyrise', name: 'AllmoneyRise', memberId: '98625' },
]

export default defineEventHandler(async () => {
  const db = useDB()

  // 取得所有作者
  const allAuthors = await db.select().from(schema.authors)

  const results: Array<{ name: string; status: string; blogAuthorSlug?: string; blogUserId?: string }> = []
  let updated = 0
  let notFound = 0

  for (const mapping of BLOG_AUTHOR_MAP) {
    // 用名稱匹配（去除空白比對）
    const author = allAuthors.find(a =>
      a.name.trim() === mapping.name.trim()
    )

    if (!author) {
      results.push({ name: mapping.name, status: 'not_found' })
      notFound++
      continue
    }

    // 更新 blogAuthorSlug 和 blogUserId
    await db
      .update(schema.authors)
      .set({
        blogAuthorSlug: mapping.authorSlug,
        blogUserId: mapping.memberId,
        updatedAt: new Date(),
      })
      .where(eq(schema.authors.id, author.id))

    results.push({
      name: mapping.name,
      status: 'updated',
      blogAuthorSlug: mapping.authorSlug,
      blogUserId: mapping.memberId,
    })
    updated++
  }

  return {
    success: true,
    total: BLOG_AUTHOR_MAP.length,
    updated,
    notFound,
    results,
  }
})
