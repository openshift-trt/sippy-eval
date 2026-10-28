package sippyserver

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/gorilla/mux"
)

// newSippyNGTestRouter builds the router the way Serve does: the real sippy-ng routes followed
// by a catch-all standing in for the one Serve registers last.
func newSippyNGTestRouter(fsys *fstest.MapFS) *mux.Router {
	router := mux.NewRouter()
	router.StrictSlash(true)

	registerSippyNGRoutes(router, fsys)

	router.PathPrefix("/").HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "catch-all", http.StatusNotFound)
	})

	return router
}

func TestSippyNGRouting(t *testing.T) {
	fsys := &fstest.MapFS{
		"index.html":              {Data: []byte("<html>sippy-ng index</html>")},
		"static/js/main.js":       {Data: []byte("console.log('main')")},
		"component_readiness.png": {Data: []byte("not really a png")},
	}
	router := newSippyNGTestRouter(fsys)

	tests := []struct {
		name             string
		path             string
		expectedCode     int
		expectedLocation string
		expectedBody     string
	}{
		{
			name:             "no trailing slash redirects to canonical root",
			path:             sippyNGRoot,
			expectedCode:     http.StatusMovedPermanently,
			expectedLocation: sippyNGPathPrefix,
		},
		{
			name:             "no trailing slash preserves query string",
			path:             sippyNGRoot + "?view=4.21-main&foo=bar%20baz",
			expectedCode:     http.StatusMovedPermanently,
			expectedLocation: sippyNGPathPrefix + "?view=4.21-main&foo=bar%20baz",
		},
		{
			name:         "canonical root serves index.html",
			path:         sippyNGPathPrefix,
			expectedCode: http.StatusOK,
			expectedBody: "<html>sippy-ng index</html>",
		},
		{
			name:         "client side route falls back to index.html",
			path:         sippyNGPathPrefix + "component_readiness/main",
			expectedCode: http.StatusOK,
			expectedBody: "<html>sippy-ng index</html>",
		},
		{
			name:         "client side route with query falls back to index.html",
			path:         sippyNGPathPrefix + "chat?session=abc",
			expectedCode: http.StatusOK,
			expectedBody: "<html>sippy-ng index</html>",
		},
		{
			name:         "existing asset is served",
			path:         sippyNGPathPrefix + "static/js/main.js",
			expectedCode: http.StatusOK,
			expectedBody: "console.log('main')",
		},
		{
			name:         "client side route with a trailing slash falls back to index.html",
			path:         sippyNGPathPrefix + "component_readiness/main/",
			expectedCode: http.StatusOK,
			expectedBody: "<html>sippy-ng index</html>",
		},
		{
			name:         "directory does not expose a listing",
			path:         sippyNGPathPrefix + "static/js/",
			expectedCode: http.StatusOK,
			expectedBody: "<html>sippy-ng index</html>",
		},
		{
			name:         "missing asset falls back to index.html",
			path:         sippyNGPathPrefix + "static/js/does-not-exist.js",
			expectedCode: http.StatusOK,
			expectedBody: "<html>sippy-ng index</html>",
		},
		{
			name:         "path outside the app is left to the catch-all",
			path:         "/sippy-nglet",
			expectedCode: http.StatusNotFound,
			expectedBody: "catch-all\n",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, tc.path, nil))

			if rec.Code != tc.expectedCode {
				t.Errorf("GET %s: got status %d, want %d", tc.path, rec.Code, tc.expectedCode)
			}
			if got := rec.Header().Get("Location"); got != tc.expectedLocation {
				t.Errorf("GET %s: got Location %q, want %q", tc.path, got, tc.expectedLocation)
			}
			if tc.expectedBody != "" && rec.Body.String() != tc.expectedBody {
				t.Errorf("GET %s: got body %q, want %q", tc.path, rec.Body.String(), tc.expectedBody)
			}
		})
	}
}

// TestSippyNGRedirectTerminates guards against the redirect loop that would occur if the
// "/sippy-ng" route were allowed to match "/sippy-ng/" as well.
func TestSippyNGRedirectTerminates(t *testing.T) {
	fsys := &fstest.MapFS{"index.html": {Data: []byte("<html>sippy-ng index</html>")}}
	router := newSippyNGTestRouter(fsys)

	path := sippyNGRoot
	for hop := 0; hop < 5; hop++ {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))

		if rec.Code != http.StatusMovedPermanently {
			if rec.Code != http.StatusOK {
				t.Fatalf("GET %s: got status %d, want 200", path, rec.Code)
			}
			if hop != 1 {
				t.Errorf("settled after %d redirects, want exactly 1", hop)
			}
			return
		}
		path = rec.Header().Get("Location")
	}

	t.Fatalf("redirect did not settle after 5 hops, last location %q", path)
}
