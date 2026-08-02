package ingestion

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// MarketIndexClient fetches the current S&P/ASX 300 constituent list from
// marketindex.com.au, which stays up to date with quarterly index rebalances.
type MarketIndexClient struct {
	httpClient *http.Client
	baseURL    string // overridable for tests
}

// minASX300Constituents guards against truncated or reshaped API responses —
// a real constituent list is always close to 300 symbols.
const minASX300Constituents = 250

// NewMarketIndexClient returns a client for fetching ASX300 constituents.
func NewMarketIndexClient() *MarketIndexClient {
	return &MarketIndexClient{
		httpClient: &http.Client{Timeout: 30 * time.Second},
		baseURL:    "https://www.marketindex.com.au",
	}
}

// ASX300Constituent is one index member from the Market Index feed.
type ASX300Constituent struct {
	Symbol string // with .AX suffix
	Name   string // official ASX listing name
}

// marketIndexResponse mirrors the securities-list API envelope.
type marketIndexResponse struct {
	Data []struct {
		Symbol struct {
			Base string `json:"base"`
		} `json:"symbol"`
		SecurityDetails struct {
			Name string `json:"name"`
		} `json:"securityDetails"`
	} `json:"data"`
}

// FetchASX300 returns the current ASX300 constituents (symbols with the .AX
// suffix plus ASX listing names), or an error if the list can't be fetched or
// looks implausible.
func (c *MarketIndexClient) FetchASX300(ctx context.Context) ([]ASX300Constituent, error) {
	url := c.baseURL + "/data-api/api/v1/securities-list/AU/XASX/asx300/quote?limit=400"

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("building marketindex request: %w", err)
	}
	req.Header.Set("User-Agent", yahooUserAgent)
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetching marketindex constituents: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("marketindex returned status %d", resp.StatusCode)
	}

	var envelope marketIndexResponse
	if err := json.NewDecoder(resp.Body).Decode(&envelope); err != nil {
		return nil, fmt.Errorf("decoding marketindex response: %w", err)
	}

	seen := make(map[string]bool, len(envelope.Data))
	constituents := make([]ASX300Constituent, 0, len(envelope.Data))
	for _, item := range envelope.Data {
		base := strings.ToUpper(strings.TrimSpace(item.Symbol.Base))
		if base == "" || seen[base] {
			continue
		}
		seen[base] = true
		constituents = append(constituents, ASX300Constituent{
			Symbol: base + ".AX",
			Name:   strings.TrimSpace(item.SecurityDetails.Name),
		})
	}

	if len(constituents) < minASX300Constituents {
		return nil, fmt.Errorf("marketindex returned only %d constituents — response format may have changed", len(constituents))
	}

	return constituents, nil
}
