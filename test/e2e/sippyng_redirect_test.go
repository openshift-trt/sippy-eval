package e2e

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/openshift/sippy/test/e2e/util"
)

func TestSippyNGRedirectWithoutTrailingSlash(t *testing.T) {
	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	t.Run("sippy-ng without trailing slash returns redirect", func(t *testing.T) {
		resp, err := client.Get(util.BuildE2EURL("/sippy-ng"))
		require.NoError(t, err)
		defer resp.Body.Close()
		assert.Equal(t, http.StatusMovedPermanently, resp.StatusCode)
		assert.Equal(t, "/sippy-ng/", resp.Header.Get("Location"))
	})

	t.Run("sippy-ng with trailing slash returns 200", func(t *testing.T) {
		resp, err := client.Get(util.BuildE2EURL("/sippy-ng/"))
		require.NoError(t, err)
		defer resp.Body.Close()
		assert.Equal(t, http.StatusOK, resp.StatusCode)
	})

	t.Run("sippy-ng sub-route returns 200", func(t *testing.T) {
		resp, err := client.Get(util.BuildE2EURL("/sippy-ng/release"))
		require.NoError(t, err)
		defer resp.Body.Close()
		assert.Equal(t, http.StatusOK, resp.StatusCode)
	})

	t.Run("sippy-ng without trailing slash resolves to 200 after redirect", func(t *testing.T) {
		followClient := &http.Client{}
		resp, err := followClient.Get(util.BuildE2EURL("/sippy-ng"))
		require.NoError(t, err)
		defer resp.Body.Close()
		assert.Equal(t, http.StatusOK, resp.StatusCode)
	})
}
