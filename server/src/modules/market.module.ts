import {
  Module,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common'
import { Injectable } from '@nestjs/common'
import { MongooseModule, InjectModel } from '@nestjs/mongoose'
import { Schema, Model, Document } from 'mongoose'
import { Public } from 'src/guards/jwt-auth.guard'
import type {
  MarketChartResult,
  MarketQuote,
  MarketSearchResult,
  StockComment,
} from 'shared/types/stock'

/**
 * 腾讯行情接口（免费、直连、无需代理）
 * - 搜索: https://smartbox.gtimg.cn/s3/?v=2&q=关键词&t=all
 *   返回 v_hint="market~code~名称~拼音~类型^..."，类型 GP=股票
 * - K线: https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=usAAPL.OQ,week,,,52,qfq
 *   返回 [日期,开,收,高,低,量]（注意开收顺序），A股前复权数据在 qfqweek 键下
 */
const TENCENT_SEARCH_URL = 'https://smartbox.gtimg.cn/s3/'
const TENCENT_KLINE_URL = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get'
const KLINE_COUNTS: Record<string, number> = {
  '3mo': 60, // 60 个交易日日K
  '1y': 52, // 52 周周线
  '10y': 120, // 10 年月线
}

async function fetchTencentText(url: string) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' } as any,
  })
  if (!response.ok) {
    throw new BadRequestException(`腾讯行情请求失败：${response.status}`)
  }
  return response.text()
}

@Injectable()
export class MarketService {
  private chartCache = new Map<string, { expiresAt: number; data: MarketChartResult }>()

  private getCacheKey(symbol: string, range: string, count?: number) {
    return `${symbol}#${range}#${count ?? ''}`
  }

  async searchSymbols(query: string): Promise<MarketSearchResult[]> {
    if (!query.trim()) {
      return []
    }
    const text = await fetchTencentText(
      `${TENCENT_SEARCH_URL}?v=2&q=${encodeURIComponent(query.trim())}&t=all`
    )
    // v_hint="us~aapl.oq~苹果~pg~GP^..."，名称带 \uXXXX 字面转义
    const match = text.match(/v_hint="([^"]*)"/)
    if (!match || !match[1]) {
      return []
    }
    const decodeUnicode = (s: string) => {
      try {
        return JSON.parse(`"${s}"`)
      } catch {
        return s
      }
    }
    // 腾讯类型码 → 展示类型
    const TYPE_MAP: Record<string, string> = {
      GP: '股票',
      'GP-A': '股票',
      ETF: 'ETF',
      'QDII-ETF': 'ETF',
      ZS: '指数',
      LOF: '基金',
      FUND: '基金',
      JJ: '基金',
    }
    return match[1]
      .split('^')
      .map(record => record.split('~'))
      .filter(fields => fields.length >= 5)
      .map(([market, code, name, , type]) => ({
        market,
        code,
        name: decodeUnicode(name),
        type,
      }))
      .filter(item => ['us', 'hk', 'sh', 'sz'].includes(item.market) && TYPE_MAP[item.type])
      .map(item => ({
        // 统一编码：usAAPL.OQ / hk00700 / sh600519（前缀小写，代码大写）
        symbol: `${item.market}${item.code.toUpperCase()}`,
        name: item.name,
        type: TYPE_MAP[item.type],
      }))
      .slice(0, 18)
  }

  async fetchChart(symbol: string, range: string, count?: number): Promise<MarketChartResult> {
    // 腾讯代码区分大小写（usAAPL.OQ），不做 upper 归一化
    const normalized = symbol.trim()
    if (!normalized) {
      throw new BadRequestException('symbol 不能为空')
    }
    // 数据条数：客户端可在设置里调整，限制在 10~800，缺省用默认值
    const defaultCount = KLINE_COUNTS[range] || 52
    const requested = Number(count)
    const safeCount =
      Number.isFinite(requested) && count != null
        ? Math.min(800, Math.max(10, Math.round(requested)))
        : defaultCount
    const key = this.getCacheKey(normalized, range, safeCount)
    const cached = this.chartCache.get(key)
    const now = Date.now()
    if (cached && cached.expiresAt > now) {
      return cached.data
    }

    const ktype = range === '10y' ? 'month' : range === '3mo' ? 'day' : 'week'
    const text = await fetchTencentText(
      `${TENCENT_KLINE_URL}?param=${encodeURIComponent(normalized)},${ktype},,,${safeCount},qfq`
    )
    const json = JSON.parse(text)
    const item = json?.data?.[normalized]
    // A股前复权在 qfqweek/qfqmonth 键下，其余直接 week/month
    const rows: string[][] = item?.[`qfq${ktype}`] || item?.[ktype] || []
    // 实时报价概要：qt 数组（下标见腾讯行情协议），板块信息接口未提供
    const qt: string[] = item?.qt?.[normalized] || []
    // 各市场开闭市状态：qt.market 形如 "时间|US_close_未开盘|USB_open_盘前交易|SH_close_已收盘|..."
    const marketKey = normalized.startsWith('us')
      ? 'US'
      : normalized.startsWith('hk')
        ? 'HK'
        : normalized.startsWith('sh')
          ? 'SH'
          : normalized.startsWith('sz')
            ? 'SZ'
            : ''
    let marketStatus: string | undefined
    if (marketKey && item?.qt?.market?.[0]) {
      const segments: string[] = item.qt.market[0].split('|')
      const candidates = segments.filter(seg => seg.split('_')[0]?.startsWith(marketKey))
      const trading = candidates.find(seg => seg.includes('open_交易中'))
      const exact = candidates.find(seg => seg.startsWith(`${marketKey}_`))
      marketStatus = trading
        ? '交易中'
        : exact
          ? exact.split('_').slice(2).join('_') || undefined
          : undefined
    }
    const num = (v: any) => {
      const n = Number(v)
      return Number.isFinite(n) && v !== '' && v != null ? n : null
    }
    const quote =
      qt.length > 45 && num(qt[3]) != null
        ? {
            price: num(qt[3])!,
            change: num(qt[31]) ?? 0,
            changePercent: num(qt[32]) ?? 0,
            high: num(qt[33]) ?? 0,
            low: num(qt[34]) ?? 0,
            pe: num(qt[39]),
            marketCap: num(qt[45]),
            marketStatus,
          }
        : undefined
    const result: MarketChartResult = {
      symbol: normalized,
      name: item?.qt?.[normalized]?.[1] || item?.name || normalized,
      range,
      interval: ktype,
      currency: normalized.startsWith('us') ? 'USD' : normalized.startsWith('hk') ? 'HKD' : 'CNY',
      timestamps: [],
      opens: [],
      closes: [],
      high: [],
      low: [],
      volume: [],
      quote,
    }
    for (const row of rows) {
      const [date, open, close, high, low, volume] = row
      result.timestamps.push(new Date(`${date}T00:00:00+08:00`).getTime())
      result.opens.push(Number(open))
      result.closes.push(Number(close))
      result.high.push(Number(high))
      result.low.push(Number(low))
      result.volume.push(Number(volume))
    }
    this.chartCache.set(key, { expiresAt: now + 5 * 60 * 1000, data: result })
    return result
  }

  /**
   * 批量实时报价：qt.gtimg.cn 支持逗号分隔多个代码，一次请求返回全部
   * 返回 null 的标的是查询失败或代码不存在
   */
  async fetchQuotes(symbols: string[]): Promise<Record<string, MarketQuote | null>> {
    // qt.gtimg 的美股代码不带交易所后缀（usAAPL，而非 usAAPL.OQ）
    const toQtSymbol = (s: string) => (s.startsWith('us') && s.includes('.') ? s.split('.')[0] : s)
    const normalized = symbols
      .map(s => toQtSymbol(s.trim()))
      .filter(Boolean)
      .slice(0, 50)
    const result: Record<string, MarketQuote | null> = {}
    if (!normalized.length) return result
    const response = await fetch(
      `https://qt.gtimg.cn/q=${normalized.join(',')}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } as any }
    )
    if (!response.ok) {
      throw new BadRequestException(`腾讯行情请求失败：${response.status}`)
    }
    // qt.gtimg.cn 返回 GBK 编码的 v_xxx="...~..." 文本
    const buffer = await response.arrayBuffer()
    const text = new TextDecoder('gbk').decode(buffer)
    const num = (v: any) => {
      const n = Number(v)
      return Number.isFinite(n) && v !== '' && v != null ? n : null
    }
    const re = /v_([^=]+)="([^"]*)"/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      const fields = m[2].split('~')
      if (fields.length <= 45 || num(fields[3]) == null) {
        result[m[1]] = null
        continue
      }
      result[m[1]] = {
        price: num(fields[3])!,
        change: num(fields[31]) ?? 0,
        changePercent: num(fields[32]) ?? 0,
        high: num(fields[33]) ?? 0,
        low: num(fields[34]) ?? 0,
        pe: num(fields[39]),
        marketCap: num(fields[45]),
      }
    }
    return result
  }
}

// Comment
export interface StockCommentDocument extends Document {
  user: string
  symbol: string
  content: string
  tags: string[]
  targetPrice?: number | null
  created_time: Date
}

export const StockCommentSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    symbol: String,
    content: String,
    tags: [String],
    targetPrice: { type: Number, default: null },
    created_time: { type: Date, default: Date.now },
  },
  { timestamps: false },
)

@Injectable()
export class StockCommentService {
  constructor(
    @InjectModel('StockComment')
    private readonly commentModel: Model<StockCommentDocument>,
  ) {}

  /** date 为 K 线选中日期（YYYY-MM-DD），作为评论时间；缺省用当前时间 */
  async addComment(
    symbol: string,
    content: string,
    tags: string[] = [],
    date?: string,
    targetPrice?: number | null,
  ) {
    const normalized = symbol.trim()
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date || '')
    const validTarget =
      typeof targetPrice === 'number' && Number.isFinite(targetPrice) && targetPrice > 0
        ? Math.round(targetPrice * 10000) / 10000
        : null
    return new this.commentModel({
      symbol: normalized,
      content,
      tags: tags
        .map(tag => tag.trim())
        .filter(Boolean)
        .slice(0, 5),
      targetPrice: validTarget,
      created_time: validDate ? new Date(`${date}T00:00:00`) : new Date(),
    }).save()
  }

  async getComments(symbol: string): Promise<StockComment[]> {
    const normalized = symbol.trim()
    return this.commentModel
      .find({ symbol: normalized })
      .sort({ created_time: -1 })
      .exec()
  }

  /** 编辑只改内容、标签和期望价格，不动 created_time（显示时间不变） */
  async updateComment(
    id: string,
    content: string,
    tags: string[] = [],
    targetPrice?: number | null,
  ) {
    const validTarget =
      typeof targetPrice === 'number' && Number.isFinite(targetPrice) && targetPrice > 0
        ? Math.round(targetPrice * 10000) / 10000
        : null
    return this.commentModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            content,
            tags: tags.map(tag => tag.trim()).filter(Boolean).slice(0, 5),
            targetPrice: validTarget,
          },
        },
        { new: true },
      )
      .exec()
  }

  async deleteComment(id: string) {
    const deleted = await this.commentModel.findByIdAndDelete(id).exec()
    return { success: true, deletedCount: deleted ? 1 : 0 }
  }
}

// Controller
export class AddStockCommentDTO {
  symbol: string
  content: string
  tags?: string[]
  /** K 线选中日期 YYYY-MM-DD，作为评论时间 */
  date?: string
  /** 期望价格（画 K 线横虚线），无则空 */
  targetPrice?: number | null
}

@Controller('api/market')
export class MarketController {
  constructor(
    private readonly marketService: MarketService,
    private readonly commentService: StockCommentService,
  ) {}

  @Public()
  @Get('search')
  async search(@Query('q') query: string) {
    return this.marketService.searchSymbols(query || '')
  }

  @Public()
  @Get('chart')
  async chart(
    @Query('symbol') symbol: string,
    @Query('range') range: string,
    @Query('count') count: string,
  ) {
    const parsed = Number(count)
    return this.marketService.fetchChart(
      symbol,
      range || '1y',
      count != null && count !== '' && Number.isFinite(parsed) ? parsed : undefined,
    )
  }

  @Public()
  @Get('quotes')
  async quotes(@Query('symbols') symbols: string) {
    return this.marketService.fetchQuotes((symbols || '').split(','))
  }

  @Public()
  @Get('comments')
  async getComments(@Query('symbol') symbol: string) {
    return this.commentService.getComments(symbol || '')
  }

  @Post('comments')
  async addComment(@Body() body: AddStockCommentDTO) {
    const content = (body.content || '').trim()
    if (!content) {
      throw new BadRequestException('评论内容不能为空')
    }
    return this.commentService.addComment(
      body.symbol,
      content,
      body.tags || [],
      body.date,
      body.targetPrice,
    )
  }

  @Patch('comments/:id')
  async updateComment(
    @Param('id') id: string,
    @Body() body: { content?: string; tags?: string[]; targetPrice?: number | null },
  ) {
    const content = (body.content || '').trim()
    if (!content) {
      throw new BadRequestException('评论内容不能为空')
    }
    return this.commentService.updateComment(id, content, body.tags || [], body.targetPrice)
  }

  @Delete('comments/:id')
  async deleteComment(@Param('id') id: string) {
    return this.commentService.deleteComment(id)
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'StockComment', schema: StockCommentSchema },
    ]),
  ],
  controllers: [MarketController],
  providers: [MarketService, StockCommentService],
})
export class MarketModule {}
