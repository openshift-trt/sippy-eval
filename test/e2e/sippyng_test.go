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

	t.Run("without trailing slash redirects", func(t *testing.T) {
		resp, err := client.Get(util.BuildE2EURL("/sippy-ng"))
		require.NoError(t, err)
		defer resp.Body.Close()
		assert.Equal(t, http.StatusMovedPermanently, resp.StatusCode)
		assert.Equal(t, "/sippy-ng/", resp.Header.Get("Location"))
	})

	t.Run("without trailing slash preserves query params", func(t *testing.T) {
		resp, err := client.Get(util.BuildE2EURL("/sippy-ng?release=4.22"))
		require.NoError(t, err)
		defer resp.Body.Close()
		assert.Equal(t, http.StatusMovedPermanently, resp.StatusCode)
		assert.Equal(t, "/sippy-ng/?release=4.22", resp.Header.Get("Location"))
	})

	t.Run("with trailing slash serves content", func(t *testing.T) {
		resp, err := client.Get(util.BuildE2EURL("/sippy-ng/"))
		require.NoError(t, err)
		defer resp.Body.Close()
		assert.Equal(t, http.StatusOK, resp.StatusCode)
	})
}
