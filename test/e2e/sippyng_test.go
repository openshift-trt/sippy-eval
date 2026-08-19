package e2e

import (
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/openshift/sippy/test/e2e/util"
)

func TestSippyNGTrailingSlashRedirect(t *testing.T) {
	client := &http.Client{
		Timeout: 30 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	resp, err := client.Get(util.BuildE2EURL("/sippy-ng")) //nolint:gosec // test helper URL
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusMovedPermanently, resp.StatusCode,
		"/sippy-ng without trailing slash should redirect")
	assert.Equal(t, "/sippy-ng/", resp.Header.Get("Location"),
		"redirect should point to /sippy-ng/")
}

func TestSippyNGWithTrailingSlash(t *testing.T) {
	client := &http.Client{
		Timeout: 30 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	resp, err := client.Get(util.BuildE2EURL("/sippy-ng/")) //nolint:gosec // test helper URL
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode,
		"/sippy-ng/ should serve the SPA directly")
}
