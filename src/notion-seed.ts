import type { WorkType } from "./types";

export interface NotionSeedItem {
  sourceKey: string;
  notionUrl: string;
  sourceUrl?: string;
  rawTitle: string;
  title: string;
  creator?: string;
  type: WorkType;
  createdAt: string;
  updatedAt: string;
  genres?: string[];
  trigger?: string;
  hallOfFame?: boolean;
  wantsToBorrow?: boolean;
}

export const NOTION_DATABASE_URL = "https://app.notion.com/p/8a9fc094a72842478822507136ba3587?v=0fd108080cff47a998b0af908cae8d91";

export const NOTION_SEED_ITEMS: NotionSeedItem[] = [
  {
    sourceKey: "notion:39d5b0cd75f981849c3deffcfe4a7b70",
    notionUrl: "https://app.notion.com/p/39d5b0cd75f981849c3deffcfe4a7b70",
    sourceUrl: "https://www.amazon.co.jp/dp/B0D3PB7531",
    rawTitle: "Amazon.co.jp: テスカトリポカ (角川文庫) eBook : 佐藤 究: Kindleストア",
    title: "テスカトリポカ (角川文庫)",
    creator: "佐藤 究",
    type: "book",
    createdAt: "2026-07-14T14:27:02.116Z",
    updatedAt: "2026-07-14T14:27:02.116Z"
  },
  {
    sourceKey: "notion:39b5b0cd75f981eb8b02f0231ebb11a1",
    notionUrl: "https://app.notion.com/p/39b5b0cd75f981eb8b02f0231ebb11a1",
    sourceUrl: "https://www.amazon.co.jp/dp/B0183IMPJY",
    rawTitle: "論文の書き方 (岩波新書) eBook : 清水 幾太郎: 本",
    title: "論文の書き方 (岩波新書)",
    creator: "清水 幾太郎",
    type: "book",
    createdAt: "2026-07-12T13:05:09.995Z",
    updatedAt: "2026-07-12T13:05:09.995Z"
  },
  {
    sourceKey: "notion:38e5b0cd75f981c695d3e4a888b42f93",
    notionUrl: "https://app.notion.com/p/38e5b0cd75f981c695d3e4a888b42f93",
    sourceUrl: "https://www.amazon.co.jp/dp/429620789X",
    rawTitle: "ホークスメソッド　勝ち続けるチームのつくり方 | 日比野 恭三 |本 | 通販 | Amazon",
    title: "ホークスメソッド 勝ち続けるチームのつくり方",
    creator: "日比野 恭三",
    type: "book",
    createdAt: "2026-06-29T12:51:24.868Z",
    updatedAt: "2026-06-29T12:51:24.868Z"
  },
  {
    sourceKey: "notion:37c5b0cd75f9818989cbcf20bed112e6",
    notionUrl: "https://app.notion.com/p/37c5b0cd75f9818989cbcf20bed112e6",
    sourceUrl: "https://afternoon.kodansha.co.jp/c/toshodai/",
    rawTitle: "図書館の大魔術師｜アフタヌーン公式サイト - 講談社の青年漫画誌",
    title: "図書館の大魔術師",
    type: "manga",
    createdAt: "2026-06-11T23:09:05.648Z",
    updatedAt: "2026-06-11T23:09:05.648Z",
    genres: ["漫画"]
  },
  {
    sourceKey: "notion:37c5b0cd75f981b799a0e6a38d4284e1",
    notionUrl: "https://app.notion.com/p/37c5b0cd75f981b799a0e6a38d4284e1",
    sourceUrl: "https://4seasons-anime.com/",
    rawTitle: "TVアニメ『春夏秋冬代行者』公式サイト",
    title: "春夏秋冬代行者",
    type: "anime",
    createdAt: "2026-06-11T23:08:03.262Z",
    updatedAt: "2026-06-11T23:08:03.262Z",
    genres: ["アニメ"]
  },
  {
    sourceKey: "notion:37c5b0cd75f9810b84a6de6d4a5b303b",
    notionUrl: "https://app.notion.com/p/37c5b0cd75f9810b84a6de6d4a5b303b",
    sourceUrl: "https://tongari-anime.com/",
    rawTitle: "TVアニメ「とんがり帽子のアトリエ」",
    title: "とんがり帽子のアトリエ",
    type: "anime",
    createdAt: "2026-06-11T23:07:39.523Z",
    updatedAt: "2026-06-11T23:07:39.523Z",
    genres: ["アニメ"]
  },
  {
    sourceKey: "notion:36b5b0cd75f981d69b38c90d3f405b81",
    notionUrl: "https://app.notion.com/p/36b5b0cd75f981d69b38c90d3f405b81",
    rawTitle: "ほんとうのことを書く練習 「わたしの言葉」で他者とつながる文章術 | 土門蘭 |本 | 通販 | Amazon",
    title: "ほんとうのことを書く練習 「わたしの言葉」で他者とつながる文章術",
    creator: "土門蘭",
    type: "book",
    createdAt: "2026-05-25T13:18:37.992Z",
    updatedAt: "2026-05-25T13:18:37.992Z"
  },
  {
    sourceKey: "notion:2ec5b0cd75f981f380b1d5f51fbda5ed",
    notionUrl: "https://app.notion.com/p/2ec5b0cd75f981f380b1d5f51fbda5ed",
    sourceUrl: "https://www.amazon.co.jp/dp/B08P55BD2V",
    rawTitle: "大人男子の「超」清潔感ハック eBook : 宮永 えいと: 本",
    title: "大人男子の「超」清潔感ハック",
    creator: "宮永 えいと",
    type: "book",
    createdAt: "2026-01-18T14:31:34.611Z",
    updatedAt: "2026-01-18T14:31:34.611Z"
  },
  {
    sourceKey: "notion:2e85b0cd75f9814a81b7e459151c4d09",
    notionUrl: "https://app.notion.com/p/2e85b0cd75f9814a81b7e459151c4d09",
    sourceUrl: "https://www.amazon.co.jp/dp/B01H4OTCBW",
    rawTitle: "「こつ」と「スランプ」の研究　身体知の認知科学 (講談社選書メチエ) 電子書籍: 諏訪正樹: Kindleストア",
    title: "「こつ」と「スランプ」の研究 身体知の認知科学",
    creator: "諏訪正樹",
    type: "book",
    createdAt: "2026-01-14T23:43:35.712Z",
    updatedAt: "2026-01-14T23:43:35.712Z"
  },
  {
    sourceKey: "notion:2e65b0cd75f98134af39f74ac7b5d68d",
    notionUrl: "https://app.notion.com/p/2e65b0cd75f98134af39f74ac7b5d68d",
    rawTitle: "あっという間にお金はなくなるから 「足りない病」の原因と治し方 | 佐藤 舞(サトマイ) |本 | 通販 | Amazon",
    title: "あっという間にお金はなくなるから 「足りない病」の原因と治し方",
    creator: "佐藤 舞（サトマイ）",
    type: "book",
    createdAt: "2026-01-12T13:47:41.524Z",
    updatedAt: "2026-01-12T13:47:41.524Z"
  },
  {
    sourceKey: "notion:2985b0cd75f981159524d98e32319cd3",
    notionUrl: "https://app.notion.com/p/2985b0cd75f981159524d98e32319cd3",
    sourceUrl: "https://zombielandsaga-movie.com/",
    rawTitle: "劇場版『ゾンビランドサガ ゆめぎんがパラダイス』公式サイト",
    title: "劇場版 ゾンビランドサガ ゆめぎんがパラダイス",
    type: "movie",
    createdAt: "2025-10-26T12:17:37.729Z",
    updatedAt: "2025-10-26T12:17:53.095Z",
    genres: ["アニメ"],
    hallOfFame: true
  },
  {
    sourceKey: "notion:27b5b0cd75f981bc8d94eefd4614b50b",
    notionUrl: "https://app.notion.com/p/27b5b0cd75f981bc8d94eefd4614b50b",
    rawTitle: "Amazon.co.jp: 「話が面白い人」は何をどう読んでいるのか（新潮新書） 電子書籍: 三宅香帆: Kindleストア",
    title: "「話が面白い人」は何をどう読んでいるのか",
    creator: "三宅香帆",
    type: "book",
    createdAt: "2025-09-27T07:17:33.490Z",
    updatedAt: "2025-09-27T07:17:33.490Z"
  },
  {
    sourceKey: "notion:26e5b0cd75f981a1806cca584d23bcc2",
    notionUrl: "https://app.notion.com/p/26e5b0cd75f981a1806cca584d23bcc2",
    rawTitle: "「読み」の整理学 (ちくま文庫 と 1-3) | 外山 滋比古 |本 | 通販 | Amazon",
    title: "「読み」の整理学",
    creator: "外山 滋比古",
    type: "book",
    createdAt: "2025-09-14T10:48:31.758Z",
    updatedAt: "2025-09-14T10:49:24.908Z",
    hallOfFame: true
  },
  {
    sourceKey: "notion:26d5b0cd75f981aea8a0f5bbd98e2d97",
    notionUrl: "https://app.notion.com/p/26d5b0cd75f981aea8a0f5bbd98e2d97",
    rawTitle: "傲慢と善良 (朝日文庫) | 辻村 深月 |本 | 通販 | Amazon",
    title: "傲慢と善良",
    creator: "辻村 深月",
    type: "book",
    createdAt: "2025-09-13T15:21:58.965Z",
    updatedAt: "2025-09-14T10:49:10.309Z",
    hallOfFame: true
  },
  {
    sourceKey: "notion:2575b0cd75f98126b186de1e9fb158a4",
    notionUrl: "https://app.notion.com/p/2575b0cd75f98126b186de1e9fb158a4",
    rawTitle: "配置理論で学ぶ　将棋戦略思考 (マイナビ将棋BOOKS) eBook : ゆに＠将棋戦略: Kindleストア",
    title: "配置理論で学ぶ 将棋戦略思考",
    creator: "ゆに＠将棋戦略",
    type: "book",
    createdAt: "2025-08-22T07:44:54.390Z",
    updatedAt: "2025-08-22T07:44:54.390Z",
    genres: ["将棋"]
  },
  {
    sourceKey: "notion:2545b0cd75f981fbaad3c3d0833b3449",
    notionUrl: "https://app.notion.com/p/2545b0cd75f981fbaad3c3d0833b3449",
    sourceUrl: "https://www.amazon.co.jp/dp/B0F3J33DHL",
    rawTitle: "YABUNONAKAーヤブノナカー (文春e-book) 電子書籍: 金原 ひとみ: Kindleストア",
    title: "YABUNONAKA―ヤブノナカ―",
    creator: "金原 ひとみ",
    type: "book",
    createdAt: "2025-08-19T12:45:13.681Z",
    updatedAt: "2025-08-19T12:45:13.681Z"
  },
  {
    sourceKey: "notion:2475b0cd75f981a89cfbd0042e9db502",
    notionUrl: "https://app.notion.com/p/2475b0cd75f981a89cfbd0042e9db502",
    sourceUrl: "https://www.amazon.co.jp/dp/B0FCF18G3Y",
    rawTitle: "「書くこと」の哲学　ことばの再履修 (講談社現代新書) 電子書籍: 佐々木敦: Kindleストア",
    title: "「書くこと」の哲学 ことばの再履修",
    creator: "佐々木敦",
    type: "book",
    createdAt: "2025-08-06T15:33:28.104Z",
    updatedAt: "2025-08-06T15:47:12.912Z"
  },
  {
    sourceKey: "notion:2445b0cd75f9810c800cf7c5097883d5",
    notionUrl: "https://app.notion.com/p/2445b0cd75f9810c800cf7c5097883d5",
    rawTitle: "となりのヤマダ君 小さくて足が遅くてケガの多い35歳のサッカー選手 | 山田Ａ子, 山田直輝 |本 | 通販 | Amazon",
    title: "となりのヤマダ君 小さくて足が遅くてケガの多い35歳のサッカー選手",
    creator: "山田A子・山田直輝",
    type: "book",
    createdAt: "2025-08-03T14:49:49.483Z",
    updatedAt: "2025-08-03T15:05:41.741Z",
    genres: ["サッカー"]
  },
  {
    sourceKey: "notion:2435b0cd75f981929144ddee78f6be95",
    notionUrl: "https://app.notion.com/p/2435b0cd75f981929144ddee78f6be95",
    sourceUrl: "https://ja.m.wikipedia.org/wiki/%E5%90%8C%E3%81%98%E9%81%BA%E4%BC%9D%E5%AD%90%E3%81%AE3%E4%BA%BA%E3%81%AE%E4%BB%96%E4%BA%BA",
    rawTitle: "同じ遺伝子の3人の他人 - Wikipedia",
    title: "同じ遺伝子の3人の他人",
    type: "other",
    createdAt: "2025-08-02T13:10:48.516Z",
    updatedAt: "2025-08-02T13:10:48.516Z"
  },
  {
    sourceKey: "notion:23c5b0cd75f981a88bfbfa176beb17ed",
    notionUrl: "https://app.notion.com/p/23c5b0cd75f981a88bfbfa176beb17ed",
    rawTitle: "見落とされた川崎病「前編」 はなゆい　漫画シリーズ 電子書籍: はなゆい: Kindleストア",
    title: "見落とされた川崎病「前編」",
    creator: "はなゆい",
    type: "manga",
    createdAt: "2025-07-26T13:00:46.062Z",
    updatedAt: "2025-07-26T13:00:46.062Z",
    genres: ["漫画"]
  }
];
