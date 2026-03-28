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

// ASXCompany represents a company from the ASX listed companies feed.
type ASXCompany struct {
	Symbol      string
	Name        string
	GICSSector  string // GICS industry group name from ASX
}

// ASXClient fetches the complete list of ASX-listed companies.
type ASXClient struct {
	httpClient *http.Client
}

// NewASXClient returns a client for fetching ASX company listings.
func NewASXClient() *ASXClient {
	return &ASXClient{
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

// FetchAllCompanies downloads the ASX listed companies CSV and parses it.
// Returns every company with symbol (appended with .AX), name, and GICS sector.
func (c *ASXClient) FetchAllCompanies(ctx context.Context) ([]ASXCompany, error) {
	url := "https://www.asx.com.au/asx/research/ASXListedCompanies.csv"

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("building ASX request: %w", err)
	}
	req.Header.Set("User-Agent", "EquityLens/1.0")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetching ASX company list: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ASX returned status %d", resp.StatusCode)
	}

	return parseASXCSV(resp.Body)
}

// parseASXCSV reads the ASX CSV format.
// The CSV has a header like: "Company name","ASX code","GICS industry group"
// with some preamble lines before the actual header.
func parseASXCSV(r io.Reader) ([]ASXCompany, error) {
	reader := csv.NewReader(r)
	reader.LazyQuotes = true
	reader.TrimLeadingSpace = true
	reader.FieldsPerRecord = -1 // variable fields

	var companies []ASXCompany
	headerFound := false

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue // skip malformed lines
		}

		if len(record) < 3 {
			continue
		}

		// Look for the header row
		if !headerFound {
			first := strings.TrimSpace(strings.ToLower(record[0]))
			if strings.Contains(first, "company") {
				headerFound = true
				continue
			}
			continue
		}

		name := strings.TrimSpace(record[0])
		code := strings.TrimSpace(record[1])
		sector := strings.TrimSpace(record[2])

		if code == "" || name == "" {
			continue
		}

		companies = append(companies, ASXCompany{
			Symbol:     code + ".AX",
			Name:       name,
			GICSSector: sector,
		})
	}

	if len(companies) == 0 {
		return nil, fmt.Errorf("no companies parsed from ASX CSV")
	}

	return companies, nil
}

// GICSSectorMapping maps GICS industry group names from the ASX CSV to our
// internal sector keys (matching the YAML config file names).
var GICSSectorMapping = map[string]string{
	// Materials / Mining
	"Materials":                  "mining",
	"Metals & Mining":           "mining",
	"Gold":                      "mining",
	"Steel":                     "mining",
	"Chemicals":                 "mining",
	"Construction Materials":    "mining",
	"Containers & Packaging":    "mining",
	"Paper & Forest Products":   "mining",

	// Financials
	"Banks":                          "financials",
	"Diversified Financials":         "financials",
	"Insurance":                      "financials",
	"Capital Markets":                "financials",
	"Consumer Finance":               "financials",
	"Thrifts & Mortgage Finance":     "financials",
	"Financial Services":             "financials",

	// Energy
	"Energy":                   "energy",
	"Oil, Gas & Consumable Fuels": "energy",
	"Energy Equipment & Services": "energy",

	// Technology
	"Software & Services":           "technology",
	"Technology Hardware & Equipment": "technology",
	"Semiconductors & Semiconductor Equipment": "technology",
	"Information Technology":        "technology",

	// Healthcare
	"Health Care Equipment & Services": "healthcare",
	"Pharmaceuticals, Biotechnology & Life Sciences": "healthcare",
	"Pharmaceuticals & Biotechnology": "healthcare",
	"Health Care":                     "healthcare",

	// REITs
	"Real Estate":                          "reits",
	"REITs":                                "reits",
	"Equity Real Estate Investment Trusts": "reits",
	"Real Estate Management & Development": "reits",

	// Industrials
	"Capital Goods":            "industrials",
	"Commercial & Professional Services": "industrials",
	"Transportation":           "industrials",
	"Industrials":              "industrials",

	// Consumer Staples
	"Food, Beverage & Tobacco": "consumer_staples",
	"Food & Staples Retailing": "consumer_staples",
	"Household & Personal Products": "consumer_staples",
	"Consumer Staples":         "consumer_staples",

	// Consumer Discretionary
	"Automobiles & Components":     "consumer_discretionary",
	"Consumer Durables & Apparel":  "consumer_discretionary",
	"Consumer Services":            "consumer_discretionary",
	"Media & Entertainment":        "consumer_discretionary",
	"Retailing":                    "consumer_discretionary",
	"Consumer Discretionary":       "consumer_discretionary",

	// Utilities
	"Utilities":                "utilities",

	// Communication Services
	"Telecommunication Services": "communication",
	"Communication Services":     "communication",
	"Media":                      "communication",
}

// MapGICSSector resolves an ASX GICS industry group name to an internal sector key.
// Returns empty string if no mapping found.
func MapGICSSector(gics string) string {
	// Direct match
	if key, ok := GICSSectorMapping[gics]; ok {
		return key
	}
	// Case-insensitive substring match as fallback
	lower := strings.ToLower(gics)
	for name, key := range GICSSectorMapping {
		if strings.Contains(lower, strings.ToLower(name)) {
			return key
		}
	}
	return ""
}
