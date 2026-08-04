/*! *****************************************************************************
  mmm-jast
  Version 2.10.5

  A minimalistic stock ticker based on Yahoo's finance API for the MagicMirror² platform.
  Please submit bugs at https://github.com/jalibu/MMM-Jast/issues

  (c) Jan.Litzenburger@gmail.com
  Licence: MIT

  This file is auto-generated. Do not edit.
***************************************************************************** */

'use strict'

const NodeHelperImport = require('node_helper')
const Log = require('logger')
const YahooFinanceImport = require('yahoo-finance2')

const NodeHelper = NodeHelperImport && NodeHelperImport.default ? NodeHelperImport.default : NodeHelperImport
const YahooFinance =
  YahooFinanceImport && YahooFinanceImport.default ? YahooFinanceImport.default : YahooFinanceImport

const sanityFields = [
  'regularMarketChange',
  'regularMarketChangePercent',
  'regularMarketPrice',
  'currency',
  'longName',
  'regularMarketPreviousClose'
]

async function requestStocks(config) {
  const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] })
  const requests = []
  const stocks = []

  for (const stock of config.stocks) {
    requests.push(yahooFinance.quoteSummary(stock.symbol, { modules: ['price'] }))
  }

  const responses = await Promise.all(requests.map((request) => request.catch((error) => error)))

  for (const [index, response] of responses.entries()) {
    if (response instanceof Error) {
      Log.warn(`API request for ${config.stocks[index].symbol} failed:`, response.message)
      continue
    }

    if (!response.price) {
      Log.warn(`Response for ${config.stocks[index].symbol} does not satisfy expected payload.`)
      continue
    }

    const metadata = {
      symbol: config.stocks[index].symbol,
      name: config.stocks[index].name,
      quantity: config.stocks[index].quantity,
      hidden: config.stocks[index].hidden,
      purchasePrice: config.stocks[index].purchasePrice
    }

    if (response.price.currency === 'GBp') {
      response.price.regularMarketPrice /= 100
      response.price.regularMarketChange /= 100
      response.price.currency = 'GBP'
    }

    if (config.maxChangeAge > 0) {
      const maxAllowedTimestamp = Date.now() - config.maxChangeAge
      try {
        if (maxAllowedTimestamp > Date.parse(response.price.regularMarketTime)) {
          response.price.regularMarketPreviousClose = response.price.regularMarketPrice
          response.price.regularMarketChange = 0
          response.price.regularMarketChangePercent = 0
        }
      } catch (error) {
        Log.warn('Could not parse lastChange date', error)
      }
    }

    stocks.push({
      price: response.price,
      meta: metadata
    })
  }

  return stocks
}

module.exports = NodeHelper.create({
  start() {
    Log.log(`${this.name} helper method started...`)
  },

  async socketNotificationReceived(notification, payload) {
    if (!notification.includes('JAST_STOCKS_REQUEST')) {
      Log.warn(`${notification} is invalid notification`)
      return
    }

    const identifier = notification.substring('JAST_STOCKS_REQUEST'.length + 1)
    let stocks = await requestStocks(payload)

    stocks = stocks.filter((stock) =>
      sanityFields.every((field) => {
        if (Object.prototype.hasOwnProperty.call(stock.price, field)) {
          return true
        }

        Log.warn(
          `Skipped symbol '${stock.meta.symbol}' as it's response did not have required property '${field}'. This is usually the case when a symbol is misspelled`
        )
        return false
      })
    )

    this.sendSocketNotification(`JAST_STOCKS_RESPONSE-${identifier}`, {
      lastUpdate: Date.now(),
      stocks
    })
  }
})
