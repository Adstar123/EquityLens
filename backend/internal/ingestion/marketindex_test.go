package ingestion

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func constituentsJSON(n int) string {
	var b strings.Builder
	b.WriteString(`{"statusCode":200,"message":"ok","data":[`)
	for i := 0; i < n; i++ {
		if i > 0 {
			b.WriteString(",")
		}
		fmt.Fprintf(&b, `{"symbolId":"S%d:AUD:XASX","symbol":{"base":"s%d","quoteUnit":"AUD","exchange":"XASX"},"securityDetails":{"name":"Company %d","status":"trading"}}`, i, i, i)
	}
	b.WriteString("]}")
	return b.String()
}

func TestFetchASX300(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/securities-list/AU/XASX/asx300/quote") {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		fmt.Fprint(w, constituentsJSON(300))
	}))
	defer server.Close()

	client := NewMarketIndexClient()
	client.baseURL = server.URL

	symbols, err := client.FetchASX300(context.Background())
	if err != nil {
		t.Fatalf("FetchASX300 returned error: %v", err)
	}
	if len(symbols) != 300 {
		t.Fatalf("expected 300 symbols, got %d", len(symbols))
	}
	if symbols[0] != "S0.AX" {
		t.Errorf("expected uppercased symbol with .AX suffix, got %s", symbols[0])
	}
}

func TestFetchASX300_TooFewConstituents(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, constituentsJSON(20))
	}))
	defer server.Close()

	client := NewMarketIndexClient()
	client.baseURL = server.URL

	if _, err := client.FetchASX300(context.Background()); err == nil {
		t.Fatal("expected error for implausibly short constituent list")
	}
}

func TestFetchASX300_ServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()

	client := NewMarketIndexClient()
	client.baseURL = server.URL

	if _, err := client.FetchASX300(context.Background()); err == nil {
		t.Fatal("expected error for non-200 response")
	}
}
