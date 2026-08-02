package ingestion

// DebtFreeDERatio: below this debt-to-equity a company is treated as
// effectively debt-free when judging interest coverage.
const DebtFreeDERatio = 0.05

// DebtFreeInterestCoverage is the sentinel for effectively debt-free
// companies: with no meaningful debt there is no interest burden to cover, so
// coverage belongs in the top band. Sector configs clamp this to their
// max_clamp (e.g. 50) before banding, so the stored value stays sane.
const DebtFreeInterestCoverage = 999.0

// NormalizeFinancials converts a raw Yahoo Finance QuoteSummaryResult (plus
// the fundamentals-timeseries figures, which may be nil) into the flat
// map[string]float64 the scoring engine expects.
//
// Scored ratios (7):
//   - net_profit_margin = financialData.profitMargins * 100 (decimal -> %)
//   - roe               = defaultKeyStatistics.returnOnEquity * 100, fallback financialData, fallback netIncome/(bookValue*shares)
//   - current_ratio     = financialData.currentRatio (direct)
//   - quick_ratio       = financialData.quickRatio (direct)
//   - debt_to_equity    = financialData.debtToEquity / 100, fallback totalDebt/(bookValue*shares)
//   - interest_coverage = EBIT / abs(interestExpense) from the timeseries endpoint.
//     Companies with no reported interest expense AND debt_to_equity below
//     DebtFreeDERatio are treated as top band (no debt to service). Companies
//     that carry debt but report no interest expense stay missing.
//   - asset_turnover    = revenue / totalAssets from the timeseries endpoint
//     (same-source figures, so the reporting currency always matches)
//
// Context ratios (display-only, prefixed ctx_):
//   - ctx_pe_ratio  = summaryDetail.trailingPE
//   - ctx_ev_ebitda = defaultKeyStatistics.enterpriseToEbitda
//   - ctx_fcf_yield = (financialData.freeCashflow / price.marketCap) * 100
//
// Zero or missing values are omitted so the scoring engine's missing-data
// handling can kick in.
func NormalizeFinancials(data *QuoteSummaryResult, ts *TimeseriesFundamentals) map[string]float64 {
	m := make(map[string]float64)

	// === Scored ratios (7) ===

	// Net Profit Margin (decimal -> %)
	if v := data.FinancialData.ProfitMargins.Raw; v != 0 {
		m["net_profit_margin"] = v * 100
	}

	// ROE (decimal -> %) — try defaultKeyStatistics first, fall back to financialData,
	// then derive from netIncomeToCommon / (bookValue * sharesOutstanding)
	if v := data.DefaultKeyStatistics.ReturnOnEquity.Raw; v != 0 {
		m["roe"] = v * 100
	} else if v := data.FinancialData.ReturnOnEquity.Raw; v != 0 {
		m["roe"] = v * 100
	} else {
		netIncome := data.DefaultKeyStatistics.NetIncomeToCommon.Raw
		bookValue := data.DefaultKeyStatistics.BookValue.Raw
		shares := data.DefaultKeyStatistics.SharesOutstanding.Raw
		if netIncome != 0 && bookValue != 0 && shares != 0 {
			totalEquity := bookValue * shares
			m["roe"] = (netIncome / totalEquity) * 100
		}
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
	// Primary: financialData.debtToEquity (Yahoo reports as %, so / 100)
	// Fallback: totalDebt / (bookValue * sharesOutstanding)
	if v := data.FinancialData.DebtToEquity.Raw; v != 0 {
		m["debt_to_equity"] = v / 100
	} else {
		totalDebt := data.FinancialData.TotalDebt.Raw
		bookValue := data.DefaultKeyStatistics.BookValue.Raw
		shares := data.DefaultKeyStatistics.SharesOutstanding.Raw
		if totalDebt != 0 && bookValue != 0 && shares != 0 {
			totalEquity := bookValue * shares
			m["debt_to_equity"] = totalDebt / totalEquity
		}
	}

	// Interest Coverage (EBIT / |Interest Expense|)
	// quoteSummary's history modules are empty for ASX, so the legacy path is
	// kept only as a first choice if Yahoo ever populates it again; the
	// timeseries figures are the working source.
	ebit, interest := 0.0, 0.0
	if len(data.IncomeStatementHistory.IncomeStatementHistory) > 0 {
		stmt := data.IncomeStatementHistory.IncomeStatementHistory[0]
		ebit = stmt.EBIT.Raw
		interest = stmt.InterestExpense.Raw
	}
	if ts != nil {
		if ebit == 0 {
			ebit = ts.EBIT
		}
		if interest == 0 {
			interest = ts.InterestExpense
		}
	}
	if interest < 0 {
		interest = -interest
	}
	if ebit != 0 && interest != 0 {
		m["interest_coverage"] = ebit / interest
	} else if interest == 0 {
		// No interest expense reported. A company that is effectively
		// debt-free has no interest burden, so coverage is top band. A
		// company that carries debt but reports no interest expense stays
		// missing rather than being guessed at.
		if de, ok := m["debt_to_equity"]; ok && de < DebtFreeDERatio {
			m["interest_coverage"] = DebtFreeInterestCoverage
		}
	}

	// Asset Turnover (Revenue / Total Assets)
	// Prefer both figures from the timeseries endpoint so the reporting
	// currency always matches (e.g. BHP files in USD).
	revenue := data.FinancialData.TotalRevenue.Raw
	totalAssets := 0.0
	if len(data.BalanceSheetHistory.BalanceSheetStatements) > 0 {
		totalAssets = data.BalanceSheetHistory.BalanceSheetStatements[0].TotalAssets.Raw
	}
	if ts != nil {
		if ts.TotalRevenue != 0 {
			revenue = ts.TotalRevenue
		}
		if totalAssets == 0 {
			totalAssets = ts.TotalAssets
		}
	}
	if revenue != 0 && totalAssets != 0 {
		m["asset_turnover"] = revenue / totalAssets
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
