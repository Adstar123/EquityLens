package ingestion

// NormalizeFinancials converts a raw Yahoo Finance QuoteSummaryResult into the
// flat map[string]float64 the scoring engine expects.
//
// Scored ratios (7):
//   - net_profit_margin = financialData.profitMargins * 100 (decimal -> %)
//   - roe               = defaultKeyStatistics.returnOnEquity * 100 (decimal -> %)
//   - current_ratio     = financialData.currentRatio (direct)
//   - quick_ratio       = financialData.quickRatio (direct)
//   - debt_to_equity    = financialData.debtToEquity / 100 (Yahoo %-style -> ratio)
//   - interest_coverage = incomeStatementHistory[0].ebit / abs(interestExpense)
//   - asset_turnover    = financialData.totalRevenue / balanceSheetHistory[0].totalAssets
//
// Context ratios (display-only, prefixed ctx_):
//   - ctx_pe_ratio  = summaryDetail.trailingPE
//   - ctx_ev_ebitda = defaultKeyStatistics.enterpriseToEbitda
//   - ctx_fcf_yield = (financialData.freeCashflow / price.marketCap) * 100
//
// Zero or missing values are omitted so the scoring engine's missing-data
// handling can kick in.
func NormalizeFinancials(data *QuoteSummaryResult) map[string]float64 {
	m := make(map[string]float64)

	// === Scored ratios (7) ===

	// Net Profit Margin (decimal -> %)
	if v := data.FinancialData.ProfitMargins.Raw; v != 0 {
		m["net_profit_margin"] = v * 100
	}

	// ROE (decimal -> %)
	if v := data.DefaultKeyStatistics.ReturnOnEquity.Raw; v != 0 {
		m["roe"] = v * 100
	}

	// Current Ratio (direct)
	if v := data.FinancialData.CurrentRatio.Raw; v != 0 {
		m["current_ratio"] = v
	}

	// Quick Ratio (direct)
	if v := data.FinancialData.QuickRatio.Raw; v != 0 {
		m["quick_ratio"] = v
	}

	// Debt-to-Equity (Yahoo %-style -> ratio)
	if v := data.FinancialData.DebtToEquity.Raw; v != 0 {
		m["debt_to_equity"] = v / 100
	}

	// Interest Coverage (EBIT / Interest Expense)
	if len(data.IncomeStatementHistory.IncomeStatementHistory) > 0 {
		stmt := data.IncomeStatementHistory.IncomeStatementHistory[0]
		ebit := stmt.EBIT.Raw
		interest := stmt.InterestExpense.Raw
		if interest < 0 {
			interest = -interest
		}
		if ebit != 0 && interest != 0 {
			m["interest_coverage"] = ebit / interest
		}
	}

	// Asset Turnover (Revenue / Total Assets)
	revenue := data.FinancialData.TotalRevenue.Raw
	if len(data.BalanceSheetHistory.BalanceSheetStatements) > 0 {
		totalAssets := data.BalanceSheetHistory.BalanceSheetStatements[0].TotalAssets.Raw
		if revenue != 0 && totalAssets != 0 {
			m["asset_turnover"] = revenue / totalAssets
		}
	}

	// === Context ratios (display-only, prefixed with ctx_) ===

	if v := data.SummaryDetail.TrailingPE.Raw; v != 0 {
		m["ctx_pe_ratio"] = v
	}

	if v := data.DefaultKeyStatistics.EnterpriseToEbitda.Raw; v != 0 {
		m["ctx_ev_ebitda"] = v
	}

	mcap := data.Price.MarketCap.Raw
	fcf := data.FinancialData.FreeCashflow.Raw
	if mcap != 0 && fcf != 0 {
		m["ctx_fcf_yield"] = fcf / mcap * 100
	}

	return m
}
