package ingestion

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// AlphaVantageClient provides a fallback source for the ASX company listing.
// The LISTING_STATUS endpoint returns all tickers for an exchange in one call.
// Free tier: 25 requests/day — but one call returns ALL companies.
type AlphaVantageClient struct {
	httpClient *http.Client
	apiKey     string
}

// NewAlphaVantageClient creates a client with the given API key.
func NewAlphaVantageClient(apiKey string) *AlphaVantageClient {
	return &AlphaVantageClient{
		httpClient: &http.Client{Timeout: 30 * time.Second},
		apiKey:     apiKey,
	}
}

// FetchASXCompanies returns all active ASX-listed companies from Alpha Vantage.
func (c *AlphaVantageClient) FetchASXCompanies(ctx context.Context) ([]ASXCompany, error) {
	url := fmt.Sprintf(
		"https://www.alphavantage.co/query?function=LISTING_STATUS&exchange=ASX&apikey=%s",
		c.apiKey,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("building Alpha Vantage request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetching Alpha Vantage listing: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Alpha Vantage returned status %d", resp.StatusCode)
	}

	return parseAlphaVantageCSV(resp.Body)
}

// parseAlphaVantageCSV reads the Alpha Vantage LISTING_STATUS CSV.
// Columns: symbol, name, exchange, assetType, ipoDate, delistingDate, status
func parseAlphaVantageCSV(r io.Reader) ([]ASXCompany, error) {
	reader := csv.NewReader(r)
	reader.LazyQuotes = true

	// Read header
	header, err := reader.Read()
	if err != nil {
		return nil, fmt.Errorf("reading header: %w", err)
	}

	// Find column indices
	colMap := make(map[string]int)
	for i, h := range header {
		colMap[strings.TrimSpace(strings.ToLower(h))] = i
	}

	symIdx, symOK := colMap["symbol"]
	nameIdx, nameOK := colMap["name"]
	if !symOK || !nameOK {
		return nil, fmt.Errorf("missing required columns (symbol, name) in header: %v", header)
	}

	statusIdx, statusOK := colMap["status"]

	var companies []ASXCompany
	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue
		}

		// Skip delisted companies
		if statusOK && statusIdx < len(record) {
			if strings.ToLower(strings.TrimSpace(record[statusIdx])) != "active" {
				continue
			}
		}

		symbol := strings.TrimSpace(record[symIdx])
		name := strings.TrimSpace(record[nameIdx])

		if symbol == "" || name == "" {
			continue
		}

		// Alpha Vantage may return symbols without .AX suffix
		if !strings.HasSuffix(symbol, ".AX") {
			symbol = symbol + ".AX"
		}

		companies = append(companies, ASXCompany{
			Symbol:     symbol,
			Name:       name,
			GICSSector: "", // Alpha Vantage listing doesn't include sector
		})
	}

	if len(companies) == 0 {
		return nil, fmt.Errorf("no companies parsed from Alpha Vantage")
	}

	return companies, nil
}
