package ingestion

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"golang.org/x/time/rate"
)

// YahooClient fetches company data from Yahoo Finance's quoteSummary endpoint.
type YahooClient struct {
	httpClient  *http.Client
	rateLimiter *rate.Limiter
	baseURL     string // overridable for tests
}

// NewYahooClient returns a client with sensible defaults:
// 15s timeout, 5-burst / 1-per-2s rate limiter.
func NewYahooClient() *YahooClient {
	return &YahooClient{
		httpClient:  &http.Client{Timeout: 15 * time.Second},
		rateLimiter: rate.NewLimiter(rate.Every(4*time.Second), 2),
		baseURL:     "https://query1.finance.yahoo.com",
	}
}

// ---------- public response types ----------

// CompanyProfile is the subset of data we care about for company identification.
type CompanyProfile struct {
	Symbol    string
	Name      string
	Sector    string
	MarketCap int64
}

// ---------- Yahoo response model ----------

// YahooValue captures the {"raw": value} pattern Yahoo uses everywhere.
type YahooValue struct {
	Raw float64 `json:"raw"`
}

// QuoteSummaryResponse is the top-level JSON envelope.
type QuoteSummaryResponse struct {
	QuoteSummary struct {
		Result []QuoteSummaryResult `json:"result"`
	} `json:"quoteSummary"`
}

// QuoteSummaryResult holds the individual module blocks.
type QuoteSummaryResult struct {
	DefaultKeyStatistics DefaultKeyStatistics `json:"defaultKeyStatistics"`
	FinancialData        FinancialData        `json:"financialData"`
	SummaryDetail        SummaryDetail        `json:"summaryDetail"`
	Price                Price                `json:"price"`
}

type DefaultKeyStatistics struct {
	EnterpriseToEbitda YahooValue `json:"enterpriseToEbitda"`
	ReturnOnEquity     YahooValue `json:"returnOnEquity"`
}

type FinancialData struct {
	FreeCashflow   YahooValue `json:"freeCashflow"`
	TotalDebt      YahooValue `json:"totalDebt"`
	ReturnOnEquity YahooValue `json:"returnOnEquity"`
	DebtToEquity   YahooValue `json:"debtToEquity"`
}

type SummaryDetail struct {
	TrailingPE YahooValue `json:"trailingPE"`
}

type Price struct {
	ShortName string     `json:"shortName"`
	MarketCap YahooValue `json:"marketCap"`
}

// ---------- internal fetch ----------

func (c *YahooClient) fetchQuoteSummary(ctx context.Context, symbol string) (*QuoteSummaryResult, error) {
	url := fmt.Sprintf(
		"%s/v10/finance/quoteSummary/%s?modules=defaultKeyStatistics,financialData,summaryDetail,price",
		c.baseURL, symbol,
	)

	maxRetries := 3
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if err := c.rateLimiter.Wait(ctx); err != nil {
			return nil, fmt.Errorf("rate limiter: %w", err)
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return nil, fmt.Errorf("building request: %w", err)
		}

		resp, err := c.httpClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("executing request: %w", err)
		}

		if resp.StatusCode == 429 {
			resp.Body.Close()
			if attempt < maxRetries {
				backoff := time.Duration(10*(attempt+1)) * time.Second
				time.Sleep(backoff)
				continue
			}
			return nil, fmt.Errorf("yahoo rate limited after %d retries for %s", maxRetries, symbol)
		}

		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			return nil, fmt.Errorf("yahoo returned status %d for %s", resp.StatusCode, symbol)
		}

		var envelope QuoteSummaryResponse
		if err := json.NewDecoder(resp.Body).Decode(&envelope); err != nil {
			resp.Body.Close()
			return nil, fmt.Errorf("decoding response: %w", err)
		}
		resp.Body.Close()

		if len(envelope.QuoteSummary.Result) == 0 {
			return nil, fmt.Errorf("no results returned for %s", symbol)
		}

		return &envelope.QuoteSummary.Result[0], nil
	}

	return nil, fmt.Errorf("exhausted retries for %s", symbol)
}

// ---------- public methods ----------

// FetchProfile returns high-level company identification data.
func (c *YahooClient) FetchProfile(ctx context.Context, symbol string) (*CompanyProfile, error) {
	result, err := c.fetchQuoteSummary(ctx, symbol)
	if err != nil {
		return nil, err
	}

	return &CompanyProfile{
		Symbol:    symbol,
		Name:      result.Price.ShortName,
		Sector:    "", // sector not available in this module set
		MarketCap: int64(result.Price.MarketCap.Raw),
	}, nil
}

// FetchFinancials returns a normalised map of financial ratios ready for the
// scoring engine.
func (c *YahooClient) FetchFinancials(ctx context.Context, symbol string) (map[string]float64, error) {
	result, err := c.fetchQuoteSummary(ctx, symbol)
	if err != nil {
		return nil, err
	}

	return NormalizeFinancials(result), nil
}
