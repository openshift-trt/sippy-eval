package e2e

import (
	"net/http"
	"testing"

	"github.com/openshift/sippy/test/e2e/util"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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

func TestSippyNGWithTrailingSlash(t *testing.T) {
	client := &http.Client{}
	resp, err := client.Get(util.BuildE2EURL("/sippy-ng/"))
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Contains(t, resp.Header.Get("Content-Type"), "text/html")
}
