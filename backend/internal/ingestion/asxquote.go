package ingestion

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Adstar123/equitylens/backend/internal/models"
	"golang.org/x/time/rate"
)

// ASXQuoteClient fetches live price data from the ASX website.
type ASXQuoteClient struct {
	httpClient  *http.Client
	rateLimiter *rate.Limiter
	baseURL     string
}

// NewASXQuoteClient returns a client for fetching ASX price quotes.
func NewASXQuoteClient() *ASXQuoteClient {
	return &ASXQuoteClient{
		httpClient:  &http.Client{Timeout: 15 * time.Second},
		rateLimiter: rate.NewLimiter(rate.Every(200*time.Millisecond), 1),
		baseURL:     "https://www.asx.com.au",
	}
}

type asxQuoteResponse struct {
	Code            string  `json:"code"`
	LastPrice       float64 `json:"last_price"`
	ChangePrice     float64 `json:"change_price"`
	ChangeInPercent string  `json:"change_in_percent"`
	Volume          int64   `json:"volume"`
	MarketCap       int64   `json:"market_cap"`
	PrevClosePrice  float64 `json:"previous_close_price"`
}

// FetchQuote fetches a single stock quote from ASX.
// Symbol should be in DB format (e.g. "BHP.AX") — the .AX suffix is stripped.
func (c *ASXQuoteClient) FetchQuote(ctx context.Context, symbol string) (*models.Quote, error) {
	if err := c.rateLimiter.Wait(ctx); err != nil {
		return nil, fmt.Errorf("rate limiter: %w", err)
	}

	code := strings.TrimSuffix(symbol, ".AX")
	url := fmt.Sprintf("%s/asx/1/share/%s", c.baseURL, code)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("building request: %w", err)
	}
	req.Header.Set("User-Agent", "EquityLens/1.0")
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetching ASX quote for %s: %w", code, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("ASX returned %d for %s: %s", resp.StatusCode, code, string(body))
	}

	var raw asxQuoteResponse
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("decoding ASX response for %s: %w", code, err)
	}

	changePct := parseChangePct(raw.ChangeInPercent)

	return &models.Quote{
		Symbol:    symbol,
		Price:     raw.LastPrice,
		Change:    raw.ChangePrice,
		ChangePct: changePct,
		Volume:    raw.Volume,
		MarketCap: raw.MarketCap,
		PrevClose: raw.PrevClosePrice,
		FetchedAt: time.Now().UTC().Format(time.RFC3339),
	}, nil
}

// FetchQuotes fetches quotes for multiple symbols concurrently.
// Returns all successful fetches; failures are silently skipped.
func (c *ASXQuoteClient) FetchQuotes(ctx context.Context, symbols []string) (map[string]*models.Quote, error) {
	result := make(map[string]*models.Quote)
	var mu sync.Mutex
	var wg sync.WaitGroup

	sem := make(chan struct{}, 5)

	for _, sym := range symbols {
		wg.Add(1)
		go func(s string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			q, err := c.FetchQuote(ctx, s)
			if err != nil {
				return
			}
			mu.Lock()
			result[s] = q
			mu.Unlock()
		}(sym)
	}
	wg.Wait()

	return result, nil
}

func parseChangePct(s string) float64 {
	s = strings.TrimSuffix(strings.TrimSpace(s), "%")
	v, _ := strconv.ParseFloat(s, 64)
	return v
}
