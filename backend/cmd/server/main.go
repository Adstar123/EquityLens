package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"runtime"
	"strings"
	"time"

	"github.com/Adstar123/equitylens/backend/internal/api"
	"github.com/Adstar123/equitylens/backend/internal/auth"
	"github.com/Adstar123/equitylens/backend/internal/cache"
	"github.com/Adstar123/equitylens/backend/internal/ingestion"
	"github.com/Adstar123/equitylens/backend/internal/scheduler"
	"github.com/Adstar123/equitylens/backend/internal/storage"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		log.Fatal("JWT_SECRET is required")
	}

	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:4200"
	}

	var superAdmins []string
	if sa := os.Getenv("SUPERADMIN_EMAILS"); sa != "" {
		for _, email := range strings.Split(sa, ",") {
			if trimmed := strings.TrimSpace(email); trimmed != "" {
				superAdmins = append(superAdmins, trimmed)
			}
		}
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

	// Set up Alpha Vantage as fallback if API key is provided.
	if avKey := os.Getenv("ALPHA_VANTAGE_API_KEY"); avKey != "" {
		sched.SetAlphaVantage(avKey)
		fmt.Println("Alpha Vantage fallback configured")
	}

	// Seed configs from YAML on startup.
	configsPath := os.Getenv("CONFIGS_PATH")
	if configsPath == "" {
		configsPath = "configs/sectors"
	}
	if err := sched.SeedFromYAML(ctx, configsPath); err != nil {
		log.Printf("warning: failed to seed configs: %v", err)
	}

	// Sync ASX company list on startup (background — don't block server start).
	// Scoring is handled by the GitHub Actions scorer workflow, not here.
	go func() {
		log.Println("startup: syncing ASX company list")
		if err := sched.SyncASXCompanies(context.Background()); err != nil {
			log.Printf("warning: ASX sync failed: %v", err)
		}
		log.Println("startup: ASX sync complete (scoring runs via GitHub Actions)")
	}()

	// Self-ping keep-alive: hit our own external URL every 10 minutes
	// to prevent Render free tier spin-down (15 min inactivity timeout).
	// Must go through external URL so Render counts it as inbound traffic.
	if backendURL := os.Getenv("BACKEND_URL"); backendURL != "" {
		go func() {
			pingURL := backendURL + "/api/v1/health"
			ticker := time.NewTicker(10 * time.Minute)
			defer ticker.Stop()
			for range ticker.C {
				resp, err := http.Get(pingURL)
				if err != nil {
					log.Printf("keep-alive ping failed: %v", err)
					continue
				}
				resp.Body.Close()
			}
		}()
		log.Printf("keep-alive: pinging %s every 10 minutes", backendURL)
	}

	// Resource monitoring: log memory stats every minute
	go func() {
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			var m runtime.MemStats
			runtime.ReadMemStats(&m)
			log.Printf("stats: alloc=%dMB sys=%dMB goroutines=%d gc=%d",
				m.Alloc/1024/1024, m.Sys/1024/1024, runtime.NumGoroutine(), m.NumGC)
		}
	}()

	redisURL := os.Getenv("REDIS_URL")
	var appCache *cache.Cache
	if redisURL != "" {
		c, err := cache.NewCache(redisURL)
		if err != nil {
			fmt.Printf("warning: redis unavailable: %v\n", err)
		} else {
			appCache = c
			defer appCache.Close()
		}
	}

	asxQuote := ingestion.NewASXQuoteClient()

	authHandler := auth.NewAuthHandler(db, jwtSecret, frontendURL, superAdmins)
	srv := api.NewServer(db, sched, authHandler, appCache, asxQuote, jwtSecret, superAdmins)
	router := srv.Router()

	fmt.Println("server starting on :8080")
	log.Fatal(http.ListenAndServe(":8080", router))
}
