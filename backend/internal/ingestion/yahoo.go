package ingestion

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// YahooClient fetches company data from Yahoo Finance's quoteSummary endpoint.
type YahooClient struct {
	httpClient  *http.Client
	rateLimiter *rate.Limiter
	baseURL     string // overridable for tests

	// crumb/cookie auth
	mu    sync.Mutex
	crumb string
}

const yahooUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

// NewYahooClient returns a client with crumb/cookie auth and rate limiting.
func NewYahooClient() *YahooClient {
	jar, _ := cookiejar.New(nil)
	return &YahooClient{
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
			Jar:     jar,
		},
		rateLimiter: rate.NewLimiter(rate.Every(2*time.Second), 1),
		baseURL:     "https://query2.finance.yahoo.com",
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

// ---------- crumb/cookie auth ----------

func (c *YahooClient) ensureCrumb(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.crumb != "" {
		return nil
	}

	return c.fetchCrumb(ctx)
}

func (c *YahooClient) fetchCrumb(ctx context.Context) error {
	// Step 1: hit consent/cookie endpoint to get cookies
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://fc.yahoo.com/", nil)
	if err != nil {
		return fmt.Errorf("building cookie request: %w", err)
	}
	req.Header.Set("User-Agent", yahooUserAgent)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("fetching cookies: %w", err)
	}
	resp.Body.Close()
	// 404 is expected — we just need the cookies

	// Step 2: fetch the crumb using the cookies
	req, err = http.NewRequestWithContext(ctx, http.MethodGet,
		"https://query2.finance.yahoo.com/v1/test/getcrumb", nil)
	if err != nil {
		return fmt.Errorf("building crumb request: %w", err)
	}
	req.Header.Set("User-Agent", yahooUserAgent)

	resp, err = c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("fetching crumb: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("crumb endpoint returned %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("reading crumb: %w", err)
	}

	crumb := strings.TrimSpace(string(body))
	if crumb == "" {
		return fmt.Errorf("empty crumb returned")
	}

	c.crumb = crumb
	fmt.Printf("yahoo: obtained crumb for authenticated requests\n")
	return nil
}

func (c *YahooClient) invalidateCrumb() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.crumb = ""
}

// ---------- internal fetch ----------

func (c *YahooClient) fetchQuoteSummary(ctx context.Context, symbol string) (*QuoteSummaryResult, error) {
	if err := c.ensureCrumb(ctx); err != nil {
		return nil, fmt.Errorf("crumb auth failed: %w", err)
	}

	url := fmt.Sprintf(
		"%s/v10/finance/quoteSummary/%s?modules=defaultKeyStatistics,financialData,summaryDetail,price&crumb=%s",
		c.baseURL, symbol, c.crumb,
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
		req.Header.Set("User-Agent", yahooUserAgent)

		resp, err := c.httpClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("executing request: %w", err)
		}

		if resp.StatusCode == 429 {
			resp.Body.Close()
			if attempt < maxRetries {
				backoff := time.Duration(30*(attempt+1)) * time.Second
				fmt.Printf("yahoo: 429 for %s, backing off %v (attempt %d/%d)\n", symbol, backoff, attempt+1, maxRetries)
				time.Sleep(backoff)
				continue
			}
			return nil, fmt.Errorf("yahoo rate limited after %d retries for %s", maxRetries, symbol)
		}

		if resp.StatusCode == 401 {
			resp.Body.Close()
			// Crumb expired, refresh and retry
			c.invalidateCrumb()
			if attempt < maxRetries {
				fmt.Printf("yahoo: 401 for %s, refreshing crumb (attempt %d/%d)\n", symbol, attempt+1, maxRetries)
				if err := c.ensureCrumb(ctx); err != nil {
					return nil, fmt.Errorf("crumb refresh failed: %w", err)
				}
				url = fmt.Sprintf(
					"%s/v10/finance/quoteSummary/%s?modules=defaultKeyStatistics,financialData,summaryDetail,price&crumb=%s",
					c.baseURL, symbol, c.crumb,
				)
				continue
			}
			return nil, fmt.Errorf("yahoo auth failed after %d retries for %s", maxRetries, symbol)
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
