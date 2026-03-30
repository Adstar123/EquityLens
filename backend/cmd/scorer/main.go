package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/Adstar123/equitylens/backend/internal/cache"
	"github.com/Adstar123/equitylens/backend/internal/ingestion"
	"github.com/Adstar123/equitylens/backend/internal/scheduler"
	"github.com/Adstar123/equitylens/backend/internal/storage"
	"github.com/joho/godotenv"
)

// Standalone scorer CLI — runs ASX sync + Yahoo scoring outside of the API server.
// Designed to run as a GitHub Action where Yahoo Finance isn't IP-blocked.
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
	fmt.Println("migrations applied")

	yahoo := ingestion.NewYahooClient()
	sched := scheduler.NewScheduler(db, yahoo)

	if avKey := os.Getenv("ALPHA_VANTAGE_API_KEY"); avKey != "" {
		sched.SetAlphaVantage(avKey)
		fmt.Println("Alpha Vantage fallback configured")
	}

	// Seed configs (no-op if already seeded).
	configsPath := os.Getenv("CONFIGS_PATH")
	if configsPath == "" {
		configsPath = "configs/sectors"
	}
	forceSeed := os.Getenv("FORCE_SEED") == "true"
	if err := sched.SeedFromYAML(ctx, configsPath, forceSeed); err != nil {
		log.Printf("warning: failed to seed configs: %v", err)
	}

	// Load index filter (ASX 300).
	indexPath := os.Getenv("INDEX_FILTER_PATH")
	if indexPath == "" {
		indexPath = "configs/asx300.csv"
	}
	if err := sched.LoadIndexFilter(indexPath); err != nil {
		log.Printf("warning: no index filter loaded: %v (scoring all companies)", err)
	}

	// Sync ASX company list.
	log.Println("scorer: syncing ASX company list")
	if err := sched.SyncASXCompanies(ctx); err != nil {
		log.Fatalf("ASX sync failed: %v", err)
	}

	// Score all companies.
	log.Println("scorer: scoring all companies")
	if err := sched.RefreshAll(ctx); err != nil {
		log.Printf("scoring completed with errors: %v", err)
	}

	// Flush Redis score cache so frontend serves fresh data.
	if redisURL := os.Getenv("REDIS_URL"); redisURL != "" {
		if c, err := cache.NewCache(redisURL); err == nil {
			if err := c.FlushScores(ctx); err != nil {
				log.Printf("warning: failed to flush score cache: %v", err)
			} else {
				log.Println("scorer: flushed score cache")
			}
			c.Close()
		}
	}

	log.Println("scorer: done")
	os.Exit(0)
}
