package ingestion

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"golang.org/x/time/rate"
)

func TestASXQuoteClient_FetchQuote(t *testing.T) {
	fixture, err := os.ReadFile("testdata/asx_bhp_quote.json")
	if err != nil {
		t.Fatalf("reading fixture: %v", err)
	}

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/asx/1/share/BHP" {
			t.Errorf("unexpected path: %s", r.URL.Path)
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(fixture)
	}))
	defer ts.Close()

	client := &ASXQuoteClient{
		httpClient:  ts.Client(),
		rateLimiter: rate.NewLimiter(rate.Inf, 1),
		baseURL:     ts.URL,
	}

	quote, err := client.FetchQuote(context.Background(), "BHP.AX")
	if err != nil {
		t.Fatalf("FetchQuote: %v", err)
	}

	if quote.Symbol != "BHP.AX" {
		t.Errorf("symbol = %q, want BHP.AX", quote.Symbol)
	}
	if quote.Price != 43.52 {
		t.Errorf("price = %f, want 43.52", quote.Price)
	}
	if quote.Change != 0.42 {
		t.Errorf("change = %f, want 0.42", quote.Change)
	}
	if quote.Volume != 8234561 {
		t.Errorf("volume = %d, want 8234561", quote.Volume)
	}
	if quote.MarketCap != 220821280000 {
		t.Errorf("market_cap = %d, want 220821280000", quote.MarketCap)
	}
	if quote.PrevClose != 43.10 {
		t.Errorf("prev_close = %f, want 43.10", quote.PrevClose)
	}
}

func TestASXQuoteClient_FetchQuote_StripsSuffix(t *testing.T) {
	var gotPath string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"code":"CBA","last_price":110.50,"change_price":1.20,"change_in_percent":"1.098%","volume":3000000,"market_cap":180000000000,"previous_close_price":109.30}`))
	}))
	defer ts.Close()

	client := &ASXQuoteClient{
		httpClient:  ts.Client(),
		rateLimiter: rate.NewLimiter(rate.Inf, 1),
		baseURL:     ts.URL,
	}

	_, err := client.FetchQuote(context.Background(), "CBA.AX")
	if err != nil {
		t.Fatalf("FetchQuote: %v", err)
	}
	if gotPath != "/asx/1/share/CBA" {
		t.Errorf("path = %q, want /asx/1/share/CBA", gotPath)
	}
}

func TestASXQuoteClient_FetchQuotes_Batch(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"code":"TEST","last_price":10.0,"change_price":0.5,"change_in_percent":"5.0%","volume":1000,"market_cap":1000000,"previous_close_price":9.50}`))
	}))
	defer ts.Close()

	client := &ASXQuoteClient{
		httpClient:  ts.Client(),
		rateLimiter: rate.NewLimiter(rate.Inf, 1),
		baseURL:     ts.URL,
	}

	quotes, err := client.FetchQuotes(context.Background(), []string{"A.AX", "B.AX", "C.AX"})
	if err != nil {
		t.Fatalf("FetchQuotes: %v", err)
	}
	if len(quotes) != 3 {
		t.Errorf("got %d quotes, want 3", len(quotes))
	}
}
