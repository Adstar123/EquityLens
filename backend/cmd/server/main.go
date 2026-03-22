package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/Adstar123/equitylens/backend/internal/ingestion"
	"github.com/Adstar123/equitylens/backend/internal/scheduler"
	"github.com/Adstar123/equitylens/backend/internal/storage"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/joho/godotenv"
	"github.com/robfig/cron/v3"
)

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

	// Set up ingestion client and scheduler.
	yahoo := ingestion.NewYahooClient()
	sched := scheduler.NewScheduler(db, yahoo)

	// Seed configs from YAML on startup.
	configsPath := os.Getenv("CONFIGS_PATH")
	if configsPath == "" {
		configsPath = "configs/sectors"
	}
	if err := sched.SeedFromYAML(ctx, configsPath); err != nil {
		log.Printf("warning: failed to seed configs: %v", err)
	}

	// Set up daily cron job to refresh all scores.
	c := cron.New()
	_, err = c.AddFunc("@daily", func() {
		log.Println("cron: starting daily refresh")
		if err := sched.RefreshAll(context.Background()); err != nil {
			log.Printf("cron: refresh failed: %v", err)
		}
	})
	if err != nil {
		log.Fatalf("failed to schedule cron job: %v", err)
	}
	c.Start()
	defer c.Stop()

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/api/v1/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	fmt.Println("server starting on :8080")
	log.Fatal(http.ListenAndServe(":8080", r))
}
