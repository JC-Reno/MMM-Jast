export interface StockPrice {
  currency?: string
  regularMarketPrice?: number
  regularMarketChange?: number
  regularMarketChangePercent?: number
  regularMarketPreviousClose?: number
  regularMarketTime?: string | Date
  longName?: string
  symbol?: string
}

export interface StockSummaryDetail {
  currency?: string
}

export interface StockResponse {
  summaryDetail?: StockSummaryDetail
  price?: StockPrice
  meta: {
    purchasePrice?: number
    symbol: string
    displayCurrency?: string
    name?: string
    quantity?: number
    hidden?: boolean
  }
}
