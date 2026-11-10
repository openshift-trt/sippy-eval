package sippyserver

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"

	apitype "github.com/openshift/sippy/pkg/apis/api"
	"github.com/openshift/sippy/pkg/db/models"
)

func TestValidateProwJobRun(t *testing.T) {

	tests := []struct {
		name                 string
		prowJobRun           *models.ProwJobRun
		expectedValidation   bool
		expectedDetailReason string
	}{
		{
			// no prowJobRun specified
			// simulates what we are seeing from the origin riskanalysis command
			// when missing junit artifacts
			name:                 "Test Nil ProwJobRun",
			expectedValidation:   false,
			expectedDetailReason: "empty ProwJobRun",
		},
		{
			prowJobRun:           &models.ProwJobRun{},
			name:                 "Test Empty ProwJobRun",
			expectedValidation:   false,
			expectedDetailReason: "missing ProwJob Name",
		},
		{
			prowJobRun:           &models.ProwJobRun{ProwJob: models.ProwJob{}},
			name:                 "Test Empty ProwJob",
			expectedValidation:   false,
			expectedDetailReason: "missing ProwJob Name",
		},
		{
			prowJobRun:         &models.ProwJobRun{ProwJob: models.ProwJob{Name: "test"}},
			name:               "Test Valid ProwJob",
			expectedValidation: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {

			// no files found so we marshall the null prowJobRun
			inputBytes, err := json.Marshal(tc.prowJobRun)

			// we don't encounter an error
			if err != nil {
				t.Fatalf("Error marshalling prowjob for %s", tc.name)
			}

			// string 'null' not nil bytes if we have a nil pointer
			if inputBytes == nil {
				t.Fatalf("Nil Bytes for %s", tc.name)
			}

			jobRun := &models.ProwJobRun{}

			// we decode the string 'null' but we don't get an error...
			err = json.NewDecoder(strings.NewReader(string(inputBytes))).Decode(&jobRun)

			if err != nil {
				t.Fatalf("Error decoding prowjob for %s", tc.name)
			}

			isValid, detailReason := isValidProwJobRun(jobRun)

			if isValid != tc.expectedValidation {
				t.Fatalf("Validation %t did not match expected Expected %t for %s", isValid, tc.expectedValidation, tc.name)
			}

			if detailReason != tc.expectedDetailReason {
				t.Fatalf("DetailReason %s did not match Expected %s for %s", detailReason, tc.expectedDetailReason, tc.name)
			}

		})
	}

}

func TestLogRequestHandlerAllowsWebSocketUpgrade(t *testing.T) {
	upgrader := websocket.Upgrader{}
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("WebSocket upgrade through logRequestHandler failed: %v", err)
		}
	})

	srv := httptest.NewServer(logRequestHandler(inner))
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")
	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial through middleware stack failed: %v", err)
	}
	defer conn.Close()
	if resp.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("expected 101 Switching Protocols, got %d", resp.StatusCode)
	}
}

func TestSippyNGRoutes(t *testing.T) {
	frontend := fstest.MapFS{
		"index.html":        &fstest.MapFile{Data: []byte("<div id=\"root\">Sippy</div>")},
		"static/js/main.js": &fstest.MapFile{Data: []byte("window.sippy = true;")},
	}
	router := mux.NewRouter().StrictSlash(true)
	registerSippyNGRoutes(router, frontend)

	tests := []struct {
		name         string
		path         string
		wantStatus   int
		wantLocation string
		wantBody     string
	}{
		{
			name:         "redirects root path to slash form",
			path:         "/sippy-ng",
			wantStatus:   http.StatusMovedPermanently,
			wantLocation: "/sippy-ng/",
		},
		{
			name:       "serves app entry point",
			path:       "/sippy-ng/",
			wantStatus: http.StatusOK,
			wantBody:   "Sippy",
		},
		{
			name:       "serves deep browser route with app entry point",
			path:       "/sippy-ng/component_readiness/main",
			wantStatus: http.StatusOK,
			wantBody:   "Sippy",
		},
		{
			name:       "serves static asset",
			path:       "/sippy-ng/static/js/main.js",
			wantStatus: http.StatusOK,
			wantBody:   "window.sippy = true;",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, tc.path, nil)
			router.ServeHTTP(response, request)

			if response.Code != tc.wantStatus {
				t.Fatalf("expected status %d, got %d", tc.wantStatus, response.Code)
			}
			if got := response.Header().Get("Location"); got != tc.wantLocation {
				t.Fatalf("expected redirect location %q, got %q", tc.wantLocation, got)
			}
			if !strings.Contains(response.Body.String(), tc.wantBody) {
				t.Fatalf("expected body to contain %q, got %q", tc.wantBody, response.Body.String())
			}
		})
	}
}

func TestEncodeDefaultHighRisk(t *testing.T) {
	result := apitype.ProwJobRunRiskAnalysis{
		OverallRisk: apitype.JobFailureRisk{
			Level:   apitype.FailureRiskLevelHigh,
			Reasons: []string{"Invalid ProwJob provided for analysis"},
		},
	}

	encodedRiskResult, err := json.Marshal(result)

	if err != nil {
		t.Fatal("Error while encoding risk analysis")
	}

	riskResultJSON := string(encodedRiskResult)

	if riskResultJSON == "" {
		t.Fatal("Invalid risk analysis json")
	}

	analysis := &apitype.ProwJobRunRiskAnalysis{}

	err = json.NewDecoder(strings.NewReader(string(encodedRiskResult))).Decode(&analysis)

	if err != nil {
		t.Fatal("Error while decoding risk analysis")
	}

	if analysis == nil {
		t.Fatal("Invalid risk analysis after decoding")
	}

	if analysis.OverallRisk.Level.Level != apitype.FailureRiskLevelHigh.Level {
		t.Fatal("Invalid overall risk analysis after decoding")
	}
}
