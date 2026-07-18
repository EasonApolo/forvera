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
  /** 当日涨跌金额 */
  change?: number
  /** 当日涨跌幅，百分比 */
  changePercent?: number
  /** 列表顺序 */
  order?: number
  /** 所属分组 ID */
  groupId?: string
  /** 备注说明 */
  remark?: string
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
