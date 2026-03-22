package storage

import (
	"context"

	"github.com/Adstar123/equitylens/backend/internal/models"
	"github.com/jackc/pgx/v5"
)

func (db *DB) UpsertUser(ctx context.Context, user models.User) (*models.User, error) {
	var u models.User
	err := db.Pool.QueryRow(ctx,
		`INSERT INTO users (id, email, name, avatar, provider)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (email) DO UPDATE
		 SET name = EXCLUDED.name,
		     avatar = EXCLUDED.avatar,
		     provider = EXCLUDED.provider
		 RETURNING id, email, name, COALESCE(avatar, ''), provider, created_at`,
		user.ID, user.Email, user.Name, user.Avatar, user.Provider).
		Scan(&u.ID, &u.Email, &u.Name, &u.Avatar, &u.Provider, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (db *DB) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	var u models.User
	err := db.Pool.QueryRow(ctx,
		`SELECT id, email, name, COALESCE(avatar, ''), provider, created_at
		 FROM users WHERE email = $1`, email).
		Scan(&u.ID, &u.Email, &u.Name, &u.Avatar, &u.Provider, &u.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}
