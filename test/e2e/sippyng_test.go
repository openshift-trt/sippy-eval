package e2e

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/openshift/sippy/test/e2e/util"
)

func TestSippyNGTrailingSlashRedirect(t *testing.T) {
	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	resp, err := client.Get(util.BuildE2EURL("/sippy-ng"))
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusMovedPermanently, resp.StatusCode)
	assert.Equal(t, "/sippy-ng/", resp.Header.Get("Location"))
}

func TestSippyNGTrailingSlashRedirectPreservesQuery(t *testing.T) {
	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	resp, err := client.Get(util.BuildE2EURL("/sippy-ng?view=main"))
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusMovedPermanently, resp.StatusCode)
	assert.Equal(t, "/sippy-ng/?view=main", resp.Header.Get("Location"))
}

func TestSippyNGWithTrailingSlashServesApp(t *testing.T) {
	resp, err := http.Get(util.BuildE2EURL("/sippy-ng/")) //nolint:gosec
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
}
