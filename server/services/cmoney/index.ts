// Podcast API
export {
  fetchPodcastPage,
  fetchAllPodcastEpisodes,
  type CMoneyPodcastEpisode,
  type FetchPodcastResult,
} from './podcast'

// YouTube API
export {
  fetchYoutubeVideoPage,
  fetchAllYoutubeVideos,
  toYoutubeUrl,
  type CMoneyYoutubeVideo,
} from './youtube'

// 同學會發文認證
export {
  fetchCMoneyToken,
  fetchCMoneyTokenByRefreshToken,
  getValidToken,
  isTokenExpired,
  validateCMoneyAuth,
  type CMoneyTokenResult,
  type CMoneyTokenError,
  type FetchTokenResult,
} from './auth'

// 同學會發文
export {
  publishToForum,
  type StockTag,
  type ForumArticleType,
  type ForumPublishOptions,
  type ForumPublishResult,
} from './forum'

// 同學會文章抓取
export {
  fetchGroupArticles,
  formatForThreads,
  type GroupArticle,
  type FetchGroupArticlesResult,
} from './groupArticles'

// 股票標籤提取
export { extractStockTags, type ExtractedStock } from './stockExtractor'

// 投資網誌文章抓取
export {
  fetchInvestmentNotes,
  getArticleUrl,
  htmlToPlainText,
  type InvestmentNote,
  type FetchInvestmentNotesResult,
} from './investmentNotes'

// 投資網誌發文
export {
  publishToBlog,
  convertToHtml,
  formatStockTagsForBlog,
  type BlogPublishOptions,
  type BlogPublishResult,
} from './blog'
