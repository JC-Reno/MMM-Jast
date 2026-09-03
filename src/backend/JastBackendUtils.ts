import * as Log from 'logger'
import { Config } from '../types/Config'
import { StockResponse } from '../types/StockResponse'

interface QuoteSummaryResponse {
  price?: StockResponse['price']
}

interface YahooFinanceClient {
  quoteSummary: (symbol: string, options: { modules: string[] }) => Promise<QuoteSummaryResponse>
}

type YahooFinanceConstructor = new (options: { suppressNotices: string[] }) => YahooFinanceClient

let cachedYahooFinanceConstructor: YahooFinanceConstructor | null | undefined
let hasLoggedMissingYahooFinance = false

/**
 *
 */
export function ensureYahooFinanceRuntimeCompatibility(): void {
  if (typeof process === 'undefined' || typeof globalThis === 'undefined') {
    return
  }

  const ensureGlobalProperty = (target: object, name: string, value: unknown) => {
    if (!Object.prototype.hasOwnProperty.call(target, name)) {
      Object.defineProperty(target, name, {
        value,
        configurable: true,
        enumerable: false,
        writable: true
      })
    }
  }

  if (typeof globalThis.self === 'object' && globalThis.self !== null) {
    ensureGlobalProperty(globalThis.self as object, 'process', process)
  }

  if (typeof globalThis.global === 'object' && globalThis.global !== null) {
    ensureGlobalProperty(globalThis.global as object, 'process', process)
  }

  ensureGlobalProperty(globalThis, 'process', process)
  ensureGlobalProperty(globalThis, 'global', globalThis)
}

/**
 *
 */
async function getYahooFinanceConstructor(): Promise<YahooFinanceConstructor | null> {
  if (cachedYahooFinanceConstructor !== undefined) {
    return cachedYahooFinanceConstructor
  }

  try {
    ensureYahooFinanceRuntimeCompatibility()
    const yahooFinance2Module = await import('yahoo-finance2')
    cachedYahooFinanceConstructor = ('default' in yahooFinance2Module
      ? yahooFinance2Module.default
      : yahooFinance2Module) as unknown as YahooFinanceConstructor
  } catch (error) {
    cachedYahooFinanceConstructor = null

    if (!hasLoggedMissingYahooFinance) {
      const message = error instanceof Error ? error.message : String(error)
      Log.error("MMM-Jast dependency 'yahoo-finance2' is missing. Please run 'npm ci' in MMM-Jast directory.", message)
      hasLoggedMissingYahooFinance = true
    }
  }

  return cachedYahooFinanceConstructor
}

const JastBackendUtils = {
  async requestStocks(config: Config): Promise<StockResponse[]> {
    const YahooFinance = await getYahooFinanceConstructor()
    if (!YahooFinance) {
      return []
    }

    const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] })
    const stocks = []
    const promises: Promise<QuoteSummaryResponse>[] = []

    for (const stock of config.stocks) {
      promises.push(yahooFinance.quoteSummary(stock.symbol, { modules: ['price'] }))
    }

    const apiResponses = await Promise.all(promises.map((p) => p.catch((e) => e)))

    for (const [index, response] of apiResponses.entries()) {
      if (response instanceof Error) {
        Log.warn(`API request for ${config.stocks[index].symbol} failed:`, response.message)
      } else if (response.price) {
        const meta = {
          symbol: config.stocks[index].symbol,
          name: config.stocks[index].name,
          quantity: config.stocks[index].quantity,
          hidden: config.stocks[index].hidden,
          purchasePrice: config.stocks[index].purchasePrice
        }
        // Manually convert GBp to GBP
        if (response.price.currency === 'GBp') {
          response.price.regularMarketPrice /= 100
          response.price.regularMarketChange /= 100
          response.price.currency = 'GBP'
        }

        // Override changes if they are older than maxChangeAge
        if (config.maxChangeAge > 0) {
          const maxChangeAge = new Date().getTime() - config.maxChangeAge
          try {
            const regularMarketTime = response.price.regularMarketTime
            const lastChange = Date.parse(
              typeof regularMarketTime === 'string' ? regularMarketTime : regularMarketTime.toISOString()
            )

            if (maxChangeAge > lastChange) {
              response.price.regularMarketPreviousClose = response.price?.regularMarketPrice
              response.price.regularMarketChange = 0
              response.price.regularMarketChangePercent = 0
            }
          } catch (err) {
            Log.warn('Could not parse lastChange date', err)
          }
        }

        stocks.push({ price: response.price, meta })
      } else {
        Log.warn(`Response for ${config.stocks[index].symbol} does not satisfy expected payload.`)
      }
    }

    return stocks
  }
}

export default JastBackendUtils
