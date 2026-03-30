package main

import (
	"context"
	"log"
	"os"

	"github.com/Adstar123/equitylens/backend/internal/ingestion"
	"github.com/Adstar123/equitylens/backend/internal/storage"
	"github.com/joho/godotenv"
)

// Standalone pricer CLI — fetches live prices from Yahoo Finance and stores them.
// Designed to run as a frequent GitHub Action (Yahoo is IP-blocked on Render).
func main() {
	_ = godotenv.Load()

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	ctx := context.Background()
	db, err := storage.NewDB(ctx, databaseURL)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer db.Close()

	migrationsPath := os.Getenv("MIGRATIONS_PATH")
	if migrationsPath == "" {
		migrationsPath = "migrations"
	}
	if err := db.RunMigrations(databaseURL, migrationsPath); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}

	// Get all company symbols from the database.
	symbols, err := db.ListAllSymbols(ctx)
	if err != nil {
		log.Fatalf("failed to list symbols: %v", err)
	}
	log.Printf("pricer: fetching prices for %d companies", len(symbols))

	yahoo := ingestion.NewYahooClient()

	// Process in batches of 50 symbols.
	const batchSize = 50
	updated := 0
	failed := 0

	for i := 0; i < len(symbols); i += batchSize {
		end := i + batchSize
		if end > len(symbols) {
			end = len(symbols)
		}
		batch := symbols[i:end]

		quotes, err := yahoo.FetchBatchQuotes(ctx, batch)
		if err != nil {
			log.Printf("pricer: batch %d-%d failed: %v", i, end, err)
			failed += len(batch)
			continue
		}

		for sym, q := range quotes {
			if err := db.UpdatePrice(ctx, sym, q.RegularMarketPrice, q.RegularMarketChange,
				q.RegularMarketChangePercent, q.RegularMarketPreviousClose,
				q.RegularMarketVolume, q.MarketCap); err != nil {
				log.Printf("pricer: failed to update %s: %v", sym, err)
				failed++
			} else {
				updated++
			}
		}

		log.Printf("pricer: batch %d-%d done (%d quotes)", i, end, len(quotes))
	}

	db.Close()
	log.Printf("pricer: done — %d updated, %d failed", updated, failed)
	if failed > 0 {
		os.Exit(1)
	}
}
