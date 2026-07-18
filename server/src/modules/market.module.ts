import {
  Module,
  Controller,
  Get,
  Query,
  BadRequestException,
} from '@nestjs/common'
import { Injectable } from '@nestjs/common'
import axios from 'axios'
import { Public } from 'src/guards/jwt-auth.guard'
import type { MarketChartResult, MarketSearchResult } from 'shared/types/stock'

@Injectable()
export class MarketService {
  private symbolCache = new Map<string, { expiresAt: number; data: MarketSearchResult }>()
  private chartCache = new Map<string, { expiresAt: number; data: MarketChartResult }>()

  private getCacheKey(symbol: string, range: string) {
    return `${symbol.toUpperCase()}#${range}`
  }

  private readonly yahooHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Referer: 'https://finance.yahoo.com/',
    Origin: 'https://finance.yahoo.com',
  }

  async searchSymbols(query: string): Promise<MarketSearchResult[]> {
    if (!query.trim()) {
      return []
    }

    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&lang=zh-CN&region=CN&quotesCount=20&newsCount=0`
    const response = await axios.get(url, {
      timeout: 10000,
      headers: this.yahooHeaders,
      responseType: 'json',
    })
    const items = response.data?.quotes || []

    return items
      .filter((item: any) => item.symbol && item.shortname)
      .map((item: any) => ({
        symbol: item.symbol,
        name: item.shortname,
        type: item.quoteType || item.typeDisp || '未知',
        exchange: item.exchange || item.fullExchangeName,
        currency: item.currency,
      }))
      .slice(0, 18)
  }

  async fetchChart(symbol: string, range: string): Promise<MarketChartResult> {
    const normalized = symbol.trim().toUpperCase()
    if (!normalized) {
      throw new BadRequestException('symbol 不能为空')
    }
    const key = this.getCacheKey(normalized, range)
    const cached = this.chartCache.get(key)
    const now = Date.now()
    if (cached && cached.expiresAt > now) {
      console.log(`[MarketService] cache hit ${key} (${cached.data.timestamps.length} points)`)
      return cached.data
    }

    const interval = this.resolveInterval(range)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalized)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}&includePrePost=false&events=div%2Csplit`
    console.log(`[MarketService] requesting chart ${normalized}@${range} interval=${interval}`)
    const response = await axios.get(url, {
      timeout: 10000,
      headers: this.yahooHeaders,
      responseType: 'json',
    })
    const quote = response.data?.chart?.result?.[0]
    if (!quote) {
      throw new BadRequestException('无法获取行情数据')
    }

    const timestamps = quote.timestamp || []
    const indicators = quote.indicators?.quote?.[0] || {}
    const result: MarketChartResult = {
      symbol: normalized,
      name: quote.meta?.shortName || quote.meta?.symbol || normalized,
      range,
      interval,
      currency: quote.meta?.currency || 'USD',
      timestamps: timestamps.map((ts: number) => ts * 1000),
      opens: indicators.open || [],
      closes: indicators.close || [],
      high: indicators.high || [],
      low: indicators.low || [],
      volume: indicators.volume || [],
    }
    console.log(`[MarketService] fetched chart ${normalized}@${range}: timestamps=${result.timestamps.length}, closes=${result.closes.length}`)
    this.chartCache.set(key, { expiresAt: now + 5 * 60 * 1000, data: result })
    return result
  }

  private resolveInterval(range: string) {
    switch (range) {
      case '1d':
        return '5m'
      case '5d':
        return '15m'
      case '1mo':
      case '1y':
        return '1d'
      case '5y':
      case '10y':
      case 'max':
        return '1wk'
      default:
        return '1d'
    }
  }
}

@Controller('api/market')
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Public()
  @Get('search')
  async search(@Query('q') query: string) {
    return this.marketService.searchSymbols(query)
  }

  @Public()
  @Get('chart')
  async chart(@Query('symbol') symbol: string, @Query('range') range: string) {
    return this.marketService.fetchChart(symbol, range || '1mo')
  }
}

@Module({
  controllers: [MarketController],
  providers: [MarketService],
})
export class MarketModule {}
