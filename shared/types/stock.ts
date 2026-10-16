export interface MarketItem {
  /** 标的代码 */
  symbol: string
  /** 标的名称 */
  name: string
  /** 标的类型，例如股票、基金、贵金属 */
  type: string
  /** 交易所或市场 */
  exchange?: string
  /** 价格货币 */
  currency?: string
  /** 当前最新价 */
  lastPrice?: number
  /** 添加时间（毫秒） */
  addedAt?: number
}

export interface MarketChart {
  /** 标的代码 */
  symbol: string
  /** 标的名称 */
  name: string
  /** 请求的时间范围 */
  range: string
  /** 数据间隔 */
  interval: string
  /** 价格货币 */
  currency?: string
  /** 时间戳列表（毫秒） */
  timestamps: number[]
  /** 收盘价列表 */
  closes: number[]
  /** 开盘价列表 */
  opens: number[]
  /** 最高价列表 */
  high: number[]
  /** 最低价列表 */
  low: number[]
  /** 成交量列表 */
  volume: number[]
  /** 实时报价概要 */
  quote?: MarketQuote
}

export interface MarketSearchResult {
  /** 标的代码 */
  symbol: string
  /** 标的名称 */
  name: string
  /** 标的类型 */
  type: string
  /** 交易所或市场 */
  exchange?: string
  /** 价格货币 */
  currency?: string
}

export interface MarketChartResult extends MarketChart {}

/** 实时报价概要（来自腾讯 qt 数据段） */
export interface MarketQuote {
  price: number
  change: number
  changePercent: number
  high: number
  low: number
  /** 市盈率 TTM */
  pe: number | null
  /** 总市值（亿元） */
  marketCap: number | null
  /** 市场状态描述，如「交易中」「已收盘」「未开盘」「盘前交易」 */
  marketStatus?: string
}

/** K 线范围：3mo=日K（60个交易日），1y=周K（52周），10y=月K（10年） */
export type ChartRange = '3mo' | '1y' | '10y'

export interface StockComment {
  _id?: string
  /** 标的代码 */
  symbol: string
  /** 评论用户（populate 后含 username） */
  user?: { username: string } | string
  /** 评论内容 */
  content: string
  /** 标签 */
  tags?: string[]
  /** 期望价格（画在 K 线图上的横虚线），无则空 */
  targetPrice?: number | null
  /** 评论时间 */
  created_time: string | Date
}
