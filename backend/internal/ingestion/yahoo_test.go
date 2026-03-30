package ingestion

import (
	"context"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"golang.org/x/time/rate"
)

// loadFixture reads the BHP test fixture from testdata/.
func loadFixture(t *testing.T) []byte {
	t.Helper()
	data, err := os.ReadFile("testdata/bhp_quote.json")
	if err != nil {
		t.Fatalf("reading fixture: %v", err)
	}
	return data
}

// almostEqual checks floating point equality within a tolerance.
func almostEqual(a, b, tol float64) bool {
	return math.Abs(a-b) < tol
}

// ---------- normalizer tests ----------

func TestNormalizeFinancials(t *testing.T) {
	data := &QuoteSummaryResult{
		DefaultKeyStatistics: DefaultKeyStatistics{
			EnterpriseToEbitda: YahooValue{Raw: 5.8},
			ReturnOnEquity:     YahooValue{Raw: 0.28},
		},
		FinancialData: FinancialData{
			FreeCashflow:  YahooValue{Raw: 8500000000},
			DebtToEquity:  YahooValue{Raw: 42.5},
			ProfitMargins: YahooValue{Raw: 0.15},
			CurrentRatio:  YahooValue{Raw: 1.8},
			QuickRatio:    YahooValue{Raw: 1.2},
			TotalRevenue:  YahooValue{Raw: 50000000000},
		},
		SummaryDetail: SummaryDetail{
			TrailingPE: YahooValue{Raw: 14.5},
		},
		Price: Price{
			ShortName: "BHP Group Limited",
			MarketCap: YahooValue{Raw: 145000000000},
		},
		IncomeStatementHistory: IncomeStatementHistory{
			IncomeStatementHistory: []IncomeStatement{
				{
					EBIT:            YahooValue{Raw: 15000000000},
					InterestExpense: YahooValue{Raw: -2000000000},
				},
			},
		},
		BalanceSheetHistory: BalanceSheetHistory{
			BalanceSheetStatements: []BalanceSheet{
				{
					TotalAssets: YahooValue{Raw: 100000000000},
				},
			},
		},
	}

	m := NormalizeFinancials(data)

	tests := []struct {
		key  string
		want float64
	}{
		{"net_profit_margin", 15.0},                          // 0.15 * 100
		{"roe", 28.0},                                        // 0.28 * 100
		{"current_ratio", 1.8},                               // direct
		{"quick_ratio", 1.2},                                 // direct
		{"debt_to_equity", 0.425},                            // 42.5 / 100
		{"interest_coverage", 7.5},                           // 15B / 2B
		{"asset_turnover", 0.5},                              // 50B / 100B
		{"ctx_pe_ratio", 14.5},                               // direct
		{"ctx_ev_ebitda", 5.8},                               // direct
		{"ctx_fcf_yield", 8500000000.0 / 145000000000.0 * 100}, // ~5.862
	}

	for _, tc := range tests {
		t.Run(tc.key, func(t *testing.T) {
			got, ok := m[tc.key]
			if !ok {
				t.Fatalf("key %q missing from result map", tc.key)
			}
			if !almostEqual(got, tc.want, 0.001) {
				t.Errorf("%s = %f, want %f", tc.key, got, tc.want)
			}
		})
	}

	if len(m) != 10 {
		t.Errorf("expected 10 keys, got %d: %v", len(m), m)
	}
}

func TestNormalizeFinancials_MissingFields(t *testing.T) {
	// Only provide PE — everything else is zero-valued.
	data := &QuoteSummaryResult{
		SummaryDetail: SummaryDetail{
			TrailingPE: YahooValue{Raw: 14.5},
		},
	}

	m := NormalizeFinancials(data)

	if _, ok := m["ctx_pe_ratio"]; !ok {
		t.Fatal("ctx_pe_ratio should be present")
	}

	for _, key := range []string{"net_profit_margin", "roe", "current_ratio", "quick_ratio", "debt_to_equity", "interest_coverage", "asset_turnover", "ctx_ev_ebitda", "ctx_fcf_yield"} {
		if _, ok := m[key]; ok {
			t.Errorf("key %q should be absent when source fields are zero", key)
		}
	}
}

// ---------- FetchProfile test ----------

func TestFetchProfile(t *testing.T) {
	fixture := loadFixture(t)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write(fixture)
	}))
	defer srv.Close()

	client := &YahooClient{
		httpClient:  srv.Client(),
		rateLimiter: rate.NewLimiter(rate.Inf, 1), // no throttle in tests
		baseURL:     srv.URL,
		crumb:       "test-crumb", // skip real crumb auth in tests
	}

	profile, err := client.FetchProfile(context.Background(), "BHP.AX")
	if err != nil {
		t.Fatalf("FetchProfile: %v", err)
	}

	if profile.Symbol != "BHP.AX" {
		t.Errorf("Symbol = %q, want BHP.AX", profile.Symbol)
	}
	if profile.Name != "BHP Group Limited" {
		t.Errorf("Name = %q, want BHP Group Limited", profile.Name)
	}
	if profile.MarketCap != 145000000000 {
		t.Errorf("MarketCap = %d, want 145000000000", profile.MarketCap)
	}
}

// ---------- FetchFinancials test ----------

func TestFetchFinancials(t *testing.T) {
	fixture := loadFixture(t)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write(fixture)
	}))
	defer srv.Close()

	client := &YahooClient{
		httpClient:  srv.Client(),
		rateLimiter: rate.NewLimiter(rate.Inf, 1),
		baseURL:     srv.URL,
		crumb:       "test-crumb", // skip real crumb auth in tests
	}

	fin, err := client.FetchFinancials(context.Background(), "BHP.AX")
	if err != nil {
		t.Fatalf("FetchFinancials: %v", err)
	}

	// Spot-check a couple of values to confirm the full pipeline works.
	if pe, ok := fin["ctx_pe_ratio"]; !ok || !almostEqual(pe, 14.5, 0.001) {
		t.Errorf("ctx_pe_ratio = %v, want 14.5", pe)
	}
	if roe, ok := fin["roe"]; !ok || !almostEqual(roe, 28.0, 0.001) {
		t.Errorf("roe = %v, want 28.0", roe)
	}
	if de, ok := fin["debt_to_equity"]; !ok || !almostEqual(de, 0.425, 0.001) {
		t.Errorf("debt_to_equity = %v, want 0.425", de)
	}
}
