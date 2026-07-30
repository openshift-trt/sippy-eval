package sippyserver

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

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

func TestSippyNGTrailingSlashRedirect(t *testing.T) {
	router := mux.NewRouter()
	router.StrictSlash(true)

	router.PathPrefix("/sippy-ng/").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	router.PathPrefix("/").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" || r.URL.Path == "/sippy-ng" {
			http.Redirect(w, r, "/sippy-ng/", http.StatusMovedPermanently)
			return
		}
		http.NotFound(w, r)
	})

	srv := httptest.NewServer(router)
	defer srv.Close()

	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	tests := []struct {
		name           string
		path           string
		expectedStatus int
		expectedLoc    string
	}{
		{
			name:           "without trailing slash redirects",
			path:           "/sippy-ng",
			expectedStatus: http.StatusMovedPermanently,
			expectedLoc:    "/sippy-ng/",
		},
		{
			name:           "with trailing slash serves directly",
			path:           "/sippy-ng/",
			expectedStatus: http.StatusOK,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			resp, err := client.Get(srv.URL + tc.path)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			defer resp.Body.Close()
			if resp.StatusCode != tc.expectedStatus {
				t.Fatalf("expected status %d, got %d", tc.expectedStatus, resp.StatusCode)
			}
			if tc.expectedLoc != "" {
				loc := resp.Header.Get("Location")
				if loc != tc.expectedLoc {
					t.Fatalf("expected Location %q, got %q", tc.expectedLoc, loc)
				}
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
