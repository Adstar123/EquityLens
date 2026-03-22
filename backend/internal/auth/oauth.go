package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"

	"github.com/Adstar123/equitylens/backend/internal/models"
	"github.com/Adstar123/equitylens/backend/internal/storage"
	"github.com/google/uuid"
)

type AuthHandler struct {
	db          *storage.DB
	jwtSecret   string
	frontendURL string
	google      *oauth2.Config
	github      *oauth2.Config
}

func NewAuthHandler(db *storage.DB, jwtSecret, frontendURL string) *AuthHandler {
	backendURL := os.Getenv("BACKEND_URL")
	if backendURL == "" {
		backendURL = "http://localhost:8080"
	}
	return &AuthHandler{
		db:          db,
		jwtSecret:   jwtSecret,
		frontendURL: frontendURL,
		google: &oauth2.Config{
			ClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
			ClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
			RedirectURL:  backendURL + "/api/v1/auth/google/callback",
			Scopes:       []string{"openid", "email", "profile"},
			Endpoint:     google.Endpoint,
		},
		github: &oauth2.Config{
			ClientID:     os.Getenv("GITHUB_CLIENT_ID"),
			ClientSecret: os.Getenv("GITHUB_CLIENT_SECRET"),
			RedirectURL:  backendURL + "/api/v1/auth/github/callback",
			Scopes:       []string{"user:email"},
			Endpoint: oauth2.Endpoint{
				AuthURL:  "https://github.com/login/oauth/authorize",
				TokenURL: "https://github.com/login/oauth/access_token",
			},
		},
	}
}

// generateState creates a random state string for CSRF protection.
func generateState() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

// setStateCookie sets the oauth_state cookie for CSRF verification.
func setStateCookie(w http.ResponseWriter, state string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "oauth_state",
		Value:    state,
		Path:     "/",
		MaxAge:   300, // 5 minutes
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   false, // set true in production behind HTTPS
	})
}

// verifyStateCookie checks that the state query param matches the cookie.
func verifyStateCookie(r *http.Request) error {
	cookie, err := r.Cookie("oauth_state")
	if err != nil {
		return fmt.Errorf("missing state cookie")
	}
	if r.URL.Query().Get("state") != cookie.Value {
		return fmt.Errorf("state mismatch")
	}
	return nil
}

// --- Google OAuth ---

func (h *AuthHandler) GoogleLogin(w http.ResponseWriter, r *http.Request) {
	state, err := generateState()
	if err != nil {
		http.Error(w, `{"error":"internal server error"}`, http.StatusInternalServerError)
		return
	}
	setStateCookie(w, state)
	http.Redirect(w, r, h.google.AuthCodeURL(state), http.StatusTemporaryRedirect)
}

func (h *AuthHandler) GoogleCallback(w http.ResponseWriter, r *http.Request) {
	if err := verifyStateCookie(r); err != nil {
		http.Error(w, `{"error":"invalid state"}`, http.StatusBadRequest)
		return
	}

	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, `{"error":"missing code"}`, http.StatusBadRequest)
		return
	}

	token, err := h.google.Exchange(context.Background(), code)
	if err != nil {
		http.Error(w, `{"error":"token exchange failed"}`, http.StatusBadRequest)
		return
	}

	client := h.google.Client(context.Background(), token)
	resp, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
	if err != nil {
		http.Error(w, `{"error":"failed to get user info"}`, http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	var profile struct {
		Email   string `json:"email"`
		Name    string `json:"name"`
		Picture string `json:"picture"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&profile); err != nil {
		http.Error(w, `{"error":"failed to decode user info"}`, http.StatusInternalServerError)
		return
	}

	user, err := h.db.UpsertUser(r.Context(), models.User{
		ID:       uuid.New(),
		Email:    profile.Email,
		Name:     profile.Name,
		Avatar:   profile.Picture,
		Provider: "google",
	})
	if err != nil {
		http.Error(w, `{"error":"failed to save user"}`, http.StatusInternalServerError)
		return
	}

	jwt, err := GenerateToken(user.ID, user.Email, user.Name, h.jwtSecret)
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, fmt.Sprintf("%s/auth/callback?token=%s", h.frontendURL, jwt), http.StatusTemporaryRedirect)
}

// --- GitHub OAuth ---

func (h *AuthHandler) GitHubLogin(w http.ResponseWriter, r *http.Request) {
	state, err := generateState()
	if err != nil {
		http.Error(w, `{"error":"internal server error"}`, http.StatusInternalServerError)
		return
	}
	setStateCookie(w, state)
	http.Redirect(w, r, h.github.AuthCodeURL(state), http.StatusTemporaryRedirect)
}

func (h *AuthHandler) GitHubCallback(w http.ResponseWriter, r *http.Request) {
	if err := verifyStateCookie(r); err != nil {
		http.Error(w, `{"error":"invalid state"}`, http.StatusBadRequest)
		return
	}

	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, `{"error":"missing code"}`, http.StatusBadRequest)
		return
	}

	token, err := h.github.Exchange(context.Background(), code)
	if err != nil {
		http.Error(w, `{"error":"token exchange failed"}`, http.StatusBadRequest)
		return
	}

	client := h.github.Client(context.Background(), token)

	// Fetch user profile
	resp, err := client.Get("https://api.github.com/user")
	if err != nil {
		http.Error(w, `{"error":"failed to get user info"}`, http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	var profile struct {
		Login     string `json:"login"`
		Name      string `json:"name"`
		AvatarURL string `json:"avatar_url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&profile); err != nil {
		http.Error(w, `{"error":"failed to decode user info"}`, http.StatusInternalServerError)
		return
	}

	// Use login as name fallback
	name := profile.Name
	if name == "" {
		name = profile.Login
	}

	// Fetch primary email
	emailResp, err := client.Get("https://api.github.com/user/emails")
	if err != nil {
		http.Error(w, `{"error":"failed to get user emails"}`, http.StatusInternalServerError)
		return
	}
	defer emailResp.Body.Close()

	var emails []struct {
		Email    string `json:"email"`
		Primary  bool   `json:"primary"`
		Verified bool   `json:"verified"`
	}
	if err := json.NewDecoder(emailResp.Body).Decode(&emails); err != nil {
		http.Error(w, `{"error":"failed to decode user emails"}`, http.StatusInternalServerError)
		return
	}

	var primaryEmail string
	for _, e := range emails {
		if e.Primary && e.Verified {
			primaryEmail = e.Email
			break
		}
	}
	if primaryEmail == "" && len(emails) > 0 {
		primaryEmail = emails[0].Email
	}
	if primaryEmail == "" {
		http.Error(w, `{"error":"no email found"}`, http.StatusBadRequest)
		return
	}

	user, err := h.db.UpsertUser(r.Context(), models.User{
		ID:       uuid.New(),
		Email:    primaryEmail,
		Name:     name,
		Avatar:   profile.AvatarURL,
		Provider: "github",
	})
	if err != nil {
		http.Error(w, `{"error":"failed to save user"}`, http.StatusInternalServerError)
		return
	}

	jwt, err := GenerateToken(user.ID, user.Email, user.Name, h.jwtSecret)
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, fmt.Sprintf("%s/auth/callback?token=%s", h.frontendURL, jwt), http.StatusTemporaryRedirect)
}

// --- Logout ---

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message":"logged out"}`))
}
