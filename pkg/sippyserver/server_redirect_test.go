package sippyserver

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
)

func TestSippyNGTrailingSlashRedirect(t *testing.T) {
	router := mux.NewRouter()
	router.StrictSlash(true)

	router.PathPrefix("/sippy-ng/").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("sippy-ng served"))
	})

	router.PathPrefix("/").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" || r.URL.Path == "/sippy-ng" {
			target := "/sippy-ng/"
			if r.URL.RawQuery != "" {
				target += "?" + r.URL.RawQuery
			}
			http.Redirect(w, r, target, http.StatusMovedPermanently)
		} else {
			http.NotFound(w, r)
		}
	})

	tests := []struct {
		name             string
		path             string
		expectedStatus   int
		expectedRedirect string
	}{
		{
			name:             "redirect /sippy-ng to /sippy-ng/",
			path:             "/sippy-ng",
			expectedStatus:   http.StatusMovedPermanently,
			expectedRedirect: "/sippy-ng/",
		},
		{
			name:             "redirect /sippy-ng with query params",
			path:             "/sippy-ng?release=4.19",
			expectedStatus:   http.StatusMovedPermanently,
			expectedRedirect: "/sippy-ng/?release=4.19",
		},
		{
			name:             "redirect / to /sippy-ng/",
			path:             "/",
			expectedStatus:   http.StatusMovedPermanently,
			expectedRedirect: "/sippy-ng/",
		},
		{
			name:           "/sippy-ng/ serves normally",
			path:           "/sippy-ng/",
			expectedStatus: http.StatusOK,
		},
		{
			name:           "/sippy-ng/some/path serves normally",
			path:           "/sippy-ng/some/path",
			expectedStatus: http.StatusOK,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != tc.expectedStatus {
				t.Errorf("expected status %d, got %d", tc.expectedStatus, w.Code)
			}

			if tc.expectedRedirect != "" {
				loc := w.Header().Get("Location")
				if loc != tc.expectedRedirect {
					t.Errorf("expected redirect to %q, got %q", tc.expectedRedirect, loc)
				}
			}
		})
	}
}
