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
  type ForumPublishOptions,
  type ForumPublishResult,
} from './forum'

// 股票標籤提取
export { extractStockTags, type ExtractedStock } from './stockExtractor'

// 投資網誌發文
export {
  fetchBlogToken,
  getValidBlogToken,
  isBlogTokenExpired,
  validateBlogAuth,
  publishToBlog,
  convertToHtml,
  formatStockTagsForBlog,
  type BlogTokenResult,
  type BlogTokenError,
  type FetchBlogTokenResult,
  type BlogPublishOptions,
  type BlogPublishResult,
} from './blog'
