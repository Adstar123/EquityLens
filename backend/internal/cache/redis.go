package cache

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/Adstar123/equitylens/backend/internal/models"
	"github.com/redis/go-redis/v9"
)

type Cache struct {
	client *redis.Client
}

func NewCache(redisURL string) (*Cache, error) {
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	client := redis.NewClient(opt)
	if err := client.Ping(context.Background()).Err(); err != nil {
		return nil, fmt.Errorf("ping redis: %w", err)
	}
	return &Cache{client: client}, nil
}

func (c *Cache) GetScore(ctx context.Context, symbol string) (*models.Score, error) {
	key := fmt.Sprintf("score:%s", symbol)
	data, err := c.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var score models.Score
	if err := json.Unmarshal(data, &score); err != nil {
		return nil, err
	}
	return &score, nil
}

func (c *Cache) SetScore(ctx context.Context, symbol string, score models.Score, ttl time.Duration) error {
	key := fmt.Sprintf("score:%s", symbol)
	data, err := json.Marshal(score)
	if err != nil {
		return err
	}
	return c.client.Set(ctx, key, data, ttl).Err()
}

func (c *Cache) InvalidateSector(ctx context.Context, sectorKey string) error {
	var keys []string
	iter := c.client.Scan(ctx, 0, "score:*", 100).Iterator()
	for iter.Next(ctx) {
		keys = append(keys, iter.Val())
	}
	if err := iter.Err(); err != nil {
		return err
	}
	if len(keys) > 0 {
		return c.client.Del(ctx, keys...).Err()
	}
	return nil
}

func (c *Cache) FlushScores(ctx context.Context) error {
	var keys []string
	iter := c.client.Scan(ctx, 0, "score:*", 100).Iterator()
	for iter.Next(ctx) {
		keys = append(keys, iter.Val())
	}
	if err := iter.Err(); err != nil {
		return err
	}
	if len(keys) > 0 {
		return c.client.Del(ctx, keys...).Err()
	}
	return nil
}

func (c *Cache) GetQuote(ctx context.Context, symbol string) (*models.Quote, error) {
	key := fmt.Sprintf("quote:%s", symbol)
	data, err := c.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var q models.Quote
	if err := json.Unmarshal(data, &q); err != nil {
		return nil, err
	}
	return &q, nil
}

func (c *Cache) SetQuote(ctx context.Context, symbol string, quote models.Quote, ttl time.Duration) error {
	key := fmt.Sprintf("quote:%s", symbol)
	data, err := json.Marshal(quote)
	if err != nil {
		return err
	}
	return c.client.Set(ctx, key, data, ttl).Err()
}

func (c *Cache) GetQuotes(ctx context.Context, symbols []string) (map[string]*models.Quote, []string) {
	hits := make(map[string]*models.Quote)
	var misses []string
	for _, sym := range symbols {
		q, err := c.GetQuote(ctx, sym)
		if err != nil || q == nil {
			misses = append(misses, sym)
		} else {
			hits[sym] = q
		}
	}
	return hits, misses
}

func (c *Cache) Close() error {
	return c.client.Close()
}
