package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"os"
	"time"
)

const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

func main() {
	jar, _ := cookiejar.New(nil)
	client := &http.Client{Timeout: 30 * time.Second, Jar: jar}

	ctx := context.Background()

	// Get cookies
	cookieURLs := []string{"https://finance.yahoo.com/", "https://fc.yahoo.com/"}
	for _, u := range cookieURLs {
		req, _ := http.NewRequestWithContext(ctx, "GET", u, nil)
		req.Header.Set("User-Agent", userAgent)
		resp, err := client.Do(req)
		if err == nil {
			resp.Body.Close()
		}
	}

	// Get crumb
	crumbURLs := []string{
		"https://query2.finance.yahoo.com/v1/test/getcrumb",
		"https://query1.finance.yahoo.com/v1/test/getcrumb",
	}
	var crumb string
	for _, u := range crumbURLs {
		req, _ := http.NewRequestWithContext(ctx, "GET", u, nil)
		req.Header.Set("User-Agent", userAgent)
		resp, err := client.Do(req)
		if err != nil {
			continue
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode == 200 && len(body) > 0 && len(body) < 100 {
			crumb = string(body)
			break
		}
	}
	if crumb == "" {
		fmt.Println("ERROR: could not get crumb")
		os.Exit(1)
	}
	fmt.Printf("Crumb: %s\n\n", crumb)

	modules := "financialData,defaultKeyStatistics,incomeStatementHistoryQuarterly,balanceSheetHistoryQuarterly"
	symbols := []string{"CBA.AX", "NAB.AX"}

	for _, sym := range symbols {
		url := fmt.Sprintf("https://query2.finance.yahoo.com/v10/finance/quoteSummary/%s?modules=%s&crumb=%s", sym, modules, crumb)
		req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
		req.Header.Set("User-Agent", userAgent)

		resp, err := client.Do(req)
		if err != nil {
			fmt.Printf("=== %s ERROR: %v ===\n\n", sym, err)
			continue
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		fmt.Printf("=== %s (status %d) ===\n", sym, resp.StatusCode)

		var raw json.RawMessage
		if json.Unmarshal(body, &raw) == nil {
			pretty, _ := json.MarshalIndent(raw, "", "  ")
			fmt.Println(string(pretty))
		} else {
			fmt.Println(string(body))
		}
		fmt.Println()
		time.Sleep(1 * time.Second)
	}
}
