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

	t.Run("redirects /sippy-ng to /sippy-ng/", func(t *testing.T) {
		resp, err := client.Get(util.BuildE2EURL("/sippy-ng"))
		require.NoError(t, err)
		defer resp.Body.Close()
		assert.Equal(t, http.StatusMovedPermanently, resp.StatusCode)
		assert.Equal(t, "/sippy-ng/", resp.Header.Get("Location"))
	})

	t.Run("preserves query string on redirect", func(t *testing.T) {
		resp, err := client.Get(util.BuildE2EURL("/sippy-ng?foo=bar"))
		require.NoError(t, err)
		defer resp.Body.Close()
		assert.Equal(t, http.StatusMovedPermanently, resp.StatusCode)
		assert.Equal(t, "/sippy-ng/?foo=bar", resp.Header.Get("Location"))
	})

	t.Run("/sippy-ng/ serves the SPA", func(t *testing.T) {
		resp, err := client.Get(util.BuildE2EURL("/sippy-ng/"))
		require.NoError(t, err)
		defer resp.Body.Close()
		assert.Equal(t, http.StatusOK, resp.StatusCode)
	})
}
