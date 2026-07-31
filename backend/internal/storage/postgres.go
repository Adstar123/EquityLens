package storage

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/golang-migrate/migrate/v4"
	pgmigrate "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
)

type DB struct {
	Pool *pgxpool.Pool
}

func NewDB(ctx context.Context, databaseURL string) (*DB, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse postgres config: %w", err)
	}
	// Constrain pool for 512MB Render free tier
	config.MaxConns = 3
	config.MinConns = 1
	if config.ConnConfig.ConnectTimeout == 0 {
		config.ConnConfig.ConnectTimeout = 15 * time.Second
	}

	// Retry connecting: CI runners have occasional network blips and Neon
	// cold-starts can outlast a single dial.
	const attempts = 5
	var lastErr error
	for attempt := 1; attempt <= attempts; attempt++ {
		if attempt > 1 {
			log.Printf("storage: connect attempt %d/%d failed: %v — retrying in 10s", attempt-1, attempts, lastErr)
			select {
			case <-time.After(10 * time.Second):
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}

		pool, err := pgxpool.NewWithConfig(ctx, config)
		if err != nil {
			lastErr = err
			continue
		}
		if err := pool.Ping(ctx); err != nil {
			pool.Close()
			lastErr = err
			continue
		}
		return &DB{Pool: pool}, nil
	}
	return nil, fmt.Errorf("connect to postgres after %d attempts: %w", attempts, lastErr)
}

func (db *DB) RunMigrations(databaseURL string, migrationsPath string) error {
	sqlDB := stdlib.OpenDBFromPool(db.Pool)
	defer sqlDB.Close()
	driver, err := pgmigrate.WithInstance(sqlDB, &pgmigrate.Config{})
	if err != nil {
		return fmt.Errorf("migration driver: %w", err)
	}
	m, err := migrate.NewWithDatabaseInstance("file://"+migrationsPath, "postgres", driver)
	if err != nil {
		return fmt.Errorf("init migrations: %w", err)
	}
	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("run migrations: %w", err)
	}
	return nil
}

func (db *DB) Close() {
	db.Pool.Close()
}
