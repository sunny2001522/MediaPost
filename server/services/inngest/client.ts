import { Inngest, EventSchemas } from 'inngest'

// 定義事件類型
export interface YoutubeVideoNewEvent {
  name: 'youtube/video.new'
  data: {
    videoId: string
    channelId: string
    title: string
    publishedAt: string
    discoverySource: 'pubsub' | 'cron' | 'manual'
  }
}

export interface SubscriptionRenewalEvent {
  name: 'youtube/subscription.renew'
  data: {
    channelId: string
  }
}

// CMoney Podcast 事件
export interface CMoneyPodcastNewEvent {
  name: 'cmoney/podcast.new'
  data: {
    audioUrl: string
    pubDate: number // Unix timestamp
    title: string
    description?: string // 節目描述/摘要
    trackId: string
    authorId: string
    authorName: string
    discoverySource: 'cron' | 'manual'
  }
}

// CMoney YouTube 事件（複用現有 YouTube 處理流程）
export interface CMoneyYoutubeNewEvent {
  name: 'cmoney/youtube.new'
  data: {
    youtubeVideoId: string
    pubDate: string
    channelId: string // CMoney 的頻道 ID
    authorId: string
    title?: string
    discoverySource: 'cron' | 'manual'
  }
}

export type InngestEvents =
  | YoutubeVideoNewEvent
  | SubscriptionRenewalEvent
  | CMoneyPodcastNewEvent
  | CMoneyYoutubeNewEvent

// 建立 Inngest 客戶端
// 本地開發時使用 Dev Server，不需要 eventKey
// 生產環境需要設定 INNGEST_EVENT_KEY
export const inngest = new Inngest({
  id: 'mediapost',
  // 如果沒有設定 eventKey，Inngest SDK 會自動連接到本地 Dev Server
  ...(process.env.INNGEST_EVENT_KEY && { eventKey: process.env.INNGEST_EVENT_KEY }),
})
