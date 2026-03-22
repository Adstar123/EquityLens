package api

import (
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/Adstar123/equitylens/backend/internal/auth"
	"github.com/Adstar123/equitylens/backend/internal/scheduler"
	"github.com/Adstar123/equitylens/backend/internal/storage"
)

type Server struct {
	db          *storage.DB
	scheduler   *scheduler.Scheduler
	authHandler *auth.AuthHandler
	jwtSecret   string
	superAdmins []string
}

func NewServer(db *storage.DB, sched *scheduler.Scheduler, authHandler *auth.AuthHandler, jwtSecret string, superAdmins []string) *Server {
	return &Server{
		db:          db,
		scheduler:   sched,
		authHandler: authHandler,
		jwtSecret:   jwtSecret,
		superAdmins: superAdmins,
	}
}

func (s *Server) Router() chi.Router {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:4200", "https://*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Route("/api/v1", func(r chi.Router) {
		// Public routes
		r.Get("/health", s.health)
		r.Get("/tickers", s.searchTickers)
		r.Get("/tickers/{symbol}", s.getTickerDetail)
		r.Get("/tickers/{symbol}/scores", s.getTickerScores)
		r.Get("/sectors", s.listSectors)
		r.Get("/sectors/{id}/rankings", s.getSectorRankings)
		r.Get("/screener", s.screener)

		// Auth routes
		r.Get("/auth/google/login", s.authHandler.GoogleLogin)
		r.Get("/auth/google/callback", s.authHandler.GoogleCallback)
		r.Get("/auth/github/login", s.authHandler.GitHubLogin)
		r.Get("/auth/github/callback", s.authHandler.GitHubCallback)
		r.Post("/auth/logout", s.authHandler.Logout)

		// Authenticated routes
		r.Group(func(r chi.Router) {
			r.Use(auth.RequireAuth(s.jwtSecret))
			r.Get("/me", s.getMe)
			r.Get("/watchlist", s.getWatchlist)
			r.Post("/watchlist/{symbol}", s.addToWatchlist)
			r.Delete("/watchlist/{symbol}", s.removeFromWatchlist)
		})

		// Superadmin routes
		r.Group(func(r chi.Router) {
			r.Use(auth.RequireAuth(s.jwtSecret))
			r.Use(auth.RequireSuperAdmin(s.superAdmins))
			r.Get("/admin/configs", s.listConfigs)
			r.Get("/admin/configs/{sector}", s.getConfig)
			r.Put("/admin/configs/{sector}", s.updateConfig)
			r.Post("/admin/configs/{sector}/preview", s.previewConfig)
			r.Post("/admin/configs/{sector}/publish", s.publishConfig)
			r.Get("/admin/configs/{sector}/versions", s.listConfigVersions)
		})
	})

	return r
}
