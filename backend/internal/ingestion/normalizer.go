package ingestion

// NormalizeFinancials converts a raw Yahoo Finance QuoteSummaryResult into the
// flat map[string]float64 the scoring engine expects.
//
// Mapping rules:
//   - pe_ratio      = summaryDetail.trailingPE
//   - roe           = defaultKeyStatistics.returnOnEquity * 100 (decimal -> %)
//   - ev_ebitda     = defaultKeyStatistics.enterpriseToEbitda
//   - debt_to_equity= financialData.debtToEquity / 100 (Yahoo %-style -> ratio)
//   - fcf_yield     = (financialData.freeCashflow / price.marketCap) * 100
//
// Zero or missing values are omitted so the scoring engine's missing-data
// handling can kick in.
func NormalizeFinancials(data *QuoteSummaryResult) map[string]float64 {
	m := make(map[string]float64)

	if v := data.SummaryDetail.TrailingPE.Raw; v != 0 {
		m["pe_ratio"] = v
	}

	if v := data.DefaultKeyStatistics.ReturnOnEquity.Raw; v != 0 {
		m["roe"] = v * 100
	}

	if v := data.DefaultKeyStatistics.EnterpriseToEbitda.Raw; v != 0 {
		m["ev_ebitda"] = v
	}

	if v := data.FinancialData.DebtToEquity.Raw; v != 0 {
		m["debt_to_equity"] = v / 100
	}

	mcap := data.Price.MarketCap.Raw
	fcf := data.FinancialData.FreeCashflow.Raw
	if mcap != 0 && fcf != 0 {
		m["fcf_yield"] = fcf / mcap * 100
	}

	return m
}
